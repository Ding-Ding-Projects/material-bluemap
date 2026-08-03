import type { TypeToken, TypeResolver } from "@material-bluemap/nbt";
import {
    LEGACY_SIGN_BLOCK_ENTITY_TOKEN,
    SIGN_BLOCK_ENTITY_TOKEN,
    type SignBlockEntity,
} from "../blockentity/SignBlockEntity.js";

const BASE_TYPE_TOKEN = SIGN_BLOCK_ENTITY_TOKEN;
const LEGACY_TYPE_TOKEN = LEGACY_SIGN_BLOCK_ENTITY_TOKEN;

const POSSIBLE_TYPES: readonly TypeToken<SignBlockEntity>[] = [BASE_TYPE_TOKEN, LEGACY_TYPE_TOKEN];

export class SignBlockEntityTypeResolver implements TypeResolver<SignBlockEntity, SignBlockEntity> {
    getBaseType(): TypeToken<SignBlockEntity> {
        return BASE_TYPE_TOKEN;
    }

    resolve(base: SignBlockEntity): TypeToken<SignBlockEntity> {
        if (base.getFrontText() == null) return LEGACY_TYPE_TOKEN;
        return BASE_TYPE_TOKEN;
    }

    getPossibleTypes(): Iterable<TypeToken<SignBlockEntity>> {
        return POSSIBLE_TYPES;
    }
}
