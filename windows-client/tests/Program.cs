using System.Security.Cryptography;
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
