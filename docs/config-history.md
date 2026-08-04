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
- **The panel.** A **History** tab in the config screen: browse, diff, restore, label, trim and
  export. The date filter is the same advanced calendar picker the changelog viewer uses; the
  action chips are derived from the revisions actually present, with counts; the search field
  carries the full regex builder like every other search surface. All three filters compose.
  Export writes Markdown, JSON, CSV or plain text, states which slice it holds, and also reaches
  the clipboard.

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
repositories in real temporary directories (37 tests), including: one revision per change with an
honest label, nothing recorded when nothing changed, no `.git` ever created in the user's folder,
no remote ever, restore recorded as a new revision, undo-of-undo-of-undo, the pre-restore disk
snapshot, partial-restore honesty, trim keeping the newest and refusing to empty, and a save
surviving a history that fails. The no-git block runs everywhere; the real-git block skips itself
only where git is absent — the same situation those eight no-git tests cover. The panel and its
filtering model carry 37 further tests, and the trim gate is declared in the super-confirmation
inventory (`superConfirmPolicy.test.ts`), so a new destructive call cannot slip past unnoticed.

## Suggested next

- [Super confirmation](./super-confirmation.md) — the gate in front of trim.
- [Changelog and the in-app changelog viewer](./changelog-viewer.md) — the date picker the
  history panel reuses.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the search field on
  the panel.
