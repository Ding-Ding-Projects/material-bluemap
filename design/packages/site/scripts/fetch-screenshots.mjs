#!/usr/bin/env node
/**
 * fetch-screenshots.mjs — collect the app's real captures for the site's gallery.
 *
 * The app's Playwright harness runs in CI and uploads a `screenshots` artifact. This
 * script finds the most recent successful run that still has one, downloads it, checks
 * every file is genuinely a PNG, copies the images into the site's public directory and
 * writes a generated module describing them.
 *
 * When there is no artifact to be had, the generated module says so and gives the
 * reason. The gallery then renders its unavailable state. Nothing is substituted: a
 * placeholder in a gallery of real captures is indistinguishable from a real capture to
 * anyone scrolling, which makes it worse than an empty page.
 *
 * Usage:
 *   node scripts/fetch-screenshots.mjs
 *   node scripts/fetch-screenshots.mjs --repo owner/name --workflow ci.yml --branch main
 *   node scripts/fetch-screenshots.mjs --out-dir public/screenshots --public-path screenshots
 *
 * Needs the GitHub CLI on PATH, authenticated with permission to read Actions. In a
 * workflow that means `permissions: actions: read`, which the deploy workflow declares.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";

import {
    FetchFailure,
    GENERATED_DIR,
    SITE_ROOT,
    gh,
    ghApi,
    log,
    parseArgs,
    readJsonFile,
    resolveRepo,
    writeGeneratedModule,
} from "./shared.mjs";

const SCRIPT = "fetch-screenshots";

const ARTIFACT_NAME = "screenshots";
const DEFAULT_WORKFLOW = "ci.yml";
const DEFAULT_BRANCH = "main";
/** How many recent successful runs to look through before giving up. */
const RUNS_TO_CONSIDER = 20;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Defaults the harness itself establishes. It resets the viewport to 1280 by 800 and the
 * zoom to 1 after the tests that change them, and clears the emulated colour scheme after
 * the theme test, so a capture whose filename does not encode a value was taken at these.
 */
const HARNESS_DEFAULT_WINDOW = "1280 by 800";
const HARNESS_DEFAULT_SCALE = "100%";
const HARNESS_DEFAULT_SCHEME = "system";

const HEADER = [
    "GENERATED FILE. Do not edit by hand.",
    "",
    "Written by `design/packages/site/scripts/fetch-screenshots.mjs`, which downloads the",
    "`screenshots` artifact produced by the app's Playwright harness in CI and copies the",
    "images into the site's public directory. The workflow that deploys the site runs that",
    "script before every build.",
    "",
    "The version committed to the repository is deliberately the unavailable one, so a",
    "fresh clone builds a gallery that says captures are not available rather than one",
    "referencing images that are not in the tree. The images themselves are never",
    "committed; see the `.gitignore` beside the public screenshots directory.",
];

/* -------------------------------------------------------------------------- */
/* PNG validation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Read a PNG's dimensions from its header, or return null if it is not a PNG.
 *
 * This is a validation step as much as a metadata one. Anything in the artifact that is
 * not a decodable PNG header is discarded rather than copied into a directory the site
 * serves.
 */
function readPngHeader(buffer) {
    if (buffer.length < 24) return null;
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width === 0 || height === 0) return null;
    return { width, height };
}

/* -------------------------------------------------------------------------- */
/* Caption derivation                                                         */
/* -------------------------------------------------------------------------- */

function humanLabel(slug) {
    return slug.replace(/[-_]+/g, " ").trim();
}

/**
 * Work out what a capture shows from its filename.
 *
 * The harness composes those names from the same constants it drives the app with, so
 * they are the record of the configuration. Where a name says nothing, the harness
 * defaults above apply. Where a name matches nothing at all, the capture is published
 * with its configuration marked unknown rather than given an invented one.
 */
function describeCapture(file) {
    const stem = file.replace(/\.png$/i, "");

    const scale = /^shell-scale-(\d+)(?:_(\d+))?x$/.exec(stem);
    if (scale) {
        const whole = Number(scale[1]);
        const fraction = scale[2] === undefined ? 0 : Number(`0.${scale[2]}`);
        const percent = Math.round((whole + fraction) * 100);
        return {
            title: `Application shell at ${percent}% display scale`,
            windowSize: HARNESS_DEFAULT_WINDOW,
            displayScale: `${percent}%`,
            colourScheme: HARNESS_DEFAULT_SCHEME,
            configurationKnown: true,
            alt: `The worldlens application window at ${percent} percent display scale, ${HARNESS_DEFAULT_WINDOW} pixels.`,
        };
    }

    const size = /^shell-(\d+)x(\d+)(?:-(.+))?$/.exec(stem);
    if (size) {
        const window = `${size[1]} by ${size[2]}`;
        const qualifier = size[3] === undefined ? "" : ` (${humanLabel(size[3])})`;
        return {
            title: `Application shell at ${window}${qualifier}`,
            windowSize: `${window}${qualifier}`,
            displayScale: HARNESS_DEFAULT_SCALE,
            colourScheme: HARNESS_DEFAULT_SCHEME,
            configurationKnown: true,
            alt: `The worldlens application window at ${window} pixels${qualifier}.`,
        };
    }

    const theme = /^theme-(light|dark)$/.exec(stem);
    if (theme) {
        const scheme = theme[1];
        return {
            title: `Application shell, ${scheme} colour scheme`,
            windowSize: HARNESS_DEFAULT_WINDOW,
            displayScale: HARNESS_DEFAULT_SCALE,
            colourScheme: scheme,
            configurationKnown: true,
            alt: `The worldlens application window rendered with the ${scheme} colour scheme.`,
        };
    }

    const page = /^page-(.+)$/.exec(stem);
    if (page) {
        const label = humanLabel(page[1]);
        return {
            title: `Destination: ${label}`,
            windowSize: HARNESS_DEFAULT_WINDOW,
            displayScale: HARNESS_DEFAULT_SCALE,
            colourScheme: HARNESS_DEFAULT_SCHEME,
            configurationKnown: true,
            alt: `The ${label} destination of the worldlens application, opened from the navigation drawer.`,
        };
    }

    if (stem.startsWith("diagnostic")) {
        const label = humanLabel(stem.replace(/^diagnostic-?/, "")) || "unknown state";
        return {
            title: `Diagnostic capture: ${label}`,
            windowSize: HARNESS_DEFAULT_WINDOW,
            displayScale: HARNESS_DEFAULT_SCALE,
            colourScheme: HARNESS_DEFAULT_SCHEME,
            configurationKnown: true,
            alt: `A diagnostic capture the harness took because the interface did not mount: ${label}.`,
        };
    }

    return {
        title: humanLabel(stem),
        windowSize: "not recorded",
        displayScale: "not recorded",
        colourScheme: HARNESS_DEFAULT_SCHEME,
        configurationKnown: false,
        alt: `A capture named ${file} from the worldlens screenshot harness. Its configuration is not recorded.`,
    };
}

/* -------------------------------------------------------------------------- */
/* Finding an artifact                                                        */
/* -------------------------------------------------------------------------- */

async function findRunWithArtifact(repo, workflow, branch) {
    const query = `repos/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=${RUNS_TO_CONSIDER}`;
    const response = await ghApi(query);
    const runs = Array.isArray(response?.workflow_runs) ? response.workflow_runs : [];

    if (runs.length === 0) {
        throw new FetchFailure(`no successful run of ${workflow} was found on ${branch}`);
    }

    for (const run of runs) {
        if (typeof run?.id !== "number") continue;
        const artifacts = await ghApi(`repos/${repo}/actions/runs/${run.id}/artifacts`);
        const list = Array.isArray(artifacts?.artifacts) ? artifacts.artifacts : [];
        const match = list.find(
            (artifact) =>
                artifact?.name === ARTIFACT_NAME && artifact?.expired !== true && Number(artifact?.size_in_bytes) > 0
        );
        if (match) {
            return {
                runId: String(run.id),
                runUrl: typeof run.html_url === "string" ? run.html_url : `https://github.com/${repo}/actions/runs/${run.id}`,
                commit: typeof run.head_sha === "string" ? run.head_sha : "unknown",
            };
        }
    }

    throw new FetchFailure(
        `none of the last ${runs.length} successful runs of ${workflow} on ${branch} still has an unexpired ${ARTIFACT_NAME} artifact (artifacts expire after 30 days)`
    );
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

/** Remove previously copied images so a stale capture cannot survive into a new build. */
async function clearImages(directory) {
    let entries;
    try {
        entries = await readdir(directory);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.toLowerCase().endsWith(".png")) {
            await rm(join(directory, entry), { force: true });
        }
    }
}

async function collect(repo, workflow, branch, outDir, publicPath) {
    const run = await findRunWithArtifact(repo, workflow, branch);
    log(SCRIPT, `using run ${run.runId} at commit ${run.commit}`);

    const staging = await mkdtemp(join(tmpdir(), "worldlens-screenshots-"));
    try {
        await gh(["run", "download", run.runId, "--repo", repo, "--name", ARTIFACT_NAME, "--dir", staging]);

        const entries = await readdir(staging);
        const manifest = (await readJsonFile(join(staging, "manifest.json"))) ?? {};

        await mkdir(outDir, { recursive: true });
        await clearImages(outDir);

        const captures = [];
        let rejected = 0;

        for (const entry of entries.sort()) {
            if (!entry.toLowerCase().endsWith(".png")) continue;
            // Flatten to a base name so nothing in the archive can name a path outside
            // the directory the site serves.
            const name = basename(entry);
            const bytes = await readFile(join(staging, entry));
            const header = readPngHeader(bytes);
            if (header === null) {
                rejected += 1;
                log(SCRIPT, `discarded ${name}: it is not a decodable PNG`);
                continue;
            }
            await writeFile(join(outDir, name), bytes);
            const description = describeCapture(name);
            captures.push({
                file: name,
                title: description.title,
                windowSize: description.windowSize,
                displayScale: description.displayScale,
                colourScheme: description.colourScheme,
                configurationKnown: description.configurationKnown,
                widthPx: header.width,
                heightPx: header.height,
                byteSize: bytes.length,
                alt: description.alt,
            });
        }

        if (captures.length === 0) {
            throw new FetchFailure(
                `the ${ARTIFACT_NAME} artifact from run ${run.runId} contained no decodable PNG images`
            );
        }

        log(SCRIPT, `kept ${captures.length} captures, discarded ${rejected}`);

        return {
            available: true,
            generatedAt: new Date().toISOString(),
            publicPath,
            provenance: {
                runId: run.runId,
                runUrl: run.runUrl,
                commit: typeof manifest.commit === "string" && manifest.commit.length > 0 ? manifest.commit : run.commit,
                capturedBy:
                    typeof manifest.capturedBy === "string" && manifest.capturedBy.length > 0
                        ? manifest.capturedBy
                        : "design/packages/app/test/screenshots.spec.ts",
                method:
                    typeof manifest.method === "string" && manifest.method.length > 0
                        ? manifest.method
                        : "Playwright driving the real Electron application",
            },
            captures,
        };
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = resolveRepo(args);
    const workflow = typeof args.workflow === "string" ? args.workflow : DEFAULT_WORKFLOW;
    const branch = typeof args.branch === "string" ? args.branch : DEFAULT_BRANCH;
    const publicPath = typeof args["public-path"] === "string" ? args["public-path"] : "screenshots";
    const outDir =
        typeof args["out-dir"] === "string"
            ? resolve(SITE_ROOT, args["out-dir"])
            : resolve(SITE_ROOT, "public", publicPath);
    const out =
        typeof args.out === "string" ? resolve(SITE_ROOT, args.out) : resolve(GENERATED_DIR, "screenshots.ts");

    log(SCRIPT, `repository: ${repo}, workflow: ${workflow}, branch: ${branch}`);

    let value;
    try {
        value = await collect(repo, workflow, branch, outDir, publicPath);
        log(SCRIPT, `images written to ${outDir}`);
    } catch (error) {
        const reason =
            error instanceof FetchFailure
                ? error.message
                : `an unexpected error occurred: ${String(error?.message ?? error)}`;
        value = {
            available: false,
            generatedAt: new Date().toISOString(),
            reason: `No captures are shown for this build: ${reason}.`,
        };
        log(SCRIPT, `no captures: ${reason}`);
        log(SCRIPT, "the gallery will say so rather than showing placeholders, which is the intended fallback");
        // Nothing stale must survive a failed collection.
        await clearImages(outDir).catch(() => undefined);
    }

    await writeGeneratedModule({
        file: out,
        header: HEADER,
        typeName: "ScreenshotAvailability",
        exportName: "screenshotAvailability",
        value,
    });

    log(SCRIPT, `wrote ${out}`);
}

await main();
