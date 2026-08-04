/**
 * Finding a Chunker CLI to run, and fetching one only when it can be checked.
 *
 * Chunker is Hive Games' open-source converter between Minecraft's two editions
 * (https://github.com/HiveGamesOSS/Chunker, MIT). Every release publishes a standalone
 * `chunker-cli-<version>.jar` - around 30 MB, no installer, no native parts - which is
 * exactly the shape this app can use, because it already knows how to run a jar on a
 * verified JVM.
 *
 * ## What "verify what it downloads" can honestly mean here
 *
 * This was researched rather than assumed, and the answer is narrower than one would
 * like. As of Chunker 1.19.1:
 *
 * - There is **no** `SHA256SUMS` file, and **no** detached signature (`.asc`, `.sig`,
 *   `.intoto.jsonl`) among the release assets.
 * - There is **no** GitHub artifact attestation for the CLI jar.
 * - Hive Games *does* Authenticode-sign their Windows artifacts with Azure Trusted
 *   Signing, but that covers the Electron desktop application's `.exe` files. The CLI jar
 *   is not an `.exe` and carries no such signature.
 * - What does exist is GitHub's own per-asset `digest` field on the releases API, a
 *   `sha256:` hash GitHub computes over the asset it is storing.
 *
 * So the strongest available check is a SHA-256, and it is **GitHub's statement about the
 * bytes it holds, not Hive Games' signature over the bytes they built**. That distinction
 * is real and is not smoothed over: it means the digest and the download share a single
 * root of trust, and a fetch of both in one session proves the file arrived intact, not
 * that it is the artefact its publisher intended.
 *
 * Two things follow, and both are deliberate:
 *
 * 1. **A digest is pinned in this source file** ({@link PINNED_CHUNKER}), reviewed and
 *    committed like any other code. When the pinned release is the one being fetched,
 *    the check is against a constant that a compromised API cannot move.
 * 2. **Resolving a newer release from the API is allowed but downgraded.** The result
 *    carries {@link ChunkerRelease.digestTrust} saying which of the two happened, and the
 *    interface is expected to say so rather than showing an identical green tick for a
 *    materially weaker guarantee.
 *
 * Nothing here ever installs an unverified file: {@link downloadVerified} renames a
 * `.part` file into place only after the hash matches, so a file at the final path is
 * always one that passed.
 *
 * ## Licence, and why nothing is bundled
 *
 * Chunker is MIT (Copyright (c) 2024 Hive Games), which *does* permit redistribution and
 * would permit bundling the jar in this app's installer, provided the copyright notice and
 * the licence text ship with it. This app nevertheless does not bundle it - see
 * `docs/bedrock-worlds.md` - because 30 MB in every installer for a feature most people
 * never use is a poor trade, and because a bundled copy pins a converter version to an app
 * release. That is a product decision, not a licence restriction, and the documentation
 * says so plainly rather than implying the licence forbids something it permits.
 */

import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { downloadVerified, type FetchBinary } from "../java/download.js";

/** Chunker needs Java 17 or newer; its README states this for CLI use. */
export const REQUIRED_CHUNKER_JAVA_FEATURE = 17;

/** Where the app keeps a Chunker it fetched for itself, under Electron's `userData`. */
export const CHUNKER_DIRECTORY = "chunker";

/**
 * The release this app was built and tested against, with its digest committed.
 *
 * Updating this is a reviewed source change, which is the entire point: a constant in the
 * repository cannot be altered by whatever answers the network.
 */
export const PINNED_CHUNKER = {
    version: "1.19.1",
    asset: "chunker-cli-1.19.1.jar",
    /** SHA-256 as published by GitHub's releases API for this asset. */
    sha256: "327662e8632acdb4571f60939206d605418ac0633741e1e5a58f5d6c6866dc74",
    sizeBytes: 31_790_149,
    url: "https://github.com/HiveGamesOSS/Chunker/releases/download/1.19.1/chunker-cli-1.19.1.jar",
} as const;

/**
 * How much a release's digest is worth.
 *
 * - `pinned` - matched the constant committed above.
 * - `api` - taken from the GitHub releases API in this same session. Proves the transfer
 *   was intact; does not independently prove provenance.
 */
export type DigestTrust = "pinned" | "api";

export interface ChunkerRelease {
    readonly version: string;
    readonly asset: string;
    readonly url: string;
    readonly sha256: string;
    readonly sizeBytes: number | null;
    readonly digestTrust: DigestTrust;
    /** One sentence for the confirm step, saying exactly what was and was not verified. */
    readonly verificationNote: string;
}

/** Where a usable Chunker came from. */
export type ChunkerSource = "configured" | "environment" | "downloaded";

export interface ChunkerLocation {
    readonly source: ChunkerSource;
    /** Absolute path to the jar. */
    readonly jarPath: string;
    /**
     * The version, when it could be established. Null is honest and common: a jar somebody
     * placed by hand may be named anything, and this never launches a JVM merely to look.
     */
    readonly version: string | null;
}

/**
 * A refusal, as a value.
 *
 * No function in this module rejects when Chunker is simply absent. "Not installed" is the
 * ordinary state of a machine that has never converted a world, and turning the ordinary
 * state into a thrown exception makes every caller write a catch block to render a
 * perfectly normal screen.
 */
export interface ChunkerMissing {
    readonly found: false;
    readonly reason: string;
    /** What the caller could offer to do about it. */
    readonly remedy: "download" | "configure";
    /** Every place that was looked, so the message can name them rather than gesture. */
    readonly searched: readonly string[];
}

export type ChunkerLookup = ({ readonly found: true } & ChunkerLocation) | ChunkerMissing;

/** Injected so no test ever touches a real file system to prove this file works. */
export type FileProbe = (path: string) => Promise<boolean>;

const defaultProbe: FileProbe = async (path) => {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
};

export interface FindChunkerOptions {
    /** Electron's `userData`, where a downloaded copy lives. Null means none is kept. */
    readonly dataDir?: string | null;
    /** A path the person chose in settings. Wins over everything else. */
    readonly configuredJar?: string | null;
    readonly env?: NodeJS.ProcessEnv;
    readonly probe?: FileProbe;
}

/** The environment variable an advanced user or a CI job can point at a jar. */
export const CHUNKER_JAR_ENV = "CHUNKER_CLI_JAR";

/** Where a downloaded Chunker jar lives for a given data directory. */
export function chunkerJarPath(dataDir: string, asset: string = PINNED_CHUNKER.asset): string {
    return join(dataDir, CHUNKER_DIRECTORY, asset);
}

/**
 * `chunker-cli-1.19.1.jar` -> `1.19.1`, and null for a name that says nothing.
 *
 * Read from the filename rather than by launching the jar. Establishing the version by
 * running it costs a JVM start-up on every screen that wants to show the row, and the
 * filename is right in every case where the app itself put the file there.
 */
export function versionFromJarName(path: string): string | null {
    const match = /chunker-cli-(\d+(?:\.\d+)*)\.jar$/i.exec(basename(path));
    return match?.[1] ?? null;
}

/**
 * Finds a Chunker CLI jar, or says why there is none.
 *
 * Order is deliberate: a path the person configured beats one the app downloaded, because
 * somebody who set it did so to override exactly this. A configured path that does not
 * exist is **not** silently skipped in favour of a downloaded copy - it is reported, since
 * quietly running a different converter than the one that was named is how somebody spends
 * an afternoon wondering why their settings do nothing.
 */
export async function findChunker(options: FindChunkerOptions = {}): Promise<ChunkerLookup> {
    const probe = options.probe ?? defaultProbe;
    const env = options.env ?? process.env;
    const searched: string[] = [];

    const configured = options.configuredJar?.trim();
    if (configured !== undefined && configured !== "") {
        searched.push(configured);
        if (await probe(configured)) return found("configured", configured);
        return {
            found: false,
            reason:
                `Chunker was set to ${configured} in settings, but there is no file there. ` +
                `Point it at a chunker-cli jar, or clear the setting to let the app fetch one.`,
            remedy: "configure",
            searched,
        };
    }

    const fromEnv = env[CHUNKER_JAR_ENV]?.trim();
    if (fromEnv !== undefined && fromEnv !== "") {
        searched.push(fromEnv);
        if (await probe(fromEnv)) return found("environment", fromEnv);
        return {
            found: false,
            reason:
                `${CHUNKER_JAR_ENV} is set to ${fromEnv}, but there is no file there. ` +
                `Correct it or unset it.`,
            remedy: "configure",
            searched,
        };
    }

    if (options.dataDir != null && options.dataDir.trim() !== "") {
        const downloaded = chunkerJarPath(options.dataDir);
        searched.push(downloaded);
        if (await probe(downloaded)) return found("downloaded", downloaded);
    }

    return {
        found: false,
        reason:
            "Chunker is not installed. It is a separate open-source converter from Hive " +
            "Games (MIT licensed) and this app does not bundle it, so converting a Bedrock " +
            `world means fetching the ${PINNED_CHUNKER.sizeBytes >= 1e6 ? `${String(Math.round(PINNED_CHUNKER.sizeBytes / 1e6))} MB` : "small"} ` +
            `chunker-cli jar once, or pointing the app at a copy you already have.`,
        remedy: "download",
        searched,
    };
}

function found(source: ChunkerSource, jarPath: string): { readonly found: true } & ChunkerLocation {
    return { found: true, source, jarPath, version: versionFromJarName(jarPath) };
}

/** The release the app will fetch if asked, with its verification story attached. */
export function pinnedRelease(): ChunkerRelease {
    return {
        version: PINNED_CHUNKER.version,
        asset: PINNED_CHUNKER.asset,
        url: PINNED_CHUNKER.url,
        sha256: PINNED_CHUNKER.sha256,
        sizeBytes: PINNED_CHUNKER.sizeBytes,
        digestTrust: "pinned",
        verificationNote:
            `The download is checked against a SHA-256 committed in this app's own source ` +
            `(${PINNED_CHUNKER.sha256.slice(0, 12)}…). Hive Games do not publish a signature ` +
            `or a checksum file for the Chunker CLI jar, so this is a hash of a known-good ` +
            `release rather than a signature from its publisher.`,
    };
}

export interface FetchChunkerOptions {
    /** Electron's `userData`. The jar lands under `<dataDir>/chunker/`. */
    readonly dataDir: string;
    /** Defaults to {@link pinnedRelease}. */
    readonly release?: ChunkerRelease;
    readonly fetchBinary?: FetchBinary;
    readonly onProgress?: (received: number, total: number | null) => void;
    readonly signal?: AbortSignal;
}

export interface FetchChunkerResult {
    readonly jarPath: string;
    readonly release: ChunkerRelease;
    /** True when a verified copy was already on disk and nothing was transferred. */
    readonly reused: boolean;
}

/**
 * Fetches the Chunker CLI jar and refuses to produce it unless the SHA-256 matches.
 *
 * The hashing, resuming and atomic rename are `java/download.ts`'s, unchanged - the same
 * code that fetches the JDK. Reusing it rather than writing a second downloader means
 * there is one implementation of "do not let an unverified file appear at the final path",
 * which is the property that matters and the one worth having exactly one of.
 */
export async function fetchChunker(options: FetchChunkerOptions): Promise<FetchChunkerResult> {
    const release = options.release ?? pinnedRelease();
    const target = chunkerJarPath(options.dataDir, release.asset);

    const result = await downloadVerified({
        url: release.url,
        sha256: release.sha256,
        target,
        ...(release.sizeBytes === null ? {} : { expectedSize: release.sizeBytes }),
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        ...(options.onProgress === undefined
            ? {}
            : { onProgress: (p) => options.onProgress?.(p.received, p.total) }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    return { jarPath: result.path, release, reused: result.reused };
}
