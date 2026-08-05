# Local version history for config folders

Every BlueMap config folder the app edits gets its own local git history. The history lives in an
isolated repository beside the app's data directory — never as a `.git` inside the folder the user
chose — and every save records a complete snapshot of the folder as it actually is, deletions
included. Nothing is synced, pushed or shared: the history is local, and there is no channel
through which a remote could even be configured.

The same machinery — `design/packages/app/src/main/history/` — also backs a world's project file
(`design/packages/app/src/main/project/history.ts`), and, as of this document, the server-profile /
maps-and-servers list and the application's own settings. Everything below through "Failure modes"
describes the config-folder history specifically; [Beyond config folders](#beyond-config-folders-profiles-and-application-settings)
below describes the other three and, for the profile list and the settings, what still has to
change before saving one of them in the running app actually produces a revision.

## Behaviour

- **Where it lives.** `<Electron userData>/config-history/<folder-slug>-<hash16>/`, one real git
  repository per config folder, holding a *mirror* of the folder's files on a branch named
  `history`. The folder-to-repository mapping sits in `projects.json` next to them, written
  atomically; because the repository name is derived from a hash of the folder path, a lost index
  file only loses labels for the mapping, not the history itself.
- **When it records.** After every successful save from the options editor, fire-and-forget. An
  unchanged folder records nothing, so the panel stays a list of real events.
- **What a revision says.** Labels name what changed — "Deleted the nether map", "Added the nether
  map, changed the core settings" — never a bare "Updated".
- **Restore is append-only.** Restoring first snapshots whatever is on disk (so edits made outside
  the editor are caught and kept), then writes the old files back through the same guarded write
  path the editor uses, then records the restore itself as a new revision with a `Restored-From`
  trailer. There is no `reset`, no `amend`, no `rebase`; an undo can be undone, and that undo
  undone in turn.
- **A restore can be the whole folder, one file, or one setting.** All three take the same route
  and get the same guarantees. The panel's own label says which happened: "Restored the config as
  it was at …" for the whole folder, "Put the nether map back as it was at …" for one file, "Put
  the setting sky-color back as it was at …" for one setting. That distinction is load-bearing,
  because the two rows imply completely different things about every file the row does not name.
- **The panel.** A **History** tab in the config screen: browse, compare, diff, restore, label,
  trim and export. The date filter is the same advanced calendar picker the changelog viewer uses;
  the action chips are derived from the revisions actually present, with counts; the search field
  carries the full regex builder like every other search surface. All three filters compose.
  Export writes Markdown, JSON, CSV or plain text, states which slice it holds, and also reaches
  the clipboard.

## Comparing any two revisions

Choosing **A** on one row and **B** on another compares those two moments however far apart they
are. The panel had only revision-against-parent before, which could not answer the question people
actually arrive with: *what has changed since the config last worked?* Four saves ago meant four
patches to read and merge in your head, and the usual outcome was restoring the whole folder and
losing every good change made since.

The comparison is a surface above the list rather than a dialog, so the rows it was built from are
still there, still filterable, still selectable. The header names both ends with their dates and
always puts the older one at A; **Swap** reverses it rather than making somebody unpick their
choices. The comparison exports and copies in the same four formats the history does, stating which
two revisions it holds.

## A readable diff, with the raw patch behind it

A unified patch is a diff of *lines*, and these files are not lines, they are settings. The two
coincide often enough to look acceptable and then stop exactly when it matters:

- `-sky-color: "#7dabff"` / `+sky-color: "#ffffff"` is two lines to compare character by character
  to learn one fact. `sky-color: #7dabff to #ffffff` is the fact.
- A setting that moved in the file with the same value is a five-line patch describing a change
  that did not happen.
- A comment somebody added is a hunk with no setting change in it, sitting between the reader and
  the change they were looking for.

So the main process sends both sides of each file whole (capped, and stating when a side was
withheld for being too large or not text), and the panel reads them with the same
`@material-bluemap/config` HOCON model the editor writes files with, flattens each to
`dotted.key -> value`, and reports the difference between those two maps. `.json` files are read
the same way.

**The raw patch never goes away.** Every file keeps it behind a `<details>` disclosure: closed
because the settings above answer the question nine times in ten, one keystroke away because the
tenth time nothing else will do. A file that cannot be parsed - one this editor does not model,
one too large, one that is not text - falls back to the patch **and says which and why**, rather
than rendering an empty list that would read as "nothing happened". An empty list and a fallback
are different states and the panel words them differently: empty means the file changed but no
setting did, which is a real thing to be told.

## Selective restore

Every readable diff offers **Put this file back** beside each file and a restore control beside
each setting.

- **One file** is put back by the main process from the revision's own bytes. A named file that
  did not exist at that revision is taken off the disk, because that is the honest meaning of "put
  it back as it was". Files that are not named are not touched in either direction.
- **One setting** is a merge rather than a copy: the file keeps every other setting, every comment
  and its formatting, and only the chosen key takes its old value. The merge happens in the
  renderer because the round-tripping HOCON reader and writer are `@material-bluemap/config`, and
  a second copy of them in the main process would be a second HOCON implementation to disagree
  with the one that writes every save. What the main process still checks, rather than assumes:
  the revision exists in this folder's history; every path is one this editor would write
  (`checkConfigPath`); every path is one that revision or the folder currently holds; the total
  text is within a stated cap. It then snapshots the folder first and records the write as a new
  revision with the `Restored-From` trailer.
  A `.json` file is re-serialised in the editor's own layout, because JSON keeps no comments to
  preserve, and the panel says so before it happens rather than letting it arrive as a surprise in
  the next diff.

A merge that would come to nothing - the setting already holds that value, the file is gone, the
file cannot be parsed - is refused with a sentence naming the key and the reason. A partial merge
that quietly did three of four settings would leave somebody believing a setting was restored when
it was not, which is worse than a refusal, because a refusal is visible.

## The timeline

Revisions are grouped by the local day they fall on, with a sticky day heading carrying the number
of revisions, the number of *distinct* files touched (two edits to one file count once) and the
added / changed / taken-away split. Grouping never re-sorts, in either dimension: the timeline
shows the order the list is in, because a timeline that imposed its own would disagree with the
list it is drawn from and the reader would have no way to tell which was lying.

The revision that is on disk right now is marked from the **unfiltered** history, never from the
first row of the view. The newest row of a filtered view is merely the newest thing that matched,
and calling it live would be a confident lie in exactly the situation - somebody hunting through a
filtered history for something to restore - where being wrong about it matters most. When a filter
hides the live revision, nothing is marked at all.

A revision whose timestamp cannot be read goes into a final group of its own rather than being
dropped: it is still a revision somebody may need to restore.

## Keyboard and screen reader

- The list uses a **roving tabindex**: one row is a tab stop and the rest are not, so a
  two-hundred-revision history is not two hundred tab stops between the search field and the
  retention control. Tab still reaches every control inside the focused row.
- <kbd>&uarr;</kbd> / <kbd>&darr;</kbd> move between revisions and stop at the ends rather than
  wrapping, <kbd>Home</kbd> / <kbd>End</kbd> jump to them, <kbd>Enter</kbd> or <kbd>Space</kbd>
  opens a revision, <kbd>A</kbd> and <kbd>B</kbd> choose the two comparison ends, <kbd>Esc</kbd>
  closes the comparison. Every one of those is stated on screen beneath the list.
- Keystrokes are handled only when they came from a row itself. Without that check, typing the
  letter `a` into a row's label field would silently choose that row as a comparison end.
- Each row carries **one** accessible name covering its label, time, action, note, live state and
  comparison role, rather than leaving four chips to be read in whatever order the markup puts
  them. The live revision also carries `aria-current`.
- One polite live region announces what the keyboard just did - "2 of 12. Deleted the nether map",
  which end a revision became, that a comparison was swapped or closed. It is positioned off
  screen rather than hidden, because `display: none` would take it out of the accessibility tree
  and it would announce nothing while looking like a working implementation.
- Every diff block is focusable and scrolls rather than clipping; the smooth scroll on the
  timeline is inside a `prefers-reduced-motion: no-preference` block, so reduced motion is
  respected by default rather than by an override.

## Degrading to an older shell

The three newer channels - `history:compare`, `history:restoreFiles`, `history:restoreSettings` -
are probed on the bridge **one at a time**, unlike the original eight, which remain all-or-nothing.
A desktop shell built before them still keeps a perfectly good history, and refusing the whole
panel would take away the eight things it can do to punish it for the three it cannot. Where
`compare` is absent the panel falls back to `history:diff` and shows the raw patch, which is what
it always showed; where the selective restores are absent, the A/B and per-setting controls are not
rendered at all, rather than being rendered and failing when pressed.

## Configuration

Retention is the one knob: **trim to the newest N revisions** from the panel. Trimming is the only
operation that deletes anything, so it sits behind the super-confirmation gate (two keys and the
slider) and refuses to discard everything — a retention setting cannot empty a history.

## Beyond config folders: profiles and application settings

Issue #35 asked for the same append-only history to cover three more things: the server-profile /
maps-and-servers list, the application's own settings, and — per the issue's own reading of its
third item — the maps-and-servers list is the profile list seen from the interface, not a second
store. So this is two new histories, not three, each with its own repository family beside the
existing `config-history/` and `project-history/` ones:

| Covered by this change | Where the main-process module lives | Repository family |
|---|---|---|
| Server profiles / the maps-and-servers list | `design/packages/app/src/main/profiles/` | `<userData>/profiles-history/` |
| Application settings | `design/packages/app/src/main/settings/` | `<userData>/app-settings-history/` |

Both are built on exactly the machinery above — `snapshotProject`, `restoreRevision`,
`HistorySource`, the isolated git configuration, `rememberProject` — the same way
`project/history.ts` binds a world's project file to it. Nothing about the append-only contract is
weaker here: a restore snapshots what is on disk first, writes the old file back, and records the
restore itself as a new revision; a failed history write never fails the save that triggered it,
because the git runner returns failures as values and the IPC handlers resolve rather than reject.

### Why this needed a decision before any code, and which one was made

The existing history is a **main-process** feature: it runs git against files on disk. The server
profile list and the application's settings are **renderer** state today, persisted straight to the
browser's `localStorage` by `design/packages/ui/src/stores/profiles.ts` and by several independent
stores under `design/packages/ui/src/components/settings/` and `design/packages/ui/src/components/`
(`appearanceStore.ts`, `dockPlacement.ts`, `palettePrefs.ts`, `menuPrefs.ts`, `setupPrefs.ts`,
`tabStorage.ts`, `eulaStorage.ts`, `remoteTargets.ts` among them) — none of which the main process
can see, and therefore none of which it could keep a history of without a decision.

The issue named two options: move the data into the main process (a JSON file the existing history
machinery can snapshot, with a one-way migration for what is already in `localStorage`), or have the
renderer hand every new state to the main process to be snapshotted while `localStorage` stays the
live copy. The second option means two sources of truth that can drift; the first is the better fit
with everything else this feature already does, so **Option A** is what was built: a real JSON file
per store, in a real directory beside the application's data, read and written by the main process
and mirrored into its own history repository exactly the way a config folder is.

- `profiles/store.ts` — `<userData>/profiles-store/profiles.json` is the live copy of the profile
  list (id, name, url, whether remote customisations are trusted, and a locally rendered map's data
  root). Reading a missing or malformed file degrades to the empty state, the same tolerance
  `history/store.ts`'s own mapping file gets; writing goes through a temporary file and a rename, so
  a crash mid-write cannot leave a half-written list.
- `settings/store.ts` — `<userData>/app-settings-store/settings.json` holds a `values` bag keyed by
  whatever name a settings surface gives its own preferences. This layer deliberately does not know
  what any individual setting means: typing every one of today's dozen `localStorage`-backed
  preferences here, in one pass, would make this file the thing every settings surface has to agree
  with before any of them could migrate, and there are more of those surfaces than there was time to
  move in this change. A changed key is named by its key in the revision label — "Changed appearance,
  dockPlacement" — which is less pretty than a hand-written sentence and honest about what this layer
  actually knows, the same restraint `history/describe.ts` shows a config file it does not model.

Each gets its own describer (`profiles/describe.ts`, `settings/describe.ts`) so a revision names what
changed rather than saying "Updated": a profile added, edited or deleted by name, which profile
became active, or which setting keys were added, changed or removed — never a bare "Changed
profiles.json", which is what diffing the raw file would produce for every single edit.

### What is genuinely wired, and what still needs the renderer's half

**The main-process side is complete and tested**: `profilesHistory:read` / `:save` / `:list` /
`:restore` and `settingsHistory:read` / `:save` / `:list` / `:restore` are registered on every
launch (`packages/app/src/main/index.ts`), backed by real git repositories, with the full
append-only contract proven the same way `history/ipc.test.ts` proves it for config folders — a save
records exactly one revision, an unchanged save records nothing, a restore is itself a new revision,
undoing a restore is another restore, a machine with no git is an honest state rather than a lost
save, and a git that fails mid-commit leaves the file on disk exactly as it was written.

**What is genuinely wired today, past the four steps below:**

1. **Done.** Both bridges are exposed on the preload
   (`design/packages/app/src/preload/index.ts`), the same way `history:*` and `project:*` are —
   `profilesHistory` and `appSettingsHistory`, each with `read`/`save`/`list`/`restore`.
2. **Done.** `design/packages/ui/src/stores/profiles.ts`'s persistence watcher calls
   `profilesHistory.save` with the current `ProfilesState` after every mutation — fire-and-forget,
   in addition to writing `localStorage`, which stays the real source of truth (see step 3). The
   maps-and-servers list is this same store read from the interface, so wiring it wires both at
   once. Every other `localStorage`-backed settings surface goes through
   `design/packages/ui/src/stores/appSettingsHistorySync.ts`'s `recordAppSetting(key, value)`
   instead, because `settings.json` holds one flat `values` bag shared by every wired surface and a
   surface that saved only its own key would silently erase every other surface's already-recorded
   value the next time it ran — `recordAppSetting` reads the bag that is there now, merges in the
   calling surface's own key, and saves the merge. Every `localStorage`-backed store this package
   has is now either wired this way or named as a deliberate exclusion, and the pair of lists in
   `appSettingsHistorySync.ts` — `APP_SETTINGS_HISTORY_KEYS` and `EXCLUDED_APP_SETTINGS` — is the
   audit trail, each entry checked against the real source by
   `appSettingsHistoryManifest.test.ts` rather than trusted on its word:

   | Key | Store | What it holds |
   |---|---|---|
   | `menuSearch` | `components/menu/menuPrefs.ts` | whether a menu search bar is open, per surface |
   | `appearance` | `components/appearance/appearanceStore.ts` | the whole appearance/theme record |
   | `dockPlacement` | `components/settings/dockPlacement.ts` | which edge (or floating) each docked surface uses |
   | `palette` | `components/palette/palettePrefs.ts` | the command palette's card/full-window size |
   | `remoteTargets` | `components/remote/remoteTargets.ts` | the saved remote render targets (no secret field — see that file's own doc comment) |
   | `eulaTabs` | `components/eula/eulaStorage.ts` | the EULA viewer's own tab arrangement |
   | `markerFiltersOpen` | `components/markers/MarkerMenu.vue` | whether the marker filters panel is open |
   | `mapStorageDir` | `components/setup/mapStorage.ts` | the chosen folder for rendered maps |
   | `languageMode` | `components/setup/setupI18n.ts` | English / Cantonese / bilingual |
   | `funnyLevelEn`, `funnyLevelYue` | `components/setup/setupI18n.ts` | the two independent funny-level sliders |
   | `updateDismissed` | `components/update/updateModel.ts` | the last update version whose banner was put away |
   | `tabs.<storage key>` | `components/tabs/tabStorage.ts` | one entry per tab strip this module backs (the main shell, Settings, the config editor, a project editor), namespaced by the strip's own `localStorage` key so the four cannot collide |

   Two keys are named instead as deliberate exclusions, both inside `dockPlacement.ts`:
   `dockSize` and `dockFloating` are written on **every pointermove frame** while a panel is
   resized or dragged (`DockedSurface.vue`'s splitter and header handlers call `setDockThickness`
   / `setDockFloatingRect` continuously, never only at drag-end), so mirroring either would turn
   one drag gesture into dozens of history revisions of pure noise. The *discrete* choice this
   geometry serves — which edge a panel docks to — is the `dockPlacement` key above.
3. **Not yet done.** Reading `profilesHistory:read` / `appSettingsHistory:read` at startup as the
   source of truth, with the existing `localStorage` value kept as a fallback and a one-time,
   idempotent copy into the new store — safe to run twice, because writing the same state twice
   records nothing the second time. `localStorage` remains authoritative until this step lands.
4. **Not yet done.** Surfacing both histories in the existing History tab
   (`design/packages/ui/src/components/history/`) alongside the config-folder and project histories
   already there, reusing its date filter, action filter, search and export rather than building a
   second panel.

None of this changes the promise the main-process half already keeps: once a caller does hand it a
state to save, the history it keeps is real, local, append-only, and never blocks or fails the save
it is recording. And none of the renderer-side wiring above changes it either: a rejected or missing
`save` call is swallowed at the call site, exactly as `docs/config-history.md`'s own failure-mode
rule requires, so a history mirror that cannot be written never turns a settings or profile change
into an error.

## Failure modes

- **A failed history write never fails the save.** This is structural, not conventional: the git
  runner returns failures as values rather than throwing, every IPC handler resolves, and the
  snapshot call after a save is fire-and-forget. A history that cannot be kept must not turn a
  save that worked into one that failed.
- **No git on the machine.** The panel says plainly what is lost and that everything else still
  works; it offers no control it cannot honour. Nothing else in the app changes.
- **A restore that cannot put a file back** reports which files failed rather than pretending it
  succeeded; the pre-restore snapshot it took first still holds what was on disk.
- **A file the readable diff cannot parse** falls back to the raw unified patch and names the file
  and the reason. It never shows an empty settings list for a file that definitely changed.
- **A setting that cannot be merged** is refused by name with the reason, and nothing is written.
  The three cases are: the file is not in the folder now (put the whole file back instead), the
  file cannot be parsed at one end or the other, and the setting already holds the value it had.
- **A machine's global gitconfig cannot reshape a history.** Every git invocation pins its own
  configuration (no global or system config, forced identity, signing off, `autocrlf` off,
  hooks bypassed), so a template, hook or signing requirement elsewhere on the machine cannot
  break or alter what gets recorded.

## Security considerations

The history is a second copy of the config folder's contents, with the same sensitivity as the
folder itself — config files can hold database connection strings. It is kept under the app's own
data directory with the same protections as the rest of the app's data, and never leaves the
machine. Restores write only through the config editor's existing guarded write path, inheriting
its path refusals, so a crafted revision cannot direct a write outside the config folder.

## Verification

`design/packages/app/src/main/history/ipc.test.ts` runs the append-only contract against real git
repositories in real temporary directories (62 tests), including: one revision per change with an
honest label, nothing recorded when nothing changed, no `.git` ever created in the user's folder,
no remote ever, restore recorded as a new revision, undo-of-undo-of-undo, the pre-restore disk
snapshot, partial-restore honesty, trim keeping the newest and refusing to empty, and a save
surviving a history that fails. The comparison and selective-restore work adds: two revisions
several apart compared in one call, both sides sent whole, `null` rather than `""` for a side a
file did not exist on, the first revision opening against the empty tree, one file put back while
another file's later edit survives, a named file taken off the disk when it was not there then, a
partial restore itself being undone, a merged setting write refused for a path this editor would
not write, for a file neither the revision nor the folder holds, and for a revision that is not in
this history, plus the pre-merge snapshot catching an edit made outside the editor. The no-git
block runs everywhere and now covers the three newer channels too; the real-git block skips itself
only where git is absent — the same situation those no-git tests cover.

The interface carries 121 further tests across five files: the filtering model and both exports
(`historyModel.test.ts`), the readable diff against real HOCON including the moved-setting and
added-comment cases a line diff gets wrong (`historyDiff.test.ts`), the setting merge proving
comments and neighbouring settings survive (`historyRestore.test.ts`), the day grouping and the
live-state marking (`historyTimeline.test.ts`), and the mounted panel covering A/B comparison
through the real buttons, keyboard navigation, the live region, selective restore, and the
fallback for a shell that predates the newer channels (`HistoryPanel.test.ts`).

The trim gate is declared in the super-confirmation inventory (`superConfirmPolicy.test.ts`), so a
new destructive call cannot slip past unnoticed; the setting merge's in-memory key removal is
declared there too, as a `buffer` transform that never reaches the disk by itself.

`design/packages/app/src/main/profiles/ipc.test.ts` and
`design/packages/app/src/main/settings/ipc.test.ts` run the same append-only contract against the
two new histories, mirrored from `project/ipc.test.ts`'s structure: exactly one revision per save,
each with an honest label naming the profile or setting that moved; nothing recorded when a save
changed nothing; no `.git` inside either live store, with the repository kept in its own family
beside `config-history/` and `project-history/`; a save on a machine with no git still writes the
file and reports the history failure separately; a git that fails mid-commit leaves the save intact;
and a restore recorded as a new revision, provably undoable in turn. Neither module introduces a new
destructive call site in `packages/ui` — both expose read, save, list and restore only, with no
trim — so the super-confirmation inventory needed no change for this work.

## Suggested next

- [Super confirmation](./super-confirmation.md) — the gate in front of trim.
- [Changelog and the in-app changelog viewer](./changelog-viewer.md) — the date picker the
  history panel reuses.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the search field on
  the panel.
