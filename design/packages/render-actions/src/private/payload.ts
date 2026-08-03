/**
 * Moving a world, and a rendered map, between a private repository and a public runner.
 *
 * The transport is release assets on the **private** repository, encrypted before they
 * leave it. Not Actions artifacts, which is the constraint that shapes everything here
 * and is worth stating plainly: an artifact belongs to the workflow run that produced
 * it, and on a public repository that run's artifacts are downloadable by anyone. The
 * public path in `../merge/` passes shard output between jobs exactly that way, because
 * for a public world there is nothing to protect. Here there is, so the same data takes
 * a different road: sealed, uploaded to a release in the private repository, and fetched
 * back by the job that needs it with a token that only that repository accepts.
 *
 * A payload is cut into parts of {@link PRIVATE_PART_BYTES}, each sealed on its own with
 * its own IV and tag, plus a manifest that is sealed too. Splitting is not only about
 * size limits:
 *
 * - each part authenticates independently, so a corrupted or substituted part is caught
 *   as itself rather than as a failure of the whole payload;
 * - a part can be retried on its own when an upload drops halfway;
 * - nothing has to hold a multi-gigabyte world in memory at once.
 *
 * The manifest is what makes the *set* trustworthy. Per-part authentication proves each
 * part is genuine; it cannot prove that all of them are here, in order, and belong to the
 * same payload. The manifest carries the count and a digest of every part and of the
 * whole, and is itself sealed, so a truncated, reordered or mixed set is refused rather
 * than reassembled into something plausible.
 */

import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrivateCryptoError, seal, unseal } from "./crypto.js";
import { manifestAssetName, partAssetName } from "./ids.js";

/**
 * How large one encrypted part is, before encryption overhead.
 *
 * Fifty megabytes. Deliberately small: these parts are uploaded and downloaded one at a
 * time over a public runner's network, a failed upload costs a whole part, and a part
 * that has to be held in memory to be authenticated before any of it is written is a
 * part whose size is a memory cost on every job.
 *
 * **This is not the release-asset split limit.** Publishing a large *public* artifact is
 * a different problem with a different number - GitHub's own per-asset ceiling, in the
 * gigabytes - and the two must not be conflated: raising this one to match that one
 * would put gigabyte-sized buffers in every job here for no benefit.
 */
export const PRIVATE_PART_BYTES = 50 * 1024 * 1024;

/** Bumped if the manifest's shape changes. An older reader refuses a newer manifest. */
const MANIFEST_VERSION = 1;

export interface PartRecord {
    readonly index: number;
    /** Plaintext bytes in this part, before sealing. */
    readonly bytes: number;
    /** SHA-256 of this part's plaintext, checked after it is decrypted. */
    readonly sha256: string;
}

export interface PayloadManifest {
    readonly version: number;
    readonly projectId: string;
    readonly partBytes: number;
    readonly partCount: number;
    readonly totalBytes: number;
    /** SHA-256 of the whole reassembled plaintext. */
    readonly sha256: string;
    readonly parts: readonly PartRecord[];
}

export type PayloadFailureCode =
    | "no-manifest"
    | "malformed-manifest"
    | "unsupported-version"
    | "missing-part"
    | "wrong-part-count"
    | "digest-mismatch"
    | "empty-payload";

/** Every way the transport can refuse. Thrown, because the answer to all of them is to stop. */
export class PrivatePayloadError extends Error {
    readonly code: PayloadFailureCode;

    constructor(code: PayloadFailureCode, message: string) {
        super(message);
        this.name = "PrivatePayloadError";
        this.code = code;
    }
}

/** The associated data binding one part to its position in one payload. */
export function partAad(projectId: string, index: number, bytes: number): string {
    return `material-bluemap/private-transport/1|${projectId}|part|${index}|${bytes}`;
}

/** The associated data binding a manifest to its payload. */
export function manifestAad(projectId: string): string {
    return `material-bluemap/private-transport/1|${projectId}|manifest`;
}

export interface SealOptions {
    readonly key: Buffer;
    /** The file to seal, usually a tar of a world or of a rendered map. */
    readonly inputPath: string;
    /** Where the sealed parts and the manifest are written. */
    readonly outputDirectory: string;
    /** The opaque name every produced file starts with. See `ids.ts`. */
    readonly projectId: string;
    readonly partBytes?: number | undefined;
}

export interface SealReport {
    readonly projectId: string;
    readonly partCount: number;
    readonly totalBytes: number;
    readonly sha256: string;
    /** File names, not paths: these become release asset names. */
    readonly files: readonly string[];
}

/**
 * Seals a file into parts plus a manifest.
 *
 * Reads and writes a part at a time, so the memory cost is one part regardless of how
 * large the world is. The manifest is written last, on purpose: a run that dies halfway
 * leaves parts with no manifest, and {@link openPayload} refuses a payload with no
 * manifest, so a half-finished upload cannot be mistaken for a complete one.
 */
export async function sealPayload(options: SealOptions): Promise<SealReport> {
    const partBytes = options.partBytes ?? PRIVATE_PART_BYTES;
    await mkdir(options.outputDirectory, { recursive: true });

    const handle = await open(options.inputPath, "r");
    const buffer = Buffer.allocUnsafe(partBytes);
    const whole = createHash("sha256");
    const parts: PartRecord[] = [];
    const files: string[] = [];
    let totalBytes = 0;

    try {
        for (;;) {
            const { bytesRead } = await handle.read(buffer, 0, partBytes, null);
            if (bytesRead === 0) break;

            const chunk = buffer.subarray(0, bytesRead);
            whole.update(chunk);

            const index = parts.length;
            const record: PartRecord = {
                index,
                bytes: bytesRead,
                sha256: createHash("sha256").update(chunk).digest("hex"),
            };
            const name = partAssetName(options.projectId, index);
            await writeFile(
                join(options.outputDirectory, name),
                seal(options.key, partAad(options.projectId, index, bytesRead), chunk),
            );

            parts.push(record);
            files.push(name);
            totalBytes += bytesRead;
        }
    } finally {
        await handle.close();
    }

    if (parts.length === 0) {
        // An empty payload is always a mistake upstream - an empty world, a tar that
        // failed silently - and sealing one would produce a run that renders nothing and
        // reports success.
        throw new PrivatePayloadError(
            "empty-payload",
            `Nothing to seal: ${options.inputPath} is empty. Refusing to produce an empty` +
                " payload, which would render nothing and look like it worked.",
        );
    }

    const manifest: PayloadManifest = {
        version: MANIFEST_VERSION,
        projectId: options.projectId,
        partBytes,
        partCount: parts.length,
        totalBytes,
        sha256: whole.digest("hex"),
        parts,
    };

    const manifestName = manifestAssetName(options.projectId);
    await writeFile(
        join(options.outputDirectory, manifestName),
        seal(
            options.key,
            manifestAad(options.projectId),
            Buffer.from(JSON.stringify(manifest), "utf8"),
        ),
    );
    files.push(manifestName);

    return {
        projectId: options.projectId,
        partCount: manifest.partCount,
        totalBytes: manifest.totalBytes,
        sha256: manifest.sha256,
        files,
    };
}

export interface OpenOptions {
    readonly key: Buffer;
    /** The directory the sealed files were downloaded into. */
    readonly inputDirectory: string;
    /** Where the reassembled plaintext is written. */
    readonly outputPath: string;
    readonly projectId: string;
}

export interface OpenReport {
    readonly projectId: string;
    readonly partCount: number;
    readonly totalBytes: number;
    readonly sha256: string;
}

/**
 * Reads the manifest, then every part, and writes the plaintext back out.
 *
 * Fails closed at every step, and cleans up after itself when it does. A partly written
 * output file is the dangerous artefact here: it looks like a world, a later step would
 * happily try to render it, and nothing downstream would know it was never finished. So
 * a failure deletes it.
 */
export async function openPayload(options: OpenOptions): Promise<OpenReport> {
    const manifest = await readManifest(options);

    // Written to a staging path and renamed at the end, so nothing else can see a
    // half-reassembled file and mistake it for a whole one.
    const staging = `${options.outputPath}.opening`;
    const whole = createHash("sha256");
    let totalBytes = 0;

    const handle = await open(staging, "w");
    try {
        for (const record of manifest.parts) {
            const name = partAssetName(options.projectId, record.index);
            let sealed: Buffer;
            try {
                sealed = await readFile(join(options.inputDirectory, name));
            } catch {
                throw new PrivatePayloadError(
                    "missing-part",
                    `Part ${record.index} of ${manifest.partCount} is missing (${name}).` +
                        " The payload is incomplete, so nothing was reassembled.",
                );
            }

            // Any tampering, substitution or reordering fails inside here, and `unseal`
            // throws rather than returning something to check.
            const plaintext = unseal(
                options.key,
                partAad(options.projectId, record.index, record.bytes),
                sealed,
            );

            const digest = createHash("sha256").update(plaintext).digest("hex");
            if (digest !== record.sha256) {
                // Reaching this means a part authenticated against the key but is not the
                // part the manifest describes: a genuine part of a *different* payload,
                // replayed. The manifest is what catches it.
                throw new PrivatePayloadError(
                    "digest-mismatch",
                    `Part ${record.index} decrypted but is not the part this payload's` +
                        " manifest describes. Nothing was reassembled.",
                );
            }

            await handle.write(plaintext);
            whole.update(plaintext);
            totalBytes += plaintext.length;
        }
    } catch (error) {
        await handle.close();
        await rm(staging, { force: true });
        throw error;
    }
    await handle.close();

    const sha256 = whole.digest("hex");
    if (sha256 !== manifest.sha256 || totalBytes !== manifest.totalBytes) {
        await rm(staging, { force: true });
        throw new PrivatePayloadError(
            "digest-mismatch",
            "The reassembled payload does not match the digest its manifest recorded." +
                " Nothing usable was produced.",
        );
    }

    const { rename } = await import("node:fs/promises");
    await rename(staging, options.outputPath);

    return {
        projectId: options.projectId,
        partCount: manifest.partCount,
        totalBytes,
        sha256,
    };
}

/** The manifest, authenticated and structurally checked before any part is touched. */
export async function readManifest(options: {
    key: Buffer;
    inputDirectory: string;
    projectId: string;
}): Promise<PayloadManifest> {
    const name = manifestAssetName(options.projectId);

    let sealed: Buffer;
    try {
        sealed = await readFile(join(options.inputDirectory, name));
    } catch {
        throw new PrivatePayloadError(
            "no-manifest",
            `No manifest was found (${name}). Either the payload was never finished, or the` +
                " download did not bring all of it. Nothing was decrypted.",
        );
    }

    const plaintext = unseal(options.key, manifestAad(options.projectId), sealed);

    let parsed: unknown;
    try {
        parsed = JSON.parse(plaintext.toString("utf8"));
    } catch {
        throw new PrivatePayloadError(
            "malformed-manifest",
            "The manifest decrypted but is not readable. Nothing was reassembled.",
        );
    }

    const manifest = parsed as PayloadManifest;
    if (typeof manifest !== "object" || manifest === null) {
        throw new PrivatePayloadError("malformed-manifest", "The manifest is not an object.");
    }
    if (manifest.version !== MANIFEST_VERSION) {
        throw new PrivatePayloadError(
            "unsupported-version",
            `The manifest is version ${String(manifest.version)}; this build understands` +
                ` ${MANIFEST_VERSION}.`,
        );
    }
    if (!Array.isArray(manifest.parts) || manifest.parts.length !== manifest.partCount) {
        throw new PrivatePayloadError(
            "wrong-part-count",
            `The manifest claims ${String(manifest.partCount)} parts but lists` +
                ` ${Array.isArray(manifest.parts) ? manifest.parts.length : 0}.`,
        );
    }
    if (manifest.projectId !== options.projectId) {
        // Belt and braces: the AAD already binds the manifest to this id, so this can
        // only fire if the two ever drift apart in code.
        throw new PrivatePayloadError(
            "malformed-manifest",
            "The manifest belongs to a different payload.",
        );
    }

    return manifest;
}

/** True when an error came from this transport, for a CLI that wants to print it plainly. */
export function isPrivateTransportError(
    error: unknown,
): error is PrivatePayloadError | PrivateCryptoError {
    return error instanceof PrivatePayloadError || error instanceof PrivateCryptoError;
}
