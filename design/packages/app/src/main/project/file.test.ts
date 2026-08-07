/**
 * The disk half of a project, exercised against real folders in a real temporary directory.
 *
 * Almost nothing here is mocked, and that is deliberate: the properties this code has to
 * have - a write that cannot leave a half-written project in somebody's world, a refusal to
 * overwrite a file it could not read, a path that cannot escape the folder it was given -
 * are properties of what the file system actually does. A stand-in would happily "prove" all
 * three while the shipped code did none of them.
 *
 * The one thing that *is* injected is the one a test cannot produce honestly: a failure
 * between writing the temporary file and renaming it over the target. That is the exact
 * moment the temporary file exists for, and there is no way to ask a healthy disk to fail
 * there.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    LEGACY_PROJECT_FILE_NAME,
    PROJECT_FILE_NAME,
    PROJECT_FORMAT_VERSION,
    PROJECT_SCHEMA_ID,
    projectFileSchema,
    serializeProjectFile,
    type ProjectFile,
} from "@worldlens/config";

import {
    PROJECT_TEMP_SUFFIX,
    checkProjectPath,
    checkProjectValue,
    checkWorldFolder,
    deleteProject,
    projectFilePath,
    readProject,
    readProjectText,
    writeProject,
    type ProjectFileIo,
} from "./index.js";

/* -------------------------------------------------------------------------- */
/* Real folders, in a real temporary directory                                */
/* -------------------------------------------------------------------------- */

const created: string[] = [];

async function worldFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "mb-project-world-"));
    created.push(folder);
    // A world folder is a world because it has one of these. Nothing here reads it; it is
    // present so these tests are operating on the shape of thing the code will really meet.
    await writeFile(join(folder, "level.dat"), "not really nbt", "utf8");
    return folder;
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

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

/** Everything in the folder that is not the world's own file, sorted. */
async function contents(folder: string): Promise<string[]> {
    return (await readdir(folder)).filter((name) => name !== "level.dat").sort();
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

describe("reading a project out of a world folder", () => {
    it("says a world simply has no project, which is not a failure", async () => {
        const folder = await worldFolder();
        const read = await readProject(folder);

        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.failure.kind).toBe("absent");
        // The path is answered even when there is nothing at it, because the caller's next
        // question is where a project would go.
        expect(read.path).toBe(join(folder, PROJECT_FILE_NAME));
    });

    it("reads one back exactly as it was written", async () => {
        const folder = await worldFolder();
        const original = project({ name: "Survival" });
        expect((await writeProject(folder, original)).ok).toBe(true);

        const read = await readProject(folder);
        expect(read.ok).toBe(true);
        if (read.ok) expect(read.project).toEqual({ ...original, schema: PROJECT_SCHEMA_ID });
    });

    it("reads the legacy project name and migrates its schema in memory", async () => {
        const folder = await worldFolder();
        const original = { ...project({ name: "Legacy survival" }), version: 1 };
        await writeFile(join(folder, LEGACY_PROJECT_FILE_NAME), JSON.stringify(original), "utf8");

        const read = await readProject(folder);
        expect(read.ok).toBe(true);
        expect(read.path).toBe(join(folder, LEGACY_PROJECT_FILE_NAME));
        if (read.ok) {
            expect(read.project).toEqual({
                ...original,
                version: PROJECT_FORMAT_VERSION,
                schema: PROJECT_SCHEMA_ID,
            });
        }
    });

    it("says plainly when the file is not JSON at all, rather than crashing on it", async () => {
        const folder = await worldFolder();
        await writeFile(join(folder, PROJECT_FILE_NAME), "{ this is not json", "utf8");

        const read = await readProject(folder);
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.failure.kind).toBe("not-json");
    });

    it("refuses a project from a newer app rather than reading half of it", async () => {
        const folder = await worldFolder();
        await writeFile(
            join(folder, PROJECT_FILE_NAME),
            JSON.stringify({ ...project(), version: PROJECT_FORMAT_VERSION + 1 }),
            "utf8",
        );

        const read = await readProject(folder);
        expect(read.ok).toBe(false);
        if (!read.ok) {
            expect(read.failure.kind).toBe("too-new");
            if (read.failure.kind === "too-new") expect(read.failure.version).toBe(PROJECT_FORMAT_VERSION + 1);
        }
    });

    it("drops a byte-order mark, so a project opened in Notepad still reads", async () => {
        const folder = await worldFolder();
        await writeFile(join(folder, PROJECT_FILE_NAME), `\uFEFF${serializeProjectFile(project())}`, "utf8");

        const read = await readProject(folder);
        expect(read.ok).toBe(true);
    });

    it("hands back the raw text as well, so a snapshot records what is really there", async () => {
        const folder = await worldFolder();
        const text = serializeProjectFile(project());
        await writeFile(join(folder, PROJECT_FILE_NAME), text, "utf8");

        const bytes = await readProjectText(folder);
        expect(bytes.ok).toBe(true);
        if (bytes.ok) expect(bytes.text).toBe(text);
    });
});

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

describe("writing a project into somebody's world", () => {
    it("leaves the folder holding the project and nothing else", async () => {
        const folder = await worldFolder();
        const written = await writeProject(folder, project());

        expect(written.ok).toBe(true);
        // The temporary file the write goes through is gone. One left behind would sit in a
        // world folder forever, looking to every backup tool like a file that matters.
        expect(await contents(folder)).toEqual([PROJECT_FILE_NAME]);
    });

    it("reads legacy state but writes updates only to the Worldlens project name", async () => {
        const folder = await worldFolder();
        await writeFile(
            join(folder, LEGACY_PROJECT_FILE_NAME),
            JSON.stringify({ ...project({ name: "Before rename" }), version: 1 }),
            "utf8",
        );

        const written = await writeProject(folder, project({ name: "After rename" }));
        expect(written.ok).toBe(true);
        expect(await contents(folder)).toEqual([LEGACY_PROJECT_FILE_NAME, PROJECT_FILE_NAME]);
        expect(JSON.parse(await readFile(join(folder, PROJECT_FILE_NAME), "utf8"))).toMatchObject({
            schema: PROJECT_SCHEMA_ID,
            version: PROJECT_FORMAT_VERSION,
            name: "After rename",
        });
    });

    it("never writes the project's own path directly, only a temporary beside it", async () => {
        const folder = await worldFolder();
        const target = join(folder, PROJECT_FILE_NAME);
        const written: string[] = [];

        const io: ProjectFileIo = {
            writeFile: (path) => {
                written.push(path);
                return Promise.resolve();
            },
            rename: () => Promise.resolve(),
            unlink: () => Promise.resolve(),
        };

        await writeProject(folder, project(), { io });

        expect(written).toHaveLength(1);
        expect(written[0]).not.toBe(target);
        expect(written[0]?.startsWith(target)).toBe(true);
        expect(written[0]?.endsWith(PROJECT_TEMP_SUFFIX)).toBe(true);
    });

    /**
     * The property the temporary file exists for.
     *
     * A crash between opening the target and finishing the write is what leaves a project
     * that parses as neither the old settings nor the new ones. Writing elsewhere and
     * renaming means the only state a reader can ever see is one whole file - so a failure
     * at the rename has to leave the *previous* project exactly as it was.
     */
    it("leaves the old project untouched when the write cannot be put in place", async () => {
        const folder = await worldFolder();
        const first = project({ name: "The one that was already there" });
        expect((await writeProject(folder, first)).ok).toBe(true);

        const io: ProjectFileIo = {
            writeFile: (path, text) => writeFile(path, text, "utf8"),
            rename: () => Promise.reject(new Error("the disk went away")),
            unlink: (path) => rm(path, { force: true }),
        };

        const second = await writeProject(folder, project({ name: "Never landed" }), { io });
        expect(second.ok).toBe(false);
        if (!second.ok) expect(second.reason).toContain("left as it was");

        const read = await readProject(folder);
        expect(read.ok).toBe(true);
        if (read.ok) expect(read.project.name).toBe("The one that was already there");

        // And the half-written file was cleared away rather than left in the world.
        expect(await contents(folder)).toEqual([PROJECT_FILE_NAME]);
    });

    it("writes nothing at all when the temporary file itself cannot be written", async () => {
        const folder = await worldFolder();
        expect((await writeProject(folder, project({ name: "Kept" }))).ok).toBe(true);

        const io: ProjectFileIo = {
            writeFile: () => Promise.reject(new Error("the disk is full")),
            rename: () => Promise.reject(new Error("should never be reached")),
            unlink: () => Promise.resolve(),
        };

        const written = await writeProject(folder, project({ name: "Lost" }), { io });
        expect(written.ok).toBe(false);

        const read = await readProject(folder);
        expect(read.ok).toBe(true);
        if (read.ok) expect(read.project.name).toBe("Kept");
        expect(await contents(folder)).toEqual([PROJECT_FILE_NAME]);
    });

    it("replaces a project it could read, and says which one it replaced", async () => {
        const folder = await worldFolder();
        await writeProject(folder, project({ name: "Before" }));

        const written = await writeProject(folder, project({ name: "After" }));
        expect(written.ok).toBe(true);
        if (written.ok) expect(written.replaced?.name).toBe("Before");
    });
});

/* -------------------------------------------------------------------------- */
/* What it refuses to write over                                              */
/* -------------------------------------------------------------------------- */

describe("what a write refuses, and why refusing is the correct answer", () => {
    /**
     * The failure this prevents is not a crash, it is a silent loss.
     *
     * A newer app writes settings this build does not model. Saving over that file keeps the
     * fields this build knows and drops the rest - and nobody finds out until they open the
     * world in the newer app and their maps are gone.
     */
    it("will not save over a project made by a newer version of the app", async () => {
        const folder = await worldFolder();
        const fromTheFuture = JSON.stringify({ ...project(), version: PROJECT_FORMAT_VERSION + 1 });
        await writeFile(join(folder, PROJECT_FILE_NAME), fromTheFuture, "utf8");

        const written = await writeProject(folder, project({ name: "Mine" }));
        expect(written.ok).toBe(false);
        if (!written.ok) {
            expect(written.failure?.kind).toBe("too-new");
            expect(written.reason).toContain("newer version");
        }
        expect(await readFile(join(folder, PROJECT_FILE_NAME), "utf8")).toBe(fromTheFuture);
    });

    it("will not replace a newer project even when told to replace what it cannot read", async () => {
        const folder = await worldFolder();
        const fromTheFuture = JSON.stringify({ ...project(), version: PROJECT_FORMAT_VERSION + 1 });
        await writeFile(join(folder, PROJECT_FILE_NAME), fromTheFuture, "utf8");

        const written = await writeProject(folder, project(), { replaceUnreadable: true });
        expect(written.ok).toBe(false);
        expect(await readFile(join(folder, PROJECT_FILE_NAME), "utf8")).toBe(fromTheFuture);
    });

    it("will not save over a damaged project unless it is told to, in as many words", async () => {
        const folder = await worldFolder();
        await writeFile(join(folder, PROJECT_FILE_NAME), "{ half a file", "utf8");

        const refused = await writeProject(folder, project());
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.failure?.kind).toBe("not-json");
        expect(await readFile(join(folder, PROJECT_FILE_NAME), "utf8")).toBe("{ half a file");

        const allowed = await writeProject(folder, project({ name: "Replaced on purpose" }), {
            replaceUnreadable: true,
        });
        expect(allowed.ok).toBe(true);
        const read = await readProject(folder);
        expect(read.ok && read.project.name).toBe("Replaced on purpose");
    });

    it("will not create the world folder, so a mistyped path does not become a new one", async () => {
        const folder = await worldFolder();
        const written = await writeProject(join(folder, "no-such-world"), project());
        expect(written.ok).toBe(false);
        if (!written.ok) expect(written.reason).toContain("not a folder that exists");
        expect(await contents(folder)).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Staying inside the folder it was given                                     */
/* -------------------------------------------------------------------------- */

describe("nothing is written outside the world folder", () => {
    it("refuses a relative folder instead of resolving it against the working directory", async () => {
        const written = await writeProject("worlds/mine", project());
        expect(written.ok).toBe(false);
        if (!written.ok) expect(written.reason).toContain("not a full path");
    });

    /**
     * Built by concatenation rather than by `join`, which is the point.
     *
     * `join` normalises a `..` away before this code ever sees it, so a test written with it
     * proves nothing about the guard. What arrives over a channel is a string somebody else
     * built, and this is that string: it means the world folder, it reads as somewhere else,
     * and a write that resolved it silently would be a write nobody could audit from the
     * path they were shown.
     */
    it("refuses a path that steps out of a folder, rather than quietly normalising it", async () => {
        const folder = await worldFolder();
        const written = await writeProject(`${folder}/sub/..`, project());
        expect(written.ok).toBe(false);
        if (!written.ok) expect(written.reason).toContain('".."');
        expect(await contents(folder)).toEqual([]);
    });

    it("refuses everything that is not the one file a world holds", () => {
        expect(checkProjectPath(PROJECT_FILE_NAME).ok).toBe(true);
        expect(checkProjectPath(LEGACY_PROJECT_FILE_NAME)).toEqual({ ok: true, path: PROJECT_FILE_NAME });
        // Forward and back slashes are the same name, so a Windows spelling still matches.
        expect(checkProjectPath(`\\${PROJECT_FILE_NAME}`).ok).toBe(false);

        for (const bad of [
            `../${PROJECT_FILE_NAME}`,
            `../../.ssh/authorized_keys`,
            "level.dat",
            "maps/overworld.conf",
            `sub/${PROJECT_FILE_NAME}`,
            "/etc/passwd",
            "C:\\Windows\\System32\\drivers\\etc\\hosts",
            "",
        ]) {
            expect(checkProjectPath(bad).ok, bad).toBe(false);
        }
    });

    it("puts the project at the root of the world and proves it stayed there", async () => {
        const folder = await worldFolder();
        expect(projectFilePath(folder)).toBe(join(folder, PROJECT_FILE_NAME));
    });

    it("checks a folder before anything is joined onto it", () => {
        expect(checkWorldFolder(42).ok).toBe(false);
        expect(checkWorldFolder("   ").ok).toBe(false);
        expect(checkWorldFolder("relative/world").ok).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Deleting, and a project arriving from a renderer                           */
/* -------------------------------------------------------------------------- */

describe("the remaining edges", () => {
    it("treats deleting a project that is not there as the state the caller wanted", async () => {
        const folder = await worldFolder();
        expect((await deleteProject(folder)).ok).toBe(true);

        await writeProject(folder, project());
        expect((await deleteProject(folder)).ok).toBe(true);
        expect(await contents(folder)).toEqual([]);
    });

    it("removes both current and legacy project files during an explicit delete", async () => {
        const folder = await worldFolder();
        await writeFile(join(folder, LEGACY_PROJECT_FILE_NAME), "legacy", "utf8");
        await writeFile(join(folder, PROJECT_FILE_NAME), "current", "utf8");

        expect((await deleteProject(folder)).ok).toBe(true);
        expect(await contents(folder)).toEqual([]);
    });

    it("validates both project paths before deleting either one", async () => {
        const folder = await worldFolder();
        await writeFile(join(folder, PROJECT_FILE_NAME), "current", "utf8");
        await mkdir(join(folder, LEGACY_PROJECT_FILE_NAME));

        const deleted = await deleteProject(folder);
        expect(deleted.ok).toBe(false);
        expect(await readFile(join(folder, PROJECT_FILE_NAME), "utf8")).toBe("current");
    });

    it("validates a project that arrived as an object through the same reader the disk uses", () => {
        expect(checkProjectValue(project()).ok).toBe(true);
        expect(checkProjectValue({ version: 1 }).ok).toBe(false);
        expect(checkProjectValue(undefined).ok).toBe(false);

        // The check that a schema alone would not make: a renderer claiming a newer format.
        const fromTheFuture = checkProjectValue({ ...project(), version: PROJECT_FORMAT_VERSION + 1 });
        expect(fromTheFuture.ok).toBe(false);
        if (!fromTheFuture.ok) expect(fromTheFuture.failure.kind).toBe("too-new");
    });
});
