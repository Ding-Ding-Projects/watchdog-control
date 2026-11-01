# Watchdog Control

Current development adds [native hosting, verified temporary access, protected Discord notifications and sign-in startup](docs/features/native-hosting.md). The portable setup build now bundles the native controller and hosting tools, so this route does not require Docker. The 0.3.2 packaged native setup, strict local/public endpoint checks, tunnel recovery and independent startup-launcher invocation are verified. Normal release v0.3.2 and its nine assets are verified. The chat-style PowerShell/CMD [controller terminal](docs/features/terminal.md) from [issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3) is implemented for the owner on the local network; Windows controller verification is pending.

[Documentation site](https://ding-ding-projects.github.io/watchdog-control/)

| Overview | Remote | Security | Operations | Documentation |
| --- | --- | --- | --- | --- |
| [Purpose](#purpose) | [Slop Machine remote control](#slop-machine-remote-control) | [Security model](docs/security/README.md) | [Run locally](docs/operations/README.md) | [documentation website source](docs/README.md) |

## Purpose

Watchdog Control is an open-source Windows host management dashboard with a LAN-accessible API. It covers practical host administration such as health, services, processes, event logs, storage, networking, updates, firewall state, and carefully confirmed power actions.

Host operations use typed actions and a documented operation catalog. The public API does not accept arbitrary shell text or caller-selected executables and paths. Authentication, authorization, audit records, and exact confirmations protect destructive actions. Computer restart and shutdown use a short-lived, single-use challenge. These paths are implemented in source; live host behavior remains unverified.

## Project state

The locally executed **0.3.2** build, source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`, passed the exact root `build-installer.bat` entrypoint. The locally executed portable executable has SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`. The actual packaged Windows assistant completed native setup with saved `verified: true`; strict local and temporary public HTTPS checks passed, including management assets and anonymous management API rejection. Tunnel recovery produced a newly verified address. After the wizard closed, the saved current-user startup launcher independently restarted the monitor, controller and tunnel, and the endpoints again reported 0.3.2.

The exact single-file executable was launched on an isolated hidden desktop. Its extracted application archive matched the build receipt, and the inspected window reported source `8e5eb3d` and version 0.3.2. Live state showed hosting ready, a verified public endpoint, verified startup registration and Discord unconfigured. Selecting Finish closed the portable launcher and application while persistent hosting continued. The usable capture contains private connection details and is excluded from publication; current public-safe setup screenshots and the broader layout matrix remain unfinished.

This proves the saved launcher can run independently; it does **not** prove launch after a new operating-system sign-in or reboot. Discord is deliberately unconfigured by the operator, so actual notification delivery is unverified. No current local Docker execution was performed. Normal release v0.3.2 is verified; client-device LAN access, owner pairing and management operations remain separate acceptance items. Temporary addresses and local machine details are omitted from public records.

[Earlier release and setup evidence](docs/history/hosting-before-0.3.2.md) remains archived with its original provenance.

## Verified release and distinct build identities

[Normal release v0.3.2](https://github.com/Ding-Ding-Projects/watchdog-control/releases/tag/v0.3.2) is verified as neither draft nor prerelease, with nine assets and tag/source `8e5eb3d36e326d799b7ef05388ad85a34539f5df`. All four jobs in [release run 41241125480](https://github.com/Ding-Ding-Projects/watchdog-control/actions/runs/41241125480) succeeded, including asset download/hash verification and documentation deployment.

The published `WatchdogControlSetup.exe` is 168,779,872 bytes with SHA-256 `3bc1594a95265a2e61a2a5e339b0ed1d8975300e51e29e87e9e349c71423d496`. This is distinct from the locally executed executable with SHA-256 `DFB8D43CE6D31E230CF36D725577DCF248477CAB80FEDBD76E79BF928C760CE5`; both are bound to the same source. The published bytes have download/hash proof, while the detailed native GUI execution evidence belongs to the local build.

The published AMD64 image is `ghcr.io/ding-ding-projects/watchdog-control@sha256:30158b083160bf3e6078f6a7ee2e76327867fddfd629d62285848f3528f46e07`. Anonymous image pull and export passed in CI. Local Docker execution remains unverified.

## Slop Machine remote control

The **Slop Machine** page drives the `codex` command-line tool on a paired computer: a status check,
device-code sign-in assist with the one-time code and a countdown, remote control start and stop,
and a phone pairing code for the ChatGPT phone app. Every command is fixed in the agent, signing out
needs a typed phrase, and one-time codes stay in controller memory instead of the data file or audit
log. See [Slop Machine remote control](docs/features/remote-agent.md). Running it on a real Windows
host is not verified yet.

## Command centre dashboard

Version 0.2.0 redesigns every interface as a command centre: host radar, live telemetry, animated
gauges, a command palette (`Ctrl+Shift+F`), a regex builder on every search, context menus, a
notification centre, and settings for language (English, Cantonese or both), theme, accent colour,
text size, contrast, motion, focus modes, narration and sounds. See
[Dashboard experience](docs/features/dashboard-experience.md) and the design reference in
[`design/redesign-2026-10`](design/redesign-2026-10/README.md).

## One-click setup and hosting

`WatchdogControlSetup.exe` is a portable single-file assistant with **Native Windows** selected by default and **Docker Compose** available explicitly. Native mode uses its bundled controller, Node.js and cloudflared, with no Docker installation. Select an active private interface, port and persistent data folder, then start and verify. Optional temporary public access verifies HTTPS, management assets and authentication boundaries before exposing a clickable address. **Start when you sign in** controls the current-user launcher for the selected service and monitor. Discord notifications remain off without a protected operator-configured destination.

The Compose route retains the release-pinned image, bundled Compose integrity checks and local-engine prerequisite flow. Current local acceptance covers native hosting; it does not establish container execution.

For an existing service folder, exact matches of `compose.yaml`, `.env`, `host.bat`, and `scripts/host.ps1` are reused. Differing files require confirmation after byte-for-byte backups are verified; declining or a concurrent file change preserves the existing file.

When interface choice, host port, saved data location, or prerequisite recovery needs attention, use the guided setup steps. The assistant keeps native consent and any required restart under the operator's control. See [the complete setup workflow](docs/features/setup-assistant.md) for prerequisites, recovery, integrity checks, and current verification state.

Double-clicking `host.bat` opens a keyboard menu. If no choice is made within eight seconds, it starts or updates the service and returns after health checks. `host.bat --detached` starts and verifies in the background, `host.bat --logs` opens the interactive log view, and `host.bat --stop` is the separate explicit stop action.

## Screenshots

These are genuine captures of the rebuilt dashboard running against a local development controller
with a test agent supplying readings. They are not captures of a Windows host.

| Command centre | Slop Machine sign-in assist |
| --- | --- |
| ![Command centre with host radar, telemetry, gauges and event stream](docs/assets/screens/command-centre.png) | ![Slop Machine page showing the link topology, setup steps and a one-time sign-in code](docs/assets/screens/remote-sign-in.png) |

| Command palette | Settings |
| --- | --- |
| ![Command palette filtering restart commands](docs/assets/screens/command-palette.png) | ![Settings for language, appearance, focus, sound and refresh](docs/assets/screens/settings.png) |

| Daylight theme, English and Cantonese | Phone |
| --- | --- |
| ![Command centre in the light theme with bilingual labels](docs/assets/screens/daylight-bilingual.png) | ![Command centre at phone width](docs/assets/screens/phone.png) |

Current public-safe screenshots of the verified 0.3.2 packaged setup flow are pending review. Earlier mock-bridge wizard images are retained only in the [historical evidence archive](docs/history/hosting-before-0.3.2.md); they are not current native-runtime evidence.

## Local publication checks

Configure the repository-local hooks with `git config --local core.hooksPath .githooks`. The pre-commit hook scans staged content; the pre-push hook scans outgoing revisions against the selected GitHub remote. They use a locally installed publication policy when available. If that policy source is present but the trusted runner cannot start, the operation stops. Clones without the private policy source skip this owner-specific scan; the hosted publication-language workflow remains the shared enforcement route.

## Navigation

- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)
- [Architecture](docs/architecture/README.md)
- [Security](docs/security/README.md)
- [Operations](docs/operations/README.md)
- [Feature documentation](docs/features/README.md)
- [Slop Machine remote control](docs/features/remote-agent.md)
- [Dashboard experience](docs/features/dashboard-experience.md)
- [Wiki source inventory](docs/wiki/README.md)
