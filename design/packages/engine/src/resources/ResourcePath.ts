import { Key } from "@material-bluemap/shared";
import type { JsonAdapter } from "./adapter/AbstractTypeAdapterFactory.js";
import { nextString, type JsonValue } from "./adapter/JsonMapper.js";

function parsePath(filePath: string, namespacePos: number, valuePos: number): string {
    // upstream operates on java.nio Paths; the VFS-port uses posix-style relative
    // path-strings, so the name-segments are the "/"-split parts
    const names = filePath.split("/").filter((name) => name !== "");
    if (names.length <= valuePos)
        throw new Error("The provided filePath has not enough segments!");

    const namespace = names[namespacePos]!;
    let path = names.slice(valuePos).join("/");

    // remove file-ending
    const dotIndex = path.lastIndexOf(".");
    if (dotIndex !== -1) path = path.substring(0, dotIndex);

    return namespace + ":" + path;
}

export class ResourcePath<T> extends Key {
    private resource: T | null = null;

    constructor(formatted: string);
    constructor(namespace: string, value: string);
    constructor(key: Key);
    constructor(filePath: string, namespacePos: number, valuePos: number);
    constructor(a: string | Key, b?: string | number, c?: number) {
        if (a instanceof Key) {
            super(a.getNamespace(), a.getValue());
        } else if (typeof b === "string") {
            super(a, b);
        } else if (typeof b === "number") {
            super(parsePath(a, b, c as number));
        } else {
            super(a.toLowerCase());
        }
    }

    getResource(): T | null;
    getResource(supplier: (key: Key) => T | null): T | null;
    getResource(supplier?: (key: Key) => T | null): T | null {
        if (supplier !== undefined) {
            if (this.resource == null) this.resource = supplier(this);
        }
        return this.resource;
    }

    setResource(resource: T): void {
        this.resource = resource;
    }

    /** upstream: ResourcePath.Adapter (a gson TypeAdapterFactory) */
    static readonly Adapter: JsonAdapter<ResourcePath<unknown>> = {
        write(value: ResourcePath<unknown>): JsonValue {
            return value.getFormatted();
        },

        read(json: JsonValue): ResourcePath<unknown> {
            return new ResourcePath(nextString(json));
        },
    };
}
