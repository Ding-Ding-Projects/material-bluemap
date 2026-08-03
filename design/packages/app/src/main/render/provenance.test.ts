import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    RENDER_ENGINE_LABELS,
    RENDER_RECORD_VERSION,
    describeEngine,
    readRenderRecord,
    writeRenderRecord,
} from "./provenance.js";
import type { RenderRecord } from "./provenance.js";

let root = "";

const RECORD: RenderRecord = {
    recordVersion: RENDER_RECORD_VERSION,
    renderId: "my-world-abc123456789",
    engine: "upstream-java",
    engineVersion: "5.22-27",
    enginePath: "/jars/cli-5.22-27-shadow.jar",
    javaVersion: "25.0.3",
    maps: [
        {
            id: "overworld",
            name: "Overworld",
            world: "/saves/My World",
            dimension: "minecraft:overworld",
        },
    ],
    startedAt: "2026-08-03T12:35:06.000Z",
    finishedAt: "2026-08-03T12:35:19.000Z",
    outcome: "finished",
    failureCode: null,
    durationMs: 13_000,
    appVersion: "0.1.0",
};

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-provenance-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("describeEngine", () => {
    it("names the engine and its version, which is what the README promises", () => {
        expect(describeEngine(RECORD)).toBe("BlueMap engine (Java) 5.22-27 on Java 25.0.3");
    });

    it("names the TypeScript engine as itself rather than as the new one", () => {
        // D17 and D18 have both engines in the tree during the changeover. Calling one
        // "legacy" would have somebody re-render a map that is perfectly current.
        expect(RENDER_ENGINE_LABELS.typescript).toBe("Material BlueMap engine (TypeScript)");
        expect(
            describeEngine({ ...RECORD, engine: "typescript", javaVersion: null, engineVersion: "0.1.0" }),
        ).toBe("Material BlueMap engine (TypeScript) 0.1.0");
    });
});

describe("writeRenderRecord and readRenderRecord", () => {
    it("round-trips a record", async () => {
        const path = join(root, "render.json");
        await writeRenderRecord(path, RECORD);
        expect(await readRenderRecord(path)).toEqual(RECORD);
    });

    it("creates the directory it is written into", async () => {
        const path = join(root, "nested", "deeper", "render.json");
        await writeRenderRecord(path, RECORD);
        expect(await readRenderRecord(path)).toEqual(RECORD);
    });

    it("leaves no staging file behind", async () => {
        const path = join(root, "render.json");
        await writeRenderRecord(path, RECORD);
        await expect(readFile(`${path}.writing`, "utf8")).rejects.toThrow();
    });

    it("says it does not know rather than guessing", async () => {
        // The whole point of the file is to say which engine rendered a map. Inventing
        // an answer from an unreadable file is worse than having none.
        expect(await readRenderRecord(join(root, "absent.json"))).toBeNull();

        await writeFile(join(root, "broken.json"), "{ not json", "utf8");
        expect(await readRenderRecord(join(root, "broken.json"))).toBeNull();

        await writeFile(join(root, "empty.json"), "{}", "utf8");
        expect(await readRenderRecord(join(root, "empty.json"))).toBeNull();

        await writeFile(
            join(root, "old.json"),
            JSON.stringify({ ...RECORD, recordVersion: 0 }),
            "utf8",
        );
        expect(await readRenderRecord(join(root, "old.json"))).toBeNull();

        await writeFile(
            join(root, "alien.json"),
            JSON.stringify({ ...RECORD, engine: "some-other-engine" }),
            "utf8",
        );
        expect(await readRenderRecord(join(root, "alien.json"))).toBeNull();
    });

    it("keeps a record written while the render was still running", async () => {
        // Written before the engine starts on purpose: a record that only appears on
        // success cannot explain a workspace full of half-written tiles, which is
        // exactly the workspace somebody asks about.
        const path = join(root, "running.json");
        await writeRenderRecord(path, {
            ...RECORD,
            outcome: "running",
            finishedAt: null,
            durationMs: null,
        });
        const read = await readRenderRecord(path);
        expect(read?.outcome).toBe("running");
        expect(read?.finishedAt).toBeNull();
    });

    it("keeps the failure code so the record explains itself", async () => {
        const path = join(root, "failed.json");
        await writeRenderRecord(path, {
            ...RECORD,
            outcome: "failed",
            failureCode: "no-maps-rendered",
        });
        expect((await readRenderRecord(path))?.failureCode).toBe("no-maps-rendered");
    });
});
