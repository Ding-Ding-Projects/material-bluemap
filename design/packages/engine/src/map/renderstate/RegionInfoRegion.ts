import { INT_ARRAY_ADAPTER, TypeToken, type ObjectSchema } from "@material-bluemap/nbt";
import type { Cell } from "./CellStorage.js";

/**
 * upstream: {@code MapRegionState.SHIFT} (a package-private static this file imports
 * statically); it lives here in the port to keep the module graph acyclic, and
 * {@code MapRegionState.SHIFT} re-exports it. See the same note on `TileInfoRegion`.
 */
export const SHIFT = 6;

export const REGION_LENGTH = 1 << SHIFT;
export const REGION_MASK = REGION_LENGTH - 1;
export const REGIONS_PER_REGION = REGION_LENGTH * REGION_LENGTH;

export const REGION_INFO_REGION_TOKEN: TypeToken<RegionInfoRegion> =
    TypeToken.of("RegionInfoRegion");

/** upstream: map/renderstate/RegionInfoRegion.java */
export class RegionInfoRegion implements Cell {
    /**
     * upstream: {@code @NBTName("last-update-times") private int[] lastUpdateTimes} —
     * public here so the nbt-schema can assign it (see the note on `TileInfoRegion`).
     */
    lastUpdateTimes: Int32Array | null = null;

    /** upstream: {@code @Getter private transient boolean modified} */
    private modified = false;

    private constructor() {}

    /** upstream: the {@code @NBTPostDeserialize}-annotated {@code init()} */
    init(): void {
        if (this.lastUpdateTimes == null || this.lastUpdateTimes.length !== REGIONS_PER_REGION)
            this.lastUpdateTimes = new Int32Array(REGIONS_PER_REGION);
    }

    isModified(): boolean {
        return this.modified;
    }

    get(x: number, z: number): number {
        return this.lastUpdateTimes![RegionInfoRegion.index(x, z)]!;
    }

    set(x: number, z: number, lastUpdateTime: number): number {
        const index = RegionInfoRegion.index(x, z);

        const previous = this.lastUpdateTimes![index]!;
        this.lastUpdateTimes![index] = lastUpdateTime;

        if (previous !== lastUpdateTime) this.modified = true;

        return previous;
    }

    private static index(x: number, z: number): number {
        return (((z & REGION_MASK) << SHIFT) | (x & REGION_MASK)) | 0;
    }

    static create(): RegionInfoRegion {
        const region = new RegionInfoRegion();
        region.init();
        return region;
    }

    /** Port addition: the explicit nbt-schema replacing upstream's field-reflection */
    static readonly SCHEMA: ObjectSchema<RegionInfoRegion> = {
        create: () => new RegionInfoRegion(),
        fields: {
            lastUpdateTimes: { names: ["last-update-times"], type: INT_ARRAY_ADAPTER },
        },
        postDeserialize: (region) => region.init(),
    };
}
