import { MathUtils, Vector2, Vector3 } from "three";

export const VEC2_ZERO = new Vector2(0, 0);
export const VEC3_ZERO = new Vector3(0, 0, 0);
export const VEC3_X = new Vector3(1, 0, 0);
export const VEC3_Y = new Vector3(0, 1, 0);
export const VEC3_Z = new Vector3(0, 0, 1);

/**
 * Converts a url-encoded image string to an actual image-element
 */
export const stringToImage = (string: string): HTMLImageElement => {
    let image = document.createElementNS("http://www.w3.org/1999/xhtml", "img") as HTMLImageElement;
    image.src = string;
    return image;
};

/**
 * Creates an optimized path from x,z coordinates used by bluemap to save tiles
 */
export const pathFromCoords = (x: number, z: number): string => {
    let path = "x";
    path += splitNumberToPath(x);

    path += "z";
    path += splitNumberToPath(z);

    path = path.substring(0, path.length - 1);

    return path;
};

/**
 * Splits a number into an optimized folder-path used to save bluemap-tiles
 */
const splitNumberToPath = (num: number): string => {
    let path = "";

    if (num < 0) {
        num = -num;
        path += "-";
    }

    let s = num.toString();

    for (let i = 0; i < s.length; i++) {
        path += s.charAt(i) + "/";
    }

    return path;
};

/**
 * Hashes tile-coordinates to be saved in a map
 */
export const hashTile = (x: number, z: number): string => `x${x}z${z}`;

/**
 * Dispatches an event to the element of this map-viewer
 * @param element the element on that the event is dispatched
 * @param event
 * @param detail
 */
export const dispatchEvent = (
    element: EventTarget | null | undefined,
    event: string,
    detail: object = {},
): boolean | undefined => {
    if (!element || !(element as Partial<EventTarget>).dispatchEvent) return;

    return element.dispatchEvent(
        new CustomEvent(event, {
            detail: detail,
        }),
    );
};

/**
 * Sends a "bluemapAlert" event with a message and a level.
 * The level can be anything, but the app uses the levels
 * - debug
 * - fine
 * - info
 * - warning
 * - error
 * @param element the element on that the event is dispatched
 * @param message
 * @param level
 */
export const alert = (
    element: EventTarget | null | undefined,
    message: unknown,
    level: string = "info",
): void => {
    // alert event
    let printToConsole = dispatchEvent(element, "bluemapAlert", {
        message: message,
        level: level,
    });

    // log alert to console
    if (printToConsole !== false) {
        if (level === "info") {
            console.log(`[BlueMap/${level}]`, message);
        } else if (level === "warning") {
            console.warn(`[BlueMap/${level}]`, message);
        } else if (level === "error") {
            console.error(`[BlueMap/${level}]`, message);
        } else {
            console.debug(`[BlueMap/${level}]`, message);
        }
    }
};

/**
 * Source: https://stackoverflow.com/questions/494143/creating-a-new-dom-element-from-an-html-string-using-built-in-dom-methods-or-pro/35385518#35385518
 *
 * @param html representing a single element
 */
export const htmlToElement = (html: string): Element => {
    let template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstChild as Element;
};

/**
 * Source: https://stackoverflow.com/questions/494143/creating-a-new-dom-element-from-an-html-string-using-built-in-dom-methods-or-pro/35385518#35385518
 *
 * @param html representing any number of sibling elements
 */
export const htmlToElements = (html: string): NodeListOf<ChildNode> => {
    let template = document.createElement("template");
    template.innerHTML = html;
    return template.content.childNodes;
};

export interface Animation {
    animationStart: number;
    lastFrame: number;
    cancelled: boolean;

    frame(time: number): void;

    cancel(): void;
}

/**
 * Schedules an animation
 * @param durationMs the duration of the animation in ms
 * @param animationFrame a function that is getting called each frame with the parameters (progress (0-1), deltaTime)
 * @param postAnimation a function that gets called once after the animation is finished or cancelled. The function accepts one bool-parameter whether the animation was finished (true) or canceled (false)
 * @returns the animation object
 */
export const animate = function (
    animationFrame: (progress: number, deltaTime: number) => void,
    durationMs: number = 1000,
    postAnimation: ((finished: boolean) => void) | null = null,
): Animation {
    let animation: Animation = {
        animationStart: -1,
        lastFrame: -1,
        cancelled: false,

        frame: function (time: number) {
            if (this.cancelled) return;

            if (this.animationStart === -1) {
                this.animationStart = time;
                this.lastFrame = time;
            }

            let progress =
                durationMs === 0
                    ? 1
                    : MathUtils.clamp((time - this.animationStart) / durationMs, 0, 1);
            let deltaTime = time - this.lastFrame;

            animationFrame(progress, deltaTime);

            if (progress < 1) window.requestAnimationFrame((time) => this.frame(time));
            else if (postAnimation) postAnimation(true);

            this.lastFrame = time;
        },

        cancel: function () {
            this.cancelled = true;
            if (postAnimation) postAnimation(false);
        },
    };

    if (durationMs !== 0) {
        window.requestAnimationFrame((time) => animation.frame(time));
    } else {
        animation.frame(0);
    }

    return animation;
};

/**
 * Source: https://gist.github.com/gre/1650294
 */
export const EasingFunctions: Record<string, (t: number) => number> = {
    // no easing, no acceleration
    linear: (t) => t,
    // accelerating from zero velocity
    easeInQuad: (t) => t * t,
    // decelerating to zero velocity
    easeOutQuad: (t) => t * (2 - t),
    // acceleration until halfway, then deceleration
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    // accelerating from zero velocity
    easeInCubic: (t) => t * t * t,
    // decelerating to zero velocity
    easeOutCubic: (t) => --t * t * t + 1,
    // acceleration until halfway, then deceleration
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    // accelerating from zero velocity
    easeInQuart: (t) => t * t * t * t,
    // decelerating to zero velocity
    easeOutQuart: (t) => 1 - --t * t * t * t,
    // acceleration until halfway, then deceleration
    easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t),
    // accelerating from zero velocity
    easeInQuint: (t) => t * t * t * t * t,
    // decelerating to zero velocity
    easeOutQuint: (t) => 1 + --t * t * t * t * t,
    // acceleration until halfway, then deceleration
    easeInOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t),
};

/**
 * Returns the offset position of an element
 *
 * Source: https://plainjs.com/javascript/styles/get-the-position-of-an-element-relative-to-the-document-24/
 */
export const elementOffset = (element: Element): { top: number; left: number } => {
    let rect = element.getBoundingClientRect(),
        scrollLeft = window.pageXOffset || document.documentElement.scrollLeft,
        scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    return { top: rect.top + scrollTop, left: rect.left + scrollLeft };
};

/**
 * Very simple deep equals, should not be used for complex objects. Is designed for comparing parsed json-objects.
 */
export const deepEquals = (object1: unknown, object2: unknown): boolean => {
    if (Object.is(object1, object2)) return true;

    let type = typeof object1;
    if (type !== typeof object2) return false;

    if (type === "number" || type === "boolean" || type === "string") return false;

    if (Array.isArray(object1)) {
        const array2 = object2 as unknown[];
        let len = object1.length;
        if (len !== array2.length) return false;
        for (let i = 0; i < len; i++) {
            if (!deepEquals(object1[i], array2[i])) return false;
        }

        return true;
    }

    const record1 = object1 as Record<string, unknown>;
    const record2 = object2 as Record<string, unknown>;
    for (let property in record1) {
        if (!record1.hasOwnProperty(property)) continue;
        if (!deepEquals(record1[property], record2[property])) return false;
    }

    return true;
};

/**
 * Adds one listener to multiple events
 */
export const addEventListeners = (
    target: EventTarget,
    types: string | string[],
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
): void => {
    if (!Array.isArray(types)) {
        types = types.trim().split(" ");
    }

    types.forEach((type) => target.addEventListener(type, listener, options));
};

/**
 * Removes one listener to multiple events
 */
export const removeEventListeners = (
    target: EventTarget,
    types: string | string[],
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
): void => {
    if (!Array.isArray(types)) {
        types = types.trim().split(" ");
    }

    types.forEach((type) => target.removeEventListener(type, listener, options));
};

/**
 * Softly clamps towards a minimum value
 */
export const softMin = (value: number, min: number, stiffness: number): number => {
    if (value >= min) return value;
    let delta = min - value;
    if (delta < 0.0001) return min;
    return value + delta * stiffness;
};

/**
 * Softly clamps towards a maximum value
 */
export const softMax = (value: number, max: number, stiffness: number): number => {
    if (value <= max) return value;
    let delta = value - max;
    if (delta < 0.0001) return max;
    return value - delta * stiffness;
};

/**
 * Softly clamps towards a minimum and maximum value
 */
export const softClamp = (value: number, min: number, max: number, stiffness: number): number => {
    return softMax(softMin(value, min, stiffness), max, stiffness);
};

/**
 * Softly sets a value
 */
export const softSet = (value: number, target: number, stiffness: number): number => {
    return softClamp(value, target, target, stiffness);
};

export const vecArrToObj = (
    val: number[] | null | undefined,
    useZ: boolean = false,
): { x?: number; y?: number; z?: number } => {
    if (val && val.length >= 2) {
        if (useZ) return { x: val[0]!, z: val[1]! };
        return { x: val[0]!, y: val[1]! };
    }
    return {};
};

const pixel = document.createElement("canvas");
pixel.width = 1;
pixel.height = 1;
const pixelContext = pixel.getContext("2d", {
    willReadFrequently: true,
})!;

export const getPixel = (img: CanvasImageSource, x: number, y: number): Uint8ClampedArray => {
    pixelContext.drawImage(img, Math.floor(x), Math.floor(y), 1, 1, 0, 0, 1, 1);
    return pixelContext.getImageData(0, 0, 1, 1).data;
};
