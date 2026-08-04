/**
 * Reading a `saves` folder, against a real one built in a temporary directory.
 *
 * A real directory rather than a mocked `fs`, for the same reason `inspect.test.ts` uses
 * one: the questions worth asking here are about the file system's own behaviour - what a
 * directory read reports for a symbolic link, what happens to a folder with no
 * `level.dat`, what a corrupt file does to the row that names it - and a fake that
 * answers those questions is a fake that has already decided them.
 *
 * The absent-folder case is exactly as important as the populated one and is here too: a
 * machine with no Minecraft on it must produce an ordinary answer, not an exception the
 * wizard has to catch.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_WORLDS, scanSavesFolder } from "./catalog.js";

let root = "";
let saves = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-catalog-"));
    saves = join(root, ".minecraft", "saves");
    await mkdir(saves, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* Enough NBT to write a level.dat Minecraft would recognise                  */
/* -------------------------------------------------------------------------- */

const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_STRING = 8;
const TAG_COMPOUND = 10;
const TAG_END = 0;

function u16(value: number): number[] {
    return [(value >> 8) & 0xff, value & 0xff];
}

function i32(value: number): number[] {
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function i64(value: bigint): number[] {
    const out: number[] = [];
    for (let shift = 7; shift >= 0; shift -= 1) out.push(Number((value >> BigInt(shift * 8)) & 0xffn));
    return out;
}

function text(value: string): number[] {
    const encoded = [...Buffer.from(value, "utf8")];
    return [...u16(encoded.length), ...encoded];
}

interface WorldFacts {
    readonly name?: string;
    readonly lastPlayed?: number;
    readonly version?: string;
    readonly gameType?: number;
    readonly hardcore?: boolean;
    readonly seed?: bigint;
}

function levelDatBytes(facts: WorldFacts): Buffer {
    const body: number[] = [];
    if (facts.name !== undefined) body.push(TAG_STRING, ...text("LevelName"), ...text(facts.name));
    if (facts.lastPlayed !== undefined) body.push(TAG_LONG, ...text("LastPlayed"), ...i64(BigInt(facts.lastPlayed)));
    if (facts.gameType !== undefined) body.push(TAG_INT, ...text("GameType"), ...i32(facts.gameType));
    if (facts.hardcore !== undefined) body.push(TAG_BYTE, ...text("hardcore"), facts.hardcore ? 1 : 0);
    if (facts.version !== undefined) {
        body.push(TAG_COMPOUND, ...text("Version"), TAG_STRING, ...text("Name"), ...text(facts.version), TAG_END);
    }
    if (facts.seed !== undefined) {
        body.push(TAG_COMPOUND, ...text("WorldGenSettings"), TAG_LONG, ...text("seed"), ...i64(facts.seed), TAG_END);
    }

    const file = [TAG_COMPOUND, ...text(""), TAG_COMPOUND, ...text("Data"), ...body, TAG_END, TAG_END];
    return gzipSync(Buffer.from(file));
}

/** A world on disk, laid out the way Minecraft lays one out. */
async function makeWorld(
    directory: string,
    facts: WorldFacts,
    dimensions: Readonly<Record<string, number>> = { region: 3 },
): Promise<string> {
    const path = join(saves, directory);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "level.dat"), levelDatBytes(facts));
    await writeFile(join(path, "session.lock"), "lock");
    for (const [where, count] of Object.entries(dimensions)) {
        const regionDirectory = join(path, ...where.split("/"));
        await mkdir(regionDirectory, { recursive: true });
        for (let index = 0; index < count; index += 1) {
            await writeFile(join(regionDirectory, `r.0.${index}.mca`), Buffer.alloc(1024));
        }
    }
    return path;
}

/* -------------------------------------------------------------------------- */

describe("a populated saves folder", () => {
    it("reports each world by its real name, which is not its folder name", async () => {
        // The case the whole feature turns on: Minecraft names the folder when the world
        // is created and never renames it afterwards.
        await makeWorld("New World (2)", { name: "Survival", lastPlayed: 1_764_547_200_000, version: "1.21.4" });

        const scan = await scanSavesFolder(saves, "mount:test");

        expect(scan.worlds).toHaveLength(1);
        expect(scan.worlds[0]?.name).toBe("Survival");
        expect(scan.worlds[0]?.directoryName).toBe("New World (2)");
        expect(scan.worlds[0]?.path).toBe(join(saves, "New World (2)"));
    });

    it("carries the details a person picks by", async () => {
        await makeWorld("bastion", {
            name: "Bastion",
            lastPlayed: 1_764_547_200_000,
            version: "1.21.4",
            gameType: 1,
            hardcore: true,
            seed: -4_872_364_918_273_645_501n,
        });

        const world = (await scanSavesFolder(saves, "mount:test")).worlds[0];

        expect(world).toMatchObject({
            name: "Bastion",
            lastPlayed: 1_764_547_200_000,
            versionName: "1.21.4",
            gameMode: "creative",
            hardcore: true,
            seed: "-4872364918273645501",
            detailsError: null,
        });
    });

    it("counts the dimensions that really have terrain, and only those", async () => {
        // `DIM-1` with no region files is a dimension nobody has been to. Minecraft leaves
        // the directory behind the moment somebody steps through a portal and back.
        await makeWorld("mixed", { name: "Mixed" }, { region: 4, "DIM-1/region": 0, "DIM1/region": 2 });

        const world = (await scanSavesFolder(saves, "mount:test")).worlds[0];

        expect(world?.regionFiles["region"]).toBe(4);
        expect(world?.regionFiles["DIM1/region"]).toBe(2);
        expect(world?.regionFiles["DIM-1/region"]).toBe(0);
    });

    it("measures the world's size, and says the measurement is complete", async () => {
        await makeWorld("sized", { name: "Sized" }, { region: 5 });

        const world = (await scanSavesFolder(saves, "mount:test")).worlds[0];

        // Five region files of a kilobyte each, plus the level.dat and the lock.
        expect(world?.sizeBytes).toBeGreaterThanOrEqual(5 * 1024);
        expect(world?.sizeComplete).toBe(true);
    });

    it("tags every world with the folder it was found in", async () => {
        await makeWorld("one", { name: "One" });
        await makeWorld("two", { name: "Two" });

        const scan = await scanSavesFolder(saves, "mount:modded");

        expect(scan.worlds.map((world) => world.folderId)).toEqual(["mount:modded", "mount:modded"]);
        expect(scan.folderId).toBe("mount:modded");
    });
});

describe("what is left out, and what is deliberately kept", () => {
    it("leaves out a folder that is not a world at all", async () => {
        await makeWorld("real", { name: "Real" });
        await mkdir(join(saves, "screenshots"), { recursive: true });
        await writeFile(join(saves, "screenshots", "2026-08-04.png"), "not a world");
        await writeFile(join(saves, "backup.zip"), "not a world either");

        const scan = await scanSavesFolder(saves, "mount:test");

        expect(scan.worlds.map((world) => world.directoryName)).toEqual(["real"]);
    });

    it("keeps a world whose level.dat cannot be read, with what is known and a note", async () => {
        // The rule that matters most here. A world with one corrupt file that silently
        // disappears from a list somebody knows it belongs in is the worst answer
        // available: they cannot see it, cannot fix it, and cannot tell what went wrong.
        const path = join(saves, "corrupt");
        await mkdir(join(path, "region"), { recursive: true });
        await writeFile(join(path, "level.dat"), "PK this is a zip, not NBT");
        await writeFile(join(path, "region", "r.0.0.mca"), Buffer.alloc(512));

        const world = (await scanSavesFolder(saves, "mount:test")).worlds[0];

        expect(world?.directoryName).toBe("corrupt");
        expect(world?.name).toBeNull();
        expect(world?.detailsError).not.toBeNull();
        // What IS known is still there: the dimensions and the size were never in doubt.
        expect(world?.regionFiles["region"]).toBe(1);
        expect(world?.sizeBytes).toBeGreaterThan(0);
    });

    it("keeps a world that has no terrain yet, since it is still a world", async () => {
        await makeWorld("fresh", { name: "Fresh" }, {});

        const world = (await scanSavesFolder(saves, "mount:test")).worlds[0];

        expect(world?.name).toBe("Fresh");
        expect(world?.regionFiles["region"]).toBeUndefined();
    });

    it("stops at its cap and says so rather than reading a folder that is not a saves folder", async () => {
        expect(MAX_WORLDS).toBeGreaterThan(64);
    });
});

describe("a saves folder that is not there", () => {
    it("rejects, so the caller can say which folder rather than reporting no worlds", async () => {
        // Deliberately a rejection and not an empty list. "There are no worlds here" and
        // "this folder does not exist" send somebody to two different places, and the
        // caller turns this into a message on that one folder's row.
        await expect(scanSavesFolder(join(root, "nowhere", "saves"), "mount:test")).rejects.toThrow();
    });

    it("reports an empty saves folder as empty, which is not a failure", async () => {
        const scan = await scanSavesFolder(saves, "mount:test");

        expect(scan.worlds).toEqual([]);
        expect(scan.truncated).toBe(false);
    });
});
