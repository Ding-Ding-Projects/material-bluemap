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
import type { NumberControl, SelectOption, SliderControl, SwitchControl, TextToken } from "../meta.js";

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
 * The shape of a hex colour, named rather than inlined.
 *
 * `controlPolicy.test.ts` walks every schema and asks each string leaf which of
 * these patterns it carries, so that a colour field can be *recognised* from its
 * schema rather than from a list of paths somebody has to remember to extend.
 * That is what stops `sky-color` quietly becoming a text box the day a sixth
 * colour setting is added and copied from the wrong neighbour.
 */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** The shape of a BlueMap registry key. Recognised the same way, for the same reason. */
export const NAMESPACED_KEY_PATTERN = /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

/**
 * A hex colour as BlueMap writes it. Both `#rrggbb` and `#rrggbbaa` are accepted
 * because BlueMap's own colour parser takes an alpha channel.
 */
export function hexColor(): z.ZodType<string> {
    return z.preprocess(coerceString, z.string().regex(HEX_COLOR_PATTERN, "Expected a hex colour such as #7dabff"));
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
    return z.preprocess(coerceString, z.string().regex(NAMESPACED_KEY_PATTERN, "Expected a key such as minecraft:overworld"));
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

/**
 * The default namespace BlueMap parses its own registry keys with.
 *
 * Storage types, compressions, SQL dialects and world loaders are all
 * `Key.parse(value, Key.BLUEMAP_NAMESPACE)`, so `gzip` and `bluemap:gzip` name
 * the same entry. Dimensions go through the ordinary `Key.parse`, whose default
 * namespace is `minecraft`.
 */
export const BLUEMAP_NAMESPACE = "bluemap";
/** The default namespace `Key.parse` uses when a key names no namespace. */
export const MINECRAFT_NAMESPACE = "minecraft";

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

/**
 * The addresses `WebserverConfig.resolveIp` treats specially, plus the one most
 * people actually want.
 *
 * Three of these four are not addresses at all, which is exactly why this field
 * stopped being a plain text box. `""`, `"0.0.0.0"` and `"::0"` all fall into
 * the same branch and bind every interface; `"#getLocalHost"` is a keyword that
 * resolves the machine's own host name; anything else goes to
 * `InetAddress.getByName`. A person typing into an empty field has no way to
 * discover the keyword, and no reason to guess that an empty value means
 * "everywhere" rather than "nothing". Free entry stays open because a real host
 * name or literal address is the whole point of the field.
 */
export const LISTEN_ADDRESS_OPTIONS: readonly SelectOption[] = [
    { value: "0.0.0.0", label: "Every interface (IPv4)", description: "Reachable from anywhere that can route to this machine. This is the default." },
    { value: "::0", label: "Every interface (IPv6)", description: "The same branch as 0.0.0.0 and an empty value: BlueMap binds the wildcard address." },
    { value: "127.0.0.1", label: "This machine only", description: "Loopback. Nothing outside this machine can reach the server, which suits a reverse proxy in front of it." },
    { value: "#getLocalHost", label: "Resolve the local host name", description: "BlueMap calls InetAddress.getLocalHost() and binds whatever that resolves to." },
];

/**
 * The resolutions upstream's own comment lists for `resolution-default`.
 *
 * The Java field is a `float`, so anything loads. The list is what BlueMap
 * documents, and free entry stays open so a value from a hand-edited file is
 * still shown rather than silently replaced with a blank control.
 */
export const RESOLUTION_OPTIONS: readonly SelectOption[] = [
    { value: 0.5, label: "Half", description: "Renders at half resolution. Fastest, and blurry on a high-density display." },
    { value: 1, label: "Normal" },
    { value: 2, label: "Double", description: "Renders at twice the resolution. Sharpest, and the most expensive to draw." },
];

/** The two storage types BlueMap's registry holds, written as its templates write them. */
export const STORAGE_TYPE_OPTIONS: readonly SelectOption[] = [
    { value: "file", label: "File", description: "Tiles are written to a folder on disk." },
    { value: "sql", label: "SQL", description: "Tiles are written to a database through JDBC." },
];

/**
 * The seven arguments upstream's webserver access log format accepts.
 *
 * Lifted from the comment in `webserver.conf`, examples and all. The format is
 * `java.util.Formatter` syntax, so the field itself stays free text.
 */
export const ACCESS_LOG_TOKENS: readonly TextToken[] = [
    { insert: "%1$s", label: "Source address", example: "10.10.10.10" },
    { insert: "%2$s", label: "Source address (x-forwarded-for)", example: "88.66.44.22" },
    { insert: "%3$s", label: "Method", example: "GET" },
    { insert: "%4$s", label: "Request address", example: "/assets/file.png" },
    { insert: "%5$s", label: "Protocol version", example: "HTTP/1.1" },
    { insert: "%6$s", label: "Status code", example: "200" },
    { insert: "%7$s", label: "Status message", example: "OK" },
];
