/*
 * upstream: resources/pack/datapack/biome/DatapackBiome.java
 *
 * The nested {@code Data}/{@code Effects} POJOs are read by gson with
 * LOWER_CASE_WITH_UNDERSCORES member-names; without gson's reflective adapter each one
 * gets an explicit {@code fromJson} that reads exactly the members upstream declares,
 * ignores unknown ones and leaves absent ones at their field-initializer default.
 */

import type { Color, Key } from "@material-bluemap/shared";
import { postDeserialize } from "../../../adapter/PostDeserializeAdapterFactory.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import { asObject, nextDouble, type JsonValue } from "../../../adapter/JsonMapper.js";
import { Biome } from "../../../../world/biome/Biome.js";
import type { GrassColorModifier } from "../../../../world/biome/GrassColorModifier.js";
import type { PostDeserialize } from "../../../adapter/PostDeserialize.js";

export class DatapackBiome implements Biome {
    private readonly key: Key;
    private readonly data: Data;

    constructor(key: Key, data: Data) {
        this.key = key;
        this.data = data;
    }

    getKey(): Key {
        return this.key;
    }

    getData(): Data {
        return this.data;
    }

    getDownfall(): number {
        return this.data.downfall;
    }

    getTemperature(): number {
        return this.data.temperature;
    }

    getWaterColor(): Color {
        return this.data.effects.waterColor;
    }

    getOverlayFoliageColor(): Color {
        return this.data.effects.foliageColor;
    }

    getOverlayDryFoliageColor(): Color {
        return this.data.effects.dryFoliageColor;
    }

    getOverlayGrassColor(): Color {
        return this.data.effects.grassColor;
    }

    getGrassColorModifier(): GrassColorModifier {
        return this.data.effects.grassColorModifier;
    }
}

export class Data {
    effects: Effects = new Effects();
    temperature: number = Biome.DEFAULT.getTemperature();
    downfall: number = Biome.DEFAULT.getDownfall();

    getEffects(): Effects {
        return this.effects;
    }

    getTemperature(): number {
        return this.temperature;
    }

    getDownfall(): number {
        return this.downfall;
    }

    static fromJson(json: JsonValue): Data {
        const data = new Data();

        for (const [name, member] of Object.entries(asObject(json))) {
            switch (name) {
                case "effects":
                    data.effects = Effects.fromJson(member);
                    break;
                case "temperature":
                    // upstream field is a float
                    data.temperature = Math.fround(nextDouble(member));
                    break;
                case "downfall":
                    data.downfall = Math.fround(nextDouble(member));
                    break;
                default:
                    break;
            }
        }

        return data;
    }
}

export class Effects implements PostDeserialize {
    /*
     * Upstream initializes these with the *shared* Biome.DEFAULT color-instances (no
     * copy), which the port keeps: a biome that declares no color of its own hands out
     * the same mutable Color object the default biome does. {@link postDeserialize}
     * setting {@code waterColor.a = 1} is consequently a write to that shared instance
     * when no water_color was declared — a no-op, because Biome.DEFAULT's water-color
     * already has alpha 1.
     */
    waterColor: Color = Biome.DEFAULT.getWaterColor();
    foliageColor: Color = Biome.DEFAULT.getOverlayFoliageColor();
    dryFoliageColor: Color = Biome.DEFAULT.getOverlayDryFoliageColor();
    grassColor: Color = Biome.DEFAULT.getOverlayGrassColor();
    grassColorModifier: GrassColorModifier = Biome.DEFAULT.getGrassColorModifier();

    getWaterColor(): Color {
        return this.waterColor;
    }

    getFoliageColor(): Color {
        return this.foliageColor;
    }

    getDryFoliageColor(): Color {
        return this.dryFoliageColor;
    }

    getGrassColor(): Color {
        return this.grassColor;
    }

    getGrassColorModifier(): GrassColorModifier {
        return this.grassColorModifier;
    }

    /** upstream: {@code @PostDeserialize private void init()} */
    postDeserialize(): void {
        this.waterColor.a = 1;
    }

    static fromJson(json: JsonValue): Effects {
        const effects = new Effects();

        for (const [name, member] of Object.entries(asObject(json))) {
            switch (name) {
                case "water_color":
                    effects.waterColor = ResourcesGson.color.read(member);
                    break;
                case "foliage_color":
                    effects.foliageColor = ResourcesGson.color.read(member);
                    break;
                case "dry_foliage_color":
                    effects.dryFoliageColor = ResourcesGson.color.read(member);
                    break;
                case "grass_color":
                    effects.grassColor = ResourcesGson.color.read(member);
                    break;
                case "grass_color_modifier":
                    effects.grassColorModifier = ResourcesGson.grassColorModifier.read(member);
                    break;
                default:
                    break;
            }
        }

        return postDeserialize(effects);
    }
}
