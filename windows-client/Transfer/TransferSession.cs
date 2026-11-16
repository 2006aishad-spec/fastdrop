using System.Security.Cryptography;
using FastDrop.Windows.Protocol;
using FastDrop.Windows.Storage;

namespace FastDrop.Windows.Transfer;

public sealed class TransferSession
{
    private readonly TransferStore _store;

    public TransferSession(TransferStore store)
    {
        _store = store;
    }

    public TransferState State { get; private set; } = TransferState.Waiting;
    public string? SessionFolder { get; private set; }
    public long ReceivedBytes { get; private set; }

    public async Task AcceptManifestAsync(TransferManifest manifest, string destination, CancellationToken cancellationToken = default)
    {
        State = TransferState.Receiving;
        SessionFolder = _store.GetSessionFolder(manifest.SessionId, destination);
        await _store.SaveManifestAsync(manifest, cancellationToken);
    }

    public async Task<bool> WriteChunkAsync(string fileName, long offset, ReadOnlyMemory<byte> chunk, string expectedSha256, CancellationToken cancellationToken = default)
    {
        if (State != TransferState.Receiving || SessionFolder is null) return false;
        var safeName = Path.GetFileName(fileName);
        var path = Path.Combine(SessionFolder, safeName);
        await using var stream = new FileStream(path, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None, 64 * 1024, useAsync: true);
        stream.Position = offset;
        await stream.WriteAsync(chunk, cancellationToken);
        ReceivedBytes += chunk.Length;
        return true;
    }

    public async Task<bool> VerifyFileAsync(string fileName, string expectedSha256, CancellationToken cancellationToken = default)
    {
        if (SessionFolder is null) return false;
        var path = Path.Combine(SessionFolder, Path.GetFileName(fileName));
        await using var stream = File.OpenRead(path);
        var actual = await SHA256.HashDataAsync(stream, cancellationToken);
        return CryptographicOperations.FixedTimeEquals(actual, Convert.FromHexString(expectedSha256));
    }
}
