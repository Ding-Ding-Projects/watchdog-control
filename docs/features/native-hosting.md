# Native hosting and temporary access

The portable setup assistant now offers **Native Windows** by default and **Docker Compose** as an explicit alternative. The native route bundles the controller, Node.js and a pinned cloudflared executable, so it does not require Docker. The controller binds HTTPS to the selected private address and port, using protected local certificate and pairing files.

## Start and keep hosting

Choose the destination, data directory and host port, review the choices, and start hosting. Optional temporary public access starts a Cloudflare Quick Tunnel only after local HTTPS health, management assets and anonymous-access rejection verify. The displayed public address is checked before it is accepted. A failed tunnel is retried with bounded backoff; a replacement address is verified again. Quick Tunnels are temporary development access, not an uptime guarantee or a stable domain.

The controller and monitor are staged into an immutable, content-hashed application-data directory. Closing the portable assistant does not remove their runtime. **Start when you sign in** registers a current-user hidden launcher for the monitor and selected native or Compose service. This is sign-in startup, not pre-login machine-service startup. It never stores an operating-system login password or changes automatic sign-in.

## Discord notifications

Use the assistant's protected webhook field to save a Discord destination. It is encrypted with the current Windows user's data-protection mechanism and excluded from ordinary state, logs, source and exports. Each verified address has a bounded notification retry budget; transient endpoint failures do not reset that budget. Leaving the webhook unset leaves notifications unconfigured. Test delivery requires an operator-supplied destination; it must not be pasted into a ticket or source file.

## Recovery and boundaries

The monitor records exact executable, process identifier and creation-time identity. It reclaims only recorded children of a stopped owner. A different listener, changed process identity or competing live supervisor is preserved and reported. Per-launch configuration is activated only after exclusive ownership is acquired. Cancellation is checked after asynchronous verification and before any optional host-agent installation.

Native mode runs the controller as the signed-in user. Installing the separate machine-wide management agent remains optional and requires its existing consent flow. Docker mode uses the selected local Compose project and published image. A Linux container cannot supply Windows CMD itself.

## Build and verification state

Run the exact root `build.bat` and `build-installer.bat`. The latter requires committed source and emits one portable `WatchdogControlSetup.exe` containing its launch-time resources. Generated renderer/provenance files are recreated during the build rather than tracked as stale output.

Sixteen focused hosting checks passed at `f285a8a`, with an independent read-only source review. The updated packaging entrypoints, live native service, real temporary tunnel, sign-in registration and Discord delivery remain unverified at this preservation checkpoint. A source check is not deployment proof.

The requested live chat-style PowerShell/CMD interface is handed off in [issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3). Its design and proposed API are not implemented by this hosting change.
