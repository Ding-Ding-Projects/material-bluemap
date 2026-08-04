/**
 * The rules behind the world list: what sorts first, what a row says, what a search looks
 * at, and where an arrow key goes.
 *
 * All of it is pure, so all of it is tested here without a DOM and without a file system,
 * and the component next door is left with arrangement rather than logic. The cases that
 * matter most are the ones about *not* guessing: a world with no recorded date must not
 * be presented as an old one, and a world whose `level.dat` could not be read must keep
 * every fact that was never in doubt.
 */

import { describe, expect, it } from "vitest";
import {
    describeFolderState,
    dimensionCount,
    displayName,
    formatWorldSize,
    nextOptionIndex,
    regionFileCount,
    samePath,
    sortWorldsByLastPlayed,
    worldAtPath,
    worldDetailLine,
    worldOptionName,
    worldSearchText,
    type MinecraftFolder,
    type MinecraftWorldSummary,
} from "./worldCatalog.js";
import type { Translate } from "./worldFolder.js";

/**
 * A translator that behaves the way vue-i18n behaves for these call shapes: the third
 * argument is the message, the second carries the values, and `{name}` is substituted.
 */
const t = ((key: string, second: unknown, third?: unknown): string => {
    const message = typeof second === "string" ? second : String(third ?? "");
    const named = typeof second === "string" ? {} : (second as Record<string, unknown>);
    return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in named ? String(named[name]) : whole,
    );
}) as Translate;

function world(overrides: Partial<MinecraftWorldSummary> = {}): MinecraftWorldSummary {
    return {
        folderId: "mount:one",
        path: "/home/ada/.minecraft/saves/New World (2)",
        directoryName: "New World (2)",
        name: "Survival",
        lastPlayed: Date.UTC(2026, 6, 20, 9, 14),
        versionName: "1.21.4",
        snapshot: false,
        gameMode: "survival",
        hardcore: false,
        cheats: false,
        seed: "-4872364918273645501",
        regionFiles: { "": 0, region: 40, "DIM-1/region": 6 },
        sizeBytes: 512 * 1024 * 1024,
        sizeComplete: true,
        detailsError: null,
        ...overrides,
    };
}

/* -------------------------------------------------------------------------- */

describe("the order the list comes in", () => {
    it("puts the most recently played first, which is the one people want", () => {
        const older = world({ path: "/a", name: "Older", lastPlayed: 1_000 });
        const newer = world({ path: "/b", name: "Newer", lastPlayed: 9_000 });

        expect(sortWorldsByLastPlayed([older, newer]).map((entry) => entry.name)).toEqual(["Newer", "Older"]);
    });

    it("sends a world with no recorded date to the end rather than to the top", () => {
        // An unknown date is not "a long time ago". Putting a freshly copied world at the
        // top purely because it has no timestamp would be the list asserting something it
        // does not know.
        const dated = world({ path: "/a", name: "Dated", lastPlayed: 1_000 });
        const never = world({ path: "/b", name: "Never", lastPlayed: null });

        expect(sortWorldsByLastPlayed([never, dated]).map((entry) => entry.name)).toEqual(["Dated", "Never"]);
    });

    it("breaks a tie by name, so the order is the same on every visit", () => {
        const at = 5_000;
        const zed = world({ path: "/z", name: "Zed", lastPlayed: at });
        const amy = world({ path: "/a", name: "Amy", lastPlayed: at });

        expect(sortWorldsByLastPlayed([zed, amy]).map((entry) => entry.name)).toEqual(["Amy", "Zed"]);
    });
});

describe("the small line under a world's name", () => {
    it("carries the facts somebody chooses by", () => {
        const line = worldDetailLine(world(), null, t);

        expect(line).toContain("last played");
        expect(line).toContain("1.21.4");
        expect(line).toContain("Survival");
        expect(line).toContain("2 dimensions, 46 region files");
        expect(line).toContain("537 MB");
        expect(line).toContain("seed -4872364918273645501");
    });

    it("names the folder on disk when it differs from the world's name", () => {
        // The whole reason the name and the folder are separate facts.
        expect(worldDetailLine(world(), null, t)).toContain("in New World (2)");
        expect(worldDetailLine(world({ name: "New World (2)" }), null, t)).not.toContain("in New World (2)");
    });

    it("leaves a fact out entirely rather than inventing one", () => {
        const bare = world({
            name: null,
            versionName: null,
            gameMode: null,
            seed: null,
            sizeBytes: null,
            regionFiles: {},
            lastPlayed: null,
        });

        expect(worldDetailLine(bare, null, t)).toBe("never opened");
        expect(displayName(bare)).toBe("New World (2)");
    });

    it("says hardcore and cheats only when they are on", () => {
        expect(worldDetailLine(world({ hardcore: true, cheats: true }), null, t)).toContain("Hardcore");
        expect(worldDetailLine(world({ hardcore: true, cheats: true }), null, t)).toContain("cheats on");
        expect(worldDetailLine(world(), null, t)).not.toContain("Hardcore");
    });

    it("marks a size that hit its cap as a floor rather than stating a fraction as the whole", () => {
        expect(formatWorldSize(world({ sizeComplete: false }), t)).toBe("at least 537 MB");
        expect(formatWorldSize(world({ sizeBytes: null }), t)).toBeNull();
    });

    it("says a snapshot is one, rather than the release it is named after", () => {
        expect(worldDetailLine(world({ versionName: "25w03a", snapshot: true }), null, t)).toContain(
            "25w03a snapshot",
        );
    });

    it("says which mounted folder the world came from, when there is more than one", () => {
        expect(worldDetailLine(world(), "Modded 1.20", t)).toContain("from Modded 1.20");
        expect(worldDetailLine(world(), null, t)).not.toContain("from ");
    });

    it("keeps a world whose level.dat could not be read, saying so beside what is known", () => {
        const broken = world({ name: null, versionName: null, detailsError: "not NBT" });
        const line = worldDetailLine(broken, null, t);

        expect(line).toContain("its level.dat could not be read");
        // Everything that was never in doubt is still on the line.
        expect(line).toContain("2 dimensions, 46 region files");
    });

    it("counts only the dimensions that really have terrain", () => {
        const mixed = world({ regionFiles: { "": 0, region: 4, "DIM-1/region": 0, "DIM1/region": 2 } });

        expect(dimensionCount(mixed)).toBe(2);
        expect(regionFileCount(mixed)).toBe(6);
    });
});

describe("what a screen reader is given", () => {
    it("names an option with the world and its whole detail line", () => {
        // "New World (2)" four times over is not a choice anybody can make: the details
        // are the entire difference between the rows.
        const spoken = worldOptionName(world(), "Modded 1.20", t);

        expect(spoken.startsWith("Survival. ")).toBe(true);
        expect(spoken).toContain("1.21.4");
        expect(spoken).toContain("from Modded 1.20");
    });
});

describe("what a search looks at", () => {
    it("covers the name, the folder, the path, the mount label and every detail", () => {
        const text = worldSearchText(world(), "Modded 1.20", t);

        for (const needle of ["Survival", "New World (2)", "/home/ada", "Modded 1.20", "1.21.4"]) {
            expect(text, needle).toContain(needle);
        }
    });

    it("finds a world by a word that only appears in its details", () => {
        // Typing `hardcore` has to find the hardcore world, or the search is lying about
        // what it looked at.
        expect(worldSearchText(world({ hardcore: true }), null, t)).toContain("Hardcore");
    });
});

describe("recognising a folder somebody already has", () => {
    it("treats separators and case as the same folder, because a picker and a listing differ", () => {
        expect(samePath("D:\\Saves\\Bastion", "d:/saves/bastion/")).toBe(true);
        expect(samePath("/a/b", "/a/c")).toBe(false);
        expect(samePath("", "")).toBe(false);
    });

    it("resolves a dropped folder to the row it already has, so it is never listed twice", () => {
        const worlds = [world({ path: "/home/ada/.minecraft/saves/Bastion", name: "Bastion" })];

        expect(worldAtPath(worlds, "/home/ada/.minecraft/saves/Bastion/")?.name).toBe("Bastion");
        expect(worldAtPath(worlds, "/media/usb/Bastion")).toBeNull();
    });
});

describe("driving the listbox from the keyboard", () => {
    it("moves one row at a time and stops at the ends rather than wrapping", () => {
        // Wrapping in a list of ninety saves silently teleports somebody from the top to
        // the bottom, and the one thing a keyboard user cannot do is glance at where they
        // ended up.
        expect(nextOptionIndex("ArrowDown", 0, 5)).toBe(1);
        expect(nextOptionIndex("ArrowDown", 4, 5)).toBe(4);
        expect(nextOptionIndex("ArrowUp", 0, 5)).toBe(0);
        expect(nextOptionIndex("Home", 3, 5)).toBe(0);
        expect(nextOptionIndex("End", 0, 5)).toBe(4);
        expect(nextOptionIndex("PageDown", 0, 50)).toBe(10);
        expect(nextOptionIndex("PageUp", 40, 50)).toBe(30);
    });

    it("leaves the index alone for a key it does not handle, so the event is not swallowed", () => {
        expect(nextOptionIndex("a", 2, 5)).toBe(2);
        expect(nextOptionIndex("Tab", 2, 5)).toBe(2);
    });

    it("reports nothing to move to in an empty list", () => {
        expect(nextOptionIndex("ArrowDown", 0, 0)).toBe(-1);
    });
});

describe("what a folder's row says about itself", () => {
    function folder(overrides: Partial<MinecraftFolder> = {}): MinecraftFolder {
        return {
            id: "mount:one",
            label: "Modded 1.20",
            labelled: true,
            chosenPath: "/instances/Modded",
            savesPath: "/instances/Modded/saves",
            resolution: "installation",
            builtIn: false,
            origin: null,
            state: "ok",
            stateDetail: null,
            mountedAt: null,
            ...overrides,
        };
    }

    it("says nothing at all about a folder that is fine", () => {
        expect(describeFolderState(folder(), t)).toBeNull();
    });

    it("explains a missing folder as a folder that is missing, not one to be forgotten", () => {
        const said = describeFolderState(folder({ state: "missing" }), t) ?? "";

        expect(said).toContain("/instances/Modded/saves");
        expect(said).toContain("unplugged");
    });

    it("passes the system's own words through for a folder it could not read", () => {
        expect(describeFolderState(folder({ state: "unreadable", stateDetail: "EACCES" }), t)).toBe("EACCES");
    });
});
