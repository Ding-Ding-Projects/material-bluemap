/**
 * Turning a world's own project file into the nine strings the workflow takes.
 *
 * A CI render must be **repeatable**, and repeatable means it does not depend on what
 * somebody typed into a form at four in the afternoon. The world carries
 * `material-bluemap.project.json` at its root - see `@material-bluemap/config`'s
 * `project.ts` - and that file already holds the maps, their ids, their display names and
 * their dimensions. So the plan is read out of it, and syncing the same world twice
 * produces the same inputs without anybody remembering anything.
 *
 * ## What the workflow can carry, and what it cannot
 *
 * `render-world.yml` takes nine `workflow_dispatch` inputs, and GitHub caps a workflow at
 * ten. A map's own `maps/<id>.conf` is ninety-odd settings of HOCON - ambient light, sky
 * colour, the y range, marker sets - and **none of it fits through that door**. The
 * workflow generates its own shard configs from the plan, so a CI render uses BlueMap's
 * defaults for everything the inputs do not name.
 *
 * That is a real limitation and this module's job is to say so *before* a dispatch rather
 * than leaving somebody to notice that their carefully tuned map came back looking
 * ordinary. {@link CiRenderPlan.notCarried} lists the settings the project holds that the
 * workflow will not see, read out of the map's own HOCON, so the surface can show them.
 *
 * ## The dimension is checked here, not by GitHub
 *
 * `dimension` is a `type: choice` input with exactly three options. A project map naming
 * anything else - a modded dimension, a custom datapack world - is refused here with a
 * sentence saying which three are possible. Sent anyway, GitHub answers 422 with a
 * generic message that reads as "the workflow is broken", which sends people to the wrong
 * place entirely.
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PROJECT_FILE_NAME, parseProjectFile } from "@material-bluemap/config";
import type { ProjectFile, ProjectMap } from "@material-bluemap/config";
import { RENDER_WORKFLOW_FILE } from "./actions.js";

export { PROJECT_FILE_NAME, RENDER_WORKFLOW_FILE };

/** Exactly the three the workflow's `dimension` choice offers. */
export const WORKFLOW_DIMENSIONS: readonly string[] = [
    "minecraft:overworld",
    "minecraft:the_nether",
    "minecraft:the_end",
];

/** The workflow's own defaults, restated so a plan is complete rather than partial. */
export const DEFAULT_BUDGET_MINUTES = 240;
export const DEFAULT_MAX_JOBS = 64;

export type CiRenderOutput = "artifact" | "artifact-and-pages";

export interface CiRenderPlan {
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    /** Every `workflow_dispatch` input, as the strings GitHub takes. */
    readonly inputs: Readonly<Record<string, string>>;
    /**
     * Settings this project holds that the workflow has no input for.
     *
     * Informational, never used to decide anything. An empty list means the project's map
     * carries no configuration beyond what the inputs already express.
     */
    readonly notCarried: readonly string[];
}

export type CiPlanRefusal =
    | { readonly code: "no-project"; readonly message: string }
    | { readonly code: "unreadable-project"; readonly message: string }
    | { readonly code: "no-maps"; readonly message: string }
    | { readonly code: "no-such-map"; readonly message: string }
    | { readonly code: "unsupported-dimension"; readonly message: string };

export type CiPlanResult =
    | { readonly ok: true; readonly plan: CiRenderPlan }
    | { readonly ok: false; readonly failure: CiPlanRefusal };

export type ProjectAtResult =
    | { readonly ok: true; readonly project: ProjectFile }
    | { readonly ok: false; readonly failure: CiPlanRefusal };

/**
 * Reads the project file at the root of a world.
 *
 * A missing file and an unreadable one are told apart deliberately: the first means "this
 * world has never been set up in the app", which the surface answers by offering the
 * wizard, and the second means something is wrong with a file that exists, which it
 * answers by naming the problem. One message for both would send half the people to the
 * wrong remedy.
 */
export async function readProjectAt(worldFolder: string): Promise<ProjectAtResult> {
    const path = join(resolve(worldFolder), PROJECT_FILE_NAME);
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch {
        return {
            ok: false,
            failure: {
                code: "no-project",
                message:
                    `There is no ${PROJECT_FILE_NAME} at the root of ${worldFolder}, so this world ` +
                    "has no maps set up yet. Render it once in the app, or run the map wizard, and " +
                    "the project file that produces is what a CI render repeats.",
            },
        };
    }

    const parsed = parseProjectFile(raw);
    if (!parsed.ok) {
        return { ok: false, failure: { code: "unreadable-project", message: describe(path, parsed.failure) } };
    }
    return { ok: true, project: parsed.project };
}

function describe(path: string, failure: { kind: string } & Record<string, unknown>): string {
    switch (failure.kind) {
        case "too-new":
            return (
                `${path} was written by a newer version of Material BlueMap (format ` +
                `${String(failure["version"])}). Update the app rather than letting this build guess ` +
                "at settings it does not understand."
            );
        case "not-json":
            return `${path} is not valid JSON: ${String(failure["message"])}`;
        case "invalid": {
            const problems = Array.isArray(failure["problems"]) ? failure["problems"] : [];
            return `${path} is not a project this build can read: ${problems.join("; ")}`;
        }
        default:
            return `${path} could not be read: ${String(failure["message"] ?? failure.kind)}`;
    }
}

export type ChooseMapResult =
    | { readonly ok: true; readonly map: ProjectMap }
    | { readonly ok: false; readonly failure: CiPlanRefusal };

/**
 * Which map a sync is for, and every reason there might not be one.
 *
 * Separate from {@link planCiRender} because the answer is needed **before** the world is
 * uploaded and the inputs cannot be built until after it - the release tag and the asset
 * name are outputs of the upload. Discovering that a project has no enabled map, or that
 * its dimension is one the workflow does not offer, after twenty gigabytes have gone up is
 * the failure this split exists to prevent.
 */
export function chooseProjectMap(project: ProjectFile, mapId?: string | undefined): ChooseMapResult {
    const maps = project.maps.filter((map) => map.enabled);
    if (maps.length === 0) {
        return {
            ok: false,
            failure: {
                code: "no-maps",
                message:
                    `${project.name} has no enabled maps, so there is nothing for a CI render ` +
                    "to render. Add one in the project editor first.",
            },
        };
    }

    const chosen: ProjectMap | undefined =
        mapId === undefined ? maps[0] : maps.find((map) => map.id === mapId);
    if (chosen === undefined) {
        return {
            ok: false,
            failure: {
                code: "no-such-map",
                message:
                    `${project.name} has no enabled map called ${String(mapId)}. It has: ` +
                    `${maps.map((map) => map.id).join(", ")}.`,
            },
        };
    }

    if (!WORKFLOW_DIMENSIONS.includes(chosen.dimension)) {
        return {
            ok: false,
            failure: {
                code: "unsupported-dimension",
                message:
                    `The map ${chosen.id} renders ${chosen.dimension}, and ${RENDER_WORKFLOW_FILE} ` +
                    `only offers ${WORKFLOW_DIMENSIONS.join(", ")}. A CI render cannot start for it; ` +
                    "render that dimension on this computer instead.",
            },
        };
    }

    return { ok: true, map: chosen };
}

export interface PlanInput {
    readonly project: ProjectFile;
    /** Which map to render. Omitted, the project's first enabled map is taken. */
    readonly mapId?: string | undefined;
    /** The release the world was uploaded to. */
    readonly releaseTag: string;
    /** The asset on it, exactly - never a glob. */
    readonly assetName: string;
    readonly budgetMinutes?: number | undefined;
    readonly maxJobs?: number | undefined;
    readonly output?: CiRenderOutput | undefined;
}

/**
 * The plan, or a refusal naming what is missing.
 *
 * `world` is built as `<tag>/<asset>` with the asset's **exact** name rather than a glob.
 * The workflow splits that string on its last slash and a release asset's file name
 * cannot contain one, so the split is unambiguous. A glob would be a second way to pick
 * the wrong asset off a release that holds several - and a backup release holds three:
 * the archive, its Cheap LFS pointer and its sidecar.
 */
export function planCiRender(input: PlanInput): CiPlanResult {
    const picked = chooseProjectMap(input.project, input.mapId);
    if (!picked.ok) return { ok: false, failure: picked.failure };
    const chosen = picked.map;

    const budget = positiveInteger(input.budgetMinutes, DEFAULT_BUDGET_MINUTES);
    const maxJobs = positiveInteger(input.maxJobs, DEFAULT_MAX_JOBS);

    return {
        ok: true,
        plan: {
            mapId: chosen.id,
            mapName: chosen.name,
            dimension: chosen.dimension,
            notCarried: settingsTheWorkflowCannotSee(chosen),
            inputs: {
                "world-source": "release-asset",
                world: `${input.releaseTag}/${input.assetName}`,
                dimension: chosen.dimension,
                "map-id": chosen.id,
                "map-name": chosen.name,
                output: input.output ?? "artifact",
                "budget-minutes": String(budget),
                "max-jobs": String(maxJobs),
                "force-shards": "",
            },
        },
    };
}

function positiveInteger(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : fallback;
}

/**
 * The top-level keys of a map's HOCON, minus the two the workflow does carry.
 *
 * A deliberately shallow read: top-level `key:`, `key =` and `key {` lines, with comments
 * and blank lines dropped. It is approximate, and it is allowed to be, because nothing
 * decides anything from it - it exists so a person can be told "these settings will not
 * travel" instead of finding out from the picture that came back. A parse that missed a
 * key would understate the warning, which is why the doc says the whole map config is
 * left behind rather than relying on this list being complete.
 */
export function settingsTheWorkflowCannotSee(map: ProjectMap): readonly string[] {
    const carried = new Set(["world", "dimension", "name", "sorting"]);
    const found = new Set<string>();
    // Brace depth, so a nested `value:` inside `min-inhabited-time { ... }` is part of
    // that setting rather than a setting of its own. Counting braces is enough because
    // HOCON's own nesting is what is being tracked, not string contents - and a `{` inside
    // a quoted value would only ever over-count depth, which hides a key rather than
    // inventing one.
    let depth = 0;
    for (const line of map.config.split(/\r?\n/)) {
        const trimmed = line.trim();
        const opens = (trimmed.match(/\{/g) ?? []).length;
        const closes = (trimmed.match(/\}/g) ?? []).length;
        if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("//")) {
            depth += opens - closes;
            continue;
        }
        if (depth === 0) {
            const match = /^"?([A-Za-z][\w-]*)"?\s*[:={]/.exec(trimmed);
            const key = match?.[1];
            if (key !== undefined && !carried.has(key)) found.add(key);
        }
        depth = Math.max(0, depth + opens - closes);
    }
    return [...found].sort();
}
