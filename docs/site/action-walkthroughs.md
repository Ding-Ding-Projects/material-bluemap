# Action walkthrough animations

## Behaviour

The Home page carries twelve action-specific walkthroughs. Each GIF is 640×400, silent, finite
(plays once), natively lazy-loaded and paired with a PNG still. The `<picture>` element selects the
still whenever `prefers-reduced-motion: reduce` is active. Width and height attributes reserve the
frame before either asset loads, preventing layout shift.

Every card has action-specific English and Hong Kong Cantonese alt text, a full caption, a deliberate
Replay action and a link to the feature article. Replay does nothing in reduced-motion mode.

## Inventory and provenance

The source frames are genuine built Worldlens app/site captures. They are explanatory sequences,
not claims that the branch is already deployed. The final live Pages capture and workflow remain a
separate release gate.

| Action | GIF | Bytes | Real source frames |
|---|---:|---:|---|
| Collapse and reopen navigation | `navigation-drawer.gif` | 38,680 | Current branch production build, collapsed and expanded headless states |
| Open the global command palette | `command-palette.gif` | 36,107 | Current branch production build, Home and opened palette |
| Search every documentation article | `documentation-search.gif` | 33,167 | Current branch production build, Home and Search surfaces |
| Build and apply a regular expression | `regex-builder.gif` | 36,180 | `settings-search.png`, `settings-regex-builder.png` |
| Switch the live colour scheme | `theme-switch.gif` | 47,388 | `theme-light.png`, `theme-dark.png` |
| Change language and both tone levels | `language-tone.gif` | 41,502 | `settings-section-language-and-tone.png`, compact bilingual Pages proof |
| Create and collapse a tab group | `tab-groups.gif` | 30,960 | compact Pages tab/group proof, bottom-tab proof |
| Find a tab across the workspace | `tab-discovery.gif` | 33,474 | real root and search menu captures |
| Filter and export notification history | `notification-history.gif` | 51,467 | notification corner, toast and history captures |
| Filter the complete changelog | `changelog-filter.gif` | 18,319 | configuration history and compact Pages changelog captures |
| Edit one element's appearance | `appearance-editor.gif` | 28,527 | Pages settings and compact appearance-editor captures |
| Inspect and download the verified installer | `verified-download.gif` | 31,249 | release-download dialog and current branch Home build |

The total GIF payload is 427,520 bytes, below the 8 MiB audited budget. Every individual GIF is
below 900 KiB. PNG stills are separately checked for their signature and exact dimensions.

## Configuration and regeneration

The committed generator consumes ordered PNG frames from a scratch directory and writes both media
forms:

```powershell
node design/packages/site/scripts/build-walkthrough-gifs.mjs --frames <capture-directory>
```

Each action directory contains at least `01.png` and `02.png`. The generator centre-crops to an 8:5
frame, scales to 640×400, quantizes each frame to a bounded 96-colour palette, writes a finite GIF,
and emits the last frame as the still fallback. Capture folders are scratch evidence and are not
committed; the decoded, audited outputs are.

## Failure modes

- Missing action folder or fewer than two ordered frames: generation fails with the exact action id.
- Missing or corrupt GIF/PNG: the test fails before publication.
- Wrong dimensions or file above budget: the test fails before publication.
- Browser lacks native lazy loading: the media loads eagerly but remains bounded and accessible.
- Reduced-motion media query unsupported: the finite GIF plays once; there is no infinite loop.

## Security considerations

The GIFs and PNGs are inert local build assets. They contain no audio, analytics, access token,
account identifier, typed credential or user world data. The gallery makes no runtime request beyond
its own published origin. Generated screenshots are reviewed before entering the ordered frame set.

## Verification

`walkthroughs.test.ts` checks the hand-written twelve-action inventory, unique media ids, bilingual
alt text, GIF/PNG decode signatures, 640×400 dimensions, per-file and total budgets, finite playback,
lazy/async image attributes, reduced-motion `<source>` elements, and narrow container behaviour. The
site build proves Vite resolves every local asset into the production bundle.

## Suggested articles

- [Material Design 3 Expressive Pages rewrite](material-design-3-pages.md)
- [Pages feature parity](../pages-feature-parity.md)
- [Command palette](../command-palette.md)
- [Appearance editors](../appearance-editors.md)

