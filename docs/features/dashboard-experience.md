# Dashboard experience

The controller dashboard uses a "command centre" design: a deep-space ground with a faint grid,
frosted glass panels, and motion that carries meaning. The design reference lives in
`design/redesign-2026-10/`.

## Command centre

- **Host radar.** Every paired computer is a blip. Online computers pulse; offline ones are grey.
  Selecting a blip selects that computer.
- **Telemetry.** A processor line built from real readings received in this browser session. Until
  two readings arrive, the panel says how many it has instead of drawing an estimate.
- **Gauges.** Memory and the fullest volume fill to their reported values. Storage turns amber at
  75% and red at 90%.
- **Slop Machine link.** A compact view of the remote agent state with packets travelling along the
  link while it is active. See [Slop Machine remote control](remote-agent.md).
- **Event stream** and a guarded **Power** panel.

Panels boot in with a short staggered rise when a page opens. Automatic refreshes update values in
place without replaying the entrance. Page changes use a view transition where the browser supports
one.

## Navigation and search

- `Ctrl+Shift+F` (or `Ctrl+K`) opens the command palette: every page, refresh, pairing, DNS flush,
  remote agent actions, power actions, theme and motion toggles, settings export, and sign out.
  Typing a service name offers a restart command for it.
- `/` focuses the top search. `R` refreshes. Right-click, `Shift+F10` or the context-menu key opens a
  context menu with copy row, copy row as JSON, search for this, refresh and the palette.
- Every search box has a regular expression builder with flag toggles, insertable tokens, live match
  highlighting in test text, and a background worker with length and time limits.

## Settings

Settings affect only the browser that sets them. They can be exported to and imported from JSON,
searched (with the regex builder), and reset.

| Group | Settings |
| --- | --- |
| Language and voice | English, Cantonese or both for navigation, headings and main buttons; English and Cantonese playfulness sliders; emoji in notices; product name; personal vocabulary JSON upload or drop |
| Appearance | Match device, Command centre (dark) or Daylight (light); accent swatches and a free colour picker; text size 85% to 150%; comfortable or compact tables; high contrast; motion: match device, full or reduced |
| Focus and reading | School mode (plain words, a tip on every page, no jokes or celebrations); focus spotlight; one thing at a time (hidden side menu); progress cheer |
| Sound and narration | Read notices aloud with a voice picker; action sounds |
| Data and refresh | Automatic refresh and interval; hide computer names |

## Notifications

Notices appear as toasts with a life bar and are kept in a notification centre for the browser
session. The bell shows the unread count.

## Accessibility and motion

All controls are real buttons, links and inputs with visible focus. Live regions announce notices.
Reduced motion, from the device or the Motion setting, removes every animation and transition while
keeping the same information on screen. Forced-colours mode keeps borders visible.

## Not included yet

Scheduled settings, per-element appearance editing and element locks, browser-style workspace tabs
beyond the computer tabs, and fully reviewed Cantonese text for every sentence are not part of this
release. Cantonese currently covers navigation, page titles and descriptions, and the main actions.
