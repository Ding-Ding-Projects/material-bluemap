# Command palette and changelog

## Behaviour

`Ctrl+Shift+F` opens a searchable command palette containing destinations, feature pages, settings,
and appearance actions. Results teleport to the owning tab or setting. The palette is a persisted
bounded card by default and can expand to a full-window view. The `Changelog` tab parses the
repository's committed `CHANGELOG.md`, preserves version/date/category/subject/commit links,
supports an anchored calendar with month/year jumps, 42-day range selection, typed ISO or slash
dates, named presets, and exports or copies the filtered rows.

## Configuration

Palette size is stored as `commandPalette.size` in local preferences. Changelog search uses the
same plain-text-first regex builder as every other search surface. Export is UTF-8 Markdown and
contains the visible commit short SHA when the source record has one.

## Failure modes and security

An entry without a recorded commit is labelled rather than linked to a guessed SHA. Date filters
are local; invalid or partial typed dates stay visible and are reported inline. The command
palette executes registered actions only; it does not evaluate visitor-entered code.

## Verification

The parser and date-range helpers have focused Vitest tests. The site type checker, lint, focused
site tests, and Vite production build pass in the clean linked worktree. The full monorepo suite
still reports unrelated CRLF fixture and `@material-bluemap/nbt` resolution failures.

## Suggested articles

- [Tabbed discovery and search](tabbed-discovery.md)
- [Notifications and destructive gate](notifications-and-destructive-gate.md)
