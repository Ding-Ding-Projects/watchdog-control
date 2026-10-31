# Terminal design handoff (issue #3)

This folder holds the design canvas for the chat-style PowerShell and CMD terminal requested in
[issue #3](https://github.com/Ding-Ding-Projects/watchdog-control/issues/3). Each `.dc.html` file is one
artboard and `canvas.json` places them. The artboards load `./support.js`, which the design canvas
runtime supplies. These files are design references, not runtime evidence.

The terminal uses the command centre identity from `design/redesign-2026-10/`: deep-space ground,
glass panels, signal cyan for the owner's commands and the primary action, Chakra Petch display,
Geist body and Geist Mono for every command, output line and number.

## Artboards

| File | Surface |
| --- | --- |
| `Main.dc.html` | Running session: execution identity, session tabs, chat transcript, follow-output indicator, session details and limits, composer |
| `New-session.dc.html` | Capability discovery: execution computer, platform, account, available and unavailable shells with reasons, enforced limits, no-shell state |
| `States.dc.html` | Waiting for input, disconnected, stopped, exited, expired, output limit, unsupported full-screen programs, signed out, inert output |
| `Narrow.dc.html` | Phone width with scrolling session tabs and a stacked composer |

## Components and state IDs

| Component | State IDs | Wiring |
| --- | --- | --- |
| Execution identity chips | `identity.container`, `identity.windows`, `identity.other` | From `GET /api/terminal/capabilities` (`computer`, `platform`, `account`, `container`). A container is never labelled as the Windows host. |
| Shell card | `shell.available`, `shell.unavailable` | One per shell in capabilities; unavailable cards show the reason and a disabled start button. |
| Session tab | `tab.starting`, `tab.idle`, `tab.running`, `tab.stopped`, `tab.exited`, `tab.expired`, `tab.unknown` | Session list and per-session polling. Rename is local to the owner's sessions. Close stops the session after confirmation when it is running. |
| Transcript entry | `entry.command`, `entry.input`, `entry.stdout`, `entry.stderr`, `entry.lifecycle`, `entry.truncated` | Event types from `GET /api/terminal/sessions/{id}?after=N`. Text is inserted as text nodes only. |
| Follow output | `follow.on`, `follow.off-new-output` | Off when the reader scrolls up; shows the count of unseen entries; click returns to the end. |
| Composer | `composer.command`, `composer.stdin`, `composer.disabled` | Enter sends, Shift+Enter adds a line, Up and Down walk this session's history. While a command runs, sending writes to standard input. |
| Session details | `details.running`, `details.idle`, `details.ended` | Elapsed time, shell, account, start time, rename. |
| Limits | `limits.normal`, `limits.near`, `limits.reached` | Output kept versus the cap, idle timeout, session count and input size from capabilities. |
| Connection | `conn.ok`, `conn.retrying`, `conn.lost` | Polling failures back off; the last state is shown as unknown until contact returns. |

## Required states

- **Empty:** no sessions yet; capabilities shown with explicit start buttons.
- **Starting:** process launching; composer disabled.
- **Idle:** ready for a command.
- **Running:** output streaming; composer sends standard input.
- **Waiting for input:** a running program reads standard input.
- **Cancelled / stopped:** the owner stopped the session; the process tree ended.
- **Exited:** the shell ended by itself; the real exit code is shown.
- **Disconnected:** polling failed; nothing is shown as finished.
- **Expired:** idle timeout or controller restart.
- **Limit reached:** oldest output dropped with a marker.
- **Unsupported:** full-screen console programs.

## Backend contract used by the design

| Request | Purpose |
| --- | --- |
| `GET /api/terminal/capabilities` | Shells, platform, execution identity and limits |
| `GET /api/terminal/sessions` | The owner's sessions |
| `POST /api/terminal/sessions` `{ "shell": "powershell" \| "cmd", "name"? }` | Explicit session creation |
| `GET /api/terminal/sessions/{id}?after=N` | Ordered events after sequence N and the current state |
| `POST /api/terminal/sessions/{id}/input` `{ "text": "...", "mode": "command" \| "stdin" }` | Command or standard input |
| `PATCH /api/terminal/sessions/{id}` `{ "name": "..." }` | Rename |
| `DELETE /api/terminal/sessions/{id}` | Stop the session and its process tree |

Implementation status, verification and the required-feature matrix live in
[`FEATURE-MATRIX.md`](FEATURE-MATRIX.md) and `docs/features/terminal.md`.
