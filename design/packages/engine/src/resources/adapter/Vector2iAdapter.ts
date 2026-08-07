import { Vector2i } from "@worldlens/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { JsonParseError, nextDouble, type JsonValue } from "./JsonMapper.js";

export class Vector2iAdapter implements JsonAdapter<Vector2i> {
    write(value: Vector2i): JsonValue {
        return [value.getX(), value.getY()];
    }

    read(json: JsonValue): Vector2i {
        if (!Array.isArray(json) || json.length !== 2)
            throw new JsonParseError("Expected an array of 2 numbers");
        // flow-math's double-constructor floors the components
        return new Vector2i(nextDouble(json[0] ?? null), nextDouble(json[1] ?? null));
    }
}
