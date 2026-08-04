# Command palette and changelog

## Behaviour

`Ctrl+Shift+F` opens a searchable command palette containing destinations, feature pages, settings,
and appearance actions. Results teleport to the owning tab or setting. The palette is a persisted
bounded card by default and can expand to a full-window view. The `Changelog` tab parses the
repository's committed `CHANGELOG.md`, preserves version/date/category/subject/commit links,
supports typed date bounds and named presets, and exports or copies the filtered rows.

## Configuration

Palette size is stored as `commandPalette.size` in local preferences. Changelog search uses the
same plain-text-first regex builder as every other search surface. Export is UTF-8 Markdown and
contains the visible commit short SHA when the source record has one.

## Failure modes and security

An entry without a recorded commit is labelled rather than linked to a guessed SHA. Date filters
are local and invalid ranges simply produce an empty, honest result set. The command palette
executes registered actions only; it does not evaluate visitor-entered code.

## Verification

The parser has a focused Vitest test. The site type checker, full site Vitest suite (119 tests),
and Vite production build pass in the clean Pages worktree.

## Suggested articles

- [Tabbed discovery and search](tabbed-discovery.md)
- [Notifications and destructive gate](notifications-and-destructive-gate.md)
