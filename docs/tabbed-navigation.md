# Browser-style tabbed navigation

The application's content is a persistent tab strip rather than one scrolling surface: tabs that
overflow into a surface of their own, reorder, pin, group and come back the way they were left.
Four separate searches find a tab, and five bulk closes remove many at once, each of them showing
exactly what it will do before it does it. The strip itself can occupy the physical left, right,
top or bottom edge, and that choice comes back with the rest of the layout.

The code is `design/packages/ui/src/components/tabs/`. A host mounts `TabbedNavigation`, declares
its pages and renders one named slot per page id; nothing else needs to know that tabs exist.

## Where it is mounted

Every settings-style surface in the desktop app now carries its own `TabbedNavigation` rather than
a bespoke `v-tabs`/`v-window` pair, each under its own `storageKey` so one surface's layout can
never overwrite another's:

| Surface | `storageKey` | What each tab is |
|---|---|---|
| The application shell (`App.vue`) | `material-bluemap-tabs` (the default) | Map, world wizard, servers, projects, backups, GitHub runners, Pages hosting |
| Settings (`AppSettings.vue`) | `material-bluemap-settings-tabs` | One tab per setting section - consent, Java, storage folder, world folder, GitHub account, language and tone, panel placement |
| The options editor (`ConfigScreen.vue`) | `material-bluemap-config-editor-tabs` | One tab per config screen, plus history |
| The project editor (`ProjectEditor.vue`) | `material-bluemap-project-editor-tabs` | Maps, storages, how it renders, and the four whole-file singletons |

`renamePage(pageId, label)` is what a host uses to keep a tab's label current after the fact - a
page's own `label` is read only once, when a tab for it is first seeded or opened, so a live count
like "Maps (3)" needs the host to push a rename through explicitly whenever that count changes.

**`AppearanceEditor.vue` is the one settings-style surface that keeps a plain `v-tabs` on
purpose**, documented in its own file rather than left as a silent gap: it is a small, anchored,
non-modal popover editing one element at a time, with exactly three permanent tabs that are never
opened, closed, reordered or searched for, so the strip's whole apparatus - overflow, a new-tab
control, per-tab menus, four searchable-tab surfaces, bulk closes - has no referent there. Its
Surface and Presets tabs still each carry their own `ConfigSearchField` with the full regex
builder, because the regex-builder rule has no such size exemption.

## Behaviour

### One authority per ordering

`tabModel.ts` is pure data and pure functions: no DOM, no clock, no storage, no Vue. The awkward
parts of browser-style tabs are ordering rules rather than rendering, and each order has exactly
one field that owns it, with nothing else allowed to imply it.

| Field | The order it owns |
|---|---|
| `tabs` | The set of tabs, keyed by id. Its array order carries no meaning. |
| `pinnedOrder` | The pinned region, left to right. |
| `slots` | The ordinary region, where a slot is either one ungrouped tab or one whole group. One list, so the ordinary tab order and the group order cannot contradict each other. |
| `TabGroup.tabIds` | The order inside that group. |

Every id therefore appears in exactly one place, and `normalizeStrip` enforces that on anything
read back from disk. The alternative, one array of tabs with the rest derived by filtering, reads
well until a tab is pinned, at which point its position means two things at once and every later
operation has to guess which one the user meant.

**Pinning takes a tab out of its group.** A pinned tab lives in the pinned region and a grouped
tab lives inside its group's run; those are two places on screen and a tab cannot be in both.
Keeping the membership and merely hiding the tab from the group's run would make the per-group
search report a tab that is demonstrably not in the group, which is worse than losing the
membership because it is a lie rather than a loss.

### Reaching a page a saved workspace predates

`seedStrip` only ever runs once, the moment a workspace file cannot be read at all - a genuinely
fresh install, or a file this build cannot parse. Restoring an existing one only ever repairs what
is already there; it never invents a tab for a page the saved record does not know about, because
"half-restore the layout and improvise the rest" is indistinguishable from a bug. That is fine
right up until a page ships that every install, upgrading or fresh, needs to actually find - [the
Home tab](./home.md) is exactly that case.

Two small, narrowly scoped pieces of `TabbedNavigation.vue` exist for a host to lean on rather than
reinvent:

- **`pinnedPageIds`**, a prop naming the page ids pinned the moment a tab for them first exists -
  at seed time on a fresh install, or later, through `ensurePage` below. It is applied once, at
  creation; unpinning one of these tabs by hand afterwards is never reversed on a later mount,
  because "hard to lose by accident" is a promise about the first time a page appears, not a
  standing rule this component re-enforces against a choice the user already made.
- **`ensurePage(pageId)`**, the exposed method that adds a tab for a page with none, pinning it
  when `pinnedPageIds` names it, without moving whichever tab is currently active. A no-op once the
  tab exists, so it is safe - and cheap enough - to call on every mount rather than behind a
  one-time flag of the host's own. This is the third and narrowest of the three host-writable
  actions this component exposes, alongside `revealPage` and `renamePage`: it can only add a tab
  for a page that has none, never move, close or rename one that already exists.

### Nothing is silently clipped

When the ordinary region cannot hold every segment, the ones that do not fit move into an overflow
menu and the button says how many. `fitCount` pays for the overflow button out of the same budget,
because otherwise the button lands on top of the tab that only just fitted, and a tab hidden under
a button is the exact failure this is meant to prevent. Widths are measured once per segment and
cached: a hidden element measures zero, and recomputing from zeroes would flap between states.

The pinned region is measured out of the budget first and never overflows, so a pinned tab stays
reachable however many ordinary tabs are open. Pinned tabs render compact when the strip is tight
and keep their full accessible name, so what a screen reader announces does not shrink with the
button.

### Four physical edges, with one axis at a time

The strip's placement picker offers **left**, **right**, **top** and **bottom**. Left and right
are physical edges even in a right-to-left language: changing the reading direction does not move
a strip the user explicitly docked against a side of the window. A fresh strip starts on the left.

Placement changes the real layout rather than rotating labels inside the old one. Left and right
use a vertical strip beside the panel; top and bottom use a horizontal strip above or below it.
Overflow measurement, drag-and-drop ordering, the placement sheet and the tab list all follow that
axis. Keyboard navigation follows it too: Up/Down move through a vertical strip, Left/Right move
through a horizontal strip, and horizontal movement follows the document's RTL direction. Home
and End still reach the first and last visible tab on either axis.

`setTabPlacement` writes the choice into the strip state. Storage schema v2 adds only that field;
loading a version-1 record preserves its tabs, pins, groups, order, collapsed state, membership and
appearance and supplies `left` for the missing placement. An invalid placement is repaired to the
same safe default instead of discarding the rest of a readable layout.

### Groups

Groups can be created, named, renamed, coloured from seven Material roles, reordered, collapsed,
expanded and removed. A group takes the position of the first tab it was made from, so a group
made out of tabs somebody was already looking at appears where they were looking rather than at
the end of the strip. **Removing a group closes no tab**: its members become lone tabs in the slot
the group held.

A collapsed group is a display state, not a claim that its tabs have gone. Its members are still
searched, still counted and still closed by a close-to-the-right. What must not happen is a search
result writing that preference back, so a group revealed to show a hit is expanded on screen and
unchanged on disk.

### The four searches

Each is a separate function over the scope it searches and a matcher the caller built from its own
query, mode and flags. Nothing in `tabSearch.ts` holds state, so four fields means four matchers
and there is no shared thing left for them to leak through.

| Search | Scope | Where it renders |
|---|---|---|
| `searchStripTabs` | The current strip, including tabs in the overflow surface and members of collapsed groups | `TabFinder` |
| `searchGroupTabs` | One named group and nothing outside it | `TabGroupMenu` |
| `searchGroups` | Group names, across every strip | `TabFinder` |
| `searchAllTabs` | Every tab in every strip in every window | `TabFinder` |

What is searched is the visible label and only the visible label: not the page behind the tab, not
an id, not anything the tab is holding. A person searching a tab strip is looking for a word they
can see, and a search that quietly matched hidden text would close tabs whose labels do not
contain the query at all. A result row states its window, strip, group, pinned state and position,
because two tabs called "Settings" in different windows are otherwise indistinguishable.

### The five bulk closes, and the plan in front of them

`planTextClose` covers "close tabs containing text" and "close tabs not containing text";
`planCloseOthers` and `planCloseToEdge` cover close-others and close-to-start or close-to-end.

**Containing and not-containing are one predicate and its negation, literally.** One
`SettingMatcher`, one `direction`, the same `matcher.test` over the same eligible set, only the
sign flipped. Two implementations drift on case, on Unicode and on which flags are honoured, and
the day they disagree a pair of actions a user reasonably believes are exhaustive quietly leaves
tabs untouched by both. The unit test proves the partition rather than trusting the shape: for any
query, in either mode, the two sets are disjoint and together cover every eligible tab.

**Every function returns a plan and closes nothing.** The plan states the matching mode, which
tabs are in scope, which will close, which were protected for being pinned and which hold unsaved
work, before a single tab goes. The reviewable preview *is* the plan rather than a second
calculation of it, so the preview and the close cannot disagree about the count. The plan carries
its own scope, so the sentence on screen and the set being closed come from the same place and a
scoped action cannot quietly cross a group boundary.

Pinned tabs are out of scope unless the user says otherwise and are listed by name so the preview
shows what the protection saved. Tabs holding unsaved work are listed separately: they matched,
they are not protected, and closing them is a decision rather than a side effect of a text query.
`applyClosePlan` reports what it actually closed and what it kept, so a partial result is never
reported as a whole one. Running a plan goes through the
[super-confirmation gate](./super-confirmation.md).

## Configuration

| Setting | Value |
|---|---|
| Storage key | `material-bluemap-tabs` in `localStorage` by default; every host passes its own `storageKey` prop instead - see [Where it is mounted](#where-it-is-mounted) |
| Stored shape version | `TAB_STORAGE_VERSION`, currently 2, shared across every `storageKey`; version 1 migrates without losing its existing layout |
| Group colours | `primary`, `secondary`, `tertiary`, `success`, `warning`, `error`, `info`; default `primary` |

Persisted: strip placement, tab order, pinned order, groups, group order, collapsed state,
membership, and each tab's and group's opaque appearance record.

Not persisted, deliberately:

- **`dirty`.** A tab holding unsaved work when the application closed is not holding it on the
  next launch: either the work was saved or it is gone, and a restored `dirty: true` would be a
  lie that then protects the tab from a bulk close for no reason.
- **Search queries and regex patterns.** They are not ordinary layout preferences, they can
  contain anything a person typed, and storing them without a reason is the opposite of what is
  wanted. Every field starts empty on launch.

`appearance` **is** round-tripped verbatim without being inspected. Nothing in this folder reads
inside those records, so a record written by a newer build survives a round trip through an older
one instead of being silently emptied.

## Failure modes

- **Storage refuses or is full.** Both directions swallow it. The consequence is a layout that
  does not survive a restart, which is annoying and nowhere near a notification.
- **A stored file this build cannot read.** The defaults are seeded rather than half-restoring it.
  The version field is how a future change that `normalizeStrip` cannot repair refuses an old file
  instead of partly reading it.
- **A file that is the right shape but internally inconsistent**, for example a tab id in both a
  group and the pinned order. `normalizeStrip` repairs it, because the file is editable by hand
  and is written by other versions of this application.
- **An empty query or a pattern that will not compile.** The plan closes nothing at all. It is not
  merely disabled in the interface: `selected` is empty, so even a caller that ignored `runnable`
  would close nothing.
- **The last tab closes.** The strip leaves an honest empty state rather than a blank frame.
- **A tab that could not be closed** is reported as kept rather than counted as closed.

## Security considerations

Nothing here reaches the network and nothing leaves the machine. Only layout is persisted;
queries, patterns and tab contents are not.

Searching and bulk closing read the visible label only, so neither can be used to match on
something the user cannot see. All matching runs on the local `RegExp` engine under the bounds
`components/config/regexEngine.ts` states (512-character pattern, 20000-character sample, 500
matches, 100 ms per preview run), which is what keeps a pathological pattern from freezing the
strip.

A bulk close is destructive and is treated as one: a reviewable preview naming every affected tab,
pinned tabs excluded unless deliberately included, unsaved work called out separately, and the
two-key gate before anything runs.

## Accessibility

One `role="tablist"`, one `role="tab"` per tab, and `aria-controls` only on the selected tab,
because the other panels are not rendered and pointing at an element that does not exist is worse
than pointing at nothing. Exactly one tab carries `tabindex="0"`, so Tab reaches the strip once and
the axis-appropriate arrow keys move within it, with Home and End reaching the ends. Enter and
Space activate the focused tab without opening an overlay. A group header is a button
inside the tablist rather than a tab: it is skipped by the arrow keys and announces its own name,
count and expanded state. Tabs inside a collapsed group are out of the focus order, because focus
landing on something not drawn looks like the key did nothing, while remaining in the strip and in
every search. Compact pinned tabs keep their full accessible name. A context-menu item
that has a keyboard shortcut displays it beside the label, taken from the same handler that binds
it so the two cannot drift apart; an item with no shortcut carries an explicit null and shows
nothing rather than a placeholder. The menu carries its own filter field, because a person
filtering a menu is typing what they can read on it.

## Verification

| Test | What it holds |
|---|---|
| `tabModel.test.ts` | Every ordering rule: where an unpinned tab lands, what happens to a removed group's members, which tab becomes active when the active one closes, that pinning clears membership, that every id lives in exactly one place after `normalizeStrip`, the four valid placements, and the overflow arithmetic including paying for the overflow button. |
| `tabSearch.test.ts` | Four scopes searched independently, collapsed group members found, hits carrying window, strip, group, pinned state and index, and only the visible label matched. |
| `closePlans.test.ts` | The partition property for any query in either mode, plans that close nothing on an empty or uncompilable query, pinned and unsaved tabs held back and named, scope carried on the plan, and `applyClosePlan` reporting kept tabs honestly. |
| `tabStorage.test.ts` | Placement and the six persisted orderings round-tripping, schema-v1 migration defaulting only the missing edge to left, `dirty` dropped, queries and patterns never written, appearance records preserved verbatim, a blocked storage staying silent, and a file this build cannot read seeding defaults instead. |
| `tabMenus.test.ts` | The menu's own search filters its items without changing what they do. |
| `TabbedNavigation.test.ts` | Mounted: roles and roving focus, selection moving panel and tab order together, axis-aware arrows on all four edges including RTL, Enter/Space activation, Home and End, the advertised keyboard commands, the placement picker and persisted restoration, a compact pinned tab keeping its name, a collapsed group drawn as a header with name, count and state and its members out of the focus order, expanding writing the preference, `revealPage` activating an existing tab or reopening a closed one, and `renamePage` relabelling every open tab for a page without touching one that shows a different page. |
| `projectSurfaceSizing.test.ts` | The project editor, tab strip, search controls and live-speed controls keep 44px targets, wrapping text, responsive stacking and viewport-bounded scrollable overlays rather than clipping at narrow widths. |

Run them with `npx vitest run packages/ui/src/components/tabs` from `design/`.

## Suggested reading

- [Home](./home.md), the one page every install - fresh or upgrading - is guaranteed a pinned tab
  for, and the reason `pinnedPageIds`/`ensurePage` exist at all.
- [Super confirmation](./super-confirmation.md), which stands in front of every bulk close.
- [The regex builder and the search bars it reaches](./regex-builder.md), which supplies all four
  tab searches and both bulk-close fields.
- [Appearance editors](./appearance-editors.md), which owns the records the tab model carries but
  never reads.
