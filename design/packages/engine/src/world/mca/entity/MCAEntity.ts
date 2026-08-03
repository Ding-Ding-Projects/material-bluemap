import {
    BOOLEAN,
    TypeToken,
    type BlueNBT,
    type FieldsSchema,
    type ObjectSchema,
} from "@material-bluemap/nbt";
import type { Key, Vector2d, Vector3d } from "@material-bluemap/shared";
import type { Entity } from "../../Entity.js";
import { KEY_TOKEN } from "../data/KeyDeserializer.js";
import { UUID_TOKEN } from "../data/UUIDDeserializer.js";
import { VECTOR3D_TOKEN } from "../data/Vector3dDeserializer.js";
import { VECTOR2F_TOKEN } from "../data/Vector2fDeserializer.js";

export const MCA_ENTITY_TOKEN: TypeToken<MCAEntity> = TypeToken.of("MCAEntity");

export class MCAEntity implements Entity {
    id!: Key;
    uuid!: string; // @NBTName("UUID")
    customName: unknown; // @NBTName("CustomName")
    customNameVisible = false; // @NBTName("CustomNameVisible")
    pos!: Vector3d; // @NBTName("Pos")
    motion!: Vector3d; // @NBTName("Motion")
    rotation!: Vector2d; // @NBTName("Rotation") — upstream: Vector2f

    getId(): Key {
        return this.id;
    }

    getUuid(): string {
        return this.uuid;
    }

    getCustomName(): unknown {
        return this.customName;
    }

    isCustomNameVisible(): boolean {
        return this.customNameVisible;
    }

    getPos(): Vector3d {
        return this.pos;
    }

    getMotion(): Vector3d {
        return this.motion;
    }

    getRotation(): Vector2d {
        return this.rotation;
    }
}

/** shared base-fields for schemas of MCAEntity subclasses (upstream: inherited fields) */
export const MCA_ENTITY_FIELDS = {
    id: { type: KEY_TOKEN },
    uuid: { names: ["UUID"], type: UUID_TOKEN },
    customName: { names: ["CustomName"], type: TypeToken.OBJECT },
    customNameVisible: { names: ["CustomNameVisible"], type: BOOLEAN },
    pos: { names: ["Pos"], type: VECTOR3D_TOKEN },
    motion: { names: ["Motion"], type: VECTOR3D_TOKEN },
    rotation: { names: ["Rotation"], type: VECTOR2F_TOKEN },
} as const satisfies FieldsSchema<MCAEntity>;

export const MCA_ENTITY_SCHEMA: ObjectSchema<MCAEntity> = {
    create: () => new MCAEntity(),
    fields: MCA_ENTITY_FIELDS,
};

export function registerMCAEntitySchema(nbt: BlueNBT): void {
    nbt.register(MCA_ENTITY_TOKEN, MCA_ENTITY_SCHEMA);
}
