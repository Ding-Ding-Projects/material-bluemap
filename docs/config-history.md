# Local version history for config folders

Every BlueMap config folder the app edits gets its own local git history. The history lives in an
isolated repository beside the app's data directory — never as a `.git` inside the folder the user
chose — and every save records a complete snapshot of the folder as it actually is, deletions
included. Nothing is synced, pushed or shared: the history is local, and there is no channel
through which a remote could even be configured.

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

## Suggested next

- [Super confirmation](./super-confirmation.md) — the gate in front of trim.
- [Changelog and the in-app changelog viewer](./changelog-viewer.md) — the date picker the
  history panel reuses.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the search field on
  the panel.
