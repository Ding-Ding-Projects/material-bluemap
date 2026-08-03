import { Direction } from "../../util/Direction.js";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { nextString, type JsonValue } from "./JsonMapper.js";

export class DirectionAdapter implements JsonAdapter<Direction> {
    write(value: Direction): JsonValue {
        return value.name().toLowerCase();
    }

    read(json: JsonValue): Direction {
        const name = nextString(json);
        if (name.toLowerCase() === "bottom") return Direction.DOWN;
        if (name.toLowerCase() === "top") return Direction.UP;
        return Direction.fromString(name);
    }
}
