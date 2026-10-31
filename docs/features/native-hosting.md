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

Candidate **0.3.2**, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

Complete single-file launch and visual acceptance remain pending: the initial window image was blank and is not usable evidence. Packaged native setup/state and endpoint results are separate from that visual acceptance.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Release publication is pending, and client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

The [single-container route](container-hosting.md) bundles the controller and monitor. Its actual image build, pull and run remain unverified on a host without Docker.

The requested live chat-style PowerShell/CMD interface is handed off in [issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3). Its design and proposed API are not implemented by this hosting change.

## Windows TLS key lifetime

The native controller imports its PKCS#12 certificate with `UserKeySet` on Windows so Schannel can access the private key during TLS handshakes. Other operating systems retain `EphemeralKeySet`. The certificate is owned by the application scope and disposed after Kestrel stops, including startup failures. The import does not request machine-wide storage, permanent key persistence, or exportability. CA and hostname verification remain enabled.

This addresses the observed Schannel `0x8009030E` handshake failure described in [Microsoft's TLS troubleshooting guidance](https://learn.microsoft.com/en-us/dotnet/core/extensions/sslstream-troubleshooting#handshake-failed-with-ephemeral-keys). A focused loopback handshake check exercises the actual loader from source with a generated certificate and custom-root trust. The packaged controller at `8e5eb3d` subsequently passed the strict local and public endpoint checks above.

The setup assistant verifies native and Compose endpoints through its fixed bundled Node.js executable. It stages only its owned endpoint-check modules in a protected content-addressed directory, sends the public CA and HTTPS origin through bounded standard input, and accepts only bounded validated results. The child retains certificate and hostname verification, has a 30-second deadline, and is stopped on setup cancellation. The hosting supervisor continues to verify endpoints independently. Twenty-one focused child-process/lifecycle checks passed. The 0.3.2 packaged assistant subsequently completed the actual native setup flow and saved verified readiness.
