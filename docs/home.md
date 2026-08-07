# Home

Eight unexplained tabs used to be the first thing a brand-new install showed a person, the
instant the tab strip mounted and before the first-run dialog even finished asking its own
questions. "Opening new tabs, people won't know where to go at first" is the exact complaint that
produced this page: one landing tab that names every capability this application has, weighted so
a newcomer sees the single obvious next step and a returning user sees what they were doing last.

The code is `design/packages/ui/src/components/home/`. `HomeScreen.vue` is the whole surface;
`homeCatalog.ts` is the pure logic behind one capability card (matching a search, building its
searchable text); `homeState.ts` is the one preference Home remembers about itself.

## Behaviour

### A tab, not a dialog and not a wizard step

Home is `App.vue`'s `PAGE_HOME`, first in the declared page list and pinned from the moment its
tab exists - at seed time on a genuinely fresh install, and through `TabbedNavigation.vue`'s
`ensurePage` for a workspace an earlier build already saved, so an upgrading install gets it too,
without moving whichever tab that person was already looking at. Being a tab rather than a modal
is deliberate: every other page, the whole tab strip's own mechanics - overflow, reordering,
pinning, grouping, its four discovery searches, and its persistence across restarts - keep working
exactly as they did before this page existed. Home is additive; nothing about "opening a new tab"
changed to make room for it.

### Where first-run setup actually lands

Finishing first-run setup - "Finish setup" on the last step, whichever way consent was
answered - is what actually puts Home in front of a brand-new install. `App.vue`'s
`onFirstRunFinished` used to call `revealPage("world")` directly the instant setup completed,
which switched straight past Home to the wizard every single time; Home existed, was fully
built, and a genuine first-time user never saw it unless they happened to notice and click its
own pinned, icon-only tab first. `onFirstRunFinished` now calls `revealPage("home")` instead, so
the moment setup finishes a newcomer lands on the page built to answer "where do I start" -
Home's own hero card is "Make a map", weighted `primary`, so the wizard stays exactly one click
away rather than being taken from anyone. This only ever fires once, the instant a first-time
user's own setup completes, so a returning user with a saved workspace is untouched: they come
back to whatever tab they last left active, exactly as before.

Pressing "Start here" inside the standalone "what is this?" panel (`WelcomeSurface.vue`) is a
different, deliberate case and still goes straight to the wizard, unchanged: it is an explicit
click from someone already reading that panel's own description of what the wizard does, not the
first moment a new install shows anybody anything.

### Openers, not links

The failure this page exists to fix is not "the destinations are hidden", it is "arriving
somewhere and being left to work out what to click". So a capability card's action is the same
verb the command palette already uses for the same destination: `emit("reveal-page", "world")`
switches to the guide's own tab exactly as clicking that tab would; `emit("open-settings",
"github-account")` opens the Settings sheet scrolled to, focused on and outlined at that exact
row; the viewer's own Maps/Settings/Info/Markers/Players tiles call `app.appState.menu.openPage`
directly, the same call the in-viewer menu makes. Every one of these handlers already existed in
`App.vue`, written for the command palette; Home reuses them verbatim rather than inventing a
second, inevitably drifting way to open the same surface.

### One deliberate order, not a wall of equal cards

Rendered top to bottom rather than as one undifferentiated grid:

1. **The one-sentence explanation** - what BlueMap actually makes - shown by default and
   collapsible, remembering that choice (`homeState.ts`) so a newcomer reads it once and a
   returning user never has to scroll past it again. "Tell me more" opens the standalone "what is
   this?" panel (`WelcomeSurface.vue`) rather than repeating its prose here a second time.
2. **Get started** - the newcomer's one obvious next step ("Make a map", weighted `primary`),
   alongside the explanation panel and the interactive tour.
3. **Continue** - only for a returning user with something to continue: every profile except the
   seeded demo server, each opened by making it the active map.
4. **Every other capability**, grouped: making and managing maps, sharing and backing up, learning
   (docs, the licence), settings and tools, and - only while a map is actually open - that map's
   own menu.

### Honest about what is not ready yet

Backups and Publish to Pages both need a map already rendered on this computer, and both say so in
the same sentence (`home.tile.needsRenderedMap`) rather than presenting a control that would fail
the moment it was pressed. Per the project's guided-forms rule, the disabled state names the exact
remedy and offers it as a real button - "Make a map" - not merely a reason. The moment a map exists
the sentence and the disabled state both disappear and the real action becomes pressable; nothing
here is a static illustration of a control.

### Search

`ConfigSearchField` with its anchored regex builder, the same component every other search bar in
this application uses, searching each card's group, title, description, keywords and (when
present) its disabled reason - so "render a map first" is itself a findable phrase. Plain text is
the default; regex is an explicit opt-in. Searching replaces the guided layout with one flat,
honest result list (mirroring the in-app documentation browser's own search results), and an empty
result says so in words with a one-click way back to the full page.

### Everything a card can carry

`HomeCapability` (`homeCatalog.ts`) is deliberately small: an id, a group, a title, a description,
an icon, search keywords, an optional disabled reason with its remedy, and the action itself. A
card whose action is unavailable is never merely greyed out with no explanation - it either shows
the remedy button in its place or names the unmet condition beside a disabled one, which is the
same honesty rule the rest of the application already holds every guided form to.

### Bulk actions do not apply here

The project's shared rule is that every list, table, grid and collection supports bulk actions,
because repeating an action forty times over one item at a time is the app failing to do its job.
The capability grid is deliberately exempt, and this is that exemption written down rather than a
silent gap:

- Every card is a fixed navigation entry to a destination this build already has - "Make a map",
  Settings, Docs, the config editor and the rest - not a record a user created, owns, or can
  meaningfully act on in a batch. There is nothing to select forty of: the grid does not grow or
  shrink with what the user does, it is the same catalogue of destinations for everyone.
- Each card's single action is heterogeneous, not the one operation the bulk-actions rule assumes
  (delete, export, move, tag, retry, enable/disable). "Open the guide", "open Settings at the
  GitHub row", and "open the config editor's history screen" cannot sensibly be selected together
  and run as one batched verb, because they are not the same verb wearing different data.
- The actual collections a card's destination leads to already carry their own bulk-actions story
  on their own surface, which is where the rule properly applies: the maps-and-servers list
  (`ProfileManager.vue`) owns the profiles, the notification centre owns the notices, and the docs
  browser owns the articles. Home is the door to each of those rooms, not a second copy of the
  room.

The one place Home comes close to a "collection" is the Continue row - every rendered profile
except the seeded demo server, each opened by making it the active map. It is still a launcher
list rather than a record collection for the same reason: "continue" is a single per-profile
action with no batched equivalent, and managing those profiles (renaming, removing, bulk-closing)
is `ProfileManager.vue`'s job, reached through its own tab.

## Reuse over duplication

Descriptions are pulled from the catalogue entries other surfaces already voice -
`palette.page.world`, `palette.shell.settings`, `docsViewer.lede` and the rest - rather than
rewritten here. Two surfaces describing one destination in two different sentences is how they
drift out of agreement about what a button actually does; reusing the key is what keeps Home and
the command palette saying the same thing about "Make a map" for as long as both files exist, at
the cost of zero new copy for the dozen cards that map onto an existing page or shell surface. Only
what is genuinely new to Home - its own heading, its search chrome, its section headings, and the
one "render a map first" sentence Backups and Publish to Pages share - lives in
`copy/surfaces/home.ts`.

`palette.page.map`, `.world`, `.projects`, `.ciRender`, `.servers`, `.backups` and `.pages` used to
render their English fallback in every language, at every funny level, despite `components/palette`
already appearing on the catalogue's covered list: `paletteCatalog.ts`'s own `PAGE_NOTES` reads
them through a variable (`t(note.description[0], note.description[1])`), which is invisible to
`catalogueCoverage.test.ts`'s literal-string scanner. Home calls the same seven keys with a literal
string - the ordinary and correct way to call `t()` - which is what actually surfaced the gap.
They are voiced in `copy/surfaces/home.ts` rather than `palette.ts` - that module's own
`palette.test.ts` requires every key it carries to have a literal call site under
`components/palette/`, and Home's is the only one that exists - but the fix reaches both call
sites regardless, since the catalogue is one merged set keyed by string.

## Configuration

| Setting | Where it lives | Default |
|---|---|---|
| Whether the introduction is collapsed | `homeState.ts`, key `worldlens.home.introCollapsed`, through `setupStorage()` | Expanded |
| Whether Home's tab is pinned | `TabbedNavigation.vue`'s `pinnedPageIds` prop, applied once at the moment Home's tab first exists | Pinned; unpinning it by hand is never re-applied |

Nothing else about Home persists on its own. The tab's position, its pinned state after that first
moment, and its membership in any group all live in the ordinary tab-workspace record every other
tab already uses (`tabbed-navigation.md`).

## Failure modes

- **A card's destination cannot be reached.** Every action here is a shell action `App.vue` already
  performs for a button of its own; there is no case where Home offers a card whose action silently
  does nothing, because the card would not exist without a real handler wired up for it.
- **No map is open.** The viewer's own menu group (Maps, Settings, Info, Markers, Players, camera
  reset) is entirely absent rather than present and disabled, matching the command palette's own
  rule: a theme select or a camera-reset row wired to nothing would be exactly the decorative
  control this project refuses to ship.
- **Nothing has been rendered yet.** The Continue section does not render at all - not an empty
  list - and Backups/Publish to Pages both name the missing prerequisite with a working remedy
  beside it.
- **A search pattern fails to compile.** The result list shows nothing rather than the last good
  result, exactly as every other regex-builder-backed search in this application behaves.
- **An upgrading install's saved tab layout predates Home.** `ensurePage` adds a pinned tab for it
  on the next launch, without disturbing the tab that person was already on; a fresh install needs
  no such repair because Home is seeded (and pinned) like any other declared page.

## Security considerations

Nothing here reaches the network on its own. The search runs on the local `RegExp` engine under
the bounds `components/config/regexEngine.ts` states; no pattern or query is transmitted, logged or
persisted beyond the one collapsed/expanded boolean noted above. Every destination this page opens
is a surface the application already draws from local state; Home introduces no second, less
validated route to any of them.

## Accessibility

Home is a labelled `<section>`; its four regions - the introduction, the "get started" cards, the
continue row and the grouped capability grid - are each real headings, so a screen reader can move
between them the way it moves through any other document. Every capability card is a `role="list"`
item carrying a real button per available action, each with an accessible name that states which
capability it opens ("Open {title}") rather than a bare "Open". A disabled action's button is
disabled in the DOM, named the same way, and paired with the remedy button that actually resolves
it. The search field, the regex-builder toggle and the "clear the search" recovery button are all
ordinary keyboard-reachable controls with visible focus, and the whole page is wrapped in
`AppearanceTarget`, so it carries the same right-click "Edit appearance..." context menu, its own
search field, and the Shift+right-click editor shortcut as every other appearance target in this
application.

## Verification

| Test | What it holds |
|---|---|
| `homeCatalog.test.ts` | The pure logic: what a card's searchable text contains (including its disabled reason and its keywords), the one-line-per-card search sample, and `filterCapabilities` against an inactive matcher, a plain-text match, a keyword-only match, an invalid pattern, and catalogue-order preservation. |
| `homeState.test.ts` | The one persisted preference: defaults to expanded, round-trips a collapse and an expand, treats a junk stored value as expanded, and removes the record on expand rather than writing a second falsy value. |
| `HomeScreen.test.ts` | Mounted: every capability group actually renders; the viewer's own menu group is entirely absent with no map open and appears once one is; Backups and Publish to Pages name the missing prerequisite and offer the real remedy, then drop both the moment a map is rendered; the introduction shows by default and its collapse persists across a remount; the continue row is absent on a first launch and offers every rendered map by name once one exists, opening it and asking for the map tab; search narrows the grid to a plain-text match, offers the regex-builder toggle, and says plainly (with a working way back) when nothing matches; and every shell-owned action (Settings at an anchor, the options editor at a screen, the EULA panel, "what is this?", the command palette) emits rather than acting on its own. |
| `App.test.ts` | Mounted, from the shell: the strip now separates into nine pages with Home first, Home is reachable through its own pinned tab, and a freshly seeded workspace with no persisted layout starts on Home - the Map tab's own state message is reached by choosing it explicitly. Separately, and driving the real path rather than a pre-seeded workspace: a fresh install lands on Home the moment `FirstRunSetup` genuinely emits `finished` (not a pre-seeded workspace that would pass regardless of what the handler does), a returning user with a saved workspace stays on their last active tab rather than being forced back to Home, and pressing "Start here" inside the standalone "what is this?" panel still goes straight to the wizard, which is the one first-run-adjacent route this page's landing fix deliberately left unchanged. |
| `TabbedNavigation.test.ts` | `pinnedPageIds` pins a page's tab from the moment it is first seeded; `ensurePage` adds a tab for a page a saved workspace predates, pins it, and never disturbs the tab a returning user was already looking at; and neither ever re-pins a tab the user has since unpinned by hand. |
| `catalogueCoverage.test.ts` | `components/home` joins the list of surfaces every one of whose rendered keys has a real catalogue entry, in every language, at every funny level. |
| `overlayDismissalPolicy.test.ts`, `menuCoverage.test.ts` | Home's four `AppearanceTarget` regions are declared in both surfaces' inventories, so a future edit to `AppearanceTarget.vue` itself is the one place that keeps all four correct, and neither guard's own "did you forget to register a new one" check can silently pass this page by. |

Run them with `npx vitest run packages/ui/src/components/home packages/ui/src/App.test.ts
packages/ui/src/components/tabs/TabbedNavigation.test.ts` from `design/`.

## Suggested reading

- [The command palette](./command-palette.md), whose catalogue every capability card's copy and
  every opener's handler is drawn from.
- [Tabbed navigation](./tabbed-navigation.md), for the pinning, seeding and persistence mechanics
  Home's own tab relies on rather than reinventing.
- [The regex builder and the search bars it reaches](./regex-builder.md), which backs Home's own
  search field exactly as it backs every other one in this application.
- [Language modes and funny levels](./language-and-tone.md), for how Home's own prose - and every
  card's borrowed description - varies with the active mode and funny level.
