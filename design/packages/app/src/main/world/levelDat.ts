/**
 * The handful of facts in a `level.dat` that somebody picks a world by.
 *
 * The world list has to answer "which of these forty saves is the one I want", and the
 * folder name answers it badly: Minecraft names the folder after the world *as it was
 * first created* and never renames it, so a world called "Survival" in the game can sit
 * in a folder called "New World (2)". The name people recognise, the day they last
 * played, the version it was last opened with, whether it is hardcore - all of that lives
 * in `level.dat` and nowhere else.
 *
 * ## Why this is not `@material-bluemap/nbt`
 *
 * It should have been, and it deliberately is not. `packages/app` does not depend on the
 * nbt package: its `package.json` names `parts`, `server` and `shared`, and pnpm's strict
 * layout means `@material-bluemap/nbt` does not resolve from here at all. Adding the
 * dependency needs an install, and CI installs with `--frozen-lockfile`, so a manifest
 * edit without a matching lockfile update turns every workflow red. What is here instead
 * is deliberately not a general NBT library: it is a one-pass skim that recognises about
 * a dozen names at two known paths inside one known file and skips everything else
 * without materialising it. If the app ever does take the nbt dependency, this whole file
 * should be deleted in favour of it, and the field names below are the same ones
 * `packages/engine/src/world/mca/data/LevelData.ts` and
 * `packages/worldgen/src/levelDat.ts` use, so the swap is mechanical.
 *
 * ## Nothing here guesses
 *
 * Every field is `null` when it was not found or did not have the type it should have.
 * A world whose `level.dat` predates a field simply does not report it, and the interface
 * leaves that part of the line out rather than printing a plausible default. The seed is
 * carried as decimal text because it is a 64-bit signed integer: passing it through a
 * JavaScript number silently rounds any seed past 2^53, which would show somebody a seed
 * that is nearly but not quite the one their world was generated from.
 */

import { readFile } from "node:fs/promises";
import { gunzipSync, inflateSync } from "node:zlib";

/** Minecraft's `GameType`, in the order the game numbers them. */
const GAME_MODES = ["survival", "creative", "adventure", "spectator"] as const;
export type MinecraftGameMode = (typeof GAME_MODES)[number];

export interface LevelDetails {
    /** `LevelName`: the name shown in the game, which is NOT the folder name. */
    readonly levelName: string | null;
    /** `LastPlayed`, milliseconds since the epoch. */
    readonly lastPlayed: number | null;
    /** `Version.Name`, e.g. `1.21.4`. Absent in worlds written before 1.9. */
    readonly versionName: string | null;
    /** `Version.Snapshot`, so a snapshot world can say so rather than look like a release. */
    readonly snapshot: boolean | null;
    /** `DataVersion`, which is the version fact that never lies about itself. */
    readonly dataVersion: number | null;
    readonly gameMode: MinecraftGameMode | null;
    /** `hardcore`. Worth showing: it is the one setting that changes what a death costs. */
    readonly hardcore: boolean | null;
    /** `allowCommands`, which the game calls cheats. */
    readonly cheats: boolean | null;
    /**
     * The world seed as decimal text, from `WorldGenSettings.seed` or the older
     * `RandomSeed`. Text rather than a number: see the note at the top of the file.
     */
    readonly seed: string | null;
    /** Java world spawn, in block coordinates. Read independently; callers require the pair. */
    readonly spawnX: number | null;
    readonly spawnZ: number | null;
}

const NOTHING_KNOWN: LevelDetails = {
    levelName: null,
    lastPlayed: null,
    versionName: null,
    snapshot: null,
    dataVersion: null,
    gameMode: null,
    hardcore: null,
    cheats: null,
    seed: null,
    spawnX: null,
    spawnZ: null,
};

/**
 * The largest `level.dat` this will decompress.
 *
 * A real one is a few kilobytes and a heavily modded one is a few hundred. The cap is
 * here so that a file that merely *is called* `level.dat` cannot be used to make the app
 * allocate whatever it likes, and it is far enough above any real world that no world
 * reaches it.
 */
export const MAX_LEVEL_DAT_BYTES = 8 * 1024 * 1024;

/** How deep a compound or list may nest before this stops following it. */
const MAX_DEPTH = 64;

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

/**
 * Reads a `level.dat` and reports what it could learn from it.
 *
 * Rejects when the file cannot be read or is not NBT at all, because "this folder holds
 * something called level.dat that is not a level.dat" is worth saying out loud. It does
 * NOT reject for a field it did not recognise: an unknown tag is skipped, and a truncated
 * file gives back whatever was read before the end, so a partially corrupt world still
 * lists with its name rather than disappearing from the list.
 */
export async function readLevelDat(path: string): Promise<LevelDetails> {
    const raw = await readFile(path);
    if (raw.byteLength > MAX_LEVEL_DAT_BYTES) {
        throw new Error(`${path} is far larger than any level.dat, so it was not read.`);
    }
    return parseLevelDat(decompress(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)));
}

/**
 * Gzip, zlib or neither, detected from the first bytes.
 *
 * The same three cases `packages/nbt/src/compression.ts` handles, restated here for the
 * reason given at the top of the file. Minecraft writes `level.dat` gzipped; a world
 * copied through a tool that re-wrote it may be uncompressed, and reading that is free.
 */
function decompress(data: Uint8Array): Uint8Array {
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) return new Uint8Array(gunzipSync(data));
    if (data.length >= 1 && data[0] === 0x78) return new Uint8Array(inflateSync(data));
    return data;
}

/**
 * Reads the decompressed bytes.
 *
 * Exported for the tests, which build a `level.dat` byte by byte so that every branch
 * here is exercised against bytes rather than against a fixture nobody can read.
 */
export function parseLevelDat(bytes: Uint8Array): LevelDetails {
    const cursor = new Cursor(bytes);
    if (cursor.u8() !== TAG_COMPOUND) {
        throw new Error("That level.dat does not start with an NBT compound, so it is not a level.dat.");
    }
    cursor.skipString(); // The root compound's name, which Minecraft leaves empty.

    const found: Mutable = { ...NOTHING_KNOWN };

    try {
        // Everything interesting is under `Data`. An entry at the root is read too rather
        // than ignored: a few third-party tools write the file flat, and reading a name
        // that is really there costs nothing.
        for (const entry of compoundEntries(cursor, 1)) {
            if (entry.name === "Data" && entry.type === TAG_COMPOUND) readDataCompound(cursor, found, 2);
            else readDataField(cursor, entry, found, 2);
        }
    } catch (error) {
        // A file that stops in the middle of a value keeps whatever was read before the
        // stop. That is what a world whose disk filled up mid-save looks like, and losing
        // its name over the last few bytes would be the less useful answer.
        if (!(error instanceof EndOfData)) throw error;
    }

    return { ...found };
}

type Mutable = { -readonly [K in keyof LevelDetails]: LevelDetails[K] };

interface Entry {
    readonly type: number;
    readonly name: string;
}

/**
 * Walks the entries of the compound the cursor is positioned inside.
 *
 * A generator so that each caller decides, per entry, whether to read the value or leave
 * it to be skipped: the loop below consumes any value the body did not, which is what
 * keeps the cursor aligned no matter which fields a given world happens to carry.
 */
function* compoundEntries(cursor: Cursor, depth: number): Generator<Entry> {
    if (depth > MAX_DEPTH) {
        cursor.skipUntilEnd(depth);
        return;
    }
    for (;;) {
        if (cursor.done()) return;
        const type = cursor.u8();
        if (type === TAG_END) return;
        const name = cursor.string();
        const before = cursor.offset;
        yield { type, name };
        // Untouched by the body, so it is skipped here. Comparing the offset rather than
        // trusting the body to report back is what makes a new case impossible to get
        // half right: reading the value and skipping it are both correct, doing neither
        // would desynchronise every later field, and this cannot tell the difference.
        if (cursor.offset === before) cursor.skipValue(type, depth + 1);
    }
}

function readDataCompound(cursor: Cursor, found: Mutable, depth: number): void {
    for (const entry of compoundEntries(cursor, depth)) {
        readDataField(cursor, entry, found, depth + 1);
    }
}

/** One field of `Data`, when it is one of the ones worth showing. */
function readDataField(cursor: Cursor, entry: Entry, found: Mutable, depth: number): void {
    switch (entry.name) {
        case "LevelName":
            if (entry.type === TAG_STRING) found.levelName = nonEmpty(cursor.string());
            return;
        case "LastPlayed":
            // Minecraft writes a millisecond stamp. A zero is what `packages/worldgen`
            // writes deliberately so a generated world is byte-for-byte reproducible, and
            // it means "never", so it is dropped rather than rendered as 1 January 1970.
            if (entry.type === TAG_LONG) found.lastPlayed = millis(cursor.i64());
            return;
        case "DataVersion":
            if (entry.type === TAG_INT) found.dataVersion = cursor.i32();
            return;
        case "GameType":
            if (entry.type === TAG_INT) found.gameMode = GAME_MODES[cursor.i32()] ?? null;
            return;
        case "hardcore":
            if (entry.type === TAG_BYTE) found.hardcore = cursor.u8() !== 0;
            return;
        case "allowCommands":
            if (entry.type === TAG_BYTE) found.cheats = cursor.u8() !== 0;
            return;
        case "RandomSeed":
            // The pre-1.16 spelling. Only taken when `WorldGenSettings.seed` has not
            // already been read, because a world carrying both carries the new one as the
            // one the game actually used.
            if (entry.type === TAG_LONG && found.seed === null) found.seed = cursor.i64().toString();
            return;
        case "SpawnX":
            if (entry.type === TAG_INT) found.spawnX = cursor.i32();
            return;
        case "SpawnZ":
            if (entry.type === TAG_INT) found.spawnZ = cursor.i32();
            return;
        case "Version":
            if (entry.type === TAG_COMPOUND) readVersionCompound(cursor, found, depth);
            return;
        case "WorldGenSettings":
            if (entry.type === TAG_COMPOUND) readWorldGenSettings(cursor, found, depth);
            return;
        default:
            return;
    }
}

function readVersionCompound(cursor: Cursor, found: Mutable, depth: number): void {
    for (const entry of compoundEntries(cursor, depth)) {
        if (entry.name === "Name" && entry.type === TAG_STRING) found.versionName = nonEmpty(cursor.string());
        else if (entry.name === "Snapshot" && entry.type === TAG_BYTE) found.snapshot = cursor.u8() !== 0;
    }
}

/**
 * `WorldGenSettings`, for the seed alone.
 *
 * Its `dimensions` entry holds an inline copy of every dimension type in the world and is
 * the largest thing in the file by a wide margin. Nothing here reads it: the loop skips
 * any entry the body did not consume, so the whole registry is stepped over without being
 * decoded, which is what keeps reading a hundred worlds cheap.
 */
function readWorldGenSettings(cursor: Cursor, found: Mutable, depth: number): void {
    for (const entry of compoundEntries(cursor, depth)) {
        if (entry.name === "seed" && entry.type === TAG_LONG) found.seed = cursor.i64().toString();
    }
}

function nonEmpty(value: string): string | null {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

/**
 * A `LastPlayed` as a millisecond timestamp, or null when it is not one.
 *
 * Zero and negative values mean "never recorded". The upper bound catches a field that
 * was written in seconds rather than milliseconds by a third-party tool, which would
 * otherwise present as a date tens of thousands of years out.
 */
function millis(value: bigint): number | null {
    if (value <= 0n) return null;
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) return null;
    // 1 January 3000, comfortably past any real save and short of a mis-scaled field.
    if (asNumber > 32_503_680_000_000) return null;
    return asNumber;
}

/**
 * A byte cursor over the decompressed NBT.
 *
 * Every read is bounds-checked and throws {@link EndOfData}, which the caller turns into
 * "read what was there". A truncated `level.dat` is a real thing - it is what a world
 * whose disk filled up mid-save looks like - and losing the world's name over it would be
 * a worse answer than showing the name and saying the rest could not be read.
 */
class EndOfData extends Error {
    constructor() {
        super("The level.dat ended in the middle of a value.");
        this.name = "EndOfData";
    }
}

class Cursor {
    private readonly view: DataView;
    offset = 0;

    constructor(private readonly bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    done(): boolean {
        return this.offset >= this.bytes.length;
    }

    private need(count: number): number {
        const at = this.offset;
        if (at + count > this.bytes.length) throw new EndOfData();
        this.offset = at + count;
        return at;
    }

    u8(): number {
        return this.view.getUint8(this.need(1));
    }

    i16(): number {
        return this.view.getInt16(this.need(2), false);
    }

    i32(): number {
        return this.view.getInt32(this.need(4), false);
    }

    i64(): bigint {
        return this.view.getBigInt64(this.need(8), false);
    }

    string(): string {
        const length = this.view.getUint16(this.need(2), false);
        const at = this.need(length);
        return decodeModifiedUtf8(this.bytes.subarray(at, at + length));
    }

    skipString(): void {
        const length = this.view.getUint16(this.need(2), false);
        this.need(length);
    }

    /** Steps over one value of the given type, following compounds and lists. */
    skipValue(type: number, depth: number): void {
        if (depth > MAX_DEPTH) throw new EndOfData();
        switch (type) {
            case TAG_BYTE:
                this.need(1);
                return;
            case TAG_SHORT:
                this.need(2);
                return;
            case TAG_INT:
            case TAG_FLOAT:
                this.need(4);
                return;
            case TAG_LONG:
            case TAG_DOUBLE:
                this.need(8);
                return;
            case TAG_STRING:
                this.skipString();
                return;
            case TAG_BYTE_ARRAY:
                this.needArray(1);
                return;
            case TAG_INT_ARRAY:
                this.needArray(4);
                return;
            case TAG_LONG_ARRAY:
                this.needArray(8);
                return;
            case TAG_LIST: {
                const itemType = this.u8();
                const count = this.i32();
                if (count < 0) throw new EndOfData();
                for (let index = 0; index < count; index += 1) this.skipValue(itemType, depth + 1);
                return;
            }
            case TAG_COMPOUND:
                this.skipUntilEnd(depth);
                return;
            case TAG_END:
                return;
            default:
                // A tag id NBT does not define. Continuing would read alignment noise as
                // real fields, so this stops rather than inventing values.
                throw new EndOfData();
        }
    }

    /** Consumes entries until this compound's END tag, whatever is in it. */
    skipUntilEnd(depth: number): void {
        for (;;) {
            const type = this.u8();
            if (type === TAG_END) return;
            this.skipString();
            this.skipValue(type, depth + 1);
        }
    }

    private needArray(itemBytes: number): void {
        const count = this.i32();
        if (count < 0) throw new EndOfData();
        this.need(count * itemBytes);
    }
}

/**
 * Java's modified UTF-8, which is what NBT stores every name and string in.
 *
 * It differs from UTF-8 in two ways that matter: `U+0000` is written as the two bytes
 * `C0 80`, and a character outside the basic plane is written as its two UTF-16
 * surrogates encoded separately. Both fall out of decoding each sequence to a UTF-16 code
 * unit and concatenating, because a JavaScript string *is* UTF-16, so a surrogate pair
 * decoded as two units is the correct single character. A byte that begins no valid
 * sequence becomes U+FFFD rather than throwing: a world named with one broken byte should
 * still be listed.
 */
function decodeModifiedUtf8(bytes: Uint8Array): string {
    let out = "";
    let index = 0;
    while (index < bytes.length) {
        const first = bytes[index] ?? 0;
        index += 1;
        if (first < 0x80) {
            out += String.fromCharCode(first);
        } else if ((first & 0xe0) === 0xc0) {
            const second = bytes[index] ?? 0;
            index += 1;
            out += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
        } else if ((first & 0xf0) === 0xe0) {
            const second = bytes[index] ?? 0;
            const third = bytes[index + 1] ?? 0;
            index += 2;
            out += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
        } else {
            out += "�";
        }
    }
    return out;
}
