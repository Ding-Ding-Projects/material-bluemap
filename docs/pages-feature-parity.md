# GitHub Pages feature parity and responsive navigation

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

## Security considerations

The collapse choice is one boolean in the site's namespaced browser preferences. It is not sent over
the network, placed in a URL, or included in analytics. The site ships no analytics. Collapsing the
rail changes presentation only: it does not close pages, change tab order, modify groups, or discard
queries.

The feature-parity inventory contains source paths and public reasons only. It contains no host,
credential, account, or private-infrastructure details.

## Verification

- `SidebarNavigation.test.ts` covers compact and wide defaults, persistence, reset, notification,
  left/right collapse and expansion, horizontal placement, accessible state, and focus retention.
- `globalFeatureCoverage.test.ts` checks the exact hand-written requirement list, the existence of
  every implementation and verification file, and a substantial reason for each explicit browser
  exclusion.
- Site typecheck and production build run before compact runtime proof.
- Compact proof covers `360×640@1`, `390×844@1`, `414×896@1`, and bilingual `390×844@2`, requiring
  the exact viewport, no document/body horizontal overflow, no clipped controls, and no undersized
  targets.
- Publication is not proven by a local build. The integration owner records the exact default-branch
  commit, Pages workflow run, and live URL after deployment.

## Suggested articles

- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)
- [Appearance editors](appearance-editors.md)
- [Language and tone](language-and-tone.md)
- [Notification centre](notification-centre.md)
