/**
 * The project file's contract.
 *
 * Every assertion here is about something that has to survive the file leaving this
 * machine: a project travels inside a world folder, so it gets copied, zipped, emailed,
 * committed, and opened by an app of a different version to the one that wrote it.
 */

import { describe, expect, it } from "vitest";
import {
    LEGACY_PROJECT_FILE_NAME,
    LEGACY_PROJECT_SCHEMA_ID,
    PROJECT_FILE_NAME,
    PROJECT_FORMAT_VERSION,
    PROJECT_SCHEMA_ID,
    parseProjectFile,
    projectFileSchema,
    serializeProjectFile,
    type ProjectFile,
} from "../src/project.js";

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

describe("the file it writes", () => {
    it("is named clearly enough to belong to somebody, in a folder many tools write to", () => {
        expect(PROJECT_FILE_NAME).toBe("worldlens.project.json");
        expect(LEGACY_PROJECT_FILE_NAME).toBe("material-bluemap.project.json");
        // Not hidden: a file somebody cannot see is one they cannot back up or delete on purpose.
        expect(PROJECT_FILE_NAME.startsWith(".")).toBe(false);
    });

    it("round-trips through text unchanged", () => {
        const original = project({ maps: [] });
        const read = parseProjectFile(serializeProjectFile(original));
        expect(read.ok).toBe(true);
        if (read.ok) expect(read.project).toEqual({ ...original, schema: PROJECT_SCHEMA_ID });
    });

    it("writes its keys in a fixed order, so one changed setting is one changed line", () => {
        const a = serializeProjectFile(project({ name: "One" }));
        const b = serializeProjectFile(project({ name: "Two" }));
        const differing = a.split("\n").filter((line, index) => line !== b.split("\n")[index]);
        expect(differing).toHaveLength(1);
        expect(differing[0]).toContain("name");
    });

    it("ends with a newline, which every editor would otherwise add later", () => {
        expect(serializeProjectFile(project()).endsWith("\n")).toBe(true);
    });
});

describe("reading one somebody else wrote", () => {
    it("says plainly when there is no JSON in it at all", () => {
        const read = parseProjectFile("this is not json");
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.failure.kind).toBe("not-json");
    });

    it("refuses a file from a newer app rather than dropping what it cannot read", () => {
        // The dangerous version of this is not the crash: it is loading the fields this
        // build understands, ignoring the rest, and deleting them on the next save.
        const text = JSON.stringify({ ...project(), version: PROJECT_FORMAT_VERSION + 1 });
        const read = parseProjectFile(text);
        expect(read.ok).toBe(false);
        if (!read.ok) {
            expect(read.failure.kind).toBe("too-new");
            if (read.failure.kind === "too-new") expect(read.failure.version).toBe(PROJECT_FORMAT_VERSION + 1);
        }
    });

    it("names the fields that are wrong instead of failing as one sentence", () => {
        const read = parseProjectFile(JSON.stringify({ version: 1, id: "", name: "" }));
        expect(read.ok).toBe(false);
        if (!read.ok && read.failure.kind === "invalid") {
            expect(read.failure.problems.length).toBeGreaterThan(0);
            expect(read.failure.problems.join(" ")).toMatch(/id|name/);
        }
    });

    it("fills in what an older, smaller file left out", () => {
        const read = parseProjectFile(
            JSON.stringify({
                version: 1,
                id: "p",
                name: "n",
                createdAt: "2026-08-04T12:00:00-04:00",
                updatedAt: "2026-08-04T12:00:00-04:00",
            }),
        );
        expect(read.ok).toBe(true);
        if (read.ok) {
            expect(read.project.version).toBe(PROJECT_FORMAT_VERSION);
            expect(read.project.schema).toBe(PROJECT_SCHEMA_ID);
            expect(read.project.maps).toEqual([]);
            expect(read.project.render.force).toBe(false);
            expect(read.project.fromWizard).toBe(false);
        }
    });

    it("adapts the explicit legacy schema id and preserves unknown fields", () => {
        const read = parseProjectFile(
            JSON.stringify({
                version: 1,
                schema: LEGACY_PROJECT_SCHEMA_ID,
                id: "p",
                name: "n",
                createdAt: "2026-08-04T12:00:00-04:00",
                updatedAt: "2026-08-04T12:00:00-04:00",
                futureExtension: { kept: true },
                maps: [
                    {
                        id: "home",
                        name: "Home",
                        dimension: "minecraft:overworld",
                        config: "",
                        futureMapField: 42,
                    },
                ],
            }),
        );
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.project).toMatchObject({
            version: PROJECT_FORMAT_VERSION,
            schema: PROJECT_SCHEMA_ID,
            futureExtension: { kept: true },
        });
        expect(read.project.maps[0]).toMatchObject({ futureMapField: 42 });
        const serialized = JSON.parse(serializeProjectFile(read.project)) as Record<string, unknown>;
        expect(serialized.futureExtension).toEqual({ kept: true });
        expect((serialized.maps as Record<string, unknown>[])[0]?.futureMapField).toBe(42);
    });
});

describe("what it refuses to carry", () => {
    it("refuses a storage holding connection-properties, because this file travels", () => {
        // A project sits in a folder people zip up and send to each other. A database
        // password reaching it is not a review problem to catch later; it is a schema
        // problem to refuse now.
        const parsed = projectFileSchema.safeParse({
            ...project(),
            storages: [
                {
                    id: "sql",
                    config: 'storage-type: bluemap:sql\nconnection-properties: {\n  user: admin\n  password: hunter2\n}\n',
                },
            ],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues.map((issue) => issue.message).join(" ")).toContain("connection-properties");
        }
    });

    it("accepts a storage that names its shape without credentials", () => {
        const parsed = projectFileSchema.safeParse({
            ...project(),
            storages: [{ id: "file", config: "storage-type: bluemap:file\nroot: web/maps\n" }],
        });
        expect(parsed.success).toBe(true);
    });

    it("holds no world path, because the file is inside the world", () => {
        // Two sources of truth for where a world is go wrong exactly when a project needs
        // to still work: the moment somebody moves or copies the folder.
        expect(Object.keys(projectFileSchema.shape)).not.toContain("world");
        expect(Object.keys(projectFileSchema.shape)).not.toContain("worldFolder");
    });
});

describe("a map inside a project", () => {
    it("keeps the whole config body, not the handful of fields with names here", () => {
        const body = "sky-color: #7dabff\nambient-light: 0.1\nrender-edges: true\n";
        const parsed = projectFileSchema.safeParse({
            ...project(),
            maps: [{ id: "overworld", name: "Overworld", dimension: "minecraft:overworld", config: body }],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data.maps[0]?.config).toBe(body);
    });

    it("maps to the world it lives in by default, and can name another", () => {
        // One project per world would scatter the settings that describe one server across
        // several files, so a map may point at a sibling world. Null means "the world this
        // project is in", which is both the ordinary case and the one that survives a move.
        const parsed = projectFileSchema.safeParse({
            ...project(),
            maps: [
                { id: "home", name: "Home", dimension: "minecraft:overworld", config: "" },
                { id: "creative", name: "Creative", dimension: "minecraft:overworld", config: "", world: "../creative" },
            ],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.maps[0]?.world).toBeNull();
            expect(parsed.data.maps[1]?.world).toBe("../creative");
        }
    });

    it("refuses a map id that would not survive being a folder name", () => {
        const parsed = projectFileSchema.safeParse({
            ...project(),
            maps: [{ id: "Over World!", name: "n", dimension: "minecraft:overworld", config: "" }],
        });
        expect(parsed.success).toBe(false);
    });
});
