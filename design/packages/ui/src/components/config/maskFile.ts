/**
 * A render mask, shared or reused as its own small file — export and import.
 *
 * `render-mask` already lives inside a map's own `.conf`, but that ties one drawn shape to
 * one map. Somebody who drew a nice outline around their village wants to reuse it on a
 * different map, or send it to somebody else's copy of this app, without hand-copying HOCON.
 * This is that file: a self-describing JSON document holding exactly the mask list
 * `combinedMaskSchema` already validates, plus the units and coordinate convention stated
 * in the file itself so it is still readable years later by someone who has never seen this
 * app's source.
 *
 * The format is deliberately thin — it is a wrapper around the same `MaskConfig[]` the config
 * schema owns, not a second schema to keep in sync with the first. {@link exportMaskFile}
 * and {@link importMaskFile} round-trip through `combinedMaskSchema.parse`, so a file this
 * module writes is guaranteed to be a file this module (or a hand-edited one shaped like it)
 * can read back, and an import that fails says exactly what about the file did not validate
 * rather than silently producing an empty mask.
 */

import { combinedMaskSchema, type MaskConfig } from "@material-bluemap/config";

/** The format's own name, so a file recognises itself before anything else is parsed. */
export const MASK_FILE_FORMAT = "material-bluemap.render-mask";
/** Bumped only if the wrapper shape below changes; the nested masks stay the schema's own. */
export const MASK_FILE_VERSION = 1;

export interface MaskFile {
    readonly format: typeof MASK_FILE_FORMAT;
    readonly version: typeof MASK_FILE_VERSION;
    /**
     * Stated in the file itself rather than assumed, so a reader who has never opened this
     * app's source still knows what the numbers mean. Every mask coordinate is a whole
     * Minecraft block; X and Z are the world's horizontal axes and Y — where a shape has one
     * — is height, both up and down from Y=0.
     */
    readonly units: "blocks";
    readonly coordinateSystem: "minecraft-world-xyz";
    /** ISO 8601, when this file was written. Informational only; import does not require it. */
    readonly exportedAt: string;
    readonly masks: readonly MaskConfig[];
}

/** Builds the exportable document for a mask list. Pure — writing the file is the caller's job. */
export function exportMaskFile(masks: readonly MaskConfig[], now: Date = new Date()): MaskFile {
    return {
        format: MASK_FILE_FORMAT,
        version: MASK_FILE_VERSION,
        units: "blocks",
        coordinateSystem: "minecraft-world-xyz",
        exportedAt: now.toISOString(),
        masks,
    };
}

/** {@link exportMaskFile}, serialised the way a "Save As" dialog would write it to disk. */
export function serializeMaskFile(masks: readonly MaskConfig[], now?: Date): string {
    return `${JSON.stringify(exportMaskFile(masks, now), null, 4)}\n`;
}

export type MaskImportResult =
    | { readonly ok: true; readonly masks: readonly MaskConfig[] }
    | { readonly ok: false; readonly reason: string };

/**
 * Reads a mask file back, validating both the wrapper and every shape inside it through the
 * same `combinedMaskSchema` the config editor already trusts.
 *
 * Never throws: a file that is not JSON, not this format, or holds a shape the schema
 * refuses comes back as `{ ok: false, reason }` with a reason naming what was wrong, so the
 * caller can report it inline rather than silently importing nothing.
 */
export function parseMaskFile(text: string): MaskImportResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, reason: "Not valid JSON." };
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, reason: "Not a render-mask file: expected an object." };
    }
    const record = parsed as Record<string, unknown>;

    if (record["format"] !== MASK_FILE_FORMAT) {
        return { ok: false, reason: `Not a render-mask file: expected format "${MASK_FILE_FORMAT}".` };
    }
    if (typeof record["version"] !== "number" || record["version"] > MASK_FILE_VERSION) {
        return { ok: false, reason: `This file is a newer render-mask format (version ${String(record["version"])}) than this build understands.` };
    }
    if (!Array.isArray(record["masks"])) {
        return { ok: false, reason: 'Not a render-mask file: expected a "masks" list.' };
    }

    const result = combinedMaskSchema.safeParse(record["masks"]);
    if (!result.success) {
        return { ok: false, reason: `One or more shapes did not validate: ${result.error.issues[0]?.message ?? "unknown error"}.` };
    }
    return { ok: true, masks: result.data };
}
