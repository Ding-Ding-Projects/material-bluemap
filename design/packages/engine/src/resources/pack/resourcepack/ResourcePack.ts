import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import { LRUCache } from "lru-cache";
import { PNG } from "pngjs";
import type { BlockColorCalculator } from "../../../map/hires/block/color/BlockColorCalculator.js";
import { Tristate } from "../../../util/Tristate.js";
import { BlockProperties } from "../../../world/BlockProperties.js";
import type { BlockState as WorldBlockState } from "../../../world/BlockState.js";
import { BlockColorsConfig } from "../../BlockColorsConfig.js";
import { BlockPropertiesConfig } from "../../BlockPropertiesConfig.js";
import { ResourcePath } from "../../ResourcePath.js";
import { parse } from "../../adapter/JsonMapper.js";
import { Pack } from "../Pack.js";
import { PackExtension } from "../PackExtension.js";
import type { PackVersion } from "../PackVersion.js";
import { ResourcePool } from "../ResourcePool.js";
import type { PackPath } from "../vfs/PackFileSystem.js";
import { ResourcePackExtension } from "./ResourcePackExtension.js";
import { Atlas } from "./atlas/Atlas.js";
import { BlockState } from "./blockstate/BlockState.js";
import type { Variant } from "./blockstate/Variant.js";
import { MISSING_BLOCK_MODEL as MISSING_BLOCK_MODEL_PATH } from "./blockstate/Variant.js";
import { EntityState } from "./entitystate/EntityState.js";
import { Model } from "./model/Model.js";
import { ColorMap } from "./texture/ColorMap.js";
import type { Texture } from "./texture/Texture.js";

/**
 * upstream: resources/pack/resourcepack/ResourcePack.java
 *
 * The orchestrator of the six resource-pools. Three port-shapes differ from upstream and
 * are recorded in docs/deviations.md:
 * - every file-operation is asynchronous (the vfs port), so the seven parallel loaders of
 *   {@code loadResources(Path)} are {@code await Promise.all} instead of
 *   {@code CompletableFuture.allOf(...).join()} on {@code BlueMap.THREAD_POOL};
 * - {@code Thread.interrupted()} has no js equivalent, so {@link ResourcePack#loadResources}
 *   takes an optional {@link AbortSignal} checked at exactly the upstream
 *   interruption-points;
 * - the two caffeine {@code LoadingCache}s become {@code lru-cache} instances keyed by the
 *   world-BlockState's canonical serialization (a js Map/Set compares by identity, not by
 *   {@code equals}/{@code hashCode}).
 */

/*
 * upstream: Logger.global.* — the logger-package is not part of this port (yet), so the
 * log-calls of the pack-package are backed by the console directly.
 */
function logInfo(message: string): void {
    console.info(message);
}

function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: Logger.global.noFloodWarning(key, message) */
const noFloodKeys = new Set<string>();
function noFloodWarning(key: string, message: string): void {
    if (noFloodKeys.has(key)) return;
    noFloodKeys.add(key);
    console.warn(message);
}

/**
 * upstream: {@code if (Thread.interrupted()) throw new InterruptedException();} — js has
 * no thread-interruption to poll, so the same points check the caller's AbortSignal.
 */
function checkAborted(signal: AbortSignal | undefined): void {
    if (signal !== undefined && signal.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error("InterruptedException");
    }
}

/**
 * upstream: {@code usedTextureKeys::contains} on a {@code Set<Key>} — a java Set compares
 * by {@code Key#equals}, a js Set compares by identity, so the predicate goes through
 * {@code Key#getFormatted()}.
 */
function keyFilter(keys: ReadonlySet<Key>): (key: Key) => boolean {
    const formatted = new Set<string>();
    for (const key of keys) formatted.add(key.getFormatted());
    return (key) => formatted.has(key.getFormatted());
}

/**
 * The canonical cache-key of a world-BlockState. Upstream keys the caffeine caches on the
 * BlockState itself, which hashes/compares by id plus its *sorted* property-array; a js
 * Map compares by identity, so the equivalent value-key is built here.
 */
function blockStateCacheKey(blockState: WorldBlockState): string {
    const properties = Array.from(blockState.getProperties().entries())
        .map(([key, value]) => key + "=" + value)
        .sort();
    return blockState.getId().getFormatted() + "[" + properties.join(",") + "]";
}

const BLOCKS_ATLAS: Key = Key.minecraft("blocks");

/** upstream: Caches.build(loader) — maximumSize(10000), expireAfterAccess(1, MINUTES) */
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 60 * 1000;

/**
 * upstream: the nested {@code ResourcePack.Extension<T extends ResourcePackExtension>}
 * interface (a TS interface can not be nested in a class). The core ships no
 * implementations — plugins register theirs on {@link Extension.REGISTRY}.
 */
export interface Extension<T extends ResourcePackExtension = ResourcePackExtension> extends Keyed {
    create(pack: ResourcePack): T;
}

export const Extension = {
    /** upstream: {@code Registry<Extension<?>> REGISTRY = new Registry<>()} */
    REGISTRY: new Registry<Extension>(),
};

export class ResourcePack extends Pack {
    /** upstream: the nested {@code Extension} interface's registry-holder */
    static readonly Extension = Extension;

    static readonly MISSING_BLOCK_STATE: ResourcePath<BlockState> = new ResourcePath<BlockState>(
        "bluemap",
        "missing",
    );
    static readonly MISSING_ENTITY_STATE: ResourcePath<EntityState> = new ResourcePath<EntityState>(
        "bluemap",
        "missing",
    );
    /**
     * The one instance {@code blockstate/Variant} already defaults its model to — a
     * {@link ResourcePath} caches its resolved resource per instance, so upstream's single
     * {@code static final} has to stay a single object here too.
     */
    static readonly MISSING_BLOCK_MODEL: ResourcePath<Model> = MISSING_BLOCK_MODEL_PATH;
    /**
     * Note: {@code entitystate/Part} and {@code model/Face} hold their own module-level
     * instances of this path and of {@link ResourcePack#MISSING_TEXTURE} — importing them
     * from here would close an import-cycle (ResourcePack -> Model -> Element -> Face), so
     * unlike {@link ResourcePack#MISSING_BLOCK_MODEL} those two are separate objects. See
     * docs/deviations.md.
     */
    static readonly MISSING_ENTITY_MODEL: ResourcePath<Model> = new ResourcePath<Model>(
        "bluemap",
        "entity/missing",
    );
    static readonly MISSING_TEXTURE: ResourcePath<Texture> = new ResourcePath<Texture>(
        "bluemap",
        "block/missing",
    );

    private readonly atlases = new ResourcePool<Atlas>();
    private readonly blockStates = new ResourcePool<BlockState>();
    private readonly entityStates = new ResourcePool<EntityState>();
    private readonly models = new ResourcePool<Model>();
    private readonly textures = new ResourcePool<Texture>();
    private readonly colormaps = new ResourcePool<ColorMap>();

    private readonly blockColorsConfig = new BlockColorsConfig();
    private readonly blockPropertiesConfig = new BlockPropertiesConfig();

    private readonly blockStateCache = new LRUCache<string, BlockState>({
        max: CACHE_MAX_SIZE,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });
    private readonly blockPropertiesCache = new LRUCache<string, BlockProperties>({
        max: CACHE_MAX_SIZE,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });

    private readonly extensions = new Map<Extension, ResourcePackExtension>();

    constructor(packVersion: PackVersion) {
        super(packVersion);

        for (const extensionType of Extension.REGISTRY.values())
            this.extensions.set(extensionType, extensionType.create(this));
    }

    /** upstream: the lombok {@code @Getter} for the {@code atlases} field */
    getAtlases(): ResourcePool<Atlas> {
        return this.atlases;
    }

    getBlockStates(): ResourcePool<BlockState> {
        return this.blockStates;
    }

    getEntityStates(): ResourcePool<EntityState> {
        return this.entityStates;
    }

    getModels(): ResourcePool<Model> {
        return this.models;
    }

    getTextures(): ResourcePool<Texture> {
        return this.textures;
    }

    getColormaps(): ResourcePool<ColorMap> {
        return this.colormaps;
    }

    /**
     * upstream: {@code synchronized void loadResources(Iterable<Path>)} — the
     * synchronization is a no-op in single-threaded js and kept only as this comment.
     *
     * @param signal the port's stand-in for {@code Thread.interrupted()}
     */
    override async loadResources(roots: Iterable<PackPath>, signal?: AbortSignal): Promise<void> {
        logInfo("Loading resources...");

        // resources
        for (const root of roots) {
            checkAborted(signal);
            logDebug("Loading resources from: " + root + " ...");
            await this.loadResourcePath(root, {
                load: (packRoot) => this.loadResourcesFromRoot(packRoot),
            });
        }

        // extensions
        for (const [extensionType, extension] of this.extensions) {
            checkAborted(signal);
            logDebug("Loading extension: " + extensionType.getKey());
            await PackExtension.loadResources(extension, roots);
        }

        // texture filter
        logDebug("Collecting texture-keys...");
        const usedTextureKeys = this.collectUsedTextureKeys();
        logDebug("Found " + usedTextureKeys.size + " texture-keys.");
        const textureFilter = keyFilter(usedTextureKeys);

        // textures
        for (const root of roots) {
            checkAborted(signal);
            logDebug("Loading textures from: " + root + " ...");
            await this.loadResourcePath(root, {
                load: (packRoot) =>
                    this.getBlocksAtlas().load(packRoot, this.textures, textureFilter),
            });
        }

        // bake
        checkAborted(signal);
        logDebug("Baking resources...");
        await this.bake(textureFilter, signal);

        // bake extensions
        for (const [extensionType, extension] of this.extensions) {
            checkAborted(signal);
            logDebug("Baking extension: " + extensionType.getKey());
            await PackExtension.bake(extension);
        }

        logInfo("Resources loaded.");
    }

    /**
     * upstream: the private {@code loadResources(Path)} overload (renamed — TS has no
     * method overloading by parameter type between a public and a private member).
     *
     * Upstream fans the seven loaders out over {@code BlueMap.THREAD_POOL} and rewraps a
     * RuntimeException from the {@code join()} as an IOException; here they are seven
     * promises awaited together, and the port has only one exception type. No two of them
     * write the same pool or config, and js has no preemption, so {@link ResourcePool}'s
     * plain Map is as safe here as upstream's HashMap is there.
     */
    private async loadResourcesFromRoot(root: PackPath): Promise<void> {
        await Promise.all([
            // load atlases
            (async () => {
                for (const file of await this.listResourceFiles(root, "atlases", ".json")) {
                    await this.atlases.load(
                        new ResourcePath<Atlas>(root.relativize(file), 1, 3),
                        { load: async () => Atlas.Adapter.read(parse(await file.readText())) },
                        (previous, resource) => previous.add(resource),
                    );
                }
            })(),

            // load blockstates
            (async () => {
                for (const file of await this.listResourceFiles(root, "blockstates", ".json")) {
                    await this.blockStates.load(
                        new ResourcePath<BlockState>(root.relativize(file), 1, 3),
                        { load: async () => BlockState.Adapter.read(parse(await file.readText())) },
                    );
                }
            })(),

            // load entitystates
            (async () => {
                for (const file of await this.listResourceFiles(root, "entitystates", ".json")) {
                    await this.entityStates.load(
                        new ResourcePath<EntityState>(root.relativize(file), 1, 3),
                        { load: async () => EntityState.Adapter.read(parse(await file.readText())) },
                    );
                }
            })(),

            // load models
            (async () => {
                for (const file of await this.listResourceFiles(root, "models", ".json")) {
                    await this.models.load(
                        new ResourcePath<Model>(root.relativize(file), 1, 3),
                        { load: async () => Model.Adapter.read(parse(await file.readText())) },
                    );
                }
            })(),

            // load colormaps
            (async () => {
                for (const file of await this.listResourceFiles(
                    root,
                    "textures/colormap",
                    ".png",
                )) {
                    await this.colormaps.load(new ResourcePath<ColorMap>(root.relativize(file), 1, 3), {
                        load: async () => new ColorMap(PNG.sync.read(await file.readBytes())),
                    });
                }
            })(),

            // load block-color configs
            (async () => {
                for (const namespaceRoot of await Pack.list(root.resolve("assets"))) {
                    const file = namespaceRoot.resolve("blockColors.json");
                    if (!(await file.isRegularFile())) continue;
                    try {
                        this.blockColorsConfig.loadFromString(await file.readText());
                    } catch (ex) {
                        logDebug("Failed to parse resource-file '" + file + "': " + ex);
                    }
                }
            })(),

            // load block-properties configs
            (async () => {
                for (const namespaceRoot of await Pack.list(root.resolve("assets"))) {
                    const file = namespaceRoot.resolve("blockProperties.json");
                    if (!(await file.isRegularFile())) continue;
                    try {
                        this.blockPropertiesConfig.loadFromString(await file.readText());
                    } catch (ex) {
                        logDebug("Failed to parse resource-file '" + file + "': " + ex);
                    }
                }
            })(),
        ]);
    }

    /**
     * upstream: the shared stream-prefix of the five resource-loaders —
     * {@code list(root.resolve("assets")).map(path -> path.resolve(<dir>))
     * .filter(Files::isDirectory).flatMap(Pack::walk)
     * .filter(<name ends with ending>).filter(Files::isRegularFile)}
     */
    private async listResourceFiles(
        root: PackPath,
        directory: string,
        ending: string,
    ): Promise<PackPath[]> {
        const files: PackPath[] = [];
        for (const namespaceRoot of await Pack.list(root.resolve("assets"))) {
            const resourceRoot = namespaceRoot.resolve(directory);
            if (!(await resourceRoot.isDirectory())) continue;
            for (const file of await Pack.walk(resourceRoot)) {
                if (!file.getFileName().endsWith(ending)) continue;
                if (!(await file.isRegularFile())) continue;
                files.push(file);
            }
        }
        return files;
    }

    private async bake(
        textureFilter: (key: Key) => boolean,
        signal?: AbortSignal,
    ): Promise<void> {
        // bake textures
        await this.getBlocksAtlas().bake(this.textures, textureFilter);

        checkAborted(signal);

        // optimize references
        for (const model of this.models.values()) {
            model.optimize(this.textures);
        }

        checkAborted(signal);

        // apply model parents
        for (const model of this.models.values()) {
            model.applyParent(this.models);
        }

        checkAborted(signal);

        // calculate model properties
        for (const model of this.models.values()) {
            model.calculateProperties(this.textures);
        }
    }

    private collectUsedTextureKeys(): ReadonlySet<Key> {
        // upstream: a HashSet<Key> deduplicating by Key#equals; a js Set compares by
        // identity, so the set is accumulated in a Key#getFormatted()-keyed map first
        const usedTextures = new Map<string, Key>();
        const add = (key: Key): void => {
            usedTextures.set(key.getFormatted(), key);
        };

        add(ResourcePack.MISSING_TEXTURE);
        for (const model of this.models.values()) {
            for (const textureVariable of model.getTextures().values()) {
                if (textureVariable.isReference()) continue;
                const texturePath = textureVariable.getTexturePath();
                // upstream adds the (nullable) path to the HashSet; a null entry can never
                // match a lookup, so it is skipped instead of keyed here
                if (texturePath !== null) add(texturePath);
            }
        }
        for (const extension of this.extensions.values()) {
            for (const key of ResourcePackExtension.collectUsedTextureKeys(extension)) add(key);
        }
        return new Set(usedTextures.values());
    }

    private getBlocksAtlas(): Atlas {
        const blocksAtlas = this.atlases.get(BLOCKS_ATLAS);
        if (blocksAtlas !== null) return blocksAtlas;

        noFloodWarning(
            "blocks-atlas-missing",
            "Atlas " + BLOCKS_ATLAS + " is missing or got accessed before loaded!",
        );
        return new Atlas();
    }

    getBlockState(blockState: WorldBlockState): BlockState | null {
        const cacheKey = blockStateCacheKey(blockState);
        const cached = this.blockStateCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const loaded = this.loadBlockState(blockState);
        // upstream: caffeine's LoadingCache does not record a null loader-result either
        if (loaded !== null) this.blockStateCache.set(cacheKey, loaded);
        return loaded;
    }

    private loadBlockState(blockState: WorldBlockState): BlockState | null {
        let key = blockState.getId();
        for (const extension of this.extensions.values()) {
            key = ResourcePackExtension.getBlockStateKey(extension, key);
        }
        return this.blockStates.get(key);
    }

    getBlockProperties(state: WorldBlockState): BlockProperties {
        const cacheKey = blockStateCacheKey(state);
        const cached = this.blockPropertiesCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const loaded = this.loadBlockProperties(state);
        this.blockPropertiesCache.set(cacheKey, loaded);
        return loaded;
    }

    private loadBlockProperties(state: WorldBlockState): BlockProperties {
        const props = BlockProperties.builder();

        // collect properties from extensions
        for (const extension of this.extensions.values()) {
            ResourcePackExtension.getBlockProperties(extension, state, props);
        }

        // explicitly configured properties always have priority -> overwrite
        props.from(this.blockPropertiesConfig.getBlockProperties(state));

        // calculate culling and occlusion from model if UNDEFINED
        if (props.isOccluding() === Tristate.UNDEFINED || props.isCulling() === Tristate.UNDEFINED) {
            const resource = this.getBlockState(state);
            if (resource !== null) {
                resource.forEach(state, 0, 0, 0, (variant: Variant) => {
                    const model = variant.getModel().getResource((key) => this.models.get(key));
                    if (model != null) {
                        if (props.isOccluding() === Tristate.UNDEFINED)
                            props.occluding(model.isOccluding());
                        if (props.isCulling() === Tristate.UNDEFINED)
                            props.culling(model.isCulling());
                    }
                });
            }
        }

        return props.build();
    }

    createBlockColorCalculator(): BlockColorCalculator {
        return this.blockColorsConfig.createBlockColorCalculator(this);
    }

    getExtension<T extends ResourcePackExtension>(extensionType: Extension<T>): T | null {
        return (this.extensions.get(extensionType) as T | undefined) ?? null;
    }
}
