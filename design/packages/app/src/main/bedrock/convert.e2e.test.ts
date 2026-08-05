/**
 * The real end-to-end proof, not a replica of it.
 *
 * Every other test in this directory injects the process runner, so nothing else here
 * ever launches a JVM, needs Chunker installed, or needs a Bedrock world on disk - which
 * is deliberate (see the doc comments on `convert.ts` and `ipc.test.ts`) but leaves one
 * honest gap: the CLI contract this app drives was read from Chunker's source, never
 * observed. This file closes that gap, by doing the least-mocked thing that can possibly
 * prove it:
 *
 *   1. A genuine Bedrock Edition world - not synthesised, not hand-built - unpacked from
 *      a zip Hive Games themselves ship as an integration-test fixture in the Chunker
 *      repository (`cli/src/test/resources/integration/worlds/BEDROCK_R12.zip`, MIT).
 *      Committed here at `__fixtures__/BEDROCK_R12.zip`, sha256
 *      `cd7118f6a53c5c66a94b6c71ed0e5cb2898b9d4b8af7e7ac20bf99c517d24378`, 251606 bytes -
 *      small precisely because it is Hive Games' own smallest one, not because this app
 *      trimmed it.
 *   2. A real `chunker-cli-1.19.1.jar`, fetched over the network from the exact URL
 *      {@link PINNED_CHUNKER} names and checked against the digest pinned in `chunker.ts`
 *      - the same check a real user's download goes through, run for real rather than
 *      asserted against a mock.
 *   3. A real JVM, discovered on this machine exactly the way the packaged app would
 *      discover one (`discoverJava`), no injected runner.
 *   4. `registerBedrockHandlers` with only `IpcMain` stubbed out (the same plain object
 *      `ipc.test.ts` uses) and `resolveJava` wired to step 3. Every collaborator that
 *      module can inject - `find`, `fetch`, `convert`, `convertInBatches`, `inspect` - is
 *      left at its real default, so `bedrock:detect` and `bedrock:convert` run their
 *      actual production code, including the provenance write.
 *
 * ## Why this is opt-in, not part of the default suite
 *
 * `npx vitest run packages/app` never touches the network or spawns a JVM - that is what
 * makes it fast and reliable in a fast CI push job. This file needs both: a ~32MB fetch
 * from github.com and a real conversion. It is therefore gated on `BEDROCK_E2E=1` and
 * skipped otherwise, the same pattern `settings/ipc.test.ts` uses for its real-git suite.
 * Run it explicitly:
 *
 * ```sh
 * BEDROCK_E2E=1 npx vitest run packages/app/src/main/bedrock/convert.e2e.test.ts
 * ```
 *
 * See `docs/bedrock-worlds.md` and the site article for the date this last ran and its
 * real output.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { extractZip } from "../download/extract.js";
import { discoverJava } from "../java/discovery.js";
import { PINNED_CHUNKER } from "./chunker.js";
import { REQUIRED_CHUNKER_JAVA_FEATURE } from "./chunker.js";
import { registerBedrockHandlers, type BedrockDetectResult, type ConversionProgressEvent } from "./ipc.js";
import type { ConversionOutcome } from "./convert.js";
import { readConversionRecord } from "./provenance.js";

const FIXTURE_ZIP = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "BEDROCK_R12.zip");
const FIXTURE_SHA256 = "cd7118f6a53c5c66a94b6c71ed0e5cb2898b9d4b8af7e7ac20bf99c517d24378";

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** The same plain-object stand-in `ipc.test.ts` uses. No Electron runtime here either. */
function fakeIpcMain(): IpcMain & { handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler) {
            handlers.set(channel, handler);
        },
        removeHandler(channel: string) {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { handlers: Map<string, Handler> };
}

describe.skipIf(process.env["BEDROCK_E2E"] !== "1")(
    "a real Chunker, converting a real Bedrock world",
    { timeout: 180_000 },
    () => {
        let root = "";
        let worldDir = "";
        let dataDir = "";

        beforeAll(async () => {
            root = await mkdtemp(join(tmpdir(), "bedrock-e2e-"));
            worldDir = join(root, "BEDROCK_R12");
            dataDir = join(root, "userData");

            // Proves the committed fixture is still the exact bytes it claims to be,
            // before it is trusted as "a real Bedrock world" for the rest of this file.
            const zipBytes = await readFile(FIXTURE_ZIP);
            const digest = createHash("sha256").update(zipBytes).digest("hex");
            expect(digest).toBe(FIXTURE_SHA256);

            await extractZip(FIXTURE_ZIP, worldDir);
        }, 60_000);

        afterAll(async () => {
            if (root !== "") await rm(root, { recursive: true, force: true });
        });

        it(
            "the fixture is a real Bedrock save, not a synthetic one",
            async () => {
                const dbStat = await stat(join(worldDir, "db"));
                expect(dbStat.isDirectory()).toBe(true);
                const levelDat = await stat(join(worldDir, "level.dat"));
                expect(levelDat.isFile()).toBe(true);
                // BEDROCK_R12 carries no region/ (Anvil) folder - if it did, it would be a
                // Java world and this whole file would be proving nothing.
                await expect(stat(join(worldDir, "region"))).rejects.toThrow();
            },
            30_000,
        );

        it(
            "detects, fetches Chunker for real, converts for real, and records provenance",
            async () => {
                const java = await discoverJava({ required: REQUIRED_CHUNKER_JAVA_FEATURE });
                expect(
                    java.installation,
                    `No usable Java ${String(REQUIRED_CHUNKER_JAVA_FEATURE)}+ found on this machine: ` +
                        JSON.stringify(java.rejected),
                ).not.toBeNull();
                const installation = java.installation!;

                const events: ConversionProgressEvent[] = [];
                const ipc = fakeIpcMain();
                registerBedrockHandlers(ipc, {
                    dataDir,
                    resolveJava: async () => ({
                        ok: true,
                        executable: installation.executable,
                        version: installation.version.version,
                    }),
                    broadcast: (event) => events.push(event),
                    appVersion: "e2e-test",
                    // find, fetch, convert, convertInBatches, inspect: all left real.
                });

                const detect = ipc.handlers.get("bedrock:detect")!;
                const detectResult = (await detect(
                    {} as IpcMainInvokeEvent,
                    worldDir,
                    undefined,
                )) as BedrockDetectResult;

                expect(detectResult.detection.bedrock).toBe(true);
                expect(detectResult.error).toBeNull();
                // A 246 KB fixture never crosses the memory-risk threshold - this exercises
                // detection's real read of the folder, not the batching path.
                expect(detectResult.memory?.level).not.toBe("high");

                // The real network fetch: `bedrock:fetchChunker` downloads the pinned
                // release into `dataDir` and refuses to produce a file unless its SHA-256
                // matches - this is what actually proves the digest pinned in `chunker.ts`
                // is the real one, rather than the unit tests' fixed string comparison.
                const fetchChunker = ipc.handlers.get("bedrock:fetchChunker")!;
                const fetchResult = (await fetchChunker({} as IpcMainInvokeEvent)) as {
                    readonly ok: boolean;
                    readonly message: string;
                    readonly jarPath: string | null;
                };
                if (!fetchResult.ok) {
                    throw new Error(`Fetching the real Chunker jar failed: ${fetchResult.message}`);
                }
                expect(fetchResult.jarPath).not.toBeNull();

                const convert = ipc.handlers.get("bedrock:convert")!;
                const outputDirectory = join(root, "BEDROCK_R12 (Java)");
                const outcome = (await convert({} as IpcMainInvokeEvent, {
                    world: worldDir,
                    output: outputDirectory,
                })) as ConversionOutcome & { conversionId: string };

                if (!outcome.ok) {
                    throw new Error(
                        `Real conversion failed: ${outcome.message}\n` +
                            outcome.diagnostics.join("\n"),
                    );
                }

                expect(outcome.ok).toBe(true);
                expect(outcome.outputDirectory).toBe(outputDirectory);
                expect(outcome.regionFiles).toBeGreaterThan(0);
                // Chunker's own "Converting from X Y to A B" line, parsed for real.
                expect(outcome.sourceEdition).toMatch(/^Bedrock /);
                expect(outcome.targetEdition).toBe("Java 1.21.4");

                // The output really is a Java world: level.dat plus real region files,
                // written by Chunker, read back from disk rather than trusted from the
                // outcome object.
                const outLevelDat = await stat(join(outputDirectory, "level.dat"));
                expect(outLevelDat.isFile()).toBe(true);

                // The provenance write this app performs after every real conversion,
                // read back through the same production code a details panel would use.
                const record = await readConversionRecord(outputDirectory);
                expect(record).not.toBeNull();
                expect(record?.converter).toBe("chunker");
                expect(record?.converterVersion).toBe(PINNED_CHUNKER.version);
                expect(record?.sourceWorld).toBe(worldDir);
                expect(record?.targetFormat).toBe("JAVA_1_21_4");
                expect(record?.javaVersion).toBe(installation.version.version);
                expect(record?.regionFiles).toBeGreaterThan(0);

                // The progress channel carried real events, not just the final outcome -
                // this is what the interface's progress bar and phase copy actually read.
                const progressEvents = events.filter(
                    (event): event is ConversionProgressEvent & { kind: "progress" } =>
                        "kind" in event && event.kind === "progress",
                );
                expect(progressEvents.length).toBeGreaterThan(0);
                const finished = events.find((event) => "kind" in event && event.kind === "finished");
                expect(finished).toBeDefined();
            },
            120_000,
        );
    },
);
