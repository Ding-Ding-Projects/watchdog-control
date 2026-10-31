# Watchdog Control redesign (October 2026)

This folder is the checked-in record of the October 2026 interface redesign canvas. Each
`.dc.html` file is one artboard; `canvas.json` is the canvas index that places them. The
artboards load `./support.js`, which is supplied by the design canvas runtime and is not part of
this repository. Opening a file directly in a browser shows its static markup.

These files are a design reference. They are not the shipped interface and they do not prove
any product behavior. Implementation status lives in `ROADMAP.md` and `HANDOFF.md`.

## Visual direction

"Night shift control room": an ink ground, a single signal-amber accent used for the active
state and primary action, and a check-in pulse line as the signature element.

| Token | Dark (default) | Light ("day shift") |
| --- | --- | --- |
| Ground | `#0E1116` | `#F5F2EA` |
| Raised surface | `#161B22` | `#FFFDF8` |
| Rail and header | `#11151B` | `#EFEADF` |
| Hairline | `#2A323D` | `#DDD6C6` |
| Text | `#E8EAED` | `#15181D` |
| Muted text | `#9BA3AE` | `#5C574D` |
| Accent | `#F2A93B` | `#8A4F00` |
| Healthy | `#4CC38A` | `#1E7A4C` |
| Danger | `#FF6B5B` | `#B3261E` |
| Information | `#5BC8E6` | `#0F6A85` |

Type: Bricolage Grotesque for display headings, IBM Plex Sans for body text, JetBrains Mono for
every number, code, identifier and small uppercase label. The shipped dashboard vendors these
fonts so it never loads anything from the internet.

## Artboards

| File | Surface |
| --- | --- |
| `Main.dc.html` | Dashboard overview with the check-in pulse, metrics, capacity, remote summary, events and power |
| `Codex-remote.dc.html` | Slop Machine remote: tool status, device-code sign-in assist, remote control start and stop, phone pairing |
| `Services.dc.html` | Services table with the regular expression builder and the command palette |
| `Settings.dc.html` | Settings: language and tone, appearance, focus and reading, sound and narration, data and refresh |
| `Sign-in.dc.html` | Sign in and the first-run owner setup |
| `Mobile-overview.dc.html` | Phone layout |
| `Setup-welcome.dc.html` | Setup assistant welcome with quick host |
| `Setup-progress.dc.html` | Setup assistant install progress |
| `Docs-home.dc.html` | Documentation site home |

Bracketed text such as `[HOST NAME 1]` marks values that come from live data.
