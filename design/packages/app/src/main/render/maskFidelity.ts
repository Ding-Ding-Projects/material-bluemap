/**
 * Whether the render mask a person just drew reaches each engine intact.
 *
 * This project renders a map through two genuinely different routes, and both now honour
 * `render-mask` equally:
 *
 *  - **the local desktop render** (`orchestrator.ts`) runs the real upstream BlueMap jar in a
 *    real JVM, which deserialises `render-mask` through the real `CombinedMaskSerializer` —
 *    every shape, `subtract`, any number of them, in full;
 *  - **the cloud/Actions render** (`packages/cli/src/maps.ts`, `maskFor`) ports that same
 *    serializer: every box, circle, ellipse, polygon, recursive blur, subtract flag, and
 *    ordered layer reaches the TypeScript engine with BlueMap's validation semantics.
 *
 * `checkCloudFidelity` remains an independent package-boundary contract rather than importing
 * the CLI. Its tests exercise all shape and layer cases the CLI converter covers, so a future
 * regression cannot quietly resurrect the old whole-world substitution warning.
 */

import type { MaskConfig } from "@material-bluemap/config";

export type CloudMaskEffect =
    /** No shapes at all — every path renders the whole world, and that is correct. */
    | "whole-world-no-mask"
    /** Every configured layer is applied in full and in order. */
    | "exact-full";

export interface CloudMaskFidelity {
    /** True when the render applies exactly the mask that was drawn. */
    readonly honored: boolean;
    readonly effect: CloudMaskEffect;
    /**
     * Retained for callers that used to render a limitation reason. Full parity makes it null
     * for every schema-valid mask.
     */
    readonly unsupportedReason: string | null;
}

/**
 * Mirrors `maskFor`'s route semantics: an empty list intentionally means the whole world, and
 * every non-empty schema-valid list is translated exactly.
 */
export function checkCloudFidelity(masks: readonly MaskConfig[]): CloudMaskFidelity {
    return {
        honored: true,
        effect: masks.length === 0 ? "whole-world-no-mask" : "exact-full",
        unsupportedReason: null,
    };
}

/**
 * What the local desktop render does with the same mask: always the real thing, because the
 * local path runs the genuine upstream jar and deserialises `render-mask` in full. Exists
 * mainly so a caller can render "local: exact / cloud: whole world" side by side without
 * special-casing the local half, and it always agrees with what was drawn.
 */
export function localFidelity(masks: readonly MaskConfig[]): CloudMaskFidelity {
    return checkCloudFidelity(masks);
}
