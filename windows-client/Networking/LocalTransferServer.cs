using System.Collections.Concurrent;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using FastDrop.Windows.Protocol;
using FastDrop.Windows.Storage;
using FastDrop.Windows.Transfer;

namespace FastDrop.Windows.Networking;

public sealed class LocalTransferServer : IAsyncDisposable
{
    private readonly TcpListener _listener;
    private readonly PairingService _pairing;
    private readonly TransferStore _store;
    private readonly Func<string> _destination;
    private readonly X509Certificate2 _certificate;
    private readonly SemaphoreSlim _connections = new(2, 2);
    private readonly ConcurrentDictionary<int, Task> _clientTasks = new();
    private int _nextClientId;
    private CancellationTokenSource? _cancellation;
    private Task? _acceptLoop;

    public LocalTransferServer(PairingService pairing, TransferStore store, Func<string> destination, X509Certificate2 certificate, int transferPort = Fd01Protocol.TransferPort)
    {
        _listener = new TcpListener(IPAddress.Any, transferPort);
        _pairing = pairing;
        _store = store;
        _destination = destination;
        _certificate = certificate;
    }

    public int Port => _listener.LocalEndpoint is IPEndPoint endpoint ? endpoint.Port : throw new InvalidOperationException("Listener not started.");

    public event Action<string>? StatusChanged;

    public void Start()
    {
        if (_acceptLoop is not null) return;
        _cancellation = new CancellationTokenSource();
        _listener.Start(8);
        _acceptLoop = AcceptLoopAsync(_cancellation.Token);
        StatusChanged?.Invoke($"A escutar TLS localmente na porta {Fd01Protocol.TransferPort}");
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(cancellationToken);
                if (client.Client.RemoteEndPoint is IPEndPoint endpoint && !IsLocalAddress(endpoint.Address))
                {
                    client.Dispose();
                    continue;
                }
                if (!_connections.Wait(0))
                {
                    client.Dispose();
                    continue;
                }

                var clientId = Interlocked.Increment(ref _nextClientId);
                var clientTask = HandleClientAsync(client, cancellationToken);
                _clientTasks.TryAdd(clientId, clientTask);
                _ = clientTask.ContinueWith(
                    _ => _clientTasks.TryRemove(clientId, out var ignored),
                    CancellationToken.None,
                    TaskContinuationOptions.ExecuteSynchronously,
                    TaskScheduler.Default);
            }
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) { }
        catch (SocketException ex) { StatusChanged?.Invoke($"Listener indisponível: {ex.SocketErrorCode}"); }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken serverCancellation)
    {
        string? reservedSessionId = null;
        try
        {
            using (client)
            using (var connectionCancellation = CancellationTokenSource.CreateLinkedTokenSource(serverCancellation))
            {
                connectionCancellation.CancelAfter(TimeSpan.FromSeconds(60));
                var cancellationToken = connectionCancellation.Token;
                try
                {
                    client.NoDelay = true;
                    await using var network = client.GetStream();
                    await using var tls = new SslStream(network, leaveInnerStreamOpen: false);
                    await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                    {
                        ServerCertificate = _certificate,
                        EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                        ClientCertificateRequired = false,
                        CertificateRevocationCheckMode = X509RevocationMode.NoCheck,
                    }, cancellationToken);
                    var reader = new Fd01Reader(tls);
                    var writer = new Fd01Writer(tls);

                    var pair = await ReadMessageAsync<PairRequest>(reader, "PAIR", cancellationToken);
                    if (!_pairing.TryPair(pair, out var pairResponse))
                    {
                        await writer.WriteMessageAsync("PAIR_REJECTED", pairResponse, cancellationToken);
                        return;
                    }
                    reservedSessionId = pairResponse.SessionId;
                    await writer.WriteMessageAsync("PAIR_ACCEPTED", pairResponse, cancellationToken);

                    var auth = await ReadMessageAsync<PairAuth>(reader, "AUTH", cancellationToken);
                    if (!_pairing.Authorize(auth))
                    {
                        if (reservedSessionId is not null)
                            _pairing.RotateIfCurrentSession(reservedSessionId);
                        reservedSessionId = null;
                        await writer.WriteMessageAsync("ERROR", new ErrorMessage("Não autorizado ou sessão já utilizada."), cancellationToken);
                        return;
                    }

                    var manifest = await ReadMessageAsync<TransferManifest>(reader, "MANIFEST", cancellationToken);
                    if (!string.Equals(manifest.SessionId, auth.SessionId, StringComparison.Ordinal) || !_pairing.IsDeviceForSession(auth.SessionId, manifest.DeviceId))
                        throw new InvalidDataException("Sessão ou dispositivo do manifesto divergente.");

                    // The authenticated device has consumed this code. Rotate now so the next device
                    // gets a fresh one-time code while this transfer continues independently.
                    _pairing.RotateIfCurrentSession(manifest.SessionId);
                    reservedSessionId = null;
                    StatusChanged?.Invoke("Emparelhamento aceite. Novo código disponível.");

                    connectionCancellation.CancelAfter(TimeSpan.FromMinutes(30));
                    var session = new TransferSession(_store);
                    await session.AcceptManifestAsync(manifest, _destination(), cancellationToken);
                    await writer.WriteMessageAsync("MANIFEST_ACCEPTED", new { sessionId = manifest.SessionId }, cancellationToken);

                    while (!cancellationToken.IsCancellationRequested && session.State == TransferState.Receiving)
                    {
                        var command = await reader.ReadLineAsync(cancellationToken);
                        if (command is null) break;
                        if (command.StartsWith("FILE_BEGIN ", StringComparison.Ordinal))
                        {
                            var begin = Deserialize<FileBegin>(command[11..]);
                            await writer.WriteMessageAsync("RESUME", new { fileId = begin.FileId, offset = session.GetResumeOffset(begin.FileId) }, cancellationToken);
                        }
                        else if (command.StartsWith("CHUNK ", StringComparison.Ordinal))
                        {
                            var header = Deserialize<ChunkHeader>(command[6..]);
                            if (header.Length <= 0 || header.Length > Fd01Protocol.MaxChunkBytes) throw new InvalidDataException("Tamanho de chunk inválido.");
                            var bytes = new byte[header.Length];
                            await reader.ReadExactlyAsync(bytes, cancellationToken);
                            var next = await session.WriteChunkAsync(header.FileId, header.Offset, bytes, header.Sha256, cancellationToken);
                            await writer.WriteMessageAsync("ACK", new { fileId = header.FileId, offset = next }, cancellationToken);
                        }
                        else if (command.StartsWith("FILE_END ", StringComparison.Ordinal))
                        {
                            var end = Deserialize<FileEnd>(command[9..]);
                            var path = await session.FinishFileAsync(end.FileId, end.Sha256, cancellationToken);
                            await writer.WriteMessageAsync("FILE_COMPLETE", new { fileId = end.FileId, name = Path.GetFileName(path) }, cancellationToken);
                        }
                        else if (command.Equals("CANCEL", StringComparison.Ordinal))
                        {
                            session.Cancel();
                            await writer.WriteMessageAsync("CANCELLED", new { sessionId = manifest.SessionId }, cancellationToken);
                        }
                        else throw new InvalidDataException("Comando FD/01 desconhecido.");
                    }
                    StatusChanged?.Invoke($"Sessão {manifest.SessionId} terminou em {session.State}.");
                }
                catch (OperationCanceledException)
                {
                    if (reservedSessionId is not null) _pairing.RotateIfCurrentSession(reservedSessionId);
                    StatusChanged?.Invoke("Ligação cancelada ou expirada.");
                }
                catch (IOException)
                {
                    if (reservedSessionId is not null) _pairing.RotateIfCurrentSession(reservedSessionId);
                    StatusChanged?.Invoke("Ligação encerrada durante a transferência.");
                }
                catch (JsonException)
                {
                    if (reservedSessionId is not null) _pairing.RotateIfCurrentSession(reservedSessionId);
                    StatusChanged?.Invoke("Mensagem JSON inválida rejeitada.");
                }
                catch (Exception ex)
                {
                    if (reservedSessionId is not null) _pairing.RotateIfCurrentSession(reservedSessionId);
                    StatusChanged?.Invoke($"Transferência rejeitada: {ex.Message}");
                }
            }
        }
        finally { _connections.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (_cancellation is null) return;
        _cancellation.Cancel();
        _listener.Stop();
        try { if (_acceptLoop is not null) await _acceptLoop; } catch (OperationCanceledException) { }
        var activeClients = _clientTasks.Values.ToArray();
        try { await Task.WhenAll(activeClients); } catch { /* Individual handlers report their own failures. */ }
        _connections.Dispose();
        _cancellation.Dispose();
    }

    private static async Task<T> ReadMessageAsync<T>(Fd01Reader reader, string command, CancellationToken cancellationToken)
    {
        var line = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException();
        if (!line.StartsWith(command + " ", StringComparison.Ordinal)) throw new InvalidDataException($"Esperado {command}.");
        return Deserialize<T>(line[(command.Length + 1)..]);
    }

    private static T Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Fd01Protocol.JsonOptions) ?? throw new JsonException("Mensagem vazia.");

    private static bool IsLocalAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)) return true;
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = address.GetAddressBytes();
            return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) || (bytes[0] == 192 && bytes[1] == 168);
        }
        return address.IsIPv6LinkLocal || address.IsIPv6UniqueLocal;
    }
}

public sealed record ErrorMessage(string Message);
