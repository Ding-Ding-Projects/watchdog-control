# Watchdog Control

[Documentation site](https://ding-ding-projects.github.io/watchdog-control/)

| Overview | Security | Operations | Documentation |
| --- | --- | --- | --- |
| [Purpose](#purpose) | [Security model](docs/security/README.md) | [Run locally](docs/operations/README.md) | [documentation website source](docs/README.md) |

## Purpose

Watchdog Control is an open-source Windows host management dashboard with a LAN-accessible
API. The project is intended to cover practical host administration such as health, services,
processes, event logs, storage, networking, updates, firewall state, and carefully confirmed
power actions.

Host operations will be exposed through typed actions and a documented operation catalog.
The public API will not accept arbitrary shell text or caller-selected executables and paths.
Authentication, authorization, audit records, and a second confirmation for shutdown and
restart are required before any destructive action is considered ready.

## Project state

Product source is present for the authenticated host API, Windows management agent, dashboard,
and tailored WPF setup assistant. The root installer entrypoint builds the wizard as a
self-contained single-file executable, embeds its source revision and build time, and writes a
SHA-256 sidecar beside the output. The setup guide describes the stable packaging contract; each
published release carries checksums for its actual downloads.

No product release or container image has been published from this source yet. A public
release, actual container-hosted service, independent LAN client connection, and host-action
verification remain outstanding. The roadmap records those gaps separately from local source
and build evidence.

## Automatic setup assistant

The single-file `WatchdogControlSetup.exe` guides setup on the intended Windows host. After
the owner reviews the target, it obtains and verifies supported prerequisites, prepares the
selected data folder and private LAN binding, pulls the release's immutable image, starts only
the Watchdog Control service, and checks HTTPS health and the LAN URL. Setup resumes from its
saved progress after a required manual restart.

Native administrator consent, package licenses, first-run setup, and a required computer
restart remain visible owner actions. The assistant never accepts those prompts or starts a
host power action on the owner's behalf. See [the complete setup workflow](docs/features/setup-assistant.md)
for the automatic path, recovery steps, integrity checks, and current verification state.

## Navigation

- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)
- [Architecture](docs/architecture/README.md)
- [Security](docs/security/README.md)
- [Operations](docs/operations/README.md)
- [Feature documentation](docs/features/README.md)
- [Wiki source inventory](docs/wiki/README.md)

Current screenshots will be added after the rebuilt dashboard and setup assistant are inspected
from their built outputs.
