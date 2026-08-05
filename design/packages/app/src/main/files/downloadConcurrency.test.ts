import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    DEFAULT_CONCURRENCY,
    DOWNLOAD_CONCURRENCY_FILE,
    DownloadConcurrencyStore,
    MAX_CONCURRENCY,
    MIN_CONCURRENCY,
    describeConcurrency,
    validateConcurrency,
} from "./downloadConcurrency.js";

const created: string[] = [];

async function tempDataDir(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "mb-concurrency-"));
    created.push(folder);
    return folder;
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

describe("validateConcurrency", () => {
    it("accepts anything from the floor to the ceiling", () => {
        expect(validateConcurrency(MIN_CONCURRENCY)).toEqual({ ok: true, workers: MIN_CONCURRENCY });
        expect(validateConcurrency(MAX_CONCURRENCY)).toEqual({ ok: true, workers: MAX_CONCURRENCY });
        expect(validateConcurrency(DEFAULT_CONCURRENCY)).toEqual({ ok: true, workers: DEFAULT_CONCURRENCY });
    });

    it("refuses zero and negative numbers - nothing downloads with no workers", () => {
        const refused = validateConcurrency(0);
        expect(refused.ok).toBe(false);
        if (refused.ok) return;
        expect(refused.reason).toContain("zero workers download nothing");
        expect(validateConcurrency(-3).ok).toBe(false);
    });

    it("refuses more than the ceiling, and explains the disk and bandwidth contention", () => {
        const refused = validateConcurrency(MAX_CONCURRENCY + 1);
        expect(refused.ok).toBe(false);
        if (refused.ok) return;
        expect(refused.reason).toContain("same disk");
    });

    it("refuses anything that is not a number", () => {
        expect(validateConcurrency("4").ok).toBe(false);
        expect(validateConcurrency(Number.NaN).ok).toBe(false);
        expect(validateConcurrency(undefined).ok).toBe(false);
        expect(validateConcurrency(null).ok).toBe(false);
    });

    it("rounds a fractional number rather than refusing it", () => {
        expect(validateConcurrency(4.4)).toEqual({ ok: true, workers: 4 });
    });
});

describe("describeConcurrency", () => {
    it("names the number and both directions of the trade-off", () => {
        const text = describeConcurrency(4);
        expect(text).toContain("4 parts");
        expect(text).toContain("finish");
        expect(text).toContain("slow");
    });

    it("says 'one part' in the singular", () => {
        expect(describeConcurrency(1)).toContain("one part");
        expect(describeConcurrency(1)).not.toContain("1 parts");
    });
});

describe("DownloadConcurrencyStore", () => {
    it("starts at the shipped default of four", async () => {
        const store = new DownloadConcurrencyStore({ dataDir: await tempDataDir() });
        expect(store.read()).toEqual({ workers: DEFAULT_CONCURRENCY, isDefault: true });
        expect(store.concurrency()).toBe(DEFAULT_CONCURRENCY);
    });

    it("persists a choice and reads it back", async () => {
        const dataDir = await tempDataDir();
        const store = new DownloadConcurrencyStore({ dataDir });
        expect(store.write(8)).toEqual({ ok: true, workers: 8 });

        const reopened = new DownloadConcurrencyStore({ dataDir });
        expect(reopened.read()).toEqual({ workers: 8, isDefault: false });
        expect(reopened.concurrency()).toBe(8);
    });

    it("reports the default as the default even after writing it back explicitly", async () => {
        const dataDir = await tempDataDir();
        const store = new DownloadConcurrencyStore({ dataDir });
        store.write(2);
        store.write(DEFAULT_CONCURRENCY);
        expect(store.read()).toEqual({ workers: DEFAULT_CONCURRENCY, isDefault: true });
    });

    it("refuses a bad choice without writing anything", async () => {
        const dataDir = await tempDataDir();
        const store = new DownloadConcurrencyStore({ dataDir });
        const refused = store.write(99);
        expect(refused.ok).toBe(false);
        expect(store.read()).toEqual({ workers: DEFAULT_CONCURRENCY, isDefault: true });
    });

    it("falls back to the default when the stored file is corrupt", async () => {
        const dataDir = await tempDataDir();
        await writeFile(join(dataDir, DOWNLOAD_CONCURRENCY_FILE), "{ not json", "utf8");
        const store = new DownloadConcurrencyStore({ dataDir });
        expect(store.concurrency()).toBe(DEFAULT_CONCURRENCY);
    });

    it("falls back to the default when the stored number no longer fits today's bounds", async () => {
        const dataDir = await tempDataDir();
        // The bounds tightened, or the file was hand-edited past them.
        await writeFile(
            join(dataDir, DOWNLOAD_CONCURRENCY_FILE),
            JSON.stringify({ workers: 999 }),
            "utf8",
        );
        const store = new DownloadConcurrencyStore({ dataDir });
        expect(store.read()).toEqual({ workers: DEFAULT_CONCURRENCY, isDefault: true });
    });

    it("writes through a staging file, so a crash cannot leave a half-written number", async () => {
        const dataDir = await tempDataDir();
        const store = new DownloadConcurrencyStore({ dataDir });
        store.write(6);
        const text = await readFile(join(dataDir, DOWNLOAD_CONCURRENCY_FILE), "utf8");
        expect(JSON.parse(text)).toEqual({ workers: 6 });
    });

    it("never throws when the data directory cannot be written", async () => {
        const parent = await tempDataDir();
        const blocker = join(parent, "blocker");
        await writeFile(blocker, "not a directory", "utf8");

        const store = new DownloadConcurrencyStore({ dataDir: blocker });
        expect(() => store.write(8)).not.toThrow();
        expect(store.read().workers).toBe(DEFAULT_CONCURRENCY);
    });
});
