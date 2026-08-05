/**
 * Resolves the resource pack and data pack a render needs, the way
 * `BlueMapService#getOrLoadResourcePack`/`getPackRoots` do.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/BlueMapService.java:297-397`
 *
 * upstream's real search order is:
 *
 *     packs folder -> extra/addon packs -> mods folder -> resourceExtensions.zip
 *     -> the vanilla client jar, appended last
 *
 * This port keeps the *shape* of that order — packs folder, then the client jar, appended
 * last as the lowest-priority fallback under everything above it — and is honest about
 * the two pieces it does not carry:
 *
 * - **`resourceExtensions.zip`** is BlueMap's own bundled pack (chest/banner/bed/sign
 *   overlay models and a `minecraft:directory` blocks-atlas source covering every texture
 *   namespace, not just `block/`). It has no port or bundled copy anywhere in this
 *   monorepo; `tools/oracle`'s own harness gets it from a *built java jar's* resources,
 *   which this standalone package does not carry. Its absence is the same accepted,
 *   already-documented gap the oracle harness's own `render-ts.mjs` operates under (see
 *   that file's doc comment) — not something invented for this CLI.
 * - **`-n`/`--mods`.** Upstream extracts bundled resource packs out of mod jars; this port
 *   accepts and validates the flag (the folder must exist) but does not scan it. See
 *   `config.ts`'s doc comment.
 *
 * The vanilla client jar itself IS real: `@material-bluemap/engine`'s `MinecraftVersion`
 * resolves the version manifest, downloads the jar with SHA-1 verification, and gates the
 * download behind exactly the `accept-download` consent core.conf documents — the same
 * class upstream's own `BlueMapService` calls.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DataPack, DirFileSystem, MinecraftVersion, PackVersion, ResourcePack, ZipFileSystem, type PackPath } from "@material-bluemap/engine";
import type { CoreConfig } from "@material-bluemap/config";
import type { Logger } from "./logger.js";

export interface ResolvedResources {
    readonly resourcePack: ResourcePack;
    readonly dataPack: DataPack;
    readonly minecraftVersion: string;
}

export interface ResolveResourcesOptions {
    readonly core: CoreConfig;
    readonly packsFolder: string;
    readonly dataFolder: string;
    readonly minecraftVersion: string | null;
    readonly logger: Logger;
}

/**
 * Roots contributed by the config's packs folder, lowest-effort first: every entry
 * directly inside it that is a directory (a pack laid out on disk) or ends `.zip`/`.jar`
 * (a packed one). Upstream resolves the same folder through `AddonLoader`'s pack registry;
 * this direct filesystem read is the part of that upstream does that has a real port.
 */
async function packsFolderRoots(packsFolder: string): Promise<PackPath[]> {
    const roots: PackPath[] = [];
    let entries;
    try {
        entries = await readdir(packsFolder, { withFileTypes: true });
    } catch {
        return roots;
    }
    for (const entry of entries) {
        const path = join(packsFolder, entry.name);
        if (entry.isDirectory()) {
            roots.push(new DirFileSystem(path).getRoot());
        } else if (entry.isFile() && (entry.name.endsWith(".zip") || entry.name.endsWith(".jar"))) {
            const fileSystem = await ZipFileSystem.openFile(path);
            roots.push(...fileSystem.getRootDirectories());
        }
    }
    return roots;
}

/**
 * Reads `version.json`'s `pack_version` off the first root that has one — the same field
 * `MinecraftVersion` itself resolves from inside the client jar it downloads, exposed here
 * for the case where every root is a caller-supplied pack directory instead.
 */
async function readPackVersionFromRoots(
    roots: readonly PackPath[],
): Promise<{ resource: PackVersion; data: PackVersion } | null> {
    for (const root of roots) {
        try {
            const file = root.resolve("version.json");
            if (!(await file.isRegularFile())) continue;
            const text = await file.readText();
            const parsed = JSON.parse(text) as {
                pack_version?: { resource_major?: number; resource_minor?: number; data_major?: number; data_minor?: number };
            };
            const packVersion = parsed.pack_version;
            if (typeof packVersion?.resource_major !== "number" || typeof packVersion.data_major !== "number") continue;
            return {
                resource: new PackVersion(packVersion.resource_major, packVersion.resource_minor ?? 0),
                data: new PackVersion(packVersion.data_major, packVersion.data_minor ?? 0),
            };
        } catch {
            // a root without a readable version.json simply does not answer
        }
    }
    return null;
}

export class MissingResourcesError extends Error {}

/**
 * Resolves resources for a render. Throws {@link MissingResourcesError} — never renders
 * with nothing — when `accept-download` is false and no local pack supplies a usable
 * `version.json`, exactly mirroring upstream's `MissingResourcesException` path (`BlueMapCLI
 * .main()` catches that specifically and exits 2 with the EULA-acceptance message).
 */
export async function resolveResources(options: ResolveResourcesOptions): Promise<ResolvedResources> {
    const { core, packsFolder, dataFolder, minecraftVersion, logger } = options;

    const roots = await packsFolderRoots(packsFolder);

    let jarVersion: MinecraftVersion | null = null;
    let jarError: unknown = null;
    try {
        jarVersion = await MinecraftVersion.load(minecraftVersion, dataFolder, core["accept-download"]);
    } catch (error) {
        jarError = error;
    }

    if (jarVersion !== null) {
        const resourceFs = await ZipFileSystem.openFile(jarVersion.getResourcePack());
        roots.push(...resourceFs.getRootDirectories());
        if (jarVersion.getDataPack() !== jarVersion.getResourcePack()) {
            const dataFs = await ZipFileSystem.openFile(jarVersion.getDataPack());
            roots.push(...dataFs.getRootDirectories());
        }
    } else if (roots.length === 0) {
        throw new MissingResourcesError(
            "BlueMap is missing important resources! You must accept the required file download in " +
                "order for BlueMap to work (set accept-download: true in core.conf), or provide a " +
                `resource pack yourself under ${packsFolder}.` +
                (jarError instanceof Error ? ` (${jarError.message})` : ""),
        );
    } else {
        logger.warn(
            `Could not resolve the Minecraft client jar (${jarError instanceof Error ? jarError.message : String(jarError)}); ` +
                "continuing with only the resources under the packs folder.",
        );
    }

    const packVersions = jarVersion !== null
        ? { resource: jarVersion.getResourcePackVersion(), data: jarVersion.getDataPackVersion() }
        : await readPackVersionFromRoots(roots);

    if (packVersions === null) {
        throw new MissingResourcesError(
            "No usable resources were found: none of the resolved pack roots carry a readable " +
                "version.json, so the resource-pack/data-pack format versions cannot be determined.",
        );
    }

    const dataPack = new DataPack(packVersions.data);
    await dataPack.loadResources(roots);

    const resourcePack = new ResourcePack(packVersions.resource);
    await resourcePack.loadResources(roots);

    return { resourcePack, dataPack, minecraftVersion: jarVersion?.getId() ?? "unknown" };
}
