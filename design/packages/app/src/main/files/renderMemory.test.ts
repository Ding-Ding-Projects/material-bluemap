import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    MAX_AUTOMATIC_MB,
    MIN_CEILING_MB,
    RENDER_MEMORY_FILE,
    RenderMemoryStore,
    describeCeiling,
    describeMegabytes,
    jvmArgsForCeiling,
    recommendedCeilingMb,
    totalMemoryMb,
    validateCeiling,
} from "./renderMemory.js";

const GB = 1024 * 1024 * 1024;

const created: string[] = [];

async function tempDataDir(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "mb-memory-"));
    created.push(folder);
    return folder;
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

describe("recommendedCeilingMb", () => {
    it("takes about half of a machine's memory", () => {
        expect(recommendedCeilingMb(16 * GB)).toBe(8192);
        expect(recommendedCeilingMb(8 * GB)).toBe(4096);
    });

    it("never decides on more than the automatic cap by itself", () => {
        // A 128 GB machine may well want more, but that is a choice the person makes, not
        // one the app makes for them without being asked.
        expect(recommendedCeilingMb(128 * GB)).toBe(MAX_AUTOMATIC_MB);
    });

    it("leaves room for the operating system on a small machine", () => {
        const chosen = recommendedCeilingMb(4 * GB);
        expect(chosen).toBeLessThanOrEqual(4096 - 2048);
        expect(chosen).toBeGreaterThanOrEqual(MIN_CEILING_MB);
    });

    it("never goes below the floor, however small the machine is", () => {
        expect(recommendedCeilingMb(2 * GB)).toBe(MIN_CEILING_MB);
        expect(recommendedCeilingMb(0)).toBe(MIN_CEILING_MB);
        expect(recommendedCeilingMb(Number.NaN)).toBe(MIN_CEILING_MB);
    });
});

describe("validateCeiling", () => {
    it("refuses a heap too small for BlueMap to load its resources", () => {
        const problem = validateCeiling(512, 16 * GB);
        expect(problem.ok).toBe(false);
        if (problem.ok) return;
        expect(problem.reason).toContain("fails after a long wait");
    });

    it("refuses a heap larger than the machine has", () => {
        const problem = validateCeiling(64 * 1024, 8 * GB);
        expect(problem.ok).toBe(false);
        if (problem.ok) return;
        expect(problem.reason).toContain("more memory than this machine has");
    });

    it("accepts a large but real choice above the automatic cap", () => {
        // The cap is on what the app decides, not on what a person may choose.
        expect(validateCeiling(32768, 64 * GB)).toEqual({ ok: true, megabytes: 32768 });
    });

    it("refuses anything that is not a number", () => {
        expect(validateCeiling("4096", 8 * GB).ok).toBe(false);
        expect(validateCeiling(Number.NaN, 8 * GB).ok).toBe(false);
        expect(validateCeiling(undefined, 8 * GB).ok).toBe(false);
    });
});

describe("jvmArgsForCeiling", () => {
    it("produces the hard heap ceiling, not the ergonomics hint", () => {
        // `-XX:MaxRAM` only changes what the JVM guesses; `-Xmx` is the number the heap
        // may never exceed, which is the whole point of the setting.
        expect(jvmArgsForCeiling({ mode: "manual", megabytes: 4096 })).toEqual(["-Xmx4096m"]);
    });
});

describe("describeMegabytes and describeCeiling", () => {
    it("states the unit both ways, so 4096 is never mistaken for 4", () => {
        expect(describeMegabytes(4096)).toBe("4096 MB (4.0 GB)");
    });

    it("says what the number does and what to do when it is wrong", () => {
        const text = describeCeiling({ mode: "automatic", megabytes: 4096 }, 16 * GB);
        expect(text).toContain("Chosen automatically");
        expect(text).toContain("4096 MB (4.0 GB)");
        expect(text).toContain("16384 MB (16.0 GB)");
        expect(text).toContain("out-of-memory");
    });
});

describe("totalMemoryMb", () => {
    it("reads bytes as mebibytes and refuses nonsense", () => {
        expect(totalMemoryMb(16 * GB)).toBe(16384);
        expect(totalMemoryMb(-1)).toBe(0);
        expect(totalMemoryMb(Number.POSITIVE_INFINITY)).toBe(0);
    });
});

describe("RenderMemoryStore", () => {
    it("starts automatic, with a recommendation derived from the machine", async () => {
        const store = new RenderMemoryStore({ dataDir: await tempDataDir(), totalMemoryBytes: 16 * GB });
        expect(store.read()).toEqual({ mode: "automatic", megabytes: 8192 });
        expect(store.jvmArgs()).toEqual(["-Xmx8192m"]);
    });

    it("persists a manual choice and reads it back", async () => {
        const dataDir = await tempDataDir();
        const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 16 * GB });
        expect(store.write({ mode: "manual", megabytes: 6144 })).toEqual({ ok: true, megabytes: 6144 });

        const reopened = new RenderMemoryStore({ dataDir, totalMemoryBytes: 16 * GB });
        expect(reopened.read()).toEqual({ mode: "manual", megabytes: 6144 });
        expect(reopened.jvmArgs()).toEqual(["-Xmx6144m"]);
    });

    it("goes back to automatic when asked, and stores the current recommendation", async () => {
        const dataDir = await tempDataDir();
        const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 16 * GB });
        store.write({ mode: "manual", megabytes: 6144 });
        store.write({ mode: "automatic", megabytes: 0 });
        expect(store.read().mode).toBe("automatic");
    });

    it("refuses a bad choice without writing anything", async () => {
        const dataDir = await tempDataDir();
        const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 8 * GB });
        const refused = store.write({ mode: "manual", megabytes: 64 * 1024 });
        expect(refused.ok).toBe(false);
        expect(store.read().mode).toBe("automatic");
    });

    it("falls back to automatic when the stored file is corrupt", async () => {
        const dataDir = await tempDataDir();
        await writeFile(join(dataDir, RENDER_MEMORY_FILE), "{ not json", "utf8");
        const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 16 * GB });
        expect(store.read().mode).toBe("automatic");
    });

    it("falls back to automatic when the stored number no longer fits the machine", async () => {
        const dataDir = await tempDataDir();
        // The profile came from a bigger machine, or memory was removed. Handing that
        // number to a JVM produces a render that refuses to start at all.
        await writeFile(
            join(dataDir, RENDER_MEMORY_FILE),
            JSON.stringify({ mode: "manual", megabytes: 32768 }),
            "utf8",
        );
        const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 8 * GB });
        expect(store.read()).toEqual({ mode: "automatic", megabytes: recommendedCeilingMb(8 * GB) });
    });

    it("writes through a staging file, so a crash cannot leave half a number", async () => {
        const dataDir = await tempDataDir();
        const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 16 * GB });
        store.write({ mode: "manual", megabytes: 3072 });
        const text = await readFile(join(dataDir, RENDER_MEMORY_FILE), "utf8");
        expect(JSON.parse(text)).toEqual({ mode: "manual", megabytes: 3072 });
    });

    it("never throws when the data directory cannot be written", async () => {
        // A file where the folder should be: `mkdir` fails, and so does every write after
        // it. A settings file that cannot be saved must not stop a render from starting.
        const parent = await tempDataDir();
        const blocker = join(parent, "blocker");
        await writeFile(blocker, "not a directory", "utf8");

        const store = new RenderMemoryStore({ dataDir: blocker, totalMemoryBytes: 16 * GB });
        expect(() => store.write({ mode: "manual", megabytes: 2048 })).not.toThrow();
        expect(store.read().mode).toBe("automatic");
    });
});
