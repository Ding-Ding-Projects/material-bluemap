# Material Design 3 Expressive Pages rewrite

## Behaviour

The Worldlens documentation site is rebuilt around one explicit application shell:

1. a sticky M3 top app bar with a functional Worldlens lens-and-voxel mark;
2. an adaptive navigation surface containing the real browser-style tab workspace;
3. a bounded content canvas that renders Home, documentation, screenshots, settings, search,
   changelog and notification history; and
4. a persistent local-assets/no-tracking footer.

`ExpressiveSiteShell.ts` owns that hierarchy. The former entry-point append order is no longer the
layout model. The shell consumes the existing `TabModel`, `SidebarNavigation`, `I18n`, appearance,
notification and command-palette controllers, so the rewrite does not create parallel state that
can drift from the controls users already configured.

The visual language uses the repository's Material Design 3 reference and system tokens for every
colour, type scale, shape, elevation, state layer, spacing value and motion duration. The shell
adds no second theme. Its distinctive asymmetric lens mark, frosted top app bar, rounded adaptive
navigation surface, tonal content background and expressive hero all re-derive under light, dark,
accent, density and per-element appearance changes.

## Configuration

- **Navigation:** Settings controls left, right, top or bottom placement. Left and right surfaces
  have a persisted collapse state. A compact first visit starts collapsed and keeps a 64 CSS-pixel
  control rail reachable.
- **Language and tone:** English, Hong Kong Cantonese and compact bilingual modes remain available,
  with independent persisted funny-level controls for English and Cantonese.
- **Appearance:** theme, density, accent, typography, presets, import/export, per-element editors and
  reset use the same existing settings store and live M3 tokens.
- **Discovery:** the app bar provides real Search, Notifications, Settings and command-palette
  actions. `Ctrl+Shift+F` remains the only global palette shortcut.
- **Tabs:** overflow, reorder, pinning, groups, four independent tab searches, anchored regex
  builders and protected bulk-close previews are unchanged behind the new navigation surface.

## Failure modes

- Browser storage unavailable: the site stays usable for the current load and exposes truthful
  default provenance instead of pretending persistence worked.
- Compact navigation data corrupt or missing: the responsive default is used, and the toggle stays
  reachable.
- Content wider than the viewport: the content canvas has `min-width: 0`, cards wrap long bilingual
  text, overlays scroll internally, and no parent hides accidental overflow.
- Reduced motion: shell transitions collapse and animated walkthroughs are replaced with still
  images.
- Forced colours: top app bar, navigation and footer paint explicit Canvas/CanvasText surfaces and
  discard decorative shadows.
- JavaScript boot failure: the existing localized recovery surface replaces the mount point rather
  than leaving a blank deployment.

## Security considerations

The production site bundles scripts, styles, fonts, screenshots, GIFs and still images. It loads no
CDN, analytics, advertising, tracking pixel or third-party runtime. Ordinary repository and release
links navigate only after the visitor activates them. Visitor preferences stay in namespaced browser
storage. Home Assistant schedule credentials, when deliberately supplied, remain in page-session
memory and never enter storage, exports, URLs or logs.

The action walkthroughs are explanatory media. Their documented capture provenance is not presented
as deployment proof; only a capture of the exact built commit and the terminal Pages workflow can
prove the public site.

## Verification

- `ExpressiveSiteShell.test.ts` mounts the actual shell and proves labelled regions, quick actions,
  palette activation, compact collapse/expand state and a persistent toggle.
- `shellChrome.test.ts` guards the ground-up region hierarchy, M3-only colour roles, scroll-linked
  app-bar elevation, adaptive drawer/scrim, bounded content canvas, quick-action wiring,
  reduced-motion and forced-colour branches.
- `globalFeatureCoverage.test.ts` checks the hand-written Pages inventory and its implementation/test
  evidence.
- `walkthroughs.test.ts` validates the twelve GIF/still pairs, dimensions, decode headers, size
  budgets, lazy loading, finite playback, bilingual alt text and narrow layout.
- The compact runtime gate covers 360×640, 390×844, 414×896, desktop, and 390×844 bilingual at 200%
  with zero document/body overflow, no clipped controls and no undersized targets.

Source checks and local captures do not claim that the public deployment changed. Live proof is
recorded only after the exact commit is deployed and read back.

## Suggested articles

- [Action walkthrough animations](action-walkthroughs.md)
- [Pages feature parity](../pages-feature-parity.md)
- [Tabbed navigation](../tabbed-navigation.md)
- [Appearance editors](../appearance-editors.md)
- [Regex builder](../regex-builder.md)

