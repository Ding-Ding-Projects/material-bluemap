import { TypeToken } from "@worldlens/nbt";
import { Key, Registry, type Keyed } from "@worldlens/shared";
import type { BlockEntity } from "../../BlockEntity.js";
import { SIGN_BLOCK_ENTITY_TOKEN } from "./SignBlockEntity.js";
import { SKULL_BLOCK_ENTITY_TOKEN } from "./SkullBlockEntity.js";
import { BANNER_BLOCK_ENTITY_TOKEN } from "./BannerBlockEntity.js";

export interface BlockEntityType extends Keyed {
    /** upstream: {@code Class<? extends BlockEntity> getBlockEntityClass()} — the port identifies types by TypeToken */
    getBlockEntityClass(): TypeToken<BlockEntity>;
}

/** upstream: BlockEntityType.Impl */
class Impl implements BlockEntityType {
    constructor(
        private readonly key: Key,
        private readonly blockEntityClass: TypeToken<BlockEntity>,
    ) {}

    getKey(): Key {
        return this.key;
    }

    getBlockEntityClass(): TypeToken<BlockEntity> {
        return this.blockEntityClass;
    }
}

const SIGN: BlockEntityType = new Impl(Key.minecraft("sign"), SIGN_BLOCK_ENTITY_TOKEN);
const HANGING_SIGN: BlockEntityType = new Impl(
    Key.minecraft("hanging_sign"),
    SIGN_BLOCK_ENTITY_TOKEN,
);
const SKULL: BlockEntityType = new Impl(Key.minecraft("skull"), SKULL_BLOCK_ENTITY_TOKEN);
const BANNER: BlockEntityType = new Impl(Key.minecraft("banner"), BANNER_BLOCK_ENTITY_TOKEN);

export const BlockEntityType = {
    SIGN,
    HANGING_SIGN,
    SKULL,
    BANNER,

    REGISTRY: new Registry<BlockEntityType>(SIGN, HANGING_SIGN, SKULL, BANNER),

    Impl,
};
