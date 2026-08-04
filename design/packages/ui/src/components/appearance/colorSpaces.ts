/**
 * The colour maths behind the infinite picker.
 *
 * Everything here is pure arithmetic over plain objects: no DOM, no Vue, no rounding for
 * display. Rounding belongs to the formatter, because a translator that rounded on the way
 * in would drift a little further from the user's colour on every hop between
 * representations, and a picker whose colour changes because you looked at it in OKLCH is
 * not a translator at all.
 *
 * ## Why the canonical value is unclamped sRGB
 *
 * Every colour in this module is carried as red, green and blue in the sRGB *primaries*,
 * with the transfer function already applied, each nominally in 0..1 — but deliberately not
 * clamped to it. Lab, LCH, OKLab and OKLCH can all describe colours that no sRGB display can
 * show, and clamping on entry would quietly delete them: a user who types
 * `oklch(0.7 0.35 30)` would watch it snap to something duller with no explanation, which is
 * exactly the silent value-dropping the contract forbids. Keeping the out-of-range numbers
 * means the picker can say "this is outside sRGB, and here is what will be shown instead",
 * which is a true statement about a real situation.
 *
 * The consequence is a split that runs through the whole file. The spaces that are defined
 * as re-parameterisations of sRGB — HSL, HSV, HWB, hexadecimal and CMYK — are only meaningful
 * for in-gamut values, so those conversions operate on the *clipped* colour and the caller is
 * told, through {@link clipReport}, whether clipping actually changed anything. The spaces
 * that are device-independent — Lab, LCH, OKLab, OKLCH and XYZ — operate on the raw value and
 * never clip. That is not a convenience; it is the difference between a warning the user can
 * act on and a number that is quietly wrong.
 *
 * ## Which white point
 *
 * CIELAB and LCH here use the D50 white point, and OKLab/OKLCH use D65, because that is what
 * CSS Color 4 specifies and therefore what a value pasted out of a browser's dev tools or
 * out of the specification's own examples will mean. Computing Lab against D65 instead is a
 * defensible choice in the abstract and a wrong one here: `lab(54.29% 80.8 69.89)` is red in
 * every CSS engine, and a picker that disagreed with the platform it renders on would be
 * useless for the job it exists to do. The Bradford adaptation matrices are the ones the
 * specification publishes, transcribed rather than re-derived, so the round trip through
 * D50 and back is exact to floating-point noise.
 */

/** A row or a column of three, so the matrix code can destructure instead of indexing. */
type Vec3 = readonly [number, number, number];

/** A 3x3 matrix as three rows. */
type Mat3 = readonly [Vec3, Vec3, Vec3];

/**
 * A colour, as sRGB primaries with the sRGB transfer function applied.
 *
 * `r`, `g` and `b` are nominally 0..1 and may fall outside it for a colour that sRGB cannot
 * reproduce. `alpha` is 0..1 and is always clamped, because unlike the primaries there is no
 * meaningful colour "more opaque than opaque".
 */
export interface Rgb {
    r: number;
    g: number;
    b: number;
    alpha: number;
}

/** Hue in degrees, saturation and lightness as percentages. */
export interface Hsl {
    h: number;
    s: number;
    l: number;
    alpha: number;
}

/** Hue in degrees, saturation and value as percentages. Also known as HSB. */
export interface Hsv {
    h: number;
    s: number;
    v: number;
    alpha: number;
}

/** Hue in degrees, whiteness and blackness as percentages. */
export interface Hwb {
    h: number;
    w: number;
    b: number;
    alpha: number;
}

/** CIELAB against D50: `l` 0..100, `a` and `b` roughly -125..125. */
export interface Lab {
    l: number;
    a: number;
    b: number;
    alpha: number;
}

/** CIELCH against D50: `l` 0..100, `c` 0..150ish, `h` in degrees. */
export interface Lch {
    l: number;
    c: number;
    h: number;
    alpha: number;
}

/** OKLab against D65: `l` 0..1, `a` and `b` roughly -0.4..0.4. */
export interface Oklab {
    l: number;
    a: number;
    b: number;
    alpha: number;
}

/** OKLCH against D65: `l` 0..1, `c` 0..0.4ish, `h` in degrees. */
export interface Oklch {
    l: number;
    c: number;
    h: number;
    alpha: number;
}

/**
 * Naive device CMYK, each component a percentage.
 *
 * "Naive" is the honest word and the picker says so in the interface. Real CMYK is a
 * property of an ink set and a paper stock, reached through an ICC profile; this is the
 * textbook algebraic inversion of RGB, which is what every screen tool means by CMYK and
 * what a user pasting a value from one will expect. It round-trips exactly with itself and
 * approximates nothing else, and the picker labels it as an uncalibrated conversion rather
 * than implying a press will match it.
 */
export interface Cmyk {
    c: number;
    m: number;
    y: number;
    k: number;
    alpha: number;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function multiply(m: Mat3, v: Vec3): Vec3 {
    const [r0, r1, r2] = m;
    const [x, y, z] = v;
    return [
        r0[0] * x + r0[1] * y + r0[2] * z,
        r1[0] * x + r1[1] * y + r1[2] * z,
        r2[0] * x + r2[1] * y + r2[2] * z,
    ];
}

export function clamp(value: number, low: number, high: number): number {
    if (Number.isNaN(value)) return low;
    return value < low ? low : value > high ? high : value;
}

/** Hue wrapped into 0..360, so -30 and 330 are the same direction. */
export function normalizeHue(hue: number): number {
    if (!Number.isFinite(hue)) return 0;
    const wrapped = hue % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** A colour with alpha clamped and the primaries left exactly as given. */
export function rgb(r: number, g: number, b: number, alpha = 1): Rgb {
    return { r, g, b, alpha: clamp(alpha, 0, 1) };
}

/** The same colour with its primaries forced into 0..1. */
export function clipRgb(color: Rgb): Rgb {
    return {
        r: clamp(color.r, 0, 1),
        g: clamp(color.g, 0, 1),
        b: clamp(color.b, 0, 1),
        alpha: clamp(color.alpha, 0, 1),
    };
}

/* -------------------------------------------------------------------------- */
/* Gamut                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How far outside a gamut a colour sits, in channel units.
 *
 * Zero means it is inside. A small non-zero value is usually floating-point noise from a
 * round trip rather than a colour anybody chose, which is why {@link GAMUT_EPSILON} exists
 * and why the picker's warning is driven by `outside` rather than by an exact comparison.
 */
export interface GamutReport {
    outside: boolean;
    /** The largest distance any single channel falls beyond 0 or 1. */
    excess: number;
}

/**
 * The slack allowed before a colour counts as out of gamut.
 *
 * A round trip through Lab and back lands roughly 1e-15 away from where it started, and a
 * picker that warned about that would warn about every colour. One part in ten thousand is
 * far below a single step of an 8-bit channel, so nothing a user can actually see is
 * excused by it.
 */
export const GAMUT_EPSILON = 1e-4;

function gamutOf(v: Vec3): GamutReport {
    const excess = Math.max(0, -v[0], v[0] - 1, -v[1], v[1] - 1, -v[2], v[2] - 1);
    return { outside: excess > GAMUT_EPSILON, excess };
}

/** Whether the colour is inside sRGB, and by how much it misses if not. */
export function srgbGamut(color: Rgb): GamutReport {
    return gamutOf([color.r, color.g, color.b]);
}

/**
 * Whether the colour is inside Display P3.
 *
 * Worth reporting separately because "outside sRGB" and "unshowable" are different claims on
 * a modern laptop panel: a colour outside sRGB but inside P3 will render correctly on the
 * hardware many users actually have, and telling them it is out of gamut full stop would be
 * wrong. The picker names the smallest gamut that contains the colour.
 */
export function displayP3Gamut(color: Rgb): GamutReport {
    const xyz = rgbToXyz65(color);
    const linear = multiply(XYZ65_TO_LINEAR_P3, xyz);
    return gamutOf([
        linearToSrgb(linear[0]),
        linearToSrgb(linear[1]),
        linearToSrgb(linear[2]),
    ]);
}

/** The names the picker uses when it says which gamut a colour is in. */
export type GamutName = "srgb" | "display-p3" | "outside";

/** The smallest of the gamuts this app can name that contains the colour. */
export function gamutName(color: Rgb): GamutName {
    if (!srgbGamut(color).outside) return "srgb";
    if (!displayP3Gamut(color).outside) return "display-p3";
    return "outside";
}

/**
 * What clipping a colour into sRGB would cost.
 *
 * The picker shows this before it writes a hexadecimal or an HSL value, because those
 * notations simply cannot carry an out-of-gamut colour and writing one silently is how a
 * user loses the colour they picked. `delta` is the largest single-channel change so the
 * warning can say how big the lie would be rather than only that there is one.
 */
export interface ClipReport {
    clipped: boolean;
    delta: number;
    color: Rgb;
}

export function clipReport(color: Rgb): ClipReport {
    const clipped = clipRgb(color);
    const delta = Math.max(
        Math.abs(clipped.r - color.r),
        Math.abs(clipped.g - color.g),
        Math.abs(clipped.b - color.b),
    );
    return { clipped: delta > GAMUT_EPSILON, delta, color: clipped };
}

/* -------------------------------------------------------------------------- */
/* Transfer function and XYZ                                                  */
/* -------------------------------------------------------------------------- */

/**
 * sRGB to linear light, sign-preserving.
 *
 * The specification only defines the curve for 0..1, and the negative branch here is the odd
 * extension every colour library uses: a channel of -0.2 becomes the negative of what +0.2
 * would become. Without it a colour just outside the gamut would fold back on itself and the
 * gamut test would call it in-gamut, which is worse than an extrapolation nobody displays.
 */
export function srgbToLinear(channel: number): number {
    const sign = channel < 0 ? -1 : 1;
    const magnitude = Math.abs(channel);
    return magnitude <= 0.04045
        ? channel / 12.92
        : sign * Math.pow((magnitude + 0.055) / 1.055, 2.4);
}

/** Linear light back to sRGB, with the same sign-preserving extension. */
export function linearToSrgb(channel: number): number {
    const sign = channel < 0 ? -1 : 1;
    const magnitude = Math.abs(channel);
    return magnitude <= 0.0031308
        ? channel * 12.92
        : sign * (1.055 * Math.pow(magnitude, 1 / 2.4) - 0.055);
}

const LINEAR_SRGB_TO_XYZ65: Mat3 = [
    [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
    [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
    [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];

const XYZ65_TO_LINEAR_SRGB: Mat3 = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
    [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const XYZ65_TO_LINEAR_P3: Mat3 = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];

const XYZ65_TO_XYZ50: Mat3 = [
    [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
    [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
    [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];

const XYZ50_TO_XYZ65: Mat3 = [
    [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
    [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
    [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

/** CIE XYZ against D65, which is sRGB's own white point. */
export function rgbToXyz65(color: Rgb): Vec3 {
    return multiply(LINEAR_SRGB_TO_XYZ65, [
        srgbToLinear(color.r),
        srgbToLinear(color.g),
        srgbToLinear(color.b),
    ]);
}

export function xyz65ToRgb(xyz: Vec3, alpha = 1): Rgb {
    const linear = multiply(XYZ65_TO_LINEAR_SRGB, xyz);
    return rgb(
        linearToSrgb(linear[0]),
        linearToSrgb(linear[1]),
        linearToSrgb(linear[2]),
        alpha,
    );
}

/* -------------------------------------------------------------------------- */
/* CIELAB and LCH, against D50                                                */
/* -------------------------------------------------------------------------- */

/** D50, as CSS Color 4 states it: the chromaticity converted to a normalised XYZ triple. */
const D50: Vec3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

export function rgbToLab(color: Rgb): Lab {
    const xyz50 = multiply(XYZ65_TO_XYZ50, rgbToXyz65(color));

    const f = (t: number): number =>
        t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;

    const fx = f(xyz50[0] / D50[0]);
    const fy = f(xyz50[1] / D50[1]);
    const fz = f(xyz50[2] / D50[2]);

    return {
        l: 116 * fy - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz),
        alpha: color.alpha,
    };
}

export function labToRgb(lab: Lab): Rgb {
    const fy = (lab.l + 16) / 116;
    const fx = lab.a / 500 + fy;
    const fz = fy - lab.b / 200;

    const inverse = (t: number): number => {
        const cubed = t * t * t;
        return cubed > LAB_EPSILON ? cubed : (116 * t - 16) / LAB_KAPPA;
    };

    const y = lab.l > LAB_KAPPA * LAB_EPSILON ? Math.pow(fy, 3) : lab.l / LAB_KAPPA;

    const xyz50: Vec3 = [inverse(fx) * D50[0], y * D50[1], inverse(fz) * D50[2]];
    return xyz65ToRgb(multiply(XYZ50_TO_XYZ65, xyz50), lab.alpha);
}

/**
 * Polar form of any opponent-axis space.
 *
 * Shared by CIELCH and OKLCH because the arithmetic is identical and duplicating it is how
 * the two drift apart. The chroma floor is the reason it is a function at all: at zero
 * chroma the hue is undefined, `atan2` of two arbitrarily tiny numbers returns whatever
 * their ratio happens to be, and a grey that reported hue 211 would look to the user like a
 * blue they cannot see.
 *
 * The floor differs per space and is not a rounding tolerance. An sRGB neutral does not land
 * exactly on the D50 white point, because the Bradford matrices CSS publishes are rounded to
 * ten significant figures; a mid grey comes out of CIELAB at a chroma near 6e-6 rather than
 * at zero. That is six orders of magnitude below anything an eye or a display can resolve on
 * an axis that runs to 150, so calling it grey is correct. OKLab's axes run to about 0.4, a
 * few hundred times smaller, so it takes a proportionally smaller floor.
 */
export const LAB_CHROMA_FLOOR = 1e-4;

export const OKLAB_CHROMA_FLOOR = 1e-6;

function toPolar(a: number, b: number, floor: number): { c: number; h: number } {
    const c = Math.sqrt(a * a + b * b);
    const h = c < floor ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
    return { c, h };
}

function fromPolar(c: number, h: number): { a: number; b: number } {
    const radians = (normalizeHue(h) * Math.PI) / 180;
    return { a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function labToLch(lab: Lab): Lch {
    const { c, h } = toPolar(lab.a, lab.b, LAB_CHROMA_FLOOR);
    return { l: lab.l, c, h, alpha: lab.alpha };
}

export function lchToLab(lch: Lch): Lab {
    const { a, b } = fromPolar(lch.c, lch.h);
    return { l: lch.l, a, b, alpha: lch.alpha };
}

export function rgbToLch(color: Rgb): Lch {
    return labToLch(rgbToLab(color));
}

export function lchToRgb(lch: Lch): Rgb {
    return labToRgb(lchToLab(lch));
}

/* -------------------------------------------------------------------------- */
/* OKLab and OKLCH, against D65                                               */
/* -------------------------------------------------------------------------- */

const LINEAR_SRGB_TO_LMS: Mat3 = [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
];

const LMS_TO_OKLAB: Mat3 = [
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
];

const OKLAB_TO_LMS: Mat3 = [
    [1, 0.3963377774, 0.2158037573],
    [1, -0.1055613458, -0.0638541728],
    [1, -0.0894841775, -1.291485548],
];

const LMS_TO_LINEAR_SRGB: Mat3 = [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
];

export function rgbToOklab(color: Rgb): Oklab {
    const lms = multiply(LINEAR_SRGB_TO_LMS, [
        srgbToLinear(color.r),
        srgbToLinear(color.g),
        srgbToLinear(color.b),
    ]);
    const roots: Vec3 = [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])];
    const lab = multiply(LMS_TO_OKLAB, roots);
    return { l: lab[0], a: lab[1], b: lab[2], alpha: color.alpha };
}

export function oklabToRgb(oklab: Oklab): Rgb {
    const roots = multiply(OKLAB_TO_LMS, [oklab.l, oklab.a, oklab.b]);
    const lms: Vec3 = [
        roots[0] * roots[0] * roots[0],
        roots[1] * roots[1] * roots[1],
        roots[2] * roots[2] * roots[2],
    ];
    const linear = multiply(LMS_TO_LINEAR_SRGB, lms);
    return rgb(
        linearToSrgb(linear[0]),
        linearToSrgb(linear[1]),
        linearToSrgb(linear[2]),
        oklab.alpha,
    );
}

export function oklabToOklch(oklab: Oklab): Oklch {
    const { c, h } = toPolar(oklab.a, oklab.b, OKLAB_CHROMA_FLOOR);
    return { l: oklab.l, c, h, alpha: oklab.alpha };
}

export function oklchToOklab(oklch: Oklch): Oklab {
    const { a, b } = fromPolar(oklch.c, oklch.h);
    return { l: oklch.l, a, b, alpha: oklch.alpha };
}

export function rgbToOklch(color: Rgb): Oklch {
    return oklabToOklch(rgbToOklab(color));
}

export function oklchToRgb(oklch: Oklch): Rgb {
    return oklabToRgb(oklchToOklab(oklch));
}

/* -------------------------------------------------------------------------- */
/* The sRGB re-parameterisations                                              */
/* -------------------------------------------------------------------------- */

/**
 * HSL from a colour, clipping first.
 *
 * HSL is defined as a reshaping of the sRGB cube, so a channel outside 0..1 has no HSL
 * expression at all — feeding one through produces saturation above 100% and a lightness
 * that no CSS engine will read back as the same colour. Clipping here and reporting it at
 * the formatter is the honest half of that trade.
 */
export function rgbToHsl(color: Rgb): Hsl {
    const { r, g, b, alpha } = clipRgb(color);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const chroma = max - min;

    if (chroma < 1e-12) return { h: 0, s: 0, l: l * 100, alpha };

    const s = chroma / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) h = ((g - b) / chroma) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;

    return { h: normalizeHue(h * 60), s: s * 100, l: l * 100, alpha };
}

export function hslToRgb(hsl: Hsl): Rgb {
    const h = normalizeHue(hsl.h) / 60;
    const s = clamp(hsl.s, 0, 100) / 100;
    const l = clamp(hsl.l, 0, 100) / 100;

    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((h % 2) - 1));
    const m = l - chroma / 2;

    const [r, g, b] = sectorTriple(h, chroma, x);
    return rgb(r + m, g + m, b + m, hsl.alpha);
}

/** Which two of the three channels the hue sector lights up. Shared by HSL and HSV. */
function sectorTriple(hueSixth: number, chroma: number, x: number): Vec3 {
    if (hueSixth < 1) return [chroma, x, 0];
    if (hueSixth < 2) return [x, chroma, 0];
    if (hueSixth < 3) return [0, chroma, x];
    if (hueSixth < 4) return [0, x, chroma];
    if (hueSixth < 5) return [x, 0, chroma];
    return [chroma, 0, x];
}

export function rgbToHsv(color: Rgb): Hsv {
    const { r, g, b, alpha } = clipRgb(color);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;

    if (chroma < 1e-12) return { h: 0, s: 0, v: max * 100, alpha };

    let h: number;
    if (max === r) h = ((g - b) / chroma) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;

    return { h: normalizeHue(h * 60), s: (chroma / max) * 100, v: max * 100, alpha };
}

export function hsvToRgb(hsv: Hsv): Rgb {
    const h = normalizeHue(hsv.h) / 60;
    const s = clamp(hsv.s, 0, 100) / 100;
    const v = clamp(hsv.v, 0, 100) / 100;

    const chroma = v * s;
    const x = chroma * (1 - Math.abs((h % 2) - 1));
    const m = v - chroma;

    const [r, g, b] = sectorTriple(h, chroma, x);
    return rgb(r + m, g + m, b + m, hsv.alpha);
}

export function rgbToHwb(color: Rgb): Hwb {
    const { r, g, b, alpha } = clipRgb(color);
    const hsv = rgbToHsv(color);
    return {
        h: hsv.h,
        w: Math.min(r, g, b) * 100,
        b: (1 - Math.max(r, g, b)) * 100,
        alpha,
    };
}

/**
 * HWB back to a colour.
 *
 * The `w + b >= 100` branch is not an edge case to be tidied away: CSS defines it as a grey
 * at the ratio of the two, and without it `hwb(200 70% 70%)` — which a user will absolutely
 * type while dragging two sliders — produces negative channels and a colour that is not grey
 * and not the hue they asked for either.
 */
export function hwbToRgb(hwb: Hwb): Rgb {
    const w = clamp(hwb.w, 0, 100) / 100;
    const b = clamp(hwb.b, 0, 100) / 100;

    if (w + b >= 1) {
        const grey = w / (w + b);
        return rgb(grey, grey, grey, hwb.alpha);
    }

    const base = hsvToRgb({ h: hwb.h, s: 100, v: 100, alpha: hwb.alpha });
    const scale = 1 - w - b;
    return rgb(base.r * scale + w, base.g * scale + w, base.b * scale + w, hwb.alpha);
}

export function rgbToCmyk(color: Rgb): Cmyk {
    const { r, g, b, alpha } = clipRgb(color);
    const k = 1 - Math.max(r, g, b);

    // Pure black divides by zero in the general formula, and the specification-free
    // convention every tool follows is that black has no chromatic ink at all.
    if (k >= 1 - 1e-12) return { c: 0, m: 0, y: 0, k: 100, alpha };

    return {
        c: ((1 - r - k) / (1 - k)) * 100,
        m: ((1 - g - k) / (1 - k)) * 100,
        y: ((1 - b - k) / (1 - k)) * 100,
        k: k * 100,
        alpha,
    };
}

export function cmykToRgb(cmyk: Cmyk): Rgb {
    const c = clamp(cmyk.c, 0, 100) / 100;
    const m = clamp(cmyk.m, 0, 100) / 100;
    const y = clamp(cmyk.y, 0, 100) / 100;
    const k = clamp(cmyk.k, 0, 100) / 100;
    return rgb((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k), cmyk.alpha);
}

/* -------------------------------------------------------------------------- */
/* Contrast                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * WCAG 2.1 relative luminance, over the clipped colour.
 *
 * Clipped because luminance is a statement about what a display emits, and a display cannot
 * emit the out-of-gamut part. Reporting the luminance of a colour that will never appear on
 * screen would make the contrast figure beside it a fiction.
 */
export function relativeLuminance(color: Rgb): number {
    const { r, g, b } = clipRgb(color);
    return (
        0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
    );
}

/** WCAG 2.1 contrast ratio, 1 for identical colours and 21 for black against white. */
export function contrastRatio(a: Rgb, b: Rgb): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A translucent colour composited over an opaque one.
 *
 * The contrast readout needs this and would otherwise lie by a wide margin. Text at 40%
 * alpha over a dark surface has nothing like the contrast its own colour suggests, and a
 * picker that reported the uncomposited figure would cheerfully certify unreadable text as
 * accessible.
 */
export function compositeOver(source: Rgb, backdrop: Rgb): Rgb {
    const a = clamp(source.alpha, 0, 1);
    return rgb(
        source.r * a + backdrop.r * (1 - a),
        source.g * a + backdrop.g * (1 - a),
        source.b * a + backdrop.b * (1 - a),
        1,
    );
}

/** The WCAG conformance level a ratio reaches, given the text size it is used at. */
export type ContrastLevel = "fail" | "AA" | "AAA";

/**
 * The level a ratio reaches.
 *
 * `large` is WCAG's own definition — 18pt, or 14pt bold — rather than a guess at what looks
 * big, and the caller passes it because only the caller knows what the colour is being used
 * for. Defaulting to body text is the conservative direction: it can report a fail for
 * something that would have passed as large text, never the reverse.
 */
export function contrastLevel(ratio: number, large = false): ContrastLevel {
    if (large) return ratio >= 4.5 ? "AAA" : ratio >= 3 ? "AA" : "fail";
    return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "fail";
}
