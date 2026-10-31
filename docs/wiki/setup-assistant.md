# Automatic setup assistant

The current assistant selects native Windows hosting by default, with Docker Compose retained as an explicit alternative. Choose the interface, HTTPS port and data folder, review the destination, then start and verify. Temporary public access and current-user sign-in startup are optional; management-agent installation is separately consented.

The locally executed **0.3.2** build, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The locally executed portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Normal release v0.3.2 is verified; client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

The exact single-file executable was launched on an isolated hidden desktop. Its extracted application archive matched the build receipt, and the inspected window reported source `8e5eb3d` and version 0.3.2. Live state showed hosting ready, a verified public endpoint, verified startup registration and Discord unconfigured. Selecting Finish closed the portable launcher and application while persistent hosting continued. The usable capture contains private connection details and is excluded from publication; current public-safe setup screenshots and the broader layout matrix remain unfinished.

Read the complete [setup workflow](../features/setup-assistant.md), [native hosting guide](../features/native-hosting.md), and [historical evidence archive](https://github.com/Ding-Ding-Projects/watchdog-control/blob/main/docs/history/hosting-before-0.3.2.md). The archive retains mock-bridge screenshots without presenting them as native proof.


## Verified release and build identities

[Normal release v0.3.2](https://github.com/Ding-Ding-Projects/watchdog-control/releases/tag/v0.3.2) is verified as neither draft nor prerelease, with nine assets and tag/source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`. All four jobs in [release run 41241125480](https://github.com/Ding-Ding-Projects/watchdog-control/actions/runs/41241125480) succeeded, including asset download/hash verification and documentation deployment.

The published `WatchdogControlSetup.exe` is 168,779,872 bytes with SHA-256 `3bc1594a95265a2e61a2a5e339b0ed1d8975300e51e29e87e9e349c71423d496`. This is distinct from the locally executed executable with SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`; both are bound to the same source. The published bytes have download/hash proof, while the detailed native GUI execution evidence belongs to the local build.

The published AMD64 image is `ghcr.io/ding-ding-projects/watchdog-control@sha256:30158b083160bf3e6078f6a7ee2e76327867fddfd629d62285848f3528f46e07`. Anonymous image pull and export passed in CI. Local Docker execution remains unverified.
