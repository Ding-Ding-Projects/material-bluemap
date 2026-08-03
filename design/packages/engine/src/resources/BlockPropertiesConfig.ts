import { readFile } from "node:fs/promises";
import { BlockProperties } from "../world/BlockProperties.js";
import { BlockState } from "../world/BlockState.js";
import { BlockStateMapping } from "./BlockStateMapping.js";
import { asObject, nextBoolean, parse } from "./adapter/JsonMapper.js";

export class BlockPropertiesConfig {
    // keyed by Key#getFormatted() (upstream: ConcurrentHashMap<Key, List<...>>)
    private readonly mappings: Map<string, BlockStateMapping<BlockProperties>[]>;

    constructor() {
        this.mappings = new Map();
    }

    async load(configFile: string): Promise<void> {
        this.loadFromString(await readFile(configFile, "utf-8"));
    }

    /**
     * upstream: the JsonReader-loop of {@code load(Path)} — split out so pack-loading
     * can feed config-content read from a (zip-)PackFileSystem directly.
     */
    loadFromString(config: string): void {
        const json = asObject(parse(config));

        for (const [formatted, value] of Object.entries(json)) {
            const bsKey = BlockState.fromString(formatted);
            const bsValueBuilder = BlockProperties.builder();

            for (const [name, member] of Object.entries(asObject(value))) {
                switch (name) {
                    case "culling":
                        bsValueBuilder.culling(nextBoolean(member));
                        break;
                    case "occluding":
                        bsValueBuilder.occluding(nextBoolean(member));
                        break;
                    case "alwaysWaterlogged":
                        bsValueBuilder.alwaysWaterlogged(nextBoolean(member));
                        break;
                    case "randomOffset":
                        bsValueBuilder.randomOffset(nextBoolean(member));
                        break;
                    case "cullingIdentical":
                        bsValueBuilder.cullingIdentical(nextBoolean(member));
                        break;
                    default:
                        break;
                }
            }

            const mapping = new BlockStateMapping<BlockProperties>(bsKey, bsValueBuilder.build());

            // don't overwrite already present values, higher priority resources are loaded first
            const id = bsKey.getId().getFormatted();
            let list = this.mappings.get(id);
            if (list === undefined) {
                list = [];
                this.mappings.set(id, list);
            }
            list.push(mapping);
        }
    }

    getBlockProperties(from: BlockState): BlockProperties {
        for (const bm of this.mappings.get(from.getId().getFormatted()) ?? []) {
            if (bm.fitsTo(from)) {
                return bm.getMapping();
            }
        }

        return BlockProperties.DEFAULT;
    }
}
