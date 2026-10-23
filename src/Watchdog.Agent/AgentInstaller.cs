using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Runtime.InteropServices;
using TimeoutException = System.TimeoutException;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using System.ServiceProcess;

namespace Watchdog.Agent;

public static class AgentInstaller
{
    private const int ServiceWaitSeconds = 30;
    private static readonly string InstallDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Ding-Ding Projects", "Watchdog Control");
    private static readonly string InstalledExecutable = Path.Combine(InstallDirectory, "watchdog-agent.exe");
    private static readonly string TokenPath = Path.Combine(AgentConfigurationStore.DataDirectory, "agent-token.bin");
    private static readonly string EnrollmentCodePath = Path.Combine(AgentConfigurationStore.DataDirectory, "enrollment-code");

    public static async Task<int> InstallAsync(string[] arguments)
    {
        try
        {
            RequireAdministrator();
            RequireSupportedWindows();
            var options = ParseArguments(arguments);
            var source = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(source) || !File.Exists(source)) throw new InvalidOperationException("The setup assistant could not identify the downloaded host agent executable.");

            var existing = AgentConfigurationStore.Load();
            var store = new AgentConfigurationStore();
            var existingToken = store.ReadToken();
            if (existing is not null && File.Exists(existing.TokenPath) && existingToken is null)
                throw new InvalidDataException("The existing protected agent credential could not be read. The prior installation was left unchanged.");

            var code = ReadEnrollmentCode(options.EnrollmentCodePath);
            AgentConfigurationStore.EnsureProtectedDirectory(AgentConfigurationStore.DataDirectory);
            EnsureInstallDirectory();
            EnsureServiceOwnedByThisProduct();
            var configuration = new AgentConfiguration(
                options.ControllerUrl.AbsoluteUri,
                options.CertificateSha256.ToLowerInvariant(),
                existing?.AgentId ?? Guid.NewGuid().ToString("N"),
                Environment.MachineName,
                TokenPath,
                EnrollmentCodePath);

            var wasInstalled = File.Exists(InstalledExecutable) && existing is not null;
            var previousExecutable = wasInstalled
                ? InstalledExecutable + ".previous-" + DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".exe"
                : null;
            var previousConfig = wasInstalled ? AgentConfigurationStore.ConfigurationPath + ".previous" : null;
            if (wasInstalled) File.Copy(AgentConfigurationStore.ConfigurationPath, previousConfig!, overwrite: true);
            StopExistingServiceIfPresent();

            var staged = InstalledExecutable + ".new-" + Guid.NewGuid().ToString("N");
            try
            {
                File.Copy(source, staged, overwrite: false);
                if (new FileInfo(staged).Length < 10 * 1024 * 1024) throw new InvalidDataException("The published host agent is smaller than the accepted single-file package range.");
                if (File.Exists(InstalledExecutable) && previousExecutable is not null)
                    File.Move(InstalledExecutable, previousExecutable, overwrite: false);
                File.Move(staged, InstalledExecutable, overwrite: true);

                if (existingToken is null)
                    File.WriteAllText(EnrollmentCodePath, code, new UTF8Encoding(false));
                store.Save(configuration);
                await RegisterOrUpdateServiceAsync();
                StartService();
                await WaitForEnrolledServiceAsync(TimeSpan.FromSeconds(90));
                Console.WriteLine("The Windows host agent installed and enrolled with the fingerprint-pinned LAN controller.");
                return 0;
            }
            catch (Exception installFailure)
            {
                if (wasInstalled && previousExecutable is not null && previousConfig is not null && File.Exists(previousExecutable))
                {
                    try
                    {
                        StopExistingServiceIfPresent();
                        File.Copy(previousExecutable, InstalledExecutable, overwrite: true);
                        File.Copy(previousConfig, AgentConfigurationStore.ConfigurationPath, overwrite: true);
                        StartService();
                        Console.Error.WriteLine("The update could not be verified. The prior agent files were restored and its service was started.");
                    }
                    catch (Exception restoreFailure)
                    {
                        Console.Error.WriteLine($"Agent update failed ({installFailure.GetType().Name}) and rollback could not finish ({restoreFailure.GetType().Name}). The prior executable and configuration backups remain in Program Files and ProgramData.");
                    }
                }
                throw;
            }
            finally
            {
                if (File.Exists(staged)) File.Delete(staged);
            }
        }
        catch (Exception exception) when (exception is InvalidOperationException or InvalidDataException or UnauthorizedAccessException or System.ComponentModel.Win32Exception or TimeoutException or IOException or FormatException or System.Security.SecurityException)
        {
            Console.Error.WriteLine($"Host agent setup did not complete: {exception.Message}");
            return 1;
        }
    }

    public static async Task<int> RollbackAsync()
    {
        try
        {
            RequireAdministrator();
            var backup = Directory.Exists(InstallDirectory)
                ? Directory.GetFiles(InstallDirectory, "watchdog-agent.exe.previous-*.exe").OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault()
                : null;
            var previousConfig = AgentConfigurationStore.ConfigurationPath + ".previous";
            if (backup is null || !File.Exists(previousConfig)) throw new InvalidOperationException("A complete previous agent executable and configuration are not available.");
            StopExistingServiceIfPresent();
            File.Copy(backup, InstalledExecutable, overwrite: true);
            File.Copy(previousConfig, AgentConfigurationStore.ConfigurationPath, overwrite: true);
            StartService();
            await WaitForEnrolledServiceAsync(TimeSpan.FromSeconds(90));
            Console.WriteLine("The previous host agent is running with its saved configuration.");
            return 0;
        }
        catch (Exception exception) when (exception is InvalidOperationException or UnauthorizedAccessException or System.ComponentModel.Win32Exception or TimeoutException or IOException or System.Security.SecurityException)
        {
            Console.Error.WriteLine($"Agent rollback did not complete: {exception.Message}");
            return 1;
        }
    }

    private static (Uri ControllerUrl, string CertificateSha256, string EnrollmentCodePath) ParseArguments(string[] arguments)
    {
        if (arguments.Length != 6) throw new InvalidOperationException("Install requires a controller URL, certificate fingerprint, and enrollment-code file.");
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < arguments.Length; index += 2)
        {
            if (arguments[index] is not ("--controller-url" or "--certificate-sha256" or "--enrollment-code-file") ||
                !values.TryAdd(arguments[index], arguments[index + 1]))
                throw new InvalidOperationException("Install accepts only the three documented setup values.");
        }
        if (values.Count != 3 || !values.ContainsKey("--controller-url") || !values.ContainsKey("--certificate-sha256") || !values.ContainsKey("--enrollment-code-file"))
            throw new InvalidOperationException("Install requires all three documented setup values exactly once.");
        if (!Uri.TryCreate(values["--controller-url"], UriKind.Absolute, out var controller) ||
            controller.Scheme != Uri.UriSchemeHttps || controller.UserInfo.Length > 0 || controller.Query.Length > 0 || controller.Fragment.Length > 0 ||
            controller.AbsolutePath != "/" || !IPAddress.TryParse(controller.Host, out var address) || !IsPrivateAddress(address))
            throw new InvalidOperationException("The controller must be an HTTPS LAN address with no path, credentials, query, or fragment.");
        var certificate = values["--certificate-sha256"].Replace(":", string.Empty, StringComparison.Ordinal);
        if (!Regex.IsMatch(certificate, "^[A-Fa-f0-9]{64}$", RegexOptions.CultureInvariant))
            throw new InvalidOperationException("The controller certificate fingerprint must be exactly 64 hexadecimal characters.");
        var enrollmentPath = Path.GetFullPath(values["--enrollment-code-file"]);
        if (!File.Exists(enrollmentPath)) throw new InvalidOperationException("The enrollment-code file does not exist.");
        return (controller, certificate, enrollmentPath);
    }

    private static string ReadEnrollmentCode(string path)
    {
        var info = new FileInfo(path);
        if (info.Length is < 24 or > 256) throw new InvalidDataException("The enrollment-code file size is outside the accepted range.");
        var value = File.ReadAllText(path).Trim();
        if (!Regex.IsMatch(value, "^[A-Za-z0-9_-]{24,256}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("The enrollment-code file format is invalid.");
        return value;
    }

    private static void EnsureInstallDirectory()
    {
        Directory.CreateDirectory(InstallDirectory);
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null), FileSystemRights.ReadAndExecute, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(InstallDirectory).SetAccessControl(security);
    }

    private static void EnsureServiceOwnedByThisProduct()
    {
        using var key = Registry.LocalMachine.OpenSubKey($"SYSTEM\\CurrentControlSet\\Services\\{AgentConfigurationStore.ServiceName}", writable: false);
        if (key is null) return;
        var imagePath = key.GetValue("ImagePath") as string;
        if (string.IsNullOrWhiteSpace(imagePath)) throw new InvalidOperationException("The Windows service name is already in use with an unreadable executable path.");
        var normalized = Environment.ExpandEnvironmentVariables(imagePath).Trim();
        if (normalized.StartsWith('"')) normalized = normalized[1..].Split('"', 2)[0];
        else normalized = normalized.Split(' ', 2)[0];
        if (!string.Equals(Path.GetFullPath(normalized), Path.GetFullPath(InstalledExecutable), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The Watchdog Control service name is already occupied by a different executable. That service was left unchanged.");
    }

    private static void StopExistingServiceIfPresent()
    {
        try
        {
            using var service = new ServiceController(AgentConfigurationStore.ServiceName);
            var status = service.Status;
            if (status == ServiceControllerStatus.Stopped) return;
            if (!service.CanStop) throw new InvalidOperationException("The existing Watchdog Control service cannot be stopped safely for its supported update.");
            service.Stop();
            service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(ServiceWaitSeconds));
        }
        catch (InvalidOperationException exception) when (exception.Message.Contains("service does not exist", StringComparison.OrdinalIgnoreCase))
        {
        }
        catch (System.ComponentModel.Win32Exception exception) when (exception.NativeErrorCode == 1060)
        {
        }
    }

    private static async Task RegisterOrUpdateServiceAsync()
    {
        var binaryPath = $"\"{InstalledExecutable}\" run-service";
        var exists = false;
        try
        {
            using var service = new ServiceController(AgentConfigurationStore.ServiceName);
            _ = service.Status;
            exists = true;
        }
        catch (System.ComponentModel.Win32Exception exception) when (exception.NativeErrorCode == 1060)
        {
        }

        if (exists)
        {
            await RunScAsync("config", AgentConfigurationStore.ServiceName, "binPath=", binaryPath, "start=", "auto", "obj=", "LocalSystem", "DisplayName=", AgentConfigurationStore.ServiceDisplayName);
        }
        else
        {
            await RunScAsync("create", AgentConfigurationStore.ServiceName, "binPath=", binaryPath, "start=", "auto", "obj=", "LocalSystem", "DisplayName=", AgentConfigurationStore.ServiceDisplayName);
        }
        await RunScAsync("description", AgentConfigurationStore.ServiceName, "Collects authenticated host inventory and runs the approved operation catalog.");
    }

    private static void StartService()
    {
        using var service = new ServiceController(AgentConfigurationStore.ServiceName);
        if (service.Status != ServiceControllerStatus.Running) service.Start();
        service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(ServiceWaitSeconds));
    }

    private static async Task WaitForEnrolledServiceAsync(TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow.Add(timeout);
        while (DateTimeOffset.UtcNow < deadline)
        {
            var status = AgentRuntimeStatusStore.Read();
            if (status is { State: "online" } && status.Value.UpdatedAt >= DateTimeOffset.UtcNow.AddMinutes(-2)) return;
            if (status is { State: "revoked" }) throw new InvalidOperationException("The controller rejected the installed agent credential.");
            await Task.Delay(TimeSpan.FromSeconds(1));
        }
        throw new TimeoutException("The agent service started but did not complete its pinned controller handshake within 90 seconds. It remains installed and will retry safely.");
    }

    private static async Task RunScAsync(params string[] arguments)
    {
        var executable = Path.Combine(Environment.SystemDirectory, "sc.exe");
        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = AgentConfigurationStore.DataDirectory
        };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = new Process { StartInfo = start };
        if (!process.Start()) throw new InvalidOperationException("Windows Service Control did not start.");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(deadline.Token); }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            throw new TimeoutException("Windows Service Control did not finish within 20 seconds.");
        }
        var output = (await stdout) + " " + (await stderr);
        if (process.ExitCode != 0) throw new InvalidOperationException("Windows Service Control did not accept the service configuration: " + Limit(output.Trim(), 500));
    }

    private static bool IsPrivateAddress(IPAddress address)
    {
        if (address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork || IPAddress.IsLoopback(address)) return false;
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 || bytes[0] == 172 && bytes[1] is >= 16 and <= 31 || bytes[0] == 192 && bytes[1] == 168;
    }

    private static void RequireAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        if (!principal.IsInRole(WindowsBuiltInRole.Administrator)) throw new InvalidOperationException("Administrator consent is required to register the host management service.");
    }

    private static void RequireSupportedWindows()
    {
        if (Environment.OSVersion.Version < new Version(10, 0, 17763)) throw new InvalidOperationException("The host agent requires Windows 10 version 1809 or newer, or Windows Server 2019 or newer.");
        if (!Environment.Is64BitOperatingSystem) throw new InvalidOperationException("The published host agent supports x64 Windows only.");
    }

    private static string Limit(string value, int maximum) => value.Length <= maximum ? value : value[..maximum];
}
