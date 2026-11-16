using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FastDrop.Windows.Protocol;

namespace FastDrop.Windows.Networking;

public sealed class LocalDiscoveryService : IAsyncDisposable
{
    private readonly string _deviceId = $"win-{Environment.MachineName.ToLowerInvariant()}";
    private readonly string _deviceName;
    private readonly UdpClient _udp = new();
    private CancellationTokenSource? _cancellation;
    private Task? _loop;

    public LocalDiscoveryService(string deviceName)
    {
        _deviceName = deviceName;
    }

    public event Action<DiscoveryAnnouncement>? AnnouncementSent;

    public void Start()
    {
        if (_loop is not null) return;
        _cancellation = new CancellationTokenSource();
        _loop = Task.Run(() => AnnounceLoopAsync(_cancellation.Token));
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
                    Fd01Protocol.TransferPort);
                var payload = JsonSerializer.SerializeToUtf8Bytes(announcement, Fd01Protocol.JsonOptions);
                await _udp.SendAsync(payload, endpoint, cancellationToken);
                AnnouncementSent?.Invoke(announcement);
                await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown.
        }
        catch (SocketException)
        {
            // The UI keeps the local-only state and can retry on the next start.
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_cancellation is null) return;
        _cancellation.Cancel();
        _udp.Dispose();
        if (_loop is not null)
        {
            try { await _loop; } catch (OperationCanceledException) { }
        }
        _cancellation.Dispose();
    }
}
