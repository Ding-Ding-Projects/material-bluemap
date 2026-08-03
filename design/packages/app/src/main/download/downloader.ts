/**
 * Fetching a world or a rendered map out of a GitHub release, in one piece, from many.
 *
 * The order of the steps is the design, exactly as it is in `render/orchestrator.ts`:
 *
 * 1. read the release and work out what is actually being asked for;
 * 2. fetch the `.parts.json` first, because it is a few kilobytes and it is the only
 *    thing that says how large the real download is and what its checksums are;
 * 3. fetch every part, with `Range` resume and a concurrency cap;
 * 4. rejoin, verifying **each part** and then the **whole file**;
 * 5. unpack.
 *
 * Nothing downstream of step 4 runs on unverified bytes. That is not caution for its own
 * sake: a corrupt world unzips perfectly well and then surfaces as a rendering bug three
 * layers away, in a file nobody would think to look in.
 *
 * ## A failed download leaves nothing that looks finished
 *
 * This project has already been bitten by exactly that failure, in a different place: a
 * packaged `dist/` that existed, held no binary, and whose installer kept exiting 0. So
 * a failure here deletes the rejoined archive and the unpacked content - the two things
 * that look complete to whatever comes next - and keeps only the parts, which are
 * individually checksummed and therefore safe to resume from. A part that failed its own
 * digest is deleted too, because it is the one file that must not be reused.
 *
 * A **cancellation** keeps everything, including the half-written part. That is the whole
 * point of a resumable download, and a cancellation is not a failure.
 *
 * ## Progress
 *
 * Reported the way the render orchestrator reports its own, and pushed rather than
 * polled for the same reason: a twenty-gigabyte download takes long enough that a
 * spinner is indistinguishable from a hang, and a hang is what people conclude.
 *
 * The overall percent is a weighted estimate across the three phases - transfer, rejoin,
 * unpack - and says so. The per-phase byte counts beside it are exact.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    PartsIntegrityError,
    PartsManifestError,
    joinParts,
    manifestNameFor,
    readManifest,
    sha256File,
} from "@material-bluemap/parts";
import type { PartRecord, PartsManifest } from "@material-bluemap/parts";
import * as failures from "./failure.js";
import type { DownloadFailure } from "./failure.js";
import { HttpDownloadError, downloadToFile, isAbort } from "./http.js";
import { asExtractError, extractZip, ExtractError } from "./extract.js";
import {
    ReleaseRequestError,
    apiHeaders,
    availableDownloads,
    fetchRelease,
    findDownload,
} from "./release.js";
import type { AvailableDownload, FetchLike, ReleaseAsset, ReleaseInfo } from "./release.js";
import { archivePath, downloadIdFor, downloadWorkspace } from "./workspace.js";
import type { DownloadWorkspace } from "./workspace.js";

export type DownloadPhase = "resolving" | "downloading" | "joining" | "extracting" | "finished";

/** How much of the overall bar each phase is worth. An estimate, and labelled as one. */
const PHASE_WEIGHTS: Readonly<Record<Exclude<DownloadPhase, "finished">, number>> = {
    resolving: 0.01,
    // The network is nearly always the slow part, and on the occasion it is not, a bar
    // that runs slightly ahead of itself is a far smaller lie than one that sits at 99%.
    downloading: 0.74,
    joining: 0.15,
    extracting: 0.1,
};

export interface DownloadTaskProgress {
    readonly phase: DownloadPhase;
    /** What is happening, in the words the interface shows. */
    readonly description: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    /** The part being worked on, or null between parts and outside the transfer. */
    readonly currentPart: string | null;
    /** 0 to 100, across every phase. An estimate; the byte counts above are exact. */
    readonly percent: number;
    readonly etaSeconds: number | null;
    readonly etaText: string | null;
}

export interface DownloadStartedEvent {
    readonly type: "started";
    readonly downloadId: string;
    readonly asset: string;
    readonly release: string;
    readonly parts: number;
    readonly bytesTotal: number;
    readonly at: string;
}

export interface DownloadPhaseEvent {
    readonly type: "phase";
    readonly downloadId: string;
    readonly phase: DownloadPhase;
    readonly at: string;
}

export interface DownloadProgressEvent {
    readonly type: "progress";
    readonly downloadId: string;
    readonly phase: DownloadPhase;
    readonly task: DownloadTaskProgress;
    readonly at: string;
}

export interface DownloadLogEvent {
    readonly type: "log";
    readonly downloadId: string;
    readonly level: "info" | "warning" | "error";
    readonly message: string;
    readonly at: string;
}

export interface DownloadFinishedEvent {
    readonly type: "finished";
    readonly downloadId: string;
    /** The verified archive. */
    readonly archive: string;
    /** Where it was unpacked, or null when it was not asked to be. */
    readonly content: string | null;
    readonly bytes: number;
    readonly sha256: string;
    readonly durationMs: number;
    readonly at: string;
}

export interface DownloadFailedEvent {
    readonly type: "failed";
    readonly downloadId: string;
    readonly failure: DownloadFailure;
    readonly at: string;
}

export interface DownloadCancelledEvent {
    readonly type: "cancelled";
    readonly downloadId: string;
    readonly at: string;
}

/**
 * Cancellation is its own event rather than a failure with a code.
 *
 * A cancelled download is not an error and must not be shown as one, exactly as a
 * cancelled render is not.
 */
export type DownloadEvent =
    | DownloadStartedEvent
    | DownloadPhaseEvent
    | DownloadProgressEvent
    | DownloadLogEvent
    | DownloadFinishedEvent
    | DownloadFailedEvent
    | DownloadCancelledEvent;

export interface DownloadRecord {
    readonly version: 1;
    readonly downloadId: string;
    readonly owner: string;
    readonly repo: string;
    readonly tag: string;
    readonly asset: string;
    readonly split: boolean;
    readonly parts: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly archive: string;
    readonly content: string | null;
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    readonly outcome: "running" | "finished" | "failed" | "cancelled";
}

export interface DownloadRequest {
    readonly owner: string;
    readonly repo: string;
    /** A tag, or `latest` (the default). */
    readonly tag?: string;
    /**
     * Which download to fetch, by the name it presents: `world.zip` for something
     * published as `world.zip.001`, `world.zip.002`, ... and a `world.zip.parts.json`.
     *
     * Omitted, and the release offers exactly one split download, that one is taken.
     * Omitted with several, the request is refused rather than guessed at.
     */
    readonly asset?: string;
    /** Unpack the archive afterwards. Defaults to true for a `.zip`. */
    readonly extract?: boolean;
}

export interface DownloadSuccess {
    readonly ok: true;
    readonly downloadId: string;
    readonly archive: string;
    readonly content: string | null;
    readonly bytes: number;
    readonly sha256: string;
    readonly durationMs: number;
    readonly record: DownloadRecord;
}

export interface DownloadFailureResult {
    readonly ok: false;
    readonly downloadId: string;
    readonly failure: DownloadFailure;
}

export type DownloadResult = DownloadSuccess | DownloadFailureResult;

export interface ReleaseDownloaderOptions {
    /**
     * Absolute directory downloads are written under.
     *
     * A function is accepted for the same reason the render orchestrator accepts one:
     * somebody can change where the application writes from the setup step, and a value
     * captured at construction would keep writing to the old folder until the
     * application was restarted, with nothing on screen to say the setting had not taken
     * effect.
     */
    readonly storageDir: string | (() => string);
    readonly onEvent: (event: DownloadEvent) => void;
    /** Overridable so a test never touches the network. Defaults to global `fetch`. */
    readonly fetch?: FetchLike;
    /**
     * `GH_TOKEN` when it is set. Read through a function because a token can be set,
     * changed or removed while the application is running.
     *
     * A public release never needs one and must never be made to require one.
     */
    readonly token?: () => string | null;
    /** How many parts are fetched at once. Four by default. */
    readonly concurrency?: number;
    /** How many times one part is re-fetched after a failed digest. Once by default. */
    readonly partRetries?: number;
    readonly apiBase?: string;
    /** Overridable so a test can assert on timestamps. */
    readonly now?: () => Date;
}

interface ActiveDownload {
    readonly controller: AbortController;
    readonly startedAt: number;
}

export class ReleaseDownloader {
    private readonly options: ReleaseDownloaderOptions;
    private readonly active = new Map<string, ActiveDownload>();

    constructor(options: ReleaseDownloaderOptions) {
        this.options = options;
    }

    activeDownloadIds(): string[] {
        return [...this.active.keys()];
    }

    /** Stops a running download. False when nothing is running under that id. */
    cancel(downloadId: string): boolean {
        const running = this.active.get(downloadId);
        if (running === undefined) return false;
        running.controller.abort();
        return true;
    }

    /** What a release offers, without downloading any of it. */
    async discover(
        owner: string,
        repo: string,
        tag?: string,
    ): Promise<
        | { readonly ok: true; readonly release: ReleaseInfo; readonly downloads: AvailableDownload[] }
        | { readonly ok: false; readonly failure: DownloadFailure }
    > {
        try {
            const release = await fetchRelease(owner, repo, tag, this.lookupOptions());
            return { ok: true, release, downloads: availableDownloads(release) };
        } catch (error) {
            return { ok: false, failure: this.describe(error, `${owner}/${repo}`) };
        }
    }

    async download(request: DownloadRequest): Promise<DownloadResult> {
        const invalid = validate(request);
        if (invalid !== null) {
            return this.reportFailure("", invalid);
        }

        let release: ReleaseInfo;
        try {
            release = await fetchRelease(request.owner, request.repo, request.tag, this.lookupOptions());
        } catch (error) {
            return this.reportFailure("", this.describe(error, `${request.owner}/${request.repo}`));
        }

        const offered = availableDownloads(release);
        const chosen = choose(offered, request.asset);
        if (chosen === null) {
            return this.reportFailure(
                "",
                request.asset === undefined
                    ? failures.invalidRequest(
                          "The release offers several downloads, so one has to be named. " +
                              `It has: ${offered.map((entry) => entry.name).join(", ") || "nothing"}.`,
                      )
                    : failures.assetNotFound(
                          request.asset,
                          offered.map((entry) => entry.name),
                      ),
            );
        }

        const downloadId = downloadIdFor(request.owner, request.repo, release.tag, chosen.name);
        if (this.active.has(downloadId)) {
            return this.reportFailure(downloadId, failures.alreadyRunning(downloadId));
        }

        const controller = new AbortController();
        const startedAt = Date.now();
        this.active.set(downloadId, { controller, startedAt });
        try {
            return await this.run(downloadId, request, release, chosen, controller, startedAt);
        } finally {
            this.active.delete(downloadId);
        }
    }

    private async run(
        downloadId: string,
        request: DownloadRequest,
        release: ReleaseInfo,
        chosen: AvailableDownload,
        controller: AbortController,
        startedAt: number,
    ): Promise<DownloadResult> {
        const workspace = downloadWorkspace(this.storageDir(), downloadId);
        const archive = archivePath(workspace, chosen.name);
        const wantsExtract = request.extract ?? chosen.name.toLowerCase().endsWith(".zip");

        try {
            await mkdir(workspace.partsDir, { recursive: true });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return this.reportFailure(downloadId, failures.storageUnwritable(workspace.root, detail));
        }

        this.emit({
            type: "started",
            downloadId,
            asset: chosen.name,
            release: release.tag,
            parts: chosen.kind === "split" ? chosen.parts.length : 1,
            bytesTotal: chosen.bytes,
            at: this.timestamp(),
        });

        try {
            this.emit({ type: "phase", downloadId, phase: "resolving", at: this.timestamp() });

            let bytes: number;
            let sha256: string;
            let partsTotal: number;

            if (chosen.kind === "split") {
                const manifest = await this.fetchManifest(downloadId, workspace, chosen.manifest, controller);
                partsTotal = manifest.parts.length;
                await this.fetchParts(downloadId, workspace, chosen.parts, manifest, controller);
                const joined = await this.rejoin(downloadId, workspace, manifest, controller);
                bytes = joined.bytes;
                sha256 = joined.sha256;
            } else {
                partsTotal = 1;
                const whole = await this.fetchWhole(downloadId, chosen.asset, archive, controller);
                bytes = whole.bytes;
                sha256 = whole.sha256;
            }

            let content: string | null = null;
            if (wantsExtract) {
                this.emit({ type: "phase", downloadId, phase: "extracting", at: this.timestamp() });
                content = await this.unpack(downloadId, workspace, archive, controller);
            }

            const durationMs = Date.now() - startedAt;
            const record: DownloadRecord = {
                version: 1,
                downloadId,
                owner: request.owner,
                repo: request.repo,
                tag: release.tag,
                asset: chosen.name,
                split: chosen.kind === "split",
                parts: partsTotal,
                bytes,
                sha256,
                archive,
                content,
                startedAt: new Date(startedAt).toISOString(),
                finishedAt: this.timestamp(),
                durationMs,
                outcome: "finished",
            };
            await writeRecord(workspace, record);

            this.emit({ type: "phase", downloadId, phase: "finished", at: this.timestamp() });
            this.emit({
                type: "finished",
                downloadId,
                archive,
                content,
                bytes,
                sha256,
                durationMs,
                at: this.timestamp(),
            });
            return { ok: true, downloadId, archive, content, bytes, sha256, durationMs, record };
        } catch (error) {
            if (isAbort(error) || controller.signal.aborted) {
                // Everything stays: the parts are individually checksummed, and the
                // half-written one is exactly what the next attempt resumes from.
                await rm(workspace.contentDir, { recursive: true, force: true }).catch(() => undefined);
                this.emit({ type: "cancelled", downloadId, at: this.timestamp() });
                return { ok: false, downloadId, failure: failures.cancelled() };
            }
            // Nothing that could be mistaken for a finished download survives a failure.
            await rm(archive, { force: true }).catch(() => undefined);
            await rm(workspace.contentDir, { recursive: true, force: true }).catch(() => undefined);
            return this.reportFailure(downloadId, this.describe(error, chosen.name));
        }
    }

    private async fetchManifest(
        downloadId: string,
        workspace: DownloadWorkspace,
        asset: ReleaseAsset,
        controller: AbortController,
    ): Promise<PartsManifest> {
        const path = join(workspace.partsDir, asset.name);
        await downloadToFile(this.assetUrl(asset), path, {
            fetch: this.fetch(),
            headers: this.assetHeaders(),
            signal: controller.signal,
        });
        const manifest = await readManifest(path);
        this.emit({
            type: "log",
            downloadId,
            level: "info",
            message:
                `${manifest.file} was published in ${String(manifest.parts.length)} parts ` +
                `totalling ${String(manifest.bytes)} bytes.`,
            at: this.timestamp(),
        });
        return manifest;
    }

    private async fetchParts(
        downloadId: string,
        workspace: DownloadWorkspace,
        assets: readonly ReleaseAsset[],
        manifest: PartsManifest,
        controller: AbortController,
    ): Promise<void> {
        this.emit({ type: "phase", downloadId, phase: "downloading", at: this.timestamp() });

        const byName = new Map<string, ReleaseAsset>();
        for (const asset of assets) byName.set(asset.name, asset);

        const bytesTotal = manifest.bytes;
        // Seeded with what is already on disk so a resumed download does not start its
        // bar at zero and then jump.
        const progressByPart = new Map<number, number>();
        let partsDone = 0;
        const startedAt = Date.now();

        const publish = (currentPart: string | null): void => {
            let bytesDone = 0;
            for (const value of progressByPart.values()) bytesDone += value;
            this.emitProgress(downloadId, "downloading", {
                description: currentPart === null ? "Downloading" : `Downloading ${currentPart}`,
                bytesDone,
                bytesTotal,
                partsDone,
                partsTotal: manifest.parts.length,
                currentPart,
                startedAt,
            });
        };

        const queue = [...manifest.parts];
        const workers = Math.max(1, Math.min(this.options.concurrency ?? 4, queue.length));
        const failuresSeen: unknown[] = [];

        const worker = async (): Promise<void> => {
            for (;;) {
                const record = queue.shift();
                if (record === undefined) return;
                if (controller.signal.aborted) return;
                const asset = byName.get(record.name);
                if (asset === undefined) {
                    failuresSeen.push(
                        failures.assetNotFound(record.name, [...byName.keys()]),
                    );
                    controller.abort();
                    return;
                }
                try {
                    await this.fetchOnePart(workspace, asset, record, controller, (total) => {
                        progressByPart.set(record.index, total);
                        publish(record.name);
                    });
                    partsDone += 1;
                    progressByPart.set(record.index, record.bytes);
                    publish(record.name);
                } catch (error) {
                    failuresSeen.push(error);
                    return;
                }
            }
        };

        publish(null);
        await Promise.all(Array.from({ length: workers }, () => worker()));
        const first = failuresSeen[0];
        if (first !== undefined) throw first;
        if (controller.signal.aborted) controller.signal.throwIfAborted();
    }

    /**
     * One part, fetched, checked, and re-fetched once if it arrived wrong.
     *
     * The retry deletes the file first rather than resuming into it. A part that failed
     * its digest is the one file on disk that must not be reused, and resuming into it
     * would append correct bytes onto wrong ones for ever.
     */
    private async fetchOnePart(
        workspace: DownloadWorkspace,
        asset: ReleaseAsset,
        record: PartRecord,
        controller: AbortController,
        onBytes: (total: number) => void,
    ): Promise<void> {
        const path = join(workspace.partsDir, record.name);
        const attempts = Math.max(1, (this.options.partRetries ?? 1) + 1);
        let last: PartsIntegrityError | null = null;

        for (let attempt = 0; attempt < attempts; attempt++) {
            controller.signal.throwIfAborted();
            await downloadToFile(this.assetUrl(asset), path, {
                fetch: this.fetch(),
                headers: this.assetHeaders(),
                signal: controller.signal,
                expectedBytes: record.bytes,
                onBytes: (_delta, total) => onBytes(total),
            });
            const digest = await sha256File(path, controller.signal);
            if (digest === record.sha256) return;
            last = new PartsIntegrityError(
                `${record.name} arrived with SHA-256 ${digest}, not ${record.sha256}.`,
                record,
                record.sha256,
                digest,
            );
            await rm(path, { force: true });
        }
        throw last ?? new Error(`${record.name} could not be downloaded.`);
    }

    private async rejoin(
        downloadId: string,
        workspace: DownloadWorkspace,
        manifest: PartsManifest,
        controller: AbortController,
    ): Promise<{ bytes: number; sha256: string }> {
        this.emit({ type: "phase", downloadId, phase: "joining", at: this.timestamp() });
        const startedAt = Date.now();
        const result = await joinParts(join(workspace.partsDir, manifestNameFor(manifest.file)), {
            outDir: workspace.root,
            signal: controller.signal,
            onProgress: (progress) => {
                this.emitProgress(downloadId, "joining", {
                    description: `Rejoining ${manifest.file}`,
                    bytesDone: progress.bytesDone,
                    bytesTotal: progress.bytesTotal,
                    partsDone: progress.partsDone,
                    partsTotal: progress.partsTotal,
                    currentPart: progress.partName,
                    startedAt,
                });
            },
        });
        return { bytes: result.bytes, sha256: result.sha256 };
    }

    private async fetchWhole(
        downloadId: string,
        asset: ReleaseAsset,
        destination: string,
        controller: AbortController,
    ): Promise<{ bytes: number; sha256: string }> {
        this.emit({ type: "phase", downloadId, phase: "downloading", at: this.timestamp() });
        const startedAt = Date.now();
        const result = await downloadToFile(this.assetUrl(asset), destination, {
            fetch: this.fetch(),
            headers: this.assetHeaders(),
            signal: controller.signal,
            expectedBytes: asset.size,
            onBytes: (_delta, total) => {
                this.emitProgress(downloadId, "downloading", {
                    description: `Downloading ${asset.name}`,
                    bytesDone: total,
                    bytesTotal: asset.size,
                    partsDone: 0,
                    partsTotal: 1,
                    currentPart: asset.name,
                    startedAt,
                });
            },
        });
        // An asset that was small enough to publish whole has no published checksum, so
        // the digest is recorded rather than checked. Saying which it is matters: a
        // recorded digest is provenance, and calling it verification would be a claim
        // this code cannot support.
        const sha256 = await sha256File(destination, controller.signal);
        return { bytes: result.bytes, sha256 };
    }

    private async unpack(
        downloadId: string,
        workspace: DownloadWorkspace,
        archive: string,
        controller: AbortController,
    ): Promise<string> {
        const startedAt = Date.now();
        // A previous attempt's half-unpacked tree is never merged into: entries it wrote
        // and this archive does not contain would survive as files nobody put there.
        await rm(workspace.contentDir, { recursive: true, force: true });
        try {
            const result = await extractZip(archive, workspace.contentDir, {
                signal: controller.signal,
                onProgress: (progress) => {
                    this.emitProgress(downloadId, "extracting", {
                        description: `Unpacking ${basename(archive)}`,
                        bytesDone: progress.bytesDone,
                        bytesTotal: progress.bytesTotal,
                        partsDone: progress.entriesDone,
                        partsTotal: progress.entriesTotal,
                        currentPart: progress.currentEntry,
                        startedAt,
                    });
                },
            });
            return result.root;
        } catch (error) {
            // A cancellation is not an extraction failure and must not be reported as
            // one; anything else that comes out of a zip reader is.
            if (isAbort(error) || controller.signal.aborted) throw error;
            throw asExtractError(error);
        }
    }

    /* ---------------------------------------------------------------------- */

    private storageDir(): string {
        const value = this.options.storageDir;
        return typeof value === "function" ? value() : value;
    }

    private fetch(): FetchLike {
        return this.options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    }

    private token(): string | null {
        return this.options.token?.() ?? null;
    }

    private lookupOptions(): {
        fetch: FetchLike;
        token: string | null;
        apiBase?: string;
    } {
        return {
            fetch: this.fetch(),
            token: this.token(),
            ...(this.options.apiBase === undefined ? {} : { apiBase: this.options.apiBase }),
        };
    }

    /**
     * The URL a part is actually fetched from.
     *
     * With a token, the API URL, because it is the only one that works for a private
     * release and because undici drops the `Authorization` header on the cross-origin
     * redirect to storage, so the token never reaches the CDN.
     *
     * Without one, the browser download URL, which needs no authentication and is not
     * subject to the unauthenticated API's sixty-requests-an-hour limit. A twenty-part
     * world would otherwise spend a third of that limit on a single download.
     */
    private assetUrl(asset: ReleaseAsset): string {
        return this.token() === null ? asset.downloadUrl : asset.apiUrl;
    }

    private assetHeaders(): Record<string, string> {
        const token = this.token();
        if (token === null) return { "user-agent": "material-bluemap" };
        return { ...apiHeaders(token), accept: "application/octet-stream" };
    }

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }

    private emit(event: DownloadEvent): void {
        this.options.onEvent(event);
    }

    private emitProgress(
        downloadId: string,
        phase: Exclude<DownloadPhase, "finished">,
        detail: {
            description: string;
            bytesDone: number;
            bytesTotal: number;
            partsDone: number;
            partsTotal: number;
            currentPart: string | null;
            startedAt: number;
        },
    ): void {
        const fraction = detail.bytesTotal <= 0 ? 1 : Math.min(1, detail.bytesDone / detail.bytesTotal);
        const eta = estimateEta(detail.bytesDone, detail.bytesTotal, Date.now() - detail.startedAt);
        this.emit({
            type: "progress",
            downloadId,
            phase,
            task: {
                phase,
                description: detail.description,
                bytesDone: detail.bytesDone,
                bytesTotal: detail.bytesTotal,
                partsDone: detail.partsDone,
                partsTotal: detail.partsTotal,
                currentPart: detail.currentPart,
                percent: overallPercent(phase, fraction),
                etaSeconds: eta,
                etaText: eta === null ? null : formatEta(eta),
            },
            at: this.timestamp(),
        });
    }

    private reportFailure(downloadId: string, failure: DownloadFailure): DownloadFailureResult {
        this.emit({ type: "failed", downloadId, failure, at: this.timestamp() });
        return { ok: false, downloadId, failure };
    }

    /** Turns whatever was thrown into the one typed reason the interface acts on. */
    private describe(error: unknown, subject: string): DownloadFailure {
        if (error instanceof ReleaseRequestError) {
            return error.status === 404
                ? failures.releaseNotFound(subject, error.status, error.url)
                : failures.networkFailed(error.url, error.message, error.status);
        }
        if (error instanceof PartsManifestError) return failures.manifestInvalid(error.message);
        if (error instanceof PartsIntegrityError) return failures.integrityFailed(error.message);
        if (error instanceof ExtractError) return failures.extractFailed(error.message);
        if (isAbort(error)) return failures.cancelled();
        if (error instanceof HttpDownloadError) {
            return error.status === null
                ? failures.networkFailed(error.url, error.message)
                : failures.networkFailed(error.url, error.message, error.status);
        }
        if (isDownloadFailure(error)) return error;
        const message = error instanceof Error ? error.message : String(error);
        return failures.networkFailed(subject, message);
    }
}

function isDownloadFailure(value: unknown): value is DownloadFailure {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { code?: unknown }).code === "string" &&
        typeof (value as { message?: unknown }).message === "string" &&
        "settings" in value
    );
}

function validate(request: DownloadRequest): DownloadFailure | null {
    if (typeof request.owner !== "string" || !/^[\w.-]+$/.test(request.owner)) {
        return failures.invalidRequest("The repository owner is missing or not a valid name.");
    }
    if (typeof request.repo !== "string" || !/^[\w.-]+$/.test(request.repo)) {
        return failures.invalidRequest("The repository name is missing or not a valid name.");
    }
    if (request.asset !== undefined && request.asset.length === 0) {
        return failures.invalidRequest("The asset name is empty.");
    }
    return null;
}

function choose(offered: readonly AvailableDownload[], asset: string | undefined): AvailableDownload | null {
    if (asset !== undefined) return findDownload(offered, asset);
    const split = offered.filter((entry) => entry.kind === "split");
    return split.length === 1 ? (split[0] ?? null) : null;
}

async function writeRecord(workspace: DownloadWorkspace, record: DownloadRecord): Promise<void> {
    await writeFile(workspace.recordFile, `${JSON.stringify(record, null, 4)}\n`, "utf8");
}

function overallPercent(phase: Exclude<DownloadPhase, "finished">, fraction: number): number {
    let done = 0;
    for (const [name, weight] of Object.entries(PHASE_WEIGHTS)) {
        if (name === phase) break;
        done += weight;
    }
    return Math.min(100, (done + PHASE_WEIGHTS[phase] * fraction) * 100);
}

/** Seconds remaining from the throughput so far, or null while there is nothing to go on. */
export function estimateEta(bytesDone: number, bytesTotal: number, elapsedMs: number): number | null {
    if (bytesDone <= 0 || elapsedMs < 1000 || bytesTotal <= bytesDone) return null;
    const rate = bytesDone / (elapsedMs / 1000);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return Math.round((bytesTotal - bytesDone) / rate);
}

/** The shape upstream's CLI prints, so both bars read the same way. */
export function formatEta(seconds: number): string {
    if (seconds < 60) return `${String(seconds)} seconds`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${String(minutes)} minutes`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${String(hours)} hours` : `${String(hours)} hours ${String(rest)} minutes`;
}
