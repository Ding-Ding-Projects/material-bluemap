import {
    IOException,
    TypeToken,
    type NBTReader,
    type TypeDeserializer,
} from "@worldlens/nbt";
import { Key } from "@worldlens/shared";
import { BlockState } from "../../BlockState.js";

export const BLOCK_STATE_TOKEN: TypeToken<BlockState> = TypeToken.of("BlockState");

export class BlockStateDeserializer implements TypeDeserializer<BlockState> {
    read(reader: NBTReader): BlockState {
        reader.beginCompound();

        let id: string | null = null;
        let properties: Map<string, string> | null = null;

        while (reader.hasNext()) {
            switch (reader.name()) {
                case "Name":
                    id = reader.nextString();
                    break;
                case "Properties": {
                    properties = new Map();
                    reader.beginCompound();
                    while (reader.hasNext()) properties.set(reader.name(), reader.nextString());
                    reader.endCompound();
                    break;
                }
                default:
                    reader.skip();
                    break;
            }
        }

        reader.endCompound();

        if (id == null) throw new IOException("Invalid BlockState, Name is missing!");

        const key = Key.parse(id);
        return properties == null ? new BlockState(key) : new BlockState(key, properties);
    }
}
