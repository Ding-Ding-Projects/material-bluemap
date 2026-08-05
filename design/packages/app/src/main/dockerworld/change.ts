/**
 * A cheap answer to "has this world changed since last time", for the scheduled-render lane.
 *
 * Cheap is the whole point: this reads file **metadata** - names, sizes, modification times
 * - and never a region file's bytes, so a scheduler can ask before every scheduled run
 * without the cost of the fetch it might decide is unnecessary. A world with a thousand
 * region files answers in a `readdir`/`stat` pass or a single remote `find`, not a copy.
 *
 * ## Only the bind-direct route gets this
 *
 * `resolve.ts` already draws the line this module inherits: `bind-direct` reads straight off
 * a filesystem, local or remote, and that filesystem can be listed without touching Docker at
 * all. `container-copy` and `volume-copy` have no such vantage point - Docker's own
 * filesystem view is reachable only by reading it, `docker cp` included, and `docker cp` is
 * exactly the expensive step a change check exists to avoid taking unnecessarily. Asking for
 * a fingerprint of one of those routes returns `null` rather than a wrong or invented answer.
 * A scheduler that wants incrementality out of a volume-backed world will pay for the copy
 * every time until Docker itself grows a cheaper way to ask - there is no honest way around
 * that today, and this module says so rather than pretending otherwise with a stale flag.
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { CommandRunner } from "../runtime/command.js";
import type { DockerWorldCandidate } from "./resolve.js";

/** One region file's identity, cheap enough to gather for every file in a world every time. */
export interface RegionFingerprint {
    readonly path: string;
    readonly bytes: number;
    /** Unix seconds - `find -printf`/`stat` and Node's own `Stats` agree on that unit. */
    readonly modifiedAt: number;
}

export interface WorldFingerprint {
    readonly regions: readonly RegionFingerprint[];
}

/** True when two fingerprints describe the same set of files in the same state. Order-independent. */
export function fingerprintsEqual(a: WorldFingerprint, b: WorldFingerprint): boolean {
    if (a.regions.length !== b.regions.length) return false;
    const byPath = new Map(a.regions.map((entry) => [entry.path, entry]));
    for (const entry of b.regions) {
        const other = byPath.get(entry.path);
        if (other === undefined || other.bytes !== entry.bytes || other.modifiedAt !== entry.modifiedAt) {
            return false;
        }
    }
    return true;
}

/** Every `.mca` file under `root`, read straight off this process's own filesystem. */
export async function localWorldFingerprint(root: string): Promise<WorldFingerprint> {
    const regions: RegionFingerprint[] = [];
    const walk = async (directory: string): Promise<void> => {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile() && entry.name.endsWith(".mca")) {
                const info = await stat(full);
                regions.push({ path: relative(root, full), bytes: info.size, modifiedAt: Math.floor(info.mtimeMs / 1000) });
            }
        }
    };
    await walk(root);
    return { regions };
}

/**
 * The same fingerprint, gathered from a remote Linux host in one round trip through `find`.
 *
 * `find <root> -name '*.mca' -exec stat --format=%n:%s:%Y {} +` batches every match into as
 * few `stat` invocations as the shell's argument limit allows, rather than one remote command
 * per file - the difference between one SSH round trip and a thousand for a large world.
 * GNU coreutils' `stat --format` is assumed, matching this project's existing remote scope:
 * `remote/target.ts` already validates work directories as POSIX paths for a real Linux host,
 * never a Windows one, so the same assumption holding for the tool this reads with is not a
 * new limitation.
 */
export async function remoteWorldFingerprint(runner: CommandRunner, root: string): Promise<WorldFingerprint> {
    const output = await runner("find", [root, "-name", "*.mca", "-exec", "stat", "--format=%n:%s:%Y", "{}", "+"], {});
    if (!output.ok) return { regions: [] };

    const regions: RegionFingerprint[] = [];
    for (const line of output.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        const lastColon = trimmed.lastIndexOf(":");
        const secondLastColon = trimmed.lastIndexOf(":", lastColon - 1);
        if (lastColon < 0 || secondLastColon < 0) continue;
        const path = trimmed.slice(0, secondLastColon);
        const bytes = Number(trimmed.slice(secondLastColon + 1, lastColon));
        const modifiedAt = Number(trimmed.slice(lastColon + 1));
        if (!Number.isFinite(bytes) || !Number.isFinite(modifiedAt)) continue;
        regions.push({ path: relative(root, path), bytes, modifiedAt });
    }
    return { regions };
}

export interface FingerprintOptions {
    readonly runner?: CommandRunner;
    readonly remote?: boolean;
}

/**
 * The fingerprint for a candidate, or `null` when the route offers no cheap one - see this
 * module's own doc comment for exactly which routes that is and why.
 */
export async function dockerWorldFingerprint(
    candidate: DockerWorldCandidate,
    options: FingerprintOptions = {},
): Promise<WorldFingerprint | null> {
    if (candidate.route !== "bind-direct" || candidate.hostPath === null) return null;
    if (options.remote === true) {
        if (options.runner === undefined) return null;
        return await remoteWorldFingerprint(options.runner, candidate.hostPath);
    }
    return await localWorldFingerprint(candidate.hostPath);
}
