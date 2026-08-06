import { describe, expect, it } from "vitest";
import { MASK_SHAPES, type MaskShapeMeta, type PlainValue } from "@material-bluemap/config";
import { createShapeDraft, draftToRecord, hasInvalidField, setDraftSubtract, setFieldNumber, setFieldText } from "./maskDraft.js";

const BOX_SHAPE = MASK_SHAPES.find((shape) => shape.key === "box") as MaskShapeMeta;
const CIRCLE_SHAPE = MASK_SHAPES.find((shape) => shape.key === "circle") as MaskShapeMeta;

const BOX_RECORD: Record<string, PlainValue> = {
    type: "bluemap:box",
    subtract: false,
    "min-x": 0,
    "max-x": 100,
    "min-y": -64,
    "max-y": 320,
    "min-z": 0,
    "max-z": 100,
};

describe("maskDraft: two-way binding", () => {
    it("typing a valid coordinate updates the committed value the shape draws from", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const next = setFieldText(draft, BOX_SHAPE, "max-x", "250");
        expect(next.fields["max-x"]!.committed).toBe(250);
        expect(next.fields["max-x"]!.valid).toBe(true);
        expect(next.fields["max-x"]!.error).toBeNull();
    });

    it("dragging a handle updates both the committed number and its displayed text", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const next = setFieldNumber(draft, "max-x", 300);
        expect(next.fields["max-x"]!.committed).toBe(300);
        expect(next.fields["max-x"]!.text).toBe("300");
        expect(next.fields["max-x"]!.valid).toBe(true);
    });

    it("typing invalid text is reported inline without discarding what was typed", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const next = setFieldText(draft, BOX_SHAPE, "max-x", "12x");
        expect(next.fields["max-x"]!.text).toBe("12x"); // exactly what the user typed, kept
        expect(next.fields["max-x"]!.valid).toBe(false);
        expect(next.fields["max-x"]!.error).not.toBeNull();
        // The last good value is untouched, so the drawn shape does not jump anywhere absurd.
        expect(next.fields["max-x"]!.committed).toBe(100);
    });

    it("a partially typed number ('-', empty, a trailing dot) is reported as still-typing, not discarded", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const dash = setFieldText(draft, BOX_SHAPE, "max-x", "-");
        expect(dash.fields["max-x"]!.text).toBe("-");
        expect(dash.fields["max-x"]!.valid).toBe(false);
        expect(dash.fields["max-x"]!.committed).toBe(100); // untouched

        const empty = setFieldText(draft, BOX_SHAPE, "max-x", "");
        expect(empty.fields["max-x"]!.text).toBe("");
        expect(empty.fields["max-x"]!.valid).toBe(false);
        expect(empty.fields["max-x"]!.committed).toBe(100); // untouched
    });

    it("does not let typing clobber a field that was just set by dragging", () => {
        let draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        draft = setFieldNumber(draft, "max-x", 500);
        draft = setFieldText(draft, BOX_SHAPE, "max-x", "bad");
        // The invalid keystroke never overwrote the value the drag just committed.
        expect(draft.fields["max-x"]!.committed).toBe(500);
        expect(draft.fields["max-x"]!.valid).toBe(false);
    });

    it("does not let dragging clobber an unrelated field's in-progress invalid text", () => {
        let draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        draft = setFieldText(draft, BOX_SHAPE, "max-x", "still typing");
        draft = setFieldNumber(draft, "max-z", 400);
        // max-x's invalid text survives a drag on a completely different field.
        expect(draft.fields["max-x"]!.text).toBe("still typing");
        expect(draft.fields["max-x"]!.valid).toBe(false);
        expect(draft.fields["max-z"]!.committed).toBe(400);
    });

    it("truncates a typed fractional value on an integer field, exactly as parseNumberInput already does elsewhere", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const typed = setFieldText(draft, BOX_SHAPE, "max-x", "12.5");
        expect(typed.fields["max-x"]!.valid).toBe(true);
        expect(typed.fields["max-x"]!.committed).toBe(12);
    });

    it("enforces a control's minimum (radius > 0) on typed input", () => {
        const record: Record<string, PlainValue> = {
            type: "bluemap:circle",
            subtract: false,
            "center-x": 0,
            "center-z": 0,
            radius: 50,
            "min-y": -64,
            "max-y": 320,
        };
        const draft = createShapeDraft(CIRCLE_SHAPE, record);
        const next = setFieldText(draft, CIRCLE_SHAPE, "radius", "-5");
        expect(next.fields["radius"]!.valid).toBe(false);
        expect(next.fields["radius"]!.committed).toBe(50);
    });

    it("rounds a dragged fractional value on an integer field, matching how typing already truncates", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const field = BOX_SHAPE.fields.find((candidate) => candidate.path === "max-x")!;
        const next = setFieldNumber(draft, "max-x", 12.6, field.control);
        expect(next.fields["max-x"]!.committed).toBe(13);
        expect(next.fields["max-x"]!.text).toBe("13");
    });

    it("hasInvalidField reports whether any field currently has bad text", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        expect(hasInvalidField(draft)).toBe(false);
        const invalid = setFieldText(draft, BOX_SHAPE, "max-x", "nope");
        expect(hasInvalidField(invalid)).toBe(true);
    });

    it("draftToRecord always reads the committed number, never invalid displayed text", () => {
        let draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        draft = setFieldText(draft, BOX_SHAPE, "max-x", "not a number");
        const record = draftToRecord(draft, BOX_RECORD);
        expect(record["max-x"]).toBe(100); // the last committed value, not "not a number"
    });

    it("draftToRecord carries over non-numeric keys untouched (a polygon's own point list)", () => {
        const polygonShape = MASK_SHAPES.find((shape) => shape.key === "polygon") as MaskShapeMeta;
        const record: Record<string, PlainValue> = {
            type: "bluemap:polygon",
            subtract: false,
            "min-y": -64,
            "max-y": 320,
            shape: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 10 },
            ],
        };
        const draft = createShapeDraft(polygonShape, record);
        const next = draftToRecord(draft, record);
        expect(next["shape"]).toEqual(record["shape"]);
    });

    it("setDraftSubtract flips the shared switch independent of the numeric fields", () => {
        const draft = createShapeDraft(BOX_SHAPE, BOX_RECORD);
        const next = setDraftSubtract(draft, true);
        expect(next.subtract).toBe(true);
        expect(next.fields["max-x"]!.committed).toBe(100);
        expect(draftToRecord(next, BOX_RECORD)["subtract"]).toBe(true);
    });
});
