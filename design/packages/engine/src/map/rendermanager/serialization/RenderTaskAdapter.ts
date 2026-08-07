import { IOException, NBTReader, TagType } from "@worldlens/nbt";
import type {
    BlueNBT,
    NBTWriter,
    TypeAdapter,
    TypeDeserializer,
    TypeSerializer,
    TypeToken,
} from "@worldlens/nbt";
import type { Key } from "@worldlens/shared";
import type { RenderTask } from "../RenderTask.js";
import type { Serialized } from "./SerializableRenderTask.js";

/**
 * Binds one render-task subtype to the stable string key its saved form is tagged with and
 * to the {@link Serialized} form that carries its data across a restart.
 *
 * Type-erased to plain `RenderTask`/`Serialized<RenderTask>` so a heterogeneous list of
 * codecs — one per task type, each with its own concrete `T` — can share a single array
 * inside {@link RenderTaskAdapter}. {@link defineTaskCodec} is the only place the cast
 * happens; every call site that builds one through it stays fully type-checked against its
 * own concrete task type.
 */
export interface RenderTaskCodec {
    readonly key: Key;
    matches(task: RenderTask): boolean;
    readonly serializedType: TypeToken<Serialized<RenderTask>>;
    serialize(task: RenderTask): Serialized<RenderTask>;
}

/** Builds a type-checked {@link RenderTaskCodec} for one concrete task type `T`. */
export function defineTaskCodec<T extends RenderTask>(options: {
    key: Key;
    matches: (task: RenderTask) => task is T;
    serializedType: TypeToken<Serialized<T>>;
    serialize: (task: T) => Serialized<T>;
}): RenderTaskCodec {
    return {
        key: options.key,
        matches: options.matches,
        serializedType: options.serializedType as unknown as TypeToken<Serialized<RenderTask>>,
        serialize: (task) => options.serialize(task as T) as unknown as Serialized<RenderTask>,
    };
}

interface ResolvedCodec {
    readonly codec: RenderTaskCodec;
    deserializer: TypeDeserializer<Serialized<RenderTask>> | null;
    serializer: TypeSerializer<Serialized<RenderTask>> | null;
}

/**
 * upstream: `common/.../rendermanager/serialization/RenderTaskAdapter.java`
 *
 * The polymorphic reader/writer for the render-task queue: every entry is wrapped as
 * `{ type, data }`, where `type` is one of the stable keys the registered
 * {@link RenderTaskCodec}s declare and `data` is that codec's own {@link Serialized} form.
 * A task whose runtime type matches none of them is silently skipped on write — upstream's
 * `default -> {}` — which is how a non-serializable task (`StorageDeleteTask`,
 * `MapUpdatePreparationTask`) simply falls out of a saved queue instead of failing the
 * whole save. On the way back in, an entry naming an unregistered `type` is refused with a
 * readable error rather than guessed at.
 *
 * ## Why resolution here is lazy, unlike upstream's two-phase `init()`
 *
 * Upstream registers itself on `BlueNBT` under `RenderTask.class` and only *then* calls
 * `init(blueNBT)`, with a comment calling it "a bit of trickery to allow the
 * RenderTaskAdapter to use itself recursively through BlueNBT's default serialization" —
 * `MapUpdateTask.Serialized` holds a `List<RenderTask>`, so resolving *that* adapter needs
 * this one to already exist, which is only true once this instance is registered.
 *
 * This port sidesteps the ordering question entirely: each codec's serializer/deserializer
 * is resolved from `blueNBT` on first use and cached, exactly the way
 * {@link LenientListAdapter}'s own `deserializer()`/`serializer()` already do in this same
 * package. By the time any `read`/`write` call actually happens, `createRenderTaskBlueNBT`
 * has finished registering every token this needs, so — unlike upstream — no registration
 * order is load-bearing here, and there is no `init()` to remember to call.
 */
export class RenderTaskAdapter implements TypeAdapter<RenderTask> {
    readonly #blueNBT: BlueNBT;
    readonly #codecs: readonly ResolvedCodec[];
    readonly #byKey: ReadonlyMap<string, ResolvedCodec>;

    constructor(blueNBT: BlueNBT, codecs: readonly RenderTaskCodec[]) {
        this.#blueNBT = blueNBT;
        this.#codecs = codecs.map((codec) => ({ codec, deserializer: null, serializer: null }));

        const byKey = new Map<string, ResolvedCodec>();
        for (const entry of this.#codecs) byKey.set(entry.codec.key.getFormatted(), entry);
        this.#byKey = byKey;
    }

    write(value: RenderTask, writer: NBTWriter): void {
        const entry = this.#codecs.find((candidate) => candidate.codec.matches(value));
        if (entry === undefined) return; // upstream: default -> {} — the task is ignored

        writer.beginCompound();
        writer.name("type");
        writer.valueString(entry.codec.key.getFormatted());
        writer.name("data");
        this.#serializerFor(entry).write(entry.codec.serialize(value), writer);
        writer.endCompound();
    }

    read(reader: NBTReader): RenderTask {
        let type: string | null = null;
        let data: Uint8Array | null = null;

        reader.beginCompound();
        while (reader.hasNext()) {
            switch (reader.name()) {
                case "type":
                    type = reader.nextString();
                    break;
                case "data":
                    data = reader.raw();
                    break;
                default:
                    reader.skip();
            }
        }
        reader.endCompound();

        if (type === null) throw new IOException("Missing type");
        if (data === null) throw new IOException("Missing data");

        const entry = this.#byKey.get(type);
        if (entry === undefined) throw new IOException(`Unknown render-task type: ${type}`);

        return this.#deserializerFor(entry).read(new NBTReader(data)).deserialize();
    }

    type(): TagType {
        return TagType.COMPOUND;
    }

    #serializerFor(entry: ResolvedCodec): TypeSerializer<Serialized<RenderTask>> {
        let serializer = entry.serializer;
        if (serializer === null) {
            serializer = this.#blueNBT.getTypeSerializer(entry.codec.serializedType);
            entry.serializer = serializer;
        }
        return serializer;
    }

    #deserializerFor(entry: ResolvedCodec): TypeDeserializer<Serialized<RenderTask>> {
        let deserializer = entry.deserializer;
        if (deserializer === null) {
            deserializer = this.#blueNBT.getTypeDeserializer(entry.codec.serializedType);
            entry.deserializer = deserializer;
        }
        return deserializer;
    }
}
