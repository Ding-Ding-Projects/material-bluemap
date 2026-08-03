import { MatrixM3f, MatrixM4f } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import type { TileModel } from "./TileModel.js";
import { VoidTileModel } from "./VoidTileModel.js";

/** upstream: map/hires/VoidTileModel.java */
describe("VoidTileModel", () => {
    it("exposes a shared INSTANCE", () => {
        expect(VoidTileModel.INSTANCE).toBeInstanceOf(VoidTileModel);
        expect(VoidTileModel.INSTANCE).toBe(VoidTileModel.INSTANCE);
    });

    it("is always empty and never allocates a face", () => {
        const model = new VoidTileModel();
        expect(model.size()).toBe(0);
        expect(model.add(100)).toBe(0);
        expect(model.size()).toBe(0);
        expect(model.reset(50).size()).toBe(0);
        expect(model.clear().size()).toBe(0);
    });

    it("discards every write and returns itself, so calls can be chained", () => {
        const model: TileModel = new VoidTileModel();

        expect(model.setPositions(0, 1, 2, 3, 4, 5, 6, 7, 8, 9)).toBe(model);
        expect(model.setUvs(0, 1, 2, 3, 4, 5, 6)).toBe(model);
        expect(model.setAOs(0, 1, 2, 3)).toBe(model);
        expect(model.setColor(0, 1, 2, 3)).toBe(model);
        expect(model.setSunlight(0, 15)).toBe(model);
        expect(model.setBlocklight(0, 15)).toBe(model);
        expect(model.setMaterialIndex(0, 3)).toBe(model);
        expect(model.invertOrientation(0)).toBe(model);
        expect(model.invertOrientation(0, 10)).toBe(model);
        expect(model.rotate(0, 1, 45, 0, 1, 0)).toBe(model);
        expect(model.rotateXYZ(0, 1, 1, 2, 3)).toBe(model);
        expect(model.rotateZYX(0, 1, 1, 2, 3)).toBe(model);
        expect(model.rotateYXZ(0, 1, 1, 2, 3)).toBe(model);
        expect(model.rotateByQuaternion(0, 1, 0, 0, 0, 1)).toBe(model);
        expect(model.scale(0, 1, 2, 3, 4)).toBe(model);
        expect(model.translate(0, 1, 2, 3, 4)).toBe(model);
        expect(model.transform(0, 1, new MatrixM3f())).toBe(model);
        expect(model.transform(0, 1, new MatrixM4f())).toBe(model);
        expect(model.transform(0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1)).toBe(model);
        expect(
            model.transform(0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
        ).toBe(model);
        expect(model.reset(3)).toBe(model);
        expect(model.clear()).toBe(model);
    });

    it("sort() is a no-op", () => {
        expect(() => {
            VoidTileModel.INSTANCE.sort();
        }).not.toThrow();
    });
});
