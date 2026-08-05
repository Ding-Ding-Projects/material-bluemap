// @vitest-environment node

/**
 * The one thing `ipc.test.ts` cannot prove: that `registerBedrockHandlers` is actually
 * called somewhere real.
 *
 * Every handler in `ipc.ts` is fully exercised in isolation against a fake `IpcMain`, and
 * that suite would stay green even if `registerBedrockHandlers` were never invoked outside
 * a test file - which is exactly what happened. `main/index.ts` imports and calls every
 * other subsystem's `register*`/`install*` entry point from `registerIpc()` /
 * `createWindow()`, but never called this one, so the whole Bedrock conversion feature had
 * no reachable entry point: no IPC channel was ever registered on a running app, and the
 * renderer had no way to reach it.
 *
 * `main/index.ts` cannot be imported directly here without mocking most of Electron and
 * every subsystem it wires - it calls `app.whenReady()` as a side effect of module load.
 * So this reads the real, live source the same way `menuCoverage.test.ts` reads the real
 * `.vue` files: a static check that the wiring genuinely exists, not a claim about it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAIN_INDEX = fileURLToPath(new URL("../index.ts", import.meta.url));

describe("bedrock handlers are wired into the running app", () => {
    const source = readFileSync(MAIN_INDEX, "utf-8");

    it("imports registerBedrockHandlers from the bedrock subsystem", () => {
        expect(source).toMatch(/import\s*\{[^}]*registerBedrockHandlers[^}]*\}\s*from\s*["']\.\/bedrock\/index\.js["']/);
    });

    it("actually calls registerBedrockHandlers, not just imports it", () => {
        expect(source).toMatch(/registerBedrockHandlers\s*\(\s*ipcMain\s*,/);
    });

    it("invokes its own wiring function from createWindow, so it runs when the app starts", () => {
        const startFunction = source.match(/function\s+(\w+)\s*\([^)]*\)\s*:\s*BedrockIpc\s*\{/);
        expect(startFunction, "expected a start*() function returning BedrockIpc").not.toBeNull();
        const name = startFunction![1];

        const createWindowStart = source.indexOf("async function createWindow(");
        expect(createWindowStart).toBeGreaterThan(-1);
        const createWindowBody = source.slice(createWindowStart, createWindowStart + 4000);
        expect(createWindowBody).toContain(`${name}(`);
    });
});
