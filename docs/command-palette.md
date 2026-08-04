# The command palette

One keystroke opens a list of everything the application can do, and typing the name of a thing
is enough to reach it. The rows that are settings carry the setting's real control, so changing
one in the palette is the same act, through the same write path and the same persistence, as
changing it on the surface it lives on.

The code is `design/packages/ui/src/components/palette/`. The shell mounts exactly one
`CommandPalette` and binds the shortcut to the same ref.

## Behaviour

### Three kinds of row, and the difference is a type rather than a convention

`paletteItems.ts` defines `PaletteItem` as a union of three shapes, which is what keeps the
project's rule against decorative controls checkable here rather than aspirational.

| Kind | What it is | What it must carry |
|---|---|---|
| `command` | Does its one thing and the palette closes. | `run()` |
| `setting` | Holds the live control: a switch, a bounded number box, or a pick from a list. | `control`, whose `set` performs the write *and* its persistence |
| `destination` | Opens a surface. | `where`, a plain sentence naming what will appear, and `go()` |

A builder that cannot produce a working control for something cannot dress it up as one: it has
to demote the row to a `destination` and say where that goes, in the type. There is deliberately
no free-text control. Every free-text setting in this application (the map storage folder, a
world path) is validated against the filesystem and offers a browse button, which a single row
cannot honestly reproduce, so those are destinations.

### Nothing here keeps its own list

Every row is derived from the registry that already describes the thing, so a list cannot fall
behind the surface it describes:

- the application settings surface publishes `SETTINGS_SECTIONS` and `sectionCopy()`, so its
  sections arrive with the titles and explanations they render with, in the current language;
- the options editor publishes `SCREENS`, so its seven settings tabs arrive with their own labels.
  Its eighth tab, History, holds revisions rather than settings and is therefore not in that
  list; it is published as a destination of its own, because the tab somebody is most likely to
  hunt for by name must be findable by typing it;
- the running viewer publishes its settings on `BlueMapApp`, which is where `viewerSettings.ts`
  reads and writes them.

The one thing that is *not* derived from a registry in this package is the shell's tab strip,
because the strip belongs to the shell. It is handed down instead, as `pages`, so the palette
still cannot keep a list of its own. A page the catalogue has never heard of still gets a row and
still teleports; `PAGE_NOTES` only supplies the better sentence and the extra search words where
one is known, so a page added to the strip is reachable on the same commit rather than on the
commit somebody remembers to describe it.

Groups are listed in catalogue order rather than sorted: the shell's own overlays, then the pages
of the tab strip, then the chrome around those pages, then the application's settings and the
look of them, then the server configuration screens, then the viewer's menu pages, then the
viewer settings that are live controls here, and the palette's own size last. Sorting would
replace that judgement with the accident of what the groups happen to be called in the active
language.

### What it reaches, and what it does not

Stated as a list rather than as "everything", because the rule the palette is measured against
asks for every command, page, destination, setting and appearance control, and the honest answer
has two columns.

| Reachable, and teleported to | How it lands |
|---|---|
| Every page of the shell's tab strip | The strip's own `revealPage`, exactly as clicking the tab does |
| The application settings surface, per section | Emits the render-failure flow's `SettingsTarget`; the surface scrolls to the row, focuses it and outlines it |
| All seven options-editor tabs, and its History tab | `ConfigScreen`'s `initialScreen` |
| The viewer's menu pages: maps, settings, info, markers, players | `menu.openPage`, the menu's own call |
| The notification centre, the tab finder | A reveal request; the owning component opens itself, with its own focus handling |
| The changelog viewer | Opens the viewer's Info page, then expands and scrolls to the fold |
| The server list, on a shell with no tab strip | `openProfiles` |

| Listed and searchable, but not teleported into | Why |
|---|---|
| The per-element appearance editors | Each one is anchored to the element it edits and opened from that element's own context menu, so there is no such thing as opening the typography editor without an element to anchor it to. The row is a `destination` that names the route — right-click, or Shift+right-click — rather than a command that would have to invent a target. |
| The render console, the release downloads, the project editor, the backup and Pages panels | Each lives inside a page, and the page is the reachable unit. The page rows carry their words as keywords, so "console", "download" and "publish" all find the page that holds them, and the row says which page rather than implying it lands on the panel. |
| The EULA viewer | It is rendered inside the Mojang download consent section, which *is* teleported to, outline and all. |

The second table is the part worth keeping honest as this grows. A row that opened "the
appearance editor" in the abstract would land nowhere in particular, which is the decorative
control this project keeps finding one layer in; naming the gesture is worth more than a button
that shrugs.

### Surfaces that answer a doorbell rather than a prop

Three of those destinations are panels anchored to a control two or three components below the
shell: the notification centre behind the bell in the corner, the tab finder at the end of the
strip, and the changelog inside the viewer's Info page. The state deciding whether each is open
is local to the component that draws it, and correctly so — it is anchored to a control that
component owns and closes back onto it.

`components/shell/revealRequests.ts` is how the shell asks without owning that state: a counter
per surface, incremented by `requestReveal` and watched by `onRevealRequested`. A counter rather
than a boolean, because a boolean set to true is stuck true — the user closes the panel, asks
again, and nothing happens. The number is never read for its value.

The alternative, a template ref threaded down through every intervening component so the shell
can call a method, is worse in two ways: every layer's public surface grows a method it does not
use, and it breaks the moment an intervening component is conditionally rendered, which two of
these three are. Requests raised while nobody is listening are dropped, which is why the changelog
row is not built at all without a viewer running.

### Arriving somewhere means arriving at the control

A render that stops for a fixable reason already names the setting that would fix it; the shell
already opens the settings surface at that anchor, and that surface already scrolls the row into
view, focuses it and outlines it briefly. Destination rows emit exactly the `SettingsTarget` that
flow emits, so the shell hands it to the same `revealSetting` handler. This is a second entrance
to one reveal path, not a second path.

### Search

`ConfigSearchField` with its anchored regex builder, the same component every other search bar in
the application uses, bound to this surface's own query, pattern, flags and mode. Plain text is
the default and regex is an explicit opt-in. What is searched is what the row actually renders:
its title, its group, its explanation, the words somebody would plausibly type instead, and, for
a `choice`, the labels of every option including the ones not currently selected, because "how do
I make it dark" is a search for an option that is by definition not chosen yet. A `toggle`
contributes no value text at all, because "true" and "false" are not words anybody types and
adding them would make every switch match a search for "false".

The builder previews against `paletteSample()`, which is the same text `filterItems()` tests with
newlines flattened so one row stays one candidate line. A builder that previewed against
something else would teach a pattern that matches the sample and nothing on screen.

## Configuration

| Setting | Where it lives | Default |
|---|---|---|
| Shortcut | `isPaletteShortcut()` in `palettePrefs.ts`. Control or Command with Shift and `f`, and not Alt. | Not user-configurable |
| Size | `localStorage`, key `material-bluemap-palette`, as `{"size":"card"}` or `{"size":"full"}` | `card` |

This was Ctrl+K until the documentation site next door was found to be answering Ctrl+Shift+F,
which meant the product shipped two shortcuts for one feature and whichever one a person had
learned was wrong half the time. Both are Ctrl+Shift+F now.

The shortcut matches on `event.key` rather than `event.code`, so the key labelled F on the user's
own layout is the one that works; `code` would hard-code the position of F on a US keyboard, which
is a different key on Dvorak or AZERTY. Both cases of the letter are accepted, because layouts
disagree about whether Shift+F reports `F` or `f`. Alt is excluded rather than ignored, so a
future Ctrl+Alt+Shift+F belongs to whoever wants it instead of silently opening this. The listener
sits on `window` in the capture phase, because a palette is meant to be reachable from anywhere
including from inside a text field, and a bubbling listener can be beaten by anything that stops
propagation on the way up. `preventDefault` is called only when the shortcut actually matched.

Size is a user choice and it is remembered. The bounded card is the default because a search box
that swallows the whole window is overwhelming on a large display and alarming when it was opened
by accident; the full-window view is something somebody asks for, from the header or from a row
in the list itself.

`canRouteConfigScreens` is the shell's promise that it can open the options editor at a named
tab. It defaults to false, and while it is false the settings tabs are one row carrying all seven
tabs' words in its searchable text rather than seven rows that would all open the same first tab.
The History row is present either way: it routes to the History tab where the shell can route,
and names the tab to pick where it cannot, rather than pretending to land there. The desktop
shell passes `true` — `ConfigScreen` takes an `initialScreen`, so all eight rows land on their
own tab.

Every action after `openProfiles` on `PaletteShellActions` is optional, and its absence removes
rows rather than producing rows that do nothing. That is what a smaller host, or a test, gets.

## Failure modes

- **Storage refuses.** A private-mode browser and a full quota both throw on write. The
  consequence is that the size does not survive a restart, which is annoying and nowhere near a
  notification, so both the read and the write are guarded and silent.
- **A stored size this build does not know** is discarded rather than trusted, because the file
  is editable by hand and by an older version of this application.
- **No map is open.** `blueMapApp` is null until a profile is active, so no viewer settings are
  listed and the palette says so in a line of its own. A theme select wired to nothing would be
  exactly the decorative control this project forbids.
- **An invalid pattern** matches nothing rather than quietly falling back to the last pattern
  that compiled, which would leave results on screen for a search nobody can see any more. An
  inactive matcher matches everything, which is what an empty box means.
- **A setting whose current value the application cannot determine** renders as a `choice` with a
  null value rather than guessing at one.
- **The shell cannot perform an action.** Every shell action the palette needs is something the
  shell already does from a button of its own. A shell without one simply has no such button, and
  the corresponding row is not built.

## Security considerations

Nothing here reaches the network. The catalogue is built from registries already in the bundle,
the search runs on the local `RegExp` engine under the bounds `components/config/regexEngine.ts`
states (512-character pattern, 20000-character sample, 500 matches, 100 ms per preview run), and
no pattern or sample is transmitted, logged or persisted. The only thing written to storage is
the size, which is one of two known strings.

Rows write through the same methods and the same storage keys the owning surface writes through,
so the palette adds no second, less validated route to a setting. A row that cannot reach a
setting's real write path is a destination that opens the surface instead.

## Accessibility

The palette is a labelled dialog with its search field focused on open, closed by Escape, and
returning focus to whatever opened it. Rows are reachable by keyboard in the order they render,
each control is named with the setting it changes rather than with a bare value, the result count
is a polite live region, and the group headings are real headings so a screen reader can move by
them. The size control is a row like any other, so a keyboard user changes it without reaching
for the header.

## Verification

| Test | What it holds |
|---|---|
| `paletteItems.test.ts` | The haystack covers title, group, description, keywords, the value text and a destination's `where`; a toggle contributes no value text and a choice contributes every option label; an inactive matcher keeps everything and an invalid one keeps nothing; grouping preserves first-seen order; the sample is one row per line. |
| `paletteCatalog.test.ts` | Every settings anchor and every options-editor screen is represented; rows derived from a registry carry that registry's own copy; the editor collapses to one row until the shell promises it can route, and expands to seven when it does; a setting row's `set` reaches the same write path the owning surface uses. Then: a row per page of the strip, each going to that page; a page the catalogue has never heard of still listed and still navigating; no page rows for a shell that will not navigate; the Servers row dropped once the strip carries that page and restored when there is no strip; History routing for real; the notification centre, tab finder and changelog opening, with the changelog absent without a viewer; the appearance preset applied and cleared through `commitAppearance`, and the global reset emptying every element. |
| `palettePrefs.test.ts` | The shortcut matches Control and Command with Shift and either case of F, refuses Alt, refuses a bare F and a plain Ctrl+F, and refuses the Ctrl+K this used to be; a blocked storage returns the default rather than throwing; a stored value that is not a known size is discarded. |
| `CommandPalette.test.ts` | Mounted: nothing renders until it opens, the search box takes focus and gives it back to the opener on close, the search narrows the list, a broken pattern is reported rather than showing the last good result, the down arrow moves from the box onto the first row, a destination emits the reveal handler's own target, a setting row writes and persists, and the palette opens as a card and remembers being made full-window. Plus the binding itself, on a host arranged as `App.vue` is: Ctrl+Shift+F opens the palette and toggles it shut, it swallows only the keystroke it acted on while leaving plain Ctrl+F and the old Ctrl+K alone, and it still works from inside a text field that stops propagation, which is what the capture phase is for. |

Run them with `npx vitest run packages/ui/src/components/palette` from `design/`.

## Suggested reading

- [The regex builder and the search bars it reaches](./regex-builder.md), which the palette's own
  search bar is one of.
- [Language modes and funny levels](./language-and-tone.md), whose catalogue does not carry the
  palette's keys yet, so its copy still renders the English fallbacks at every setting.
- [Notification centre](./notification-centre.md), the other surface built around finding
  something that has scrolled past.
