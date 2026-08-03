import { Vector4f } from "@material-bluemap/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { JsonParseError, nextDouble, type JsonValue } from "./JsonMapper.js";

export class Vector4fAdapter implements JsonAdapter<Vector4f> {
    write(value: Vector4f): JsonValue {
        return [value.getX(), value.getY(), value.getZ(), value.getW()];
    }

    read(json: JsonValue): Vector4f {
        if (!Array.isArray(json) || json.length !== 4)
            throw new JsonParseError("Expected an array of 4 numbers");
        return new Vector4f(
            nextDouble(json[0] ?? null),
            nextDouble(json[1] ?? null),
            nextDouble(json[2] ?? null),
            nextDouble(json[3] ?? null)
        );
    }
}
