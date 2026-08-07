import { describe, expect, it } from "vitest";
import { migrateLegacyStorage, type StorageMigrationHost } from "./legacyStorageMigration.js";

function storage(initial: Readonly<Record<string, string>>): StorageMigrationHost & { cells: Map<string, string> } {
    const cells = new Map(Object.entries(initial));
    return {
        cells,
        get length() {
            return cells.size;
        },
        key: (index) => [...cells.keys()][index] ?? null,
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
    };
}

describe("the renderer preference namespace migration", () => {
    it("copies every legacy-prefixed setting to Worldlens and retains the old cells", () => {
        const host = storage({
            "material-bluemap-profiles": "profiles",
            "material-bluemap.language.mode": "bilingual",
            unrelated: "untouched",
        });

        expect(migrateLegacyStorage(host)).toEqual({ migrated: 2, retainedCurrent: 0, failed: 0 });
        expect(host.cells.get("worldlens-profiles")).toBe("profiles");
        expect(host.cells.get("worldlens.language.mode")).toBe("bilingual");
        expect(host.cells.get("material-bluemap-profiles")).toBe("profiles");
        expect(host.cells.get("unrelated")).toBe("untouched");
    });

    it("never overwrites an existing Worldlens value and is idempotent", () => {
        const host = storage({
            "material-bluemap-palette": '{"size":"card"}',
            "worldlens-palette": '{"size":"full"}',
        });

        expect(migrateLegacyStorage(host).retainedCurrent).toBe(1);
        expect(migrateLegacyStorage(host).retainedCurrent).toBe(1);
        expect(host.cells.get("worldlens-palette")).toBe('{"size":"full"}');
    });

    it("adapts the appearance format marker without dropping unknown fields", () => {
        const host = storage({
            "material-bluemap-appearance": JSON.stringify({
                format: "material-bluemap-appearance",
                version: 1,
                future: { keep: true },
            }),
        });

        migrateLegacyStorage(host);
        expect(JSON.parse(host.cells.get("worldlens-appearance") ?? "{}")).toEqual({
            format: "worldlens-appearance",
            version: 1,
            future: { keep: true },
        });
    });
});
