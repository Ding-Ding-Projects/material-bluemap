/**
 * Colour space conversions used by the infinite colour picker.
 *
 * Every conversion goes through CIE XYZ so that adding a space costs one pair of
 * functions rather than one pair per existing space. sRGB is the connection space
 * for the cylindrical models (HSL, HSV/HSB, HWB) because those are defined on
 * gamma-encoded sRGB, not on light.
 *
 * White points: CSS Color 4 defines `lab()` and `lch()` against D50, and
 * `oklab()`/`oklch()` against D65. Both are honoured here, with Bradford
 * adaptation between them, so a value round-trips through either without drift.
 */

/** Three ordered components of a colour, in that space's own units. */
export type Triple = readonly [number, number, number];

/**
 * A space whose three components can hold a colour on their own.
 *
 * CMYK is deliberately absent: it is a four-component *representation* handled by
 * the parser and formatter, converted naively through sRGB, and never used to
 * store a value. See `cmyk.ts` for why that conversion is not colour management.
 */
export type ColorSpace = "srgb" | "hsl" | "hsv" | "hwb" | "lab" | "lch" | "oklab" | "oklch";

/** Every space this module can convert, in the order the picker lists them. */
export const COLOR_SPACES: readonly ColorSpace[] = [
    "srgb",
    "hsl",
    "hsv",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
];

type Matrix = readonly [Triple, Triple, Triple];

function apply(m: Matrix, v: Triple): Triple {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

const LINEAR_SRGB_TO_XYZ_D65: Matrix = [
    [0.4123907992659593, 0.357584339383878, 0.1804807884018343],
    [0.2126390058715102, 0.715168678767756, 0.0721923153607337],
    [0.0193308187155918, 0.119194779794626, 0.9505321522496607],
];

const XYZ_D65_TO_LINEAR_SRGB: Matrix = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.0415550574071756],
    [0.0556300796969936, -0.2039769588889765, 1.0569715142428786],
];

const XYZ_D65_TO_D50: Matrix = [
    [1.0479298208405488, 0.0229467933410191, -0.0501922295431356],
    [0.0296278156881593, 0.990434484573249, -0.0170738250293851],
    [-0.0092430581525912, 0.0150551448965779, 0.7518742899580008],
];

const XYZ_D50_TO_D65: Matrix = [
    [0.9554734527042182, -0.0230985368742614, 0.0632593086610217],
    [-0.0283697069632081, 1.0099954580058226, 0.021041398966943],
    [0.0123140016883199, -0.0205076964334779, 1.3303659366080753],
];

const XYZ_D65_TO_LMS: Matrix = [
    [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
    [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
    [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];

const LMS_TO_XYZ_D65: Matrix = [
    [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
    [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
    [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

const LMS_TO_OKLAB: Matrix = [
    [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
    [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
    [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

const OKLAB_TO_LMS: Matrix = [
    [1.0, 0.3963377773761749, 0.2158037573099136],
    [1.0, -0.1055613458156586, -0.0638541728258133],
    [1.0, -0.0894841775298119, -1.2914855480194092],
];

/** D50 white point, relative to Y = 1. Used by the Lab and LCH transfer functions. */
const WHITE_D50: Triple = [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585];

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

/* ------------------------------------------------------------------ *
 * sRGB transfer function
 * ------------------------------------------------------------------ */

/** Gamma-encoded sRGB component (0..1) to linear light. */
export function srgbToLinear(channel: number): number {
    const sign = channel < 0 ? -1 : 1;
    const magnitude = Math.abs(channel);
    return magnitude <= 0.04045
        ? channel / 12.92
        : sign * Math.pow((magnitude + 0.055) / 1.055, 2.4);
}

/** Linear-light component to gamma-encoded sRGB (0..1). */
export function linearToSrgb(channel: number): number {
    const sign = channel < 0 ? -1 : 1;
    const magnitude = Math.abs(channel);
    return magnitude <= 0.0031308
        ? channel * 12.92
        : sign * (1.055 * Math.pow(magnitude, 1 / 2.4) - 0.055);
}

/* ------------------------------------------------------------------ *
 * sRGB <-> XYZ
 * ------------------------------------------------------------------ */

export function srgbToXyzD65(rgb: Triple): Triple {
    return apply(LINEAR_SRGB_TO_XYZ_D65, [
        srgbToLinear(rgb[0]),
        srgbToLinear(rgb[1]),
        srgbToLinear(rgb[2]),
    ]);
}

export function xyzD65ToSrgb(xyz: Triple): Triple {
    const linear = apply(XYZ_D65_TO_LINEAR_SRGB, xyz);
    return [linearToSrgb(linear[0]), linearToSrgb(linear[1]), linearToSrgb(linear[2])];
}

/* ------------------------------------------------------------------ *
 * CIELAB and LCH (D50, matching CSS)
 * ------------------------------------------------------------------ */

export function xyzD65ToLab(xyz: Triple): Triple {
    const d50 = apply(XYZ_D65_TO_D50, xyz);
    const f = (t: number): number =>
        t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
    const fx = f(d50[0] / WHITE_D50[0]);
    const fy = f(d50[1] / WHITE_D50[1]);
    const fz = f(d50[2] / WHITE_D50[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyzD65(lab: Triple): Triple {
    const fy = (lab[0] + 16) / 116;
    const fx = lab[1] / 500 + fy;
    const fz = fy - lab[2] / 200;
    const inverse = (t: number): number => {
        const cubed = t * t * t;
        return cubed > LAB_EPSILON ? cubed : (116 * t - 16) / LAB_KAPPA;
    };
    const y = lab[0] > LAB_KAPPA * LAB_EPSILON ? Math.pow(fy, 3) : lab[0] / LAB_KAPPA;
    const d50: Triple = [inverse(fx) * WHITE_D50[0], y * WHITE_D50[1], inverse(fz) * WHITE_D50[2]];
    return apply(XYZ_D50_TO_D65, d50);
}

/* ------------------------------------------------------------------ *
 * OKLab and OKLCH (D65)
 * ------------------------------------------------------------------ */

export function xyzD65ToOklab(xyz: Triple): Triple {
    const lms = apply(XYZ_D65_TO_LMS, xyz);
    return apply(LMS_TO_OKLAB, [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])]);
}

export function oklabToXyzD65(oklab: Triple): Triple {
    const lms = apply(OKLAB_TO_LMS, oklab);
    return apply(LMS_TO_XYZ_D65, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]);
}

/* ------------------------------------------------------------------ *
 * Rectangular <-> polar, shared by Lab/LCH and OKLab/OKLCH
 * ------------------------------------------------------------------ */

export function rectangularToPolar(value: Triple): Triple {
    const chroma = Math.sqrt(value[1] * value[1] + value[2] * value[2]);
    // An achromatic colour has no meaningful hue. Reporting 0 rather than NaN keeps
    // the numeric fields readable; the picker remembers the last hue separately so
    // dragging chroma back up does not lose where the user was.
    const hue = chroma < 1e-8 ? 0 : ((Math.atan2(value[2], value[1]) * 180) / Math.PI + 360) % 360;
    return [value[0], chroma, hue];
}

export function polarToRectangular(value: Triple): Triple {
    const radians = (value[2] * Math.PI) / 180;
    return [value[0], value[1] * Math.cos(radians), value[1] * Math.sin(radians)];
}

/* ------------------------------------------------------------------ *
 * Cylindrical sRGB models
 * ------------------------------------------------------------------ */

export function srgbToHsl(rgb: Triple): Triple {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta < 1e-10) return [0, 0, lightness * 100];

    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue: number;
    if (max === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta) % 6;
    else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
    else hue = (rgb[0] - rgb[1]) / delta + 4;
    return [((hue * 60) % 360 + 360) % 360, saturation * 100, lightness * 100];
}

export function hslToSrgb(hsl: Triple): Triple {
    const hue = ((hsl[0] % 360) + 360) % 360;
    const saturation = hsl[1] / 100;
    const lightness = hsl[2] / 100;
    const channel = (n: number): number => {
        const k = (n + hue / 30) % 12;
        const a = saturation * Math.min(lightness, 1 - lightness);
        return lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    };
    return [channel(0), channel(8), channel(4)];
}

export function srgbToHsv(rgb: Triple): Triple {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    const delta = max - min;
    let hue = 0;
    if (delta >= 1e-10) {
        if (max === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta) % 6;
        else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
        else hue = (rgb[0] - rgb[1]) / delta + 4;
        hue = ((hue * 60) % 360 + 360) % 360;
    }
    return [hue, max < 1e-10 ? 0 : (delta / max) * 100, max * 100];
}

export function hsvToSrgb(hsv: Triple): Triple {
    const hue = ((hsv[0] % 360) + 360) % 360;
    const saturation = hsv[1] / 100;
    const value = hsv[2] / 100;
    const channel = (n: number): number => {
        const k = (n + hue / 60) % 6;
        return value - value * saturation * Math.max(0, Math.min(k, Math.min(4 - k, 1)));
    };
    return [channel(5), channel(3), channel(1)];
}

export function srgbToHwb(rgb: Triple): Triple {
    const hsv = srgbToHsv(rgb);
    const white = Math.min(rgb[0], rgb[1], rgb[2]) * 100;
    const black = (1 - Math.max(rgb[0], rgb[1], rgb[2])) * 100;
    return [hsv[0], white, black];
}

export function hwbToSrgb(hwb: Triple): Triple {
    let white = hwb[1] / 100;
    let black = hwb[2] / 100;
    const total = white + black;
    if (total > 1) {
        white /= total;
        black /= total;
    }
    const base = hslToSrgb([hwb[0], 100, 50]);
    return [
        base[0] * (1 - white - black) + white,
        base[1] * (1 - white - black) + white,
        base[2] * (1 - white - black) + white,
    ];
}

/* ------------------------------------------------------------------ *
 * Space-agnostic entry points
 * ------------------------------------------------------------------ */

/** Convert any supported space's components into gamma-encoded sRGB (may fall outside 0..1). */
export function toSrgb(space: ColorSpace, coords: Triple): Triple {
    switch (space) {
        case "srgb":
            return coords;
        case "hsl":
            return hslToSrgb(coords);
        case "hsv":
            return hsvToSrgb(coords);
        case "hwb":
            return hwbToSrgb(coords);
        case "lab":
            return xyzD65ToSrgb(labToXyzD65(coords));
        case "lch":
            return xyzD65ToSrgb(labToXyzD65(polarToRectangular(coords)));
        case "oklab":
            return xyzD65ToSrgb(oklabToXyzD65(coords));
        case "oklch":
            return xyzD65ToSrgb(oklabToXyzD65(polarToRectangular(coords)));
    }
}

/** Convert gamma-encoded sRGB into any supported space's components. */
export function fromSrgb(space: ColorSpace, rgb: Triple): Triple {
    switch (space) {
        case "srgb":
            return rgb;
        case "hsl":
            return srgbToHsl(rgb);
        case "hsv":
            return srgbToHsv(rgb);
        case "hwb":
            return srgbToHwb(rgb);
        case "lab":
            return xyzD65ToLab(srgbToXyzD65(rgb));
        case "lch":
            return rectangularToPolar(xyzD65ToLab(srgbToXyzD65(rgb)));
        case "oklab":
            return xyzD65ToOklab(srgbToXyzD65(rgb));
        case "oklch":
            return rectangularToPolar(xyzD65ToOklab(srgbToXyzD65(rgb)));
    }
}

/** Convert directly between two spaces without a detour through the caller. */
export function convert(from: ColorSpace, to: ColorSpace, coords: Triple): Triple {
    if (from === to) return coords;
    return fromSrgb(to, toSrgb(from, coords));
}

/**
 * Whether an sRGB triple sits inside the displayable cube.
 *
 * The tolerance absorbs float error from a round trip so that a colour picked in
 * sRGB is never reported as out of its own gamut.
 */
export function isInSrgbGamut(rgb: Triple, tolerance = 1e-4): boolean {
    return rgb.every((channel) => channel >= -tolerance && channel <= 1 + tolerance);
}

/** Clamp an sRGB triple into the displayable cube. This is what a screen will show. */
export function clipToSrgb(rgb: Triple): Triple {
    return [
        Math.min(1, Math.max(0, rgb[0])),
        Math.min(1, Math.max(0, rgb[1])),
        Math.min(1, Math.max(0, rgb[2])),
    ];
}

/** Component metadata, used to label, bound, and step the numeric entry fields. */
export interface ComponentInfo {
    readonly label: string;
    readonly min: number;
    /** Soft maximum. Lab/OKLab axes and chroma are unbounded in principle. */
    readonly max: number;
    readonly step: number;
    readonly unit: string;
    /** Hue wraps rather than clamping. */
    readonly cyclic: boolean;
    /** Decimal places used when formatting. */
    readonly precision: number;
}

const SPACE_COMPONENTS: Record<ColorSpace, readonly [ComponentInfo, ComponentInfo, ComponentInfo]> =
    {
        srgb: [
            { label: "R", min: 0, max: 255, step: 1, unit: "", cyclic: false, precision: 0 },
            { label: "G", min: 0, max: 255, step: 1, unit: "", cyclic: false, precision: 0 },
            { label: "B", min: 0, max: 255, step: 1, unit: "", cyclic: false, precision: 0 },
        ],
        hsl: [
            { label: "H", min: 0, max: 360, step: 1, unit: "deg", cyclic: true, precision: 1 },
            { label: "S", min: 0, max: 100, step: 1, unit: "%", cyclic: false, precision: 1 },
            { label: "L", min: 0, max: 100, step: 1, unit: "%", cyclic: false, precision: 1 },
        ],
        hsv: [
            { label: "H", min: 0, max: 360, step: 1, unit: "deg", cyclic: true, precision: 1 },
            { label: "S", min: 0, max: 100, step: 1, unit: "%", cyclic: false, precision: 1 },
            { label: "V", min: 0, max: 100, step: 1, unit: "%", cyclic: false, precision: 1 },
        ],
        hwb: [
            { label: "H", min: 0, max: 360, step: 1, unit: "deg", cyclic: true, precision: 1 },
            { label: "W", min: 0, max: 100, step: 1, unit: "%", cyclic: false, precision: 1 },
            { label: "B", min: 0, max: 100, step: 1, unit: "%", cyclic: false, precision: 1 },
        ],
        lab: [
            { label: "L", min: 0, max: 100, step: 0.5, unit: "", cyclic: false, precision: 2 },
            { label: "a", min: -125, max: 125, step: 0.5, unit: "", cyclic: false, precision: 2 },
            { label: "b", min: -125, max: 125, step: 0.5, unit: "", cyclic: false, precision: 2 },
        ],
        lch: [
            { label: "L", min: 0, max: 100, step: 0.5, unit: "", cyclic: false, precision: 2 },
            { label: "C", min: 0, max: 150, step: 0.5, unit: "", cyclic: false, precision: 2 },
            { label: "H", min: 0, max: 360, step: 1, unit: "deg", cyclic: true, precision: 1 },
        ],
        oklab: [
            { label: "L", min: 0, max: 1, step: 0.005, unit: "", cyclic: false, precision: 4 },
            { label: "a", min: -0.4, max: 0.4, step: 0.002, unit: "", cyclic: false, precision: 4 },
            { label: "b", min: -0.4, max: 0.4, step: 0.002, unit: "", cyclic: false, precision: 4 },
        ],
        oklch: [
            { label: "L", min: 0, max: 1, step: 0.005, unit: "", cyclic: false, precision: 4 },
            { label: "C", min: 0, max: 0.4, step: 0.002, unit: "", cyclic: false, precision: 4 },
            { label: "H", min: 0, max: 360, step: 1, unit: "deg", cyclic: true, precision: 1 },
        ],
    };

export function componentsOf(
    space: ColorSpace
): readonly [ComponentInfo, ComponentInfo, ComponentInfo] {
    return SPACE_COMPONENTS[space];
}

/**
 * sRGB is stored 0..1 internally but authored 0..255. Every other space uses the
 * same units inside and out, so this is the only place the two disagree.
 */
export function toAuthoredUnits(space: ColorSpace, coords: Triple): Triple {
    if (space !== "srgb") return coords;
    return [coords[0] * 255, coords[1] * 255, coords[2] * 255];
}

export function fromAuthoredUnits(space: ColorSpace, coords: Triple): Triple {
    if (space !== "srgb") return coords;
    return [coords[0] / 255, coords[1] / 255, coords[2] / 255];
}
