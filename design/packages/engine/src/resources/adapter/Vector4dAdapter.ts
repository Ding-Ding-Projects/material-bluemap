import { Vector4d } from "@worldlens/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { JsonParseError, nextDouble, type JsonValue } from "./JsonMapper.js";

export class Vector4dAdapter implements JsonAdapter<Vector4d> {
    write(value: Vector4d): JsonValue {
        return [value.getX(), value.getY(), value.getZ(), value.getW()];
    }

    read(json: JsonValue): Vector4d {
        if (!Array.isArray(json) || json.length !== 4)
            throw new JsonParseError("Expected an array of 4 numbers");
        return new Vector4d(
            nextDouble(json[0] ?? null),
            nextDouble(json[1] ?? null),
            nextDouble(json[2] ?? null),
            nextDouble(json[3] ?? null)
        );
    }
}
