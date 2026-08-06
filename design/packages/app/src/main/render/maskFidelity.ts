/**
 * Whether the render mask a person just drew reaches the engine intact — and on which path
 * it does not.
 *
 * This project renders a map through two genuinely different routes, and they do not honour
 * `render-mask` equally:
 *
 *  - **the local desktop render** (`orchestrator.ts`) runs the real upstream BlueMap jar in a
 *    real JVM, which deserialises `render-mask` through the real `CombinedMaskSerializer` —
 *    every shape, `subtract`, any number of them, in full;
 *  - **the cloud/Actions render** (`packages/cli/src/maps.ts`, `maskFor`) is this project's
 *    own TypeScript port, and today it only translates **one single, non-subtracting box
 *    mask**. Anything richer than that — a circle, an ellipse, a polygon, a blur, a
 *    `subtract` shape, or more than one shape — is logged as unsupported and the map renders
 *    **completely unmasked: the whole world**, not a bounding-box approximation of what was
 *    drawn.
 *
 * That gap between "what was drawn" and "what a cloud render actually does" is exactly the
 * silent-substitution failure the drawing surface's own design guidance forbids: an
 * approximation must be visible, never silent. This module is the one place that fact is
 * computed, so a drawing surface can show it before somebody spends CI minutes on a render
 * that quietly ignores the shape they spent time drawing.
 *
 * `checkCloudFidelity` is a deliberate, independent mirror of `maskFor` in
 * `packages/cli/src/maps.ts` rather than a shared import, because `packages/cli` is not
 * reachable from this package's build graph; keep the two in agreement by hand if `maskFor`'s
 * own rule ever changes; `maskFidelity.test.ts` exercises the identical cases that module's
 * own doc comment describes, so a hand-sync it misses is a red test, not a silent drift.
 */

import type { MaskConfig } from "@material-bluemap/config";

export type CloudMaskEffect =
    /** No shapes at all — every path renders the whole world, and that is correct. */
    | "whole-world-no-mask"
    /** The one case `maskFor` translates: exactly one non-subtracting box. */
    | "exact-box"
    /** Every shape drawn is applied in full — always true locally; never true on the cloud path once more than a single box is involved. */
    | "exact-full"
    /** Anything richer, downgraded by `maskFor` to no mask at all. */
    | "whole-world-unsupported";

export interface CloudMaskFidelity {
    /** True only when the cloud render applies exactly the mask that was drawn. */
    readonly honored: boolean;
    readonly effect: CloudMaskEffect;
    /**
     * Named, not guessed: which real feature of the drawn mask is what `maskFor` cannot
     * translate today. `null` when `effect` needs no explanation (`honored` or an empty mask).
     */
    readonly unsupportedReason: string | null;
}

/**
 * A byte-for-byte mirror of `maskFor`'s own decision in `packages/cli/src/maps.ts`: empty is
 * `Mask.ALL`, exactly one non-subtracting box is translated in full, and everything else logs
 * a warning and also becomes `Mask.ALL` — the whole world, unmasked.
 */
export function checkCloudFidelity(masks: readonly MaskConfig[]): CloudMaskFidelity {
    if (masks.length === 0) {
        return { honored: true, effect: "whole-world-no-mask", unsupportedReason: null };
    }

    if (masks.length === 1 && masks[0]!.type === "bluemap:box" && !masks[0]!.subtract) {
        return { honored: true, effect: "exact-box", unsupportedReason: null };
    }

    return { honored: false, effect: "whole-world-unsupported", unsupportedReason: unsupportedReasonFor(masks) };
}

function unsupportedReasonFor(masks: readonly MaskConfig[]): string {
    if (masks.length > 1) {
        return `${masks.length} shapes are configured; the cloud/Actions render path only translates a single shape today.`;
    }
    const only = masks[0]!;
    if (only.subtract) {
        return "This shape is set to subtract; the cloud/Actions render path only translates a single, non-subtracting shape today.";
    }
    switch (only.type) {
        case "bluemap:circle":
            return "This is a circle; the cloud/Actions render path only translates a box shape today.";
        case "bluemap:ellipse":
            return "This is an ellipse; the cloud/Actions render path only translates a box shape today.";
        case "bluemap:polygon":
            return "This is a polygon; the cloud/Actions render path only translates a box shape today.";
        case "bluemap:blur":
            return "This is a blur; the cloud/Actions render path only translates a box shape today.";
        default:
            return "This shape is not translated by the cloud/Actions render path today.";
    }
}

/**
 * What the local desktop render does with the same mask: always the real thing, because the
 * local path runs the genuine upstream jar and deserialises `render-mask` in full. Exists
 * mainly so a caller can render "local: exact / cloud: whole world" side by side without
 * special-casing the local half, and it always agrees with what was drawn.
 */
export function localFidelity(masks: readonly MaskConfig[]): CloudMaskFidelity {
    return {
        honored: true,
        effect: masks.length === 0 ? "whole-world-no-mask" : "exact-full",
        unsupportedReason: null,
    };
}
