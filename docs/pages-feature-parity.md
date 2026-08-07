# GitHub Pages feature parity and responsive navigation

The current implementation now sits inside a ground-up Material Design 3 Expressive application
shell rather than the former append-ordered topbar. The shell has an explicit top app bar, adaptive
navigation surface, bounded content canvas and footer; its quick actions open Search, Notifications,
Settings and the `Ctrl+Shift+F` command palette. The Home page also includes twelve finite,
action-specific GIF walkthroughs with local reduced-motion stills. See
[the architecture](site/material-design-3-pages.md) and
[the animation inventory](site/action-walkthroughs.md).

The documentation site is a user-facing application, not a passive brochure. It ships the same
discoverability, customization, localization, accessibility, search, safety, and export contracts
that apply to the desktop interface wherever the browser platform can truthfully provide them.

## Behaviour

The default tab placement is the left edge. On a first visit at `720` CSS pixels or narrower, the
side navigation starts collapsed so it cannot consume nearly half of the content width. The brand
button and a minimum-size expand button remain visible. Activating the button expands the complete
tab rail; activating it again collapses the rail without moving keyboard focus away from the
control.

The control exposes `aria-controls`, `aria-expanded`, and a localized accessible name that changes
between **Collapse the side navigation** and **Expand the side navigation**. It is shown only for
left and right placements. Top and bottom placements stay fully visible because they are horizontal
tab strips, not side navigation.

The site keeps a hand-written global-feature inventory in
`design/packages/site/src/policy/globalFeatureCoverage.ts`. Every applicable requirement names its
implementation and verification files. Browser-platform exclusions remain in that list with a
specific public reason; they cannot silently disappear merely because no matching source file was
found.

## Configuration

Open **Settings → General → Navigation** and use:

- **Tab strip edge** to choose left, right, top, or bottom.
- **Collapse side navigation** to store an explicit collapsed or expanded choice.

A new compact visitor receives the responsive collapsed default. Once the visitor makes an explicit
choice, that choice persists across reloads and viewport sizes. Resetting the setting removes the
stored choice and returns to the responsive default. Moving the strip to the top or bottom temporarily
hides the collapse button without deleting the saved side-navigation state.

On a phone, expand the rail to reach tab management, search, grouping, pinning, bulk-close actions,
and page destinations, then collapse it to give the current page the maximum available width. The
command palette remains available through <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> whether the
rail is open or closed.

Settings can also be scheduled instead of being changed by hand every time. **Settings →
Schedules** creates versioned, bounded rules for language and appearance values. A rule can use a
local date/time/weekday window, a bounded JSON API, or a Home Assistant boolean entity. Cross-midnight
windows, equal start/end times, timezone selection, priority, later-rule precedence, base-value
recovery, import/export and append-only rule history are explicit rather than hidden heuristics.
See [Scheduled settings and external sources](scheduled-settings-and-external-sources.md).

Every panel class in the site inventory uses the same geometry controller. Settings and ordinary
tab panels resize; floating anchored panels and interactive overlays also drag by their header.
Geometry stays inside the viewport, persists per surface, resets visibly, and supports keyboard
move/resize controls. See [Resizable and draggable panel geometry](panel-geometry.md).

## Failure modes

- If browser storage is blocked or full, collapse and expand still work for the current page load,
  but the choice cannot survive a reload. The Settings page already reports that storage condition.
- A malformed stored value is ignored and the responsive default is used.
- Changing to a horizontal tab placement while the rail is collapsed never hides the horizontal
  strip. Returning to a side placement restores the prior side-navigation choice.
- JavaScript failing before the shell mounts leaves the ordinary startup failure surface; it never
  leaves an invisible navigation region intercepting input.
- At compact widths the main page is allowed to shrink (`min-width: 0`) while cards, controls, and
  overlays wrap or scroll internally. The layout must not create document-level horizontal overflow.
- A scheduled external source that times out, redirects outside its allowed boundary, exceeds the
  response limit, returns malformed JSON, or has no session token fails closed. The
  last safe base value remains active and a reviewable notification names the failed rule.
- Corrupt or out-of-range stored panel geometry is clamped to the current viewport instead of
  restoring an unreachable handle or off-screen body.

## Security considerations

The collapse choice is one boolean in the site's namespaced browser preferences. It is not sent over
the network, placed in a URL, or included in analytics. The site ships no analytics. Collapsing the
rail changes presentation only: it does not close pages, change tab order, modify groups, or discard
queries.

The feature-parity inventory contains source paths and public reasons only. It contains no host,
credential, account, or private-infrastructure details.

External schedule rules store only a stable non-secret lookup key. A Home Assistant token is entered
through a password field, held only in memory for that page session, and cleared on reload, page
close, or either clear action; it never enters storage, exports, URLs or logs. API sources are
restricted to HTTPS or loopback, validate redirects and response size, apply an eight-second timeout,
and bound their polling interval. Home Assistant sources accept only `input_boolean` and
`binary_sensor` entities. An `off` entity falls through to the next matching rule; unavailable or
authentication failures restore the base layer instead of silently granting fallback authority.

## Verification

- `SidebarNavigation.test.ts` covers compact and wide defaults, persistence, reset, notification,
  left/right collapse and expansion, horizontal placement, accessible state, and focus retention.
- `globalFeatureCoverage.test.ts` checks the exact hand-written requirement list, the existence of
  every implementation and verification file, and a substantial reason for each explicit browser
  exclusion.
- Site typecheck and production build run before compact runtime proof. The committed driver is
  `design/packages/site/scripts/compact-proof.mjs`; it talks to the isolated browser target through
  Chrome DevTools Protocol without using the visitor's browser profile, foreground window, pointer,
  or keyboard.
- Compact proof covers Home, Settings, Schedules/external sources, Search/regex, command-palette
  teleport, appearance, notification history, changelog/date filtering, tab/group menus, and
  exports/bulk actions. It uses `360×640@1`, `390×844@1`, `414×896@1`, desktop `1024×768@1`, and
  bilingual `390×844@2` states.
- The driver records every candidate overflow element instead of truncating the list. Each one is
  classified as an accidental clip or a deliberate internal scroller; an accidental result fails
  the run. Schema version 2 also verifies both toggle inversions, both localized label changes, the
  exact final collapse state, toggle visibility, hidden navigation state, `aria-controls`, focus
  retention, minimum 44 CSS-pixel targets, scenario identity and the requested viewport.
- Eighteen machine-readable records are under `docs/runtime-proof/pages-parity-*.json`; fourteen
  matching real rendered captures are under `docs/screenshots/pages-parity-*.png`. Every record
  reports zero accidental clipping and zero undersized targets. The two appearance records also
  prove zero horizontal overflow and zero out-of-bounds descendants inside the editor itself.
- `compactProofSchema.test.ts` validates all 18 committed records and proves that a legacy or
  incomplete record is rejected.
- `schedule.test.ts`, `scheduleHomeAssistant.integration.test.ts`, and `schedulePanel.test.ts`
  cover the engine, real loopback Home Assistant states, secret non-persistence, and guided editor.
  `PanelGeometry.test.ts` constructs every declared transient owner—including the `menu` role—and
  rejects a null controller or non-floating geometry.
- Publication is not proven by a local build. The integration owner records the exact default-branch
  commit, Pages workflow run, and live URL after deployment.

## Suggested articles

- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)
- [Language and tone](language-and-tone.md)
- [Notification centre](notification-centre.md)
- [Scheduled settings and external sources](scheduled-settings-and-external-sources.md)
- [Resizable and draggable panel geometry](panel-geometry.md)
