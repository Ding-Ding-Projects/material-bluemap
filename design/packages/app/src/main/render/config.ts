/**
 * Writing the config directory upstream's CLI reads.
 *
 * The CLI takes one argument that matters, `-c <folder>`, and reads everything else out
 * of the files in it: `core.conf`, `webapp.conf`, `webserver.conf`,
 * `storages/<id>.conf` and one `maps/<id>.conf` per map. This module writes that set
 * from a render request, with every path absolute.
 *
 * **Every path is absolute on purpose.** The CLI resolves relative paths against its
 * *working directory*, not against the config folder, which is a sharp edge that has
 * already cost this project once: running it from the repository root wrote 47 MB of
 * tiles into `/web` and a 38 MB Mojang client jar into `/data` at the top of the tree.
 * The runner also sets a deliberate working directory inside the render workspace, so
 * even a path this module somehow left relative lands somewhere harmless.
 *
 * ## Quoting
 *
 * HOCON's quoted strings are JSON strings, so `JSON.stringify` produces exactly the
 * right escaping and is what every path here goes through. This is not a stylistic
 * choice: an unescaped Windows path is a parse error waiting to happen, because
 * `"C:\Users\..."` contains `\U`, which is not a valid escape. Both halves of this were
 * checked against the real parser rather than assumed - a config written with
 * `JSON.stringify`-escaped Windows paths rendered 144 hires tiles and put its data
 * directory exactly where the escaped path said.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { HoconParseError, parseHocon } from "@material-bluemap/shared";

/**
 * A map to render.
 *
 * Mirrors the subset of upstream's map config this port sets. Everything omitted keeps
 * upstream's default, which is deliberate: a config file that restates a default is a
 * config file that silently pins it when upstream changes.
 */
export interface RenderMapRequest {
    /**
     * The map's id. Becomes the config file name, the storage folder name and a URL
     * path segment, which is why it is validated rather than trusted.
     */
    readonly id: string;
    /** Absolute path to the world folder, the one containing `level.dat`. */
    readonly world: string;
    /** Display name shown in the viewer. Defaults to the id. */
    readonly name?: string;
    /** Defaults to `minecraft:overworld`. */
    readonly dimension?: string;
    /** Ordering in the viewer's map list. Defaults to declaration order. */
    readonly sorting?: number;
    readonly startPos?: { readonly x: number; readonly z: number };
    /**
     * The complete `maps/<id>.conf` body to render with, as HOCON.
     *
     * The fields above are the ones this module understands well enough to validate.
     * A map has ninety-odd more, and an interface that collects them all and then hands
     * over six has quietly discarded the rest of what somebody asked for - which is
     * worse than never offering them, because the settings screen said they were
     * applied.
     *
     * So the whole body travels as text and is written out as written, with the keys
     * that are structural rather than cosmetic - `world`, `dimension`, `storage` -
     * enforced on top of it. See {@link mapConf} for exactly how, and why that is a
     * checked fact rather than a hope.
     */
    readonly config?: string;
}

export interface RenderConfigOptions {
    /** `<workspace>/config` - where the CLI is pointed with `-c`. */
    readonly configDir: string;
    /** `<workspace>/data` - the Mojang client jar, extracted resources and CLI logs. */
    readonly dataDir: string;
    /**
     * The webapp root. Its `settings.json` is what the viewer loads first, and
     * `<webRoot>/maps` is the storage root the tiles are written into.
     */
    readonly webRoot: string;
    readonly maps: readonly RenderMapRequest[];
    /**
     * Render threads. Defaults to upstream's own default of `cores - 2`, floored at 1,
     * which leaves the machine usable while a render runs.
     */
    readonly renderThreads?: number;
    /**
     * Whether the engine may report anonymous usage to upstream's metrics endpoint.
     *
     * Off unless a caller turns it on. Upstream defaults it on, which is a reasonable
     * default for a server operator who installed BlueMap deliberately, and the wrong
     * one for somebody who pressed Render in a desktop app: the only thing they agreed
     * to is the Mojang download, and quietly widening that into a second, different
     * outbound report is not something a config writer gets to decide for them.
     */
    readonly metrics?: boolean;
    /** Written into `core.conf` as `accept-download`. */
    readonly acceptDownload: boolean;
}

export interface WrittenRenderConfig {
    readonly configDir: string;
    readonly dataDir: string;
    readonly webRoot: string;
    readonly storageRoot: string;
    /** Every file written, absolute, in the order it was written. */
    readonly files: readonly string[];
    readonly mapIds: readonly string[];
}

/**
 * What a map id may contain.
 *
 * It becomes a directory name and a URL path segment, so the set is deliberately
 * narrower than what either would technically accept. Rejecting `..`, a slash or a
 * backslash here is what stops a map id from addressing anything outside its own
 * storage folder later.
 */
const MAP_ID = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidMapId(id: string): boolean {
    return MAP_ID.test(id) && id.length <= 64;
}

/** A HOCON quoted string. HOCON's grammar for these is JSON's, so this is exact. */
export function hoconString(value: string): string {
    return JSON.stringify(value);
}

function coreConf(options: RenderConfigOptions): string {
    const threads = options.renderThreads ?? defaultRenderThreads();
    return [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        `accept-download: ${options.acceptDownload ? "true" : "false"}`,
        `data: ${hoconString(options.dataDir)}`,
        `render-thread-count: ${String(threads)}`,
        "scan-for-mod-resources: true",
        `metrics: ${options.metrics === true ? "true" : "false"}`,
        "log: {",
        `  file: ${hoconString(join(options.dataDir, "logs", "cli.log"))}`,
        "  append: false",
        "}",
        "",
    ].join("\n");
}

/**
 * `webapp.conf` exists so `-s` has somewhere to write `settings.json`.
 *
 * That file is the one the viewer loads first: it lists the maps and carries
 * `mapDataRoot`/`liveDataRoot`. Everything else is left at upstream's defaults, which
 * the CLI fills in - a minimal file like this one produced the full settings document,
 * sliders and all.
 */
function webappConf(options: RenderConfigOptions): string {
    return [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        "enabled: true",
        `webroot: ${hoconString(options.webRoot)}`,
        "update-settings-file: true",
        "",
    ].join("\n");
}

/**
 * The CLI's own web server, off.
 *
 * The app serves rendered maps through its existing embedded `HttpServer`, on a port it
 * already owns and behind the auth token the renderer already carries. Letting the CLI
 * open a second listener on 8100 would put an unauthenticated copy of somebody's map on
 * the network for as long as the render ran.
 */
function webserverConf(): string {
    return [
        "# Written by Material BlueMap. The app serves rendered maps itself.",
        "enabled: false",
        "",
    ].join("\n");
}

function storageConf(storageRoot: string): string {
    return [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        "storage-type: file",
        `root: ${hoconString(storageRoot)}`,
        // gzip is upstream's default and is what the file layout on disk assumes:
        // hires tiles land as `<tile>.prbm.gz`, which is exactly the URL the viewer
        // asks for when it decompresses client-side, and one `.gz` away from the URL
        // it asks for when it does not.
        "compression: gzip",
        "",
    ].join("\n");
}

/**
 * The keys this module owns whatever a supplied body says.
 *
 * They are the structural ones. `world` and `dimension` decide which chunks are read,
 * and `storage` decides where the tiles land: a body that names a storage this app did
 * not write produces a render whose output the app does not serve, which is tiles
 * nobody can see. Everything else about a map - its colours, its lighting, its markers,
 * its render bounds - is cosmetic in exactly this sense, and is passed through.
 */
const ENFORCED_MAP_KEYS = ["world", "dimension", "storage"] as const;

/**
 * Longest map config body accepted, in UTF-16 code units.
 *
 * Upstream's own map configs are a few kilobytes; a heavily marked-up one is tens.
 * A megabyte is far past anything real and well under the parser's own 4 MiB ceiling,
 * so an accidental or hostile paste is refused by size before it is parsed at all.
 */
export const MAX_MAP_CONFIG_LENGTH = 1024 * 1024;

/**
 * One map's `maps/<id>.conf`.
 *
 * Without `map.config` this writes the six keys it has always written, byte for byte.
 *
 * With one, the supplied body is the file and the three keys in
 * {@link ENFORCED_MAP_KEYS} are appended after it.
 *
 * ## Why appending is enough, and how that was checked
 *
 * HOCON's duplicate-key rule is *later wins*, with one exception: two **object** values
 * under the same key deep-merge instead. Every override written here is a quoted
 * string, so the exception cannot apply to any of them, and later therefore always
 * wins. That was not assumed - it was run against this repository's own parser
 * (`packages/shared/src/hocon.ts`, the one the viewer reads `.conf` files with):
 *
 * ```
 * world: "A"          then world: "B"     -> { world: "B" }
 * storage { type: … } then storage: "file"-> { storage: "file" }   (object loses to a string)
 * world.deep: 1       then world: "B"     -> { world: "B" }        (dotted path loses too)
 * ```
 *
 * The CLI reads these files with a JVM HOCON library, which implements the same rule
 * from the same specification, so the override holds for the process that actually
 * matters as well as for the one that checks it here.
 *
 * ## It is verified, not hoped for
 *
 * The finished text is parsed before it is returned, and the three keys are asserted to
 * have come out as this module's values. So the file that reaches the disk is one that
 * has been proved to parse and proved to say what the app requires; a body that somehow
 * defeated the append would be refused here rather than discovered as a wrong map.
 *
 * ## What is refused
 *
 * - **Anything that does not parse.** A malformed body handed to the CLI comes back as
 *   a Java stack trace, which is not an error message anybody can act on.
 * - **`include` directives.** Upstream's JVM parser supports them, and an `include
 *   file("…")` in a body that came from the renderer would read an arbitrary file off
 *   this machine into a config the app then renders from. This project's parser does
 *   not support them and rejects every spelling (`include "x"`, `include file(…)`,
 *   `include required(…)`, `include classpath(…)`, `include url(…)`), so validating
 *   here is what stops one ever reaching the CLI.
 * - **`${…}` substitutions**, for the same reason the parser refuses them everywhere
 *   else: resolving them is what needed `eval`.
 * - **A body whose root is braced** (`{ … }`). It is legal HOCON on its own, but a
 *   document that is one braced object is *complete*, so nothing can be appended after
 *   it - the parse fails on the first override. Rather than cutting the braces off with
 *   string surgery, which is the "textual hope" this design exists to avoid, such a
 *   body is refused by name and the caller is told to hand over the keys unwrapped,
 *   which is the form upstream's own map configs and this app's template both use.
 *
 * A body cannot escape its own file: it is written verbatim into `maps/<id>.conf`,
 * which the CLI reads as data, and there is no shell anywhere on the path. Redirecting
 * the output elsewhere is the one thing it could otherwise do, and enforcing `storage`
 * is exactly what stops it - the storage definition itself lives in
 * `storages/file.conf`, which this module writes and a map body cannot reach.
 */
function mapConf(map: RenderMapRequest, index: number): string {
    if (map.config === undefined) return generatedMapConf(map, index);
    return overriddenMapConf(map);
}

/** The six-key file, for a request that supplied no body of its own. */
function generatedMapConf(map: RenderMapRequest, index: number): string {
    const lines = [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        `world: ${hoconString(map.world)}`,
        `dimension: ${hoconString(map.dimension ?? "minecraft:overworld")}`,
        `name: ${hoconString(map.name ?? map.id)}`,
        `sorting: ${String(map.sorting ?? index)}`,
        'storage: "file"',
    ];
    if (map.startPos !== undefined) {
        lines.push(`start-pos: { x: ${String(map.startPos.x)}, z: ${String(map.startPos.z)} }`);
    }
    lines.push("");
    return lines.join("\n");
}

function overriddenMapConf(map: RenderMapRequest): string {
    const body = map.config;
    // The body arrives over IPC, where the type says `string` and the wire says
    // whatever the sender put on it. A number here would reach the parser as a
    // `TypeError` about `charAt` rather than as something anybody could act on.
    if (typeof body !== "string") {
        throw new InvalidRenderRequestError(
            `The map config for '${map.id}' is not text, so there is nothing to render with.`,
        );
    }
    if (body.length > MAX_MAP_CONFIG_LENGTH) {
        throw new InvalidRenderRequestError(
            `The map config for '${map.id}' is ${String(body.length)} characters, past the ` +
                `limit of ${String(MAX_MAP_CONFIG_LENGTH)}.`,
        );
    }

    const trimmed = body.trimEnd();
    if (trimmed.trim() === "") {
        throw new InvalidRenderRequestError(
            `The map config for '${map.id}' is empty. Leave it out to render with the ` +
                "defaults, rather than sending a file that says nothing.",
        );
    }
    if (firstSignificantCharacter(trimmed) === "{") {
        throw new InvalidRenderRequestError(
            `The map config for '${map.id}' wraps its keys in braces. A braced document is ` +
                "complete, so the settings this app owns cannot be added after it. Send the " +
                "keys unwrapped, the way upstream's own map configs are written.",
        );
    }

    const dimension = map.dimension ?? "minecraft:overworld";
    const text = [
        trimmed,
        "",
        "# Written by Material BlueMap. HOCON's later key wins, so these three replace",
        "# whatever the body above says: the render has to read the world this app was",
        "# pointed at and write where this app serves from.",
        `world: ${hoconString(map.world)}`,
        `dimension: ${hoconString(dimension)}`,
        'storage: "file"',
        "",
    ].join("\n");

    assertEnforced(map.id, text, {
        world: map.world,
        dimension,
        storage: "file",
    });
    return text;
}

/**
 * Parses the finished file and checks the app's own keys survived.
 *
 * The parse is the validation: everything the body could do wrong - a missing brace, an
 * unterminated string, an `include`, a substitution - is a parse error here, before a
 * single byte has been written.
 */
function assertEnforced(
    id: string,
    text: string,
    expected: Readonly<Record<(typeof ENFORCED_MAP_KEYS)[number], string>>,
): void {
    let parsed: Record<string, unknown>;
    try {
        // The overrides are appended, so every line of the body keeps the number the
        // caller wrote it on and a reported position points into their own text. The
        // exception is a construct left open, which is only noticed at the end of the
        // input and so points past the body - inherent, and the reason the message
        // names what went wrong as well as where.
        parsed = parseHocon(text, { maxInputLength: MAX_MAP_CONFIG_LENGTH + 1024 });
    } catch (error) {
        throw new InvalidRenderRequestError(
            `The map config for '${id}' is not valid HOCON: ${describeParseFailure(error)}`,
        );
    }

    for (const key of ENFORCED_MAP_KEYS) {
        const actual = Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : undefined;
        if (actual === expected[key]) continue;
        // Unreachable while HOCON's later-key rule holds, and stated anyway: this is the
        // assumption the whole approach rests on, and an assumption that is checked is
        // the only kind worth resting on.
        throw new InvalidRenderRequestError(
            `The map config for '${id}' still sets ${key} to ${JSON.stringify(actual)} after ` +
                `this app set it to ${JSON.stringify(expected[key])}. A render cannot be ` +
                "written from it.",
        );
    }
}

function describeParseFailure(error: unknown): string {
    const message = error instanceof HoconParseError ? error.message : String(error);
    // The parser has no `include` rule, so a directive fails as a key with no separator
    // after it. That is accurate and unhelpful, and this is the one place that knows why
    // an `include` was refused rather than merely that something was.
    if (message.includes("after key 'include")) {
        return (
            `${message}. Map configs may not use 'include': it would read another file off ` +
            "this machine into the render's settings."
        );
    }
    return message;
}

/**
 * The first character that is neither whitespace nor part of a comment.
 *
 * Only enough scanning to tell a braced document root from an ordinary one; the parser
 * does the real work immediately afterwards.
 */
function firstSignificantCharacter(text: string): string {
    let index = 0;
    while (index < text.length) {
        const c = text.charAt(index);
        if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\f" || c === "\v") {
            index++;
            continue;
        }
        if (c === "#" || (c === "/" && text.charAt(index + 1) === "/")) {
            const newline = text.indexOf("\n", index);
            if (newline < 0) return "";
            index = newline + 1;
            continue;
        }
        return c;
    }
    return "";
}

/**
 * Upstream's own default: every core but two, never fewer than one.
 *
 * Matching it rather than inventing a number means a render behaves the way its
 * documentation and its community's advice say it does.
 */
export function defaultRenderThreads(cores?: number): number {
    const available = cores ?? cpuCount();
    return Math.max(1, available - 2);
}

function cpuCount(): number {
    // `availableParallelism` rather than `cpus().length`: it is the honest number under
    // a container CPU limit, where the second one reports the host's cores and would
    // have the engine start threads the machine will never run in parallel.
    try {
        return availableParallelism();
    } catch {
        return 4;
    }
}

/** Raised for a request that could never render, before anything is written. */
export class InvalidRenderRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidRenderRequestError";
    }
}

/**
 * Checks a map list without touching the disk. Throws naming the first problem.
 *
 * Including the supplied config bodies, which is why this builds each map's file and
 * throws the result away. Doing the work twice costs a parse of a few kilobytes; not
 * doing it here would cost the difference between "that config could not be parsed,
 * here is the line" and a half-written workspace reported as a disk failure - the
 * orchestrator calls this before it creates anything, and reports what it throws as an
 * invalid request rather than as an unwritable workspace.
 */
export function validateMaps(maps: readonly RenderMapRequest[]): void {
    if (maps.length === 0) {
        throw new InvalidRenderRequestError("A render needs at least one map.");
    }
    const seen = new Set<string>();
    for (const [index, map] of maps.entries()) {
        if (!isValidMapId(map.id)) {
            throw new InvalidRenderRequestError(
                `'${map.id}' is not a usable map id. Use lowercase letters, digits, '-' and '_'.`,
            );
        }
        if (seen.has(map.id)) {
            throw new InvalidRenderRequestError(`Two maps share the id '${map.id}'.`);
        }
        seen.add(map.id);
        if (map.world.trim().length === 0) {
            throw new InvalidRenderRequestError(`Map '${map.id}' has no world folder.`);
        }
        mapConf(map, index);
    }
}

/**
 * Writes the whole config set and reports exactly what it wrote.
 *
 * Rewritten in full on every render rather than merged into whatever is already there.
 * A config directory that accumulates edits is a config directory where a map somebody
 * removed six renders ago is still being rendered, and where the reason is invisible.
 */
export async function writeRenderConfig(
    options: RenderConfigOptions,
): Promise<WrittenRenderConfig> {
    validateMaps(options.maps);

    const storageRoot = join(options.webRoot, "maps");
    const mapsDir = join(options.configDir, "maps");
    const storagesDir = join(options.configDir, "storages");

    await mkdir(mapsDir, { recursive: true });
    await mkdir(storagesDir, { recursive: true });
    await mkdir(options.dataDir, { recursive: true });
    await mkdir(storageRoot, { recursive: true });

    const files: string[] = [];
    const write = async (path: string, contents: string): Promise<void> => {
        await writeFile(path, contents, "utf8");
        files.push(path);
    };

    await write(join(options.configDir, "core.conf"), coreConf(options));
    await write(join(options.configDir, "webapp.conf"), webappConf(options));
    await write(join(options.configDir, "webserver.conf"), webserverConf());
    await write(join(storagesDir, "file.conf"), storageConf(storageRoot));

    for (const [index, map] of options.maps.entries()) {
        await write(join(mapsDir, `${map.id}.conf`), mapConf(map, index));
    }

    return {
        configDir: options.configDir,
        dataDir: options.dataDir,
        webRoot: options.webRoot,
        storageRoot,
        files,
        mapIds: options.maps.map((map) => map.id),
    };
}
