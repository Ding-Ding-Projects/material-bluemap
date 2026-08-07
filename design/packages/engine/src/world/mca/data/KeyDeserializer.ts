import { TypeToken, type NBTReader, type TypeDeserializer } from "@worldlens/nbt";
import { Key } from "@worldlens/shared";

export const KEY_TOKEN: TypeToken<Key> = TypeToken.of("Key");

export class KeyDeserializer implements TypeDeserializer<Key> {
    read(reader: NBTReader): Key {
        return Key.parse(reader.nextString(), Key.MINECRAFT_NAMESPACE);
    }
}
