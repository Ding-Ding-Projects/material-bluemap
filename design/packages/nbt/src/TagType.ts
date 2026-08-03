/**
 * The raw NBT data-type
 */
export enum TagType {
    END = 0,
    BYTE = 1,
    SHORT = 2,
    INT = 3,
    LONG = 4,
    FLOAT = 5,
    DOUBLE = 6,
    BYTE_ARRAY = 7,
    STRING = 8,
    LIST = 9,
    COMPOUND = 10,
    INT_ARRAY = 11,
    LONG_ARRAY = 12,
}

/** value-size in bytes per tag-id, -1 if not fixed-size */
const TAG_TYPE_SIZE: readonly number[] = [-1, 1, 2, 4, 8, 4, 8, -1, -1, -1, -1, -1, -1];

export function tagTypeForId(id: number): TagType {
    if (id < TagType.END || id > TagType.LONG_ARRAY || !Number.isInteger(id))
        throw new Error("There is no TagType for id: " + id);
    return id as TagType;
}

/** The number of bytes a value of this tag-type occupies, or -1 if variable-size */
export function tagTypeSize(type: TagType): number {
    return TAG_TYPE_SIZE[type] ?? -1;
}

export function tagTypeName(type: TagType): string {
    return TagType[type] ?? String(type);
}
