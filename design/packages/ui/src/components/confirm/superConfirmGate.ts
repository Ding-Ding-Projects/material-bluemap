/**
 * The state machine both super-confirmation gates run on.
 *
 * The contract in `docs/contracts/super-confirmation.md` is a list of things that must be
 * true at the moment a destructive action fires: two independently operated keys are both
 * turned, and a full-range slider has travelled its whole range. Those are properties of a
 * small state machine, not of a card layout, and the two gates in this package draw very
 * different cards. `ConfigSuperConfirm` is an anchored menu that hangs off the delete
 * button it guards; `MenuSuperConfirm` is a modal dialog, because the settings menu it is
 * summoned from is itself a narrow sheet with nowhere to anchor a second surface.
 *
 * Two presentations of one rule is the shape that goes wrong. When the rule lives in each
 * component, the first fix lands in one of them and the other keeps the bug, and there is
 * nothing to look at that says which is right. So the rule lives here once, and the two
 * components are the two skins over it. `superConfirmPolicy.test.ts` asserts that both of
 * them really do call this factory rather than growing a second copy of the arithmetic.
 *
 * The properties this file is responsible for, each of which is a test next door:
 *
 *  - Untouched, the gate is locked and the slider cannot move at all.
 *  - One key alone does not arm it. Neither does the same key twice, because they are two
 *    separate booleans rather than a counter.
 *  - A slider let go before the end springs back to the start, so a slip cannot destroy
 *    anything and a half-finished drag cannot be resumed by a second, smaller one.
 *  - Turning a key back off mid-travel disarms and resets, rather than leaving a gate that
 *    is visually locked and internally most of the way to firing.
 *  - Authorization happens exactly once. A slider that keeps reporting values after it hits
 *    the end must not fire a second delete, and `reset()` is what a reopened gate calls.
 *
 * What this file deliberately does not do is decide *when* the surrounding component
 * resets. That differs: the anchored menu resets when it opens, the dialog resets when it
 * opens too, but a future gate that stays mounted would want something else. The factory
 * exposes `reset()` and lets the caller say when.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";

/** Where the slider starts, and the value it springs back to. */
export const GATE_TRAVEL_START = 0;

/**
 * Where the slider has to reach. "Full-range" in the contract is the whole point: a gate
 * that fires at 90% is a gate whose last tenth is decoration.
 */
export const GATE_TRAVEL_END = 100;

/**
 * What the gate is doing, for the sentence the user reads and the class the card wears.
 *
 * These are deliberately four states rather than a pair of booleans. "Armed but not moving"
 * and "armed and moving" need different copy (one says what to do next, the other is a
 * progress report) and different animation, and a component asking `armed && travel > 0`
 * in three places is a component where the three answers eventually disagree.
 */
export type GatePhase = "locked" | "armed" | "moving" | "authorized";

/**
 * How long the completed gate stays on screen before it closes itself.
 *
 * The contract asks for a distinct completion animation *and* for focus to return to the
 * control that opened the gate, and those two pull in opposite directions: a surface that
 * closes the instant the slider lands shows no completion at all, and one that waits for a
 * click leaves a keyboard user stranded in a card whose only remaining control is an exit
 * button that no longer exits anything. Holding briefly and then closing satisfies both.
 *
 * Shared rather than written twice so the two gates cannot drift, and exported so the tests
 * advance the clock by the real number instead of a copy of it that stops being real.
 */
export const GATE_COMPLETION_HOLD_MS = 900;

export interface SuperConfirmGate {
    /** The first key. Bound to a switch the user operates on its own. */
    readonly keyOne: Ref<boolean>;
    /** The second key, independent of the first in every sense that matters. */
    readonly keyTwo: Ref<boolean>;
    /**
     * How far the slider has travelled, between `GATE_TRAVEL_START` and `GATE_TRAVEL_END`.
     *
     * Read-only from outside. Everything that moves it goes through `travelTo`, which is
     * where the arming is checked, so there is no second route by which a slider could
     * arrive at the end without passing the two keys.
     */
    readonly travel: ComputedRef<number>;
    /** True once the action has been authorized, and never true before it. */
    readonly authorized: Ref<boolean>;
    /** Both keys turned. The slider is disabled until this is true. */
    readonly armed: ComputedRef<boolean>;
    readonly phase: ComputedRef<GatePhase>;
    /** Travel as a whole-number percentage, which is what a screen reader is told. */
    readonly percent: ComputedRef<number>;
    /** Back to untouched. Called when the gate opens, so a reopened gate is never part-way. */
    reset(): void;
    /**
     * Reports a new slider position. Returns true only on the call that authorized, so a
     * caller can tell "the user moved it" from "the user finished it" without re-deriving.
     */
    travelTo(value: number): boolean;
    /** The pointer or key was let go. Anything short of the end springs back. */
    release(): void;
}

function clamp(value: number): number {
    if (!Number.isFinite(value)) return GATE_TRAVEL_START;
    if (value < GATE_TRAVEL_START) return GATE_TRAVEL_START;
    if (value > GATE_TRAVEL_END) return GATE_TRAVEL_END;
    return value;
}

/**
 * Builds a gate whose `authorize` callback is the only route to the destructive action.
 *
 * `authorize` is called synchronously, inside `travelTo`, exactly once per armed run. The
 * components pass an emit, so the action itself lives in the screen that owns the data and
 * this file never touches it. That separation is what lets the policy test assert that a
 * destructive call site sits behind a gate without this module knowing what any of them do.
 */
export function createSuperConfirmGate(authorize: () => void): SuperConfirmGate {
    const oneTurned = ref(false);
    const twoTurned = ref(false);
    const authorized = ref(false);

    /** Where the slider was last put. */
    const dragged = ref(GATE_TRAVEL_START);

    /**
     * Turning a key back off is a cancellation of the arming, so the travel goes with it.
     *
     * Done in the setter rather than in a watcher, and the difference is the whole reason
     * this is written out longhand. A watcher runs on the next flush, so between the key
     * going off and the watcher firing there is a gate that reads as locked and is one
     * nudge from completing; a caller reading `travel` in that window gets the wrong
     * answer, and that window is precisely the sort of thing nobody can reason about six
     * months later. In the setter it is one statement, synchronous, and the two can never
     * be seen disagreeing.
     *
     * An authorized gate is left alone, because its full bar is the completion state and
     * flipping a switch afterwards should not rewind the record of something that has
     * already happened.
     */
    function turnKey(target: Ref<boolean>, value: boolean): void {
        target.value = value;
        if (!value && !authorized.value) dragged.value = GATE_TRAVEL_START;
    }

    const keyOne = computed<boolean>({
        get: () => oneTurned.value,
        set: (value) => turnKey(oneTurned, value),
    });

    const keyTwo = computed<boolean>({
        get: () => twoTurned.value,
        set: (value) => turnKey(twoTurned, value),
    });

    const armed = computed(() => oneTurned.value && twoTurned.value);

    const travel = computed(() => dragged.value);

    const phase = computed<GatePhase>(() => {
        if (authorized.value) return "authorized";
        if (!armed.value) return "locked";
        return travel.value > GATE_TRAVEL_START ? "moving" : "armed";
    });

    const percent = computed(() => Math.round(travel.value));

    function reset(): void {
        oneTurned.value = false;
        twoTurned.value = false;
        dragged.value = GATE_TRAVEL_START;
        authorized.value = false;
    }

    function travelTo(value: number): boolean {
        // Already fired. A slider that reports one more value after the end must not delete
        // a second time, and Vuetify emits on both drag and keyboard, so this is reachable.
        if (authorized.value) return false;

        if (!armed.value) {
            dragged.value = GATE_TRAVEL_START;
            return false;
        }

        dragged.value = clamp(value);
        if (dragged.value < GATE_TRAVEL_END) return false;

        authorized.value = true;
        authorize();
        return true;
    }

    function release(): void {
        if (!authorized.value) dragged.value = GATE_TRAVEL_START;
    }

    return { keyOne, keyTwo, travel, authorized, armed, phase, percent, reset, travelTo, release };
}

/* -------------------------------------------------------------------------- */
/* Focus return                                                               */
/* -------------------------------------------------------------------------- */

/** What counts as somewhere focus can be put back. */
const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/**
 * Puts focus back on the control that opened the gate, whether it completed or was escaped.
 *
 * The contract asks for this by name, and it is the part that is easy to leave out because
 * nothing looks wrong without it: a sighted mouse user never notices. Somebody driving the
 * keyboard notices immediately, because cancelling a gate drops focus onto `<body>` and the
 * next Tab starts again from the top of the page, several screens away from the delete
 * button they were just standing on.
 *
 * `element` may be the control itself or a wrapper around it, because the anchored gate
 * wraps its activator in a span and the modal one remembers whatever had focus when it
 * opened. Both cases resolve to the same thing: the first place focus can actually land.
 */
export function returnFocusTo(element: HTMLElement | null | undefined): boolean {
    if (!element) return false;

    const target =
        typeof element.matches === "function" && element.matches(FOCUSABLE)
            ? element
            : element.querySelector<HTMLElement>(FOCUSABLE);

    if (!target || typeof target.focus !== "function") return false;
    target.focus();
    return true;
}
