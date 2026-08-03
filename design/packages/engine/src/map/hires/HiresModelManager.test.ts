import { Color, Grid, Vector2i, type Vector3i } from "@material-bluemap/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GridStorage } from "../../storage/GridStorage.js";
import type { World } from "../../world/World.js";
import type { TextureGallery } from "../TextureGallery.js";
import type { TileMetaConsumer } from "../TileMetaConsumer.js";
import { ArrayTileModel } from "./ArrayTileModel.js";
import type { RenderPass } from "./RenderPass.js";
import type { RenderSettings } from "./RenderSettings.js";
import type { TileModelView } from "./TileModelView.js";
import { VoidTileModel } from "./VoidTileModel.js";

/**
 * The concrete render-passes belong to the block/entity mesher waves and pull in a real
 * resource-pack; this test is about the manager's own job (window arithmetic, pass
 * ordering, sort-then-save, listeners), so the registry is replaced with passes this
 * file controls.
 */
const passes: RenderPass[] = [];
vi.mock("./RenderPassType.js", () => ({
    RenderPassType: {
        REGISTRY: {
            values: () => passes.map((pass) => ({ create: () => pass })),
        },
    },
}));

const { HiresModelManager } = await import("./HiresModelManager.js");
const { MaxCapacityReachedException } = await import("./MaxCapacityReachedException.js");
const { ORACLE_MODEL_BUILDERS, toHex } = await import("./prbmOracleFixture.js");
const { ORACLE_CASES } = await import("./prbmOracleData.js");

interface RecordedRender {
    modelMin: Vector3i;
    modelMax: Vector3i;
    modelAnchor: Vector3i;
    tileModel: TileModelView;
}

class FakeStorage implements Partial<GridStorage> {
    readonly writes: { x: number; z: number; data: Uint8Array }[] = [];
    readonly deletes: { x: number; z: number }[] = [];
    failWith: Error | null = null;

    write(x: number, z: number, data: Uint8Array): Promise<void> {
        if (this.failWith !== null) return Promise.reject(this.failWith);
        this.writes.push({ x, z, data });
        return Promise.resolve();
    }

    delete(x: number, z: number): Promise<void> {
        if (this.failWith !== null) return Promise.reject(this.failWith);
        this.deletes.push({ x, z });
        return Promise.resolve();
    }
}

const world = { getId: () => "test:world" } as unknown as World;
const resourcePack = {} as never;
const textureGallery = {} as unknown as TextureGallery;
const renderSettings = {} as unknown as RenderSettings;

function makeManager(
    storage: FakeStorage,
    tileGrid = new Grid(new Vector2i(16, 16)),
): InstanceType<typeof HiresModelManager> {
    return new HiresModelManager(
        world,
        storage as unknown as GridStorage,
        resourcePack,
        textureGallery,
        renderSettings,
        tileGrid,
    );
}

beforeEach(() => {
    passes.length = 0;
    vi.restoreAllMocks();
});

/** upstream: map/hires/HiresModelManager.java */
describe("HiresModelManager", () => {
    it("exposes its tile grid", () => {
        const grid = new Grid(new Vector2i(32, 32));
        expect(makeManager(new FakeStorage(), grid).getTileGrid()).toBe(grid);
    });

    it("gives each pass the tile's xz bounds, an unbounded y, and a y=0 anchor", async () => {
        const recorded: RecordedRender[] = [];
        passes.push({
            render: (_world, modelMin, modelMax, modelAnchor, tileModel) => {
                recorded.push({ modelMin, modelMax, modelAnchor, tileModel });
            },
        });

        const storage = new FakeStorage();
        await makeManager(storage).render(new Vector2i(2, -3), () => undefined, true);

        expect(recorded).toHaveLength(1);
        const { modelMin, modelMax, modelAnchor } = recorded[0]!;
        expect([modelMin.getX(), modelMin.getY(), modelMin.getZ()]).toEqual([32, -2147483648, -48]);
        expect([modelMax.getX(), modelMax.getY(), modelMax.getZ()]).toEqual([47, 2147483647, -33]);
        expect([modelAnchor.getX(), modelAnchor.getY(), modelAnchor.getZ()]).toEqual([32, 0, -48]);
    });

    it("runs the passes in registry order, each over a freshly anchored view", async () => {
        const order: string[] = [];
        const starts: number[] = [];
        passes.push(
            {
                render: (_w, _min, _max, _anchor, view) => {
                    order.push("first");
                    starts.push(view.getStart());
                    view.add(2);
                },
            },
            {
                render: (_w, _min, _max, _anchor, view) => {
                    order.push("second");
                    starts.push(view.getStart());
                    view.add(1);
                },
            },
        );

        const storage = new FakeStorage();
        await makeManager(storage).render(new Vector2i(0, 0), () => undefined, true);

        expect(order).toEqual(["first", "second"]);
        expect(starts).toEqual([0, 2]);
    });

    it("sorts the model and writes its PRBM bytes to the storage cell", async () => {
        // rebuild the oracle's `threeFacesUnsorted` model through a render pass, so the
        // manager's own output can be compared to the Java writer's bytes
        passes.push({
            render: (_w, _min, _max, _anchor, view) => {
                const source = ORACLE_MODEL_BUILDERS["threeFacesUnsorted"]!();
                const target = view.getTileModel() as ArrayTileModel;
                const start = view.add(source.size());
                target.position.set(source.position.subarray(0, source.size() * 9), start * 9);
                target.uv.set(source.uv.subarray(0, source.size() * 6), start * 6);
                target.ao.set(source.ao.subarray(0, source.size() * 3), start * 3);
                target.color.set(source.color.subarray(0, source.size() * 3), start * 3);
                target.sunlight.set(source.sunlight.subarray(0, source.size()), start);
                target.blocklight.set(source.blocklight.subarray(0, source.size()), start);
                target.materialIndex.set(source.materialIndex.subarray(0, source.size()), start);
            },
        });

        const storage = new FakeStorage();
        await makeManager(storage).render(new Vector2i(4, 5), () => undefined, true);

        expect(storage.writes).toHaveLength(1);
        expect(storage.writes[0]!.x).toBe(4);
        expect(storage.writes[0]!.z).toBe(5);
        expect(toHex(storage.writes[0]!.data)).toBe(ORACLE_CASES["threeFacesUnsorted"]!.prbm);
    });

    it("forwards the tile-meta consumer to every pass", async () => {
        const seen: [number, number, number][] = [];
        passes.push({
            render: (_w, _min, _max, _anchor, _view, consumer) => {
                consumer?.(1, 2, new Color(), 64, 7);
            },
        });

        const consumer: TileMetaConsumer = (x, z, _c, height, blockLight) => {
            seen.push([x + z, height, blockLight]);
        };
        await makeManager(new FakeStorage()).render(new Vector2i(0, 0), consumer, true);

        expect(seen).toEqual([[3, 64, 7]]);
    });

    it("still runs the passes when save is false, but writes nothing", async () => {
        let rendered = 0;
        let model: unknown = null;
        passes.push({
            render: (_w, _min, _max, _anchor, view) => {
                rendered++;
                model = view.getTileModel();
            },
        });

        const storage = new FakeStorage();
        await makeManager(storage).render(new Vector2i(0, 0), () => undefined, false);

        expect(rendered).toBe(1);
        expect(model).toBe(VoidTileModel.INSTANCE);
        expect(storage.writes).toHaveLength(0);
    });

    it("saves the partial model when a pass overflows the tile-model capacity", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        passes.push(
            {
                render: (_w, _min, _max, _anchor, view) => {
                    const face = view.add(1);
                    (view.getTileModel() as ArrayTileModel).setMaterialIndex(face, 1);
                },
            },
            {
                render: () => {
                    throw new MaxCapacityReachedException("Capacity out of range: 1000001");
                },
            },
        );

        const storage = new FakeStorage();
        await makeManager(storage).render(new Vector2i(0, 0), () => undefined, true);

        expect(storage.writes).toHaveLength(1);
        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]![0])).toContain("too complex to be completed");
    });

    it("lets any other error out of render()", async () => {
        passes.push({
            render: () => {
                throw new Error("kaboom");
            },
        });

        await expect(
            makeManager(new FakeStorage()).render(new Vector2i(0, 0), () => undefined, true),
        ).rejects.toThrow("kaboom");
    });

    it("notifies tile-update listeners after a successful save, and stops after removal", async () => {
        passes.push({ render: () => undefined });
        const storage = new FakeStorage();
        const manager = makeManager(storage);

        const seen: string[] = [];
        const listener = (tile: Vector2i): void => {
            seen.push(`${tile.getX()},${tile.getY()}`);
        };
        manager.addTileUpdateListener(listener);

        await manager.render(new Vector2i(1, 2), () => undefined, true);
        manager.removeTileUpdateListener(listener);
        await manager.render(new Vector2i(3, 4), () => undefined, true);

        expect(seen).toEqual(["1,2"]);
    });

    it("does not notify listeners when the storage write fails", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        passes.push({ render: () => undefined });

        const storage = new FakeStorage();
        storage.failWith = new Error("disk full");
        const manager = makeManager(storage);

        let notified = 0;
        manager.addTileUpdateListener(() => {
            notified++;
        });
        await manager.render(new Vector2i(0, 0), () => undefined, true);

        expect(notified).toBe(0);
        expect(error).toHaveBeenCalledOnce();
    });

    it("unrender deletes the tile and resets every covered lowres cell", async () => {
        const storage = new FakeStorage();
        const manager = makeManager(storage, new Grid(new Vector2i(2, 2)));

        const reset: [number, number, number, number][] = [];
        await manager.unrender(new Vector2i(1, -1), (x, z, _color, height, blockLight) => {
            reset.push([x, z, height, blockLight]);
        });

        expect(storage.deletes).toEqual([{ x: 1, z: -1 }]);
        expect(reset).toEqual([
            [2, -2, 0, 0],
            [2, -1, 0, 0],
            [3, -2, 0, 0],
            [3, -1, 0, 0],
        ]);
    });

    it("unrender still resets the lowres cells when the delete fails", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const storage = new FakeStorage();
        storage.failWith = new Error("read-only file system");

        let reset = 0;
        await makeManager(storage, new Grid(new Vector2i(2, 2))).unrender(new Vector2i(0, 0), () => {
            reset++;
        });

        expect(reset).toBe(4);
        expect(error).toHaveBeenCalledOnce();
    });
});
