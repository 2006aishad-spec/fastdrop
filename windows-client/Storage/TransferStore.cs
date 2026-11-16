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
        var safeSessionId = string.Concat(sessionId.Where(char.IsLetterOrDigit));
        var folder = Path.Combine(destination, $"FastDrop-{safeSessionId}");
        Directory.CreateDirectory(folder);
        return folder;
    }

    public async Task SaveManifestAsync(TransferManifest manifest, CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(_root, $"{manifest.SessionId}.manifest.json");
        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(manifest, Fd01Protocol.JsonOptions), cancellationToken);
    }
}
