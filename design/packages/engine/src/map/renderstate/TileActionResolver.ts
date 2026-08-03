import { TileState } from "./TileState.js";

/** upstream: TileActionResolver.BoundsSituation — a java enum, ported as a class with three static instances */
export class BoundsSituation {
    static readonly INSIDE = new BoundsSituation("INSIDE");
    static readonly EDGE = new BoundsSituation("EDGE");
    static readonly OUTSIDE = new BoundsSituation("OUTSIDE");

    private readonly enumName: string;

    private constructor(name: string) {
        this.enumName = name;
    }

    /** Java Enum#name() */
    name(): string {
        return this.enumName;
    }

    toString(): string {
        return this.enumName;
    }

    static values(): readonly BoundsSituation[] {
        return [BoundsSituation.INSIDE, BoundsSituation.EDGE, BoundsSituation.OUTSIDE];
    }
}

/** upstream: TileActionResolver.Action — a java enum, ported as a class with three static instances */
export class Action {
    static readonly NONE = new Action("NONE");
    static readonly RENDER = new Action("RENDER");
    static readonly DELETE = new Action("DELETE");

    private readonly enumName: string;

    private constructor(name: string) {
        this.enumName = name;
    }

    /** Java Enum#name() */
    name(): string {
        return this.enumName;
    }

    toString(): string {
        return this.enumName;
    }

    static values(): readonly Action[] {
        return [Action.NONE, Action.RENDER, Action.DELETE];
    }
}

/** upstream: TileActionResolver.ActionAndNextState — a record */
export interface ActionAndNextState {
    action(): Action;
    state(): TileState;
}

/** upstream: the record's canonical constructor and accessors */
class ActionAndNextStateImpl implements ActionAndNextState {
    private readonly actionValue: Action;
    private readonly stateValue: TileState;

    constructor(action: Action, state: TileState) {
        // upstream: the compact constructor's two Objects.requireNonNull calls
        if (action == null) throw new Error("action must not be null");
        if (state == null) throw new Error("state must not be null");
        this.actionValue = action;
        this.stateValue = state;
    }

    action(): Action {
        return this.actionValue;
    }

    state(): TileState {
        return this.stateValue;
    }
}

// The six upstream statics are `static final` fields initialized from TileState's
// constants, while TileState's constants are built from these — a cycle java resolves
// through class-initialization order but an ES module would hit in the temporal dead
// zone. They are therefore built on first access and cached, which keeps them the
// singletons upstream's reference comparisons rely on.
let renderRendered: ActionAndNextState | null = null;
let noneRendered: ActionAndNextState | null = null;
let renderRenderedEdge: ActionAndNextState | null = null;
let noneRenderedEdge: ActionAndNextState | null = null;
let deleteOutOfBounds: ActionAndNextState | null = null;
let noneOutOfBounds: ActionAndNextState | null = null;

export const ActionAndNextState = {
    Impl: ActionAndNextStateImpl,

    get RENDER_RENDERED(): ActionAndNextState {
        return (renderRendered ??= new ActionAndNextStateImpl(Action.RENDER, TileState.RENDERED));
    },

    get NONE_RENDERED(): ActionAndNextState {
        return (noneRendered ??= new ActionAndNextStateImpl(Action.NONE, TileState.RENDERED));
    },

    get RENDER_RENDERED_EDGE(): ActionAndNextState {
        return (renderRenderedEdge ??= new ActionAndNextStateImpl(
            Action.RENDER,
            TileState.RENDERED_EDGE,
        ));
    },

    get NONE_RENDERED_EDGE(): ActionAndNextState {
        return (noneRenderedEdge ??= new ActionAndNextStateImpl(
            Action.NONE,
            TileState.RENDERED_EDGE,
        ));
    },

    get DELETE_OUT_OF_BOUNDS(): ActionAndNextState {
        return (deleteOutOfBounds ??= new ActionAndNextStateImpl(
            Action.DELETE,
            TileState.OUT_OF_BOUNDS,
        ));
    },

    get NONE_OUT_OF_BOUNDS(): ActionAndNextState {
        return (noneOutOfBounds ??= new ActionAndNextStateImpl(
            Action.NONE,
            TileState.OUT_OF_BOUNDS,
        ));
    },
};

/** upstream: map/renderstate/TileActionResolver.java */
export interface TileActionResolver {
    findActionAndNextState(chunksChanged: boolean, bounds: BoundsSituation): ActionAndNextState;
}
