/**
 * The Bedrock-conversion channel between the main process and the interface.
 *
 * Built to the same shape as `world/index.ts` and `java/ipc.ts`: this is the only file
 * under `bedrock/` that names Electron at all, it names it only as a *type*, `IpcMain`
 * arrives as a parameter, and every channel is listed once in {@link BEDROCK_CHANNELS} so
 * `dispose` cannot drift from the registration. The import is erased at build time, so the
 * whole directory runs and is tested without an Electron runtime.
 *
 * Broadcasting is a parameter too, rather than reaching for `BrowserWindow` here. A
 * conversion is a long push-based operation like a render, but the thing that knows which
 * windows exist is the caller, and taking it as a function is what keeps this file free of
 * an Electron value import.
 *
 * ## No handler rejects
 *
 * Every one of these returns a value, including every refusal. "Chunker is not installed",
 * "that folder is a Java world", "the conversion failed" and "the argument was not a
 * string" are all ordinary things for this screen to display, and a rejected `invoke`
 * arrives in the renderer as an `Error` whose message has been mangled by Electron's
 * serialisation - which turns a sentence somebody could act on into a stack trace they
 * cannot. The one thing a caller never has to write here is a try/catch.
 *
 * ## A conversion is started explicitly, and only ever by a person
 *
 * Nothing in this module converts anything as a side effect of looking at a folder.
 * `bedrock:detect` reads and reports; `bedrock:convert` is the only thing that writes, it
 * needs a folder chosen by hand, and the interface is expected to have shown the fidelity
 * briefing, the destination and the size estimate first. Producing a second multi-gigabyte
 * copy of somebody's world is not something that should ever happen because a screen was
 * opened.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { inspectWorldFolder } from "../world/inspect.js";
import {
    fetchChunker,
    findChunker,
    pinnedRelease,
    versionFromJarName,
    type ChunkerLookup,
    type ChunkerRelease,
    type FetchChunkerOptions,
    type FindChunkerOptions,
} from "./chunker.js";
import {
    convertBedrockWorld,
    convertedWorldPath,
    estimateConvertedSize,
    DEFAULT_JAVA_TARGET,
    RECOMMENDED_JVM_ARGS,
    type ConversionEvent,
    type ConversionOutcome,
    type ConvertWorldOptions,
} from "./convert.js";
import { assessMemoryRisk, type MemoryRisk } from "./memory.js";
import { detectBedrockWorld, readBedrockLevelName, type BedrockWorldDetection } from "./detect.js";
import { fidelityNotesFor, type FidelityBriefing } from "./fidelity.js";
import {
    buildConversionRecord,
    readConversionRecord,
    writeConversionRecord,
    type ConversionRecord,
} from "./provenance.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const BEDROCK_CHANNELS = [
    "bedrock:detect",
    "bedrock:chunker",
    "bedrock:fetchChunker",
    "bedrock:convert",
    "bedrock:cancel",
    "bedrock:record",
] as const;

/** The channel every conversion progress, phase and log event arrives on. */
export const BEDROCK_EVENT_CHANNEL = "bedrock:event";

/** What `bedrock:detect` answers with. */
export interface BedrockDetectResult {
    readonly folder: string;
    readonly detection: BedrockWorldDetection;
    /** The world's name from `levelname.txt`, when it is a Bedrock world that has one. */
    readonly name: string | null;
    /** Where a converted copy would go. Null when this is not a Bedrock world. */
    readonly suggestedOutput: string | null;
    /** An estimate, labelled as one wherever it is shown. Null when nothing was measured. */
    readonly estimatedSize: { readonly low: number; readonly high: number } | null;
    /** Present when this is a Bedrock world, so the briefing is on screen before the button. */
    readonly fidelity: FidelityBriefing | null;
    /**
     * Whether this world is large enough that the converter will probably run out of memory.
     *
     * Sized against the world in front of the person rather than stated in general: a world
     * comfortably under the threshold sets `warn: false` and carries no copy at all, because
     * a warning shown to everybody is a warning nobody reads. Null when this is not a
     * Bedrock world and there is nothing to convert.
     */
    readonly memory: MemoryRisk | null;
    /** Set when the folder could not be read at all, in which case everything above is empty. */
    readonly error: string | null;
}

/** What `bedrock:chunker` answers with. */
export interface ChunkerStatus {
    readonly lookup: ChunkerLookup;
    /** What would be fetched if the person asks for it. */
    readonly available: ChunkerRelease;
    readonly fidelity: FidelityBriefing;
    /** Chunker's own licence, stated so the interface can attribute it without hardcoding. */
    readonly licence: {
        readonly spdx: "MIT";
        readonly holder: "Hive Games";
        readonly url: string;
        readonly bundled: false;
        readonly note: string;
    };
}

export type ConversionProgressEvent =
    | ({ readonly conversionId: string } & ConversionEvent)
    | {
          readonly conversionId: string;
          readonly kind: "download";
          readonly received: number;
          readonly total: number | null;
      }
    | {
          readonly conversionId: string;
          readonly kind: "finished";
          readonly outcome: ConversionOutcome;
      };

export interface BedrockIpcOptions {
    /** Electron's `userData`. Where a downloaded Chunker lives. Null means none is kept. */
    readonly dataDir?: string | null;
    /** A jar path the person chose in settings. */
    readonly configuredJar?: string | null;
    /**
     * Produces a JVM to run Chunker on, or explains why it cannot.
     *
     * A function rather than a path, and supplied by the caller, so this module reuses the
     * app's existing Temurin provisioning in `main/java/` instead of growing a second Java
     * story of its own. Chunker needs Java 17 or newer, which the app's own requirement of
     * a much newer JDK already satisfies.
     */
    readonly resolveJava: () => Promise<
        { readonly ok: true; readonly executable: string; readonly version: string | null } |
        { readonly ok: false; readonly message: string }
    >;
    readonly appVersion?: string | null;
    /** Where events go. Supplied by the caller so no Electron value is imported here. */
    readonly broadcast?: (event: ConversionProgressEvent) => void;
    /**
     * JVM arguments for the conversion. Defaults to {@link RECOMMENDED_JVM_ARGS}.
     *
     * Deliberately not a heap size. Chunker's memory use grows without bound on larger
     * worlds, so an `-Xmx` here would not prevent the failure - it would only choose when it
     * happens, and a larger one makes the landing worse. Read the note on
     * {@link RECOMMENDED_JVM_ARGS} before putting a number in here.
     */
    readonly jvmArgs?: readonly string[];
    /** Injected in tests, all of them, so nothing here needs Chunker or a JVM to be proven. */
    readonly find?: (options: FindChunkerOptions) => Promise<ChunkerLookup>;
    readonly fetch?: (options: FetchChunkerOptions) => Promise<{ readonly jarPath: string }>;
    readonly convert?: (options: ConvertWorldOptions) => Promise<ConversionOutcome>;
    readonly inspect?: typeof inspectWorldFolder;
}

export interface BedrockIpc {
    dispose(): void;
}

const CHUNKER_LICENCE_URL = "https://github.com/HiveGamesOSS/Chunker/blob/main/LICENSE";

/** Registers the Bedrock handlers. Returns `dispose` so a restart leaves no duplicate. */
export function registerBedrockHandlers(
    ipcMain: IpcMain,
    options: BedrockIpcOptions,
): BedrockIpc {
    const inspect = options.inspect ?? inspectWorldFolder;
    const find = options.find ?? findChunker;
    const fetch = options.fetch ?? fetchChunker;
    const convert = options.convert ?? convertBedrockWorld;
    const broadcast = options.broadcast ?? ((): void => undefined);

    /** In-flight conversions, so `bedrock:cancel` can reach the right one. */
    const running = new Map<string, { cancel(): void }>();

    const lookupOptions = (): FindChunkerOptions => ({
        ...(options.dataDir == null ? {} : { dataDir: options.dataDir }),
        ...(options.configuredJar == null ? {} : { configuredJar: options.configuredJar }),
    });

    ipcMain.handle(
        "bedrock:detect",
        async (
            _event: IpcMainInvokeEvent,
            folder: unknown,
            sizeBytes: unknown,
        ): Promise<BedrockDetectResult> => {
            if (typeof folder !== "string" || folder.trim() === "") {
                return empty("", "A world folder has to be given as text.");
            }

            let listing;
            try {
                listing = await inspect(folder);
            } catch (error) {
                // Returned rather than thrown. "There is no folder at that path" is a
                // sentence the screen shows in its normal error slot; as a rejection it
                // becomes an exception the renderer has to catch to display the same words.
                return empty(folder, error instanceof Error ? error.message : String(error));
            }

            const detection = detectBedrockWorld(listing);
            if (!detection.bedrock) {
                return {
                    folder,
                    detection,
                    name: null,
                    suggestedOutput: null,
                    estimatedSize: null,
                    fidelity: null,
                    memory: null,
                    error: null,
                };
            }

            const measured =
                typeof sizeBytes === "number" && Number.isFinite(sizeBytes) ? sizeBytes : null;
            const lookup = await find(lookupOptions());
            return {
                folder,
                detection,
                name: await readBedrockLevelName(folder),
                suggestedOutput: convertedWorldPath(folder),
                estimatedSize: estimateConvertedSize(measured),
                fidelity: fidelityNotesFor(lookup.found ? lookup.version : pinnedRelease().version),
                // Answered here, on the same call the Convert button is drawn from, so the
                // warning is on screen before anything runs rather than after twenty minutes.
                memory: assessMemoryRisk(measured),
                error: null,
            };
        },
    );

    ipcMain.handle("bedrock:chunker", async (): Promise<ChunkerStatus> => {
        const lookup = await find(lookupOptions());
        return {
            lookup,
            available: pinnedRelease(),
            fidelity: fidelityNotesFor(lookup.found ? lookup.version : pinnedRelease().version),
            licence: {
                spdx: "MIT",
                holder: "Hive Games",
                url: CHUNKER_LICENCE_URL,
                // Stated as a fact about this app, not about the licence. MIT permits
                // bundling; this app chooses not to, and saying so here keeps the interface
                // from implying a restriction that does not exist.
                bundled: false,
                note:
                    "Chunker is a separate open-source project by Hive Games, MIT licensed. " +
                    "Its licence permits redistribution, but this app does not bundle it: it " +
                    "is downloaded on request so that people who never convert a world do not " +
                    "carry it, and so the converter can be updated without a new app release.",
            },
        };
    });

    /**
     * Fetches the Chunker jar, verified against the digest pinned in this app's source.
     *
     * A separate step from converting, and a separate button, because it is a download of
     * about thirty megabytes from a third party and that is a decision somebody makes
     * rather than something that happens because they clicked Convert.
     */
    ipcMain.handle(
        "bedrock:fetchChunker",
        async (): Promise<{ readonly ok: boolean; readonly message: string; readonly jarPath: string | null }> => {
            if (options.dataDir == null || options.dataDir.trim() === "") {
                return {
                    ok: false,
                    message:
                        "This build has nowhere to keep a downloaded converter. Point the app " +
                        "at a chunker-cli jar in settings instead.",
                    jarPath: null,
                };
            }
            const release = pinnedRelease();
            try {
                const result = await fetch({
                    dataDir: options.dataDir,
                    release,
                    onProgress: (received, total) => {
                        broadcast({ conversionId: "chunker", kind: "download", received, total });
                    },
                });
                return {
                    ok: true,
                    message: `Chunker ${release.version} is ready. ${release.verificationNote}`,
                    jarPath: result.jarPath,
                };
            } catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                    jarPath: null,
                };
            }
        },
    );

    /**
     * Converts one Bedrock world, reporting progress and leaving nothing behind on failure.
     *
     * Returns the conversion id immediately only in the sense that the id is in the
     * finished event; the `invoke` itself resolves with the outcome, which is what a caller
     * awaiting a conversion actually wants. Cancellation goes through `bedrock:cancel` with
     * the id, which the caller receives on the event channel as soon as the run starts.
     */
    ipcMain.handle(
        "bedrock:convert",
        async (
            _event: IpcMainInvokeEvent,
            request: unknown,
        ): Promise<ConversionOutcome & { readonly conversionId: string }> => {
            const conversionId = randomUUID();
            const refuse = (message: string): ConversionOutcome & { readonly conversionId: string } => ({
                ok: false,
                code: "bad-invocation",
                message,
                cleanedUp: true,
                diagnostics: [],
                durationMs: 0,
                conversionId,
            });

            if (typeof request !== "object" || request === null) {
                return refuse("A conversion needs a world folder to convert.");
            }
            const { world, output, format, sizeBytes } = request as {
                world?: unknown;
                output?: unknown;
                format?: unknown;
                sizeBytes?: unknown;
            };
            if (typeof world !== "string" || world.trim() === "") {
                return refuse("A conversion needs a world folder given as text.");
            }

            // Re-checked here rather than trusted from the renderer. `bedrock:detect` ran
            // at some point in the past on a folder that may since have changed, and
            // pointing Chunker at a Java world would either fail confusingly or, worse,
            // produce a second copy of a world that never needed converting.
            let listing;
            try {
                listing = await inspect(world);
            } catch (error) {
                return refuse(error instanceof Error ? error.message : String(error));
            }
            const detection = detectBedrockWorld(listing);
            if (!detection.bedrock) {
                return refuse(
                    `${world} is not a Bedrock world, so there is nothing to convert. ` +
                        `A Java world can be rendered as it is.`,
                );
            }

            const java = await options.resolveJava();
            if (!java.ok) {
                return refuse(`Chunker needs Java 17 or newer to run, and ${java.message}`);
            }

            const lookup = await find(lookupOptions());
            if (!lookup.found) {
                return refuse(lookup.reason);
            }

            const outputDirectory =
                typeof output === "string" && output.trim() !== ""
                    ? output
                    : convertedWorldPath(world);
            const targetFormat =
                typeof format === "string" && format.trim() !== "" ? format : DEFAULT_JAVA_TARGET;

            // Registered before the conversion starts, so a Cancel arriving in the first
            // moments finds an entry rather than an empty map. `onStart` replaces this
            // no-op with the live run's own cancel the instant the run exists.
            const handle: { cancel(): void } = { cancel: () => undefined };
            running.set(conversionId, handle);
            try {
                const outcome = await convert({
                    javaExecutable: java.executable,
                    jarPath: lookup.jarPath,
                    inputDirectory: world,
                    outputDirectory,
                    outputFormat: targetFormat,
                    // Only phrases an out-of-memory failure; the conversion is identical
                    // without it. See `sourceBytes` on ConvertWorldOptions.
                    sourceBytes:
                        typeof sizeBytes === "number" && Number.isFinite(sizeBytes)
                            ? sizeBytes
                            : null,
                    // Defaulted rather than left empty: the recommended set exists to make an
                    // out-of-memory ending recognisable, and a caller that simply did not
                    // think about JVM flags should still get that.
                    jvmArgs: options.jvmArgs ?? RECOMMENDED_JVM_ARGS,
                    onEvent: (event) => {
                        broadcast({ conversionId, ...event });
                    },
                    onStart: (live) => {
                        handle.cancel = () => {
                            live.cancel();
                        };
                    },
                });

                if (outcome.ok) {
                    // Written before the outcome is reported, so a world that is on screen
                    // as converted always already carries the record saying what it is. The
                    // failure to write it is deliberately not fatal: a converted world with
                    // no provenance file is still a converted world, and refusing the
                    // conversion over a missing sidecar would throw away twenty minutes of
                    // work for a note.
                    await writeConversionRecord(
                        outcome.outputDirectory,
                        buildConversionRecord({
                            converterVersion: lookup.version ?? versionFromJarName(lookup.jarPath),
                            converterPath: lookup.jarPath,
                            javaVersion: java.version,
                            sourceWorld: world,
                            sourceName: await readBedrockLevelName(world),
                            sourceEdition: outcome.sourceEdition,
                            targetEdition: outcome.targetEdition,
                            targetFormat,
                            durationMs: outcome.durationMs,
                            regionFiles: outcome.regionFiles,
                            appVersion: options.appVersion ?? null,
                        }),
                    ).catch(() => undefined);
                }

                broadcast({ conversionId, kind: "finished", outcome });
                return { ...outcome, conversionId };
            } finally {
                running.delete(conversionId);
            }
        },
    );

    ipcMain.handle("bedrock:cancel", (_event: IpcMainInvokeEvent, id: unknown): boolean => {
        if (typeof id !== "string") return false;
        const handle = running.get(id);
        if (handle === undefined) return false;
        handle.cancel();
        return true;
    });

    /** Whether a world is a conversion, and of what. Null for a native Java world. */
    ipcMain.handle(
        "bedrock:record",
        async (_event: IpcMainInvokeEvent, world: unknown): Promise<ConversionRecord | null> => {
            if (typeof world !== "string" || world.trim() === "") return null;
            return await readConversionRecord(world);
        },
    );

    return {
        dispose(): void {
            for (const channel of BEDROCK_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

function empty(folder: string, error: string): BedrockDetectResult {
    return {
        folder,
        detection: {
            bedrock: false,
            confidence: null,
            markers: {
                levelDat: false,
                levelNameFile: false,
                database: false,
                databaseFiles: null,
            },
            explanation: "",
        },
        name: null,
        suggestedOutput: null,
        estimatedSize: null,
        fidelity: null,
        memory: null,
        error,
    };
}
