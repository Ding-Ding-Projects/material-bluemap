/**
 * The Java toolchain layer: everything the app needs to run upstream BlueMap's
 * engine on a machine that may or may not have a JDK.
 *
 * Nothing in this directory is Java source. It is the TypeScript that finds, checks,
 * fetches and launches a JVM, and that locates the jars decisions D17 and D18 put at
 * the centre of local rendering.
 *
 * Deliberately free of any `electron` value import so the whole layer is unit-testable
 * without an Electron runtime. The one thing it needs from Electron is the `userData`
 * directory, and that is a parameter. `ipc.ts` names `IpcMain` as a *type* and takes it
 * as a parameter too, so that import is erased at build time and the rule holds.
 *
 * ```ts
 * import { app } from "electron";
 * import { ensureJava, resolveCliJar } from "./java/index.js";
 *
 * const java = await ensureJava({ dataDir: app.getPath("userData") });
 * const cli = resolveCliJar({ resourcesPath: app.isPackaged ? process.resourcesPath : null });
 * // java.installation.executable  ->  the JVM to launch
 * // cli.path, cli.version         ->  the jar to hand it, and what it is
 * ```
 */

export {
    ADOPTIUM_API_BASE,
    assetsLatestUrl,
    resolveTemurinRelease,
    temurinTarget,
    type FetchText,
    type HttpTextResponse,
    type ResolveTemurinOptions,
    type TemurinRelease,
    type TemurinTarget,
} from "./adoptium.js";

export {
    describeDiscoveryFailure,
    discoverJava,
    javaFromHome,
    javaOnPath,
    type DiscoverJavaOptions,
    type JavaDiscovery,
    type JavaInstallation,
    type JavaRejection,
    type JavaSource,
} from "./discovery.js";

export {
    JAVA_CHANNELS,
    JAVA_PROVISION_EVENT_CHANNEL,
    MAX_REASON_LENGTH,
    PATH_PLACEHOLDER,
    registerJavaHandlers,
    summariseDiscovery,
    summariseReason,
    type JavaDownloadConsentSummary,
    type JavaEnsureCallOptions,
    type JavaEnsureCallResult,
    type JavaInstallationSummary,
    type JavaIpc,
    type JavaIpcOptions,
    type JavaProvisionOutcome,
    type JavaRejectionSummary,
    type JavaRuntimeSummary,
    type JavaVersionSummary,
} from "./ipc.js";

export {
    acceptJavaDownloadConsent,
    javaConsentFile,
    readJavaDownloadConsent,
    revokeJavaDownloadConsent,
    type JavaDownloadConsentRecord,
} from "./consent.js";

export {
    downloadVerified,
    sha256File,
    type DownloadOptions,
    type DownloadProgress,
    type DownloadResult,
    type FetchBinary,
    type FetchBinaryInit,
    type HttpBinaryResponse,
} from "./download.js";

export {
    STAGING_PREFIX,
    extractArchive,
    findJavaHome,
    installArchive,
    sweepStagingDirectories,
    tarExecutable,
    type CommandResult,
    type CommandRunner,
    type DirectoryReader,
    type ExtractOptions,
    type InstallArchiveOptions,
    type InstalledArchive,
} from "./extract.js";

export {
    INSTALL_RECORD_VERSION,
    clearInstallRecord,
    installRecordFile,
    javaExecutableIn,
    javaHomePath,
    javaRoot,
    provisionedJavaExecutable,
    readInstallRecord,
    writeInstallRecord,
    type JavaInstallRecord,
} from "./installation.js";

export {
    BLUEMAP_IMPLEMENTATIONS,
    bundledJarDirectory,
    findRepoRoot,
    gradleJarDirectory,
    isBlueMapImplementation,
    listBlueMapJars,
    parseJarVersion,
    resolveBlueMapJar,
    resolveCliJar,
    stagingJarDirectory,
    surveyBlueMapJars,
    type BlueMapImplementation,
    type BlueMapJar,
    type JarFs,
    type JarLookupOptions,
    type JarSource,
} from "./jars.js";

export {
    downloadDirectory,
    provisionJava,
    type ProvisionEvent,
    type ProvisionJavaOptions,
    type ProvisionStage,
} from "./provision.js";

export {
    execFileRunner,
    PROBE_TIMEOUT_MS,
    probeJava,
    type JavaProbeOutput,
    type JavaProbeReport,
    type JavaRunner,
} from "./probe.js";

export {
    REQUIRED_JAVA_FEATURE,
    javaFeatureVersion,
    parseJavaHome,
    parseJavaVersion,
    satisfiesRequirement,
    tooOldReason,
    type JavaVersionInfo,
} from "./version.js";

import type { FetchText } from "./adoptium.js";
import type { DiscoverJavaOptions, JavaDiscovery, JavaInstallation, JavaRejection } from "./discovery.js";
import { describeDiscoveryFailure, discoverJava } from "./discovery.js";
import type { FetchBinary } from "./download.js";
import type { InstallArchiveOptions } from "./extract.js";
import type { JavaInstallRecord } from "./installation.js";
import { clearInstallRecord } from "./installation.js";
import type { JavaRunner } from "./probe.js";
import { probeJava } from "./probe.js";
import type { ProvisionEvent } from "./provision.js";
import { provisionJava } from "./provision.js";
import { REQUIRED_JAVA_FEATURE, satisfiesRequirement, tooOldReason } from "./version.js";

export interface EnsureJavaOptions {
    /** Electron's `userData`. Where a provisioned JDK is looked for and installed. */
    readonly dataDir: string;
    /**
     * Whether the app may download a JDK when none is suitable.
     *
     * Off by default. Two hundred megabytes leaving the machine is a decision
     * somebody makes, not something that happens because a function was called; the
     * caller turns this on once the person has said yes.
     */
    readonly allowProvisioning?: boolean;
    readonly required?: number;
    readonly platform?: NodeJS.Platform;
    readonly architecture?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly runner?: JavaRunner;
    readonly exists?: (path: string) => boolean;
    readonly fetchText?: FetchText;
    readonly fetchBinary?: FetchBinary;
    readonly extract?: InstallArchiveOptions;
    readonly onEvent?: (event: ProvisionEvent) => void;
    readonly signal?: AbortSignal;
}

export interface EnsureJavaResult {
    readonly installation: JavaInstallation;
    /** True when this call downloaded and installed the JVM it is returning. */
    readonly provisioned: boolean;
    /** The record of the provisioned install, when there is one. */
    readonly record: JavaInstallRecord | null;
    /** Candidates that were looked at and turned down along the way. */
    readonly rejected: readonly JavaRejection[];
}

/** Raised when no JVM is usable and provisioning was not permitted or did not help. */
export class NoUsableJavaError extends Error {
    readonly discovery: JavaDiscovery;

    constructor(message: string, discovery: JavaDiscovery) {
        super(message);
        this.name = "NoUsableJavaError";
        this.discovery = discovery;
    }
}

/**
 * Produces a JVM the app can actually launch, or explains precisely why it cannot.
 *
 * Discovery first, provisioning only if it found nothing and was allowed to. The
 * freshly installed JDK is then **probed like any other candidate** rather than
 * trusted because this code just wrote it: an archive can unpack into something that
 * does not run, a disk can be full, an antivirus can quarantine a binary between the
 * rename and the launch. Running it is the only way to know, and it costs one
 * subprocess.
 */
export async function ensureJava(options: EnsureJavaOptions): Promise<EnsureJavaResult> {
    const required = options.required ?? REQUIRED_JAVA_FEATURE;

    // Spread rather than assignment throughout: `exactOptionalPropertyTypes` treats an
    // absent property and one set to `undefined` as different things, so an optional
    // value has to be omitted rather than forwarded as `undefined`.
    const discoverOptions: DiscoverJavaOptions = {
        dataDir: options.dataDir,
        required,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.platform === undefined ? {} : { platform: options.platform }),
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.exists === undefined ? {} : { exists: options.exists }),
    };

    const discovery = await discoverJava(discoverOptions);
    if (discovery.installation !== null) {
        return {
            installation: discovery.installation,
            provisioned: false,
            record: null,
            rejected: discovery.rejected,
        };
    }

    if (options.allowProvisioning !== true) {
        throw new NoUsableJavaError(describeDiscoveryFailure(discovery), discovery);
    }

    const record = await provisionJava({
        dataDir: options.dataDir,
        feature: required,
        ...(options.platform === undefined ? {} : { platform: options.platform }),
        ...(options.architecture === undefined ? {} : { architecture: options.architecture }),
        ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        ...(options.extract === undefined ? {} : { extract: options.extract }),
        ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const report = await probeJava(record.executable, options.runner);
    if (report.version === null || !satisfiesRequirement(report.version, required)) {
        const reason =
            report.version === null
                ? (report.failure ?? "could not be identified as a Java runtime")
                : tooOldReason(report.version, required);

        // The record is withdrawn, because a record is a claim that a working JVM is
        // installed and this one demonstrably is not. Leaving it would make every
        // later launch offer the same broken install as a candidate. The directory
        // itself is left alone: it is named in the error so it can be inspected, and
        // the next provisioning attempt replaces it in place rather than piling up
        // another copy beside it.
        clearInstallRecord(options.dataDir);

        const failed: JavaDiscovery = {
            installation: null,
            required,
            rejected: [
                ...discovery.rejected,
                { source: "provisioned", executable: record.executable, reason },
            ],
        };
        throw new NoUsableJavaError(
            `The Java ${String(required)} runtime downloaded from ${record.archiveUrl} and installed at ` +
                `${record.home} did not run: ${reason}`,
            failed,
        );
    }

    return {
        installation: {
            source: "provisioned",
            executable: record.executable,
            home: report.home ?? record.home,
            version: report.version,
        },
        provisioned: true,
        record,
        rejected: discovery.rejected,
    };
}
