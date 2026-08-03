import { TypeToken } from "@material-bluemap/nbt";
import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import {
    Action,
    ActionAndNextState,
    BoundsSituation,
    type TileActionResolver,
} from "./TileActionResolver.js";

/** upstream: map/renderstate/TileState.java */
export interface TileState extends Keyed, TileActionResolver {}

/** upstream: {@code TypeToken.of(TileState.class)} in CellStorage / TileInfoRegion.PaletteOnly */
export const TILE_STATE_TOKEN: TypeToken<TileState> = TypeToken.of("TileState");

/** upstream: {@code TypeToken.of(TileState[].class)} in CellStorage */
export const TILE_STATE_ARRAY_TOKEN: TypeToken<TileState[]> = TypeToken.of("TileState[]");

/** upstream: TileState.Impl */
class Impl implements TileState {
    private readonly key: Key;
    private readonly resolver: TileActionResolver;

    /**
     * upstream: the lombok {@code @RequiredArgsConstructor} (key + resolver) and the
     * explicit {@code Impl(Key)} whose resolver renders on any change and otherwise
     * keeps this state.
     */
    constructor(key: Key, resolver?: TileActionResolver) {
        this.key = key;

        if (resolver !== undefined) {
            this.resolver = resolver;
            return;
        }

        this.resolver = {
            findActionAndNextState: (changed: boolean, bounds: BoundsSituation) => {
                if (!changed) return this.noActionThisNextState();
                if (bounds === BoundsSituation.INSIDE) return ActionAndNextState.RENDER_RENDERED;
                if (bounds === BoundsSituation.EDGE)
                    return ActionAndNextState.RENDER_RENDERED_EDGE;
                return ActionAndNextState.DELETE_OUT_OF_BOUNDS;
            },
        };
    }

    getKey(): Key {
        return this.key;
    }

    toString(): string {
        return this.key.getFormatted();
    }

    findActionAndNextState(changed: boolean, bounds: BoundsSituation): ActionAndNextState {
        return this.resolver.findActionAndNextState(changed, bounds);
    }

    private noActionThisNextStateCache: ActionAndNextState | null = null;
    private noActionThisNextState(): ActionAndNextState {
        if (this.noActionThisNextStateCache === null)
            this.noActionThisNextStateCache = new ActionAndNextState.Impl(Action.NONE, this);
        return this.noActionThisNextStateCache;
    }
}

const UNKNOWN: TileState = new Impl(Key.bluemap("unknown"), {
    findActionAndNextState: (_chunks: boolean, bounds: BoundsSituation) => {
        if (bounds === BoundsSituation.INSIDE) return ActionAndNextState.RENDER_RENDERED;
        if (bounds === BoundsSituation.EDGE) return ActionAndNextState.RENDER_RENDERED_EDGE;
        return ActionAndNextState.DELETE_OUT_OF_BOUNDS;
    },
});

const RENDERED: TileState = new Impl(Key.bluemap("rendered"), {
    findActionAndNextState: (changed: boolean, bounds: BoundsSituation) => {
        if (bounds === BoundsSituation.INSIDE)
            return changed ? ActionAndNextState.RENDER_RENDERED : ActionAndNextState.NONE_RENDERED;
        if (bounds === BoundsSituation.EDGE) return ActionAndNextState.RENDER_RENDERED_EDGE;
        return ActionAndNextState.DELETE_OUT_OF_BOUNDS;
    },
});

const RENDERED_EDGE: TileState = new Impl(Key.bluemap("rendered-edge"), {
    findActionAndNextState: (changed: boolean, bounds: BoundsSituation) => {
        if (bounds === BoundsSituation.INSIDE) return ActionAndNextState.RENDER_RENDERED;
        if (bounds === BoundsSituation.EDGE)
            return changed
                ? ActionAndNextState.RENDER_RENDERED_EDGE
                : ActionAndNextState.NONE_RENDERED_EDGE;
        return ActionAndNextState.DELETE_OUT_OF_BOUNDS;
    },
});

const OUT_OF_BOUNDS: TileState = new Impl(Key.bluemap("out-of-bounds"), {
    findActionAndNextState: (_changed: boolean, bounds: BoundsSituation) => {
        if (bounds === BoundsSituation.INSIDE) return ActionAndNextState.RENDER_RENDERED;
        if (bounds === BoundsSituation.EDGE) return ActionAndNextState.RENDER_RENDERED_EDGE;
        return ActionAndNextState.NONE_OUT_OF_BOUNDS;
    },
});

const NOT_GENERATED: TileState = new Impl(Key.bluemap("not-generated"));
const MISSING_LIGHT: TileState = new Impl(Key.bluemap("missing-light"));
const LOW_INHABITED_TIME: TileState = new Impl(Key.bluemap("low-inhabited-time"));
const CHUNK_ERROR: TileState = new Impl(Key.bluemap("chunk-error"));

const RENDER_ERROR: TileState = new Impl(Key.bluemap("render-error"), {
    findActionAndNextState: (_changed: boolean, bounds: BoundsSituation) => {
        if (bounds === BoundsSituation.INSIDE) return ActionAndNextState.RENDER_RENDERED;
        if (bounds === BoundsSituation.EDGE) return ActionAndNextState.RENDER_RENDERED_EDGE;
        return ActionAndNextState.DELETE_OUT_OF_BOUNDS;
    },
});

export const TileState = {
    UNKNOWN,
    RENDERED,
    RENDERED_EDGE,
    OUT_OF_BOUNDS,
    NOT_GENERATED,
    MISSING_LIGHT,
    LOW_INHABITED_TIME,
    CHUNK_ERROR,
    RENDER_ERROR,

    REGISTRY: new Registry<TileState>(
        UNKNOWN,
        RENDERED,
        RENDERED_EDGE,
        OUT_OF_BOUNDS,
        NOT_GENERATED,
        MISSING_LIGHT,
        LOW_INHABITED_TIME,
        CHUNK_ERROR,
        RENDER_ERROR,
    ),

    Impl,
};
