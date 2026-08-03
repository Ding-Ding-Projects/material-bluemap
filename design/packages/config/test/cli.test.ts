import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCliArgs, CLI_FLAGS, EMPTY_INVOCATION, formatCliCommand, parseCliArgs, resolveCliActions } from "../src/cli/flags.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * `--help` as the real jar printed it. Captured with:
 *   cd vendor/BlueMap/implementations/cli/build/libs
 *   java -jar cli-5.22-27-shadow.jar --help
 *
 * Only the line endings were changed, from the CRLF the JVM wrote on Windows to
 * LF, which is also what this repository's .gitattributes would do to it. The
 * normalisation below means the test passes either way.
 */
const helpText = readFileSync(join(here, "fixtures", "cli-help.txt"), "utf8").replaceAll("\r\n", "\n");

/** Reads the option table out of Commons CLI's wrapped help output. */
function flagsFromHelp(text: string): { short: string | null; long: string; argument: string | null; description: string }[] {
    const lines = text.split("\n");
    const start = lines.indexOf("Options:") + 1;
    const end = lines.indexOf("Examples:");
    const entries: { short: string | null; long: string; argument: string | null; description: string }[] = [];

    for (const line of lines.slice(start, end)) {
        // A new option starts with " -x,--long" or "    --long"; continuation
        // lines are wrapped description text indented much further.
        const header = /^ (?:-(\w),)?\s*--([\w-]+)(?:\s+<([^>]+)>)?\s{2,}(.*)$/.exec(line);
        if (header !== null) {
            entries.push({ short: header[1] ?? null, long: header[2] as string, argument: header[3] ?? null, description: (header[4] as string).trim() });
            continue;
        }
        const continuation = /^\s{20,}(\S.*)$/.exec(line);
        const last = entries[entries.length - 1];
        if (continuation !== null && last !== undefined) last.description = `${last.description} ${(continuation[1] as string).trim()}`;
    }

    return entries;
}

describe("the flag list matches what the jar prints", () => {
    const printed = flagsFromHelp(helpText);

    it("finds every option in the captured help output", () => {
        expect(printed).toHaveLength(CLI_FLAGS.length);
    });

    it.each(CLI_FLAGS)("--$long", (flag) => {
        const match = printed.find((entry) => entry.long === flag.long);
        expect(match, `--${flag.long} is not in the jar's help output`).toBeDefined();
        expect(match?.short ?? null).toBe(flag.short);
        expect(match?.argument ?? null).toBe(flag.argument?.name ?? null);
        expect(match?.description).toBe(flag.description);
    });

    it("has no flag the jar does not print", () => {
        expect(CLI_FLAGS.map((flag) => flag.long).sort()).toEqual(printed.map((entry) => entry.long).sort());
    });

    it("gives every flag a label, a group and a control for the GUI", () => {
        for (const flag of CLI_FLAGS) {
            expect(flag.label.length, flag.long).toBeGreaterThan(0);
            expect(flag.group.length, flag.long).toBeGreaterThan(0);
            expect(flag.control.kind.length, flag.long).toBeGreaterThan(0);
        }
    });
});

describe("building and reading an argument list", () => {
    it("builds the arguments for the render that produced 961 tiles", () => {
        const invocation = { ...EMPTY_INVOCATION, configFolder: "/tmp/config", render: true, generateWebapp: true };
        expect(buildCliArgs(invocation)).toEqual(["-c", "/tmp/config", "-r", "-g"]);
        expect(formatCliCommand("/opt/cli.jar", invocation)).toBe("java -jar /opt/cli.jar -c /tmp/config -r -g");
    });

    it("quotes a path with a space when showing the command", () => {
        expect(formatCliCommand("C:/Program Files/cli.jar", { ...EMPTY_INVOCATION, configFolder: "C:/my maps/config" })).toBe(
            'java -jar "C:/Program Files/cli.jar" -c "C:/my maps/config"',
        );
    });

    it("round-trips every invocation through build and parse", () => {
        const invocation = {
            ...EMPTY_INVOCATION,
            configFolder: "/config",
            modsFolder: "/mods",
            minecraftVersion: "1.21.4",
            logFile: "/logs/bluemap.log",
            append: true,
            webserver: true,
            verbose: true,
            generateWebapp: true,
            generateWebsettings: true,
            render: true,
            fixEdges: true,
            forceRender: true,
            maps: ["world", "nether"],
            markers: true,
            watch: true,
        };
        expect(parseCliArgs(buildCliArgs(invocation)).invocation).toEqual(invocation);
    });

    it("reads the spellings Commons CLI accepts", () => {
        expect(parseCliArgs(["-c", "/a"]).invocation.configFolder).toBe("/a");
        expect(parseCliArgs(["-c/a"]).invocation.configFolder).toBe("/a");
        expect(parseCliArgs(["--config", "/a"]).invocation.configFolder).toBe("/a");
        expect(parseCliArgs(["--config=/a"]).invocation.configFolder).toBe("/a");
    });

    it("reads grouped switches, so -ru is render plus watch", () => {
        const { invocation } = parseCliArgs(["-ru"]);
        expect(invocation.render).toBe(true);
        expect(invocation.watch).toBe(true);
    });

    it("reports an option it does not know instead of ignoring it", () => {
        expect(parseCliArgs(["--rendre"]).issues).toEqual([{ argument: "--rendre", message: 'Unrecognised option "--rendre"' }]);
        expect(parseCliArgs(["-z"]).issues).toEqual([{ argument: "-z", message: 'Unrecognised option "-z"' }]);
    });

    it("reports a missing value", () => {
        expect(parseCliArgs(["-c"]).issues).toEqual([{ argument: "-c", message: '"-c" needs a <config-folder>' }]);
    });
});

describe("what a set of flags actually does", () => {
    it("says nothing happens when no action flag is given", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, configFolder: "/config" });
        expect(actions.noActions).toBe(true);
        expect(actions.generatesMissingConfigs).toBe(true);
        expect(actions.notes).toContain("Nothing to do: the CLI writes any missing config files, prints its help, and exits with status 1.");
    });

    it("resolves a plain render", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, render: true });
        expect(actions.render).toEqual({ watch: false, force: "none", forceGenerateWebapp: false, maps: null });
    });

    it("resolves --force-render and --fix-edges to upstream's update strategies", () => {
        expect(resolveCliActions({ ...EMPTY_INVOCATION, forceRender: true }).render?.force).toBe("all");
        expect(resolveCliActions({ ...EMPTY_INVOCATION, fixEdges: true }).render?.force).toBe("edge");
    });

    it("says which of --force-render and --fix-edges wins", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, forceRender: true, fixEdges: true });
        expect(actions.render?.force).toBe("all");
        expect(actions.notes).toContain("--force-render wins over --fix-edges: everything is re-rendered, not only the edges.");
    });

    it("says that --markers is not reached during a render, rather than promising it", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, render: true, markers: true });
        expect(actions.updateMarkers).toBeNull();
        expect(actions.notes).toContain("--markers does nothing here: the render branch does not reach it. Run it without the render flags.");
    });

    it("updates markers when there is no render", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, markers: true, maps: ["world"] });
        expect(actions.updateMarkers).toEqual({ maps: ["world"] });
        expect(actions.render).toBeNull();
    });

    it("treats -g inside a render as forcing the web app to be regenerated", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, render: true, generateWebapp: true });
        expect(actions.render?.forceGenerateWebapp).toBe(true);
        expect(actions.regenerateWebapp).toBe(false);
    });

    it("treats -g on its own as generating the web app", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, generateWebapp: true });
        expect(actions.regenerateWebapp).toBe(true);
        expect(actions.noActions).toBe(false);
    });

    it("starts the web server alongside anything else", () => {
        expect(resolveCliActions({ ...EMPTY_INVOCATION, webserver: true, verbose: true }).startWebserver).toEqual({ verbose: true });
        expect(resolveCliActions({ ...EMPTY_INVOCATION, render: true, webserver: true }).startWebserver).toEqual({ verbose: false });
    });

    it("reminds the caller that a render needs the Mojang download accepted", () => {
        expect(resolveCliActions({ ...EMPTY_INVOCATION, render: true }).notes).toContain(
            "Rendering downloads and reads a Minecraft client jar, so core.conf must have accept-download set to true first.",
        );
    });

    it("answers --help and --version without touching the config folder", () => {
        const actions = resolveCliActions({ ...EMPTY_INVOCATION, help: true });
        expect(actions.generatesMissingConfigs).toBe(false);
        expect(actions.render).toBeNull();
    });

    it("points out flags that will not do anything", () => {
        expect(resolveCliActions({ ...EMPTY_INVOCATION, verbose: true, generateWebapp: true }).notes).toContain(
            "--verbose only affects the web server, which is not being started.",
        );
        expect(resolveCliActions({ ...EMPTY_INVOCATION, append: true, generateWebapp: true }).notes).toContain("--append only affects --log-file, which is not set.");
        expect(resolveCliActions({ ...EMPTY_INVOCATION, maps: ["world"], generateWebapp: true }).notes).toContain(
            "--maps only narrows a render or a marker update, neither of which is happening.",
        );
    });
});
