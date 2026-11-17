using System.Collections.Concurrent;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using FastDrop.Windows.Networking;
using FastDrop.Windows.Protocol;
using FastDrop.Windows.Storage;
using FastDrop.Windows.Transfer;

static class Test
{
    private static int _passed;

    public static async Task Main()
    {
        await RejectsTraversalAsync();
        await WritesAndVerifiesFileAsync();
        await ResumesExistingPartAsync();
        await ResumesAcrossFreshPairSessionsAsync();
        await RejectsInvalidChunkAndOffsetAsync();
        await DiscardsOversizedResumeFileAsync();
        await RejectsCaseInsensitiveDuplicateIdsAsync();
        await ReadsFrameAndPayloadWithoutLossAsync();
        PairingIsSingleUseAndDeviceBound();
        PairingRateLimitAppliesAcrossDeviceIds();
        await ServerTransfersFileOverPinnedTlsAsync();
        Console.WriteLine($"PASS: {_passed} testes FD/01");
    }

    private static async Task RejectsTraversalAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var session = new TransferSession(new TransferStore());
            var manifest = new TransferManifest("session-test", "android-test", new[]
            {
                new ManifestEntry("file-1", "..\\escape.txt", 1, "document", new string('0', 64)),
            });
            await AssertThrowsAsync<InvalidDataException>(() => session.AcceptManifestAsync(manifest, root));
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task WritesAndVerifiesFileAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var content = System.Text.Encoding.UTF8.GetBytes("conteúdo por streaming");
            var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            var manifest = new TransferManifest("session-test", "android-test", new[]
            {
                new ManifestEntry("file-1", "hello.txt", content.Length, "document", hash),
            });
            var session = new TransferSession(new TransferStore());
            await session.AcceptManifestAsync(manifest, root);
            var chunkHash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            await session.WriteChunkAsync("file-1", 0, content, chunkHash);
            var final = await session.FinishFileAsync("file-1", hash);
            Assert(File.ReadAllBytes(final).SequenceEqual(content), "conteúdo final divergente");
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task ResumesExistingPartAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var content = System.Text.Encoding.UTF8.GetBytes("0123456789");
            var first = content[..4];
            var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            var manifest = new TransferManifest("session-resume", "android-test", new[]
            {
                new ManifestEntry("file-1", "resume.bin", content.Length, "document", hash),
            });
            var firstSession = new TransferSession(new TransferStore());
            await firstSession.AcceptManifestAsync(manifest, root);
            await firstSession.WriteChunkAsync("file-1", 0, first, Convert.ToHexString(SHA256.HashData(first)).ToLowerInvariant());
            var resumed = new TransferSession(new TransferStore());
            await resumed.AcceptManifestAsync(manifest, root);
            Assert(resumed.GetResumeOffset("file-1") == first.Length, "offset de retoma incorreto");
            await resumed.WriteChunkAsync("file-1", first.Length, content[first.Length..], Convert.ToHexString(SHA256.HashData(content[first.Length..])).ToLowerInvariant());
            await resumed.FinishFileAsync("file-1", hash);
            Pass();
        }
        finally { TryDelete(root); }
    }


    private static async Task ResumesAcrossFreshPairSessionsAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-cross-session-" + Guid.NewGuid().ToString("N"));
        try
        {
            var content = System.Text.Encoding.UTF8.GetBytes("resume after a new pairing");
            var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            const string transferId = "stable-transfer-001";
            var firstManifest = new TransferManifest("pair-session-one", "android-test", new[]
            {
                new ManifestEntry("file-1", "resume.bin", content.Length, "document", hash),
            }, transferId);
            var first = new TransferSession(new TransferStore());
            await first.AcceptManifestAsync(firstManifest, root);
            var partial = content[..9];
            await first.WriteChunkAsync("file-1", 0, partial,
                Convert.ToHexString(SHA256.HashData(partial)).ToLowerInvariant());

            var secondManifest = new TransferManifest("pair-session-two", "android-test", new[]
            {
                new ManifestEntry("file-1", "resume.bin", content.Length, "document", hash),
            }, transferId);
            var second = new TransferSession(new TransferStore());
            await second.AcceptManifestAsync(secondManifest, root);
            Assert(second.GetResumeOffset("file-1") == partial.Length,
                "o offset não foi conservado após novo emparelhamento TLS");
            var remaining = content[partial.Length..];
            await second.WriteChunkAsync("file-1", partial.Length, remaining,
                Convert.ToHexString(SHA256.HashData(remaining)).ToLowerInvariant());
            var final = await second.FinishFileAsync("file-1", hash);
            Assert(File.ReadAllBytes(final).SequenceEqual(content),
                "conteúdo final divergente após retoma entre sessões");
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task RejectsInvalidChunkAndOffsetAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-invalid-chunk-" + Guid.NewGuid().ToString("N"));
        try
        {
            var content = System.Text.Encoding.UTF8.GetBytes("valid");
            var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            var manifest = new TransferManifest("session-invalid", "android-test", new[]
            {
                new ManifestEntry("file-1", "valid.bin", content.Length, "document", hash),
            });
            var session = new TransferSession(new TransferStore());
            await session.AcceptManifestAsync(manifest, root);
            await AssertThrowsAsync<InvalidDataException>(() =>
                session.WriteChunkAsync("file-1", 1, content, hash));
            await AssertThrowsAsync<InvalidDataException>(() =>
                session.WriteChunkAsync("file-1", 0, ReadOnlyMemory<byte>.Empty, hash));
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task DiscardsOversizedResumeFileAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-oversized-part-" + Guid.NewGuid().ToString("N"));
        try
        {
            var content = System.Text.Encoding.UTF8.GetBytes("four");
            var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
            var manifest = new TransferManifest("session-oversized", "android-test", new[]
            {
                new ManifestEntry("file-1", "small.bin", content.Length, "document", hash),
            });
            var session = new TransferSession(new TransferStore());
            await session.AcceptManifestAsync(manifest, root);
            var part = Path.Combine(session.SessionFolder!, "file-1.part");
            await File.WriteAllBytesAsync(part, new byte[content.Length + 10]);
            Assert(session.GetResumeOffset("file-1") == 0, "ficheiro .part maior que o manifesto não foi reiniciado");
            Assert(!File.Exists(part), "ficheiro .part inválido permaneceu no destino");
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task RejectsCaseInsensitiveDuplicateIdsAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-duplicate-id-" + Guid.NewGuid().ToString("N"));
        try
        {
            var manifest = new TransferManifest("session-duplicate", "android-test", new[]
            {
                new ManifestEntry("file-a", "one.bin", 1, "document", new string('0', 64)),
                new ManifestEntry("FILE-A", "two.bin", 1, "document", new string('0', 64)),
            });
            var session = new TransferSession(new TransferStore());
            await AssertThrowsAsync<InvalidDataException>(() => session.AcceptManifestAsync(manifest, root));
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task ReadsFrameAndPayloadWithoutLossAsync()
    {
        var payload = System.Text.Encoding.UTF8.GetBytes("bytes-do-ficheiro");
        var frame = System.Text.Encoding.UTF8.GetBytes("CHUNK {\"length\":17}\n");
        await using var stream = new MemoryStream(frame.Concat(payload).ToArray());
        var reader = new Fd01Reader(stream);
        var line = await reader.ReadLineAsync(CancellationToken.None);
        var received = new byte[payload.Length];
        await reader.ReadExactlyAsync(received, CancellationToken.None);
        Assert(line == "CHUNK {\"length\":17}", "framing alterou a linha");
        Assert(received.SequenceEqual(payload), "framing perdeu bytes do payload");
        Pass();
    }

    private static void PairingIsSingleUseAndDeviceBound()
    {
        var pairing = new PairingService();
        var request = new PairRequest("android-a", pairing.CurrentCode, "nonce-a");
        Assert(pairing.TryPair(request, out var response), "emparelhamento válido rejeitado");
        Assert(response.Token is not null, "token não criado");
        Assert(!pairing.TryPair(new PairRequest("android-b", pairing.CurrentCode, "nonce-b"), out _),
            "o mesmo código aceitou um segundo dispositivo");
        Assert(pairing.IsDeviceForSession(response.SessionId, "android-a"), "segundo dispositivo substituiu o primeiro");
        Assert(pairing.Authorize(new PairAuth(response.SessionId, response.Token!)), "token válido rejeitado");
        Assert(!pairing.Authorize(new PairAuth(response.SessionId, response.Token!)), "token reutilizado aceite");
        Assert(pairing.IsDeviceForSession(response.SessionId, "android-a"), "dispositivo não associado");
        Assert(!pairing.IsDeviceForSession(response.SessionId, "android-b"), "dispositivo divergente associado");
        Pass();
    }



    private static void PairingRateLimitAppliesAcrossDeviceIds()
    {
        var pairing = new PairingService();
        for (var i = 0; i < 5; i++)
        {
            var request = new PairRequest($"attacker-{i}", "!!!!!!", $"nonce-{i}");
            Assert(!pairing.TryPair(request, out _), "código incorreto foi aceite");
        }

        var validCodeFromDifferentDevice = new PairRequest("new-device", pairing.CurrentCode, "nonce-valid");
        Assert(!pairing.TryPair(validCodeFromDifferentDevice, out _),
            "limite global foi contornado mudando o deviceId");
        Pass();
    }

    private static async Task ServerTransfersFileOverPinnedTlsAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "fastdrop-server-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using var tlsCertificate = new LocalTlsCertificate(Path.Combine(root, "tls"));
            var certificate = tlsCertificate.Certificate;
            var expectedFingerprint = SHA256.HashData(certificate.RawData);

            var pairing = new PairingService();
            await using var server = new LocalTransferServer(
                pairing, new TransferStore(), () => root, certificate, transferPort: 0);
            var serverEvents = new ConcurrentQueue<string>();
            server.StatusChanged += serverEvents.Enqueue;
            server.Start();

            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port, timeout.Token);
            await using var tls = new SslStream(
                client.GetStream(),
                leaveInnerStreamOpen: false,
                (_, presented, _, _) => presented is not null &&
                    CryptographicOperations.FixedTimeEquals(
                        SHA256.HashData(presented.GetRawCertData()), expectedFingerprint));
            try
            {
                await tls.AuthenticateAsClientAsync(
                    new SslClientAuthenticationOptions { TargetHost = "localhost" },
                    timeout.Token);
            }
            catch (Exception ex)
            {
                throw new Exception("TLS handshake falhou. Eventos do servidor: " + string.Join(" | ", serverEvents), ex);
            }

            var reader = new Fd01Reader(tls);
            var writer = new Fd01Writer(tls);
            var pairingCode = pairing.CurrentCode;
            await writer.WriteMessageAsync(
                "PAIR", new PairRequest("android-integration", pairingCode, "nonce-integration"), timeout.Token);
            var paired = await ReadProtocolMessageAsync<PairResponse>(reader, "PAIR_ACCEPTED", timeout.Token);
            Assert(paired.Token is not null, "servidor não entregou token de sessão");

            await writer.WriteMessageAsync(
                "AUTH", new PairAuth(paired.SessionId, paired.Token!), timeout.Token);

            var payload = System.Text.Encoding.UTF8.GetBytes("transferência TLS de integração");
            var hash = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
            var manifest = new TransferManifest(paired.SessionId, "android-integration", new[]
            {
                new ManifestEntry("integration-file", "integration.bin", payload.Length, "document", hash),
            });
            await writer.WriteMessageAsync("MANIFEST", manifest, timeout.Token);
            await ReadProtocolMessageAsync<JsonElement>(reader, "MANIFEST_ACCEPTED", timeout.Token);
            Assert(pairing.CurrentCode != pairingCode, "código não foi renovado após emparelhamento");

            await writer.WriteMessageAsync(
                "FILE_BEGIN", new FileBegin("integration-file"), timeout.Token);
            var resume = await ReadProtocolMessageAsync<JsonElement>(reader, "RESUME", timeout.Token);
            Assert(resume.GetProperty("offset").GetInt64() == 0, "servidor não iniciou no offset zero");

            await writer.WriteMessageAsync(
                "CHUNK",
                new ChunkHeader("integration-file", 0, payload.Length, hash),
                timeout.Token);
            await tls.WriteAsync(payload.AsMemory(), timeout.Token);
            await tls.FlushAsync(timeout.Token);
            var ack = await ReadProtocolMessageAsync<JsonElement>(reader, "ACK", timeout.Token);
            Assert(ack.GetProperty("offset").GetInt64() == payload.Length, "ACK não confirmou o offset esperado");

            await writer.WriteMessageAsync(
                "FILE_END", new FileEnd("integration-file", hash), timeout.Token);
            await ReadProtocolMessageAsync<JsonElement>(reader, "FILE_COMPLETE", timeout.Token);

            var finalPath = Directory.GetFiles(root, "integration.bin", SearchOption.AllDirectories).SingleOrDefault();
            Assert(finalPath is not null, "servidor não criou o ficheiro final");
            Assert(File.ReadAllBytes(finalPath!).SequenceEqual(payload), "conteúdo recebido pelo servidor diverge");
            Pass();
        }
        finally { TryDelete(root); }
    }

    private static async Task<T> ReadProtocolMessageAsync<T>(
        Fd01Reader reader, string expectedCommand, CancellationToken cancellationToken)
    {
        var line = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException();
        var prefix = expectedCommand + " ";
        Assert(line.StartsWith(prefix, StringComparison.Ordinal), $"esperado {expectedCommand}, recebido: {line}");
        return JsonSerializer.Deserialize<T>(line[prefix.Length..], Fd01Protocol.JsonOptions)
            ?? throw new InvalidDataException($"Resposta {expectedCommand} vazia.");
    }

    private static async Task AssertThrowsAsync<T>(Func<Task> action) where T : Exception
    {
        try { await action(); throw new Exception($"Esperava {typeof(T).Name}"); }
        catch (T) { }
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    private static void Pass() => _passed++;

    private static void TryDelete(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { }
    }
}
