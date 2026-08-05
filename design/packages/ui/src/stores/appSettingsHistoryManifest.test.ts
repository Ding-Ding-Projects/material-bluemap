// @vitest-environment node

/**
 * The audit trail: every `localStorage`-backed store this package has is either wired,
 * named in {@link APP_SETTINGS_HISTORY_KEYS} with the file that calls `recordAppSetting`
 * for it, or deliberately excluded, named in {@link EXCLUDED_APP_SETTINGS} with a reason.
 * Both are held to their real source rather than trusted on their word - this file reads
 * each `owner` file off disk and greps for the exact call, the same way
 * `menuSearch/menuCoverage.test.ts` holds its own registry to the source.
 *
 * Kept in its own file, under `// @vitest-environment node`: `appSettingsHistorySync.test.ts`
 * runs under jsdom (it stubs `window.materialBluemap`), and jsdom's own `URL`/`location`
 * globals do not resolve `import.meta.url` the way plain Node does, which is exactly what
 * `fileURLToPath(new URL("...", import.meta.url))` below needs.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { APP_SETTINGS_HISTORY_KEYS, EXCLUDED_APP_SETTINGS } from "./appSettingsHistorySync.js";

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

function ownerSource(owner: string): string {
    // `owner` may carry a trailing " (functionName)" annotation for a human reader; only the
    // path before it names a real file.
    const filePath = owner.split(" (")[0] ?? owner;
    return readFileSync(path.join(SRC_ROOT, filePath), "utf8");
}

describe("the wired-key manifest matches the real source", () => {
    it("is not empty - a manifest nobody populated proves nothing", () => {
        expect(APP_SETTINGS_HISTORY_KEYS.length).toBeGreaterThan(0);
    });

    it.each(APP_SETTINGS_HISTORY_KEYS)(
        '$owner really calls recordAppSetting("$key", ...)',
        ({ key, owner }) => {
            const source = ownerSource(owner);
            // Most callers pass the key as a plain string literal; `tabStorage.ts` builds it
            // with a template literal (`tabs.${key}`), so its own namespace prefix is enough.
            const plainNeedle = `recordAppSetting("${key}"`;
            const namespace = key.split(".")[0];
            const templateNeedle = `recordAppSetting(\`${namespace}.`;
            const found = source.includes(plainNeedle) || source.includes(templateNeedle);
            expect(found, `expected ${owner} to call recordAppSetting for "${key}"`).toBe(true);
        },
    );

    it("names no key on both the wired manifest and the exclusion list", () => {
        const wired = new Set(APP_SETTINGS_HISTORY_KEYS.map((entry) => entry.key));
        const excluded = new Set(EXCLUDED_APP_SETTINGS.map((entry) => entry.key));
        for (const key of excluded) expect(wired.has(key)).toBe(false);
    });
});

describe("the exclusion list", () => {
    it("holds exactly the two continuous-drag dock geometry keys, each with a real reason", () => {
        expect(EXCLUDED_APP_SETTINGS.map((entry) => entry.key)).toEqual(["dockSize", "dockFloating"]);
        for (const entry of EXCLUDED_APP_SETTINGS) {
            expect(entry.reason.length).toBeGreaterThan(20);
            expect(entry.owner.length).toBeGreaterThan(0);
        }
    });

    it("points each excluded key at a write function dockPlacement.ts genuinely does not mirror", () => {
        const source = ownerSource("components/settings/dockPlacement.ts");
        // writeDockSizes and writeDockFloatingRects must not call recordAppSetting anywhere
        // in their own bodies - only writeDockPlacements may.
        const sizeFn = source.slice(source.indexOf("export function writeDockSizes"));
        const floatingFn = source.slice(source.indexOf("export function writeDockFloatingRects"));
        expect(sizeFn.slice(0, sizeFn.indexOf("\n}\n"))).not.toContain("recordAppSetting(");
        expect(floatingFn.slice(0, floatingFn.indexOf("\n}\n"))).not.toContain("recordAppSetting(");
    });
});
