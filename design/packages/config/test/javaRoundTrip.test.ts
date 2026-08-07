import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseHocon, setPlainValue, writeHocon } from "../src/hocon/index.js";
import { generateConfigSet } from "../src/generate.js";
import { buildCliArgs, EMPTY_INVOCATION, formatCliCommand } from "../src/cli/flags.js";

/**
 * The one test that proves the whole point of the HOCON writer: that upstream's
 * real Java CLI reads what this package writes.
 *
 * Everything else here is TypeScript checking TypeScript. This runs the actual
 * `cli-*-shadow.jar`, hands it a config folder this package generated and then
 * edited through its own reader and writer, and reads back the `settings.json`
 * the Java side produced to confirm the edited values arrived.
 *
 * It is skipped, not failed, when the jar or a JVM is missing, because a
 * consumer of this package has neither. To run it by hand:
 *
 *   cd vendor/BlueMap
 *   GRADLE_USER_HOME=tools/oracle/.gradle ./gradlew :cli:shadowJar
 *   cd design && npx vitest run packages/config/test/javaRoundTrip.test.ts
 *
 * Point it at a jar somewhere else with BLUEMAP_CLI_JAR=/path/to/cli-shadow.jar.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..", "..", "..", "..");

function findCliJar(): string | null {
    const fromEnvironment = process.env["BLUEMAP_CLI_JAR"];
    if (fromEnvironment !== undefined && existsSync(fromEnvironment)) return fromEnvironment;

    const libs = join(repoRoot, "vendor", "BlueMap", "implementations", "cli", "build", "libs");
    if (!existsSync(libs)) return null;

    const jar = readdirSync(libs).find((name) => name.startsWith("cli-") && name.endsWith("-shadow.jar"));
    return jar === undefined ? null : join(libs, jar);
}

function hasJava(): boolean {
    try {
        execFileSync("java", ["-version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

const cliJar = findCliJar();
const runnable = cliJar !== null && hasJava();

const workspaces: string[] = [];

afterAll(() => {
    for (const workspace of workspaces) rmSync(workspace, { recursive: true, force: true });
});

function newWorkspace(): string {
    const workspace = mkdtempSync(join(tmpdir(), "worldlens-config-"));
    workspaces.push(workspace);
    return workspace;
}

/** Writes a generated config set to disk, creating the folders it needs. */
function writeConfigSet(configRoot: string, files: { path: string; text: string }[]): void {
    for (const file of files) {
        const target = join(configRoot, ...file.path.split("/"));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.text, "utf8");
    }
}

describe.skipIf(!runnable)("the real Java CLI reads what this package writes", () => {
    it(
        "loads an edited config folder and reports our values back in settings.json",
        { timeout: 120_000 },
        () => {
            const workspace = newWorkspace();
            const configRoot = join(workspace, "config");
            // Absolute paths, always: the CLI resolves relative paths in these
            // files against its working directory, not the config folder.
            const webroot = join(workspace, "web").replaceAll("\\", "/");
            const dataFolder = join(workspace, "data").replaceAll("\\", "/");
            const world = join(workspace, "world").replaceAll("\\", "/");

            writeConfigSet(configRoot, generateConfigSet({ webroot, dataFolder, world, version: "test", separator: "/" }));

            // Now edit through the reader and writer, the way the GUI will.
            const webappPath = join(configRoot, "webapp.conf");
            let webapp = parseHocon(readFileSync(webappPath, "utf8"));
            webapp = setPlainValue(webapp, ["use-cookies"], false);
            webapp = setPlainValue(webapp, ["max-zoom-distance"], 12345);
            webapp = setPlainValue(webapp, ["hires-slider-default"], 250);
            webapp = setPlainValue(webapp, ["scripts"], ["js/added-by-the-editor.js"]);
            webapp = setPlainValue(webapp, ["map-data-root"], "https://example.invalid/mapdata");
            writeFileSync(webappPath, writeHocon(webapp), "utf8");

            // Reordering the maps proves a map config survived the trip too.
            const overworldPath = join(configRoot, "maps", "overworld.conf");
            writeFileSync(overworldPath, writeHocon(setPlainValue(parseHocon(readFileSync(overworldPath, "utf8")), ["sorting"], 300)), "utf8");

            const invocation = { ...EMPTY_INVOCATION, configFolder: configRoot, generateWebsettings: true };
            const output = execFileSync("java", ["-jar", cliJar as string, ...buildCliArgs(invocation)], {
                cwd: workspace,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            });

            expect(output).not.toMatch(/failed to parse/i);

            const settings = JSON.parse(readFileSync(join(workspace, "web", "settings.json"), "utf8")) as Record<string, unknown>;

            expect(settings["useCookies"]).toBe(false);
            expect(settings["maxZoomDistance"]).toBe(12345);
            expect(settings["hiresSliderDefault"]).toBe(250);
            expect(settings["scripts"]).toEqual(["js/added-by-the-editor.js"]);
            expect(settings["mapDataRoot"]).toBe("https://example.invalid/mapdata");
            // sorting 300 puts the overworld behind the nether (100) and end (200).
            expect(settings["maps"]).toEqual(["nether", "end", "overworld"]);

            // Recorded so the exact command is in the test output, not only in a
            // comment somebody has to trust.
            expect(formatCliCommand(cliJar as string, invocation)).toContain("-s");
        },
    );

    it(
        "loads a config folder whose files were only round-tripped, with nothing changed",
        { timeout: 120_000 },
        () => {
            const workspace = newWorkspace();
            const configRoot = join(workspace, "config");
            const webroot = join(workspace, "web").replaceAll("\\", "/");

            writeConfigSet(
                configRoot,
                generateConfigSet({
                    webroot,
                    dataFolder: join(workspace, "data").replaceAll("\\", "/"),
                    world: join(workspace, "world").replaceAll("\\", "/"),
                    version: "test",
                    separator: "/",
                }),
            );

            // Read and re-write every file. The bytes must not move at all.
            const walk = (directory: string): void => {
                for (const entry of readdirSync(directory, { withFileTypes: true })) {
                    const path = join(directory, entry.name);
                    if (entry.isDirectory()) {
                        walk(path);
                        continue;
                    }
                    const before = readFileSync(path, "utf8");
                    const after = writeHocon(parseHocon(before));
                    expect(after, path).toBe(before);
                    writeFileSync(path, after, "utf8");
                }
            };
            walk(configRoot);

            const output = execFileSync("java", ["-jar", cliJar as string, "-c", configRoot, "-s"], {
                cwd: workspace,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            });
            expect(output).not.toMatch(/failed to parse/i);
            expect(existsSync(join(workspace, "web", "settings.json"))).toBe(true);
        },
    );
});

describe.skipIf(runnable)("the Java round trip", () => {
    it("is skipped because no CLI jar or JVM was found", () => {
        // Recorded as a passing test rather than silence, so a run that never
        // exercised the Java side cannot be mistaken for one that did.
        expect(cliJar === null || !hasJava()).toBe(true);
    });
});
