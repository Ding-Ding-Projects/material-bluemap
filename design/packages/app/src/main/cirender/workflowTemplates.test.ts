/**
 * Reading the shipped workflow files off disk, against a scratch directory rather than the
 * real checkout - `bootstrap.ts` never needs this at all (its templates are always
 * injected), so this is purely about the loader that hands the real application its real
 * content.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    CI_WORKFLOW_FILE_NAMES,
    CiWorkflowTemplateError,
    loadCiWorkflowTemplates,
} from "./workflowTemplates.js";

const cleanups: string[] = [];

afterEach(async () => {
    while (cleanups.length > 0) {
        const dir = cleanups.pop();
        if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    }
});

async function scratchDirWith(files: Readonly<Record<string, string>>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "cirender-workflow-templates-"));
    cleanups.push(dir);
    for (const [name, content] of Object.entries(files)) {
        await writeFile(join(dir, name), content, "utf8");
    }
    return dir;
}

describe("loadCiWorkflowTemplates", () => {
    it("reads every named file, prefixed under .github/workflows/", async () => {
        const dir = await scratchDirWith({
            "render-world.yml": "name: Render world\n",
            "render-shard-wave.yml": "name: Render shard wave\n",
            "scheduled-render.yml": "name: Scheduled render\n",
        });

        const loaded = await loadCiWorkflowTemplates({ checkoutWorkflowsDir: dir });

        expect(loaded.templates).toEqual([
            { path: ".github/workflows/render-world.yml", content: "name: Render world\n" },
            {
                path: ".github/workflows/render-shard-wave.yml",
                content: "name: Render shard wave\n",
            },
            { path: ".github/workflows/scheduled-render.yml", content: "name: Scheduled render\n" },
        ]);
        expect(loaded.version).toMatch(/^[0-9a-f]{16}$/);
    });

    it("prefers a packaged resourcesDir over the checkout fallback when both are given", async () => {
        const resources = await scratchDirWith({});
        const workflowsDir = join(resources, "workflows");
        await scratchDirWith({}); // just to reuse cleanup bookkeeping shape
        const fs = await import("node:fs/promises");
        await fs.mkdir(workflowsDir, { recursive: true });
        for (const name of CI_WORKFLOW_FILE_NAMES) {
            await fs.writeFile(join(workflowsDir, name), `from resources: ${name}\n`, "utf8");
        }
        const checkoutDir = await scratchDirWith({
            "render-world.yml": "from checkout: render-world.yml\n",
            "render-shard-wave.yml": "from checkout: render-shard-wave.yml\n",
            "scheduled-render.yml": "from checkout: scheduled-render.yml\n",
        });

        const loaded = await loadCiWorkflowTemplates({
            resourcesDir: resources,
            checkoutWorkflowsDir: checkoutDir,
        });

        expect(loaded.templates[0]?.content).toContain("from resources:");
    });

    it("falls through to the checkout directory when resourcesDir is missing a file", async () => {
        const resources = await scratchDirWith({});
        const fs = await import("node:fs/promises");
        await fs.mkdir(join(resources, "workflows"), { recursive: true });
        await fs.writeFile(
            join(resources, "workflows", "render-world.yml"),
            "only half there\n",
            "utf8",
        );
        // render-shard-wave.yml deliberately missing from resources.

        const checkoutDir = await scratchDirWith({
            "render-world.yml": "from checkout\n",
            "render-shard-wave.yml": "from checkout too\n",
            "scheduled-render.yml": "from checkout three\n",
        });

        const loaded = await loadCiWorkflowTemplates({
            resourcesDir: resources,
            checkoutWorkflowsDir: checkoutDir,
        });
        expect(
            loaded.templates.every((template) => template.content.includes("from checkout")),
        ).toBe(true);
    });

    it("produces the same version for the same content, and a different one for different content", async () => {
        const dirA = await scratchDirWith({
            "render-world.yml": "name: A\n",
            "render-shard-wave.yml": "name: A2\n",
            "scheduled-render.yml": "name: A3\n",
        });
        const dirB = await scratchDirWith({
            "render-world.yml": "name: B\n",
            "render-shard-wave.yml": "name: B2\n",
            "scheduled-render.yml": "name: B3\n",
        });

        const loadedA = await loadCiWorkflowTemplates({ checkoutWorkflowsDir: dirA });
        const loadedA2 = await loadCiWorkflowTemplates({ checkoutWorkflowsDir: dirA });
        const loadedB = await loadCiWorkflowTemplates({ checkoutWorkflowsDir: dirB });

        expect(loadedA.version).toBe(loadedA2.version);
        expect(loadedA.version).not.toBe(loadedB.version);
    });

    it("refuses cleanly when no candidate directory has the files", async () => {
        const emptyDir = await scratchDirWith({});

        await expect(
            loadCiWorkflowTemplates({ checkoutWorkflowsDir: emptyDir }),
        ).rejects.toBeInstanceOf(CiWorkflowTemplateError);
    });
});
