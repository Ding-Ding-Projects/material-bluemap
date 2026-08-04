/**
 * Fetching the map a finished run produced, and registering it as a local render.
 *
 * This is the last third of the loop and the only part that writes a map onto this
 * computer, so everything it refuses, it refuses *before* anything is mounted. A CI render
 * that half-worked must never leave something in the map list that opens to an empty
 * world; the failure it would be mistaken for - "the render came out blank" - is one
 * nobody could diagnose without knowing this code exists.
 *
 * ## Reusing the download surface rather than writing a second one
 *
 * The transfer is `download/http.ts`'s {@link downloadToFile}, which resumes an
 * interrupted attempt from a `Range` request, and the unpack is `download/extract.ts`'s
 * {@link extractZip}, which already carries the path-traversal defences. An Actions
 * artifact is not a release asset, so `ReleaseDownloader` itself cannot be pointed at one
 * - but its two primitives can, and that is the difference between reusing the download
 * surface and building a second one beside it.
 *
 * ## Verified, or recorded, and the difference is stated
 *
 * GitHub publishes a `digest` on an artifact when the instance is new enough to have one.
 * When it is there the downloaded bytes are checked against it and a mismatch is a
 * refusal. When it is not, the digest this computer measured is **recorded** and the
 * result says `verified: false`, exactly as `download/downloader.ts` distinguishes the two
 * for a whole asset with no published checksum. Calling a recorded digest a verification
 * would be a claim this code cannot support.
 *
 * ## A map that shipped in parts is refused, not guessed at
 *
 * A world too large for one runner to assemble publishes `map-lowres` plus one
 * `partial-hires-N` per merge group, and the run summary explains how to put them
 * together. Unpacking `map-lowres` on its own would produce a map that loads, shows the
 * overview, and has no detail at any zoom - which looks like a rendering bug rather than
 * a missing download. So it is refused with the reason and the artifacts named.
 */

import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "@material-bluemap/parts";
import { extractZip } from "../download/extract.js";
import { LocalMapHandler } from "../render/LocalMapHandler.js";
import { RENDER_RECORD_VERSION, writeRenderRecord } from "../render/provenance.js";
import type { RenderRecord } from "../render/provenance.js";
import { renderWorkspace } from "../render/workspace.js";
import { RENDERED_MAP_ARTIFACT } from "./actions.js";
import type { WorkflowArtifact } from "./actions.js";
import type { CiTransport } from "./transport.js";

/** The artifact a hierarchical merge publishes instead of a whole map. */
const LOWRES_ARTIFACT = "map-lowres";

export interface CollectFailure {
    readonly code:
        | "no-map-artifact"
        | "map-shipped-in-parts"
        | "artifact-expired"
        | "digest-mismatch"
        | "artifact-not-a-map"
        | "collect-failed";
    readonly message: string;
}

export interface CollectSuccess {
    readonly ok: true;
    /** The id the map is filed under, and mounted at. */
    readonly renderId: string;
    readonly webRoot: string;
    /** What the viewer takes as its `dataRoot`. */
    readonly dataRoot: string;
    readonly bytes: number;
    readonly sha256: string;
    /** True only when GitHub published a digest and the bytes matched it. */
    readonly verified: boolean;
    readonly artifact: WorkflowArtifact;
}

export type CollectResult = CollectSuccess | { readonly ok: false; readonly failure: CollectFailure };

export interface CollectOptions {
    /** Whichever credential route this sync chose. Never a second one. */
    readonly transport: CiTransport;
    readonly signal?: AbortSignal | undefined;
    /** Where maps live. The CI map is unpacked beside every local render, on purpose. */
    readonly storageDir: string;
    /** Where the artifact zip is staged before it is unpacked. */
    readonly artifactFile: string;
    /** The render id to file it under. Always a `ci-` id; never a local render's. */
    readonly renderId: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    /** The world this map is of, recorded so `render.json` explains itself. */
    readonly worldFolder: string;
    /** The commit the workflow ran from: what identifies the renderer exactly. */
    readonly headSha: string;
    readonly repository: string;
    readonly mounts?: LocalMapHandler | undefined;
    readonly appVersion?: string | null | undefined;
    readonly onBytes?: ((done: number, total: number) => void) | undefined;
    readonly startedAt?: string | undefined;
    readonly durationMs?: number | null | undefined;
}

/**
 * Downloads, checks, unpacks and mounts the run's map.
 *
 * Answers rather than throws for every refusal a person could act on. A genuinely
 * unexpected error - a disk that filled, a zip reader that gave up - is caught by the
 * caller and reported as `collect-failed` rather than escaping into the channel.
 */
export async function collectRenderedMap(
    owner: string,
    repo: string,
    runId: number,
    options: CollectOptions,
): Promise<CollectResult> {
    const artifacts = await options.transport.listRunArtifacts(owner, repo, runId);
    const map = artifacts.find((artifact) => artifact.name === RENDERED_MAP_ARTIFACT);

    if (map === undefined) {
        const lowres = artifacts.find((artifact) => artifact.name === LOWRES_ARTIFACT);
        if (lowres !== undefined) {
            const parts = artifacts
                .filter((artifact) => artifact.name.startsWith("partial-hires-"))
                .map((artifact) => artifact.name);
            return refuse(
                "map-shipped-in-parts",
                `This world was too large for one runner to assemble, so the run published ` +
                    `${LOWRES_ARTIFACT} and ${String(parts.length)} hires part` +
                    `${parts.length === 1 ? "" : "s"} (${parts.join(", ") || "none listed"}) instead of ` +
                    `one ${RENDERED_MAP_ARTIFACT}. Nothing was downloaded: unpacking the lowres ` +
                    "artifact on its own would give a map that loads and has no detail at any zoom, " +
                    "which looks like a broken render rather than a missing download. The run " +
                    "summary on GitHub says how to assemble the parts by hand.",
            );
        }
        return refuse(
            "no-map-artifact",
            `Run ${String(runId)} finished but published no ${RENDERED_MAP_ARTIFACT} artifact. It ` +
                `has: ${artifacts.map((artifact) => artifact.name).join(", ") || "no artifacts at all"}.`,
        );
    }

    if (map.expired) {
        return refuse(
            "artifact-expired",
            `The ${RENDERED_MAP_ARTIFACT} artifact from run ${String(runId)} has passed its ` +
                "retention period and GitHub has deleted it. Start the render again; nothing on " +
                "this computer was changed.",
        );
    }

    await options.transport.downloadArtifact(owner, repo, map, options.artifactFile, options.onBytes);

    const sha256 = await sha256File(options.artifactFile, options.signal);
    const published = publishedSha256(map.digest);
    if (published !== null && published !== sha256) {
        // Deleted rather than kept. A file that failed its published digest is the one
        // file on disk that must never be reused, and a resumed download would otherwise
        // see the right length and skip the transfer for ever.
        await rm(options.artifactFile, { force: true }).catch(() => undefined);
        return refuse(
            "digest-mismatch",
            `The ${RENDERED_MAP_ARTIFACT} artifact arrived with SHA-256 ${sha256}, and GitHub ` +
                `published ${published}. Nothing was unpacked and no map was registered.`,
        );
    }

    const workspace = renderWorkspace(options.storageDir, options.renderId);
    // A previous attempt's half-unpacked tree is never merged into: entries it wrote and
    // this artifact does not carry would survive as tiles nobody rendered.
    await rm(workspace.webRoot, { recursive: true, force: true });
    await extractZip(options.artifactFile, workspace.webRoot, {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const looksLikeAMap = await isAMap(workspace.webRoot, options.mapId);
    if (!looksLikeAMap) {
        await rm(workspace.webRoot, { recursive: true, force: true }).catch(() => undefined);
        return refuse(
            "artifact-not-a-map",
            `The ${RENDERED_MAP_ARTIFACT} artifact unpacked without a maps/${options.mapId} folder ` +
                "and a settings.json beside it, so it is not a map this application can serve. " +
                "Nothing was registered.",
        );
    }

    const startedAt = options.startedAt ?? new Date().toISOString();
    const record: RenderRecord = {
        recordVersion: RENDER_RECORD_VERSION,
        renderId: options.renderId,
        engine: "upstream-java",
        // The commit, not a version number. The workflow builds the CLI from the vendored
        // BlueMap sources at this commit, so the commit *is* the exact identity of the
        // renderer that produced these tiles - and unlike a version string, it can be
        // looked up.
        engineVersion: `${options.repository}@${options.headSha.slice(0, 12) || "unknown"} (GitHub Actions)`,
        enginePath: null,
        javaVersion: "21 (temurin, GitHub Actions runner)",
        maps: [
            {
                id: options.mapId,
                name: options.mapName,
                world: options.worldFolder,
                dimension: options.dimension,
            },
        ],
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: "finished",
        failureCode: null,
        durationMs: options.durationMs ?? null,
        appVersion: options.appVersion ?? null,
    };
    await writeRenderRecord(workspace.recordFile, record);

    options.mounts?.setMount({
        renderId: options.renderId,
        webRoot: workspace.webRoot,
        engineLabel: `BlueMap engine (Java), rendered on GitHub Actions`,
    });

    return {
        ok: true,
        renderId: options.renderId,
        webRoot: workspace.webRoot,
        dataRoot: LocalMapHandler.dataRoot(options.renderId),
        bytes: map.sizeInBytes,
        sha256,
        verified: published !== null,
        artifact: map,
    };
}

/** `sha256:<hex>` as GitHub writes it, or null for anything else. */
function publishedSha256(digest: string | null): string | null {
    if (digest === null) return null;
    const match = /^sha256:([0-9a-f]{64})$/i.exec(digest.trim());
    return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Whether what came out of the zip is really a servable map.
 *
 * Both files are checked because either one alone can be there for the wrong reason: an
 * artifact holding only the webapp has a `settings.json` and no tiles, and a truncated
 * merge can leave a `maps/<id>` directory with nothing useful in it. The pair is what the
 * viewer actually needs to open anything.
 */
async function isAMap(webRoot: string, mapId: string): Promise<boolean> {
    const settings = await stat(join(webRoot, "settings.json")).catch(() => null);
    const map = await stat(join(webRoot, "maps", mapId)).catch(() => null);
    return settings !== null && settings.isFile() && map !== null && map.isDirectory();
}

function refuse(
    code: CollectFailure["code"],
    message: string,
): { readonly ok: false; readonly failure: CollectFailure } {
    return { ok: false, failure: { code, message } };
}
