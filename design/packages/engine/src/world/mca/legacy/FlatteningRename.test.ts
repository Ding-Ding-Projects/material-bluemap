import { Key } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { PackVersion } from "../../../resources/pack/PackVersion.js";
import { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
// only a TEST needs this: production never imports LegacyResourcePackExtension.ts from
// anywhere reachable through FlatteningRename.ts (see isLegacyResourcePack's doc comment for
// why) — `packages/engine/src/index.ts` is what registers it for real renders. A test file
// is a leaf, not part of that require-cycle-sensitive chain, so importing it directly here
// (to make sure the extension is actually registered before this file's packs are built,
// whether or not this file runs standalone) is safe.
import { registerLegacyResourcePackExtension } from "../../../resources/pack/resourcepack/legacy/LegacyResourcePackExtension.js";
import { ZipFileSystem } from "../../../resources/pack/vfs/ZipFileSystem.js";
import { buildZip } from "../../../resources/pack/vfs/zipTestUtil.js";
import { BlockState } from "../../BlockState.js";
import { flattenLegacyBlockState, isLegacyResourcePack } from "./FlatteningRename.js";

registerLegacyResourcePackExtension();

/** builds a legacy BlockState the way BlockIdConfig / the legacy extensions would hand it back */
function state(id: string, properties: Record<string, string> = {}): BlockState {
    return new BlockState(Key.parse(id), new Map(Object.entries(properties)));
}

/**
 * A real {@link ResourcePack}, loaded from a synthetic root that carries only a
 * `pack.mcmeta` declaring `pack_format`. Mirrors the smallest-possible fixture
 * `resourcepack-e2e.test.ts`'s Proof 4 builds for the same purpose: contributes no
 * blockstates/models/textures of its own, only the one signal
 * `LegacyPackFormat.isLegacyPackRoot` reads.
 */
async function packWithFormat(packFormat: number | undefined): Promise<ResourcePack> {
    // `undefined` -> no pack.mcmeta at all, the way a real Minecraft client jar ships (see
    // resourcepack-e2e.test.ts's Proof 4) — "reads as modern" per LegacyPackFormat.ts's doc
    const entries =
        packFormat === undefined
            ? [{ name: "pack.png", data: "not a real png, just a stand-in for a jar with no pack.mcmeta" }]
            : [{ name: "pack.mcmeta", data: JSON.stringify({ pack: { pack_format: packFormat } }) }];
    const root = await ZipFileSystem.fromBuffer(buildZip(entries), "synthetic-pack-meta.zip");
    const pack = new ResourcePack(new PackVersion(packFormat ?? 4, 0));
    await pack.loadResources(root.getRootDirectories());
    return pack;
}

describe("flattenLegacyBlockState", () => {
    describe("the four observed render gaps (design/HANDOFF.md)", () => {
        it("renames the grass BLOCK to grass_block, keeping SnowyExtension's snowy", () => {
            const result = flattenLegacyBlockState(state("minecraft:grass", { snowy: "true" }));
            expect(result.getId().getFormatted()).toBe("minecraft:grass_block");
            expect(result.getProperties().get("snowy")).toBe("true");

            const plain = flattenLegacyBlockState(state("minecraft:grass", { snowy: "false" }));
            expect(plain.getId().getFormatted()).toBe("minecraft:grass_block");
            expect(plain.getProperties().get("snowy")).toBe("false");
        });

        it("gives podzol the snowy=false default a legacy world never modeled", () => {
            const result = flattenLegacyBlockState(state("minecraft:podzol"));
            expect(result.getId().getFormatted()).toBe("minecraft:podzol");
            expect(result.getProperties().get("snowy")).toBe("false");
        });

        it("renames snow_layer to snow, carrying the layers property through untouched", () => {
            for (let layers = 1; layers <= 8; layers++) {
                const result = flattenLegacyBlockState(
                    state("minecraft:snow_layer", { layers: String(layers) }),
                );
                expect(result.getId().getFormatted()).toBe("minecraft:snow");
                expect(result.getProperties().get("layers")).toBe(String(layers));
            }
        });

        it("renames the snow BLOCK to snow_block — the mirror image of snow_layer", () => {
            const result = flattenLegacyBlockState(state("minecraft:snow"));
            expect(result.getId().getFormatted()).toBe("minecraft:snow_block");
            expect(result.getProperties().size).toBe(0);
        });
    });

    describe("a representative sample of the other unmatched names", () => {
        it("renames plain flattening cases with properties passed through untouched", () => {
            expect(flattenLegacyBlockState(state("minecraft:brick_block")).getId().getFormatted()).toBe(
                "minecraft:bricks",
            );
            expect(flattenLegacyBlockState(state("minecraft:melon_block")).getId().getFormatted()).toBe(
                "minecraft:melon",
            );
            expect(
                flattenLegacyBlockState(state("minecraft:reeds", { age: "7" })).getId().getFormatted(),
            ).toBe("minecraft:sugar_cane");
            expect(
                flattenLegacyBlockState(state("minecraft:reeds", { age: "7" })).getProperties().get("age"),
            ).toBe("7");
            expect(flattenLegacyBlockState(state("minecraft:smooth_andesite")).getId().getFormatted()).toBe(
                "minecraft:polished_andesite",
            );
            expect(flattenLegacyBlockState(state("minecraft:waterlily")).getId().getFormatted()).toBe(
                "minecraft:lily_pad",
            );
        });

        it("resolves the stone-brick and its silverfish-infested twin correctly (not swapped)", () => {
            expect(flattenLegacyBlockState(state("minecraft:mossy_stonebrick")).getId().getFormatted()).toBe(
                "minecraft:mossy_stone_bricks",
            );
            expect(
                flattenLegacyBlockState(state("minecraft:mossy_brick_monster_egg")).getId().getFormatted(),
            ).toBe("minecraft:infested_mossy_stone_bricks");
        });

        it("renames every 'silver' color to 'light_gray'", () => {
            expect(flattenLegacyBlockState(state("minecraft:silver_wool")).getId().getFormatted()).toBe(
                "minecraft:light_gray_wool",
            );
            expect(
                flattenLegacyBlockState(
                    state("minecraft:silver_glazed_terracotta", { facing: "north" }),
                ).getId().getFormatted(),
            ).toBe("minecraft:light_gray_glazed_terracotta");
            expect(
                flattenLegacyBlockState(state("minecraft:silver_glazed_terracotta", { facing: "north" }))
                    .getProperties()
                    .get("facing"),
            ).toBe("north");
        });

        it("renames every dye color's stained_hardened_clay to _terracotta, silver included", () => {
            for (const [legacy, modern] of [
                ["white", "white"],
                ["orange", "orange"],
                ["silver", "light_gray"],
                ["black", "black"],
            ] as const) {
                const result = flattenLegacyBlockState(state(`minecraft:${legacy}_stained_hardened_clay`));
                expect(result.getId().getFormatted()).toBe(`minecraft:${modern}_terracotta`);
            }
        });

        it("swaps the two grass-tuft names this project's legacy naming kept apart", () => {
            // id 31 meta 1 (single tuft) — this project calls it "tall_grass"; real Minecraft
            // renamed it to "short_grass" (by way of "grass" in 1.13-1.20.2)
            expect(flattenLegacyBlockState(state("minecraft:tall_grass")).getId().getFormatted()).toBe(
                "minecraft:short_grass",
            );
            // id 175 meta 2/3 (the double-tall plant) — this project calls it "double_grass";
            // real Minecraft's actual "tall_grass" is THIS block, not the single tuft above
            const lower = flattenLegacyBlockState(state("minecraft:double_grass", { half: "lower" }));
            expect(lower.getId().getFormatted()).toBe("minecraft:tall_grass");
            expect(lower.getProperties().get("half")).toBe("lower");
            const upper = flattenLegacyBlockState(state("minecraft:double_grass", { half: "upper" }));
            expect(upper.getProperties().get("half")).toBe("upper");

            expect(flattenLegacyBlockState(state("minecraft:double_fern", { half: "lower" })).getId().getFormatted()).toBe(
                "minecraft:large_fern",
            );
            expect(flattenLegacyBlockState(state("minecraft:double_rose", { half: "lower" })).getId().getFormatted()).toBe(
                "minecraft:rose_bush",
            );
            expect(flattenLegacyBlockState(state("minecraft:paeonia", { half: "lower" })).getId().getFormatted()).toBe(
                "minecraft:peony",
            );
            expect(flattenLegacyBlockState(state("minecraft:syringa", { half: "lower" })).getId().getFormatted()).toBe(
                "minecraft:lilac",
            );
        });

        it("renames every single-height slab family, half -> type, same value", () => {
            for (const [family, half] of [
                ["oak", "bottom"],
                ["stone", "top"],
                ["purpur", "bottom"],
            ] as const) {
                const result = flattenLegacyBlockState(state(`minecraft:${family}_slab`, { half }));
                expect(result.getId().getFormatted()).toBe(`minecraft:${family}_slab`);
                expect(result.getProperties().get("type")).toBe(half);
                expect(result.getProperties().has("half")).toBe(false);
            }
            // purpur additionally drops "variant", which no modern purpur_slab keys on
            const purpur = flattenLegacyBlockState(
                state("minecraft:purpur_slab", { variant: "default", half: "bottom" }),
            );
            expect(purpur.getProperties().has("variant")).toBe(false);
        });

        it("renames every double-slab family to type=double, dropping the legacy property", () => {
            expect(
                flattenLegacyBlockState(state("minecraft:oak_double_slab")).getProperties().get("type"),
            ).toBe("double");
            expect(flattenLegacyBlockState(state("minecraft:oak_double_slab")).getId().getFormatted()).toBe(
                "minecraft:oak_slab",
            );
            const brick = flattenLegacyBlockState(
                state("minecraft:brick_double_slab", { seamless: "true" }),
            );
            expect(brick.getId().getFormatted()).toBe("minecraft:brick_slab");
            expect(brick.getProperties().get("type")).toBe("double");
            expect(brick.getProperties().has("seamless")).toBe(false);
            // the pre-1.8 "old wood" double slab (id 43/125 meta 2) -> the closest modern
            // equivalent, oak
            expect(
                flattenLegacyBlockState(state("minecraft:wood_old_double_slab")).getId().getFormatted(),
            ).toBe("minecraft:oak_slab");
        });

        it("gives repeaters the powered/locked properties the id-split and the flattening added", () => {
            const on = flattenLegacyBlockState(
                state("minecraft:powered_repeater", { facing: "north", delay: "2" }),
            );
            expect(on.getId().getFormatted()).toBe("minecraft:repeater");
            expect(on.getProperties().get("powered")).toBe("true");
            expect(on.getProperties().get("locked")).toBe("false");
            expect(on.getProperties().get("facing")).toBe("north");
            expect(on.getProperties().get("delay")).toBe("2");

            const off = flattenLegacyBlockState(
                state("minecraft:unpowered_repeater", { facing: "north", delay: "2" }),
            );
            expect(off.getProperties().get("powered")).toBe("false");
            expect(off.getProperties().get("locked")).toBe("false");
        });

        it("keeps comparator's mode/facing/powered untouched — only the id changes", () => {
            const props = { mode: "subtract", facing: "east", powered: "true" };
            expect(
                flattenLegacyBlockState(state("minecraft:powered_comparator", props)).getId().getFormatted(),
            ).toBe("minecraft:comparator");
            expect(
                flattenLegacyBlockState(state("minecraft:powered_comparator", props)).getProperties(),
            ).toEqual(new Map(Object.entries(props)));
            expect(
                flattenLegacyBlockState(state("minecraft:unpowered_comparator", props)).getId().getFormatted(),
            ).toBe("minecraft:comparator");
        });

        it("gives furnace and redstone_lamp the lit property the id-split determines", () => {
            const litFurnace = flattenLegacyBlockState(
                state("minecraft:lit_furnace", { facing: "south" }),
            );
            expect(litFurnace.getId().getFormatted()).toBe("minecraft:furnace");
            expect(litFurnace.getProperties().get("lit")).toBe("true");
            expect(litFurnace.getProperties().get("facing")).toBe("south");

            const unlitFurnace = flattenLegacyBlockState(state("minecraft:furnace", { facing: "south" }));
            expect(unlitFurnace.getProperties().get("lit")).toBe("false");

            expect(
                flattenLegacyBlockState(state("minecraft:lit_redstone_lamp")).getProperties().get("lit"),
            ).toBe("true");
            expect(flattenLegacyBlockState(state("minecraft:redstone_lamp")).getProperties().get("lit")).toBe(
                "false",
            );
        });

        it("collapses lit_redstone_ore to redstone_ore (the glow does not change the model)", () => {
            expect(flattenLegacyBlockState(state("minecraft:lit_redstone_ore")).getId().getFormatted()).toBe(
                "minecraft:redstone_ore",
            );
        });

        it("gives daylight_detector the inverted property, dropping power (irrelevant to the model)", () => {
            const inverted = flattenLegacyBlockState(
                state("minecraft:daylight_detector_inverted", { power: "9" }),
            );
            expect(inverted.getId().getFormatted()).toBe("minecraft:daylight_detector");
            expect(inverted.getProperties().get("inverted")).toBe("true");
            expect(inverted.getProperties().has("power")).toBe(false);

            const plain = flattenLegacyBlockState(state("minecraft:daylight_detector", { power: "3" }));
            expect(plain.getProperties().get("inverted")).toBe("false");
            expect(plain.getProperties().has("power")).toBe(false);
        });

        it("gives fence gates the in_wall=false default a legacy world never modeled", () => {
            const props = { facing: "west", powered: "false", open: "true" };
            const gate = flattenLegacyBlockState(state("minecraft:fence_gate", props));
            expect(gate.getId().getFormatted()).toBe("minecraft:oak_fence_gate");
            expect(gate.getProperties().get("in_wall")).toBe("false");
            expect(gate.getProperties().get("facing")).toBe("west");

            const acacia = flattenLegacyBlockState(state("minecraft:acacia_fence_gate", props));
            expect(acacia.getId().getFormatted()).toBe("minecraft:acacia_fence_gate");
            expect(acacia.getProperties().get("in_wall")).toBe("false");
        });

        it("splits the two redstone-torch ids by facing into torch vs. wall_torch", () => {
            const floorOn = flattenLegacyBlockState(state("minecraft:redstone_torch", { facing: "up" }));
            expect(floorOn.getId().getFormatted()).toBe("minecraft:redstone_torch");
            expect(floorOn.getProperties().get("lit")).toBe("true");
            expect(floorOn.getProperties().has("facing")).toBe(false);

            const wallOff = flattenLegacyBlockState(
                state("minecraft:unlit_redstone_torch", { facing: "east" }),
            );
            expect(wallOff.getId().getFormatted()).toBe("minecraft:redstone_wall_torch");
            expect(wallOff.getProperties().get("lit")).toBe("false");
            expect(wallOff.getProperties().get("facing")).toBe("east");
        });

        it("gives the bark-on-every-side log state its own _wood block with a default axis", () => {
            const wood = flattenLegacyBlockState(state("minecraft:oak_log", { axis: "none" }));
            expect(wood.getId().getFormatted()).toBe("minecraft:oak_wood");
            expect(wood.getProperties().get("axis")).toBe("y");

            // the three real orientations are untouched — no rule fires for them
            for (const axis of ["x", "y", "z"]) {
                const log = state("minecraft:oak_log", { axis });
                expect(flattenLegacyBlockState(log)).toBe(log);
            }
        });
    });

    describe("the modern path", () => {
        it("returns every block-state this table has no rule for completely unchanged", () => {
            const stone = state("minecraft:stone");
            expect(flattenLegacyBlockState(stone)).toBe(stone);

            const customProps = state("minecraft:oak_stairs", { facing: "east", shape: "straight" });
            expect(flattenLegacyBlockState(customProps)).toBe(customProps);
        });

        it("does not rewrite properties it has no rule for, even on a renamed id", () => {
            // "fence" gains no property beyond the rename — anything already on the state
            // (as WoodenFenceConnectExtension would have added) survives untouched
            const fence = state("minecraft:fence", {
                north: "true",
                south: "false",
                east: "true",
                west: "false",
            });
            const result = flattenLegacyBlockState(fence);
            expect(result.getId().getFormatted()).toBe("minecraft:oak_fence");
            expect(result.getProperties().get("north")).toBe("true");
            expect(result.getProperties().get("south")).toBe("false");
            expect(result.getProperties().get("east")).toBe("true");
            expect(result.getProperties().get("west")).toBe("false");
        });
    });
});

describe("isLegacyResourcePack (issue #46)", () => {
    // real ResourcePack instances, era-detected the exact way resourcepack-e2e.test.ts's
    // Proof 4 exercises: pack.mcmeta's pack_format, read by LegacyPackFormat.isLegacyPackRoot.

    it("reports a pre-flattening pack (pack_format 3, e.g. real 1.12.2) as legacy", async () => {
        const pack = await packWithFormat(3);
        expect(isLegacyResourcePack(pack)).toBe(true);
    });

    it("reports a post-flattening pack (pack_format 4, e.g. real 1.13+) as NOT legacy", async () => {
        const pack = await packWithFormat(4);
        expect(isLegacyResourcePack(pack)).toBe(false);
    });

    it("reports a pack with no pack.mcmeta at all as NOT legacy (reads as modern by design)", async () => {
        // this is exactly what a bare Minecraft client jar looks like — see
        // resourcepack-e2e.test.ts's Proof 4, "THE FINDING" comment
        const pack = await packWithFormat(undefined);
        expect(isLegacyResourcePack(pack)).toBe(false);
    });
});
