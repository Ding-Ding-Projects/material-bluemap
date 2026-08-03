import type { BlockState } from "../../../../world/BlockState.js";

/** upstream: de.bluecolored.bluemap.core.util.Preconditions#checkArgument */
function checkArgument(expression: boolean, errorMessage: string): void {
    if (!expression) throw new Error(errorMessage);
}

/**
 * upstream: resources/pack/resourcepack/blockstate/BlockStateCondition.java
 *
 * Upstream is a {@code @FunctionalInterface} carrying its condition-implementations as
 * nested classes and its factories as interface-statics. Here the interface holds the
 * single abstract method and the same-named const below holds the nested classes and
 * the statics (the split TypeScript requires between the type- and the value-space).
 */
export interface BlockStateCondition {
    matches(state: BlockState): boolean;
}

/**
 * Upstream declares every nested condition-class with a *private* constructor, reachable
 * only from the interface-statics below. Those statics live outside the class bodies
 * here, so the constructors can not be marked private — they are still only meant to be
 * used through {@link BlockStateCondition.property} / {@code and} / {@code or}.
 */
class Property implements BlockStateCondition {
    // package-private upstream: read by And's distinct-property optimization
    readonly key: string;
    private readonly value: string;

    constructor(key: string, value: string) {
        // upstream: toLowerCase(Locale.ROOT) — String#toLowerCase() is locale-independent
        this.key = key.toLowerCase();
        this.value = value.toLowerCase();
    }

    matches(state: BlockState): boolean {
        const value = state.getProperties().get(this.key);
        if (value == null) return false;
        return value === this.value;
    }
}

class PropertySet implements BlockStateCondition {
    private readonly key: string;
    private readonly possibleValues: Set<string>;

    constructor(key: string, ...possibleValues: string[]) {
        this.key = key.toLowerCase();
        this.possibleValues = new Set<string>();
        for (const value of possibleValues) this.possibleValues.add(value.toLowerCase());
    }

    matches(state: BlockState): boolean {
        const value = state.getProperties().get(this.key);
        if (value == null) return false;
        return this.possibleValues.has(value);
    }
}

class And implements BlockStateCondition {
    readonly conditions: BlockStateCondition[];
    readonly distinctProperties: number;

    constructor(...conditions: BlockStateCondition[]) {
        checkArgument(conditions.length > 0, "Must be at least one condition!");

        this.conditions = conditions;

        // Optimization: count distinct properties
        const distinctPropertiesSet = new Set<string>();
        for (const condition of this.conditions) {
            if (condition instanceof Property) {
                distinctPropertiesSet.add(condition.key);
            }
        }
        this.distinctProperties = distinctPropertiesSet.size;
    }

    matches(state: BlockState): boolean {
        // fast exit
        if (state.getProperties().size < this.distinctProperties) return false;

        // check all
        for (const condition of this.conditions) {
            if (!condition.matches(state)) return false;
        }
        return true;
    }
}

class Or implements BlockStateCondition {
    private readonly conditions: BlockStateCondition[];

    constructor(...conditions: BlockStateCondition[]) {
        checkArgument(conditions.length > 0, "Must be at least one condition!");

        this.conditions = conditions;
    }

    matches(state: BlockState): boolean {
        for (const condition of this.conditions) {
            if (condition.matches(state)) return true;
        }
        return false;
    }
}

class All implements BlockStateCondition {
    matches(_state: BlockState): boolean {
        return true;
    }
}

class None implements BlockStateCondition {
    matches(_state: BlockState): boolean {
        return false;
    }
}

/**
 * The interned all/none singletons. {@code Variants.Adapter} compares a parsed condition
 * against these by *reference identity* (upstream {@code ==}, here {@code ===}), so there
 * must be exactly one instance of each for the whole module-graph.
 */
const MATCH_ALL: BlockStateCondition = new All();
const MATCH_NONE: BlockStateCondition = new None();

export const BlockStateCondition = {
    MATCH_ALL,
    MATCH_NONE,

    all(): BlockStateCondition {
        return MATCH_ALL;
    },

    none(): BlockStateCondition {
        return MATCH_NONE;
    },

    and(...conditions: BlockStateCondition[]): BlockStateCondition {
        checkArgument(conditions.length > 0, "Must be at least one condition!");
        if (conditions.length === 1) return conditions[0]!;
        return new And(...conditions);
    },

    or(...conditions: BlockStateCondition[]): BlockStateCondition {
        checkArgument(conditions.length > 0, "Must be at least one condition!");
        if (conditions.length === 1) return conditions[0]!;
        return new Or(...conditions);
    },

    /**
     * upstream has two overloads, {@code property(String key, String value)} and
     * {@code property(String key, String... possibleValues)}. They collapse into this one
     * rest-parameter method: java resolves a single string-argument to the 2-arg overload
     * (a plain {@link Property}) and the varargs overload delegates to it for a
     * 1-element array, so both paths build the same condition the branch below builds.
     */
    property(key: string, ...possibleValues: string[]): BlockStateCondition {
        checkArgument(possibleValues.length > 0, "Must be at least one value!");
        if (possibleValues.length === 1) return new Property(key, possibleValues[0]!);
        return new PropertySet(key, ...possibleValues);
    },

    // the nested classes (upstream: members of the interface)
    Property,
    PropertySet,
    And,
    Or,
    All,
    None,
};
