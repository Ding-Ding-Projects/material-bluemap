/**
 * The mtime comparison itself, against real disposable directories with known
 * timestamps - never against this repository's own `packages/config/dist`, which is a
 * moving target no test should depend on, and which `configExplainCoverage.test.ts`
 * already exercises this module against for real every time it runs.
 */

import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { staleBuildMessage } from "./configPackageFreshness.js";

let root = "";
let src = "";
let dist = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-freshness-"));
    src = join(root, "src");
    dist = join(root, "dist");
    await mkdir(src, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** Writes a file and sets its mtime explicitly, so ordering does not depend on timing. */
async function writeAt(path: string, at: Date): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "content");
    await utimes(path, at, at);
}

const EARLIER = new Date("2026-01-01T00:00:00Z");
const LATER = new Date("2026-01-01T01:00:00Z");

describe("a build newer than its source", () => {
    it("passes, reporting nothing wrong", async () => {
        await writeAt(join(src, "index.ts"), EARLIER);
        await writeAt(join(dist, "index.js"), LATER);

        expect(staleBuildMessage(src, dist, "pnpm build")).toBeNull();
    });
});

describe("a build older than its source", () => {
    it("names both files, the command, and reports how stale it is", async () => {
        await writeAt(join(dist, "index.js"), EARLIER);
        await writeAt(join(src, "index.ts"), LATER);

        const message = staleBuildMessage(src, dist, "pnpm build");
        expect(message).not.toBeNull();
        expect(message).toContain(join(src, "index.ts"));
        expect(message).toContain(join(dist, "index.js"));
        expect(message).toContain("pnpm build");
        expect(message).toContain("older than its own source");
    });

    it("catches a change buried several directories down, not only at the top", async () => {
        await writeAt(join(dist, "index.js"), EARLIER);
        await writeAt(join(src, "schema", "deeply", "nested", "mask.ts"), LATER);

        const message = staleBuildMessage(src, dist, "pnpm build");
        expect(message).toContain(join(src, "schema", "deeply", "nested", "mask.ts"));
    });
});

describe("a build that has never run", () => {
    it("reports the build missing rather than a stale comparison against nothing", async () => {
        await writeAt(join(src, "index.ts"), EARLIER);
        // `dist` was never created at all - a fresh clone's exact state.

        const message = staleBuildMessage(src, dist, "pnpm build");
        expect(message).toContain("Nothing has ever been built");
        expect(message).toContain("pnpm build");
    });
});

describe("a source tree with nothing in it", () => {
    it("does not fail the freshness check over an empty source directory", async () => {
        await writeAt(join(dist, "index.js"), LATER);
        // `src` exists (from beforeEach) but holds no files - an edge case the walk
        // must not mistake for "source is somehow older than the build".

        expect(staleBuildMessage(src, dist, "pnpm build")).toBeNull();
    });
});
