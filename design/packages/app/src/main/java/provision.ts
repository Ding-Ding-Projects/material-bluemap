/**
 * Getting a JDK onto a machine that does not have one, without asking anybody to.
 *
 * Decision D17 made a JVM a requirement for local rendering, and the honest cost of
 * that is stated in the decision itself. What is not acceptable is passing the cost
 * on as a chore: "install a JDK, set JAVA_HOME, restart the app" is a wall that ends
 * the session for most people. So the app fetches one for itself.
 *
 * The rules it fetches under:
 *
 * - **Nothing machine-wide.** The JDK goes under Electron's `userData`, no registry
 *   key is written, no `PATH` is edited, no installer runs and no elevation is asked
 *   for. Uninstalling the app takes the JDK with it.
 * - **Verified before use.** The SHA-256 comes from the Adoptium API response that
 *   carried the download link, and it is checked against the finished file before a
 *   single byte is extracted. There is no path through this module that installs an
 *   artefact whose digest was missing, unparseable or wrong.
 * - **Resumable, and never half-installed.** The download resumes from a `.part`
 *   file; the extraction lands in a staging directory and is renamed into place only
 *   after a real `bin/java` has been found in it.
 * - **Only when asked.** Nothing here runs as a side effect of looking for Java.
 *   Downloading 200 MB is a decision, and it belongs to the person using the app.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FetchText, TemurinRelease } from "./adoptium.js";
import { resolveTemurinRelease } from "./adoptium.js";
import type { DownloadProgress, FetchBinary } from "./download.js";
import { downloadVerified } from "./download.js";
import type { InstallArchiveOptions } from "./extract.js";
import { installArchive } from "./extract.js";
import type { JavaInstallRecord } from "./installation.js";
import { INSTALL_RECORD_VERSION, javaExecutableIn, javaHomePath, javaRoot, writeInstallRecord } from "./installation.js";
import { REQUIRED_JAVA_FEATURE } from "./version.js";

export type ProvisionStage =
    | "resolving"
    | "downloading"
    | "verifying"
    | "extracting"
    | "installing"
    | "done";

export interface ProvisionEvent {
    readonly stage: ProvisionStage;
    /** A sentence suitable for a progress notification, already user-readable. */
    readonly message: string;
    /** Bytes so far during `downloading`, otherwise null. */
    readonly received: number | null;
    /** Expected bytes during `downloading`, when the server said, otherwise null. */
    readonly total: number | null;
}

export interface ProvisionJavaOptions {
    /** Electron's `userData`. Everything provisioned lives beneath it. */
    readonly dataDir: string;
    readonly feature?: number;
    readonly platform?: NodeJS.Platform;
    readonly architecture?: string;
    readonly fetchText?: FetchText;
    readonly fetchBinary?: FetchBinary;
    readonly onEvent?: (event: ProvisionEvent) => void;
    readonly signal?: AbortSignal;
    /** Passed through to extraction; injected in tests so no `tar` is launched. */
    readonly extract?: InstallArchiveOptions;
    /**
     * Keep the verified archive after installing.
     *
     * Off by default: it is another 200 MB sitting in the user's profile for the rest
     * of the application's life, to save a download that happens approximately once.
     */
    readonly keepArchive?: boolean;
}

/** `<userData>/java/downloads` - the archive's staging area, not the install. */
export function downloadDirectory(dataDir: string): string {
    return join(javaRoot(dataDir), "downloads");
}

function formatSize(bytes: number): string {
    if (bytes <= 0) return "unknown size";
    const mib = bytes / (1024 * 1024);
    return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${mib.toFixed(0)} MiB`;
}

/**
 * Downloads, verifies and installs a Temurin JDK, and records what was installed.
 *
 * Returns the record rather than just a path so the caller can report the exact
 * build, and so the setting that shows "Java 25.0.4+7, provisioned by the app on
 * 2026-08-03" has something true to read from.
 */
export async function provisionJava(options: ProvisionJavaOptions): Promise<JavaInstallRecord> {
    const feature = options.feature ?? REQUIRED_JAVA_FEATURE;
    const platform = options.platform ?? process.platform;
    const emit = options.onEvent;

    // Spread rather than assignment: `exactOptionalPropertyTypes` distinguishes an
    // absent property from one explicitly set to `undefined`, so an optional value
    // has to be left out entirely rather than passed through as `undefined`.
    const resolveOptions = {
        feature,
        platform,
        ...(options.architecture === undefined ? {} : { architecture: options.architecture }),
        ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
    };

    emit?.({
        stage: "resolving",
        message: `Looking up the latest Eclipse Temurin ${String(feature)} build`,
        received: null,
        total: null,
    });
    const release: TemurinRelease = await resolveTemurinRelease(resolveOptions);
    options.signal?.throwIfAborted();

    const downloads = downloadDirectory(options.dataDir);
    await mkdir(downloads, { recursive: true });
    const archivePath = join(downloads, release.fileName);

    emit?.({
        stage: "downloading",
        message: `Downloading ${release.releaseName} (${formatSize(release.size)})`,
        received: 0,
        total: release.size > 0 ? release.size : null,
    });

    const downloadOptions = {
        url: release.url,
        sha256: release.sha256,
        target: archivePath,
        expectedSize: release.size,
        onProgress: (progress: DownloadProgress) => {
            emit?.({
                stage: "downloading" as const,
                message: `Downloading ${release.releaseName}`,
                received: progress.received,
                total: progress.total,
            });
        },
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };

    // Throws on a digest mismatch, having already deleted the bad bytes. Nothing
    // below this line can run against an unverified archive.
    await downloadVerified(downloadOptions);
    options.signal?.throwIfAborted();

    emit?.({
        stage: "verifying",
        message: `Verified SHA-256 ${release.sha256}`,
        received: null,
        total: null,
    });

    emit?.({
        stage: "extracting",
        message: `Extracting ${release.releaseName}`,
        received: null,
        total: null,
    });
    const home = javaHomePath(options.dataDir, feature);
    const extractOptions: InstallArchiveOptions = { platform, ...(options.extract ?? {}) };
    const installed = await installArchive(archivePath, home, extractOptions);

    emit?.({
        stage: "installing",
        message: `Installing into ${installed.home}`,
        received: null,
        total: null,
    });

    if (options.keepArchive !== true) {
        await rm(archivePath, { force: true });
    }

    const record = writeInstallRecord(options.dataDir, {
        recordVersion: INSTALL_RECORD_VERSION,
        feature,
        version: release.version,
        releaseName: release.releaseName,
        vendor: "eclipse-temurin",
        os: release.os,
        architecture: release.architecture,
        home: installed.home,
        executable: javaExecutableIn(installed.home, platform),
        archiveUrl: release.url,
        archiveSha256: release.sha256,
        installedAt: new Date().toISOString(),
    });

    emit?.({
        stage: "done",
        message: `Java ${release.version} is ready`,
        received: null,
        total: null,
    });
    return record;
}
