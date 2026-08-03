import { hasPostDeserialize } from "./PostDeserialize.js";

/**
 * upstream: adapter/PostDeserializeAdapterFactory.java — wraps every gson-adapter
 * whose target type declares a {@code @PostDeserialize} method and invokes that
 * method on the freshly deserialized object. Without gson's adapter-chain the hook
 * is applied explicitly: deserializers call {@link postDeserialize} on each object
 * they produce.
 */
export class PostDeserializeAdapterFactory {
    /** Invokes the post-deserialize hook (if any) and returns the object. */
    static postDeserialize<T>(obj: T): T {
        if (hasPostDeserialize(obj)) obj.postDeserialize();
        return obj;
    }
}

export const postDeserialize = PostDeserializeAdapterFactory.postDeserialize;
