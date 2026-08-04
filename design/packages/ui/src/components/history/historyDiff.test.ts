/**
 * The readable diff, tested against real HOCON rather than against a stand-in.
 *
 * The whole claim of `historyDiff.ts` is that it reports what a *person* would say changed,
 * and the only way to check that is to hand it the kind of file BlueMap actually writes -
 * comments, blank lines, nested objects, arrays, quoted strings - and assert the sentence
 * that comes out. A test built on a hand-made settings map would pass while the parser it
 * ships with disagreed with it.
 *
 * Three of these matter more than the rest, because they are the ones a naive line-diff
 * gets wrong and a reader would never know:
 *
 *  - a setting that moved in the file but kept its value is **not** a change;
 *  - a comment somebody added is **not** a change to any setting;
 *  - a file that cannot be parsed falls back to the raw patch **and says so**, rather than
 *    rendering an empty list that reads as "nothing happened".
 */

import { describe, expect, it } from "vitest";

import {
    MAX_LISTED_SETTINGS,
    configFileName,
    diffSettings,
    diffTotals,
    flattenSettings,
    formatOf,
    formatSettingValue,
    readSettings,
    readableDiff,
    readableFileDiff,
    sameValue,
} from "./historyDiff.js";
import type { HistoryComparisonFile } from "./historyHost.js";

function file(partial: Partial<HistoryComparisonFile> & { path: string }): HistoryComparisonFile {
    return {
        status: "modified",
        patch: "",
        before: null,
        after: null,
        withheld: null,
        ...partial,
    };
}

/* -------------------------------------------------------------------------- */

describe("a config file is named the way the rest of the editor names it", () => {
    it("recognises maps, storages and each root config", () => {
        expect(configFileName("maps/nether.conf")).toEqual({ kind: "map", name: "nether", path: "maps/nether.conf" });
        expect(configFileName("storages/sql.conf")).toEqual({
            kind: "storage",
            name: "sql",
            path: "storages/sql.conf",
        });
        expect(configFileName("core.conf").kind).toBe("core");
        expect(configFileName("webapp.conf").kind).toBe("webapp");
        expect(configFileName("webserver.conf").kind).toBe("webserver");
        expect(configFileName("plugin.conf").kind).toBe("plugin");
    });

    it("keeps the path for a file it does not model, rather than inventing a name", () => {
        expect(configFileName("extra.conf")).toEqual({ kind: "other", name: "", path: "extra.conf" });
        expect(configFileName("odd/place/deep.conf").kind).toBe("other");
    });

    it("reads a Windows path as the same file as its slash-separated twin", () => {
        expect(configFileName("maps\\nether.conf")).toEqual(configFileName("maps/nether.conf"));
    });
});

describe("a file is flattened to dotted keys a person would recognise", () => {
    it("walks nested objects and stops at scalars", () => {
        const flat = flattenSettings({ "render-edges": { enabled: true, depth: 3 }, name: "Overworld" });
        expect([...flat.entries()].sort()).toEqual([
            ["name", "Overworld"],
            ["render-edges.depth", 3],
            ["render-edges.enabled", true],
        ]);
    });

    it("treats an array as one setting rather than as one setting per item", () => {
        // Otherwise inserting one item at the front reports every later index as changed,
        // which describes what a diff algorithm did rather than what a person did.
        const flat = flattenSettings({ "render-mask": [1, 2, 3] });
        expect([...flat.keys()]).toEqual(["render-mask"]);
        expect(flat.get("render-mask")).toEqual([1, 2, 3]);
    });

    it("keeps an empty object as a leaf, so a key present on one side does not vanish", () => {
        const flat = flattenSettings({ markers: {} });
        expect([...flat.keys()]).toEqual(["markers"]);
    });
});

describe("reading a file into settings, or saying why it could not be", () => {
    it("reads HOCON with comments and gives back only the settings", () => {
        const outcome = readSettings(
            "core.conf",
            [
                "## BlueMap ##",
                "",
                "# Whether the client resources may be downloaded.",
                "accept-download: false",
                "",
                'data: "bluemap"',
            ].join("\n"),
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect([...outcome.settings.entries()].sort()).toEqual([
            ["accept-download", false],
            ["data", "bluemap"],
        ]);
    });

    it("reads JSON", () => {
        const outcome = readSettings("material-bluemap.project.json", '{"version": 1, "maps": []}');
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.settings.get("version")).toBe(1);
    });

    it("says which line a broken config failed on, rather than a bare failure", () => {
        const outcome = readSettings("core.conf", 'a: "unterminated\nb: 1\n');
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.reason).toContain("core.conf");
        expect(outcome.reason).toMatch(/line \d+/);
    });

    it("refuses a file it does not model at all, by extension", () => {
        expect(formatOf("core.conf")).toBe("hocon");
        expect(formatOf("thing.json")).toBe("json");
        expect(formatOf("notes.txt")).toBeNull();
        expect(readSettings("notes.txt", "hello").ok).toBe(false);
    });
});

describe("a value is printed the way somebody would say it", () => {
    it("drops the quotes from a string, but not from an empty one", () => {
        expect(formatSettingValue("#7dabff")).toBe("#7dabff");
        // Without the quotes an empty string renders as nothing and reads as a missing
        // value, which is a different fact.
        expect(formatSettingValue("")).toBe('""');
    });

    it("prints numbers, booleans and null plainly", () => {
        expect(formatSettingValue(4)).toBe("4");
        expect(formatSettingValue(true)).toBe("true");
        expect(formatSettingValue(null)).toBe("null");
    });

    it("prints an array as a list, cut with a mark when it runs long", () => {
        expect(formatSettingValue([1, 2, 3])).toBe("[1, 2, 3]");
        const long = formatSettingValue(Array.from({ length: 200 }, (_, index) => index));
        expect(long.endsWith("…")).toBe(true);
    });

    it("compares values structurally rather than by their printed form", () => {
        expect(sameValue([1, 2], [1, 2])).toBe(true);
        expect(sameValue(1, 1)).toBe(true);
        expect(sameValue("1", 1)).toBe(false);
        expect(sameValue(undefined, undefined)).toBe(true);
        expect(sameValue(undefined, 1)).toBe(false);
    });
});

describe("the setting-level diff says what changed, not which lines moved", () => {
    it("reports one changed setting as one line with both values", () => {
        const diff = readableFileDiff(
            file({
                path: "maps/nether.conf",
                before: 'sky-color: "#7dabff"\nambient-light: 0.1\n',
                after: 'sky-color: "#ffffff"\nambient-light: 0.1\n',
            }),
        );

        expect(diff.settings).toEqual([
            { key: "sky-color", kind: "changed", before: "#7dabff", after: "#ffffff", beforeValue: "#7dabff" },
        ]);
        expect(diff.total).toBe(1);
        expect(diff.unreadable).toBeNull();
    });

    it("does not report a setting that only moved in the file", () => {
        // The exact failure this module exists to prevent: a five-line patch describing a
        // change that did not happen.
        const diff = readableFileDiff(
            file({
                path: "core.conf",
                before: 'accept-download: false\ndata: "bluemap"\n',
                after: 'data: "bluemap"\naccept-download: false\n',
            }),
        );
        expect(diff.settings).toEqual([]);
        expect(diff.total).toBe(0);
    });

    it("does not report a comment somebody added as a setting change", () => {
        const diff = readableFileDiff(
            file({
                path: "core.conf",
                before: "accept-download: false\n",
                after: "# I turned this off deliberately, do not change it back\naccept-download: false\n",
            }),
        );
        expect(diff.settings).toEqual([]);
    });

    it("tells added and taken-away settings apart from changed ones", () => {
        const diff = readableFileDiff(
            file({
                path: "maps/nether.conf",
                before: 'world: "world"\nremoved-key: 1\n',
                after: 'world: "world"\nnew-key: "yes"\n',
            }),
        );

        expect(diff.settings?.map((change) => [change.key, change.kind])).toEqual([
            ["new-key", "added"],
            ["removed-key", "gone"],
        ]);
        expect(diff.settings?.[0]?.before).toBeNull();
        expect(diff.settings?.[1]?.after).toBeNull();
    });

    it("reads a whole file that was added, rather than stopping at its name", () => {
        const diff = readableFileDiff(
            file({
                path: "maps/nether.conf",
                status: "added",
                before: null,
                after: 'world: "world"\ndimension: "minecraft:the_nether"\n',
            }),
        );
        expect(diff.status).toBe("added");
        expect(diff.settings?.map((change) => change.key).sort()).toEqual(["dimension", "world"]);
        expect(diff.settings?.every((change) => change.kind === "added")).toBe(true);
    });

    it("reads a whole file that was taken away, as every setting going", () => {
        const diff = readableFileDiff(
            file({
                path: "maps/nether.conf",
                status: "deleted",
                before: 'world: "world"\n',
                after: null,
            }),
        );
        expect(diff.settings?.map((change) => change.kind)).toEqual(["gone"]);
    });

    it("falls back to the patch and says why, when the file cannot be parsed", () => {
        const diff = readableFileDiff(
            file({
                path: "core.conf",
                before: 'a: "unterminated\n',
                after: "a: 1\n",
                patch: "--- a/core.conf\n+++ b/core.conf\n",
            }),
        );
        expect(diff.settings).toBeNull();
        expect(diff.unreadable).toContain("could not be read");
        // The patch is still there. The fallback is a different presentation, not less data.
        expect(diff.patch).toContain("core.conf");
    });

    it("repeats the main process's own reason when a side was withheld", () => {
        const diff = readableFileDiff(
            file({ path: "big.conf", withheld: "big.conf is larger than this editor reads whole." }),
        );
        expect(diff.settings).toBeNull();
        expect(diff.unreadable).toContain("larger than this editor reads whole");
    });

    it("distinguishes a file that changed with no setting in it from one it could not read", () => {
        const moved = readableFileDiff(
            file({ path: "core.conf", before: "a: 1\n", after: "\n\na: 1\n" }),
        );
        // Empty means "the file changed but no setting did", which is a real thing to be
        // told. Null means "here is the patch instead". The interface says them differently.
        expect(moved.settings).toEqual([]);
        expect(moved.settings).not.toBeNull();
    });

    it("lists the first settings and counts the rest, rather than becoming the wall of text it replaces", () => {
        const many = Array.from({ length: MAX_LISTED_SETTINGS + 12 }, (_, index) => `key${String(index)}: ${String(index)}`);
        const diff = readableFileDiff(file({ path: "core.conf", before: "", after: `${many.join("\n")}\n` }));

        expect(diff.settings).toHaveLength(MAX_LISTED_SETTINGS);
        expect(diff.total).toBe(MAX_LISTED_SETTINGS + 12);
        expect(diff.unreadable).toContain("12 further settings");
    });

    it("orders settings by key, so two runs of the same comparison read the same way", () => {
        const diff = readableFileDiff(
            file({ path: "core.conf", before: "", after: "zeta: 1\nalpha: 2\nmiddle: 3\n" }),
        );
        expect(diff.settings?.map((change) => change.key)).toEqual(["alpha", "middle", "zeta"]);
    });

    it("compares two flattened maps directly, for callers that already have them", () => {
        const changes = diffSettings(new Map([["a", 1]]), new Map([["a", 2]]));
        expect(changes).toEqual([{ key: "a", kind: "changed", before: "1", after: "2", beforeValue: 1 }]);
    });
});

describe("a comparison totals up to something a reader can scan", () => {
    it("counts files by what happened to them and settings across all of them", () => {
        const diffs = readableDiff([
            file({ path: "core.conf", before: "a: 1\n", after: "a: 2\n" }),
            file({ path: "maps/nether.conf", status: "added", after: 'world: "world"\n' }),
            file({ path: "maps/end.conf", status: "deleted", before: 'world: "end"\n' }),
        ]);

        expect(diffTotals(diffs)).toEqual({
            files: 3,
            added: 1,
            modified: 1,
            deleted: 1,
            settings: 3,
            unreadable: 0,
        });
    });

    it("counts the files it could not read separately, so the settings total reads as a floor", () => {
        const diffs = readableDiff([
            file({ path: "core.conf", before: "a: 1\n", after: "a: 2\n" }),
            file({ path: "notes.txt", before: "one\n", after: "two\n" }),
        ]);
        const totals = diffTotals(diffs);
        expect(totals.settings).toBe(1);
        expect(totals.unreadable).toBe(1);
    });
});
