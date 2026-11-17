using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using FastDrop.Windows.Protocol;
using FastDrop.Windows.Storage;
using FastDrop.Windows.Transfer;

namespace FastDrop.Windows.Networking;

public sealed class LocalTransferServer : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Any, Fd01Protocol.TransferPort);
    private readonly PairingService _pairing;
    private readonly TransferStore _store;
    private readonly Func<string> _destination;
    private CancellationTokenSource? _cancellation;
    private Task? _acceptLoop;

    public LocalTransferServer(PairingService pairing, TransferStore store, Func<string> destination)
    {
        _pairing = pairing;
        _store = store;
        _destination = destination;
    }

    public event Action<string>? StatusChanged;

    public void Start()
    {
        if (_acceptLoop is not null) return;
        _cancellation = new CancellationTokenSource();
        _listener.Start(2);
        _acceptLoop = AcceptLoopAsync(_cancellation.Token);
        StatusChanged?.Invoke($"A escutar localmente na porta {Fd01Protocol.TransferPort}");
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(cancellationToken);
                _ = HandleClientAsync(client, cancellationToken);
            }
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) { }
        catch (SocketException ex) { StatusChanged?.Invoke($"Listener indisponível: {ex.SocketErrorCode}"); }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken serverCancellation)
    {
        using (client)
        using (var connectionCancellation = CancellationTokenSource.CreateLinkedTokenSource(serverCancellation))
        {
            connectionCancellation.CancelAfter(TimeSpan.FromMinutes(30));
            var cancellationToken = connectionCancellation.Token;
            try
            {
                client.NoDelay = true;
                await using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.UTF8, false, Fd01Protocol.MaxLineBytes, leaveOpen: true);
                await using var writer = new StreamWriter(stream, new UTF8Encoding(false), Fd01Protocol.MaxLineBytes, leaveOpen: true) { NewLine = "\n", AutoFlush = true };

                var pair = await ReadMessageAsync<PairRequest>(reader, "PAIR", cancellationToken);
                if (!_pairing.TryPair(pair, out var pairResponse))
                {
                    await WriteMessageAsync(writer, "PAIR_REJECTED", pairResponse, cancellationToken);
                    return;
                }
                await WriteMessageAsync(writer, "PAIR_ACCEPTED", pairResponse, cancellationToken);

                var auth = await ReadMessageAsync<PairAuth>(reader, "AUTH", cancellationToken);
                if (!_pairing.Authorize(auth))
                {
                    await WriteMessageAsync(writer, "ERROR", new ErrorMessage("Não autorizado."), cancellationToken);
                    return;
                }

                var manifest = await ReadMessageAsync<TransferManifest>(reader, "MANIFEST", cancellationToken);
                if (!string.Equals(manifest.SessionId, auth.SessionId, StringComparison.Ordinal)) throw new InvalidDataException("Sessão do manifesto divergente.");
                var session = new TransferSession(_store);
                await session.AcceptManifestAsync(manifest, _destination(), cancellationToken);
                await WriteMessageAsync(writer, "MANIFEST_ACCEPTED", new { sessionId = manifest.SessionId }, cancellationToken);

                while (!cancellationToken.IsCancellationRequested && session.State == TransferState.Receiving)
                {
                    var command = await ReadLineAsync(reader, cancellationToken);
                    if (command is null) break;
                    if (command.StartsWith("FILE_BEGIN ", StringComparison.Ordinal))
                    {
                        var begin = Deserialize<FileBegin>(command[11..]);
                        _ = session.GetResumeOffset(begin.FileId);
                        await WriteMessageAsync(writer, "RESUME", new { fileId = begin.FileId, offset = session.GetResumeOffset(begin.FileId) }, cancellationToken);
                    }
                    else if (command.StartsWith("CHUNK ", StringComparison.Ordinal))
                    {
                        var header = Deserialize<ChunkHeader>(command[6..]);
                        if (header.Length < 0 || header.Length > Fd01Protocol.MaxChunkBytes) throw new InvalidDataException("Tamanho de chunk inválido.");
                        var bytes = new byte[header.Length];
                        await ReadExactlyAsync(stream, bytes, cancellationToken);
                        var next = await session.WriteChunkAsync(header.FileId, header.Offset, bytes, header.Sha256, cancellationToken);
                        await WriteMessageAsync(writer, "ACK", new { fileId = header.FileId, offset = next }, cancellationToken);
                    }
                    else if (command.StartsWith("FILE_END ", StringComparison.Ordinal))
                    {
                        var end = Deserialize<FileEnd>(command[9..]);
                        var path = await session.FinishFileAsync(end.FileId, end.Sha256, cancellationToken);
                        await WriteMessageAsync(writer, "FILE_COMPLETE", new { fileId = end.FileId, name = Path.GetFileName(path) }, cancellationToken);
                    }
                    else if (command.Equals("CANCEL", StringComparison.Ordinal))
                    {
                        session.Cancel();
                        await WriteMessageAsync(writer, "CANCELLED", new { sessionId = manifest.SessionId }, cancellationToken);
                    }
                    else throw new InvalidDataException("Comando FD/01 desconhecido.");
                }
                StatusChanged?.Invoke($"Sessão {manifest.SessionId} terminou em {session.State}.");
            }
            catch (OperationCanceledException) { StatusChanged?.Invoke("Ligação cancelada ou expirada."); }
            catch (IOException) { StatusChanged?.Invoke("Ligação encerrada durante a transferência."); }
            catch (JsonException) { await TryWriteErrorAsync(client, "Mensagem JSON inválida."); }
            catch (Exception ex) { StatusChanged?.Invoke($"Transferência rejeitada: {ex.Message}"); await TryWriteErrorAsync(client, "Pedido inválido ou transferência rejeitada."); }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_cancellation is null) return;
        _cancellation.Cancel();
        _listener.Stop();
        if (_acceptLoop is not null) { try { await _acceptLoop; } catch (OperationCanceledException) { } }
        _cancellation.Dispose();
    }

    private static async Task<string?> ReadLineAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        var line = await reader.ReadLineAsync(cancellationToken);
        if (line is not null && Encoding.UTF8.GetByteCount(line) > Fd01Protocol.MaxLineBytes)
            throw new InvalidDataException("Mensagem de controlo demasiado grande.");
        return line;
    }

    private static async Task<T> ReadMessageAsync<T>(StreamReader reader, string command, CancellationToken cancellationToken)
    {
        var line = await ReadLineAsync(reader, cancellationToken) ?? throw new EndOfStreamException();
        if (!line.StartsWith(command + " ", StringComparison.Ordinal)) throw new InvalidDataException($"Esperado {command}.");
        return Deserialize<T>(line[(command.Length + 1)..]);
    }

    private static T Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Fd01Protocol.JsonOptions) ?? throw new JsonException("Mensagem vazia.");

    private static async Task WriteMessageAsync<T>(StreamWriter writer, string command, T value, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(value, Fd01Protocol.JsonOptions);
        if (Encoding.UTF8.GetByteCount(json) > Fd01Protocol.MaxLineBytes) throw new InvalidDataException("Mensagem demasiado grande.");
        await writer.WriteLineAsync(command + " " + json, cancellationToken);
    }

    private static async Task ReadExactlyAsync(NetworkStream stream, byte[] buffer, CancellationToken cancellationToken)
    {
        var read = 0;
        while (read < buffer.Length)
        {
            var count = await stream.ReadAsync(buffer.AsMemory(read), cancellationToken);
            if (count == 0) throw new EndOfStreamException();
            read += count;
        }
    }

    private static async Task TryWriteErrorAsync(TcpClient client, string message)
    {
        try
        {
            await using var stream = client.GetStream();
            using var writer = new StreamWriter(stream, new UTF8Encoding(false), 256, leaveOpen: true) { NewLine = "\n", AutoFlush = true };
            await WriteMessageAsync(writer, "ERROR", new ErrorMessage(message), CancellationToken.None);
        }
        catch { }
    }
}

public sealed record ErrorMessage(string Message);
