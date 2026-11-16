using System.Text.Json;
using System.Text.Json.Serialization;

namespace FastDrop.Windows.Protocol;

public static class Fd01Protocol
{
    public const string ProtocolVersion = "FD/01";
    public const int DiscoveryPort = 45555;
    public const int TransferPort = 45556;
    public const string DiscoveryGroup = "239.255.42.42";

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };
}

public sealed record DiscoveryAnnouncement(
    string DeviceId,
    string DeviceName,
    string Platform,
    string ProtocolVersion,
    string Nonce,
    int TransferPort);

public sealed record PairRequest(string DeviceId, string Code, string Nonce);

public sealed record PairResponse(bool Accepted, string SessionId, string Code, string Message);

public sealed record ManifestEntry(
    string FileId,
    string Name,
    long Size,
    string Kind,
    string Sha256);

public sealed record TransferManifest(
    string SessionId,
    string DeviceId,
    IReadOnlyList<ManifestEntry> Files);

public enum TransferState
{
    Waiting,
    Pairing,
    Receiving,
    Paused,
    Completed,
    Failed,
}
