# Native hosting and temporary access

The current setup assistant supports native Windows hosting without Docker, with Compose retained as an explicit alternative. It stages the bundled controller and tools into a persistent versioned runtime, verifies HTTPS health and anonymous-access rejection, and can supervise a temporary Cloudflare address.

Candidate **0.3.2**, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

Complete single-file launch and visual acceptance remain pending: the initial window image was blank and is not usable evidence. Packaged native setup/state and endpoint results are separate from that visual acceptance.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Release publication is pending, and client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

Read the complete [native hosting workflow](../features/native-hosting.md) for configuration, recovery, privacy and delivery state. [Terminal design issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3) remains a separate unfinished handoff.
