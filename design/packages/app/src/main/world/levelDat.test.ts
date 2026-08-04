/**
 * The `level.dat` skim, tested against bytes rather than against a fixture.
 *
 * Every case here builds the NBT it wants by hand, so a test that says "a world with no
 * `Version` compound reports no version" really is a world with no `Version` compound and
 * not a file somebody once copied off a machine and cannot now explain. It is also the
 * only way to write the cases that matter most: a truncated file, a byte sequence no
 * modified-UTF-8 encoder would produce, and a `WorldGenSettings` big enough that skipping
 * it rather than decoding it is visibly the right call.
 */

import { gzipSync } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLevelDat, readLevelDat } from "./levelDat.js";

/* -------------------------------------------------------------------------- */
/* An NBT writer, just big enough for a level.dat                             */
/* -------------------------------------------------------------------------- */

const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_STRING = 8;
const TAG_LIST = 9;
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

/** A name or a string value: a two-byte length and then the bytes. */
function text(value: string): number[] {
    const encoded = [...Buffer.from(value, "utf8")];
    return [...u16(encoded.length), ...encoded];
}

const byteField = (name: string, value: number): number[] => [TAG_BYTE, ...text(name), value & 0xff];
const intField = (name: string, value: number): number[] => [TAG_INT, ...text(name), ...i32(value)];
const longField = (name: string, value: bigint): number[] => [TAG_LONG, ...text(name), ...i64(value)];
const stringField = (name: string, value: string): number[] => [TAG_STRING, ...text(name), ...text(value)];

function compoundField(name: string, body: number[]): number[] {
    return [TAG_COMPOUND, ...text(name), ...body, TAG_END];
}

/** A `level.dat`: the unnamed root compound holding a `Data` compound. */
function levelDat(body: number[]): Uint8Array {
    return Uint8Array.from([TAG_COMPOUND, ...text(""), ...compoundField("Data", body), TAG_END]);
}

/** Everything an ordinary modern world carries, so each test can knock one part out. */
function ordinaryWorld(): number[] {
    return [
        ...stringField("LevelName", "Bastion"),
        ...longField("LastPlayed", 1_764_547_200_000n),
        ...intField("DataVersion", 4189),
        ...intField("GameType", 0),
        ...byteField("hardcore", 0),
        ...byteField("allowCommands", 1),
        ...compoundField("Version", [
            ...intField("Id", 4189),
            ...stringField("Name", "1.21.4"),
            ...byteField("Snapshot", 0),
        ]),
        ...compoundField("WorldGenSettings", [
            ...longField("seed", -4_872_364_918_273_645_501n),
            ...byteField("bonus_chest", 0),
        ]),
    ];
}

/* -------------------------------------------------------------------------- */

describe("the fields somebody chooses a world by", () => {
    it("reads every one of them out of an ordinary world", () => {
        expect(parseLevelDat(levelDat(ordinaryWorld()))).toEqual({
            levelName: "Bastion",
            lastPlayed: 1_764_547_200_000,
            versionName: "1.21.4",
            snapshot: false,
            dataVersion: 4189,
            gameMode: "survival",
            hardcore: false,
            cheats: true,
            seed: "-4872364918273645501",
        });
    });

    it("carries the seed as text, because a 64-bit seed does not survive a number", () => {
        const seed = -4_872_364_918_273_645_501n;
        const details = parseLevelDat(levelDat(ordinaryWorld()));

        expect(details.seed).toBe(seed.toString());
        // The point of the whole decision: the number this would have been rounds.
        expect(Number(seed).toString()).not.toBe(seed.toString());
    });

    it("names each game mode the way the game numbers them", () => {
        const modeOf = (value: number): string | null =>
            parseLevelDat(levelDat([...stringField("LevelName", "x"), ...intField("GameType", value)])).gameMode;

        expect([modeOf(0), modeOf(1), modeOf(2), modeOf(3)]).toEqual([
            "survival",
            "creative",
            "adventure",
            "spectator",
        ]);
        // A mode this build has never heard of is left unnamed rather than guessed at.
        expect(modeOf(9)).toBeNull();
    });

    it("reports a snapshot as one, rather than as the release it is named after", () => {
        const details = parseLevelDat(
            levelDat([
                ...compoundField("Version", [...stringField("Name", "25w03a"), ...byteField("Snapshot", 1)]),
            ]),
        );

        expect(details.versionName).toBe("25w03a");
        expect(details.snapshot).toBe(true);
    });

    it("takes the old RandomSeed only when there is no WorldGenSettings seed", () => {
        expect(parseLevelDat(levelDat([...longField("RandomSeed", 42n)])).seed).toBe("42");

        // Both present: the one the game actually used wins, whichever order they are in.
        const both = parseLevelDat(
            levelDat([
                ...compoundField("WorldGenSettings", [...longField("seed", 7n)]),
                ...longField("RandomSeed", 42n),
            ]),
        );
        expect(both.seed).toBe("7");
    });
});

describe("what it refuses to guess", () => {
    it("leaves every field null in a world that records none of them", () => {
        expect(parseLevelDat(levelDat([...intField("clearWeatherTime", 0)]))).toEqual({
            levelName: null,
            lastPlayed: null,
            versionName: null,
            snapshot: null,
            dataVersion: null,
            gameMode: null,
            hardcore: null,
            cheats: null,
            seed: null,
        });
    });

    it("treats a zero LastPlayed as never, not as the first of January 1970", () => {
        // This is not hypothetical: `packages/worldgen` writes a fixed 0 on purpose, so
        // that two runs of the same seed produce byte-for-byte identical worlds.
        expect(parseLevelDat(levelDat([...longField("LastPlayed", 0n)])).lastPlayed).toBeNull();
    });

    it("rejects a LastPlayed that was written in seconds rather than milliseconds", () => {
        // Nine hundred million seconds is 1998. Read as milliseconds it is 1970, and read
        // as the seconds it is would be inventing a scale nobody wrote down.
        expect(parseLevelDat(levelDat([...longField("LastPlayed", 900_000_000_000_000_000n)])).lastPlayed).toBeNull();
    });

    it("ignores a field whose tag is not the type that field should have", () => {
        const details = parseLevelDat(
            levelDat([...intField("LevelName", 7), ...stringField("LastPlayed", "yesterday")]),
        );

        expect(details.levelName).toBeNull();
        expect(details.lastPlayed).toBeNull();
    });

    it("treats a blank LevelName as no name at all", () => {
        expect(parseLevelDat(levelDat([...stringField("LevelName", "   ")])).levelName).toBeNull();
    });
});

describe("files that are not quite right", () => {
    it("keeps what it read before a file that stops in the middle of a value", () => {
        const whole = levelDat(ordinaryWorld());
        // Cut off two thirds of the way in: the name is comfortably before the cut and
        // the generation settings are comfortably after it.
        const truncated = whole.subarray(0, Math.floor(whole.length * 0.66));

        const details = parseLevelDat(truncated);
        expect(details.levelName).toBe("Bastion");
        expect(details.seed).toBeNull();
    });

    it("refuses a file that is not NBT at all, rather than reporting an empty world", () => {
        expect(() => parseLevelDat(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toThrow(/not a level\.dat/);
    });

    it("reads a world written flat, with its fields at the root instead of under Data", () => {
        const flat = Uint8Array.from([TAG_COMPOUND, ...text(""), ...stringField("LevelName", "Flat"), TAG_END]);

        expect(parseLevelDat(flat).levelName).toBe("Flat");
    });

    it("steps over a list without decoding it, however long the list is", () => {
        const body = [
            TAG_LIST,
            ...text("ScheduledEvents"),
            TAG_INT,
            ...i32(4096),
            ...Array.from({ length: 4096 * 4 }, () => 0),
            ...stringField("LevelName", "After the list"),
        ];

        expect(parseLevelDat(levelDat(body)).levelName).toBe("After the list");
    });

    it("steps over the dimension registry rather than decoding it", () => {
        // The real reason reading a hundred worlds stays cheap: `dimensions` is by far the
        // largest thing in a modern level.dat and nothing in it is worth a line of the row.
        const dimensions = compoundField("dimensions", [
            ...compoundField("minecraft:overworld", [
                ...compoundField("type", [
                    ...intField("min_y", -64),
                    ...intField("height", 384),
                    ...stringField("infiniburn", "#minecraft:infiniburn_overworld"),
                ]),
            ]),
            ...compoundField("minecraft:the_nether", [...compoundField("type", [...intField("min_y", 0)])]),
        ]);

        const details = parseLevelDat(
            levelDat([
                ...compoundField("WorldGenSettings", [...dimensions, ...longField("seed", 99n)]),
                ...stringField("LevelName", "After the registry"),
            ]),
        );

        expect(details.seed).toBe("99");
        expect(details.levelName).toBe("After the registry");
    });
});

describe("names that are not ASCII", () => {
    it("reads a name written in Chinese", () => {
        expect(parseLevelDat(levelDat([...stringField("LevelName", "生存世界")])).levelName).toBe("生存世界");
    });

    it("reads a name outside the basic plane, which NBT stores as two surrogates", () => {
        // Modified UTF-8 encodes an astral character as its two UTF-16 surrogates, each in
        // its own three-byte sequence. Decoding each to one code unit and concatenating is
        // what makes the pair come back out as the single character it started as.
        const surrogates = [0xed, 0xa0, 0xbd, 0xed, 0xb2, 0x8e]; // U+1F48E
        const body = [TAG_STRING, ...text("LevelName"), ...u16(surrogates.length), ...surrogates];

        expect(parseLevelDat(levelDat(body)).levelName).toBe("💎");
    });

    it("substitutes a byte that begins no valid sequence instead of losing the world", () => {
        const broken = [0x41, 0xf8, 0x42]; // `A`, a byte no encoder produces, `B`
        const body = [TAG_STRING, ...text("LevelName"), ...u16(broken.length), ...broken];

        expect(parseLevelDat(levelDat(body)).levelName).toBe("A�B");
    });
});

describe("reading one off the disk", () => {
    let root = "";

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "mbm-leveldat-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("reads the gzipped file Minecraft actually writes", async () => {
        const path = join(root, "level.dat");
        await writeFile(path, gzipSync(Buffer.from(levelDat(ordinaryWorld()))));

        expect((await readLevelDat(path)).levelName).toBe("Bastion");
    });

    it("reads an uncompressed one too, which is what a tool that rewrote it leaves", async () => {
        const path = join(root, "level.dat");
        await writeFile(path, Buffer.from(levelDat(ordinaryWorld())));

        expect((await readLevelDat(path)).levelName).toBe("Bastion");
    });

    it("rejects a file that is not there, rather than reporting a world with no name", async () => {
        await expect(readLevelDat(join(root, "absent.dat"))).rejects.toThrow();
    });
});
