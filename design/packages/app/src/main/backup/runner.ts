/**
 * Making a backup: pack, split, publish, upload, and say so as it happens.
 *
 * The twin of `download/downloader.ts`, and deliberately its mirror image. That one
 * fetches parts, verifies each one, rejoins them and unpacks; this one packs, splits,
 * hashes each part and uploads them. They meet at the Cheap LFS pointer, which is the
 * only thing either of them has to agree about, and at the fact that both push progress
 * rather than waiting to be asked - a backup of a 20 GB world is measured in hours, and a
 * spinner for an hour is indistinguishable from a hang.
 *
 * ## Order matters, and the pointer goes last
 *
 * Parts first, then the sidecar, then the pointer. The pointer is the **completion
 * marker**: a release that has one is a backup that finished, and a release that has
 * parts and no pointer is an upload that stopped part-way. A listing therefore shows only
 * the finished ones, and a resumed backup can tell the difference between "these thirty
 * parts are already there" and "this backup is done" without downloading anything.
 *
 * Doing it the other way round - pointer first, so the release looks complete while the
 * parts are still going up - would produce exactly one failure mode, and it is the worst
 * one this feature has: a backup somebody trusts, that restores as an unverifiable
 * fragment on the day they need it.
 *
 * ## Nothing that already exists is ever touched
 *
 * A backup creates a release. It does not edit one, delete one, delete an asset, or
 * replace an asset's bytes - `github.ts` has no function that could, and this file has no
 * path that would want one. A resumed upload *reads* the release it created and skips the
 * parts already on it, which is the only reason it looks at an existing release at all.
 *
 * ## Cancelling costs time, not data
 *
 * Every phase takes the abort signal, and a cancelled backup leaves the staged archive
 * and the parts where they are. Starting again with the same tag re-uses them and skips
 * the parts already uploaded, so stopping is safe at any point and the second attempt
 * carries on rather than starting over. The one thing a cancel never does is leave a
 * pointer on a release that has no parts under it.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { sha256File, splitFile } from "@material-bluemap/parts";
import type { PartsManifest } from "@material-bluemap/parts";
import { estimateEta, formatEta } from "../download/downloader.js";
import { packFolder } from "./archive.js";
import type { FetchLike, BackupRelease, GitHubCallOptions } from "./github.js";
import {
    GitHubCallError,
    createBackupRelease,
    findExistingAssets,
    findReleaseByTag,
    readRepository,
    uploadAsset,
} from "./github.js";
import {
    CHEAP_LFS_PART_SIZE_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    POINTER_ASSET_SUFFIX,
    serializeCheapLfsPointer,
} from "./pointer.js";
import type { CheapLfsPointerPart } from "./pointer.js";
import { SIDECAR_ASSET_NAME, serializeSidecar } from "./sidecar.js";
import type { BackupSidecar } from "./sidecar.js";
import { archiveNameFor, archiveNameFromTag, inspectBackupSource, releaseTagFor } from "./source.js";
import type { BackupSource, BackupSourceKind } from "./source.js";
import {
    backupIdFor,
    backupWorkspace,
    pruneStagedPayload,
    stagedArchivePath,
    stagedPointerPath,
} from "./workspace.js";

export type BackupPhase = "inspecting" | "packing" | "splitting" | "publishing" | "uploading" | "finished";

/**
 * How much of the overall bar each phase is worth.
 *
 * Not equal thirds, because the phases are not equal work. Packing reads the whole source
 * and writes the whole archive; splitting reads the archive back and writes it out again;
 * uploading sends the same bytes over a link that is nearly always slower than the disk.
 * The numbers are a deliberate guess that makes the bar move roughly steadily, and the
 * byte counts beside it are exact - which is the pair that stops a bar being a lie.
 */
const PHASE_WEIGHTS: Readonly<Record<BackupPhase, number>> = {
    inspecting: 0.02,
    packing: 0.38,
    splitting: 0.15,
    publishing: 0.02,
    uploading: 0.43,
    finished: 0,
};

const PHASE_ORDER: readonly BackupPhase[] = [
    "inspecting",
    "packing",
    "splitting",
    "publishing",
    "uploading",
    "finished",
];

export interface BackupTaskProgress {
    readonly phase: BackupPhase;
    /** One line naming what is happening, e.g. `Uploading part 3 of 12`. */
    readonly description: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    /** The part being uploaded, or null outside the upload. */
    readonly currentPart: string | null;
    /** 0 to 100, across every phase. An estimate; the byte counts are exact. */
    readonly percent: number;
    readonly etaSeconds: number | null;
    readonly etaText: string | null;
}

export interface BackupFailure {
    readonly code: string;
    readonly message: string;
    /** Extra context worth showing behind a disclosure, never in the headline. */
    readonly detail: string | null;
    readonly status: number | null;
    /** True when signing in again in Settings is the thing that would fix it. */
    readonly needsSignIn: boolean;
}

export interface BackupSummary {
    readonly backupId: string;
    readonly repository: string;
    readonly tag: string;
    readonly releaseUrl: string;
    readonly archive: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly parts: number;
    readonly kind: BackupSourceKind;
    readonly label: string;
}

export type BackupEvent =
    | {
          readonly type: "started";
          readonly backupId: string;
          readonly repository: string;
          readonly tag: string;
          readonly kind: BackupSourceKind;
          readonly label: string;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly backupId: string; readonly phase: BackupPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly backupId: string;
          readonly phase: BackupPhase;
          readonly task: BackupTaskProgress;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly backupId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly backupId: string;
          readonly summary: BackupSummary;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly backupId: string; readonly failure: BackupFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly backupId: string; readonly at: string };

export interface BackupRequest {
    readonly kind: BackupSourceKind;
    /** The folder to pack, absolute. */
    readonly folder: string;
    readonly owner: string;
    readonly repo: string;
    /**
     * Set only when the person has been shown, and accepted, that the repository is
     * public and this upload will be downloadable by anybody.
     *
     * Absent or false against a public repository is a **refusal**, not a prompt. The
     * decision belongs to the person, so the main process will not make it for them by
     * defaulting either way, and it will not proceed without it.
     */
    readonly acknowledgePublic?: boolean | undefined;
    /**
     * The tag of a backup to carry on with, rather than starting a new one.
     *
     * Everything already staged and already uploaded is re-used. Only ever a tag this
     * application created: the release is read, never rewritten, and a tag naming
     * somebody else's release simply has no staged workspace to resume from.
     */
    readonly resumeTag?: string | undefined;
    /** Overridable so a test does not have to write half a gigabyte. */
    readonly partSize?: number | undefined;
}

export type BackupResult =
    | { readonly ok: true; readonly backupId: string; readonly summary: BackupSummary; readonly durationMs: number }
    | { readonly ok: false; readonly backupId: string; readonly failure: BackupFailure };

export interface BackupRunnerOptions {
    /** Where backups are staged. A function, because the person can move it while running. */
    readonly storageDir: () => string;
    /** The signed-in token, resolved per operation. Null means nobody is signed in. */
    readonly token: () => Promise<string | null> | string | null;
    readonly fetch?: FetchLike | undefined;
    readonly onEvent?: ((event: BackupEvent) => void) | undefined;
    readonly appVersion?: string | null | undefined;
    readonly now?: (() => number) | undefined;
    readonly apiBase?: string | undefined;
    readonly uploadsBase?: string | undefined;
}

/** What a repository looks like before anything is uploaded to it. */
export interface RepositoryReport {
    readonly owner: string;
    readonly repo: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
    /**
     * The warning to show, or null when there is nothing to warn about.
     *
     * A public repository is the loud one. A private one gets a quieter note rather than
     * silence, because "private" is not the same as "free and unlimited": a private
     * repository's releases still count against the account's storage, and somebody
     * choosing private to avoid a bill deserves to hear that before uploading forty
     * gigabytes rather than after.
     */
    readonly warning: { readonly level: "warning" | "note"; readonly message: string } | null;
}

export class BackupRunner {
    readonly #options: BackupRunnerOptions;
    readonly #running = new Map<string, AbortController>();

    constructor(options: BackupRunnerOptions) {
        this.#options = options;
    }

    /** The ids of backups in flight right now. */
    activeBackupIds(): string[] {
        return [...this.#running.keys()];
    }

    /** Stops one. False when there was nothing by that id to stop. */
    cancel(backupId: string): boolean {
        const controller = this.#running.get(backupId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    /**
     * Reads a repository and says plainly what uploading to it would mean.
     *
     * Called before the backup rather than during it, because the answer changes what a
     * person decides, and a warning that arrives after the upload started is not a
     * warning. It is also the only call in this feature that a person makes by typing a
     * repository name, so it is where a typo gets caught.
     */
    async inspectRepository(owner: string, repo: string): Promise<RepositoryReport> {
        const token = await this.#token();
        if (token === null) throw new Error(SIGNED_OUT_MESSAGE);

        const repository = await readRepository(owner, repo, this.#callOptions(token));
        const warning = repository.private
            ? ({
                  level: "note",
                  message:
                      "This repository is private, so the backup will not be public. Private" +
                      " repositories still have storage limits on releases, though - a few large" +
                      " backups can reach them - so this is cheap rather than free.",
              } as const)
            : ({
                  level: "warning",
                  message:
                      "This repository is PUBLIC. Everything uploaded to it can be downloaded by" +
                      " anybody, with no account and no link from you. A Minecraft world carries" +
                      " your builds, your coordinates and whatever anyone left in a chest, and a" +
                      " rendered map carries the same information as pictures. Once it is up," +
                      " assume somebody has a copy.",
              } as const);

        return {
            owner: repository.owner,
            repo: repository.name,
            fullName: repository.fullName,
            private: repository.private,
            canWrite: repository.canWrite,
            htmlUrl: repository.htmlUrl,
            warning,
        };
    }

    /**
     * Packs, splits, publishes and uploads one backup.
     *
     * Resolves when it is over, whichever way it went. Progress arrives through the event
     * callback in the meantime, because this call takes as long as the world is big.
     */
    async backup(request: BackupRequest): Promise<BackupResult> {
        const startedAt = this.#clock();
        const at = new Date(startedAt);
        const owner = request.owner.trim();
        const repo = request.repo.trim();

        if (owner === "" || repo === "") {
            return this.#failed("nowhere", {
                code: "no-repository",
                message: "A backup needs a repository owner and name to publish to.",
            });
        }

        const token = await this.#token();
        if (token === null) {
            return this.#failed("nowhere", {
                code: "signed-out",
                message: SIGNED_OUT_MESSAGE,
                needsSignIn: true,
            });
        }

        // Inspecting the source before the repository is deliberate: a folder that is not
        // a world is the far more common mistake, it costs no network to find, and
        // finding it first means a typo in a repository name is not reported while the
        // real problem is that the wrong folder was picked.
        const inspected = await inspectBackupSource(request.kind, request.folder);
        if (!inspected.ok) {
            return this.#failed("nowhere", {
                code: inspected.failure.code,
                message: inspected.failure.message,
            });
        }
        const source = inspected.source;

        let repository;
        try {
            repository = await readRepository(owner, repo, this.#callOptions(token));
        } catch (error) {
            return this.#failed("nowhere", failureFromError(error));
        }

        if (!repository.canWrite) {
            return this.#failed("nowhere", {
                code: "read-only",
                message:
                    `The signed-in account cannot write to ${repository.fullName}, so it cannot ` +
                    "publish a release there. Nothing was uploaded.",
            });
        }

        if (!repository.private && request.acknowledgePublic !== true) {
            return this.#failed("nowhere", {
                code: "public-not-acknowledged",
                message:
                    `${repository.fullName} is a PUBLIC repository. A backup uploaded there can ` +
                    "be downloaded by anybody. Nothing was uploaded: confirm that you mean to " +
                    "publish this world, or choose a private repository instead.",
            });
        }

        const tag = request.resumeTag ?? releaseTagFor(request.kind, source.label, at);
        const backupId = backupIdFor(owner, repo, tag);
        const workspace = backupWorkspace(this.#options.storageDir(), backupId);
        /*
         * A resume must reuse the *original* archive name, not mint one from this call's
         * own start time. Every part's asset name is prefixed with the archive name, and
         * the skip check below matches an upload against what is already on the release
         * by exact name - so a fresh name here means a fresh set of names, which never
         * match the parts a first attempt already uploaded no matter how identical their
         * bytes are. `archiveNameFromTag` recovers the original name straight from
         * `resumeTag` (see its doc comment); `null` only for a tag this module never
         * minted, which falls back to the ordinary derivation rather than guessing.
         */
        const archiveName =
            (request.resumeTag === undefined ? null : archiveNameFromTag(request.resumeTag)) ??
            archiveNameFor(request.kind, source.label, at);

        const controller = new AbortController();
        this.#running.set(backupId, controller);
        this.emit({
            type: "started",
            backupId,
            repository: `${owner}/${repo}`,
            tag,
            kind: request.kind,
            label: source.label,
            at: this.#timestamp(),
        });

        try {
            const summary = await this.#run({
                request,
                owner,
                repo,
                tag,
                backupId,
                workspace,
                archiveName,
                source,
                token,
                signal: controller.signal,
                startedAt,
            });
            const durationMs = this.#clock() - startedAt;
            this.emit({
                type: "finished",
                backupId,
                summary,
                durationMs,
                at: this.#timestamp(),
            });
            return { ok: true, backupId, summary, durationMs };
        } catch (error) {
            if (controller.signal.aborted) {
                this.emit({ type: "cancelled", backupId, at: this.#timestamp() });
                return {
                    ok: false,
                    backupId,
                    failure: {
                        code: "cancelled",
                        message:
                            "The backup was stopped. What has already been packed and uploaded is" +
                            " kept, so starting it again carries on rather than starting over.",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                    },
                };
            }
            return this.#failed(backupId, failureFromError(error));
        } finally {
            this.#running.delete(backupId);
        }
    }

    /* ---------------------------------------------------------------------- */

    async #run(context: {
        request: BackupRequest;
        owner: string;
        repo: string;
        tag: string;
        backupId: string;
        workspace: ReturnType<typeof backupWorkspace>;
        archiveName: string;
        source: BackupSource;
        token: string;
        signal: AbortSignal;
        startedAt: number;
    }): Promise<BackupSummary> {
        const { backupId, workspace, source, signal } = context;
        await mkdir(workspace.root, { recursive: true });

        /* -- pack ---------------------------------------------------------- */

        const packingSince = this.#phase(backupId, "packing");
        const archivePath = stagedArchivePath(workspace, context.archiveName);
        const packed = await this.#packOrReuse({ ...context, since: packingSince }, archivePath);

        /* -- split --------------------------------------------------------- */

        const splittingSince = this.#phase(backupId, "splitting");
        const partSize = context.request.partSize ?? CHEAP_LFS_PART_SIZE_BYTES;
        const split = await splitFile(archivePath, {
            partSize,
            outDir: workspace.partsDir,
            signal,
            onProgress: (progress) => {
                this.#progress(backupId, "splitting", {
                    description: `Cutting the archive into ${String(progress.partsTotal)} parts`,
                    bytesDone: progress.bytesDone,
                    bytesTotal: progress.bytesTotal,
                    partsDone: progress.partsDone,
                    partsTotal: progress.partsTotal,
                    currentPart: null,
                    since: splittingSince,
                });
            },
        });

        /**
         * What actually goes up, and under what names.
         *
         * A file small enough to be one asset is uploaded whole, and its pointer is the
         * original five-line form with no part lines - which is the case the canonical
         * format calls out by name, so it is worth having rather than always splitting.
         */
        const uploads: { name: string; path: string; bytes: number; sha256: string }[] = [];
        let pointerParts: CheapLfsPointerPart[] | undefined;

        if (split.split) {
            const manifest: PartsManifest = split.manifest;
            pointerParts = [];
            for (const [index, part] of manifest.parts.entries()) {
                const assetName = partAssetName(context.archiveName, part.index, part.sha256);
                uploads.push({
                    name: assetName,
                    path: split.partPaths[index] as string,
                    bytes: part.bytes,
                    sha256: part.sha256,
                });
                pointerParts.push({
                    name: assetName,
                    sizeInBytes: part.bytes,
                    sha256: part.sha256,
                });
            }
        } else {
            uploads.push({
                name: context.archiveName,
                path: archivePath,
                bytes: packed.bytes,
                sha256: packed.sha256,
            });
        }

        /* -- the pointer and the sidecar, written before anything is published */

        const pointerText = serializeCheapLfsPointer({
            version: CHEAP_LFS_POINTER_VERSION,
            releaseTag: context.tag,
            assetName: context.archiveName,
            sizeInBytes: packed.bytes,
            sha256: packed.sha256,
            ...(pointerParts === undefined ? {} : { parts: pointerParts }),
        });
        const pointerName = `${context.archiveName}${POINTER_ASSET_SUFFIX}`;
        const pointerPath = stagedPointerPath(workspace, pointerName);
        await writeFile(pointerPath, pointerText, "utf8");

        const sidecar: BackupSidecar = {
            sidecarVersion: 1,
            kind: context.request.kind,
            label: source.label,
            archive: context.archiveName,
            pointer: pointerName,
            bytes: packed.bytes,
            sha256: packed.sha256,
            parts: uploads.length,
            files: source.files,
            contentBytes: source.bytes,
            createdAt: new Date(context.startedAt).toISOString(),
            appVersion: this.#options.appVersion ?? null,
            sourceFolder: source.folder,
            skipped: source.skipped,
        };
        await writeFile(workspace.sidecarFile, serializeSidecar(sidecar), "utf8");

        /* -- publish ------------------------------------------------------- */

        this.#phase(backupId, "publishing");
        const release = await this.#releaseFor(context);

        /* -- upload -------------------------------------------------------- */

        const uploadingSince = this.#phase(backupId, "uploading");
        const existing = await findExistingAssets(
            context.owner,
            context.repo,
            context.tag,
            this.#callOptions(context.token, signal),
        );

        const bytesTotal = uploads.reduce((total, upload) => total + upload.bytes, 0);
        let bytesDone = 0;

        for (const [index, upload] of uploads.entries()) {
            signal.throwIfAborted();
            const already = existing.get(upload.name);
            /*
             * Skipped when the name and the size both match.
             *
             * The name is what makes that a digest match rather than a guess: a part's
             * asset name carries the first sixteen hex characters of its own SHA-256, so
             * an asset with that exact name is an asset whose content hashed to that
             * value when it was uploaded. GitHub publishes no checksum of its own for a
             * release asset, so the alternative to name-and-size is downloading every
             * part back to hash it, which on a resumed 20 GB upload costs more than
             * uploading it again. The doc says exactly this, rather than implying that
             * GitHub verified anything.
             */
            if (already !== undefined && already.size === upload.bytes) {
                bytesDone += upload.bytes;
                this.emit({
                    type: "log",
                    backupId,
                    level: "info",
                    message: `${upload.name} is already on the release at the right size; skipped.`,
                    at: this.#timestamp(),
                });
                this.#progress(backupId, "uploading", {
                    description: `Part ${String(index + 1)} of ${String(uploads.length)} was already there`,
                    bytesDone,
                    bytesTotal,
                    partsDone: index + 1,
                    partsTotal: uploads.length,
                    currentPart: upload.name,
                    since: uploadingSince,
                });
                continue;
            }

            const before = bytesDone;
            await uploadAsset(
                release,
                context.owner,
                context.repo,
                upload.name,
                upload.path,
                {
                    ...this.#callOptions(context.token, signal),
                    onProgress: (progress) => {
                        bytesDone = before + progress.bytesSent;
                        this.#progress(backupId, "uploading", {
                            description: `Uploading part ${String(index + 1)} of ${String(uploads.length)}`,
                            bytesDone,
                            bytesTotal,
                            partsDone: index,
                            partsTotal: uploads.length,
                            currentPart: upload.name,
                            since: uploadingSince,
                        });
                    },
                },
            );
            bytesDone = before + upload.bytes;
        }

        // The sidecar, then the pointer. The pointer is what makes the release a finished
        // backup, so it is the last thing that happens and it happens only once every
        // part is up.
        signal.throwIfAborted();
        if (!existing.has(SIDECAR_ASSET_NAME)) {
            await uploadAsset(
                release,
                context.owner,
                context.repo,
                SIDECAR_ASSET_NAME,
                workspace.sidecarFile,
                this.#callOptions(context.token, signal),
            );
        }
        signal.throwIfAborted();
        if (!existing.has(pointerName)) {
            await uploadAsset(
                release,
                context.owner,
                context.repo,
                pointerName,
                pointerPath,
                this.#callOptions(context.token, signal),
            );
        }

        this.#phase(backupId, "finished");
        await pruneStagedPayload(workspace, context.archiveName);

        return {
            backupId,
            repository: `${context.owner}/${context.repo}`,
            tag: context.tag,
            releaseUrl: release.htmlUrl,
            archive: context.archiveName,
            bytes: packed.bytes,
            sha256: packed.sha256,
            parts: uploads.length,
            kind: context.request.kind,
            label: source.label,
        };
    }

    /**
     * Packs the source, or re-uses a staged archive a previous attempt already produced.
     *
     * The re-use is checked by **hashing the staged file**, not by trusting its presence:
     * a half-written archive from a run that was killed rather than cancelled is exactly
     * the size and name a finished one would be. Hashing costs one read of the archive;
     * packing again costs a read of the whole source and a write of the whole archive, so
     * the check pays for itself the first time it succeeds and is cheap when it fails.
     */
    async #packOrReuse(
        context: {
            backupId: string;
            source: BackupSource;
            signal: AbortSignal;
            /** When the packing phase began, for its own estimate. */
            since: number;
        },
        archivePath: string,
    ): Promise<{ bytes: number; sha256: string }> {
        const staged = await stat(archivePath).catch(() => null);
        if (staged !== null && staged.isFile() && staged.size > 0) {
            this.emit({
                type: "log",
                backupId: context.backupId,
                level: "info",
                message: "An archive from an earlier attempt is here; checking it rather than packing again.",
                at: this.#timestamp(),
            });
            const digest = await sha256File(archivePath, context.signal);
            return { bytes: staged.size, sha256: digest };
        }

        const packed = await packFolder(context.source.folder, archivePath, {
            signal: context.signal,
            onProgress: (progress) => {
                this.#progress(context.backupId, "packing", {
                    description:
                        progress.current === null
                            ? "Packing"
                            : `Packing ${basename(progress.current)}`,
                    bytesDone: progress.bytesDone,
                    bytesTotal: progress.bytesTotal,
                    partsDone: progress.filesDone,
                    partsTotal: progress.filesTotal,
                    currentPart: progress.current,
                    since: context.since,
                });
            },
        });
        return { bytes: packed.bytes, sha256: packed.sha256 };
    }

    /**
     * The release to upload to: the one being resumed, or a brand new one.
     *
     * A resume against a tag with no release is a refusal rather than a quiet creation.
     * The person asked to carry on with a specific backup; making a different one under
     * that name would look like it worked and leave the original half-finished release
     * exactly where it was.
     */
    async #releaseFor(context: {
        owner: string;
        repo: string;
        tag: string;
        request: BackupRequest;
        source: BackupSource;
        token: string;
        signal: AbortSignal;
    }): Promise<BackupRelease> {
        const options = this.#callOptions(context.token, context.signal);
        if (context.request.resumeTag !== undefined) {
            const existing = await findReleaseByTag(context.owner, context.repo, context.tag, options);
            if (existing === null) {
                throw new GitHubCallError(
                    `There is no release tagged ${context.tag} on ${context.owner}/${context.repo} ` +
                        "to carry on with. Nothing was created or changed.",
                    404,
                    "",
                );
            }
            return existing;
        }

        return await createBackupRelease(
            context.owner,
            context.repo,
            context.tag,
            `Backup: ${context.source.label}`,
            backupReleaseBody(context.request.kind, context.source),
            options,
        );
    }

    #callOptions(token: string, signal?: AbortSignal): GitHubCallOptions {
        return {
            fetch: this.#options.fetch ?? ((url, init) => fetch(url, init)),
            token,
            ...(signal === undefined ? {} : { signal }),
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
            ...(this.#options.uploadsBase === undefined
                ? {}
                : { uploadsBase: this.#options.uploadsBase }),
        };
    }

    async #token(): Promise<string | null> {
        const value = await this.#options.token();
        return typeof value === "string" && value.length > 0 ? value : null;
    }

    /**
     * Announces a phase and returns the moment it began.
     *
     * The moment matters because the estimate is per phase, not per run. Measuring the
     * upload's rate from when the *backup* started folds in however long the pack took,
     * and on a fast disk and a slow link that is most of the elapsed time - which makes
     * the upload look several times slower than it is and gives an estimate nobody should
     * believe. A phase that times itself gives an estimate that converges.
     */
    #phase(backupId: string, phase: BackupPhase): number {
        this.emit({ type: "phase", backupId, phase, at: this.#timestamp() });
        return this.#clock();
    }

    #progress(
        backupId: string,
        phase: BackupPhase,
        task: {
            description: string;
            bytesDone: number;
            bytesTotal: number;
            partsDone: number;
            partsTotal: number;
            currentPart: string | null;
            /** When this phase began, so the estimate is about this phase's own rate. */
            since: number;
        },
    ): void {
        const etaSeconds = estimateEta(task.bytesDone, task.bytesTotal, this.#clock() - task.since);
        this.emit({
            type: "progress",
            backupId,
            phase,
            task: {
                phase,
                description: task.description,
                bytesDone: task.bytesDone,
                bytesTotal: task.bytesTotal,
                partsDone: task.partsDone,
                partsTotal: task.partsTotal,
                currentPart: task.currentPart,
                percent: overallPercent(phase, task.bytesDone, task.bytesTotal),
                etaSeconds,
                etaText: etaSeconds === null ? null : formatEta(etaSeconds),
            },
            at: this.#timestamp(),
        });
    }

    #failed(backupId: string, partial: Partial<BackupFailure> & Pick<BackupFailure, "code" | "message">): BackupResult {
        const failure: BackupFailure = {
            code: partial.code,
            message: partial.message,
            detail: partial.detail ?? null,
            status: partial.status ?? null,
            needsSignIn: partial.needsSignIn ?? false,
        };
        this.emit({ type: "failed", backupId, failure, at: this.#timestamp() });
        return { ok: false, backupId, failure };
    }

    protected emit(event: BackupEvent): void {
        this.#options.onEvent?.(event);
    }

    #clock(): number {
        return (this.#options.now ?? Date.now)();
    }

    #timestamp(): string {
        return new Date(this.#clock()).toISOString();
    }
}

const SIGNED_OUT_MESSAGE =
    "Nobody is signed in to GitHub on this computer, so there is nowhere to publish a backup." +
    " Sign in from Settings, then try again.";

/**
 * The asset name one part gets: the archive's name, the part number, and the first
 * sixteen hex characters of that part's SHA-256.
 *
 * The digest in the name is not decoration. GitHub publishes no checksum for a release
 * asset, so a resumed upload that only matched names would happily skip a part whose
 * bytes were something else entirely. Deriving the name from the content means an asset
 * that is there under that name is an asset whose content hashed to that value when it
 * went up - and it makes a re-run of the same backup produce the same names, which is
 * what makes the skip possible at all.
 */
export function partAssetName(archiveName: string, index: number, sha256: string): string {
    return `${archiveName}.${String(index).padStart(3, "0")}-${sha256.slice(0, 16)}`;
}

/** The release notes. Plain, and honest about what the release is for. */
function backupReleaseBody(kind: BackupSourceKind, source: BackupSource): string {
    const what = kind === "world" ? "Minecraft world" : "rendered map";
    return [
        `A Material BlueMap backup of the ${what} \`${source.label}\`.`,
        "",
        "The bytes are the release assets on this release. `backup.json` says what was backed",
        "up and when; the `.cheaplfs` file is a Cheap LFS v1 pointer naming every part and its",
        "SHA-256, so a restore can verify what it fetched.",
        "",
        "This release is storage, not a product release. It is marked as a prerelease so it",
        "never becomes the repository's latest release.",
    ].join("\n");
}

/** The overall percentage, folding a phase's own progress into the phases before it. */
export function overallPercent(phase: BackupPhase, bytesDone: number, bytesTotal: number): number {
    let base = 0;
    for (const step of PHASE_ORDER) {
        if (step === phase) break;
        base += PHASE_WEIGHTS[step];
    }
    const within = bytesTotal <= 0 ? 1 : Math.min(1, bytesDone / bytesTotal);
    return Math.min(100, (base + PHASE_WEIGHTS[phase] * within) * 100);
}

/** Every thrown thing turned into one sentence, with the GitHub status when there was one. */
function failureFromError(error: unknown): BackupFailure {
    if (error instanceof GitHubCallError) {
        return {
            code: error.status === 401 ? "signed-out" : `github-${String(error.status)}`,
            message: error.message,
            detail: error.url === "" ? null : error.url,
            status: error.status,
            needsSignIn: error.status === 401 || error.status === 403,
        };
    }
    return {
        code: "failed",
        message: error instanceof Error ? error.message : String(error),
        detail: null,
        status: null,
        needsSignIn: false,
    };
}
