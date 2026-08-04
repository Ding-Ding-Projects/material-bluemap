import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_ACTIONS, checkEdit, partitionEdits, type RepairScope } from "./guardrails.js";

const SCOPE: RepairScope = {
    configDir: resolve("/srv/render/config"),
    worldPaths: [resolve("/srv/saves/world")],
};

function refusal(path: string, text = "x: 1\n"): string {
    const checked = checkEdit({ kind: "write", path, text }, SCOPE);
    if (checked.ok) throw new Error(`${path} was allowed and should not have been`);
    return checked.reason;
}

describe("what a repair may change", () => {
    it("allows a map config inside the run's own config folder", () => {
        const checked = checkEdit({ kind: "write", path: "maps/overworld.conf", text: "world: \"x\"\n" }, SCOPE);
        expect(checked.ok).toBe(true);
        expect(checked.ok === true && checked.relativePath).toBe("maps/overworld.conf");
        expect(checked.ok === true && checked.absolutePath).toBe(
            join(SCOPE.configDir, "maps", "overworld.conf"),
        );
    });

    it("allows each of BlueMap's own root config files", () => {
        for (const name of ["core.conf", "webapp.conf", "webserver.conf", "plugin.conf", "core.json"]) {
            expect(checkEdit({ kind: "write", path: name, text: "a: 1\n" }, SCOPE).ok).toBe(true);
        }
    });

    it("accepts an absolute path only when it really is inside the folder, reduced to the same check", () => {
        const inside = checkEdit(
            { kind: "write", path: join(SCOPE.configDir, "storages", "file.conf"), text: "a: 1\n" },
            SCOPE,
        );
        expect(inside.ok === true && inside.relativePath).toBe("storages/file.conf");
    });
});

describe("what a repair may never change", () => {
    it("refuses to delete anything at all", () => {
        const checked = checkEdit({ kind: "delete", path: "maps/overworld.conf" }, SCOPE);
        expect(checked.ok).toBe(false);
        expect(checked.ok === false && checked.reason).toContain("never deletes anything");
    });

    it("refuses anything outside the config folder", () => {
        expect(refusal("../../secrets.conf")).toContain("outside the config folder");
        expect(refusal(resolve("/etc/passwd"))).toContain("outside the config folder");
        expect(refusal(join(resolve("/srv/render"), "core.conf"))).toContain("outside the config folder");
    });

    it("refuses anything inside a Minecraft world, even reached by a legal-looking name", () => {
        const worldScope: RepairScope = {
            // A config folder that lives inside a world is odd, and the guard still refuses
            // to write into the world through it.
            configDir: join(resolve("/srv/saves/world"), "bluemap"),
            worldPaths: [resolve("/srv/saves/world")],
        };
        const checked = checkEdit({ kind: "write", path: "core.conf", text: "a: 1\n" }, worldScope);
        expect(checked.ok).toBe(false);
        expect(checked.ok === false && checked.reason).toContain("Minecraft world folder");
    });

    it("refuses a file BlueMap does not load as config", () => {
        expect(refusal("notes.txt")).toContain("not a config file");
        expect(refusal("level.dat")).toContain("not a config file");
        expect(refusal("maps/overworld.conf.bak")).toContain("not a config file");
    });

    it("refuses a config file somewhere BlueMap does not look", () => {
        expect(refusal("packs/thing.conf")).toContain("not somewhere this editor writes");
        expect(refusal("maps/nested/overworld.conf")).toContain("nested deeper");
    });

    it("refuses a write with no contents, because a repair replaces whole files", () => {
        const checked = checkEdit({ kind: "write", path: "core.conf" }, SCOPE);
        expect(checked.ok).toBe(false);
        expect(checked.ok === false && checked.reason).toContain("no new contents");
    });

    it("refuses a file larger than a config could be", () => {
        const checked = checkEdit(
            { kind: "write", path: "core.conf", text: "x".repeat(64) },
            { ...SCOPE, maxBytes: 32 },
        );
        expect(checked.ok).toBe(false);
        expect(checked.ok === false && checked.reason).toContain("larger than");
    });

    it("refuses an empty path", () => {
        expect(refusal("   ")).toContain("empty path");
    });
});

describe("sorting a batch of proposed edits", () => {
    it("applies the good ones and reports every refusal beside them", () => {
        const { allowed, refused } = partitionEdits(
            [
                { kind: "write", path: "maps/overworld.conf", text: "world: \"x\"\n" },
                { kind: "write", path: "../escape.conf", text: "nope\n" },
                { kind: "delete", path: "core.conf" },
            ],
            SCOPE,
        );
        expect(allowed.map((edit) => edit.relativePath)).toEqual(["maps/overworld.conf"]);
        expect(refused.map((edit) => edit.path)).toEqual(["../escape.conf", "core.conf"]);
    });

    it("writes no version of a file that was named twice, rather than letting the last one win", () => {
        const { allowed, refused } = partitionEdits(
            [
                { kind: "write", path: "core.conf", text: "a: 1\n" },
                { kind: "write", path: resolve(join(SCOPE.configDir, "core.conf")), text: "a: 2\n" },
            ],
            SCOPE,
        );
        expect(allowed).toEqual([]);
        expect(refused).toHaveLength(2);
        expect(refused[0]?.reason).toContain("named more than once");
    });
});

describe("the rules the prompt states", () => {
    it("names the world, deletion, git and exfiltration explicitly", () => {
        const text = FORBIDDEN_ACTIONS.join(" ").toLowerCase();
        expect(text).toContain("world folder");
        expect(text).toContain("do not delete");
        expect(text).toContain("git");
        expect(text).toContain("force-push");
        expect(text).toContain("history rewriting");
        expect(text).toContain("do not send");
        expect(text).toContain("do not invent a cause");
    });
});
