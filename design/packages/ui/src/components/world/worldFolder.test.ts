import { describe, expect, it } from "vitest";
import {
    describeWorld,
    describeWorldProblem,
    dimensionsIn,
    folderName,
    inspectWorldFolder,
    isAbsolutePath,
    parentFolder,
    uncheckedWorld,
    unreadableWorld,
    type WorldFolderEntry,
    type WorldFolderListing,
} from "./worldFolder.js";

/** The fallback-returning translator, which is what a build with no locale uses. */
const t = (_key: string, fallback: string): string => fallback;

function listing(
    folder: string,
    entries: readonly (string | WorldFolderEntry)[],
    regionFiles: Record<string, number> = {},
): WorldFolderListing {
    return {
        folder,
        entries: entries.map((entry) =>
            typeof entry === "string" ? { path: entry, directory: entry.endsWith("/") } : entry,
        ),
        regionFiles,
    };
}

/** A world the way Minecraft actually lays one out. */
function realWorld(folder = "C:\\servers\\survival\\world"): WorldFolderListing {
    return listing(
        folder,
        ["level.dat", "session.lock", "region/", "DIM-1/", "DIM-1/region/", "DIM1/", "DIM1/region/", "playerdata/"],
        { region: 812, "DIM-1/region": 96, "DIM1/region": 12 },
    );
}

describe("recognising a world", () => {
    it("accepts a save folder with level.dat and region files", () => {
        const inspection = inspectWorldFolder(realWorld());

        expect(inspection.ok).toBe(true);
        expect(inspection.problems).toEqual([]);
        expect(inspection.hasLevelDat).toBe(true);
        expect(inspection.unchecked).toBe(false);
    });

    it("reads the dimensions that are really there, in upstream's own order", () => {
        const inspection = inspectWorldFolder(realWorld());

        expect(inspection.dimensions.map((dimension) => dimension.key)).toEqual([
            "minecraft:overworld",
            "minecraft:the_nether",
            "minecraft:the_end",
        ]);
        expect(inspection.dimensions.map((dimension) => dimension.sorting)).toEqual([0, 100, 200]);
        expect(inspection.dimensions.map((dimension) => dimension.preset)).toEqual(["overworld", "nether", "end"]);
    });

    it("leaves out a dimension folder that exists but holds no region files", () => {
        // Minecraft creates DIM-1 and DIM1 the moment anybody steps through a
        // portal and leaves them behind. Offering an empty one renders nothing and
        // reports it as a success, which is the worst of both answers.
        const inspection = inspectWorldFolder(
            listing("/srv/world", ["level.dat", "region/", "DIM-1/", "DIM-1/region/"], { region: 40, "DIM-1/region": 0 }),
        );

        expect(inspection.dimensions.map((dimension) => dimension.key)).toEqual(["minecraft:overworld"]);
    });

    it("finds a datapack dimension and names it by its own key", () => {
        const inspection = inspectWorldFolder(
            listing("/srv/world", ["level.dat", "region/", "dimensions/", "dimensions/aether/skyland/region/"], {
                region: 10,
                "dimensions/aether/skyland/region": 7,
            }),
        );

        const custom = inspection.dimensions.find((dimension) => dimension.custom);
        expect(custom?.key).toBe("aether:skyland");
        expect(custom?.regionFiles).toBe(7);
        // Left equal to the key, so the generated config omits `dimension-type`
        // and lets BlueMap detect what this app has never seen.
        expect(custom?.dimensionType).toBe("aether:skyland");
        expect(custom?.sorting).toBe(300);
    });

    it("sorts several datapack dimensions apart from each other", () => {
        const dimensions = dimensionsIn({
            region: 1,
            "dimensions/zed/last/region": 2,
            "dimensions/alpha/first/region": 3,
        });

        expect(dimensions.map((dimension) => dimension.key)).toEqual([
            "minecraft:overworld",
            "alpha:first",
            "zed:last",
        ]);
        expect(dimensions.map((dimension) => dimension.sorting)).toEqual([0, 300, 400]);
    });
});

describe("saying precisely what is wrong", () => {
    it("names the worlds inside a saves folder rather than calling it 'not a world'", () => {
        const inspection = inspectWorldFolder(
            listing("/home/me/.minecraft/saves", [
                "Bastion/",
                "Bastion/level.dat",
                "Creative Test/",
                "Creative Test/level.dat",
            ]),
        );

        expect(inspection.ok).toBe(false);
        expect(inspection.problems).toHaveLength(1);
        expect(inspection.problems[0]?.code).toBe("saves-folder");

        const text = describeWorldProblem(inspection.problems[0]!, t);
        expect(text.title).toContain("Bastion, Creative Test");
        expect(text.fix).toContain("choose the one world");
    });

    it("recognises the region folder from inside a world and points one level up", () => {
        const inspection = inspectWorldFolder(listing("/srv/world/region", [], { "": 812 }));

        expect(inspection.problems[0]?.code).toBe("region-folder");
        expect(describeWorldProblem(inspection.problems[0]!, t).fix).toContain("/srv/world");
    });

    it("recognises a dimension folder and points one level up", () => {
        const inspection = inspectWorldFolder(listing("/srv/world/DIM-1", ["region/"], { region: 96 }));

        expect(inspection.problems[0]?.code).toBe("dimension-folder");
        expect(describeWorldProblem(inspection.problems[0]!, t).fix).toContain("/srv/world");
    });

    it("says a folder with no level.dat is not a world, and names it", () => {
        const inspection = inspectWorldFolder(listing("/home/me/Documents", ["notes.txt", "photos/"]));

        expect(inspection.problems[0]?.code).toBe("no-level-dat");
        expect(describeWorldProblem(inspection.problems[0]!, t).title).toContain("Documents");
    });

    it("separates a real world with no terrain from a folder that is not a world", () => {
        const inspection = inspectWorldFolder(listing("/srv/fresh", ["level.dat", "region/"], { region: 0 }));

        expect(inspection.ok).toBe(false);
        expect(inspection.hasLevelDat).toBe(true);
        expect(inspection.problems[0]?.code).toBe("no-region-data");
    });

    it("reports only the one problem that actually helps", () => {
        // A saves folder is also a folder with no level.dat. Saying both buries the
        // sentence that leads somewhere under one that does not.
        const inspection = inspectWorldFolder(listing("/saves", ["One/", "One/level.dat"]));

        expect(inspection.problems.map((problem) => problem.code)).toEqual(["saves-folder"]);
    });

    it("refuses a relative path, because the engine resolves one against its own working directory", () => {
        const inspection = inspectWorldFolder(listing("world", ["level.dat"], { region: 5 }));

        expect(inspection.problems.map((problem) => problem.code)).toContain("relative");
    });

    it("keeps a read failure in the reader's own words", () => {
        const inspection = unreadableWorld("/mnt/gone", "EACCES: permission denied, scandir '/mnt/gone'");

        expect(inspection.ok).toBe(false);
        expect(inspection.unchecked).toBe(false);
        expect(describeWorldProblem(inspection.problems[0]!, t).fix).toContain("EACCES");
    });
});

describe("a folder nothing could read", () => {
    it("is marked unchecked rather than approved or refused", () => {
        const inspection = uncheckedWorld("D:\\worlds\\survival");

        expect(inspection.unchecked).toBe(true);
        expect(inspection.ok).toBe(false);
        expect(inspection.problems).toEqual([]);
        expect(describeWorld(inspection, t)).toContain("Not checked");
    });

    it("still refuses a path that is plainly unusable", () => {
        expect(uncheckedWorld("").problems[0]?.code).toBe("empty");
        expect(uncheckedWorld("./world").problems[0]?.code).toBe("relative");
    });
});

describe("path helpers", () => {
    it("treats drive letters, UNC shares and POSIX roots as absolute", () => {
        expect(isAbsolutePath("C:\\worlds")).toBe(true);
        expect(isAbsolutePath("\\\\nas\\worlds")).toBe(true);
        expect(isAbsolutePath("/srv/world")).toBe(true);
        expect(isAbsolutePath("worlds/survival")).toBe(false);
        expect(isAbsolutePath("")).toBe(false);
    });

    it("reads a folder's own name and its parent on both separators", () => {
        expect(folderName("C:\\servers\\survival\\world")).toBe("world");
        expect(folderName("/srv/world/")).toBe("world");
        expect(parentFolder("C:\\servers\\survival\\world")).toBe("C:\\servers\\survival");
        expect(parentFolder("/srv/world/region")).toBe("/srv/world");
    });
});

describe("the summary line", () => {
    it("counts the dimensions and the region files it found", () => {
        const text = describeWorld(inspectWorldFolder(realWorld()), t);

        expect(text).toContain("3");
        expect(text).toContain("920");
    });

    it("leads with the problem when there is one", () => {
        const text = describeWorld(inspectWorldFolder(listing("/tmp/empty", [])), t);

        expect(text).toContain("not a Minecraft world");
    });
});
