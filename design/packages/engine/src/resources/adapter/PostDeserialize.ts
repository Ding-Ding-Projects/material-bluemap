/**
 * upstream: adapter/PostDeserialize.java — a runtime method-annotation picked up by
 * the {@code PostDeserializeAdapterFactory}. Ported as a well-known method name: a
 * deserialized object implementing this interface gets its {@code postDeserialize()}
 * invoked right after deserialization (see {@code PostDeserializeAdapterFactory}).
 */
export interface PostDeserialize {
    postDeserialize(): void;
}

export function hasPostDeserialize(value: unknown): value is PostDeserialize {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as PostDeserialize).postDeserialize === "function"
    );
}
