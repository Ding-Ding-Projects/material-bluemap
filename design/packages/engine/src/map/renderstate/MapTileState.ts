import { Grid } from "@material-bluemap/shared";
import type { GridStorage } from "../../storage/GridStorage.js";
import { CellStorage } from "./CellStorage.js";
import { SHIFT, TILE_INFO_REGION_TOKEN, TileInfo, TileInfoRegion } from "./TileInfoRegion.js";

/** upstream: map/renderstate/MapTileState.java */
export class MapTileState extends CellStorage<TileInfoRegion> {
    /** upstream: {@code static final int SHIFT = 5} — declared in `TileInfoRegion` here, see the note there */
    static readonly SHIFT = SHIFT;
    static readonly GRID: Grid = new Grid(1 << SHIFT);

    /** upstream: {@code @Getter private int lastRenderTime = -1} */
    private lastRenderTime = -1;

    constructor(storage: GridStorage) {
        super(storage, TILE_INFO_REGION_TOKEN);
    }

    getLastRenderTime(): number {
        return this.lastRenderTime;
    }

    async get(x: number, z: number): Promise<TileInfo> {
        return (await this.cell(x >> SHIFT, z >> SHIFT)).get(x, z);
    }

    /** upstream: synchronized */
    async set(x: number, z: number, info: TileInfo): Promise<TileInfo> {
        const old = (await this.cell(x >> SHIFT, z >> SHIFT)).set(x, z, info);

        if (info.getRenderTime() > this.lastRenderTime) this.lastRenderTime = info.getRenderTime();

        return old;
    }

    /** upstream: synchronized */
    protected override createNewCell(): TileInfoRegion {
        return TileInfoRegion.create();
    }
}
