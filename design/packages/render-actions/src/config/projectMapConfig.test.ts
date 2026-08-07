import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    LEGACY_PROJECT_FILE_NAME,
    PROJECT_FILE_NAME,
    readProjectMapConfig,
} from "./projectMapConfig.js";

describe("the project configuration carried inside a world archive", () => {
    let root = "";

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "render-actions-project-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    async function writeProject(value: unknown): Promise<void> {
        await mkdir(root, { recursive: true });
        await writeFile(join(root, PROJECT_FILE_NAME), JSON.stringify(value), "utf8");
    }

    it("returns the selected map's complete HOCON without interpreting or rewriting it", async () => {
        const config =
            'ambient-light: 0.35\nrender-mask: [{ type: "bluemap:circle", radius: 80 }]\n';
        await writeProject({ version: 1, maps: [{ id: "night", config }] });

        await expect(readProjectMapConfig(root, "night")).resolves.toEqual({
            source: "project",
            config,
            reason: `Loaded the complete maps/night.conf body from ${PROJECT_FILE_NAME}.`,
        });
    });

    it("reads a legacy project file when no Worldlens project file exists", async () => {
        const config = "ambient-light: 0.6\n";
        await writeFile(
            join(root, LEGACY_PROJECT_FILE_NAME),
            JSON.stringify({ version: 1, maps: [{ id: "night", config }] }),
            "utf8",
        );

        await expect(readProjectMapConfig(root, "night")).resolves.toEqual({
            source: "project",
            config,
            reason: `Loaded the complete maps/night.conf body from ${LEGACY_PROJECT_FILE_NAME}.`,
        });
    });

    it("uses documented defaults only when no project file exists", async () => {
        const result = await readProjectMapConfig(root, "world");
        expect(result.source).toBe("defaults");
        expect(result.config).toBeNull();
        expect(result.reason).toContain("manual workflow render");
    });

    it.each([
        ["malformed JSON", "not json", /not valid JSON/i],
        ["a future format", JSON.stringify({ version: 3, maps: [] }), /format 3/i],
        ["no maps list", JSON.stringify({ version: 1 }), /no maps list/i],
        [
            "no selected map",
            JSON.stringify({ version: 1, maps: [{ id: "other", config: "" }] }),
            /map world/i,
        ],
    ])(
        "refuses %s rather than silently changing the rendered map",
        async (_name, body, message) => {
            await writeFile(join(root, PROJECT_FILE_NAME), body, "utf8");
            await expect(readProjectMapConfig(root, "world")).rejects.toThrow(message);
        },
    );
});
