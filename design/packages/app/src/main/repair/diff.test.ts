import { describe, expect, it } from "vitest";
import { diffCounts, lineChanges, unifiedDiff } from "./diff.js";

describe("showing what changed", () => {
    it("says nothing at all when nothing changed", () => {
        expect(unifiedDiff("core.conf", "a: 1\n", "a: 1\n")).toBe("");
    });

    it("shows one changed line with its surrounding context, not the whole file", () => {
        const before = ["a: 1", "b: 2", "c: 3", "d: 4", "e: 5", "f: 6", "g: 7", "h: 8", "i: 9"].join("\n");
        const after = before.replace("e: 5", "e: 50");
        const diff = unifiedDiff("core.conf", before, after);

        expect(diff.split("\n")[0]).toBe("--- a/core.conf");
        expect(diff.split("\n")[1]).toBe("+++ b/core.conf");
        expect(diff).toContain("-e: 5");
        expect(diff).toContain("+e: 50");
        // Three lines of context either side, so the first and last lines of the file are
        // not in the hunk at all.
        expect(diff).not.toContain(" a: 1");
        expect(diff).not.toContain(" i: 9");
    });

    it("reads a new file as an addition against nothing", () => {
        const diff = unifiedDiff("maps/overworld.conf", null, 'world: "x"\n');
        expect(diff).toContain("--- /dev/null");
        expect(diff).toContain('+world: "x"');
        expect(diff).toContain("@@ -0,0 +1,1 @@");
    });

    it("keeps two distant changes in two hunks rather than one enormous one", () => {
        const before = Array.from({ length: 40 }, (_, index) => `line ${String(index)}`).join("\n");
        const after = before.replace("line 2", "line two").replace("line 37", "line thirty-seven");
        const diff = unifiedDiff("core.conf", before, after);
        expect(diff.split("\n").filter((line) => line.startsWith("@@"))).toHaveLength(2);
    });

    it("does not report every line after an insertion as changed", () => {
        const before = ["a", "b", "c", "d"].join("\n");
        const after = ["a", "b", "inserted", "c", "d"].join("\n");
        const counts = diffCounts(unifiedDiff("core.conf", before, after));
        expect(counts).toEqual({ added: 1, removed: 0 });
    });

    it("treats Windows line endings as the same lines", () => {
        expect(unifiedDiff("core.conf", "a: 1\r\nb: 2\r\n", "a: 1\nb: 2\n")).toBe("");
    });

    it("counts what it added and removed", () => {
        const diff = unifiedDiff("core.conf", "a\nb\nc\n", "a\nB\nc\n");
        expect(diffCounts(diff)).toEqual({ added: 1, removed: 1 });
    });

    it("keeps a common subsequence rather than pairing lines off in order", () => {
        expect(lineChanges(["a", "b", "c"], ["a", "c"])).toEqual([
            { step: "same", text: "a" },
            { step: "removed", text: "b" },
            { step: "same", text: "c" },
        ]);
    });

    it("falls back to a whole-file replacement for something far too large to diff", () => {
        const before = Array.from({ length: 3000 }, (_, index) => `line ${String(index)}`).join("\n");
        const after = Array.from({ length: 3000 }, (_, index) => `other ${String(index)}`).join("\n");
        const diff = unifiedDiff("core.conf", before, after);
        expect(diff).toContain("@@ -1,3000 +1,3000 @@");
    });
});
