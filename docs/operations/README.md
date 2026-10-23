# Operations and recovery

This guide covers setup and service recovery. The product source includes the authenticated API, dashboard, Windows host agent, tracked Compose configuration, and tailored setup assistant. An immutable image pull was verified, but the current release asset inventory and real host deployment still need completion.

## Start with the task

- [Host or resume setup](../features/setup-assistant.md) using the tailored portable assistant.
- [Deploy with the host controls](../features/deployment-recovery.md) when Docker Engine is already available.
- [Review typed host operations](../features/operation-catalog.md) before requesting a change on a managed Windows computer.
- [Review shutdown and restart confirmation](../features/power-actions.md) before dispatch.
- [Review security and identity](../security/README.md) before pairing or exposing a host.

## Container host

The service uses a published immutable image, tracked Compose configuration, an available host port, protected local configuration files, and a verified LAN route. The setup assistant embeds `compose.yaml` and verifies it against the hash in the selected release manifest. Its one-click action requires an already-ready local Docker Engine and starts only the Watchdog Control Compose project. It does not install Docker or the optional Windows host agent.

Double-clicking `host.bat` presents an eight-second keyboard menu, then starts or updates the service by default. Use `host.bat --detached` to start and return after health and LAN URL checks, `host.bat --logs` for the interactive status and log view, and `host.bat --stop` only when the operator intends to stop the service. Leaving the log view leaves running containers untouched.

## Recovery

A lost response does not prove that a host operation failed or succeeded. Reconnect through the authenticated client, request fresh status, and inspect its timestamp and audit result before deciding whether to retry. A restart or shutdown whose request lost contact remains unknown until the selected host's state resolves it.

If a setup run fails after the service has started, preserve the data and service for inspection. Reopen the assistant to resume or use the host controls. The assistant never removes an existing volume or unrelated project to make a retry appear clean.
