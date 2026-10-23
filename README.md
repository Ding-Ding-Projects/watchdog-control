# Watchdog Control

[Documentation site](https://ding-ding-projects.github.io/watchdog-control/)

| Overview | Security | Operations | Documentation |
| --- | --- | --- | --- |
| [Purpose](#purpose) | [Security model](docs/security/README.md) | [Run locally](docs/operations/README.md) | [documentation website source](docs/README.md) |

## Purpose

Watchdog Control is an open-source Windows host management dashboard with a LAN-accessible API. It covers practical host administration such as health, services, processes, event logs, storage, networking, updates, firewall state, and carefully confirmed power actions.

Host operations use typed actions and a documented operation catalog. The public API does not accept arbitrary shell text or caller-selected executables and paths. Authentication, authorization, audit records, and exact confirmations protect destructive actions. Computer restart and shutdown use a short-lived, single-use challenge. These paths are implemented in source; live host behavior remains unverified.

## Project state

The source includes the authenticated host API, Windows management agent, dashboard, tracked Compose deployment, `host.bat`, and a tailored single-file setup assistant. An immutable image was published for source `5d19bb463b624a60b38aae360f607572fa003b8a`, digest `sha256:8a652e9a5a5704a62abd7940131e5de84a0c2ba8019088f6f0637638b8808466`, and anonymous image pull succeeded.

Normal release `v0.1.0` targets that source and publishes `default.env.example`. An earlier verifier expected `.env.example`, so its failed check was a verifier filename mismatch. The published manifest also lacks `service.composeSha256`, which the updated assistant requires for its embedded Compose file. Source now prepares a `v0.1.1` release with that checksum; publication and full asset readback are still pending.

The latest root `build.bat` completed on 2026-10-23 with 0 warnings and 0 errors. The current single-file assistant package and its rebuilt interface still need inspection. No product container has been started. Client-to-host LAN reachability, authentication, host operations, and live documentation routes remain separate verification steps.

## One-click setup and hosting

`WatchdogControlSetup.exe` is a self-contained portable setup assistant. The updated assistant embeds `compose.yaml`, verifies its SHA-256 against the selected release manifest, and adds a **Host Watchdog Control on this computer** action to the welcome screen. That action runs from the portable executable without installing the assistant. It uses an already-ready local Docker Engine, downloads the release-pinned image, writes this service's configuration and protected local files, starts only the Watchdog Control service, and checks HTTPS health and the selected LAN URL. It does not install Docker Desktop, another container runtime, the optional Windows host agent, or other host prerequisites.

For an existing service folder, exact matches of `compose.yaml`, `.env`, `host.bat`, and `scripts/host.ps1` are reused. Differing files require confirmation after byte-for-byte backups are verified; declining or a concurrent file change preserves the existing file.

When interface choice, host port, saved data location, or prerequisite recovery needs attention, use the guided setup steps. The assistant keeps native consent and any required restart under the operator's control. See [the complete setup workflow](docs/features/setup-assistant.md) for prerequisites, recovery, integrity checks, and current verification state.

Double-clicking `host.bat` opens a keyboard menu. If no choice is made within eight seconds, it starts or updates the service and returns after health checks. `host.bat --detached` starts and verifies in the background, `host.bat --logs` opens the interactive log view, and `host.bat --stop` is the separate explicit stop action.

## Screenshots

Current built-interface screenshots will be added after the revised setup assistant is packaged and its real interface is inspected. Earlier blank captures remain historical evidence and are not presented as current UI proof.

## Local publication checks

Configure the repository-local hooks with `git config --local core.hooksPath .githooks`. The pre-commit hook scans staged content; the pre-push hook scans outgoing revisions against the selected GitHub remote. They use a locally installed publication policy when available. If that policy source is present but the trusted runner cannot start, the operation stops. Clones without the private policy source skip this owner-specific scan; the hosted publication-language workflow remains the shared enforcement route.

## Navigation

- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)
- [Architecture](docs/architecture/README.md)
- [Security](docs/security/README.md)
- [Operations](docs/operations/README.md)
- [Feature documentation](docs/features/README.md)
- [Wiki source inventory](docs/wiki/README.md)
