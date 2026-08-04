import {
    AIR,
    ANDESITE,
    BEDROCK,
    BIRCH_LEAVES,
    BIRCH_LOG,
    CACTUS,
    CHISELED_STONE_BRICKS,
    CLAY,
    COAL_ORE,
    COARSE_DIRT,
    COBBLESTONE,
    COPPER_ORE,
    CRACKED_STONE_BRICKS,
    DANDELION,
    DEAD_BUSH,
    DEEPSLATE,
    DEEPSLATE_COAL_ORE,
    DEEPSLATE_DIAMOND_ORE,
    DEEPSLATE_GOLD_ORE,
    DEEPSLATE_IRON_ORE,
    DEEPSLATE_REDSTONE_ORE,
    DIRT,
    GRANITE,
    GRASS_BLOCK,
    GRASS_BLOCK_SNOWY,
    GRAVEL,
    ICE,
    IRON_ORE,
    MOSSY_COBBLESTONE,
    OAK_LEAVES,
    OAK_LOG,
    PODZOL,
    POPPY,
    SAND,
    SANDSTONE,
    SHORT_GRASS,
    SNOW_BLOCK,
    SNOW_LAYER,
    SPRUCE_LEAVES,
    SPRUCE_LOG,
    STONE,
    STONE_BRICKS,
    WATER,
} from "./blocks.js";

/**
 * The pre-flattening identity of one block: the numeric id that goes into a section's
 * `Blocks` (and, above 255, `Add`) array and the 4-bit metadata that goes into its
 * `Data` array.
 *
 * Both halves matter and neither is optional. 1.12.2 had 256 usable block ids and four
 * bits of metadata to distinguish everything within one — every stone variant, every
 * wood species, every leaf type. `1:0` and `1:5` are not two spellings of one entry in
 * this table, they are stone and andesite, and getting the meta wrong is the easiest
 * possible way to write a world that decodes into confident nonsense.
 */
export interface LegacyBlock {
    /** the numeric block id (0..4095; ids above 255 need the section's `Add` nibbles) */
    readonly id: number;
    /** the 4-bit metadata (0..15) */
    readonly meta: number;
    /**
     * Set when 1.12.2 has no block corresponding to the modern one and an era-appropriate
     * stand-in was written instead. Never a silent swap: the writer counts every
     * substitution it makes, so a render that looks wrong can be checked against the list
     * of blocks that were never going to survive the trip.
     */
    readonly substituteFor?: string;
}

function block(id: number, meta = 0): LegacyBlock {
    return { id, meta };
}

function substitute(id: number, meta: number, substituteFor: string): LegacyBlock {
    return { id, meta, substituteFor };
}

/**
 * Every block-state this generator can place, in its 1.12.2 spelling.
 *
 * The table is deliberately total rather than best-effort. A generator that silently
 * dropped an unmapped block to air would produce a world that renders, looks plausible,
 * and is quietly missing whatever it could not express — which is exactly the failure a
 * legacy-format proof exists to rule out. {@link legacyBlockFor} therefore throws on an
 * unmapped state, and every deliberate approximation carries `substituteFor` so it can be
 * counted and reported instead of hidden.
 *
 * The three groups of approximation, and why each one is unavoidable:
 *
 *  - **Deepslate and its ores.** Deepslate arrived in 1.17. Everything the generator
 *    makes of it lives below y=0, which a 1.12.2 world does not have at all, so these
 *    entries are unreachable in practice; they exist so the table stays total and so a
 *    later change to the ore ranges fails loudly rather than mysteriously.
 *  - **Copper ore.** Also 1.17, but unlike deepslate its vein range (y 20..90) genuinely
 *    overlaps the legacy world. It is written as gold ore: the same "uncommon metal in
 *    stone" role, present in 1.12.2, and buried out of sight either way.
 *  - **`grass_block[snowy=true]`.** 1.12.2 had no `snowy` property at all. The snowiness
 *    of a grass block was *derived at render time* from whatever sat on top of it, which
 *    is precisely what `SnowyBlockStateExtension` in this project's reader still does.
 *    Writing plain `2:0` and letting the extension put the property back is therefore not
 *    a loss — it is the round trip the legacy extensions exist for, and one of the more
 *    interesting things a generated legacy world can prove.
 *
 * One rename is worth knowing before reading a decoded legacy chunk: 1.12.2's
 * `minecraft:grass` is the grass *block*, and the grass *tuft* that modern versions call
 * `minecraft:short_grass` was `minecraft:tallgrass` (id 31, meta 1). The two names
 * effectively swapped meaning at the flattening.
 */
export const LEGACY_BLOCKS: ReadonlyMap<string, LegacyBlock> = new Map<string, LegacyBlock>([
    [AIR, block(0)],
    [BEDROCK, block(7)],
    [STONE, block(1, 0)],
    [GRANITE, block(1, 1)],
    [ANDESITE, block(1, 5)],
    [DIRT, block(3, 0)],
    [COARSE_DIRT, block(3, 1)],
    [PODZOL, block(3, 2)],
    [GRASS_BLOCK, block(2, 0)],
    [
        GRASS_BLOCK_SNOWY,
        substitute(2, 0, "grass_block[snowy=true] (1.12.2 derives `snowy` at render time)"),
    ],
    [SNOW_LAYER, block(78, 0)],
    [SNOW_BLOCK, block(80, 0)],
    [SAND, block(12, 0)],
    [SANDSTONE, block(24, 0)],
    [GRAVEL, block(13, 0)],
    [CLAY, block(82, 0)],
    // 8 is flowing water and 9 is still water; a generated sea is still
    [WATER, block(9, 0)],
    [ICE, block(79, 0)],

    // 17 is `log`: meta 0 oak, 1 spruce, 2 birch (bits 2-3 carry the axis, 0 = y)
    [OAK_LOG, block(17, 0)],
    [SPRUCE_LOG, block(17, 1)],
    [BIRCH_LOG, block(17, 2)],
    // 18 is `leaves`, same species numbering
    [OAK_LEAVES, block(18, 0)],
    [SPRUCE_LEAVES, block(18, 1)],
    [BIRCH_LEAVES, block(18, 2)],

    // 31 is `tallgrass`: meta 0 dead shrub, 1 grass tuft, 2 fern
    [SHORT_GRASS, block(31, 1)],
    [POPPY, block(38, 0)],
    [DANDELION, block(37, 0)],
    [DEAD_BUSH, block(32, 0)],
    [CACTUS, block(81, 0)],

    [COBBLESTONE, block(4, 0)],
    [MOSSY_COBBLESTONE, block(48, 0)],
    // 98 is `stonebrick`: meta 0 plain, 1 mossy, 2 cracked, 3 chiseled
    [STONE_BRICKS, block(98, 0)],
    [CRACKED_STONE_BRICKS, block(98, 2)],
    [CHISELED_STONE_BRICKS, block(98, 3)],

    [COAL_ORE, block(16, 0)],
    [IRON_ORE, block(15, 0)],
    [COPPER_ORE, substitute(14, 0, COPPER_ORE)],

    [DEEPSLATE, substitute(1, 0, DEEPSLATE)],
    [DEEPSLATE_COAL_ORE, substitute(16, 0, DEEPSLATE_COAL_ORE)],
    [DEEPSLATE_IRON_ORE, substitute(15, 0, DEEPSLATE_IRON_ORE)],
    [DEEPSLATE_GOLD_ORE, substitute(14, 0, DEEPSLATE_GOLD_ORE)],
    [DEEPSLATE_DIAMOND_ORE, substitute(56, 0, DEEPSLATE_DIAMOND_ORE)],
    [DEEPSLATE_REDSTONE_ORE, substitute(73, 0, DEEPSLATE_REDSTONE_ORE)],
]);

/** the 1.12.2 numeric id and meta of a block-state; throws rather than guessing */
export function legacyBlockFor(blockState: string): LegacyBlock {
    const legacy = LEGACY_BLOCKS.get(blockState);
    if (legacy === undefined)
        throw new Error(
            "No 1.12.2 mapping for block-state '" +
                blockState +
                "'. Add it to LEGACY_BLOCKS (with `substitute` when 1.12.2 has no such " +
                "block) rather than letting the legacy world quietly lose it.",
        );
    return legacy;
}

/**
 * The 1.12.2 numeric biome id of each biome this generator places, keyed by the modern
 * biome key it writes in the 1.20.4 format.
 *
 * A 1.12.2 chunk stores biomes as a flat `byte[256]` — one id per column, no vertical
 * resolution and no palette — and the reader turns that byte back into a biome through
 * the bundled legacy biome table (`LegacyBiomes`, extracted from BlueMap v0.10.3's own
 * config). So these ids are not decoration: an id with no entry in that table falls
 * through to `Biome.DEFAULT`, and the whole column then renders with default grass,
 * foliage and water colours instead of its own.
 *
 * Two of the generator's biomes postdate 1.12.2 and take the nearest ancestor of what
 * replaced them: `stony_peaks` and `jagged_peaks` are both 1.18 splits of the old
 * extreme-hills family, so they become `mountains` (3) and `snowy_mountains` (13).
 * `snowy_plains` is a straight rename of `snowy_tundra` (12) and loses nothing.
 */
export const LEGACY_BIOME_IDS: ReadonlyMap<string, number> = new Map<string, number>([
    ["minecraft:ocean", 0],
    ["minecraft:plains", 1],
    ["minecraft:desert", 2],
    ["minecraft:forest", 4],
    ["minecraft:taiga", 5],
    ["minecraft:beach", 16],
    ["minecraft:snowy_plains", 12],
    ["minecraft:stony_peaks", 3],
    ["minecraft:jagged_peaks", 13],
]);

/** the 1.12.2 numeric biome id for a modern biome key; throws rather than guessing */
export function legacyBiomeFor(biomeKey: string): number {
    const id = LEGACY_BIOME_IDS.get(biomeKey);
    if (id === undefined)
        throw new Error(
            "No 1.12.2 biome id for '" +
                biomeKey +
                "'. Add it to LEGACY_BIOME_IDS; an unmapped id renders as the default " +
                "biome rather than failing, which is a worse outcome than failing here.",
        );
    return id;
}
