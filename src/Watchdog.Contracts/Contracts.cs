namespace Watchdog.Contracts;

public sealed record EnrollRequest(string AgentId, string DisplayName, string Platform, string AgentVersion);
public sealed record OperationRequest(string Kind, string? TargetId, string? ConfirmationPhrase);
public sealed record ConfirmPowerRequest(string ConfirmationPhrase);
public sealed record PreparePowerRequest(string Kind, string HostId);

public sealed record HostSnapshot(
    string AgentId,
    string DisplayName,
    string Platform,
    string Hostname,
    string OperatingSystem,
    string AgentVersion,
    DateTimeOffset CollectedAt,
    long UptimeSeconds,
    double? CpuPercent,
    long? MemoryUsedBytes,
    long? MemoryTotalBytes,
    IReadOnlyList<ServiceRecord> Services,
    IReadOnlyList<ProcessRecord> Processes,
    IReadOnlyList<VolumeRecord> Volumes,
    IReadOnlyList<NetworkRecord> Networks,
    IReadOnlyList<EventRecord> Events,
    FirewallRecord Firewall,
    UpdateRecord Updates);

public sealed record ServiceRecord(string Id, string DisplayName, string Status, string StartType);
public sealed record ProcessRecord(int Id, string Identity, string Name, long WorkingSetBytes, DateTimeOffset? StartedAt);
public sealed record VolumeRecord(string Name, string Label, string FileSystem, long TotalBytes, long FreeBytes);
public sealed record NetworkRecord(string Name, string Description, string Status, IReadOnlyList<string> Addresses);
public sealed record EventRecord(string Channel, DateTimeOffset Time, string Level, string Source, string Message);
public sealed record FirewallRecord(string Domain, string Private, string Public);
public sealed record UpdateRecord(string Status, DateTimeOffset? LastCheckedAt, IReadOnlyList<string> Pending);

public sealed record OperationRecord(
    string Id,
    string HostId,
    string Kind,
    string? TargetId,
    string Status,
    string RequestedBy,
    string? Result,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

public sealed record AgentPollResponse(
    HostSnapshot? LatestSnapshot,
    OperationRecord? Operation,
    int PollAfterSeconds);

public sealed record OperationResultRequest(string OperationId, string Status, string? Result);
