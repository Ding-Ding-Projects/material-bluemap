import { BlockState } from "../../BlockState.js";
import { readLegacyJsonAsset } from "./assets.js";

/**
 * Legacy block-properties trio (upstream: legacy world/BlockProperties.java from
 * v0.10.3-mc1.12 — culling/occluding/flammable booleans; distinct from the modern
 * Tristate-based world/BlockProperties, which the legacy extensions must not depend on).
 */
export class LegacyBlockProperties {
    static readonly SOLID = new LegacyBlockProperties(true, true, false);
    static readonly TRANSPARENT = new LegacyBlockProperties(false, false, false);

    private readonly culling: boolean;
    private readonly occluding: boolean;
    private readonly flammable: boolean;

    constructor(culling: boolean, occluding: boolean, flammable: boolean) {
        this.culling = culling;
        this.occluding = occluding;
        this.flammable = flammable;
    }

    isCulling(): boolean {
        return this.culling;
    }

    isOccluding(): boolean {
        return this.occluding;
    }

    isFlammable(): boolean {
        return this.flammable;
    }
}

/** upstream: legacy mca/mapping/BlockPropertiesMapper.java */
export interface BlockPropertiesMapper {
    get(blockState: BlockState): LegacyBlockProperties;
}

/** One entry of the legacy blockProperties.json */
export interface LegacyBlockPropertiesData {
    culling?: boolean;
    occluding?: boolean;
    flammable?: boolean;
}

/** upstream: legacy config/BlockStateMapping.java */
class BlockStateMapping<T> {
    private readonly blockState: BlockState;
    private readonly mapping: T;

    constructor(blockState: BlockState, mapping: T) {
        this.blockState = blockState;
        this.mapping = mapping;
    }

    /**
     * Returns true if the all the properties on this BlockMapping-key are the same in the provided BlockState.<br>
     * Properties that are not defined in this Mapping are ignored on the provided BlockState.<br>
     */
    fitsTo(blockState: BlockState): boolean {
        if (!this.blockState.getId().equals(blockState.getId())) return false;
        for (const [key, value] of this.blockState.getProperties()) {
            if (value !== blockState.getProperties().get(key)) {
                return false;
            }
        }

        return true;
    }

    getBlockState(): BlockState {
        return this.blockState;
    }

    getMapping(): T {
        return this.mapping;
    }
}

/**
 * Port of the legacy BlockPropertiesConfig (upstream: config/BlockPropertiesConfig.java
 * from v0.10.3-mc1.12), backed by the bundled assets/legacy/blockProperties.json.
 *
 * Not ported: the resource-pack model fallback (legacy generated culling/occluding
 * flags from block-models for unmapped states — without a resource-pack the legacy
 * code fell back to BlockProperties.SOLID, which is what happens here) and the
 * "autopopulation" config-writer. The legacy LoadingCache becomes unnecessary since
 * unmapped states get a catch-all mapping added on first lookup, exactly like upstream.
 */
export class BlockPropertiesConfig implements BlockPropertiesMapper {
    private static defaultConfig: BlockPropertiesConfig | null = null;

    /** Multimap<String, BlockStateMapping<BlockProperties>> keyed by the block's full id */
    private readonly mappings: Map<string, BlockStateMapping<LegacyBlockProperties>[]>;

    constructor(node: Record<string, LegacyBlockPropertiesData>) {
        this.mappings = new Map();

        for (const [key, value] of Object.entries(node)) {
            try {
                const bsKey = BlockState.fromString(key);
                const bsValue = new LegacyBlockProperties(
                    value.culling ?? true,
                    value.occluding ?? true,
                    value.flammable ?? false,
                );
                this.put(bsKey.getId().getFormatted(), new BlockStateMapping(bsKey, bsValue));
            } catch {
                // Logger.global.logWarning("Loading BlockPropertiesConfig: Failed to parse BlockState from key '" + key + "'")
            }
        }
    }

    private put(fullId: string, mapping: BlockStateMapping<LegacyBlockProperties>): void {
        let list = this.mappings.get(fullId);
        if (list === undefined) {
            list = [];
            this.mappings.set(fullId, list);
        }
        list.push(mapping);
    }

    get(from: BlockState): LegacyBlockProperties {
        const fullId = from.getId().getFormatted();
        for (const bm of this.mappings.get(fullId) ?? []) {
            if (bm.fitsTo(from)) {
                return bm.getMapping();
            }
        }

        const generated = LegacyBlockProperties.SOLID;

        // remember the generated properties for this block-id (catch-all, no properties)
        this.put(fullId, new BlockStateMapping(new BlockState(from.getId()), generated));

        return generated;
    }

    /** The default mapper backed by the bundled assets/legacy/blockProperties.json (cached) */
    static loadDefault(): BlockPropertiesConfig {
        if (BlockPropertiesConfig.defaultConfig === null) {
            BlockPropertiesConfig.defaultConfig = new BlockPropertiesConfig(
                readLegacyJsonAsset("blockProperties.json") as Record<
                    string,
                    LegacyBlockPropertiesData
                >,
            );
        }
        return BlockPropertiesConfig.defaultConfig;
    }
}

let legacyBlockPropertiesMapper: BlockPropertiesMapper | null = null;

/**
 * The block-properties mapper used by the legacy block-state extensions (replaces the
 * legacy MCAWorld#getBlockPropertiesMapper receiver); defaults to the bundled config.
 */
export function getLegacyBlockPropertiesMapper(): BlockPropertiesMapper {
    if (legacyBlockPropertiesMapper === null)
        legacyBlockPropertiesMapper = BlockPropertiesConfig.loadDefault();
    return legacyBlockPropertiesMapper;
}

/** Replaces the extension's mapper (mirrors the legacy MCAWorld#setBlockPropertiesMapper) */
export function setLegacyBlockPropertiesMapper(mapper: BlockPropertiesMapper | null): void {
    legacyBlockPropertiesMapper = mapper;
}
