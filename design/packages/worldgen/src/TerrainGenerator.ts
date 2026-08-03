import {
    ALL_BIOMES,
    BEACH,
    DESERT,
    FOREST,
    OCEAN,
    PLAINS,
    SNOWY_PEAKS,
    SNOWY_PLAINS,
    STONY_PEAKS,
    TAIGA,
    type BiomeDefinition,
} from "./biomes.js";
import {
    AIR,
    ANDESITE,
    BEDROCK,
    BlockRegistry,
    CACTUS,
    CHISELED_STONE_BRICKS,
    COAL_ORE,
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
    GRANITE,
    IRON_ORE,
    MOSSY_COBBLESTONE,
    POPPY,
    SHORT_GRASS,
    SNOW_LAYER,
    STONE,
    STONE_BRICKS,
    WATER,
} from "./blocks.js";
import { ChunkData, blockIndex, columnIndex } from "./chunk.js";
import { ValueNoise2D, clamp, smoothStep } from "./noise.js";
import { Random, seedLane } from "./random.js";
import { BLOCKS_PER_SECTION, MAX_Y, MIN_SECTION, MIN_Y, SEA_LEVEL } from "./version.js";

/** the deepest an ocean floor may sink, which keeps the world below y=0 solid rock */
const MIN_TERRAIN_Y = 24;
/** the highest a peak may reach, leaving room for decoration under the build limit */
const MAX_TERRAIN_Y = 232;
/** how far above the terrain a decoration may reach; bounds the heightmap scan */
const MAX_DECORATION_HEIGHT = 20;

/** noise salts: distinct constants so the fields derived from one seed are independent */
const SALT_CONTINENT = 0x00c01a11;
const SALT_HILLS = 0x004111a5;
const SALT_MOUNTAIN = 0x00e27a1b;
const SALT_TEMPERATURE = 0x0077e3b9;
const SALT_HUMIDITY = 0x0031dd07;
const SALT_PATCH = 0x00594c3d;
const SALT_DECORATION = 0x00128f77;

/** the interned block-ids a biome needs while a column is being filled */
interface BiomeBlockIds {
    surface: number;
    filler: number;
    underwaterSurface: number;
}

/** one ore type and where it is allowed to appear */
interface OreVein {
    block: string;
    count: number;
    minY: number;
    maxY: number;
    size: number;
}

const ORE_VEINS: readonly OreVein[] = [
    { block: COAL_ORE, count: 14, minY: 8, maxY: 110, size: 9 },
    { block: IRON_ORE, count: 10, minY: 4, maxY: 90, size: 6 },
    { block: COPPER_ORE, count: 6, minY: 20, maxY: 90, size: 7 },
    { block: DEEPSLATE_COAL_ORE, count: 4, minY: -58, maxY: -6, size: 8 },
    { block: DEEPSLATE_IRON_ORE, count: 8, minY: -58, maxY: -2, size: 6 },
    { block: DEEPSLATE_REDSTONE_ORE, count: 6, minY: -58, maxY: -20, size: 5 },
    { block: DEEPSLATE_GOLD_ORE, count: 3, minY: -58, maxY: -24, size: 4 },
    { block: DEEPSLATE_DIAMOND_ORE, count: 2, minY: -58, maxY: -34, size: 3 },
];

/**
 * The terrain itself: a deterministic height-field, a biome per column, the block
 * column each of those produces, and the per-chunk decoration passes (ore blobs, trees,
 * plants and the occasional ruined pillar).
 *
 * Every value comes from the seed and the coordinates alone. Nothing here consults a
 * clock, a global random source, or the order chunks happen to be generated in, which
 * is what lets the same seed reproduce the same bytes.
 */
export class TerrainGenerator {
    readonly seed: number;
    readonly registry = new BlockRegistry();

    private readonly continentNoise: ValueNoise2D;
    private readonly hillNoise: ValueNoise2D;
    private readonly mountainNoise: ValueNoise2D;
    private readonly temperatureNoise: ValueNoise2D;
    private readonly humidityNoise: ValueNoise2D;
    private readonly patchNoise: ValueNoise2D;
    private readonly decorationLane: number;

    // interned block-ids used by the hot column loop
    private readonly idAir: number;
    private readonly idBedrock: number;
    private readonly idDeepslate: number;
    private readonly idStone: number;
    private readonly idGranite: number;
    private readonly idAndesite: number;
    private readonly idWater: number;
    private readonly idSnowLayer: number;

    private readonly biomeBlockIds = new Map<BiomeDefinition, BiomeBlockIds>();

    /** the identical rock sections below y=0, shared by every chunk */
    private readonly bottomSections: Uint16Array[];

    constructor(seed: number) {
        this.seed = seed;

        this.continentNoise = new ValueNoise2D(seed, SALT_CONTINENT);
        this.hillNoise = new ValueNoise2D(seed, SALT_HILLS);
        this.mountainNoise = new ValueNoise2D(seed, SALT_MOUNTAIN);
        this.temperatureNoise = new ValueNoise2D(seed, SALT_TEMPERATURE);
        this.humidityNoise = new ValueNoise2D(seed, SALT_HUMIDITY);
        this.patchNoise = new ValueNoise2D(seed, SALT_PATCH);
        this.decorationLane = seedLane(seed, SALT_DECORATION);

        this.idAir = this.registry.id(AIR);
        this.idBedrock = this.registry.id(BEDROCK);
        this.idDeepslate = this.registry.id(DEEPSLATE);
        this.idStone = this.registry.id(STONE);
        this.idGranite = this.registry.id(GRANITE);
        this.idAndesite = this.registry.id(ANDESITE);
        this.idWater = this.registry.id(WATER);
        this.idSnowLayer = this.registry.id(SNOW_LAYER);

        for (const biome of ALL_BIOMES) {
            this.biomeBlockIds.set(biome, {
                surface: this.registry.id(biome.surface),
                filler: this.registry.id(biome.filler),
                underwaterSurface: this.registry.id(biome.underwaterSurface),
            });
        }

        this.bottomSections = this.buildBottomSections();
    }

    /**
     * The four sections covering y = -64..-1. They are identical everywhere: a flat
     * bedrock floor at the very bottom, solid deepslate above it, because the terrain
     * never sinks below {@link MIN_TERRAIN_Y}. Building them once and sharing them
     * saves 65 million redundant block-writes over a 1000x1000 world.
     */
    private buildBottomSections(): Uint16Array[] {
        const sections: Uint16Array[] = [];
        for (let sectionY = MIN_SECTION; sectionY < 0; sectionY++) {
            const blocks = new Uint16Array(BLOCKS_PER_SECTION).fill(this.idDeepslate);
            if (sectionY === MIN_SECTION) {
                for (let z = 0; z < 16; z++) {
                    for (let x = 0; x < 16; x++) {
                        blocks[blockIndex(x, MIN_Y, z)] = this.idBedrock;
                    }
                }
            }
            sections.push(blocks);
        }
        return sections;
    }

    /**
     * The surface height of a column: the y of its topmost solid block.
     *
     * Three fields combine: a slow continent field deciding land from sea, a faster
     * hill field for local relief, and a ridged mountain field masked to the raised
     * interior of continents so ridges only appear where the land is already high.
     */
    terrainHeight(x: number, z: number): number {
        const continent = this.continentNoise.fbm(x / 380, z / 380, 4);
        const hills = this.hillNoise.fbm(x / 95, z / 95, 4);

        let height = SEA_LEVEL + (continent - 0.46) * 150;
        height += (hills - 0.5) * 22;

        const mountainMask = smoothStep(0.56, 0.78, continent);
        if (mountainMask > 0) {
            const mountains = this.mountainNoise.ridged(x / 260, z / 260, 4);
            height += mountainMask * mountains * 105;
        }

        return clamp(Math.round(height), MIN_TERRAIN_Y, MAX_TERRAIN_Y);
    }

    /** the biome of a column, given its already-computed height */
    biomeAt(x: number, z: number, height: number): BiomeDefinition {
        if (height < SEA_LEVEL - 2) return OCEAN;
        if (height <= SEA_LEVEL + 2) return BEACH;

        const humidity = this.humidityNoise.fbm(x / 430, z / 430, 3);
        // altitude cools: the same climate reads as taiga at y=140 and plains at y=70
        const temperature =
            this.temperatureNoise.fbm(x / 620, z / 620, 3) -
            smoothStep(95, 175, height) * 0.42 -
            smoothStep(150, 230, height) * 0.2;

        if (height > 150) return temperature < 0.3 ? SNOWY_PEAKS : STONY_PEAKS;
        if (temperature < 0.29) return SNOWY_PLAINS;
        if (temperature < 0.4) return TAIGA;
        if (temperature > 0.58 && humidity < 0.44) return DESERT;
        if (humidity > 0.53) return FOREST;
        return PLAINS;
    }

    /** generates one complete chunk: terrain, biomes, decoration and heightmaps */
    generateChunk(chunkX: number, chunkZ: number): ChunkData {
        const chunk = new ChunkData(chunkX, chunkZ, this.registry);

        for (let sectionY = MIN_SECTION; sectionY < 0; sectionY++) {
            chunk.setSharedSection(sectionY, this.bottomSections[sectionY - MIN_SECTION]!);
        }

        const heights = new Int32Array(256);
        const biomes = new Array<BiomeDefinition>(256);

        const baseX = chunkX << 4;
        const baseZ = chunkZ << 4;

        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const worldX = baseX + x;
                const worldZ = baseZ + z;
                const height = this.terrainHeight(worldX, worldZ);
                const index = columnIndex(x, z);
                heights[index] = height;
                biomes[index] = this.biomeAt(worldX, worldZ, height);
            }
        }

        // biomes are stored at vanilla's 4x4 resolution; each cell takes the biome of
        // the column at its centre
        for (let bz = 0; bz < 4; bz++) {
            for (let bx = 0; bx < 4; bx++) {
                chunk.biomeCells[bz * 4 + bx] = biomes[columnIndex(bx * 4 + 2, bz * 4 + 2)]!;
            }
        }

        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const index = columnIndex(x, z);
                this.fillColumn(chunk, x, z, baseX + x, baseZ + z, heights[index]!, biomes[index]!);
            }
        }

        this.decorate(chunk, heights, biomes);
        this.computeHeightmaps(chunk, heights);

        return chunk;
    }

    /** writes one column of blocks from y=0 up to the water surface or the terrain top */
    private fillColumn(
        chunk: ChunkData,
        localX: number,
        localZ: number,
        worldX: number,
        worldZ: number,
        height: number,
        biome: BiomeDefinition,
    ): void {
        const ids = this.biomeBlockIds.get(biome)!;
        const flooded = height < SEA_LEVEL;
        const fillerStart = height - biome.fillerDepth;

        // stone-variant patches, sampled once per column: cheap, and enough to break up
        // the otherwise uniform grey of an exposed mountainside
        const patch = this.patchNoise.sample(worldX / 34, worldZ / 34);
        const variantId =
            patch > 0.78 ? this.idGranite : patch < 0.2 ? this.idAndesite : this.idStone;

        const top = flooded ? SEA_LEVEL : height;
        let section: Uint16Array | null = null;
        let sectionY = 0x7fffffff;

        for (let y = 0; y <= top; y++) {
            let id: number;
            if (y < fillerStart) id = variantId;
            else if (y < height) id = ids.filler;
            else if (y === height) id = flooded ? ids.underwaterSurface : ids.surface;
            else id = this.idWater;

            const currentSectionY = y >> 4;
            if (currentSectionY !== sectionY) {
                sectionY = currentSectionY;
                section = chunk.sectionForWrite(sectionY);
            }
            section![blockIndex(localX, y, localZ)] = id;
        }

        if (!flooded && biome.snowCover && height < MAX_Y) {
            chunk.setBlock(localX, height + 1, localZ, this.idSnowLayer);
        }
    }

    /** ore blobs, trees, plants and the occasional ruined pillar */
    private decorate(
        chunk: ChunkData,
        heights: Int32Array,
        biomes: readonly BiomeDefinition[],
    ): void {
        const chunkLane =
            this.decorationLane ^
            Math.imul(chunk.chunkX, 0x9e3779b9) ^
            Math.imul(chunk.chunkZ, 0x85ebca6b);
        const random = new Random(chunkLane);

        this.placeOres(chunk, random, heights);

        // Trees and plants follow the biome of the chunk's centre column, and are kept
        // far enough from the chunk border that a canopy never reaches into a
        // neighbouring chunk. That is the one deliberate simplification against vanilla
        // worldgen, and it is what keeps every chunk independently generatable.
        const centreBiome = biomes[columnIndex(8, 8)]!;

        const tree = centreBiome.tree;
        if (tree !== null) {
            const treeCount = this.countFor(centreBiome.treesPerChunk, random);
            const logId = this.registry.id(tree.log);
            const leavesId = this.registry.id(tree.leaves);
            for (let i = 0; i < treeCount; i++) {
                const localX = random.nextRange(3, 12);
                const localZ = random.nextRange(3, 12);
                const index = columnIndex(localX, localZ);
                const ground = heights[index]!;
                if (ground <= SEA_LEVEL) continue;
                if (biomes[index] !== centreBiome) continue;
                this.placeTree(chunk, localX, localZ, ground, random, logId, leavesId);
            }
        }

        const plantCount = this.countFor(centreBiome.plantsPerChunk, random);
        for (let i = 0; i < plantCount; i++) {
            const localX = random.nextInt(16);
            const localZ = random.nextInt(16);
            const ground = heights[columnIndex(localX, localZ)]!;
            if (ground <= SEA_LEVEL || ground >= MAX_Y) continue;
            if (chunk.getBlockId(localX, ground + 1, localZ) !== this.idAir) continue;
            const roll = random.nextInt(10);
            const plant = roll < 6 ? SHORT_GRASS : roll < 8 ? POPPY : DANDELION;
            chunk.setBlock(localX, ground + 1, localZ, this.registry.id(plant));
        }

        const cactusCount = this.countFor(centreBiome.cactiPerChunk, random);
        for (let i = 0; i < cactusCount; i++) {
            const localX = random.nextRange(1, 14);
            const localZ = random.nextRange(1, 14);
            const ground = heights[columnIndex(localX, localZ)]!;
            if (ground <= SEA_LEVEL || ground >= MAX_Y - 4) continue;
            if (chunk.getBlockId(localX, ground + 1, localZ) !== this.idAir) continue;
            const cactusId = this.registry.id(CACTUS);
            const cactusHeight = random.nextRange(1, 3);
            for (let dy = 1; dy <= cactusHeight; dy++) {
                chunk.setBlock(localX, ground + dy, localZ, cactusId);
            }
        }

        if (centreBiome === DESERT && random.chance(0.35)) {
            const localX = random.nextRange(2, 13);
            const localZ = random.nextRange(2, 13);
            const ground = heights[columnIndex(localX, localZ)]!;
            if (ground > SEA_LEVEL && ground < MAX_Y - 4) {
                chunk.setBlock(localX, ground + 1, localZ, this.registry.id(DEAD_BUSH));
            }
        }

        // a rare ruined pillar: the only man-made structure here, and the reason a
        // rendered tile has something with a hard straight edge in it
        if (random.chance(0.03)) this.placePillar(chunk, random, heights);
    }

    /** turns an expected count per chunk into an actual count for this chunk */
    private countFor(expected: number, random: Random): number {
        const whole = Math.floor(expected);
        const remainder = expected - whole;
        return whole + (remainder > 0 && random.chance(remainder) ? 1 : 0);
    }

    private placeOres(chunk: ChunkData, random: Random, heights: Int32Array): void {
        let lowestSurface = heights[0]!;
        for (let i = 1; i < heights.length; i++) {
            if (heights[i]! < lowestSurface) lowestSurface = heights[i]!;
        }

        for (const vein of ORE_VEINS) {
            const maxY = Math.min(vein.maxY, lowestSurface - 3);
            if (maxY <= vein.minY) continue;
            const oreId = this.registry.id(vein.block);

            for (let i = 0; i < vein.count; i++) {
                let x = random.nextInt(16);
                let y = random.nextRange(vein.minY, maxY);
                let z = random.nextInt(16);

                for (let n = 0; n < vein.size; n++) {
                    const existing = chunk.getBlockId(x, y, z);
                    if (
                        existing === this.idStone ||
                        existing === this.idDeepslate ||
                        existing === this.idGranite ||
                        existing === this.idAndesite
                    ) {
                        chunk.setBlock(x, y, z, oreId);
                    }
                    // random walk, clamped inside the chunk and off the bedrock floor
                    x = clamp(x + random.nextRange(-1, 1), 0, 15);
                    z = clamp(z + random.nextRange(-1, 1), 0, 15);
                    y = clamp(y + random.nextRange(-1, 1), MIN_Y + 2, maxY);
                }
            }
        }
    }

    private placeTree(
        chunk: ChunkData,
        localX: number,
        localZ: number,
        ground: number,
        random: Random,
        logId: number,
        leavesId: number,
    ): void {
        const trunkHeight = random.nextRange(4, 6);
        if (ground + trunkHeight + 1 > MAX_Y) return;

        // canopy first, so the trunk overwrites any leaf that lands on it
        for (let dy = trunkHeight - 2; dy <= trunkHeight; dy++) {
            const radius = dy >= trunkHeight ? 1 : 2;
            for (let dz = -radius; dz <= radius; dz++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (radius > 1 && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
                    const x = localX + dx;
                    const z = localZ + dz;
                    if (x < 0 || x > 15 || z < 0 || z > 15) continue;
                    const y = ground + dy;
                    if (chunk.getBlockId(x, y, z) === this.idAir) chunk.setBlock(x, y, z, leavesId);
                }
            }
        }
        chunk.setBlock(localX, ground + trunkHeight + 1, localZ, leavesId);

        for (let dy = 1; dy <= trunkHeight; dy++) {
            chunk.setBlock(localX, ground + dy, localZ, logId);
        }
    }

    private placePillar(chunk: ChunkData, random: Random, heights: Int32Array): void {
        const localX = random.nextRange(2, 13);
        const localZ = random.nextRange(2, 13);
        const ground = heights[columnIndex(localX, localZ)]!;
        if (ground <= SEA_LEVEL + 1 || ground > MAX_Y - MAX_DECORATION_HEIGHT) return;

        const bricksId = this.registry.id(STONE_BRICKS);
        const crackedId = this.registry.id(CRACKED_STONE_BRICKS);
        const chiseledId = this.registry.id(CHISELED_STONE_BRICKS);
        const cobbleId = this.registry.id(COBBLESTONE);
        const mossyId = this.registry.id(MOSSY_COBBLESTONE);

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const block = random.chance(0.3) ? mossyId : cobbleId;
                chunk.setBlock(localX + dx, ground, localZ + dz, block);
            }
        }

        const pillarHeight = random.nextRange(5, 11);
        for (let dy = 1; dy <= pillarHeight; dy++) {
            const block = random.chance(0.25)
                ? crackedId
                : dy === pillarHeight
                  ? chiseledId
                  : bricksId;
            chunk.setBlock(localX, ground + dy, localZ, block);
        }
    }

    /**
     * Fills in the surface and ocean-floor heights of every column.
     *
     * The scan starts just above whatever a decoration could have reached rather than
     * at the top of the world, so a chunk containing one tall peak does not pay for a
     * 300-block scan on all 256 of its columns.
     */
    private computeHeightmaps(chunk: ChunkData, heights: Int32Array): void {
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const index = columnIndex(x, z);
                const scanTop = Math.min(
                    MAX_Y,
                    Math.max(heights[index]!, SEA_LEVEL) + MAX_DECORATION_HEIGHT,
                );

                let surface = MIN_Y - 1;
                let floor = MIN_Y - 1;

                let section: Uint16Array | null = null;
                let sectionY = 0x7fffffff;

                for (let y = scanTop; y >= MIN_Y; y--) {
                    const currentSectionY = y >> 4;
                    if (currentSectionY !== sectionY) {
                        sectionY = currentSectionY;
                        section = chunk.section(sectionY);
                    }
                    if (section === null) continue;

                    const id = section[blockIndex(x, y, z)]!;
                    if (id === this.idAir) continue;
                    if (surface < MIN_Y) surface = y;
                    if (id !== this.idWater) {
                        floor = y;
                        break;
                    }
                }

                chunk.surfaceY[index] = surface;
                chunk.floorY[index] = floor;
            }
        }
    }
}
