# Tab and group appearance

## Behaviour

The published Pages tab strip keeps its normal tab-management context menu and adds **Edit tab
appearance…**. Group headers keep their collapse, rename, colour and bulk-close actions and add
**Edit group appearance…**. Shift+right-click opens the same anchored editor directly when the
browser reports the modifier. The editor returns focus to the tab or group that opened it.

The editor is the existing Material 3 appearance surface: per-instance typography, colour,
spacing, shape, state and reset controls are stored under stable `tab#<id>` and
`tab-group#<id>` style ids. The tab label remains the accessible name even when a custom style
compresses the visual treatment.

## Configuration

`TabsController` receives the shared `AppearanceController`, so tab and group records use the
same persisted store, presets, import/export path and global reset as the rest of the site. A
new tab gets a stable instance id from its registered page id; a group uses its persisted group
id. No appearance value is sent over the network.

## Failure modes

- If an appearance target is missing, the editor reports that fact and does not invent a style.
- If the browser cannot persist storage, edits apply for the current page and the existing
  storage warning explains that a reload will forget them.
- If the editor cannot represent a property, it keeps the value in the layered record rather
  than silently dropping it during export.
- A normal right-click never loses tab management: the appearance command is additive. Shift+
  right-click is a direct path only when the event exposes the modifier.

## Security considerations

Appearance values are validated and applied as managed CSS values; they are not interpolated into
HTML or executed as script. Theme import is schema-checked by `AppearanceStore`, unknown values
are preserved for round-trip export, and the editor has no network or analytics dependency.

## Verification

- `pnpm --filter @material-bluemap/site typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm --filter @material-bluemap/site exec vitest run` — 127 tests passed across 13 files.
- Hosted CI run `30890865475` — screenshot suite and all build/test jobs passed.
- Pages deployment `30892326119` — Build site and Deploy to Pages passed.

## Suggested articles

- [Localized shell and appearance coverage](localized-shell-and-appearance.md)
- [Tabbed discovery and search](tabbed-discovery.md)
- [Settings tab search](settings-tab-search.md)
