using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using FastDrop.Windows.Protocol;

namespace FastDrop.Windows.Networking;

public sealed record DiscoveredAndroidDevice(
    string DeviceId,
    string DeviceName,
    IPAddress Address,
    int TransferPort,
    string CertificateSha256,
    DateTimeOffset LastSeen)
{
    public override string ToString() => $"{DeviceName} ({Address})";
}

public sealed class LocalDiscoveryService : IAsyncDisposable
{
    private const int AndroidTransferPort = 45557;
    private readonly string _deviceId = $"win-{Environment.MachineName.ToLowerInvariant()}";
    private readonly string _deviceName;
    private readonly string _certificateSha256;
    private readonly UdpClient _udp = new();
    private readonly UdpClient _receiver;
    private readonly ConcurrentDictionary<string, DiscoveredAndroidDevice> _androidDevices = new();
    private CancellationTokenSource? _cancellation;
    private Task? _announceLoop;
    private Task? _receiveLoop;

    public LocalDiscoveryService(string deviceName, string certificateSha256)
    {
        _deviceName = deviceName;
        _certificateSha256 = certificateSha256;
        _receiver = CreateDiscoveryReceiver();
    }

    public event Action<DiscoveryAnnouncement>? AnnouncementSent;
    public event Action<DiscoveredAndroidDevice>? AndroidDeviceDiscovered;
    public IReadOnlyCollection<DiscoveredAndroidDevice> AndroidDevices => _androidDevices.Values
        .Where(x => DateTimeOffset.UtcNow - x.LastSeen < TimeSpan.FromSeconds(12)).ToArray();

    public void Start()
    {
        if (_announceLoop is not null) return;
        _cancellation = new CancellationTokenSource();
        _announceLoop = Task.Run(() => AnnounceLoopAsync(_cancellation.Token));
        _receiveLoop = Task.Run(() => ReceiveAndroidLoopAsync(_cancellation.Token));
    }

    private static UdpClient CreateDiscoveryReceiver()
    {
        var receiver = new UdpClient(AddressFamily.InterNetwork);
        receiver.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        receiver.Client.Bind(new IPEndPoint(IPAddress.Any, Fd01Protocol.DiscoveryPort));
        var group = IPAddress.Parse(Fd01Protocol.DiscoveryGroup);
        var joined = false;
        foreach (var network in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (network.OperationalStatus != OperationalStatus.Up || !network.SupportsMulticast) continue;
            foreach (var address in network.GetIPProperties().UnicastAddresses
                         .Where(x => x.Address.AddressFamily == AddressFamily.InterNetwork))
            {
                try
                {
                    receiver.JoinMulticastGroup(group, address.Address);
                    joined = true;
                }
                catch (Exception) { }
            }
        }
        if (!joined) receiver.JoinMulticastGroup(group);
        return receiver;
    }

    private async Task AnnounceLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            _udp.EnableBroadcast = true;
            var endpoint = new IPEndPoint(IPAddress.Parse(Fd01Protocol.DiscoveryGroup), Fd01Protocol.DiscoveryPort);
            while (!cancellationToken.IsCancellationRequested)
            {
                var announcement = new DiscoveryAnnouncement(
                    _deviceId,
                    _deviceName,
                    "Windows",
                    Fd01Protocol.ProtocolVersion,
                    Convert.ToHexString(RandomNumberGenerator.GetBytes(6)),
                    Fd01Protocol.TransferPort,
                    _certificateSha256);
                var payload = JsonSerializer.SerializeToUtf8Bytes(announcement, Fd01Protocol.JsonOptions);
                await _udp.SendAsync(payload, endpoint, cancellationToken);
                AnnouncementSent?.Invoke(announcement);
                await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
            }
        }
        catch (OperationCanceledException) { }
        catch (SocketException) { }
    }

    private async Task ReceiveAndroidLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var packet = await _receiver.ReceiveAsync(cancellationToken);
                if (packet.Buffer.Length is 0 or > 8192) continue;
                using var document = JsonDocument.Parse(packet.Buffer);
                var root = document.RootElement;
                var id = root.GetProperty("deviceId").GetString() ?? "";
                var name = root.GetProperty("deviceName").GetString() ?? "";
                var platform = root.GetProperty("platform").GetString() ?? "";
                var protocol = root.GetProperty("protocolVersion").GetString() ?? "";
                var port = root.GetProperty("transferPort").GetInt32();
                var fingerprint = (root.GetProperty("certificateSha256").GetString() ?? "").ToLowerInvariant();
                if (platform != "Android" || protocol != Fd01Protocol.ProtocolVersion ||
                    port != AndroidTransferPort || string.IsNullOrWhiteSpace(id) || id.Length > 128 ||
                    string.IsNullOrWhiteSpace(name) || name.Length > 80 ||
                    !System.Text.RegularExpressions.Regex.IsMatch(fingerprint, "^[a-f0-9]{64}$") ||
                    !IsLocalAddress(packet.RemoteEndPoint.Address))
                    continue;

                var item = new DiscoveredAndroidDevice(id, name, packet.RemoteEndPoint.Address, port, fingerprint, DateTimeOffset.UtcNow);
                _androidDevices[id] = item;
                AndroidDeviceDiscovered?.Invoke(item);
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (SocketException) when (cancellationToken.IsCancellationRequested) { break; }
            catch (Exception) { /* Invalid multicast payloads are ignored. */ }
        }
    }

    private static bool IsLocalAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)) return true;
        if (address.AddressFamily != AddressFamily.InterNetwork) return address.IsIPv6LinkLocal || address.IsIPv6UniqueLocal;
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) ||
               (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254);
    }

    public async ValueTask DisposeAsync()
    {
        if (_cancellation is null) return;
        _cancellation.Cancel();
        _udp.Dispose();
        _receiver.Dispose();
        var loops = new[] { _announceLoop, _receiveLoop }.Where(x => x is not null).Cast<Task>().ToArray();
        try { await Task.WhenAll(loops); } catch (OperationCanceledException) { } catch (ObjectDisposedException) { }
        _cancellation.Dispose();
        _announceLoop = null;
        _receiveLoop = null;
    }
}
