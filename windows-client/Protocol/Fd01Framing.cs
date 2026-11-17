using System.Text;

namespace FastDrop.Windows.Protocol;

public sealed class Fd01Reader
{
    private readonly Stream _stream;
    private readonly byte[] _oneByte = new byte[1];

    public Fd01Reader(Stream stream) => _stream = stream;

    public async Task<string?> ReadLineAsync(CancellationToken cancellationToken)
    {
        var bytes = new List<byte>(128);
        while (true)
        {
            var count = await _stream.ReadAsync(_oneByte.AsMemory(), cancellationToken);
            if (count == 0) return bytes.Count == 0 ? null : throw new EndOfStreamException();
            if (_oneByte[0] == (byte)'\n') break;
            if (_oneByte[0] != (byte)'\r') bytes.Add(_oneByte[0]);
            if (bytes.Count > Fd01Protocol.MaxLineBytes) throw new InvalidDataException("Mensagem de controlo demasiado grande.");
        }
        return Encoding.UTF8.GetString(bytes.ToArray());
    }

    public async Task ReadExactlyAsync(Memory<byte> buffer, CancellationToken cancellationToken)
    {
        var read = 0;
        while (read < buffer.Length)
        {
            var count = await _stream.ReadAsync(buffer[read..], cancellationToken);
            if (count == 0) throw new EndOfStreamException();
            read += count;
        }
    }
}

public sealed class Fd01Writer
{
    private readonly Stream _stream;

    public Fd01Writer(Stream stream) => _stream = stream;

    public async Task WriteMessageAsync<T>(string command, T value, CancellationToken cancellationToken)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(value, Fd01Protocol.JsonOptions);
        var line = Encoding.UTF8.GetBytes(command + " " + json + "\n");
        if (line.Length > Fd01Protocol.MaxLineBytes) throw new InvalidDataException("Mensagem demasiado grande.");
        await _stream.WriteAsync(line, cancellationToken);
        await _stream.FlushAsync(cancellationToken);
    }
}
