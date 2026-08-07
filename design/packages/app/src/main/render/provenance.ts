/**
 * Which engine rendered a map.
 *
 * The README promises the app never switches renderer silently, and a promise nobody
 * can check is not a promise. Decisions D17 and D18 have two engines in the tree at
 * once: upstream BlueMap's Java CLI, which renders today, and the TypeScript mesher in
 * `packages/engine`, which will render once its output is byte-identical. During that
 * overlap the interesting question about a map on disk is not "is it rendered" but
 * "which of the two rendered it, and at what version", because that is what makes a
 * difference in output attributable rather than mysterious.
 *
 * So every render writes `render.json` beside its output, before it starts and again
 * when it ends. Written **before** deliberately: a record that only appears on success
 * cannot explain a workspace full of half-written tiles, which is exactly the workspace
 * somebody asks about.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RuntimeMode } from "../runtime/plan.js";

/** Bumped when the shape below changes incompatibly. */
export const RENDER_RECORD_VERSION = 1;

export type RenderEngineId = "upstream-java" | "typescript";

/**
 * What to call each engine on screen.
 *
 * Named for what they are rather than "old" and "new". A person reading "legacy engine"
 * beside their map would reasonably conclude it needs re-rendering, and today it is the
 * only engine that renders anything at all.
 */
export const RENDER_ENGINE_LABELS: Readonly<Record<RenderEngineId, string>> = {
    "upstream-java": "BlueMap engine (Java)",
    typescript: "Worldlens engine (TypeScript)",
};

export type RenderOutcome = "running" | "finished" | "failed" | "cancelled";

export interface RenderedMapRecord {
    readonly id: string;
    readonly name: string;
    readonly world: string;
    readonly dimension: string;
}

export interface RenderRecord {
    readonly recordVersion: number;
    readonly renderId: string;
    readonly engine: RenderEngineId;
    /**
     * The engine's own version. For the Java engine this is upstream's git-derived
     * version off the jar filename, e.g. `5.22-27`, which is the string that identifies
     * exactly which renderer produced these tiles.
     */
    readonly engineVersion: string;
    /** The jar that ran, absolute, so "which build was that" has an answer. */
    readonly enginePath: string | null;
    /** The JVM that ran it, e.g. `25.0.3`. Null for an engine that needs none. */
    readonly javaVersion: string | null;
    /**
     * Where the engine actually ran: as a program on this computer, or in a container.
     *
     * The same question as "which engine rendered this", asked of the other axis. Two
     * runtimes are one more way a difference in output can be attributable rather than
     * mysterious, so a reader who wonders whether the container path was really used has
     * a file to look at instead of a memory to trust.
     *
     * Optional **and** nullable, and both absences mean the same honest thing: this record
     * does not say. A record written before this field existed, or written by something
     * other than the orchestrator, is left unanswered rather than assumed local -
     * "rendered locally" is exactly the kind of confidently wrong answer the note above
     * refuses to invent. Bumping {@link RENDER_RECORD_VERSION} instead would have made
     * every render already on disk unreadable and dropped every existing map out of the
     * list, which is a far larger harm than one unanswered field.
     */
    readonly runtime?: RuntimeMode | null;
    readonly maps: readonly RenderedMapRecord[];
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly outcome: RenderOutcome;
    /** The failure code when it failed, so the record explains itself. */
    readonly failureCode: string | null;
    readonly durationMs: number | null;
    readonly appVersion: string | null;
}

/** A one-line description for an About or map-details surface. */
export function describeEngine(record: RenderRecord): string {
    const label = RENDER_ENGINE_LABELS[record.engine];
    const java = record.javaVersion === null ? "" : ` on Java ${record.javaVersion}`;
    return `${label} ${record.engineVersion}${java}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

/**
 * Reads a record back.
 *
 * A missing, unreadable or malformed file means "no record", never a guess at one. The
 * whole point of the file is to be able to say which engine rendered a map; inventing
 * an answer when the file is unreadable produces the one thing worse than not knowing,
 * which is confidently knowing wrong.
 */
export async function readRenderRecord(path: string): Promise<RenderRecord | null> {
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed.recordVersion !== RENDER_RECORD_VERSION) return null;

    const renderId = readString(parsed.renderId);
    const engine = readString(parsed.engine);
    const engineVersion = readString(parsed.engineVersion);
    const startedAt = readString(parsed.startedAt);
    if (renderId === null || engineVersion === null || startedAt === null) return null;
    if (engine !== "upstream-java" && engine !== "typescript") return null;

    const outcome = readString(parsed.outcome);
    const runtime = readRuntime(parsed.runtime);
    return {
        recordVersion: RENDER_RECORD_VERSION,
        renderId,
        engine,
        engineVersion,
        enginePath: readString(parsed.enginePath),
        javaVersion: readString(parsed.javaVersion),
        ...(runtime === undefined ? {} : { runtime }),
        maps: readMaps(parsed.maps),
        startedAt,
        finishedAt: readString(parsed.finishedAt),
        outcome: isOutcome(outcome) ? outcome : "failed",
        failureCode: readString(parsed.failureCode),
        durationMs: typeof parsed.durationMs === "number" ? parsed.durationMs : null,
        appVersion: readString(parsed.appVersion),
    };
}

/** Anything that is not one of the two known runtimes reads as "not recorded". */
function readRuntime(value: unknown): RuntimeMode | null | undefined {
    if (value === undefined) return undefined;
    return value === "local" || value === "docker" ? value : null;
}

function isOutcome(value: string | null): value is RenderOutcome {
    return (
        value === "running" || value === "finished" || value === "failed" || value === "cancelled"
    );
}

function readMaps(value: unknown): RenderedMapRecord[] {
    if (!Array.isArray(value)) return [];
    const maps: RenderedMapRecord[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const id = readString(entry.id);
        const world = readString(entry.world);
        if (id === null || world === null) continue;
        maps.push({
            id,
            world,
            name: readString(entry.name) ?? id,
            dimension: readString(entry.dimension) ?? "minecraft:overworld",
        });
    }
    return maps;
}

/**
 * Writes a record.
 *
 * Staged and renamed, so a crash halfway through a write cannot leave a file that
 * parses as a *different* answer than the one intended - which for this file would mean
 * attributing somebody's tiles to the wrong engine.
 */
export async function writeRenderRecord(path: string, record: RenderRecord): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const staging = `${path}.writing`;
    await writeFile(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    await rename(staging, path);
}
