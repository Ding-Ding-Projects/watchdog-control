# Watchdog Control

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

The public repository and its initial task records exist. Product source, build output,
container publication, public documentation deployment, and runtime verification are not
available yet. The roadmap records the remaining work.

## Navigation

- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)
- [Architecture](docs/architecture/README.md)
- [Security](docs/security/README.md)
- [Operations](docs/operations/README.md)
- [Feature documentation](docs/features/README.md)
- [Wiki source inventory](docs/wiki/README.md)

No product screenshot is shown yet because no built product interface exists.
