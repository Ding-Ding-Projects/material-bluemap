import { describe, expect, it } from "vitest";

describe("RemoteFileBrowser narrow dialog listing", () => {
    it("drops the nonessential timestamp rather than creating a horizontal scroll trap", async () => {
        const source = (await import("./RemoteFileBrowser.vue?raw")).default as string;
        expect(source).toMatch(/@media\s*\(max-width:\s*30rem\)/);
        expect(source).toContain("overflow-x: clip");
        expect(source).toContain("table-layout: fixed");
        expect(source).toContain(".mb-remote-browse__modifiedCell");
        expect(source).toContain("display: none");
        expect(source).toContain(".mb-remote-browse__badge");
        expect(source).toContain("font-size: 0");
    });
});
