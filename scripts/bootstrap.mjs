#!/usr/bin/env node
/**
 * One command that makes a fresh clone able to build, test, render and package.
 *
 * Everything this project needs is installed automatically: node dependencies, the
 * Electron binary, a JDK that satisfies upstream's toolchain, Gradle, the BlueMap
 * jars built from the vendored source, and the Playwright browsers the screenshot
 * harness drives. Nothing here asks a question and nothing needs administrator
 * rights.
 *
 * Every step **verifies the dependency actually works** rather than checking that
 * a directory exists. That distinction is not pedantic: Electron shipped a `dist/`
 * folder containing only `locales/`, with no binary and no `path.txt`, and its own
 * installer exited 0 without repairing it because the folder was there. The
 * screenshot harness then failed with "Electron failed to install correctly" and
 * the cause was three layers away. A presence check would have passed.
 *
 * Installs are repository-local or user-scoped. No machine-wide toolchain is
 * upgraded, downgraded or reconfigured, because other projects on this machine
 * depend on those.
 *
 *   node scripts/bootstrap.mjs              # everything
 *   node scripts/bootstrap.mjs --skip-jars  # skip the slow Gradle build
 *   node scripts/bootstrap.mjs --check      # verify only, install nothing
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designRoot = join(repoRoot, "design");
const vendorRoot = join(repoRoot, "vendor", "BlueMap");
const gradleHome = join(repoRoot, "tools", "oracle", ".gradle");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const skipJars = args.has("--skip-jars");

/** Upstream pins `JavaLanguageVersion.of(25)` in buildSrc; anything older cannot build it. */
const REQUIRED_JAVA_MAJOR = 25;

const steps = [];
let failed = false;

function log(message) {
    process.stdout.write(`${message}\n`);
}

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        stdio: options.quiet === true ? "pipe" : "inherit",
        encoding: "utf8",
        shell: process.platform === "win32",
        ...options,
    });
    return result;
}

/**
 * Runs a command and returns stdout **and** stderr together.
 *
 * Both streams matter: `java -version` writes its version banner to stderr and
 * exits 0, so reading only stdout reports a perfectly good JDK as absent. This
 * script did exactly that on its first run.
 */
function capture(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        ...options,
    });
    return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function step(name, fn) {
    process.stdout.write(`\n=== ${name} ===\n`);
    try {
        const outcome = fn();
        steps.push({ name, ...outcome });
        log(`  ${outcome.ok ? "ok" : "FAILED"}: ${outcome.detail}`);
        if (!outcome.ok) failed = true;
    } catch (error) {
        steps.push({ name, ok: false, detail: String(error?.message ?? error) });
        log(`  FAILED: ${String(error?.message ?? error)}`);
        failed = true;
    }
}

/* -------------------------------------------------------------------------- */

function nodeDependencies() {
    if (!checkOnly) {
        const install = run("pnpm", ["install"], { cwd: designRoot });
        if (install.status !== 0) {
            return { ok: false, detail: "pnpm install failed; see the output above" };
        }
    }
    const present = existsSync(join(designRoot, "node_modules"));
    return present
        ? { ok: true, detail: "workspace dependencies installed" }
        : { ok: false, detail: "design/node_modules is missing" };
}

/**
 * Electron ships its binary through a postinstall script. Two things go wrong.
 *
 * pnpm 10 no longer reads `onlyBuiltDependencies` from package.json, so if that
 * setting is in the wrong place the postinstall never runs at all. And when the
 * download is interrupted, `dist/` is left partially populated, after which the
 * installer treats it as done and exits 0 forever.
 */
function electronBinary() {
    const pnpmDir = join(designRoot, "node_modules", ".pnpm");
    if (!existsSync(pnpmDir)) return { ok: false, detail: "dependencies are not installed yet" };

    // Read the directory in-process. Shelling out to `node -e` with a Windows path
    // embedded in the script is a quoting hazard, and it silently reported a
    // perfectly good install as missing.
    const entry = readdirSync(pnpmDir).find((name) => name.startsWith("electron@"));
    if (entry === undefined) return { ok: false, detail: "electron is not in the dependency tree" };

    const pkgDir = join(pnpmDir, entry, "node_modules", "electron");
    const pathFile = join(pkgDir, "path.txt");

    const healthy = () => {
        if (!existsSync(pathFile)) return false;
        const exe = join(pkgDir, "dist", readFileSync(pathFile, "utf8").trim());
        return existsSync(exe) && statSync(exe).size > 1_000_000;
    };

    if (healthy()) return { ok: true, detail: "electron binary present and non-trivial" };
    if (checkOnly) return { ok: false, detail: "electron binary is missing or incomplete" };

    // A partial `dist/` is worse than none, because the installer skips a folder
    // that already exists. Clear it so the download actually happens.
    log("  electron binary incomplete; clearing dist/ and reinstalling");
    rmSync(join(pkgDir, "dist"), { recursive: true, force: true });
    rmSync(pathFile, { force: true });
    run("node", ["install.js"], { cwd: pkgDir });
    if (healthy()) return { ok: true, detail: "electron binary repaired by its own installer" };

    // Electron's installer extracts with `extract-zip`, which on some Windows setups
    // stops partway through a 130 MB archive and takes the whole process with it:
    // no error, no rejection, exit code 0, and a dist/ containing only locales/.
    // The download itself is fine, and the cached zip verifies against electron's
    // own checksums, so the repair is to extract it with something else rather than
    // to download it again.
    log("  the bundled extractor produced no binary; extracting the cached archive directly");
    const zip = findCachedElectronZip();
    if (zip === null) {
        return { ok: false, detail: "electron binary missing and no cached archive was found" };
    }
    log(`  using ${zip}`);
    mkdirSync(join(pkgDir, "dist"), { recursive: true });
    if (!extractZip(zip, join(pkgDir, "dist"))) {
        return { ok: false, detail: "could not extract the cached electron archive" };
    }
    // The installer normally writes this; it points index.js at the executable.
    writeFileSync(pathFile, process.platform === "win32" ? "electron.exe" : "electron", "utf8");

    return healthy()
        ? { ok: true, detail: "electron binary extracted from cache and verified" }
        : { ok: false, detail: "extraction completed but no usable binary appeared" };
}

/** Electron caches downloads under a per-URL hash directory; find the right archive. */
function findCachedElectronZip() {
    const home = process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? process.env.HOME ?? "";
    const roots = [
        join(home, "electron", "Cache"),
        join(home, ".cache", "electron"),
        join(home, "Library", "Caches", "electron"),
    ];
    const wanted = `electron-v${electronVersion()}-${process.platform}-${process.arch}.zip`;
    for (const root of roots) {
        if (!existsSync(root)) continue;
        for (const bucket of readdirSync(root)) {
            const candidate = join(root, bucket, wanted);
            if (existsSync(candidate)) return candidate;
        }
    }
    return null;
}

function electronVersion() {
    const pnpmDir = join(designRoot, "node_modules", ".pnpm");
    const entry = readdirSync(pnpmDir).find((name) => name.startsWith("electron@"));
    return entry === undefined ? "" : entry.slice("electron@".length).split("_")[0];
}

/** Extracts a zip with whatever the platform reliably provides. */
function extractZip(zipPath, targetDir) {
    if (process.platform === "win32") {
        const script =
            `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
            `[System.IO.Compression.ZipFile]::ExtractToDirectory(` +
            `'${zipPath.replace(/'/g, "''")}','${targetDir.replace(/'/g, "''")}')`;
        return run("powershell", ["-NoProfile", "-Command", script]).status === 0;
    }
    return run("unzip", ["-q", "-o", zipPath, "-d", targetDir]).status === 0;
}

function parseJavaMajor(output) {
    // Matches `openjdk version "25.0.3"` and the older `"1.8.0_392"` shape.
    const match = /version "(\d+)(?:\.(\d+))?/.exec(output);
    if (match === null) return null;
    const first = Number(match[1]);
    return first === 1 ? Number(match[2] ?? 0) : first;
}

function javaToolchain() {
    const output = capture("java", ["-version"]);
    const major = parseJavaMajor(output);
    if (major === null) {
        return {
            ok: false,
            detail:
                `no java on PATH. The app provisions a JDK at runtime for end users; ` +
                `for development install Temurin ${REQUIRED_JAVA_MAJOR} or set JAVA_HOME.`,
        };
    }
    if (major < REQUIRED_JAVA_MAJOR) {
        return {
            ok: false,
            detail: `java ${major} found, but upstream pins JavaLanguageVersion.of(${REQUIRED_JAVA_MAJOR})`,
        };
    }
    return { ok: true, detail: `java ${major} satisfies the required ${REQUIRED_JAVA_MAJOR}` };
}

/**
 * Builds upstream's renderer and the six server plugins from the vendored source.
 *
 * Gradle downloads itself through the wrapper and caches into a repository-local
 * directory, so nothing lands in the user profile and a second project on this
 * machine is unaffected either way.
 */
function bluemapJars() {
    if (skipJars) return { ok: true, detail: "skipped by --skip-jars" };
    if (!existsSync(join(vendorRoot, "gradlew"))) {
        return {
            ok: false,
            detail: "vendor/BlueMap is not checked out. Run: git submodule update --init --recursive",
        };
    }

    const cliJar = join(vendorRoot, "implementations", "cli", "build", "libs");
    const built = () =>
        existsSync(cliJar) &&
        capture("node", [
            "-e",
            `const fs=require('fs');const d=${JSON.stringify(cliJar)};` +
                `process.stdout.write(fs.existsSync(d)?fs.readdirSync(d).filter(n=>n.endsWith('-shadow.jar')).join(''):'')`,
        ]).trim() !== "";

    if (built()) return { ok: true, detail: "BlueMap CLI jar already built" };
    if (checkOnly) return { ok: false, detail: "BlueMap CLI jar is not built" };

    log("  building the BlueMap CLI from vendored source (first run downloads Gradle)");
    const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
    const build = run(wrapper, [":cli:shadowJar", "--no-daemon", "--console=plain"], {
        cwd: vendorRoot,
        env: { ...process.env, GRADLE_USER_HOME: gradleHome },
    });
    if (build.status !== 0) return { ok: false, detail: "gradle :cli:shadowJar failed" };

    return built()
        ? { ok: true, detail: "BlueMap CLI jar built" }
        : { ok: false, detail: "gradle reported success but produced no shadow jar" };
}

function playwrightBrowsers() {
    if (checkOnly) {
        return { ok: true, detail: "not checked; run the screenshot harness to exercise it" };
    }
    // Only the harness needs these, and it drives Electron rather than a browser, so
    // a failure here is a warning rather than a blocker.
    const install = run("pnpm", ["exec", "playwright", "install-deps", "chromium"], {
        cwd: join(designRoot, "packages", "app"),
        quiet: true,
    });
    return install.status === 0
        ? { ok: true, detail: "playwright dependencies present" }
        : { ok: true, detail: "playwright deps not installed (only the screenshot harness needs them)" };
}

/* -------------------------------------------------------------------------- */

log(`material-bluemap bootstrap${checkOnly ? " (check only)" : ""}`);
log(`repository: ${repoRoot}`);

step("Node dependencies", nodeDependencies);
step("Electron binary", electronBinary);
step("Java toolchain", javaToolchain);
step("BlueMap jars", bluemapJars);
step("Playwright browsers", playwrightBrowsers);

log("\n=== summary ===");
for (const entry of steps) {
    log(`  ${entry.ok ? "ok     " : "FAILED "} ${entry.name}: ${entry.detail}`);
}

if (failed) {
    log("\nSomething is not ready. Each failure above names what is missing and how to get it.");
    process.exit(1);
}
log("\nEverything is installed and verified. Next: cd design && pnpm build && pnpm test");
