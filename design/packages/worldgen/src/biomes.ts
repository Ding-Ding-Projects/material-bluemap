import { Key } from "@worldlens/shared";
import {
    BIRCH_LEAVES,
    BIRCH_LOG,
    CLAY,
    COARSE_DIRT,
    DIRT,
    GRASS_BLOCK,
    GRASS_BLOCK_SNOWY,
    GRAVEL,
    OAK_LEAVES,
    OAK_LOG,
    PODZOL,
    SAND,
    SANDSTONE,
    SNOW_BLOCK,
    SPRUCE_LEAVES,
    SPRUCE_LOG,
    STONE,
} from "./blocks.js";

/** what a biome contributes to a column and to the decoration passes */
export interface BiomeDefinition {
    /** the vanilla biome id written into the section biome-palette */
    readonly key: Key;
    /** the single block at the top of a land column */
    readonly surface: string;
    /** the blocks directly below the surface (top-down), before stone takes over */
    readonly filler: string;
    /** how many blocks of filler sit under the surface */
    readonly fillerDepth: number;
    /** the block replacing the surface where the column is under water */
    readonly underwaterSurface: string;
    /** expected number of trees per chunk (fractional: the remainder is a chance) */
    readonly treesPerChunk: number;
    /** log/leaves used by this biome's trees, null when it grows none */
    readonly tree: { readonly log: string; readonly leaves: string } | null;
    /** expected number of ground-cover plants (grass tufts, flowers) per chunk */
    readonly plantsPerChunk: number;
    /** expected number of cacti per chunk */
    readonly cactiPerChunk: number;
    /** true when a snow layer is placed on top of the surface block */
    readonly snowCover: boolean;
}

function biome(key: string, definition: Omit<BiomeDefinition, "key">): BiomeDefinition {
    return { key: Key.parse(key, Key.MINECRAFT_NAMESPACE), ...definition };
}

export const OCEAN: BiomeDefinition = biome("minecraft:ocean", {
    surface: GRAVEL,
    filler: GRAVEL,
    fillerDepth: 2,
    underwaterSurface: GRAVEL,
    treesPerChunk: 0,
    tree: null,
    plantsPerChunk: 0,
    cactiPerChunk: 0,
    snowCover: false,
});

export const BEACH: BiomeDefinition = biome("minecraft:beach", {
    surface: SAND,
    filler: SANDSTONE,
    fillerDepth: 3,
    underwaterSurface: SAND,
    treesPerChunk: 0,
    tree: null,
    plantsPerChunk: 0,
    cactiPerChunk: 0,
    snowCover: false,
});

export const DESERT: BiomeDefinition = biome("minecraft:desert", {
    surface: SAND,
    filler: SANDSTONE,
    fillerDepth: 5,
    underwaterSurface: SAND,
    treesPerChunk: 0,
    tree: null,
    plantsPerChunk: 0.4,
    cactiPerChunk: 1.5,
    snowCover: false,
});

export const PLAINS: BiomeDefinition = biome("minecraft:plains", {
    surface: GRASS_BLOCK,
    filler: DIRT,
    fillerDepth: 3,
    underwaterSurface: CLAY,
    treesPerChunk: 0.4,
    tree: { log: OAK_LOG, leaves: OAK_LEAVES },
    plantsPerChunk: 6,
    cactiPerChunk: 0,
    snowCover: false,
});

export const FOREST: BiomeDefinition = biome("minecraft:forest", {
    surface: GRASS_BLOCK,
    filler: DIRT,
    fillerDepth: 3,
    underwaterSurface: CLAY,
    treesPerChunk: 7,
    tree: { log: BIRCH_LOG, leaves: BIRCH_LEAVES },
    plantsPerChunk: 4,
    cactiPerChunk: 0,
    snowCover: false,
});

export const TAIGA: BiomeDefinition = biome("minecraft:taiga", {
    surface: PODZOL,
    filler: DIRT,
    fillerDepth: 3,
    underwaterSurface: GRAVEL,
    treesPerChunk: 6,
    tree: { log: SPRUCE_LOG, leaves: SPRUCE_LEAVES },
    plantsPerChunk: 2,
    cactiPerChunk: 0,
    snowCover: false,
});

export const SNOWY_PLAINS: BiomeDefinition = biome("minecraft:snowy_plains", {
    surface: GRASS_BLOCK_SNOWY,
    filler: DIRT,
    fillerDepth: 3,
    underwaterSurface: GRAVEL,
    treesPerChunk: 0.5,
    tree: { log: SPRUCE_LOG, leaves: SPRUCE_LEAVES },
    plantsPerChunk: 0,
    cactiPerChunk: 0,
    snowCover: true,
});

export const STONY_PEAKS: BiomeDefinition = biome("minecraft:stony_peaks", {
    surface: STONE,
    filler: COARSE_DIRT,
    fillerDepth: 1,
    underwaterSurface: STONE,
    treesPerChunk: 0,
    tree: null,
    plantsPerChunk: 0,
    cactiPerChunk: 0,
    snowCover: false,
});

export const SNOWY_PEAKS: BiomeDefinition = biome("minecraft:jagged_peaks", {
    surface: SNOW_BLOCK,
    filler: STONE,
    fillerDepth: 2,
    underwaterSurface: STONE,
    treesPerChunk: 0,
    tree: null,
    plantsPerChunk: 0,
    cactiPerChunk: 0,
    snowCover: false,
});

/** every biome the generator can place, in a stable order */
export const ALL_BIOMES: readonly BiomeDefinition[] = [
    OCEAN,
    BEACH,
    DESERT,
    PLAINS,
    FOREST,
    TAIGA,
    SNOWY_PLAINS,
    STONY_PEAKS,
    SNOWY_PEAKS,
];
