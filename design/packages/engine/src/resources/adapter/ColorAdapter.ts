import { Color } from "@material-bluemap/shared";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import {
    isJsonArray,
    isJsonObject,
    nextDouble,
    nextInt,
    JsonParseError,
    type JsonValue,
} from "./JsonMapper.js";

export class ColorAdapter implements JsonAdapter<Color> {
    write(value: Color): JsonValue {
        value.straight();
        return [value.r, value.g, value.b, value.a];
    }

    read(json: JsonValue): Color {
        const value = new Color();
        if (isJsonArray(json)) {
            value.set(
                nextDouble(json[0] ?? null),
                nextDouble(json[1] ?? null),
                nextDouble(json[2] ?? null),
                json.length > 3 ? nextDouble(json[3] ?? null) : 1,
                false
            );
        } else if (isJsonObject(json)) {
            value.a = 1;
            for (const [n, member] of Object.entries(json)) {
                const v = nextDouble(member);

                switch (n) {
                    case "r":
                        value.r = v;
                        break;
                    case "g":
                        value.g = v;
                        break;
                    case "b":
                        value.b = v;
                        break;
                    case "a":
                        value.a = v;
                        break;
                }
            }
        } else if (typeof json === "string") {
            value.parse(json);
        } else if (typeof json === "number") {
            let color = nextInt(json);
            if ((color & 0xff000000) === 0) color = color | 0xff000000; // assume full alpha if not specified
            value.set(color);
        } else if (json === null) {
            // keep defaults
        } else {
            throw new JsonParseError("Unexpected token while parsing Color:" + typeof json);
        }
        return value;
    }
}
