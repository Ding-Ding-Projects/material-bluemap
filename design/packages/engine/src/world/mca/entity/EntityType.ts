import type { TypeToken } from "@worldlens/nbt";
import { Registry, type Key, type Keyed } from "@worldlens/shared";
import type { Entity } from "../../Entity.js";

export interface EntityType extends Keyed {
    /** upstream: {@code Class<? extends Entity> getEntityClass()} — the port identifies types by TypeToken */
    getEntityClass(): TypeToken<Entity>;
}

/** upstream: EntityType.Impl */
class Impl implements EntityType {
    constructor(
        private readonly key: Key,
        private readonly entityClass: TypeToken<Entity>,
    ) {}

    getKey(): Key {
        return this.key;
    }

    getEntityClass(): TypeToken<Entity> {
        return this.entityClass;
    }
}

export const EntityType = {
    REGISTRY: new Registry<EntityType>(),

    Impl,
};
