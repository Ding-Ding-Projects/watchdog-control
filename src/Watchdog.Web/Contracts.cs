using Watchdog.Contracts;

namespace Watchdog.Web;

public sealed record PairRequest(string Code, string Username, string Password);
public sealed record LoginRequest(string Username, string Password);
public sealed record CreateInvitationRequest(string DisplayName);

public sealed record OwnerRecord(
    string Id,
    string Username,
    string PasswordSalt,
    string PasswordHash,
    DateTimeOffset CreatedAt);

public sealed record SessionRecord(string IdHash, string OwnerId, DateTimeOffset ExpiresAt);
public sealed record AgentRecord(
    string Id,
    string DisplayName,
    string Platform,
    string Hostname,
    string AgentVersion,
    string AccessTokenHash,
    DateTimeOffset EnrolledAt,
    DateTimeOffset LastSeenAt,
    HostSnapshot? Snapshot,
    bool Revoked);

public sealed record InvitationRecord(
    string Id,
    string DisplayName,
    string CodeHash,
    DateTimeOffset ExpiresAt,
    bool Consumed);

public sealed record PowerChallengeRecord(
    string Id,
    string HostId,
    string Kind,
    string ConfirmationPhrase,
    string RequestedBy,
    DateTimeOffset ExpiresAt,
    bool Consumed);

public sealed record AuditRecord(
    string Id,
    DateTimeOffset Time,
    string Actor,
    string Action,
    string Target,
    string Outcome,
    string? Detail);

public sealed class ControlState
{
    public int SchemaVersion { get; set; } = 1;
    public bool OwnerCreated { get; set; }
    public bool BootstrapPairingConsumed { get; set; }
    public bool BootstrapAgentEnrollmentConsumed { get; set; }
    public List<OwnerRecord> Owners { get; set; } = [];
    public List<SessionRecord> Sessions { get; set; } = [];
    public List<AgentRecord> Agents { get; set; } = [];
    public List<InvitationRecord> Invitations { get; set; } = [];
    public List<OperationRecord> Operations { get; set; } = [];
    public List<PowerChallengeRecord> PowerChallenges { get; set; } = [];
    public List<AuditRecord> Audit { get; set; } = [];
}

public sealed record AgentPollResponse(
    HostSnapshot? LatestSnapshot,
    OperationRecord? Operation,
    int PollAfterSeconds);

public sealed record CreateInvitationResponse(
    string Id,
    string Code,
    string DisplayName,
    DateTimeOffset ExpiresAt);

public sealed record PowerChallengeResponse(
    string ChallengeId,
    string HostName,
    string Kind,
    string ConfirmationPhrase,
    DateTimeOffset ExpiresAt);

public sealed record HostView(
    string Id,
    string DisplayName,
    string Platform,
    string Hostname,
    string AgentVersion,
    DateTimeOffset EnrolledAt,
    DateTimeOffset LastSeenAt,
    HostSnapshot? Snapshot,
    bool Online,
    bool Revoked);

public sealed record DashboardResponse(
    DateTimeOffset ServerTime,
    IReadOnlyList<HostView> Hosts,
    IReadOnlyList<OperationRecord> Operations,
    IReadOnlyList<AuditRecord> Audit,
    bool PairingRequired);
