using System.Security.Cryptography;
using System.Text;
using FastDrop.Windows.Protocol;

namespace FastDrop.Windows.Networking;

public sealed class PairingService
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private readonly object _gate = new();
    private readonly TimeSpan _ticketLifetime = TimeSpan.FromMinutes(5);
    private readonly Dictionary<string, (int Failures, DateTimeOffset BlockedUntil)> _failures = new();
    private PairingTicket? _ticket;
    private bool _consumed;
    private bool _pairIssued;

    public string CurrentCode
    {
        get { lock (_gate) return _ticket?.TokenCode ?? "------"; }
    }

    public PairingService()
    {
        Rotate("pending");
    }

    public void Rotate(string deviceId)
    {
        lock (_gate) RotateUnsafe(deviceId);
    }

    public void RotateIfCurrentSession(string sessionId)
    {
        lock (_gate)
        {
            if (_ticket is null || !string.Equals(_ticket.SessionId, sessionId, StringComparison.Ordinal)) return;
            RotateUnsafe("pending");
        }
    }

    private void RotateUnsafe(string deviceId)
    {
        var sessionId = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        _ticket = new PairingTicket(deviceId, sessionId, token, DateTimeOffset.UtcNow + _ticketLifetime);
        _ticket = _ticket with { TokenCode = CreateCode() };
        _consumed = false;
        _pairIssued = false;
        _failures.Clear();
    }

    public bool TryPair(PairRequest request, out PairResponse response)
    {
        lock (_gate)
        {
            response = new PairResponse(false, "", "", "Pedido rejeitado.");
            if (_ticket is null || DateTimeOffset.UtcNow >= _ticket.ExpiresAt)
            {
                response = response with { Message = "O código de emparelhamento expirou." };
                return false;
            }

            if (_pairIssued)
            {
                response = response with { Message = "Este código já foi utilizado. Gera um novo código." };
                return false;
            }

            if (string.IsNullOrWhiteSpace(request.DeviceId) || request.DeviceId.Length > 128 ||
                string.IsNullOrWhiteSpace(request.Code) || request.Code.Length != 6 ||
                string.IsNullOrWhiteSpace(request.Nonce) || request.Nonce.Length > 128)
            {
                response = response with { Message = "Pedido de emparelhamento inválido." };
                RegisterFailure(request.DeviceId);
                return false;
            }

            if (_failures.TryGetValue(request.DeviceId, out var failure) && failure.BlockedUntil > DateTimeOffset.UtcNow)
            {
                response = response with { Message = "Demasiadas tentativas. Tenta novamente mais tarde." };
                return false;
            }

            var expected = Encoding.UTF8.GetBytes(_ticket.TokenCode);
            var actual = Encoding.UTF8.GetBytes(request.Code.ToUpperInvariant());
            var valid = actual.Length == expected.Length && CryptographicOperations.FixedTimeEquals(actual, expected);
            if (!valid)
            {
                response = response with { Message = "Código de emparelhamento incorreto." };
                RegisterFailure(request.DeviceId);
                return false;
            }

            _ticket = _ticket with { DeviceId = request.DeviceId };
            _pairIssued = true;
            response = new PairResponse(true, _ticket.SessionId, _ticket.TokenCode, "Emparelhamento aceite.", _ticket.Token);
            return true;
        }
    }

    public bool Authorize(PairAuth auth)
    {
        lock (_gate)
        {
            if (_ticket is null || _consumed || DateTimeOffset.UtcNow >= _ticket.ExpiresAt) return false;
            if (!string.Equals(auth.SessionId, _ticket.SessionId, StringComparison.Ordinal)) return false;
            var expected = Encoding.UTF8.GetBytes(_ticket.Token);
            var actual = Encoding.UTF8.GetBytes(auth.Token ?? "");
            var valid = actual.Length == expected.Length && CryptographicOperations.FixedTimeEquals(actual, expected);
            if (valid) _consumed = true;
            return valid;
        }
    }

    public bool IsDeviceForSession(string sessionId, string deviceId)
    {
        lock (_gate)
        {
            return _ticket is not null && string.Equals(_ticket.SessionId, sessionId, StringComparison.Ordinal) &&
                   string.Equals(_ticket.DeviceId, deviceId, StringComparison.Ordinal);
        }
    }

    private void RegisterFailure(string deviceId)
    {
        if (!string.IsNullOrWhiteSpace(deviceId))
        {
            _failures.TryGetValue(deviceId, out var current);
            var failures = current.Failures + 1;
            _failures[deviceId] = (failures, failures >= 5 ? DateTimeOffset.UtcNow.AddMinutes(1) : DateTimeOffset.MinValue);
        }
    }

    private static string CreateCode()
    {
        Span<byte> random = stackalloc byte[6];
        RandomNumberGenerator.Fill(random);
        var chars = new char[6];
        for (var i = 0; i < chars.Length; i++) chars[i] = Alphabet[random[i] % Alphabet.Length];
        return new string(chars);
    }
}

internal sealed record PairingTicket(string DeviceId, string SessionId, string Token, DateTimeOffset ExpiresAt)
{
    public string TokenCode { get; init; } = "------";
}
