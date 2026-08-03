import { Color, Key } from "@material-bluemap/shared";
import { Biome } from "../../biome/Biome.js";
import { GrassColorModifier } from "../../biome/GrassColorModifier.js";
import { readLegacyJsonAsset } from "./assets.js";

/** One entry of the legacy biomes.json (upstream: legacy Biome.create's ConfigurationNode) */
export interface LegacyBiomeData {
    id?: number;
    humidity?: number;
    temp?: number;
    watercolor?: number | string;
    foliagecolor?: number | string;
    grasscolor?: number | string;
}

/**
 * Port of the legacy ConfigUtils.readColorInt (v0.10.3-mc1.12): accepts a color as
 * number (used as-is, including its alpha bits) or as string — css-style "#rgb",
 * "#argb", "#rrggbb" (alpha assumed 0xff) or "#aarrggbb", or an integer-string.
 */
export function readColorInt(value: number | string | undefined): number {
    if (value == null) throw new Error("NumberFormatException: No value!");

    if (typeof value === "number") {
        // ((Number) value).intValue()
        return value | 0;
    }

    let val = value;

    if (val.charAt(0) === "#") {
        val = val.substring(1);
        if (val.length === 3) val = "f" + val;
        if (val.length === 4)
            val =
                "" +
                val.charAt(0) +
                val.charAt(0) +
                val.charAt(1) +
                val.charAt(1) +
                val.charAt(2) +
                val.charAt(2) +
                val.charAt(3) +
                val.charAt(3);
        if (val.length === 6) val = "ff" + val;
        // Integer.parseUnsignedInt(val, 16)
        if (!/^[0-9a-fA-F]{1,8}$/.test(val)) throw new Error('For input string: "' + val + '"');
        return Number.parseInt(val, 16) | 0;
    }

    return javaParseInt(val);
}

/** Java Integer.parseInt: strict decimal syntax, int-range checked (throws otherwise) */
function javaParseInt(s: string): number {
    if (!/^[+-]?\d+$/.test(s)) throw new Error('For input string: "' + s + '"');
    const value = Number.parseInt(s, 10);
    if (value < -2147483648 || value > 2147483647) throw new Error('For input string: "' + s + '"');
    return value | 0;
}

/**
 * A biome created from a legacy biomes.json entry (upstream: legacy world/Biome.java
 * from v0.10.3-mc1.12), adapted to the modern {@link Biome} interface:
 * humidity -> downfall, temp -> temperature, watercolor (rgb, alpha forced opaque like
 * the modern Biome.Default), foliagecolor/grasscolor -> overlay colors (keeping their
 * alpha bits — legacy color4FromInt — defaulting to fully transparent, the legacy
 * Vector4f.ZERO). The modern-only dry-foliage overlay and grass-color-modifier keep
 * their neutral defaults.
 */
class LegacyBiome implements Biome {
    private readonly key: Key;
    private readonly numeralId: number;
    private readonly downfall: number;
    private readonly temperature: number;
    private readonly waterColor: Color;
    private readonly overlayFoliageColor: Color;
    private readonly overlayDryFoliageColor: Color = new Color().premultiplied();
    private readonly overlayGrassColor: Color;
    private readonly grassColorModifier: GrassColorModifier = GrassColorModifier.NONE;

    constructor(
        key: Key,
        numeralId: number,
        downfall: number,
        temperature: number,
        waterColor: Color,
        overlayFoliageColor: Color,
        overlayGrassColor: Color,
    ) {
        this.key = key;
        this.numeralId = numeralId;
        this.downfall = downfall;
        this.temperature = temperature;
        this.waterColor = waterColor;
        this.overlayFoliageColor = overlayFoliageColor;
        this.overlayGrassColor = overlayGrassColor;
    }

    /** upstream: legacy Biome.create(String id, ConfigurationNode node) */
    static create(id: string, node: LegacyBiomeData): LegacyBiome {
        const numeralId = node.id ?? 0;
        const humidity = node.humidity ?? 0.5;
        const temp = node.temp ?? 0.5;

        // legacy default: MathUtils.color3FromInt(4159204)
        let waterColor = new Color().set(4159204 | 0xff000000).premultiplied();
        let overlayFoliageColor = new Color().premultiplied(); // legacy: Vector4f.ZERO
        let overlayGrassColor = new Color().premultiplied(); // legacy: Vector4f.ZERO

        try {
            // legacy water-color is a Vector3f (no alpha); force it opaque like Biome.Default
            waterColor = new Color()
                .set(readColorInt(node.watercolor) | 0xff000000)
                .premultiplied();
        } catch {
            /* NumberFormatException ignored */
        }
        try {
            overlayFoliageColor = new Color().set(readColorInt(node.foliagecolor)).premultiplied();
        } catch {
            /* NumberFormatException ignored */
        }
        try {
            overlayGrassColor = new Color().set(readColorInt(node.grasscolor)).premultiplied();
        } catch {
            /* NumberFormatException ignored */
        }

        return new LegacyBiome(
            Key.parse(id),
            numeralId,
            humidity,
            temp,
            waterColor,
            overlayFoliageColor,
            overlayGrassColor,
        );
    }

    getKey(): Key {
        return this.key;
    }

    getNumeralId(): number {
        return this.numeralId;
    }

    getDownfall(): number {
        return this.downfall;
    }

    getTemperature(): number {
        return this.temperature;
    }

    getWaterColor(): Color {
        return this.waterColor;
    }

    getOverlayFoliageColor(): Color {
        return this.overlayFoliageColor;
    }

    getOverlayDryFoliageColor(): Color {
        return this.overlayDryFoliageColor;
    }

    getOverlayGrassColor(): Color {
        return this.overlayGrassColor;
    }

    getGrassColorModifier(): GrassColorModifier {
        return this.grassColorModifier;
    }
}

/**
 * The legacy numeral-biome-id table used by pre-1.15 chunk-formats (Chunk_1_12's
 * byte[256] Level.Biomes), loaded from the bundled assets/legacy/biomes.json.
 *
 * Merges the legacy BiomeConfig (config/BiomeConfig.java: numeral-id -> Biome map,
 * autopopulation not ported) with the modern LegacyBiomes lookup-API
 * (world/mca/chunk/LegacyBiomes.java: forId returning null for unknown ids —
 * the caller falls back to Biome.DEFAULT).
 */
export class LegacyBiomes {
    private static defaultBiomes: LegacyBiomes | null = null;

    private readonly biomes: Map<number, Biome>;

    constructor(node: Record<string, LegacyBiomeData>) {
        this.biomes = new Map();

        for (const [id, data] of Object.entries(node)) {
            const biome = LegacyBiome.create(id, data);
            this.biomes.set(biome.getNumeralId(), biome);
        }
    }

    forId(legacyId: number): Biome | null {
        return this.biomes.get(legacyId) ?? null;
    }

    /** The default biome-table backed by the bundled assets/legacy/biomes.json (cached) */
    static loadDefault(): LegacyBiomes {
        if (LegacyBiomes.defaultBiomes === null) {
            LegacyBiomes.defaultBiomes = new LegacyBiomes(
                readLegacyJsonAsset("biomes.json") as Record<string, LegacyBiomeData>,
            );
        }
        return LegacyBiomes.defaultBiomes;
    }
}
