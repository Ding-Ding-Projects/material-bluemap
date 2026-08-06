# Worlds ready to use on the Projects tab

The Projects tab no longer starts empty just because nobody has made a project yet. It
reads the same world catalogue [Finding worlds](finding-worlds.md) documents and shows
what it found - the default Minecraft folder, Bedrock's worlds folder, CurseForge's
instances, and anything the person has mounted - as a second, distinctly styled panel
above the established projects list, each row one click away from becoming a project.

Nothing here is a second discovery system. `DiscoveredWorldsPanel.vue` calls the exact
bridge methods `MinecraftWorldList.vue` (the wizard's own world picker) calls -
`listMinecraftFolders`, `scanMinecraftFolder`, `mountMinecraftFolder`,
`unmountMinecraftFolder`, `labelMinecraftFolder` - and formats every fact about a world
with the same pure functions from `worldCatalog.ts`. The two panels differ in their
template and interaction model, not in what they know: a project is started, potentially
several at once, which the wizard's single-choice listbox has no equivalent of.

---

## Behaviour

### Automatic, from the moment the tab opens

The panel loads the folder list and starts scanning every folder in parallel the instant
it mounts (`onMounted`), the same as the wizard's own list. Nobody has to click anything
first for the default Minecraft folder's worlds to appear - which is the whole point: a
user who obviously has worlds on this machine sees them without being asked to go find
them.

### Discovered, not automatically a project

A world found on disk and a project somebody has configured are different things, and the
panel keeps them visually and behaviourally apart:

- A discovered row carries a **"not yet a project"** chip and its own dashed-border card
  (`.mb-discovered`), distinct from the solid-cornered `.mb-projects` card below it.
- Nothing writes a project file just because a world was found. Clicking a row, or its
  **Use** button, or pressing <kbd>Enter</kbd> on it, opens the project editor **pre-filled
  and unsaved** - the same state `New project` already produces, just without having to
  type or browse for the world path. Saving is still a deliberate act.
- Once a project exists for a world - saved from the editor, or written by the bulk action
  below - that world stops appearing here on the next read, because `discoveredWorlds.ts`
  filters it out.

`discoveredWorlds.ts` is the one piece of logic genuinely new to this feature:

```ts
discoveredWorlds(allWorlds, projectWorlds) // -> worlds with no project, deduplicated
```

`projectWorlds` is compared with the same `samePath` every other identity check in the
world-handling code uses - separator-folded, case-folded - so a project whose `world`
field disagrees with the catalogue only in case or trailing separator still correctly
hides its own world rather than offering to start a second project over it.

### De-duplication

The same world can be reachable two ways - a Minecraft folder and its own `saves` folder
both mounted, or (new in this pass) a launcher root and one of its instances mounted
separately. Two layers keep it to one row:

1. **Folder-level, on the main-process side.** `mounts.ts`'s `folderIdFor` hashes the
   resolved `savesPath`, so mounting the same resolved folder twice is recognised as
   already-mounted before a second folder row - and therefore a second copy of every
   world in it - can exist at all.
2. **World-level, defensively, in the UI.** `worldCatalog.ts`'s `dedupeWorldsByPath` folds
   every discovered world down to one row per normalised path (again via `samePath`)
   before anything is shown or filtered. This is the belt to the first layer's braces: it
   catches a stale cache or a symlinked folder that folder-level dedup does not reach, and
   it is independently unit-tested rather than trusted to fall out of the first layer.

### Bulk actions

Every row carries a checkbox (roving tabindex, `aria-selected`, focus kept separate from
selection exactly as the wizard's listbox and `ProjectList.vue` both already do), plus
**Select the N shown**, **Invert** and **Clear the selection**. Choosing several and
pressing **Start projects for N chosen** writes a default project for each one
immediately, through the same `host.writeProject` the editor's own Save button calls,
and reports per-world failures rather than one opaque "something went wrong" - a batch
where three of five started has to say which three.

A single click stays a pre-filled, unsaved editor rather than an immediate write:
reviewing one world before committing to it is normal; reviewing ten one at a time before
a "bulk" action finishes is not what bulk means.

### Honest empty states

Four are distinguished, not one generic "nothing here":

| State | What it means | What is said |
|---|---|---|
| Still scanning | folders or worlds are being read right now | a progress indicator and "Reading your Minecraft folders..." |
| No folders added | the catalogue has nothing to look in, not even a default | "No Minecraft folder was found on this computer..." |
| Folders added, no worlds found | real folders exist and were read; they hold nothing | "No worlds were found. It looked in: \<the real paths\>." |
| Every world already has a project | discovery found worlds, but none is without one | "Every world this computer can find already has a project below." |

A fifth, for the panel's own search, reads "No world matches that search" - distinct from
all four above, so clearing a query is understood to bring worlds back rather than to fix
a folder problem.

### Right-click and the keyboard

Each row is wrapped in `AppearanceTarget`, the same per-element appearance wrapper
`ProjectList.vue` uses for its own rows. That gets this panel, for free and without a
second implementation: a context menu anchored to the row, carrying **its own search
field** wired to the full regex builder; **Shift+right-click** straight to the
per-row appearance editor; and every command's keyboard shortcut shown beside it
(`<kbd>Enter</kbd>` for "Start a project for this world", `<kbd>Space</kbd>` for
"Add it to the selection").

### Mounting more folders

The panel carries its own copy of the mount-management block `MinecraftWorldList.vue`
shows in the wizard - the folder list, **Mount another Minecraft folder** with a native
browse button beside the path (never a bare text field), and per-folder rename and
unmount - because it calls the exact same bridge methods. Unmounting a folder only takes
it out of this list; it is said in as many words beside the button, and nothing here ever
opens, reads or deletes a world file. A folder that has gone missing or become unreadable
keeps its row and says so rather than silently disappearing.

### Not blocking

Folder listing and per-folder scanning both run asynchronously from `onMounted`, exactly
as the wizard's own list does: a slow network-mounted folder shows its own "reading..."
state while every folder that answered quickly is already on screen, and the tab itself
is interactive throughout - nothing here freezes the interface while a scan runs.

---

## Configuration

Nothing to configure. The panel reads whatever `worldCatalogBridge` resolves to (probed
automatically in a real build, injectable in a test) and whatever `projectWorlds` the
Projects tab hands it from its own already-loaded project list - both wired once in
`ProjectsScreen.vue` and requiring no setting anywhere.

---

## Failure modes

- **No bridge at all** (a browser tab with no desktop shell behind it): the panel renders
  nothing rather than a broken card, exactly as `MinecraftWorldList.vue` does.
- **A folder listing fails outright**: reported as an alert on the panel, the rest of the
  tab - the projects list itself - keeps working.
- **One folder's scan fails**: reported on that folder's own row; every other folder's
  worlds stay on screen.
- **The bulk write fails for some but not all worlds**: reported per world by path, and
  the ones that did start are still reported as a success count.
- **A world already open, unsaved, in the editor**: clicking a discovered world while an
  unsaved project is open does not replace it. A warning names the situation instead of
  silently discarding the edit in progress.

## Security considerations

Identical to [Finding worlds](finding-worlds.md#failure-modes-and-security): scanning is
read-only, nothing beyond what identifies a world is read, and the only file this feature
writes on its own is a project file - only when a person explicitly chooses **Use** or the
bulk action, never as a side effect of the tab opening or a folder being scanned.

---

## Verification

```sh
cd design && npx vitest run packages/app/src/main/world                          # discovery, incl. launcher roots
cd design && npx vitest run packages/ui/src/components/world/worldCatalog.test.ts # dedupeWorldsByPath
cd design && npx vitest run packages/ui/src/components/project                   # discoveredWorlds, the panel, the wired tab
```

`discoveredWorlds.test.ts` proves the discovered/project filtering rule with no DOM.
`DiscoveredWorldsPanel.test.ts` mounts the real component against a fake bridge and
proves automatic discovery, the discovered/project distinction on screen, the honest
empty states, the one-click route, and the bulk action emitting every chosen path.
`ProjectsScreen.test.ts` proves the wiring itself: that the screen threads its own
project list into the panel, that a click really opens the editor pre-filled, and that
the bulk action really reaches the project host and the newly created projects really
stop appearing as discovered afterwards.

## Related

- [Finding worlds](finding-worlds.md) - the catalogue and mount handling this panel
  reuses in full: default locations (including Bedrock and CurseForge), mounting,
  honest states, and the pure functions that describe a world
- [regex-builder.md](regex-builder.md) - the builder this panel's search and its
  per-row context menu search both use
- [path-field.md](path-field.md) - the browse button beside the mount field
- [super-confirmation.md](super-confirmation.md) - why starting a project needs no gate
  here (nothing irreversible happens without a save) while removing one, in
  `ProjectList.vue`, still does
