/**
 * Refusing to photograph a build that is older than the code.
 *
 * ## The trap this exists for
 *
 * The screenshot harness launches the real application and photographs what it shows. What
 * it shows is a *built* bundle, and the renderer's bundle is not built by the same command
 * as the main process:
 *
 * - `packages/app` → `npm run build` → `dist/main` and `dist/preload`
 * - `packages/ui`  → `vite build`    → `dist/assets/*.js` and `*.css` ← **everything on screen**
 *
 * So editing a Vue component, rebuilding `packages/app` and re-running the harness produces
 * captures of the *previous* UI, and every one of them passes. The change appears to have
 * done nothing. The natural next move is to change it harder — which is how a correct
 * one-line fix gets rewritten three times while the screenshots quietly show the old build.
 *
 * That happened. A notification toast was fixed, captured, and looked unchanged twice.
 *
 * Nothing about that failure is visible: no error, no warning, and a green run. So it is
 * checked here instead, before the application is ever launched.
 *
 * ## What it checks
 *
 * That every package whose output the harness photographs has a build newer than its
 * sources. Not that the build is *correct* — only that it is not older than the code being
 * tested, which is the one thing a screenshot cannot tell you by looking.
 *
 * It fails closed and names the command to run. A harness that warns about this would be
 * ignored exactly as reliably as no check at all, because the run still goes green.
 */

import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** `packages/app/test` → `packages/` */
const packages = join(here, "..", "..");

interface Built {
    /** For the message: what a person calls this. */
    readonly what: string;
    readonly sources: string;
    readonly output: string;
    /** What to run when it is stale. */
    readonly command: string;
}

const BUILT: readonly Built[] = [
    {
        what: "the user interface (everything the screenshots actually show)",
        sources: join(packages, "ui", "src"),
        output: join(packages, "ui", "dist"),
        command: "pnpm --filter @material-bluemap/ui run build",
    },
    {
        what: "the main process",
        sources: join(packages, "app", "src", "main"),
        output: join(packages, "app", "dist", "main"),
        command: "pnpm --filter @material-bluemap/app run build",
    },
    {
        what: "the preload bridge",
        sources: join(packages, "app", "src", "preload"),
        output: join(packages, "app", "dist", "preload"),
        command: "pnpm --filter @material-bluemap/app run build",
    },
];

/**
 * A test file changing does not change what the application renders, and treating it as if
 * it did would make this check cry wolf on every unit-test edit until somebody disabled it.
 */
function ships(name: string): boolean {
    return !name.endsWith(".test.ts") && !name.endsWith(".test.tsx") && !name.endsWith(".spec.ts");
}

interface Newest {
    readonly at: number;
    readonly file: string;
}

async function newestUnder(directory: string, accept: (name: string) => boolean): Promise<Newest | null> {
    let best: Newest | null = null;
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        // Missing entirely - reported by the caller as "never built", which is a clearer
        // thing to say than "no files found".
        return null;
    }

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            const deeper = await newestUnder(path, accept);
            if (deeper !== null && (best === null || deeper.at > best.at)) best = deeper;
            continue;
        }
        if (!entry.isFile() || !accept(entry.name)) continue;
        const info = await stat(path);
        if (best === null || info.mtimeMs > best.at) best = { at: info.mtimeMs, file: path };
    }
    return best;
}

function ago(milliseconds: number): string {
    const minutes = Math.round(milliseconds / 60_000);
    if (minutes < 1) return "less than a minute";
    if (minutes < 120) return `${String(minutes)} minutes`;
    return `${String(Math.round(minutes / 60))} hours`;
}

export default async function assertBuiltFromCurrentSource(): Promise<void> {
    const complaints: string[] = [];

    for (const target of BUILT) {
        const source = await newestUnder(target.sources, ships);
        const built = await newestUnder(target.output, () => true);

        if (built === null) {
            complaints.push(
                `${target.what} has never been built.\n` +
                    `    expected output in: ${target.output}\n` +
                    `    build it with:      ${target.command}`,
            );
            continue;
        }
        if (source === null) continue;

        if (source.at > built.at) {
            complaints.push(
                `${target.what} was built ${ago(source.at - built.at)} before its sources were last changed.\n` +
                    `    newest source: ${source.file}\n` +
                    `    newest output: ${built.file}\n` +
                    `    rebuild with:  ${target.command}`,
            );
        }
    }

    if (complaints.length === 0) return;

    throw new Error(
        "The screenshots would be of an older build than the code being tested.\n\n" +
            complaints.map((complaint) => `  - ${complaint}`).join("\n\n") +
            "\n\nThis is checked because it is invisible otherwise: a stale bundle produces " +
            "captures that pass\nwhile showing the previous version of the interface, so a " +
            "correct fix looks like it did nothing.\n",
    );
}
