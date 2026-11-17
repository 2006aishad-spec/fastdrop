using System.Text.Json;
using FastDrop.Windows.Protocol;

namespace FastDrop.Windows.Storage;

public sealed class TransferStore
{
    private readonly string _root;

    public TransferStore()
    {
        _root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FastDrop", "sessions");
        Directory.CreateDirectory(_root);
    }

    public string DefaultDestination => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FastDrop");

    public string GetSessionFolder(string sessionId, string destination)
    {
        ValidateSessionId(sessionId);
        var fullDestination = Path.GetFullPath(destination);
        Directory.CreateDirectory(fullDestination);
        var folder = Path.Combine(fullDestination, $"FastDrop-{sessionId}");
        Directory.CreateDirectory(folder);
        return folder;
    }

    public string GetPartPath(string sessionFolder, ManifestEntry entry) => Path.Combine(sessionFolder, entry.FileId + ".part");

    public string GetFinalPath(string sessionFolder, ManifestEntry entry)
    {
        var safeName = ValidateFileName(entry.Name);
        var candidate = Path.Combine(sessionFolder, safeName);
        if (!File.Exists(candidate)) return candidate;
        var baseName = Path.GetFileNameWithoutExtension(safeName);
        var extension = Path.GetExtension(safeName);
        for (var i = 1; i < 10_000; i++)
        {
            candidate = Path.Combine(sessionFolder, $"{baseName} ({i}){extension}");
            if (!File.Exists(candidate)) return candidate;
        }
        throw new IOException("Não foi possível criar um nome de destino único.");
    }

    public void EnsureFreeSpace(string destination, long requiredBytes)
    {
        if (requiredBytes < 0 || requiredBytes > Fd01Protocol.MaxSessionBytes) throw new InvalidDataException("Tamanho total inválido.");
        var root = Path.GetPathRoot(Path.GetFullPath(destination)) ?? throw new IOException("Destino sem volume.");
        var available = new DriveInfo(root).AvailableFreeSpace;
        if (available < requiredBytes) throw new IOException("Espaço insuficiente no destino.");
    }

    public async Task SaveManifestAsync(TransferManifest manifest, CancellationToken cancellationToken = default)
    {
        ValidateSessionId(manifest.TransferId ?? manifest.SessionId);
        var path = Path.Combine(_root, $"{manifest.TransferId ?? manifest.SessionId}.manifest.json");
        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(manifest, Fd01Protocol.JsonOptions), cancellationToken);
    }

    public static string ValidateFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 255 || name is "." or "..") throw new InvalidDataException("Nome de ficheiro inválido.");
        if (name != Path.GetFileName(name) || name.Any(char.IsControl) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            throw new InvalidDataException("O nome de ficheiro contém um caminho ou caracteres inválidos.");
        return name;
    }

    public static void ValidateSessionId(string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || sessionId.Length > 128 || sessionId.Any(c => !char.IsLetterOrDigit(c) && c != '-' && c != '_'))
            throw new InvalidDataException("Identificador de sessão inválido.");
    }
}
