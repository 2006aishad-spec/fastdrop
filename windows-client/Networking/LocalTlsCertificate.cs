using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace FastDrop.Windows.Networking;

public sealed class LocalTlsCertificate
{
    public X509Certificate2 Certificate { get; }
    public string Sha256Fingerprint { get; }

    public LocalTlsCertificate()
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FastDrop");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "device-tls.pfx");
        Certificate = File.Exists(path) ? new X509Certificate2(path) : CreateAndPersist(path);
        Sha256Fingerprint = Convert.ToHexString(SHA256.HashData(Certificate.RawData)).ToLowerInvariant();
    }

    private static X509Certificate2 CreateAndPersist(string path)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=XTransfer Offline Local Device", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, false));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, false));
        var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(2));
        var persisted = new X509Certificate2(certificate.Export(X509ContentType.Pfx));
        File.WriteAllBytes(path, persisted.Export(X509ContentType.Pfx));
        return persisted;
    }
}
