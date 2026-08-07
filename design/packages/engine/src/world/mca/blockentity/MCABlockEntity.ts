import {
    BOOLEAN,
    INT,
    TypeToken,
    type BlueNBT,
    type FieldsSchema,
    type ObjectSchema,
} from "@worldlens/nbt";
import type { Key } from "@worldlens/shared";
import type { BlockEntity } from "../../BlockEntity.js";
import { KEY_TOKEN } from "../data/KeyDeserializer.js";

export const MCA_BLOCK_ENTITY_TOKEN: TypeToken<MCABlockEntity> = TypeToken.of("MCABlockEntity");

export class MCABlockEntity implements BlockEntity {
    id!: Key;
    x = 0;
    y = 0;
    z = 0;

    keepPacked = false; // @NBTName("keepPacked")

    getId(): Key {
        return this.id;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getZ(): number {
        return this.z;
    }

    isKeepPacked(): boolean {
        return this.keepPacked;
    }
}

/** shared base-fields for schemas of MCABlockEntity subclasses (upstream: inherited fields) */
export const MCA_BLOCK_ENTITY_FIELDS = {
    id: { type: KEY_TOKEN },
    x: { type: INT },
    y: { type: INT },
    z: { type: INT },
    keepPacked: { names: ["keepPacked"], type: BOOLEAN },
} as const satisfies FieldsSchema<MCABlockEntity>;

export const MCA_BLOCK_ENTITY_SCHEMA: ObjectSchema<MCABlockEntity> = {
    create: () => new MCABlockEntity(),
    fields: MCA_BLOCK_ENTITY_FIELDS,
};

export function registerMCABlockEntitySchema(nbt: BlueNBT): void {
    nbt.register(MCA_BLOCK_ENTITY_TOKEN, MCA_BLOCK_ENTITY_SCHEMA);
}
