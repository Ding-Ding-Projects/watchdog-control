using System.Diagnostics;
using System.Globalization;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Watchdog.Contracts;

namespace Watchdog.Agent;

public sealed class HostInventoryCollector
{
    private readonly object _updateSync = new();
    private Task<UpdateRecord>? _updateScan;
    private DateTimeOffset _lastUpdateScanAt;
    private UpdateRecord _lastUpdates = new("Not checked", null, []);

    public HostSnapshot Collect(AgentConfiguration configuration)
    {
        var memory = ReadMemory();
        return new HostSnapshot(
            configuration.AgentId,
            configuration.DisplayName,
            "Windows",
            Environment.MachineName,
            Environment.OSVersion.VersionString,
            typeof(HostInventoryCollector).Assembly.GetName().Version?.ToString() ?? "0.1.2",
            DateTimeOffset.UtcNow,
            Environment.TickCount64 / 1000,
            ReadCpuPercent(),
            memory.Used,
            memory.Total,
            ReadServices(),
            ReadProcesses(),
            ReadVolumes(),
            ReadNetworks(),
            ReadEvents(),
            ReadFirewall(),
            ReadUpdates());
    }

    private static IReadOnlyList<ServiceRecord> ReadServices()
    {
        try
        {
            return ServiceController.GetServices()
                .OrderBy(service => service.DisplayName, StringComparer.OrdinalIgnoreCase)
                .Take(2_000)
                .Select(service =>
                {
                    using (service)
                    {
                        return new ServiceRecord(
                            service.ServiceName,
                            Limit(service.DisplayName, 128),
                            service.Status.ToString(),
                            ReadServiceStartType(service.ServiceName));
                    }
                })
                .ToArray();
        }
        catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
        {
            return [];
        }
    }

    private static string ReadServiceStartType(string serviceName)
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey($"SYSTEM\\CurrentControlSet\\Services\\{serviceName}", writable: false);
            return key?.GetValue("Start") is int value
                ? value switch { 0 => "Boot", 1 => "System", 2 => "Automatic", 3 => "Manual", 4 => "Disabled", _ => "Unknown" }
                : "Unknown";
        }
        catch (UnauthorizedAccessException)
        {
            return "Unknown";
        }
    }

    private static IReadOnlyList<ProcessRecord> ReadProcesses()
    {
        var records = new List<ProcessRecord>();
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try
                {
                    DateTimeOffset? started = null;
                    string startIdentity = "unknown";
                    try
                    {
                        var startTime = process.StartTime.ToUniversalTime();
                        started = new DateTimeOffset(startTime, TimeSpan.Zero);
                        startIdentity = started.Value.UtcDateTime.Ticks.ToString(CultureInfo.InvariantCulture);
                    }
                    catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
                    {
                    }
                    records.Add(new ProcessRecord(
                        process.Id,
                        $"{process.Id.ToString(CultureInfo.InvariantCulture)}:{startIdentity}",
                        Limit(process.ProcessName, 128),
                        Math.Max(0, process.WorkingSet64),
                        started));
                }
                catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
                {
                }
            }
        }
        return records.OrderByDescending(process => process.WorkingSetBytes).Take(2_000).ToArray();
    }

    private static IReadOnlyList<VolumeRecord> ReadVolumes()
    {
        try
        {
            return DriveInfo.GetDrives().Where(drive => drive.IsReady).Select(drive =>
            {
                try
                {
                    return new VolumeRecord(
                        Limit(drive.Name, 260),
                        Limit(drive.VolumeLabel, 128),
                        Limit(drive.DriveFormat, 32),
                        Math.Max(0, drive.TotalSize),
                        Math.Max(0, drive.AvailableFreeSpace));
                }
                catch (IOException)
                {
                    return null;
                }
            }).Where(record => record is not null).Select(record => record!).ToArray();
        }
        catch (IOException)
        {
            return [];
        }
    }

    private static IReadOnlyList<NetworkRecord> ReadNetworks()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Select(adapter => new NetworkRecord(
                    Limit(adapter.Name, 128),
                    Limit(adapter.Description, 256),
                    adapter.OperationalStatus.ToString(),
                    adapter.GetIPProperties().UnicastAddresses
                        .Select(address => address.Address)
                        .Where(address => address.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6)
                        .Select(address => address.ToString())
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .Take(32)
                        .ToArray()))
                .Take(256)
                .ToArray();
        }
        catch (NetworkInformationException)
        {
            return [];
        }
    }

    private static IReadOnlyList<EventRecord> ReadEvents()
    {
        var records = new List<EventRecord>();
        foreach (var channel in new[] { "System", "Application" })
        {
            try
            {
                using var log = new EventLog(channel);
                var entries = log.Entries;
                for (var index = entries.Count - 1; index >= 0 && records.Count < 80; index--)
                {
                    try
                    {
                        var entry = entries[index];
                        if (entry.TimeGenerated < DateTime.Now.AddDays(-7)) break;
                        records.Add(new EventRecord(
                            channel,
                            new DateTimeOffset(entry.TimeGenerated),
                            entry.EntryType.ToString(),
                            Limit(entry.Source, 128),
                            Limit(entry.Message, 1_200)));
                    }
                    catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
                    {
                    }
                }
            }
            catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or UnauthorizedAccessException or IOException)
            {
            }
        }
        return records.OrderByDescending(record => record.Time).Take(80).ToArray();
    }

    private static FirewallRecord ReadFirewall()
    {
        object? policy = null;
        try
        {
            var type = Type.GetTypeFromProgID("HNetCfg.FwPolicy2", throwOnError: false);
            if (type is null) return new FirewallRecord("Unknown", "Unknown", "Unknown");
            policy = Activator.CreateInstance(type);
            if (policy is null) return new FirewallRecord("Unknown", "Unknown", "Unknown");
            return new FirewallRecord(
                ReadFirewallProfile(policy, 1),
                ReadFirewallProfile(policy, 2),
                ReadFirewallProfile(policy, 4));
        }
        catch (Exception exception) when (exception is COMException or InvalidCastException or TargetInvocationException or UnauthorizedAccessException)
        {
            return new FirewallRecord("Unknown", "Unknown", "Unknown");
        }
        finally
        {
            if (policy is not null && Marshal.IsComObject(policy)) Marshal.FinalReleaseComObject(policy);
        }
    }

    private static string ReadFirewallProfile(object policy, int profile)
    {
        var enabled = policy.GetType().InvokeMember(
            "FirewallEnabled",
            System.Reflection.BindingFlags.GetProperty,
            binder: null,
            target: policy,
            args: [profile]);
        return Convert.ToBoolean(enabled, CultureInfo.InvariantCulture) ? "On" : "Off";
    }

    private UpdateRecord ReadUpdates()
    {
        Task<UpdateRecord> task;
        lock (_updateSync)
        {
            if ((_updateScan is null || _updateScan.IsCompleted) && DateTimeOffset.UtcNow - _lastUpdateScanAt >= TimeSpan.FromMinutes(30))
            {
                _lastUpdateScanAt = DateTimeOffset.UtcNow;
                _updateScan = Task.Run(ReadUpdateSearch);
            }
            task = _updateScan ?? Task.FromResult(_lastUpdates);
        }
        try
        {
            if (task.Wait(TimeSpan.FromSeconds(2)))
            {
                _lastUpdates = task.GetAwaiter().GetResult();
            }
            else if (_lastUpdates.Status == "Not checked")
            {
                _lastUpdates = new UpdateRecord("Checking Windows Update in the background", null, []);
            }
        }
        catch (Exception exception) when (exception is COMException or InvalidOperationException or UnauthorizedAccessException or AggregateException or TargetInvocationException)
        {
            _lastUpdates = new UpdateRecord("Update check unavailable", null, []);
        }
        return _lastUpdates;
    }

    private static UpdateRecord ReadUpdateSearch()
    {
        object? session = null;
        object? searcher = null;
        object? result = null;
        object? updates = null;
        try
        {
            var type = Type.GetTypeFromProgID("Microsoft.Update.Session", throwOnError: false);
            if (type is null) return new UpdateRecord("Windows Update is unavailable", null, []);
            session = Activator.CreateInstance(type);
            if (session is null) return new UpdateRecord("Windows Update is unavailable", null, []);
            searcher = session.GetType().InvokeMember("CreateUpdateSearcher", System.Reflection.BindingFlags.InvokeMethod, null, session, null);
            if (searcher is null) return new UpdateRecord("Windows Update search could not start", null, []);
            result = searcher.GetType().InvokeMember(
                "Search",
                System.Reflection.BindingFlags.InvokeMethod,
                null,
                searcher,
                ["IsInstalled=0 and IsHidden=0"]);
            if (result is null) return new UpdateRecord("Windows Update search returned no result", DateTimeOffset.UtcNow, []);
            updates = result.GetType().InvokeMember("Updates", System.Reflection.BindingFlags.GetProperty, null, result, null);
            if (updates is null) return new UpdateRecord("Windows Update search returned no update list", DateTimeOffset.UtcNow, []);
            var count = Convert.ToInt32(updates.GetType().InvokeMember("Count", System.Reflection.BindingFlags.GetProperty, null, updates, null), CultureInfo.InvariantCulture);
            var pending = new List<string>();
            for (var index = 0; index < Math.Min(count, 20); index++)
            {
                object? item = null;
                try
                {
                    item = updates.GetType().InvokeMember("Item", System.Reflection.BindingFlags.InvokeMethod, null, updates, [index]);
                    if (item is not null)
                    {
                        var title = item.GetType().InvokeMember("Title", System.Reflection.BindingFlags.GetProperty, null, item, null)?.ToString();
                        if (!string.IsNullOrWhiteSpace(title)) pending.Add(Limit(title, 240));
                    }
                }
                finally
                {
                    if (item is not null && Marshal.IsComObject(item)) Marshal.FinalReleaseComObject(item);
                }
            }
            return new UpdateRecord(count == 0 ? "No applicable updates found" : $"{count} updates available", DateTimeOffset.UtcNow, pending);
        }
        finally
        {
            if (result is not null && Marshal.IsComObject(result)) Marshal.FinalReleaseComObject(result);
            if (updates is not null && Marshal.IsComObject(updates)) Marshal.FinalReleaseComObject(updates);
            if (searcher is not null && Marshal.IsComObject(searcher)) Marshal.FinalReleaseComObject(searcher);
            if (session is not null && Marshal.IsComObject(session)) Marshal.FinalReleaseComObject(session);
        }
    }

    private static (long? Used, long? Total) ReadMemory()
    {
        var state = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
        return GlobalMemoryStatusEx(ref state)
            ? (checked((long)(state.TotalPhysical - state.AvailablePhysical)), checked((long)state.TotalPhysical))
            : (null, null);
    }

    private static double? ReadCpuPercent()
    {
        try
        {
            if (!GetSystemTimes(out var idleBefore, out var kernelBefore, out var userBefore)) return null;
            Thread.Sleep(100);
            if (!GetSystemTimes(out var idleAfter, out var kernelAfter, out var userAfter)) return null;
            var idle = idleAfter.Value - idleBefore.Value;
            var total = kernelAfter.Value - kernelBefore.Value + userAfter.Value - userBefore.Value;
            return total <= 0 ? null : Math.Round(Math.Clamp(100d * (total - idle) / total, 0, 100), 1);
        }
        catch (ThreadInterruptedException)
        {
            return null;
        }
    }

    private static string Limit(string? value, int maximum) =>
        string.IsNullOrEmpty(value) ? string.Empty : value.Length <= maximum ? value : value[..maximum];

    [StructLayout(LayoutKind.Sequential)]
    private struct FileTime
    {
        public uint Low;
        public uint High;
        public readonly long Value => ((long)High << 32) | Low;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MemoryStatus
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus buffer);
}
