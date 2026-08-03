import {
    IllegalStateException,
    TagType,
    TypeToken,
    type NBTReader,
    type TypeDeserializer,
} from "@material-bluemap/nbt";
import { Vector3i } from "@material-bluemap/shared";

export const VECTOR3I_TOKEN: TypeToken<Vector3i> = TypeToken.of("Vector3i");

export class Vector3iDeserializer implements TypeDeserializer<Vector3i> {
    read(reader: NBTReader): Vector3i {
        const tag = reader.peek();

        switch (tag) {
            case TagType.INT_ARRAY:
            case TagType.LONG_ARRAY:
            case TagType.BYTE_ARRAY: {
                const values = reader.nextArrayAsLongArray();
                if (values.length !== 3)
                    throw new IllegalStateException("Unexpected array length: " + values.length);
                return new Vector3i(Number(values[0]!), Number(values[1]!), Number(values[2]!));
            }

            case TagType.LIST: {
                reader.beginList();
                const x = reader.nextInt();
                const y = reader.nextInt();
                const z = reader.nextInt();
                const value = new Vector3i(x, y, z);
                reader.endList();
                return value;
            }

            case TagType.COMPOUND: {
                let x = 0,
                    y = 0,
                    z = 0;
                reader.beginCompound();
                while (reader.peek() !== TagType.END) {
                    switch (reader.name()) {
                        case "x":
                            x = reader.nextInt();
                            break;
                        case "y":
                            y = reader.nextInt();
                            break;
                        case "z":
                            z = reader.nextInt();
                            break;
                        default:
                            reader.skip();
                            break;
                    }
                }
                reader.endCompound();
                return new Vector3i(x, y, z);
            }

            default:
                throw new IllegalStateException("Unexpected tag-type: " + tag);
        }
    }
}
