using System.Collections.Concurrent;

namespace Watchdog.Web.Terminal;

/// <summary>
/// Owns every terminal session in controller memory. Sessions belong to the owner who created
/// them, are bounded by <see cref="TerminalShells.Limits"/>, stop when idle, and end when the
/// controller stops. Only session start and stop are audited; command text and output never are.
/// </summary>
public sealed class TerminalService : IDisposable
{
    private readonly ConcurrentDictionary<string, TerminalSession> _sessions = new();
    private readonly ControlStateStore _store;
    private readonly bool _enabled;
    private readonly string? _disabledReason;
    private readonly Timer _sweeper;
    private readonly object _createSync = new();

    public TerminalService(ControlStateStore store, IConfiguration configuration)
    {
        _store = store;
        var setting = configuration["WATCHDOG_TERMINAL"];
        _enabled = !string.Equals(setting, "disabled", StringComparison.OrdinalIgnoreCase);
        _disabledReason = _enabled ? null : "The terminal is turned off for this controller (WATCHDOG_TERMINAL=disabled).";
        _sweeper = new Timer(_ => Sweep(), null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
    }

    public TerminalCapabilities Capabilities() => TerminalShells.Discover(_enabled, _disabledReason);

    public IReadOnlyList<TerminalSessionView> List(string owner) =>
        _sessions.Values.Where(session => session.Owner == owner).OrderBy(session => session.CreatedAt).Select(session => session.View()).ToList();

    public TerminalSession? Get(string owner, string id) =>
        _sessions.TryGetValue(id, out var session) && session.Owner == owner ? session : null;

    public (TerminalSession? Session, string? Error) Create(string owner, string shell, string? name)
    {
        if (!_enabled) return (null, "terminal-disabled");
        if (shell is not ("powershell" or "cmd")) return (null, "unsupported-shell");
        var profile = TerminalShells.Profile(shell);
        if (profile is null) return (null, "shell-unavailable");
        var limits = TerminalShells.Limits;
        TerminalSession session;
        lock (_createSync)
        {
            var live = _sessions.Values.Count(candidate => candidate.Owner == owner && !candidate.Ended);
            if (live >= limits.MaxSessionsPerOwner) return (null, "session-limit-reached");
            var ended = _sessions.Values.Where(candidate => candidate.Owner == owner && candidate.Ended).OrderBy(candidate => candidate.CreatedAt).ToList();
            foreach (var old in ended.Take(Math.Max(0, ended.Count - 8)))
            {
                if (_sessions.TryRemove(old.Id, out var removed)) removed.Dispose();
            }
            var count = _sessions.Values.Count(candidate => candidate.Owner == owner) + 1;
            session = new TerminalSession(owner, profile, limits, CleanName(name) ?? profile.DisplayName + " " + count);
            _sessions[session.Id] = session;
        }

        var home = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
        session.Start(Directory.Exists(home) ? home : AppContext.BaseDirectory);
        Audit(owner, "terminal.session.started", session.Id, session.Ended ? "failed" : "success", profile.Id);
        return (session, null);
    }

    public bool Stop(string owner, string id)
    {
        var session = Get(owner, id);
        if (session is null) return false;
        var wasRunning = !session.Ended;
        session.Stop("stopped", "Session stopped by the owner. The shell and every process it started were ended.");
        if (wasRunning) Audit(owner, "terminal.session.stopped", id, "success", null);
        return true;
    }

    public bool Forget(string owner, string id)
    {
        var session = Get(owner, id);
        if (session is null) return false;
        if (!session.Ended) Stop(owner, id);
        if (_sessions.TryRemove(id, out var removed)) removed.Dispose();
        return true;
    }

    public static string? CleanName(string? name)
    {
        if (name is null) return null;
        var trimmed = new string(name.Where(character => !char.IsControl(character)).ToArray()).Trim();
        return trimmed.Length is >= 1 and <= 40 ? trimmed : null;
    }

    private void Sweep()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var session in _sessions.Values)
        {
            if (!session.IsIdleExpired(now)) continue;
            session.Stop("expired", $"Session stopped after {TerminalShells.Limits.IdleMinutes} minutes without activity or after its {TerminalShells.Limits.MaxLifetimeHours}-hour lifetime.");
            Audit(session.Owner, "terminal.session.expired", session.Id, "success", null);
        }
    }

    private void Audit(string owner, string action, string target, string outcome, string? detail) =>
        _store.Mutate(state => SessionService.AddAudit(state, owner, action, target, outcome, detail));

    public void Dispose()
    {
        _sweeper.Dispose();
        foreach (var session in _sessions.Values) session.Dispose();
        _sessions.Clear();
    }
}
