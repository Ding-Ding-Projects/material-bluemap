import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(packageRoot, "src", "main", "index.ts"), "utf8");

describe("Worldlens profile migration startup policy", () => {
    it("pins the immutable user-data root before Electron becomes ready", () => {
        const setName = source.indexOf("app.setName(WORLDLENS_IDENTITY.shippedName)");
        const setPath = source.indexOf('app.setPath("userData"');
        const ready = source.indexOf("app.whenReady()");
        expect(setName).toBeGreaterThan(-1);
        expect(setPath).toBeGreaterThan(setName);
        expect(ready).toBeGreaterThan(setPath);
        expect(source.slice(setName, ready)).not.toContain("productDisplayName");
    });

    it("finishes or refuses migration before the first window launch", () => {
        const readyBlock = source.slice(source.indexOf("app.whenReady()"));
        const prepare = readyBlock.indexOf("await prepareWorldlensProfile()");
        const launch = readyBlock.indexOf("await launch()");
        expect(prepare).toBeGreaterThan(-1);
        expect(launch).toBeGreaterThan(prepare);
        expect(readyBlock.slice(prepare, launch)).toContain("app.exit(1)");
    });
});
