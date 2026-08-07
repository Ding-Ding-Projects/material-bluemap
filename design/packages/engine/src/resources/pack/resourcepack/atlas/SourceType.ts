import { Key, Registry, type Keyed } from "@worldlens/shared";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import type { JsonValue } from "../../../adapter/JsonMapper.js";
import { JsonParseError } from "../../../adapter/JsonMapper.js";
import { DirectorySource } from "./DirectorySource.js";
import { PalettedPermutationsSource } from "./PalettedPermutationsSource.js";
import { SingleSource } from "./SingleSource.js";
import { Source } from "./Source.js";
import { UnstitchSource } from "./UnstitchSource.js";

/**
 * upstream: resources/pack/resourcepack/atlas/SourceType.java
 *
 * This module also carries upstream's {@code Source.Adapter} — the two-pass polymorphic
 * reader annotated onto {@code Source} with {@code @JsonAdapter}. It cannot live in
 * Source.ts here: it has to reference the concrete source-types, which extend
 * {@code Source}, and a module-cycle {@code Source → SourceType → SingleSource → Source}
 * would leave the base class in its temporal dead zone whenever Source.ts is evaluated
 * first (see docs/deviations.md).
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

export interface SourceType extends Keyed {
    /**
     * upstream: {@code Class<? extends Source> getType()} — a class-literal there, used
     * for nothing but {@code gson.getDelegateAdapter(TypeToken.get(type))}; without gson's
     * reflective registry the registry-entry carries that concrete adapter directly.
     */
    getAdapter(): JsonAdapter<Source>;
}

/** upstream: SourceType.Impl */
class Impl implements SourceType {
    constructor(
        private readonly key: Key,
        private readonly adapter: JsonAdapter<Source>,
    ) {}

    getKey(): Key {
        return this.key;
    }

    getAdapter(): JsonAdapter<Source> {
        return this.adapter;
    }
}

const REGISTRY = new Registry<SourceType>(
    new Impl(Key.minecraft("single"), SingleSource.Adapter),
    new Impl(Key.minecraft("directory"), DirectorySource.Adapter),
    // upstream maps minecraft:filter onto the plain Source — a deliberate no-op
    new Impl(Key.minecraft("filter"), Source.DelegateAdapter),
    new Impl(Key.minecraft("unstitch"), UnstitchSource.Adapter),
    new Impl(Key.minecraft("paletted_permutations"), PalettedPermutationsSource.Adapter),
);

/**
 * upstream: Source.Adapter — reads every source-element twice: once as a bare
 * {@link Source} to find its {@code type}, then again as the concrete class the
 * {@link REGISTRY} maps that type to. An unknown type degrades to the bare (no-op) Source.
 */
const Adapter: JsonAdapter<Source> = {
    read(json: JsonValue): Source {
        const element = json;

        const base = Source.DelegateAdapter.read(element);
        const baseType = base.getType();

        // upstream: `SourceType.REGISTRY.get(null)` for a source without a "type" member
        // hits ConcurrentHashMap#get(null) and throws — this throws in its place
        if (baseType === null) throw new JsonParseError("atlas-source is missing its 'type'");

        const type = REGISTRY.get(baseType);

        if (type === null) {
            logDebug("Unknown atlas-source type: " + baseType);
            return base;
        }

        return type.getAdapter().read(element);
    },
};

export const SourceType = {
    REGISTRY,
    Adapter,

    Impl,
};
