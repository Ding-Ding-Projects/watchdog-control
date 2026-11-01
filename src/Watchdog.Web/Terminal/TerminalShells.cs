using System.Runtime.InteropServices;

namespace Watchdog.Web.Terminal;

/// <summary>
/// A shell the controller can start. Command text is written to the shell's standard input and
/// followed by a completion marker carrying a per-session nonce, so the controller can tell when a
/// command finished and with which result without parsing prompts.
/// </summary>
public sealed record ShellProfile(
    string Id,
    string DisplayName,
    string Executable,
    IReadOnlyList<string> Arguments,
    IReadOnlyDictionary<string, string> Environment,
    Func<string, string, long, string> WrapCommand,
    string? PromptToStrip,
    string LineEnding);

public sealed record ShellAvailability(string Id, string DisplayName, bool Available, string? Executable, string? Reason);

public sealed record TerminalLimits(
    int MaxSessionsPerOwner,
    int MaxInputCharacters,
    int MaxRetainedOutputCharacters,
    int IdleMinutes,
    int MaxLifetimeHours,
    int MaxEventsPerPoll);

public sealed record TerminalCapabilities(
    bool Enabled,
    string Computer,
    string Platform,
    string Architecture,
    string Account,
    bool Container,
    string ExecutionLabel,
    IReadOnlyList<ShellAvailability> Shells,
    TerminalLimits Limits,
    string? DisabledReason);

public static class TerminalShells
{
    public static TerminalLimits Limits { get; } = new(4, 16_384, 2_000_000, 15, 8, 500);

    public static bool InContainer =>
        string.Equals(System.Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase) ||
        File.Exists("/.dockerenv");

    public static TerminalCapabilities Discover(bool enabled, string? disabledReason)
    {
        var platform = OperatingSystem.IsWindows() ? "Windows" : OperatingSystem.IsLinux() ? "Linux" : OperatingSystem.IsMacOS() ? "macOS" : RuntimeInformation.OSDescription;
        var container = InContainer;
        var label = container
            ? $"Controller container ({platform}), not the Windows host"
            : $"Controller computer {System.Environment.MachineName} ({platform})";
        var shells = new List<ShellAvailability>();
        var powershell = FindPowerShell();
        shells.Add(powershell is null
            ? new ShellAvailability("powershell", "PowerShell", false, null, OperatingSystem.IsWindows()
                ? "PowerShell was not found on this computer."
                : "PowerShell (pwsh) is not installed where the controller runs.")
            : new ShellAvailability("powershell", "PowerShell", true, powershell, null));
        var cmd = FindCmd();
        shells.Add(cmd is null
            ? new ShellAvailability("cmd", "CMD", false, null, OperatingSystem.IsWindows()
                ? "Command Prompt was not found on this computer."
                : $"Command Prompt needs Windows. This controller runs on {platform}.")
            : new ShellAvailability("cmd", "CMD", true, cmd, null));
        return new TerminalCapabilities(
            enabled,
            System.Environment.MachineName,
            platform,
            RuntimeInformation.OSArchitecture.ToString().ToLowerInvariant(),
            System.Environment.UserName,
            container,
            label,
            shells,
            Limits,
            enabled ? null : disabledReason);
    }

    public static ShellProfile? Profile(string id)
    {
        if (id == "powershell" && FindPowerShell() is { } powershell)
        {
            return new ShellProfile(
                "powershell",
                "PowerShell",
                powershell,
                ["-NoLogo", "-NoProfile", "-Command", "-"],
                new Dictionary<string, string> { ["NO_COLOR"] = "1", ["TERM"] = "dumb" },
                (command, nonce, sequence) =>
                    command + "\n\n" +
                    "$wdcOk = $?; [Console]::Out.WriteLine('" + Marker(nonce, sequence) + "' + [int](-not $wdcOk) + ':' + $LASTEXITCODE)\n\n",
                null,
                "\n");
        }

        if (id == "cmd" && FindCmd() is { } cmd)
        {
            return new ShellProfile(
                "cmd",
                "CMD",
                cmd,
                ["/D", "/Q", "/K"],
                new Dictionary<string, string> { ["PROMPT"] = "$E[wdc]" },
                (command, nonce, sequence) =>
                    command.Replace("\r\n", "\n", StringComparison.Ordinal).Replace("\n", "\r\n", StringComparison.Ordinal) + "\r\n" +
                    "echo " + Marker(nonce, sequence) + "0:%ERRORLEVEL%\r\n",
                "\u001b[wdc]",
                "\r\n");
        }

        return null;
    }

    /// <summary>The completion marker printed after each command; the nonce is unique per session.</summary>
    public static string Marker(string nonce, long sequence) => "@@WDC-" + nonce + ":" + sequence.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":";

    private static string? FindPowerShell()
    {
        foreach (var name in OperatingSystem.IsWindows() ? new[] { "pwsh.exe" } : new[] { "pwsh" })
        {
            if (FindOnPath(name) is { } found) return found;
        }

        if (OperatingSystem.IsWindows())
        {
            var programFiles = System.Environment.GetFolderPath(System.Environment.SpecialFolder.ProgramFiles);
            var pwsh = Path.Combine(programFiles, "PowerShell", "7", "pwsh.exe");
            if (File.Exists(pwsh)) return pwsh;
            var windowsPowerShell = Path.Combine(System.Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            if (File.Exists(windowsPowerShell)) return windowsPowerShell;
        }

        return null;
    }

    private static string? FindCmd()
    {
        if (!OperatingSystem.IsWindows()) return null;
        var path = Path.Combine(System.Environment.SystemDirectory, "cmd.exe");
        return File.Exists(path) ? path : null;
    }

    private static string? FindOnPath(string name)
    {
        var path = System.Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!Path.IsPathFullyQualified(directory)) continue;
            var candidate = Path.Combine(directory, name);
            if (File.Exists(candidate)) return candidate;
        }

        return null;
    }
}
