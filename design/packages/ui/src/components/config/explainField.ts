/**
 * The doc-disclosure and default-provenance pair, for the two editors that show a
 * `FieldMeta` without going through `ConfigField.vue`.
 *
 * `ConfigField.vue` has carried this pair since the settings screen shipped: a
 * "show the rest of the explanation" toggle once `field.doc` runs past three
 * lines, and a line underneath the control saying whether the current file wrote
 * this setting or is quietly inheriting BlueMap's own default. That pair applies
 * to every one of the 154 settings a config file's own top-level schema reaches
 * (`configSearch.test.ts` pins that count), because `ConfigFileForm.vue` renders
 * every field of every group through `ConfigField.vue` with no per-field opt-out.
 *
 * A render mask's shape fields (`min-x`, `radius`, `size`, …) and a marker set's
 * own container properties (`label`, `sorting`, `toggleable`, `default-hidden`)
 * are settings in the same honest sense — BlueMap reads them, each carries a real
 * default, and a file can either name one explicitly or fall back — but they
 * reach the user through `ConfigMaskField.vue` and `ConfigMarkerSetsField.vue`
 * instead, one row of an array or one property of a record rather than a whole
 * file's own `EditableConfigFile`. `isExplicit`/`isDefaultValue` in
 * `configModel.ts`/`fieldValue.ts` answer that question for a *file*; this module
 * answers the same question for a *record* — the mask shape's own object, or one
 * marker set's own object — which is the shape both of those editors actually
 * hold.
 *
 * Kept framework-free on purpose, so "does the toggle open at the right length"
 * and "does explicit-vs-inherited come out right" are ordinary function tests
 * rather than requiring a mounted component for every case.
 */

import type { FieldMeta, PlainValue } from "@material-bluemap/config";
import { isDefaultValue, valueToText } from "./fieldValue.js";

/**
 * Lines shown before the "show the rest" toggle appears.
 *
 * Matches `ConfigField.vue`'s own `docIsLong` exactly, so a field explained the
 * same way in two places behaves the same way in both.
 */
export const DOC_PREVIEW_LINES = 3;

export function docLinesOf(doc: string): string[] {
    return doc.split("\n");
}

/** True once a doc has more lines than the collapsed preview shows. */
export function isDocLong(doc: string): boolean {
    return docLinesOf(doc).length > DOC_PREVIEW_LINES;
}

/** The text to show for a doc, given whether it is long and whether it is open. */
export function docShownText(doc: string, open: boolean): string {
    if (!isDocLong(doc) || open) return doc;
    return docLinesOf(doc).slice(0, DOC_PREVIEW_LINES).join("\n");
}

export interface ProvenanceState {
    /** True when the owning record names this key explicitly. */
    readonly explicit: boolean;
    /** True when the effective value (explicit or inherited) equals the field's default. */
    readonly usingDefault: boolean;
    /** The default, rendered the way a value reads elsewhere in the editor. */
    readonly defaultText: string;
}

/**
 * Provenance for a field whose value lives inside a plain record — a render
 * mask's own shape object, or one marker set's own object — rather than inside a
 * whole `EditableConfigFile`.
 *
 * `Object.prototype.hasOwnProperty` rather than `record[field.path] !== undefined`
 * on purpose: BlueMap's own default for several of these fields (a mask's
 * unbounded sentinel, a marker set's own defaults) can legally be written into
 * the record explicitly, and that is still "explicit" even though the value it
 * holds happens to match the default that reading absence would have given
 * anyway. Confusing that with "not set" would tell somebody who wrote a value by
 * hand that they had not.
 */
export function provenanceOf(field: FieldMeta, record: Readonly<Record<string, PlainValue>>): ProvenanceState {
    const explicit = Object.prototype.hasOwnProperty.call(record, field.path);
    const effective = explicit ? record[field.path] : (field.default as PlainValue | undefined);
    return {
        explicit,
        usingDefault: isDefaultValue(field, effective),
        defaultText: valueToText(field.default as PlainValue),
    };
}
