using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text.RegularExpressions;
using TimeoutException = System.TimeoutException;
using Watchdog.Contracts;

namespace Watchdog.Agent;

public sealed class AgentOperationExecutor(ILogger<AgentOperationExecutor> logger)
{
    private static readonly HashSet<string> ProtectedProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "system", "idle", "registry", "smss", "csrss", "wininit", "winlogon", "services", "lsass",
        "svchost", "fontdrvhost", "dwm", "systemsettings", "watchdogagent", "watchdogcontrolsetup"
    };

    public Task<OperationResultRequest> ExecuteAsync(OperationRecord operation, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            var result = operation.Kind switch
            {
                "system.refresh" => "Host inventory refreshed.",
                "network.flushDns" => FlushDns(),
                "service.start" => ChangeService(operation.TargetId, "start"),
                "service.stop" => ChangeService(operation.TargetId, "stop"),
                "service.restart" => ChangeService(operation.TargetId, "restart"),
                "process.terminate" => TerminateProcess(operation.TargetId),
                "host.restart" => BeginPowerAction(restart: true),
                "host.shutdown" => BeginPowerAction(restart: false),
                _ => throw new InvalidOperationException("The requested operation is not supported by this agent.")
            };
            AgentRuntimeStatusStore.Write("online", "The latest requested host action completed.");
            return Task.FromResult(new OperationResultRequest(operation.Id, "succeeded", Limit(result, 2_000)));
        }
        catch (OperationCanceledException)
        {
            return Task.FromResult(new OperationResultRequest(operation.Id, "cancelled", "The operation was cancelled before completion."));
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or TimeoutException or UnauthorizedAccessException or FormatException or System.Security.SecurityException)
        {
            logger.LogWarning("Host action {ActionKind} was rejected or failed with {FailureType}.", operation.Kind, exception.GetType().Name);
            return Task.FromResult(new OperationResultRequest(operation.Id, "failed", Limit(exception.Message, 500)));
        }
        catch (Exception exception)
        {
            logger.LogError("Host action {ActionKind} stopped unexpectedly with {FailureType}.", operation.Kind, exception.GetType().Name);
            return Task.FromResult(new OperationResultRequest(operation.Id, "failed", $"The operation stopped with an unexpected {exception.GetType().Name}. Refresh inventory before retrying."));
        }
    }

    private static string FlushDns()
    {
        if (!DnsFlushResolverCache()) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "The DNS resolver cache could not be refreshed.");
        return "The DNS resolver cache was refreshed.";
    }

    private static string ChangeService(string? serviceName, string action)
    {
        if (string.IsNullOrWhiteSpace(serviceName) || !Regex.IsMatch(serviceName, "^[A-Za-z0-9_.-]{1,256}$", RegexOptions.CultureInvariant))
            throw new InvalidOperationException("The service identity is invalid.");
        using var service = new ServiceController(serviceName);
        _ = service.Status;
        if (action == "start")
        {
            if (service.Status == ServiceControllerStatus.Running) return $"{Limit(service.DisplayName, 128)} is already running.";
            service.Start();
            service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(45));
            return $"{Limit(service.DisplayName, 128)} started.";
        }

        if (!service.CanStop) throw new InvalidOperationException("The selected service does not allow this action.");
        if (service.Status == ServiceControllerStatus.Stopped)
        {
            if (action == "stop") return $"{Limit(service.DisplayName, 128)} is already stopped.";
            service.Start();
            service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(45));
            return $"{Limit(service.DisplayName, 128)} started after restart.";
        }

        service.Stop();
        service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(45));
        if (action == "stop") return $"{Limit(service.DisplayName, 128)} stopped.";
        service.Start();
        service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(45));
        return $"{Limit(service.DisplayName, 128)} restarted.";
    }

    private static string TerminateProcess(string? identity)
    {
        if (string.IsNullOrWhiteSpace(identity)) throw new InvalidOperationException("The process identity is missing.");
        var parts = identity.Split(':', 2);
        if (parts.Length != 2 || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var processId) || processId <= 0 ||
            !long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var expectedStartTicks) || expectedStartTicks <= 0)
        {
            throw new InvalidOperationException("The process identity is invalid or no longer available for safe termination.");
        }
        if (processId == Environment.ProcessId) throw new InvalidOperationException("The management agent cannot terminate itself.");

        using var process = Process.GetProcessById(processId);
        var name = process.ProcessName;
        if (ProtectedProcesses.Contains(name)) throw new InvalidOperationException("Windows and management processes cannot be terminated from this control.");
        var actualStartTicks = new DateTimeOffset(process.StartTime.ToUniversalTime(), TimeSpan.Zero).UtcDateTime.Ticks;
        if (actualStartTicks != expectedStartTicks) throw new InvalidOperationException("The process identifier was reused after the inventory was collected. Refresh the inventory before retrying.");
        process.Kill(entireProcessTree: false);
        if (!process.WaitForExit(15_000)) throw new TimeoutException("The process did not exit within 15 seconds.");
        return $"Process {Limit(name, 128)} ({processId.ToString(CultureInfo.InvariantCulture)}) exited.";
    }

    private static string BeginPowerAction(bool restart)
    {
        EnableShutdownPrivilege();
        var message = restart ? "Watchdog Control requested a confirmed restart." : "Watchdog Control requested a confirmed shutdown.";
        if (!InitiateSystemShutdownEx(null, message, 60, bForceAppsClosed: false, bRebootAfterShutdown: restart, dwReason: 0x80020000))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Windows did not accept the confirmed power request.");
        return restart
            ? "Windows accepted the confirmed restart request with a 60-second countdown. Final outcome awaits the host reconnecting."
            : "Windows accepted the confirmed shutdown request with a 60-second countdown. Final outcome awaits the host state check.";
    }

    private static void EnableShutdownPrivilege()
    {
        const uint tokenAdjustPrivileges = 0x20;
        const uint tokenQuery = 0x8;
        const uint privilegeEnabled = 0x2;
        if (!OpenProcessToken(GetCurrentProcess(), tokenAdjustPrivileges | tokenQuery, out var token))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "The host power privilege is unavailable.");
        try
        {
            if (!LookupPrivilegeValue(null, "SeShutdownPrivilege", out var luid))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "The host power privilege is unavailable.");
            var privileges = new TokenPrivileges { Count = 1, Luid = luid, Attributes = privilegeEnabled };
            if (!AdjustTokenPrivileges(token, false, ref privileges, 0, IntPtr.Zero, IntPtr.Zero) || Marshal.GetLastWin32Error() == 1300)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "The host power privilege was not assigned to the service.");
        }
        finally { CloseHandle(token); }
    }

    private static string Limit(string value, int maximum) => value.Length <= maximum ? value : value[..maximum];

    [StructLayout(LayoutKind.Sequential)]
    private struct Luid { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    private struct TokenPrivileges { public uint Count; public Luid Luid; public uint Attributes; }

    [DllImport("dnsapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DnsFlushResolverCache();

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool LookupPrivilegeValue(string? systemName, string name, out Luid luid);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TokenPrivileges newState, int bufferLength, IntPtr previousState, IntPtr returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool InitiateSystemShutdownEx(string? machineName, string message, uint timeoutSeconds, bool bForceAppsClosed, bool bRebootAfterShutdown, uint dwReason);
}
