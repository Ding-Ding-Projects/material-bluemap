import { Vector3f } from "@material-bluemap/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { JsonParseError, nextDouble, type JsonValue } from "./JsonMapper.js";

export class Vector3fAdapter implements JsonAdapter<Vector3f> {
    write(value: Vector3f): JsonValue {
        return [value.getX(), value.getY(), value.getZ()];
    }

    read(json: JsonValue): Vector3f {
        if (!Array.isArray(json) || json.length !== 3)
            throw new JsonParseError("Expected an array of 3 numbers");
        return new Vector3f(
            nextDouble(json[0] ?? null),
            nextDouble(json[1] ?? null),
            nextDouble(json[2] ?? null)
        );
    }
}
