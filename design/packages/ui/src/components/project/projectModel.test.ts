/**
 * The project's rules, proved without a disk, a bridge or a DOM.
 *
 * Every claim here is one the components rely on and none of them can check for themselves.
 * Three are worth pointing at, because each one is a real failure that would otherwise only
 * show up in somebody's world folder:
 *
 *  - the id preview is what the field shows *while* a name is being typed, and it has to be
 *    exactly what the id becomes. A preview that is nearly right is worse than none;
 *  - a map's named fields and its `maps/<id>.conf` body have to agree. They are two records
 *    of the same four facts, and the config is the one that reaches the engine;
 *  - a render request built from a project is what makes a second render repeat the first.
 *    If it drops a setting, the repeat is a different render that looks like the same one.
 */

import { describe, expect, it } from "vitest";
import { parseProjectFile, serializeProjectFile, type ProjectFile } from "@material-bluemap/config";
import { fieldValue, isExplicit, openConfigFile } from "../config/configModel.js";
import {
    PROJECT_PRESETS,
    applyPreset,
    createProject,
    exportProjects,
    findMap,
    findPreset,
    findStorage,
    isRenderFieldDefault,
    mapDescriptor,
    mapIdProblem,
    mapIds,
    openMapFile,
    openSingletonFile,
    orderedMaps,
    presetApplicationLines,
    previewMapId,
    projectDetailLine,
    projectFromWizard,
    projectSearchText,
    projectToRenderRequest,
    renderProblems,
    sortProjects,
    storageCarriesCredentials,
    storageIds,
    storageIdProblem,
    storageTypeOf,
    syncMapConfig,
    touch,
    withMapAdded,
    withMapConfig,
    withMapEnabled,
    withMapFieldSet,
    withMapIdentity,
    withMapMoved,
    withMapRemoved,
    withName,
    withRender,
    withRenderFieldDefault,
    withSingleton,
    withSingletonFieldSet,
    withStorageAdded,
    withStorageRemoved,
    withStorageType,
    worldLeaf,
    type ProjectRow,
} from "./projectModel.js";

/** A fixed stamp, so nothing here depends on the clock or on the dice. */
const STAMP = { now: "2026-08-04T09:00:00+01:00", id: "p-test-1", appVersion: "0.1.0" };

const WORLD = "C:/saves/Survival";

function seeded(): ProjectFile {
    return withMapAdded(createProject("Survival", STAMP), {
        id: "overworld",
        name: "Overworld",
        dimension: "minecraft:overworld",
        world: WORLD,
    });
}

/** Reads one setting back out of a map's config text, which is what the engine sees. */
function settingIn(project: ProjectFile, mapId: string, path: string): unknown {
    const map = findMap(project, mapId);
    if (map === undefined) throw new Error(`no map ${mapId}`);
    const file = openMapFile(map);
    const field = file.descriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) throw new Error(`no field ${path}`);
    return fieldValue(file, field);
}

/* -------------------------------------------------------------------------- */

describe("the map id preview", () => {
    it("shows what a name becomes, while it is being typed", () => {
        expect(previewMapId("Overworld")).toBe("overworld");
        expect(previewMapId("My World!")).toBe("my-world-");
        expect(previewMapId("  The Nether  ")).toBe("the-nether");
    });

    it("collapses a run of unusable characters into one hyphen rather than one each", () => {
        // `new--world` reads as a mistake the app made. It is also what the wizard's own
        // `suggestMapId` does, and the two must not disagree about what a name turns into.
        expect(previewMapId("New   World")).toBe("new-world");
        expect(previewMapId("a...b")).toBe("a-b");
    });

    it("keeps what it already accepts, including underscores and digits", () => {
        expect(previewMapId("world_2")).toBe("world_2");
        expect(previewMapId("map-1")).toBe("map-1");
    });

    it("does not tidy the ends, because the preview is the truth", () => {
        // `suggestMapId` strips these, which is right when it is silently proposing an id.
        // Here the field is showing the person what they are about to get, so a trailing
        // hyphen is shown and then refused by name rather than quietly removed.
        expect(previewMapId("!start")).toBe("-start");
        expect(mapIdProblem(previewMapId("!start"))?.key).toBe("project.map.badId");
    });

    it("never produces an id longer than the engine accepts", () => {
        expect(previewMapId("x".repeat(200))).toHaveLength(64);
    });
});

describe("what makes an id unusable", () => {
    it("refuses an empty one", () => {
        expect(mapIdProblem("")?.key).toBe("project.map.needId");
    });

    it("refuses one the render engine would refuse, rather than one the file format would", () => {
        // The project schema accepts `-nether`; the engine does not, and an id that saves
        // and then fails at render time is the worst place to find out.
        expect(mapIdProblem("-nether")?.key).toBe("project.map.badId");
        expect(mapIdProblem("nether")).toBeNull();
    });

    it("refuses one already in the project, because two maps would share a folder", () => {
        const project = seeded();
        expect(mapIdProblem("overworld", mapIds(project))?.key).toBe("project.map.idTaken");
        // The map being renamed does not count as taking its own id.
        expect(mapIdProblem("overworld", mapIds(project, "overworld"))).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */

describe("adding a map", () => {
    it("writes it from BlueMap's own template, so every setting arrives explained", () => {
        const project = seeded();
        const map = findMap(project, "overworld");

        expect(map?.config).toContain("world:");
        expect(map?.config.length).toBeGreaterThan(500);
        expect(settingIn(project, "overworld", "name")).toBe("Overworld");
    });

    it("uses the preset that belongs to the dimension, not the overworld's", () => {
        const project = withMapAdded(seeded(), {
            id: "nether",
            name: "The Nether",
            dimension: "minecraft:the_nether",
            world: WORLD,
        });

        // The three presets differ in more than the dimension key: a nether map lit like an
        // overworld is the failure this is guarding.
        expect(settingIn(project, "nether", "ambient-light")).toBe(0.6);
        expect(findMap(project, "nether")?.sorting).toBe(100);
    });

    it("refuses to add a second map under an id that is already there", () => {
        const project = seeded();
        const again = withMapAdded(project, {
            id: "overworld",
            name: "Another",
            dimension: "minecraft:overworld",
            world: WORLD,
        });
        expect(again.maps).toHaveLength(1);
    });
});

describe("a map's identity and its config file", () => {
    it("writes a rename into the config text as well as into the record", () => {
        const project = withMapIdentity(seeded(), "overworld", { name: "The Surface" });

        expect(findMap(project, "overworld")?.name).toBe("The Surface");
        // The half that matters: the config is what reaches the engine, so a record that
        // said one thing while the file said another would render under the old name.
        expect(settingIn(project, "overworld", "name")).toBe("The Surface");
    });

    it("writes the dimension, the sorting and the storage the same way", () => {
        const project = withMapIdentity(seeded(), "overworld", {
            dimension: "minecraft:the_end",
            sorting: 42,
            storage: "archive",
        });

        expect(settingIn(project, "overworld", "dimension")).toBe("minecraft:the_end");
        expect(settingIn(project, "overworld", "sorting")).toBe(42);
        expect(settingIn(project, "overworld", "storage")).toBe("archive");
    });

    it("changes the id, which is the folder the tiles land in", () => {
        const project = withMapIdentity(seeded(), "overworld", { id: "surface" });

        expect(findMap(project, "surface")).toBeDefined();
        expect(findMap(project, "overworld")).toBeUndefined();
        expect(openMapFile(findMap(project, "surface")!).path).toBe("maps/surface.conf");
    });

    it("refuses a rename onto an id another map already has", () => {
        const two = withMapAdded(seeded(), {
            id: "nether",
            name: "The Nether",
            dimension: "minecraft:the_nether",
            world: WORLD,
        });
        const attempted = withMapIdentity(two, "nether", { id: "overworld" });

        expect(attempted.maps.map((map) => map.id).sort()).toEqual(["nether", "overworld"]);
    });

    it("leaves a config that does not parse exactly as it was", () => {
        const broken = withMapConfig(seeded(), "overworld", "this { is not ] hocon");
        const renamed = withMapIdentity(broken, "overworld", { name: "Anything" });

        // There is no document to edit, and inventing one would throw away whatever the
        // person has in the file. The record changes; the text is untouched.
        expect(findMap(renamed, "overworld")?.config).toBe("this { is not ] hocon");
        expect(findMap(renamed, "overworld")?.name).toBe("Anything");
    });

    it("leaves a custom dimension type alone when the dimension changes", () => {
        const project = seeded();
        const map = findMap(project, "overworld")!;
        const custom = { ...map, config: `${map.config}\ndimension-type: "mypack:skylands"\n` };
        const withCustom = { ...project, maps: [custom] };

        const moved = withMapIdentity(withCustom, "overworld", { dimension: "minecraft:the_end" });

        expect(settingIn(moved, "overworld", "dimension")).toBe("minecraft:the_end");
        expect(settingIn(moved, "overworld", "dimension-type")).toBe("mypack:skylands");
    });
});

describe("the order maps are listed in", () => {
    function three(): ProjectFile {
        let project = seeded();
        project = withMapAdded(project, { id: "nether", name: "N", dimension: "minecraft:the_nether", world: WORLD });
        project = withMapAdded(project, { id: "end", name: "E", dimension: "minecraft:the_end", world: WORLD });
        return project;
    }

    it("sorts by sorting, then by id, so it is stable between visits", () => {
        expect(orderedMaps(three()).map((map) => map.id)).toEqual(["overworld", "nether", "end"]);
    });

    it("swaps the two neighbours' numbers rather than renumbering the list", () => {
        // Upstream's presets are 0, 100 and 200 with deliberate room between them, and a
        // reorder that flattened those to 0, 1, 2 would destroy gaps somebody left on
        // purpose for maps they have not added yet.
        const moved = withMapMoved(three(), "end", -1);

        expect(orderedMaps(moved).map((map) => map.id)).toEqual(["overworld", "end", "nether"]);
        expect(findMap(moved, "end")?.sorting).toBe(100);
        expect(findMap(moved, "nether")?.sorting).toBe(200);
    });

    it("writes the new sorting into the config text too", () => {
        const moved = withMapMoved(three(), "end", -1);
        expect(settingIn(moved, "end", "sorting")).toBe(100);
    });

    it("separates two maps that share a sorting number, so the move is not a no-op", () => {
        let project = seeded();
        project = withMapAdded(project, {
            id: "alt",
            name: "Alt",
            dimension: "minecraft:overworld",
            sorting: 0,
            world: WORLD,
        });
        expect(orderedMaps(project).map((map) => map.id)).toEqual(["alt", "overworld"]);

        const moved = withMapMoved(project, "overworld", -1);
        expect(orderedMaps(moved).map((map) => map.id)).toEqual(["overworld", "alt"]);
    });

    it("does nothing at the ends", () => {
        const project = three();
        expect(withMapMoved(project, "overworld", -1)).toEqual(project);
        expect(withMapMoved(project, "end", 1)).toEqual(project);
    });
});

describe("removing a map", () => {
    it("takes it out and leaves the others alone", () => {
        const two = withMapAdded(seeded(), { id: "nether", name: "N", dimension: "minecraft:the_nether", world: WORLD });
        const left = withMapRemoved(two, "nether");

        expect(left.maps.map((map) => map.id)).toEqual(["overworld"]);
    });
});

/* -------------------------------------------------------------------------- */

describe("storages", () => {
    it("always offers `file`, because a map has to be able to name something", () => {
        expect(storageIds(seeded())).toEqual(["file"]);
    });

    it("adds one from upstream's template and reads its type back", () => {
        const project = withStorageAdded(seeded(), "archive", "storage-type: file\nroot: \"/tmp/tiles\"\n");
        expect(storageIds(project)).toEqual(["file", "archive"]);
        expect(storageTypeOf(project.storages[0]!)).toBe("file");
    });

    it("rewrites the file when the type changes, rather than leaving the other type's keys", () => {
        let project = withStorageAdded(seeded(), "archive", "storage-type: file\nroot: \"/tmp/tiles\"\n");
        project = withStorageType(project, "archive", "sql", "/tmp/tiles");

        expect(storageTypeOf(project.storages[0]!)).toBe("sql");
        expect(project.storages[0]?.config).not.toContain("root:");
    });

    it("refuses nothing by itself but reports a credentialled body, which the file format bans", () => {
        // A project file travels inside a world folder that people zip up and send to each
        // other, and this block is where a database user name and password live.
        expect(storageCarriesCredentials("storage-type: sql\nconnection-properties: {\n user: me\n}\n")).toBe(true);
        expect(storageCarriesCredentials("storage-type: file\nroot: \"/tiles\"\n")).toBe(false);
    });

    it("names the maps that would be left pointing at nothing", () => {
        let project = withStorageAdded(seeded(), "archive", "storage-type: file\n");
        project = withMapIdentity(project, "overworld", { storage: "archive" });
        const gone = withStorageRemoved(project, "archive");

        expect(gone.storages).toHaveLength(0);
        // The map is deliberately left naming it: silently repointing somebody's maps would
        // be this code deciding where several gigabytes of tiles should go.
        expect(findMap(gone, "overworld")?.storage).toBe("archive");
    });

    it("refuses a storage name BlueMap could not use as a file name", () => {
        expect(storageIdProblem("")?.key).toBe("project.storage.needId");
        expect(storageIdProblem("my storage")?.key).toBe("project.storage.badId");
        expect(storageIdProblem("archive", ["archive"])?.key).toBe("project.storage.idTaken");
        expect(storageIdProblem("archive")).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */

describe("the four whole-file settings", () => {
    it("start absent, which means BlueMap's own defaults apply", () => {
        const project = seeded();
        expect(project.core).toBeNull();
        expect(openSingletonFile(project, "core").text).toBe("");
    });

    it("store an emptied body as absent again rather than as an empty file", () => {
        // Null is "this project never touched it"; an empty file is "this project wants a
        // file with nothing in it". Only the first is ever what clearing the form meant.
        const project = withSingleton(withSingleton(seeded(), "core", "accept-download: true\n"), "core", "   ");
        expect(project.core).toBeNull();
    });

    it("open against the descriptor for the file they are", () => {
        expect(openSingletonFile(seeded(), "webserver").path).toBe("webserver.conf");
        expect(openSingletonFile(seeded(), "webapp").descriptor.id).toBe("webapp");
    });
});

/* -------------------------------------------------------------------------- */

describe("rendering a project", () => {
    it("carries every map's whole config, not the handful of named fields", () => {
        // A request narrowed to the five settings with a field on it is a settings screen
        // that says it applied ninety-two settings and applies six.
        const request = projectToRenderRequest(seeded(), WORLD);

        expect(request.maps).toHaveLength(1);
        expect(request.maps[0]?.config).toContain("sky-color");
        expect(request.maps[0]?.world).toBe(WORLD);
    });

    it("leaves out the maps that are switched off, which is what the switch means", () => {
        let project = withMapAdded(seeded(), { id: "nether", name: "N", dimension: "minecraft:the_nether", world: WORLD });
        project = withMapEnabled(project, "nether", false);

        expect(projectToRenderRequest(project, WORLD).maps.map((map) => map.id)).toEqual(["overworld"]);
    });

    it("takes the world from where the file was found rather than from the file", () => {
        // The project has no world path in it on purpose: storing one would create a second
        // source of truth that goes wrong the moment somebody moves or copies the folder.
        expect(projectToRenderRequest(seeded(), "D:/elsewhere/Survival").maps[0]?.world).toBe("D:/elsewhere/Survival");
    });

    it("applies the project's own run settings, so a second render repeats the first", () => {
        const project = withRender(seeded(), { force: true, fixEdges: true, metrics: true, threads: 3 });
        const request = projectToRenderRequest(project, WORLD);

        expect(request.force).toBe(true);
        expect(request.fixEdges).toBe(true);
        expect(request.metrics).toBe(true);
        expect(request.renderThreads).toBe(3);
    });

    it("leaves the thread count off entirely when nobody chose one", () => {
        // Null means "let BlueMap decide", which is not the same as asking for one thread.
        expect("renderThreads" in projectToRenderRequest(seeded(), WORLD)).toBe(false);
    });

    it("says why it cannot run rather than starting something that would draw nothing", () => {
        expect(renderProblems(createProject("Empty", STAMP))[0]?.key).toBe("project.render.noMaps");
        expect(renderProblems(withMapEnabled(seeded(), "overworld", false))[0]?.key).toBe("project.render.noneEnabled");
        expect(renderProblems(seeded())).toEqual([]);
    });

    it("refuses a project whose storage carries a credential", () => {
        const project = withStorageAdded(seeded(), "db", "storage-type: sql\nconnection-properties: {\n user: me\n}\n");
        expect(renderProblems(project).map((problem) => problem.key)).toContain("project.render.credentialled");
    });
});

/* -------------------------------------------------------------------------- */

describe("what the guide writes", () => {
    const answers = {
        world: "C:/saves/Survival",
        mapId: "overworld",
        mapName: "Overworld",
        dimension: "minecraft:overworld",
        sorting: 0,
        config: "name: \"Overworld\"\n",
        outputFolder: "C:/renders",
        force: true,
        threads: 2,
    };

    it("produces a project that is reopenable and complete", () => {
        const project = projectFromWizard(answers, STAMP);

        expect(project.maps).toHaveLength(1);
        expect(project.maps[0]?.config).toBe("name: \"Overworld\"\n");
        expect(project.render.outputFolder).toBe("C:/renders");
        expect(project.render.force).toBe(true);
        expect(project.render.threads).toBe(2);
    });

    it("names it after the world rather than after the one map", () => {
        // A project holds however many maps somebody adds later, so a project called
        // `overworld` that also renders the nether has a misleading name from day two.
        expect(projectFromWizard(answers, STAMP).name).toBe("Survival");
        expect(worldLeaf("C:\\saves\\Survival\\")).toBe("Survival");
    });

    it("records honestly that the guide wrote it and nobody has edited it", () => {
        expect(projectFromWizard(answers, STAMP).fromWizard).toBe(true);
    });

    it("stops claiming that the moment anything is saved", () => {
        const edited = touch(projectFromWizard(answers, STAMP), { now: "2026-08-05T10:00:00+01:00" });

        expect(edited.fromWizard).toBe(false);
        expect(edited.updatedAt).toBe("2026-08-05T10:00:00+01:00");
    });

    it("round-trips through the file format it will be written in", () => {
        const project = projectFromWizard(answers, STAMP);
        const read = parseProjectFile(serializeProjectFile(project));

        expect(read.ok).toBe(true);
        if (read.ok) expect(read.project).toEqual(project);
    });
});

describe("renaming the project itself", () => {
    it("keeps the old name rather than accepting an empty one", () => {
        expect(withName(seeded(), "   ").name).toBe("Survival");
        expect(withName(seeded(), " Home ").name).toBe("Home");
    });
});

/* -------------------------------------------------------------------------- */

const ROWS: ProjectRow[] = [
    {
        world: "C:/saves/Survival",
        file: "C:/saves/Survival/material-bluemap.project.json",
        id: "p1",
        name: "Survival",
        maps: 3,
        createdAt: "2026-07-01T10:00:00+01:00",
        updatedAt: "2026-08-01T10:00:00+01:00",
        fromWizard: false,
        worldName: "Survival World",
        problem: null,
    },
    {
        world: "C:/saves/Creative",
        file: "C:/saves/Creative/material-bluemap.project.json",
        id: "p2",
        name: "Creative",
        maps: 1,
        createdAt: "2026-07-02T10:00:00+01:00",
        updatedAt: "2026-08-03T10:00:00+01:00",
        fromWizard: true,
        worldName: null,
        problem: null,
    },
    {
        world: "C:/saves/Broken",
        file: "C:/saves/Broken/material-bluemap.project.json",
        id: "p3",
        name: "Broken",
        maps: 0,
        createdAt: "nonsense",
        updatedAt: "nonsense",
        fromWizard: false,
        worldName: null,
        problem: "its version is from the future",
    },
];

/** The two-overload translate every describing helper takes, with no messages loaded. */
function t(_key: string, second: unknown, third?: unknown): string {
    const fallback = typeof second === "string" ? second : String(third ?? "");
    const vars = typeof second === "string" ? {} : (second as Record<string, unknown>);
    let filled = fallback;
    for (const [name, value] of Object.entries(vars)) filled = filled.split(`{${name}}`).join(String(value));
    return filled;
}

describe("the list of them", () => {
    it("puts the most recently edited first", () => {
        expect(sortProjects(ROWS).map((row) => row.id)).toEqual(["p2", "p1", "p3"]);
    });

    it("sends a row whose date cannot be read to the end rather than to the top", () => {
        // An unparseable date is not "just now", and floating a broken row to the top would
        // be the list asserting something it does not know.
        expect(sortProjects(ROWS).at(-1)?.id).toBe("p3");
    });

    it("says the world, the map count and when it was edited", () => {
        const line = projectDetailLine(ROWS[0]!, t);
        expect(line).toContain("world Survival World");
        expect(line).toContain("3 maps");
        expect(line).toContain("last edited");
    });

    it("falls back to the folder when the world has no name of its own", () => {
        expect(projectDetailLine(ROWS[1]!, t)).toContain("world Creative");
    });

    it("says out loud when the guide made it and nobody has opened it", () => {
        expect(projectDetailLine(ROWS[1]!, t)).toContain("made by the guide");
        expect(projectDetailLine(ROWS[0]!, t)).not.toContain("made by the guide");
    });

    it("keeps a row that could not be read, with the reason on it", () => {
        // A row that silently vanishes from a list somebody knows it belongs in is the
        // worst answer available: they conclude the app lost their settings.
        expect(projectDetailLine(ROWS[2]!, t)).toContain("its version is from the future");
    });

    it("searches everything the row shows, including the path", () => {
        const text = projectSearchText(ROWS[0]!, t);
        expect(text).toContain("C:/saves/Survival");
        expect(text).toContain("material-bluemap.project.json");
        expect(text).toContain("3 maps");
    });
});

describe("taking the list away with you", () => {
    it("writes JSON that carries every field and ends with a newline", () => {
        const text = exportProjects(ROWS, "json");
        expect(text.endsWith("\n")).toBe(true);
        const parsed = JSON.parse(text) as { projects: ProjectRow[] };
        expect(parsed.projects[0]?.file).toBe(ROWS[0]?.file);
    });

    it("writes CSV with the same columns rather than a chosen few", () => {
        const text = exportProjects(ROWS, "csv");
        expect(text.split("\n")[0]).toBe("name,world,file,id,maps,createdAt,updatedAt,fromWizard");
        expect(text.split("\n")).toHaveLength(5);
    });

    it("quotes a cell that would otherwise break the row", () => {
        const awkward: ProjectRow = { ...ROWS[0]!, name: 'He said "hi", loudly' };
        expect(exportProjects([awkward], "csv")).toContain('"He said ""hi"", loudly"');
    });

    it("writes a Markdown table for pasting into an issue", () => {
        expect(exportProjects(ROWS, "markdown")).toContain("| --- |");
    });
});

/* -------------------------------------------------------------------------- */

describe("syncing a config that was never generated", () => {
    it("adds the four named settings to a body that did not have them", () => {
        const text = syncMapConfig({
            id: "sparse",
            name: "Sparse",
            world: null,
            dimension: "minecraft:the_end",
            config: "",
            storage: "archive",
            sorting: 7,
            enabled: true,
        });

        const file = openConfigFile(mapDescriptor(), "maps/sparse.conf", text);
        const named = file.descriptor.fields.find((field) => field.path === "name");
        expect(named).toBeDefined();
        expect(fieldValue(file, named!)).toBe("Sparse");
        expect(text).toContain("minecraft:the_end");
    });
});

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

/** One setting out of a singleton's config text, which is what BlueMap would actually read. */
function singletonSetting(project: ProjectFile, kind: "core" | "webapp" | "webserver" | "plugin", path: string): unknown {
    const file = openSingletonFile(project, kind);
    const field = file.descriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) throw new Error(`no field ${path}`);
    return fieldValue(file, field);
}

const EMPTY = createProject("Empty", STAMP);

describe("the four presets, said plainly", () => {
    it("carries exactly one entry per id", () => {
        expect(PROJECT_PRESETS.map((preset) => preset.id).sort()).toEqual(
            ["allDimensions", "fastRender", "overworldOnly", "webServerOff"].sort(),
        );
    });

    it("resolves a preset by id, and falls back to a real preset rather than undefined", () => {
        expect(findPreset("allDimensions").dimensions).toHaveLength(3);
        expect(findPreset("does-not-exist" as never)).toEqual(PROJECT_PRESETS[0]);
    });
});

describe("applying the single-overworld preset", () => {
    it("adds exactly one map and the shared file storage, nothing else", () => {
        const application = applyPreset(EMPTY, findPreset("overworldOnly"), { world: WORLD, storageRoot: "C:/renders" });

        expect(application.mapsAdded).toEqual(["overworld"]);
        expect(application.mapsSkipped).toEqual([]);
        expect(application.storageAdded).toBe(true);
        expect(application.webserverWritten).toBe(false);
        expect(application.project.maps.map((map) => map.id)).toEqual(["overworld"]);
        expect(application.project.storages.map((storage) => storage.id)).toEqual(["file"]);
        // Written from the real template, exactly like "Add a map" does - not a blank file.
        expect(settingIn(application.project, "overworld", "name")).toBe("Overworld");
        expect(settingIn(application.project, "overworld", "dimension")).toBe("minecraft:overworld");
        // Nothing invented: no singleton was touched by this preset.
        expect(application.project.webserver).toBeNull();
        expect(application.project.core).toBeNull();
    });
});

describe("applying the all-dimensions preset", () => {
    it("adds all three maps, named and sorted the way BlueMap's own CLI would generate them", () => {
        const application = applyPreset(EMPTY, findPreset("allDimensions"), { world: WORLD, storageRoot: "C:/renders" });

        expect(application.mapsAdded.toSorted()).toEqual(["end", "nether", "overworld"]);
        expect(findMap(application.project, "overworld")?.name).toBe("Overworld");
        expect(findMap(application.project, "nether")?.name).toBe("Nether");
        expect(findMap(application.project, "end")?.name).toBe("End");
        // Each dimension keeps the real per-dimension preset colours `withMapAdded` already uses.
        expect(settingIn(application.project, "nether", "ambient-light")).toBe(0.6);
        expect(settingIn(application.project, "overworld", "ambient-light")).toBe(0.1);
    });

    it("skips a map id the project already has, rather than overwriting it", () => {
        const withCustomOverworld = withMapConfig(
            withMapAdded(EMPTY, { id: "overworld", name: "Custom", dimension: "minecraft:overworld", world: WORLD }),
            "overworld",
            'name: "Hand Edited"\nsky-color: "#ff00ff"\n',
        );

        const application = applyPreset(withCustomOverworld, findPreset("allDimensions"), {
            world: WORLD,
            storageRoot: "C:/renders",
        });

        expect(application.mapsAdded.toSorted()).toEqual(["end", "nether"]);
        expect(application.mapsSkipped).toEqual(["overworld"]);
        // The hand-edited map is untouched: applying a preset composes, it never overwrites.
        expect(findMap(application.project, "overworld")?.config).toBe('name: "Hand Edited"\nsky-color: "#ff00ff"\n');
    });

    it("leaves an already-present file storage exactly as it was", () => {
        const withCustomStorage = withStorageAdded(EMPTY, "file", "storage-type: file\nroot: \"D:/custom\"\n");

        const application = applyPreset(withCustomStorage, findPreset("allDimensions"), {
            world: WORLD,
            storageRoot: "C:/renders",
        });

        expect(application.storageAdded).toBe(false);
        expect(findStorage(application.project, "file")?.config).toBe('storage-type: file\nroot: "D:/custom"\n');
    });
});

describe("applying the web-server-off preset", () => {
    it("writes webserver.conf with enabled set to false, and nothing else in it", () => {
        const application = applyPreset(EMPTY, findPreset("webServerOff"), { world: WORLD, storageRoot: "C:/renders" });

        expect(application.webserverWritten).toBe(true);
        expect(application.project.webserver).not.toBeNull();
        expect(singletonSetting(application.project, "webserver", "enabled")).toBe(false);
        // Every other webserver setting is still absent, so BlueMap's own default applies to
        // all of them - this preset touches exactly the one field it declares.
        const file = openSingletonFile(application.project, "webserver");
        const enabledField = file.descriptor.fields.find((field) => field.path === "enabled")!;
        const portField = file.descriptor.fields.find((field) => field.path === "port")!;
        const webrootField = file.descriptor.fields.find((field) => field.path === "webroot")!;
        expect(isExplicit(file, enabledField)).toBe(true);
        expect(isExplicit(file, portField)).toBe(false);
        expect(isExplicit(file, webrootField)).toBe(false);
    });

    it("leaves an already-present webserver.conf untouched", () => {
        const withCustomWebserver = withSingleton(EMPTY, "webserver", "port: 9999\n");

        const application = applyPreset(withCustomWebserver, findPreset("webServerOff"), {
            world: WORLD,
            storageRoot: "C:/renders",
        });

        expect(application.webserverWritten).toBe(false);
        expect(application.project.webserver).toBe("port: 9999\n");
    });
});

describe("applying the faster-renders preset", () => {
    it("switches off the hires layer on every map it creates", () => {
        const application = applyPreset(EMPTY, findPreset("fastRender"), { world: WORLD, storageRoot: "C:/renders" });

        for (const id of application.mapsAdded) {
            expect(settingIn(application.project, id, "enable-hires")).toBe(false);
        }
    });

    it("does not touch enable-hires on a map the preset only skipped", () => {
        const withCustomOverworld = withMapConfig(
            withMapAdded(EMPTY, { id: "overworld", name: "Custom", dimension: "minecraft:overworld", world: WORLD }),
            "overworld",
            'name: "Custom"\nenable-hires: true\n',
        );

        const application = applyPreset(withCustomOverworld, findPreset("fastRender"), {
            world: WORLD,
            storageRoot: "C:/renders",
        });

        expect(application.mapsSkipped).toContain("overworld");
        expect(settingIn(application.project, "overworld", "enable-hires")).toBe(true);
    });
});

describe("presetApplicationLines, saying what actually happened", () => {
    it("names the maps it added", () => {
        const preset = findPreset("overworldOnly");
        const application = applyPreset(EMPTY, preset, { world: WORLD, storageRoot: "C:/renders" });
        const lines = presetApplicationLines(preset, application, t);

        expect(lines.join(" ")).toContain("1");
        expect(lines.join(" ")).toContain("Overworld");
        expect(lines.join(" ")).toContain("Added the file storage");
    });

    it("says plainly when nothing was added, rather than claiming credit for work it did not do", () => {
        const preset = findPreset("overworldOnly");
        const already = applyPreset(EMPTY, preset, { world: WORLD, storageRoot: "C:/renders" }).project;
        const application = applyPreset(already, preset, { world: WORLD, storageRoot: "C:/renders" });
        const lines = presetApplicationLines(preset, application, t);

        expect(lines.join(" ")).toContain("already in the project");
        expect(lines.join(" ")).toContain("already existed");
    });

    it("mentions the web server only for a preset that actually touches it", () => {
        const preset = findPreset("overworldOnly");
        const application = applyPreset(EMPTY, preset, { world: WORLD, storageRoot: "C:/renders" });
        const lines = presetApplicationLines(preset, application, t);

        expect(lines.some((line) => line.includes("webserver.conf"))).toBe(false);
    });

    it("says the web server was left untouched when the project already had its own", () => {
        const withCustomWebserver = withSingleton(EMPTY, "webserver", "port: 9999\n");
        const preset = findPreset("webServerOff");
        const application = applyPreset(withCustomWebserver, preset, { world: WORLD, storageRoot: "C:/renders" });
        const lines = presetApplicationLines(preset, application, t);

        expect(lines.join(" ")).toContain("already carries its own webserver.conf");
    });
});

describe("withMapFieldSet and withSingletonFieldSet, the primitives a preset composes from", () => {
    it("writes exactly one field into a map's config, through the schema", () => {
        const project = withMapFieldSet(seeded(), "overworld", "enable-hires", false);
        expect(settingIn(project, "overworld", "enable-hires")).toBe(false);
        // Everything else the template already wrote is untouched.
        expect(settingIn(project, "overworld", "name")).toBe("Overworld");
    });

    it("does nothing to a map id that is not there", () => {
        expect(withMapFieldSet(seeded(), "does-not-exist", "enable-hires", false)).toEqual(seeded());
    });

    it("writes exactly one field into a singleton, starting from an absent file", () => {
        const project = withSingletonFieldSet(seeded(), "webserver", "enabled", false);
        expect(project.webserver).not.toBeNull();
        expect(singletonSetting(project, "webserver", "enabled")).toBe(false);
    });

    it("refuses an unknown field, the same way writeField already does everywhere else", () => {
        expect(withMapFieldSet(seeded(), "overworld", "not-a-real-field", true)).toEqual(seeded());
    });
});

/* -------------------------------------------------------------------------- */
/* The render tab's own default indicator                                    */
/* -------------------------------------------------------------------------- */

describe("a render option's own default", () => {
    it("starts at the default a fresh project already carries", () => {
        expect(isRenderFieldDefault(seeded(), "threads")).toBe(true);
        expect(isRenderFieldDefault(seeded(), "force")).toBe(true);
        expect(isRenderFieldDefault(seeded(), "fixEdges")).toBe(true);
        expect(isRenderFieldDefault(seeded(), "metrics")).toBe(true);
        expect(isRenderFieldDefault(seeded(), "outputFolder")).toBe(true);
    });

    it("says false the moment one is changed, and true again after it is put back", () => {
        const changed = withRender(seeded(), { force: true, threads: 4 });
        expect(isRenderFieldDefault(changed, "force")).toBe(false);
        expect(isRenderFieldDefault(changed, "threads")).toBe(false);
        // The other three were never touched.
        expect(isRenderFieldDefault(changed, "fixEdges")).toBe(true);

        const reset = withRenderFieldDefault(changed, "force");
        expect(isRenderFieldDefault(reset, "force")).toBe(true);
        // Resetting one leaves the other, still-changed one alone.
        expect(isRenderFieldDefault(reset, "threads")).toBe(false);
        expect(reset.render.threads).toBe(4);
    });

    it("resets outputFolder and threads back to null, and the three switches back to false", () => {
        const changed = withRender(seeded(), {
            threads: 8,
            force: true,
            fixEdges: true,
            metrics: true,
            outputFolder: "D:/renders",
        });

        expect(withRenderFieldDefault(changed, "threads").render.threads).toBeNull();
        expect(withRenderFieldDefault(changed, "outputFolder").render.outputFolder).toBeNull();
        expect(withRenderFieldDefault(changed, "force").render.force).toBe(false);
        expect(withRenderFieldDefault(changed, "fixEdges").render.fixEdges).toBe(false);
        expect(withRenderFieldDefault(changed, "metrics").render.metrics).toBe(false);
    });
});
