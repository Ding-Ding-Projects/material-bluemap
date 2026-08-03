import { describe, expect, it } from "vitest";
import { Tristate } from "./Tristate.js";

const { TRUE, UNDEFINED, FALSE } = Tristate;

describe("Tristate", () => {
    it("getOr(Tristate) yields the fallback only for UNDEFINED", () => {
        expect(TRUE.getOr(FALSE)).toBe(TRUE);
        expect(FALSE.getOr(TRUE)).toBe(FALSE);
        expect(UNDEFINED.getOr(TRUE)).toBe(TRUE);
        expect(UNDEFINED.getOr(FALSE)).toBe(FALSE);
    });

    it("getOr(boolean) yields the enum-value, the default only for UNDEFINED", () => {
        expect(TRUE.getOr(false)).toBe(true);
        expect(FALSE.getOr(true)).toBe(false);
        expect(UNDEFINED.getOr(true)).toBe(true);
        expect(UNDEFINED.getOr(false)).toBe(false);
    });

    it("getOr(BooleanSupplier) only invokes the supplier for UNDEFINED", () => {
        let calls = 0;
        const supplier = (): boolean => {
            calls++;
            return true;
        };
        expect(TRUE.getOr(supplier)).toBe(true);
        expect(FALSE.getOr(supplier)).toBe(false);
        expect(calls).toBe(0);
        expect(UNDEFINED.getOr(supplier)).toBe(true);
        expect(calls).toBe(1);
    });

    it("negated flips TRUE/FALSE and keeps UNDEFINED", () => {
        expect(TRUE.negated()).toBe(FALSE);
        expect(FALSE.negated()).toBe(TRUE);
        expect(UNDEFINED.negated()).toBe(UNDEFINED);
    });

    it("and follows the upstream per-constant truth-table", () => {
        expect(TRUE.and(TRUE)).toBe(TRUE);
        expect(TRUE.and(UNDEFINED)).toBe(UNDEFINED);
        expect(TRUE.and(FALSE)).toBe(FALSE);
        expect(UNDEFINED.and(TRUE)).toBe(UNDEFINED);
        expect(UNDEFINED.and(UNDEFINED)).toBe(UNDEFINED);
        expect(UNDEFINED.and(FALSE)).toBe(FALSE);
        expect(FALSE.and(TRUE)).toBe(FALSE);
        expect(FALSE.and(UNDEFINED)).toBe(FALSE);
        expect(FALSE.and(FALSE)).toBe(FALSE);
    });

    it("or follows the upstream per-constant truth-table", () => {
        expect(TRUE.or(TRUE)).toBe(TRUE);
        expect(TRUE.or(UNDEFINED)).toBe(TRUE);
        expect(TRUE.or(FALSE)).toBe(TRUE);
        expect(UNDEFINED.or(TRUE)).toBe(TRUE);
        expect(UNDEFINED.or(UNDEFINED)).toBe(UNDEFINED);
        expect(UNDEFINED.or(FALSE)).toBe(UNDEFINED);
        expect(FALSE.or(TRUE)).toBe(TRUE);
        expect(FALSE.or(UNDEFINED)).toBe(UNDEFINED);
        expect(FALSE.or(FALSE)).toBe(FALSE);
    });

    it("and/or suppliers are only evaluated where upstream evaluates them", () => {
        let calls = 0;
        const supplier = (): Tristate => {
            calls++;
            return UNDEFINED;
        };
        expect(FALSE.and(supplier)).toBe(FALSE);
        expect(TRUE.or(supplier)).toBe(TRUE);
        expect(calls).toBe(0);
        expect(TRUE.and(supplier)).toBe(UNDEFINED);
        expect(UNDEFINED.or(supplier)).toBe(UNDEFINED);
        expect(calls).toBe(2);
    });

    it("valueOf and toString match the java enum", () => {
        expect(Tristate.valueOf(true)).toBe(TRUE);
        expect(Tristate.valueOf(false)).toBe(FALSE);
        expect(String(TRUE)).toBe("Tristate.TRUE");
        expect(String(UNDEFINED)).toBe("Tristate.UNDEFINED");
        expect(FALSE.name()).toBe("FALSE");
    });
});
