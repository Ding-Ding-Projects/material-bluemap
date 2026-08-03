import { STRING, TypeToken, listOf, type BlueNBT, type ObjectSchema } from "@material-bluemap/nbt";
import { MCABlockEntity, MCA_BLOCK_ENTITY_FIELDS } from "./MCABlockEntity.js";
import { UUID_TOKEN } from "../data/UUIDDeserializer.js";

export const SKULL_BLOCK_ENTITY_TOKEN: TypeToken<SkullBlockEntity> =
    TypeToken.of("SkullBlockEntity");
const PROFILE_TOKEN: TypeToken<Profile> = TypeToken.of("SkullBlockEntity.Profile");
const PROPERTY_TOKEN: TypeToken<Property> = TypeToken.of("SkullBlockEntity.Property");

/** upstream: SkullBlockEntity.Property */
export class Property {
    name!: string;
    value: string = "";
    signature: string | null = null;

    getName(): string {
        return this.name;
    }

    getValue(): string {
        return this.value;
    }

    getSignature(): string | null {
        return this.signature;
    }
}

/** upstream: SkullBlockEntity.Profile */
export class Profile {
    /** upstream: java.util.UUID — ported as its canonical string representation */
    id: string | null = null;
    name: string | null = null;
    properties: Property[] = [];

    getId(): string | null {
        return this.id;
    }

    getName(): string | null {
        return this.name;
    }

    getProperties(): Property[] {
        return this.properties;
    }
}

export class SkullBlockEntity extends MCABlockEntity {
    customName: string | null = null;
    noteBlockSound: string | null = null;
    profile: Profile | null = null;

    getCustomName(): string | null {
        return this.customName;
    }

    getNoteBlockSound(): string | null {
        return this.noteBlockSound;
    }

    getProfile(): Profile | null {
        return this.profile;
    }
}

const PROPERTY_SCHEMA: ObjectSchema<Property> = {
    create: () => new Property(),
    fields: {
        name: { type: STRING },
        value: { type: STRING },
        signature: { type: STRING },
    },
};

const PROFILE_SCHEMA: ObjectSchema<Profile> = {
    create: () => new Profile(),
    fields: {
        id: { type: UUID_TOKEN },
        name: { type: STRING },
        properties: { type: listOf(PROPERTY_TOKEN) },
    },
};

const SKULL_BLOCK_ENTITY_SCHEMA: ObjectSchema<SkullBlockEntity> = {
    create: () => new SkullBlockEntity(),
    fields: {
        ...MCA_BLOCK_ENTITY_FIELDS,
        customName: { type: STRING },
        noteBlockSound: { type: STRING },
        profile: { type: PROFILE_TOKEN },
    },
};

export function registerSkullBlockEntitySchemas(nbt: BlueNBT): void {
    nbt.register(PROPERTY_TOKEN, PROPERTY_SCHEMA);
    nbt.register(PROFILE_TOKEN, PROFILE_SCHEMA);
    nbt.register(SKULL_BLOCK_ENTITY_TOKEN, SKULL_BLOCK_ENTITY_SCHEMA);
}
