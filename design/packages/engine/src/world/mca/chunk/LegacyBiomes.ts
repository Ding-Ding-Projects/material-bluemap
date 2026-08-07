import { Key } from "@worldlens/shared";
import type { Biome } from "../../biome/Biome.js";
import type { DataPack } from "../../../resources/pack/datapack/DataPack.js";

const BIOME_KEYS: (Key | null)[] = new Array<Key | null>(170).fill(null);
BIOME_KEYS[0] = Key.minecraft("ocean");
BIOME_KEYS[1] = Key.minecraft("plains");
BIOME_KEYS[2] = Key.minecraft("desert");
BIOME_KEYS[3] = Key.minecraft("mountains");
BIOME_KEYS[4] = Key.minecraft("forest");
BIOME_KEYS[5] = Key.minecraft("taiga");
BIOME_KEYS[6] = Key.minecraft("swamp");
BIOME_KEYS[7] = Key.minecraft("river");
BIOME_KEYS[8] = Key.minecraft("nether");
BIOME_KEYS[9] = Key.minecraft("the_end");
BIOME_KEYS[10] = Key.minecraft("frozen_ocean");
BIOME_KEYS[11] = Key.minecraft("frozen_river");
BIOME_KEYS[12] = Key.minecraft("snowy_tundra");
BIOME_KEYS[13] = Key.minecraft("snowy_mountains");
BIOME_KEYS[14] = Key.minecraft("mushroom_fields");
BIOME_KEYS[15] = Key.minecraft("mushroom_field_shore");
BIOME_KEYS[16] = Key.minecraft("beach");
BIOME_KEYS[17] = Key.minecraft("desert_hills");
BIOME_KEYS[18] = Key.minecraft("wooded_hills");
BIOME_KEYS[19] = Key.minecraft("taiga_hills");
BIOME_KEYS[20] = Key.minecraft("mountain_edge");
BIOME_KEYS[21] = Key.minecraft("jungle");
BIOME_KEYS[22] = Key.minecraft("jungle_hills");
BIOME_KEYS[23] = Key.minecraft("jungle_edge");
BIOME_KEYS[24] = Key.minecraft("deep_ocean");
BIOME_KEYS[25] = Key.minecraft("stone_shore");
BIOME_KEYS[26] = Key.minecraft("snowy_beach");
BIOME_KEYS[27] = Key.minecraft("birch_forest");
BIOME_KEYS[28] = Key.minecraft("birch_forest_hills");
BIOME_KEYS[29] = Key.minecraft("dark_forest");
BIOME_KEYS[30] = Key.minecraft("snowy_taiga");
BIOME_KEYS[31] = Key.minecraft("snowy_taiga_hills");
BIOME_KEYS[32] = Key.minecraft("giant_tree_taiga");
BIOME_KEYS[33] = Key.minecraft("giant_tree_taiga_hills");
BIOME_KEYS[34] = Key.minecraft("wooded_mountains");
BIOME_KEYS[35] = Key.minecraft("savanna");
BIOME_KEYS[36] = Key.minecraft("savanna_plateau");
BIOME_KEYS[37] = Key.minecraft("badlands");
BIOME_KEYS[38] = Key.minecraft("wooded_badlands_plateau");
BIOME_KEYS[39] = Key.minecraft("badlands_plateau");
BIOME_KEYS[40] = Key.minecraft("small_end_islands");
BIOME_KEYS[41] = Key.minecraft("end_midlands");
BIOME_KEYS[42] = Key.minecraft("end_highlands");
BIOME_KEYS[43] = Key.minecraft("end_barrens");
BIOME_KEYS[44] = Key.minecraft("warm_ocean");
BIOME_KEYS[45] = Key.minecraft("lukewarm_ocean");
BIOME_KEYS[46] = Key.minecraft("cold_ocean");
BIOME_KEYS[47] = Key.minecraft("deep_warm_ocean");
BIOME_KEYS[48] = Key.minecraft("deep_lukewarm_ocean");
BIOME_KEYS[49] = Key.minecraft("deep_cold_ocean");
BIOME_KEYS[50] = Key.minecraft("deep_frozen_ocean");
BIOME_KEYS[127] = Key.minecraft("the_void");
BIOME_KEYS[129] = Key.minecraft("sunflower_plains");
BIOME_KEYS[130] = Key.minecraft("desert_lakes");
BIOME_KEYS[131] = Key.minecraft("gravelly_mountains");
BIOME_KEYS[132] = Key.minecraft("flower_forest");
BIOME_KEYS[133] = Key.minecraft("taiga_mountains");
BIOME_KEYS[134] = Key.minecraft("swamp_hills");
BIOME_KEYS[140] = Key.minecraft("ice_spikes");
BIOME_KEYS[149] = Key.minecraft("modified_jungle");
BIOME_KEYS[151] = Key.minecraft("modified_jungle_edge");
BIOME_KEYS[155] = Key.minecraft("tall_birch_forest");
BIOME_KEYS[156] = Key.minecraft("tall_birch_hills");
BIOME_KEYS[157] = Key.minecraft("dark_forest_hills");
BIOME_KEYS[158] = Key.minecraft("snowy_taiga_mountains");
BIOME_KEYS[160] = Key.minecraft("giant_spruce_taiga");
BIOME_KEYS[161] = Key.minecraft("giant_spruce_taiga_hills");
BIOME_KEYS[162] = Key.minecraft("modified_gravelly_mountains");
BIOME_KEYS[163] = Key.minecraft("shattered_savanna");
BIOME_KEYS[164] = Key.minecraft("shattered_savanna_plateau");
BIOME_KEYS[165] = Key.minecraft("eroded_badlands");
BIOME_KEYS[166] = Key.minecraft("modified_wooded_badlands_plateau");
BIOME_KEYS[167] = Key.minecraft("modified_badlands_plateau");
BIOME_KEYS[168] = Key.minecraft("bamboo_jungle");
BIOME_KEYS[169] = Key.minecraft("bamboo_jungle_hills");

export class LegacyBiomes {
    private readonly biomes: (Biome | null)[] = new Array<Biome | null>(BIOME_KEYS.length).fill(
        null,
    );

    constructor(dataPack: DataPack) {
        for (let i = 0; i < this.biomes.length; i++) {
            const key = BIOME_KEYS[i];
            if (key != null) this.biomes[i] = dataPack.getBiome(key);
        }
    }

    forId(legacyId: number): Biome | null {
        if (legacyId < 0 || legacyId >= this.biomes.length) return null;
        return this.biomes[legacyId] ?? null;
    }
}
