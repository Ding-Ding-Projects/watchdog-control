using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Watchdog.Web.Terminal;

public sealed record TerminalEvent(
    long Seq,
    string Type,
    string Text,
    DateTimeOffset At,
    long? CommandId,
    int? ExitCode,
    bool? Succeeded);

public sealed record TerminalSessionView(
    string Id,
    string Name,
    string Shell,
    string ShellName,
    string State,
    string? StateDetail,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastActivityAt,
    long? RunningCommandId,
    DateTimeOffset? RunningSince,
    int? ExitCode,
    long FirstRetainedSeq,
    long LastSeq,
    long RetainedCharacters,
    bool Truncated);

/// <summary>
/// One shell process with redirected standard streams. Output is kept as an ordered, bounded list
/// of events. Commands and output live only in memory and are never logged or audited.
/// </summary>
public sealed class TerminalSession : IDisposable
{
    private readonly object _sync = new();
    private readonly List<TerminalEvent> _events = [];
    private readonly ShellProfile _profile;
    private readonly TerminalLimits _limits;
    private readonly string _nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
    private readonly string _markerPrefix;
    private Process? _process;
    private long _seq;
    private long _retained;
    private long _commandSeq;
    private bool _truncated;
    private TaskCompletionSource _changed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public TerminalSession(string owner, ShellProfile profile, TerminalLimits limits, string name)
    {
        Owner = owner;
        _profile = profile;
        _limits = limits;
        Name = name;
        _markerPrefix = "@@WDC-" + _nonce + ":";
        CreatedAt = DateTimeOffset.UtcNow;
        LastActivityAt = CreatedAt;
    }

    public string Id { get; } = Guid.NewGuid().ToString("N");
    public string Owner { get; }
    public string Name { get; private set; }
    public string State { get; private set; } = "starting";
    public string? StateDetail { get; private set; }
    public DateTimeOffset CreatedAt { get; }
    public DateTimeOffset LastActivityAt { get; private set; }
    public long? RunningCommandId { get; private set; }
    public DateTimeOffset? RunningSince { get; private set; }
    public int? ExitCode { get; private set; }
    public bool Ended => State is "stopped" or "exited" or "expired" or "failed";

    public void Start(string workingDirectory)
    {
        var start = new ProcessStartInfo(_profile.Executable)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = new UTF8Encoding(false),
            StandardErrorEncoding = new UTF8Encoding(false),
            StandardInputEncoding = new UTF8Encoding(false),
            WorkingDirectory = workingDirectory
        };
        foreach (var argument in _profile.Arguments) start.ArgumentList.Add(argument);
        foreach (var pair in _profile.Environment) start.Environment[pair.Key] = pair.Value;
        try
        {
            _process = Process.Start(start) ?? throw new InvalidOperationException("The shell did not start.");
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            lock (_sync)
            {
                State = "failed";
                StateDetail = "The shell could not start.";
                Add("lifecycle", "The " + _profile.DisplayName + " shell could not start.", null, null, null);
            }
            return;
        }

        _process.StandardInput.AutoFlush = true;
        _process.StandardInput.NewLine = _profile.LineEnding;
        lock (_sync)
        {
            State = "idle";
            Add("lifecycle", _profile.DisplayName + " session started.", null, null, null);
        }
        _ = PumpAsync(_process.StandardOutput, "stdout");
        _ = PumpAsync(_process.StandardError, "stderr");
        _ = WatchExitAsync(_process);
    }

    public TerminalSessionView View()
    {
        lock (_sync) return ViewLocked();
    }

    private TerminalSessionView ViewLocked() => new(
        Id, Name, _profile.Id, _profile.DisplayName, State, StateDetail, CreatedAt, LastActivityAt,
        RunningCommandId, RunningSince, ExitCode, _events.Count > 0 ? _events[0].Seq : _seq + 1, _seq, _retained, _truncated);

    public (TerminalSessionView View, IReadOnlyList<TerminalEvent> Events, bool More) Read(long after)
    {
        lock (_sync)
        {
            var batch = _events.Where(item => item.Seq > after).Take(_limits.MaxEventsPerPoll).ToList();
            var more = batch.Count == _limits.MaxEventsPerPoll && _events[^1].Seq > batch[^1].Seq;
            return (ViewLocked(), batch, more);
        }
    }

    public Task WaitForChangeAsync(long after, TimeSpan timeout, CancellationToken cancellationToken)
    {
        Task changed;
        lock (_sync)
        {
            if (_seq > after || Ended) return Task.CompletedTask;
            changed = _changed.Task;
        }
        return changed.WaitAsync(timeout, cancellationToken).ContinueWith(_ => { }, TaskScheduler.Default);
    }

    public string? Send(string text, string mode)
    {
        if (_process is null) return "session-not-running";
        lock (_sync)
        {
            if (Ended || State == "starting") return "session-not-running";
            LastActivityAt = DateTimeOffset.UtcNow;
            if (mode == "stdin")
            {
                if (State != "running") return "no-running-command";
                Add("input", text, RunningCommandId, null, null);
            }
            else
            {
                if (State == "running") return "command-running";
                if (string.IsNullOrWhiteSpace(text)) return "empty-command";
                _commandSeq += 1;
                RunningCommandId = _commandSeq;
                RunningSince = DateTimeOffset.UtcNow;
                State = "running";
                Add("command", text, _commandSeq, null, null);
            }
        }

        try
        {
            if (mode == "stdin")
            {
                _process.StandardInput.Write(text + _profile.LineEnding);
            }
            else
            {
                _process.StandardInput.Write(_profile.WrapCommand(text, _nonce, RunningCommandId!.Value));
            }
            return null;
        }
        catch (Exception exception) when (exception is IOException or ObjectDisposedException or InvalidOperationException)
        {
            return "session-not-running";
        }
    }

    public void Rename(string name)
    {
        lock (_sync) Name = name;
    }

    public void Stop(string state, string detail)
    {
        Process? process;
        lock (_sync)
        {
            if (Ended) return;
            State = state;
            StateDetail = detail;
            RunningCommandId = null;
            RunningSince = null;
            Add("lifecycle", detail, null, null, null);
            process = _process;
        }

        try
        {
            if (process is { HasExited: false }) process.Kill(entireProcessTree: true);
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
        }
    }

    public bool IsIdleExpired(DateTimeOffset now) =>
        !Ended && (now - LastActivityAt > TimeSpan.FromMinutes(_limits.IdleMinutes) || now - CreatedAt > TimeSpan.FromHours(_limits.MaxLifetimeHours));

    private async Task PumpAsync(StreamReader reader, string type)
    {
        var buffer = new char[4096];
        var pending = new StringBuilder();
        try
        {
            while (true)
            {
                var read = await reader.ReadAsync(buffer.AsMemory());
                if (read <= 0) break;
                pending.Append(buffer, 0, read);
                Flush(pending, type, final: false);
            }
        }
        catch (Exception exception) when (exception is IOException or ObjectDisposedException)
        {
        }
        Flush(pending, type, final: true);
    }

    private void Flush(StringBuilder pending, string type, bool final)
    {
        var text = pending.ToString();
        if (_profile.PromptToStrip is { } prompt) text = text.Replace(prompt, string.Empty, StringComparison.Ordinal);
        var output = new StringBuilder();
        var start = 0;
        var completions = new List<(long Id, bool Ok, int? Code)>();
        while (true)
        {
            var newline = text.IndexOf('\n', start);
            if (newline < 0) break;
            var line = text[start..(newline + 1)];
            start = newline + 1;
            if (type == "stdout" && TryParseMarker(line, out var completion))
            {
                if (output.Length > 0) EmitOutput(type, output);
                completions.Add(completion);
                FinishCommand(completion);
                continue;
            }
            output.Append(line);
        }

        var tail = text[start..];
        pending.Clear();
        // Keep a partial line that could be the start of a marker; emit anything else immediately.
        if (!final && type == "stdout" && (_markerPrefix.StartsWith(tail.TrimStart('\r'), StringComparison.Ordinal) || tail.TrimStart('\r').StartsWith(_markerPrefix, StringComparison.Ordinal)) && tail.Length < 200)
        {
            pending.Append(tail);
        }
        else
        {
            output.Append(tail);
        }
        if (output.Length > 0) EmitOutput(type, output);
    }

    private void EmitOutput(string type, StringBuilder output)
    {
        var text = output.ToString();
        output.Clear();
        if (text.Length == 0) return;
        lock (_sync)
        {
            LastActivityAt = DateTimeOffset.UtcNow;
            Add(type, text, RunningCommandId, null, null);
        }
    }

    private bool TryParseMarker(string line, out (long Id, bool Ok, int? Code) completion)
    {
        completion = default;
        var trimmed = line.TrimEnd('\r', '\n').TrimStart();
        if (!trimmed.StartsWith(_markerPrefix, StringComparison.Ordinal)) return false;
        var parts = trimmed[_markerPrefix.Length..].Split(':');
        if (parts.Length < 2 || !long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var id)) return false;
        var failed = parts[1] == "1";
        int? code = parts.Length > 2 && int.TryParse(parts[2], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
        completion = (id, !failed && (code is null or 0), code);
        return true;
    }

    private void FinishCommand((long Id, bool Ok, int? Code) completion)
    {
        lock (_sync)
        {
            if (RunningCommandId != completion.Id) return;
            var elapsed = RunningSince is { } since ? DateTimeOffset.UtcNow - since : TimeSpan.Zero;
            var seconds = elapsed.TotalSeconds.ToString("0.0", CultureInfo.InvariantCulture);
            Add("lifecycle", (completion.Ok ? "Finished · succeeded" : "Finished · failed") + (completion.Code is { } code ? " · exit code " + code.ToString(CultureInfo.InvariantCulture) : string.Empty) + " · " + seconds + " s",
                completion.Id, completion.Code, completion.Ok);
            RunningCommandId = null;
            RunningSince = null;
            if (!Ended) State = "idle";
            LastActivityAt = DateTimeOffset.UtcNow;
        }
    }

    private async Task WatchExitAsync(Process process)
    {
        try { await process.WaitForExitAsync(); }
        catch (Exception exception) when (exception is InvalidOperationException) { return; }
        await Task.Delay(150);
        lock (_sync)
        {
            try { ExitCode = process.ExitCode; } catch (InvalidOperationException) { ExitCode = null; }
            if (Ended) return;
            State = "exited";
            StateDetail = "The shell exited" + (ExitCode is { } code ? " with code " + code.ToString(CultureInfo.InvariantCulture) : string.Empty) + ".";
            RunningCommandId = null;
            RunningSince = null;
            Add("lifecycle", StateDetail, null, ExitCode, ExitCode == 0);
        }
    }

    // Callers hold _sync.
    private void Add(string type, string text, long? commandId, int? exitCode, bool? succeeded)
    {
        _seq += 1;
        var item = new TerminalEvent(_seq, type, text, DateTimeOffset.UtcNow, commandId, exitCode, succeeded);
        _events.Add(item);
        _retained += text.Length;
        var dropped = 0;
        while (_retained > _limits.MaxRetainedOutputCharacters && _events.Count > 1)
        {
            _retained -= _events[0].Text.Length;
            _events.RemoveAt(0);
            dropped += 1;
        }
        if (dropped > 0) _truncated = true;
        var previous = _changed;
        _changed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        previous.TrySetResult();
    }

    public void Dispose()
    {
        Stop("stopped", "Session stopped.");
        _process?.Dispose();
    }
}
