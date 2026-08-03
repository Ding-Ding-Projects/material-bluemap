import { describe, expect, it } from "vitest";
import { TextureAnimation } from "./TextureAnimation";
import type { TextureAnimationUniforms } from "./TextureAnimation";

function createUniforms(): TextureAnimationUniforms {
    return {
        animationFrameHeight: { value: 1 },
        animationFrameIndex: { value: 0 },
        animationInterpolationFrameIndex: { value: 0 },
        animationInterpolation: { value: 0 },
    };
}

describe("TextureAnimation", () => {
    it("derives frame count and frame height from the texture aspect", () => {
        const uniforms = createUniforms();
        const animation = new TextureAnimation(uniforms, { frametime: 2 });

        animation.init(16, 64); // 4 frames stacked vertically

        expect(animation.frameImages).toBe(4);
        expect(animation.frames).toBe(4);
        expect(uniforms.animationFrameHeight.value).toBe(1 / 4);
        expect(animation.frameTime).toBe(2 * 50);
        expect(animation.data.frames).toBeNull();
    });

    it("steps through frames sequentially without a frames list", () => {
        const uniforms = createUniforms();
        const animation = new TextureAnimation(uniforms, { frametime: 1 });
        animation.init(16, 48); // 3 frames, frameTime 50

        animation.step(60);
        expect(uniforms.animationFrameIndex.value).toBe(1);
        expect(uniforms.animationInterpolationFrameIndex.value).toBe(2);

        animation.step(60);
        expect(uniforms.animationFrameIndex.value).toBe(2);
        expect(uniforms.animationInterpolationFrameIndex.value).toBe(0); // wraps around

        animation.step(60);
        expect(uniforms.animationFrameIndex.value).toBe(0);
    });

    it("uses the frames list for order and per-frame times", () => {
        const uniforms = createUniforms();
        const animation = new TextureAnimation(uniforms, {
            frametime: 1,
            frames: [
                { index: 0, time: 1 },
                { index: 2, time: 3 },
            ],
        });
        animation.init(16, 48); // 3 frame images, but 2 listed frames

        expect(animation.frames).toBe(2);

        animation.step(60);
        expect(uniforms.animationFrameIndex.value).toBe(2);
        expect(uniforms.animationInterpolationFrameIndex.value).toBe(0);
        expect(animation.frameTime).toBe(3 * 50);
    });

    it("writes the interpolation uniform only when interpolate is set", () => {
        const uniforms = createUniforms();
        const animation = new TextureAnimation(uniforms, { frametime: 1, interpolate: true });
        animation.init(16, 32); // 2 frames, frameTime 50

        animation.step(25);
        expect(uniforms.animationInterpolation.value).toBeCloseTo(25 / 50);

        const plainUniforms = createUniforms();
        const plain = new TextureAnimation(plainUniforms, { frametime: 1 });
        plain.init(16, 32);
        plain.step(25);
        expect(plainUniforms.animationInterpolation.value).toBe(0);
    });
});
