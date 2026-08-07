# The Minecraft licence, and the consent that refers to it

BlueMap textures a map from the real Minecraft client file, so nothing renders on this computer
until the person running the app has accepted Mojang's EULA. The app has always recorded that
answer. What it did not do until now was **show the document the answer is about**: the consent
step quoted four lines of BlueMap's own summary and offered a link that opened a browser, and a
person who reached the question from the render wizard was told the render had stopped, sent to
Settings, and left to scroll.

This document covers what the app does now: the licence step at first run, the in-app viewer that
fetches and categorises Mojang's document, and the placement mechanism the viewer shares with every
other docked panel.

## Contents

- [The licence at first run](#the-licence-at-first-run)
- [A real render, from the wizard's consent gate to a finished map](#a-real-render-from-the-wizards-consent-gate-to-a-finished-map)
- [Fetching and caching the document](#fetching-and-caching-the-document)
- [The tabbed viewer](#the-tabbed-viewer)
- [Categorisation is navigation, never editing](#categorisation-is-navigation-never-editing)
- [Search, export and copy](#search-export-and-copy)
- [Appearance](#appearance)
- [Where a docked panel sits](#where-a-docked-panel-sits)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)

## The licence at first run

First-run setup is four steps: **Welcome**, **The licence**, **Minecraft files** (the question),
and **Map storage**. The licence has its own step and its own progress number, and it comes before
the question, because a document offered after the buttons is a document nobody opens and one
offered as a link beside them is one people click past.

Nothing on the licence step answers anything. Its only forward control is `Next`, and the step says
in as many words that reading it agrees to nothing.

The consent step itself is unchanged in the ways that matter:

- **Accepting is never pre-selected.** There is no checkbox, no radio button and no switch anywhere
  on it; the only way to accept is to press `Accept`.
- **`Accept` and `Decline` are the same button rendered twice** — same variant, same size, same
  row, neither one the dialog's default and neither one focused first.
- **Declining is a real answer** and is remembered. Remote BlueMap servers keep working exactly as
  they did; only local rendering is switched off, and the step says so before the buttons.
- The verbatim BlueMap quotation is still on screen above the buttons that act on it.

The existing settings row still works and is still where a failed render points. It gains a
collapsed **Read the licence in the app** disclosure that expands the same viewer in place, so
somebody about to press `Accept` months later can read what they are accepting without leaving the
settings surface.

## A real render, from the wizard's consent gate to a finished map

The paragraph above is not a description of intended behaviour; it is what the following six
images show happening, in one real run of the packaged Electron app driven headless on an
off-screen desktop through Playwright's Electron driver — the same mechanism the rest of this
project's screenshot sweep uses — against commit `56b12939f844f713f52dbde397324fc10c3c073a`. A
world was typed into the make-a-map wizard and validated; the wizard's review step showed the
exact download-has-not-been-accepted warning described above; consent was given through the
Settings row this document describes, not through any shortcut; and BlueMap's own Java engine
then downloaded the Minecraft client file from Mojang and rendered the world into tiles that
opened in the viewer. Nothing here is staged, mocked or hand-edited.

![The make-a-map wizard's World step, with a real Minecraft world folder typed in, validated, and reporting one dimension and one region file](screenshots/render-1-wizard-world.png)

![The wizard's Review step before consent: the same download-has-not-been-accepted warning and "Open the setting" link described above](screenshots/render-2-review.png)

![The Mojang download consent settings row, reached from that warning, with consent just accepted](screenshots/render-3-consent.png)

![The render starting: BlueMap's own Java engine (5.22-27, on this run's Java 25.0.3) beginning against the world from the step above](screenshots/render-4-start.png)

![The render in progress](screenshots/render-5-running.png)

![The finished map, opened in the viewer directly from the render panel's "Open the map" button](screenshots/render-6-map.png)

## Fetching and caching the document

The main process fetches `MOJANG_EULA_URL` — the constant `main/consent.ts` already stores in every
consent record and refuses a stored answer that does not match. There is deliberately no second
copy of that address anywhere in this feature.

The page arrives as HTML. `main/eula/text.ts` extracts the readable text: it drops `script`,
`style`, `noscript`, `template`, `svg` and `head`, turns block-level tags into line breaks, strips
what is left, decodes the entities a legal document actually contains, and normalises whitespace so
that two fetches of an unchanged page produce byte-identical text.

Extraction is then **checked rather than trusted**. `looksLikeTheEula` refuses a result shorter than
1500 characters, and refuses one that does not mention Minecraft, Mojang and the reader. A page that
fails those checks is not cached and is not shown; the app reports the refusal instead. The failure
mode this prevents is the quiet one: a redirect to a notice page, extracted successfully, rendered
in a viewer, read as a licence.

A successful fetch is written to `mojang-eula.json` in the app's data directory, atomically (staging
file, then rename), with the text, the document URL, the fetch time and the character count. A
cached copy younger than seven days is served without a network request. The viewer's
**Fetch it again** control ignores the age entirely.

The cache is validated on the way back in and discarded rather than repaired: a wrong schema
version, a different document URL, an unparseable timestamp, or a character count that disagrees
with the text all mean "no cache". Discarding costs one request; repairing would cost showing
somebody a licence assembled out of a half-valid file.

## The tabbed viewer

The viewer shows the document as a browser-style tab strip, using this project's own tab system
(`components/tabs/`), so it has the overflow surface, reordering, pinning, grouping, the four tab
searches and the bulk closes without a second implementation of any of them.

It does **not** share the application's tab storage. `tabStorage.ts` writes one fixed key and reads
`strips[0]` back, so persisting through it would replace the user's real tab layout with a licence.
`components/eula/eulaStorage.ts` is the same shape of module under its own key, plus one thing the
app's strip does not need: **reconciliation**. If Mojang revises the document the sections change,
so a stored arrangement keeps every tab whose section survived — in the order, pinning and grouping
the user gave it — drops the ones whose section is gone, and appends the new ones at the end. A
stored layout with nothing left in common with the document is discarded and the defaults are
seeded.

Every panel states its own position in Mojang's order (`Section 3 of 9`), so reordering or pinning
tabs never leaves a reader unsure where in the document they are.

The header above the strip always says which of three things is on screen:

| State | What the header says |
|---|---|
| `live` | This is Mojang's document, fetched from Mojang, at *this* time. |
| `cache` | This is a copy the application fetched earlier and kept, at *this* time. It may not be the current wording. |
| `fallback` | This is **not** Mojang's document. It could not be fetched, so the wording BlueMap itself quotes is shown instead. |

A failure that leaves a cached copy showing says both things at once: here is the copy, from this
date, and here is why it is not newer. A stale or substituted copy is never labelled live.

## Categorisation is navigation, never editing

The tabs sort the document into `Overview`, `What you may do`, `What you may not do`, `Ownership`,
`Updates and changes`, `Termination`, `Warranties and liability` and `Other terms`.

Categorising a legal document is allowed to be *wrong* — a clause under the wrong tab costs a click.
It is never allowed to be *editing*, and every plausible implementation of it edits: by summarising,
by reordering paragraphs so a category reads coherently, by dropping a sentence that fits two
categories, or by rendering a translated heading instead of the heading.

So `components/eula/eulaSections.ts` never handles text. It handles **offsets**. A section is a
half-open range `[start, end)` into the source string; the ranges are contiguous, produced in
ascending order, and cover the document from index 0 to `text.length`. That makes the guarantee
structural rather than a promise:

- nothing can be omitted, because every index belongs to exactly one range;
- nothing can be reordered, because the ranges are produced and rendered in ascending order;
- nothing can be reworded, because no text is ever copied or transformed.

`sectionsCoverText` states it as a checkable condition, and the test asserts the concatenated
section text is byte-identical to the source across five differently shaped documents. The only
interpretation applied anywhere is "a blank line ends a paragraph", and the test checks that the
words of a rendered section equal the words of its range.

The viewer says all of this on screen, in the EXACT string catalogue so no funny level can restyle
it: the categories are this application's navigation over Mojang's document, and if the app's copy
and Mojang's published document ever differ, Mojang's document is the one that counts.

The quoted text is never translated. In Cantonese and bilingual modes the surrounding copy is
Cantonese and the document stays in its own language, exactly as the consent quotation always has.

## Search, export and copy

The search bar is the shared `ConfigSearchField`, so it carries the anchored regex builder like
every other search surface in the app. Plain text is the default and regex is an explicit opt-in.

Two rules are specific to a legal document:

- **The search hides nothing.** It marks which sections contain a hit and says how many, and every
  section stays in the strip. A licence with three of its nine sections filtered out of the
  navigation is a licence somebody could reasonably believe they had finished reading.
- **Highlighting cannot change a word.** The search returns *runs* of plain text — `{ text, hit }`
  pairs whose text fields concatenate back to exactly the paragraph — and the component wraps a
  `<mark>` around the ones that matched. Nothing is ever handed to `v-html`. Zero-width matches are
  dropped rather than rendered as an invisible mark in every gap.

Export offers the current section or the whole document, as Markdown or plain text, plus copy to
the clipboard. Every export opens with a header naming the document address, whether this is the
live document or a cached copy or BlueMap's wording, when it was fetched, and **which section this
file holds out of how many**. The body is the range's own characters; `Markdown` means a header and
then the text, not clauses reformatted into headings and bullets.

## Appearance

The viewer, its tab strip and each section panel are per-element appearance targets. Right-click for
**Edit appearance…**, <kbd>Shift</kbd>+<kbd>F10</kbd> for the same menu from the keyboard, or
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F10</kbd> straight to the editor — with the full Word-depth
typography controls and the infinite colour picker and its translator. Reading a licence at 24 point
in high contrast is an accessibility need, not a novelty. Match highlighting uses a theme-aware
colour rather than the browser's yellow, which fails contrast on a dark surface.

## Where a docked panel sits

The settings surface was a right-hand drawer because somebody had to pick one. That is fine on a
wide display and wrong for anyone whose map is on the right. Its presentation is now a persisted
choice, and the mechanism is a wrapper (`components/settings/DockedSurface.vue`) rather than
something bolted onto that one surface.

Five placements: **floating**, or docked **left**, **right**, **top** or **bottom**. Each surface
remembers its own — the settings sheet defaults to the right, the licence viewer to the bottom,
because a legal document reads better in wide short lines.

The choice is reachable from the panel's own title bar (a chooser button, a menu of five
`menuitemradio` rows, and both resets) and from the **Where the panels sit** section in Settings,
which lists every panel that is open, offers the same five choices as a radio group, and carries the
global reset. The global reset clears the *stored* record rather than only the open panels, because
the panel you cannot see is exactly the one you want reset. The panels' names and the five placement
labels are in the settings search, so typing "docked to the bottom" finds the row.

### Never covering the control that opened it

A panel that covers its own opener is the specific failure this has to avoid: the button is still
there, still focusable, still announced, and completely invisible, so pressing it again to close the
panel presses the panel. `resolveDockLayout` takes the opener's rectangle and:

- **shrinks a docked panel along its docking axis** so its edge stops short of the opener. A right
  dock beside a button 300px from the right edge is 300px wide, not 520px overlapping;
- **falls back to floating** when even the 240px minimum would not clear it, keeps the user's choice
  so the panel returns to that edge when the window can hold it, and says so on screen rather than
  quietly appearing somewhere else;
- **picks a floating corner that does not intersect the opener at all**, deterministically, so the
  panel lands in the same place every time for the same window.

The opener is the element the host passes, or — when it passes none — whatever had focus at the
moment the panel opened. Focus returns to it on close.

Every placement is keyboard-operable with visible focus, the panel is `role="dialog"` **without**
`aria-modal` (it is genuinely non-modal: no scrim, the application behind stays usable, Escape
closes), and every placement is capped at the viewport so a 520px panel becomes the whole edge at
800×600 and at 200% display scale rather than overflowing it.

## Configuration

| Thing | Where it lives | Default |
|---|---|---|
| Cached document | `mojang-eula.json` in the app's data directory | absent until first fetch |
| Cache maximum age | `CACHE_MAX_AGE_MS` in `main/eula/document.ts` | 7 days |
| Fetch timeout | `FETCH_TIMEOUT_MS` | 15 seconds |
| Response cap | `MAX_RESPONSE_BYTES` | 2,000,000 bytes |
| Viewer tab layout | `worldlens-eula-tabs` in local storage | one tab per section |
| Panel placements | `worldlens-dock-placement` in local storage | per-surface default |

The document address is not configurable. It comes from `MOJANG_EULA_URL` in `main/consent.ts`, so
the document a person reads and the document their recorded acceptance names cannot drift apart.

## Failure modes

| What happens | What the app does |
|---|---|
| No network, DNS failure, timeout | Reports the reason. Shows the cached copy if there is one, labelled with its own fetch date; otherwise BlueMap's wording, labelled as BlueMap's. |
| Non-200 answer | Same, naming the status code. |
| The page is not the licence | Refused, not cached, reason shown. |
| Response larger than the cap | Refused while reading, before the memory is spent. |
| Cache file corrupt, hand-edited or from a future build | Discarded; the app fetches again. |
| Data directory read-only | The fetched document is still shown; only the write is skipped, so the next launch fetches again. |
| No preload bridge (a browser build) | The controller starts in the fallback state and says this build has no way to fetch. Nothing throws. |
| Local storage blocked or full | Tab arrangement and panel placement do not survive a restart. Nothing is reported; a remembered layout is not worth a notification. |
| Every section tab closed | An honest empty state saying the document is unchanged and how to open a tab again. |

## Security considerations

- **Nothing is ever passed to `v-html`.** The document comes from a third party and the search puts
  highlights inside it, which is exactly the shape of bug that ends with someone else's markup
  running with the app's privileges. Highlighting is done with text runs and `<mark>` elements the
  component creates itself.
- **No credentials are sent.** A public legal document needs none, and the request carries no
  authentication header of any kind.
- **The response is bounded** while it is read, not after, and the request carries an explicit
  timeout.
- **The IPC handler never rejects.** Every failure crosses as a value with a plain-language reason,
  because a rejected `invoke` becomes an unhandled promise in a component and the user sees a blank
  panel with no explanation.
- **Patterns and document text stay local.** Evaluation goes through the shared bounded regex engine
  with its refusal of catastrophically backtracking patterns; nothing is transmitted or persisted.
- **The consent record is not weakened.** `main/consent.ts` is unchanged. `MinecraftVersion.load`
  still takes `allowDownload` as a required parameter with no default, so no code path can download
  a Mojang jar without an explicit answer.

## Verification

```
cd design
npx vitest run packages/ui packages/app
npx tsc -p packages/app --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
npx eslint packages/app packages/ui
```

What the tests assert, specifically:

- **`packages/app/src/main/eula/document.test.ts`** — extraction keeps the prose and drops the
  machinery; a fresh cache is served without a request and is still reported as a cache; a failed
  fetch with a cached copy returns it labelled `cache` and never `live`; a failed fetch with no
  copy returns nothing at all rather than an empty document; a page that is not the licence is
  refused and not cached; a timeout is reported as a timeout; every corrupt-cache shape is refused.
- **`packages/ui/src/components/eula/eulaSections.test.ts`** — for five differently shaped documents,
  the concatenated section text is byte-identical to the source and the ranges tile it; a set of
  ranges with a gap is rejected, so the guard is not vacuous; classification is deterministic; a
  section's rendered words equal its range's words.
- **`packages/ui/src/components/eula/eulaBridge.test.ts`** — the three states and their sentences;
  a result the build cannot read becomes a stated failure rather than a rendered `undefined`; a
  failed refresh keeps the document already on screen; highlighting preserves the paragraph exactly
  across ten queries including zero-width, anchored, unmatched and invalid patterns; exports name
  which section they hold.
- **`packages/ui/src/components/setup/FirstRunSetup.test.ts`** — the licence is step 2 of 4 and
  carries no accept or decline control; the fallback is labelled as BlueMap's wording; the
  navigation notice is on screen; the consent step has no checkbox or radio of any kind, nothing
  pre-focused, and `Accept` and `Decline` carry identical classes.
- **`packages/ui/src/components/settings/dockPlacement.test.ts`** — a docked panel shrinks so its
  edge touches but never overlaps the opener; it falls back to floating when the edge cannot hold a
  usable panel and keeps the requested placement; a floating panel clears the opener from every
  corner and stays inside the window; no placement exceeds the viewport at 800×600 or 640×400;
  placements persist per surface, reset per surface, and the global reset survives a reload.

## Related reading

- [Language modes and funny levels](./language-and-tone.md) — why the consent and licence statements
  live in the EXACT catalogue and are the same text at level 1 and level 5.
- [Tabbed navigation](./tabbed-navigation.md) — the tab system the viewer reuses, and what its four
  searches and bulk closes do.
- [Appearance editors](./appearance-editors.md) — the per-element editor, the infinite colour picker
  and the typography controls the viewer exposes.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the engine the licence
  search runs on and the bounds it evaluates under.
- [Command palette](./command-palette.md) — the other route to every setting, including a panel's
  placement.
