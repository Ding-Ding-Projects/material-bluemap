/**
 * Regression test: the root README's Phase status table must not contradict
 * `design/ROADMAP.md`, the document it explicitly names as its source of truth ("Mirrored
 * from `design/ROADMAP.md`, which is the source of truth").
 *
 * README.md previously described Phase C's exit criteria as "not yet run" and the CLI
 * package as "a stub", and lumped Phase H in with G and I as "pending" - all stale by the
 * time issues #31, #32, #40, #41 and #42 closed and ROADMAP.md itself was updated to say so.
 * Nothing read the two documents together, so README quietly fell weeks behind. This does.
 *
 * This is deliberately a small set of substring/regex checks pinned to the exact phrases
 * involved, not a general prose-similarity check: the point is to catch README repeating a
 * claim ROADMAP.md has since retracted, not to police wording.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Repository root: `packages/site/src/content/` sits five directories below it. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

const readme = readFileSync(resolve(repoRoot, "README.md"), "utf-8");
const roadmap = readFileSync(resolve(repoRoot, "design", "ROADMAP.md"), "utf-8");

describe("README.md stays in step with design/ROADMAP.md's phase table", () => {
    it("does not claim Phase C's exit criteria are unrun once ROADMAP says they passed", () => {
        expect(roadmap).toMatch(/\| C \|[^|]*\|\s*\*\*Done\.\*\*/);
        expect(readme).not.toMatch(/exit criteria not\s+yet run/);
    });

    it("does not describe packages/cli as a stub once ROADMAP shows its CLI and Dockerfile shipped", () => {
        expect(roadmap).toMatch(/The standalone server CLI and its Dockerfile — built on/);
        expect(readme).not.toMatch(/is currently a stub/);
        expect(readme).not.toMatch(/A stub — Phase E/);
    });

    it("does not lump Phase H in with the still-pending phases once ROADMAP marks it part done", () => {
        expect(roadmap).toMatch(/\| H \|[^|]*\|\s*\*\*Part done\.\*\*/);
        expect(readme).not.toMatch(/G, H and I are pending/);
    });

    it("does not claim packages/server's routes and SSE are still Phase E once ROADMAP shows them ported", () => {
        expect(roadmap).toMatch(/The full HTTP routes and server-sent events\.\*\*/);
        expect(readme).not.toMatch(/its full routes and SSE are Phase E/);
    });
});
