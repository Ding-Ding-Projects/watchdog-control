using System.Text;
using System.Text.RegularExpressions;

namespace Watchdog.Agent.CodexRemote;

/// <summary>A launched command whose merged output is captured as bounded, sanitized lines.</summary>
public abstract class CapturedProcess : IDisposable
{
    private const int MaximumLines = 400;
    private const int MaximumLineLength = 1_000;
    private static readonly Regex Ansi = new("\u001b\\[[0-9;?]*[ -/]*[@-~]|\u001b\\][^\u0007]*\u0007", RegexOptions.CultureInvariant);
    private readonly object _sync = new();
    private readonly List<string> _lines = [];
    private readonly List<Task> _readers = [];
    private TaskCompletionSource _changed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public abstract int ProcessId { get; }
    public abstract bool HasExited { get; }
    public abstract int? ExitCode { get; }
    public abstract Task WaitForExitAsync(CancellationToken cancellationToken);
    public abstract void Kill();
    public abstract void Dispose();

    protected void Capture(TextReader reader) => _readers.Add(Task.Run(async () =>
    {
        try
        {
            while (await reader.ReadLineAsync() is { } line)
            {
                var clean = Ansi.Replace(line, string.Empty).Replace("\r", string.Empty);
                if (clean.Length > MaximumLineLength) clean = clean[..MaximumLineLength];
                lock (_sync)
                {
                    if (_lines.Count < MaximumLines) _lines.Add(clean);
                    var previous = _changed;
                    _changed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                    previous.TrySetResult();
                }
            }
        }
        catch (Exception exception) when (exception is IOException or ObjectDisposedException)
        {
        }
        finally
        {
            lock (_sync) _changed.TrySetResult();
        }
    }));

    public IReadOnlyList<string> Lines
    {
        get { lock (_sync) return _lines.ToArray(); }
    }

    public string Text => string.Join('\n', Lines);

    /// <summary>Waits until the captured output satisfies the predicate, the process exits, or the timeout passes.</summary>
    public async Task<bool> WaitForOutputAsync(Func<string, bool> predicate, TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        while (true)
        {
            Task changed;
            lock (_sync)
            {
                if (predicate(string.Join('\n', _lines))) return true;
                changed = _changed.Task;
            }
            if (HasExited && _readers.All(task => task.IsCompleted))
            {
                lock (_sync) return predicate(string.Join('\n', _lines));
            }
            try
            {
                await Task.WhenAny(changed, WaitForExitAsync(timeoutSource.Token), Task.Delay(500, timeoutSource.Token));
            }
            catch (OperationCanceledException)
            {
            }
            if (timeoutSource.IsCancellationRequested)
            {
                cancellationToken.ThrowIfCancellationRequested();
                lock (_sync) return predicate(string.Join('\n', _lines));
            }
        }
    }

    /// <summary>Waits for exit and for all buffered output to be read.</summary>
    public async Task<bool> WaitForCompletionAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        try
        {
            await WaitForExitAsync(timeoutSource.Token);
            await Task.WhenAll(_readers).WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
            return true;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
        catch (TimeoutException)
        {
            return true;
        }
    }

    protected static Encoding OutputEncoding => new UTF8Encoding(false);
}
