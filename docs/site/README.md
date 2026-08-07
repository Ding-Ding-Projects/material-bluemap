# Documentation-site architecture

This category documents the Worldlens documentation site as a user-facing application rather than
as a bag of static pages.

| Article | What it covers |
|---|---|
| [Material Design 3 Expressive Pages rewrite](material-design-3-pages.md) | Ground-up shell architecture, M3 tokens and components, responsive navigation, accessibility, persistence, offline delivery and verification. |
| [Action walkthrough animations](action-walkthroughs.md) | The complete twelve-animation inventory, capture provenance, finite playback, reduced-motion stills, lazy loading, file budgets and regeneration. |
| [Pages feature parity](../pages-feature-parity.md) | The hand-written shared-feature inventory and the browser-platform boundaries that keep it honest. |
| [Scheduled settings and external sources](../scheduled-settings-and-external-sources.md) | Versioned language and appearance schedules driven by local time, bounded JSON APIs and Home Assistant boolean entities. |
| [Panel geometry](../panel-geometry.md) | Resize, drag, viewport bounds, persistence, reset and keyboard control for site panels. |

The site has no HTTP API of its own, so a Postman collection is not applicable. External schedule
sources are read-only browser requests documented in their own article; they do not turn this
static site into an API server.

