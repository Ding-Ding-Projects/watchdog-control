# Handoff

## Current hosting acceptance, 2026-10-31

Candidate **0.3.2**, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

The exact single-file executable was launched on an isolated hidden desktop. Its extracted application archive matched the build receipt, and the inspected window reported source `8e5eb3d` and version 0.3.2. Live state showed hosting ready, a verified public endpoint, verified startup registration and Discord unconfigured. Selecting Finish closed the portable launcher and application while persistent hosting continued. The usable capture contains private connection details and is excluded from publication; current public-safe setup screenshots and the broader layout matrix remain unfinished.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Release publication is pending, and client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

## Source and verification boundaries

- Native certificate loading uses `UserKeySet` on Windows and `EphemeralKeySet` elsewhere, with disposal after Kestrel stops. Strict CA and hostname checks remain enabled.
- The wizard uses a bounded fixed bundled-Node endpoint probe for native and Compose health checks. Twenty-one focused probe/lifecycle checks passed at `672a114`.
- Hosting guide/category/search/wiki routes were exercised locally at 1440 ? 1000 and 390 ? 844. The fence-rendering repair at `d131c72` preserved literal command lines and escaped HTML; long blocks scroll by keyboard without widening the page. This is local static-documentation evidence, not deployed-site evidence.
- Documentation verification used an isolated hidden-desktop Chromium runtime. Both application roots, listeners and empty desktop windows were independently absent after normal exit. The lifecycle helper could not prove detached-child absence, and automatic approval review blocked profile removal. The private profile and evidence remain retained; cleanup is not certified complete. Do not retry that deletion through another route.
- Dashboard screenshots retain their development-controller/test-agent provenance. Current packaged-wizard screenshots require a public-safety review before becoming README evidence.

## Remaining work

Verify the normal release and all expected assets against the accepted source. Verify the deployed documentation routes after their deployment revision is known. Keep new-sign-in startup, second-device LAN access, owner pairing, optional management-agent installation, host operations, Docker runtime, and actual Discord delivery explicitly unverified until separately exercised. The operator has chosen to leave Discord unconfigured.

The PowerShell/CMD terminal design handoff remains tracked in [issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3). This hosting acceptance does not establish terminal implementation or complete required-feature coverage.

Earlier package results, historical pending states and mock-bridge wizard screenshots are preserved in the [hosting evidence archive](docs/history/hosting-before-0.3.2.md). No prior capture is relabelled as current proof.
