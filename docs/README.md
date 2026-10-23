# Watchdog Control documentation

Watchdog Control is a LAN-scoped management dashboard with an authenticated API and a Windows host agent. Its source includes typed operational workflows and a tailored setup assistant with a one-click local hosting path.

## Start with a task

- [Assess host health](features/host-health.md) and review observation freshness.
- [Inspect a service or process](features/services-processes.md) through the fixed operation catalog.
- [Host or resume setup](features/setup-assistant.md) on a local Windows computer.
- [Recover after an interrupted operation](operations/README.md#recovery) without assuming its outcome.
- [Check the security model](security/README.md) before pairing or exposing a host.
- [Browse the interactive guide](index.html) for guided workflows, search, article navigation, and complete local wiki content.

## Delivery state

An immutable image is published for source `5d19bb463b624a60b38aae360f607572fa003b8a`; its anonymous pull was verified. Normal release `v0.1.0` targets that source and publishes `default.env.example`. An earlier verifier expected `.env.example`, so its filename check was incorrect. The published manifest lacks `service.composeSha256`, which the updated assistant needs to verify its embedded Compose file. Release `v0.1.1` and full readback remain pending.

The latest root `build.bat` completed on 2026-10-23 with 0 warnings and 0 errors. The updated single-file assistant, its welcome screen, and one-click hosting path still need packaging and functional inspection. A real service, client-side LAN reachability, and host-operation behavior remain separate checks. Site examples update visitor-owned page state and do not connect to or control a Windows host.

## Articles

- [Architecture](architecture/README.md)
- [Security](security/README.md)
- [Operations and recovery](operations/README.md)
- [Feature catalogue](features/README.md)
- [Automatic setup assistant](features/setup-assistant.md)
- [Release v0.1.1 notes](releases/v0.1.1.md)
- [Controller HTTP API](features/http-api.md)
- [HTTP API request collection](api/README.md)
- [Wiki chapters](wiki/README.md)

## Wiki content

Complete wiki chapters are maintained in `wiki/` and rendered directly inside the interactive guide with working internal routes. GitHub wiki publication is separate and remains pending until the wiki repository is available, its stored pages are published, and the links are read back.
