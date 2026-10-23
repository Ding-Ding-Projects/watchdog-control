using System.Security.Cryptography;
using System.Text;
using Watchdog.Contracts;

namespace Watchdog.Web;

public sealed class AgentOperationsService(
    ControlStateStore store,
    BootstrapService bootstrapService)
{
    private static readonly TimeSpan AgentFreshness = TimeSpan.FromSeconds(75);
    private static readonly TimeSpan InvitationLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan PowerChallengeLifetime = TimeSpan.FromSeconds(90);

    public CreateInvitationResponse CreateInvitation(string actor, string displayName)
    {
        var code = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        var id = Guid.NewGuid().ToString("N");
        var expiresAt = DateTimeOffset.UtcNow.Add(InvitationLifetime);
        store.Mutate(state =>
        {
            state.Invitations.RemoveAll(invitation =>
                invitation.ExpiresAt <= DateTimeOffset.UtcNow || invitation.Consumed);
            state.Invitations.Add(new InvitationRecord(
                id,
                displayName.Trim(),
                SessionService.HashValue(code),
                expiresAt,
                false));
            SessionService.AddAudit(state, actor, "agent.invitation.created", id, "success", null);
        });
        return new CreateInvitationResponse(id, code, displayName.Trim(), expiresAt);
    }

    public (string AgentId, string AgentToken, string DisplayName)? Enroll(
        string pairingCode,
        EnrollRequest request)
    {
        if (!ValidId(request.AgentId) ||
            !ValidText(request.DisplayName, 2, 80) ||
            !ValidText(request.Platform, 2, 80) ||
            !ValidText(request.AgentVersion, 1, 40))
        {
            return null;
        }

        var suppliedHash = SessionService.HashValue(pairingCode);
        var bootstrapHash = bootstrapService.HashBootstrapFile(
            "WATCHDOG_AGENT_ENROLLMENT_CODE_FILE",
            "watchdog_agent_enrollment_code");
        var agentToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var agentTokenHash = SessionService.HashValue(agentToken);
        var enrolled = store.Mutate(state =>
        {
            InvitationRecord? invitation = state.Invitations.FirstOrDefault(candidate =>
                !candidate.Consumed &&
                candidate.ExpiresAt > DateTimeOffset.UtcNow &&
                FixedHashEquals(candidate.CodeHash, suppliedHash));

            var bootstrapMatches = bootstrapHash is not null &&
                !state.BootstrapAgentEnrollmentConsumed &&
                FixedHashEquals(bootstrapHash, suppliedHash);

            if (invitation is null && !bootstrapMatches)
            {
                SessionService.AddAudit(state, "agent-enrollment", "agent.enroll", request.AgentId, "rejected", null);
                return false;
            }

            if (state.Agents.Any(agent => agent.Id == request.AgentId && !agent.Revoked))
            {
                SessionService.AddAudit(state, "agent-enrollment", "agent.enroll", request.AgentId, "rejected", "duplicate-id");
                return false;
            }

            var now = DateTimeOffset.UtcNow;
            state.Agents.RemoveAll(agent => agent.Id == request.AgentId);
            state.Agents.Add(new AgentRecord(
                request.AgentId,
                invitation?.DisplayName ?? request.DisplayName.Trim(),
                request.Platform.Trim(),
                request.DisplayName.Trim(),
                request.AgentVersion.Trim(),
                agentTokenHash,
                now,
                now,
                null,
                false));

            if (invitation is not null)
            {
                state.Invitations.Remove(invitation);
            }

            if (bootstrapMatches)
            {
                state.BootstrapAgentEnrollmentConsumed = true;
            }

            SessionService.AddAudit(state, "agent-enrollment", "agent.enroll", request.AgentId, "success", null);
            return true;
        });

        return enrolled ? (request.AgentId, agentToken, request.DisplayName.Trim()) : null;
    }

    public bool TryAuthenticate(string? authorizationHeader, out string? agentId)
    {
        agentId = null;
        if (authorizationHeader is null ||
            !authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var token = authorizationHeader["Bearer ".Length..].Trim();
        if (token.Length is < 32 or > 256)
        {
            return false;
        }

        var tokenHash = SessionService.HashValue(token);
        var agent = store.Read(state => state.Agents.FirstOrDefault(candidate =>
            !candidate.Revoked && FixedHashEquals(candidate.AccessTokenHash, tokenHash)));
        agentId = agent?.Id;
        return agent is not null;
    }

    public string? RequiredConfirmation(string hostId, OperationRequest request)
    {
        if (request.TargetId is null)
        {
            return null;
        }

        return store.Read(state =>
        {
            var snapshot = state.Agents.FirstOrDefault(agent =>
                agent.Id == hostId && !agent.Revoked)?.Snapshot;
            if (snapshot is null)
            {
                return null;
            }

            return request.Kind switch
            {
                "service.stop" when snapshot.Services.FirstOrDefault(service => service.Id == request.TargetId) is { } service
                    => $"STOP SERVICE {service.DisplayName}",
                "service.restart" when snapshot.Services.FirstOrDefault(service => service.Id == request.TargetId) is { } service
                    => $"RESTART SERVICE {service.DisplayName}",
                "process.terminate" when snapshot.Processes.FirstOrDefault(process =>
                    process.Identity == request.TargetId) is { } process
                    => $"TERMINATE PROCESS {process.Name} ({process.Id})",
                _ => null
            };
        });
    }

    public AgentPollResponse Poll(string agentId)
    {
        return store.Mutate(state =>
        {
            var agent = state.Agents.FirstOrDefault(candidate => candidate.Id == agentId && !candidate.Revoked);
            if (agent is null)
            {
                return new AgentPollResponse(null, null, 15);
            }

            agent = agent with { LastSeenAt = DateTimeOffset.UtcNow };
            ReplaceAgent(state, agent);

            var next = state.Operations.FirstOrDefault(operation =>
                operation.HostId == agentId && operation.Status == "queued");
            if (next is not null)
            {
                next = next with { Status = "running" };
                ReplaceOperation(state, next);
            }

            return new AgentPollResponse(agent.Snapshot, next, 15);
        });
    }

    public bool AcceptHeartbeat(string agentId, HostSnapshot snapshot)
    {
        if (snapshot.AgentId != agentId || snapshot.Services.Count > 5_000 ||
            snapshot.Processes.Count > 10_000 || snapshot.Volumes.Count > 1_000 ||
            snapshot.Networks.Count > 1_000 || snapshot.Events.Count > 1_000)
        {
            return false;
        }

        return store.Mutate(state =>
        {
            var index = state.Agents.FindIndex(candidate => candidate.Id == agentId && !candidate.Revoked);
            if (index < 0)
            {
                return false;
            }

            var agent = state.Agents[index];
            state.Agents[index] = agent with
            {
                Hostname = snapshot.Hostname,
                AgentVersion = snapshot.AgentVersion,
                LastSeenAt = DateTimeOffset.UtcNow,
                Snapshot = snapshot
            };
            return true;
        });
    }

    public bool AcceptOperationResult(string agentId, OperationResultRequest result)
    {
        if (!ValidId(result.OperationId) ||
            result.Status is not ("succeeded" or "failed" or "cancelled") ||
            result.Result?.Length > 2_000)
        {
            return false;
        }

        return store.Mutate(state =>
        {
            var index = state.Operations.FindIndex(operation =>
                operation.Id == result.OperationId &&
                operation.HostId == agentId &&
                operation.Status == "running");
            if (index < 0)
            {
                return false;
            }

            var operation = state.Operations[index] with
            {
                Status = result.Status,
                Result = result.Result,
                CompletedAt = DateTimeOffset.UtcNow
            };
            state.Operations[index] = operation;
            SessionService.AddAudit(
                state,
                operation.RequestedBy,
                "operation.completed",
                $"{agentId}:{operation.Kind}",
                result.Status,
                result.Result);
            return true;
        });
    }

    public PowerChallengeResponse? PreparePower(string actor, string hostId, string kind)
    {
        if (kind is not ("host.restart" or "host.shutdown"))
        {
            return null;
        }

        return store.Mutate(state =>
        {
            var host = state.Agents.FirstOrDefault(agent =>
                agent.Id == hostId && !agent.Revoked && DateTimeOffset.UtcNow - agent.LastSeenAt <= AgentFreshness);
            if (host is null)
            {
                SessionService.AddAudit(state, actor, "power.prepare", hostId, "rejected", "host-offline");
                return null;
            }

            var verb = kind == "host.restart" ? "RESTART" : "SHUTDOWN";
            var phrase = $"{verb} {host.Hostname}";
            var challenge = new PowerChallengeRecord(
                Guid.NewGuid().ToString("N"),
                hostId,
                kind,
                phrase,
                actor,
                DateTimeOffset.UtcNow.Add(PowerChallengeLifetime),
                false);
            state.PowerChallenges.RemoveAll(candidate =>
                candidate.ExpiresAt <= DateTimeOffset.UtcNow || candidate.Consumed);
            state.PowerChallenges.Add(challenge);
            SessionService.AddAudit(state, actor, "power.prepare", $"{hostId}:{kind}", "awaiting-confirmation", null);
            return new PowerChallengeResponse(
                challenge.Id,
                host.Hostname,
                kind,
                phrase,
                challenge.ExpiresAt);
        });
    }

    public OperationRecord? ConfirmPower(string actor, string challengeId, string phrase)
    {
        return store.Mutate(state =>
        {
            var challenge = state.PowerChallenges.FirstOrDefault(candidate =>
                candidate.Id == challengeId && !candidate.Consumed);
            if (challenge is null || challenge.ExpiresAt <= DateTimeOffset.UtcNow ||
                !string.Equals(challenge.RequestedBy, actor, StringComparison.Ordinal) ||
                !string.Equals(challenge.ConfirmationPhrase, phrase, StringComparison.Ordinal))
            {
                SessionService.AddAudit(state, actor, "power.confirm", challengeId, "rejected", null);
                return null;
            }

            var operation = NewOperation(challenge.HostId, challenge.Kind, null, actor);
            state.Operations.Add(operation);
            var index = state.PowerChallenges.IndexOf(challenge);
            state.PowerChallenges[index] = challenge with { Consumed = true };
            SessionService.AddAudit(
                state,
                actor,
                "power.confirmed",
                $"{challenge.HostId}:{challenge.Kind}",
                "queued",
                operation.Id);
            return operation;
        });
    }

    public (OperationRecord? Operation, string? Error) QueueOperation(
        string actor,
        string hostId,
        OperationRequest request)
    {
        if (request.Kind is not (
            "system.refresh" or
            "network.flushDns" or
            "service.start" or
            "service.stop" or
            "service.restart" or
            "process.terminate"))
        {
            return (null, "unsupported-operation");
        }

        return store.Mutate<(OperationRecord? Operation, string? Error)>(state =>
        {
            var host = state.Agents.FirstOrDefault(agent =>
                agent.Id == hostId && !agent.Revoked && DateTimeOffset.UtcNow - agent.LastSeenAt <= AgentFreshness);
            if (host?.Snapshot is null)
            {
                return (null, "host-offline");
            }

            if (request.Kind.StartsWith("service.", StringComparison.Ordinal) &&
                (request.TargetId is null || !host.Snapshot.Services.Any(service => service.Id == request.TargetId)))
            {
                return (null, "service-not-in-current-inventory");
            }

            if (request.Kind == "process.terminate" &&
                (request.TargetId is null || !host.Snapshot.Processes.Any(process => process.Identity == request.TargetId)))
            {
                return (null, "process-not-in-current-inventory");
            }

            var expectedPhrase = request.Kind switch
            {
                "service.stop" => $"STOP SERVICE {host.Snapshot.Services.First(service => service.Id == request.TargetId).DisplayName}",
                "service.restart" => $"RESTART SERVICE {host.Snapshot.Services.First(service => service.Id == request.TargetId).DisplayName}",
                "process.terminate" => $"TERMINATE PROCESS {host.Snapshot.Processes.First(process => process.Identity == request.TargetId).Name} ({host.Snapshot.Processes.First(process => process.Identity == request.TargetId).Id})",
                _ => null
            };
            if (expectedPhrase is not null &&
                !string.Equals(expectedPhrase, request.ConfirmationPhrase, StringComparison.Ordinal))
            {
                SessionService.AddAudit(state, actor, "operation.requested", $"{hostId}:{request.Kind}", "rejected", "confirmation-required");
                return (null, "confirmation-required");
            }

            var operation = NewOperation(hostId, request.Kind, request.TargetId, actor);
            state.Operations.Add(operation);
            SessionService.AddAudit(state, actor, "operation.requested", $"{hostId}:{request.Kind}", "queued", operation.Id);
            return (operation, null);
        });
    }

    public void RevokeAgent(string actor, string agentId)
    {
        store.Mutate(state =>
        {
            var index = state.Agents.FindIndex(agent => agent.Id == agentId && !agent.Revoked);
            if (index >= 0)
            {
                state.Agents[index] = state.Agents[index] with { Revoked = true };
                SessionService.AddAudit(state, actor, "agent.revoked", agentId, "success", null);
            }
        });
    }

    private static OperationRecord NewOperation(string hostId, string kind, string? targetId, string actor) =>
        new(
            Guid.NewGuid().ToString("N"),
            hostId,
            kind,
            targetId,
            "queued",
            actor,
            null,
            DateTimeOffset.UtcNow,
            null);

    private static void ReplaceAgent(ControlState state, AgentRecord updated)
    {
        var index = state.Agents.FindIndex(agent => agent.Id == updated.Id);
        if (index >= 0)
        {
            state.Agents[index] = updated;
        }
    }

    private static void ReplaceOperation(ControlState state, OperationRecord updated)
    {
        var index = state.Operations.FindIndex(operation => operation.Id == updated.Id);
        if (index >= 0)
        {
            state.Operations[index] = updated;
        }
    }

    private static bool FixedHashEquals(string expectedHex, string actualHex)
    {
        try
        {
            return CryptographicOperations.FixedTimeEquals(
                Convert.FromHexString(expectedHex),
                Convert.FromHexString(actualHex));
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool ValidId(string value) =>
        value.Length is >= 8 and <= 80 &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    private static bool ValidText(string value, int minimumLength, int maximumLength) =>
        value.Length >= minimumLength &&
        value.Length <= maximumLength &&
        !value.Any(char.IsControl);
}
