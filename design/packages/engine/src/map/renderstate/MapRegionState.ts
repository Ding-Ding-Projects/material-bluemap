import type { GridStorage } from "../../storage/GridStorage.js";
import { CellStorage } from "./CellStorage.js";
import {
    REGION_INFO_REGION_TOKEN,
    REGION_LENGTH,
    RegionInfoRegion,
    SHIFT,
} from "./RegionInfoRegion.js";

/** upstream: MapRegionState.RegionStateConsumer (a nested {@code @FunctionalInterface}) */
export type RegionStateConsumer = (x: number, z: number, lastUpdateTime: number) => void;

/** upstream: map/renderstate/MapRegionState.java */
export class MapRegionState extends CellStorage<RegionInfoRegion> {
    /** upstream: {@code static final int SHIFT = 6} — declared in `RegionInfoRegion` here, see the note there */
    static readonly SHIFT = SHIFT;

    constructor(storage: GridStorage) {
        super(storage, REGION_INFO_REGION_TOKEN);
    }

    async get(x: number, z: number): Promise<number> {
        return (await this.cell(x >> SHIFT, z >> SHIFT)).get(x, z);
    }

    /** upstream: synchronized */
    async set(x: number, z: number, lastUpdateTime: number): Promise<number> {
        return (await this.cell(x >> SHIFT, z >> SHIFT)).set(x, z, lastUpdateTime);
    }

    /** upstream: synchronized */
    async delete(x: number, z: number): Promise<number> {
        return (await this.cell(x >> SHIFT, z >> SHIFT)).set(x, z, 0);
    }

    /**
     * upstream: {@code public void forEach(RegionStateConsumer consumer)} — an overload of
     * the inherited (package-private) {@code forEach(CellConsumer)}, which the port renamed
     * to {@code forEachCell} so the two can coexist without runtime dispatch on a
     * function-typed parameter.
     */
    forEach(consumer: RegionStateConsumer): Promise<void> {
        return this.forEachCell((cellPos, region) => {
            for (let x = 0; x < REGION_LENGTH; x++) {
                for (let z = 0; z < REGION_LENGTH; z++) {
                    const lastUpdateTime = region.get(x, z);
                    if (lastUpdateTime !== 0) {
                        consumer(
                            ((cellPos.getX() << SHIFT) + x) | 0,
                            ((cellPos.getY() << SHIFT) + z) | 0,
                            lastUpdateTime,
                        );
                    }
                }
            }
        });
    }

    protected override createNewCell(): RegionInfoRegion {
        return RegionInfoRegion.create();
    }
}
