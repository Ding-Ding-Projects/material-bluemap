import {
    BlueNBT,
    CollectionAdapter,
    INT_ARRAY_ADAPTER,
    RegistryAdapter,
    TypeToken,
    type ObjectSchema,
} from "@material-bluemap/nbt";
import { Key } from "@material-bluemap/shared";
import type { Cell } from "./CellStorage.js";
import { TILE_STATE_ARRAY_TOKEN, TILE_STATE_TOKEN, TileState } from "./TileState.js";

/**
 * upstream: {@code MapTileState.SHIFT} (a package-private static this file imports
 * statically). The constant lives here in the port so the module graph stays acyclic —
 * {@code CellStorage} has to import the region-types to register their nbt-schemas, so a
 * region-type must not import back into the `Map*State` layer. {@code MapTileState.SHIFT}
 * re-exports it, so the upstream name still resolves.
 */
export const SHIFT = 5;

const REGION_LENGTH = 1 << SHIFT;
const REGION_MASK = REGION_LENGTH - 1;
const TILES_PER_REGION = REGION_LENGTH * REGION_LENGTH;

export const TILE_INFO_REGION_TOKEN: TypeToken<TileInfoRegion> = TypeToken.of("TileInfoRegion");

/** upstream: TileInfoRegion.TileInfo (a {@code @Data @AllArgsConstructor} nested class) */
export class TileInfo {
    private renderTime: number;
    private state: TileState;

    constructor(renderTime: number, state: TileState) {
        this.renderTime = renderTime;
        this.state = state;
    }

    getRenderTime(): number {
        return this.renderTime;
    }

    setRenderTime(renderTime: number): void {
        this.renderTime = renderTime;
    }

    getState(): TileState {
        return this.state;
    }

    setState(state: TileState): void {
        this.state = state;
    }

    /**
     * upstream: the lombok {@code @Data} equals. {@code TileState} does not override
     * {@code equals}, so its comparison is reference-identity here exactly as it is there.
     */
    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof TileInfo)) return false;
        return this.renderTime === o.renderTime && this.state === o.state;
    }

    toString(): string {
        return (
            "TileInfoRegion.TileInfo(renderTime=" +
            this.renderTime +
            ", state=" +
            String(this.state) +
            ")"
        );
    }
}

/** upstream: TileInfoRegion.PaletteOnly.TileStates */
class PaletteOnlyTileStates {
    palette: TileState[] = [];
}

/** upstream: TileInfoRegion.PaletteOnly */
class PaletteOnly {
    tileStates: PaletteOnlyTileStates = new PaletteOnlyTileStates();
}

const PALETTE_ONLY_TOKEN: TypeToken<PaletteOnly> = TypeToken.of("TileInfoRegion.PaletteOnly");
const PALETTE_ONLY_TILE_STATES_TOKEN: TypeToken<PaletteOnlyTileStates> = TypeToken.of(
    "TileInfoRegion.PaletteOnly.TileStates",
);

const PALETTE_ONLY_TILE_STATES_SCHEMA: ObjectSchema<PaletteOnlyTileStates> = {
    create: () => new PaletteOnlyTileStates(),
    fields: {
        palette: { type: (nbt) => new CollectionAdapter(nbt, TILE_STATE_TOKEN) },
    },
};

const PALETTE_ONLY_SCHEMA: ObjectSchema<PaletteOnly> = {
    create: () => new PaletteOnly(),
    fields: {
        tileStates: { names: ["tile-states"], type: PALETTE_ONLY_TILE_STATES_TOKEN },
    },
};

/** upstream: {@code PaletteOnly.BLUE_NBT} — its own instance, registering only TileState */
const PALETTE_ONLY_NBT = new BlueNBT();
PALETTE_ONLY_NBT.register(
    TILE_STATE_TOKEN,
    new RegistryAdapter<Key, TileState>(
        TileState.REGISTRY,
        (formatted, defaultNamespace) => Key.parse(formatted, defaultNamespace),
        Key.BLUEMAP_NAMESPACE,
        TileState.UNKNOWN,
    ),
);
PALETTE_ONLY_NBT.register(PALETTE_ONLY_TILE_STATES_TOKEN, PALETTE_ONLY_TILE_STATES_SCHEMA);
PALETTE_ONLY_NBT.register(PALETTE_ONLY_TOKEN, PALETTE_ONLY_SCHEMA);

/** upstream: map/renderstate/TileInfoRegion.java */
export class TileInfoRegion implements Cell {
    static readonly TileInfo = TileInfo;

    /**
     * upstream: {@code @NBTName("last-render-times") private int[] lastRenderTimes} — the
     * nbt-schema assigns the fields directly, so (exactly as in the ported `LevelData`)
     * they are public here while the upstream accessors are kept.
     */
    lastRenderTimes: Int32Array | null = null;

    /** upstream: {@code @NBTName("tile-states") private TileState[] tileStates} */
    tileStates: TileState[] | null = null;

    /** upstream: {@code @Getter private transient boolean modified} */
    private modified = false;

    private constructor() {}

    /** upstream: the {@code @NBTPostDeserialize}-annotated {@code init()} */
    init(): void {
        if (this.lastRenderTimes == null || this.lastRenderTimes.length !== TILES_PER_REGION)
            this.lastRenderTimes = new Int32Array(TILES_PER_REGION);

        if (this.tileStates == null || this.tileStates.length !== TILES_PER_REGION)
            this.tileStates = new Array<TileState>(TILES_PER_REGION).fill(TileState.UNKNOWN);
    }

    isModified(): boolean {
        return this.modified;
    }

    get(x: number, z: number): TileInfo {
        const index = TileInfoRegion.index(x, z);
        return new TileInfo(this.lastRenderTimes![index]!, this.tileStates![index]!);
    }

    set(x: number, z: number, info: TileInfo): TileInfo {
        const index = TileInfoRegion.index(x, z);

        const previous = new TileInfo(this.lastRenderTimes![index]!, this.tileStates![index]!);

        this.lastRenderTimes![index] = info.getRenderTime();
        // upstream: Objects.requireNonNull(info.getState())
        const state = info.getState();
        if (state == null) throw new Error("state must not be null");
        this.tileStates![index] = state;

        if (!previous.equals(info)) this.modified = true;

        return previous;
    }

    /** upstream: {@code Arrays.stream(lastRenderTimes).max().orElse(-1)} */
    findLatestRenderTime(): number {
        if (this.lastRenderTimes == null) return -1;
        let max = -1;
        for (let i = 0; i < this.lastRenderTimes.length; i++) {
            const value = this.lastRenderTimes[i]!;
            if (value > max) max = value;
        }
        return max;
    }

    private static index(x: number, z: number): number {
        return (((z & REGION_MASK) << SHIFT) | (x & REGION_MASK)) | 0;
    }

    static create(): TileInfoRegion {
        const region = new TileInfoRegion();
        region.init();
        return region;
    }

    /**
     * Only loads the palette-part from a TileState-file.
     *
     * (Upstream takes the {@code InputStream}; the port takes the already-read bytes,
     * matching how the storage layer hands out item-data.)
     */
    static loadPalette(data: Uint8Array): TileState[] {
        return PALETTE_ONLY_NBT.read(data, PALETTE_ONLY_TOKEN).tileStates.palette;
    }

    /** Port addition: the explicit nbt-schema replacing upstream's field-reflection */
    static readonly SCHEMA: ObjectSchema<TileInfoRegion> = {
        create: () => new TileInfoRegion(),
        fields: {
            lastRenderTimes: { names: ["last-render-times"], type: INT_ARRAY_ADAPTER },
            tileStates: { names: ["tile-states"], type: TILE_STATE_ARRAY_TOKEN },
        },
        postDeserialize: (region) => region.init(),
    };
}
