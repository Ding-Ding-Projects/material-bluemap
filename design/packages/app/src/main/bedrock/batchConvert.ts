/**
 * Running a batched conversion: one JVM per batch, in sequence, merged as it goes.
 *
 * `batch.ts` decides *what* the batches are and why that is correct. This file runs them,
 * and its whole job is that the disk is never left in a state that lies:
 *
 * ```
 * <output>.converting/            the staging root - the name says "unfinished"
 *   world/                        the merged Java world, built up batch by batch
 *   batches.json                  which batches are already merged in
 *   batch-<n>/                    one batch's raw output, deleted once merged
 * <output>                        appears only at the very end, by rename
 * ```
 *
 * ## One JVM at a time, and never two
 *
 * Sequential is not a simplification, it is the entire mechanism. A fresh JVM per batch is
 * what reclaims the memory, and running two at once would put both peaks on the machine
 * simultaneously and undo the thing batching exists to do. Each batch's process is fully
 * exited - `start()` has resolved - before the next is spawned.
 *
 * ## Resuming
 *
 * A batch that has been merged is recorded in `batches.json` before the next one starts, so a
 * conversion interrupted by a failure, a cancellation or a closed app resumes from the first
 * unmerged batch rather than redoing hours of work. The ledger also records the plan it was
 * built from: if the world or the batch size has changed since, the completed set is not
 * transferable and everything starts again rather than merging pieces of two different plans
 * into one world.
 *
 * ## Why the merge is a file copy
 *
 * Every region file is produced by exactly one batch, complete, because the batch read a
 * one-chunk margin around everything it owns. So merging never opens an Anvil file, never
 * touches its sector allocation, and cannot corrupt one. The margin spill - real chunks
 * belonging to regions this batch does not own - is discarded with the rest of the batch
 * directory.
 */

import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    GLOBAL_WORLD_ENTRIES,
    REGION_DIRECTORIES,
    dimensionDirectory,
    ownedRegionFiles,
    parseSettingsRegions,
    planBatches,
    pruningConfigFor,
    regionsPerBatch,
    type ConversionBatch,
    type DimensionRegions,
} from "./batch.js";
import {
    ChunkerConversion,
    STAGING_SUFFIX,
    verifyConvertedWorld,
    type ChunkerRunOptions,
    type ChunkerRunResult,
    type ConversionEvent,
    type ConversionOutcome,
} from "./convert.js";

/** The ledger file, inside the staging root so it is removed with everything else. */
export const LEDGER_FILE = "batches.json";

/** Where the merged world is assembled, under the staging root. */
export const MERGED_DIRECTORY = "world";

/** Chunker's settings-only writer, which reports a world without converting it. */
export const SETTINGS_FORMAT = "SETTINGS";

export interface BatchLedger {
    readonly version: 1;
    /**
     * Identifies the plan these completed batches belong to.
     *
     * A resumed run recomputes this; if it differs, the completed batches describe a
     * different carve-up of the world and merging on top of them would produce a world made
     * of two incompatible plans - some regions duplicated, others missing entirely.
     */
    readonly planKey: string;
    readonly completed: readonly number[];
    /** Which batch contributed the world-level files. See {@link GLOBAL_WORLD_ENTRIES}. */
    readonly globalsFrom: number | null;
}

/** A plan key that changes whenever the batches would be different. */
export function planKeyFor(batches: readonly ConversionBatch[], format: string): string {
    const regions = batches.reduce((total, batch) => total + batch.regions.length, 0);
    return `v1:${format}:${String(batches.length)}:${String(regions)}`;
}

export async function readLedger(stagingRoot: string): Promise<BatchLedger | null> {
    let raw: string;
    try {
        raw = await readFile(join(stagingRoot, LEDGER_FILE), "utf8");
    } catch {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1) return null;
    if (typeof record.planKey !== "string") return null;
    if (!Array.isArray(record.completed)) return null;
    const completed = record.completed.filter((value): value is number => Number.isInteger(value));
    return {
        version: 1,
        planKey: record.planKey,
        completed,
        globalsFrom: Number.isInteger(record.globalsFrom) ? (record.globalsFrom as number) : null,
    };
}

/**
 * Writes the ledger.
 *
 * Staged and renamed, because a ledger truncated by a crash is worse than no ledger: it would
 * claim a batch was merged when only part of it was, and the missing regions would never be
 * converted again.
 */
export async function writeLedger(stagingRoot: string, ledger: BatchLedger): Promise<void> {
    const path = join(stagingRoot, LEDGER_FILE);
    await mkdir(stagingRoot, { recursive: true });
    const staged = `${path}.writing`;
    await writeFile(staged, JSON.stringify(ledger, null, 4), "utf8");
    await rename(staged, path);
}

/** Copies one entry if it exists, and says nothing if it does not. */
async function copyIfPresent(from: string, to: string): Promise<boolean> {
    try {
        await mkdir(dirname(to), { recursive: true });
        await cp(from, to, { recursive: true, force: true });
        return true;
    } catch {
        // Absent is normal: a world with no `datapacks`, a dimension with no `poi`, a batch
        // whose regions were all empty. Only a present-but-unreadable entry would matter, and
        // that surfaces as a missing region file at verification rather than being guessed at
        // here.
        return false;
    }
}

/**
 * Merges one batch's output into the world being assembled.
 *
 * Only the region files the batch owns, and - for the first batch to succeed - the world-level
 * files. Returns how many region files were taken, which is what lets the caller notice a
 * batch that produced nothing at all.
 */
export async function mergeBatchOutput(
    batchDirectory: string,
    mergedWorld: string,
    batch: ConversionBatch,
    options: { readonly withGlobals: boolean },
): Promise<number> {
    const dimensionPath = dimensionDirectory(batch.dimension);
    const owned = new Set(ownedRegionFiles(batch));
    let copied = 0;

    for (const regionDirectory of REGION_DIRECTORIES) {
        const from = join(batchDirectory, dimensionPath, regionDirectory);
        let names: string[];
        try {
            names = await readdir(from);
        } catch {
            continue; // This dimension has no such directory, which is ordinary.
        }
        for (const name of names) {
            // The margin spill lives here too - real chunks in regions this batch does not
            // own, and only a sliver of each. Copying one would overwrite the complete file
            // that the owning batch produces.
            if (!owned.has(name)) continue;
            if (await copyIfPresent(join(from, name), join(mergedWorld, dimensionPath, regionDirectory, name))) {
                copied += 1;
            }
        }
    }

    if (options.withGlobals) {
        for (const entry of GLOBAL_WORLD_ENTRIES) {
            await copyIfPresent(join(batchDirectory, entry), join(mergedWorld, entry));
        }
    }

    return copied;
}

export interface BatchProgress {
    readonly batchIndex: number;
    readonly batchCount: number;
    /** 0-100 across the whole job, not within the batch. */
    readonly overallPercent: number;
}

export interface BatchedConversionOptions {
    readonly javaExecutable: string;
    readonly jarPath: string;
    readonly inputDirectory: string;
    readonly outputDirectory: string;
    readonly outputFormat: string;
    readonly jvmArgs?: readonly string[];
    readonly env?: NodeJS.ProcessEnv;
    /** The world's measured size, used to choose how many regions go in a batch. */
    readonly sourceBytes?: number | null;
    readonly onEvent?: (event: ConversionEvent) => void;
    readonly onBatch?: (progress: BatchProgress) => void;
    readonly onStart?: (handle: { cancel(): void }) => void;
    /** Injected in tests so no JVM is ever launched. */
    readonly run?: (options: ChunkerRunOptions) => {
        start(): Promise<ChunkerRunResult>;
        cancel(): void;
    };
    /** Injected in tests. Returns the raw `data.json` the settings pass wrote. */
    readonly readSettings?: (directory: string) => Promise<string>;
    readonly verify?: typeof verifyConvertedWorld;
}

/** A batch failed, and the message says which one and what is safe to do next. */
function batchFailure(
    batch: ConversionBatch,
    batchCount: number,
    reason: string,
    durationMs: number,
): ConversionOutcome {
    return {
        ok: false,
        code: "chunker-failed",
        message:
            `Batch ${String(batch.index + 1)} of ${String(batchCount)} failed: ${reason} ` +
            `The batches that already finished have been kept, so converting again carries ` +
            `on from this one rather than starting over. Your Bedrock world was not modified.`,
        cleanedUp: false,
        diagnostics: [],
        durationMs,
    };
}

/**
 * Converts a world in batches.
 *
 * Never rejects; every outcome is a value. On success the finished world is at
 * `outputDirectory` and the staging root is gone. On any failure the staging root remains,
 * deliberately - it holds the completed batches a retry will skip - and it keeps its
 * `.converting` name so nothing mistakes it for a world.
 */
export async function convertBedrockWorldInBatches(
    options: BatchedConversionOptions,
): Promise<ConversionOutcome> {
    const startedAt = Date.now();
    const stagingRoot = `${options.outputDirectory}${STAGING_SUFFIX}`;
    const mergedWorld = join(stagingRoot, MERGED_DIRECTORY);
    const runFactory = options.run ?? ((o: ChunkerRunOptions) => new ChunkerConversion(o));
    const verify = options.verify ?? verifyConvertedWorld;

    let cancelled = false;
    let liveCancel: (() => void) | null = null;
    // Registered once for the whole job rather than per batch: a person pressing Cancel means
    // the conversion, not whichever batch happens to be running at that instant. The flag is
    // what stops the *next* batch starting; the delegate stops the current one.
    options.onStart?.({
        cancel: () => {
            cancelled = true;
            liveCancel?.();
        },
    });

    await mkdir(stagingRoot, { recursive: true });

    // ---- Plan, from Chunker's own report of the world ----------------------------------
    const settingsDirectory = join(stagingRoot, "settings");
    await rm(settingsDirectory, { recursive: true, force: true });
    await mkdir(settingsDirectory, { recursive: true });

    const settingsRun = runFactory({
        javaExecutable: options.javaExecutable,
        jarPath: options.jarPath,
        inputDirectory: options.inputDirectory,
        outputDirectory: settingsDirectory,
        outputFormat: SETTINGS_FORMAT,
        ...(options.jvmArgs === undefined ? {} : { jvmArgs: options.jvmArgs }),
        ...(options.env === undefined ? {} : { env: options.env }),
    });
    liveCancel = () => settingsRun.cancel();
    const settingsResult = await settingsRun.start();
    liveCancel = null;

    if (cancelled) return cancelledOutcome(startedAt);
    if (settingsResult.silentFailure !== null || settingsResult.exitCode !== 0) {
        return {
            ok: false,
            code: "unreadable-input",
            message:
                `Chunker could not read this world well enough to plan a batched conversion: ` +
                `${settingsResult.silentFailure ?? settingsResult.diagnostics.at(-1) ?? "it stopped without saying why."}`,
            cleanedUp: false,
            diagnostics: settingsResult.diagnostics,
            durationMs: Date.now() - startedAt,
        };
    }

    let dimensions: DimensionRegions[] | null = null;
    try {
        const raw = await (options.readSettings ?? defaultReadSettings)(settingsDirectory);
        dimensions = parseSettingsRegions(raw);
    } catch {
        dimensions = null;
    }
    if (dimensions === null) {
        // Refused rather than guessed. A plan built from an unreadable report would convert
        // some unknown subset of the world and call it finished, which is silent data loss.
        return {
            ok: false,
            code: "incomplete-output",
            message:
                "Chunker did not report which parts of this world exist, so it cannot be " +
                "converted in batches safely - a guessed plan could silently leave parts of " +
                "the world out. Nothing was converted and your Bedrock world was not modified.",
            cleanedUp: false,
            diagnostics: [],
            durationMs: Date.now() - startedAt,
        };
    }

    const totalRegions = dimensions.reduce((total, entry) => total + entry.regions.length, 0);
    const batches = planBatches(
        dimensions,
        regionsPerBatch(options.sourceBytes ?? null, totalRegions),
    );
    if (batches.length === 0) {
        return {
            ok: false,
            code: "incomplete-output",
            message: "This world reported no regions to convert, so there was nothing to do.",
            cleanedUp: false,
            diagnostics: [],
            durationMs: Date.now() - startedAt,
        };
    }

    // ---- Resume ------------------------------------------------------------------------
    const planKey = planKeyFor(batches, options.outputFormat);
    const existing = await readLedger(stagingRoot);
    const usable = existing !== null && existing.planKey === planKey;
    if (existing !== null && !usable) {
        // The world or the batch size changed since the interrupted run. Merging new batches
        // on top of the old ones would produce a world assembled from two different carve-ups.
        await rm(mergedWorld, { recursive: true, force: true });
    }
    const completed = new Set<number>(usable ? existing.completed : []);
    let globalsFrom = usable ? existing.globalsFrom : null;

    // ---- Convert, one JVM at a time ----------------------------------------------------
    for (const batch of batches) {
        if (cancelled) return cancelledOutcome(startedAt);

        options.onBatch?.({
            batchIndex: batch.index,
            batchCount: batches.length,
            overallPercent: (completed.size / batches.length) * 100,
        });
        if (completed.has(batch.index)) continue;

        const batchDirectory = join(stagingRoot, `batch-${String(batch.index)}`);
        await rm(batchDirectory, { recursive: true, force: true });
        await mkdir(batchDirectory, { recursive: true });

        const pruningFile = join(stagingRoot, `pruning-${String(batch.index)}.json`);
        await writeFile(pruningFile, JSON.stringify(pruningConfigFor(batch)), "utf8");

        const run = runFactory({
            javaExecutable: options.javaExecutable,
            jarPath: options.jarPath,
            inputDirectory: options.inputDirectory,
            outputDirectory: batchDirectory,
            outputFormat: options.outputFormat,
            pruningFile,
            ...(options.jvmArgs === undefined ? {} : { jvmArgs: options.jvmArgs }),
            ...(options.env === undefined ? {} : { env: options.env }),
            ...(options.onEvent === undefined
                ? {}
                : {
                      onEvent: (event: ConversionEvent) => {
                          // Rescaled to the whole job. A bar that runs 0-100 once per batch
                          // and then snaps back reads as the conversion restarting.
                          if (event.kind === "progress") {
                              const span = 100 / batches.length;
                              options.onEvent?.({
                                  kind: "progress",
                                  percent: completed.size * span + (event.percent / 100) * span,
                              });
                              return;
                          }
                          options.onEvent?.(event);
                      },
                  }),
        });

        liveCancel = () => run.cancel();
        const result = await run.start();
        liveCancel = null;

        if (cancelled || result.cancelled) return cancelledOutcome(startedAt);

        if (result.silentFailure !== null || result.exitCode !== 0 || !result.completeLineSeen) {
            await rm(batchDirectory, { recursive: true, force: true });
            return batchFailure(
                batch,
                batches.length,
                result.silentFailure ??
                    result.diagnostics.at(-1) ??
                    `it stopped with exit code ${String(result.exitCode)}.`,
                Date.now() - startedAt,
            );
        }

        const withGlobals = globalsFrom === null;
        await mergeBatchOutput(batchDirectory, mergedWorld, batch, { withGlobals });
        if (withGlobals) globalsFrom = batch.index;

        // The ledger is written *after* the merge and before the batch directory goes, so a
        // crash between the two costs one repeated batch rather than a missing region.
        completed.add(batch.index);
        await writeLedger(stagingRoot, {
            version: 1,
            planKey,
            completed: [...completed],
            globalsFrom,
        });
        await rm(batchDirectory, { recursive: true, force: true });
    }

    // ---- Verify, then let it become a world --------------------------------------------
    const check = await verify(mergedWorld);
    if (!check.ok) {
        return {
            ok: false,
            code: "incomplete-output",
            message: `${check.reason} The batches that finished have been kept for a retry.`,
            cleanedUp: false,
            diagnostics: [],
            durationMs: Date.now() - startedAt,
        };
    }

    await mkdir(dirname(options.outputDirectory), { recursive: true });
    await rename(mergedWorld, options.outputDirectory);
    await rm(stagingRoot, { recursive: true, force: true });

    return {
        ok: true,
        outputDirectory: options.outputDirectory,
        regionFiles: check.regionFiles,
        sourceEdition: null,
        targetEdition: options.outputFormat,
        durationMs: Date.now() - startedAt,
    };
}

function cancelledOutcome(startedAt: number): ConversionOutcome {
    return {
        ok: false,
        code: "cancelled",
        message:
            "The conversion was cancelled. Batches that had already finished have been kept, " +
            "so converting again carries on from where it stopped rather than starting over. " +
            "Nothing that looks like a finished world was left behind, and your Bedrock world " +
            "was never modified.",
        cleanedUp: false,
        diagnostics: [],
        durationMs: Date.now() - startedAt,
    };
}

async function defaultReadSettings(directory: string): Promise<string> {
    return await readFile(join(directory, "data.json"), "utf8");
}
