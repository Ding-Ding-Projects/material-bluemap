/**
 * The block palette of the generated world.
 *
 * Every entry is a real vanilla block-state written in the usual
 * `namespace:id[property=value,...]` notation. Blocks are handed around as small
 * integer ids so a chunk's 4096-block sections can live in a Uint16Array; the string
 * form is only needed again when a section's NBT palette is written.
 */

/** a parsed block-state: the block id plus its (possibly empty) properties */
export interface ParsedBlockState {
    name: string;
    properties: readonly (readonly [string, string])[];
}

const BLOCK_STATE_PATTERN = /^([^[\]]+?)(?:\[(.*)\])?$/;

/** parses `minecraft:grass_block[snowy=false]` into its id and property pairs */
export function parseBlockState(blockState: string): ParsedBlockState {
    const match = BLOCK_STATE_PATTERN.exec(blockState);
    if (match === null) throw new Error("Not a valid block-state: '" + blockState + "'");

    const name = match[1]!;
    const propertyPart = match[2];
    if (propertyPart === undefined || propertyPart === "") return { name, properties: [] };

    const properties: [string, string][] = [];
    for (const entry of propertyPart.split(",")) {
        const separator = entry.indexOf("=");
        if (separator < 0)
            throw new Error(
                "Not a valid block-state property '" + entry + "' in '" + blockState + "'",
            );
        properties.push([entry.substring(0, separator), entry.substring(separator + 1)]);
    }
    return { name, properties };
}

/**
 * Interns block-state strings into dense integer ids. Id 0 is always
 * `minecraft:air`, which lets an untouched section be recognized as empty.
 */
export class BlockRegistry {
    private readonly ids = new Map<string, number>();
    private readonly blockStates: string[] = [];

    constructor() {
        this.id(AIR);
    }

    /** the id of the given block-state, registering it on first use */
    id(blockState: string): number {
        const existing = this.ids.get(blockState);
        if (existing !== undefined) return existing;

        const id = this.blockStates.length;
        if (id > 0xffff) throw new Error("Block-registry overflow: more than 65536 block-states");
        this.blockStates.push(blockState);
        this.ids.set(blockState, id);
        return id;
    }

    /** the block-state string behind an id */
    blockState(id: number): string {
        const blockState = this.blockStates[id];
        if (blockState === undefined) throw new Error("Unknown block-id: " + id);
        return blockState;
    }

    get size(): number {
        return this.blockStates.length;
    }
}

export const AIR = "minecraft:air";
export const BEDROCK = "minecraft:bedrock";
export const DEEPSLATE = "minecraft:deepslate[axis=y]";
export const STONE = "minecraft:stone";
export const GRANITE = "minecraft:granite";
export const ANDESITE = "minecraft:andesite";
export const DIRT = "minecraft:dirt";
export const COARSE_DIRT = "minecraft:coarse_dirt";
export const GRASS_BLOCK = "minecraft:grass_block[snowy=false]";
export const GRASS_BLOCK_SNOWY = "minecraft:grass_block[snowy=true]";
export const PODZOL = "minecraft:podzol[snowy=false]";
export const SNOW_LAYER = "minecraft:snow[layers=1]";
export const SNOW_BLOCK = "minecraft:snow_block";
export const SAND = "minecraft:sand";
export const SANDSTONE = "minecraft:sandstone";
export const GRAVEL = "minecraft:gravel";
export const CLAY = "minecraft:clay";
export const WATER = "minecraft:water[level=0]";
export const ICE = "minecraft:ice";

export const OAK_LOG = "minecraft:oak_log[axis=y]";
export const OAK_LEAVES = "minecraft:oak_leaves[distance=1,persistent=false,waterlogged=false]";
export const BIRCH_LOG = "minecraft:birch_log[axis=y]";
export const BIRCH_LEAVES = "minecraft:birch_leaves[distance=1,persistent=false,waterlogged=false]";
export const SPRUCE_LOG = "minecraft:spruce_log[axis=y]";
export const SPRUCE_LEAVES =
    "minecraft:spruce_leaves[distance=1,persistent=false,waterlogged=false]";

export const SHORT_GRASS = "minecraft:short_grass";
export const POPPY = "minecraft:poppy";
export const DANDELION = "minecraft:dandelion";
export const DEAD_BUSH = "minecraft:dead_bush";
export const CACTUS = "minecraft:cactus[age=0]";

export const COBBLESTONE = "minecraft:cobblestone";
export const MOSSY_COBBLESTONE = "minecraft:mossy_cobblestone";
export const STONE_BRICKS = "minecraft:stone_bricks";
export const CRACKED_STONE_BRICKS = "minecraft:cracked_stone_bricks";
export const CHISELED_STONE_BRICKS = "minecraft:chiseled_stone_bricks";

export const COAL_ORE = "minecraft:coal_ore";
export const IRON_ORE = "minecraft:iron_ore";
export const COPPER_ORE = "minecraft:copper_ore";
export const DEEPSLATE_COAL_ORE = "minecraft:deepslate_coal_ore";
export const DEEPSLATE_IRON_ORE = "minecraft:deepslate_iron_ore";
export const DEEPSLATE_GOLD_ORE = "minecraft:deepslate_gold_ore";
export const DEEPSLATE_DIAMOND_ORE = "minecraft:deepslate_diamond_ore";
export const DEEPSLATE_REDSTONE_ORE = "minecraft:deepslate_redstone_ore[lit=false]";
