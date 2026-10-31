using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Watchdog.Agent.CodexRemote;

/// <summary>
/// Drives the <c>codex</c> command-line tool on this computer for remote use: status, device-code
/// sign-in assist, remote control start and stop, and phone pairing. Every command is a fixed
/// argument list chosen here. Results are compact JSON documents returned to the controller.
/// </summary>
public sealed class CodexRemoteManager(ILogger<CodexRemoteManager> logger)
{
    private static readonly TimeSpan ShortCommand = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan LoginLifetime = TimeSpan.FromMinutes(15);
    private static readonly Regex UrlPattern = new("https://[^\\s\"'<>()]+", RegexOptions.CultureInvariant);
    private static readonly Regex DeviceCodePattern = new("\\b[A-Z0-9]{4,5}-[A-Z0-9]{4,6}\\b", RegexOptions.CultureInvariant);
    private static readonly Regex SecretPattern = new("(sk-[A-Za-z0-9_\\-]{4,})|(eyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-.]+)", RegexOptions.CultureInvariant);
    private static readonly Regex VersionPattern = new("\\d+\\.\\d+\\.\\d+(?:[-+.][0-9A-Za-z.\\-]+)?", RegexOptions.CultureInvariant);
    private static readonly string[] TrustedSignInHosts = ["openai.com", "chatgpt.com"];

    private readonly SemaphoreSlim _gate = new(1, 1);
    private LoginSession? _login;
    private CapturedProcess? _attachedRemote;
    private string _remoteState = "unknown";
    private DateTimeOffset? _remoteChangedAt;

    private sealed class LoginSession(CapturedProcess process, string url, string code, DateTimeOffset expiresAt)
    {
        public CapturedProcess Process { get; } = process;
        public string Url { get; } = url;
        public string Code { get; } = code;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;
        public string State { get; set; } = "waiting";
    }

    public async Task<string> ExecuteAsync(string kind, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return kind switch
            {
                "codex.status" => await StatusAsync(cancellationToken),
                "codex.login.start" => await StartLoginAsync(cancellationToken),
                "codex.login.cancel" => CancelLogin(),
                "codex.logout" => await LogoutAsync(cancellationToken),
                "codex.remote.start" => await StartRemoteAsync(cancellationToken),
                "codex.remote.stop" => await StopRemoteAsync(cancellationToken),
                "codex.remote.pair" => await PairAsync(cancellationToken),
                _ => throw new InvalidOperationException("The requested remote agent action is not supported by this agent.")
            };
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<string> StatusAsync(CancellationToken cancellationToken)
    {
        var settings = CodexSettings.Load();
        var result = new JsonObject
        {
            ["kind"] = "status",
            ["enabled"] = settings.Enabled,
            ["runAs"] = settings.RunAs,
            ["checkedAt"] = Now()
        };
        if (!settings.Enabled)
        {
            result["installed"] = false;
            result["detail"] = "The remote agent integration is turned off or its settings file is invalid on this computer.";
            return Serialize(result);
        }

        CodexLaunchContext context;
        try
        {
            context = ResolveContext(settings);
        }
        catch (InvalidOperationException exception)
        {
            result["installed"] = false;
            result["detail"] = exception.Message;
            return Serialize(result);
        }

        result["installed"] = true;
        result["executable"] = Path.GetFileName(context.Executable);
        var version = await RunAsync(context, ["--version"], cancellationToken);
        result["version"] = VersionPattern.Match(version.Text).Value is { Length: > 0 } found ? found : Clean(FirstLine(version.Text), 60);

        var loginStatus = await RunAsync(context, ["login", "status"], cancellationToken);
        result["signedIn"] = loginStatus.ExitCode == 0 && !loginStatus.Text.Contains("not logged in", StringComparison.OrdinalIgnoreCase);
        result["signInDetail"] = Clean(FirstLine(loginStatus.Text), 160);

        var loginHelp = await RunAsync(context, ["login", "--help"], cancellationToken);
        var deviceFlag = DeviceFlag(loginHelp.Text);
        result["deviceSignIn"] = deviceFlag is not null;

        var remoteHelp = await RunAsync(context, ["remote-control", "--help"], cancellationToken);
        var remoteSupported = remoteHelp.ExitCode == 0 && remoteHelp.Text.Contains("start", StringComparison.OrdinalIgnoreCase);
        result["remoteControl"] = remoteSupported;
        result["pairing"] = remoteSupported && Regex.IsMatch(remoteHelp.Text, "\\bpair\\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        if (remoteSupported && Regex.IsMatch(remoteHelp.Text, "\\bstatus\\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            var remoteStatus = await RunAsync(context, ["remote-control", "status"], cancellationToken);
            var text = remoteStatus.Text;
            if (Regex.IsMatch(text, "not\\s+running|stopped|inactive", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) SetRemote("stopped");
            else if (Regex.IsMatch(text, "running|connected|active", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) SetRemote("running");
            result["remoteDetail"] = Clean(FirstLine(text), 160);
        }
        if (_attachedRemote is { HasExited: true })
        {
            _attachedRemote.Dispose();
            _attachedRemote = null;
            SetRemote("stopped");
        }
        result["remoteState"] = _remoteState;
        if (_remoteChangedAt is { } changed) result["remoteChangedAt"] = changed.ToString("O", CultureInfo.InvariantCulture);
        result["login"] = LoginSummary(includeCode: false);
        return Serialize(result);
    }

    private async Task<string> StartLoginAsync(CancellationToken cancellationToken)
    {
        var settings = RequireEnabled();
        var context = ResolveContext(settings);
        if (_login is { State: "waiting" } current && !current.Process.HasExited && current.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return Serialize(new JsonObject { ["kind"] = "login", ["state"] = "waiting", ["verificationUrl"] = current.Url, ["userCode"] = current.Code, ["expiresAt"] = current.ExpiresAt.ToString("O", CultureInfo.InvariantCulture), ["reused"] = true });
        }

        var help = await RunAsync(context, ["login", "--help"], cancellationToken);
        var flag = DeviceFlag(help.Text) ?? throw new InvalidOperationException("This version of the command-line tool does not offer device-code sign-in. Update it on the computer, then check status again.");
        var process = CodexProcessLauncher.Start(context, ["login", flag], killWithJob: true);
        var found = await process.WaitForOutputAsync(text => FindSignInUrl(text) is not null && DeviceCodePattern.IsMatch(text), TimeSpan.FromSeconds(45), cancellationToken);
        var output = process.Text;
        if (!found)
        {
            var exited = process.HasExited;
            process.Kill();
            process.Dispose();
            var hint = Clean(LastMeaningfulLine(output), 200);
            throw new InvalidOperationException(exited
                ? "Sign-in ended before a device code was shown. " + hint
                : "The command-line tool did not show a device code within 45 seconds. " + hint);
        }

        var url = FindSignInUrl(output)!;
        var code = DeviceCodePattern.Match(output).Value;
        var session = new LoginSession(process, url, code, DateTimeOffset.UtcNow.Add(LoginLifetime));
        _login?.Process.Dispose();
        _login = session;
        _ = WatchLoginAsync(session);
        logger.LogInformation("Remote agent device sign-in started for the configured account.");
        return Serialize(new JsonObject
        {
            ["kind"] = "login",
            ["state"] = "waiting",
            ["verificationUrl"] = url,
            ["userCode"] = code,
            ["expiresAt"] = session.ExpiresAt.ToString("O", CultureInfo.InvariantCulture)
        });
    }

    private async Task WatchLoginAsync(LoginSession session)
    {
        var remaining = session.ExpiresAt - DateTimeOffset.UtcNow;
        var finished = await session.Process.WaitForCompletionAsync(remaining > TimeSpan.Zero ? remaining : TimeSpan.FromSeconds(1), CancellationToken.None);
        if (!finished)
        {
            session.Process.Kill();
            session.State = "expired";
            return;
        }
        if (session.State == "cancelled") return;
        session.State = session.Process.ExitCode == 0 ? "succeeded" : "failed";
    }

    private string CancelLogin()
    {
        if (_login is not { State: "waiting" } session) return Serialize(new JsonObject { ["kind"] = "login", ["state"] = "none", ["detail"] = "No sign-in was waiting." });
        session.State = "cancelled";
        session.Process.Kill();
        return Serialize(new JsonObject { ["kind"] = "login", ["state"] = "cancelled" });
    }

    private async Task<string> LogoutAsync(CancellationToken cancellationToken)
    {
        var context = ResolveContext(RequireEnabled());
        if (_login is { State: "waiting" } session)
        {
            session.State = "cancelled";
            session.Process.Kill();
        }
        var output = await RunAsync(context, ["logout"], cancellationToken);
        if (output.ExitCode != 0) throw new InvalidOperationException("Sign-out did not complete. " + Clean(LastMeaningfulLine(output.Text), 200));
        return Serialize(new JsonObject { ["kind"] = "logout", ["state"] = "signed-out", ["detail"] = Clean(FirstLine(output.Text), 160) });
    }

    private async Task<string> StartRemoteAsync(CancellationToken cancellationToken)
    {
        var context = ResolveContext(RequireEnabled());
        var process = CodexProcessLauncher.Start(context, ["remote-control", "start"], killWithJob: false);
        var finished = await process.WaitForCompletionAsync(TimeSpan.FromSeconds(45), cancellationToken);
        if (!finished)
        {
            _attachedRemote?.Dispose();
            _attachedRemote = process;
            SetRemote("running");
            return Serialize(new JsonObject { ["kind"] = "remote", ["state"] = "running", ["detail"] = "Remote control is running and stays attached to the agent.", ["changedAt"] = Now() });
        }
        var text = process.Text;
        var code = process.ExitCode;
        process.Dispose();
        if (code != 0) throw new InvalidOperationException("Remote control did not start. " + Clean(LastMeaningfulLine(text), 220));
        SetRemote("running");
        return Serialize(new JsonObject { ["kind"] = "remote", ["state"] = "running", ["detail"] = Clean(LastMeaningfulLine(text), 220), ["changedAt"] = Now() });
    }

    private async Task<string> StopRemoteAsync(CancellationToken cancellationToken)
    {
        var context = ResolveContext(RequireEnabled());
        var output = await RunAsync(context, ["remote-control", "stop"], cancellationToken);
        if (_attachedRemote is not null)
        {
            _attachedRemote.Kill();
            _attachedRemote.Dispose();
            _attachedRemote = null;
        }
        if (output.ExitCode != 0 && !Regex.IsMatch(output.Text, "not\\s+running", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            throw new InvalidOperationException("Remote control did not stop. " + Clean(LastMeaningfulLine(output.Text), 220));
        SetRemote("stopped");
        return Serialize(new JsonObject { ["kind"] = "remote", ["state"] = "stopped", ["detail"] = Clean(LastMeaningfulLine(output.Text), 220), ["changedAt"] = Now() });
    }

    private async Task<string> PairAsync(CancellationToken cancellationToken)
    {
        var context = ResolveContext(RequireEnabled());
        var output = await RunAsync(context, ["remote-control", "pair", "--json"], cancellationToken, TimeSpan.FromSeconds(60));
        if (output.ExitCode != 0) throw new InvalidOperationException("A pairing code was not created. Start remote control first, then try again. " + Clean(LastMeaningfulLine(output.Text), 200));
        var text = output.Text;
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new InvalidOperationException("The pairing response could not be read.");
        JsonNode? parsed;
        try { parsed = JsonNode.Parse(text[start..(end + 1)]); }
        catch (JsonException) { throw new InvalidOperationException("The pairing response could not be read."); }
        if (parsed is not JsonObject document) throw new InvalidOperationException("The pairing response could not be read.");
        var manual = Field(document, "manualPairingCode", 64);
        var pairing = Field(document, "pairingCode", 512);
        if (manual is null && pairing is null) throw new InvalidOperationException("The pairing response did not contain a code.");
        SetRemote("running");
        var result = new JsonObject { ["kind"] = "pair", ["state"] = "ready" };
        if (manual is not null) result["manualPairingCode"] = manual;
        if (pairing is not null) result["pairingCode"] = pairing;
        if (Field(document, "environmentId", 128) is { } environment) result["environmentId"] = environment;
        if (Field(document, "expiresAt", 64) is { } expires) result["expiresAt"] = expires;
        return Serialize(result);
    }

    private JsonObject LoginSummary(bool includeCode)
    {
        if (_login is null) return new JsonObject { ["state"] = "none" };
        if (_login.State == "waiting" && _login.ExpiresAt <= DateTimeOffset.UtcNow) _login.State = "expired";
        var summary = new JsonObject { ["state"] = _login.State, ["expiresAt"] = _login.ExpiresAt.ToString("O", CultureInfo.InvariantCulture) };
        if (includeCode) summary["userCode"] = _login.Code;
        return summary;
    }

    private void SetRemote(string state)
    {
        if (_remoteState == state) return;
        _remoteState = state;
        _remoteChangedAt = DateTimeOffset.UtcNow;
    }

    private static CodexSettings RequireEnabled()
    {
        var settings = CodexSettings.Load();
        if (!settings.Enabled) throw new InvalidOperationException("The remote agent integration is turned off or its settings file is invalid on this computer.");
        return settings;
    }

    private static CodexLaunchContext ResolveContext(CodexSettings settings)
    {
        var environment = CodexProcessLauncher.BaseEnvironment(settings.RunAs);
        if (settings.CodexHome is not null) environment["CODEX_HOME"] = settings.CodexHome;
        environment["NO_COLOR"] = "1";
        environment["TERM"] = "dumb";
        environment["CI"] = "1";
        var executable = settings.ExecutablePath is not null && File.Exists(settings.ExecutablePath)
            ? settings.ExecutablePath
            : FindExecutable(environment) ?? throw new InvalidOperationException("The codex command-line tool was not found for the selected account. Install it on the computer, or set its full path in the agent's remote settings file.");
        return new CodexLaunchContext(settings.RunAs, executable, environment);
    }

    private static string? FindExecutable(IReadOnlyDictionary<string, string> environment)
    {
        var directories = new List<string>();
        if (environment.TryGetValue("PATH", out var path))
            directories.AddRange(path.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (environment.TryGetValue("APPDATA", out var appData)) directories.Add(Path.Combine(appData, "npm"));
        if (environment.TryGetValue("LOCALAPPDATA", out var localAppData)) directories.Add(Path.Combine(localAppData, "Microsoft", "WinGet", "Links"));
        foreach (var directory in directories)
        {
            if (!Path.IsPathFullyQualified(directory)) continue;
            foreach (var name in new[] { "codex.exe", "codex.cmd" })
            {
                var candidate = Path.Combine(directory, name);
                if (File.Exists(candidate)) return candidate;
            }
        }
        return null;
    }

    private static async Task<(int? ExitCode, string Text)> RunAsync(CodexLaunchContext context, string[] arguments, CancellationToken cancellationToken, TimeSpan? timeout = null)
    {
        using var process = CodexProcessLauncher.Start(context, arguments, killWithJob: true);
        if (!await process.WaitForCompletionAsync(timeout ?? ShortCommand, cancellationToken))
        {
            process.Kill();
            throw new TimeoutException("The command-line tool did not respond in time.");
        }
        return (process.ExitCode, process.Text);
    }

    private static string? DeviceFlag(string help)
    {
        if (help.Contains("--device-auth", StringComparison.Ordinal)) return "--device-auth";
        if (help.Contains("--device-code", StringComparison.Ordinal)) return "--device-code";
        return null;
    }

    private static string? FindSignInUrl(string text)
    {
        foreach (Match match in UrlPattern.Matches(text))
        {
            var value = match.Value.TrimEnd('.', ',', ';', ':');
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) continue;
            if (TrustedSignInHosts.Any(host => uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith("." + host, StringComparison.OrdinalIgnoreCase)))
                return uri.GetLeftPart(UriPartial.Path).Length <= 300 ? value : null;
        }
        return null;
    }

    private static string? Field(JsonObject document, string name, int maximum)
    {
        if (!document.TryGetPropertyValue(name, out var node) || node is null) return null;
        var value = node.GetValueKind() == JsonValueKind.String ? node.GetValue<string>() : node.ToJsonString();
        value = value.Trim();
        return value.Length is > 0 && value.Length <= maximum && !value.Any(char.IsControl) ? value : null;
    }

    private static string FirstLine(string text) =>
        text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault() ?? string.Empty;

    private static string LastMeaningfulLine(string text) =>
        text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).LastOrDefault() ?? string.Empty;

    private static string Clean(string value, int maximum)
    {
        var redacted = SecretPattern.Replace(value, "[redacted]");
        redacted = DeviceCodePattern.Replace(redacted, "[code]");
        return redacted.Length <= maximum ? redacted : redacted[..maximum];
    }

    private static string Now() => DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

    private static string Serialize(JsonObject value)
    {
        var text = value.ToJsonString();
        if (text.Length > 1_900) throw new InvalidOperationException("The remote agent result was too large to report.");
        return text;
    }
}
