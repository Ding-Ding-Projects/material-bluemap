/**
 * Running a batched conversion, on a real disk with an injected runner.
 *
 * The runner is a stub that writes plausible batch output, so no JVM is launched and no
 * Bedrock world is needed - but the file system is real, because every property worth
 * asserting here is about what is on disk after something goes wrong.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ownedRegionFiles, type ConversionBatch } from "./batch.js";
import {
    LEDGER_FILE,
    MERGED_DIRECTORY,
    SETTINGS_FORMAT,
    convertBedrockWorldInBatches,
    mergeBatchOutput,
    readLedger,
} from "./batchConvert.js";
import { STAGING_SUFFIX, type ChunkerRunOptions, type ChunkerRunResult } from "./convert.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-batch-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** Four overworld regions, so a batch size of two gives two batches. */
const SETTINGS_JSON = JSON.stringify({
    maps: [],
    settings: {},
    dimensions: {
        "minecraft:overworld": [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
    },
});

function okResult(): ChunkerRunResult {
    return {
        exitCode: 0,
        signal: null,
        cancelled: false,
        completeLineSeen: true,
        silentFailure: null,
        outOfMemory: null,
        sourceEdition: "Bedrock 1.21.30",
        targetEdition: "Java 1.21.4",
        lastPercent: 100,
        diagnostics: [],
        durationMs: 1,
    };
}

/** Chunk coordinates covered by a pruning box, back to the regions they touch. */
function regionsFromPruning(file: string): Promise<string> {
    return readFile(file, "utf8");
}

interface StubOptions {
    /** Batch indexes (0-based, counting only conversion runs) that should fail. */
    readonly failAt?: readonly number[];
    readonly cancelAt?: number;
    readonly onRun?: (options: ChunkerRunOptions, conversionIndex: number) => void;
    /** Set by the harness so a stub can cancel the job mid-batch. */
    readonly cancelJob?: () => void;
}

/**
 * A runner that behaves like Chunker: a settings pass writes `data.json`, and a conversion
 * pass writes the regions its pruning config asked for - **including the margin spill**, so
 * the ownership filter is exercised rather than assumed.
 */
function stubRunner(options: StubOptions = {}) {
    let conversionIndex = -1;
    const runs: ChunkerRunOptions[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const factory = (runOptions: ChunkerRunOptions) => ({
        cancel: () => undefined,
        async start(): Promise<ChunkerRunResult> {
            concurrent += 1;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            try {
                runs.push(runOptions);
                if (runOptions.outputFormat === SETTINGS_FORMAT) {
                    await mkdir(runOptions.outputDirectory, { recursive: true });
                    await writeFile(
                        join(runOptions.outputDirectory, "data.json"),
                        SETTINGS_JSON,
                        "utf8",
                    );
                    return okResult();
                }

                conversionIndex += 1;
                const index = conversionIndex;
                options.onRun?.(runOptions, index);

                if (options.cancelAt === index) options.cancelJob?.();
                if (options.failAt?.includes(index) === true) {
                    return { ...okResult(), exitCode: 1, completeLineSeen: false };
                }

                // Every batch writes a whole Java world plus its regions and margin spill.
                const out = runOptions.outputDirectory;
                await mkdir(join(out, "region"), { recursive: true });
                await writeFile(join(out, "level.dat"), `globals from batch ${String(index)}`);
                await mkdir(join(out, "data"), { recursive: true });
                await writeFile(join(out, "data", "idcounts.dat"), "");

                const config = JSON.parse(await regionsFromPruning(runOptions.pruningFile ?? "")) as {
                    configs: Record<string, { regions: { minChunkX: number; minChunkZ: number }[] }>;
                };
                const owned = new Set<string>();
                for (const boxes of Object.values(config.configs)) {
                    for (const box of boxes.regions) {
                        const rx = Math.floor((box.minChunkX + 1) / 32);
                        const rz = Math.floor((box.minChunkZ + 1) / 32);
                        owned.add(`r.${String(rx)}.${String(rz)}.mca`);
                    }
                }
                for (const boxes of Object.values(config.configs)) {
                    for (const box of boxes.regions) {
                        const rx = Math.floor((box.minChunkX + 1) / 32);
                        const rz = Math.floor((box.minChunkZ + 1) / 32);
                        // The margin spill: partial files for neighbours, never for a region
                        // this same batch owns (the real converter's complete output wins).
                        for (const name of [
                            `r.${String(rx - 1)}.${String(rz)}.mca`,
                            `r.${String(rx)}.${String(rz - 1)}.mca`,
                        ]) {
                            if (!owned.has(name)) await writeFile(join(out, "region", name), "PARTIAL");
                        }
                    }
                }
                for (const name of owned) await writeFile(join(out, "region", name), "owned");
                return okResult();
            } finally {
                concurrent -= 1;
            }
        },
    });

    return {
        factory,
        runs,
        get maxConcurrent() {
            return maxConcurrent;
        },
    };
}

const BASE = {
    javaExecutable: "/jdk/bin/java",
    jarPath: "/chunker.jar",
    inputDirectory: "/worlds/Big",
    outputFormat: "JAVA_1_21_4",
    // Chosen so the plan is deterministic: 160 MB across the four regions the settings stub
    // reports is 40 MB each, and two of those fit in the 100 MB per-batch target - so every
    // test below runs exactly two batches.
    sourceBytes: 160 * 1024 * 1024,
} as const;

describe("a batched conversion", () => {
    it("runs one JVM at a time, never two", async () => {
        const stub = stubRunner();
        const output = join(root, "Big (Java)");

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stub.factory,
        });

        // Sequential is the entire mechanism: a fresh JVM per batch is what reclaims the
        // memory, and two at once would put both peaks on the machine together.
        expect(stub.maxConcurrent).toBe(1);
    });

    it("asks Chunker what the world contains before planning", async () => {
        const stub = stubRunner();

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: join(root, "Big (Java)"),
            run: stub.factory,
        });

        // The plan comes from Chunker's own report, never from a guessed grid.
        expect(stub.runs[0]?.outputFormat).toBe(SETTINGS_FORMAT);
        expect(stub.runs.slice(1).every((run) => run.pruningFile !== undefined)).toBe(true);
    });

    it("keeps only the regions each batch owns, discarding the margin spill", async () => {
        const output = join(root, "Big (Java)");

        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner().factory,
        });

        expect(outcome.ok).toBe(true);
        const regions = (await readdir(join(output, "region"))).sort();
        expect(regions).toEqual(["r.0.0.mca", "r.0.1.mca", "r.1.0.mca", "r.1.1.mca"]);

        // The decisive assertion. A partial margin file copied over a complete one would be
        // silent data loss - a region with a one-chunk sliver of terrain in it.
        for (const name of regions) {
            expect(await readFile(join(output, "region", name), "utf8")).toBe("owned");
        }
    });

    it("takes the world-level files from exactly one batch", async () => {
        const output = join(root, "Big (Java)");
        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner().factory,
        });

        // The first successful batch, so the result does not depend on which later batches
        // failed or were retried.
        expect(await readFile(join(output, "level.dat"), "utf8")).toBe("globals from batch 0");
        expect(existsSync(join(output, "data", "idcounts.dat"))).toBe(true);
    });

    it("leaves nothing at the world's path until every batch is merged", async () => {
        const output = join(root, "Big (Java)");
        const seen: boolean[] = [];

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner({ onRun: () => seen.push(existsSync(output)) }).factory,
        });

        // The `.converting` guard: at no point during the run does the output path exist.
        expect(seen.every((existed) => !existed)).toBe(true);
        expect(existsSync(output)).toBe(true);
        expect(existsSync(`${output}${STAGING_SUFFIX}`)).toBe(false);
    });

    it("reports progress across the whole job and says which batch is running", async () => {
        const percents: number[] = [];
        const batches: number[] = [];

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: join(root, "Big (Java)"),
            run: stubRunner().factory,
            onEvent: (event) => {
                if (event.kind === "progress") percents.push(event.percent);
            },
            onBatch: (progress) => batches.push(progress.batchIndex),
        });

        // A bar that ran 0-100 per batch and snapped back would read as the conversion
        // restarting over and over.
        expect(batches.length).toBeGreaterThan(1);
        expect([...percents]).toEqual([...percents].sort((a, b) => a - b));
        expect(Math.max(...percents, 0)).toBeLessThanOrEqual(100);
    });
});

describe("when a batch fails", () => {
    it("keeps the batches that already succeeded", async () => {
        const output = join(root, "Big (Java)");

        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner({ failAt: [1] }).factory,
        });

        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("unreachable");
        expect(outcome.message).toContain("carries on from this one");

        // The whole point of batching: the work that succeeded is not thrown away.
        const ledger = await readLedger(`${output}${STAGING_SUFFIX}`);
        expect(ledger?.completed).toContain(0);
        expect(ledger?.completed).not.toContain(1);
    });

    it("still leaves nothing that looks like a world", async () => {
        const output = join(root, "Big (Java)");

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner({ failAt: [0] }).factory,
        });

        // The partly-merged world stays under the `.converting` name, where nothing will
        // mistake it for something renderable.
        expect(existsSync(output)).toBe(false);
        expect(existsSync(`${output}${STAGING_SUFFIX}`)).toBe(true);
    });

    it("refuses when Chunker cannot report the world, rather than guessing a plan", async () => {
        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: join(root, "Big (Java)"),
            run: stubRunner().factory,
            readSettings: async () => "{ this is not the report }",
        });

        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("unreachable");
        // A guessed plan could silently leave parts of the world out, which is worse than
        // converting nothing.
        expect(outcome.message).toContain("silently leave parts of the world out");
    });
});

describe("resuming", () => {
    it("does not redo a batch that already succeeded", async () => {
        const output = join(root, "Big (Java)");

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner({ failAt: [1] }).factory,
        });

        const second = stubRunner();
        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: second.factory,
        });

        expect(outcome.ok).toBe(true);
        // One settings pass plus only the batches that had not finished. Batch 0 is skipped.
        const conversions = second.runs.filter((run) => run.outputFormat !== SETTINGS_FORMAT);
        expect(conversions).toHaveLength(1);
        // And the finished world still has every region, including the one from the first run.
        expect((await readdir(join(output, "region"))).sort()).toHaveLength(4);
    });

    it("starts over when the plan has changed, rather than mixing two carve-ups", async () => {
        const output = join(root, "Big (Java)");
        const staging = `${output}${STAGING_SUFFIX}`;

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner({ failAt: [1] }).factory,
        });

        // A ledger from a different plan: merging on top of it would produce a world made of
        // two incompatible carve-ups - some regions duplicated, others missing entirely.
        const ledger = JSON.parse(await readFile(join(staging, LEDGER_FILE), "utf8")) as Record<
            string,
            unknown
        >;
        await writeFile(
            join(staging, LEDGER_FILE),
            JSON.stringify({ ...ledger, planKey: "v1:SOMETHING_ELSE:9:9" }),
            "utf8",
        );

        const second = stubRunner();
        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: second.factory,
        });

        expect(outcome.ok).toBe(true);
        expect(second.runs.filter((r) => r.outputFormat !== SETTINGS_FORMAT)).toHaveLength(2);
    });

    it("ignores a ledger it cannot read", async () => {
        const output = join(root, "Big (Java)");
        const staging = `${output}${STAGING_SUFFIX}`;
        await mkdir(staging, { recursive: true });
        await writeFile(join(staging, LEDGER_FILE), "{ truncated", "utf8");

        const stub = stubRunner();
        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stub.factory,
        });

        expect(outcome.ok).toBe(true);
        expect(stub.runs.filter((r) => r.outputFormat !== SETTINGS_FORMAT)).toHaveLength(2);
    });
});

describe("cancelling", () => {
    it("stops between batches and keeps what finished", async () => {
        const output = join(root, "Big (Java)");
        let cancel: (() => void) | null = null;

        const stub = stubRunner({
            cancelAt: 0,
            cancelJob: () => cancel?.(),
        });

        const outcome = await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stub.factory,
            onStart: (handle) => {
                cancel = () => handle.cancel();
            },
        });

        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("unreachable");
        expect(outcome.code).toBe("cancelled");
        expect(outcome.message).toContain("carries on from where it stopped");

        // No second batch was started after the cancel.
        expect(stub.runs.filter((r) => r.outputFormat !== SETTINGS_FORMAT)).toHaveLength(1);
        // And nothing that looks like a world was left.
        expect(existsSync(output)).toBe(false);
    });
});

describe("merging one batch", () => {
    it("copies every parallel region directory together", async () => {
        const batch: ConversionBatch = {
            index: 0,
            dimension: "minecraft:the_nether",
            regions: [{ x: 2, z: 3 }],
        };
        const from = join(root, "batch");
        const to = join(root, "merged");

        for (const directory of ["region", "entities", "poi"]) {
            await mkdir(join(from, "DIM-1", directory), { recursive: true });
            await writeFile(join(from, "DIM-1", directory, "r.2.3.mca"), "owned");
            await writeFile(join(from, "DIM-1", directory, "r.9.9.mca"), "PARTIAL");
        }

        const copied = await mergeBatchOutput(from, to, batch, { withGlobals: false });

        // All three have to travel together: keeping terrain while dropping entities would
        // produce a world whose files disagree about what exists.
        expect(copied).toBe(3);
        for (const directory of ["region", "entities", "poi"]) {
            expect(await readdir(join(to, "DIM-1", directory))).toEqual(ownedRegionFiles(batch));
        }
    });

    it("copies nothing when the batch produced nothing", async () => {
        const copied = await mergeBatchOutput(
            join(root, "absent"),
            join(root, "merged"),
            { index: 0, dimension: "minecraft:overworld", regions: [{ x: 0, z: 0 }] },
            { withGlobals: true },
        );
        expect(copied).toBe(0);
    });
});

describe("the merged world's location", () => {
    it("is assembled under the staging name, not at the output path", async () => {
        const output = join(root, "Big (Java)");
        let mergedDuringRun = false;

        await convertBedrockWorldInBatches({
            ...BASE,
            outputDirectory: output,
            run: stubRunner({
                onRun: () => {
                    mergedDuringRun ||= existsSync(
                        join(`${output}${STAGING_SUFFIX}`, MERGED_DIRECTORY),
                    );
                },
            }).factory,
        });

        expect(mergedDuringRun).toBe(true);
    });
});
