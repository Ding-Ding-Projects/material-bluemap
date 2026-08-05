/**
 * Paths, breadcrumbs, sorting, keyboard movement and the world badge - all pure, all
 * provable without a component and without a server.
 */

import { describe, expect, it } from "vitest";
import {
    breadcrumbSegments,
    formatEntryModified,
    formatEntrySize,
    isRemoteRoot,
    joinRemotePath,
    nextRowIndex,
    nextSort,
    normalizeTypedRemotePath,
    parentRemotePath,
    remoteSeparator,
    sortRemoteEntries,
    typeAheadIndex,
    worldBadgeFor,
} from "./remoteBrowse.js";
import type { RemoteEntry } from "./remoteBridge.js";

function entry(overrides: Partial<RemoteEntry> = {}): RemoteEntry {
    return {
        name: "entry",
        directory: false,
        symlink: false,
        sizeBytes: null,
        modifiedAt: null,
        world: { hasLevelDat: false, regionDimensions: [], looksLikeWorld: false },
        ...overrides,
    };
}

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

describe("remoteSeparator", () => {
    it("differs by OS", () => {
        expect(remoteSeparator("linux")).toBe("/");
        expect(remoteSeparator("windows")).toBe("\\");
    });
});

describe("joinRemotePath", () => {
    it("joins a Linux folder and a child with a forward slash", () => {
        expect(joinRemotePath("/srv/saves", "Bastion", "linux")).toBe("/srv/saves/Bastion");
    });

    it("does not double the separator at a Linux root", () => {
        expect(joinRemotePath("/", "srv", "linux")).toBe("/srv");
    });

    it("joins a Windows folder and a child with a backslash", () => {
        expect(joinRemotePath("C:\\Users\\renderer", "saves", "windows")).toBe("C:\\Users\\renderer\\saves");
    });

    it("does not double the separator at a Windows drive root", () => {
        expect(joinRemotePath("C:\\", "Users", "windows")).toBe("C:\\Users");
    });
});

describe("isRemoteRoot", () => {
    it("is true only for / on Linux", () => {
        expect(isRemoteRoot("/", "linux")).toBe(true);
        expect(isRemoteRoot("/srv", "linux")).toBe(false);
    });

    it("is true for a bare Windows drive, with or without its trailing backslash", () => {
        expect(isRemoteRoot("C:\\", "windows")).toBe(true);
        expect(isRemoteRoot("C:", "windows")).toBe(true);
        expect(isRemoteRoot("C:\\Users", "windows")).toBe(false);
    });
});

describe("parentRemotePath", () => {
    it("goes up one Linux folder at a time", () => {
        expect(parentRemotePath("/srv/saves/Bastion", "linux")).toBe("/srv/saves");
        expect(parentRemotePath("/srv", "linux")).toBe("/");
    });

    it("has no parent above a Linux root", () => {
        expect(parentRemotePath("/", "linux")).toBeNull();
    });

    it("goes up one Windows folder at a time, down to the drive root", () => {
        expect(parentRemotePath("C:\\Users\\renderer\\saves", "windows")).toBe("C:\\Users\\renderer");
        expect(parentRemotePath("C:\\Users", "windows")).toBe("C:\\");
    });

    it("has no parent above a Windows drive root", () => {
        expect(parentRemotePath("C:\\", "windows")).toBeNull();
        expect(parentRemotePath("C:", "windows")).toBeNull();
    });
});

describe("breadcrumbSegments", () => {
    it("builds a clickable trail for a Linux path, root first", () => {
        const crumbs = breadcrumbSegments("/srv/saves/Bastion", "linux");
        expect(crumbs.map((c) => c.label)).toEqual(["/", "srv", "saves", "Bastion"]);
        expect(crumbs.map((c) => c.path)).toEqual(["/", "/srv", "/srv/saves", "/srv/saves/Bastion"]);
    });

    it("builds a clickable trail for a Windows path, drive first", () => {
        const crumbs = breadcrumbSegments("C:\\Users\\renderer\\saves", "windows");
        expect(crumbs.map((c) => c.label)).toEqual(["C:", "Users", "renderer", "saves"]);
        expect(crumbs.map((c) => c.path)).toEqual([
            "C:\\",
            "C:\\Users",
            "C:\\Users\\renderer",
            "C:\\Users\\renderer\\saves",
        ]);
    });
});

describe("normalizeTypedRemotePath", () => {
    it("accepts either slash and normalises to the target OS's own", () => {
        expect(normalizeTypedRemotePath("C:/Users/renderer", "windows")).toBe("C:\\Users\\renderer");
        expect(normalizeTypedRemotePath("\\srv\\saves", "linux")).toBe("/srv/saves");
    });

    it("never invents a drive letter or a leading slash that was not typed", () => {
        expect(normalizeTypedRemotePath("Users\\renderer", "windows")).toBe("Users\\renderer");
        expect(normalizeTypedRemotePath("srv/saves", "linux")).toBe("srv/saves");
    });

    it("trims surrounding whitespace and leaves an empty field empty", () => {
        expect(normalizeTypedRemotePath("   ", "linux")).toBe("");
    });
});

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

describe("sortRemoteEntries", () => {
    const rows = [
        entry({ name: "notes.txt", directory: false, sizeBytes: 5_000_000 }),
        entry({ name: "Bastion", directory: true }),
        entry({ name: "readme.md", directory: false, sizeBytes: 10 }),
        entry({ name: "Alpha", directory: true }),
    ];

    it("always puts folders above files, whatever the sorted column", () => {
        for (const column of ["name", "size", "modified"] as const) {
            const sorted = sortRemoteEntries(rows, column, "ascending");
            expect(sorted[0]?.directory).toBe(true);
            expect(sorted[1]?.directory).toBe(true);
        }
    });

    it("sorts by name within each group", () => {
        const sorted = sortRemoteEntries(rows, "name", "ascending");
        expect(sorted.map((r) => r.name)).toEqual(["Alpha", "Bastion", "notes.txt", "readme.md"]);
    });

    it("sorts files by size, folders unaffected by it", () => {
        const sorted = sortRemoteEntries(rows, "size", "ascending");
        const files = sorted.filter((r) => !r.directory);
        expect(files.map((r) => r.name)).toEqual(["readme.md", "notes.txt"]);
    });

    it("reverses within each group on descending, without moving files above folders", () => {
        const sorted = sortRemoteEntries(rows, "name", "descending");
        expect(sorted[0]?.directory).toBe(true);
        expect(sorted[1]?.directory).toBe(true);
        expect(sorted.map((r) => r.name)).toEqual(["Bastion", "Alpha", "readme.md", "notes.txt"]);
    });

    it("does not mutate the array it was given", () => {
        const before = rows.map((r) => r.name);
        sortRemoteEntries(rows, "name", "ascending");
        expect(rows.map((r) => r.name)).toEqual(before);
    });
});

describe("nextSort", () => {
    it("starts a new column ascending", () => {
        expect(nextSort({ column: "name", direction: "ascending" }, "size")).toEqual({
            column: "size",
            direction: "ascending",
        });
    });

    it("flips direction when the same column is clicked again", () => {
        expect(nextSort({ column: "name", direction: "ascending" }, "name")).toEqual({
            column: "name",
            direction: "descending",
        });
        expect(nextSort({ column: "name", direction: "descending" }, "name")).toEqual({
            column: "name",
            direction: "ascending",
        });
    });
});

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                   */
/* -------------------------------------------------------------------------- */

describe("nextRowIndex", () => {
    it("moves down and up without wrapping", () => {
        expect(nextRowIndex("ArrowDown", 0, 3)).toBe(1);
        expect(nextRowIndex("ArrowDown", 2, 3)).toBe(2);
        expect(nextRowIndex("ArrowUp", 2, 3)).toBe(1);
        expect(nextRowIndex("ArrowUp", 0, 3)).toBe(0);
    });

    it("jumps to the ends and pages by ten", () => {
        expect(nextRowIndex("Home", 5, 20)).toBe(0);
        expect(nextRowIndex("End", 5, 20)).toBe(19);
        expect(nextRowIndex("PageDown", 2, 20)).toBe(12);
        expect(nextRowIndex("PageUp", 15, 20)).toBe(5);
    });

    it("returns -1 for an empty list and leaves an unhandled key unchanged", () => {
        expect(nextRowIndex("ArrowDown", 0, 0)).toBe(-1);
        expect(nextRowIndex("a", 3, 20)).toBe(3);
    });
});

describe("typeAheadIndex", () => {
    const rows = [entry({ name: "Alpha" }), entry({ name: "Bastion" }), entry({ name: "bramble" }), entry({ name: "Charlie" })];

    it("jumps to the next row starting with the typed letter, after the current row", () => {
        expect(typeAheadIndex(rows, "b", 0)).toBe(1);
    });

    it("cycles to the next match on repeated presses rather than sitting on the first", () => {
        expect(typeAheadIndex(rows, "b", 1)).toBe(2);
        expect(typeAheadIndex(rows, "b", 2)).toBe(1);
    });

    it("is case-insensitive", () => {
        expect(typeAheadIndex(rows, "B", 0)).toBe(1);
    });

    it("stays put when nothing matches", () => {
        expect(typeAheadIndex(rows, "z", 0)).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/* The world badge                                                            */
/* -------------------------------------------------------------------------- */

describe("worldBadgeFor", () => {
    it("marks a folder with level.dat and a region folder as a world", () => {
        const badge = worldBadgeFor(
            entry({
                directory: true,
                world: { hasLevelDat: true, regionDimensions: ["region"], looksLikeWorld: true },
            }),
        );
        expect(badge.kind).toBe("world");
        expect(badge.regionDimensions).toEqual(["region"]);
    });

    it("marks level.dat alone as a partial signal, never a world", () => {
        const badge = worldBadgeFor(
            entry({
                directory: true,
                world: { hasLevelDat: true, regionDimensions: [], looksLikeWorld: false },
            }),
        );
        expect(badge.kind).toBe("partial");
    });

    it("marks a region folder alone as a partial signal, never a world", () => {
        const badge = worldBadgeFor(
            entry({
                directory: true,
                world: { hasLevelDat: false, regionDimensions: ["region"], looksLikeWorld: false },
            }),
        );
        expect(badge.kind).toBe("partial");
    });

    it("marks an ordinary folder with neither signal as none", () => {
        const badge = worldBadgeFor(entry({ directory: true }));
        expect(badge.kind).toBe("none");
    });

    it("never badges a file", () => {
        const badge = worldBadgeFor(
            entry({
                directory: false,
                world: { hasLevelDat: true, regionDimensions: ["region"], looksLikeWorld: true },
            }),
        );
        expect(badge.kind).toBe("none");
    });

    it("never badges a symlinked folder, even one whose signal looks like a world", () => {
        const badge = worldBadgeFor(
            entry({
                directory: true,
                symlink: true,
                world: { hasLevelDat: true, regionDimensions: ["region"], looksLikeWorld: true },
            }),
        );
        expect(badge.kind).toBe("none");
    });
});

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

describe("formatEntrySize", () => {
    it("is null for a folder", () => {
        expect(formatEntrySize(null)).toBeNull();
    });

    it("shows bytes under 1000 and units above it", () => {
        expect(formatEntrySize(512)).toBe("512 B");
        expect(formatEntrySize(2_500)).toBe("2.5 KB");
        expect(formatEntrySize(4_200_000_000)).toBe("4.2 GB");
    });
});

describe("formatEntryModified", () => {
    it("is null when the remote gave no date", () => {
        expect(formatEntryModified(null)).toBeNull();
    });

    it("formats a real date and is null for a garbage one", () => {
        expect(formatEntryModified("2023-07-22T00:00:00.000Z")).not.toBeNull();
        expect(formatEntryModified("not-a-date")).toBeNull();
    });
});
