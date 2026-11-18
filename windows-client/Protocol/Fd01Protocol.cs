using System.Text.Json;
using System.Text.Json.Serialization;

namespace FastDrop.Windows.Protocol;

public static class Fd01Protocol
{
    public const string ProtocolVersion = "FD/01";
    public const int DiscoveryPort = 45555;
    public const int TransferPort = 45556;
    public const string DiscoveryGroup = "239.255.42.42";
    public const int MaxLineBytes = 64 * 1024;
    public const int MaxChunkBytes = 1024 * 1024;
    public const int MaxManifestFiles = 1_000;
    public const long MaxFileBytes = 100L * 1024 * 1024 * 1024;
    public const long MaxSessionBytes = 500L * 1024 * 1024 * 1024;

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    public static byte[] Serialize<T>(T value) => JsonSerializer.SerializeToUtf8Bytes(value, JsonOptions);
}

public sealed record DiscoveryAnnouncement(
    string DeviceId,
    string DeviceName,
    string Platform,
    string ProtocolVersion,
    string Nonce,
    int TransferPort,
    string? CertificateSha256 = null);

public sealed record PairRequest(string DeviceId, string Code, string Nonce);

public sealed record PairResponse(bool Accepted, string SessionId, string Code, string Message, string? Token = null);

public sealed record PairAuth(string SessionId, string Token);

public sealed record ManifestEntry(
    string FileId,
    string Name,
    long Size,
    string Kind,
    string Sha256);

public sealed record TransferManifest(
    string SessionId,
    string DeviceId,
    IReadOnlyList<ManifestEntry> Files,
    string? TransferId = null);

public sealed record FileBegin(string FileId);

public sealed record ChunkHeader(string FileId, long Offset, int Length, string Sha256);

public sealed record FileEnd(string FileId, string Sha256);

public enum TransferState
{
    Waiting,
    Pairing,
    Receiving,
    Paused,
    Completed,
    Failed,
    Cancelled,
}
