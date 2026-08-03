import {
    IllegalStateException,
    TagType,
    TypeToken,
    type NBTReader,
    type TypeDeserializer,
} from "@material-bluemap/nbt";
import { Vector3d } from "@material-bluemap/shared";

export const VECTOR3D_TOKEN: TypeToken<Vector3d> = TypeToken.of("Vector3d");

export class Vector3dDeserializer implements TypeDeserializer<Vector3d> {
    read(reader: NBTReader): Vector3d {
        const tag = reader.peek();

        switch (tag) {
            case TagType.INT_ARRAY:
            case TagType.LONG_ARRAY:
            case TagType.BYTE_ARRAY: {
                const values = reader.nextArrayAsLongArray();
                if (values.length !== 3)
                    throw new IllegalStateException("Unexpected array length: " + values.length);
                return new Vector3d(Number(values[0]!), Number(values[1]!), Number(values[2]!));
            }

            case TagType.LIST: {
                reader.beginList();
                const x = reader.nextDouble();
                const y = reader.nextDouble();
                const z = reader.nextDouble();
                const value = new Vector3d(x, y, z);
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
                            x = reader.nextDouble();
                            break;
                        case "y":
                            y = reader.nextDouble();
                            break;
                        case "z":
                            z = reader.nextDouble();
                            break;
                        default:
                            reader.skip();
                            break;
                    }
                }
                reader.endCompound();
                return new Vector3d(x, y, z);
            }

            default:
                throw new IllegalStateException("Unexpected tag-type: " + tag);
        }
    }
}
