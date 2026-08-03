import { Color, Key } from "@material-bluemap/shared";
import { readFile } from "node:fs/promises";
import type { BlockColorCalculator } from "../map/hires/block/color/BlockColorCalculator.js";
import { BlockColorCalculatorFactory } from "../map/hires/block/color/BlockColorCalculatorFactory.js";
import { BlockColorCalculatorType } from "../map/hires/block/color/BlockColorCalculatorType.js";
import type { ResourcePack } from "./pack/resourcepack/ResourcePack.js";
import { BlockState } from "../world/BlockState.js";
import type { BlockAccess } from "../world/block/BlockAccess.js";
import { BlockStateMapping } from "./BlockStateMapping.js";
import { asObject, nextString, parse } from "./adapter/JsonMapper.js";

/* upstream: Logger.global.noFloodDebug — backed by the console directly (like the
 * mca-package's log-helpers) */
const noFloodKeys = new Set<string>();
function noFloodDebug(message: string): void {
    if (noFloodKeys.has(message)) return;
    noFloodKeys.add(message);
    console.debug(message);
}

/** the canonical map-key for a BlockState (upstream hashes/compares BlockState directly) */
function blockStateMapKey(blockState: BlockState): string {
    const properties = Array.from(blockState.getProperties().entries())
        .map(([key, value]) => key + "=" + value)
        .sort();
    return blockState.getId().getFormatted() + "[" + properties.join(",") + "]";
}

export class BlockColorsConfig {
    // upstream: Map<BlockState, String> — keyed by the canonical serialization here,
    // keeping the BlockState alongside for iteration
    private readonly colorConfig = new Map<string, { blockState: BlockState; value: string }>();
    private readonly defaultColor = new Color().set(0xffffffff, true);
    private readonly defaultColorCalculatorFactory = BlockColorCalculatorFactory.fixed(
        this.defaultColor
    );

    async load(configFile: string): Promise<void> {
        this.loadFromString(await readFile(configFile, "utf-8"));
    }

    /**
     * upstream: the JsonReader-loop of {@code load(Path)} — split out so pack-loading
     * can feed config-content read from a (zip-)PackFileSystem directly.
     */
    loadFromString(config: string): void {
        const json = asObject(parse(config));

        for (const [name, member] of Object.entries(json)) {
            const key = BlockState.fromString(name);
            const value = nextString(member);

            // don't overwrite already present values, higher priority resources are loaded first
            const mapKey = blockStateMapKey(key);
            if (!this.colorConfig.has(mapKey)) this.colorConfig.set(mapKey, { blockState: key, value });
        }
    }

    /**
     * Creates a new instance of {@link BlockColorCalculator} based on this config.<br>
     * The returned instance is not thread-safe, create a new instance for each Thread you use it on.
     */
    createBlockColorCalculator(resourcePack: ResourcePack): BlockColorCalculator {
        const mappings = new Map<string, BlockStateMapping<BlockColorCalculator>[]>();
        const defaultCalculator = this.defaultColorCalculatorFactory.create(resourcePack);

        const calculators = new Map<string, BlockColorCalculator>();
        const valueDeserializer = (value: string): BlockColorCalculator =>
            this.createBlockColorCalculatorFromValue(value, resourcePack);

        for (const { blockState, value } of this.colorConfig.values()) {
            let calculator = calculators.get(value);
            if (calculator === undefined) {
                calculator = valueDeserializer(value);
                calculators.set(value, calculator);
            }
            const mapping = new BlockStateMapping<BlockColorCalculator>(blockState, calculator);
            const id = blockState.getId().getFormatted();
            let list = mappings.get(id);
            if (list === undefined) {
                list = [];
                mappings.set(id, list);
            }
            list.push(mapping);
        }

        const getCalculator = (from: BlockState): BlockColorCalculator => {
            for (const bm of mappings.get(from.getId().getFormatted()) ?? []) {
                if (bm.fitsTo(from)) {
                    return bm.getMapping();
                }
            }

            return defaultCalculator;
        };

        return {
            getBlockColor(block: BlockAccess, blockState: BlockState, target: Color): Color {
                return getCalculator(blockState).getBlockColor(block, blockState, target);
            },
        };
    }

    // note: upstream overloads createBlockColorCalculator(String, ResourcePack) —
    // renamed since JS can not overload by parameter-type
    private createBlockColorCalculatorFromValue(
        configValue: string,
        resourcePack: ResourcePack
    ): BlockColorCalculator {
        return this.createBlockColorCalculatorFactory(configValue).create(resourcePack);
    }

    private createBlockColorCalculatorFactory(configValue: string): BlockColorCalculatorFactory {
        if (configValue == null || configValue.trim() === "") {
            noFloodDebug("Found empty color-config value, using default");
            return this.defaultColorCalculatorFactory;
        }

        if (configValue.charAt(0) === "@") {
            const calculatorTypeKey = Key.parse(configValue.substring(1), Key.MINECRAFT_NAMESPACE);
            const factory = BlockColorCalculatorType.REGISTRY.get(calculatorTypeKey);
            if (factory == null) {
                noFloodDebug(
                    `Color-config value '${configValue}' references an unknown calculator-type '${calculatorTypeKey}', using default`
                );
                return this.defaultColorCalculatorFactory;
            }
            return factory;
        }

        if (configValue.charAt(0) === "#") {
            try {
                const color = new Color();
                color.parse(configValue);
                return BlockColorCalculatorFactory.fixed(color);
            } catch {
                noFloodDebug(
                    `Color-config value '${configValue}' starts with # but has an invalid format, using default`
                );
                return this.defaultColorCalculatorFactory;
            }
        }

        try {
            const color = new Color();
            color.parse(configValue);
            return BlockColorCalculatorFactory.fixed(color);
        } catch {
            // ignore
        }

        const colorMapKey = Key.parse(configValue, Key.MINECRAFT_NAMESPACE);
        return BlockColorCalculatorFactory.colorMap(colorMapKey, this.defaultColor);
    }
}
