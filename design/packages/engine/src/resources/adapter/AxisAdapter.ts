import { Axis } from "../../util/math/Axis.js";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { nextString, type JsonValue } from "./JsonMapper.js";

export class AxisAdapter implements JsonAdapter<Axis> {
    write(value: Axis): JsonValue {
        return value.name().toLowerCase();
    }

    read(json: JsonValue): Axis {
        return Axis.fromString(nextString(json));
    }
}
