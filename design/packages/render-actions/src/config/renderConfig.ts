import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BlockRange } from "../bluemap.js";
import type { Shard, ShardPlan } from "../plan/plan.js";

/**
 * Writes the BlueMap CLI configuration directory one shard renders with.
 *
 * Two things here are load-bearing and are easy to get wrong:
 *
 * 1. Every path is absolute. The CLI resolves its data directory and its storage root
 *    against the process working directory, not against the configuration folder, so a
 *    relative path silently puts the output somewhere other than where the workflow
 *    then looks for it.
 *
 * 2. `render-edges` is false. With it on, BlueMap treats every block outside the
 *    render-mask as air, which is the right behaviour for someone deliberately cutting
 *    a slice out of a world and the wrong behaviour for a shard: the blocks on the far
 *    side of the cut are real, another shard is rendering them, and pretending they are
 *    air changes the lighting of the tiles along this shard's edge. With it off the mask
 *    only decides which columns get rendered, and a shard's tiles come out byte for byte
 *    identical to the same tiles from an unsharded render.
 */

export interface ShardConfigOptions {
    plan: ShardPlan;
    shard: Shard | null;
    /** absolute path of the world save folder */
    worldDirectory: string;
    /** directory the config files are written into */
    configDirectory: string;
    /** BlueMap's runtime data directory, which is where the client jar is cached */
    dataDirectory: string;
    /** the storage root; the map lands in `<storageRoot>/<mapId>` */
    storageRoot: string;
    /** the webapp webroot */
    webRoot: string;
    /** display name of the map in the webapp */
    mapName: string;
    /**
     * Whether BlueMap may download the Minecraft client jar from Mojang, which it needs
     * in order to texture anything at all.
     *
     * This repository's owner has already accepted Mojang's EULA
     * (https://www.minecraft.net/eula) in the desktop application, so the workflow turns
     * this on by default and renders without asking again. A fork can set the repository
     * variable `BLUEMAP_ACCEPT_DOWNLOAD` to `false`, which lands here as false and makes
     * BlueMap refuse to download rather than accept a licence on the fork owner's behalf.
     */
    acceptDownload: boolean;
    renderThreadCount: number;
}

export interface WrittenShardConfig {
    configDirectory: string;
    /** where this shard's map output will appear */
    mapDirectory: string;
    files: string[];
}

/** HOCON string escaping. Windows paths are full of backslashes; the tests run on Windows. */
export function quoteConfigString(value: string): string {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

/** Renders one `{ min-x: .., max-x: .. }` mask entry, omitting the unbounded sides. */
export function renderMaskEntry(bounds: { x: BlockRange; z: BlockRange }): string | null {
    const lines: string[] = [];
    if (bounds.x.min !== null) lines.push("    min-x: " + bounds.x.min);
    if (bounds.x.max !== null) lines.push("    max-x: " + bounds.x.max);
    if (bounds.z.min !== null) lines.push("    min-z: " + bounds.z.min);
    if (bounds.z.max !== null) lines.push("    max-z: " + bounds.z.max);
    if (lines.length === 0) return null;
    return "render-mask: [\n  {\n" + lines.join("\n") + "\n  }\n]";
}

export async function writeShardConfig(
    options: ShardConfigOptions,
): Promise<WrittenShardConfig> {
    const configDirectory = resolve(options.configDirectory);
    const dataDirectory = resolve(options.dataDirectory);
    const storageRoot = resolve(options.storageRoot);
    const webRoot = resolve(options.webRoot);
    const worldDirectory = resolve(options.worldDirectory);

    await mkdir(join(configDirectory, "maps"), { recursive: true });
    await mkdir(join(configDirectory, "storages"), { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await mkdir(storageRoot, { recursive: true });
    await mkdir(webRoot, { recursive: true });

    const shardLabel =
        options.shard === null ? "the whole world" : "shard " + options.shard.id;

    const core = [
        "# Written by @material-bluemap/render-actions for " + shardLabel + ".",
        "# accept-download is on because the repository owner has already accepted Mojang's EULA",
        "# (https://www.minecraft.net/eula); BlueMap cannot texture a map without the client jar.",
        "# A fork turns it off with the BLUEMAP_ACCEPT_DOWNLOAD repository variable.",
        "accept-download: " + (options.acceptDownload ? "true" : "false"),
        "data: " + quoteConfigString(dataDirectory),
        "render-thread-count: " + options.renderThreadCount,
        "update-cooldown: 60",
        "full-update-interval: 0",
        "scan-for-mod-resources: true",
        "metrics: false",
        "log: { append: false }",
        "",
    ].join("\n");

    const storage = [
        "storage-type: file",
        "root: " + quoteConfigString(storageRoot),
        "compression: gzip",
        "",
    ].join("\n");

    const webapp = [
        "enabled: true",
        "webroot: " + quoteConfigString(webRoot),
        "update-settings-file: true",
        "",
    ].join("\n");

    const webserver = [
        "# No webserver: this render is a batch job, not a running service.",
        "enabled: false",
        "webroot: " + quoteConfigString(webRoot),
        "port: 8100",
        "",
    ].join("\n");

    const mask = options.shard === null ? null : renderMaskEntry(options.shard.bounds);

    const map = [
        "# Written by @material-bluemap/render-actions for " + shardLabel + ".",
        "world: " + quoteConfigString(worldDirectory),
        "dimension: " + quoteConfigString(options.plan.dimension),
        "name: " + quoteConfigString(options.mapName),
        "sorting: 0",
        "start-pos: { x: 0, z: 0 }",
        'sky-color: "#7dabff"',
        'void-color: "#000000"',
        "sky-light: 1",
        "ambient-light: 0",
        "remove-caves-below-y: 55",
        "cave-detection-ocean-floor: -5",
        "cave-detection-uses-block-light: false",
        "min-inhabited-time: 0",
        ...(mask === null
            ? ["# No render-mask: this job renders the whole world."]
            : [
                  "# This shard's slice. The edges sit on hires tile boundaries (the hires grid is",
                  "# 32 blocks with an offset of 2), so no tile is ever half-rendered by two shards.",
                  mask,
              ]),
        "",
        "# False on purpose. See renderConfig.ts: with edges on, the blocks another shard owns",
        "# would be treated as air and this shard's edge tiles would be lit differently from the",
        "# same tiles in an unsharded render.",
        "render-edges: false",
        "edge-light-strength: 8",
        "enable-perspective-view: true",
        "enable-flat-view: true",
        "enable-free-flight-view: true",
        "enable-hires: true",
        'storage: "file"',
        "ignore-missing-light-data: false",
        "marker-sets: {}",
        "",
    ].join("\n");

    const files: [string, string][] = [
        [join(configDirectory, "core.conf"), core],
        [join(configDirectory, "webapp.conf"), webapp],
        [join(configDirectory, "webserver.conf"), webserver],
        [join(configDirectory, "storages", "file.conf"), storage],
        [join(configDirectory, "maps", options.plan.mapId + ".conf"), map],
    ];

    for (const [path, contents] of files) await writeFile(path, contents, "utf8");

    return {
        configDirectory,
        mapDirectory: join(storageRoot, options.plan.mapId),
        files: files.map(([path]) => path),
    };
}
