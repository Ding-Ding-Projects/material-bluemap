import { TypeToken, type NBTReader, type TypeDeserializer } from "@material-bluemap/nbt";
import { Key } from "@material-bluemap/shared";

export const KEY_TOKEN: TypeToken<Key> = TypeToken.of("Key");

export class KeyDeserializer implements TypeDeserializer<Key> {
    read(reader: NBTReader): Key {
        return Key.parse(reader.nextString(), Key.MINECRAFT_NAMESPACE);
    }
}
