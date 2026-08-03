import { Vector3d } from "@material-bluemap/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { JsonParseError, nextDouble, type JsonValue } from "./JsonMapper.js";

export class Vector3dAdapter implements JsonAdapter<Vector3d> {
    write(value: Vector3d): JsonValue {
        return [value.getX(), value.getY(), value.getZ()];
    }

    read(json: JsonValue): Vector3d {
        if (!Array.isArray(json) || json.length !== 3)
            throw new JsonParseError("Expected an array of 3 numbers");
        return new Vector3d(
            nextDouble(json[0] ?? null),
            nextDouble(json[1] ?? null),
            nextDouble(json[2] ?? null)
        );
    }
}
