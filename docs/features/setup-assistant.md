# Automatic setup assistant

## Choose a hosting route

The portable assistant selects **Native Windows** by default. This route uses the bundled controller, Node.js and cloudflared without installing Docker. **Docker Compose** remains an explicit alternative that verifies a published immutable image and the local container engine. The optional machine-wide Windows management agent is separate and remains off unless deliberately selected with its required consent.

1. Review the active private LAN interface. Use network recheck if discovery is unavailable; welcome navigation does not silently invent an address.
2. Choose the host port and persistent data folder. Confirm an existing folder before starting against it.
3. Optionally enable temporary public access and **Start when you sign in**. The latter registers only a current-user launcher, not a pre-login service or automatic operating-system sign-in.
4. Review the selected destination and start hosting. Native mode stages the bundled runtime in a persistent content-addressed directory. Compose mode verifies the local context and release configuration before pulling and starting only its named service.
5. Wait for strict HTTPS health JSON, delivered management assets and anonymous management API rejection. The wizard uses its fixed bundled Node executable with bounded input, output, deadline and cancellation. It does not weaken certificate or hostname verification.
6. Open only the verified local or temporary public address. Export the public certificate when needed for a client; never share pairing codes, certificate private keys or webhook values.

## Temporary access and notifications

A Cloudflare Quick Tunnel is optional and has no uptime or stable-address guarantee. The supervisor verifies a candidate address before showing it, retries disconnection with bounded backoff, and verifies any replacement before use. It does not renew a healthy address on an assumed expiry timer.

Discord configuration uses a protected input and separate current-user encrypted storage. Save, remove and test controls expose configured state without returning the webhook value to ordinary state or logs. The operator currently chooses to leave it unconfigured; no actual delivery is claimed. See [native hosting and temporary access](native-hosting.md) for ownership, recovery and notification retry limits.

## Cancellation and recovery

Cancellation stops before subsequent setup work and terminates only an owned verification helper. A started service is not removed automatically. The supervisor uses exact executable, process and creation-time identities to recover recorded children; unrelated listeners and changed identities are preserved. State writes use serialized, unique create-new temporary files and atomic replacement. Recheck the network after an unavailable discovery result or changed interface before starting again.

The assistant preserves existing service data and requires confirmation plus verified backups before replacing differing owned Compose/environment/control files. It never accepts native elevation consent, reboots the computer, changes operating-system sign-in, or removes unrelated containers. An unavailable prerequisite, cancelled consent or failed endpoint check remains incomplete.

## Compose prerequisites

Only the explicit Compose route needs Docker Engine and Compose. Missing supported prerequisites use the existing verified Microsoft package-deployment and Docker installation flow, with native consent and license screens left to the operator. A restart, if required by the operating system, remains a manual action. Remote container contexts are not accepted by this local setup route. The native route never invokes this prerequisite installation.

The [single-container guide](container-hosting.md) describes optional container-owned monitoring. Choose either that monitor or the assistant-owned monitor, not both. Current local verification does not establish Docker installation, Compose execution or container notification delivery.

## Current verification

Candidate **0.3.2**, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Release publication is pending, and client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

The exact single-file executable was launched on an isolated hidden desktop. Its extracted application archive matched the build receipt, and the inspected window reported source `8e5eb3d` and version 0.3.2. Live state showed hosting ready, a verified public endpoint, verified startup registration and Discord unconfigured. Selecting Finish closed the portable launcher and application while persistent hosting continued. The usable capture contains private connection details and is excluded from publication; current public-safe setup screenshots and the broader layout matrix remain unfinished.

The exact root `build-installer.bat` packages the current desktop assistant and its launch resources in one portable executable. Source provenance is embedded during the build. Publication, downloadable-asset readback, the optional agent installation, second-device LAN access and new-sign-in startup remain separate checks.

## Screenshot provenance

Current public-safe packaged-wizard screenshots are pending review. Earlier renderer-only images used Chrome with a mock bridge and are retained with their original references in the [historical hosting archive](https://github.com/Ding-Ding-Projects/watchdog-control/blob/main/docs/history/hosting-before-0.3.2.md). They are not evidence of current native setup.

Continue with [native hosting](native-hosting.md), [container hosting](container-hosting.md), or the [wiki setup chapter](../wiki/setup-assistant.md).
