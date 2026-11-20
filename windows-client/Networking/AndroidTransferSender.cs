using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using FastDrop.Windows.Protocol;

namespace FastDrop.Windows.Networking;

public enum AndroidSendAction { Continue, Pause, Cancel }

public sealed record AndroidSendProgress(
    string Status,
    string TransferId,
    long SentBytes,
    long TotalBytes,
    string CurrentFile,
    string Message);

public sealed class AndroidTransferSender
{
    public async Task<string> SendAsync(
        DiscoveredAndroidDevice device,
        string pairingCode,
        IReadOnlyList<string> selectedPaths,
        Func<AndroidSendAction> getAction,
        IProgress<AndroidSendProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (pairingCode.Length != 6 || pairingCode.Any(char.IsWhiteSpace))
            throw new ArgumentException("Introduz o código de seis caracteres apresentado no Android.", nameof(pairingCode));
        if (!IsValidFingerprint(device.CertificateSha256))
            throw new ArgumentException("Fingerprint do Android inválida.", nameof(device));

        var files = selectedPaths.Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(path => new FileInfo(path))
            .ToArray();
        if (files.Length == 0 || files.Length > Fd01Protocol.MaxManifestFiles)
            throw new InvalidDataException("Seleciona entre 1 e 1000 ficheiros.");
        if (files.Any(file => !file.Exists || file.Length < 0 || file.Length > Fd01Protocol.MaxFileBytes))
            throw new IOException("Um dos ficheiros selecionados não existe ou excede o limite permitido.");

        var prepared = new List<PreparedFile>(files.Length);
        long totalBytes = 0;
        foreach (var file in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var fileId = CreateStableFileId(file);
            var hash = await ComputeSha256Async(file.FullName, cancellationToken);
            prepared.Add(new PreparedFile(file, fileId, hash, GetKind(file.Extension)));
            if (long.MaxValue - totalBytes < file.Length) throw new InvalidDataException("Tamanho total inválido.");
            totalBytes += file.Length;
        }
        if (totalBytes > Fd01Protocol.MaxSessionBytes) throw new InvalidDataException("A seleção excede 500 GB.");

        var transferId = CreateTransferId(prepared);
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        progress?.Report(new AndroidSendProgress("connecting", transferId, 0, totalBytes, "", "A ligar ao telefone por TLS."));

        using var client = new TcpClient(device.Address.AddressFamily);
        await client.ConnectAsync(device.Address, device.TransferPort, cancellationToken);
        client.NoDelay = true;
        await using var network = client.GetStream();
        await using var tls = new SslStream(network, leaveInnerStreamOpen: false,
            (_, certificate, _, _) => ValidatePinnedCertificate(certificate, device.CertificateSha256));
        await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions
        {
            TargetHost = "XTransfer Offline Android",
            EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
            CertificateRevocationCheckMode = X509RevocationMode.NoCheck
        }, cancellationToken);

        var reader = new Fd01Reader(tls);
        var writer = new Fd01Writer(tls);
        var deviceId = $"win-{Environment.MachineName.ToLowerInvariant()}";
        progress?.Report(new AndroidSendProgress("pairing", transferId, 0, totalBytes, "", "Certificado fixado. A validar código de emparelhamento."));

        await writer.WriteMessageAsync("PAIR", new PairRequest(deviceId, pairingCode.ToUpperInvariant(), nonce), cancellationToken);
        var pairLine = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException("O Android encerrou a ligação durante o emparelhamento.");
        if (pairLine.StartsWith("PAIR_REJECTED ", StringComparison.Ordinal))
        {
            var rejected = Deserialize<ErrorMessage>(pairLine["PAIR_REJECTED ".Length..]);
            throw new AuthenticationException(rejected.Message);
        }
        if (!pairLine.StartsWith("PAIR_ACCEPTED ", StringComparison.Ordinal))
            throw new InvalidDataException("Resposta FD/01 de emparelhamento inválida.");
        var pair = Deserialize<PairResponse>(pairLine["PAIR_ACCEPTED ".Length..]);
        if (!pair.Accepted || string.IsNullOrWhiteSpace(pair.SessionId) || string.IsNullOrWhiteSpace(pair.Token))
            throw new AuthenticationException(pair.Message);

        await writer.WriteMessageAsync("AUTH", new PairAuth(pair.SessionId, pair.Token), cancellationToken);
        var entries = prepared.Select(file => new ManifestEntry(
            file.FileId, file.Info.Name, file.Info.Length, file.Kind, file.Sha256)).ToArray();
        var manifest = new TransferManifest(pair.SessionId, deviceId, entries, transferId);
        await writer.WriteMessageAsync("MANIFEST", manifest, cancellationToken);
        var accepted = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException("O Android não confirmou o manifesto.");
        if (!accepted.StartsWith("MANIFEST_ACCEPTED ", StringComparison.Ordinal))
            throw new InvalidDataException("O Android rejeitou o manifesto: " + accepted);

        long completedBefore = 0;
        foreach (var file in prepared)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var action = getAction();
            if (action == AndroidSendAction.Cancel)
            {
                await TryCancelAsync(writer, reader, pair.SessionId, cancellationToken);
                progress?.Report(new AndroidSendProgress("cancelled", transferId, completedBefore, totalBytes, "", "Transferência cancelada."));
                return "cancelled";
            }
            if (action == AndroidSendAction.Pause)
            {
                progress?.Report(new AndroidSendProgress("paused", transferId, completedBefore, totalBytes, "", "Pausada num limite seguro. Os blocos confirmados podem ser retomados."));
                return "paused";
            }

            await writer.WriteMessageAsync("FILE_BEGIN", new FileBegin(file.FileId), cancellationToken);
            var resumeLine = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException("O Android não devolveu o offset de retoma.");
            if (!resumeLine.StartsWith("RESUME ", StringComparison.Ordinal))
                throw new InvalidDataException("Resposta RESUME inválida: " + resumeLine);
            var resume = Deserialize<ResumeResponse>(resumeLine["RESUME ".Length..]);
            if (resume.FileId != file.FileId || resume.Offset < 0 || resume.Offset > file.Info.Length)
                throw new InvalidDataException("Offset de retoma fora dos limites.");

            await using (var input = new FileStream(file.Info.FullName, FileMode.Open, FileAccess.Read, FileShare.Read,
                128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                input.Seek(resume.Offset, SeekOrigin.Begin);
                var offset = resume.Offset;
                var buffer = new byte[Fd01Protocol.MaxChunkBytes];
                while (offset < file.Info.Length)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    action = getAction();
                    if (action == AndroidSendAction.Cancel)
                    {
                        await TryCancelAsync(writer, reader, pair.SessionId, cancellationToken);
                        progress?.Report(new AndroidSendProgress("cancelled", transferId, completedBefore + offset, totalBytes, file.Info.Name, "Transferência cancelada."));
                        return "cancelled";
                    }
                    if (action == AndroidSendAction.Pause)
                    {
                        progress?.Report(new AndroidSendProgress("paused", transferId, completedBefore + offset, totalBytes, file.Info.Name, "Pausada após o último bloco confirmado."));
                        return "paused";
                    }

                    var wanted = (int)Math.Min(buffer.Length, file.Info.Length - offset);
                    var read = 0;
                    while (read < wanted)
                    {
                        var count = await input.ReadAsync(buffer.AsMemory(read, wanted - read), cancellationToken);
                        if (count == 0) throw new EndOfStreamException("O ficheiro mudou durante a transferência.");
                        read += count;
                    }
                    var chunk = buffer.AsMemory(0, wanted);
                    var chunkHash = Convert.ToHexString(SHA256.HashData(chunk.Span)).ToLowerInvariant();
                    await writer.WriteMessageAsync("CHUNK", new ChunkHeader(file.FileId, offset, wanted, chunkHash), cancellationToken);
                    await tls.WriteAsync(chunk, cancellationToken);
                    await tls.FlushAsync(cancellationToken);

                    var ackLine = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException("O Android não confirmou o bloco.");
                    if (!ackLine.StartsWith("ACK ", StringComparison.Ordinal))
                        throw new InvalidDataException("Resposta ACK inválida: " + ackLine);
                    var ack = Deserialize<AckResponse>(ackLine["ACK ".Length..]);
                    var nextOffset = offset + wanted;
                    if (ack.FileId != file.FileId || ack.Offset != nextOffset)
                        throw new InvalidDataException("O Android confirmou um offset inesperado.");
                    offset = nextOffset;
                    progress?.Report(new AndroidSendProgress("sending", transferId, completedBefore + offset, totalBytes, file.Info.Name, "Blocos enviados e confirmados."));
                }
            }

            await writer.WriteMessageAsync("FILE_END", new FileEnd(file.FileId, file.Sha256), cancellationToken);
            var completeLine = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException("O Android não confirmou a integridade final.");
            if (!completeLine.StartsWith("FILE_COMPLETE ", StringComparison.Ordinal))
                throw new InvalidDataException("Resposta FILE_COMPLETE inválida: " + completeLine);
            var complete = Deserialize<FileCompleteResponse>(completeLine["FILE_COMPLETE ".Length..]);
            if (complete.FileId != file.FileId) throw new InvalidDataException("O Android confirmou outro ficheiro.");
            completedBefore += file.Info.Length;
            progress?.Report(new AndroidSendProgress("file-complete", transferId, completedBefore, totalBytes, file.Info.Name, "SHA-256 confirmado pelo Android."));
        }

        progress?.Report(new AndroidSendProgress("completed", transferId, totalBytes, totalBytes, "", "Todos os ficheiros foram recebidos e verificados."));
        return "completed";
    }

    private static async Task TryCancelAsync(Fd01Writer writer, Fd01Reader reader, string sessionId, CancellationToken cancellationToken)
    {
        await writer.WriteMessageAsync("CANCEL", new { sessionId }, cancellationToken);
        var response = await reader.ReadLineAsync(cancellationToken);
        if (response is null || !response.StartsWith("CANCELLED ", StringComparison.Ordinal))
            throw new IOException("O Android não confirmou o cancelamento.");
    }

    private static async Task<string> ComputeSha256Async(string path, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
            128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Convert.ToHexString(await SHA256.HashDataAsync(stream, cancellationToken)).ToLowerInvariant();
    }

    private static string CreateStableFileId(FileInfo file)
    {
        var identity = $"{Path.GetFullPath(file.FullName).ToUpperInvariant()}|{file.Length}|{file.LastWriteTimeUtc.Ticks}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..32].ToLowerInvariant();
    }

    private static string CreateTransferId(IReadOnlyList<PreparedFile> files)
    {
        var identity = string.Join("|", files.OrderBy(x => x.FileId, StringComparer.Ordinal).Select(x => $"{x.FileId}:{x.Sha256}"));
        return "transfer-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..40].ToLowerInvariant();
    }

    private static string GetKind(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".bmp" or ".heic" => "image",
        ".mp4" or ".mov" or ".mkv" or ".avi" or ".webm" => "video",
        ".mp3" or ".wav" or ".aac" or ".flac" or ".ogg" => "audio",
        _ => "document"
    };

    private static bool IsValidFingerprint(string value) =>
        value.Length == 64 && value.All(Uri.IsHexDigit);

    private static bool ValidatePinnedCertificate(X509Certificate? certificate, string expectedFingerprint)
    {
        if (certificate is null) return false;
        try
        {
            var actual = Convert.ToHexString(SHA256.HashData(certificate.GetRawCertData())).ToLowerInvariant();
            var expected = expectedFingerprint.ToLowerInvariant();
            return CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(actual), Encoding.ASCII.GetBytes(expected));
        }
        catch (CryptographicException) { return false; }
    }

    private static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Fd01Protocol.JsonOptions) ??
        throw new JsonException("Resposta FD/01 vazia.");

    private sealed record PreparedFile(FileInfo Info, string FileId, string Sha256, string Kind);
    private sealed record ResumeResponse(string FileId, long Offset);
    private sealed record AckResponse(string FileId, long Offset);
    private sealed record FileCompleteResponse(string FileId, string Name);
}
