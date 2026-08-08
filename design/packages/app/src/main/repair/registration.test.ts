/**
 * Regression test for the "built but never wired" bug: `main/repair/index.ts` is a
 * complete, unit-tested subsystem (diagnosis + guardrailed agent-assisted fix pass), but
 * for a stretch of this project's history `registerRepairHandlers` was never called from
 * `main/index.ts`'s `registerIpc()` - the one function that registers every other
 * subsystem's IPC handlers. Every test in `ipc.test.ts` passed the whole time, because they
 * exercise the handlers directly; none of them could catch a handler that is correct but
 * never plugged in.
 *
 * Two things are asserted here, matching the two ways that bug actually happened:
 *
 * 1. `repair/index.ts` re-exports `registerRepairHandlers` (and the rest of `ipc.ts`'s
 *    public surface) the way its own module doc's example already claimed it did -
 *    `import { collectEvidence, registerRepairHandlers } from "./repair/index.js"`. It
 *    did not, until this test's fix: the barrel only re-exported `evidence.ts`,
 *    `diagnose.ts`, `guardrails.ts`, `diff.ts`, `agent.ts` and `pass.ts`.
 * 2. `main/index.ts` actually imports and calls it. `main/index.ts` cannot be imported
 *    directly in this suite - it pulls in Electron, an embedded HTTP server and a dozen
 *    other subsystems that build their own real state at import time - so this reads it as
 *    source text instead and checks the two things that make the wiring real: an import of
 *    `registerRepairHandlers` from the repair module, and a call to it (directly, or through
 *    a `start...()` wrapper the way every sibling subsystem in that file is wired) inside
 *    `createWindow`'s startup sequence.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registerRepairHandlers as registerRepairHandlersFromIndex } from "./index.js";
import { registerRepairHandlers as registerRepairHandlersFromIpc } from "./ipc.js";

describe("repair/index.ts re-exports the ipc module", () => {
    it("exports the same registerRepairHandlers ipc.ts does, as the module doc's own example uses", () => {
        // Not merely "a function" - the same function, so a future refactor cannot
        // satisfy this test with an unrelated stub of the same name.
        expect(registerRepairHandlersFromIndex).toBe(registerRepairHandlersFromIpc);
    });
});

describe("main/index.ts wires the repair subsystem in", () => {
    const mainIndexSource = readFileSync(
        fileURLToPath(new URL("../index.ts", import.meta.url)),
        "utf8",
    );

    it("imports registerRepairHandlers from the repair module", () => {
        expect(mainIndexSource).toMatch(
            /import\s*\{[^}]*\bregisterRepairHandlers\b[^}]*\}\s*from\s*["']\.\/repair\/(index|ipc)\.js["']/,
        );
    });

    it("actually calls registerRepairHandlers somewhere in createWindow's startup sequence", () => {
        const createWindowStart = mainIndexSource.indexOf("async function createWindow(");
        expect(createWindowStart).toBeGreaterThan(-1);
        const independentStepsStart = mainIndexSource.indexOf("const independentSteps", createWindowStart);
        expect(independentStepsStart).toBeGreaterThan(createWindowStart);
        const independentStepsEnd = mainIndexSource.indexOf("];", independentStepsStart);
        expect(independentStepsEnd).toBeGreaterThan(independentStepsStart);
        const independentSteps = mainIndexSource.slice(independentStepsStart, independentStepsEnd);
        // The startup list passes `startRepairDiagnostics` as a callback rather than
        // invoking it inline; assert the callback is in the actual registry.
        expect(independentSteps).toMatch(/\bstartRepairDiagnostics\s*[,\]]/);
    });
});
