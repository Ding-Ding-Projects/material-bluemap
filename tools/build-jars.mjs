#!/usr/bin/env node
/**
 * Builds the seven BlueMap implementations from the vendored upstream source and
 * stages the shadow jars for packaging and release.
 *
 * Decision D17 runs local rendering on upstream's Java engine, and decision D18
 * commits the port to shipping all six Minecraft-server platform adapters alongside
 * the CLI. Both of those come out of one Gradle build, so this is the single command
 * that produces every jar the app bundles.
 *
 *   node tools/build-jars.mjs
 *   node tools/build-jars.mjs --only cli
 *   node tools/build-jars.mjs --only cli,paper --offline
 *   node tools/build-jars.mjs --no-build          # stage whatever is already built
 *
 * Gradle's home is pointed at `tools/oracle/.gradle` inside the repository, so a
 * build here never touches `~/.gradle` and never disturbs another project's cached
 * dependencies or daemon. That directory is gitignored and grows past a gigabyte,
 * which is the trade for not writing anything machine-wide.
 *
 * Project paths are bare - `:cli`, not `:implementations:cli`. Upstream's
 * `settings.gradle.kts` includes each implementation at the root and then relocates
 * its `projectDir`, so the nested path does not exist and Gradle rejects it.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

/** Every implementation upstream ships. Order is the order they are built in. */
const IMPLEMENTATIONS = ["cli", "fabric", "forge", "neoforge", "paper", "spigot", "sponge"];

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = join(REPO_ROOT, "vendor", "BlueMap");
const GRADLE_HOME = join(REPO_ROOT, "tools", "oracle", ".gradle");
const DEFAULT_STAGING = join(REPO_ROOT, "tools", "oracle", "out", "jars");

/** Upstream pins `JavaLanguageVersion.of(25)` in buildSrc/bluemap.java.gradle.kts. */
const REQUIRED_JAVA_FEATURE = 25;

const USAGE = `Usage: node tools/build-jars.mjs [options]

  --only <list>     Comma-separated implementations to build
                    (${IMPLEMENTATIONS.join(", ")}). Default: all.
  --stage <dir>     Where to copy the shadow jars.
                    Default: tools/oracle/out/jars
  --no-build        Skip Gradle; stage whatever is already in build/libs.
  --clean           Empty the staging directory first.
  --offline         Pass --offline to Gradle (no dependency downloads).
  --gradle-arg <a>  Extra argument for Gradle. Repeatable.
  -h, --help        Show this.
`;

function fail(message) {
    process.stderr.write(`build-jars: ${message}\n`);
    process.exit(1);
}

function parseArguments(argv) {
    const options = {
        implementations: [...IMPLEMENTATIONS],
        staging: DEFAULT_STAGING,
        build: true,
        clean: false,
        offline: false,
        gradleArgs: [],
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
            case "--only": {
                const requested = next()
                    .split(",")
                    .map((name) => name.trim())
                    .filter((name) => name.length > 0);
                const unknown = requested.filter((name) => !IMPLEMENTATIONS.includes(name));
                if (unknown.length > 0) {
                    fail(`unknown implementation(s): ${unknown.join(", ")}. Known: ${IMPLEMENTATIONS.join(", ")}`);
                }
                options.implementations = requested;
                break;
            }
            case "--stage":
                options.staging = resolve(next());
                break;
            case "--no-build":
                options.build = false;
                break;
            case "--clean":
                options.clean = true;
                break;
            case "--offline":
                options.offline = true;
                break;
            case "--gradle-arg":
                options.gradleArgs.push(next());
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

    if (options.implementations.length === 0) fail("--only selected nothing to build");
    return options;
}

/** Quotes one argument for `cmd.exe`, which has its own rules and not the shell's. */
function quoteForCmd(value) {
    return /[\s"&|<>^()]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Starts a child process, routing `.bat` and `.cmd` through `cmd.exe`.
 *
 * Node refuses to spawn a batch file directly since the fix for CVE-2024-27980, and
 * `gradlew.bat` is exactly that, so a plain `spawn` fails with `EINVAL` - an error
 * that says nothing about the actual cause. `shell: true` would work but hands the
 * whole command line to the shell for re-parsing; building the `cmd /d /s /c` line
 * explicitly with `windowsVerbatimArguments` keeps the arguments intact even when a
 * path contains a space.
 */
function spawnTool(command, args, options) {
    if (process.platform === "win32" && /\.(?:bat|cmd)$/i.test(command)) {
        const shell = process.env.ComSpec ?? "cmd.exe";
        const line = [command, ...args].map(quoteForCmd).join(" ");
        return spawn(shell, ["/d", "/s", "/c", `"${line}"`], {
            ...options,
            windowsVerbatimArguments: true,
        });
    }
    return spawn(command, args, { ...options, shell: false });
}

function run(command, args, cwd, env) {
    return new Promise((resolvePromise) => {
        const child = spawnTool(command, args, { cwd, env, stdio: "inherit" });
        child.on("error", (error) => resolvePromise({ code: null, error: error.message }));
        child.on("close", (code) => resolvePromise({ code, error: null }));
    });
}

function capture(command, args) {
    return new Promise((resolvePromise) => {
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
        child.on("error", (error) => resolvePromise({ ok: false, stdout, stderr, error: error.message }));
        child.on("close", (code) => resolvePromise({ ok: code === 0, stdout, stderr, error: null }));
    });
}

/**
 * The feature version of whichever `java` Gradle will run on.
 *
 * Reported rather than enforced. Gradle can resolve a toolchain other than the JVM it
 * is running on, so a mismatch here is a warning worth reading and not a reason to
 * refuse to start; if no Java 25 toolchain can be found, Gradle says so far more
 * precisely than this script could guess.
 *
 * `-version` prints on stderr, and `1.8.0_402` puts the feature number in the second
 * component while `25.0.3` puts it in the first.
 */
async function detectJava() {
    const result = await capture("java", ["-version"]);
    const output = `${result.stderr}\n${result.stdout}`;
    const match = /(?:^|\n)[^\n"]*\bversion\s+"([^"]+)"/.exec(output);
    if (!result.ok && match === null) {
        return { available: false, feature: null, version: null, error: result.error ?? result.stderr.trim() };
    }
    if (match === null) return { available: true, feature: null, version: null, error: null };

    const version = match[1];
    const components = version.split(".");
    const featureText = components[0] === "1" ? components[1] : components[0];
    const digits = /^\d+/.exec(featureText ?? "");
    return {
        available: true,
        feature: digits === null ? null : Number.parseInt(digits[0], 10),
        version,
        error: null,
    };
}

async function sha256(path) {
    const hash = createHash("sha256");
    await pipeline(createReadStream(path), hash);
    return hash.digest("hex");
}

function formatSize(bytes) {
    const mib = bytes / (1024 * 1024);
    return mib >= 1 ? `${mib.toFixed(1)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;
}

/**
 * Finds the shadow jar an implementation's build produced.
 *
 * `build/libs` also holds the thin `<name>-<version>.jar`, plus the sources and
 * javadoc jars. Only the shadow jar carries the dependencies, and running either of
 * the others fails with a `NoClassDefFoundError` that reads like a broken install,
 * so the match is deliberately strict.
 *
 * When several versions are present - which happens as soon as a commit is made
 * between builds, because upstream derives the version from `git describe` - the
 * newest by modification time wins.
 */
async function findShadowJar(implementation) {
    const libs = join(VENDOR_ROOT, "implementations", implementation, "build", "libs");
    if (!existsSync(libs)) return null;

    const pattern = new RegExp(`^${implementation}-(.+)-shadow\\.jar$`);
    const candidates = [];
    for (const entry of await readdir(libs)) {
        const match = pattern.exec(entry);
        if (match === null) continue;
        const path = join(libs, entry);
        const info = await stat(path);
        candidates.push({ path, fileName: entry, version: match[1], size: info.size, mtimeMs: info.mtimeMs });
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return candidates[0] ?? null;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));

    if (!existsSync(join(VENDOR_ROOT, "settings.gradle.kts"))) {
        fail(
            `vendored upstream source not found at ${VENDOR_ROOT}\n` +
                "It is a git submodule; fetch it with: git submodule update --init --recursive",
        );
    }

    const wrapper = join(VENDOR_ROOT, process.platform === "win32" ? "gradlew.bat" : "gradlew");
    if (!existsSync(wrapper)) fail(`gradle wrapper not found at ${wrapper}`);

    const java = await detectJava();
    if (!java.available) {
        fail(
            `no 'java' on PATH (${java.error ?? "unknown error"}).\n` +
                `Gradle needs a JVM, and upstream's toolchain requires Java ${REQUIRED_JAVA_FEATURE}.`,
        );
    }
    process.stdout.write(
        `Java: ${java.version ?? "unknown"}${
            java.feature !== null && java.feature < REQUIRED_JAVA_FEATURE
                ? `  (upstream's toolchain wants ${REQUIRED_JAVA_FEATURE}; Gradle will have to resolve one)`
                : ""
        }\n`,
    );
    process.stdout.write(`Gradle home: ${GRADLE_HOME}\n`);
    process.stdout.write(`Source: ${VENDOR_ROOT}\n`);
    process.stdout.write(`Staging: ${options.staging}\n\n`);

    if (options.build) {
        await mkdir(GRADLE_HOME, { recursive: true });

        const tasks = options.implementations.map((implementation) => `:${implementation}:shadowJar`);
        const gradleArgs = [...tasks, ...options.gradleArgs];
        if (options.offline) gradleArgs.push("--offline");

        process.stdout.write(`> gradlew ${gradleArgs.join(" ")}\n\n`);
        const result = await run(wrapper, gradleArgs, VENDOR_ROOT, {
            ...process.env,
            // The whole point of this script: Gradle's caches, wrapper distributions
            // and daemon registry all live here rather than in the user's home.
            GRADLE_USER_HOME: GRADLE_HOME,
        });
        if (result.error !== null) fail(`could not start ${wrapper}: ${result.error}`);
        if (result.code !== 0) fail(`gradle exited with code ${result.code}`);
        process.stdout.write("\n");
    }

    if (options.clean) await rm(options.staging, { recursive: true, force: true });
    await mkdir(options.staging, { recursive: true });

    const staged = [];
    const missing = [];
    for (const implementation of options.implementations) {
        const jar = await findShadowJar(implementation);
        if (jar === null) {
            missing.push(implementation);
            continue;
        }
        const destination = join(options.staging, jar.fileName);
        await copyFile(jar.path, destination);
        staged.push({
            implementation,
            version: jar.version,
            fileName: jar.fileName,
            path: destination,
            size: jar.size,
            sha256: await sha256(destination),
        });
    }

    // A manifest beside the jars, so packaging and the release step have one place to
    // read what is here and can check a jar has not changed since it was built.
    if (staged.length > 0) {
        await writeFile(
            join(options.staging, "manifest.json"),
            `${JSON.stringify(
                {
                    stagedAt: new Date().toISOString(),
                    source: "vendor/BlueMap",
                    jars: staged.map(({ implementation, version, fileName, size, sha256: digest }) => ({
                        implementation,
                        version,
                        fileName,
                        size,
                        sha256: digest,
                    })),
                },
                null,
                4,
            )}\n`,
            "utf8",
        );
        await writeFile(
            join(options.staging, "SHA256SUMS.txt"),
            `${staged.map((jar) => `${jar.sha256}  ${jar.fileName}`).join("\n")}\n`,
            "utf8",
        );
    }

    const nameWidth = Math.max(...staged.map((jar) => jar.implementation.length), 14);
    const versionWidth = Math.max(...staged.map((jar) => jar.version.length), 7);
    process.stdout.write(
        `${"implementation".padEnd(nameWidth)}  ${"version".padEnd(versionWidth)}  ${"size".padStart(9)}  file\n`,
    );
    process.stdout.write(`${"-".repeat(nameWidth)}  ${"-".repeat(versionWidth)}  ${"-".repeat(9)}  ----\n`);
    let total = 0;
    for (const jar of staged) {
        total += jar.size;
        process.stdout.write(
            `${jar.implementation.padEnd(nameWidth)}  ${jar.version.padEnd(versionWidth)}  ${formatSize(jar.size).padStart(9)}  ${jar.fileName}\n`,
        );
    }
    process.stdout.write(
        `\n${staged.length} jar${staged.length === 1 ? "" : "s"} staged in ${options.staging} (${formatSize(total)} total)\n`,
    );

    if (missing.length > 0) {
        // Reported as a failure rather than a note. A packaging step that silently
        // ships six of seven adapters produces a release whose gap nobody notices
        // until a user on that platform downloads it.
        process.stderr.write(
            `\nbuild-jars: no shadow jar found for: ${missing.join(", ")}\n` +
                `Looked in vendor/BlueMap/implementations/<name>/build/libs.\n` +
                (options.build ? "" : "Run without --no-build to build them.\n"),
        );
        process.exit(1);
    }
}

await main();
