import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { findField } from "@material-bluemap/config";
import { fieldValue } from "../config/configModel.js";
import {
    FALLBACK_DIMENSIONS,
    createMapWizard,
    fillProblem,
    folderLeaf,
    isValidMapId,
    suggestMapId,
} from "./wizardModel.js";
import { mapDescriptor } from "./wizardSteps.js";
import { inspectWorldFolder, type WorldFolderListing } from "./worldFolder.js";

function field(path: string) {
    const found = findField(mapDescriptor(), path);
    if (found === undefined) throw new Error(`no field ${path}`);
    return found;
}

function worldListing(folder: string, regionFiles: Record<string, number>): WorldFolderListing {
    return {
        folder,
        entries: [{ path: "level.dat", directory: false }],
        regionFiles,
    };
}

/** A wizard that has been taken through the world and identity steps. */
function answered() {
    const wizard = createMapWizard({ separator: "/" });
    wizard.setWorld("/srv/survival/world", inspectWorldFolder(worldListing("/srv/survival/world", { region: 40, "DIM-1/region": 8 })));
    wizard.displayName.value = "Survival";
    wizard.mapId.value = "survival";
    wizard.storageDirectory.value = "/var/lib/material-bluemap/maps";
    return wizard;
}

describe("map ids", () => {
    it("accepts what the engine accepts and refuses what it refuses", () => {
        expect(isValidMapId("overworld")).toBe(true);
        expect(isValidMapId("survival-2024_b")).toBe(true);
        expect(isValidMapId("2b2t")).toBe(true);

        // The engine validates with exactly this rule before it writes anything, so
        // a wizard that accepted these would collect five answers and then be
        // refused with `invalid-request`.
        expect(isValidMapId("Overworld")).toBe(false);
        expect(isValidMapId("my world")).toBe(false);
        expect(isValidMapId("-lead")).toBe(false);
        expect(isValidMapId("../escape")).toBe(false);
        expect(isValidMapId("a".repeat(65))).toBe(false);
    });

    it("suggests an id from a name that is not one", () => {
        expect(suggestMapId("My Survival World")).toBe("my-survival-world");
        expect(suggestMapId("  Nether!!  ")).toBe("nether");
        expect(suggestMapId("2024 season")).toBe("2024-season");
        expect(suggestMapId("!!!")).toBe("");
        expect(isValidMapId(suggestMapId("The End (copy)"))).toBe(true);
    });

    it("reads the folder's own name off either separator", () => {
        expect(folderLeaf("C:\\servers\\survival\\world")).toBe("world");
        expect(folderLeaf("/srv/survival/world/")).toBe("world");
    });
});

describe("choosing a world", () => {
    it("offers the vanilla three until something has read the folder", () => {
        const wizard = createMapWizard();

        expect(wizard.dimensions.value).toEqual(FALLBACK_DIMENSIONS);
        expect(wizard.inspection.value.unchecked).toBe(true);
    });

    it("offers the dimensions the world really has once it has been read", () => {
        const wizard = createMapWizard();
        wizard.setWorld("/srv/world", inspectWorldFolder(worldListing("/srv/world", { region: 5, "DIM1/region": 3 })));

        expect(wizard.dimensions.value.map((dimension) => dimension.key)).toEqual([
            "minecraft:overworld",
            "minecraft:the_end",
        ]);
    });

    it("moves off a dimension the chosen world does not have", () => {
        const wizard = createMapWizard();
        wizard.chooseDimension("minecraft:the_nether");
        expect(wizard.dimensionKey.value).toBe("minecraft:the_nether");

        // Rendering a dimension nobody has ever been to produces an empty map and
        // reports it as a success, which is the least useful pair of answers.
        wizard.setWorld("/srv/world", inspectWorldFolder(worldListing("/srv/world", { region: 5 })));
        expect(wizard.dimensionKey.value).toBe("minecraft:overworld");
    });

    it("names the map after the world folder, until somebody names it themselves", () => {
        const wizard = createMapWizard();
        wizard.setWorld("/srv/survival/world", inspectWorldFolder(worldListing("/srv/survival/world", { region: 5 })));

        expect(wizard.displayName.value).toBe("world");
        expect(wizard.mapId.value).toBe("world");
    });
});

describe("the map config", () => {
    it("is built from upstream's own template for the chosen dimension", () => {
        const wizard = answered();
        const text = wizard.configText();

        expect(text).toContain('world: "/srv/survival/world"');
        expect(text).toContain('dimension: "minecraft:overworld"');
        expect(text).toContain('name: "Survival"');
        // The template's own explanation of every setting travels with it, which is
        // what makes a generated file readable rather than a wall of keys.
        expect(text).toContain("The display name of this map");
    });

    it("rewrites the whole file when the dimension changes, keeping the edits", () => {
        const wizard = answered();
        wizard.setOption(field("min-inhabited-time"), 120);

        expect(wizard.configText()).toContain('sky-color: "#7dabff"');

        wizard.chooseDimension("minecraft:the_nether");

        // The presets differ in more than the dimension key, so patching one key
        // would leave a nether map lit like an overworld.
        expect(wizard.configText()).toContain('sky-color: "#290000"');
        // The nether preset also turns on the mask that cuts away the bedrock
        // ceiling, which is a whole block of the template rather than one key.
        expect(wizard.configText()).toContain("the Nether's ceiling");
        expect(wizard.sorting.value).toBe(100);
        // ...and the tuning survives the rewrite.
        expect(fieldValue(wizard.file.value, field("min-inhabited-time"))).toBe(120);
    });

    it("records a cleared setting as removed rather than as its default", () => {
        const wizard = answered();
        const target = field("ambient-light");

        expect(wizard.configText()).toContain("ambient-light:");
        wizard.clearOption(target);
        expect(wizard.configText()).not.toContain("\nambient-light:");
        // The comment explaining the setting stays; only the value goes.
        expect(wizard.configText()).toContain("ambient light");
    });

    it("undoes every edit at once", () => {
        const wizard = answered();
        wizard.setOption(field("min-inhabited-time"), 120);
        wizard.setOption(field("render-edges"), false);
        expect(wizard.changes.value).toHaveLength(2);

        wizard.resetOptions();
        expect(wizard.changes.value).toHaveLength(0);
    });

    it("separates the changes this render applies from the ones only the file carries", () => {
        const wizard = answered();
        wizard.setOption(field("start-pos"), { x: 120, z: -64 });
        wizard.setOption(field("ambient-light"), 0.4);

        expect(wizard.reachingChanges.value.map((change) => change.field.path)).toEqual(["start-pos"]);
        expect(wizard.carriedChanges.value.map((change) => change.field.path)).toEqual(["ambient-light"]);
    });
});

describe("stepping through", () => {
    it("refuses to leave the world step without a world", () => {
        const wizard = createMapWizard();

        expect(wizard.canLeave("world")).toBe(false);
        wizard.next();
        expect(wizard.step.value).toBe("world");
    });

    it("refuses a folder that was read and is not a world", () => {
        const wizard = createMapWizard();
        wizard.setWorld(
            "/home/me/Documents",
            inspectWorldFolder({ folder: "/home/me/Documents", entries: [{ path: "notes.txt", directory: false }], regionFiles: {} }),
        );

        expect(wizard.canLeave("world")).toBe(false);
        expect(wizard.problemsFor("world")[0]?.key).toBe("world.wizard.notAWorld");
    });

    it("allows a folder nothing could read, and says nothing about having checked it", () => {
        // Refusing every world on a build with no folder reader would make the
        // wizard unusable rather than careful.
        const wizard = createMapWizard();
        wizard.setWorld("/srv/world");

        expect(wizard.inspection.value.unchecked).toBe(true);
        expect(wizard.canLeave("world")).toBe(true);
    });

    it("refuses a relative world path", () => {
        const wizard = createMapWizard();
        wizard.setWorld("worlds/survival");

        expect(wizard.problemsFor("world").map((problem) => problem.key)).toContain("world.wizard.worldRelative");
    });

    it("refuses an id the engine would refuse, and says which id", () => {
        const wizard = answered();
        wizard.mapId.value = "My World";

        const problem = wizard.problemsFor("identity")[0];
        expect(problem?.key).toBe("world.wizard.badId");
        expect(fillProblem(problem!, "the id {id} is wrong")).toBe("the id My World is wrong");
    });

    /**
     * How `WorldWizard.vue` actually renders a problem, against the real vue-i18n
     * with no locale loaded.
     *
     * The values go in as vue-i18n's named arguments and the English string goes to
     * the third. Handing the string over as argument two instead lets vue-i18n's own
     * compiler consume `{id}`, and a message whose whole job is to name the refused
     * id names nothing — which is what shipped, past a test that filled the
     * placeholder itself and never noticed.
     */
    it("renders a problem's vars through vue-i18n rather than after it", () => {
        const wizard = answered();
        wizard.mapId.value = "My World";
        const problem = wizard.problemsFor("identity")[0]!;

        const i18n = createI18n({
            legacy: false,
            missingWarn: false,
            fallbackWarn: false,
            locale: "none",
            fallbackLocale: "none",
            silentFallbackWarn: true,
            messages: {},
        });

        expect(i18n.global.t(problem.key, problem.vars ?? {}, problem.fallback)).toBe(
            "A map id may contain lower-case letters, digits, hyphens and underscores, and has to start with a letter or a digit. My World does not.",
        );
    });

    it("refuses a relative storage folder but accepts an environment token", () => {
        const wizard = answered();

        wizard.storageDirectory.value = "maps";
        expect(wizard.canLeave("storage")).toBe(false);

        wizard.storageDirectory.value = "%APPDATA%\\Material BlueMap\\maps";
        expect(wizard.canLeave("storage")).toBe(true);

        wizard.storageDirectory.value = "~/.local/share/material-bluemap/maps";
        expect(wizard.canLeave("storage")).toBe(true);
    });

    it("will not jump to a step whose earlier steps are unanswered", () => {
        const wizard = createMapWizard();

        expect(wizard.canReach("review")).toBe(false);
        wizard.goTo("review");
        expect(wizard.step.value).toBe("world");
    });

    it("walks forward and back once everything is answered", () => {
        const wizard = answered();

        expect(wizard.canReach("review")).toBe(true);
        wizard.next();
        expect(wizard.step.value).toBe("identity");
        wizard.next();
        expect(wizard.step.value).toBe("options");
        wizard.back();
        expect(wizard.step.value).toBe("identity");
    });
});

describe("the render request", () => {
    it("carries what the wizard was told, and nothing invented", () => {
        const wizard = answered();
        wizard.chooseDimension("minecraft:the_nether");

        const request = wizard.toRenderRequest();
        expect(request.maps).toHaveLength(1);
        expect(request.maps[0]).toMatchObject({
            id: "survival",
            world: "/srv/survival/world",
            name: "Survival",
            dimension: "minecraft:the_nether",
            sorting: 100,
        });
        expect(request.force).toBe(false);
        expect(request.metrics).toBe(false);
        // Left out entirely rather than sent as null, so the engine keeps its own
        // default of every core but two.
        expect("renderThreads" in request).toBe(false);
    });

    it("passes a starting position on only when the map config names one", () => {
        const wizard = answered();
        expect(wizard.toRenderRequest().maps[0]?.startPos).toEqual({ x: 0, z: 0 });

        wizard.setOption(field("start-pos"), { x: 250, z: -80 });
        expect(wizard.toRenderRequest().maps[0]?.startPos).toEqual({ x: 250, z: -80 });
    });

    it("falls back to the id when nobody named the map", () => {
        const wizard = answered();
        wizard.displayName.value = "   ";

        expect(wizard.toRenderRequest().maps[0]?.name).toBe("survival");
    });

    it("carries the run options the review step offers", () => {
        const wizard = answered();
        wizard.run.value = { force: true, fixEdges: true, metrics: false, renderThreads: 4 };

        const request = wizard.toRenderRequest();
        expect(request.force).toBe(true);
        expect(request.fixEdges).toBe(true);
        expect(request.renderThreads).toBe(4);
    });
});

describe("auto-loading the other dimensions", () => {
    /** A world read with all three vanilla dimensions present. */
    function answeredWithDimensions() {
        const wizard = createMapWizard({ separator: "/" });
        wizard.setWorld(
            "/srv/survival/world",
            inspectWorldFolder(
                worldListing("/srv/survival/world", { region: 40, "DIM-1/region": 8, "DIM1/region": 3 }),
            ),
        );
        wizard.displayName.value = "Survival";
        wizard.mapId.value = "survival";
        wizard.storageDirectory.value = "/var/lib/material-bluemap/maps";
        return wizard;
    }

    it("still renders exactly one map when nothing extra was ticked", () => {
        const wizard = answeredWithDimensions();

        expect(wizard.includedExtraDimensions.value.size).toBe(0);
        expect(wizard.toRenderRequest().maps).toHaveLength(1);
    });

    it("adds a ticked dimension as its own map, lit from its own template", () => {
        const wizard = answeredWithDimensions();
        wizard.setExtraDimensionsIncluded(["minecraft:the_nether"], true);

        const request = wizard.toRenderRequest();
        expect(request.maps).toHaveLength(2);

        const nether = request.maps[1]!;
        expect(nether.dimension).toBe("minecraft:the_nether");
        expect(nether.world).toBe("/srv/survival/world");
        expect(nether.id).toBe("survival-the-nether");
        expect(nether.name).toBe("Survival - The Nether");
        expect(nether.sorting).toBe(100);
        // Its own preset, not the primary map's: the nether sky colour, not the
        // overworld's, and none of the primary map's own edits replayed onto it.
        expect(nether.config).toContain('sky-color: "#290000"');
        expect(nether.config).toContain('dimension: "minecraft:the_nether"');
    });

    it("adds several ticked dimensions at once", () => {
        const wizard = answeredWithDimensions();
        wizard.setExtraDimensionsIncluded(["minecraft:the_nether", "minecraft:the_end"], true);

        const request = wizard.toRenderRequest();
        expect(request.maps.map((map) => map.dimension)).toEqual([
            "minecraft:overworld",
            "minecraft:the_nether",
            "minecraft:the_end",
        ]);
    });

    it("un-ticks a dimension it was told to exclude", () => {
        const wizard = answeredWithDimensions();
        wizard.setExtraDimensionsIncluded(["minecraft:the_nether", "minecraft:the_end"], true);
        wizard.setExtraDimensionsIncluded(["minecraft:the_nether"], false);

        expect(wizard.toRenderRequest().maps.map((map) => map.dimension)).toEqual([
            "minecraft:overworld",
            "minecraft:the_end",
        ]);
    });

    it("never double-renders the primary dimension through a bulk include", () => {
        const wizard = answeredWithDimensions();
        // A bulk "include everything shown" naming the primary key too must not add a
        // second, redundant copy of the map already being built above it.
        wizard.setExtraDimensionsIncluded(
            ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"],
            true,
        );

        expect(wizard.toRenderRequest().maps).toHaveLength(3);
    });

    it("inverts a batch of dimensions at once", () => {
        const wizard = answeredWithDimensions();
        wizard.setExtraDimensionsIncluded(["minecraft:the_nether"], true);
        wizard.invertExtraDimensionInclusion(["minecraft:the_nether", "minecraft:the_end"]);

        expect(wizard.toRenderRequest().maps.map((map) => map.dimension)).toEqual([
            "minecraft:overworld",
            "minecraft:the_end",
        ]);
    });

    it("drops a dimension from the extra set once it becomes the one being tuned", () => {
        const wizard = answeredWithDimensions();
        wizard.setExtraDimensionsIncluded(["minecraft:the_nether"], true);
        expect(wizard.toRenderRequest().maps).toHaveLength(2);

        wizard.chooseDimension("minecraft:the_nether");

        // It is now the primary map itself, so it must not also render as an extra.
        expect(wizard.toRenderRequest().maps).toHaveLength(1);
        expect(wizard.toRenderRequest().maps[0]?.dimension).toBe("minecraft:the_nether");
    });

    it("points an extra map at its own sibling folder for a split-server layout", () => {
        const wizard = createMapWizard({ separator: "/" });
        wizard.setWorld(
            "/srv/world",
            inspectWorldFolder({
                folder: "/srv/world",
                entries: [{ path: "level.dat", directory: false }],
                regionFiles: { region: 20 },
                serverSiblings: { nether: { worldFolder: "/srv/world_nether", regionFiles: 6 } },
            }),
        );
        wizard.mapId.value = "world";
        wizard.storageDirectory.value = "/var/lib/material-bluemap/maps";

        wizard.setExtraDimensionsIncluded(["minecraft:the_nether"], true);
        const nether = wizard.toRenderRequest().maps[1]!;

        expect(nether.world).toBe("/srv/world_nether");
        expect(nether.config).toContain('world: "/srv/world_nether"');
    });

    it("never lets two extra maps collide on the same id, even when their slugs would otherwise match", () => {
        const wizard = createMapWizard({ separator: "/" });
        wizard.setWorld(
            "/srv/world",
            inspectWorldFolder({
                folder: "/srv/world",
                entries: [{ path: "level.dat", directory: false }],
                regionFiles: {
                    region: 5,
                    // Two custom dimensions whose labels slugify to the exact same id.
                    "dimensions/foo/bar-baz/region": 3,
                    "dimensions/foo-bar/baz/region": 2,
                },
            }),
        );
        wizard.mapId.value = "world";
        wizard.storageDirectory.value = "/var/lib/material-bluemap/maps";

        wizard.setExtraDimensionsIncluded(["foo:bar-baz", "foo-bar:baz"], true);
        const ids = wizard.toRenderRequest().maps.map((map) => map.id);

        expect(new Set(ids).size).toBe(ids.length);
    });
});
