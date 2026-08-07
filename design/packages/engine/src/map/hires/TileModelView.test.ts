import { MatrixM3f, MatrixM4f } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { ArrayTileModel } from "./ArrayTileModel.js";
import { TileModelView } from "./TileModelView.js";
import { VoidTileModel } from "./VoidTileModel.js";

/** upstream: map/hires/TileModelView.java */
describe("TileModelView", () => {
    const positionsOf = (model: ArrayTileModel, face: number): number[] =>
        [...model.position.subarray(face * 9, face * 9 + 9)];

    const addFace = (view: TileModelView, model: ArrayTileModel, value: number): number => {
        const face = view.add(1);
        model.setPositions(face, value, value, value, value, value, value, value, value, value);
        return face;
    };

    it("anchors at the model's current end", () => {
        const model = new ArrayTileModel(8);
        model.add(3);

        const view = new TileModelView(model);
        expect(view.getTileModel()).toBe(model);
        expect(view.getStart()).toBe(3);
        expect(view.getSize()).toBe(0);
    });

    it("initialize(start) claims everything from `start` to the model's end", () => {
        const model = new ArrayTileModel(8);
        model.add(5);
        const view = new TileModelView(model);

        view.initialize(2);
        expect(view.getStart()).toBe(2);
        expect(view.getSize()).toBe(3);
    });

    it("initialize(model) and initialize(model, start) re-target the view", () => {
        const first = new ArrayTileModel(4);
        first.add(1);
        const second = new ArrayTileModel(4);
        second.add(4);

        const view = new TileModelView(first);

        view.initialize(second);
        expect(view.getTileModel()).toBe(second);
        expect(view.getStart()).toBe(4);
        expect(view.getSize()).toBe(0);

        view.initialize(second, 1);
        expect(view.getStart()).toBe(1);
        expect(view.getSize()).toBe(3);
    });

    it("add() grows the window and returns the model's face index", () => {
        const model = new ArrayTileModel(8);
        model.add(2);
        const view = new TileModelView(model);

        expect(view.add(3)).toBe(2);
        expect(view.getStart()).toBe(2);
        expect(view.getSize()).toBe(3);
        expect(model.size()).toBe(5);
    });

    it("refuses to add when the model changed behind the view's back", () => {
        const model = new ArrayTileModel(8);
        const view = new TileModelView(model);
        view.add(1);

        model.add(1); // an external write the view does not know about

        expect(() => view.add(1)).toThrow(/external changes since view-initialisation/);
    });

    it("reset() rewinds the model to the view's start", () => {
        const model = new ArrayTileModel(8);
        model.add(2);
        const view = new TileModelView(model);
        view.add(3);
        expect(model.size()).toBe(5);

        view.reset();
        expect(model.size()).toBe(2);
        expect(view.getSize()).toBe(0);
        expect(view.getStart()).toBe(2);
    });

    it("applies transforms only to the faces inside the window", () => {
        const model = new ArrayTileModel(8);
        const view = new TileModelView(model);
        addFace(view, model, 1); // face 0, outside the next window

        view.initialize();
        addFace(view, model, 2); // face 1
        addFace(view, model, 3); // face 2

        view.translate(10, 20, 30);

        expect(positionsOf(model, 0)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
        expect(positionsOf(model, 1)).toEqual([12, 22, 32, 12, 22, 32, 12, 22, 32]);
        expect(positionsOf(model, 2)).toEqual([13, 23, 33, 13, 23, 33, 13, 23, 33]);
    });

    it("forwards every geometry op to the model over the same range", () => {
        const build = (): [ArrayTileModel, TileModelView] => {
            const model = new ArrayTileModel(4);
            const view = new TileModelView(model);
            const face = view.add(1);
            model.setPositions(face, 1, 2, 3, 4, 5, 6, 7, 8, 9);
            model.setUvs(face, 1, 2, 3, 4, 5, 6);
            model.setAOs(face, 0.25, 0.5, 0.75);
            return [model, view];
        };

        const cases: [(v: TileModelView) => void, (m: ArrayTileModel) => void][] = [
            [(v) => void v.rotate(30, 0, 1, 0), (m) => void m.rotate(0, 1, 30, 0, 1, 0)],
            [(v) => void v.rotateXYZ(10, 20, 30), (m) => void m.rotateXYZ(0, 1, 10, 20, 30)],
            [(v) => void v.rotateZYX(10, 20, 30), (m) => void m.rotateZYX(0, 1, 10, 20, 30)],
            [(v) => void v.rotateYXZ(10, 20, 30), (m) => void m.rotateYXZ(0, 1, 10, 20, 30)],
            [(v) => void v.scale(2, 3, 4), (m) => void m.scale(0, 1, 2, 3, 4)],
            [(v) => void v.translate(2, 3, 4), (m) => void m.translate(0, 1, 2, 3, 4)],
            [(v) => void v.invertOrientation(), (m) => void m.invertOrientation(0, 1)],
        ];

        for (const [viaView, viaModel] of cases) {
            const [viewModel, view] = build();
            const [directModel] = build();
            viaView(view);
            viaModel(directModel);
            expect([...viewModel.position]).toEqual([...directModel.position]);
            expect([...viewModel.uv]).toEqual([...directModel.uv]);
            expect([...viewModel.ao]).toEqual([...directModel.ao]);
        }
    });

    it("forwards all three transform shapes", () => {
        const build = (): [ArrayTileModel, TileModelView] => {
            const model = new ArrayTileModel(4);
            const view = new TileModelView(model);
            const face = view.add(1);
            model.setPositions(face, 1, 2, 3, 4, 5, 6, 7, 8, 9);
            return [model, view];
        };

        const m3 = new MatrixM3f().set(0.5, 0.25, -0.75, 0, 2, 0.5, -1, 0.125, 3);
        const m4 = new MatrixM4f().set(
            0.5, 0.25, -0.75, 1,
            0, 2, 0.5, -2,
            -1, 0.125, 3, 0.5,
            0, 0, 0, 1,
        );

        const [viaM3Model, viaM3] = build();
        viaM3.transform(m3);
        const [via9Model, via9] = build();
        via9.transform(0.5, 0.25, -0.75, 0, 2, 0.5, -1, 0.125, 3);
        expect([...viaM3Model.position]).toEqual([...via9Model.position]);

        const [viaM4Model, viaM4] = build();
        viaM4.transform(m4);
        const [via16Model, via16] = build();
        via16.transform(
            0.5, 0.25, -0.75, 1,
            0, 2, 0.5, -2,
            -1, 0.125, 3, 0.5,
            0, 0, 0, 1,
        );
        expect([...viaM4Model.position]).toEqual([...via16Model.position]);
        expect([...viaM4Model.position]).not.toEqual([...viaM3Model.position]);
    });

    it("works over a VoidTileModel, where add() always returns 0", () => {
        const view = new TileModelView(VoidTileModel.INSTANCE);
        expect(view.getStart()).toBe(0);
        expect(view.add(4)).toBe(0);
        // the void model's size stays 0, so the view's own bookkeeping drifts — exactly as
        // upstream, which relies on nothing but "the calls are accepted"
        expect(view.getSize()).toBe(4);
        expect(() => view.translate(1, 2, 3).invertOrientation().reset()).not.toThrow();
    });
});
