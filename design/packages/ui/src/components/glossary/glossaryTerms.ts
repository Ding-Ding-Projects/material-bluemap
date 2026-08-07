/**
 * The vocabulary `GlossaryTerm.vue` explains in place, and `docs/glossary.md` explains in
 * full.
 *
 * Each entry is deliberately short - one or two sentences, matched to what actually shows in
 * the popover - because the full explanation belongs in the glossary article, not repeated
 * here. Every fact stated below was checked against the schema or the code it describes
 * before being written; see the file comment on each schema module referenced in the doc
 * comments for the source. `anchor` has to match the id `renderMarkdown`'s heading-slugger
 * (`@worldlens/viewer`'s `slugifyHeading`) would give the matching `## Heading` in
 * `docs/glossary.md` - `glossaryTerms.consistency.test.ts` proves that against the real file
 * rather than trusting this comment.
 */

export type GlossaryTermId =
    | "map"
    | "world"
    | "storage"
    | "render"
    | "tile"
    | "mapId"
    | "project"
    | "configFolder"
    | "marker"
    | "dimension"
    | "serverPlugin"
    | "renderThread"
    | "reaches"
    | "engine"
    | "profile"
    | "blueMapUrl";

export interface GlossaryTermMeta {
    readonly id: GlossaryTermId;
    /** The plain word or phrase shown next to the affordance. */
    readonly label: string;
    /** The catalogue key for this term's one-or-two sentence definition. */
    readonly key: string;
    /** The English fallback vue-i18n renders when the catalogue has not resolved a value. */
    readonly fallback: string;
    /** The heading id inside the bundled `glossary` article this term's "tell me more" opens. */
    readonly anchor: string;
}

export const GLOSSARY_TERMS: Readonly<Record<GlossaryTermId, GlossaryTermMeta>> = {
    map: {
        id: "map",
        label: "map",
        key: "glossary.term.map",
        fallback:
            "A map is one dimension of one world, rendered with its own settings - the thing BlueMap actually renders and serves. A world can have several maps, one per dimension.",
        anchor: "map",
    },
    world: {
        id: "world",
        label: "world",
        key: "glossary.term.world",
        fallback:
            "A world is the Minecraft save folder BlueMap reads from - the one holding level.dat and a region folder. A world is never rendered directly; a map, pointed at one of its dimensions, is.",
        anchor: "world",
    },
    storage: {
        id: "storage",
        label: "storage",
        key: "glossary.term.storage",
        fallback:
            "Storage is where a map's rendered tiles are written: to files on disk, or into a SQL database. Every map names one storage, by id.",
        anchor: "storage",
    },
    render: {
        id: "render",
        label: "render",
        key: "glossary.term.render",
        fallback:
            "Rendering is the process that reads a world's chunks and writes the tiles a viewer displays. It can run on this computer, in a container, on a remote machine over SSH, or on GitHub's own runners.",
        anchor: "render",
    },
    tile: {
        id: "tile",
        label: "tile",
        key: "glossary.term.tile",
        fallback:
            "A tile is one square piece of a rendered map. Hires tiles are the close-up ones with full 3D detail; lowres tiles are flattened, zoomed-out ones used from a distance.",
        anchor: "tile",
    },
    mapId: {
        id: "mapId",
        label: "map id",
        key: "glossary.term.mapId",
        fallback:
            "The map id is the short identifier a map is stored and referred to by - in file paths and the viewer's own URL - distinct from its display name.",
        anchor: "map-id",
    },
    project: {
        id: "project",
        label: "project",
        key: "glossary.term.project",
        fallback:
            "A project is a JSON file this app writes at the root of a Minecraft world folder, holding every map, storage and setting that world renders with.",
        anchor: "project",
    },
    configFolder: {
        id: "configFolder",
        label: "config folder",
        key: "glossary.term.configFolder",
        fallback:
            "A config folder holds BlueMap's own .conf files - core, maps, storages, webapp, webserver and plugin - the files BlueMap's own engine reads directly, independent of any project file this app writes.",
        anchor: "config-folder",
    },
    marker: {
        id: "marker",
        label: "marker",
        key: "glossary.term.marker",
        fallback:
            "A marker is a labelled point or shape drawn on the rendered map. Markers are grouped into marker sets, which can be shown or hidden together.",
        anchor: "marker",
    },
    dimension: {
        id: "dimension",
        label: "dimension",
        key: "glossary.term.dimension",
        fallback:
            "A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End. A world can hold more than one, and each gets its own map.",
        anchor: "dimension",
    },
    serverPlugin: {
        id: "serverPlugin",
        label: "server plugin",
        key: "glossary.term.serverPlugin",
        fallback:
            "Server plugin settings apply only when BlueMap runs inside a Minecraft server process. This desktop app never runs that way, so this tab changes nothing here - it exists for a config folder later copied onto a server.",
        anchor: "server-plugin",
    },
    renderThread: {
        id: "renderThread",
        label: "render threads",
        key: "glossary.term.renderThread",
        fallback:
            "Render threads are how many CPU threads render tiles at once. Render thread priority sets how much CPU time they get relative to everything else running on the machine.",
        anchor: "render-threads",
    },
    reaches: {
        id: "reaches",
        label: "reaches this render",
        key: "glossary.term.reaches",
        fallback:
            "\"Reaches this render\" means the local engine actually reads that setting right now - only the world, dimension, name, sort order, starting position and storage do. Everything else is written into the map config file for a future render.",
        anchor: "reaches-this-render",
    },
    engine: {
        id: "engine",
        label: "engine",
        key: "glossary.term.engine",
        fallback:
            "The engine is the program that walks a world and writes tiles. Locally that is BlueMap's own Java engine; a Java runtime is downloaded automatically into this app's own folder the first time it is needed.",
        anchor: "engine",
    },
    profile: {
        id: "profile",
        label: "profile",
        key: "glossary.term.profile",
        fallback:
            "A profile is this app's own name for one entry in \"Maps and servers\": either a map already rendered on this computer, or the address of someone else's BlueMap web server.",
        anchor: "profile",
    },
    blueMapUrl: {
        id: "blueMapUrl",
        label: "BlueMap URL",
        key: "glossary.term.blueMapUrl",
        fallback:
            "A BlueMap URL is the web address of a BlueMap web server already running somewhere else, used to view its live map remotely. Nothing is rendered here for it.",
        anchor: "bluemap-url",
    },
} as const;
