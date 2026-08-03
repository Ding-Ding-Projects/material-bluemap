import {
    IllegalStateException,
    TagType,
    TypeToken,
    type NBTReader,
    type TypeDeserializer,
} from "@material-bluemap/nbt";
import { Vector2i } from "@material-bluemap/shared";

export const VECTOR2I_TOKEN: TypeToken<Vector2i> = TypeToken.of("Vector2i");

export class Vector2iDeserializer implements TypeDeserializer<Vector2i> {
    read(reader: NBTReader): Vector2i {
        const tag = reader.peek();

        switch (tag) {
            case TagType.INT_ARRAY:
            case TagType.LONG_ARRAY:
            case TagType.BYTE_ARRAY: {
                const values = reader.nextArrayAsLongArray();
                if (values.length !== 2)
                    throw new IllegalStateException("Unexpected array length: " + values.length);
                return new Vector2i(Number(values[0]!), Number(values[1]!));
            }

            case TagType.LIST: {
                reader.beginList();
                const x = reader.nextDouble();
                const y = reader.nextDouble();
                const value = new Vector2i(x, y);
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
                            x = reader.nextDouble();
                            break;
                        case "y":
                        case "z":
                            y = reader.nextDouble();
                            break;
                        default:
                            reader.skip();
                            break;
                    }
                }
                reader.endCompound();
                return new Vector2i(x, y);
            }

            default:
                throw new IllegalStateException("Unexpected tag-type: " + tag);
        }
    }
}
