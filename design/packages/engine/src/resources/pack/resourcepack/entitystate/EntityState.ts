import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asArray, asObject, type JsonValue } from "../../../adapter/JsonMapper.js";
import { Part } from "./Part.js";

/** upstream: entitystate/EntityState.java */
export class EntityState {
    private parts: (Part | null)[] | null = null;

    /** upstream: the private no-args constructor gson instantiates with */
    constructor();
    /** upstream: the lombok {@code @AllArgsConstructor} */
    constructor(parts: (Part | null)[] | null);
    constructor(parts?: (Part | null)[] | null) {
        if (parts === undefined) return;
        this.parts = parts;
    }

    getParts(): (Part | null)[] | null {
        return this.parts;
    }

    /**
     * Port addition: upstream leaves EntityState to gson's reflective adapter; this
     * reads the same single member explicitly.
     */
    static readonly Adapter: JsonAdapter<EntityState> = {
        read(json: JsonValue): EntityState {
            const object = asObject(json);
            const entityState = new EntityState();

            const parts = object["parts"];
            if (parts != null) {
                entityState.parts = asArray(parts).map((part) =>
                    part == null ? null : Part.Adapter.read(part),
                );
            }

            return entityState;
        },
    };
}
