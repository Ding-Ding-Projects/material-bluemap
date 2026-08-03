import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { AnimationMeta, FrameMeta } from "./AnimationMeta.js";

function read(json: string): AnimationMeta {
    return AnimationMeta.Adapter.read(parse(json));
}

function frames(meta: AnimationMeta): [number, number][] {
    return (meta.getFrames() ?? []).map((frame) => [frame.getIndex(), frame.getTime()]);
}

describe("AnimationMeta", () => {
    describe("defaults", () => {
        it("is 1x1, frametime 1, no interpolation and no frames", () => {
            const meta = read("{}");
            expect(meta.isInterpolate()).toBe(false);
            expect(meta.getWidth()).toBe(1);
            expect(meta.getHeight()).toBe(1);
            expect(meta.getFrametime()).toBe(1);
            expect(meta.getFrames()).toBeNull();
        });

        it("keeps the defaults for an mcmeta without an animation section", () => {
            const meta = read('{"villager": {"hat": "full"}, "pack": {"pack_format": 15}}');
            expect(meta.getWidth()).toBe(1);
            expect(meta.getFrames()).toBeNull();
        });
    });

    it("reads only the animation section, skipping every other top-level key", () => {
        const meta = read(
            '{"pack": {"pack_format": 15}, "animation": {"interpolate": true, "width": 2, "height": 4}, "gui": {}}',
        );
        expect(meta.isInterpolate()).toBe(true);
        expect(meta.getWidth()).toBe(2);
        expect(meta.getHeight()).toBe(4);
    });

    it("skips unknown keys inside the animation section", () => {
        const meta = read('{"animation": {"unknown": [1, 2, 3], "frametime": 4}}');
        expect(meta.getFrametime()).toBe(4);
    });

    describe("frametime", () => {
        it("reads an int", () => {
            expect(read('{"animation": {"frametime": 20}}').getFrametime()).toBe(20);
        });

        it("truncates a float (packs in the wild ship them)", () => {
            expect(read('{"animation": {"frametime": 3.7}}').getFrametime()).toBe(3);
            expect(read('{"animation": {"frametime": 0.5}}').getFrametime()).toBe(0);
            expect(read('{"animation": {"frametime": -2.9}}').getFrametime()).toBe(-2);
        });
    });

    describe("frames", () => {
        it("accepts bare ints", () => {
            const meta = read('{"animation": {"frametime": 3, "frames": [0, 1, 2]}}');
            expect(frames(meta)).toEqual([
                [0, 3],
                [1, 3],
                [2, 3],
            ]);
        });

        it("accepts {index, time} objects", () => {
            const meta = read('{"animation": {"frames": [{"index": 4, "time": 7}]}}');
            expect(frames(meta)).toEqual([[4, 7]]);
        });

        it("mixes both forms and back-fills the global frametime", () => {
            const meta = read(
                '{"animation": {"frametime": 5, "frames": [0, {"index": 1, "time": 20}, {"index": 2}]}}',
            );
            expect(frames(meta)).toEqual([
                [0, 5],
                [1, 20],
                [2, 5],
            ]);
        });

        it("back-fills even when frametime is declared after frames", () => {
            const meta = read('{"animation": {"frames": [0, 1], "frametime": 9}}');
            expect(frames(meta)).toEqual([
                [0, 9],
                [1, 9],
            ]);
        });

        it("truncates a float frame-time", () => {
            const meta = read('{"animation": {"frames": [{"index": 0, "time": 2.9}]}}');
            expect(frames(meta)).toEqual([[0, 2]]);
        });

        it("skips unknown keys of a frame object", () => {
            const meta = read('{"animation": {"frames": [{"index": 3, "extra": true}]}}');
            expect(frames(meta)).toEqual([[3, 1]]);
        });

        it("leaves frames null for an empty array", () => {
            expect(read('{"animation": {"frames": []}}').getFrames()).toBeNull();
        });

        it("rejects a non-array frames value", () => {
            expect(() => read('{"animation": {"frames": {"index": 0}}}')).toThrow(
                /Expected BEGIN_ARRAY/,
            );
        });
    });

    describe("constructors", () => {
        it("the all-args constructor sets every field", () => {
            const meta = new AnimationMeta(true, 2, 3, 4, [new FrameMeta(0, 1)]);
            expect(meta.isInterpolate()).toBe(true);
            expect(meta.getWidth()).toBe(2);
            expect(meta.getHeight()).toBe(3);
            expect(meta.getFrametime()).toBe(4);
            expect(frames(meta)).toEqual([[0, 1]]);
        });

        it("the no-args constructor keeps the defaults", () => {
            expect(new AnimationMeta().getFrametime()).toBe(1);
        });
    });

    describe("write", () => {
        it("emits the fields without the animation wrapper (upstream: the delegate adapter)", () => {
            const meta = read(
                '{"animation": {"interpolate": true, "width": 2, "frametime": 3, "frames": [0, 1]}}',
            );
            expect(AnimationMeta.Adapter.write(meta)).toEqual({
                interpolate: true,
                width: 2,
                height: 1,
                frametime: 3,
                frames: [
                    { index: 0, time: 3 },
                    { index: 1, time: 3 },
                ],
            });
        });

        it("omits a null frames list", () => {
            expect(AnimationMeta.Adapter.write(new AnimationMeta())).toEqual({
                interpolate: false,
                width: 1,
                height: 1,
                frametime: 1,
            });
        });
    });
});
