using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Watchdog.Web;

/// <summary>The latest non-secret remote agent status reported by one host.</summary>
public sealed record CodexStatusRecord(string HostId, string StatusJson, DateTimeOffset UpdatedAt);

/// <summary>A one-time value shown to the owner and never persisted to disk or the audit log.</summary>
public sealed record CodexSecretView(string Kind, IReadOnlyDictionary<string, string> Values, DateTimeOffset ExpiresAt, DateTimeOffset CreatedAt);

/// <summary>
/// Separates one-time sign-in and pairing codes from the persisted operation record. Codes live
/// only in controller memory until they expire, so restarting the controller clears them.
/// </summary>
public sealed class CodexSecretCache
{
    public static readonly string[] RemoteKinds =
    [
        "codex.status", "codex.login.start", "codex.login.cancel", "codex.logout",
        "codex.remote.start", "codex.remote.stop", "codex.remote.pair"
    ];

    private static readonly string[] SecretFields = ["userCode", "manualPairingCode", "pairingCode"];
    private static readonly TimeSpan DefaultLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan MaximumLifetime = TimeSpan.FromMinutes(20);
    private readonly ConcurrentDictionary<(string HostId, string Kind), CodexSecretView> _values = new();

    /// <summary>Captures one-time values from an agent result and returns the redacted text to persist.</summary>
    public string? CaptureAndRedact(string hostId, string kind, string? result)
    {
        if (result is null) return null;
        JsonObject? document;
        try { document = JsonNode.Parse(result) as JsonObject; }
        catch (JsonException) { return result; }
        if (document is null) return result;

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var field in SecretFields)
        {
            if (document.TryGetPropertyValue(field, out var node) && node is JsonValue value && value.TryGetValue<string>(out var text) && text.Length is > 0 and <= 512)
            {
                values[field] = text;
                document[field] = "[shown once in the dashboard]";
            }
        }
        if (document.TryGetPropertyValue("verificationUrl", out var url) && url is JsonValue urlValue && urlValue.TryGetValue<string>(out var urlText) &&
            Uri.TryCreate(urlText, UriKind.Absolute, out var parsed) && parsed.Scheme == Uri.UriSchemeHttps)
        {
            values["verificationUrl"] = urlText;
        }

        var now = DateTimeOffset.UtcNow;
        var expires = now.Add(DefaultLifetime);
        if (document.TryGetPropertyValue("expiresAt", out var expiry) && expiry is JsonValue expiryValue &&
            expiryValue.TryGetValue<string>(out var expiryText) && DateTimeOffset.TryParse(expiryText, out var reported))
        {
            expires = reported < now ? now : reported > now.Add(MaximumLifetime) ? now.Add(MaximumLifetime) : reported;
        }

        var slot = kind == "codex.remote.pair" ? "pair" : kind is "codex.login.start" ? "login" : null;
        if (slot is not null && values.Count > 0)
        {
            _values[(hostId, slot)] = new CodexSecretView(slot, values, expires, now);
        }
        if (kind is "codex.login.cancel" or "codex.logout")
        {
            _values.TryRemove((hostId, "login"), out _);
        }
        if (kind == "codex.remote.stop")
        {
            _values.TryRemove((hostId, "pair"), out _);
        }
        return document.ToJsonString();
    }

    public IReadOnlyList<CodexSecretView> Current(string hostId)
    {
        var now = DateTimeOffset.UtcNow;
        var results = new List<CodexSecretView>();
        foreach (var slot in new[] { "login", "pair" })
        {
            if (!_values.TryGetValue((hostId, slot), out var view)) continue;
            if (view.ExpiresAt <= now)
            {
                _values.TryRemove((hostId, slot), out _);
                continue;
            }
            results.Add(view);
        }
        return results;
    }

    public void Forget(string hostId)
    {
        _values.TryRemove((hostId, "login"), out _);
        _values.TryRemove((hostId, "pair"), out _);
    }

    /// <summary>Clears a waiting sign-in once a later status shows it finished.</summary>
    public void ApplyStatus(string hostId, string statusJson)
    {
        try
        {
            if (JsonNode.Parse(statusJson) is JsonObject document &&
                document["login"] is JsonObject login &&
                login["state"] is JsonValue state && state.TryGetValue<string>(out var text) && text != "waiting")
            {
                _values.TryRemove((hostId, "login"), out _);
            }
        }
        catch (JsonException)
        {
        }
    }
}
