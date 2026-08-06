/**
 * A world is not a project until somebody says so.
 *
 * These cases are the whole reason `discoveredWorlds.ts` exists rather than folding this
 * logic into the component: the boundary between "found on disk" and "set up as a project"
 * has to hold regardless of which folder a world was mounted through, what case Windows
 * happened to report a path in, or whether the same world is reachable two different ways.
 */

import { describe, expect, it } from "vitest";
import { discoveredWorlds } from "./discoveredWorlds.js";
import type { MinecraftWorldSummary } from "../world/worldCatalog.js";

function world(overrides: Partial<MinecraftWorldSummary> = {}): MinecraftWorldSummary {
    return {
        folderId: "mount:one",
        path: "/home/ada/.minecraft/saves/Bastion",
        directoryName: "Bastion",
        name: "Bastion",
        lastPlayed: null,
        versionName: null,
        snapshot: null,
        gameMode: null,
        hardcore: null,
        cheats: null,
        seed: null,
        regionFiles: {},
        sizeBytes: null,
        sizeComplete: true,
        detailsError: null,
        ...overrides,
    };
}

describe("worlds available to start a project from", () => {
    it("offers every discovered world when nothing has a project yet", () => {
        const worlds = [world({ path: "/a/Bastion" }), world({ path: "/a/Creative Test", name: "Creative Test" })];

        expect(discoveredWorlds(worlds, [])).toHaveLength(2);
    });

    it("leaves out a world that already has a project", () => {
        const worlds = [world({ path: "/a/Bastion" }), world({ path: "/a/Creative Test", name: "Creative Test" })];

        const available = discoveredWorlds(worlds, ["/a/Bastion"]);

        expect(available.map((w) => w.path)).toEqual(["/a/Creative Test"]);
    });

    it("matches a project's world by identity, not by exact string", () => {
        // A project written with different separators or case than the catalogue happened
        // to report for the same folder must still hide it - otherwise "start a project"
        // would offer to create a second project over a world that already has one.
        const worlds = [world({ path: "D:\\Saves\\Bastion" })];

        expect(discoveredWorlds(worlds, ["d:/saves/bastion/"])).toHaveLength(0);
    });

    it("de-duplicates a world reachable through two mounted folders before filtering", () => {
        const worlds = [
            world({ folderId: "mount:one", path: "/a/Bastion" }),
            world({ folderId: "mount:two", path: "/a/Bastion" }),
        ];

        expect(discoveredWorlds(worlds, [])).toHaveLength(1);
    });

    it("returns an empty list rather than throwing when there are no worlds at all", () => {
        expect(discoveredWorlds([], [])).toEqual([]);
        expect(discoveredWorlds([], ["/a/Bastion"])).toEqual([]);
    });

    it("does not remove anything when the project list has nothing matching", () => {
        const worlds = [world({ path: "/a/Bastion" })];

        expect(discoveredWorlds(worlds, ["/somewhere/else/entirely"])).toHaveLength(1);
    });
});
