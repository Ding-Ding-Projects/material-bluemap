import { describe, expect, it } from "vitest";
import { CLI_FLAGS, EMPTY_INVOCATION, buildCliArgs, parseCliArgs, resolveCliActions } from "@material-bluemap/config";
import { FLAG_BINDINGS, FLAG_GROUPS, flagSearchText, flagValue, flagsInGroup, withFlagValue } from "./cliRun.js";

describe("coverage", () => {
    it("binds every flag the CLI accepts, so none can appear without a working control", () => {
        for (const flag of CLI_FLAGS) {
            expect(FLAG_BINDINGS[flag.long], `no binding for --${flag.long}`).toBeDefined();
        }
        expect(Object.keys(FLAG_BINDINGS)).toHaveLength(CLI_FLAGS.length);
    });

    it("puts every flag on exactly one screen group", () => {
        const grouped = FLAG_GROUPS.flatMap((group) => flagsInGroup(group.id));
        expect(grouped.map((flag) => flag.long).sort()).toEqual(CLI_FLAGS.map((flag) => flag.long).sort());
    });
});

describe("reading and writing one flag", () => {
    it("round-trips a switch", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "render")!;
        expect(flagValue(EMPTY_INVOCATION, flag)).toBe(false);

        const on = withFlagValue(EMPTY_INVOCATION, flag, true);
        expect(flagValue(on, flag)).toBe(true);
        expect(buildCliArgs(on)).toEqual(["-r"]);
    });

    it("round-trips a path", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "config")!;
        const set = withFlagValue(EMPTY_INVOCATION, flag, "/srv/bluemap/config");

        expect(flagValue(set, flag)).toBe("/srv/bluemap/config");
        expect(buildCliArgs(set)).toEqual(["-c", "/srv/bluemap/config"]);
    });

    it("treats an emptied text field as unset rather than as an empty argument", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "config")!;
        const cleared = withFlagValue(withFlagValue(EMPTY_INVOCATION, flag, "/cfg"), flag, "");

        expect(flagValue(cleared, flag)).toBe("");
        expect(buildCliArgs(cleared)).toEqual([]);
    });

    it("round-trips the comma-separated map list", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "maps")!;
        const set = withFlagValue(EMPTY_INVOCATION, flag, ["overworld", "nether"]);

        expect(flagValue(set, flag)).toEqual(["overworld", "nether"]);
        expect(buildCliArgs({ ...set, render: true })).toEqual(["-r", "-m", "overworld,nether"]);
    });

    it("drops the map list entirely when the last entry is removed", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "maps")!;
        const emptied = withFlagValue(withFlagValue(EMPTY_INVOCATION, flag, ["overworld"]), flag, []);
        expect(buildCliArgs({ ...emptied, render: true })).toEqual(["-r"]);
    });
});

describe("what the built command means", () => {
    it("survives a round trip through the CLI's own parser", () => {
        let invocation = EMPTY_INVOCATION;
        for (const [long, value] of [
            ["config", "/cfg"],
            ["render", true],
            ["force-render", true],
            ["watch", true],
        ] as const) {
            const flag = CLI_FLAGS.find((candidate) => candidate.long === long)!;
            invocation = withFlagValue(invocation, flag, value);
        }

        const parsed = parseCliArgs(buildCliArgs(invocation));
        expect(parsed.issues).toEqual([]);
        expect(parsed.invocation).toEqual(invocation);
    });

    it("is described by the config package's own resolver, flags and all", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "markers")!;
        const withRender = withFlagValue({ ...EMPTY_INVOCATION, render: true }, flag, true);
        const actions = resolveCliActions(withRender);

        expect(actions.updateMarkers).toBeNull();
        expect(actions.notes.some((note) => note.includes("--markers does nothing here"))).toBe(true);
    });
});

describe("searching the flags", () => {
    it("looks at the label, both option spellings and the description", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "fix-edges")!;
        const text = flagSearchText(flag);

        expect(text).toContain("--fix-edges");
        expect(text).toContain("-e");
        expect(text).toContain(flag.description);
    });

    it("gives a long-only flag no short spelling rather than inventing one", () => {
        const flag = CLI_FLAGS.find((candidate) => candidate.long === "markers")!;
        expect(flag.short).toBeNull();
        expect(flagSearchText(flag)).toContain("--markers");
    });
});
