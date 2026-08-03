import type { Key } from "@material-bluemap/shared";
import { asArray, asObject, nextString, parse } from "../adapter/JsonMapper.js";
import { PackMeta } from "./PackMeta.js";
import type { PackVersion } from "./PackVersion.js";
import type { PackPath } from "./vfs/PackFileSystem.js";
import { ZipFileSystem } from "./vfs/ZipFileSystem.js";

/**
 * upstream: resources/pack/Pack.java
 *
 * Upstream browses a pack through java.nio {@code Path}s, mounting a zip/jar with
 * {@code FileSystems.newFileSystem(...)}; the port uses the {@code vfs} abstraction
 * ({@link PackPath} / {@link ZipFileSystem}) instead, and every file-operation is
 * asynchronous.
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly (like the
 * mca-package's log-helpers).
 */
function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: java.util.Arrays#toString */
function arraysToString(values: Iterable<Key>): string {
    return "[" + Array.from(values, (value) => value.toString()).join(", ") + "]";
}

/** upstream: Pack.Loader */
export interface Loader {
    load(root: PackPath): Promise<void> | void;
}

export abstract class Pack {
    private readonly packVersion: PackVersion;
    private readonly enabledFeatures: ReadonlySet<Key> | null;

    /**
     * {@link enabledFeatures} as {@code Key#getFormatted()} strings — upstream's
     * {@code Set<Key>#containsAll} compares by {@code Key#equals}, a js Set compares by
     * identity.
     */
    private readonly enabledFeatureKeys: Set<string> | null;

    constructor(packVersion: PackVersion, enabledFeatures: ReadonlySet<Key> | null = null) {
        this.packVersion = packVersion;
        this.enabledFeatures = enabledFeatures;
        this.enabledFeatureKeys =
            enabledFeatures === null
                ? null
                : new Set(Array.from(enabledFeatures, (key) => key.getFormatted()));
    }

    getPackVersion(): PackVersion {
        return this.packVersion;
    }

    getEnabledFeatures(): ReadonlySet<Key> | null {
        return this.enabledFeatures;
    }

    abstract loadResources(roots: Iterable<PackPath>): Promise<void>;

    async loadResourcePath(root: PackPath, resourceLoader: Loader): Promise<void> {
        // upstream: if (Thread.interrupted()) throw new InterruptedException();
        // (there is no thread-interruption to poll here — see docs/deviations.md)

        root = await root.toRealPath();

        if (!(await root.isDirectory())) {
            try {
                const fileSystem = await ZipFileSystem.open(root);
                try {
                    for (const fsRoot of fileSystem.getRootDirectories()) {
                        if (!(await fsRoot.isDirectory())) continue;
                        await this.loadResourcePath(fsRoot, resourceLoader);
                    }
                } finally {
                    await fileSystem.close();
                }
            } catch (ex) {
                logDebug("Failed to read '" + root + "': " + ex);
            }
            return;
        }

        // load nested jars from fabric.mod.json if present
        const fabricModJson = root.resolve("fabric.mod.json");
        if (await fabricModJson.isRegularFile()) {
            try {
                const rootElement = asObject(parse(await fabricModJson.readText()));
                const jars = rootElement["jars"];
                if (jars !== undefined) {
                    for (const element of asArray(jars)) {
                        const file = root.resolve(nextString(asObject(element)["file"] ?? null));
                        if (await file.exists()) {
                            try {
                                await this.loadResourcePath(file, resourceLoader);
                            } catch (ex) {
                                // note: upstream names `root` (not `file`) here — kept bug-for-bug
                                logDebug("Failed to read '" + root + "': " + ex);
                            }
                        }
                    }
                }
            } catch (ex) {
                logDebug("Failed to read fabric.mod.json: " + ex);
            }
        }

        // load pack-meta
        let packMeta: PackMeta;
        const packMetaFile = root.resolve("pack.mcmeta");
        if (await packMetaFile.isRegularFile()) {
            try {
                packMeta = PackMeta.fromJson(parse(await packMetaFile.readText()));
            } catch (ex) {
                logDebug("Failed to read pack.mcmeta: " + ex);
                packMeta = new PackMeta();
            }
        } else {
            packMeta = new PackMeta();
        }

        // stop loading pack if feature is not enabled
        const enabledFeatureKeys = this.enabledFeatureKeys;
        if (
            enabledFeatureKeys !== null &&
            !packMeta
                .getFeatures()
                .getEnabled()
                .every((feature) => enabledFeatureKeys.has(feature.getFormatted()))
        ) {
            logDebug(
                `Skipping resources from '${root}' because not all required features (${arraysToString(
                    packMeta.getFeatures().getEnabled(),
                )}) are enabled (${arraysToString(this.enabledFeatures ?? [])})`,
            );
            return;
        }

        // load nested datapacks
        for (const namespaceRoot of await Pack.list(root.resolve("data"))) {
            const datapacksRoot = namespaceRoot.resolve("datapacks");
            if (!(await datapacksRoot.isDirectory())) continue;
            for (const nestedPack of await Pack.list(datapacksRoot)) {
                try {
                    await this.loadResourcePath(nestedPack, resourceLoader);
                } catch (ex) {
                    logDebug("Failed to load nested datapack '" + nestedPack + "': " + ex);
                }
            }
        }

        // load overlays
        const overlays = packMeta.getOverlays().getEntries();
        for (let i = overlays.length - 1; i >= 0; i--) {
            const overlay = overlays[i]!;
            const dir = overlay.getDirectory();
            if (dir !== null && overlay.includes(this.packVersion)) {
                const overlayRoot = root.resolve(dir);
                if (await overlayRoot.exists()) {
                    try {
                        await this.loadResourcePath(overlayRoot, resourceLoader);
                    } catch (ex) {
                        logDebug("Failed to load overlay '" + overlayRoot + "': " + ex);
                    }
                }
            }
        }

        await resourceLoader.load(root);
    }

    static async list(root: PackPath): Promise<PackPath[]> {
        if (!(await root.isDirectory())) return [];
        return root.list();
    }

    /**
     * upstream: FileHelper#walk — a depth-first pre-order walk over the whole file-tree
     * (the start-path included), ignoring entries that vanish while iterating.
     */
    static async walk(root: PackPath): Promise<PackPath[]> {
        if (!(await root.exists())) return [];
        if (await root.isRegularFile()) return [root];

        const result: PackPath[] = [];
        const visit = async (path: PackPath): Promise<void> => {
            result.push(path);
            if (!(await path.isDirectory())) return;
            for (const child of await path.list()) await visit(child);
        };
        await visit(root);
        return result;
    }
}
