/*
 * upstream: resources/pack/datapack/dimension/DimensionTypeData.java
 *
 * Upstream is a lombok {@code @Data} class read by two libraries: BlueNBT (the
 * {@code @NBTName}s below, for the dimension-type embedded in level.dat) and gson (the
 * datapack's {@code data/<ns>/dimension_type/**.json}, whose member-names are the same
 * strings because {@code ResourcesGson} applies LOWER_CASE_WITH_UNDERSCORES). The
 * gson-side read is {@link DimensionTypeData.fromJson}; the NBT-side schema still lives
 * with {@code world/mca/data/DimensionTypeDeserializer.ts} (see docs/deviations.md).
 *
 * {@code @Accessors(fluent = true)} makes {@code hasSkylight}/{@code hasCeiling} their
 * own accessors, which a TS class cannot spell as both a field and a method — the
 * fields are therefore named {@code skylight}/{@code ceiling} (as in the existing
 * mca-side copy) while the accessors keep their upstream names.
 */

import type { DimensionType } from "../../../../world/DimensionType.js";
import { asObject, nextBoolean, nextDouble, nextInt, type JsonValue } from "../../../adapter/JsonMapper.js";

export class DimensionTypeData implements DimensionType {
    natural = false; // @NBTName("natural")
    skylight = false; // @NBTName("has_skylight") — upstream field: hasSkylight
    ceiling = false; // @NBTName("has_ceiling") — upstream field: hasCeiling
    ambientLight = 0; // @NBTName("ambient_light")
    minY = 0; // @NBTName("min_y")
    height = 0; // @NBTName("height")
    fixedTime: number | null = null; // @NBTName("fixed_time")
    coordinateScale = 0; // @NBTName("coordinate_scale")

    isNatural(): boolean {
        return this.natural;
    }

    hasSkylight(): boolean {
        return this.skylight;
    }

    hasCeiling(): boolean {
        return this.ceiling;
    }

    getAmbientLight(): number {
        return this.ambientLight;
    }

    getMinY(): number {
        return this.minY;
    }

    getHeight(): number {
        return this.height;
    }

    getFixedTime(): number | null {
        return this.fixedTime;
    }

    getCoordinateScale(): number {
        return this.coordinateScale;
    }

    /**
     * upstream: {@code ResourcesGson.INSTANCE.fromJson(reader, DimensionTypeData.class)} —
     * the reflective gson adapter, which ignores unknown members and leaves absent ones
     * at their field-initializer default.
     */
    static fromJson(json: JsonValue): DimensionTypeData {
        const data = new DimensionTypeData();

        for (const [name, member] of Object.entries(asObject(json))) {
            switch (name) {
                case "natural":
                    data.natural = nextBoolean(member);
                    break;
                case "has_skylight":
                    data.skylight = nextBoolean(member);
                    break;
                case "has_ceiling":
                    data.ceiling = nextBoolean(member);
                    break;
                case "ambient_light":
                    // upstream field is a float
                    data.ambientLight = Math.fround(nextDouble(member));
                    break;
                case "min_y":
                    data.minY = nextInt(member);
                    break;
                case "height":
                    data.height = nextInt(member);
                    break;
                case "fixed_time":
                    // upstream field is a (nullable) Long
                    data.fixedTime = member === null ? null : nextDouble(member);
                    break;
                case "coordinate_scale":
                    data.coordinateScale = nextDouble(member);
                    break;
                default:
                    break;
            }
        }

        return data;
    }
}
