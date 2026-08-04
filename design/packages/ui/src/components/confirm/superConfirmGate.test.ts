// @vitest-environment jsdom

/**
 * The rule the contract is actually made of, tested where it lives.
 *
 * The mounted tests next door prove that the two cards wire this up correctly, but they
 * prove it through Vuetify, and a switch that has to be found by class name and clicked is
 * an expensive way to ask "does one key arm it". The properties below are the ones that
 * decide whether a delete happens, and they are arithmetic, so they are asserted directly
 * and exhaustively here and only sampled through the interface there.
 *
 * The one that matters most is the last group. Every other test in this file asks whether
 * the gate opens when it should; those ask whether it stays shut when it should, which is
 * the direction a bug in a safety gate actually goes.
 */

import { describe, expect, it, vi } from "vitest";

import {
    createSuperConfirmGate,
    returnFocusTo,
    GATE_COMPLETION_HOLD_MS,
    GATE_TRAVEL_END,
    GATE_TRAVEL_START,
} from "./superConfirmGate.js";

describe("the untouched gate", () => {
    it("starts locked, with both keys off and the slider at the start", () => {
        const gate = createSuperConfirmGate(() => {});

        expect(gate.keyOne.value).toBe(false);
        expect(gate.keyTwo.value).toBe(false);
        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(gate.armed.value).toBe(false);
        expect(gate.authorized.value).toBe(false);
        expect(gate.phase.value).toBe("locked");
    });

    it("refuses to travel at all, even when something drives the slider to the end", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);

        expect(gate.travelTo(GATE_TRAVEL_END)).toBe(false);
        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(authorize).not.toHaveBeenCalled();
    });
});

describe("one key is not two", () => {
    it("stays locked with only the first key turned", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);

        gate.keyOne.value = true;

        expect(gate.armed.value).toBe(false);
        expect(gate.phase.value).toBe("locked");
        expect(gate.travelTo(GATE_TRAVEL_END)).toBe(false);
        expect(authorize).not.toHaveBeenCalled();
    });

    it("stays locked with only the second key turned", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);

        gate.keyTwo.value = true;

        expect(gate.armed.value).toBe(false);
        expect(gate.travelTo(GATE_TRAVEL_END)).toBe(false);
        expect(authorize).not.toHaveBeenCalled();
    });

    it("counts two keys rather than two turns of one, which a counter would not", () => {
        const gate = createSuperConfirmGate(() => {});

        gate.keyOne.value = true;
        gate.keyOne.value = false;
        gate.keyOne.value = true;

        expect(gate.armed.value).toBe(false);
    });
});

describe("both keys arm it, and nothing more than that", () => {
    it("arms without firing, because arming is not confirming", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);

        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        expect(gate.armed.value).toBe(true);
        expect(gate.phase.value).toBe("armed");
        expect(gate.authorized.value).toBe(false);
        expect(authorize).not.toHaveBeenCalled();
    });

    it("reports travel as it happens without firing short of the end", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        for (const value of [1, 25, 60, 99, GATE_TRAVEL_END - 1]) {
            expect(gate.travelTo(value), `fired at ${value}`).toBe(false);
            expect(gate.travel.value).toBe(value);
            expect(gate.phase.value).toBe("moving");
        }

        expect(authorize).not.toHaveBeenCalled();
    });

    it("fires exactly at the end, once, and reports which call did it", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(99);
        expect(authorize).not.toHaveBeenCalled();

        expect(gate.travelTo(GATE_TRAVEL_END)).toBe(true);
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(gate.phase.value).toBe("authorized");
    });

    it("does not fire twice when the slider keeps reporting after it lands", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(GATE_TRAVEL_END);
        expect(gate.travelTo(GATE_TRAVEL_END)).toBe(false);
        expect(gate.travelTo(GATE_TRAVEL_END + 40)).toBe(false);

        expect(authorize).toHaveBeenCalledTimes(1);
    });
});

describe("a partial slider destroys nothing", () => {
    it("springs back to the start when it is let go short of the end", () => {
        const gate = createSuperConfirmGate(() => {});
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(88);
        gate.release();

        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(gate.phase.value).toBe("armed");
    });

    it("cannot be finished by a second, smaller drag, because the first one is gone", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(95);
        gate.release();
        gate.travelTo(10);

        expect(gate.travel.value).toBe(10);
        expect(authorize).not.toHaveBeenCalled();
    });

    it("leaves the completed state alone, so releasing after the end is not an undo", () => {
        const gate = createSuperConfirmGate(() => {});
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(GATE_TRAVEL_END);
        gate.release();

        expect(gate.travel.value).toBe(GATE_TRAVEL_END);
        expect(gate.phase.value).toBe("authorized");
    });
});

describe("turning a key back off disarms it", () => {
    it("resets the travel in the same tick, not one watcher later", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;
        gate.travelTo(97);

        gate.keyTwo.value = false;

        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(gate.phase.value).toBe("locked");
    });

    it("does not hand the travel back when the key goes on again", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;
        gate.travelTo(97);

        gate.keyTwo.value = false;
        gate.keyTwo.value = true;

        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(authorize).not.toHaveBeenCalled();
    });
});

describe("reset puts a reopened gate back to untouched", () => {
    it("clears both keys, the travel and the authorization", () => {
        const gate = createSuperConfirmGate(() => {});
        gate.keyOne.value = true;
        gate.keyTwo.value = true;
        gate.travelTo(GATE_TRAVEL_END);

        gate.reset();

        expect(gate.keyOne.value).toBe(false);
        expect(gate.keyTwo.value).toBe(false);
        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(gate.authorized.value).toBe(false);
        expect(gate.phase.value).toBe("locked");
    });

    it("lets a reset gate fire again, which is what reopening it has to mean", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);

        gate.keyOne.value = true;
        gate.keyTwo.value = true;
        gate.travelTo(GATE_TRAVEL_END);

        gate.reset();
        gate.keyOne.value = true;
        gate.keyTwo.value = true;
        gate.travelTo(GATE_TRAVEL_END);

        expect(authorize).toHaveBeenCalledTimes(2);
    });
});

describe("the values a screen reader is given", () => {
    it("rounds the travel to a whole percentage rather than reading out a float", () => {
        const gate = createSuperConfirmGate(() => {});
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(33.4);
        expect(gate.percent.value).toBe(33);

        gate.travelTo(66.6);
        expect(gate.percent.value).toBe(67);
    });

    it("clamps a value outside the range instead of reporting it", () => {
        const gate = createSuperConfirmGate(() => {});
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(-40);
        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
    });

    it("treats a value that is not a number as no travel at all", () => {
        const authorize = vi.fn();
        const gate = createSuperConfirmGate(authorize);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;

        gate.travelTo(Number.NaN);

        expect(gate.travel.value).toBe(GATE_TRAVEL_START);
        expect(authorize).not.toHaveBeenCalled();
    });
});

describe("the completion hold", () => {
    it("is long enough to see and short enough not to strand a keyboard user", () => {
        expect(GATE_COMPLETION_HOLD_MS).toBeGreaterThanOrEqual(400);
        expect(GATE_COMPLETION_HOLD_MS).toBeLessThanOrEqual(2000);
    });
});

describe("returning focus to where it came from", () => {
    it("focuses a wrapper's button, which is what the anchored gate hands it", () => {
        const anchor = document.createElement("span");
        const button = document.createElement("button");
        anchor.append(button);
        document.body.append(anchor);

        expect(returnFocusTo(anchor)).toBe(true);
        expect(document.activeElement).toBe(button);

        anchor.remove();
    });

    it("focuses the element itself when that is what it was handed", () => {
        const button = document.createElement("button");
        document.body.append(button);

        expect(returnFocusTo(button)).toBe(true);
        expect(document.activeElement).toBe(button);

        button.remove();
    });

    it("says so rather than throwing when the opener has gone", () => {
        expect(returnFocusTo(null)).toBe(false);
        expect(returnFocusTo(document.createElement("span"))).toBe(false);
    });
});
