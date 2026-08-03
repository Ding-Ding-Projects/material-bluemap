import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Color, Grid, Vector2i } from "@material-bluemap/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * HiresModelManager is mocked because constructing a real one instantiates every
 * registered render-pass, and those are the block/entity mesher waves — they throw until
 * they land. Everything BmMap does with the manager is forwarding, so a recording stub
 * covers exactly the contract this file is responsible for.
 */
const renderCalls: { tile: Vector2i; save: boolean }[] = [];
const unrenderCalls: Vector2i[] = [];
let hiresTileGrid: Grid = new Grid(32, 2);

vi.mock("./hires/HiresModelManager.js", () => ({
    HiresModelManager: class {
        constructor(
            _world: unknown,
            _storage: unknown,
            _resourcePack: unknown,
            _textureGallery: unknown,
            _renderSettings: unknown,
            tileGrid: Grid,
        ) {
            hiresTileGrid = tileGrid;
        }
        getTileGrid(): Grid {
            return hiresTileGrid;
        }
        async render(
            tile: Vector2i,
            tileMetaConsumer: (
                x: number,
                z: number,
                color: Color,
                height: number,
                blockLight: number,
            ) => void,
            save: boolean,
        ): Promise<void> {
            renderCalls.push({ tile, save });
            tileMetaConsumer(tile.getX(), tile.getY(), new Color(), 64, 3);
        }
        async unrender(tile: Vector2i): Promise<void> {
            unrenderCalls.push(tile);
        }
    },
}));

const { BmMap } = await import("./BmMap.js");
const { MapSettings } = await import("./MapSettings.js");
const { Tristate } = await import("../util/Tristate.js");
const { Compression } = await import("../storage/compression/Compression.js");
const { FileMapStorage } = await import("../storage/file/FileMapStorage.js");
const { ResourcePack } = await import("../resources/pack/resourcepack/ResourcePack.js");
const { PackVersion } = await import("../resources/pack/PackVersion.js");

type MapSettingsType = import("./MapSettings.js").MapSettings;
type LowresTileManagerLike = import("./BmMap.js").LowresTileManagerLike;
type MaskType = import("./mask/Mask.js").Mask;

/**
 * An always-true mask, declared here rather than taken from `Mask.ALL`: BmMap only ever
 * hands the render-mask to the (mocked) hires manager, so this file has no business
 * depending on the mask package to exercise the assembler.
 */
const ALWAYS: MaskType = {
    test: (...args: number[]) => (args.length === 3 ? true : Tristate.TRUE),
    isEdge: () => false,
    submask: () => ALWAYS,
    inverted: () => ALWAYS,
} as unknown as MaskType;

function settings(overrides: Partial<MapSettingsType> = {}): MapSettingsType {
    const base: MapSettingsType = {
        getSorting: () => 0,
        getStartPos: () => new Vector2i(0, 0),
        getSkyColor: () => "#7dabff",
        getVoidColor: () => "#000000",
        getMinInhabitedTime: () => 0,
        getMinInhabitedTimeRadius: () => 3,
        getHiresTileSize: () => 32,
        getLowresTileSize: () => 500,
        getLodCount: () => 3,
        getLodFactor: () => 5,
        getAmbientLight: () => 0,
        getSkyLight: () => 1,
        isEnablePerspectiveView: () => true,
        isEnableFlatView: () => true,
        isEnableFreeFlightView: () => true,
        isEnableHires: () => true,
        isCheckForRemovedRegions: () => true,
        getRemoveCavesBelowY: () => 55,
        getCaveDetectionOceanFloor: () => -5,
        isCaveDetectionUsesBlockLight: () => false,
        isRenderEdges: () => true,
        getEdgeLightStrength: () => 8,
        isIgnoreMissingLightData: () => false,
        getRenderMask: () => ALWAYS,
        isSaveHiresLayer: () => MapSettings.isSaveHiresLayer(base),
        isRenderTopOnly: () => MapSettings.isRenderTopOnly(base),
    };
    return Object.assign(base, overrides);
}

interface RecordingLowres extends LowresTileManagerLike {
    setCalls: { x: number; z: number; height: number; blockLight: number }[];
    saveCount: number;
}

function lowresFactory(): { factory: () => RecordingLowres; manager: RecordingLowres } {
    const manager: RecordingLowres = {
        setCalls: [],
        saveCount: 0,
        getTileGrid: () => new Grid(500),
        getLodCount: () => 3,
        getLodFactor: () => 5,
        set(x, z, _color, height, blockLight) {
            manager.setCalls.push({ x, z, height, blockLight });
        },
        save() {
            manager.saveCount++;
        },
    };
    return { factory: () => manager, manager };
}

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-bmmap-"));
    renderCalls.length = 0;
    unrenderCalls.length = 0;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function createMap(overrides: Partial<MapSettingsType> = {}) {
    const storage = new FileMapStorage(join(root, "overworld"), Compression.GZIP, false);
    const lowres = lowresFactory();
    const map = await BmMap.create(
        "overworld",
        "Overworld",
        // BmMap only stores the world and hands it to the (mocked) manager
        {} as never,
        storage,
        new ResourcePack(new PackVersion(34, 0)),
        settings(overrides),
        lowres.factory,
    );
    return { map, storage, lowres: lowres.manager };
}

describe("BmMap.create", () => {
    it("builds the hires grid with upstream's offset of 2", async () => {
        const { map } = await createMap();
        expect(map.getHiresModelManager().getTileGrid().getGridSize().getX()).toBe(32);
        expect(map.getHiresModelManager().getTileGrid().getOffset()).toEqual(new Vector2i(2, 2));
    });

    it("writes the texture gallery and the settings on creation", async () => {
        const { map } = await createMap();

        const textures = await map.getStorage().textures().read();
        expect(textures).not.toBeNull();
        const parsed = JSON.parse((await textures!.decompress()).toString("utf8")) as unknown[];
        // an unloaded resource-pack still gives the gallery its missing-texture at ordinal 0
        expect(parsed).toHaveLength(1);

        expect(await map.getStorage().settings().exists()).toBe(true);
    });

    it("writes a settings.json that matches what upstream's java CLI writes", async () => {
        const { map } = await createMap();

        const settingsItem = await map.getStorage().settings().read();
        const written = JSON.parse((await settingsItem!.decompress()).toString("utf8"));

        /*
         * Captured from a real render: `java -jar cli-5.22-27-shadow.jar -c <config> -r -g`
         * over a generated world, with the map config `tools/oracle/lib/javaOracle.mjs`
         * writes. Compared by value, not as text — see docs/deviations.md.
         */
        expect(written).toEqual({
            name: "Overworld",
            sorting: 0,
            hires: { tileSize: [32, 32], scale: [1, 1], translate: [2, 2] },
            lowres: { tileSize: [500, 500], lodFactor: 5, lodCount: 3 },
            startPos: [0, 0],
            skyColor: [0.4901960790157318, 0.6705882549285889, 1.0, 1.0],
            voidColor: [0.0, 0.0, 0.0, 1.0],
            ambientLight: 0.0,
            skyLight: 1.0,
            perspectiveView: true,
            flatView: true,
            freeFlightView: true,
        });
    });

    it("reuses the texture ordinals of an already-stored gallery", async () => {
        const storage = new FileMapStorage(join(root, "overworld"), Compression.GZIP, false);
        // ordinal 0 taken by something else; the missing-texture then has to land on 1
        await storage
            .textures()
            .write(Buffer.from(JSON.stringify([{ id: "minecraft:block/stone" }]), "utf8"));

        const lowres = lowresFactory();
        const map = await BmMap.create(
            "overworld",
            "Overworld",
            {} as never,
            storage,
            new ResourcePack(new PackVersion(34, 0)),
            settings(),
            lowres.factory,
        );

        expect(map.getTextureGallery().get(null)).toBe(1);
    });
});

describe("BmMap.renderTile", () => {
    it("forwards isSaveHiresLayer and feeds the lowres manager", async () => {
        const { map, lowres } = await createMap();
        await map.renderTile(new Vector2i(3, -4));

        expect(renderCalls).toEqual([{ tile: new Vector2i(3, -4), save: true }]);
        expect(lowres.setCalls).toEqual([{ x: 3, z: -4, height: 64, blockLight: 3 }]);
    });

    it("does not save the hires layer when hires is disabled", async () => {
        const { map } = await createMap({ isEnableHires: () => false });
        await map.renderTile(new Vector2i(0, 0));
        expect(renderCalls[0]!.save).toBe(false);
    });

    it("skips a tile the tile-filter rejects", async () => {
        const { map } = await createMap();
        map.setTileFilter((tile) => tile.getX() >= 0);

        await map.renderTile(new Vector2i(-1, 0));
        await map.renderTile(new Vector2i(1, 0));

        expect(renderCalls.map((call) => call.tile.getX())).toEqual([1]);
    });

    it("counts only the tiles it actually rendered", async () => {
        const { map } = await createMap();
        map.setTileFilter(() => false);
        await map.renderTile(new Vector2i(0, 0));
        // upstream divides by the tile count, so zero tiles is a division by zero
        expect(() => map.getAverageNanosPerTile()).toThrow();

        map.setTileFilter(() => true);
        await map.renderTile(new Vector2i(0, 0));
        expect(map.getAverageNanosPerTile()).toBeGreaterThanOrEqual(0n);
    });

    it("unrenders through the same lowres consumer", async () => {
        const { map } = await createMap();
        await map.unrenderTile(new Vector2i(2, 2));
        expect(unrenderCalls).toEqual([new Vector2i(2, 2)]);
    });
});

describe("BmMap.save", () => {
    it("writes the marker and player documents", async () => {
        const { map } = await createMap();
        await map.save();

        const markers = await map.getStorage().markers().read();
        const players = await map.getStorage().players().read();
        expect((await markers!.decompress()).toString("utf8")).toBe("{}");
        expect((await players!.decompress()).toString("utf8")).toBe("{}");
    });

    it("saves the lowres manager and the render-state", async () => {
        const { map, lowres } = await createMap();
        await map.save();
        expect(lowres.saveCount).toBe(1);
    });

    it("does not rewrite the texture gallery when storage already has it", async () => {
        const { map } = await createMap();

        // corrupt-but-present: upstream only rewrites when the item does NOT exist
        const before = await readFile(join(root, "overworld", "textures.json.gz"));
        await map.save();
        const after = await readFile(join(root, "overworld", "textures.json.gz"));
        expect(after.equals(before)).toBe(true);
        expect(JSON.parse(gunzipSync(after).toString("utf8"))).toHaveLength(1);
    });

    it("rewrites the texture gallery when storage lost it", async () => {
        const { map } = await createMap();
        await map.getStorage().textures().delete();
        await map.save();
        expect(await map.getStorage().textures().exists()).toBe(true);
    });

    it("saveIfDue refuses a second save inside the window and allows one outside it", async () => {
        const { map } = await createMap();
        expect(await map.saveIfDue(0)).toBe(true);
        expect(await map.saveIfDue(60_000)).toBe(false);
        expect(await map.saveIfDue(0)).toBe(true);
    });

    it("serialises overlapping saves instead of interleaving them", async () => {
        const { map, lowres } = await createMap();
        await Promise.all([map.save(), map.save(), map.save()]);
        expect(lowres.saveCount).toBe(3);
    });
});

describe("BmMap identity", () => {
    it("is equal by id, exactly as upstream", async () => {
        const { map } = await createMap();
        const other = await BmMap.create(
            "overworld",
            "A different display name",
            {} as never,
            new FileMapStorage(join(root, "other"), Compression.GZIP, false),
            new ResourcePack(new PackVersion(34, 0)),
            settings(),
            lowresFactory().factory,
        );

        expect(map.equals(other)).toBe(true);
        expect(map.hashCode()).toBe(other.hashCode());
        expect(map.equals("overworld")).toBe(false);
    });

    it("resetTextureGallery re-fills from the resource pack", async () => {
        const { map } = await createMap();
        map.resetTextureGallery();
        expect(map.getTextureGallery().get(null)).toBe(0);
    });
});
