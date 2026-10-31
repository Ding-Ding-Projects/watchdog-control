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

Nineteen focused hosting/recovery checks passed through `a75fba9`, with independent source review of the hosting and bundled-container units. Candidate `ee0390eca96469d61bb636bb895c2c591fd53b7f` passed strict local HTTPS health, management asset checks, and anonymous management API rejection (HTTP 401). Its packaged supervisor obtained and verified a temporary public endpoint, and current-user sign-in startup registration was verified. Tunnel renewal verification remains in progress. Actual Discord delivery remains unverified without an operator-configured destination. These checks do not establish client-device LAN reachability or a successful sign-in launch after a new session.

The [single-container route](container-hosting.md) bundles the controller and monitor. Its actual image build, pull and run remain unverified on a host without Docker.

The requested live chat-style PowerShell/CMD interface is handed off in [issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3). Its design and proposed API are not implemented by this hosting change.

## Windows TLS key lifetime

The native controller imports its PKCS#12 certificate with `UserKeySet` on Windows so Schannel can access the private key during TLS handshakes. Other operating systems retain `EphemeralKeySet`. The certificate is owned by the application scope and disposed after Kestrel stops, including startup failures. The import does not request machine-wide storage, permanent key persistence, or exportability. CA and hostname verification remain enabled.

This addresses the observed Schannel `0x8009030E` handshake failure described in [Microsoft's TLS troubleshooting guidance](https://learn.microsoft.com/en-us/dotnet/core/extensions/sslstream-troubleshooting#handshake-failed-with-ephemeral-keys). A focused loopback handshake check exercises the actual loader from source with a generated certificate and custom-root trust. The packaged controller at `ee0390e` subsequently passed the strict local endpoint checks above.

The setup assistant verifies native and Compose endpoints through its fixed bundled Node.js executable. It stages only its owned endpoint-check modules in a protected content-addressed directory, sends the public CA and HTTPS origin through bounded standard input, and accepts only bounded validated results. The child retains certificate and hostname verification, has a 30-second deadline, and is stopped on setup cancellation. The hosting supervisor continues to verify endpoints independently. Source-level child-process and lifecycle checks passed; the rebuilt assistant flow remains pending verification.
