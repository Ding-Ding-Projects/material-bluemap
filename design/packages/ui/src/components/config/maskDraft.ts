/**
 * One render-mask shape's numeric fields and its drawn geometry, kept as one synchronised
 * value with two entry points.
 *
 * This is the bidirectional-binding half of the render-mask drawing surface, built on the
 * same discipline `ConfigRegexBuilder.vue`/`regexEngine.ts` already use for pattern and
 * flags: neither the numeric fields nor the drawn shape is the master. Typing a coordinate
 * calls {@link setFieldText}; dragging a handle on a canvas calls {@link setFieldNumber}.
 * Both return a new, immutable {@link ShapeDraft}, and neither one clobbers the other:
 *
 *  - typing an invalid or partial number (`""`, `"-"`, `"12."`, `"abc"`) updates the text the
 *    user sees and reports the problem in {@link MaskFieldDraft.error}, but leaves
 *    {@link MaskFieldDraft.committed} — the number the drawing is built from — exactly as it
 *    was, so a shape mid-edit never jumps somewhere absurd because of a stray keystroke;
 *  - dragging always produces a valid, in-range number, so it always updates both the text
 *    (formatted for redisplay) and the committed value together.
 *
 * {@link draftToRecord} is the only place the two are reconciled into the plain
 * `Record<string, PlainValue>` that `ConfigMaskField.vue`'s own `v-model` already speaks: it
 * always reads `committed`, never `text`, so a field currently showing invalid text still
 * saves and draws using the last value that was actually valid.
 */

import type { Control, FieldMeta, MaskShapeMeta, PlainValue } from "@material-bluemap/config";
import { parseNumberInput } from "./fieldValue.js";

export interface MaskFieldDraft {
    readonly path: string;
    /** Exactly what is currently displayed in the numeric field, valid or not. */
    readonly text: string;
    /** The last value that parsed cleanly — what the drawing and the saved record use. */
    readonly committed: number;
    /** Whether `text` right now parses to a legal value for this field. */
    readonly valid: boolean;
    /** A short, inline reason `text` does not currently commit, or `null` when it is valid. */
    readonly error: string | null;
}

export interface ShapeDraft {
    readonly typeKey: string;
    readonly subtract: boolean;
    /** Numeric fields only — `type`/`subtract` are tracked separately, and `shape` (a
     * polygon's point list) is not a single number, so it stays in the surrounding record and
     * is edited by whatever list control the polygon outline uses. */
    readonly fields: Readonly<Record<string, MaskFieldDraft>>;
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(value);
}

function numericFieldsOf(shape: MaskShapeMeta): readonly FieldMeta[] {
    return shape.fields.filter((field) => field.control.kind === "number");
}

/** Builds a fresh draft from a shape's own metadata and its current record. */
export function createShapeDraft(shape: MaskShapeMeta, record: Readonly<Record<string, PlainValue>>): ShapeDraft {
    const fields: Record<string, MaskFieldDraft> = {};
    for (const field of numericFieldsOf(shape)) {
        const raw = record[field.path];
        const committed = typeof raw === "number" ? raw : (field.default as number);
        fields[field.path] = { path: field.path, text: formatNumber(committed), committed, valid: true, error: null };
    }
    return { typeKey: shape.formattedKey, subtract: record["subtract"] === true, fields };
}

/**
 * Validates a number against a `number` control's own bounds, the same rules
 * `ConfigControl.vue`'s spin box already enforces, restated here so a drag gesture and a typed
 * value are held to one rule rather than two that could quietly disagree.
 */
function validateAgainstControl(value: number, control: Control): string | null {
    if (control.kind !== "number") return null;
    if (control.integer && !Number.isInteger(value)) return "Whole numbers only.";
    if (control.min !== undefined && value < control.min) return `Must be at least ${control.min}.`;
    if (control.max !== undefined && value > control.max) return `Must be at most ${control.max}.`;
    return null;
}

/**
 * The typing path: sets one field's raw displayed text.
 *
 * A field not in `shape.fields`, or an unparseable value, is refused as `"invalid"` by
 * {@link parseNumberInput} without discarding the raw text — the field keeps showing exactly
 * what was typed, `committed` is untouched, and `error` explains why nothing committed yet.
 * An empty or bare-sign text (`""`, `"-"`, `"+"`) is treated the same way: it is a value the
 * user is visibly still typing, not a request to blank the field.
 */
export function setFieldText(draft: ShapeDraft, shape: MaskShapeMeta, path: string, text: string): ShapeDraft {
    const field = shape.fields.find((candidate) => candidate.path === path);
    const previous = draft.fields[path];
    if (field === undefined || field.control.kind !== "number" || previous === undefined) return draft;

    const parsed = parseNumberInput(text, field.control.integer);

    if (parsed === "invalid" || parsed === null) {
        return {
            ...draft,
            fields: {
                ...draft.fields,
                [path]: { ...previous, text, valid: false, error: parsed === "invalid" ? "Not a number." : "Still typing." },
            },
        };
    }

    const boundsError = validateAgainstControl(parsed, field.control);
    if (boundsError !== null) {
        return { ...draft, fields: { ...draft.fields, [path]: { ...previous, text, valid: false, error: boundsError } } };
    }

    return { ...draft, fields: { ...draft.fields, [path]: { path, text, committed: parsed, valid: true, error: null } } };
}

/**
 * The dragging/geometry path: sets one field's numeric value directly, from a handle moved on
 * the drawing surface. Always produces a valid field: an integer field (every mask coordinate
 * is one — block coordinates have no fractional part) is rounded to the nearest whole block,
 * exactly as a typed fractional value already truncates in {@link setFieldText}, so dragging
 * and typing round the same way rather than one silently drifting sub-block from the other.
 */
export function setFieldNumber(draft: ShapeDraft, path: string, value: number, control?: Control): ShapeDraft {
    if (draft.fields[path] === undefined) return draft;
    const rounded = control?.kind === "number" && control.integer ? Math.round(value) : value;
    return { ...draft, fields: { ...draft.fields, [path]: { path, text: formatNumber(rounded), committed: rounded, valid: true, error: null } } };
}

/** Sets the shared `subtract` switch, independent of the per-field numeric drafts. */
export function setDraftSubtract(draft: ShapeDraft, subtract: boolean): ShapeDraft {
    return { ...draft, subtract };
}

/** True while any field currently shows text that has not committed. */
export function hasInvalidField(draft: ShapeDraft): boolean {
    return Object.values(draft.fields).some((field) => !field.valid);
}

/**
 * The record to write back through `ConfigMaskField.vue`'s `v-model`, and what a drawing
 * surface should render as "what will actually save".
 *
 * Always built from `committed`, never `text`: a field currently showing invalid or
 * partial text does not reach the saved shape or move the drawing, exactly as the module doc
 * promises. Non-numeric keys already on `record` (`shape` for a polygon's points, `masks` for
 * a blur's nested list) are carried over untouched, since this module only owns the numeric
 * fields.
 */
export function draftToRecord(draft: ShapeDraft, record: Readonly<Record<string, PlainValue>>): Record<string, PlainValue> {
    const next: Record<string, PlainValue> = { ...record, type: draft.typeKey, subtract: draft.subtract };
    for (const field of Object.values(draft.fields)) next[field.path] = field.committed;
    return next;
}
