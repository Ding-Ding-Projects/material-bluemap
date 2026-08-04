/**
 * How one project save is worded, which is the difference between a history panel somebody
 * uses and one they scroll past.
 *
 * Every assertion here is about a row somebody will read months later, looking for the
 * moment something changed. A list of forty rows all reading "Saved the project" is an
 * archive: finding the save that deleted the nether map means opening rows one at a time.
 * The whole of this file exists so that row reads "Deleted the nether map" instead.
 */

import { describe, expect, it } from "vitest";

import {
    PROJECT_FORMAT_VERSION,
    projectFileSchema,
    type ProjectFile,
    type ProjectMap,
} from "@material-bluemap/config";

import { describeProjectChange, describeProjectRestore, describeReadFailure } from "./index.js";

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
    return projectFileSchema.parse({
        version: PROJECT_FORMAT_VERSION,
        id: "p-1",
        name: "Home world",
        createdAt: "2026-08-04T12:00:00-04:00",
        updatedAt: "2026-08-04T12:00:00-04:00",
        ...overrides,
    });
}

function map(id: string, name: string, overrides: Partial<ProjectMap> = {}): ProjectMap {
    return {
        id,
        name,
        dimension: "minecraft:overworld",
        world: null,
        config: "sky-color: #7dabff\n",
        storage: "file",
        sorting: 0,
        enabled: true,
        ...overrides,
    };
}

const label = (before: ProjectFile | null, after: ProjectFile | null, first = false): string =>
    describeProjectChange({ before, after, first }).label;

const action = (before: ProjectFile | null, after: ProjectFile | null, first = false): string =>
    describeProjectChange({ before, after, first }).action;

describe("where a project's history starts", () => {
    it("calls the first snapshot what it is, not a creation nobody performed", () => {
        // A world can already carry a project written months ago on another machine. The
        // first snapshot of that is the record beginning, not somebody making a project.
        const started = describeProjectChange({ before: null, after: project(), first: true });
        expect(started.label).toBe('Started keeping this project\'s history: "Home world"');
        expect(started.action).toBe("started");
    });

    it("calls a project made inside an already-running history a creation", () => {
        expect(label(null, project({ name: "New one" }))).toBe('Created the project "New one"');
        expect(action(null, project())).toBe("created");
    });

    it("says which project was taken away", () => {
        expect(label(project({ name: "Old world" }), null)).toBe('Deleted the project "Old world"');
        expect(action(project(), null)).toBe("deleted");
    });
});

describe("what changed inside the file, named rather than counted", () => {
    it("names a map that was added", () => {
        const before = project();
        const after = project({ maps: [map("nether", "Nether")] });
        expect(label(before, after)).toBe("Added the Nether map");
        expect(action(before, after)).toBe("created");
    });

    it("names a map that was removed", () => {
        const before = project({ maps: [map("nether", "Nether")] });
        const after = project();
        expect(label(before, after)).toBe("Deleted the Nether map");
        expect(action(before, after)).toBe("deleted");
    });

    it("names a map whose settings changed, without needing to know which setting", () => {
        const before = project({ maps: [map("nether", "Nether")] });
        const after = project({ maps: [map("nether", "Nether", { config: "sky-color: #000000\n" })] });
        expect(label(before, after)).toBe("Changed the Nether map");
        expect(action(before, after)).toBe("changed");
    });

    it("uses the name a person gave a map, not its identifier", () => {
        const before = project();
        const after = project({ maps: [map("ow_1", "The good one")] });
        expect(label(before, after)).toBe("Added the The good one map");
    });

    it("falls back to the identifier only when there is no name to use", () => {
        const before = project();
        const after = project({ maps: [map("ow_1", " ")] });
        expect(label(before, after)).toBe("Added the ow_1 map");
    });

    it("names a storage the same way", () => {
        const before = project();
        const after = project({ storages: [{ id: "file", config: "storage-type: bluemap:file\n" }] });
        expect(label(before, after)).toBe("Added the file storage");
    });

    it("says when the project itself was renamed", () => {
        const before = project({ name: "Old name" });
        const after = project({ name: "New name" });
        expect(label(before, after)).toBe('Renamed the project to "New name"');
    });

    it("names each whole-body setting the way the app's own screens do", () => {
        expect(label(project(), project({ core: "accept-download: true\n" }))).toBe("Changed the core settings");
        expect(label(project(), project({ webapp: "enabled: true\n" }))).toBe("Changed the web app settings");
        expect(label(project(), project({ webserver: "port: 8100\n" }))).toBe("Changed the web server settings");
        expect(label(project(), project({ plugin: "live-player-markers: true\n" }))).toBe(
            "Changed the plugin settings",
        );
    });

    it("says when the render options moved", () => {
        const after = project({
            render: { threads: 4, force: false, fixEdges: false, metrics: false, outputFolder: null },
        });
        expect(label(project(), after)).toBe("Changed the render options");
    });

    it("joins several changes into one sentence rather than one vague word", () => {
        const before = project({ maps: [map("nether", "Nether")] });
        const after = project({
            name: "Renamed",
            maps: [map("nether", "Nether", { enabled: false }), map("end", "End")],
        });
        expect(label(before, after)).toBe(
            'Renamed the project to "Renamed", added the End map, changed the Nether map',
        );
        expect(action(before, after)).toBe("mixed");
    });

    it("counts once naming them all would stop helping, and still names the first few", () => {
        const before = project();
        const after = project({ maps: ["a", "b", "c", "d", "e"].map((name) => map(name, name)) });
        expect(label(before, after)).toBe("Added the a map, the b map and the c map and 2 more");
    });

    /**
     * The honest row.
     *
     * `updatedAt` moves on every save, so the file really is different and a revision really
     * was recorded. Inventing a change to justify the row would be worse than saying so.
     */
    it("says plainly when a save changed nothing a person had set", () => {
        const before = project({ updatedAt: "2026-08-04T12:00:00-04:00" });
        const after = project({ updatedAt: "2026-08-04T13:00:00-04:00" });
        expect(label(before, after)).toBe('Saved "Home world" with nothing changed');
        expect(action(before, after)).toBe("changed");
    });

    it("does not report a change when a map merely came back in a different order", () => {
        const before = project({ maps: [map("a", "A"), map("b", "B")] });
        const after = project({ maps: [map("b", "B"), map("a", "A")] });
        expect(label(before, after)).toBe('Saved "Home world" with nothing changed');
    });
});

describe("a restore names the moment, not the files that moved", () => {
    it("says which revision the project was put back to", () => {
        expect(describeProjectRestore({ shortId: "abc123def456", label: "Added the nether map" })).toBe(
            "Restored the project as it was at abc123def456: Added the nether map",
        );
    });
});

describe("why a project would not open, in words for somebody who has never heard of JSON", () => {
    it("has a sentence for every reason, each naming the file and what the app did", () => {
        const path = "C:\\worlds\\home\\material-bluemap.project.json";

        expect(describeReadFailure({ kind: "absent" }, path)).toContain("has no project yet");
        expect(describeReadFailure({ kind: "unreadable", message: "EACCES" }, path)).toContain("left alone");
        expect(describeReadFailure({ kind: "not-json", message: "Unexpected token" }, path)).toContain(
            "edited by hand",
        );
        expect(describeReadFailure({ kind: "too-new", version: 9 }, path)).toContain("newer version");
        expect(describeReadFailure({ kind: "invalid", problems: ["name: too short"] }, path)).toContain(
            "name: too short",
        );

        for (const failure of [
            { kind: "absent" } as const,
            { kind: "unreadable", message: "EACCES" } as const,
            { kind: "not-json", message: "Unexpected token" } as const,
            { kind: "too-new", version: 9 } as const,
            { kind: "invalid", problems: ["name: too short"] } as const,
        ]) {
            expect(describeReadFailure(failure, path)).toContain(path);
        }
    });
});
