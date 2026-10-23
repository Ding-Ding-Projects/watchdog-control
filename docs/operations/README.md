# Operations and recovery

This guide covers setup and service recovery for the source implementation. The root `build.bat` completed locally on 2026-10-23. Public release, image publication, live installation, and remote-client reachability are not verified.

## Start with the task

- [Install or resume setup](../features/setup-assistant.md) using the tailored portable assistant.
- [Deploy with the host controls](../features/deployment-recovery.md) when Docker Engine is already available.
- [Review typed host operations](../features/operation-catalog.md) before requesting a change on a managed Windows computer.
- [Review shutdown and restart confirmation](../features/power-actions.md) before dispatch.
- [Review security and identity](../security/README.md) before pairing or exposing a host.

## Container host

Deployment requires a published immutable image, tracked Compose configuration, an available host port, and a verified LAN route. The source now contains the Compose file, `host.bat`, its PowerShell implementation, image health endpoint, and setup wizard. None of these have yet been verified against a live container host.

`host.bat` offers detached, log-view, and explicit stop modes. Leaving the log view does not stop the service. Use `host.bat --stop` only when the operator intends to stop the named service.

## Recovery

A lost response does not prove that a host operation failed or succeeded. Reconnect through the authenticated client, request fresh status, and inspect its timestamp and audit result before deciding whether to retry. A restart or shutdown whose request lost contact remains unknown until the selected host's state resolves it.

If a setup run fails after the service has started, preserve the data and service for inspection. Reopen the assistant to resume or use the host controls. The assistant never removes an existing volume or unrelated project to make a retry appear clean.
