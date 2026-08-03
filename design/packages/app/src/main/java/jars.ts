/**
 * Where the BlueMap jars are, in a packaged app and in a checkout.
 *
 * Decisions D17 and D18 give the app seven jars to care about: the CLI it drives to
 * render, and the six Minecraft-server platform adapters it hands to users who run a
 * server. In a packaged build they are bundled resources next to the app. In a
 * checkout they are whatever `tools/build-jars.mjs` last staged, or failing that
 * whatever Gradle left in `vendor/BlueMap/implementations/<name>/build/libs`.
 *
 * One resolver answers for both, because the alternative is every caller carrying an
 * `app.isPackaged` branch and the two paths drifting until only one of them is ever
 * tested.
 *
 * The version is read off the filename rather than out of the jar. Upstream's build
 * derives it from `git describe` (`buildSrc/src/main/kotlin/versioning.kt`) and the
 * shadow task writes it straight into the archive name as
 * `<implementation>-<version>-shadow.jar`, so `cli-5.22-27-shadow.jar` is version
 * `5.22-27`. Reading the manifest would mean unzipping a 6 MB jar on every launch to
 * learn something the filename already says exactly.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Every implementation upstream ships, and D18 commits the port to carrying. */
export const BLUEMAP_IMPLEMENTATIONS = [
    "cli",
    "fabric",
    "forge",
    "neoforge",
    "paper",
    "spigot",
    "sponge",
] as const;

export type BlueMapImplementation = (typeof BLUEMAP_IMPLEMENTATIONS)[number];

export function isBlueMapImplementation(value: string): value is BlueMapImplementation {
    return (BLUEMAP_IMPLEMENTATIONS as readonly string[]).includes(value);
}

/**
 * Where a jar was found.
 *
 * - `bundled` - shipped inside the packaged app's resources.
 * - `staged`  - copied by `tools/build-jars.mjs` into the repository-local staging dir.
 * - `gradle`  - straight out of a `vendor/BlueMap` build directory.
 */
export type JarSource = "bundled" | "staged" | "gradle";

export interface BlueMapJar {
    readonly implementation: BlueMapImplementation;
    readonly path: string;
    /** Upstream's git-derived version, e.g. `5.22-27`. */
    readonly version: string;
    readonly source: JarSource;
}

export interface JarFs {
    readonly exists: (path: string) => boolean;
    readonly readdir: (path: string) => string[];
    /** Modification time in milliseconds, or 0 when it cannot be read. */
    readonly mtimeMs: (path: string) => number;
}

const nodeJarFs: JarFs = {
    exists: existsSync,
    readdir: (path) => {
        try {
            return readdirSync(path);
        } catch {
            return [];
        }
    },
    mtimeMs: (path) => {
        try {
            return statSync(path).mtimeMs;
        } catch {
            return 0;
        }
    },
};

/**
 * Reads the version out of a jar filename.
 *
 * Two naming conventions are accepted, because the build produces both. The shadow
 * task writes `<name>-<version>-shadow.jar` into `build/libs`, and upstream's
 * `release` task copies the same artefact out as `bluemap-<version>-<name>.jar`. A
 * resolver that only knew one of them would work in a checkout and find nothing in a
 * release directory, or the reverse.
 *
 * Non-shadow jars are deliberately not matched. `cli-5.22-27.jar` sits right next to
 * the shadow jar and contains none of its dependencies, so running it fails with a
 * `NoClassDefFoundError` that looks like a broken install rather than the wrong file.
 */
export function parseJarVersion(fileName: string, implementation: BlueMapImplementation): string | null {
    const shadow = new RegExp(`^${implementation}-(.+)-shadow\\.jar$`).exec(fileName);
    if (shadow?.[1] !== undefined) return shadow[1];

    const released = new RegExp(`^bluemap-(.+)-${implementation}\\.jar$`).exec(fileName);
    if (released?.[1] !== undefined) return released[1];

    return null;
}

/**
 * Walks up from `startDir` looking for the repository root.
 *
 * Anchored on `vendor/BlueMap/settings.gradle.kts` rather than on a fixed number of
 * `..` segments, because this module is compiled from `src/main/java` in development
 * and bundled into `dist/main` for packaging, and those are different depths. A
 * counted path works in exactly one of the two and fails silently in the other.
 */
export function findRepoRoot(startDir: string, exists: (path: string) => boolean = existsSync): string | null {
    let current = resolve(startDir);
    for (;;) {
        if (exists(join(current, "vendor", "BlueMap", "settings.gradle.kts"))) return current;
        const parent = dirname(current);
        if (parent === current) return null;
        current = parent;
    }
}

/** `<repo>/tools/oracle/out/jars` - what `tools/build-jars.mjs` writes. */
export function stagingJarDirectory(repoRoot: string): string {
    return join(repoRoot, "tools", "oracle", "out", "jars");
}

/** `<repo>/vendor/BlueMap/implementations/<name>/build/libs` - what Gradle writes. */
export function gradleJarDirectory(repoRoot: string, implementation: BlueMapImplementation): string {
    return join(repoRoot, "vendor", "BlueMap", "implementations", implementation, "build", "libs");
}

/** `<resources>/jars` - where packaging places the bundled jars. */
export function bundledJarDirectory(resourcesPath: string): string {
    return join(resourcesPath, "jars");
}

export interface JarLookupOptions {
    /** Electron's `process.resourcesPath` in a packaged app; omit in development. */
    readonly resourcesPath?: string | null;
    /** Overrides root discovery. Handy in tests and for a non-standard checkout. */
    readonly repoRoot?: string | null;
    /** Where root discovery starts. Defaults to this module's own directory. */
    readonly startDir?: string;
    readonly fs?: JarFs;
}

interface SearchLocation {
    readonly directory: string;
    readonly source: JarSource;
}

function searchLocations(
    implementation: BlueMapImplementation,
    options: JarLookupOptions,
    fs: JarFs,
): SearchLocation[] {
    const locations: SearchLocation[] = [];

    // A packaged app is checked first and is normally the only thing present. Its
    // jars were built and released together with the app, so preferring them over a
    // stray checkout on the same machine is the correct order.
    const resourcesPath = options.resourcesPath;
    if (typeof resourcesPath === "string" && resourcesPath.length > 0) {
        locations.push({ directory: bundledJarDirectory(resourcesPath), source: "bundled" });
    }

    const repoRoot =
        options.repoRoot ?? findRepoRoot(options.startDir ?? currentDirectory(), fs.exists);
    if (repoRoot !== null) {
        // Staged before Gradle: staging is the deliberate output of `build-jars.mjs`,
        // whereas `build/libs` can hold several versions from earlier builds.
        locations.push({ directory: stagingJarDirectory(repoRoot), source: "staged" });
        locations.push({ directory: gradleJarDirectory(repoRoot, implementation), source: "gradle" });
    }

    return locations;
}

/**
 * This module's own directory.
 *
 * `import.meta.url` rather than `__dirname` because the main process is bundled as
 * ESM (`packages/app/build.mjs` emits `format: "esm"`), and it survives bundling
 * because esbuild leaves it alone in that format.
 */
function currentDirectory(): string {
    return dirname(fileURLToPath(import.meta.url));
}

/**
 * Every jar found for an implementation, best candidate first.
 *
 * "Best" is newest by modification time. A `build/libs` directory accumulates one jar
 * per version built, and picking by name would have to compare upstream's
 * git-describe versions (`5.22-27` against `5.22-9`) as if they sorted lexically,
 * which they do not.
 */
export function listBlueMapJars(
    implementation: BlueMapImplementation,
    options: JarLookupOptions = {},
): BlueMapJar[] {
    const fs = options.fs ?? nodeJarFs;
    const found: { jar: BlueMapJar; mtimeMs: number }[] = [];

    for (const location of searchLocations(implementation, options, fs)) {
        if (!fs.exists(location.directory)) continue;
        for (const entry of fs.readdir(location.directory)) {
            const version = parseJarVersion(entry, implementation);
            if (version === null) continue;
            const path = join(location.directory, entry);
            found.push({
                jar: { implementation, path, version, source: location.source },
                mtimeMs: fs.mtimeMs(path),
            });
        }
    }

    found.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return found.map((entry) => entry.jar);
}

/**
 * The jar to run for an implementation.
 *
 * Throws naming every directory that was searched. "BlueMap jar not found" sends
 * somebody looking through the source; a list of the four paths that were checked
 * usually makes it obvious that the build has simply not been run yet.
 */
export function resolveBlueMapJar(
    implementation: BlueMapImplementation,
    options: JarLookupOptions = {},
): BlueMapJar {
    const jars = listBlueMapJars(implementation, options);
    const best = jars[0];
    if (best !== undefined) return best;

    const fs = options.fs ?? nodeJarFs;
    const searched = searchLocations(implementation, options, fs).map((location) => location.directory);
    const where =
        searched.length === 0
            ? "no candidate directories exist (no packaged resources and no repository checkout found)"
            : `looked in:\n${searched.map((directory) => `  ${directory}`).join("\n")}`;
    throw new Error(
        `No BlueMap ${implementation} jar found; ${where}\n` +
            "In a checkout, build it with: node tools/build-jars.mjs",
    );
}

/** The CLI jar, which is the one the app drives to render a world. */
export function resolveCliJar(options: JarLookupOptions = {}): BlueMapJar {
    return resolveBlueMapJar("cli", options);
}

/** What is present for each implementation, for a diagnostics or about surface. */
export function surveyBlueMapJars(
    options: JarLookupOptions = {},
): Record<BlueMapImplementation, BlueMapJar | null> {
    const survey = {} as Record<BlueMapImplementation, BlueMapJar | null>;
    for (const implementation of BLUEMAP_IMPLEMENTATIONS) {
        survey[implementation] = listBlueMapJars(implementation, options)[0] ?? null;
    }
    return survey;
}
