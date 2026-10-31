# Handoff

## Current hosting acceptance, 2026-10-31

The locally executed **0.3.2** build, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The locally executed portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

The exact single-file executable was launched on an isolated hidden desktop. Its extracted application archive matched the build receipt, and the inspected window reported source `8e5eb3d` and version 0.3.2. Live state showed hosting ready, a verified public endpoint, verified startup registration and Discord unconfigured. Selecting Finish closed the portable launcher and application while persistent hosting continued. The usable capture contains private connection details and is excluded from publication; current public-safe setup screenshots and the broader layout matrix remain unfinished.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Normal release v0.3.2 is verified; client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

## Source and verification boundaries

- Native certificate loading uses `UserKeySet` on Windows and `EphemeralKeySet` elsewhere, with disposal after Kestrel stops. Strict CA and hostname checks remain enabled.
- The wizard uses a bounded fixed bundled-Node endpoint probe for native and Compose health checks. Twenty-one focused probe/lifecycle checks passed at `672a114`.
- Hosting guide/category/search/wiki routes were exercised locally at 1440 ? 1000 and 390 ? 844. The fence-rendering repair at `d131c72` preserved literal command lines and escaped HTML; long blocks scroll by keyboard without widening the page. This is local static-documentation evidence, not deployed-site evidence.
- Documentation verification used an isolated hidden-desktop Chromium runtime. Both application roots, listeners and empty desktop windows were independently absent after normal exit. The lifecycle helper could not prove detached-child absence, and automatic approval review blocked profile removal. The private profile and evidence remain retained; cleanup is not certified complete. Do not retry that deletion through another route.
- Dashboard screenshots retain their development-controller/test-agent provenance. Current packaged-wizard screenshots require a public-safety review before becoming README evidence.

## Remaining work

Verify the deployed documentation routes after their deployment revision is known. Keep new-sign-in startup, second-device LAN access, owner pairing, optional management-agent installation, host operations, Docker runtime, and actual Discord delivery explicitly unverified until separately exercised. The operator has chosen to leave Discord unconfigured.

The PowerShell/CMD terminal design handoff remains tracked in [issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3). This hosting acceptance does not establish terminal implementation or complete required-feature coverage.

Earlier package results, historical pending states and mock-bridge wizard screenshots are preserved in the [hosting evidence archive](docs/history/hosting-before-0.3.2.md). No prior capture is relabelled as current proof.


## Verified release and build identities

[Normal release v0.3.2](https://github.com/Ding-Ding-Projects/watchdog-control/releases/tag/v0.3.2) is verified as neither draft nor prerelease, with nine assets and tag/source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`. All four jobs in [release run 41241125480](https://github.com/Ding-Ding-Projects/watchdog-control/actions/runs/41241125480) succeeded, including asset download/hash verification and documentation deployment.

The published `WatchdogControlSetup.exe` is 168,779,872 bytes with SHA-256 `3bc1594a95265a2e61a2a5e339b0ed1d8975300e51e29e87e9e349c71423d496`. This is distinct from the locally executed executable with SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`; both are bound to the same source. The published bytes have download/hash proof, while the detailed native GUI execution evidence belongs to the local build.

The published AMD64 image is `ghcr.io/ding-ding-projects/watchdog-control@sha256:30158b083160bf3e6078f6a7ee2e76327867fddfd629d62285848f3528f46e07`. Anonymous image pull and export passed in CI. Local Docker execution remains unverified.

At 21:02:36 UTC on 2026-10-31, stopping only the identified 0.3.2 tunnel child produced a newly verified replacement address while retaining the same controller identity. This confirms bounded tunnel recovery, not an uptime guarantee.
