import {
    CollectionAdapter,
    TagType,
    type BlueNBT,
    type NBTReader,
    type TypeDeserializer,
} from "@worldlens/nbt";
import type { BlockEntity } from "../../BlockEntity.js";
import { BLOCK_ENTITY_TOKEN } from "./BlockEntityTypeResolver.js";

const EMPTY_BLOCK_ENTITIES_ARRAY: (BlockEntity | null)[] = [];

export class LenientBlockEntityArrayDeserializer implements TypeDeserializer<
    (BlockEntity | null)[]
> {
    private readonly delegate: TypeDeserializer<BlockEntity[]>;

    constructor(blueNBT: BlueNBT) {
        // upstream: blueNBT.getTypeDeserializer(new TypeToken<BlockEntity[]>() {})
        this.delegate = new CollectionAdapter<BlockEntity>(blueNBT, BLOCK_ENTITY_TOKEN);
    }

    read(reader: NBTReader): (BlockEntity | null)[] {
        if (reader.peek() !== TagType.LIST) {
            reader.skip();
            return EMPTY_BLOCK_ENTITIES_ARRAY;
        }
        return this.delegate.read(reader);
    }
}
