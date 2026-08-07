import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The project file is deliberately bundled inside every world archive the app uploads. */
export const PROJECT_FILE_NAME = "material-bluemap.project.json";

export interface ProjectMapConfigResult {
    readonly source: "project" | "defaults";
    readonly config: string | null;
    readonly reason: string;
}

/**
 * Finds the selected map's complete HOCON in the project carried by the world archive.
 *
 * A missing project is the supported manual-workflow case and uses the workflow defaults.
 * A present-but-malformed project is refused: silently falling back there would take a map
 * whose settings were explicitly supplied and render a visually different one.
 */
export async function readProjectMapConfig(
    worldDirectory: string,
    mapId: string,
): Promise<ProjectMapConfigResult> {
    const path = join(worldDirectory, PROJECT_FILE_NAME);
    let text: string;
    try {
        text = await readFile(path, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return {
                source: "defaults",
                config: null,
                reason: `${PROJECT_FILE_NAME} is absent; this is a manual workflow render using the documented defaults.`,
            };
        }
        throw new Error(
            `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path} is not a project object.`);
    }
    const version = (raw as { version?: unknown }).version;
    if (typeof version === "number" && version > 1) {
        throw new Error(
            `${path} uses project format ${String(version)}, which this workflow cannot read.`,
        );
    }

    const maps = (raw as { maps?: unknown }).maps;
    if (!Array.isArray(maps)) throw new Error(`${path} has no maps list.`);
    const selected = maps.find(
        (candidate): candidate is { id: string; config: string } =>
            typeof candidate === "object" &&
            candidate !== null &&
            !Array.isArray(candidate) &&
            (candidate as { id?: unknown }).id === mapId &&
            typeof (candidate as { config?: unknown }).config === "string",
    );
    if (selected === undefined) {
        throw new Error(`${path} does not carry complete configuration for map ${mapId}.`);
    }

    return {
        source: "project",
        config: selected.config,
        reason: `Loaded the complete maps/${mapId}.conf body from ${PROJECT_FILE_NAME}.`,
    };
}
