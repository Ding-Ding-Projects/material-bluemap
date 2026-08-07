#!/usr/bin/env node
/**
 * Turns the staged BlueMap shadow jars into publishable release assets.
 *
 * `tools/build-jars.mjs` copies each implementation's `<impl>-<version>-shadow.jar`
 * out of the vendored build tree. That name is a Gradle artefact name, not something
 * a person downloading a release can act on: it says nothing about which of the seven
 * they need, and `spigot-5.22-27-shadow.jar` sitting beside a Windows installer looks
 * like debris. This renames each one to upstream's own release convention -
 * `bluemap-<version>-<impl>.jar`, exactly what the BlueMap project publishes - then
 * inspects it, hashes it, and writes the three index files the release step reads:
 *
 *   bluemap-jars.md          release-notes section: what each jar is and what it runs on
 *   bluemap-jars.json        the same facts as data
 *   bluemap-jars.sha256.txt  `sha256sum -c`-checkable digests of the published names
 *
 *   node tools/describe-jars.mjs --stage tools/oracle/out/jars --out jars
 *   node tools/describe-jars.mjs --stage <in> --out <out> --expect-version 5.22-27
 *
 * The per-implementation prose here is stable product knowledge - a Paper plugin goes
 * in `plugins/`, and that will not change. The supported Minecraft versions are not
 * stable, so they are read out of each implementation's `build.gradle.kts` in the
 * vendored source rather than written down here, where they would silently go stale
 * the first time the submodule pointer moves.
 *
 * The jars are read, not trusted: each one's zip central directory is parsed, its
 * manifest read, and the class-file version of its first class recorded, so the
 * release notes can state the Java runtime these builds actually require instead of
 * guessing at it. A jar whose structure does not parse fails this script rather than
 * reaching a user as a download that does not run.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

/** Every implementation upstream ships, in the order the release table lists them. */
const IMPLEMENTATIONS = ["cli", "fabric", "forge", "neoforge", "paper", "spigot", "sponge"];

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_VENDOR = join(REPO_ROOT, "vendor", "BlueMap");
const DEFAULT_UPSTREAM_REPOSITORY = "https://github.com/BlueMap-Minecraft/BlueMap";

/**
 * What each jar is and where it goes. Deliberately prose and deliberately static:
 * this is the part a person needs to pick the right download, and it does not move
 * between upstream versions. Anything that does move is read from the source below.
 */
const PLATFORMS = {
    cli: {
        title: "Command line renderer",
        platform: "No Minecraft server. Any machine with a Java runtime.",
        install: "`java -jar <file> -c <config-dir> -r -g`, pointed at a world folder.",
        note: "This is the one the desktop application drives for local rendering.",
    },
    fabric: {
        title: "Fabric server mod",
        platform: "A Fabric server.",
        install: "Drop it in the server's `mods/` folder.",
        note: "",
    },
    forge: {
        title: "Forge server mod",
        platform: "A Minecraft Forge server.",
        install: "Drop it in the server's `mods/` folder.",
        note: "",
    },
    neoforge: {
        title: "NeoForge server mod",
        platform: "A NeoForge server.",
        install: "Drop it in the server's `mods/` folder.",
        note: "NeoForge and Forge are different loaders; the jars are not interchangeable.",
    },
    paper: {
        title: "Paper server plugin",
        platform: "Paper, Purpur and Folia servers.",
        install: "Drop it in the server's `plugins/` folder.",
        note: "",
    },
    spigot: {
        title: "Spigot server plugin",
        platform: "Spigot, Bukkit and CraftBukkit servers.",
        install: "Drop it in the server's `plugins/` folder.",
        note: "On Paper, take the Paper jar instead: it uses APIs Spigot does not have.",
    },
    sponge: {
        title: "Sponge server plugin",
        platform: "A Sponge server.",
        install: "Drop it in the server's `plugins/` folder.",
        note: "",
    },
};

const USAGE = `Usage: node tools/describe-jars.mjs --stage <dir> --out <dir> [options]

  --stage <dir>            Directory holding the staged '<impl>-<version>-shadow.jar'
                           files written by tools/build-jars.mjs. Required.
  --out <dir>              Where the renamed jars and the index files go. Required.
  --vendor <dir>           Vendored upstream source, read for each implementation's
                           supported Minecraft versions.
                           Default: vendor/BlueMap
  --expect-version <v>     Fail unless the staged jars carry exactly this version.
  --upstream-commit <sha>  Upstream commit the jars were built from.
  --upstream-repo <url>    Default: ${DEFAULT_UPSTREAM_REPOSITORY}
  --summary <file>         Append the markdown section to this file as well
                           (this is how it reaches \$GITHUB_STEP_SUMMARY).
  --allow-partial          Describe whatever is staged instead of requiring all seven.
  -h, --help               Show this.
`;

function fail(message) {
    process.stderr.write(`describe-jars: ${message}\n`);
    process.exit(1);
}

function parseArguments(argv) {
    const options = {
        stage: null,
        out: null,
        vendor: DEFAULT_VENDOR,
        expectVersion: null,
        upstreamCommit: null,
        upstreamRepository: DEFAULT_UPSTREAM_REPOSITORY,
        summary: null,
        allowPartial: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const next = () => {
            index += 1;
            const value = argv[index];
            if (value === undefined) fail(`${argument} needs a value`);
            return value;
        };

        switch (argument) {
            case "--stage":
                options.stage = resolve(next());
                break;
            case "--out":
                options.out = resolve(next());
                break;
            case "--vendor":
                options.vendor = resolve(next());
                break;
            case "--expect-version":
                options.expectVersion = next();
                break;
            case "--upstream-commit":
                options.upstreamCommit = next();
                break;
            case "--upstream-repo":
                options.upstreamRepository = next();
                break;
            case "--summary":
                options.summary = resolve(next());
                break;
            case "--allow-partial":
                options.allowPartial = true;
                break;
            case "-h":
            case "--help":
                process.stdout.write(USAGE);
                process.exit(0);
                break;
            default:
                fail(`unrecognized argument '${argument}'\n\n${USAGE}`);
        }
    }

    if (options.stage === null) fail(`--stage is required\n\n${USAGE}`);
    if (options.out === null) fail(`--out is required\n\n${USAGE}`);
    return options;
}

// ---------------------------------------------------------------------------------
// Just enough zip to read a jar.
//
// A jar is a zip, and the honest way to check one arrived intact is to parse it
// rather than to trust its size. Node ships no zip reader, so this walks the central
// directory from the end of the file - the only reliable entry point, because the
// local headers can carry data descriptors that make a forward walk ambiguous.
// ---------------------------------------------------------------------------------

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

/** Locates the end-of-central-directory record, which the zip comment can push back. */
function findEndOfCentralDirectory(buffer) {
    const earliest = Math.max(0, buffer.length - 22 - 0xffff);
    for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
        if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
    }
    return -1;
}

/**
 * Reads the central directory into a name-keyed index.
 *
 * Returns `{ zip64: true }` without an index when the record carries the zip64
 * escape values. Nothing here needs to read a four-gigabyte jar, and pretending to
 * parse one would produce confident nonsense; the caller degrades to hashing only.
 */
function readCentralDirectory(buffer, describeAs) {
    const eocd = findEndOfCentralDirectory(buffer);
    if (eocd === -1) {
        fail(`${describeAs} is not a readable zip: no end-of-central-directory record. The file is truncated or corrupt.`);
    }

    const entryCount = buffer.readUInt16LE(eocd + 10);
    const directorySize = buffer.readUInt32LE(eocd + 12);
    const directoryOffset = buffer.readUInt32LE(eocd + 16);
    if (entryCount === ZIP64_MARKER_16 || directorySize === ZIP64_MARKER_32 || directoryOffset === ZIP64_MARKER_32) {
        return { zip64: true, entryCount: null, entries: new Map() };
    }

    const entries = new Map();
    let offset = directoryOffset;
    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
            fail(`${describeAs} has a damaged central directory at entry ${index + 1} of ${entryCount}.`);
        }
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
        entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
        offset += 46 + nameLength + extraLength + commentLength;
    }

    return { zip64: false, entryCount, entries };
}

/** Inflates one central-directory entry. Stored and deflated are the only methods jars use. */
function readEntry(buffer, entry, describeAs) {
    if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_FILE_HEADER) {
        fail(`${describeAs}: the local header for '${entry.name}' is not where the central directory says it is.`);
    }
    const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRawSync(data);
    fail(`${describeAs}: '${entry.name}' uses compression method ${entry.method}, which is not stored or deflate.`);
    return Buffer.alloc(0);
}

/** `Main-Class: x` folded across lines is legal; nothing upstream does it, so a simple parse is honest. */
function parseManifest(text) {
    const attributes = new Map();
    for (const line of text.split(/\r?\n/)) {
        const match = /^([A-Za-z0-9][A-Za-z0-9_-]*):\s?(.*)$/.exec(line);
        if (match !== null) attributes.set(match[1], match[2].trim());
    }
    return attributes;
}

/**
 * Inspects a jar: entry count, `Main-Class`, and the Java feature version its
 * bytecode needs at runtime.
 *
 * The runtime version matters and is easy to get wrong by reasoning: upstream's
 * toolchain pins Java 25 and sets no `release` target, so the bytecode is version 25
 * whatever anyone assumes. Class-file major 69 is Java 25, 65 is Java 21, and the
 * offset has been 44 since Java 1.1, so the arithmetic is safe.
 */
function inspectJar(buffer, describeAs) {
    const directory = readCentralDirectory(buffer, describeAs);
    if (directory.zip64) {
        return { entryCount: null, mainClass: null, classFileMajor: null, requiresJavaFeature: null, zip64: true };
    }

    let mainClass = null;
    const manifestEntry = directory.entries.get("META-INF/MANIFEST.MF");
    if (manifestEntry !== undefined) {
        const attributes = parseManifest(readEntry(buffer, manifestEntry, describeAs).toString("utf8"));
        mainClass = attributes.get("Main-Class") ?? null;
    }

    let classFileMajor = null;
    for (const entry of directory.entries.values()) {
        if (!entry.name.endsWith(".class") || entry.name.startsWith("META-INF/")) continue;
        const classBytes = readEntry(buffer, entry, describeAs);
        if (classBytes.length < 8 || classBytes.readUInt32BE(0) !== 0xcafebabe) continue;
        classFileMajor = classBytes.readUInt16BE(6);
        break;
    }

    return {
        entryCount: directory.entryCount,
        mainClass,
        classFileMajor,
        requiresJavaFeature: classFileMajor === null ? null : classFileMajor - 44,
        zip64: false,
    };
}

// ---------------------------------------------------------------------------------
// Facts read out of the vendored source rather than written down here.
// ---------------------------------------------------------------------------------

/**
 * The Minecraft versions an implementation declares support for.
 *
 * Each implementation's `build.gradle.kts` holds them in a
 * `val supportedMinecraftVersions = listOf("26.1", ...)`. The CLI has none, because it
 * reads world folders and never talks to a server. A missing or unreadable file is
 * reported as unknown rather than guessed at: a release that names the wrong Minecraft
 * version sends people to install a jar their server cannot load.
 */
async function readSupportedMinecraftVersions(vendorRoot, implementation) {
    const buildFile = join(vendorRoot, "implementations", implementation, "build.gradle.kts");
    if (!existsSync(buildFile)) return null;
    const source = await readFile(buildFile, "utf8");
    const declaration = /val\s+supportedMinecraftVersions\s*=\s*listOf\s*\(([^)]*)\)/.exec(source);
    if (declaration === null) return null;
    const versions = [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return versions.length === 0 ? null : versions;
}

function formatSize(bytes) {
    const mib = bytes / (1024 * 1024);
    return mib >= 1 ? `${mib.toFixed(1)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;
}

/** `paper-5.22-27-shadow.jar` -> `{ implementation: "paper", version: "5.22-27" }`. */
function parseShadowName(fileName) {
    const match = /^([a-z]+)-(.+)-shadow\.jar$/.exec(fileName);
    if (match === null) return null;
    return { implementation: match[1], version: match[2] };
}

async function collectStagedJars(stage) {
    if (!existsSync(stage)) fail(`staging directory not found: ${stage}`);
    const found = new Map();
    for (const entry of await readdir(stage)) {
        const parsed = parseShadowName(entry);
        if (parsed === null) continue;
        if (found.has(parsed.implementation)) {
            fail(
                `two staged jars for '${parsed.implementation}' in ${stage}: ` +
                    `${found.get(parsed.implementation).fileName} and ${entry}. ` +
                    "Re-stage with --clean so only one build's output is present.",
            );
        }
        found.set(parsed.implementation, { ...parsed, fileName: entry, path: join(stage, entry) });
    }
    return found;
}

// ---------------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------------

/** "These seven jars" reads like prose; "These 7 jars" reads like a log line. */
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"];

function composeMarkdown(jars, upstream, requiredJava) {
    const opening =
        jars.length === 1
            ? "This jar is a build of"
            : `These ${COUNT_WORDS[jars.length] ?? String(jars.length)} jars are builds of`;
    const lines = [];
    lines.push("## BlueMap server jars");
    lines.push("");
    lines.push(
        `${opening} **upstream BlueMap \`${upstream.version}\`**, compiled by this run from the ` +
            `\`${upstream.submodulePath}\` submodule` +
            (upstream.commit === null ? "" : ` at commit \`${upstream.commit}\``) +
            `. The code is the [BlueMap project's](${upstream.repository}) own, not a reimplementation by this project. ` +
            "Worldlens drives the renderer rather than replacing it; the TypeScript mesher in `packages/engine` " +
            "takes over only once it produces byte-identical output.",
    );
    lines.push("");
    if (requiredJava !== null) {
        lines.push(
            `The bytecode is class-file version ${requiredJava + 44}, so running any of this needs a **Java ${requiredJava}** runtime.`,
        );
        lines.push("");
    }
    lines.push("| Download | What it is | Runs on | Minecraft |");
    lines.push("| --- | --- | --- | --- |");
    for (const jar of jars) {
        const minecraft =
            jar.minecraftVersions === null ? "reads world folders directly" : jar.minecraftVersions.join(", ");
        lines.push(`| \`${jar.fileName}\` | ${jar.title} | ${jar.platform} | ${minecraft} |`);
    }
    lines.push("");
    lines.push("<details><summary>How to install each one, and the checksums</summary>");
    lines.push("");
    for (const jar of jars) {
        lines.push(`### \`${jar.fileName}\``);
        lines.push("");
        lines.push(`**${jar.title}** - ${jar.platform} ${jar.install}`);
        if (jar.note !== "") {
            lines.push("");
            lines.push(jar.note);
        }
        lines.push("");
        lines.push(`\`${jar.sha256}\`  (${formatSize(jar.size)})`);
        lines.push("");
    }
    lines.push(
        "Every digest above is also in `bluemap-jars.sha256.txt`, attached to this release and checkable with " +
            "`sha256sum -c bluemap-jars.sha256.txt`.",
    );
    lines.push("");
    lines.push("</details>");
    lines.push("");
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));

    const staged = await collectStagedJars(options.stage);
    const unknown = [...staged.keys()].filter((name) => !IMPLEMENTATIONS.includes(name));
    if (unknown.length > 0) {
        fail(`staged jar(s) for unknown implementation(s): ${unknown.join(", ")}. Known: ${IMPLEMENTATIONS.join(", ")}`);
    }

    const wanted = IMPLEMENTATIONS.filter((name) => staged.has(name));
    const missing = IMPLEMENTATIONS.filter((name) => !staged.has(name));
    if (missing.length > 0 && !options.allowPartial) {
        // Deliberately fatal. Decision D18 ships all seven, and a release quietly
        // missing the NeoForge jar is a gap nobody notices until somebody on that
        // platform goes looking for a download that was never published.
        fail(
            `no staged jar for: ${missing.join(", ")}\n` +
                `Looked for '<impl>-<version>-shadow.jar' in ${options.stage}.\n` +
                "Run tools/build-jars.mjs first, or pass --allow-partial to describe only what is there.",
        );
    }
    if (wanted.length === 0) fail(`nothing to describe: no '<impl>-<version>-shadow.jar' in ${options.stage}`);

    const versions = new Set(wanted.map((name) => staged.get(name).version));
    if (versions.size > 1) {
        fail(
            `the staged jars disagree about their version: ${[...versions].join(", ")}. ` +
                "That means output from two different builds is mixed together; re-stage with --clean.",
        );
    }
    const version = [...versions][0];
    if (options.expectVersion !== null && options.expectVersion !== version) {
        fail(
            `expected version '${options.expectVersion}' but the staged jars are '${version}'. ` +
                "The version the workflow resolved from git and the version Gradle stamped on the jars have diverged; " +
                "publishing either name would be wrong.",
        );
    }

    await mkdir(options.out, { recursive: true });

    const described = [];
    for (const implementation of wanted) {
        const source = staged.get(implementation);
        const buffer = await readFile(source.path);
        const fileName = `bluemap-${version}-${implementation}.jar`;
        const inspection = inspectJar(buffer, fileName);
        const destination = join(options.out, fileName);
        await writeFile(destination, buffer);

        const platform = PLATFORMS[implementation];
        described.push({
            implementation,
            fileName,
            stagedFrom: source.fileName,
            title: platform.title,
            platform: platform.platform,
            install: platform.install,
            note: platform.note,
            minecraftVersions: await readSupportedMinecraftVersions(options.vendor, implementation),
            size: buffer.length,
            sha256: createHash("sha256").update(buffer).digest("hex"),
            entryCount: inspection.entryCount,
            mainClass: inspection.mainClass,
            classFileMajor: inspection.classFileMajor,
            requiresJavaFeature: inspection.requiresJavaFeature,
        });
    }

    // The CLI is the jar the desktop application actually runs, so a missing entry
    // point there is a broken product and not a cosmetic detail.
    const cli = described.find((jar) => jar.implementation === "cli");
    if (cli !== undefined && cli.mainClass === null) {
        fail(`${cli.fileName} declares no Main-Class, so 'java -jar' on it would fail. The build produced a jar that cannot run.`);
    }

    const javaFeatures = new Set(described.map((jar) => jar.requiresJavaFeature).filter((value) => value !== null));
    const requiredJava = javaFeatures.size === 1 ? [...javaFeatures][0] : null;

    const upstream = {
        repository: options.upstreamRepository,
        version,
        commit: options.upstreamCommit,
        submodulePath: "vendor/BlueMap",
    };

    const markdown = composeMarkdown(described, upstream, requiredJava);
    await writeFile(join(options.out, "bluemap-jars.md"), markdown, "utf8");
    await writeFile(
        join(options.out, "bluemap-jars.sha256.txt"),
        `${described.map((jar) => `${jar.sha256}  ${jar.fileName}`).join("\n")}\n`,
        "utf8",
    );
    await writeFile(
        join(options.out, "bluemap-jars.json"),
        `${JSON.stringify({ generatedAt: new Date().toISOString(), upstream, requiredJavaFeature: requiredJava, jars: described }, null, 4)}\n`,
        "utf8",
    );

    if (options.summary !== null) appendFileSync(options.summary, markdown, "utf8");

    const nameWidth = Math.max(...described.map((jar) => jar.fileName.length));
    process.stdout.write(`upstream BlueMap ${version}${options.upstreamCommit === null ? "" : ` (${options.upstreamCommit})`}\n\n`);
    process.stdout.write(`${"file".padEnd(nameWidth)}  ${"size".padStart(9)}  java  entries\n`);
    process.stdout.write(`${"-".repeat(nameWidth)}  ${"-".repeat(9)}  ----  -------\n`);
    for (const jar of described) {
        process.stdout.write(
            `${jar.fileName.padEnd(nameWidth)}  ${formatSize(jar.size).padStart(9)}  ` +
                `${String(jar.requiresJavaFeature ?? "?").padStart(4)}  ${String(jar.entryCount ?? "?").padStart(7)}\n`,
        );
    }
    process.stdout.write(`\n${described.length} jar${described.length === 1 ? "" : "s"} written to ${options.out}\n`);
    if (missing.length > 0) {
        process.stdout.write(`Not staged, and --allow-partial was given: ${missing.join(", ")}\n`);
    }
}

await main();
