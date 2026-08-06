/**
 * A launcher root that holds many instances, each with its own `saves`.
 *
 * `mounts.ts` already understands two shapes: a Minecraft installation (one `saves` folder)
 * and a `saves` folder handed over directly. A third shape exists on real machines and is
 * not either of those - a launcher's own root, under which *many* separate instances each
 * keep their own `saves`. Reading one level down from a root like that finds an `Instances`
 * directory and nothing that looks like a world, and the existing single-folder resolution
 * would refuse it as "neither a Minecraft installation nor a saves folder", which is true
 * and useless: the worlds are two levels down, one `Instances/<name>/saves` at a time.
 *
 * ## What is actually recognised
 *
 * The check is the shape - an `Instances` directory (any case) whose children each hold a
 * `saves` folder - not any particular launcher's name. That shape was confirmed for real on
 * a development machine with CurseForge installed:
 *
 * ```
 * <CurseForge root>\minecraft\Instances\<Instance Name>\saves
 * ```
 *
 * each instance folder also carrying a `minecraftinstance.json` beside its `saves`, which
 * this module does not read - the `saves` folder alone is enough to say "this looks like an
 * instance", and reading a JSON file per candidate would be more filesystem work than the
 * answer is worth. Nothing here is specific to CurseForge in code: a different launcher that
 * happens to share the same `Instances/<name>/saves` convention is recognised too, and one
 * that does not is refused, exactly as a single folder that is neither an installation nor a
 * `saves` folder is refused today. See `locations.ts` for exactly what is and is not offered
 * as an auto-detected *default* - this module only answers "does this folder, if pointed at,
 * turn out to be a multi-instance root", which `mounts.ts` calls both for a folder a person
 * mounts by hand and for the CurseForge default candidate.
 *
 * ## Cost
 *
 * Two directory reads at most (the root's own listing, then each instance's own for its
 * `saves` child) and nothing past that - no `level.dat`, no world contents, no recursion
 * into a `saves` folder's own worlds. That is `catalog.ts`'s job, once a `saves` path has
 * been found. A launcher root with more instances than {@link MAX_INSTANCES} is truncated
 * rather than walked without bound, the same bound `mounts.ts` and `catalog.ts` both apply
 * to their own listings.
 */

import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

/** Most instances read from one launcher root. Generous; the cap exists so a read stays bounded. */
export const MAX_INSTANCES = 128;

export interface LauncherInstance {
    /** The instance's own folder name, used as its row's label. */
    readonly name: string;
    /** The instance's own folder, e.g. `...\Instances\Day Teet`. */
    readonly installationPath: string;
    /** The `saves` folder inside it. Not guaranteed to exist yet - `mounts.ts` checks that. */
    readonly savesPath: string;
}

/** The child directory named `name`, case-insensitively, or null when there is not one. */
async function findChildDirectoryCI(folder: string, name: string): Promise<string | null> {
    const wanted = name.toLowerCase();
    let dir;
    try {
        dir = await opendir(folder);
    } catch {
        return null;
    }
    for await (const child of dir) {
        if (child.isDirectory() && child.name.toLowerCase() === wanted) return join(folder, child.name);
    }
    return null;
}

/** Every immediate subdirectory of `instancesRoot` that has (or should have) its own `saves`. */
async function instancesUnder(instancesRoot: string): Promise<LauncherInstance[]> {
    const found: LauncherInstance[] = [];
    let dir;
    try {
        dir = await opendir(instancesRoot);
    } catch {
        return found;
    }
    for await (const child of dir) {
        if (!child.isDirectory()) continue;
        if (found.length >= MAX_INSTANCES) break;
        const installationPath = join(instancesRoot, child.name);
        const saves = (await findChildDirectoryCI(installationPath, "saves")) ?? join(installationPath, "saves");
        found.push({ name: child.name, installationPath, savesPath: saves });
    }
    return found;
}

/**
 * Looks for a launcher's multi-instance layout at `chosen`, or one level inside it.
 *
 * Three ways in, so both "point at the launcher's own folder" and "point straight at its
 * Instances directory" work: `chosen` itself may already be named `Instances`; it may hold
 * an `Instances` child directly (a launcher's per-game folder, e.g. CurseForge's own
 * `minecraft` folder); or it may hold one one level further down, at `minecraft/Instances`
 * (CurseForge's own root, one level above that folder), which is what a person handed the
 * launcher's outermost install folder would have mounted.
 *
 * Returns null when nothing matching this shape was found - never an empty array standing
 * in for "not a launcher root", which would be indistinguishable from "found zero
 * instances" and would leave `resolveMinecraftFolder` unable to tell "refuse this folder"
 * from "accept it, empty for now".
 */
export async function detectLauncherRoot(chosen: string): Promise<readonly LauncherInstance[] | null> {
    const own = await lstat(chosen).catch(() => null);
    if (own === null || !own.isDirectory()) return null;

    const baseName = chosen.replace(/[\\/]+$/, "");
    const cut = Math.max(baseName.lastIndexOf("/"), baseName.lastIndexOf("\\"));
    const name = cut < 0 ? baseName : baseName.slice(cut + 1);

    if (name.toLowerCase() === "instances") {
        const instances = await instancesUnder(chosen);
        return instances.length > 0 ? instances : null;
    }

    // Two levels checked directly, since the CI child lookup only resolves one path
    // segment at a time: the immediate `Instances` child, then `minecraft`'s own
    // `Instances` child (CurseForge's own root, one level above its `minecraft` folder).
    const direct = await findChildDirectoryCI(chosen, "Instances");
    if (direct !== null) {
        const instances = await instancesUnder(direct);
        if (instances.length > 0) return instances;
    }

    const minecraftFolder = await findChildDirectoryCI(chosen, "minecraft");
    if (minecraftFolder !== null) {
        const nested = await findChildDirectoryCI(minecraftFolder, "Instances");
        if (nested !== null) {
            const instances = await instancesUnder(nested);
            if (instances.length > 0) return instances;
        }
    }

    return null;
}
