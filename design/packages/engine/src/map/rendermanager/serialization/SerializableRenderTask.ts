import type { RenderTask } from "../RenderTask.js";

/**
 * upstream: `common/.../rendermanager/serialization/SerializableRenderTask.java`
 *
 * upstream's declaration is `interface SerializableRenderTask<T extends
 * SerializableRenderTask<T, D>, D extends SerializableRenderTask.Serialized<T>>` — a
 * self-referencing type parameter (java's usual CRTP shape) purely so `D#deserialize()`
 * can be typed to return exactly `T`. TypeScript gets that same guarantee without the
 * self-reference: {@link Serialized} is generic in the task type it produces, so a
 * concrete task's `serialize(): FooSerialized` together with `FooSerialized implements
 * Serialized<Foo>` already ties the two together, and nothing upstream's extra type
 * parameter enforced is lost.
 */
export interface SerializableRenderTask<D extends Serialized<RenderTask>> extends RenderTask {
    serialize(): D;
}

/**
 * upstream: `SerializableRenderTask.Serialized<T>` — a small, plain data form of a task
 * that can be written to disk and, given whatever live context it needs (a map, in every
 * case this port has), rebuilt into a real, working task again.
 *
 * `deserialize()` takes no arguments because any reference a `Serialized` form holds to
 * live state (a {@link BmMap}, most commonly) has *already* been resolved by the time this
 * is called — {@link BmMapAdapter} resolves the map from the live map-set while the
 * `Serialized` object itself is being read, exactly as upstream's does through BlueNBT's
 * field-level adapter dispatch.
 */
export interface Serialized<T extends RenderTask> {
    deserialize(): T;
}
