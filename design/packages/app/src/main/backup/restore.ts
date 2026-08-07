/**
 * Restoring a backup: reading the pointer, fetching every part, rejoining, unpacking.
 *
 * The twin of `runner.ts`, and its mirror image exactly as `download/downloader.ts` is the
 * mirror of `cirender/upload.ts`. That module packs, splits and uploads; this one downloads,
 * rejoins and unpacks. They meet at the Cheap LFS pointer.
 *
 * ## Why this exists at all, and is not `main/download/`
 *
 * The barrel comment in `index.ts` used to say a backup is restored by handing its release
 * to `main/download/`, "the surface that already fetches parts, verifies each one, rejoins
 * them and unpacks". That was never true. `main/download/` understands exactly one split
 * format: a `<name>.parts.json` manifest beside `<name>.001`, `<name>.002`, ... - the format
 * `@worldlens/parts` writes for CI-rendered maps and world sources. A backup's parts
 * are named `<archive>.<index>-<sha16>` by `partAssetName` in `runner.ts`, and no
 * `.parts.json` is ever published beside them - the Cheap LFS pointer is the manifest, and
 * it is a different shape on purpose, because it has to stay byte-for-byte what
 * `desktop-material`'s own parser accepts. `main/download/`'s `availableDownloads` does not
 * recognise a Cheap LFS release as a split download at all: every part shows up as its own
 * unrelated whole file, and the archive name the pointer names is not the name of any single
 * asset on the release. Handing a backup's coordinates to that surface could not have worked,
 * and nothing before this file ever exercised it against a real release to find out.
 *
 * This module is what actually restores one, by translating the pointer into a
 * `@worldlens/parts` `PartsManifest` in memory - same digests, same total, same part
 * order, just relabelled into the shape `joinParts` already knows how to verify and rejoin -
 * so the rejoin itself is not reimplemented, only pointed at translated data.
 *
 * ## Order and safety, mirrored from `runner.ts`
 *
 * A release is only a *finished* backup once its pointer is up, and this refuses to restore
 * one that is not: an upload that stopped part-way has no whole-file digest to check a
 * rejoin against, and "restore this" would mean "trust whatever arrives", which is the one
 * thing the pointer format exists to make unnecessary.
 *
 * Every part is fetched with a resumable ranged request and verified against its own
 * SHA-256 before the rejoin trusts it; the rejoin then re-verifies the whole file against
 * the pointer's own digest, exactly as a fresh Cheap LFS restore in `desktop-material` would.
 * Nothing downstream of a failed digest is unpacked.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { joinParts, sha256File } from "@worldlens/parts";
import type { PartRecord, PartsManifest } from "@worldlens/parts";
import { downloadToFile, isAbort } from "../download/http.js";
import { extractZip } from "../download/extract.js";
import { MAX_SIDECAR_BYTES, SIDECAR_ASSET_NAME, parseSidecar } from "./sidecar.js";
import type { BackupSidecar } from "./sidecar.js";
import {
    CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
    CHEAP_LFS_PART_SIZE_BYTES,
    POINTER_ASSET_SUFFIX,
    readPointer,
} from "./pointer.js";
import type { CheapLfsPointer } from "./pointer.js";
import { findReleaseByTag, readTextAsset } from "./github.js";
import type { FetchLike, GitHubCallOptions, ReleaseAssetInfo } from "./github.js";
import { restoreArchivePath, restoreIdFor, restoreWorkspace } from "./workspace.js";
import type { BackupSourceKind } from "./source.js";

export type RestorePhase = "reading" | "downloading" | "joining" | "extracting" | "finished";

export interface RestoreTaskProgress {
    readonly phase: RestorePhase;
    readonly description: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    readonly currentPart: string | null;
    /** 0 to 100, across every phase. An estimate; the byte counts are exact. */
    readonly percent: number;
}

export interface RestoreFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
}

export interface RestoreSummary {
    readonly restoreId: string;
    readonly repository: string;
    readonly tag: string;
    readonly archive: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly parts: number;
    readonly kind: BackupSourceKind;
    readonly label: string;
    /** Where the archive unpacked to. */
    readonly contentFolder: string;
}

export type RestoreEvent =
    | {
          readonly type: "started";
          readonly restoreId: string;
          readonly repository: string;
          readonly tag: string;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly restoreId: string; readonly phase: RestorePhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly restoreId: string;
          readonly phase: RestorePhase;
          readonly task: RestoreTaskProgress;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly restoreId: string;
          readonly summary: RestoreSummary;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly restoreId: string; readonly failure: RestoreFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly restoreId: string; readonly at: string };

export interface RestoreRequest {
    readonly owner: string;
    readonly repo: string;
    readonly tag: string;
}

export type RestoreResult =
    | { readonly ok: true; readonly restoreId: string; readonly summary: RestoreSummary; readonly durationMs: number }
    | { readonly ok: false; readonly restoreId: string; readonly failure: RestoreFailure };

export interface BackupRestoreRunnerOptions {
    /** Where a restore is staged and unpacked. A function, for the same reason a backup's is. */
    readonly storageDir: () => string;
    readonly token: () => Promise<string | null> | string | null;
    readonly fetch?: FetchLike | undefined;
    readonly onEvent?: ((event: RestoreEvent) => void) | undefined;
    readonly now?: (() => number) | undefined;
    readonly apiBase?: string | undefined;
}

export class BackupRestoreRunner {
    readonly #options: BackupRestoreRunnerOptions;
    readonly #running = new Map<string, AbortController>();

    constructor(options: BackupRestoreRunnerOptions) {
        this.#options = options;
    }

    activeRestoreIds(): string[] {
        return [...this.#running.keys()];
    }

    cancel(restoreId: string): boolean {
        const controller = this.#running.get(restoreId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    async restore(request: RestoreRequest): Promise<RestoreResult> {
        const startedAt = this.#clock();
        const owner = request.owner.trim();
        const repo = request.repo.trim();
        const tag = request.tag.trim();
        const restoreId = restoreIdFor(owner, repo, tag);

        if (owner === "" || repo === "" || tag === "") {
            return this.#failed(restoreId, {
                code: "invalid-request",
                message: "A restore needs a repository owner, name and release tag.",
            });
        }

        const token = await this.#token();
        if (token === null) {
            return this.#failed(restoreId, {
                code: "signed-out",
                message:
                    "Nobody is signed in to GitHub on this computer, so there is nowhere to read a" +
                    " backup from. Sign in from Settings, then try again.",
            });
        }

        const controller = new AbortController();
        this.#running.set(restoreId, controller);
        this.emit({
            type: "started",
            restoreId,
            repository: `${owner}/${repo}`,
            tag,
            at: this.#timestamp(),
        });

        try {
            const summary = await this.#run({ owner, repo, tag, restoreId, token, signal: controller.signal });
            const durationMs = this.#clock() - startedAt;
            this.emit({ type: "finished", restoreId, summary, durationMs, at: this.#timestamp() });
            return { ok: true, restoreId, summary, durationMs };
        } catch (error) {
            if (controller.signal.aborted || isAbort(error)) {
                this.emit({ type: "cancelled", restoreId, at: this.#timestamp() });
                return {
                    ok: false,
                    restoreId,
                    failure: {
                        code: "cancelled",
                        message:
                            "The restore was stopped. What was already downloaded and verified is kept," +
                            " so starting it again carries on rather than starting over.",
                        detail: null,
                    },
                };
            }
            return this.#failed(restoreId, failureFromError(error));
        } finally {
            this.#running.delete(restoreId);
        }
    }

    /* ---------------------------------------------------------------------- */

    async #run(context: {
        owner: string;
        repo: string;
        tag: string;
        restoreId: string;
        token: string;
        signal: AbortSignal;
    }): Promise<RestoreSummary> {
        const { owner, repo, tag, restoreId, signal } = context;
        this.#phase(restoreId, "reading");

        const callOptions: GitHubCallOptions = {
            fetch: this.#options.fetch ?? ((url, init) => fetch(url, init)),
            token: context.token,
            signal,
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
        };

        const release = await findReleaseByTag(owner, repo, tag, callOptions);
        if (release === null) {
            throw new RestoreRefusal(
                "not-found",
                `There is no release tagged ${tag} on ${owner}/${repo}.`,
            );
        }

        const sidecarAsset = release.assets.find((asset) => asset.name === SIDECAR_ASSET_NAME);
        if (sidecarAsset === undefined) {
            throw new RestoreRefusal(
                "not-a-backup",
                `${owner}/${repo} at ${tag} carries no ${SIDECAR_ASSET_NAME}, so this is not a backup` +
                    " this application made.",
            );
        }
        const sidecarText = await readTextAsset(sidecarAsset, MAX_SIDECAR_BYTES, callOptions);
        const sidecar: BackupSidecar | null = sidecarText === null ? null : parseSidecar(sidecarText);
        if (sidecar === null) {
            throw new RestoreRefusal(
                "unreadable-sidecar",
                `${SIDECAR_ASSET_NAME} on ${owner}/${repo} at ${tag} could not be read.`,
            );
        }

        const pointerAsset = release.assets.find(
            (asset) => asset.name === sidecar.pointer && asset.name.endsWith(POINTER_ASSET_SUFFIX),
        );
        if (pointerAsset === undefined) {
            throw new RestoreRefusal(
                "incomplete",
                `The backup tagged ${tag} has no ${sidecar.pointer} pointer, so the upload it made` +
                    " never finished. There is nothing here that can be verified and restored;" +
                    " back the same folder up again to carry it on.",
            );
        }
        const pointerText = await readTextAsset(
            pointerAsset,
            CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
            callOptions,
        );
        if (pointerText === null) {
            throw new RestoreRefusal("unreadable-pointer", `${sidecar.pointer} could not be read.`);
        }
        const read = readPointer(pointerText);
        if (!read.ok) {
            throw new RestoreRefusal(
                read.failure.code === "unsupported-encoding" ? "unsupported-encoding" : "malformed-pointer",
                read.failure.message,
            );
        }
        const pointer: CheapLfsPointer = read.pointer;

        const workspace = restoreWorkspace(this.#options.storageDir(), restoreId);
        await mkdir(workspace.partsDir, { recursive: true });
        const archivePath = restoreArchivePath(workspace, pointer.assetName);

        this.#phase(restoreId, "downloading");
        let joinedArchivePath: string;
        if (pointer.parts === undefined) {
            await this.#downloadWhole(release.assets, pointer, archivePath, callOptions, restoreId, signal);
            joinedArchivePath = archivePath;
        } else {
            await this.#downloadParts(release.assets, pointer, workspace, callOptions, restoreId, signal);
            this.#phase(restoreId, "joining");
            joinedArchivePath = await this.#join(pointer, workspace, restoreId, signal);
        }

        signal.throwIfAborted();
        const digest = await sha256File(joinedArchivePath, signal);
        if (digest !== pointer.sha256) {
            throw new RestoreRefusal(
                "integrity",
                `${pointer.assetName} rejoined but its SHA-256 is ${digest}, not ${pointer.sha256}` +
                    " that the pointer names. The file has not been unpacked.",
            );
        }

        this.#phase(restoreId, "extracting");
        const extracted = await extractZip(joinedArchivePath, workspace.contentDir, { signal });

        this.#phase(restoreId, "finished");
        return {
            restoreId,
            repository: `${owner}/${repo}`,
            tag,
            archive: pointer.assetName,
            bytes: pointer.sizeInBytes,
            sha256: pointer.sha256,
            parts: pointer.parts?.length ?? 1,
            kind: sidecar.kind,
            label: sidecar.label,
            contentFolder: extracted.root,
        };
    }

    async #downloadWhole(
        assets: readonly ReleaseAssetInfo[],
        pointer: CheapLfsPointer,
        archivePath: string,
        callOptions: GitHubCallOptions,
        restoreId: string,
        signal: AbortSignal,
    ): Promise<void> {
        const asset = assets.find((candidate) => candidate.name === pointer.assetName);
        if (asset === undefined) {
            throw new RestoreRefusal(
                "asset-missing",
                `The release names ${pointer.assetName} but has no asset by that name.`,
            );
        }
        let done = 0;
        await downloadToFile(asset.downloadUrl, archivePath, {
            fetch: callOptions.fetch,
            headers: assetHeaders(callOptions.token),
            signal,
            expectedBytes: asset.size,
            onBytes: (_delta, total) => {
                done = total;
                this.#progress(restoreId, "downloading", {
                    description: `Downloading ${pointer.assetName}`,
                    bytesDone: done,
                    bytesTotal: asset.size,
                    partsDone: 0,
                    partsTotal: 1,
                    currentPart: pointer.assetName,
                });
            },
        });
    }

    async #downloadParts(
        assets: readonly ReleaseAssetInfo[],
        pointer: CheapLfsPointer,
        workspace: ReturnType<typeof restoreWorkspace>,
        callOptions: GitHubCallOptions,
        restoreId: string,
        signal: AbortSignal,
    ): Promise<void> {
        const parts = pointer.parts ?? [];
        const byName = new Map(assets.map((asset) => [asset.name, asset] as const));
        const bytesTotal = pointer.sizeInBytes;
        const doneByPart = new Map<number, number>();

        const publish = (index: number, currentPart: string): void => {
            let bytesDone = 0;
            for (const value of doneByPart.values()) bytesDone += value;
            this.#progress(restoreId, "downloading", {
                description: `Downloading part ${String(index + 1)} of ${String(parts.length)}`,
                bytesDone,
                bytesTotal,
                partsDone: [...doneByPart.entries()].filter(
                    ([partIndex, bytes]) => bytes === (parts[partIndex]?.sizeInBytes ?? -1),
                ).length,
                partsTotal: parts.length,
                currentPart,
            });
        };

        for (const [index, part] of parts.entries()) {
            signal.throwIfAborted();
            const asset = byName.get(part.name);
            if (asset === undefined) {
                throw new RestoreRefusal(
                    "asset-missing",
                    `The pointer names part ${part.name} but the release has no asset by that name.`,
                );
            }
            await downloadToFile(asset.downloadUrl, join(workspace.partsDir, part.name), {
                fetch: callOptions.fetch,
                headers: assetHeaders(callOptions.token),
                signal,
                expectedBytes: part.sizeInBytes,
                onBytes: (_delta, total) => {
                    doneByPart.set(index, total);
                    publish(index, part.name);
                },
            });
            doneByPart.set(index, part.sizeInBytes);
            publish(index, part.name);
        }
    }

    /**
     * Translates the pointer into the manifest `@worldlens/parts` already knows how
     * to verify and rejoin, so the rejoin logic - per-part digest, resumable prefix
     * verification, whole-file digest, atomic replace on mismatch - is reused rather than
     * rewritten.
     */
    async #join(
        pointer: CheapLfsPointer,
        workspace: ReturnType<typeof restoreWorkspace>,
        restoreId: string,
        signal: AbortSignal,
    ): Promise<string> {
        const parts = pointer.parts ?? [];
        const manifest: PartsManifest = {
            version: 1,
            file: pointer.assetName,
            bytes: pointer.sizeInBytes,
            sha256: pointer.sha256,
            partSize: CHEAP_LFS_PART_SIZE_BYTES,
            parts: parts.map(
                (part, index): PartRecord => ({
                    index: index + 1,
                    name: part.name,
                    bytes: part.sizeInBytes,
                    sha256: part.sha256,
                }),
            ),
        };
        const manifestPath = join(workspace.partsDir, `${pointer.assetName}.parts.json`);
        await writeFile(manifestPath, JSON.stringify(manifest, null, 4), "utf8");

        const joined = await joinParts(manifestPath, {
            outDir: workspace.root,
            signal,
            onProgress: (progress) => {
                this.#progress(restoreId, "joining", {
                    description: `Rejoining ${pointer.assetName}`,
                    bytesDone: progress.bytesDone,
                    bytesTotal: progress.bytesTotal,
                    partsDone: progress.partsDone,
                    partsTotal: progress.partsTotal,
                    currentPart: progress.partName,
                });
            },
        });
        return joined.path;
    }

    #phase(restoreId: string, phase: RestorePhase): void {
        this.emit({ type: "phase", restoreId, phase, at: this.#timestamp() });
    }

    #progress(
        restoreId: string,
        phase: RestorePhase,
        task: {
            description: string;
            bytesDone: number;
            bytesTotal: number;
            partsDone: number;
            partsTotal: number;
            currentPart: string | null;
        },
    ): void {
        this.emit({
            type: "progress",
            restoreId,
            phase,
            task: {
                phase,
                description: task.description,
                bytesDone: task.bytesDone,
                bytesTotal: task.bytesTotal,
                partsDone: task.partsDone,
                partsTotal: task.partsTotal,
                currentPart: task.currentPart,
                percent: task.bytesTotal <= 0 ? 100 : Math.min(100, (task.bytesDone / task.bytesTotal) * 100),
            },
            at: this.#timestamp(),
        });
    }

    #failed(
        restoreId: string,
        partial: Partial<RestoreFailure> & Pick<RestoreFailure, "code" | "message">,
    ): RestoreResult {
        const failure: RestoreFailure = {
            code: partial.code,
            message: partial.message,
            detail: partial.detail ?? null,
        };
        this.emit({ type: "failed", restoreId, failure, at: this.#timestamp() });
        return { ok: false, restoreId, failure };
    }

    async #token(): Promise<string | null> {
        const value = await this.#options.token();
        return typeof value === "string" && value.length > 0 ? value : null;
    }

    protected emit(event: RestoreEvent): void {
        this.#options.onEvent?.(event);
    }

    #clock(): number {
        return (this.#options.now ?? Date.now)();
    }

    #timestamp(): string {
        return new Date(this.#clock()).toISOString();
    }
}

/** The headers a release asset's `browser_download_url` is fetched with. */
function assetHeaders(token: string): Record<string, string> {
    return {
        accept: "application/octet-stream",
        "user-agent": "worldlens",
        authorization: `Bearer ${token}`,
    };
}

/** A restore that stopped because what it found could not honestly be restored. */
export class RestoreRefusal extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "RestoreRefusal";
        this.code = code;
    }
}

function failureFromError(error: unknown): RestoreFailure {
    if (error instanceof RestoreRefusal) {
        return { code: error.code, message: error.message, detail: null };
    }
    return {
        code: "failed",
        message: error instanceof Error ? error.message : String(error),
        detail: null,
    };
}
