import { Vector3f } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { EntityRendererType } from "../../../../map/hires/entity/EntityRendererType.js";
import { parse } from "../../../adapter/JsonMapper.js";
import { ResourcePath } from "../../../ResourcePath.js";
import type { Model } from "../model/Model.js";
import { EntityState } from "./EntityState.js";
import { Part } from "./Part.js";

function read(json: string): EntityState {
    return EntityState.Adapter.read(parse(json));
}

describe("EntityState", () => {
    it("has no parts by default", () => {
        expect(read("{}").getParts()).toBeNull();
        expect(new EntityState().getParts()).toBeNull();
    });

    it("reads its parts", () => {
        const state = read(
            '{"parts": [' +
                '{"model": "bluemap:entity/sign", "position": [0, 1, 0]}, ' +
                '{"renderer": "missing", "model": "bluemap:entity/other"}' +
                "]}",
        );

        const parts = state.getParts();
        expect(parts?.length).toBe(2);
        expect(parts?.[0]?.getModel().getFormatted()).toBe("bluemap:entity/sign");
        expect(parts?.[0]?.getPosition()).toEqual(new Vector3f(0, 1, 0));
        expect(parts?.[0]?.isTransformed()).toBe(true);
        expect(parts?.[1]?.getRenderer()).toBe(EntityRendererType.MISSING);
    });

    it("accepts a single part in place of the array (gson single-value-as-array)", () => {
        const state = read('{"parts": {"model": "bluemap:entity/sign"}}');
        expect(state.getParts()?.length).toBe(1);
    });

    it("preserves null entries", () => {
        const state = read('{"parts": [null, {"model": "bluemap:entity/sign"}]}');
        expect(state.getParts()?.[0]).toBeNull();
        expect(state.getParts()?.[1]).not.toBeNull();
    });

    it("the all-args constructor keeps the given parts", () => {
        const part = new Part(new ResourcePath<Model>("bluemap:entity/sign"));
        const state = new EntityState([part]);
        expect(state.getParts()).toEqual([part]);
    });
});
