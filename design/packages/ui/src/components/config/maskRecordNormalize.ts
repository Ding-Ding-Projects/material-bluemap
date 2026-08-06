/**
 * Filling in a `render-mask` row's own defaults, so `maskGeometry.ts` can be handed a real
 * `MaskConfig` rather than whatever subset of fields a hand-typed or partially-drawn row
 * happens to hold.
 *
 * `ConfigMaskField.vue` stores each shape as exactly what the file says -- a row that never
 * mentions `radius` really does omit it, and `fieldValueOf` supplies `MASK_SHAPES`' own
 * default the moment the UI needs a number to show. This module does the same thing for a
 * whole render-mask list at once, recursively (a blur's nested `masks` needs it too), so a
 * cost estimate over the list sees the same numbers the editor already shows rather than
 * `undefined` turning into `NaN` the moment arithmetic touches it.
 *
 * An entry whose `type` names a shape `MASK_SHAPES` does not recognise is dropped rather
 * than guessed at -- `ConfigMaskField.vue` already shows that row its own "unknown shape"
 * notice, and a cost estimate has nothing honest to say about a shape it cannot identify.
 */

import { MASK_SHAPES, type MaskConfig, type PlainValue } from "@material-bluemap/config";

function formatKey(value: string): string {
    return value.includes(":") ? value : `bluemap:${value}`;
}

function asRecord(value: PlainValue): Record<string, PlainValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

/**
 * Normalises one render-mask list (top-level, or a blur's nested list) into real
 * `MaskConfig` values, filling every field `MASK_SHAPES` documents a default for and
 * dropping any entry whose `type` is not one of the five BlueMap knows about.
 */
export function normalizeMaskList(list: readonly PlainValue[]): MaskConfig[] {
    const normalized: MaskConfig[] = [];
    for (const item of list) {
        const record = asRecord(item);
        const rawType = typeof record["type"] === "string" ? record["type"] : "box";
        const typeKey = formatKey(rawType);
        const shape = MASK_SHAPES.find((candidate) => candidate.formattedKey === typeKey);
        if (shape === undefined) continue;

        const filled: Record<string, PlainValue> = { type: typeKey };
        for (const field of shape.fields) {
            if (field.path === "masks") {
                const nested = record["masks"];
                // A `MaskConfig[]` (specifically a nested `BlurMask`) is not structurally a
                // `PlainValue[]` -- its discriminated-union shapes carry literal `type` tags
                // TypeScript will not fold into an index signature. `filled` becomes a real
                // `MaskConfig` two lines below regardless, so this is exactly the same "build
                // the loose record, cast once at the end" pattern the whole function already
                // uses for every other field.
                filled["masks"] = normalizeMaskList(Array.isArray(nested) ? nested : []) as unknown as PlainValue;
                continue;
            }
            const existing = record[field.path];
            filled[field.path] = existing === undefined ? (field.default as PlainValue) : existing;
        }
        if (filled["subtract"] === undefined) filled["subtract"] = false;

        normalized.push(filled as unknown as MaskConfig);
    }
    return normalized;
}
