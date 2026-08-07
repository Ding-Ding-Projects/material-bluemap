/**
 * Refusing to check a coverage manifest against a build that is older than the code.
 *
 * ## The trap this exists for
 *
 * `configExplainCoverage.test.ts` imports `MASK_SHAPES`, `MARKER_SET_FIELDS` and friends
 * from `"@worldlens/config"`. That specifier resolves through the package's own
 * `package.json`, whose `main` points at `dist/index.js` - a build `tsc -p tsconfig.json`
 * produces, not the `src/` this repository edits and reviews. `dist/` is git-ignored (see
 * `design/.gitignore`), so a fresh clone has none at all, and a checkout that has one is
 * only ever as current as whenever `packages/config`'s build last ran.
 *
 * The consequence is the same one `packages/app/test/freshBundle.ts` documents for the
 * screenshot harness: editing `mask.ts`'s doc text, or adding a field to
 * `MARKER_SET_FIELDS`, and then running this suite without rebuilding `packages/config`
 * first produces a **green** run that checked the *previous* schema. Nothing about that
 * is visible - no error, no warning - because the import itself succeeds; it simply
 * resolves to yesterday's `dist/index.js`. A coverage test that can silently grade a stale
 * build is worse than no coverage test, because a real regression in the current source
 * has somewhere to hide that reads as "already covered".
 *
 * ## What this checks, and does not
 *
 * That `packages/config/dist` is not older than `packages/config/src` - not that the
 * build is *correct*, which is what the rest of this suite is for. It fails closed and
 * names the exact command to run, for the same reason `freshBundle.ts` does: a check that
 * only warns is a check that stays ignored right up until the day it would have mattered.
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** `packages/ui/src/components/config` → `packages/config` */
const configPackageRoot = join(here, "..", "..", "..", "..", "config");
const CONFIG_SRC = join(configPackageRoot, "src");
const CONFIG_DIST = join(configPackageRoot, "dist");
const REBUILD_COMMAND = "pnpm --filter @worldlens/config run build";

interface Newest {
    readonly at: number;
    readonly file: string;
}

/** The newest mtime under a directory, recursively. Null when the directory has nothing. */
function newestUnder(directory: string): Newest | null {
    let entries;
    try {
        entries = readdirSync(directory, { withFileTypes: true });
    } catch {
        // Missing entirely - `dist/` on a fresh clone, before any build has ever run.
        return null;
    }

    let best: Newest | null = null;
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            const deeper = newestUnder(path);
            if (deeper !== null && (best === null || deeper.at > best.at)) best = deeper;
            continue;
        }
        if (!entry.isFile()) continue;
        const info = statSync(path);
        if (best === null || info.mtimeMs > best.at) best = { at: info.mtimeMs, file: path };
    }
    return best;
}

function minutesAgo(milliseconds: number): string {
    const minutes = Math.round(milliseconds / 60_000);
    return minutes < 1 ? "under a minute" : `${String(minutes)} minutes`;
}

/**
 * The check itself, over whichever two directories and rebuild command are given.
 *
 * Separated from {@link assertConfigPackageFresh} so a test can prove the mtime
 * comparison against real, disposable temp directories with known timestamps rather
 * than against this repository's own build state, which is a moving target no test
 * should depend on. Returns the message a stale or missing build should be reported
 * with, or `null` when the build is current.
 */
export function staleBuildMessage(sourceDir: string, distDir: string, rebuildCommand: string): string | null {
    const dist = newestUnder(distDir);
    if (dist === null) {
        return (
            `Nothing has ever been built into ${distDir}, so an import resolving through it ` +
            `would find nothing.\n    build it with: ${rebuildCommand}\n`
        );
    }

    const src = newestUnder(sourceDir);
    if (src === null || src.at <= dist.at) return null;

    return (
        `The build in ${distDir} is older than its own source.\n` +
        `    newest source: ${src.file}\n` +
        `    newest build:  ${dist.file}\n` +
        `    built ${minutesAgo(src.at - dist.at)} before the source that would invalidate it\n` +
        `    rebuild with:  ${rebuildCommand}\n`
    );
}

/**
 * Throws when `packages/config/dist` was built before `packages/config/src` was last
 * changed, or was never built at all. Call this at module load, before any test in the
 * file runs, so a stale build fails the run instead of quietly passing against it.
 */
export function assertConfigPackageFresh(): void {
    const message = staleBuildMessage(CONFIG_SRC, CONFIG_DIST, REBUILD_COMMAND);
    if (message === null) return;

    throw new Error(
        "This suite imports @worldlens/config through its built dist/, which is not " +
            "current.\n\n" +
            message +
            "\nThis is checked because it is invisible otherwise: a stale dist/ still imports " +
            "successfully, so this suite would silently grade the previous schema while " +
            "reporting the current one covered.\n",
    );
}
