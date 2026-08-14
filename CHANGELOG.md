# Changelog

## 1.2.0

- Implemented the real settings page with Obsidian's native Setting controls: homepage headline, open on startup, focus duration, excluded folders, and reduce motion now render, save through `saveData()`, restore on reopen, and refresh open homepages without resetting a running focus timer.
- Documents now open in one reusable adjacent tab: the homepage keeps its own leaf, consecutive opens reuse the source leaf, and closing a source document never closes Cosmos.
- Removed the invented knowledge-maturity states from the constellation; stars now show only explainable data (tag name, real note count, last edit time).
- Renamed "Awaiting decision" to an honest "Open tasks" and removed the misleading GO/NO-GO checklist copy of task data.
- Rebuilt Launch control as a session-local focus launcher: pick a recent note as the target, see the duration, start, pause, reset, or open the target; the rocket reacts only to real events (armed, launched, paused, complete) and nothing is written back to Markdown.
- Clicking a theme star now opens the Cosmos theme panel with the tag's real notes sorted by last edit—keyboard accessible, Escape to close, honest empty state.
- Closing the theme panel now restores focus to the exact star surface that opened it, even when the same theme appears in both Overview and Atlas.
- Renamed the calendar to Creation calendar with previous/next/current month navigation; day badges match their daily logs, and only creation evidence (frontmatter or file creation time) lights up a date.
- Added a first-run explanation for empty or sparse vaults; Cosmos still writes nothing to the vault.
- Hardened the lifecycle: metadata bursts collapse into a single refresh, a closed view never renders again, and closing releases timers, listeners, the theme panel, and the source-leaf reference.
- Clarified the privacy wording: Cosmos never opens note bodies and works from Obsidian's indexed metadata cache, which supplies the content-derived task text and positions.

## 1.1.0

- Brought the complete Cosmos Edition overview to the public plugin: deep-field metrics, an interactive knowledge constellation, a decision deck, launch control, and a moving signal belt.
- Added a scoped pointer light, live local clock, synchronized breathing and meteor motion, rocket readiness, and responsive layouts with reduced-motion support.
- Kept the public boundary local and read-only: every surface is derived from standard Obsidian metadata and Markdown tasks, with no network, account, telemetry, or AI coupling.
- Replaced the gallery with screenshots rendered by the production view against synthetic demo metadata.

## 1.0.6

- Removed `!important` from reduced-motion styles while preserving the same accessible behavior.

## 1.0.5

- Added GitHub build provenance attestations for all three release assets.

## 1.0.4

- Made release publication safe to rerun after a partial GitHub upload.

## 1.0.3

- Updated the public repository owner and author link after the repository transfer.

## 1.0.2

- First public release.
- Added the overview, focus orbit, activity calendar, and tag atlas.
- Added local-only metadata projection, excluded folders, reduced motion, mobile layout, and honest empty states.

## 1.0.1

- Internal release candidate; the clean CI checkout correctly rejected a missing tracked source entry.

## 1.0.0

- Internal release candidate; no installable GitHub release was published.
