import { describe, expect, it } from "vitest";
import { CLI_FLAGS, formatHelp, formatVersion, parseCliArgs, resolveCliActions } from "../src/args.js";

describe("args: parseCliArgs (re-exported from @material-bluemap/config, exercised through this package's own entry)", () => {
    it("parses grouped short flags the way Commons CLI would", () => {
        const { invocation, issues } = parseCliArgs(["-ru", "-c", "myconfig"]);
        expect(issues).toEqual([]);
        expect(invocation.render).toBe(true);
        expect(invocation.watch).toBe(true);
        expect(invocation.configFolder).toBe("myconfig");
    });

    it("parses --flag=value and --flag value forms identically", () => {
        const equals = parseCliArgs(["--config=a"]);
        const spaced = parseCliArgs(["--config", "a"]);
        expect(equals.invocation.configFolder).toBe("a");
        expect(spaced.invocation.configFolder).toBe("a");
    });

    it("reports an issue for an unrecognised flag, rather than silently ignoring it", () => {
        const { issues } = parseCliArgs(["--not-a-real-flag"]);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]!.message).toContain("Unrecognised option");
    });

    it("reports an issue for a flag missing its required value", () => {
        const { issues } = parseCliArgs(["-c"]);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]!.message).toContain("needs a");
    });

    it("splits -m into a maps list", () => {
        const { invocation } = parseCliArgs(["-m", "world,nether"]);
        expect(invocation.maps).toEqual(["world", "nether"]);
    });
});

describe("args: resolveCliActions mirrors BlueMapCLI.main()'s branching", () => {
    it("-r alone renders with no force, watch or maps filter", () => {
        const { invocation } = parseCliArgs(["-r"]);
        const actions = resolveCliActions(invocation);
        expect(actions.render).toEqual({ watch: false, force: "none", forceGenerateWebapp: false, maps: null });
        expect(actions.noActions).toBe(false);
    });

    it("no flags at all resolves to noActions", () => {
        const actions = resolveCliActions(parseCliArgs([]).invocation);
        expect(actions.noActions).toBe(true);
        expect(actions.generatesMissingConfigs).toBe(true);
    });

    it("--help / --version short-circuit before any config is touched", () => {
        const help = resolveCliActions(parseCliArgs(["--help"]).invocation);
        expect(help.generatesMissingConfigs).toBe(false);
        expect(help.noActions).toBe(false);
        const version = resolveCliActions(parseCliArgs(["--version"]).invocation);
        expect(version.generatesMissingConfigs).toBe(false);
    });

    it("--markers alone updates markers without rendering", () => {
        const actions = resolveCliActions(parseCliArgs(["--markers", "-m", "world"]).invocation);
        expect(actions.render).toBeNull();
        expect(actions.updateMarkers).toEqual({ maps: ["world"] });
    });
});

describe("args: help/version text", () => {
    it("formatHelp lists every declared flag by its long name", () => {
        const help = formatHelp();
        for (const flag of CLI_FLAGS) expect(help).toContain(`--${flag.long}`);
        expect(help).toContain("Examples:");
    });

    it("formatVersion prints the app version then the git hash, one per line", () => {
        expect(formatVersion("1.2.3", "abcdef")).toBe("1.2.3\nabcdef");
    });
});
