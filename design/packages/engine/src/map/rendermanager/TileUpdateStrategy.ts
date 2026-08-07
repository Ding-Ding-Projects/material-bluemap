import { Key, Registry, type Keyed } from "@worldlens/shared";
import { TileState } from "../renderstate/TileState.js";

/**
 * upstream: `common/.../rendermanager/TileUpdateStrategy.java`
 *
 * Decides whether a tile must be re-rendered *regardless* of whether its chunks changed.
 * {@link WorldRegionUpdateTask} asks it once per tile, before the (much more expensive)
 * chunk-hash comparison.
 *
 * ## Identity is load-bearing here, so the three strategies are singletons
 *
 * Upstream's `WorldRegionUpdateTask#equals` compares its strategy with `force == that.force`
 * — reference identity, because `Impl` is a plain lombok class with no `equals` override.
 * `RenderManager` uses that equality (through `RenderTask#contains`) to recognise a task it
 * has already scheduled. So `fixed(true)` returning a *fresh* object every call would make
 * two otherwise-identical region tasks unequal, and the same region would be queued twice.
 * That is why upstream's `fixed` hands back `FORCE_ALL`/`FORCE_NONE` rather than building
 * anything, and why this port does the same.
 */
export interface TileUpdateStrategy extends Keyed {
    /** upstream: `Predicate<TileState>#test` */
    test(tileState: TileState): boolean;
}

/**
 * upstream: `TileUpdateStrategy.Impl` — a `Key` plus a `@Delegate`d predicate.
 *
 * Exposed so a caller can register a strategy of its own in {@link TileUpdateStrategy.REGISTRY};
 * the three upstream strategies below are the only ones the render path builds.
 */
class Impl implements TileUpdateStrategy {
    readonly #key: Key;
    readonly #predicate: (tileState: TileState) => boolean;

    constructor(key: Key, predicate: (tileState: TileState) => boolean) {
        this.#key = key;
        this.#predicate = predicate;
    }

    getKey(): Key {
        return this.#key;
    }

    test(tileState: TileState): boolean {
        return this.#predicate(tileState);
    }

    toString(): string {
        return this.#key.getFormatted();
    }
}

const FORCE_ALL: TileUpdateStrategy = new Impl(Key.bluemap("force_all"), () => true);

/**
 * upstream: `tileState -> tileState == TileState.RENDERED_EDGE`.
 *
 * Re-renders only the tiles that were last written as a render-boundary edge. Those are
 * the tiles whose content depends on where the boundary is, so they are the ones that go
 * stale when the boundary moves while nothing in the world changed.
 */
const FORCE_EDGE: TileUpdateStrategy = new Impl(
    Key.bluemap("force_edge"),
    // upstream compares with `==`; the ported TileState values are singletons too, so
    // `===` is the same test
    (tileState) => tileState === TileState.RENDERED_EDGE,
);

const FORCE_NONE: TileUpdateStrategy = new Impl(Key.bluemap("force_none"), () => false);

export const TileUpdateStrategy = {
    FORCE_ALL,
    FORCE_EDGE,
    FORCE_NONE,

    REGISTRY: new Registry<TileUpdateStrategy>(FORCE_ALL, FORCE_EDGE, FORCE_NONE),

    /** upstream: `static TileUpdateStrategy fixed(boolean force)` — see the identity note above */
    fixed(force: boolean): TileUpdateStrategy {
        return force ? FORCE_ALL : FORCE_NONE;
    },

    Impl,
};
