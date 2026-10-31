# Watchdog Control redesign (October 2026)

This folder is the checked-in record of the October 2026 interface redesign canvas. Each
`.dc.html` file is one artboard; `canvas.json` is the canvas index that places them. The
artboards load `./support.js`, which is supplied by the design canvas runtime and is not part of
this repository. Opening a file directly in a browser shows its static markup.

These files are a design reference. They are not the shipped interface and they do not prove
any product behavior. Implementation status lives in `ROADMAP.md` and `HANDOFF.md`.

## Visual direction

"Command centre": a deep-space ground with a faint measurement grid, frosted glass panels that
boot in with a short staggered rise, and live motion that carries meaning: a radar sweep over
the connected computers, a scrolling telemetry waveform, ring gauges that fill to their reading,
packets travelling along the remote link, and a glowing countdown ring for one-time codes. Every
animation has a reduced-motion path that shows the same information without movement.

| Token | Value | Use |
| --- | --- | --- |
| Ground | `#05070B` | Page background with cyan and violet glows |
| Glass panel | `rgba(22,30,42,.78)` to `rgba(12,17,25,.78)` | Panels, with a 14 px backdrop blur |
| Hairline | `rgba(120,170,220,.16)` | Panel and control borders |
| Text | `#E6EDF5` | Primary text |
| Muted text | `#8A9AB0` | Labels and secondary text |
| Signal cyan | `#3DE8FF` to `#4F8BFF` | Primary action, focus, active state, live data |
| Violet | `#7C5CFF` | Secondary data series and the relay node |
| Healthy | `#7CFFB2` | Online, succeeded, signed in |
| Caution | `#FFB23E` | Warnings and capacity pressure |
| Danger | `#FF4D6A` | Power actions and failures |

Type: Chakra Petch for display headings, Geist for body text, Geist Mono for every number, code,
identifier and small uppercase label. The shipped dashboard vendors these fonts so it never loads
anything from the internet.

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
