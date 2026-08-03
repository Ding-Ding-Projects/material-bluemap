import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    JsonParseError,
    asObject,
    isJsonObject,
    nextBoolean,
    nextDouble,
    nextInt,
    type JsonObject,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";

/** java's narrowing {@code (int)} cast of a double: truncate toward zero, saturating */
function javaIntCast(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value >= 2147483647) return 2147483647;
    if (value <= -2147483648) return -2147483648;
    return Math.trunc(value);
}

/**
 * upstream: AnimationMeta.FrameMeta — a static nested class, ported as a sibling class
 * of the same module.
 */
export class FrameMeta {
    private index: number;
    private time: number;

    constructor(index: number, time: number) {
        this.index = index;
        this.time = time;
    }

    getIndex(): number {
        return this.index;
    }

    getTime(): number {
        return this.time;
    }

    /**
     * upstream: the adapter writes the package-private {@code time} field directly when
     * back-filling the default frame-time.
     */
    setTime(time: number): void {
        this.time = time;
    }
}

/** upstream: texture/AnimationMeta.java */
export class AnimationMeta {
    private interpolate: boolean = false;
    private width: number = 1;
    private height: number = 1;
    private frametime: number = 1;

    private frames: FrameMeta[] | null = null;

    /** upstream: the private no-args constructor */
    constructor();
    /** upstream: the lombok {@code @AllArgsConstructor} */
    constructor(
        interpolate: boolean,
        width: number,
        height: number,
        frametime: number,
        frames: FrameMeta[] | null,
    );
    constructor(
        interpolate?: boolean,
        width?: number,
        height?: number,
        frametime?: number,
        frames?: FrameMeta[] | null,
    ) {
        if (interpolate === undefined) return;
        this.interpolate = interpolate;
        this.width = width as number;
        this.height = height as number;
        this.frametime = frametime as number;
        this.frames = frames as FrameMeta[] | null;
    }

    isInterpolate(): boolean {
        return this.interpolate;
    }

    getWidth(): number {
        return this.width;
    }

    getHeight(): number {
        return this.height;
    }

    getFrametime(): number {
        return this.frametime;
    }

    getFrames(): FrameMeta[] | null {
        return this.frames;
    }

    /** upstream: AnimationMeta.Adapter#readFramesList */
    private static readFramesList(json: JsonValue, animationMeta: AnimationMeta): void {
        const frames: FrameMeta[] = [];

        for (const entry of asArrayStrict(json)) {
            let index = 0;
            let time = -1;

            if (typeof entry === "number") {
                index = nextInt(entry);
            } else {
                const frameObject = asObject(entry);
                for (const [name, member] of Object.entries(frameObject)) {
                    switch (name) {
                        case "index":
                            index = nextInt(member);
                            break;
                        case "time":
                            time = javaIntCast(nextDouble(member));
                            break;
                        default:
                            break; // upstream: in.skipValue()
                    }
                }
            }

            frames.push(new FrameMeta(index, time));
        }

        if (frames.length !== 0) animationMeta.frames = frames;
    }

    /**
     * upstream: AnimationMeta.Adapter — a hand-written reader over the
     * {@code <texture>.png.mcmeta} document that skips every top-level member except
     * "animation". {@code write} keeps upstream's delegation to the reflective adapter,
     * which emits the AnimationMeta fields <em>without</em> the "animation" wrapper the
     * reader expects (kept bug-for-bug).
     */
    static readonly Adapter: Required<JsonAdapter<AnimationMeta>> = {
        read(json: JsonValue): AnimationMeta {
            const animationMeta = new AnimationMeta();

            for (const [name, value] of Object.entries(asObject(json))) {
                if (name !== "animation") {
                    continue; // upstream: in.skipValue()
                }

                for (const [key, member] of Object.entries(asObject(value))) {
                    switch (key) {
                        case "interpolate":
                            animationMeta.interpolate = nextBoolean(member);
                            break;
                        case "width":
                            animationMeta.width = nextInt(member);
                            break;
                        case "height":
                            animationMeta.height = nextInt(member);
                            break;
                        case "frametime":
                            animationMeta.frametime = javaIntCast(nextDouble(member));
                            break;
                        case "frames":
                            AnimationMeta.readFramesList(member, animationMeta);
                            break;
                        default:
                            break; // upstream: in.skipValue()
                    }
                }
            }

            // default frame-time
            if (animationMeta.frames != null) {
                for (const frameMeta of animationMeta.frames) {
                    if (frameMeta.getTime() === -1) frameMeta.setTime(animationMeta.frametime);
                }
            }

            return animationMeta;
        },

        write(value: AnimationMeta): JsonValue {
            const json: JsonObject = {
                interpolate: value.interpolate,
                width: value.width,
                height: value.height,
                frametime: value.frametime,
            };
            // gson's reflective adapter omits null fields
            if (value.frames != null)
                json["frames"] = value.frames.map((frame) => ({
                    index: frame.getIndex(),
                    time: frame.getTime(),
                }));
            return json;
        },
    };
}

/**
 * upstream: {@code in.beginArray()} — unlike {@link asArray} this does not accept a
 * single value in place of an array.
 */
function asArrayStrict(json: JsonValue): JsonValue[] {
    if (!Array.isArray(json))
        throw new JsonParseError(
            "Expected BEGIN_ARRAY but was " + (isJsonObject(json) ? "BEGIN_OBJECT" : String(json)),
        );
    return json;
}
