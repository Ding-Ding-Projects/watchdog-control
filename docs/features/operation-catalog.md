# Typed operation catalog

**Source state: implemented. Runtime enforcement: not yet verified against an enrolled host.** The controller accepts a fixed set of operation identifiers. It does not accept shell text, executable paths, or caller-selected commands.

## Supported workflows

| Operation | Target | Additional confirmation | Behavior |
| --- | --- | --- | --- |
| `system.refresh` | Enrolled host | None | Requests a fresh inventory from the host agent. |
| `network.flushDns` | Enrolled host | None | Refreshes the host DNS resolver cache. |
| `service.start` | Service ID from the current inventory | None | Starts the selected service, or reports that it is already running. |
| `service.stop` | Service ID from the current inventory | Exact `STOP SERVICE <display name>` phrase | Stops a stoppable service. |
| `service.restart` | Service ID from the current inventory | Exact `RESTART SERVICE <display name>` phrase | Restarts a stoppable service. |
| `process.terminate` | Process identity from the current inventory | Exact `TERMINATE PROCESS <name> (<pid>)` phrase | Terminates the selected process unless its identity is protected. |
| `host.restart` | Online enrolled host | Separate 90-second challenge and exact `RESTART <host name>` phrase | Queues a computer restart after the requesting account confirms its own challenge. |
| `host.shutdown` | Online enrolled host | Separate 90-second challenge and exact `SHUTDOWN <host name>` phrase | Queues a computer shutdown after the requesting account confirms its own challenge. |

Service and process targets must still appear in the host's latest inventory when the controller accepts the request. Power challenges are single-use, expire after 90 seconds, and are bound to the account that requested them. The controller records operation requests, rejected confirmations, accepted power confirmations, and returned results in its audit history.

## Using the dashboard

1. Sign in to an authenticated controller session and select an online host.
2. Refresh host inventory before acting on a service or process. A stale or missing target is rejected.
3. Choose a typed action in the service, process, network, or power workflow. The dashboard displays a confirmation step for service stop, service restart, process termination, computer restart, and computer shutdown.
4. For a power action, prepare a challenge, read the host-specific confirmation phrase, and confirm before the 90-second expiry. A mismatched, expired, reused, or different-account challenge is rejected.
5. Follow the returned operation record and audit entry. A queued request is not proof that the host completed it; the host agent must return the result.

## API and configuration

The operation route is `POST /api/hosts/{hostId}/operations`. Power uses `POST /api/hosts/{hostId}/power/prepare` followed by `POST /api/power/{challengeId}/confirm`. Request and response records are defined in `src/Watchdog.Web/Contracts.cs`; controller validation is in `src/Watchdog.Web/AgentOperationsService.cs`, and host execution is in `src/Watchdog.Agent/AgentOperationExecutor.cs`.

Every request requires an authenticated owner session. The controller validates operation identifiers and current inventory identities before queueing. The host agent validates service and process identities again during execution. Unsupported identifiers and arbitrary shell input are not accepted.

## Failure and security behavior

- An unsupported operation returns an error instead of executing an arbitrary command.
- An offline or stale host cannot receive a new operation or power challenge.
- A service or process target missing from the current inventory is rejected.
- Destructive operations require the exact current display-name or process-identity phrase.
- Power challenges expire after 90 seconds, belong to the requesting account, and cannot be reused.
- Protected system processes are rejected by the host agent.
- A controller timeout or lost response is an unknown outcome until the operation record or a fresh host result is read.

These checks reduce accidental actions; they do not replace host isolation, least-privilege deployment, or review of the selected target. Do not use the product to operate a computer without authorization.

## Verification state

Source inspection confirms the fixed identifiers, identity checks, confirmation phrases, 90-second power challenge, single-use behavior, and audit writes. The local product build passed earlier in this task. No operation has been executed against a live host as part of this verification, so end-to-end enforcement and host results remain unverified. See [restart and shutdown](power-actions.md), [services and processes](services-processes.md), and the [API collection](../api/README.md).
