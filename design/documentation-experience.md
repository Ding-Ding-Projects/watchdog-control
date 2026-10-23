# Documentation experience design handoff

## Purpose

Give an operator a calm, task-first route through the intended Watchdog Control workflows while making the current delivery state impossible to mistake. The documentation site explains the product; it never becomes a host-control runtime.

## Screen and state inventory

| Screen | Normal state | Alternate states | Minimum layout | Actions |
| --- | --- | --- | --- | --- |
| Home | Guided workflow cards and current Planned state | Search results, empty results, reduced motion, dark theme | 320 px | Choose a task, open an article, inspect feature status |
| Search | Plain text is default | Valid regex, invalid regex, timed-out pattern, no results | 320 px | Focus with `/`, select a result, open or close the adjacent regex builder |
| Feature inventory search | Plain query paired with status filter | Valid regex, invalid regex, timeout, empty result, status filter changed | 320 px | Filter inventory and open its own builder; query and pattern state stay separate from global search |
| Guided workflow | Ordered task steps and non-execution notice | Visitor progress, reset, related article | 320 px | Mark a demonstration step as read; reset visitor progress |
| Article | Readable sections, state label, suggested next steps | Language mode notice, dark theme, narrow typography | 320 px | Follow internal links and operate the labelled progress demonstration |
| Feature status | Filterable site-specific inventory | Each status filter and no-match state | 320 px | Search names/reasons and filter by state |
| Wiki reader | Selected complete chapter and internal chapter nav | Every chapter, narrow navigation overflow | 320 px | Open chapter anchors and related guides |
| Settings | Task-oriented groups | English, Cantonese pending, bilingual pending, light/dark/system, reset, reduced motion | 320 px | Persist site preferences and restore defaults |
| Settings search | Plain text is default | Valid regex, invalid regex, timeout, no matches | 320 px | Filter settings cards through an independent settings regex builder |

## Settings control inventory

The current controls and their consumers are deliberately narrow. They affect the documentation page, never the product. Entries marked incomplete are known gaps, not hidden future behavior.

| Control or requirement | Group | Consumer | Persistence and recovery | State or reason |
| --- | --- | --- | --- | --- |
| Language mode | Reading | Site notice only; article translation is not implemented | Local storage; reset restores English | Incomplete, full reviewed Cantonese content is missing |
| English and Cantonese tone levels | Reading | Slider values only; message copy is not fully wired | Local storage; reset restores 1 | Incomplete, both language copy systems are not implemented |
| Theme | Reading | Site CSS palette | Local storage; system choice follows device | Implemented in source, deployed verification pending |
| Reduced motion | Accessibility | Site transitions and scroll behavior | Local storage plus device preference; reset follows device | Implemented in source, deployed verification pending |
| Search query, pattern, flags, validation, and mode | Search | Global docs search, feature inventory, and settings card filtering, each with separate state | Local storage; reset returns each to plain text | Incomplete, RegexBuddy compatibility and complete parity inventory remain absent |
| Visitor-owned guide progress | Workflow demonstrations | Current rendered guide only | Current page state; reset clears | Incomplete, persistence across reload is absent |
| Personal vocabulary upload | Privacy | No consumer exists | No file or mapping is stored | Incomplete; the always-visible local JSON loader and reset path are required |
| School mode | Reading | No consumer exists | No shared mode or recovery record exists | Incomplete; the user-facing page requirement applies |
| Narrator and voice selection | Accessibility | No spoken event consumer exists | No selection or fallback state exists | Incomplete; not silently excluded because this is documentation |
| Scheduled settings | Reading | No scheduled consumer exists | No schedule record or reset exists | Incomplete; not silently excluded |
| Individual ADHD modes | Reading | No focus or progress consumer exists | No mode state or reset exists | Incomplete; each mode needs a real page behavior |
| Appearance editor, colour picker, typography, presets | Appearance | No editor consumer exists beyond global theme | No editor data or import/reset exists | Incomplete; site customization contract remains open |
| Workspace tabs and tab discovery | Navigation | No tab strip consumer; page routes use links | No tab state or reset exists | Incomplete; not silently excluded |
| Locks and authenticator | Security | No element-lock or credential consumer exists | No state or recovery route exists | Incomplete; docs do not claim access control |
| Notifications and history | Feedback | No notification center or version-history consumer exists | No records to persist or clear | Incomplete |
| Product host actions | Product boundary | Not consumed by the documentation page | Not stored here | Inapplicable because documentation must not execute host operations |
| Installer and update settings | Delivery | No verified release asset exists | No update preference exists | Inapplicable at present; expose only after a verified release exists |

## Interaction and state rules

- Every content search has a nearby builder. Pattern, flags, validation result, and mode are owned by the documentation search and are stored locally. Plain text remains the initial mode.
- Regex evaluation runs in a disposable Web Worker, stops after 100 ms, rejects patterns longer than 160 characters and returns at most 250 results. Only JavaScript RegExp is supported. Full RegexBuddy parity is an explicit unfinished item.
- Theme, language selection, tone levels, reduced motion, and the search mode persist in browser-local storage. Reset clears all visitor preferences.
- Every example is labelled as a documentation demonstration. Its controls affect visitor-owned page state and do not call an API or imply that the product executed.
- Wiki chapters are rendered from project-owned local content and link among the home, feature guides, architecture, security, operations, and other chapters.

## Visual system

Use local system typography, restrained blue primary actions, a quiet light/dark surface palette, clear state pills, and generous reading width. Avoid external font, image, script, analytics, or CDN requests. Keep headings and paragraphs readable at narrow widths. Content surfaces and code or table regions may scroll internally; the document body should not require horizontal scrolling.

## Accessibility and limits

Use semantic landmarks, named controls, visible focus, keyboard-operable navigation, polite status updates, reduced-motion support, and 44 px or larger primary touch targets. A complete screen-reader audit, enlarged-text review, all-language layout inspection, and deployed parity check remain pending. Cantonese content is not yet reviewed, so the language selector states that limitation rather than inventing a translation.

## Implementation notes

- Static entry: `docs/index.html`.
- Styling: `docs/assets/site.css`.
- Content and site-specific status inventory: `docs/assets/content.js`.
- Navigation, persistence, search and interactions: `docs/assets/site.js`.
- Bounded regex worker: `docs/assets/regex-worker.js`.
- Pages publisher: `.github/workflows/pages.yml`, manually dispatched against a reviewed source ref.

The page is not a production application mock, and no product behavior may be promoted beyond the independently verified state in the project records.
