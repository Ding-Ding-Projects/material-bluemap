#!/usr/bin/env node
/**
 * sync-screenshots.mjs — refresh the captures committed at `docs/screenshots/`.
 *
 * The images in this repository are the ones the README, the feature documents and the
 * wiki point at. They come from the Playwright harness in `design/packages/app`, which
 * drives the real packaged application in CI and uploads a `screenshots` artifact; this
 * script downloads the newest artifact from a successful run and writes it here.
 *
 * It exists because the alternative is a person remembering to do it. A surface that
 * changed three commits ago and is still illustrated by a picture of the old one is worse
 * than no picture, because a reader has no way to tell which they are looking at, and the
 * caption underneath will confidently describe the wrong thing.
 *
 * Nothing is generated, edited or substituted. Every file written here came out of a run
 * of the real application, and a missing artifact is reported rather than papered over.
 *
 * Usage:
 *   node scripts/sync-screenshots.mjs
 *   node scripts/sync-screenshots.mjs --run 30930438850     # a specific run
 *   node scripts/sync-screenshots.mjs --check               # report drift, write nothing
 *
 * Needs the GitHub CLI on PATH, authenticated with permission to read Actions.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outDir = join(repoRoot, "docs", "screenshots");

const ARTIFACT = "screenshots";
const WORKFLOW = "ci.yml";
const BRANCH = "main";

/** The first eight bytes of every PNG. A file that does not start with these is not one. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Files kept beside the images.
 *
 * `captions.md` is what a person reads and what gets pasted into an issue; `manifest.json`
 * records which commit and which run produced the set, and which surfaces were not
 * captured. Both are part of the evidence, so both are committed with the pictures.
 */
const SIDECARS = new Set(["captions.md", "manifest.json"]);

function log(message) {
    process.stdout.write(`[sync-screenshots] ${message}\n`);
}

function gh(args) {
    return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function digest(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The newest run that actually has an artifact to give.
 *
 * A successful run is not enough on its own: artifacts expire, and a run whose capture job
 * was skipped is successful and empty. So this walks back through recent runs and takes the
 * first that still holds one, rather than asking for the newest and reporting a failure
 * when its artifact has aged out.
 */
function findRun(explicit) {
    if (explicit !== undefined) return { id: explicit, commit: null, note: "named on the command line" };

    const runs = JSON.parse(
        gh([
            "run",
            "list",
            "--workflow",
            WORKFLOW,
            "--branch",
            BRANCH,
            "--limit",
            "20",
            "--json",
            "databaseId,headSha,conclusion,createdAt",
        ]),
    );

    for (const run of runs) {
        if (run.conclusion !== "success" && run.conclusion !== "failure") continue;
        const names = JSON.parse(gh(["api", `repos/{owner}/{repo}/actions/runs/${run.databaseId}/artifacts`]));
        const found = (names.artifacts ?? []).some((a) => a.name === ARTIFACT && a.expired !== true);
        if (!found) continue;
        return {
            id: String(run.databaseId),
            commit: run.headSha,
            note: `run ${run.databaseId} on ${String(run.headSha).slice(0, 12)}, ${run.createdAt}`,
        };
    }
    return null;
}

async function main() {
    const argv = process.argv.slice(2);
    const check = argv.includes("--check");
    const runIndex = argv.indexOf("--run");
    const explicit = runIndex >= 0 ? argv[runIndex + 1] : undefined;

    const run = findRun(explicit);
    if (run === null) {
        log("no recent run still holds a screenshots artifact; nothing was written");
        process.exitCode = 1;
        return;
    }
    log(`using ${run.note}`);

    const staging = await mkdtemp(join(tmpdir(), "worldlens-shots-"));
    try {
        gh(["run", "download", run.id, "--name", ARTIFACT, "--dir", staging]);

        const incoming = new Map();
        for (const name of await readdir(staging)) {
            if (name.endsWith(".caption.txt")) continue; // The captions live in captions.md.
            const bytes = await readFile(join(staging, name));
            if (name.endsWith(".png")) {
                if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
                    throw new Error(`${name} is not a PNG; refusing to commit it as a capture`);
                }
            } else if (!SIDECARS.has(name)) {
                continue;
            }
            incoming.set(name, bytes);
        }

        if (incoming.size === 0) throw new Error("the artifact held no captures");

        const existing = new Map();
        if (existsSync(outDir)) {
            for (const name of await readdir(outDir)) {
                existing.set(name, await readFile(join(outDir, name)));
            }
        }

        const added = [...incoming.keys()].filter((name) => !existing.has(name)).sort();
        const changed = [...incoming.entries()]
            .filter(([name, bytes]) => existing.has(name) && digest(existing.get(name)) !== digest(bytes))
            .map(([name]) => name)
            .sort();
        // Kept, not deleted: a capture that this run could not take is a gap in this run,
        // and removing the picture a document still links to turns one missing surface into
        // a broken page. `manifest.json` is where a missing surface is reported.
        const onlyHere = [...existing.keys()].filter((name) => !incoming.has(name)).sort();

        for (const name of [...added, ...changed]) log(`  ${added.includes(name) ? "new" : "updated"}  ${name}`);
        for (const name of onlyHere) log(`  kept (not in this run)  ${name}`);

        if (check) {
            const drift = added.length + changed.length;
            log(drift === 0 ? "committed captures match the latest run" : `${drift} file(s) would change`);
            process.exitCode = drift === 0 ? 0 : 1;
            return;
        }

        await mkdir(outDir, { recursive: true });
        for (const [name, bytes] of incoming) await writeFile(join(outDir, name), bytes);
        log(`wrote ${incoming.size} file(s): ${added.length} new, ${changed.length} updated, ${onlyHere.length} kept`);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

await main();
