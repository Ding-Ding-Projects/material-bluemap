# Startup recovery and brand identity on the site

## Behaviour

The documentation site uses the same locally bundled Worldlens mark as the desktop app. The mark
is a real Home button with a localized accessible name, visible focus and appearance-editor
targeting; at compact widths the wordmark folds away while the image and accessible name remain.
The site article for startup recovery documents the desktop failure boundary, diagnostic exports,
single-flight actions and the packaged proof rather than presenting a vague “something went wrong”
promise.

## Configuration

The logo has no site preference of its own. It participates in the existing per-element appearance
system through the brand button. Theme, density, font and placement settings remain independent.

## Failure modes

- A missing generated site logo fails the brand-asset freshness check and the Vite build.
- A stale derivative fails `brand:build -- --check` instead of silently displaying the retired
  BlueMap mark.
- At narrow widths the visible wordmark may be hidden by design; the image and the button's
  localized accessible name remain.

## Security considerations

The image is bundled. It makes no CDN or analytics request, carries no tracking data, and is not
loaded from a release or user-controlled URL. The Home action is a local tab navigation.

## Verification

The brand builder validates the square PNG source, produces deterministic derivatives and checks
byte equality. Site typecheck and production build resolve the imported image. Compact proof and
the site interaction tests remain the final layout and action gates after integration.

## Suggested reading

- [Localized shell and appearance coverage](localized-shell-and-appearance.md)
- [Tabbed discovery and search](tabbed-discovery.md)
- [Startup recovery and the Worldlens identity mark](../../../docs/startup-recovery.md)
