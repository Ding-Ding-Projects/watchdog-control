using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Watchdog.Agent;

public sealed record AgentConfiguration(
    string ControllerUrl,
    string CertificateSha256,
    string AgentId,
    string DisplayName,
    string TokenPath,
    string EnrollmentCodePath);

public sealed class AgentConfigurationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _dataDirectory = DataDirectory;

    public const string ServiceName = "WatchdogControlAgent";
    public const string ServiceDisplayName = "Watchdog Control Agent";
    public static string DataDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Ding-Ding-Projects", "WatchdogControl");
    public static string ConfigurationPath => Path.Combine(DataDirectory, "agent.json");

    public static AgentConfiguration? Load()
    {
        try
        {
            if (!File.Exists(ConfigurationPath)) return null;
            var configuration = JsonSerializer.Deserialize<AgentConfiguration>(File.ReadAllText(ConfigurationPath), JsonOptions);
            return IsValid(configuration) ? configuration : null;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    public static bool IsValid(AgentConfiguration? value) =>
        value is not null &&
        Uri.TryCreate(value.ControllerUrl, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps && uri.Port is >= 1 and <= 65535 &&
        value.CertificateSha256 is not null && Regex.IsMatch(value.CertificateSha256, "^[a-f0-9]{64}$", RegexOptions.CultureInvariant) &&
        value.AgentId is not null && Regex.IsMatch(value.AgentId, "^[a-f0-9]{32}$", RegexOptions.CultureInvariant) &&
        value.DisplayName is { Length: >= 1 and <= 128 } &&
        value.TokenPath is not null && Path.IsPathFullyQualified(value.TokenPath) &&
        value.EnrollmentCodePath is not null && Path.IsPathFullyQualified(value.EnrollmentCodePath);

    public static void EnsureProtectedDirectory(string directory)
    {
        Directory.CreateDirectory(directory);
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        var system = new System.Security.Principal.SecurityIdentifier(System.Security.Principal.WellKnownSidType.LocalSystemSid, null);
        var administrators = new System.Security.Principal.SecurityIdentifier(System.Security.Principal.WellKnownSidType.BuiltinAdministratorsSid, null);
        security.AddAccessRule(new FileSystemAccessRule(system, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(administrators, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(directory).SetAccessControl(security);
    }

    public void Save(AgentConfiguration configuration)
    {
        if (!IsValid(configuration)) throw new InvalidDataException("The host agent configuration is invalid.");
        EnsureProtectedDirectory(_dataDirectory);
        var temporary = ConfigurationPath + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(configuration, JsonOptions), new UTF8Encoding(false));
        File.Move(temporary, ConfigurationPath, overwrite: true);
    }

    public string? ReadToken()
    {
        var path = Load()?.TokenPath;
        if (path is null || !File.Exists(path)) return null;
        var encrypted = File.ReadAllBytes(path);
        try
        {
            var clear = Dpapi.Unprotect(encrypted);
            try { return Encoding.UTF8.GetString(clear); }
            finally { CryptographicOperations.ZeroMemory(clear); }
        }
        catch (CryptographicException)
        {
            return null;
        }
        finally { CryptographicOperations.ZeroMemory(encrypted); }
    }

    public void WriteToken(string token)
    {
        var current = Load() ?? throw new InvalidOperationException("Agent settings are unavailable.");
        EnsureProtectedDirectory(_dataDirectory);
        var bytes = Encoding.UTF8.GetBytes(token);
        var protectedToken = Dpapi.Protect(bytes);
        try { File.WriteAllBytes(current.TokenPath, protectedToken); }
        finally { CryptographicOperations.ZeroMemory(protectedToken); }
    }

    public void RemoveEnrollmentCode()
    {
        var current = Load();
        if (current is not null && File.Exists(current.EnrollmentCodePath))
        {
            File.Delete(current.EnrollmentCodePath);
        }
    }
}

public static class AgentRuntimeStatusStore
{
    private static readonly string StatusPath = Path.Combine(AgentConfigurationStore.DataDirectory, "runtime-status.json");
    private static readonly object Sync = new();
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static void Write(string state, string detail)
    {
        try
        {
            AgentConfigurationStore.EnsureProtectedDirectory(AgentConfigurationStore.DataDirectory);
            var temporary = StatusPath + ".tmp";
            lock (Sync)
            {
                File.WriteAllText(temporary, JsonSerializer.Serialize(new { state, detail, updatedAt = DateTimeOffset.UtcNow }, Options));
                File.Move(temporary, StatusPath, overwrite: true);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
        }
    }

    public static (string State, DateTimeOffset UpdatedAt)? Read()
    {
        try
        {
            if (!File.Exists(StatusPath)) return null;
            using var document = JsonDocument.Parse(File.ReadAllBytes(StatusPath));
            var root = document.RootElement;
            if (!root.TryGetProperty("state", out var state) || state.ValueKind != JsonValueKind.String ||
                !root.TryGetProperty("updatedAt", out var updated) || !updated.TryGetDateTimeOffset(out var timestamp)) return null;
            return (state.GetString()!, timestamp);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }
}

internal static class Dpapi
{
    private const int LocalMachine = 0x4;

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int Length;
        public IntPtr Data;
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref DataBlob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    public static byte[] Protect(byte[] clear) => Transform(clear, protect: true);
    public static byte[] Unprotect(byte[] encrypted) => Transform(encrypted, protect: false);

    private static byte[] Transform(byte[] source, bool protect)
    {
        var inputMemory = Marshal.AllocHGlobal(source.Length);
        DataBlob output = default;
        try
        {
            Marshal.Copy(source, 0, inputMemory, source.Length);
            var input = new DataBlob { Length = source.Length, Data = inputMemory };
            var flags = protect ? LocalMachine : 0;
            var success = protect
                ? CryptProtectData(ref input, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, flags, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, flags, out output);
            if (!success) throw new CryptographicException(Marshal.GetLastWin32Error());
            var result = new byte[output.Length];
            Marshal.Copy(output.Data, result, 0, result.Length);
            return result;
        }
        finally
        {
            var zeros = new byte[source.Length];
            Marshal.Copy(zeros, 0, inputMemory, zeros.Length);
            Marshal.FreeHGlobal(inputMemory);
            if (output.Data != IntPtr.Zero)
            {
                var outputZeros = new byte[output.Length];
                Marshal.Copy(outputZeros, 0, output.Data, outputZeros.Length);
                LocalFree(output.Data);
            }
            CryptographicOperations.ZeroMemory(source);
        }
    }
}
