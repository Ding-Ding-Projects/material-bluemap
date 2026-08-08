# Server-hosted Material 3 map UI

The browser-facing BlueMap viewer now mounts a Material 3 shell around the map canvas. The
shell is intentionally framework-neutral so the same built viewer can be served by the CLI's
static handler or embedded by the desktop application.

## Included controls

- Responsive M3 app bar with search, settings, and command-palette entry points.
- Persisted light/dark theme, density, and per-language funny-level controls. Funny styling only
  changes notification voice; map coordinates and errors remain factual.
- Keyboard-visible focus rings, touch-sized controls, contrast-safe surface tokens, and a compact
  mobile layout.
- Right-click on loaded terrain opens an anchored M3 context menu. **Add pinpoint here** stores a
  local coordinate record and renders a labelled pinpoint at the clicked screen location. Copying
  coordinates and cancelling are available from the same menu.

## Storage and security

Theme, density, message style, and pinpoints use the browser's local storage under `bluemap-*`
keys. No network request is made by the shell and no remote scripts, fonts, images, or analytics
are required. The server's existing static handler remains responsible for path confinement and
ETag handling.

## Verification

`packages/viewer/src/materialShell.test.ts` verifies shell mounting, theme persistence, anchored
context-menu behaviour, coordinate storage, and pinpoint rendering. Build the dependency order
with `pnpm --dir design --filter @worldlens/shared build` followed by
`pnpm --dir design --filter @worldlens/viewer build`.

### Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)
