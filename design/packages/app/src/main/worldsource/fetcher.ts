/**
 * Fetching a world out of *anybody's* release, in whichever way they published it.
 *
 * This is the release downloader's cross-repository twin, and it is deliberately thin:
 * everything that was already solved is reused rather than restated.
 *
 * - the release lookup, the token decision and the CDN-versus-API URL choice come from
 *   `download/release.ts`;
 * - the resumable ranged transfer comes from `download/http.ts`;
 * - the safe unpack comes from `download/extract.ts`;
 * - the join, with its per-part re-check and its resume, comes from
 *   `@material-bluemap/parts` - the same joiner `scripts/join-parts.mjs` runs;
 * - the event shapes, the failure codes and the on-disk workspace come from
 *   `download/`, so a world fetched from somebody else's repository is reported by the
 *   interface exactly as one fetched from this one.
 *
 * What is genuinely new is one thing: a release whose split is described by a `SHA256SUMS`
 * rather than by a `<name>.parts.json`. A split published the way this project publishes
 * one is handed straight to {@link ReleaseDownloader}, which already does it and already
 * does it better - it has the publisher's own whole-file digest, and this path does not.
 *
 * ## The order of the steps is the design
 *
 * 1. read the release, from whichever repository was named;
 * 2. fetch the checksum list first - it is a few hundred bytes and it is the only thing
 *    that says what the parts are supposed to be;
 * 3. fetch every part, with `Range` resume and a concurrency cap;
 * 4. hash every part in join order, checking each against the published digest and
 *    deriving the whole-file digest in the same pass;
 * 5. join, which re-checks each part as it appends and then checks the whole;
 * 6. unpack.
 *
 * Nothing downstream of step 4 runs on unverified bytes, and a part that failed its digest
 * is deleted before it is re-fetched, because it is the one file on disk that must not be
 * resumed into.
 *
 * A **failure** deletes the joined archive and the unpacked tree - the two things that look
 * finished to whatever comes next - and keeps the parts, which are individually checksummed
 * and safe to resume from. A **cancellation** keeps everything, including the half-written
 * part: that is the point of a resumable download, and a cancellation is not a failure.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { PartsIntegrityError, PartsManifestError, joinParts } from "@material-bluemap/parts";
import * as failures from "../download/failure.js";
import type { DownloadFailure } from "../download/failure.js";
import { ReleaseDownloader } from "../download/downloader.js";
import type {
    DownloadEvent,
    DownloadPhase,
    DownloadRecord,
    DownloadResult,
    ReleaseDownloaderOptions,
} from "../download/downloader.js";
import { ExtractError, asExtractError, extractZip } from "../download/extract.js";
import { HttpDownloadError, downloadToFile, isAbort } from "../download/http.js";
import { ReleaseRequestError, apiHeaders, fetchRelease } from "../download/release.js";
import type { FetchLike, ReleaseAsset, ReleaseInfo } from "../download/release.js";
import { archivePath, downloadIdFor, downloadWorkspace } from "../download/workspace.js";
import type { DownloadWorkspace } from "../download/workspace.js";
import { ChecksumFileError, checksumsByName, parseChecksums } from "./checksums.js";
import { WorldSourceLayoutError, findWorldSource, partCount, worldSourcesIn } from "./layout.js";
import type { ChecksumWorldSource, WorldSource } from "./layout.js";
import { serialiseManifest, synthesiseManifest, synthesisedManifestName } from "./manifest.js";
import { isValidReference } from "./repository.js";
import { compareDigests, digestParts } from "./verify.js";

/** What one row in the "download a world from a release" list shows. */
export interface WorldSourceSummary {
    readonly name: string;
    readonly kind: WorldSource["kind"];
    readonly parts: number;
    readonly bytes: number;
    /**
     * Where the digests come from, in words the interface can show without deciding.
     *
     * The two are not equivalent and the difference is worth surfacing: a manifest carries
     * the publisher's digest for the whole archive, and a checksum list carries one per
     * part and none for the whole.
     */
    readonly verification: "manifest" | "checksum-list" | "none";
}

export interface WorldSourceReleaseSummary {
    readonly owner: string;
    readonly repo: string;
    readonly tag: string;
    readonly name: string;
    readonly htmlUrl: string;
    readonly sources: readonly WorldSourceSummary[];
}

export interface WorldSourceRequest {
    readonly owner: string;
    readonly repo: string;
    /** A tag, or omitted for GitHub's own definition of `latest`. */
    readonly tag?: string;
    /**
     * Which world to fetch, by the name it presents: `world.zip` for something published
     * as `world.zip.part.0000`, `world.zip.part.0001`, ... beside a `SHA256SUMS`.
     *
     * Omitted, and the release offers exactly one split world, that one is taken. Omitted
     * with several, the request is refused rather than guessed at.
     */
    readonly asset?: string;
    /** Unpack the archive afterwards. Defaults to true for a `.zip`. */
    readonly extract?: boolean;
}

export interface WorldSourceFetcherOptions extends ReleaseDownloaderOptions {
    /**
     * The downloader a manifest-shaped or whole download is handed to.
     *
     * Injected so the app can share the one it already has - the downloads panel lists
     * whatever that instance is doing, and a second instance would run downloads the panel
     * could not see or cancel.
     */
    readonly downloader?: ReleaseDownloader;
}

interface Active {
    readonly controller: AbortController;
}

/** How much of the overall bar each phase is worth. An estimate, and labelled as one. */
const PHASE_WEIGHTS: Readonly<Record<Exclude<DownloadPhase, "finished">, number>> = {
    resolving: 0.01,
    downloading: 0.66,
    // Heavier than the release downloader's, because this path hashes every part in a
    // pass of its own before the join, which the manifest path does not have to do.
    joining: 0.23,
    extracting: 0.1,
};

export class WorldSourceFetcher {
    private readonly options: WorldSourceFetcherOptions;
    private readonly downloader: ReleaseDownloader;
    private readonly active = new Map<string, Active>();

    constructor(options: WorldSourceFetcherOptions) {
        this.options = options;
        this.downloader = options.downloader ?? new ReleaseDownloader(options);
    }

    /** Every id in flight, whichever of the two paths is running it. */
    activeDownloadIds(): string[] {
        return [...new Set([...this.active.keys(), ...this.downloader.activeDownloadIds()])];
    }

    /**
     * Stops a fetch. False when nothing is running under that id.
     *
     * Both paths are asked, because the caller does not know which one took the download
     * and should not have to: a cancel that only worked for half the layouts is a cancel
     * button that works intermittently for reasons nobody can see.
     */
    cancel(downloadId: string): boolean {
        const running = this.active.get(downloadId);
        if (running !== undefined) {
            running.controller.abort();
            return true;
        }
        return this.downloader.cancel(downloadId);
    }

    /** What a release offers, without downloading any of it. */
    async discover(
        owner: string,
        repo: string,
        tag?: string,
    ): Promise<
        | { readonly ok: true; readonly release: WorldSourceReleaseSummary }
        | { readonly ok: false; readonly failure: DownloadFailure }
    > {
        if (!isValidReference(owner, repo)) {
            return {
                ok: false,
                failure: failures.invalidRequest(
                    `'${owner}/${repo}' is not a repository name GitHub could have.`,
                ),
            };
        }
        try {
            const release = await this.readRelease(owner, repo, tag);
            return {
                ok: true,
                release: {
                    owner,
                    repo,
                    tag: release.tag,
                    name: release.name,
                    htmlUrl: release.htmlUrl,
                    sources: worldSourcesIn(release).map(summarise),
                },
            };
        } catch (error) {
            return { ok: false, failure: this.describe(error, `${owner}/${repo}`) };
        }
    }

    /**
     * Fetches one world. Never rejects.
     *
     * Every outcome the interface has to render - a bad request, a release that is not
     * there, a part that failed its digest, a cancellation - is a value. A rejection would
     * arrive at the renderer as a bare `Error` with a stack in it.
     */
    async fetch(request: WorldSourceRequest): Promise<DownloadResult> {
        if (!isValidReference(request.owner, request.repo)) {
            return this.reportFailure(
                "",
                failures.invalidRequest("The repository owner or name is missing or not valid."),
            );
        }
        if (request.asset !== undefined && request.asset.length === 0) {
            return this.reportFailure("", failures.invalidRequest("The world's name is empty."));
        }

        let release: ReleaseInfo;
        let sources: WorldSource[];
        try {
            release = await this.readRelease(request.owner, request.repo, request.tag);
            sources = worldSourcesIn(release);
        } catch (error) {
            return this.reportFailure(
                "",
                this.describe(error, `${request.owner}/${request.repo}`),
            );
        }

        const chosen = choose(sources, request.asset);
        if (chosen === null) {
            return this.reportFailure(
                "",
                request.asset === undefined
                    ? failures.invalidRequest(
                          "The release offers several worlds, so one has to be named. It has: " +
                              `${sources.map((source) => source.name).join(", ") || "nothing"}.`,
                      )
                    : failures.assetNotFound(
                          request.asset,
                          sources.map((source) => source.name),
                      ),
            );
        }

        // A layout this project publishes goes to the code that already reads it. That
        // path has the publisher's whole-file digest; this one does not, and using the
        // weaker route for a release that carries the stronger one would be a downgrade
        // nobody asked for.
        if (chosen.kind !== "checksums") {
            return await this.downloader.download({
                owner: request.owner,
                repo: request.repo,
                ...(request.tag === undefined ? {} : { tag: request.tag }),
                asset: chosen.name,
                ...(request.extract === undefined ? {} : { extract: request.extract }),
            });
        }

        const downloadId = downloadIdFor(request.owner, request.repo, release.tag, chosen.name);
        if (this.active.has(downloadId) || this.downloader.activeDownloadIds().includes(downloadId)) {
            return this.reportFailure(downloadId, failures.alreadyRunning(downloadId));
        }

        const controller = new AbortController();
        this.active.set(downloadId, { controller });
        try {
            return await this.runChecksums(downloadId, request, release, chosen, controller);
        } finally {
            this.active.delete(downloadId);
        }
    }

    /* ------------------------------------------------------------------ */

    private async runChecksums(
        downloadId: string,
        request: WorldSourceRequest,
        release: ReleaseInfo,
        source: ChecksumWorldSource,
        controller: AbortController,
    ): Promise<DownloadResult> {
        const workspace = downloadWorkspace(this.storageDir(), downloadId);
        const archive = archivePath(workspace, source.name);
        const wantsExtract = request.extract ?? source.name.toLowerCase().endsWith(".zip");
        const startedAt = Date.now();

        try {
            await mkdir(workspace.partsDir, { recursive: true });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return this.reportFailure(downloadId, failures.storageUnwritable(workspace.root, detail));
        }

        this.emit({
            type: "started",
            downloadId,
            asset: source.name,
            release: release.tag,
            parts: source.parts.length,
            bytesTotal: source.bytes,
            at: this.timestamp(),
        });

        try {
            const token = (await this.options.token?.()) ?? null;

            this.emit({ type: "phase", downloadId, phase: "resolving", at: this.timestamp() });
            const published = await this.readChecksums(downloadId, workspace, source, controller, token);

            this.emit({ type: "phase", downloadId, phase: "downloading", at: this.timestamp() });
            await this.transfer(downloadId, workspace, source, controller, token);

            this.emit({ type: "phase", downloadId, phase: "joining", at: this.timestamp() });
            const manifestPath = await this.verifyAndDescribe(
                downloadId,
                workspace,
                source,
                published,
                controller,
                token,
            );
            const joined = await joinParts(manifestPath, {
                outDir: workspace.root,
                signal: controller.signal,
                onProgress: (progress) => {
                    this.emitProgress(downloadId, "joining", {
                        description: `Joining ${source.name}`,
                        bytesDone: progress.bytesDone,
                        bytesTotal: progress.bytesTotal,
                        partsDone: progress.partsDone,
                        partsTotal: progress.partsTotal,
                        currentPart: progress.partName,
                        startedAt,
                    });
                },
            });

            let content: string | null = null;
            if (wantsExtract) {
                this.emit({ type: "phase", downloadId, phase: "extracting", at: this.timestamp() });
                content = await this.unpack(downloadId, workspace, archive, controller, startedAt);
            }

            const durationMs = Date.now() - startedAt;
            const record: DownloadRecord = {
                version: 1,
                downloadId,
                owner: request.owner,
                repo: request.repo,
                tag: release.tag,
                asset: source.name,
                split: true,
                parts: source.parts.length,
                bytes: joined.bytes,
                sha256: joined.sha256,
                archive,
                content,
                startedAt: new Date(startedAt).toISOString(),
                finishedAt: this.timestamp(),
                durationMs,
                outcome: "finished",
            };
            await writeFile(workspace.recordFile, `${JSON.stringify(record, null, 4)}\n`, "utf8");

            this.emit({ type: "phase", downloadId, phase: "finished", at: this.timestamp() });
            this.emit({
                type: "finished",
                downloadId,
                archive,
                content,
                bytes: joined.bytes,
                sha256: joined.sha256,
                durationMs,
                at: this.timestamp(),
            });
            return {
                ok: true,
                downloadId,
                archive,
                content,
                bytes: joined.bytes,
                sha256: joined.sha256,
                durationMs,
                record,
            };
        } catch (error) {
            if (isAbort(error) || controller.signal.aborted) {
                // Everything stays. The parts are individually checksummed, and the
                // half-written one is exactly what the next attempt resumes from.
                await rm(workspace.contentDir, { recursive: true, force: true }).catch(() => undefined);
                this.emit({ type: "cancelled", downloadId, at: this.timestamp() });
                return { ok: false, downloadId, failure: failures.cancelled() };
            }
            await rm(archive, { force: true }).catch(() => undefined);
            await rm(workspace.contentDir, { recursive: true, force: true }).catch(() => undefined);
            return this.reportFailure(downloadId, this.describe(error, source.name));
        }
    }

    private async readChecksums(
        downloadId: string,
        workspace: DownloadWorkspace,
        source: ChecksumWorldSource,
        controller: AbortController,
        token: string | null,
    ): Promise<Map<string, string>> {
        const path = join(workspace.partsDir, source.checksums.name);
        await downloadToFile(this.assetUrl(source.checksums, token), path, {
            fetch: this.http(),
            headers: this.headers(token),
            signal: controller.signal,
        });
        const text = await readFile(path, "utf8");
        const entries = parseChecksums(text, source.checksums.name);
        this.emit({
            type: "log",
            downloadId,
            level: "info",
            message:
                `${source.checksums.name} lists ${String(entries.length)} digests; ` +
                `${source.name} is published in ${String(source.parts.length)} parts.`,
            at: this.timestamp(),
        });
        return checksumsByName(entries);
    }

    /** Every part, several at a time, each resuming from whatever is already on disk. */
    private async transfer(
        downloadId: string,
        workspace: DownloadWorkspace,
        source: ChecksumWorldSource,
        controller: AbortController,
        token: string | null,
    ): Promise<void> {
        const bytesTotal = source.bytes;
        const progressByPart = new Map<string, number>();
        const startedAt = Date.now();
        let partsDone = 0;

        const publish = (currentPart: string | null): void => {
            let bytesDone = 0;
            for (const value of progressByPart.values()) bytesDone += value;
            this.emitProgress(downloadId, "downloading", {
                description: currentPart === null ? "Downloading" : `Downloading ${currentPart}`,
                bytesDone,
                bytesTotal,
                partsDone,
                partsTotal: source.parts.length,
                currentPart,
                startedAt,
            });
        };

        const queue = [...source.parts];
        const workers = Math.max(1, Math.min(this.options.concurrency ?? 4, queue.length));
        const seen: unknown[] = [];

        const worker = async (): Promise<void> => {
            for (;;) {
                const part = queue.shift();
                if (part === undefined) return;
                if (controller.signal.aborted) return;
                try {
                    await downloadToFile(
                        this.assetUrl(part.asset, token),
                        join(workspace.partsDir, part.name),
                        {
                            fetch: this.http(),
                            headers: this.headers(token),
                            signal: controller.signal,
                            expectedBytes: part.asset.size,
                            onBytes: (_delta, total) => {
                                progressByPart.set(part.name, total);
                                publish(part.name);
                            },
                        },
                    );
                    partsDone += 1;
                    progressByPart.set(part.name, part.asset.size);
                    publish(part.name);
                } catch (error) {
                    seen.push(error);
                    return;
                }
            }
        };

        publish(null);
        await Promise.all(Array.from({ length: workers }, () => worker()));
        const first = seen[0];
        if (first !== undefined) throw first;
        if (controller.signal.aborted) controller.signal.throwIfAborted();
    }

    /**
     * Checks every part against the release's own digests, then writes the manifest.
     *
     * A part that disagrees is deleted and fetched again - deleted first, and not resumed
     * into, because bytes that failed a digest are the one thing on disk that must never
     * be appended to. The whole pass then runs again rather than being patched up: the
     * derived whole-file digest is a running hash over the parts in order, and there is no
     * way to rewind one part's worth of it.
     */
    private async verifyAndDescribe(
        downloadId: string,
        workspace: DownloadWorkspace,
        source: ChecksumWorldSource,
        published: ReadonlyMap<string, string>,
        controller: AbortController,
        token: string | null,
    ): Promise<string> {
        const files = source.parts.map((part) => ({
            name: part.name,
            path: join(workspace.partsDir, part.name),
        }));
        const attempts = Math.max(1, (this.options.partRetries ?? 1) + 1);
        const startedAt = Date.now();

        for (let attempt = 0; attempt < attempts; attempt++) {
            controller.signal.throwIfAborted();
            const digested = await digestParts(files, {
                signal: controller.signal,
                onProgress: (progress) => {
                    this.emitProgress(downloadId, "joining", {
                        description: `Checking ${progress.partName}`,
                        bytesDone: progress.bytesDone,
                        bytesTotal: progress.bytesTotal,
                        partsDone: progress.partsDone,
                        partsTotal: progress.partsTotal,
                        currentPart: progress.partName,
                        startedAt,
                    });
                },
            });

            const mismatches = compareDigests(digested.parts, published);
            if (mismatches.length === 0) {
                const manifest = synthesiseManifest({
                    file: source.name,
                    parts: digested.parts.map((part) => ({
                        name: part.name,
                        bytes: part.bytes,
                        sha256: part.sha256,
                    })),
                    sha256: digested.sha256,
                });
                const manifestPath = join(workspace.partsDir, synthesisedManifestName(source.name));
                await writeFile(manifestPath, serialiseManifest(manifest), "utf8");
                this.emit({
                    type: "log",
                    downloadId,
                    level: "info",
                    message:
                        `All ${String(digested.parts.length)} parts match ${source.checksums.name}. ` +
                        "The whole-archive digest is derived from them locally; the release " +
                        "publishes one digest per part and none for the whole file.",
                    at: this.timestamp(),
                });
                return manifestPath;
            }

            const named = mismatches
                .map((entry) => `${entry.name} is ${entry.actual}, not ${entry.expected}`)
                .join("; ");
            if (attempt + 1 >= attempts) {
                throw new PartsIntegrityError(
                    `${String(mismatches.length)} part(s) do not match ${source.checksums.name}: ${named}.`,
                    null,
                    mismatches[0]?.expected ?? "",
                    mismatches[0]?.actual ?? "",
                );
            }

            this.emit({
                type: "log",
                downloadId,
                level: "warning",
                message: `Refetching ${String(mismatches.length)} part(s) that arrived wrong: ${named}.`,
                at: this.timestamp(),
            });
            for (const mismatch of mismatches) {
                const part = source.parts.find((entry) => entry.name === mismatch.name);
                if (part === undefined) continue;
                const path = join(workspace.partsDir, part.name);
                await rm(path, { force: true });
                await downloadToFile(this.assetUrl(part.asset, token), path, {
                    fetch: this.http(),
                    headers: this.headers(token),
                    signal: controller.signal,
                    expectedBytes: part.asset.size,
                });
            }
        }

        // Unreachable: the loop either returns or throws. Kept so a future edit to the
        // attempt arithmetic cannot silently fall out of the bottom returning nothing.
        throw new PartsIntegrityError(`${source.name} could not be verified.`, null, "", "");
    }

    private async unpack(
        downloadId: string,
        workspace: DownloadWorkspace,
        archive: string,
        controller: AbortController,
        startedAt: number,
    ): Promise<string> {
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
            if (isAbort(error) || controller.signal.aborted) throw error;
            throw asExtractError(error);
        }
    }

    /* ------------------------------------------------------------------ */

    private async readRelease(owner: string, repo: string, tag: string | undefined): Promise<ReleaseInfo> {
        const token = (await this.options.token?.()) ?? null;
        return await fetchRelease(owner, repo, tag, {
            fetch: this.http(),
            token,
            ...(this.options.apiBase === undefined ? {} : { apiBase: this.options.apiBase }),
        });
    }

    /**
     * With a token, the API URL - the only route that works for a private release, and the
     * one undici strips the `Authorization` header from on the redirect to storage, so the
     * token never reaches the CDN. Without one, the browser URL, which needs no
     * authentication and is not subject to the unauthenticated API's hourly limit.
     */
    private assetUrl(asset: ReleaseAsset, token: string | null): string {
        return token === null ? asset.downloadUrl : asset.apiUrl;
    }

    private headers(token: string | null): Record<string, string> {
        if (token === null) return { "user-agent": "material-bluemap" };
        return { ...apiHeaders(token), accept: "application/octet-stream" };
    }

    private storageDir(): string {
        const value = this.options.storageDir;
        return typeof value === "function" ? value() : value;
    }

    private http(): FetchLike {
        return this.options.fetch ?? ((url, init) => globalThis.fetch(url, init));
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
        const fraction =
            detail.bytesTotal <= 0 ? 1 : Math.min(1, detail.bytesDone / detail.bytesTotal);
        let done = 0;
        for (const [name, weight] of Object.entries(PHASE_WEIGHTS)) {
            if (name === phase) break;
            done += weight;
        }
        const elapsed = Date.now() - detail.startedAt;
        const eta =
            detail.bytesDone > 0 && elapsed >= 1000 && detail.bytesTotal > detail.bytesDone
                ? Math.round(
                      (detail.bytesTotal - detail.bytesDone) / (detail.bytesDone / (elapsed / 1000)),
                  )
                : null;
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
                percent: Math.min(100, (done + PHASE_WEIGHTS[phase] * fraction) * 100),
                etaSeconds: eta,
                etaText: eta === null ? null : formatEtaText(eta),
            },
            at: this.timestamp(),
        });
    }

    private reportFailure(downloadId: string, failure: DownloadFailure): DownloadResult {
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
        if (error instanceof ChecksumFileError) return failures.manifestInvalid(error.message);
        if (error instanceof WorldSourceLayoutError) return failures.manifestInvalid(error.message);
        if (error instanceof PartsManifestError) return failures.manifestInvalid(error.message);
        if (error instanceof PartsIntegrityError) return failures.integrityFailed(error.message);
        if (error instanceof ExtractError) return failures.extractFailed(error.message);
        if (isAbort(error)) return failures.cancelled();
        if (error instanceof HttpDownloadError) {
            return error.status === null
                ? failures.networkFailed(error.url, error.message)
                : failures.networkFailed(error.url, error.message, error.status);
        }
        const message = error instanceof Error ? error.message : String(error);
        return failures.networkFailed(subject, message);
    }
}

function summarise(source: WorldSource): WorldSourceSummary {
    return {
        name: source.name,
        kind: source.kind,
        parts: partCount(source),
        bytes: source.bytes,
        verification:
            source.kind === "manifest"
                ? "manifest"
                : source.kind === "checksums"
                  ? "checksum-list"
                  : "none",
    };
}

function choose(sources: readonly WorldSource[], asset: string | undefined): WorldSource | null {
    if (asset !== undefined) return findWorldSource(sources, asset);
    const split = sources.filter((source) => source.kind !== "whole");
    return split.length === 1 ? (split[0] ?? null) : null;
}

/** The shape the release downloader's bar uses, so both read the same way. */
function formatEtaText(seconds: number): string {
    if (seconds < 60) return `${String(seconds)} seconds`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${String(minutes)} minutes`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${String(hours)} hours` : `${String(hours)} hours ${String(rest)} minutes`;
}
