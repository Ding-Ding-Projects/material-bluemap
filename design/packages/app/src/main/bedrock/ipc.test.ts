/**
 * The channel contract: every handler answers, none of them rejects, and `dispose` takes
 * off exactly what `register` put on.
 *
 * `IpcMain` is a parameter, so a plain object stands in for it and no Electron runtime is
 * involved. Every collaborator - the Chunker lookup, the conversion, the folder listing,
 * the JVM - is injected, so this suite proves the wiring without Chunker, a JVM, or a
 * Bedrock world existing anywhere.
 */

import { describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";
import type { WorldFolderListing } from "../world/inspect.js";
import { BEDROCK_CHANNELS, registerBedrockHandlers, type BedrockIpcOptions } from "./ipc.js";
import type { ChunkerLookup } from "./chunker.js";
import type { ConversionOutcome } from "./convert.js";

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** A stand-in for `IpcMain` that records what was registered and removed. */
function fakeIpcMain(): IpcMain & { handlers: Map<string, Handler>; removed: string[] } {
    const handlers = new Map<string, Handler>();
    const removed: string[] = [];
    return {
        handlers,
        removed,
        handle(channel: string, handler: Handler) {
            if (handlers.has(channel)) throw new Error(`duplicate handler for ${channel}`);
            handlers.set(channel, handler);
        },
        removeHandler(channel: string) {
            removed.push(channel);
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { handlers: Map<string, Handler>; removed: string[] };
}

function listing(overrides: Partial<WorldFolderListing> = {}): WorldFolderListing {
    return {
        folder: "/worlds/MyWorld",
        entries: [],
        regionFiles: { "": 0 },
        leveldbFiles: null,
        ...overrides,
    };
}

const BEDROCK_LISTING = listing({
    entries: [
        { path: "level.dat", directory: false },
        { path: "levelname.txt", directory: false },
        { path: "db", directory: true },
    ],
    leveldbFiles: 4,
});

const JAVA_LISTING = listing({
    entries: [
        { path: "level.dat", directory: false },
        { path: "region", directory: true },
    ],
    regionFiles: { "": 0, region: 12 },
});

const CHUNKER_FOUND: ChunkerLookup = {
    found: true,
    source: "downloaded",
    jarPath: "/data/chunker/chunker-cli-1.19.1.jar",
    version: "1.19.1",
};

const CHUNKER_MISSING: ChunkerLookup = {
    found: false,
    reason: "Chunker is not installed.",
    remedy: "download",
    searched: ["/data/chunker/chunker-cli-1.19.1.jar"],
};

function options(overrides: Partial<BedrockIpcOptions> = {}): BedrockIpcOptions {
    return {
        dataDir: "/data",
        resolveJava: async () => ({ ok: true, executable: "/jdk/bin/java", version: "25.0.3" }),
        find: async () => CHUNKER_FOUND,
        inspect: async () => BEDROCK_LISTING,
        convert: async () => ({
            ok: true,
            outputDirectory: "/worlds/MyWorld (Java)",
            regionFiles: 9,
            sourceEdition: "Bedrock 1.21.30",
            targetEdition: "Java 1.21.4",
            durationMs: 1000,
        }),
        ...overrides,
    };
}

function install(overrides: Partial<BedrockIpcOptions> = {}) {
    const ipcMain = fakeIpcMain();
    const ipc = registerBedrockHandlers(ipcMain, options(overrides));
    const call = async (channel: string, ...args: unknown[]): Promise<unknown> => {
        const handler = ipcMain.handlers.get(channel);
        if (handler === undefined) throw new Error(`no handler for ${channel}`);
        return await handler({}, ...args);
    };
    return { ipcMain, ipc, call };
}

describe("registration", () => {
    it("registers exactly the channels it names, and disposes exactly those", () => {
        const { ipcMain, ipc } = install();

        expect([...ipcMain.handlers.keys()].sort()).toEqual([...BEDROCK_CHANNELS].sort());

        ipc.dispose();

        // The list drives both sides, so a channel added to one and not the other would
        // leave a handler behind and make the next registration throw on a duplicate.
        expect(ipcMain.removed.sort()).toEqual([...BEDROCK_CHANNELS].sort());
        expect(ipcMain.handlers.size).toBe(0);
    });
});

describe("bedrock:detect", () => {
    it("names a Bedrock world and offers a destination", async () => {
        const { call } = install();

        const result = (await call("bedrock:detect", "/worlds/MyWorld", 5_000_000)) as {
            detection: { bedrock: boolean; explanation: string };
            suggestedOutput: string | null;
            estimatedSize: { low: number; high: number } | null;
            fidelity: { notes: unknown[] } | null;
            error: string | null;
        };

        expect(result.detection.bedrock).toBe(true);
        expect(result.detection.explanation).toContain("Bedrock Edition");
        expect(result.suggestedOutput).toContain("MyWorld (Java)");
        expect(result.estimatedSize).toEqual({ low: 5_000_000, high: 10_000_000 });

        // The fidelity briefing is on the detect response, so it is available to put on
        // screen before the Convert button rather than after the conversion.
        expect(result.fidelity?.notes.length).toBeGreaterThan(0);
        expect(result.error).toBeNull();
    });

    it("leaves a Java world entirely alone", async () => {
        const { call } = install({ inspect: async () => JAVA_LISTING });

        const result = (await call("bedrock:detect", "/worlds/survival")) as {
            detection: { bedrock: boolean };
            suggestedOutput: string | null;
            fidelity: unknown;
        };

        expect(result.detection.bedrock).toBe(false);
        // Nothing is offered, because nothing needs doing.
        expect(result.suggestedOutput).toBeNull();
        expect(result.fidelity).toBeNull();
    });

    it("returns an unreadable folder as a value rather than rejecting", async () => {
        const { call } = install({
            inspect: async () => {
                throw new Error("There is no folder at /gone.");
            },
        });

        const result = (await call("bedrock:detect", "/gone")) as { error: string | null };

        expect(result.error).toBe("There is no folder at /gone.");
    });

    it("refuses a non-string argument without throwing", async () => {
        const { call } = install();
        await expect(call("bedrock:detect", 42)).resolves.toMatchObject({
            error: expect.stringContaining("as text"),
        });
    });
});

describe("bedrock:chunker", () => {
    it("reports an absent Chunker honestly, with its licence and the fact it is not bundled", async () => {
        const { call } = install({ find: async () => CHUNKER_MISSING });

        const status = (await call("bedrock:chunker")) as {
            lookup: { found: boolean };
            available: { sha256: string; digestTrust: string; verificationNote: string };
            licence: { spdx: string; holder: string; bundled: boolean; note: string };
        };

        expect(status.lookup.found).toBe(false);
        expect(status.licence).toMatchObject({ spdx: "MIT", holder: "Hive Games", bundled: false });
        expect(status.licence.note).toContain("permits redistribution");
        expect(status.available.digestTrust).toBe("pinned");
        expect(status.available.verificationNote).toContain("do not publish a signature");
    });
});

describe("bedrock:convert", () => {
    it("converts and reports the outcome", async () => {
        const finished: unknown[] = [];
        const { call } = install({ broadcast: (event) => finished.push(event) });

        const outcome = (await call("bedrock:convert", { world: "/worlds/MyWorld" })) as {
            ok: boolean;
            conversionId: string;
        };

        expect(outcome.ok).toBe(true);
        expect(outcome.conversionId).toMatch(/[0-9a-f-]{36}/);
        expect(finished).toContainEqual(expect.objectContaining({ kind: "finished" }));
    });

    it("refuses a Java world rather than making a pointless second copy", async () => {
        const convert = vi.fn();
        const { call } = install({ inspect: async () => JAVA_LISTING, convert });

        const outcome = (await call("bedrock:convert", { world: "/worlds/survival" })) as {
            ok: boolean;
            message: string;
        };

        expect(outcome.ok).toBe(false);
        expect(outcome.message).toContain("not a Bedrock world");
        // Re-checked here rather than trusted from the renderer: the detect call that led
        // to this button may have run against a folder that has since changed.
        expect(convert).not.toHaveBeenCalled();
    });

    it("reports a missing Chunker as a value, never as a rejection", async () => {
        const { call } = install({ find: async () => CHUNKER_MISSING });

        const outcome = (await call("bedrock:convert", { world: "/worlds/MyWorld" })) as {
            ok: boolean;
            message: string;
        };

        expect(outcome.ok).toBe(false);
        expect(outcome.message).toContain("Chunker is not installed");
    });

    it("reports a missing JVM without pretending it could convert anyway", async () => {
        const { call } = install({
            resolveJava: async () => ({ ok: false, message: "no Java 17 or newer was found." }),
        });

        const outcome = (await call("bedrock:convert", { world: "/worlds/MyWorld" })) as {
            ok: boolean;
            message: string;
        };

        expect(outcome.ok).toBe(false);
        expect(outcome.message).toContain("Java 17 or newer");
    });

    it("refuses a request with no world instead of throwing", async () => {
        const { call } = install();
        await expect(call("bedrock:convert", {})).resolves.toMatchObject({ ok: false });
        await expect(call("bedrock:convert", null)).resolves.toMatchObject({ ok: false });
    });

    it("passes a failed conversion straight through", async () => {
        const failure: ConversionOutcome = {
            ok: false,
            code: "incomplete-output",
            message: "The conversion produced a level.dat but no region files.",
            cleanedUp: true,
            diagnostics: [],
            durationMs: 12,
        };
        const { call } = install({ convert: async () => failure });

        await expect(call("bedrock:convert", { world: "/worlds/MyWorld" })).resolves.toMatchObject({
            ok: false,
            code: "incomplete-output",
        });
    });
});

describe("bedrock:cancel", () => {
    it("reaches the live conversion", async () => {
        const cancelled = vi.fn();
        let conversionId = "";

        const { call } = install({
            broadcast: (event) => {
                conversionId = event.conversionId;
            },
            convert: async (convertOptions) => {
                // The run hands its cancel out through `onStart`, which is the only way the
                // channel can reach a process constructed inside `convertBedrockWorld`.
                convertOptions.onStart?.({ cancel: cancelled });
                convertOptions.onEvent?.({ kind: "phase", phase: "converting" });
                await call("bedrock:cancel", conversionId);
                return {
                    ok: false,
                    code: "cancelled",
                    message: "The conversion was cancelled.",
                    cleanedUp: true,
                    diagnostics: [],
                    durationMs: 3,
                };
            },
        });

        await call("bedrock:convert", { world: "/worlds/MyWorld" });

        expect(cancelled).toHaveBeenCalledOnce();
    });

    it("answers false for a conversion that is not running", async () => {
        const { call } = install();
        // False rather than true: a Cancel that reports success while nothing was stopped
        // is worse than one that plainly says it found nothing to stop.
        await expect(call("bedrock:cancel", "not-a-real-id")).resolves.toBe(false);
        await expect(call("bedrock:cancel", 7)).resolves.toBe(false);
    });
});

describe("bedrock:record", () => {
    it("answers null for a world with no conversion record, rather than rejecting", async () => {
        const { call } = install();
        await expect(call("bedrock:record", "/worlds/native-java")).resolves.toBeNull();
        await expect(call("bedrock:record", 5)).resolves.toBeNull();
    });
});
