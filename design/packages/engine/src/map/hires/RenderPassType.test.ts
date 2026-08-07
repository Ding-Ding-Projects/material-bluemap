import { Key } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { RenderPassType } from "./RenderPassType.js";

/**
 * upstream: map/hires/RenderPassType.java
 *
 * Only the identity and the registry are asserted here. Which concrete pass each type
 * constructs belongs to the block/entity mesher waves, and those factories are covered
 * by their own tests.
 */
describe("RenderPassType", () => {
    it("keys the two upstream pass types under the bluemap namespace", () => {
        expect(RenderPassType.BLOCKS.getKey().getFormatted()).toBe("bluemap:blocks");
        expect(RenderPassType.ENTITIES.getKey().getFormatted()).toBe("bluemap:entities");
    });

    it("registers both, and resolves them by key", () => {
        expect(RenderPassType.REGISTRY.get(Key.bluemap("blocks"))).toBe(RenderPassType.BLOCKS);
        expect(RenderPassType.REGISTRY.get(Key.bluemap("entities"))).toBe(RenderPassType.ENTITIES);
        expect(RenderPassType.REGISTRY.get(Key.bluemap("nope"))).toBeNull();
    });

    /**
     * Load-bearing: `HiresModelManager` renders the passes in this order, and that is
     * the order faces are appended to the tile-model in. Within one material group the
     * sort is stable, so pass order survives all the way into the file.
     */
    it("iterates blocks before entities", () => {
        expect(RenderPassType.REGISTRY.values().map((t) => t.getKey().getFormatted())).toEqual([
            "bluemap:blocks",
            "bluemap:entities",
        ]);
    });

    it("Impl delegates create() to the factory it was given", () => {
        const pass = { render: () => undefined };
        const calls: unknown[][] = [];
        const type = new RenderPassType.Impl(Key.bluemap("test"), {
            create: (...args) => {
                calls.push(args);
                return pass;
            },
        });

        const resourcePack = {} as never;
        const gallery = {} as never;
        const settings = {} as never;

        expect(type.getKey().getFormatted()).toBe("bluemap:test");
        expect(type.create(resourcePack, gallery, settings)).toBe(pass);
        expect(calls).toEqual([[resourcePack, gallery, settings]]);
    });
});
