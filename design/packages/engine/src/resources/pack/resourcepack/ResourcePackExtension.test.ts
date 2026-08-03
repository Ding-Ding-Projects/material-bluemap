import { Key } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { BlockProperties } from "../../../world/BlockProperties.js";
import { BlockState } from "../../../world/BlockState.js";
import { ResourcePackExtension } from "./ResourcePackExtension.js";

const STONE = new BlockState(Key.minecraft("stone"));

describe("ResourcePackExtension invoker-statics", () => {
    it("apply the upstream interface-defaults for an extension that overrides nothing", () => {
        const extension: ResourcePackExtension = {};

        expect(ResourcePackExtension.collectUsedTextureKeys(extension).size).toBe(0);

        const key = Key.minecraft("stone");
        expect(ResourcePackExtension.getBlockStateKey(extension, key)).toBe(key);

        const builder = BlockProperties.builder();
        ResourcePackExtension.getBlockProperties(extension, STONE, builder);
        expect(builder.build().isCulling()).toBe(false);
        expect(builder.build().isOccluding()).toBe(false);
    });

    it("dispatch to the overridden members", () => {
        const textureKey = new Key("minecraft", "block/stone");
        const extension: ResourcePackExtension = {
            collectUsedTextureKeys: () => new Set([textureKey]),
            getBlockStateKey: (key) => new Key("mod", key.getValue()),
            getBlockProperties: (_blockState, propertiesBuilder) => {
                propertiesBuilder.alwaysWaterlogged(true);
            },
        };

        expect([...ResourcePackExtension.collectUsedTextureKeys(extension)]).toEqual([textureKey]);
        expect(
            ResourcePackExtension.getBlockStateKey(extension, Key.minecraft("stone")).getFormatted(),
        ).toBe("mod:stone");

        const builder = BlockProperties.builder();
        ResourcePackExtension.getBlockProperties(extension, STONE, builder);
        expect(builder.build().isAlwaysWaterlogged()).toBe(true);
    });

    it("still carries the PackExtension members", async () => {
        const calls: string[] = [];
        const extension: ResourcePackExtension = {
            loadResources: async () => {
                calls.push("loadResources");
            },
            bake: async () => {
                calls.push("bake");
            },
        };

        await extension.loadResources?.([]);
        await extension.bake?.();
        expect(calls).toEqual(["loadResources", "bake"]);
    });
});
