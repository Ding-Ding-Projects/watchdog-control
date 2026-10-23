# HTTP API reference

The [API-category collection](watchdog-control.postman_collection.json) and [project master collection](https://ding-ding-projects.github.io/watchdog-control/api/watchdog-control.postman_collection.json) contain the same source-bound requests for the Watchdog Control controller API. This project currently has one HTTP API. Import either JSON into Postman to inspect the requests; the collection does not send requests or establish runtime proof by itself.

## Connect safely

1. Set `baseUrl` to the HTTPS address printed by the setup assistant, including its port. The API accepts requests only from loopback or a private LAN address. A public Internet request is rejected.
2. Before sending owner credentials, verify the certificate fingerprint shown by the setup assistant and trust that certificate on the computer running Postman. Do not disable certificate verification to silence a warning.
3. Use the Postman cookie jar for the `watchdog_session` cookie returned by first-owner pairing or sign-in. The cookie is HttpOnly, Secure, SameSite Strict, and expires after eight hours.
4. Keep pairing codes, passwords, invitation codes, and agent tokens in a local, private Postman environment. Never save their values in the collection file or a shared environment.
5. The first owner is created once with `POST /api/setup/pair`. Later administrator requests use the cookie. Agent requests use `Authorization: Bearer` with the agent token.

## Main workflows

### Create the first owner

Read `GET /api/setup/status`. If `pairingRequired` is true, send `POST /api/setup/pair` over HTTPS with the setup assistant's one-time pairing code, a username, and a password of at least 14 characters. A successful response sets the session cookie and consumes the one-time code.

### Sign in and review hosts

Use `POST /api/session`, then `GET /api/session` and `GET /api/dashboard`. The dashboard returns current host snapshots, recent operations, and audit records. It does not prove that a host is online now; inspect each host's `online` value and `lastSeenAt`.

### Enroll or revoke a host agent

An administrator creates a short-lived invitation with `POST /api/agents/invitations`. Save the returned code directly into a protected local environment variable and deliver it through the intended trusted setup path. The agent redeems it once with `POST /api/agent/enroll`, then uses its bearer token for heartbeat, poll, and result requests. Revoke an enrolled host with `DELETE /api/agents/{agentId}`.

### Request a typed operation

`POST /api/hosts/{hostId}/operations` accepts only `system.refresh`, `network.flushDns`, `service.start`, `service.stop`, `service.restart`, and `process.terminate`, with a target that exists in the latest host snapshot. Stopping or restarting a service and terminating a process requires a second request containing the exact `requiredPhrase` returned by the first `409 confirmation-required` response. A successful request returns `202 Accepted`; query the returned operation URL until its status is terminal.

### Request shutdown or restart

Call `POST /api/hosts/{hostId}/power/prepare` with `host.restart` or `host.shutdown`. Review the host name, action, exact confirmation phrase, and expiry. Only then call `POST /api/power/{challengeId}/confirm` with that exact phrase. The action is queued for the enrolled agent and can fail before completion. If the connection drops, query the operation and request fresh host status before deciding whether any further action is safe.

## Authentication and response handling

| Route family | Authentication | Common response states |
| --- | --- | --- |
| `/health`, `/api/setup/status` | None | `200`; health response is `{ "status": "ready" }`. |
| `/api/setup/pair`, `/api/session` | One-time bootstrap code or owner credentials | `200`, `400`, `401`, `426`, or `429`. Pairing and sign-in have rate limits. |
| `/api/agent/*` | Agent bearer token, except one-time enrollment uses an invitation code | `200`, `204`, `400`, or `401`. |
| `/api/agents/*`, `/api/dashboard`, `/api/hosts/*`, `/api/operations/*` | Owner session cookie | `200`, `202`, `204`, `400`, `401`, `403`, `404`, or `409`. |

The controller uses same-origin checks for state-changing requests carrying an owner session cookie. The collection sends an `Origin` matching `baseUrl` on those requests. The controller also rejects controller API traffic that does not originate from a private or loopback address. HTTPS is required for owner setup and sign-in outside development. In production, certificates are not to be ignored or accepted without fingerprint verification.

## Typed schemas

- `PairRequest`: `{ "code": "{{ownerPairingCode}}", "username": "{{ownerUsername}}", "password": "{{ownerPassword}}" }`.
- `LoginRequest`: `{ "username": "{{ownerUsername}}", "password": "{{ownerPassword}}" }`.
- `CreateInvitationRequest`: `{ "displayName": "{{agentDisplayName}}" }`.
- `EnrollRequest`: `{ "agentId": "{{agentId}}", "displayName": "{{agentDisplayName}}", "platform": "Windows", "agentVersion": "{{agentVersion}}" }`.
- `OperationRequest`: `{ "kind": "service.start", "targetId": "{{serviceId}}", "confirmationPhrase": null }`.
- `PreparePowerRequest`: `{ "kind": "host.restart", "hostId": "{{hostId}}" }`.
- `ConfirmPowerRequest`: `{ "confirmationPhrase": "{{powerConfirmationPhrase}}" }`.
- `OperationResultRequest`: `{ "operationId": "{{operationId}}", "status": "succeeded", "result": "Completed" }`.

`HostSnapshot` is the agent's complete bounded inventory payload. Its typed record is in [`../../src/Watchdog.Contracts/Contracts.cs`](../../src/Watchdog.Contracts/Contracts.cs); the controller rejects oversized collections and request bodies. Use a real agent build for heartbeat and result traffic instead of hand-authoring a fabricated host snapshot.

## Source and limits

Routes are implemented in [`../../src/Watchdog.Web/Program.cs`](../../src/Watchdog.Web/Program.cs), with state and authorization in the adjacent service files. The root build completed locally, but no Postman request, installed controller, enrolled agent, remote host action, or LAN endpoint was exercised during collection preparation. The collection documents the source contract; it is not a live server description.
