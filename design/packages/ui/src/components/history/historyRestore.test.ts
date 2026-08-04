/**
 * Putting one setting back, tested on the property that matters: everything else survives.
 *
 * A setting-level restore is only worth having if the file it lands in comes out otherwise
 * untouched. If the comments go, somebody who used the feature once will never use it
 * again, and rightly - the comments in a BlueMap config are the only place several of the
 * settings are explained. So the first test here writes a file with comments, blank lines
 * and a neighbouring setting, restores one key, and asserts every one of those is still
 * there afterwards.
 *
 * The rest are the refusals. A merge that quietly did three of four settings would leave
 * somebody believing a setting was restored when it was not, and that is worse than a
 * refusal, because a refusal is visible.
 */

import { describe, expect, it } from "vitest";

import { isAddressableKey, mergeSettingsBack, settingValueAt } from "./historyRestore.js";

const OLD_CORE = [
    "## BlueMap ##",
    "",
    "# Whether the client resources may be downloaded from Mojang.",
    "# You have to accept Mojang's EULA to use them.",
    "accept-download: false",
    "",
    "# Where rendered maps are written.",
    'data: "bluemap"',
    "",
    "render-thread-count: 2",
].join("\n");

const NEW_CORE = [
    "## BlueMap ##",
    "",
    "# Whether the client resources may be downloaded from Mojang.",
    "# You have to accept Mojang's EULA to use them.",
    "accept-download: true",
    "",
    "# Where rendered maps are written.",
    'data: "somewhere-else"',
    "",
    "render-thread-count: 6",
].join("\n");

function texts(entries: readonly [string, string | null][]): Map<string, string | null> {
    return new Map(entries);
}

/* -------------------------------------------------------------------------- */

describe("one setting goes back and the rest of the file survives", () => {
    const plan = mergeSettingsBack(
        [{ path: "core.conf", key: "accept-download" }],
        texts([["core.conf", OLD_CORE]]),
        texts([["core.conf", NEW_CORE]]),
    );

    it("puts the chosen setting back to the value it had", () => {
        expect(plan.files).toHaveLength(1);
        expect(plan.files[0]?.text).toContain("accept-download: false");
    });

    it("leaves every other setting exactly as it is now", () => {
        // This is the whole difference between a setting-level restore and restoring the
        // file: the two edits somebody wanted to keep are still here.
        expect(plan.files[0]?.text).toContain('data: "somewhere-else"');
        expect(plan.files[0]?.text).toContain("render-thread-count: 6");
        expect(plan.files[0]?.text).not.toContain('data: "bluemap"');
    });

    it("keeps every comment, which is the only place these settings are explained", () => {
        expect(plan.files[0]?.text).toContain("# Whether the client resources may be downloaded from Mojang.");
        expect(plan.files[0]?.text).toContain("# Where rendered maps are written.");
        expect(plan.files[0]?.text).toContain("## BlueMap ##");
    });

    it("names the key it restored, for the revision's own label", () => {
        expect(plan.keys).toEqual(["accept-download"]);
        expect(plan.refused).toEqual([]);
    });
});

describe("a nested setting is addressed by its dotted key", () => {
    it("puts back one key of a nested object without touching its siblings", () => {
        const before = "render-edges {\n    enabled: true\n    depth: 3\n}\n";
        const after = "render-edges {\n    enabled: false\n    depth: 9\n}\n";

        const plan = mergeSettingsBack(
            [{ path: "maps/nether.conf", key: "render-edges.enabled" }],
            texts([["maps/nether.conf", before]]),
            texts([["maps/nether.conf", after]]),
        );

        expect(plan.files[0]?.text).toContain("enabled: true");
        expect(plan.files[0]?.text).toContain("depth: 9");
    });
});

describe("a setting that was not there then is taken back off", () => {
    it("takes the key out rather than leaving it at its current value", () => {
        // "Put it back as it was" is a complete statement, and what it was is absent.
        const plan = mergeSettingsBack(
            [{ path: "core.conf", key: "extra-setting" }],
            texts([["core.conf", "accept-download: false\n"]]),
            texts([["core.conf", "accept-download: false\nextra-setting: 42\n"]]),
        );

        expect(plan.files).toHaveLength(1);
        expect(plan.files[0]?.text).not.toContain("extra-setting");
        expect(plan.files[0]?.text).toContain("accept-download: false");
    });
});

describe("several settings across several files in one pass", () => {
    it("merges each file once, carrying every chosen key", () => {
        const plan = mergeSettingsBack(
            [
                { path: "core.conf", key: "accept-download" },
                { path: "core.conf", key: "render-thread-count" },
                { path: "maps/nether.conf", key: "sky-color" },
            ],
            texts([
                ["core.conf", OLD_CORE],
                ["maps/nether.conf", 'sky-color: "#7dabff"\n'],
            ]),
            texts([
                ["core.conf", NEW_CORE],
                ["maps/nether.conf", 'sky-color: "#ffffff"\nambient-light: 0.2\n'],
            ]),
        );

        expect(plan.files.map((entry) => entry.path).sort()).toEqual(["core.conf", "maps/nether.conf"]);
        expect(plan.files.find((entry) => entry.path === "core.conf")?.text).toContain("render-thread-count: 2");
        const nether = plan.files.find((entry) => entry.path === "maps/nether.conf")?.text ?? "";
        expect(nether).toContain("#7dabff");
        expect(nether).toContain("ambient-light: 0.2");
    });
});

describe("a merge that cannot be done says so instead of half doing it", () => {
    it("refuses when the file is not in the folder now, and points at the whole-file restore", () => {
        const plan = mergeSettingsBack(
            [{ path: "maps/nether.conf", key: "sky-color" }],
            texts([["maps/nether.conf", 'sky-color: "#7dabff"\n']]),
            texts([]),
        );

        expect(plan.files).toEqual([]);
        expect(plan.refused[0]?.reason).toContain("Put the whole file back instead.");
    });

    it("refuses when the file as it is now cannot be parsed", () => {
        const plan = mergeSettingsBack(
            [{ path: "core.conf", key: "accept-download" }],
            texts([["core.conf", "accept-download: false\n"]]),
            texts([["core.conf", 'accept-download: "unterminated\n']]),
        );

        expect(plan.files).toEqual([]);
        expect(plan.refused[0]?.reason).toContain("could not be read as it is now");
    });

    it("refuses when the file at the revision cannot be parsed, so the old value is unknown", () => {
        const plan = mergeSettingsBack(
            [{ path: "core.conf", key: "accept-download" }],
            texts([["core.conf", 'accept-download: "unterminated\n']]),
            texts([["core.conf", "accept-download: true\n"]]),
        );

        expect(plan.files).toEqual([]);
        expect(plan.refused[0]?.reason).toContain("old value is unknown");
    });

    it("refuses a file this editor does not read setting by setting", () => {
        const plan = mergeSettingsBack(
            [{ path: "notes.txt", key: "anything" }],
            texts([["notes.txt", "one\n"]]),
            texts([["notes.txt", "two\n"]]),
        );
        expect(plan.files).toEqual([]);
        expect(plan.refused[0]?.reason).toContain("setting by setting");
    });

    it("writes nothing when the setting already holds the value it had then", () => {
        // Writing an identical file back would put a revision in the panel describing an
        // edit that did not happen.
        const plan = mergeSettingsBack(
            [{ path: "core.conf", key: "accept-download" }],
            texts([["core.conf", "accept-download: false\n"]]),
            texts([["core.conf", "accept-download: false\n"]]),
        );

        expect(plan.files).toEqual([]);
        expect(plan.refused[0]?.reason).toContain("already holds the value");
    });
});

describe("JSON is merged too, and says that its layout will change", () => {
    it("puts one key back and re-serialises the rest", () => {
        const plan = mergeSettingsBack(
            [{ path: "material-bluemap.project.json", key: "render.threads" }],
            texts([["material-bluemap.project.json", '{"version":1,"render":{"threads":2}}']]),
            texts([["material-bluemap.project.json", '{"version":1,"render":{"threads":8}}']]),
        );

        expect(plan.files).toHaveLength(1);
        const parsed: unknown = JSON.parse(plan.files[0]?.text ?? "{}");
        expect((parsed as { render: { threads: number } }).render.threads).toBe(2);
        expect((parsed as { version: number }).version).toBe(1);
    });

    it("warns that the layout is rewritten, because JSON has no comments to keep", () => {
        const plan = mergeSettingsBack(
            [{ path: "material-bluemap.project.json", key: "version" }],
            texts([["material-bluemap.project.json", '{"version":1}']]),
            texts([["material-bluemap.project.json", '{"version":2}']]),
        );
        expect(plan.reformatted).toEqual(["material-bluemap.project.json"]);
    });

    it("refuses a JSON file that is a list rather than settings", () => {
        const plan = mergeSettingsBack(
            [{ path: "thing.json", key: "0" }],
            texts([["thing.json", "[1,2,3]"]]),
            texts([["thing.json", "[4,5,6]"]]),
        );
        expect(plan.files).toEqual([]);
        expect(plan.refused[0]?.reason).toContain("one at a time");
    });
});

describe("the small helpers, on the cases they exist for", () => {
    it("reads a dotted key out of a plain object, and answers nothing for one that is not there", () => {
        const root = { render: { edges: { enabled: true } } };
        expect(settingValueAt(root, "render.edges.enabled")).toBe(true);
        expect(settingValueAt(root, "render.edges.missing")).toBeUndefined();
        expect(settingValueAt(root, "render.edges.enabled.deeper")).toBeUndefined();
    });

    it("rejects a key with no segments in it at all", () => {
        expect(isAddressableKey("sky-color")).toBe(true);
        expect(isAddressableKey("")).toBe(false);
        expect(isAddressableKey("...")).toBe(false);
    });
});
