import { describe, expect, it } from "vitest";
import { formatDateInput, parseDateInput, parseMonthInput } from "./dateRangePicker.js";

describe("changelog date range input", () => {
    it("accepts ISO and slash dates without discarding invalid text", () => {
        expect(formatDateInput(parseDateInput("2026-08-04")!)).toBe("2026-08-04");
        expect(formatDateInput(parseDateInput("08/04/2026")!)).toBe("2026-08-04");
        expect(parseDateInput("2026-02-30")).toBeNull();
        expect(parseDateInput("not a date")).toBeNull();
    });

    it("accepts month jump values", () => {
        expect(parseMonthInput("2026-08")?.getFullYear()).toBe(2026);
        expect(parseMonthInput("2026-08")?.getMonth()).toBe(7);
        expect(parseMonthInput("2026-13")).toBeNull();
    });
});
