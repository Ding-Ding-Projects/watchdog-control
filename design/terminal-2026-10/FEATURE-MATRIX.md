# Terminal feature matrix (issue #3)

Status as of 2026-11-01 for source `main`. Each row names the control, its consumer, persistence and
reset, and the current verification state. "Design" means the canvas in this folder specifies it;
it is not implementation evidence.

## Terminal workflows

| Requirement | Control and consumer | Persistence and recovery | State |
| --- | --- | --- | --- |
| Discover shells, platform and account; explicit start | Capability card and Start buttons (`New-session.dc.html`) → `GET /api/terminal/capabilities`, `POST /api/terminal/sessions` | None needed; rediscovered on open | Backend implemented: capabilities and create routes; smoke-tested on Linux (no shells available there). Page not built. |
| Session tabs: identity, rename, close, active state, explicit New session | Tab strip (`Main.dc.html`) → sessions list, `PATCH`, `DELETE` | Server memory; reload lists sessions again | Design only |
| Chat-style transcript with command, stdout, stderr, input and lifecycle entries | Transcript (`Main.dc.html`) → `GET …/sessions/{id}?after=N` | Bounded server buffer | Backend implemented (`?after=N`, optional `wait=true` long poll); page not built |
| Streaming, follow output, new-output indicator | Follow button (`Main.dc.html`) | Local view state | Design only |
| Multiline composer, shortcuts, Send, history, stdin, cancellation, exit results | Composer and Stop (`Main.dc.html`, `States.dc.html`) | History per session in the browser tab | Design only |
| Multiple sessions, reconnect, expired, stopped, disconnected, limit states | States (`States.dc.html`) | Polling backoff; controller restart ends sessions | Design only |
| Transcript search with regex builder, copy, export, clear local view | Transcript toolbar (`Main.dc.html`) | Independent search state per session | Design only |
| No commands or output in analytics, request logs or audit | Backend rule; audit records start and stop only | n/a | Implemented; verified that test command text does not appear in the controller log |
| Truthful capability discovery; container never labelled as the Windows host | Identity chips (`Main.dc.html`, `New-session.dc.html`) | n/a | Backend reports container and platform; page not built |
| User-initiated commands only; no elevation or consent automation | Backend rule | n/a | Design only |
| Full-screen console programs | Unsupported state (`States.dc.html`) | n/a | Design only; unsupported by intent |

## Required feature inventory, terminal surface

| Area | State | Reason |
| --- | --- | --- |
| English, Cantonese and bilingual modes; playfulness; emoji; personal wording import and reset | Pending for the terminal | The dashboard already has these settings (v0.2.0); terminal strings are not built yet. |
| School mode, focus spotlight, one thing at a time, narration, sounds | Pending for the terminal | Available dashboard-wide; terminal page not built. Low stimulation, time awareness and momentum modes are not implemented anywhere yet. |
| Scheduled settings, external sources, logo customization, preference history | Not implemented | No scheduler or history store exists in the dashboard. |
| Themes, reduced motion, text scale, density, contrast, colour picker | Pending for the terminal | Dashboard-wide settings exist; the terminal will inherit them. |
| Per-element appearance and animation editing, presets, undo and redo, style transfer | Not implemented | No appearance editor exists in the product. |
| Navigation, tabs, New tab catalog, command palette, shortcuts, context menus | Partly available | Palette and context menus exist dashboard-wide; terminal commands are not in them yet. |
| Search with an adjacent regex builder | Partly available | The dashboard regex builder (flags, tokens, highlighting) exists; engine comparison, conversion, benchmarking and file search do not. |
| Keyboard and assistive access, narrow layouts, guided forms, truthful states | Design only for the terminal | Narrow layout and states are drawn; not built. |
| First-run setup | Available for the controller | Owner setup exists; the terminal needs no separate onboarding beyond capability discovery. |
| Notifications and history, retry and recovery, destructive confirmation | Partly available | Notification centre exists; two-key super confirmation, element locks, support tickets and unlock workflows are not implemented. |
| Built-in authenticator and QR registration | Not implemented | Sign-in uses the owner password; no authenticator exists. |
| Local history, bulk actions, exports, changelog, offline help, external editor | Partly available | Audit and operation exports exist; changelog viewer, offline help and editor hand-off do not. |
| File conversion, model-suite management, game-server management, forge publishing | Inapplicable to the terminal | Separate product areas with no implementation here; not implied by any menu item. |
| Documentation site, articles, downloads, fonts, link previews | Available for existing features | The terminal article will be added when the feature exists. |
| Front-screen provenance, genuine screenshots, design references | Partly available | Version shows in the dashboard; terminal captures cannot exist before implementation. |
| Build, setup, container, startup, update and recovery entrypoints | Unchanged | The terminal adds no new entrypoint. |
| Status integration and notification delivery states | Not implemented | Being developed in a separate lane. |
| Platform-specific items | Documented | CMD is Windows only. PowerShell depends on `pwsh` where the controller runs; the controller container image does not include it. |

## Implementation state

The controller backend is implemented in `src/Watchdog.Web/Terminal/` and the routes listed in the
README are live for the signed-in owner. The terminal page is not built yet. No command has been run
end to end: the development controller used for testing is Linux without PowerShell, and nothing has
been verified on a Windows host. Set `WATCHDOG_TERMINAL=disabled` to turn the feature off.
