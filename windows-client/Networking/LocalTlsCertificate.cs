using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace FastDrop.Windows.Networking;

public sealed class LocalTlsCertificate : IDisposable
{
    public X509Certificate2 Certificate { get; }
    public string Sha256Fingerprint { get; }

    public LocalTlsCertificate(string? storageDirectory = null)
    {
        var folder = storageDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FastDrop");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "device-tls.pfx");
        Certificate = File.Exists(path) ? LoadPersisted(path) : CreateAndPersist(path);
        Sha256Fingerprint = Convert.ToHexString(SHA256.HashData(Certificate.RawData)).ToLowerInvariant();
    }

    private static X509Certificate2 LoadPersisted(string path)
    {
        try
        {
            return new X509Certificate2(path, (string?)null, X509KeyStorageFlags.PersistKeySet);
        }
        catch (CryptographicException)
        {
            // A damaged local certificate must not prevent the offline receiver from starting.
            File.Delete(path);
            return CreateAndPersist(path);
        }
    }

    private static X509Certificate2 CreateAndPersist(string path)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=XTransfer Offline Local Device",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, false));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, false));

        using var certificate = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(2));

        var temporaryPath = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(temporaryPath, certificate.Export(X509ContentType.Pfx));
            File.Move(temporaryPath, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }

        // Import from the PFX file with PersistKeySet. SslStream on Windows requires
        // a persisted private key for this server-certificate path.
        return new X509Certificate2(path, (string?)null, X509KeyStorageFlags.PersistKeySet);
    }

    public void Dispose() => Certificate.Dispose();
}
