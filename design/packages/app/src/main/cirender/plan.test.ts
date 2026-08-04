/**
 * The project file turned into workflow inputs.
 *
 * Pure, so every refusal is reachable without a disk or a network. The two assertions
 * worth reading twice are that the `world` input carries the asset's **exact** name rather
 * than a glob - a backup release holds three assets and a glob could take the wrong one -
 * and that a dimension the workflow does not offer is refused here rather than by GitHub's
 * generic 422.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectFile, ProjectMap } from "@material-bluemap/config";
import {
    DEFAULT_BUDGET_MINUTES,
    DEFAULT_MAX_JOBS,
    PROJECT_FILE_NAME,
    chooseProjectMap,
    planCiRender,
    readProjectAt,
    settingsTheWorkflowCannotSee,
} from "./plan.js";

function map(overrides: Partial<ProjectMap> = {}): ProjectMap {
    return {
        id: "world",
        name: "World",
        dimension: "minecraft:overworld",
        config: "",
        storage: "file",
        sorting: 0,
        enabled: true,
        ...overrides,
    };
}

function project(maps: ProjectMap[]): ProjectFile {
    return {
        version: 1,
        id: "project-1",
        name: "Overworld",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
        appVersion: null,
        maps,
        storages: [],
        render: { threads: null, force: false, fixEdges: false, metrics: false, outputFolder: null },
        core: null,
        webapp: null,
        webserver: null,
        plugin: null,
        fromWizard: false,
    };
}

describe("the inputs", () => {
    it("builds every input the workflow declares, with the asset named exactly", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "mbm-backup-world-overworld-20260804T101500Z",
            assetName: "world-overworld-20260804T101500Z.zip",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.inputs).toEqual({
            "world-source": "release-asset",
            world: "mbm-backup-world-overworld-20260804T101500Z/world-overworld-20260804T101500Z.zip",
            dimension: "minecraft:overworld",
            "map-id": "world",
            "map-name": "World",
            output: "artifact",
            "budget-minutes": String(DEFAULT_BUDGET_MINUTES),
            "max-jobs": String(DEFAULT_MAX_JOBS),
            "force-shards": "",
        });
        // A glob would let a backup release's pointer or sidecar be picked instead.
        expect(result.plan.inputs["world"]).not.toContain("*");
    });

    it("stays inside GitHub's ten-input cap", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "t",
            assetName: "a.zip",
        });
        expect(result.ok && Object.keys(result.plan.inputs).length).toBeLessThanOrEqual(10);
    });

    it("passes a budget, a job cap and the Pages choice through as strings", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "t",
            assetName: "a.zip",
            budgetMinutes: 90,
            maxJobs: 12,
            output: "artifact-and-pages",
        });
        expect(result.ok && result.plan.inputs["budget-minutes"]).toBe("90");
        expect(result.ok && result.plan.inputs["max-jobs"]).toBe("12");
        expect(result.ok && result.plan.inputs["output"]).toBe("artifact-and-pages");
    });

    it("falls back to the workflow's own defaults for a nonsense budget", () => {
        const result = planCiRender({
            project: project([map()]),
            releaseTag: "t",
            assetName: "a.zip",
            budgetMinutes: 0,
            maxJobs: -4,
        });
        expect(result.ok && result.plan.inputs["budget-minutes"]).toBe(String(DEFAULT_BUDGET_MINUTES));
        expect(result.ok && result.plan.inputs["max-jobs"]).toBe(String(DEFAULT_MAX_JOBS));
    });
});

describe("choosing the map", () => {
    it("takes the first enabled map when none is named", () => {
        const chosen = chooseProjectMap(
            project([map({ id: "nether", enabled: false }), map({ id: "overworld" })]),
        );
        expect(chosen.ok && chosen.map.id).toBe("overworld");
    });

    it("refuses a project with nothing enabled", () => {
        const chosen = chooseProjectMap(project([map({ enabled: false })]));
        expect(chosen.ok).toBe(false);
        expect(!chosen.ok && chosen.failure.code).toBe("no-maps");
    });

    it("names what the project does have when the map asked for is not there", () => {
        const chosen = chooseProjectMap(project([map({ id: "overworld" })]), "nether");
        expect(chosen.ok).toBe(false);
        expect(!chosen.ok && chosen.failure.message).toContain("overworld");
    });

    it("refuses a dimension the workflow's choice input does not offer", () => {
        const chosen = chooseProjectMap(project([map({ dimension: "mystcraft:age_12" })]));
        expect(chosen.ok).toBe(false);
        if (chosen.ok) return;
        expect(chosen.failure.code).toBe("unsupported-dimension");
        expect(chosen.failure.message).toContain("minecraft:the_nether");
    });

    it("accepts all three dimensions the workflow does offer", () => {
        for (const dimension of ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"]) {
            expect(chooseProjectMap(project([map({ dimension })])).ok, dimension).toBe(true);
        }
    });
});

describe("saying what will not travel", () => {
    it("lists the map's own settings, which the workflow has no input for", () => {
        const listed = settingsTheWorkflowCannotSee(
            map({
                config: [
                    "# a comment",
                    "world: not-carried-by-this-list",
                    "ambient-light: 0.1",
                    'sky-color = "#7dabff"',
                    "min-inhabited-time {",
                    "  value: 0",
                    "}",
                ].join("\n"),
            }),
        );
        expect(listed).toEqual(["ambient-light", "min-inhabited-time", "sky-color"]);
    });

    it("is empty for a map that carries no configuration of its own", () => {
        expect(settingsTheWorkflowCannotSee(map({ config: "\n# nothing but a comment\n" }))).toEqual([]);
    });
});

describe("reading the project off a world", () => {
    let workDir = "";

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "mbm-plan-"));
    });

    afterEach(async () => {
        await rm(workDir, { recursive: true, force: true });
    });

    it("points at the wizard when a world has never been set up", async () => {
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-project");
        expect(result.failure.message).toContain(PROJECT_FILE_NAME);
    });

    it("says a project is from a newer app rather than failing at its schema", async () => {
        await writeFile(join(workDir, PROJECT_FILE_NAME), JSON.stringify({ version: 99 }), "utf8");
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unreadable-project");
        expect(result.failure.message).toContain("newer version");
    });

    it("reads a real one", async () => {
        await writeFile(
            join(workDir, PROJECT_FILE_NAME),
            JSON.stringify(project([map()]), null, 4),
            "utf8",
        );
        const result = await readProjectAt(workDir);
        expect(result.ok).toBe(true);
        expect(result.ok && result.project.maps[0]?.id).toBe("world");
    });
});
