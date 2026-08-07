import { describe, expect, it } from "vitest";
import { migrateLegacySiteStorage, type SiteStorageMigrationHost } from "./legacyStorageMigration.js";

function storage(initial: Readonly<Record<string, string>>): SiteStorageMigrationHost & { cells: Map<string, string> } {
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

describe("the documentation-site preference migration", () => {
    it("copies old settings to Worldlens without deleting rollback data", () => {
        const host = storage({
            "material-bluemap-search-prefs": '{"plain":true}',
            "material-bluemap.site.appearance.v1": '{"version":1}',
        });

        expect(migrateLegacySiteStorage(host)).toBe(2);
        expect(host.cells.get("worldlens-search-prefs")).toBe('{"plain":true}');
        expect(host.cells.get("worldlens.site.appearance.v1")).toBe('{"version":1}');
        expect(host.cells.has("material-bluemap-search-prefs")).toBe(true);
    });

    it("keeps a current preference when both namespaces exist", () => {
        const host = storage({
            "material-bluemap-site-language": "en",
            "worldlens-site-language": "yue",
        });
        expect(migrateLegacySiteStorage(host)).toBe(0);
        expect(host.cells.get("worldlens-site-language")).toBe("yue");
    });
});
