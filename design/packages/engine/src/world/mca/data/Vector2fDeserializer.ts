import {
    IllegalStateException,
    TagType,
    TypeToken,
    type NBTReader,
    type TypeDeserializer,
} from "@material-bluemap/nbt";
import { Vector2d } from "@material-bluemap/shared";

/**
 * upstream: Vector2f — the shared math port has no immutable float vector, so a
 * {@link Vector2d} carrying float-rounded components is used instead.
 */
export const VECTOR2F_TOKEN: TypeToken<Vector2d> = TypeToken.of("Vector2f");

export class Vector2fDeserializer implements TypeDeserializer<Vector2d> {
    read(reader: NBTReader): Vector2d {
        const tag = reader.peek();

        switch (tag) {
            case TagType.INT_ARRAY:
            case TagType.LONG_ARRAY:
            case TagType.BYTE_ARRAY: {
                const values = reader.nextArrayAsLongArray();
                if (values.length !== 2)
                    throw new IllegalStateException("Unexpected array length: " + values.length);
                return new Vector2d(
                    Math.fround(Number(values[0]!)),
                    Math.fround(Number(values[1]!)),
                );
            }

            case TagType.LIST: {
                reader.beginList();
                const x = reader.nextFloat();
                const y = reader.nextFloat();
                const value = new Vector2d(x, y);
                reader.endList();
                return value;
            }

            case TagType.COMPOUND: {
                let x = 0,
                    y = 0;
                reader.beginCompound();
                while (reader.peek() !== TagType.END) {
                    switch (reader.name()) {
                        case "x":
                        case "yaw":
                            x = reader.nextFloat();
                            break;
                        case "y":
                        case "z":
                        case "pitch":
                            y = reader.nextFloat();
                            break;
                        default:
                            reader.skip();
                            break;
                    }
                }
                reader.endCompound();
                return new Vector2d(x, y);
            }

            default:
                throw new IllegalStateException("Unexpected tag-type: " + tag);
        }
    }
}
