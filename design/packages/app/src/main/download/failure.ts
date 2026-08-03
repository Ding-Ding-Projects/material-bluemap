/**
 * Why a download did not finish, in a form the interface can act on.
 *
 * The same contract `render/failure.ts` states, for the same reason: a download can fail
 * for reasons a person is expected to fix, and every one of them has a different remedy.
 * A single `Error` with a sentence in it forces the interface to match on prose, so the
 * code is the contract and the message is the explanation beside it.
 *
 * `SettingsTarget` is reused rather than restated. A download that cannot write is a
 * download whose storage folder is wrong, and that is the same setting and the same row
 * a render sends somebody to.
 */

import type { SettingsTarget } from "../render/failure.js";

export type DownloadFailureCode =
    /** The request itself is not actionable: no owner, no repo, a bad id. */
    | "invalid-request"
    /** A download under this id is already in flight. */
    | "already-running"
    /** The release does not exist, or this machine is not allowed to see it. */
    | "release-not-found"
    /** The release exists but carries nothing by that name. */
    | "asset-not-found"
    /** The network refused, timed out, or answered with something that is not the file. */
    | "network-failed"
    /** A `.parts.json` was downloaded but does not describe a joinable file. */
    | "manifest-invalid"
    /** A part, or the rejoined whole, does not hash to what the manifest said. */
    | "integrity-failed"
    /** The archive was verified but could not be unpacked. */
    | "extract-failed"
    /** The storage directory could not be created or written. */
    | "storage-unwritable"
    /** The person cancelled it. */
    | "cancelled";

export interface DownloadFailure {
    readonly code: DownloadFailureCode;
    /** One sentence naming what is wrong, in words a person can act on. */
    readonly message: string;
    /** Where to send somebody to fix it, or null when no setting would help. */
    readonly settings: SettingsTarget | null;
    /** Supporting evidence: the URL, the status, the digest that disagreed. */
    readonly detail: string | null;
    /** The HTTP status when the failure was an answer rather than a silence. */
    readonly status: number | null;
}

function failure(
    code: DownloadFailureCode,
    message: string,
    extra: {
        readonly settings?: SettingsTarget;
        readonly detail?: string;
        readonly status?: number;
    } = {},
): DownloadFailure {
    return {
        code,
        message,
        settings: extra.settings ?? null,
        detail: extra.detail ?? null,
        status: extra.status ?? null,
    };
}

export function invalidRequest(message: string): DownloadFailure {
    return failure("invalid-request", message);
}

export function alreadyRunning(downloadId: string): DownloadFailure {
    return failure("already-running", `A download of '${downloadId}' is already in progress.`);
}

export function releaseNotFound(reference: string, status: number, detail: string): DownloadFailure {
    return failure("release-not-found", `The release ${reference} could not be read.`, {
        status,
        detail,
    });
}

export function assetNotFound(name: string, available: readonly string[]): DownloadFailure {
    return failure("asset-not-found", `The release has no download called '${name}'.`, {
        detail: available.length === 0 ? "The release has no assets." : available.join(", "),
    });
}

export function networkFailed(url: string, detail: string, status?: number): DownloadFailure {
    return failure("network-failed", "The download could not be completed.", {
        detail: `${url}: ${detail}`,
        ...(status === undefined ? {} : { status }),
    });
}

export function manifestInvalid(detail: string): DownloadFailure {
    return failure("manifest-invalid", "The split-archive manifest could not be read.", { detail });
}

export function integrityFailed(detail: string): DownloadFailure {
    return failure(
        "integrity-failed",
        "The downloaded files do not match their published checksums, so nothing was kept.",
        { detail },
    );
}

export function extractFailed(detail: string): DownloadFailure {
    return failure("extract-failed", "The archive downloaded correctly but could not be unpacked.", {
        detail,
    });
}

export function storageUnwritable(directory: string, detail: string): DownloadFailure {
    return failure("storage-unwritable", "The download folder could not be written.", {
        settings: { surface: "settings", anchor: "map-storage-directory", missing: false },
        detail: `${directory}: ${detail}`,
    });
}

export function cancelled(): DownloadFailure {
    return failure("cancelled", "The download was cancelled.");
}
