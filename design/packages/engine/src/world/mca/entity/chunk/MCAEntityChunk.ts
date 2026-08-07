import { INT, TypeToken, listOf, type BlueNBT, type ObjectSchema } from "@worldlens/nbt";
import { Vector2i } from "@worldlens/shared";
import type { Entity } from "../../../Entity.js";
import { ENTITY_TOKEN } from "../../data/EntityTypeResolver.js";
import { VECTOR2I_TOKEN } from "../../data/Vector2iDeserializer.js";

export const MCA_ENTITY_CHUNK_TOKEN: TypeToken<MCAEntityChunk> = TypeToken.of("MCAEntityChunk");

const EMPTY_ENTITIES: Entity[] = [];

export class MCAEntityChunk {
    static readonly EMPTY_CHUNK: MCAEntityChunk = new MCAEntityChunk();
    static readonly ERRORED_CHUNK: MCAEntityChunk = new MCAEntityChunk();

    entities: Entity[] = EMPTY_ENTITIES; // @NBTName("Entities")

    dataVersion = -1; // @NBTName("DataVersion")

    position: Vector2i = Vector2i.ZERO; // @NBTName("Position")

    getEntities(): Entity[] {
        return this.entities;
    }

    getDataVersion(): number {
        return this.dataVersion;
    }

    getPosition(): Vector2i {
        return this.position;
    }
}

const MCA_ENTITY_CHUNK_SCHEMA: ObjectSchema<MCAEntityChunk> = {
    create: () => new MCAEntityChunk(),
    fields: {
        entities: { names: ["Entities"], type: listOf(ENTITY_TOKEN) },
        dataVersion: { names: ["DataVersion"], type: INT },
        position: { names: ["Position"], type: VECTOR2I_TOKEN },
    },
};

export function registerMCAEntityChunkSchema(nbt: BlueNBT): void {
    nbt.register(MCA_ENTITY_CHUNK_TOKEN, MCA_ENTITY_CHUNK_SCHEMA);
}
