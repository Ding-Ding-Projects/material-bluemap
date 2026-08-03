import { TypeToken, type IOException, type TypeResolver } from "@material-bluemap/nbt";
import type { Entity } from "../../Entity.js";
import { EntityType } from "../entity/EntityType.js";
import { MCAEntity, MCA_ENTITY_TOKEN } from "../entity/MCAEntity.js";
import { logDebug } from "../MCAUtil.js";

export const ENTITY_TOKEN: TypeToken<Entity> = TypeToken.of("Entity");

const TYPE_TOKEN: TypeToken<MCAEntity> = MCA_ENTITY_TOKEN;

export class EntityTypeResolver implements TypeResolver<Entity, MCAEntity> {
    getBaseType(): TypeToken<MCAEntity> {
        return TYPE_TOKEN;
    }

    resolve(base: MCAEntity): TypeToken<Entity> {
        const type = EntityType.REGISTRY.get(base.getId());
        if (type == null) return TYPE_TOKEN;
        return type.getEntityClass();
    }

    getPossibleTypes(): Iterable<TypeToken<Entity>> {
        return [
            TYPE_TOKEN as TypeToken<Entity>,
            ...EntityType.REGISTRY.values().map((type) => type.getEntityClass()),
        ];
    }

    onException(parseException: IOException, base?: MCAEntity): Entity {
        // upstream: only the (exception, base) overload is overridden — the base-less
        // default rethrows
        if (base === undefined) throw parseException;
        logDebug(
            `Failed to parse block-entity of type '${String(base.getId())}': ${String(parseException)}`,
        );
        return base;
    }
}
