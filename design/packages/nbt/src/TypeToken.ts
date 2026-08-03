/**
 * Identifies a (de)serializable type for adapter- and schema-registration.
 *
 * Upstream TypeToken captures a java.lang.reflect.Type; since TypeScript types are
 * erased at runtime, tokens are identified by an explicit string instead. Tokens are
 * interned per identifier, so upstream's equals/hashCode-based map-lookups become
 * plain reference-equality here.
 */
export class TypeToken<T> {
    // phantom type-parameter usage (covariant), so TypeToken<Sub> is assignable to TypeToken<Base>
    declare private readonly __type?: T;

    private static readonly interned = new Map<string, TypeToken<unknown>>();

    /** Equivalent to upstream TypeToken.of(Object.class) — reads into raw Maps/arrays/primitives via ObjectDeserializer */
    static readonly OBJECT: TypeToken<unknown> = TypeToken.of("Object");

    private constructor(readonly identifier: string) {}

    static of<T>(identifier: string): TypeToken<T> {
        let token = TypeToken.interned.get(identifier);
        if (token === undefined) {
            token = new TypeToken<unknown>(identifier);
            TypeToken.interned.set(identifier, token);
        }
        return token as TypeToken<T>;
    }

    toString(): string {
        return this.identifier;
    }
}
