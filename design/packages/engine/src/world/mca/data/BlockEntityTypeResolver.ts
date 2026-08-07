import { TypeToken, type IOException, type TypeResolver } from "@worldlens/nbt";
import type { BlockEntity } from "../../BlockEntity.js";
import { BlockEntityType } from "../blockentity/BlockEntityType.js";
import { MCABlockEntity, MCA_BLOCK_ENTITY_TOKEN } from "../blockentity/MCABlockEntity.js";
import { logDebug } from "../MCAUtil.js";

export const BLOCK_ENTITY_TOKEN: TypeToken<BlockEntity> = TypeToken.of("BlockEntity");

const TYPE_TOKEN: TypeToken<MCABlockEntity> = MCA_BLOCK_ENTITY_TOKEN;

export class BlockEntityTypeResolver implements TypeResolver<BlockEntity, MCABlockEntity> {
    getBaseType(): TypeToken<MCABlockEntity> {
        return TYPE_TOKEN;
    }

    resolve(base: MCABlockEntity): TypeToken<BlockEntity> {
        const type = BlockEntityType.REGISTRY.get(base.getId());
        if (type == null) return TYPE_TOKEN;
        return type.getBlockEntityClass();
    }

    getPossibleTypes(): Iterable<TypeToken<BlockEntity>> {
        return [
            TYPE_TOKEN as TypeToken<BlockEntity>,
            ...BlockEntityType.REGISTRY.values().map((type) => type.getBlockEntityClass()),
        ];
    }

    onException(parseException: IOException, base?: MCABlockEntity): BlockEntity {
        // upstream: only the (exception, base) overload is overridden — the base-less
        // default rethrows
        if (base === undefined) throw parseException;
        logDebug(
            `Failed to parse block-entity of type '${String(base.getId())}': ${String(parseException)}`,
        );
        return base;
    }
}
