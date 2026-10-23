# Typed operation catalog

**Source state: implemented. Runtime enforcement remains unverified against an enrolled host.** The controller exposes a fixed set of typed actions and rejects arbitrary shell text, executable paths, and caller-selected commands.

## Inventory

| Identifier | Required target | Confirmation | Notes |
| --- | --- | --- | --- |
| `system.refresh` | Enrolled host | None | Requests updated host inventory. |
| `network.flushDns` | Enrolled host | None | Refreshes the host DNS resolver cache. |
| `service.start` | Service ID in the current inventory | None | Starts the selected service. |
| `service.stop` | Service ID in the current inventory | `STOP SERVICE <display name>` | The exact current service display name is required. |
| `service.restart` | Service ID in the current inventory | `RESTART SERVICE <display name>` | The exact current service display name is required. |
| `process.terminate` | Process identity in the current inventory | `TERMINATE PROCESS <name> (<pid>)` | Protected system processes cannot be terminated. |
| `host.restart` | Online enrolled host | 90-second one-time challenge: `RESTART <host name>` | Confirmation must come from the requesting account. |
| `host.shutdown` | Online enrolled host | 90-second one-time challenge: `SHUTDOWN <host name>` | Confirmation must come from the requesting account. |

The operation request route is `POST /api/hosts/{hostId}/operations`. Power actions use `POST /api/hosts/{hostId}/power/prepare` and `POST /api/power/{challengeId}/confirm`. The controller rechecks the host, current target identity, expiry, requesting account, and exact confirmation phrase before queueing an operation. Requests and outcomes are written to the audit history.

## Task workflow

1. Authenticate as an owner and open an online host.
2. Refresh the inventory and select a target from the current service or process list.
3. Review the action and confirmation text shown by the dashboard. Do not copy a confirmation from an older inventory snapshot.
4. For a computer restart or shutdown, prepare a fresh challenge and confirm it within 90 seconds.
5. Read the operation state and returned host result. A queued operation is not proof of completion.

## Rejection and recovery

The controller rejects unsupported identifiers, offline hosts, missing current targets, mismatched confirmation text, expired challenges, reused challenges, and confirmations from a different account. If the response is lost, inspect the operation record and host heartbeat before retrying. Never infer success from a request timeout.

## Verification boundary

Source inspection verifies the operation inventory and controller-side checks. The local build passed earlier in this task, but no operation has been executed against a live enrolled host. Runtime permissions, host execution, and audit readback remain unverified. See [security and identity](security.md), [services and processes](services-processes.md), and [restart and shutdown](power-actions.md).
