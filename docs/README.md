# Watchdog Control documentation

Watchdog Control is a LAN-scoped management dashboard with an authenticated API and a Windows host agent. Its source includes typed operational workflows and a tailored setup assistant. The exact root build succeeded locally on 2026-10-23, and a local setup package was built from an earlier source revision; no release or installed runtime has been verified.

## Start with a task

- [Assess host health](features/host-health.md) and review observation freshness.
- [Inspect a service or process](features/services-processes.md) through the fixed operation catalog.
- [Install or resume setup](features/setup-assistant.md) on a local Windows computer.
- [Recover after an interrupted operation](operations/README.md#recovery) without assuming its outcome.
- [Check the security model](security/README.md) before pairing or exposing a host.
- [Browse the interactive guide](index.html) for guided workflows, search, article navigation, and complete local wiki content.

## Delivery state

Product source, a local build, and an earlier local setup package are available. The home page exposes release availability only after a normal release and its files are verified. Deployment to a real host, client-side LAN reachability, and installed management behavior remain separate checks. The site demonstrations only update visitor-owned page state; they do not connect to or control a Windows host.

## Articles

- [Architecture](architecture/README.md)
- [Security](security/README.md)
- [Operations and recovery](operations/README.md)
- [Feature catalogue](features/README.md)
- [Automatic setup assistant](features/setup-assistant.md)
- [Controller HTTP API](features/http-api.md)
- [HTTP API request collection](api/README.md)
- [Wiki chapters](wiki/README.md)

## Wiki content

Complete wiki chapters are maintained in `wiki/` and rendered directly inside the interactive guide with working internal routes. GitHub wiki publication is separate and remains pending until the wiki repository is available, its stored pages are published, and the links are read back.
