/**
 * Shared schema pieces.
 *
 * HOCON is loosely typed and Configurate coerces on the way in, so `port: "8100"`
 * and `enabled: yes` both work when the real Java CLI reads them. A schema that
 * rejected those would report a problem in a file BlueMap is perfectly happy
 * with, so the coercions below mirror Configurate's own scalar serialisers.
 *
 * They mirror them exactly, and go no further. Configurate's boolean serialiser
 * takes `true/t/yes/y/1` and `false/f/no/n/0` and nothing else, so `on` and
 * `off` are refused here too, even though several other config formats accept
 * them. Being more generous than the thing that actually reads the file would
 * mean accepting a config the Java CLI then rejects, which is worse than being
 * strict.
 */

import { z } from "zod";
import type { NumberControl, SelectOption, SliderControl, SwitchControl } from "../meta.js";

/** Java `Integer.MIN_VALUE`, used as "no limit" by every mask shape. */
export const JAVA_INT_MIN = -2147483648;
/** Java `Integer.MAX_VALUE`. */
export const JAVA_INT_MAX = 2147483647;
/** Java `Double.MAX_VALUE`, the default radius of a circle mask. */
export const JAVA_DOUBLE_MAX = 1.7976931348623157e308;

const TRUE_WORDS = new Set(["true", "t", "yes", "y", "1"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "0"]);

function coerceBoolean(value: unknown): unknown {
    if (typeof value === "string") {
        const word = value.trim().toLowerCase();
        if (TRUE_WORDS.has(word)) return true;
        if (FALSE_WORDS.has(word)) return false;
        return value;
    }
    if (typeof value === "number") return value !== 0;
    return value;
}

function coerceNumber(value: unknown): unknown {
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
}

function coerceString(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return value;
}

/** A boolean, accepting the words Configurate accepts. */
export function hoconBoolean(): z.ZodType<boolean> {
    return z.preprocess(coerceBoolean, z.boolean());
}

/** A whole number, accepting a numeric string. */
export function hoconInt(bounds?: { min?: number; max?: number }): z.ZodType<number> {
    let schema = z.int();
    if (bounds?.min !== undefined) schema = schema.min(bounds.min);
    if (bounds?.max !== undefined) schema = schema.max(bounds.max);
    return z.preprocess(coerceNumber, schema);
}

/** A real number, accepting a numeric string. */
export function hoconNumber(bounds?: { min?: number; max?: number }): z.ZodType<number> {
    let schema = z.number();
    if (bounds?.min !== undefined) schema = schema.min(bounds.min);
    if (bounds?.max !== undefined) schema = schema.max(bounds.max);
    return z.preprocess(coerceNumber, schema);
}

/** A string, accepting an unquoted number or boolean that meant to be one. */
export function hoconString(): z.ZodType<string> {
    return z.preprocess(coerceString, z.string());
}

/**
 * A hex colour as BlueMap writes it. Both `#rrggbb` and `#rrggbbaa` are accepted
 * because BlueMap's own colour parser takes an alpha channel.
 */
export function hexColor(): z.ZodType<string> {
    return z.preprocess(coerceString, z.string().regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected a hex colour such as #7dabff"));
}

/**
 * A namespaced key such as `minecraft:overworld` or `bluemap:gzip`.
 *
 * BlueMap's `Key.parse` treats anything before the first `:` as the namespace and
 * falls back to a default namespace when there is none, so `gzip` and
 * `bluemap:gzip` are the same key. Nothing here rejects an unknown namespace: a
 * datapack or a mod is free to introduce its own dimension key, and a schema
 * that refused those would break maps that render fine.
 */
export function namespacedKey(): z.ZodType<string> {
    return z.preprocess(coerceString, z.string().regex(/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/, "Expected a key such as minecraft:overworld"));
}

/**
 * Normalises a key the way `Key.parse(value, defaultNamespace)` does, so
 * `gzip` and `bluemap:gzip` compare equal.
 */
export function formatKey(value: string, defaultNamespace: string): string {
    const separator = value.indexOf(":");
    if (separator > 0) return value;
    return `${defaultNamespace}:${value}`;
}

/** An integer vector stored as `{ x, z }`, which is how BlueMap writes `start-pos`. */
export function vector2i(): z.ZodType<{ x: number; z: number }> {
    // Configurate's Vector2i serialiser reads `y` and falls back to `z`, so a
    // file written with either key loads. `z` is what BlueMap generates.
    return z.preprocess(
        (value) => {
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                const record = value as Record<string, unknown>;
                if (record["z"] === undefined && record["y"] !== undefined) return { x: record["x"], z: record["y"] };
            }
            return value;
        },
        z.object({ x: hoconInt(), z: hoconInt() }),
    );
}

/** A double vector stored as `{ x, z }`, used by the polygon mask's shape. */
export function vector2d(): z.ZodType<{ x: number; z: number }> {
    return z.preprocess(
        (value) => {
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                const record = value as Record<string, unknown>;
                if (record["z"] === undefined && record["y"] !== undefined) return { x: record["x"], z: record["y"] };
            }
            return value;
        },
        z.object({ x: hoconNumber(), z: hoconNumber() }),
    );
}

// ---- control shorthands ----------------------------------------------------

export const SWITCH: SwitchControl = { kind: "switch" };

export function integerControl(options: { min?: number; max?: number; step?: number; unit?: string } = {}): NumberControl {
    return { kind: "number", integer: true, ...options };
}

export function decimalControl(options: { min?: number; max?: number; step?: number; unit?: string } = {}): NumberControl {
    return { kind: "number", integer: false, ...options };
}

export function sliderControl(options: { min: number; max: number; step: number; integer: boolean; unit?: string }): SliderControl {
    return { kind: "slider", ...options };
}

/** The four gamemodes `hidden-game-modes` accepts. */
export const GAME_MODE_OPTIONS: readonly SelectOption[] = [
    { value: "survival", label: "Survival" },
    { value: "creative", label: "Creative" },
    { value: "spectator", label: "Spectator" },
    { value: "adventure", label: "Adventure" },
];

/**
 * The compression types BlueMap's registry knows about.
 *
 * `lz4` is in the registry but absent from upstream's own template comment,
 * which lists only the first four. It works; it is just undocumented.
 */
export const COMPRESSION_OPTIONS: readonly SelectOption[] = [
    { value: "gzip", label: "gzip", description: "The default. Widely supported and a good size/speed balance." },
    { value: "zstd", label: "zstd", description: "Smaller and faster than gzip, at the cost of browser support in some setups." },
    { value: "deflate", label: "deflate", description: "Raw deflate, without the gzip container." },
    { value: "lz4", label: "lz4", description: "Fastest and largest. Present in BlueMap's registry but absent from its own documentation." },
    { value: "none", label: "none", description: "No compression. Largest on disk, no CPU cost." },
];

/** The SQL dialects BlueMap ships command sets for. */
export const SQL_DIALECT_OPTIONS: readonly SelectOption[] = [
    { value: "mysql", label: "MySQL", description: "Matches a connection URL starting jdbc:mysql:" },
    { value: "mariadb", label: "MariaDB", description: "Matches a connection URL starting jdbc:mariadb:" },
    { value: "postgresql", label: "PostgreSQL", description: "Matches a connection URL starting jdbc:postgresql:" },
    { value: "sqlite", label: "SQLite", description: "Matches a connection URL starting jdbc:sqlite:" },
];

/** The world loaders BlueMap's registry knows about. Only one, so far. */
export const WORLD_LOADER_OPTIONS: readonly SelectOption[] = [{ value: "anvil", label: "Anvil", description: "Minecraft's own region-file format." }];

/** The vanilla dimensions, offered as suggestions rather than as a closed set. */
export const DIMENSION_OPTIONS: readonly SelectOption[] = [
    { value: "minecraft:overworld", label: "Overworld" },
    { value: "minecraft:the_nether", label: "The Nether" },
    { value: "minecraft:the_end", label: "The End" },
];

/** The vanilla dimension types. A datapack may introduce others. */
export const DIMENSION_TYPE_OPTIONS: readonly SelectOption[] = [
    { value: "minecraft:overworld", label: "Overworld" },
    { value: "minecraft:overworld_caves", label: "Overworld (caves)" },
    { value: "minecraft:the_nether", label: "The Nether" },
    { value: "minecraft:the_end", label: "The End" },
];
