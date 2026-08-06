# Detecting a world's dimensions

Choosing a world used to hand back exactly three dimensions - Overworld, Nether, End -
whether or not the world actually had them, and there was no way to tell the wizard
"also render the Nether" without leaving the guided flow and hand-editing a project
afterwards. This is the part that fixes both: every dimension a chosen world folder
really has is found automatically, shown with its real facts, and can be ticked to
render alongside the primary map with no configuration of its own.

## Behaviour

`main/world/inspect.ts` reads the chosen folder once, shallowly, and reports back the
four layouts Minecraft and its server forks actually use:

| Layout | Where the region files are | Who writes it |
|---|---|---|
| Single-player / vanilla | `<world>/region`, `<world>/DIM-1/region`, `<world>/DIM1/region` | The game itself |
| Custom or modded | `<world>/dimensions/<namespace>/<path>/region`, any number of them | A datapack or a mod |
| Spigot/Paper server split | `<world>/region`, plus `<world>_nether/DIM-1/region` and `<world>_the_end/DIM1/region` as **sibling folders** next to the chosen one | Bukkit-family servers, which never nest the nether or the end inside the overworld's own folder |
| Bedrock Edition | a single `db/` LevelDB chunk database, no `region/` anywhere | Bedrock, both single-player and server |

The first two were already detected before this change; the sibling-folder layout is
new, and is exactly what `de.bluecolored.bluemap.core.world.mca.MCAWorld
.resolveDimensionFolder` in vendored upstream (`core/src/main/java/.../world/mca/
MCAWorld.java`) expects to be handed as `world` for the nether or the end when a server
has split them out - upstream never searches for the sibling itself, because a running
Bukkit server already knows each world's real folder from its own API. This reader has
no server to ask, so it looks for the two conventional sibling names, `<world>_nether`
and `<world>_the_end`, beside the chosen folder: by exact name first, and only then,
case-insensitively, from one bounded listing of the parent. A sibling only counts once
it has both its own `level.dat` **and** real region files under `DIM-1/region` or
`DIM1/region` - either missing and it is not reported, which is what keeps an unrelated
`worldedit_nether` scratch folder from being read as a real dimension. A dimension
found genuinely inside the chosen folder always wins over a same-named sibling.

Once the folder is read, `ui/components/world/worldFolder.ts`'s `dimensionsIn()`
turns the raw counts into a `WorldDimension` per dimension that actually has terrain:
its BlueMap dimension key, whether it is vanilla or custom, its region-file count, and
- for a split-server dimension - the sibling's own absolute folder, since that is what
BlueMap has to be told `world` is for that dimension specifically.

### Where it shows up

`MapIdentityStep.vue`, the wizard's naming step, still asks for exactly one primary
dimension - the map being named and tuned in the rest of the wizard has not changed.
Beneath it, `DimensionSelection.vue` lists **every** dimension the world has, including
the primary one (shown disabled, with a note explaining why it is always included), each
row carrying:

- its real key (`minecraft:the_nether`, or a custom dimension's real namespaced
  identifier such as `aether:skyland` - never omitted for being unrecognised);
- whether it is vanilla or added by a mod or datapack;
- its region-file count, as the cheap proxy for "how much is here";
- for a split-server dimension, the sibling folder its data actually lives in.

Ticking a row adds it to the render as its own map, built from BlueMap's own template
for its own dimension (sky colour, void colour, ambient light and cave removal all set
correctly), with an id and name derived from the primary map's - `survival`,
`survival-the-nether`, `survival-the-end`. None of the primary map's own option edits
are replayed onto it, because a setting tuned for the overworld does not necessarily
suit the nether; the extra map stays reachable and editable afterwards through the
project editor like any other map. The review step lists every extra map that will be
created, by id and by the folder it renders from, so nothing about the render is a
surprise.

### Defaults

The Overworld is whichever dimension `setWorld()` picks as primary (the overworld when
the world has one, otherwise whatever does), and is always included by definition. Every
other dimension - the Nether, the End, and anything a mod or datapack added - **starts
unticked**. Two separate reasons land on the same default:

- rendering the Nether or the End is genuinely not always wanted, and a wizard that
  rendered them by default would be one that surprises somebody with three maps when
  they asked for one;
- an unrecognised custom dimension's size is unknown until it is measured, and defaulting
  it to included would mean the first render somebody runs after picking a heavily
  modded world could quietly be far larger than the one they meant to start.

### Bulk actions and search

The dimension list is a list, so it gets the same treatment as every other list in this
application: a search bar wired to the project's full [regex builder](./regex-builder.md)
(`ConfigSearchField`/`regexEngine.ts`, plain text by default), and bulk **include
shown**, **exclude shown** and **invert shown** actions that only ever touch whatever
the current search is showing - never the dimensions a filter has hidden. The primary
dimension is silently skipped by every bulk action, so "include everything" never adds a
redundant second copy of the map already being built above it.

### A world with nothing to add

A world whose only dimension is the Overworld says so in plain words rather than showing
an empty, apparently-broken list. A folder that could not be read at all still offers
the three vanilla dimensions as an honest guess, and says plainly that they are a guess
rather than a reading (`world.identity.guessedDimensions`) - the existing behaviour for
an unreadable folder, unchanged by this feature.

## Bedrock Edition

Bedrock stores every dimension inside one LevelDB chunk database rather than as
separate region-file folders, so none of the four layouts above apply to a raw Bedrock
world - `inspect.ts` recognises the `db/` directory and reports it as `leveldbFiles`,
which is what lets a Bedrock world be *named* as Bedrock rather than reported as a
corrupt Java world (see [Bedrock Edition worlds](./bedrock-worlds.md)). Dimension
selection, as this article describes it, only applies **after** a Bedrock world has been
converted to Java with Chunker: the converted copy is an ordinary Java world folder,
laid out in whichever of the four layouts Chunker wrote it in, and is detected exactly
like any other.

## Configuration

Nothing here is a setting. Detection runs automatically every time the wizard reads a
world folder; the only "configuration" is which dimensions somebody ticks for a
particular render, which is not persisted beyond the project file the wizard writes at
the end.

## Failure modes and security

- **Read-only, always.** Every check is `lstat`/`opendir` against the chosen folder and,
  for the sibling probe, its immediate parent - nothing here is ever written into a
  world folder, and a symbolic link is never followed out of the folder that was chosen.
- **Cheap by construction.** Region files are counted from directory entries as they are
  read, never opened or stat-ed individually; a chosen sibling is confirmed with two
  `lstat` calls (`level.dat`, then the dimension's own region directory) rather than a
  tree walk. The parent directory is listed at most once, only when neither sibling name
  matches exactly, and only when the chosen folder is itself a world.
- **Nothing is guessed as present.** A dimension folder that exists but holds no region
  files - which Minecraft creates the moment anybody steps through a portal - is left
  out, the same rule that already applied to the vanilla nether and end. A sibling
  folder missing either its own `level.dat` or real region data is not reported.
- **A world with an unreadable folder is never silently treated as having no
  dimensions**: it falls back to the three vanilla dimensions and says so, rather than
  claiming a clean read that never happened.

## Verification

```sh
cd design && npx vitest run packages/app/src/main/world/inspect.test.ts        # every layout, read-only, on a real filesystem
cd design && npx vitest run packages/ui/src/components/world/worldFolder.test.ts   # dimensionsIn merging siblings, custom dimensions
cd design && npx vitest run packages/ui/src/components/world/wizardModel.test.ts   # extra maps built and requested correctly
cd design && npx vitest run packages/ui/src/components/world/DimensionSelection.test.ts  # the list itself: search, bulk actions, states
```

`inspect.test.ts` builds real single-player, custom-dimension and Spigot/Paper-style
fixture trees under a temporary directory for every case, including one proving the
sibling probe never fires for a folder that is not itself a world, and one proving
nothing on disk changes across a full inspection.

## Related

- [Finding worlds](./finding-worlds.md) - the step before this one: choosing which world
  folder to inspect in the first place.
- [The regex builder and the search bars it reaches](./regex-builder.md) - the builder
  this list's search bar uses.
- [Bedrock Edition worlds](./bedrock-worlds.md) - what a Bedrock world reports instead,
  and converting one to a Java world this feature can then read.
- [1.12.2 worlds](./legacy-1-12-worlds.md) - a world old enough to predate the modern
  `dimensions/` folder still gets the vanilla three from its `DIM-1`/`DIM1` folders.
