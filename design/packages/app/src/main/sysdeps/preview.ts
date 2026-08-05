/**
 * The read-only pass over the dependency table shown BEFORE the install button is
 * pressed: what manager each dependency would use, whether that manager is even on
 * this machine, whether the package is already there, and — pulled straight from
 * `registry.ts`'s own `elevationDisclosure` — exactly what to tell the person about
 * administrator permission before anything runs.
 *
 * Deliberately its own module rather than folded into `install.ts`: a preview and an
 * install are different operations with different costs (one process launch each vs. a
 * real download), and the settings screen needs to call the first long before, and
 * independently of, the second.
 */

import { checkSysdepInstalled, detectPackageManagers, resolveSysdepRoute, SYSDEP_DEPENDENCIES } from "./registry.js";
import type { RunProcess } from "./process.js";
import type { SysdepDescriptor, SysdepManagerId } from "./types.js";

/** What the resolved route for one dependency looks like, before anything runs. */
export type SysdepPreviewRoute =
    | { readonly kind: "package-manager"; readonly manager: SysdepManagerId; readonly packageId: string }
    | { readonly kind: "unsupported"; readonly reason: string }
    | { readonly kind: "unavailable"; readonly reason: string };

/** One row of the preview shown before the install button is pressed. */
export interface SysdepPreviewRow {
    readonly id: string;
    readonly displayName: string;
    readonly route: SysdepPreviewRoute;
    readonly elevation: SysdepDescriptor["elevation"];
    readonly elevationDisclosure: string;
    readonly alreadyInstalled: boolean;
    readonly installedVersion: string | null;
}

/**
 * The read-only pass over every known dependency.
 *
 * Detects winget and Chocolatey exactly once for the whole table, not once per
 * dependency, so the preview is one round of process launches rather than eight.
 * Nothing here installs anything - the whole point is a truthful "here is what would
 * happen" the person reads *before* deciding to press the button.
 */
export async function previewSysdeps(
    run: RunProcess,
    descriptors: readonly SysdepDescriptor[] = SYSDEP_DEPENDENCIES,
): Promise<readonly SysdepPreviewRow[]> {
    const availability = await detectPackageManagers(run);
    const rows: SysdepPreviewRow[] = [];
    for (const descriptor of descriptors) {
        const resolved = resolveSysdepRoute(descriptor, availability);
        if (resolved.kind !== "package-manager") {
            rows.push({
                id: descriptor.id,
                displayName: descriptor.displayName,
                route: resolved,
                elevation: descriptor.elevation,
                elevationDisclosure: descriptor.elevationDisclosure,
                alreadyInstalled: false,
                installedVersion: null,
            });
            continue;
        }
        const presence = await checkSysdepInstalled(run, resolved);
        rows.push({
            id: descriptor.id,
            displayName: descriptor.displayName,
            route: resolved,
            elevation: descriptor.elevation,
            elevationDisclosure: descriptor.elevationDisclosure,
            alreadyInstalled: presence.installed,
            installedVersion: presence.version,
        });
    }
    return rows;
}
