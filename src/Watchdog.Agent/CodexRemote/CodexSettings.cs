using System.Text.Json;
using System.Text.RegularExpressions;

namespace Watchdog.Agent.CodexRemote;

/// <summary>
/// Owner-controlled settings for the remote coding agent integration. The file lives in the
/// protected agent data directory, which only LocalSystem and Administrators can write, so the
/// controller and the browser can never choose which executable runs or where it reads data.
/// </summary>
public sealed record CodexSettings(
    bool Enabled,
    string RunAs,
    string? ExecutablePath,
    string? CodexHome)
{
    public const string InteractiveUser = "interactive-user";
    public const string ServiceAccount = "service";

    public static CodexSettings Default { get; } = new(true, InteractiveUser, null, null);

    public static string SettingsPath => Path.Combine(AgentConfigurationStore.DataDirectory, "codex.json");

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static CodexSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return Default;
            var info = new FileInfo(SettingsPath);
            if (info.Length > 16_384) return Default with { Enabled = false };
            var value = JsonSerializer.Deserialize<CodexSettings>(File.ReadAllText(SettingsPath), Options);
            return value is not null && IsValid(value) ? value : Default with { Enabled = false };
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return Default with { Enabled = false };
        }
    }

    public static bool IsValid(CodexSettings value) =>
        value.RunAs is InteractiveUser or ServiceAccount &&
        (value.ExecutablePath is null || (Path.IsPathFullyQualified(value.ExecutablePath) &&
            Regex.IsMatch(Path.GetFileName(value.ExecutablePath), "^codex(\\.exe|\\.cmd)?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))) &&
        (value.CodexHome is null || Path.IsPathFullyQualified(value.CodexHome));
}
