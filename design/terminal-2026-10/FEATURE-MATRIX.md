# Terminal feature matrix (issue #3)

Status as of 2026-11-01 for source `main`. Each row names the control, its consumer, persistence and
reset, and the current verification state. "Design" means the canvas in this folder specifies it;
it is not implementation evidence.

## Terminal workflows

| Requirement | Control and consumer | Persistence and recovery | State |
| --- | --- | --- | --- |
| Discover shells, platform and account; explicit start | Capability card and Start buttons (`New-session.dc.html`) → `GET /api/terminal/capabilities`, `POST /api/terminal/sessions` | None needed; rediscovered on open | Implemented; capability cards and start buttons verified in Chrome on a Linux controller with a stand-in shell |
| Session tabs: identity, rename, close, active state, explicit New session | Tab strip (`Main.dc.html`) → sessions list, `PATCH`, `DELETE` | Server memory; reload lists sessions again | Implemented and verified locally (tabs, rename, close, stop, New session) |
| Chat-style transcript with command, stdout, stderr, input and lifecycle entries | Transcript (`Main.dc.html`) → `GET …/sessions/{id}?after=N` | Bounded server buffer | Implemented with long polling; verified locally |
| Streaming, follow output, new-output indicator | Follow button (`Main.dc.html`) | Local view state | Implemented; follow and the new-output count are not covered by the automated check |
| Multiline composer, shortcuts, Send, history, stdin, cancellation, exit results | Composer and Stop (`Main.dc.html`, `States.dc.html`) | History per session in the browser tab | Implemented; send, standard input, history, exit results and stop verified locally. Single-command cancel is not offered; Stop session ends the shell |
| Multiple sessions, reconnect, expired, stopped, disconnected, limit states | States (`States.dc.html`) | Polling backoff; controller restart ends sessions | Implemented; stopped and session limit verified; reconnect and expiry not exercised |
| Transcript search with regex builder, copy, export, clear local view | Transcript toolbar (`Main.dc.html`) | Search state for the page | Implemented: search with regex builder, copy, text and JSON export, clear view. Search is shared across sessions, not per session |
| No commands or output in analytics, request logs or audit | Backend rule; audit records start and stop only | n/a | Implemented; verified that test command text does not appear in the controller log |
| Truthful capability discovery; container never labelled as the Windows host | Identity chips (`Main.dc.html`, `New-session.dc.html`) | n/a | Implemented; container and Linux labels verified locally |
| User-initiated commands only; no elevation or consent automation | Backend rule | n/a | Implemented |
| Full-screen console programs | Unsupported state (`States.dc.html`) | n/a | Stated on the start page; unsupported by intent |

## Required feature inventory, terminal surface

| Area | State | Reason |
| --- | --- | --- |
| English, Cantonese and bilingual modes; playfulness; emoji; personal wording import and reset | Partly available | The page title and navigation are bilingual; terminal body text is English only. Personal wording applies; shell output is never rewritten. |
| School mode, focus spotlight, one thing at a time, narration, sounds | Available | School mode has a terminal tip; sounds mark command results. Low stimulation, time awareness and momentum modes are not implemented anywhere yet. |
| Scheduled settings, external sources, logo customization, preference history | Not implemented | No scheduler or history store exists in the dashboard. |
| Themes, reduced motion, text scale, density, contrast, colour picker | Available | The terminal uses the dashboard tokens; entry and tab animations stop under reduced motion. |
| Per-element appearance and animation editing, presets, undo and redo, style transfer | Not implemented | No appearance editor exists in the product. |
| Navigation, tabs, New tab catalog, command palette, shortcuts, context menus | Partly available | The palette opens the terminal and starts PowerShell or CMD sessions; there are no terminal-specific context menu items. |
| Search with an adjacent regex builder | Partly available | The dashboard regex builder (flags, tokens, highlighting) exists; engine comparison, conversion, benchmarking and file search do not. |
| Keyboard and assistive access, narrow layouts, guided forms, truthful states | Implemented | Keyboard sending and history, labelled tabs and composer, phone layout without horizontal scrolling. Not screen-reader tested. |
| First-run setup | Available for the controller | Owner setup exists; the terminal needs no separate onboarding beyond capability discovery. |
| Notifications and history, retry and recovery, destructive confirmation | Partly available | Notification centre exists; two-key super confirmation, element locks, support tickets and unlock workflows are not implemented. |
| Built-in authenticator and QR registration | Not implemented | Sign-in uses the owner password; no authenticator exists. |
| Local history, bulk actions, exports, changelog, offline help, external editor | Partly available | Audit and operation exports exist; changelog viewer, offline help and editor hand-off do not. |
| File conversion, model-suite management, game-server management, forge publishing | Inapplicable to the terminal | Separate product areas with no implementation here; not implied by any menu item. |
| Documentation site, articles, downloads, fonts, link previews | Available | `docs/features/terminal.md` and the site article describe the terminal. |
| Front-screen provenance, genuine screenshots, design references | Partly available | Captures come from a Linux development controller with a stand-in shell and say so; Windows captures do not exist yet. |
| Build, setup, container, startup, update and recovery entrypoints | Unchanged | The terminal adds no new entrypoint. |
| Status integration and notification delivery states | Not implemented | Being developed in a separate lane. |
| Platform-specific items | Documented | CMD is Windows only. PowerShell depends on `pwsh` where the controller runs; the controller container image does not include it. |

## Implementation state

The backend (`src/Watchdog.Web/Terminal/`) and the dashboard Terminal page are implemented. The
terminal refuses requests that arrive through temporary public access, tunnels or proxies. A local
end-to-end check in Chrome passed on a Linux development controller using a test stand-in shell.
Real PowerShell and CMD on a Windows controller, the container image, reconnect and idle expiry are
not verified. Set `WATCHDOG_TERMINAL=disabled` to turn the feature off.
