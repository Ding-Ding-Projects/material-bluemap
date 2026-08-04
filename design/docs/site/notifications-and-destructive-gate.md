# Notifications and destructive gate

## Behaviour

Informational, success, warning, and error messages remain non-blocking toasts. Dismissed toasts
are reviewable in the `Notification centre` tab, whose local search covers translated titles and
details. Exporting is immediate because it does not change the history; clearing it is different:
the site names the exact number of session records and sends the action through the same two-key
super-confirmation gate as every other destructive site action. The tab strip uses that gate for
single-page closes, close-others, close-to-the-right, group removal, and both bulk-close directions
as well. The settings reset is the same blocking decision: it names the exact data, requires
`RESET` and `ALL` in two independently operated key controls, enables the full-range slider only
after both keys match, and completes only at the end of the slider. Escape and `Emergency exit`
cancel and return focus.

## Configuration

The gate is native to the site UI and uses the site's English, Hong Kong Cantonese, and bilingual
language mode plus the independent funny-level settings. Each destructive caller supplies its
own count, label, or group name, so the body cannot quietly become a generic "are you sure?".
The notification search is plain text by default and uses the same anchored regex builder as the
other site searches. Reduced-motion media settings remove the progress animation while preserving
the state change and facts.

## Failure modes and security

The destructive action cannot proceed on a missing key, partial slider, Escape, or dismissal. A
second click while a gate is open cannot re-enter the underlying action, because the caller waits
for the gate's promise before mutating tab, group, or notification state. Storage reset remains
local to the site's own preference namespace. Notifications never ask for payment, reviews,
donations, or account credentials.

## Verification

The gate and notification centre type-check and ship in the Vite production bundle. Focused site
tests cover the localized controls, anchored date range picker, content, changelog, and search
builder (**132 tests across 16 files**); the full workspace gate remains **5,602 passed, 3
skipped** before this source-only change. The production build and lint pass. A live headless
Windows interaction is not claimed until the cheap headless route captures the actual published
surface.

## Suggested articles

- [Command palette and changelog](command-palette-changelog.md)
- [Tabbed discovery and search](tabbed-discovery.md)
