import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { hiresTileMaxBlock, hiresTileMinBlock, type BlockRange } from "../bluemap.js";
import type { ShardPlan } from "../plan/plan.js";
import { exists, listFiles } from "./files.js";
import { parseGridCellPath } from "./gridPath.js";

/**
 * Proving the merged map is the map, rather than assuming it because nothing threw.
 *
 * The failure this guards against does not announce itself: a lost tile is a hole in
 * the terrain that only somebody looking at that spot will notice, and a duplicated one
 * is invisible until the wrong half wins. So the checks here are counts and structure,
 * and every one of them is reported with its numbers rather than as a pass mark.
 */

/** upstream: `PRBMWriter` — version byte then the format-info byte. */
const PRBM_FORMAT_VERSION = 1;
const PRBM_HEADER_BITS = 0b0_0_0_00111;

export interface VerifyOptions {
    plan: ShardPlan;
    /** each shard's map directory, in shard-id order */
    shardMapDirectories: string[];
    /** the merged map directory */
    mergedDirectory: string;
    /** how many boundary tiles to decompress and structurally check per shard edge */
    boundarySamplesPerEdge?: number | undefined;
}

export interface VerifyReport {
    ok: boolean;
    checks: VerifyCheck[];
}

export interface VerifyCheck {
    name: string;
    ok: boolean;
    detail: string;
}

export async function verifyMerge(options: VerifyOptions): Promise<VerifyReport> {
    const checks: VerifyCheck[] = [];
    const merged = options.mergedDirectory;
    const samplesPerEdge = options.boundarySamplesPerEdge ?? 4;

    // --- hires tiles: none lost, none duplicated ---
    const shardHires: Map<string, string>[] = [];
    for (const directory of options.shardMapDirectories)
        shardHires.push(await listFiles(join(directory, "tiles", "0")));

    const expected = new Set<string>();
    const duplicated: string[] = [];
    for (const files of shardHires)
        for (const relativePath of files.keys()) {
            if (expected.has(relativePath)) duplicated.push(relativePath);
            expected.add(relativePath);
        }

    const mergedHires = await listFiles(join(merged, "tiles", "0"));
    const missing = [...expected].filter((path) => !mergedHires.has(path));
    const unexpected = [...mergedHires.keys()].filter((path) => !expected.has(path));
    const shardTotal = shardHires.reduce((sum, files) => sum + files.size, 0);

    checks.push({
        name: "hires tiles are a disjoint union",
        ok: duplicated.length === 0,
        detail:
            duplicated.length === 0
                ? "no hires tile path was produced by more than one shard"
                : duplicated.length +
                  " tile paths were produced by more than one shard, first " +
                  duplicated[0],
    });

    checks.push({
        name: "hires tile count",
        ok: shardTotal === mergedHires.size && missing.length === 0 && unexpected.length === 0,
        detail:
            "shards produced " +
            shardHires.map((files) => files.size).join(" + ") +
            " = " +
            shardTotal +
            " tiles, merged map holds " +
            mergedHires.size +
            "; " +
            missing.length +
            " missing, " +
            unexpected.length +
            " unexpected",
    });

    // --- hires tile bytes are unchanged by the merge ---
    let byteMismatches = 0;
    let checkedBytes = 0;
    for (const files of shardHires)
        for (const [relativePath, absolutePath] of files) {
            const target = mergedHires.get(relativePath);
            if (target === undefined) continue;
            checkedBytes++;
            const source = await readFile(absolutePath);
            const destination = await readFile(target);
            if (!source.equals(destination)) byteMismatches++;
        }

    checks.push({
        name: "hires tiles copied without alteration",
        ok: byteMismatches === 0,
        detail: checkedBytes + " tiles compared byte for byte, " + byteMismatches + " differ",
    });

    // --- boundary tiles decompress and look like PRBM models ---
    const boundaryTiles = selectBoundaryTiles(options.plan, mergedHires, samplesPerEdge);
    const boundaryProblems: string[] = [];
    for (const relativePath of boundaryTiles) {
        const path = mergedHires.get(relativePath);
        if (path === undefined) {
            boundaryProblems.push(relativePath + " is missing");
            continue;
        }
        try {
            const model = gunzipSync(await readFile(path));
            if (model.length < 8) {
                boundaryProblems.push(relativePath + " decompressed to " + model.length + " bytes");
                continue;
            }
            if (model[0] !== PRBM_FORMAT_VERSION || model[1] !== PRBM_HEADER_BITS)
                boundaryProblems.push(
                    relativePath +
                        " has PRBM header bytes " +
                        model[0] +
                        "," +
                        model[1] +
                        " instead of " +
                        PRBM_FORMAT_VERSION +
                        "," +
                        PRBM_HEADER_BITS,
                );
        } catch {
            boundaryProblems.push(relativePath + " failed to decompress");
        }
    }

    checks.push({
        name: "shard-boundary tiles decompress and parse",
        ok: boundaryProblems.length === 0,
        detail:
            boundaryTiles.length === 0
                ? "no shard boundaries to sample (single-shard render)"
                : boundaryTiles.length +
                  " tiles beside shard edges gunzipped and checked for a PRBM header; " +
                  boundaryProblems.length +
                  " problems" +
                  (boundaryProblems.length > 0 ? ": " + boundaryProblems.slice(0, 3).join("; ") : ""),
    });

    // --- the files the webapp needs are present ---
    const required = ["settings.json"];
    const requiredPresent: string[] = [];
    const requiredMissing: string[] = [];
    for (const name of required)
        ((await exists(join(merged, name))) ? requiredPresent : requiredMissing).push(name);

    const hasTextures =
        (await exists(join(merged, "textures.json.gz"))) ||
        (await exists(join(merged, "textures.json")));
    if (hasTextures) requiredPresent.push("textures.json");
    else requiredMissing.push("textures.json");

    checks.push({
        name: "map metadata present",
        ok: requiredMissing.length === 0,
        detail:
            requiredMissing.length === 0
                ? requiredPresent.join(", ") + " all present"
                : "missing " + requiredMissing.join(", "),
    });

    // --- every lod the map settings promise actually exists ---
    const lodDetails: string[] = [];
    let lodOk = true;
    for (let lod = 1; lod <= options.plan.layout.lodCount; lod++) {
        const files = await listFiles(join(merged, "tiles", String(lod)));
        lodDetails.push("lod " + lod + ": " + files.size);
        if (files.size === 0 && mergedHires.size > 0) lodOk = false;
    }

    checks.push({
        name: "lowres pyramid built at every lod",
        ok: lodOk,
        detail: lodDetails.join(", "),
    });

    return { ok: checks.every((check) => check.ok), checks };
}

/**
 * Picks tiles that sit immediately beside a shard cut.
 *
 * These are the tiles a misaligned split would have damaged, so they are the ones worth
 * decompressing. A tile far from any cut tells you nothing a count has not already told
 * you.
 */
export function selectBoundaryTiles(
    plan: ShardPlan,
    mergedHires: Map<string, string>,
    perEdge: number,
): string[] {
    if (plan.shards.length < 2) return [];

    const cells = new Map<string, { x: number; z: number }>();
    for (const [relativePath] of mergedHires) {
        const cell = parseGridCellPath(relativePath, ".prbm.gz");
        if (cell !== null) cells.set(relativePath, cell);
    }

    const edgeColumns = new Set<number>();
    const edgeRows = new Set<number>();
    for (const shard of plan.shards) {
        collectEdges(shard.bounds.x, edgeColumns);
        collectEdges(shard.bounds.z, edgeRows);
    }

    const selected: string[] = [];
    const takenPerEdge = new Map<string, number>();

    for (const [relativePath, cell] of [...cells].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        const edgeName = edgeColumns.has(cell.x)
            ? "x" + cell.x
            : edgeRows.has(cell.z)
              ? "z" + cell.z
              : null;
        if (edgeName === null) continue;

        const taken = takenPerEdge.get(edgeName) ?? 0;
        if (taken >= perEdge) continue;
        takenPerEdge.set(edgeName, taken + 1);
        selected.push(relativePath);
    }

    return selected;
}

/** The hires tile columns that touch a shard's bounded edges, on either side of the cut. */
function collectEdges(range: BlockRange, into: Set<number>): void {
    if (range.min !== null) {
        const tile = tileContaining(range.min);
        into.add(tile);
        into.add(tile - 1);
    }
    if (range.max !== null) {
        const tile = tileContaining(range.max);
        into.add(tile);
        into.add(tile + 1);
    }
}

function tileContaining(block: number): number {
    let tile = Math.floor(block / 32);
    while (hiresTileMinBlock(tile) > block) tile--;
    while (hiresTileMaxBlock(tile) < block) tile++;
    return tile;
}
