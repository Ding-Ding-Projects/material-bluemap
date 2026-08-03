import { Key } from "@material-bluemap/shared";
import { BlockState } from "../../BlockState.js";
import { readLegacyJsonAsset } from "./assets.js";

/**
 * Legacy (pre-flattening, 1.12.2) numeral block-id + meta to {@link BlockState} mapping
 * (upstream: mca/mapping/BlockIdMapper.java from v0.10.3-mc1.12)
 */
export interface BlockIdMapper {
    get(id: number, meta: number): BlockState;

    get(id: string, numeralId: number, meta: number): BlockState;
}

/** Java Integer.parseInt: strict decimal syntax, int-range checked (throws otherwise) */
function javaParseInt(s: string): number {
    if (!/^[+-]?\d+$/.test(s)) throw new Error('For input string: "' + s + '"');
    const value = Number.parseInt(s, 10);
    if (value < -2147483648 || value > 2147483647) throw new Error('For input string: "' + s + '"');
    return value | 0;
}

/**
 * Port of the legacy BlockIdConfig (upstream: config/BlockIdConfig.java from
 * v0.10.3-mc1.12), backed by the bundled assets/legacy/blockIds.json instead of a
 * user-editable configurate node.
 *
 * Upstream's optional "autopopulation" config-loader (which wrote every resolved
 * fallback mapping back into a config file on disk) is not ported — the in-memory
 * caching of resolved fallbacks is kept.
 *
 * Upstream keyed its maps with BlockNumeralIDMeta/BlockIDMeta value-objects
 * (equals/hashCode based); here both collapse to the equivalent "id:meta" string keys.
 */
export class BlockIdConfig implements BlockIdMapper {
    private static defaultConfig: BlockIdConfig | null = null;

    private readonly numeralMappings: Map<string, BlockState>;
    private readonly idMappings: Map<string, BlockState>;

    constructor(node: Record<string, string>) {
        this.numeralMappings = new Map();
        this.idMappings = new Map();

        for (const [key, value] of Object.entries(node)) {
            try {
                const splitIndex = key.lastIndexOf(":");

                if (splitIndex <= 0 || splitIndex >= key.length - 1) {
                    // Logger.global.logWarning("Loading BlockIdConfig: Failed to parse blockid:meta from key '" + key + "'")
                    continue;
                }

                const blockId = key.substring(0, splitIndex);
                let blockNumeralId: number;
                try {
                    blockNumeralId = javaParseInt(blockId);
                } catch {
                    blockNumeralId = -1;
                }
                const blockMeta = javaParseInt(key.substring(splitIndex + 1));
                let state = BlockState.fromString(value);

                if (blockNumeralId >= 0) {
                    if (blockNumeralId === 0) state = BlockState.AIR; //use the static field to increase render speed (== comparison)
                    this.numeralMappings.set(blockNumeralId + ":" + blockMeta, state);
                } else {
                    this.idMappings.set(blockId + ":" + blockMeta, state);
                }
            } catch {
                // upstream logs a warning for NumberFormatException (bad meta) and
                // IllegalArgumentException (bad BlockState value) and skips the entry
            }
        }
    }

    get(id: number, meta: number): BlockState;
    get(id: string, numeralId: number, meta: number): BlockState;
    get(id: number | string, numeralIdOrMeta: number, maybeMeta?: number): BlockState {
        if (typeof id === "number") return this.getByNumeralId(id, numeralIdOrMeta);
        return this.getByStringId(id, numeralIdOrMeta, maybeMeta as number);
    }

    /** upstream: BlockIdConfig#get(int numeralId, int meta) */
    private getByNumeralId(numeralId: number, meta: number): BlockState {
        if (numeralId === 0) return BlockState.AIR;

        const numidmeta = numeralId + ":" + meta;
        let state = this.numeralMappings.get(numidmeta);

        if (state === undefined) {
            state = this.numeralMappings.get(numeralId + ":0") ?? BlockState.MISSING; //meta-fallback

            this.numeralMappings.set(numidmeta, state);
        }

        return state;
    }

    /** upstream: BlockIdConfig#get(String id, int numeralId, int meta) */
    private getByStringId(id: string, numeralId: number, meta: number): BlockState {
        if (numeralId === 0) return BlockState.AIR;

        const numidmeta = numeralId + ":" + meta;
        let state = this.numeralMappings.get(numidmeta);
        if (state === undefined) {
            const idmeta = id + ":" + meta;
            state = this.idMappings.get(idmeta);
            if (state === undefined) {
                state = this.idMappings.get(id + ":0");
                if (state === undefined) {
                    state = this.numeralMappings.get(numeralId + ":0");
                    if (state === undefined) state = new BlockState(Key.parse(id));
                }

                this.idMappings.set(idmeta, state);
                // Preconditions.checkArgument(numeralMappings.put(numidmeta, state) == null)
                if (this.numeralMappings.has(numidmeta))
                    throw new Error(
                        "IllegalArgumentException: numeral-mapping already present for " +
                            numidmeta,
                    );
                this.numeralMappings.set(numidmeta, state);
            }
        }

        return state;
    }

    /** The default mapper backed by the bundled assets/legacy/blockIds.json (cached) */
    static loadDefault(): BlockIdConfig {
        if (BlockIdConfig.defaultConfig === null) {
            BlockIdConfig.defaultConfig = new BlockIdConfig(
                readLegacyJsonAsset("blockIds.json") as Record<string, string>,
            );
        }
        return BlockIdConfig.defaultConfig;
    }
}
