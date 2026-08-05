# Glossary

The words this application uses for its own concepts, in one place, defined against what the
code actually does rather than against what the term means in general. Several of these are
BlueMap's own vocabulary (map, tile, storage); a few are this desktop app's own invention on
top of BlueMap (project, profile); one or two mean something narrower here than they might
suggest (world, engine). Every entry below was checked against the schema or the code it
describes before being written, and each cites where.

Every `GlossaryTerm` info button in the application links to this article at the matching
heading below, so "Read more in the glossary" always lands on the exact term rather than the
top of this page.

## Map

A map is one dimension of one world, rendered with its own settings - the thing BlueMap
actually renders and serves. A world can have several maps, one per dimension, and nothing
stops two maps pointing at the same dimension with different settings. A map is defined by a
`maps/<id>.conf` file (`packages/config/src/schema/map.ts`), and it is what a
[storage](#storage) holds [tiles](#tile) for.

## World

A world is the Minecraft save folder BlueMap reads from - the one holding `level.dat` and a
region folder. A world is never rendered directly; a [map](#map), pointed at one of its
[dimensions](#dimension), is. See [Finding worlds](./finding-worlds.md) for how the app locates
world folders already on this computer.

## Storage

Storage is where a map's rendered [tiles](#tile) are written: to files on disk (`file`
storage), or into a SQL database (`sql` storage, over JDBC). Every map names one storage, by
id, in a `storages/<id>.conf` file. File storage also has a "write tiles atomically" setting -
when it is on, a tile is written to a temporary file and moved into place, so a reader never
sees a half-written tile; turning it off skips that extra rename at the cost of an occasional
partial read (`packages/config/src/schema/storage.ts`).

## Render

Rendering is the process that reads a world's chunks and writes the [tiles](#tile) a viewer
displays. It can run on this computer, in a container, on a remote machine over SSH, or on
GitHub's own runners - see [Running the engine on this computer, or in a container](./docker-and-local.md)
and [Rendering a world in GitHub Actions](./render-in-actions.md) for the four routes in full.

## Tile

A tile is one square piece of a rendered map. **Hires** tiles are the close-up ones, carrying
full 3D detail - disabling them speeds up rendering and shrinks the map, but zooming in loses
the 3D models. **Lowres** tiles are flattened, zoomed-out ones used from a distance, built at
several **levels of detail** (how many, and how much coarser each level is than the last) so
far-away parts of the map load quickly. Hires tiles are sized in blocks (32 by default); lowres
tiles are sized in pixels (500 by default) (`packages/config/src/schema/map.ts`, the
`enable-hires`, `hires-tile-size`, `lowres-tile-size`, `lod-count` and `lod-factor` fields).

## Map ID

The map id is the short identifier a map is stored and referred to by - in file paths and the
viewer's own URL - distinct from its display name. The [wizard](./finding-worlds.md) suggests
one automatically from the display name, but it can be typed by hand.

## Project

A project is a JSON file this app writes at the root of a Minecraft world folder, holding every
[map](#map), [storage](#storage) and setting that world renders with. It is this app's own
invention, not something BlueMap itself reads - open one from the Projects tab to change
anything before a render runs, or render it again exactly as it was.

## Config Folder

A config folder holds BlueMap's own `.conf` files - `core.conf`, `maps/<id>.conf`,
`storages/<id>.conf`, `webapp.conf`, `webserver.conf` and `plugin.conf` - the files BlueMap's
own engine reads directly, independent of any [project](#project) file this app writes. It is
reached through the "Server configuration" button rather than through the Projects tab, and the
two are not the same thing: a project is this app's own record of what to render; a config
folder is BlueMap's native format, the kind you would hand to a Minecraft server plugin or a
`bluemap-cli.jar` invocation with no knowledge of this app at all.

## Marker

A marker is a labelled point or shape drawn on the rendered map - a waypoint, a warning, a
region outline. Markers are grouped into **marker sets**, which can be shown or hidden together
in the viewer and are toggled as a group, labelled and sorted as one unit
(`packages/config/src/schema/map.ts`'s `marker-sets` field).

## Dimension

A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End. A
world can hold more than one, and each gets its own [map](#map)
(`packages/config/src/schema/common.ts`'s `DIMENSION_OPTIONS`).

## Server Plugin

Server plugin settings (`plugin.conf`) apply only when BlueMap runs inside a Minecraft server
process, as a server platform mod. This desktop app never runs that way - it always drives
BlueMap's standalone engine - so the Server Plugin tab changes nothing for a render started
here. It exists because the same [config folder](#config-folder) can later be copied onto a
real Minecraft server, where a platform adapter does read it
(`packages/config/src/schema/plugin.ts`).

## Render Threads

Render threads are how many CPU threads render tiles at once (`render-thread-count`, default
1). Render thread priority (`render-thread-priority`, 1 to 10, default 5) sets how much CPU
time they get relative to everything else running on the machine. Both live in `core.conf`
(`packages/config/src/schema/core.ts`).

## Reaches This Render

"Reaches this render" is the wizard's own phrase for a setting the local engine actually reads
for a single render, right now. Only six settings do: **world**, **dimension**, **name**, sort
order, starting position and storage. Every other setting the wizard collects is written into
the map's config file for a future render to pick up, but does not affect the render that runs
immediately after the wizard (`packages/ui/src/components/world/wizardSteps.ts`'s
`REQUEST_BACKED_PATHS`).

## Engine

The engine is the program that walks a world and writes tiles. Locally, that is BlueMap's own
Java engine; a Java runtime is downloaded automatically into this app's own, git-ignored folder
the first time it is needed, so nothing has to be installed by hand. A from-scratch TypeScript
mesher is a separate, in-progress effort and not what runs today.

## Profile

A profile is this app's own name for one entry in "Maps and servers": either a map already
rendered on this computer, or the address of someone else's BlueMap web server (a
[BlueMap URL](#bluemap-url)). A locally rendered map is added to the list automatically once
its render finishes; a remote one is added by hand.

## BlueMap URL

A BlueMap URL is the web address of a BlueMap web server already running somewhere else -
someone else's computer, not this one - used to view its live map remotely. Nothing is rendered
here for it; adding one only tells the viewer where to look.

## Render Mask

A render mask limits which blocks of a world actually get rendered, by a list of shapes: a
**box** (an axis-aligned cuboid, given as a minimum and maximum on each axis - the default
shape) or a **circle** (on the X/Z plane, with an optional Y range). Each shape is additive or
subtractive, and BlueMap treats every block outside the combined mask as air
(`packages/config/src/schema/mask.ts`, `packages/config/src/schema/map.ts`'s `render-mask`
field). It replaces an older, flat `min-x`/`max-x`/`min-z`/`max-z`/`min-y`/`max-y` bounding box,
which BlueMap now refuses to start with.

## Config Files

The files a [config folder](#config-folder) can hold: `core.conf` (folders, render threads,
update timing, the debug log and the anonymous [metrics](#metrics) switch), `webapp.conf` (what
a visitor sees and where the web app is generated), `webserver.conf` (the built-in server's
port, bind address and access log), `plugin.conf` (see [Server Plugin](#server-plugin)), one
`storages/<id>.conf` per [storage](#storage), and one `maps/<id>.conf` per [map](#map).

## Compression

The compression BlueMap applies to the [tiles](#tile) it writes into a
[storage](#storage): `gzip`, `zstd`, `deflate`, or none. Every tile file carries the
compression it was written with in its name, so tiles written under one setting are not found
under another (`packages/config/src/schema/storage.ts`).

## SQL Storage (JDBC)

A SQL [storage](#storage) connects over a **JDBC connection URL** (for example
`jdbc:mysql://localhost:3306/bluemap`), an optional **SQL dialect** (which set of SQL
statements BlueMap uses - left unset, BlueMap picks the dialect matching the URL's own prefix
and refuses to start if none matches), and an optional **driver jar** plus **driver class** for
a database whose driver BlueMap does not bundle (`packages/config/src/schema/storage.ts`).

## GitHub Runners And Actions

[Rendering a world in GitHub Actions](./render-in-actions.md) hands the whole [render](#render)
to GitHub's own free build machines (its **runners**), inside a GitHub **Actions workflow**
made of one or more **jobs**. A large world can be split across several jobs at once (a
**matrix**, **sharding** the world by region) and merged back into one map afterwards. Useful
when the computer running this app cannot render the world itself.

## GitHub Pages And Publishing

[Publishing a rendered map to GitHub Pages](./pages-hosting.md) uploads a finished render to a
GitHub repository and turns on GitHub's own static-site hosting (**GitHub Pages**) for it, so
the map is reachable at a public URL with no server of your own to run.

## Atomic Write

See [Storage](#storage) - "write tiles atomically" is a per-file-storage setting, not a
separate concept.

## Viewer Camera Modes

The rendered map's viewer offers up to three camera modes, each independently switchable per
map: **free-flight** view (fly anywhere), **perspective** view (a first- or third-person
walkthrough), and **flat** view (an isometric, top-down view - the cheapest to render, since
disabling the other two while keeping only flat view speeds up rendering and shrinks the map)
(`packages/config/src/schema/map.ts`'s `enable-free-flight-view`, `enable-perspective-view` and
`enable-flat-view` fields).

## Webserver Bind Address And Access Log

The built-in web server's **listen address** (`ip` in `webserver.conf`) is which network
interface it binds to - `0.0.0.0` (the default) or an empty value binds every interface, making
it reachable from anywhere that can route to the machine. Its **access log** records every
request, in a configurable file and format, and is off (no logging) by default
(`packages/config/src/schema/webserver.ts`).

## Metrics

BlueMap's own anonymous usage report: a basic implementation-and-version line, sent to the
BlueMap project if the "send anonymous usage metrics" switch in `core.conf` is left on (the
default) (`packages/config/src/schema/core.ts`).

## Mojang EULA And Download Consent

Covered in full in [The Minecraft licence and the consent that refers to it](./eula-and-consent.md)
- the one part of this app's vocabulary that already had a dedicated, well-explained article
before this glossary existed.
