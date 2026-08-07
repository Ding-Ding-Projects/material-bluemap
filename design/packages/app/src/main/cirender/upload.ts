/**
 * Publishing a world so GitHub's runners can render it: one packer, either credential.
 *
 * ## Why this exists at all, and what it deliberately is not
 *
 * A CI render cannot start until the world is on GitHub, and for a while that step was the
 * one thing a machine with only `gh` could not do. The reasoning was that routing an upload
 * through `gh release upload` would be a *second uploader* - a second archive format, a
 * second part-naming scheme, a second set of release rules, and two ways for a backup made
 * today to be unreadable tomorrow.
 *
 * That reasoning was right about the packer and wrong about the transfer, so the line is
 * now drawn between them. Everything that decides what the bytes *are* is imported from
 * `main/backup/` and is not restated here: {@link packFolder} makes the archive,
 * {@link splitFile} cuts it, {@link partAssetName} names each part after its own digest,
 * {@link serializeCheapLfsPointer} writes the pointer and {@link serializeSidecar} writes
 * `backup.json`. A world published by this module is byte-for-byte a world published by the
 * backup runner, and either can be restored by the existing downloader.
 *
 * What is route-aware is only the **transfer** - create the release, list what it already
 * holds, put one file on it - and that lives behind {@link CiTransport}, so the REST calls
 * and the `gh` commands are two implementations of one interface rather than two uploaders.
 *
 * ## The order is the safety property, and the pointer goes last
 *
 * Parts, then the sidecar, then the pointer. The pointer is the **completion marker**: a
 * release carrying one is an upload that finished, and a release with parts and no pointer
 * is one that stopped part-way. Writing it first - so the release looks complete while the
 * parts are still going up - would produce a world somebody trusts that restores as an
 * unverifiable fragment on the day they need it.
 *
 * ## Resuming, and why it is worth the code
 *
 * A world is measured in gigabytes and a domestic connection is measured in hours, so an
 * interrupted upload that started over would frequently never finish at all. Two things
 * make carrying on cheap, and both work identically on both routes because both are asked
 * of the transport rather than of a credential:
 *
 * - the **staged archive** is re-used when one is already there, and it is *hashed* rather
 *   than trusted, because a half-written archive from a killed process has exactly the name
 *   and roughly the size a finished one would have;
 * - the **assets already on the release** are read back and skipped when the name *and* the
 *   size match. The name is what makes that a digest check rather than a guess: a part's
 *   asset name carries the first sixteen hex characters of its own SHA-256, so an asset
 *   under that name is one whose content hashed to that value when it went up. A part whose
 *   size does not match is a truncated upload and is sent again - which is what
 *   `gh release upload --clobber` exists for on the `gh` side.
 *
 * ## Every staged file is named as its asset before anything is uploaded
 *
 * `gh release upload` names an asset after the file's own basename, so a part staged as
 * `world.zip.000` would land under a name the pointer never mentions and a restore would
 * look for an asset that is not there. The rename happens here, once, for both routes,
 * rather than being a quirk one transport works around invisibly.
 */

import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { sha256File, splitFile } from "@worldlens/parts";
import type { PartsManifest } from "@worldlens/parts";
import {
    CHEAP_LFS_POINTER_VERSION,
    GitHubCallError,
    POINTER_ASSET_SUFFIX,
    SIDECAR_ASSET_NAME,
    archiveNameFor,
    backupIdFor,
    backupWorkspace,
    inspectBackupSource,
    packFolder,
    partAssetName,
    pruneStagedPayload,
    releaseTagFor,
    serializeCheapLfsPointer,
    serializeSidecar,
    stagedArchivePath,
    stagedPointerPath,
} from "../backup/index.js";
import type { BackupSidecar, BackupSource, CheapLfsPointerPart } from "../backup/index.js";
import { ActionsCallError } from "./actions.js";
import type { CiRelease, CiTransport } from "./transport.js";

/**
 * What a resumed upload needs to find its own earlier attempt.
 *
 * Both halves, because both are timestamped. The tag names the release the parts are
 * already on; the archive name names the staged file on disk and every asset derived from
 * it. Carrying only the tag would resume onto the right release with a freshly packed
 * archive under a different name, which uploads the whole world again and leaves the first
 * attempt's parts stranded beside it.
 */
export interface CiUploadResume {
    readonly tag: string;
    readonly archiveName: string;
}

export type CiUploadEvent =
    | {
          /**
           * The release exists and is about to be uploaded to.
           *
           * Emitted **before** the first byte moves, and for a resumed release as well as a
           * new one, so a caller can write the tag down. A caller that recorded it only on
           * success could never resume the upload that failed.
           */
          readonly type: "release";
          readonly tag: string;
          readonly archiveName: string;
          readonly url: string;
      }
    | { readonly type: "log"; readonly message: string }
    | {
          readonly type: "progress";
          readonly description: string;
          readonly bytesDone: number;
          readonly bytesTotal: number;
          readonly assetsDone: number;
          readonly assetsTotal: number;
          readonly asset: string | null;
      };

export interface CiUploadRequest {
    /** The credential this whole upload runs on. Chosen once, by the sync that called in. */
    readonly transport: CiTransport;
    readonly owner: string;
    readonly repo: string;
    /** The Minecraft world folder, absolute. */
    readonly worldFolder: string;
    /** Where backups are staged. The backup runner's own directory, deliberately shared. */
    readonly storageDir: string;
    readonly partSize: number;
    readonly resume?: CiUploadResume | undefined;
    readonly appVersion?: string | null | undefined;
    /** Overridable so a test does not depend on the clock. Defaults to now. */
    readonly at?: Date | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly onEvent?: ((event: CiUploadEvent) => void) | undefined;
}

export interface CiUploadSummary {
    readonly tag: string;
    readonly releaseUrl: string;
    readonly archive: string;
    readonly bytes: number;
    readonly sha256: string;
    /** How many assets the archive itself became. More than one cannot be CI-rendered. */
    readonly parts: number;
    readonly label: string;
}

export interface CiUploadFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly status: number | null;
    /** True when signing in again - to this application or to `gh` - is what would fix it. */
    readonly needsSignIn: boolean;
}

export type CiUploadResult =
    | { readonly ok: true; readonly summary: CiUploadSummary }
    | { readonly ok: false; readonly failure: CiUploadFailure };

/**
 * Packs the world, publishes it, and answers what it produced.
 *
 * A refusal is a **value**, never a rejection, so the sync loop has one shape to handle -
 * except for a cancellation, which is re-thrown so the caller's own abort handling stays
 * the single place that decides what "stopped" means.
 */
export async function uploadWorldForRender(request: CiUploadRequest): Promise<CiUploadResult> {
    try {
        return { ok: true, summary: await run(request) };
    } catch (error) {
        // A cancelled upload is not a failed one, and the difference matters: what has been
        // packed and uploaded is kept, and starting again carries on from it.
        if (request.signal?.aborted === true) throw error;
        return { ok: false, failure: failureFrom(error) };
    }
}

async function run(request: CiUploadRequest): Promise<CiUploadSummary> {
    const { transport, owner, repo, signal } = request;
    const at = request.at ?? new Date();
    const say = (event: CiUploadEvent): void => request.onEvent?.(event);

    /* -- what is being packed ------------------------------------------------ */

    const inspected = await inspectBackupSource("world", request.worldFolder, signal);
    if (!inspected.ok) {
        throw new UploadRefusal(inspected.failure.code, inspected.failure.message);
    }
    const source = inspected.source;

    /*
     * The tag and the archive name are the two timestamped identities of this upload, and a
     * resume has to adopt both rather than mint new ones - see {@link CiUploadResume}. The
     * workspace follows from the tag, which is what puts a resumed attempt back into the
     * folder the first one staged into instead of packing a second copy of a 20 GB world
     * beside the first.
     */
    const tag = request.resume?.tag ?? releaseTagFor("world", source.label, at);
    const archiveName = request.resume?.archiveName ?? archiveNameFor("world", source.label, at);
    const workspace = backupWorkspace(request.storageDir, backupIdFor(owner, repo, tag));
    await mkdir(workspace.root, { recursive: true });

    /* -- pack, or re-use what an earlier attempt staged ---------------------- */

    const archivePath = stagedArchivePath(workspace, archiveName);
    const packed = await packOrReuse(archivePath, source, request, say);

    /* -- split, and stage every piece under the name it will be uploaded as --- */

    signal?.throwIfAborted();
    const split = await splitFile(archivePath, {
        partSize: request.partSize,
        outDir: workspace.partsDir,
        ...(signal === undefined ? {} : { signal }),
        onProgress: (progress) => {
            say({
                type: "progress",
                description: `Cutting the archive into ${String(progress.partsTotal)} parts`,
                bytesDone: progress.bytesDone,
                bytesTotal: progress.bytesTotal,
                assetsDone: progress.partsDone,
                assetsTotal: progress.partsTotal,
                asset: null,
            });
        },
    });

    const uploads: { name: string; path: string; bytes: number }[] = [];
    let pointerParts: CheapLfsPointerPart[] | undefined;

    if (split.split) {
        const manifest: PartsManifest = split.manifest;
        pointerParts = [];
        for (const [index, part] of manifest.parts.entries()) {
            const assetName = partAssetName(archiveName, part.index, part.sha256);
            // Renamed rather than copied: same directory, same filesystem, so it costs
            // nothing, and it means neither transport has to care what the splitter called
            // its output. A part uploaded under any other name is one the pointer below
            // does not mention and a restore cannot find.
            const staged = join(workspace.partsDir, assetName);
            const written = split.partPaths[index] as string;
            if (basename(written) !== assetName) await rename(written, staged).catch(() => undefined);
            uploads.push({ name: assetName, path: staged, bytes: part.bytes });
            pointerParts.push({ name: assetName, sizeInBytes: part.bytes, sha256: part.sha256 });
        }
    } else {
        // Small enough to be one asset, which the pointer format calls out by name: five
        // lines and no part lines. The archive is already staged under its own name.
        uploads.push({ name: archiveName, path: archivePath, bytes: packed.bytes });
    }

    /* -- the pointer and the sidecar, written before anything is published ---- */

    const pointerText = serializeCheapLfsPointer({
        version: CHEAP_LFS_POINTER_VERSION,
        releaseTag: tag,
        assetName: archiveName,
        sizeInBytes: packed.bytes,
        sha256: packed.sha256,
        ...(pointerParts === undefined ? {} : { parts: pointerParts }),
    });
    const pointerName = `${archiveName}${POINTER_ASSET_SUFFIX}`;
    const pointerPath = stagedPointerPath(workspace, pointerName);
    await writeFile(pointerPath, pointerText, "utf8");

    const sidecar: BackupSidecar = {
        sidecarVersion: 1,
        kind: "world",
        label: source.label,
        archive: archiveName,
        pointer: pointerName,
        bytes: packed.bytes,
        sha256: packed.sha256,
        parts: uploads.length,
        files: source.files,
        contentBytes: source.bytes,
        createdAt: at.toISOString(),
        appVersion: request.appVersion ?? null,
        sourceFolder: source.folder,
        skipped: source.skipped,
    };
    await writeFile(workspace.sidecarFile, serializeSidecar(sidecar), "utf8");

    /* -- publish ------------------------------------------------------------- */

    signal?.throwIfAborted();
    const release = await releaseFor(transport, owner, repo, tag, source, request.resume !== undefined);
    say({ type: "release", tag: release.tag, archiveName, url: release.htmlUrl });

    /* -- upload -------------------------------------------------------------- */

    const existing = await transport.listReleaseAssets(owner, repo, tag);
    const bytesTotal = uploads.reduce((total, upload) => total + upload.bytes, 0);
    let bytesDone = 0;

    for (const [index, upload] of uploads.entries()) {
        signal?.throwIfAborted();
        const already = existing.get(upload.name);
        /*
         * Skipped only when the name and the size both match.
         *
         * GitHub publishes no checksum of its own for a release asset, so the alternative
         * to name-and-size is downloading every part back to hash it - which on a resumed
         * 20 GB upload costs more than uploading it again. The name is what makes this a
         * digest check rather than a guess, because a part's name is derived from its own
         * SHA-256. A size that does not match is a truncated upload and goes again.
         */
        if (already !== undefined && already.size === upload.bytes) {
            bytesDone += upload.bytes;
            say({
                type: "log",
                message: `${upload.name} is already on the release at the right size; skipped.`,
            });
            say({
                type: "progress",
                description: `Part ${String(index + 1)} of ${String(uploads.length)} was already there`,
                bytesDone,
                bytesTotal,
                assetsDone: index + 1,
                assetsTotal: uploads.length,
                asset: upload.name,
            });
            continue;
        }

        if (already !== undefined) {
            say({
                type: "log",
                message:
                    `${upload.name} is on the release at ${String(already.size)} bytes rather than ` +
                    `${String(upload.bytes)}, so an earlier attempt did not finish sending it. It is ` +
                    "being sent again rather than trusted.",
            });
        }

        const before = bytesDone;
        await transport.uploadReleaseAsset({
            release,
            owner,
            repo,
            assetName: upload.name,
            filePath: upload.path,
            bytes: upload.bytes,
            onProgress: (progress) => {
                bytesDone = before + progress.bytesSent;
                say({
                    type: "progress",
                    description: `Uploading part ${String(index + 1)} of ${String(uploads.length)}`,
                    bytesDone,
                    bytesTotal,
                    assetsDone: index,
                    assetsTotal: uploads.length,
                    asset: upload.name,
                });
            },
        });
        bytesDone = before + upload.bytes;
    }

    /*
     * The sidecar, then the pointer. The pointer is what makes the release a finished
     * upload, so it is the last thing that happens and only once every part is up.
     *
     * Both are checked by name **and size**, exactly as a part is. They are a couple of
     * kilobytes each, so re-sending one costs nothing - and a pointer left truncated by a
     * dropped connection is the single asset whose corruption makes a whole backup
     * unreadable, which is not a thing to skip because a name matched.
     */
    const putSmall = async (assetName: string, filePath: string): Promise<void> => {
        signal?.throwIfAborted();
        const bytes = (await stat(filePath)).size;
        const already = existing.get(assetName);
        if (already !== undefined && already.size === bytes) return;
        if (already !== undefined) {
            say({
                type: "log",
                message:
                    `${assetName} is on the release at ${String(already.size)} bytes rather than ` +
                    `${String(bytes)}, so an earlier attempt did not finish sending it. It is being ` +
                    "sent again rather than trusted.",
            });
        }
        await transport.uploadReleaseAsset({ release, owner, repo, assetName, filePath, bytes });
    };
    await putSmall(SIDECAR_ASSET_NAME, workspace.sidecarFile);
    await putSmall(pointerName, pointerPath);

    // The archive is a second copy of a folder that is still on the disk beside it, so
    // keeping it doubles what this cost in space at exactly the moment somebody was short
    // of it. The pointer and the sidecar stay: a couple of kilobytes, and how a person
    // finds their upload again without asking GitHub.
    await pruneStagedPayload(workspace, archiveName);

    return {
        tag: release.tag,
        releaseUrl: release.htmlUrl,
        archive: archiveName,
        bytes: packed.bytes,
        sha256: packed.sha256,
        parts: uploads.length,
        label: source.label,
    };
}

/**
 * Packs the world, or re-uses an archive an earlier attempt already staged.
 *
 * The re-use is checked by **hashing the staged file**, not by trusting that it is there.
 * A half-written archive from a process that was killed rather than cancelled has exactly
 * the name a finished one would have, and uploading it would publish a world that unpacks
 * to nothing. Hashing costs one read; packing again costs a read of the whole world and a
 * write of the whole archive, so the check pays for itself the first time it succeeds.
 */
async function packOrReuse(
    archivePath: string,
    source: BackupSource,
    request: CiUploadRequest,
    say: (event: CiUploadEvent) => void,
): Promise<{ bytes: number; sha256: string }> {
    const staged = await stat(archivePath).catch(() => null);
    if (staged !== null && staged.isFile() && staged.size > 0) {
        say({
            type: "log",
            message: "An archive from an earlier attempt is here; checking it rather than packing again.",
        });
        return { bytes: staged.size, sha256: await sha256File(archivePath, request.signal) };
    }

    const packed = await packFolder(source.folder, archivePath, {
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        onProgress: (progress) => {
            say({
                type: "progress",
                description:
                    progress.current === null ? "Packing the world" : `Packing ${basename(progress.current)}`,
                bytesDone: progress.bytesDone,
                bytesTotal: progress.bytesTotal,
                assetsDone: progress.filesDone,
                assetsTotal: progress.filesTotal,
                asset: null,
            });
        },
    });
    return { bytes: packed.bytes, sha256: packed.sha256 };
}

/**
 * The release to upload to: the one being resumed, or a brand new one.
 *
 * A resume against a tag with no release is a refusal rather than a quiet creation. The
 * caller asked to carry on with a specific upload; making a different one under that name
 * would look like it worked and leave the original half-finished release exactly where it
 * was, with nothing pointing at it.
 */
async function releaseFor(
    transport: CiTransport,
    owner: string,
    repo: string,
    tag: string,
    source: BackupSource,
    resuming: boolean,
): Promise<CiRelease> {
    if (resuming) {
        const existing = await transport.findRelease(owner, repo, tag);
        if (existing === null) {
            throw new UploadRefusal(
                "no-release-to-resume",
                `There is no release tagged ${tag} on ${owner}/${repo} to carry on with. Nothing was ` +
                    "created or changed. Upload the world again to get a fresh release.",
            );
        }
        return existing;
    }
    return await transport.createRelease(
        owner,
        repo,
        tag,
        `Backup: ${source.label}`,
        releaseNotes(source),
    );
}

/** The release notes. Plain, and honest about what the release is for. */
function releaseNotes(source: BackupSource): string {
    return [
        `A Worldlens copy of the Minecraft world \`${source.label}\`, published so that`,
        "GitHub's runners can render it.",
        "",
        "The bytes are the release assets on this release. `backup.json` says what was uploaded",
        "and when; the `.cheaplfs` file is a Cheap LFS v1 pointer naming every part and its",
        "SHA-256, so a restore can verify what it fetched.",
        "",
        "This release is storage, not a product release. It is marked as a prerelease so it",
        "never becomes the repository's latest release.",
    ].join("\n");
}

/** A refusal this module raises itself, with a code the sync can report unchanged. */
class UploadRefusal extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "UploadRefusal";
        this.code = code;
    }
}

/**
 * Every thrown thing turned into one sentence, whichever route threw it.
 *
 * Both routes raise a typed error with a GitHub status on it - `GitHubCallError` from the
 * REST calls, `ActionsCallError` from `gh` - so the codes a caller branches on are the same
 * either way. Without that, a `gh` refusal would arrive as a generic failure and every
 * piece of advice about a missing permission would have to be written twice.
 */
function failureFrom(error: unknown): CiUploadFailure {
    if (error instanceof UploadRefusal) {
        return { code: error.code, message: error.message, detail: null, status: null, needsSignIn: false };
    }
    if (error instanceof GitHubCallError || error instanceof ActionsCallError) {
        const status = error.status;
        return {
            code: status === 401 ? "signed-out" : `github-${String(status)}`,
            message: error.message,
            detail: error.url === "" ? null : error.url,
            status,
            needsSignIn: status === 401 || status === 403,
        };
    }
    return {
        code: "upload-failed",
        message: error instanceof Error ? error.message : String(error),
        detail: null,
        status: null,
        needsSignIn: false,
    };
}
