# Controller HTTP API

## Routes and authentication

The controller API provides `GET /health` and `GET /api/setup/status` for readiness and first-owner state. `POST /api/setup/pair` consumes the setup assistant's one-time owner code and creates the initial administrator. `POST /api/session`, `GET /api/session`, and `DELETE /api/session` manage the administrator session cookie.

`GET /api/dashboard` reads enrolled host snapshots, recent operations, and audit history. `POST /api/agents/invitations` issues a ten-minute one-time enrollment code, while `DELETE /api/agents/{agentId}` revokes an enrolled agent. `POST /api/agent/enroll` redeems an enrollment code for a host-agent bearer token. The agent then sends bounded host snapshots to `POST /api/agent/heartbeat`, checks for work through `GET /api/agent/poll`, and submits the actual result to `POST /api/agent/results`.

## Typed operations

An administrator can queue only `system.refresh`, `network.flushDns`, `service.start`, `service.stop`, `service.restart`, or `process.terminate` through `POST /api/hosts/{hostId}/operations`. The host and target must exist in the latest sufficiently recent inventory. Stopping or restarting a service and terminating a process requires the exact server-generated confirmation phrase.

Shutdown and restart use `POST /api/hosts/{hostId}/power/prepare` followed by `POST /api/power/{challengeId}/confirm`. The preparation response binds the 90-second challenge to the requesting administrator and host. The exact phrase must match. Both routes return an operation record that can be read through `GET /api/operations/{operationId}`. A queued or running result is still pending.

## Safe access

The API accepts only loopback or private LAN source addresses. First-owner setup and sign-in require HTTPS outside development. The owner cookie is HttpOnly, Secure in production, SameSite Strict, and expires after eight hours. Host-agent access uses a separate bearer token. Invitation codes and agent tokens must not be committed or pasted into public records.

The importable [Postman master collection](https://ding-ding-projects.github.io/watchdog-control/api/watchdog-control.postman_collection.json) covers the current controller routes. Its requests are examples; they do not prove live server behavior. See the [HTTP API feature article](../features/http-api.md) for certificate verification, private environment setup, response states, and collection limitations.

## Evidence state

The controller and request records compile in the local root build. The packaged assistant also completed its local build. No controller request, host-agent enrollment, remote operation, or live LAN check has been performed.
