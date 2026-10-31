$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This focused Schannel check requires Windows and PowerShell 7.' }
if ([Environment]::Version.Major -lt 9) { throw 'X509CertificateLoader requires .NET 9 or newer.' }
$repository = Split-Path -Parent $PSScriptRoot
$program = [IO.File]::ReadAllText((Join-Path $repository 'src/Watchdog.Web/Program.cs'))
$match = [regex]::Match($program, '(?s)static X509Certificate2 LoadServerCertificate\(string certificatePath, string passwordPath\)\r?\n\{.*?\r?\n\}')
if (-not $match.Success) { throw 'The production TLS loader was not found.' }
$loader = $match.Value.Replace('static X509Certificate2', 'public static X509Certificate2')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('watchdog-tls-check-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temporary) | Out-Null
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $temporary /inheritance:r /grant:r ($identity + ':(OI)(CI)F') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The temporary certificate folder could not be protected.' }
    $code = @"
using System;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Threading;
using System.Threading.Tasks;
public static class NativeTlsSourceCheck
{
$loader
    public static async Task Exercise(string directory)
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder();
        names.AddDnsName("localhost"); names.AddIpAddress(IPAddress.Loopback);
        request.CertificateExtensions.Add(names.Build());
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        using var original = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
        var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var certificatePath = Path.Combine(directory, "test.pfx");
        var passwordPath = Path.Combine(directory, "password");
        File.WriteAllBytes(certificatePath, original.Export(X509ContentType.Pfx, password));
        File.WriteAllText(passwordPath, password);
        using var certificate = LoadServerCertificate(certificatePath, passwordPath);
        using var publicCertificate = X509CertificateLoader.LoadCertificate(original.Export(X509ContentType.Cert));
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var serverTask = Serve(listener, certificate, timeout.Token);
            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, ((IPEndPoint)listener.LocalEndpoint).Port, timeout.Token);
            using var stream = new SslStream(client.GetStream());
            var chain = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust, RevocationMode = X509RevocationMode.NoCheck };
            chain.CustomTrustStore.Add(publicCertificate);
            await stream.AuthenticateAsClientAsync(new SslClientAuthenticationOptions { TargetHost = "localhost", CertificateChainPolicy = chain }, timeout.Token);
            await stream.WriteAsync(new byte[] { 42 }, timeout.Token);
            var reply = new byte[1];
            if (await stream.ReadAsync(reply, timeout.Token) != 1 || reply[0] != 43) throw new InvalidOperationException("TLS round trip did not complete.");
            await serverTask;
        }
        finally { listener.Stop(); }
    }
    private static async Task Serve(TcpListener listener, X509Certificate2 certificate, CancellationToken cancellation)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellation);
        using var stream = new SslStream(client.GetStream());
        await stream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = certificate }, cancellation);
        var input = new byte[1];
        if (await stream.ReadAsync(input, cancellation) != 1 || input[0] != 42) throw new InvalidOperationException("TLS request did not complete.");
        await stream.WriteAsync(new byte[] { 43 }, cancellation);
    }
}
"@
    Add-Type -TypeDefinition $code
    [NativeTlsSourceCheck]::Exercise($temporary).GetAwaiter().GetResult() | Out-Null
    Write-Output 'PASS: production certificate loader completed a strict-trust Schannel TLS round trip.'
} finally {
    $resolved = [IO.Path]::GetFullPath($temporary)
    $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not [IO.Path]::GetFileName($resolved).StartsWith('watchdog-tls-check-')) { throw 'Temporary cleanup destination verification failed.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
