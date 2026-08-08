import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(packageRoot, "src", "main", "index.ts"), "utf8");

describe("Worldlens profile migration startup policy", () => {
    it("pins the immutable user-data root before Electron becomes ready", () => {
        const setName = source.indexOf("app.setName(WORLDLENS_IDENTITY.shippedName)");
        const setPath = source.search(/app\.setPath\(\s*["']userData["']/);
        const ready = source.indexOf("app.whenReady()");
        expect(setName).toBeGreaterThan(-1);
        expect(setPath).toBeGreaterThan(setName);
        expect(ready).toBeGreaterThan(setPath);
        expect(source.slice(setName, ready)).not.toContain("productDisplayName");
    });

    it("finishes or isolates migration before the first ordinary window launch", () => {
        const readyBlock = source.slice(source.indexOf("app.whenReady()"));
        const prepare = readyBlock.indexOf("await prepareWorldlensProfile()");
        const launch = readyBlock.indexOf("await launch()", prepare);
        const recovery = readyBlock.indexOf("await showRecovery([migrationIssue])", prepare);
        expect(prepare).toBeGreaterThan(-1);
        expect(launch).toBeGreaterThan(prepare);
        expect(recovery).toBeGreaterThan(prepare);
        expect(readyBlock.slice(prepare, Math.max(launch, recovery))).not.toContain("app.exit(1)");
    });

    it("never makes a recoverable startup failure an exit-only path", () => {
        expect(source).not.toContain('dialog.showErrorBox("Worldlens could not start"');
        expect(source).not.toContain("app.exit(1)");
        expect(source).toContain('window.webContents.on("preload-error"');
        expect(source).toContain('window.webContents.on("render-process-gone"');
    });
});
