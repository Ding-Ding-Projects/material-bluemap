import { Key } from "@material-bluemap/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { nextString, type JsonValue } from "./JsonMapper.js";

export class KeyAdapter implements JsonAdapter<Key> {
    write(value: Key): JsonValue {
        return value.getFormatted();
    }

    read(json: JsonValue): Key {
        return Key.parse(nextString(json));
    }
}
