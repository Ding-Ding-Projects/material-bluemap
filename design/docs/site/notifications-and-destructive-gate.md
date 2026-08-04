# Notifications and destructive gate

## Behaviour

Informational, success, warning, and error messages remain non-blocking toasts. Dismissed toasts
are reviewable in the `Notification centre` tab. The settings reset is the exceptional blocking
decision: it names the exact data, requires `RESET` and `ALL` in two independently operated key
controls, enables the full-range slider only after both keys match, and completes only at the end
of the slider. Escape and `Emergency exit` cancel and return focus.

## Configuration

The gate is native to the settings UI and uses the site's English, Hong Kong Cantonese, and
bilingual language mode plus the independent funny-level settings. Reduced-motion media settings
remove the progress animation while preserving the state change and facts.

## Failure modes and security

The destructive action cannot proceed on a missing key, partial slider, Escape, or dismissal.
Storage reset remains local to the site's own preference namespace. Notifications never ask for
payment, reviews, donations, or account credentials.

## Verification

The gate and notification centre type-check and ship in the Vite production bundle; the full site
Vitest suite passes. A live headless Windows interaction is not claimed until the cheap headless
route captures the actual published surface.

## Suggested articles

- [Command palette and changelog](command-palette-changelog.md)
- [Tabbed discovery and search](tabbed-discovery.md)
