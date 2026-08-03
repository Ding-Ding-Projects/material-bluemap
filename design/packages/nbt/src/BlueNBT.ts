import { NBTReader } from "./NBTReader.js";
import { NBTWriter } from "./NBTWriter.js";
import { TagType } from "./TagType.js";
import { TypeToken } from "./TypeToken.js";
import { NamingStrategy } from "./NamingStrategy.js";
import { IllegalArgumentException, IllegalStateException } from "./Exceptions.js";
import type { TypeAdapter } from "./TypeAdapter.js";
import type { TypeDeserializer } from "./TypeDeserializer.js";
import type { TypeSerializer } from "./TypeSerializer.js";
import { serializerType } from "./TypeSerializer.js";
import type { TypeResolver } from "./TypeResolver.js";
import type { DeserializerSpec, SerializerSpec } from "./TypeSpec.js";
import { ObjectDeserializer } from "./adapter/ObjectDeserializer.js";
import {
    ObjectTypeDeserializer,
    ObjectTypeSerializer,
    TypeResolvingAdapter,
} from "./adapter/ObjectAdapter.js";
import type { ObjectSchema } from "./adapter/ObjectAdapter.js";

/**
 * The heart of BlueNBT.
 * <p>Use this class to register your {@link TypeSerializer}s, {@link TypeDeserializer}s,
 * {@link TypeResolver}s and {@link ObjectSchema}s and (de)serialize any object to/from NBT.</p>
 *
 * Upstream's reflection-driven adapter-factories are replaced with explicit
 * per-token registrations: an {@link ObjectSchema} takes the place of upstream's
 * DefaultDeserializerFactory field-reflection (and InstanceCreator).
 */
export class BlueNBT {
    /**
     * The {@link NamingStrategy} this BlueNBT instance uses to determine the NBT-name
     * of a schema-field.
     * <p>Defaults to {@link NamingStrategy#FIELD_NAME}</p>
     */
    private namingStrategy: NamingStrategy = NamingStrategy.FIELD_NAME;

    private readonly typeSerializerMap = new Map<TypeToken<unknown>, TypeSerializer<unknown>>();
    private readonly typeDeserializerMap = new Map<TypeToken<unknown>, TypeDeserializer<unknown>>();
    private readonly typeResolverMap = new Map<
        TypeToken<unknown>,
        TypeResolver<unknown, unknown>
    >();
    private readonly objectSchemaMap = new Map<TypeToken<unknown>, ObjectSchema<unknown>>();

    /**
     * Creates a fresh BlueNBT instance with the default configuration and default (de)serializers.
     */
    constructor() {
        this.register(TypeToken.OBJECT, ObjectDeserializer.INSTANCE);
    }

    getNamingStrategy(): NamingStrategy {
        return this.namingStrategy;
    }

    setNamingStrategy(namingStrategy: NamingStrategy): void {
        this.namingStrategy = namingStrategy;
    }

    /**
     * Registers a {@link TypeAdapter}, {@link TypeSerializer}, {@link TypeDeserializer},
     * {@link TypeResolver} or {@link ObjectSchema} for this BlueNBT instance to use for
     * (de)serialization of the specified type.
     */
    register<T>(
        type: TypeToken<T>,
        registration:
            | TypeAdapter<T>
            | TypeSerializer<T>
            | TypeDeserializer<T>
            | TypeResolver<T, unknown>
            | ObjectSchema<T>,
    ): void {
        if ("getBaseType" in registration && "resolve" in registration) {
            this.typeResolverMap.set(
                type as TypeToken<unknown>,
                registration as TypeResolver<unknown, unknown>,
            );
            return;
        }
        if ("create" in registration && "fields" in registration) {
            this.objectSchemaMap.set(
                type as TypeToken<unknown>,
                registration as ObjectSchema<unknown>,
            );
            return;
        }
        let registered = false;
        if ("read" in registration) {
            this.typeDeserializerMap.set(
                type as TypeToken<unknown>,
                registration as TypeDeserializer<unknown>,
            );
            registered = true;
        }
        if ("write" in registration) {
            this.typeSerializerMap.set(
                type as TypeToken<unknown>,
                registration as TypeSerializer<unknown>,
            );
            registered = true;
        }
        if (!registered)
            throw new IllegalArgumentException(
                "registration is neither a TypeAdapter, TypeSerializer, TypeDeserializer, TypeResolver nor an ObjectSchema",
            );
    }

    /**
     * Returns the {@link TypeSerializer} for the given type
     */
    getTypeSerializer<T>(type: TypeToken<T>): TypeSerializer<T> {
        const existing = this.typeSerializerMap.get(type as TypeToken<unknown>);
        if (existing !== undefined) return existing as TypeSerializer<T>;

        // set future before creation of new serializers to avoid recursive creation
        const future = new FutureTypeSerializer<T>();
        this.typeSerializerMap.set(type as TypeToken<unknown>, future as TypeSerializer<unknown>);

        let serializer: TypeSerializer<T> | null = null;
        try {
            serializer = this.createDefaultSerializer(type);
            future.complete(serializer);
        } finally {
            if (serializer !== null) {
                this.typeSerializerMap.set(
                    type as TypeToken<unknown>,
                    serializer as TypeSerializer<unknown>,
                );
            } else {
                this.typeSerializerMap.delete(type as TypeToken<unknown>);
            }
        }

        return serializer;
    }

    /**
     * Returns the {@link TypeDeserializer} for the given type
     */
    getTypeDeserializer<T>(type: TypeToken<T>): TypeDeserializer<T> {
        const existing = this.typeDeserializerMap.get(type as TypeToken<unknown>);
        if (existing !== undefined) return existing as TypeDeserializer<T>;

        // set future before creation of new deserializers to avoid recursive creation
        const future = new FutureTypeDeserializer<T>();
        this.typeDeserializerMap.set(
            type as TypeToken<unknown>,
            future as TypeDeserializer<unknown>,
        );

        let deserializer: TypeDeserializer<T> | null = null;
        try {
            deserializer = this.createDefaultDeserializer(type);
            future.complete(deserializer);
        } finally {
            if (deserializer !== null) {
                this.typeDeserializerMap.set(
                    type as TypeToken<unknown>,
                    deserializer as TypeDeserializer<unknown>,
                );
            } else {
                this.typeDeserializerMap.delete(type as TypeToken<unknown>);
            }
        }

        return deserializer;
    }

    /**
     * Returns the {@link TypeResolver} for the given type or null if there is none
     */
    getTypeResolver<T>(type: TypeToken<T>): TypeResolver<T, unknown> | null {
        return (
            (this.typeResolverMap.get(type as TypeToken<unknown>) as
                TypeResolver<T, unknown> | undefined) ?? null
        );
    }

    /**
     * Returns the registered {@link ObjectSchema} for the given type or null if there is none
     */
    getObjectSchema<T>(type: TypeToken<T>): ObjectSchema<T> | null {
        return (
            (this.objectSchemaMap.get(type as TypeToken<unknown>) as ObjectSchema<T> | undefined) ??
            null
        );
    }

    /**
     * Creates a schema-based deserializer for the given type, bypassing any registered
     * {@link TypeResolver} (mirrors upstream's direct DefaultAdapter creation inside
     * DefaultDeserializerFactory).
     */
    createObjectDeserializer<T>(type: TypeToken<T>): TypeDeserializer<T> {
        const schema = this.getObjectSchema(type);
        if (schema === null)
            // message mirrors upstream DefaultDeserializerFactory (which reuses the "-TypeSerializer" wording)
            throw new Error(
                "Failed to create Default-TypeSerializer for type: " +
                    type +
                    " (no object-schema registered)",
            );
        return new ObjectTypeDeserializer(schema, this);
    }

    private createDefaultDeserializer<T>(type: TypeToken<T>): TypeDeserializer<T> {
        const typeResolver = this.getTypeResolver(type);
        if (typeResolver !== null) return new TypeResolvingAdapter(type, typeResolver, this);
        return this.createObjectDeserializer(type);
    }

    private createDefaultSerializer<T>(type: TypeToken<T>): TypeSerializer<T> {
        const schema = this.getObjectSchema(type);
        if (schema === null)
            throw new Error(
                "Failed to create Default-TypeSerializer for type: " +
                    type +
                    " (no object-schema registered)",
            );
        return new ObjectTypeSerializer(schema, this);
    }

    /**
     * Resolves a {@link DeserializerSpec} against this BlueNBT instance.
     */
    resolveDeserializer<T>(spec: DeserializerSpec<T>): TypeDeserializer<T> {
        if (spec instanceof TypeToken) return this.getTypeDeserializer(spec);
        if (typeof spec === "function") {
            const created = spec(this);
            if (typeof created.read !== "function")
                throw new IllegalArgumentException(
                    "spec-factory did not create a TypeDeserializer",
                );
            return created;
        }
        if (typeof (spec as TypeDeserializer<T>).read !== "function")
            throw new IllegalArgumentException("spec is not a TypeDeserializer");
        return spec;
    }

    /**
     * Resolves a {@link SerializerSpec} against this BlueNBT instance.
     */
    resolveSerializer<T>(spec: SerializerSpec<T>): TypeSerializer<T> {
        if (spec instanceof TypeToken) return this.getTypeSerializer(spec);
        if (typeof spec === "function") {
            const created = spec(this);
            if (typeof created.write !== "function")
                throw new IllegalArgumentException("spec-factory did not create a TypeSerializer");
            return created;
        }
        if (typeof (spec as TypeSerializer<T>).write !== "function")
            throw new IllegalArgumentException("spec is not a TypeSerializer");
        return spec;
    }

    /**
     * Serializes an object to NBT using the specified type for serialization, and writes it
     * to the given {@link NBTWriter}
     */
    write<T>(object: T, out: NBTWriter, type: SerializerSpec<T>): void {
        this.resolveSerializer(type).write(object, out);
    }

    /**
     * Serializes an object to NBT using the specified type for serialization, and returns
     * the raw nbt-data (replaces upstream's OutputStream overloads).
     */
    writeToBytes<T>(object: T, type: SerializerSpec<T>): Uint8Array {
        const writer = new NBTWriter();
        this.write(object, writer, type);
        writer.close();
        return writer.toUint8Array();
    }

    /**
     * Reads an object from the given data or {@link NBTReader} and deserializes it from NBT
     * to the given type.
     */
    read<T>(data: Uint8Array | NBTReader, type: DeserializerSpec<T>): T {
        const reader = data instanceof NBTReader ? data : new NBTReader(data);
        return this.resolveDeserializer(type).read(reader);
    }
}

class FutureTypeSerializer<T> implements TypeSerializer<T> {
    private value: TypeSerializer<T> | null = null;

    complete(value: TypeSerializer<T>): void {
        if (this.value !== null)
            throw new IllegalStateException("FutureTypeSerializer already completed!");
        this.value = value;
    }

    write(value: T, writer: NBTWriter): void {
        if (this.value === null)
            throw new IllegalStateException("FutureTypeSerializer not completed!");
        this.value.write(value, writer);
    }

    type(): TagType {
        if (this.value === null)
            throw new IllegalStateException("FutureTypeSerializer is not ready!");
        return serializerType(this.value as TypeSerializer<never>);
    }
}

class FutureTypeDeserializer<T> implements TypeDeserializer<T> {
    private value: TypeDeserializer<T> | null = null;

    complete(value: TypeDeserializer<T>): void {
        if (this.value !== null)
            throw new IllegalStateException("FutureTypeDeserializer already completed!");
        this.value = value;
    }

    read(reader: NBTReader): T {
        if (this.value === null)
            throw new IllegalStateException("FutureTypeDeserializer is not ready!");
        return this.value.read(reader);
    }
}
