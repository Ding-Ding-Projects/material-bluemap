export interface TextureAnimationUniforms {
    animationFrameHeight: { value: number };
    animationFrameIndex: { value: number };
    animationInterpolationFrameIndex: { value: number };
    animationInterpolation: { value: number };
}

export interface TextureAnimationFrame {
    index: number;
    time: number;
}

export interface TextureAnimationData {
    interpolate: boolean;
    width: number;
    height: number;
    frametime: number;
    frames?: TextureAnimationFrame[] | null;
}

export class TextureAnimation {
    uniforms: TextureAnimationUniforms;
    data: TextureAnimationData;
    frameImages: number;
    frameDelta: number;
    frameTime: number;
    frames: number;
    frameIndex: number;

    constructor(uniforms: TextureAnimationUniforms, data: Partial<TextureAnimationData>) {
        this.uniforms = uniforms;
        this.data = {
            interpolate: false,
            width: 1,
            height: 1,
            frametime: 1,
            ...data,
        };
        this.frameImages = 1;
        this.frameDelta = 0;
        this.frameTime = this.data.frametime * 50;
        this.frames = 1;
        this.frameIndex = 0;
    }

    init(width: number, height: number): void {
        this.frameImages = height / width;
        this.uniforms.animationFrameHeight.value = 1 / this.frameImages;
        this.frames = this.frameImages;
        if (this.data.frames && this.data.frames.length > 0) {
            this.frames = this.data.frames.length;
        } else {
            this.data.frames = null;
        }
    }

    step(delta: number): void {
        this.frameDelta += delta;

        if (this.frameDelta > this.frameTime) {
            this.frameDelta -= this.frameTime;
            this.frameDelta %= this.frameTime;

            this.frameIndex++;
            this.frameIndex %= this.frames;

            if (this.data.frames) {
                const frame = this.data.frames[this.frameIndex]!;
                const nextFrame = this.data.frames[(this.frameIndex + 1) % this.frames]!;

                this.uniforms.animationFrameIndex.value = frame.index;
                this.uniforms.animationInterpolationFrameIndex.value = nextFrame.index;
                this.frameTime = frame.time * 50;
            } else {
                this.uniforms.animationFrameIndex.value = this.frameIndex;
                this.uniforms.animationInterpolationFrameIndex.value =
                    (this.frameIndex + 1) % this.frames;
            }
        }

        if (this.data.interpolate) {
            this.uniforms.animationInterpolation.value = this.frameDelta / this.frameTime;
        }
    }
}
