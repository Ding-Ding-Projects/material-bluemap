import { describe, expect, it } from "vitest";
import { generateConfigSet, renderPluginTemplate, type FieldMeta } from "@material-bluemap/config";
import { fieldValue, setFieldValue } from "./configModel.js";
import {
    addMap,
    addStorage,
    cloneMap,
    configNameOf,
    createWorkspace,
    entriesOfKind,
    findEntry,
    isAbsolutePath,
    isConfigFileName,
    isNameAvailable,
    isWorkspaceDirty,
    loadWorkspace,
    mapPathFor,
    markWorkspaceSaved,
    removeEntry,
    replaceFile,
    sanitiseMapId,
    savePlan,
    setStorageType,
    singletonEntry,
    storageIds,
    workspaceIssues,
    type ConfigWorkspace,
} from "./configWorkspace.js";

const OPTIONS = {
    webroot: "/srv/bluemap/web",
    dataFolder: "/srv/bluemap/data",
    world: "/srv/minecraft/world",
    version: "5.22",
};

/** A folder as it would look after the CLI had generated and written it once. */
function savedWorkspace(): ConfigWorkspace {
    const files = [...generateConfigSet(OPTIONS), { path: "plugin.conf", text: renderPluginTemplate() }];
    return loadWorkspace("/srv/bluemap/config", files);
}

function fieldOf(workspace: ConfigWorkspace, key: string, path: string): FieldMeta {
    const entry = findEntry(workspace, key);
    if (entry === undefined) throw new Error(`no entry: ${key}`);
    const field = entry.file.descriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) throw new Error(`no field: ${path}`);
    return field;
}

function setField(workspace: ConfigWorkspace, key: string, path: string, value: unknown): ConfigWorkspace {
    const entry = findEntry(workspace, key);
    if (entry === undefined) throw new Error(`no entry: ${key}`);
    return replaceFile(workspace, key, setFieldValue(entry.file, fieldOf(workspace, key, path), value as never));
}

describe("BlueMap's own naming rules", () => {
    it("recognises the two suffixes ConfigLoader.REGISTRY knows about", () => {
        expect(isConfigFileName("core.conf")).toBe(true);
        expect(isConfigFileName("core.json")).toBe(true);
        expect(isConfigFileName("core.yaml")).toBe(false);
        expect(isConfigFileName("README.md")).toBe(false);
    });

    it("strips the suffix the way ConfigManager.getConfigName does", () => {
        expect(configNameOf("overworld.conf")).toBe("overworld");
        expect(configNameOf("overworld.json")).toBe("overworld");
    });

    it("sanitises a map id exactly as upstream's replaceAll(\\W, _) does", () => {
        expect(sanitiseMapId("overworld")).toBe("overworld");
        expect(sanitiseMapId("My Map")).toBe("My_Map");
        expect(sanitiseMapId("nether-2")).toBe("nether_2");
        expect(sanitiseMapId("末地")).toBe("__");
        expect(sanitiseMapId("keeps_Underscores1")).toBe("keeps_Underscores1");
    });

    it("does not lowercase, because BlueMap only does that when auto-detecting worlds", () => {
        expect(sanitiseMapId("Overworld")).toBe("Overworld");
    });
});

describe("loading a folder", () => {
    it("classifies every file the CLI generates", () => {
        const workspace = savedWorkspace();

        expect(singletonEntry(workspace, "core")?.file.path).toBe("core.conf");
        expect(singletonEntry(workspace, "webapp")?.file.path).toBe("webapp.conf");
        expect(singletonEntry(workspace, "webserver")?.file.path).toBe("webserver.conf");
        expect(singletonEntry(workspace, "plugin")?.file.path).toBe("plugin.conf");
        expect(entriesOfKind(workspace, "map").map((entry) => entry.name)).toEqual(["end", "nether", "overworld"]);
        expect(storageIds(workspace)).toEqual(["file", "sql"]);
        expect(workspace.unknown).toEqual([]);
    });

    it("picks the SQL descriptor for a storage whose type says sql", () => {
        const workspace = savedWorkspace();
        const sql = findEntry(workspace, "storage:sql");
        expect(sql?.file.descriptor.id).toBe("storage-sql");
        expect(findEntry(workspace, "storage:file")?.file.descriptor.id).toBe("storage-file");
    });

    it("leaves a file it does not model alone rather than guessing at it", () => {
        const workspace = loadWorkspace("/cfg", [
            { path: "core.conf", text: "" },
            { path: "notes.txt", text: "hello" },
            { path: "packs/extra.conf", text: "" },
        ]);
        expect(workspace.unknown).toEqual(["notes.txt", "packs/extra.conf"]);
    });

    it("reads a folder listed with backslashes, which is what Windows hands over", () => {
        const workspace = loadWorkspace("C:\\cfg", [{ path: "maps\\overworld.conf", text: 'world: "C:/w"' }]);
        expect(findEntry(workspace, "map:overworld")?.file.path).toBe("maps/overworld.conf");
    });
});

describe("a folder generated from templates", () => {
    it("has nothing on disk, so every file counts as new", () => {
        const workspace = createWorkspace("/cfg", OPTIONS);
        const plan = savePlan(workspace);

        expect(workspace.onDisk).toEqual([]);
        expect(plan.created).toHaveLength(plan.writes.length);
        expect(plan.writes.map((file) => file.path)).toContain("plugin.conf");
        expect(isWorkspaceDirty(workspace)).toBe(true);
    });
});

describe("adding a map", () => {
    it("writes it from upstream's template for the dimension asked for", () => {
        const workspace = addMap(savedWorkspace(), {
            name: "mining",
            displayName: "Mining World",
            world: "/srv/minecraft/mining",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 300,
            preset: "overworld",
        });

        const entry = findEntry(workspace, "map:mining");
        expect(entry?.file.path).toBe(mapPathFor("mining"));
        expect(entry?.id).toBe("mining");
        expect(fieldValue(entry!.file, fieldOf(workspace, "map:mining", "name"))).toBe("Mining World");
        expect(entry?.file.text).toContain("#");
    });

    it("appears in the save plan as a new file", () => {
        const workspace = addMap(savedWorkspace(), {
            name: "mining",
            displayName: "Mining",
            world: "/w",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 0,
            preset: "overworld",
        });
        expect(savePlan(workspace).created).toEqual(["maps/mining.conf"]);
    });

    it("refuses to reuse a name that is taken", () => {
        expect(isNameAvailable(savedWorkspace(), "map", "overworld")).toBe(false);
        expect(isNameAvailable(savedWorkspace(), "map", "mining")).toBe(true);
    });
});

describe("duplicating a map", () => {
    it("copies the file text so every setting and comment comes with it", () => {
        const workspace = savedWorkspace();
        const tuned = setField(workspace, "map:overworld", "remove-caves-below-y", 40);
        const cloned = cloneMap(tuned, "map:overworld", "overworld_hd", "Overworld HD");

        const source = findEntry(tuned, "map:overworld");
        const copy = findEntry(cloned, "map:overworld_hd");

        expect(fieldValue(copy!.file, fieldOf(cloned, "map:overworld_hd", "remove-caves-below-y"))).toBe(40);
        expect((copy!.file.text.match(/^\s*#/gm) ?? []).length).toBe((source!.file.text.match(/^\s*#/gm) ?? []).length);
    });

    it("changes only the displayed name", () => {
        const cloned = cloneMap(savedWorkspace(), "map:overworld", "overworld_hd", "Overworld HD");
        expect(fieldValue(findEntry(cloned, "map:overworld_hd")!.file, fieldOf(cloned, "map:overworld_hd", "name"))).toBe("Overworld HD");
        expect(fieldValue(findEntry(cloned, "map:overworld")!.file, fieldOf(cloned, "map:overworld", "name"))).toBe("Overworld");
    });

    it("does nothing when the source is not there", () => {
        const workspace = savedWorkspace();
        expect(cloneMap(workspace, "map:nope", "x", "X").entries).toHaveLength(workspace.entries.length);
    });
});

describe("deleting", () => {
    it("queues a file that is on disk for deletion", () => {
        const workspace = removeEntry(savedWorkspace(), "map:nether");
        expect(workspace.deletions).toEqual(["maps/nether.conf"]);
        expect(savePlan(workspace).deletes).toEqual(["maps/nether.conf"]);
    });

    it("simply forgets a file that was never written, rather than asking to delete nothing", () => {
        const added = addMap(savedWorkspace(), {
            name: "mining",
            displayName: "Mining",
            world: "/w",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 0,
            preset: "overworld",
        });
        const removed = removeEntry(added, "map:mining");
        expect(removed.deletions).toEqual([]);
        expect(findEntry(removed, "map:mining")).toBeUndefined();
    });

    it("does not delete a file that was recreated under the same name", () => {
        const removed = removeEntry(savedWorkspace(), "map:nether");
        const recreated = addMap(removed, {
            name: "nether",
            displayName: "Nether",
            world: "/w",
            dimension: "minecraft:the_nether",
            dimensionType: "minecraft:the_nether",
            sorting: 100,
            preset: "nether",
        });
        expect(recreated.deletions).toEqual([]);
    });
});

describe("switching a storage's type", () => {
    it("re-opens the file against the descriptor for the type it now names", () => {
        const workspace = setStorageType(savedWorkspace(), "storage:file", "sql");
        const entry = findEntry(workspace, "storage:sql");

        expect(entry?.file.descriptor.id).toBe("storage-sql");
        expect(entry?.file.descriptor.fields.some((field) => field.path === "connection-url")).toBe(true);
    });

    it("keeps the file dirty so the change is actually written", () => {
        const workspace = setStorageType(savedWorkspace(), "storage:file", "sql");
        expect(savePlan(workspace).writes.some((file) => file.path === "storages/file.conf")).toBe(true);
    });
});

describe("adding a storage", () => {
    it("writes a file storage from upstream's template with the root asked for", () => {
        const workspace = addStorage(savedWorkspace(), "backup", "file", "/mnt/backup/maps");
        const entry = findEntry(workspace, "storage:backup");
        expect(entry?.file.path).toBe("storages/backup.conf");
        expect(fieldValue(entry!.file, fieldOf(workspace, "storage:backup", "root"))).toBe("/mnt/backup/maps");
    });

    it("writes an SQL storage from the SQL template", () => {
        const workspace = addStorage(savedWorkspace(), "db", "sql", "");
        expect(findEntry(workspace, "storage:db")?.file.descriptor.id).toBe("storage-sql");
    });
});

describe("problems only visible across files", () => {
    it("finds a map pointing at a storage nobody created", () => {
        const workspace = setField(savedWorkspace(), "map:overworld", "storage", "backup");
        const issue = workspaceIssues(workspace).find((candidate) => candidate.entryKey === "map:overworld" && candidate.path === "storage");

        expect(issue?.severity).toBe("error");
        expect(issue?.message).toContain("storages/backup.conf");
        expect(issue?.message).toContain("file, sql");
    });

    it("finds two map files whose names collapse to one id, which stops BlueMap starting", () => {
        const base = savedWorkspace();
        const withSpace = addMap(base, {
            name: "my map",
            displayName: "My Map",
            world: "/w",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 0,
            preset: "overworld",
        });
        const withDash = addMap(withSpace, {
            name: "my-map",
            displayName: "My Map 2",
            world: "/w",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 0,
            preset: "overworld",
        });

        const collisions = workspaceIssues(withDash).filter((issue) => issue.severity === "error" && issue.message.includes("refuses to start"));
        expect(collisions.map((issue) => issue.entryKey).sort()).toEqual(["map:my map", "map:my-map"]);
        expect(collisions.every((issue) => issue.message.includes("my_map"))).toBe(true);
    });

    it("says what id a file name will turn into when the two differ", () => {
        const workspace = addMap(savedWorkspace(), {
            name: "my map",
            displayName: "My Map",
            world: "/w",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 0,
            preset: "overworld",
        });
        const note = workspaceIssues(workspace).find((issue) => issue.entryKey === "map:my map" && issue.severity === "warning");
        expect(note?.message).toContain("my_map");
    });

    it("finds a map with no world at all", () => {
        const workspace = replaceFile(
            savedWorkspace(),
            "map:overworld",
            setFieldValue(findEntry(savedWorkspace(), "map:overworld")!.file, fieldOf(savedWorkspace(), "map:overworld", "world"), ""),
        );
        const issue = workspaceIssues(workspace).find((candidate) => candidate.path === "world" && candidate.severity === "error");
        expect(issue?.message).toContain("level.dat");
    });

    it("warns about a relative world path, which the CLI resolves against its working directory", () => {
        const workspace = setField(savedWorkspace(), "map:overworld", "world", "world");
        const issue = workspaceIssues(workspace).find((candidate) => candidate.entryKey === "map:overworld" && candidate.path === "world");
        expect(issue?.severity).toBe("warning");
        expect(issue?.message).toContain("working directory");
    });

    it("warns when a file storage writes tiles somewhere the web app will never look", () => {
        const workspace = setField(savedWorkspace(), "storage:file", "root", "/somewhere/else");
        const issue = workspaceIssues(workspace).find((candidate) => candidate.entryKey === "storage:file" && candidate.path === "root");
        expect(issue?.severity).toBe("warning");
        expect(issue?.message).toContain("/srv/bluemap/web");
    });

    it("is quiet about a storage root that really is under the web root", () => {
        const workspace = savedWorkspace();
        const issues = workspaceIssues(workspace).filter((issue) => issue.entryKey === "storage:file" && issue.path === "root");
        expect(issues).toEqual([]);
    });

    it("warns that a render will not start until download consent is recorded", () => {
        const issue = workspaceIssues(savedWorkspace()).find((candidate) => candidate.path === "accept-download");
        expect(issue?.severity).toBe("warning");
        expect(issue?.message).toContain("Mojang");
    });

    it("stops warning about consent once accept-download is true", () => {
        const workspace = setField(savedWorkspace(), "core", "accept-download", true);
        expect(workspaceIssues(workspace).some((issue) => issue.path === "accept-download")).toBe(false);
    });

    it("warns when there are no maps left to render", () => {
        let workspace = savedWorkspace();
        for (const name of ["overworld", "nether", "end"]) workspace = removeEntry(workspace, `map:${name}`);
        expect(workspaceIssues(workspace).some((issue) => issue.entryKey === null)).toBe(true);
    });

    it("finds an SQL storage with no connection URL", () => {
        const workspace = setField(setStorageType(savedWorkspace(), "storage:sql", "sql"), "storage:sql", "connection-url", "");
        const issue = workspaceIssues(workspace).find((candidate) => candidate.path === "connection-url");
        expect(issue?.severity).toBe("error");
    });
});

describe("absolute path detection", () => {
    it("recognises the shapes a real config actually holds", () => {
        expect(isAbsolutePath("/srv/world")).toBe(true);
        expect(isAbsolutePath("C:\\Minecraft\\world")).toBe(true);
        expect(isAbsolutePath("C:/Minecraft/world")).toBe(true);
        expect(isAbsolutePath("\\\\nas\\share\\world")).toBe(true);
        expect(isAbsolutePath("world")).toBe(false);
        expect(isAbsolutePath("./world")).toBe(false);
    });
});

describe("the save plan", () => {
    it("is empty for a folder nobody has touched", () => {
        const plan = savePlan(savedWorkspace());
        expect(plan.empty).toBe(true);
        expect(plan.writes).toEqual([]);
        expect(isWorkspaceDirty(savedWorkspace())).toBe(false);
    });

    it("writes only the files that actually changed", () => {
        const workspace = setField(savedWorkspace(), "map:overworld", "name", "Home");
        const plan = savePlan(workspace);
        expect(plan.writes.map((file) => file.path)).toEqual(["maps/overworld.conf"]);
    });

    it("names the map that has to be rendered again after a tile-invalidating change", () => {
        const workspace = setField(savedWorkspace(), "map:overworld", "remove-caves-below-y", 40);
        const plan = savePlan(workspace);

        expect(plan.affectedMapIds).toEqual(["overworld"]);
        expect(plan.tileInvalidating).toHaveLength(1);
    });

    it("names every map that uses a storage when the storage itself changes", () => {
        const workspace = setField(savedWorkspace(), "storage:file", "compression", "zstd");
        const plan = savePlan(workspace);

        expect(plan.affectedMapIds).toEqual(["end", "nether", "overworld"]);
    });

    it("says nothing has to be re-rendered for a change that only renames a map", () => {
        const plan = savePlan(setField(savedWorkspace(), "map:overworld", "name", "Home"));
        expect(plan.affectedMapIds).toEqual([]);
        expect(plan.tileInvalidating).toEqual([]);
    });

    it("leaves a read-only JSON config out of the writes entirely", () => {
        const workspace = loadWorkspace("/cfg", [{ path: "maps/overworld.json", text: '{ "world": "/w" }' }]);
        expect(savePlan(workspace).writes).toEqual([]);
    });
});

describe("after saving", () => {
    it("stops offering to write the same file twice", () => {
        const edited = setField(savedWorkspace(), "map:overworld", "name", "Home");
        const plan = savePlan(edited);
        const saved = markWorkspaceSaved(edited, plan);

        expect(savePlan(saved).empty).toBe(true);
        expect(isWorkspaceDirty(saved)).toBe(false);
    });

    it("remembers that a newly created file is now on disk", () => {
        const added = addMap(savedWorkspace(), {
            name: "mining",
            displayName: "Mining",
            world: "/w",
            dimension: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            sorting: 0,
            preset: "overworld",
        });
        const saved = markWorkspaceSaved(added, savePlan(added));

        expect(saved.onDisk).toContain("maps/mining.conf");
        expect(removeEntry(saved, "map:mining").deletions).toEqual(["maps/mining.conf"]);
    });

    it("forgets a file it has just deleted", () => {
        const removed = removeEntry(savedWorkspace(), "map:nether");
        const saved = markWorkspaceSaved(removed, savePlan(removed));

        expect(saved.onDisk).not.toContain("maps/nether.conf");
        expect(saved.deletions).toEqual([]);
    });
});
