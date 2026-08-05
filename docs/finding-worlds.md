# Finding worlds

The first step of the make-a-map wizard offers the worlds already on this computer, and
keeps every manual route open beside them. Nothing here has to be configured before it
works: the default Minecraft installation is found without anybody adding it.

## Where it looks

| Place | Path |
|---|---|
| Windows | `%APPDATA%\.minecraft\saves`, falling back to building the path from the home directory when the variable is absent |
| macOS | `~/Library/Application Support/minecraft/saves` |
| Everywhere else | `~/.minecraft/saves` |
| Portable | `<directory of the running executable>/.minecraft/saves`, listed **only when it really exists** |
| Anything else | folders the user has mounted (below) |

`main/world/locations.ts` takes the platform, the environment, the home directory and the
executable's directory **as parameters** rather than reading `process` inline, so a Windows
layout is testable from a Linux CI runner. That is not a stylistic preference: this
repository has already shipped a path bug that no test could reach for exactly that reason,
and `main/java/discovery.ts` carries the same note.

### Why there is no MultiMC or Prism entry

Their instance-root layouts could not be confirmed from anything in this repository, and a
guessed root reports *no worlds* about a folder full of them. That is worse than not
looking, because it answers a question it was never asked and looks authoritative doing it.
Mounting covers those installations properly, and `locations.ts` says so in its header.

## Mounting more Minecraft folders

One machine commonly holds several installations: a vanilla one, a modded one, a launcher's
instance tree, a copy on a second drive. Each can be mounted, and the list persists.

- **Either level is accepted.** Somebody will pick `.minecraft` and somebody else will pick
  `.minecraft/saves`; both are the same intent. What it resolved to is recorded and shown.
  A folder that is neither is refused by name, with the parent to mount instead.
- **Labels matter more than they look.** Two folders both called `saves` tell you nothing
  apart, so each mount carries a name. Built-in entries can be renamed too, keyed by origin
  so a moved home directory keeps the name.
- **Mounting the same folder twice** resolves to the row that already exists.
- **Unmounting rewrites one JSON file and never opens the folder.** `mounts.test.ts`
  asserts the worlds are still on disk afterwards, because "unmount" beside a list of
  worlds reads as "delete" to a reasonable person. It is not behind the destructive-action
  gate for the same reason.

## What each world shows

The name comes from `LevelName`, **not** the folder name, because those differ constantly.
Underneath it, as a real secondary line rather than a tooltip:

last played · version, marked as a snapshot when it is · game mode · Hardcore · cheats ·
dimensions and their region files · size on disk · seed · the folder on disk when it
differs from the name · **which mounted folder it came from**

That last one is not decoration. Two installations commonly hold worlds with the same name,
and a row that cannot be told from another row is a row somebody renders by mistake.

The seed travels as decimal **text**. A 64-bit seed does not survive a JavaScript number,
and a seed that is quietly wrong is worse than a seed that is absent.

Anything unreadable is omitted rather than guessed. A world whose `level.dat` cannot be read
is still listed, with everything that was never in doubt and a note saying what is missing.

## The list itself

A real `listbox`: `role="option"` rows, `aria-selected` on the chosen world, one roving
tab stop, Arrow/Home/End/PageUp/PageDown stopping at the ends rather than wrapping, and an
accessible name per option carrying the world name **and** the whole detail line.

**Focus and selection are separate on purpose.** Choosing a world runs a folder inspection,
so arrowing down ninety rows must not start ninety of them. Enter, Space or a click chooses.

Sorted by last played, most recent first, across every mount. Unknown dates sort last, ties
by name.

Its search is the project's own `ConfigSearchField` with the anchored regex builder, over
the name, the folder name, the full path, the mount label and every detail part, so typing
`1.20`, `hardcore` or the name of an installation all find what somebody means. Plain text
is the default; regex is the explicit opt-in. See [regex-builder.md](regex-builder.md).

## The manual routes still work

Typing a path, browsing for one, and dropping a folder onto the step all work, none of them
behind a disclosure, all of them working with **nothing mounted**. Somebody with one world
on a memory stick is a normal user, not an edge case.

A dropped or picked folder that is already listed resolves to that row rather than
appearing twice, so the same world never shows up under two names.

> Electron removed `File.path` in v32, so the drop target resolves a dropped folder through
> `webUtils.getPathForFile`, which only works in the preload. That is why the bridge carries
> `pathForDroppedFile` rather than the renderer reading the path itself.

The browse button here is not specific to this wizard. Every field in the application that
names a folder or a file on this computer - a storage's tile folder, a config file's log
path, a remote render target's SSH key, a backup's source folder - offers the same button,
behaving the same way: it writes into the field exactly as typing would, a cancelled dialog
changes nothing, and it is shown disabled with an explanation rather than hidden when there
is no desktop app to open a native dialog with. See [Browsing for a folder or a
file](./path-field.md) for the full list of where it appears and how it behaves.

## Honest states

Every one of these is a real state with its own copy, not a spinner that never resolves:

- scanning, overall and **per mount**, each with its own count
- no Minecraft folder at all, **naming the paths it looked in**
- folders found but no worlds in them, naming the real paths it read
- a mount that has gone missing or unreadable **keeps its row and says so** - a folder on an
  unplugged external drive is not a folder somebody meant to forget
- a scan that failed for one folder reports on that folder's row while the other folders'
  worlds stay on screen
- a world whose `level.dat` could not be read, listed with what is known
- no bridge at all, in a browser tab, where the whole section is simply absent

## Failure modes and security

- **Nothing is written.** Scanning reads; the only file this feature writes is the mount
  list under the app's own data directory.
- **Size is measured with a doubly-bounded walk**, so a save folder with a pathological
  structure cannot turn a scan into an unbounded traversal.
- **`level.dat` is skimmed, not parsed whole.** A one-pass reader recognises about a dozen
  names at two known paths and steps over everything else, including the dimension registry,
  which is the largest thing in a modern `level.dat`.
- **A malformed or hostile `level.dat` yields a listed world with missing details**, never a
  crash and never an invented value.

## Verification

```sh
cd design && npx vitest run packages/app/src/main/world      # discovery, level.dat, mounts, catalog
cd design && npx vitest run packages/ui/src/components/world # the list, its keyboard model, its states
```

`locations.ts` is tested with a fake platform, environment and home directory and no
filesystem at all. The filesystem-touching tests use real temporary directories rather than
a fake `fs`, because a fake would decide the very questions worth asking.

## Related

- [regex-builder.md](regex-builder.md) - the builder this list's search uses
- [path-field.md](path-field.md) - the same browse button, wired into every other folder
  and file field in the application
- [legacy-1-12-worlds.md](legacy-1-12-worlds.md) - what a 1.12.2 world can and cannot do
- [large-worlds.md](large-worlds.md) - getting a world that is not on this machine yet
