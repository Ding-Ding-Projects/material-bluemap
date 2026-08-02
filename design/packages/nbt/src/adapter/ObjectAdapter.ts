import { TagType } from "../TagType.js";
import { IOException } from "../Exceptions.js";
import { NBTReader } from "../NBTReader.js";
import type { NBTWriter } from "../NBTWriter.js";
import type { BlueNBT } from "../BlueNBT.js";
import type { TypeDeserializer } from "../TypeDeserializer.js";
import type { TypeSerializer } from "../TypeSerializer.js";
import type { TypeResolver } from "../TypeResolver.js";
import type { TypeToken } from "../TypeToken.js";
import type { DeserializerSpec, SerializerSpec } from "../TypeSpec.js";

/**
 * Explicit schema replacing upstream's reflection-based DefaultDeserializerFactory /
 * DefaultSerializerFactory field-discovery (TypeScript types are erased at runtime,
 * so the field-list must be spelled out — no decorators involved).
 */
export interface FieldSpec<V> {
    /**
     * Fixed nbt-name(s) for this field (mirrors the @NBTName annotation).
     * All names are considered during deserialization, but only the first name is
     * used for serialization. Defined names ignore the configured NamingStrategy.
     */
    names?: readonly string[];

    /** The type used to (de)serialize this field's value */
    type: DeserializerSpec<V> | SerializerSpec<V>;
}

export type FieldsSchema<T> = { readonly [K in keyof T]?: FieldSpec<T[K]> };

export interface ObjectSchema<T> {
    /**
     * Creates a fresh instance with default field-values
     * (mirrors upstream's InstanceCreator + Java field-initializers;
     * missing nbt-data leaves these defaults untouched)
     */
    create(): T;

    fields: FieldsSchema<T>;

    /**
     * Invoked directly after deserialization (mirrors the @NBTPostDeserialize annotation),
     * can be used to perform any operations that need to be done to finalize the deserialization.
     */
    postDeserialize?: (object: T) => void;
}

interface FieldAccessor {
    readonly property: string;
    readonly typeDeserializer: TypeDeserializer<unknown>;
}

function fieldEntries<T>(schema: ObjectSchema<T>): [string, FieldSpec<unknown>][] {
    return Object.entries(schema.fields as Record<string, FieldSpec<unknown> | undefined>).filter(
        (entry): entry is [string, FieldSpec<unknown>] => entry[1] !== undefined,
    );
}

/**
 * Schema-driven port of DefaultDeserializerFactory.DefaultAdapter.
 */
export class ObjectTypeDeserializer<T> implements TypeDeserializer<T> {
    private readonly schema: ObjectSchema<T>;

    private readonly fields = new Map<string, FieldAccessor[]>();

    constructor(schema: ObjectSchema<T>, blueNBT: BlueNBT) {
        this.schema = schema;

        for (const [property, spec] of fieldEntries(schema)) {
            let names: readonly string[] = [blueNBT.getNamingStrategy()(property)];
            if (spec.names !== undefined && spec.names.length > 0) names = spec.names;

            const typeDeserializer = blueNBT.resolveDeserializer(
                spec.type as DeserializerSpec<unknown>,
            );

            const accessor: FieldAccessor = { property, typeDeserializer };
            for (const name of names) {
                let accessors = this.fields.get(name);
                if (accessors === undefined) {
                    accessors = [];
                    this.fields.set(name, accessors);
                }
                accessors.push(accessor);
            }
        }
    }

    read(reader: NBTReader): T {
        const object = this.schema.create();
        reader.beginCompound();

        while (reader.peek() !== TagType.END) {
            const name = reader.name();
            const fieldInfos = this.fields.get(name);

            if (fieldInfos !== undefined && fieldInfos.length > 0) {
                if (fieldInfos.length === 1) {
                    this.apply(object, fieldInfos[0]!, reader);
                } else {
                    const raw = reader.raw();
                    for (const fieldInfo of fieldInfos) {
                        this.apply(object, fieldInfo, new NBTReader(raw));
                    }
                }
            } else {
                reader.skip();
            }
        }

        reader.endCompound();

        // run post deserialization actions
        if (this.schema.postDeserialize !== undefined) this.schema.postDeserialize(object);

        return object;
    }

    private apply(object: T, accessor: FieldAccessor, reader: NBTReader): void {
        (object as Record<string, unknown>)[accessor.property] =
            accessor.typeDeserializer.read(reader);
    }
}

interface FieldWriter {
    readonly property: string;
    readonly typeSerializer: TypeSerializer<unknown>;
}

/**
 * Schema-driven port of DefaultSerializerFactory.DefaultAdapter.
 */
export class ObjectTypeSerializer<T> implements TypeSerializer<T> {
    private readonly fields = new Map<string, FieldWriter>();

    constructor(schema: ObjectSchema<T>, blueNBT: BlueNBT) {
        for (const [property, spec] of fieldEntries(schema)) {
            let name = blueNBT.getNamingStrategy()(property);
            if (spec.names !== undefined && spec.names.length > 0) name = spec.names[0]!;

            const typeSerializer = blueNBT.resolveSerializer(spec.type as SerializerSpec<unknown>);
            this.fields.set(name, { property, typeSerializer });
        }
    }

    write(value: T, writer: NBTWriter): void {
        writer.beginCompound();

        for (const [name, field] of this.fields) {
            writer.name(name);
            field.typeSerializer.write((value as Record<string, unknown>)[field.property], writer);
        }

        writer.endCompound();
    }

    type(): TagType {
        return TagType.COMPOUND;
    }
}

function toIOException(error: unknown): IOException {
    if (error instanceof IOException) return error;
    return new IOException(String(error instanceof Error ? error.message : error), {
        cause: error,
    });
}

/**
 * Port of DefaultDeserializerFactory.TypeResolvingAdapter.
 */
export class TypeResolvingAdapter<T> implements TypeDeserializer<T> {
    private readonly type: TypeToken<T>;
    private readonly blueNBT: BlueNBT;
    private readonly typeResolver: TypeResolver<T, unknown>;
    private readonly baseType: TypeToken<unknown>;
    private readonly baseDeserializer: TypeDeserializer<unknown>;
    private readonly delegateDeserializers = new Map<TypeToken<unknown>, TypeDeserializer<T>>();
    // upstream eagerly builds a reflective fallback-adapter for the resolved type;
    // the port builds it lazily since it requires a registered object-schema
    private fallbackDeserializer: TypeDeserializer<T> | null = null;

    constructor(type: TypeToken<T>, typeResolver: TypeResolver<T, unknown>, blueNBT: BlueNBT) {
        this.type = type;
        this.blueNBT = blueNBT;
        this.typeResolver = typeResolver;
        this.baseType = typeResolver.getBaseType();
        this.baseDeserializer =
            this.baseType === (type as TypeToken<unknown>)
                ? blueNBT.createObjectDeserializer(this.baseType)
                : blueNBT.getTypeDeserializer(this.baseType);
        for (const resolved of typeResolver.getPossibleTypes()) {
            this.delegateDeserializers.set(
                resolved as TypeToken<unknown>,
                resolved === type
                    ? blueNBT.createObjectDeserializer(resolved)
                    : blueNBT.getTypeDeserializer(resolved),
            );
        }
    }

    read(reader: NBTReader): T {
        // read next element as raw data
        const data = reader.raw();

        try {
            // parse data first into base object
            const base = this.baseDeserializer.read(new NBTReader(data));

            try {
                // resolve type
                const resolvedType = this.typeResolver.resolve(base);
                let deserializer: TypeDeserializer<T> | undefined = this.delegateDeserializers.get(
                    resolvedType as TypeToken<unknown>,
                );
                if (deserializer === undefined) deserializer = this.fallback();

                // shortcut if resolved type == base type
                if ((resolvedType as TypeToken<unknown>) === this.baseType) return base as T;

                // parse data into final type
                return deserializer.read(new NBTReader(data));
            } catch (ex) {
                return this.onException(toIOException(ex), base);
            }
        } catch (ex) {
            return this.onException(toIOException(ex));
        }
    }

    private onException(parseException: IOException, base?: unknown): T {
        if (this.typeResolver.onException !== undefined)
            return this.typeResolver.onException(parseException, base);
        throw parseException;
    }

    private fallback(): TypeDeserializer<T> {
        if (this.fallbackDeserializer === null)
            this.fallbackDeserializer = this.blueNBT.createObjectDeserializer(this.type);
        return this.fallbackDeserializer;
    }
}
