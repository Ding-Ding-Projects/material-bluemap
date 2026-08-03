/**
 * The Java-runtime channel between the main process and the settings screen.
 *
 * Built to the same shape as `world/index.ts`: Electron arrives as a *type*, `IpcMain`
 * is a parameter, and the import is erased at build time - so this module, and with it
 * the rest of this directory, still runs and is still tested without an Electron
 * runtime. Every channel is named once in {@link JAVA_CHANNELS} so `dispose` cannot
 * drift from the registration.
 *
 * `invoke`/`handle` rather than pushed, unlike rendering and downloading. Discovery is
 * a question with one answer that arrives in about as long as it takes to launch three
 * processes, so there is no progress to report and nothing to cancel.
 *
 * ## What is allowed to cross
 *
 * Discovery reads the machine and runs whatever it finds, so its result is the one
 * place in this layer where a subprocess's own output becomes text the app repeats.
 * Two rules apply on the way out, and {@link summariseDiscovery} is where they are
 * enforced rather than hoped for:
 *
 * 1. **A fresh plain object, field by field.** Nothing the discovery layer returns is
 *    forwarded by reference. What crosses is built here from primitives, so a field
 *    added upstream reaches the renderer only when somebody decides it should.
 * 2. **Exactly one path per candidate, and it is the JDK's.** `executable` and `home`
 *    are structured path fields the settings row exists to show. `reason` is free text
 *    that can contain a rejected binary's entire stderr - a shim script's error naming
 *    a file in the user's profile, a `Command failed:` dump, a stack trace - so every
 *    absolute path in it is replaced before it leaves. The rejected candidate's own
 *    path is still on screen, in `executable`, one field away.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { DiscoverJavaOptions, JavaDiscovery, JavaSource } from "./discovery.js";
import { discoverJava } from "./discovery.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const JAVA_CHANNELS = ["java:runtime"] as const;

/** Mirrors `JavaVersionInfo`, rebuilt rather than forwarded. */
export interface JavaVersionSummary {
    readonly feature: number;
    readonly version: string;
    readonly runtime: string | null;
}

/** Mirrors `JavaInstallation`. */
export interface JavaInstallationSummary {
    readonly source: JavaSource;
    readonly executable: string;
    readonly home: string | null;
    readonly version: JavaVersionSummary;
}

/** Mirrors `JavaRejection`, with `reason` put through {@link summariseReason}. */
export interface JavaRejectionSummary {
    readonly source: JavaSource;
    readonly executable: string;
    readonly reason: string;
}

/** What `java:runtime` answers with. Mirrors `JavaDiscovery`. */
export interface JavaRuntimeSummary {
    readonly installation: JavaInstallationSummary | null;
    readonly rejected: readonly JavaRejectionSummary[];
    readonly required: number;
}

/**
 * What an absolute path is replaced with. Fixed text, so it reads as deliberate rather
 * than as a JVM that printed something odd.
 */
export const PATH_PLACEHOLDER = "[a path]";

/**
 * How much of a rejection sentence is kept, measured in code points.
 *
 * Every sentence this layer writes itself is far shorter than this; the ones that are
 * not are a rejected binary's output, and a settings row is not a log viewer. The cap
 * is on the way out rather than on the way in because `probe.ts` bounds its buffer for
 * a different reason - not hanging on a megabyte of stack trace - and a bound that
 * exists for one reason should not be quietly relied on for another. Code points
 * rather than UTF-16 units because a cut that lands inside a surrogate pair ships a
 * lone half that renders as U+FFFD.
 */
export const MAX_REASON_LENGTH = 240;

/**
 * Absolute paths, in the three forms a rejection can carry: a Windows drive path, a
 * UNC share, and a POSIX path of at least two segments.
 *
 * Every alternative requires a believable path *start* - the beginning of the text, or
 * a preceding space, quote, bracket or equals - because without one the drive form
 * matches the "s://" inside "https://" and the POSIX form matches the "/lib/…" tail of
 * a relative "jre/lib/amd64" run, and mangling a URL or a sentence that named no
 * absolute path is a worse outcome than the one this guards against. The drive form
 * additionally allows "/" and ":" before it, so the local path inside a "file:///C:/…"
 * URL is still caught. The POSIX form deliberately requires a second segment: a single
 * `/…` run matches ordinary prose - `and/or`, `24/7`.
 */
const ABSOLUTE_PATH =
    /(?<=^|[\s"'`([=/:])[A-Za-z]:[\\/][^\s"'<>|;,]*|(?<=^|[\s"'`([=])\\\\[^\s"'<>|;,]+|(?<=^|[\s"'`([=])\/(?:[^\s/"'<>|;,]+\/)+[^\s/"'<>|;,]*/g;

/**
 * What the pass above leaves behind when a Windows path contains spaces:
 * `C:\Program Files\Eclipse Adoptium\jdk-17` matches only up to the first space, and
 * `Files\Eclipse` survives as its own token, which on a Windows machine is half of the
 * user's profile path often enough. Prose does not backslash, so every remaining token
 * carrying one is a path fragment and is replaced as well.
 */
const PATH_FRAGMENT = /[^\s"'<>|;,]*\\[^\s"'<>|;,]*/g;

const ESCAPED_PLACEHOLDER = PATH_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** A space-containing path becomes several placeholders; one says the same thing. */
const REPEATED_PLACEHOLDER = new RegExp(
    `${ESCAPED_PLACEHOLDER}(?: ${ESCAPED_PLACEHOLDER})+`,
    "g",
);

/**
 * One line, no paths, bounded length.
 *
 * `probeJava` builds its failure text from a launch error or from the first lines of
 * whatever the candidate printed, so this is arbitrary output from an arbitrary binary.
 * The words are still the main process's own where it wrote them - "Java 17 (17.0.9),
 * but Java 25 or newer is required" survives untouched - which is the point: the useful
 * rejections are the ones this layer phrases, and they carry no path that the
 * `executable` field beside them does not already carry.
 */
export function summariseReason(reason: string): string {
    const oneLine = reason
        .replace(/\s+/g, " ")
        .trim()
        .replace(ABSOLUTE_PATH, PATH_PLACEHOLDER)
        .replace(PATH_FRAGMENT, PATH_PLACEHOLDER)
        .replace(REPEATED_PLACEHOLDER, PATH_PLACEHOLDER);
    const points = [...oneLine];
    if (points.length <= MAX_REASON_LENGTH) return oneLine;
    return `${points.slice(0, MAX_REASON_LENGTH - 1).join("").trimEnd()}…`;
}

/** Builds the plain, serialisable answer. See the rules at the top of this file. */
export function summariseDiscovery(discovery: JavaDiscovery): JavaRuntimeSummary {
    const found = discovery.installation;
    return {
        installation:
            found === null
                ? null
                : {
                      source: found.source,
                      executable: found.executable,
                      home: found.home,
                      version: {
                          feature: found.version.feature,
                          version: found.version.version,
                          runtime: found.version.runtime,
                      },
                  },
        rejected: discovery.rejected.map((rejection) => ({
            source: rejection.source,
            executable: rejection.executable,
            reason: summariseReason(rejection.reason),
        })),
        required: discovery.required,
    };
}

export interface JavaIpcOptions {
    /** Electron's `userData`. Only needed to find a JDK the app provisioned for itself. */
    readonly dataDir: string;
    /** Injected in tests, so no JVM is ever launched to prove this file works. */
    readonly discover?: (options: DiscoverJavaOptions) => Promise<JavaDiscovery>;
}

export interface JavaIpc {
    dispose(): void;
}

/**
 * Registers the Java-runtime handler.
 *
 * Returns a `dispose` so a test, or a restart, can take the handler off again without
 * leaving a duplicate registration behind - `ipcMain.handle` throws on a channel that
 * already has one.
 *
 * Nothing is cached between calls: the settings row has a "Look again" button, and a
 * button that answers from a reading taken before the user installed the JDK they just
 * installed is a button that lies. Concurrent calls *are* folded into one, because
 * discovery launches a process per candidate and a screen that mounts and immediately
 * refreshes would otherwise start six.
 */
export function registerJavaHandlers(ipcMain: IpcMain, options: JavaIpcOptions): JavaIpc {
    const discover = options.discover ?? discoverJava;
    let inFlight: Promise<JavaRuntimeSummary> | null = null;

    async function run(): Promise<JavaRuntimeSummary> {
        try {
            return summariseDiscovery(await discover({ dataDir: options.dataDir }));
        } catch (error) {
            // Rethrown rather than swallowed - the row has a `failed` state and showing
            // it is more use than an empty one - but the message is put through the same
            // cleaning as a rejection. A thrown filesystem error carries the path it
            // failed on, and that path is not necessarily a JDK's.
            throw new Error(summariseReason(error instanceof Error ? error.message : String(error)));
        }
    }

    ipcMain.handle(
        "java:runtime",
        async (_event: IpcMainInvokeEvent): Promise<JavaRuntimeSummary> => {
            inFlight ??= run().finally(() => {
                inFlight = null;
            });
            return await inFlight;
        },
    );

    return {
        dispose(): void {
            for (const channel of JAVA_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
