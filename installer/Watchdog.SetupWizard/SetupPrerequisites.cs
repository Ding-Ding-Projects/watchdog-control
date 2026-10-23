using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO.Compression;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Watchdog.SetupWizard;

internal sealed class SetupPrerequisites(HttpClient http)
{
    private const string AppInstallerFamily = "Microsoft.DesktopAppInstaller_8wekyb3d8bbwe";
    private const string AppInstallerName = "Microsoft.DesktopAppInstaller";
    private const string WingetRepository = "microsoft/winget-cli";
    private const string BundleName = "Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle";
    private const string DependencyArchiveName = "DesktopAppInstaller_Dependencies.zip";
    private const string DependencyManifestName = "DesktopAppInstaller_Dependencies.json";
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(30);
    private const long BundleLimit = 350_000_000;
    private const long DependencyArchiveLimit = 150_000_000;
    private const long DependencyManifestLimit = 16_384;
    private const long ExpandedDependenciesLimit = 120_000_000;

    public static string? FindWinGet()
    {
        var appAlias = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Microsoft", "WindowsApps", "winget.exe");
        return File.Exists(appAlias) ? appAlias : null;
    }

    public async Task<string> EnsureWinGetAvailableAsync(Action<string> progress, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitOperatingSystem)
            throw new InvalidOperationException("Automatic setup requires a 64-bit Windows host.");

        var package = await ReadAppInstallerPackageAsync(cancellationToken);
        if (package is not null)
        {
            ValidateAppInstallerPublisher(package);
            var executable = FindWinGet();
            if (executable is not null && await IsWinGetReadyAsync(executable, cancellationToken)) return executable;

            progress("App Installer is present for this user. Requesting its supported WinGet registration.");
            await TryRegisterAppInstallerAsync(cancellationToken);
            executable = FindWinGet();
            if (executable is not null && await IsWinGetReadyAsync(executable, cancellationToken)) return executable;
        }
        else
        {
            progress("Checking whether Windows can register its built-in App Installer package.");
            await TryRegisterAppInstallerAsync(cancellationToken);
            package = await ReadAppInstallerPackageAsync(cancellationToken);
            if (package is not null)
            {
                ValidateAppInstallerPublisher(package);
                var executable = FindWinGet();
                if (executable is not null && await IsWinGetReadyAsync(executable, cancellationToken)) return executable;
            }
        }

        progress("App Installer is not registered. Acquiring the signed stable Microsoft package and its verified x64 dependencies.");
        await InstallAppInstallerFromOfficialReleaseAsync(progress, cancellationToken);

        package = await ReadAppInstallerPackageAsync(cancellationToken);
        if (package is null) throw new InvalidOperationException("Windows reported package installation complete, but App Installer is not registered for this user.");
        ValidateAppInstallerPublisher(package);

        await TryRegisterAppInstallerAsync(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var winget = FindWinGet();
        if (winget is null || !await IsWinGetReadyAsync(winget, cancellationToken))
            throw new InvalidOperationException("App Installer was added for this user, but its WinGet command did not become available. Setup stopped before installing Docker Desktop or changing the Watchdog Control service.");

        progress("App Installer and WinGet are ready for this user.");
        return winget;
    }

    private static string GetPowerShellPath()
    {
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell", "v1.0", "powershell.exe");
        if (!File.Exists(path)) throw new InvalidOperationException("The built-in Windows PowerShell executable is unavailable, so App Installer cannot be provisioned automatically.");
        return path;
    }

    private async Task<AppInstallerPackage?> ReadAppInstallerPackageAsync(CancellationToken cancellationToken)
    {
        const string script = """
            $ErrorActionPreference = 'Stop'
            $package = Get-AppxPackage -Name 'Microsoft.DesktopAppInstaller' -ErrorAction SilentlyContinue |
                Where-Object { $_.PackageFamilyName -eq 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' } |
                Sort-Object Version -Descending | Select-Object -First 1
            if ($null -eq $package) { exit 0 }
            [pscustomobject]@{
                PackageFamilyName = $package.PackageFamilyName
                Publisher = $package.Publisher
                Version = $package.Version.ToString()
            } | ConvertTo-Json -Compress
            """;
        var result = await RunPowerShellAsync(script, ProbeTimeout, cancellationToken);
        if (result.ExitCode != 0) throw new InvalidOperationException("Windows could not read the current user's App Installer package state.");
        var json = result.StandardOutput.Trim();
        if (json.Length == 0) return null;

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            return new AppInstallerPackage(
                ReadString(root, "PackageFamilyName"),
                ReadString(root, "Publisher"),
                ReadString(root, "Version"));
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException("Windows returned malformed App Installer package metadata.", ex);
        }
    }

    private static void ValidateAppInstallerPublisher(AppInstallerPackage package)
    {
        if (!string.Equals(package.PackageFamilyName, AppInstallerFamily, StringComparison.Ordinal) ||
            !package.Publisher.StartsWith("CN=Microsoft Corporation,", StringComparison.OrdinalIgnoreCase) ||
            !package.Publisher.Contains("O=Microsoft Corporation", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The registered App Installer package does not have the expected Microsoft package identity.");
    }

    private async Task TryRegisterAppInstallerAsync(CancellationToken cancellationToken)
    {
        const string script = """
            $ErrorActionPreference = 'Stop'
            Add-AppxPackage -RegisterByFamilyName -MainPackage 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' -ErrorAction Stop
            """;
        try
        {
            var result = await RunPowerShellAsync(script, ProbeTimeout, cancellationToken);
            if (result.ExitCode != 0) return;
            for (var attempt = 0; attempt < 10; attempt++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (FindWinGet() is not null) return;
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
            }
        }
        catch (System.ComponentModel.Win32Exception) { }
        catch (InvalidOperationException) when (!cancellationToken.IsCancellationRequested) { }
    }

    private async Task<bool> IsWinGetReadyAsync(string executable, CancellationToken cancellationToken)
    {
        try
        {
            var result = await CommandRunner.RunAsync(
                executable,
                ["--version"],
                null,
                null,
                ProbeTimeout,
                cancellationToken,
                null,
                string.Empty);
            return result.ExitCode == 0 && Regex.IsMatch(result.StandardOutput, @"(?m)^v?\d+\.\d+\.\d+", RegexOptions.CultureInvariant);
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or TimeoutException)
        {
            return false;
        }
    }

    private async Task InstallAppInstallerFromOfficialReleaseAsync(Action<string> progress, CancellationToken cancellationToken)
    {
        var release = await ReadLatestStableReleaseAsync(cancellationToken);
        var cacheRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Ding-Ding-Projects", "WatchdogControlSetup", "cache", "app-installer", release.Tag);
        Directory.CreateDirectory(cacheRoot);

        var bundle = GetAsset(release, BundleName, BundleLimit);
        var dependencyArchive = GetAsset(release, DependencyArchiveName, DependencyArchiveLimit);
        var dependencyManifest = GetAsset(release, DependencyManifestName, DependencyManifestLimit);
        var bundlePath = await DownloadVerifiedAssetAsync(bundle, cacheRoot, progress, cancellationToken);
        var archivePath = await DownloadVerifiedAssetAsync(dependencyArchive, cacheRoot, progress, cancellationToken);
        var manifestPath = await DownloadVerifiedAssetAsync(dependencyManifest, cacheRoot, progress, cancellationToken);
        var dependencies = await ExtractX64DependenciesAsync(archivePath, manifestPath, cacheRoot, cancellationToken);

        cancellationToken.ThrowIfCancellationRequested();
        progress("Installing the verified App Installer package for the current user. Windows package deployment will finish before setup continues.");
        await AddAppInstallerPackageAsync(bundlePath, dependencies, cancellationToken);
        var package = await ReadAppInstallerPackageAsync(cancellationToken);
        if (package is null) throw new InvalidOperationException("Windows returned from package deployment without registering App Installer for this user.");
        ValidateAppInstallerPublisher(package);
        if (!IsExpectedReleaseVersion(package.Version, release.Tag))
            throw new InvalidDataException("Windows registered an App Installer version different from the verified stable release.");

        TryDeleteDirectory(cacheRoot);
    }

    private async Task<StableRelease> ReadLatestStableReleaseAsync(CancellationToken cancellationToken)
    {
        var address = new Uri($"https://api.github.com/repos/{WingetRepository}/releases/latest");
        using var response = await http.GetAsync(address, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength is > 2_000_000)
            throw new InvalidDataException("The official App Installer release metadata exceeded its safe size limit.");

        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (ReadBool(root, "draft") || ReadBool(root, "prerelease"))
            throw new InvalidDataException("The Microsoft release endpoint did not return a stable, published release.");
        var tag = ReadString(root, "tag_name");
        if (!Regex.IsMatch(tag, @"^v\d+\.\d+\.\d+$", RegexOptions.CultureInvariant))
            throw new InvalidDataException("The Microsoft App Installer release tag is not a stable version tag.");
        if (!root.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("The Microsoft stable release has no readable asset list.");

        return new StableRelease(tag, assets.Clone());
    }

    private static ReleaseAsset GetAsset(StableRelease release, string name, long sizeLimit)
    {
        var matches = release.Assets.EnumerateArray()
            .Where(asset => string.Equals(ReadString(asset, "name"), name, StringComparison.Ordinal))
            .ToArray();
        if (matches.Length != 1) throw new InvalidDataException($"The verified Microsoft stable release must contain exactly one {name} asset.");
        var item = matches[0];
        var size = item.TryGetProperty("size", out var sizeNode) && sizeNode.TryGetInt64(out var parsedSize) ? parsedSize : -1;
        var digest = ReadString(item, "digest");
        var download = ReadString(item, "browser_download_url");
        var expectedUrl = $"https://github.com/{WingetRepository}/releases/download/{release.Tag}/{name}";
        if (size <= 0 || size > sizeLimit || !Regex.IsMatch(digest, @"^sha256:[0-9a-fA-F]{64}$", RegexOptions.CultureInvariant) ||
            !Uri.TryCreate(download, UriKind.Absolute, out var uri) || !string.Equals(uri.AbsoluteUri, expectedUrl, StringComparison.Ordinal))
            throw new InvalidDataException($"The {name} asset has missing, oversized or unexpected official release metadata.");

        return new ReleaseAsset(name, size, digest[7..].ToLowerInvariant(), uri);
    }

    private async Task<string> DownloadVerifiedAssetAsync(ReleaseAsset asset, string directory, Action<string> progress, CancellationToken cancellationToken)
    {
        var path = Path.Combine(directory, asset.Name);
        if (File.Exists(path))
        {
            if (await HasExpectedHashAsync(path, asset.Size, asset.Sha256, cancellationToken))
            {
                progress($"Reusing the previously verified {asset.Name} download.");
                return path;
            }
            File.Delete(path);
        }

        progress($"Downloading official Microsoft asset {asset.Name} ({asset.Size:N0} bytes).");
        var partial = path + ".partial";
        try
        {
            using var response = await http.GetAsync(asset.DownloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is long responseSize && responseSize != asset.Size)
                throw new InvalidDataException($"The {asset.Name} download length did not match release metadata.");

            await using var input = await response.Content.ReadAsStreamAsync(cancellationToken);
            await using var output = new FileStream(partial, FileMode.Create, FileAccess.Write, FileShare.None, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var buffer = new byte[128 * 1024];
            long total = 0;
            var lastReportedPercent = 0;
            while (true)
            {
                var read = await input.ReadAsync(buffer.AsMemory(), cancellationToken);
                if (read == 0) break;
                total += read;
                if (total > asset.Size) throw new InvalidDataException($"The {asset.Name} download exceeded its declared size.");
                hash.AppendData(buffer, 0, read);
                await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                var percent = (int)Math.Min(100, total * 100 / asset.Size);
                if (percent >= lastReportedPercent + 10)
                {
                    lastReportedPercent = percent;
                    progress($"Downloading {asset.Name}: {percent}%.");
                }
            }
            await output.FlushAsync(cancellationToken);
            if (total != asset.Size) throw new InvalidDataException($"The {asset.Name} download ended before its declared size.");
            var actualHash = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
            if (!string.Equals(actualHash, asset.Sha256, StringComparison.Ordinal))
                throw new InvalidDataException($"The {asset.Name} download did not match the release SHA-256 digest.");
            File.Move(partial, path, true);
            return path;
        }
        finally
        {
            try { if (File.Exists(partial)) File.Delete(partial); } catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static async Task<bool> HasExpectedHashAsync(string path, long expectedSize, string expectedHash, CancellationToken cancellationToken)
    {
        var info = new FileInfo(path);
        if (info.Length != expectedSize) return false;
        await using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        var hash = await SHA256.HashDataAsync(input, cancellationToken);
        return string.Equals(Convert.ToHexString(hash), expectedHash, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<IReadOnlyList<string>> ExtractX64DependenciesAsync(string archivePath, string manifestPath, string cacheRoot, CancellationToken cancellationToken)
    {
        await using var manifestStream = File.OpenRead(manifestPath);
        using var manifest = await JsonDocument.ParseAsync(manifestStream, cancellationToken: cancellationToken);
        if (!manifest.RootElement.TryGetProperty("Dependencies", out var dependencyArray) || dependencyArray.ValueKind != JsonValueKind.Array || dependencyArray.GetArrayLength() is < 1 or > 10)
            throw new InvalidDataException("The signed-release dependency manifest has an unsupported shape.");

        var dependencies = new List<PackageDependency>();
        foreach (var item in dependencyArray.EnumerateArray())
        {
            var name = ReadString(item, "Name");
            var version = ReadString(item, "Version");
            if (!Regex.IsMatch(name, @"^Microsoft\.[A-Za-z0-9.]+$", RegexOptions.CultureInvariant) ||
                !Regex.IsMatch(version, @"^\d+(?:\.\d+){1,3}$", RegexOptions.CultureInvariant) ||
                dependencies.Any(dependency => string.Equals(dependency.Name, name, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidDataException("The Microsoft dependency manifest contains an unexpected package identity or version.");
            dependencies.Add(new PackageDependency(name, version));
        }

        var extractionRoot = Path.Combine(cacheRoot, "x64-dependencies");
        Directory.CreateDirectory(extractionRoot);
        using var archive = ZipFile.OpenRead(archivePath);
        if (archive.Entries.Count is < 1 or > 50 || archive.Entries.Sum(entry => entry.Length) > ExpandedDependenciesLimit)
            throw new InvalidDataException("The Microsoft dependency archive has an unexpected number of files or expanded size.");
        foreach (var entry in archive.Entries)
        {
            var match = Regex.Match(entry.FullName, @"^(?<arch>arm64|x64|x86)/Microsoft\.[A-Za-z0-9._-]+_[0-9.]+_(?<fileArch>arm64|x64|x86)\.appx$", RegexOptions.CultureInvariant);
            if (!match.Success || !string.Equals(match.Groups["arch"].Value, match.Groups["fileArch"].Value, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The Microsoft dependency archive contains an unexpected path.");
        }

        var extracted = new List<string>(dependencies.Count);
        foreach (var dependency in dependencies)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var fileName = $"{dependency.Name}_{dependency.Version}_x64.appx";
            var entry = archive.GetEntry($"x64/{fileName}") ?? throw new InvalidDataException($"The verified dependency archive is missing {fileName}.");
            if (entry.Length <= 0 || entry.Length > ExpandedDependenciesLimit)
                throw new InvalidDataException($"The verified {fileName} package has an unsupported size.");
            var destination = Path.Combine(extractionRoot, fileName);
            await using var input = entry.Open();
            await using var output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            await input.CopyToAsync(output, 64 * 1024, cancellationToken);
            if (output.Length != entry.Length) throw new InvalidDataException($"The extracted {fileName} package length did not match the archive entry.");
            extracted.Add(destination);
        }
        return extracted;
    }

    private static async Task AddAppInstallerPackageAsync(string bundlePath, IReadOnlyList<string> dependencies, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var dependencyList = string.Join(", ", dependencies.Select(PowerShellLiteral));
        var script = $"$ErrorActionPreference = 'Stop'\n$dependencies = @({dependencyList})\nAdd-AppxPackage -Path {PowerShellLiteral(bundlePath)} -DependencyPath $dependencies -ErrorAction Stop\n";
        var start = new ProcessStartInfo(GetPowerShellPath())
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
        };
        start.ArgumentList.Add("-NoLogo");
        start.ArgumentList.Add("-NoProfile");
        start.ArgumentList.Add("-NonInteractive");
        start.ArgumentList.Add("-EncodedCommand");
        start.ArgumentList.Add(Convert.ToBase64String(Encoding.Unicode.GetBytes(script)));

        using var process = new Process { StartInfo = start, EnableRaisingEvents = true };
        if (!process.Start()) throw new InvalidOperationException("Windows could not start App Installer package deployment.");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync(CancellationToken.None);
        await Task.WhenAll(stdout, stderr);
        if (process.ExitCode != 0)
        {
            var detail = SafeSummary(stderr.Result);
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail)
                ? $"Windows package deployment returned exit code {process.ExitCode}. No Watchdog Control service changes were made."
                : $"Windows package deployment returned exit code {process.ExitCode}: {detail}");
        }
    }

    private static Task<CommandResult> RunPowerShellAsync(string script, TimeSpan timeout, CancellationToken cancellationToken)
    {
        return CommandRunner.RunAsync(
            GetPowerShellPath(),
            ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Convert.ToBase64String(Encoding.Unicode.GetBytes(script))],
            null,
            null,
            timeout,
            cancellationToken,
            null,
            string.Empty);
    }

    private static bool IsExpectedReleaseVersion(string installedVersion, string releaseTag)
    {
        if (!Version.TryParse(installedVersion, out var installed) || !Version.TryParse(releaseTag.TrimStart('v'), out var expected)) return false;
        return installed.Major == expected.Major && installed.Minor == expected.Minor && installed.Build == expected.Build;
    }

    private static string PowerShellLiteral(string value) => "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";

    private static string ReadString(JsonElement node, string name) =>
        node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static bool ReadBool(JsonElement node, string name) =>
        node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    private static string SafeSummary(string? value)
    {
        var line = (value ?? string.Empty).Replace('\r', ' ').Replace('\n', ' ').Trim();
        return line.Length > 320 ? line[..320] : line;
    }

    private static void TryDeleteDirectory(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, recursive: true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private sealed record StableRelease(string Tag, JsonElement Assets);
    private sealed record ReleaseAsset(string Name, long Size, string Sha256, Uri DownloadUrl);
    private sealed record PackageDependency(string Name, string Version);
    private sealed record AppInstallerPackage(string PackageFamilyName, string Publisher, string Version);
}
