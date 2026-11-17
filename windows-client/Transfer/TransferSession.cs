using System.Security.Cryptography;
using FastDrop.Windows.Protocol;
using FastDrop.Windows.Storage;

namespace FastDrop.Windows.Transfer;

public sealed class TransferSession
{
    private readonly TransferStore _store;
    private readonly Dictionary<string, ManifestEntry> _files = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _finished = new(StringComparer.Ordinal);
    private long _declaredBytes;

    public TransferSession(TransferStore store) => _store = store;

    public TransferState State { get; private set; } = TransferState.Waiting;
    public string? SessionFolder { get; private set; }
    public long ReceivedBytes { get; private set; }

    public async Task AcceptManifestAsync(TransferManifest manifest, string destination, CancellationToken cancellationToken = default)
    {
        ValidateManifest(manifest);
        _store.EnsureFreeSpace(destination, _declaredBytes);
        SessionFolder = _store.GetSessionFolder(manifest.TransferId ?? manifest.SessionId, destination);
        await _store.SaveManifestAsync(manifest, cancellationToken);
        State = TransferState.Receiving;
    }

    public long GetResumeOffset(string fileId)
    {
        var entry = GetEntry(fileId);
        var path = GetPartPath(entry);
        if (!File.Exists(path)) return 0;
        var length = new FileInfo(path).Length;
        if (length > entry.Size)
        {
            File.Delete(path);
            return 0;
        }
        return length;
    }

    public async Task<long> WriteChunkAsync(string fileId, long offset, ReadOnlyMemory<byte> chunk, string chunkSha256, CancellationToken cancellationToken = default)
    {
        if (State != TransferState.Receiving || SessionFolder is null) throw new InvalidOperationException("A sessão não está a receber.");
        var entry = GetEntry(fileId);
        if (_finished.Contains(fileId)) throw new InvalidDataException("O ficheiro já foi finalizado.");
        if (chunk.IsEmpty || offset < 0 || offset > entry.Size || chunk.Length > Fd01Protocol.MaxChunkBytes || chunk.Length > entry.Size - offset)
            throw new InvalidDataException("Offset ou tamanho do chunk inválido.");
        if (!IsSha256(chunkSha256)) throw new InvalidDataException("Checksum de chunk inválido.");
        var actualChunk = Convert.ToHexString(SHA256.HashData(chunk.Span)).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(actualChunku8(actualChunk), actualChunku8(chunkSha256)))
            throw new InvalidDataException("Checksum do chunk divergente.");

        var part = GetPartPath(entry);
        var existing = File.Exists(part) ? new FileInfo(part).Length : 0;
        if (existing != offset) throw new InvalidDataException($"Offset de retoma inválido; esperado {existing}.");
        await using var stream = new FileStream(part, FileMode.OpenOrCreate, FileAccess.Write, FileShare.Read, 64 * 1024, useAsync: true);
        stream.Position = offset;
        await stream.WriteAsync(chunk, cancellationToken);
        await stream.FlushAsync(cancellationToken);
        ReceivedBytes += chunk.Length;
        return offset + chunk.Length;
    }

    public async Task<string> FinishFileAsync(string fileId, string expectedSha256, CancellationToken cancellationToken = default)
    {
        if (State != TransferState.Receiving || SessionFolder is null) throw new InvalidOperationException("A sessão não está a receber.");
        var entry = GetEntry(fileId);
        if (!string.Equals(entry.Sha256, expectedSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Checksum final não corresponde ao manifesto.");
        var part = GetPartPath(entry);
        if (!File.Exists(part) || new FileInfo(part).Length != entry.Size) throw new InvalidDataException("O ficheiro incompleto não pode ser finalizado.");
        string actual;
        await using (var stream = File.OpenRead(part))
        {
            actual = Convert.ToHexString(await SHA256.HashDataAsync(stream, cancellationToken));
        }
        if (!CryptographicOperations.FixedTimeEquals(actualChunku8(actual), actualChunku8(expectedSha256))) throw new InvalidDataException("SHA-256 final divergente.");
        var finalPath = _store.GetFinalPath(SessionFolder, entry);
        File.Move(part, finalPath);
        _finished.Add(fileId);
        if (_finished.Count == _files.Count) State = TransferState.Completed;
        return finalPath;
    }

    public void Cancel()
    {
        if (SessionFolder is not null)
        {
            foreach (var entry in _files.Values)
            {
                var part = GetPartPath(entry);
                try { if (File.Exists(part)) File.Delete(part); } catch (IOException) { }
            }
        }
        State = TransferState.Cancelled;
    }

    private void ValidateManifest(TransferManifest manifest)
    {
        TransferStore.ValidateSessionId(manifest.SessionId);
        TransferStore.ValidateSessionId(manifest.TransferId ?? manifest.SessionId);
        if (string.IsNullOrWhiteSpace(manifest.DeviceId) || manifest.DeviceId.Length > 128) throw new InvalidDataException("Dispositivo inválido.");
        if (manifest.Files is null || manifest.Files.Count == 0 || manifest.Files.Count > Fd01Protocol.MaxManifestFiles) throw new InvalidDataException("Manifesto vazio ou demasiado grande.");
        _files.Clear();
        _declaredBytes = 0;
        foreach (var entry in manifest.Files)
        {
            if (entry is null) throw new InvalidDataException("Entrada nula no manifesto.");
            if (string.IsNullOrWhiteSpace(entry.FileId) || entry.FileId.Length > 128 || entry.FileId.Any(c => !char.IsLetterOrDigit(c) && c != '-' && c != '_')) throw new InvalidDataException("FileId inválido.");
            if (!_files.TryAdd(entry.FileId, entry)) throw new InvalidDataException("FileId duplicado.");
            TransferStore.ValidateFileName(entry.Name);
            if (entry.Size < 0 || entry.Size > Fd01Protocol.MaxFileBytes || long.MaxValue - _declaredBytes < entry.Size) throw new InvalidDataException("Tamanho de ficheiro inválido.");
            if (!IsSha256(entry.Sha256)) throw new InvalidDataException("SHA-256 do manifesto inválido.");
            _declaredBytes += entry.Size;
        }
    }

    private ManifestEntry GetEntry(string fileId) => _files.TryGetValue(fileId, out var entry) ? entry : throw new InvalidDataException("FileId não está no manifesto.");
    private string GetPartPath(ManifestEntry entry) => _store.GetPartPath(SessionFolder ?? throw new InvalidOperationException(), entry);
    private static bool IsSha256(string? value) => value is { Length: 64 } && value.All(Uri.IsHexDigit);
    private static byte[] actualChunku8(string value) => Convert.FromHexString(value);
}
