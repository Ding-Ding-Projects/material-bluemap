#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { writeShardConfig } from "./config/renderConfig.js";
import { mergeShardMaps, MergeError, type MergeReport } from "./merge/mergeMap.js";
import { verifyMerge } from "./merge/verify.js";
import { formatDuration } from "./plan/estimate.js";
import { planShards, validatePlanAlignment, type ShardPlan } from "./plan/plan.js";
import { measureWorld } from "./world/measure.js";
import { locateWorld, WorldValidationError } from "./world/validate.js";
import { LOD_COUNT, LOD_FACTOR, LOWRES_TILE_SIZE } from "./bluemap.js";

const USAGE = `material-bluemap render-actions

Plans, configures, merges and verifies a BlueMap render that is split across parallel
GitHub Actions jobs. The workflow calls these commands; the logic lives here so it can
be tested without starting a runner.

Commands:
  plan      measure a world, decide how many jobs it needs, write the shard plan
  config    write the BlueMap config directory one shard renders with
  merge     combine the shards' map directories into one map
  verify    prove the merged map lost and duplicated nothing

Run "<command> --help" for the options of each.
`;

const PLAN_USAGE = `plan --world <dir> --out <plan.json> [options]

  --world <dir>          the world save folder, or a directory containing one
  --dimension <key>      minecraft:overworld (default), minecraft:the_nether, ...
  --map-id <id>          storage id of the map (default "world")
  --out <path>           where to write the plan json (default "shard-plan.json")
  --budget-minutes <n>   rendering minutes one job may spend (default 240)
  --max-jobs <n>         cap on matrix jobs, never above 256 (default 256)
  --rate <n>             measured chunks per second, skipping the estimate
  --force-shards <n>     use this many shards regardless of the estimate
  --github-output <path> also write shard-ids/shard-count/needs-merge for Actions
  --summary <path>       append a markdown decision summary here
`;

const CONFIG_USAGE = `config --plan <plan.json> --shard <id> [options]

  --plan <path>          the plan written by "plan"
  --shard <id>           shard id, or "all" for an unsharded whole-world render
  --world <dir>          the world save folder
  --config-dir <dir>     where the BlueMap config files go (default "bluemap-config")
  --data-dir <dir>       BlueMap's runtime data directory (default "bluemap-data")
  --storage-root <dir>   the map storage root (default "bluemap-out/maps")
  --web-root <dir>       the webapp webroot (default "bluemap-out")
  --map-name <str>       display name of the map (default the map id)
  --threads <n>          render threads (default 4, matching a standard runner)
  --accept-download <b>  allow the Minecraft client download (default true)
  --github-output <path> also write map-dir and config-dir for Actions
`;

const MERGE_USAGE = `merge --shards <dir> --out <dir> [options]

  --shards <dir>         directory holding one subdirectory per downloaded shard artifact
  --shard-dir <dir>      an explicit shard map directory; repeatable, overrides --shards
  --plan <path>          the plan, used for the lowres layout constants
  --out <dir>            the merged map directory to write
  --map-id <id>          map id, used to find each shard's map directory
  --summary <path>       append a markdown merge summary here
`;

const VERIFY_USAGE = `verify --plan <plan.json> --shards <dir> --merged <dir> [options]

  --plan <path>          the plan written by "plan"
  --shards <dir>         the same shard directory the merge read
  --shard-dir <dir>      an explicit shard map directory; repeatable
  --merged <dir>         the merged map directory
  --map-id <id>          map id, used to find each shard's map directory
  --summary <path>       append a markdown verification summary here
`;

interface Args {
    flags: Map<string, string>;
    repeated: Map<string, string[]>;
    booleans: Set<string>;
}

function parseArgs(argv: readonly string[]): Args {
    const flags = new Map<string, string>();
    const repeated = new Map<string, string[]>();
    const booleans = new Set<string>();

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]!;
        if (!arg.startsWith("--")) continue;
        const name = arg.slice(2);
        const next = argv[index + 1];

        if (next === undefined || next.startsWith("--")) {
            booleans.add(name);
            continue;
        }

        flags.set(name, next);
        const bucket = repeated.get(name);
        if (bucket === undefined) repeated.set(name, [next]);
        else bucket.push(next);
        index++;
    }

    return { flags, repeated, booleans };
}

function required(args: Args, name: string, usage: string): string {
    const value = args.flags.get(name);
    if (value === undefined) {
        process.stderr.write("Missing required option --" + name + "\n\n" + usage);
        process.exit(2);
    }
    return value;
}

function optionalNumber(args: Args, name: string): number | undefined {
    const raw = args.flags.get(name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("--" + name + " must be a number, got " + raw);
    return value;
}

function optionalBoolean(args: Args, name: string, fallback: boolean): boolean {
    if (args.booleans.has(name)) return true;
    const raw = args.flags.get(name);
    if (raw === undefined) return fallback;
    return !/^(false|0|no|off)$/i.test(raw.trim());
}

async function writeGithubOutput(path: string | undefined, values: [string, string][]): Promise<void> {
    if (path === undefined) return;
    await mkdir(dirname(resolve(path)), { recursive: true });
    const lines = values.map(([key, value]) =>
        value.includes("\n")
            ? key + "<<__EOF__\n" + value + "\n__EOF__"
            : key + "=" + value,
    );
    await appendFile(path, lines.join("\n") + "\n", "utf8");
}

async function appendSummary(path: string | undefined, markdown: string): Promise<void> {
    if (path === undefined) return;
    await mkdir(dirname(resolve(path)), { recursive: true });
    await appendFile(path, markdown + "\n", "utf8");
}

async function readPlan(path: string): Promise<ShardPlan> {
    return JSON.parse(await readFile(path, "utf8")) as ShardPlan;
}

/** The shard map directories, either listed explicitly or derived from a parent directory. */
async function resolveShardDirectories(args: Args, mapId: string): Promise<string[]> {
    const explicit = args.repeated.get("shard-dir");
    if (explicit !== undefined && explicit.length > 0) return explicit.map((path) => resolve(path));

    const parent = args.flags.get("shards");
    if (parent === undefined) throw new Error("Give either --shards <dir> or one or more --shard-dir <dir>");

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(resolve(parent), { withFileTypes: true });
    const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        // shard-0, shard-1, shard-10 must order as 0, 1, 10 and not 0, 10, 1
        .sort((a, b) => shardOrdinal(a) - shardOrdinal(b) || (a < b ? -1 : 1))
        .map((name) => resolve(parent, name, mapId));

    if (directories.length === 0)
        throw new Error("No shard directories were found under " + resolve(parent));
    return directories;
}

function shardOrdinal(name: string): number {
    const match = /(\d+)\s*$/.exec(name);
    return match === null ? Number.MAX_SAFE_INTEGER : Number.parseInt(match[1]!, 10);
}

async function commandPlan(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(PLAN_USAGE);
        return 0;
    }

    const worldInput = resolve(required(args, "world", PLAN_USAGE));
    const dimension = args.flags.get("dimension") ?? "minecraft:overworld";
    const mapId = args.flags.get("map-id") ?? "world";
    const outPath = resolve(args.flags.get("out") ?? "shard-plan.json");
    const budgetMinutes = optionalNumber(args, "budget-minutes") ?? 240;

    const location = await locateWorld(worldInput, dimension);
    process.stderr.write(
        "World: " +
            location.worldDirectory +
            "\nRegion files: " +
            location.regionFileCount +
            " in " +
            location.regionDirectory +
            "\n",
    );

    const measurement = await measureWorld(location.regionDirectory, dimension);
    const plan = planShards(measurement, {
        mapId,
        budgetSeconds: budgetMinutes * 60,
        maxJobs: optionalNumber(args, "max-jobs"),
        measuredChunksPerSecond: optionalNumber(args, "rate"),
        forceShards: optionalNumber(args, "force-shards"),
        lowresTileSize: LOWRES_TILE_SIZE,
        lodFactor: LOD_FACTOR,
        lodCount: LOD_COUNT,
    });

    const alignment = validatePlanAlignment(plan);
    if (alignment.length > 0) {
        process.stderr.write(
            "The shard plan is not aligned to the hires tile grid, which would corrupt the" +
                " merge:\n" +
                alignment.map((line) => "  - " + line).join("\n") +
                "\n",
        );
        return 1;
    }

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(plan, null, 2) + "\n", "utf8");

    for (const line of plan.decision) process.stderr.write(line + "\n");
    process.stderr.write(
        "Shard plan written to " + outPath + " (" + plan.shards.length + " jobs)\n",
    );

    const shardIds = plan.shards.map((shard) => shard.id);
    await writeGithubOutput(args.flags.get("github-output"), [
        ["shard-ids", JSON.stringify(shardIds)],
        ["shard-count", String(plan.shards.length)],
        ["needs-merge", plan.shards.length > 1 ? "true" : "false"],
        ["world-dir", location.worldDirectory],
        ["region-dir", location.regionDirectory],
        ["chunk-count", String(measurement.chunkCount)],
        ["estimated-seconds", String(Math.round(plan.estimate.seconds))],
    ]);

    await appendSummary(args.flags.get("summary"), planSummary(plan, location.worldDirectory));
    process.stdout.write(JSON.stringify({ shardIds, shardCount: plan.shards.length }) + "\n");
    return 0;
}

function planSummary(plan: ShardPlan, worldDirectory: string): string {
    const rows = plan.shards
        .map(
            (shard) =>
                "| " +
                shard.id +
                " | " +
                describeRange(shard.bounds.x) +
                " | " +
                describeRange(shard.bounds.z) +
                " | " +
                shard.chunkCount.toLocaleString("en-US") +
                " | " +
                formatDuration(shard.estimatedSeconds) +
                " |",
        )
        .join("\n");

    return [
        "## Render plan",
        "",
        "World: `" + worldDirectory + "`, dimension `" + plan.dimension + "`, map id `" + plan.mapId + "`.",
        "",
        ...plan.decision.map((line) => "- " + line),
        "",
        "This workflow accepts [Mojang's EULA](https://www.minecraft.net/eula) on behalf of the" +
            " repository owner: BlueMap downloads the Minecraft client jar to texture the map and" +
            " cannot render without it. Set the repository variable `BLUEMAP_ACCEPT_DOWNLOAD` to" +
            " `false` to turn that off.",
        "",
        "| Shard | Blocks x | Blocks z | Chunks | Estimate |",
        "| ---: | --- | --- | ---: | --- |",
        rows,
        "",
    ].join("\n");
}

function describeRange(range: { min: number | null; max: number | null }): string {
    const low = range.min === null ? "..." : String(range.min);
    const high = range.max === null ? "..." : String(range.max);
    return low + " to " + high;
}

async function commandConfig(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(CONFIG_USAGE);
        return 0;
    }

    const plan = await readPlan(resolve(required(args, "plan", CONFIG_USAGE)));
    const rawShard = required(args, "shard", CONFIG_USAGE);
    const worldInput = resolve(required(args, "world", CONFIG_USAGE));

    const shard =
        rawShard === "all"
            ? null
            : (plan.shards.find((candidate) => candidate.id === Number(rawShard)) ?? null);

    if (rawShard !== "all" && shard === null)
        throw new Error("The plan has no shard with id " + rawShard);

    const location = await locateWorld(worldInput, plan.dimension);
    const written = await writeShardConfig({
        plan,
        shard,
        worldDirectory: location.worldDirectory,
        configDirectory: args.flags.get("config-dir") ?? "bluemap-config",
        dataDirectory: args.flags.get("data-dir") ?? "bluemap-data",
        storageRoot: args.flags.get("storage-root") ?? "bluemap-out/maps",
        webRoot: args.flags.get("web-root") ?? "bluemap-out",
        mapName: args.flags.get("map-name") ?? plan.mapId,
        acceptDownload: optionalBoolean(args, "accept-download", true),
        renderThreadCount: optionalNumber(args, "threads") ?? 4,
    });

    process.stderr.write(
        "Wrote " +
            written.files.length +
            " config files to " +
            written.configDirectory +
            "; the map will land in " +
            written.mapDirectory +
            "\n",
    );

    await writeGithubOutput(args.flags.get("github-output"), [
        ["config-dir", written.configDirectory],
        ["map-dir", written.mapDirectory],
        ["world-dir", location.worldDirectory],
    ]);

    process.stdout.write(JSON.stringify(written) + "\n");
    return 0;
}

async function commandMerge(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(MERGE_USAGE);
        return 0;
    }

    const planPath = args.flags.get("plan");
    const plan = planPath === undefined ? null : await readPlan(resolve(planPath));
    const mapId = args.flags.get("map-id") ?? plan?.mapId ?? "world";
    const outputDirectory = resolve(required(args, "out", MERGE_USAGE));
    const shardMapDirectories = await resolveShardDirectories(args, mapId);

    process.stderr.write(
        "Merging " + shardMapDirectories.length + " shards into " + outputDirectory + "\n",
    );

    const report = await mergeShardMaps({
        shardMapDirectories,
        outputDirectory,
        lowresTileSize: plan?.layout.lowresTileSize,
        lodFactor: plan?.layout.lodFactor,
        lodCount: plan?.layout.lodCount,
    });

    process.stderr.write(
        "Merged " +
            report.hires.merged +
            " hires tiles (" +
            report.hires.perShard.join(" + ") +
            "), composited " +
            report.lowres.lod1TilesComposited +
            " of " +
            report.lowres.lod1Tiles +
            " lod-1 tiles, rebuilt " +
            report.lowres.rebuiltLods.map((entry) => "lod " + entry.lod + ": " + entry.tiles).join(", ") +
            "\n",
    );

    await appendSummary(args.flags.get("summary"), mergeSummary(report));
    process.stdout.write(JSON.stringify(report) + "\n");
    return 0;
}

function mergeSummary(report: MergeReport): string {
    return [
        "## Merge",
        "",
        "| What | Result |",
        "| --- | --- |",
        "| Shards merged | " + report.shardCount + " |",
        "| Texture gallery | identical across every shard, sha256 `" +
            report.texturesSha256.slice(0, 16) +
            "` |",
        "| Hires tiles | " + report.hires.perShard.join(" + ") + " = " + report.hires.merged + " |",
        "| Hires path collisions | " + report.hires.collisions.length + " |",
        "| Lod 1 tiles | " +
            report.lowres.lod1Tiles +
            " (" +
            report.lowres.lod1TilesComposited +
            " composited from more than one shard) |",
        "| Lod 1 erasures overruled | " + report.lowres.overruledErasures.toLocaleString("en-US") + " |",
        "| Lod 1 pixel conflicts | " + report.lowres.conflictingPixels + " |",
        "| Rebuilt lods | " +
            (report.lowres.rebuiltLods.length === 0
                ? "none"
                : report.lowres.rebuiltLods
                      .map((entry) => "lod " + entry.lod + ": " + entry.tiles + " tiles")
                      .join(", ")) +
            " |",
        "",
        ...report.notes.map((note) => "- " + note),
        "",
    ].join("\n");
}

async function commandVerify(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(VERIFY_USAGE);
        return 0;
    }

    const plan = await readPlan(resolve(required(args, "plan", VERIFY_USAGE)));
    const mapId = args.flags.get("map-id") ?? plan.mapId;
    const mergedDirectory = resolve(required(args, "merged", VERIFY_USAGE));
    const shardMapDirectories = await resolveShardDirectories(args, mapId);

    const report = await verifyMerge({ plan, shardMapDirectories, mergedDirectory });

    for (const check of report.checks)
        process.stderr.write((check.ok ? "ok   " : "FAIL ") + check.name + ": " + check.detail + "\n");

    await appendSummary(
        args.flags.get("summary"),
        [
            "## Verification",
            "",
            "| Check | Result | Detail |",
            "| --- | --- | --- |",
            ...report.checks.map(
                (check) =>
                    "| " + check.name + " | " + (check.ok ? "pass" : "FAIL") + " | " + check.detail + " |",
            ),
            "",
        ].join("\n"),
    );

    process.stdout.write(JSON.stringify(report) + "\n");
    return report.ok ? 0 : 1;
}

async function main(argv: readonly string[]): Promise<number> {
    const command = argv[0];
    const args = parseArgs(argv.slice(1));

    switch (command) {
        case "plan":
            return await commandPlan(args);
        case "config":
            return await commandConfig(args);
        case "merge":
            return await commandMerge(args);
        case "verify":
            return await commandVerify(args);
        case "--help":
        case "-h":
        case undefined:
            process.stdout.write(USAGE);
            return command === undefined ? 2 : 0;
        default:
            process.stderr.write("Unknown command: " + command + "\n\n" + USAGE);
            return 2;
    }
}

main(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error: unknown) => {
        if (error instanceof MergeError || error instanceof WorldValidationError)
            process.stderr.write(error.message + "\n");
        else process.stderr.write(String(error instanceof Error ? error.stack ?? error.message : error) + "\n");
        process.exitCode = 1;
    });
