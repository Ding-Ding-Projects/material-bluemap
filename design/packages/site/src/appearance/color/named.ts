/**
 * The CSS named colours, plus `transparent`.
 *
 * The list is bundled rather than derived from the browser so that a name resolves
 * to the same value with or without a document, and so the reverse lookup (an RGB
 * triple back to a name) is deterministic. Names are stored as 24-bit integers to
 * keep the table small; alpha is carried separately by the colour model.
 */

const NAMED_RGB: Readonly<Record<string, number>> = {
    aliceblue: 0xf0f8ff,
    antiquewhite: 0xfaebd7,
    aqua: 0x00ffff,
    aquamarine: 0x7fffd4,
    azure: 0xf0ffff,
    beige: 0xf5f5dc,
    bisque: 0xffe4c4,
    black: 0x000000,
    blanchedalmond: 0xffebcd,
    blue: 0x0000ff,
    blueviolet: 0x8a2be2,
    brown: 0xa52a2a,
    burlywood: 0xdeb887,
    cadetblue: 0x5f9ea0,
    chartreuse: 0x7fff00,
    chocolate: 0xd2691e,
    coral: 0xff7f50,
    cornflowerblue: 0x6495ed,
    cornsilk: 0xfff8dc,
    crimson: 0xdc143c,
    cyan: 0x00ffff,
    darkblue: 0x00008b,
    darkcyan: 0x008b8b,
    darkgoldenrod: 0xb8860b,
    darkgray: 0xa9a9a9,
    darkgreen: 0x006400,
    darkgrey: 0xa9a9a9,
    darkkhaki: 0xbdb76b,
    darkmagenta: 0x8b008b,
    darkolivegreen: 0x556b2f,
    darkorange: 0xff8c00,
    darkorchid: 0x9932cc,
    darkred: 0x8b0000,
    darksalmon: 0xe9967a,
    darkseagreen: 0x8fbc8f,
    darkslateblue: 0x483d8b,
    darkslategray: 0x2f4f4f,
    darkslategrey: 0x2f4f4f,
    darkturquoise: 0x00ced1,
    darkviolet: 0x9400d3,
    deeppink: 0xff1493,
    deepskyblue: 0x00bfff,
    dimgray: 0x696969,
    dimgrey: 0x696969,
    dodgerblue: 0x1e90ff,
    firebrick: 0xb22222,
    floralwhite: 0xfffaf0,
    forestgreen: 0x228b22,
    fuchsia: 0xff00ff,
    gainsboro: 0xdcdcdc,
    ghostwhite: 0xf8f8ff,
    gold: 0xffd700,
    goldenrod: 0xdaa520,
    gray: 0x808080,
    green: 0x008000,
    greenyellow: 0xadff2f,
    grey: 0x808080,
    honeydew: 0xf0fff0,
    hotpink: 0xff69b4,
    indianred: 0xcd5c5c,
    indigo: 0x4b0082,
    ivory: 0xfffff0,
    khaki: 0xf0e68c,
    lavender: 0xe6e6fa,
    lavenderblush: 0xfff0f5,
    lawngreen: 0x7cfc00,
    lemonchiffon: 0xfffacd,
    lightblue: 0xadd8e6,
    lightcoral: 0xf08080,
    lightcyan: 0xe0ffff,
    lightgoldenrodyellow: 0xfafad2,
    lightgray: 0xd3d3d3,
    lightgreen: 0x90ee90,
    lightgrey: 0xd3d3d3,
    lightpink: 0xffb6c1,
    lightsalmon: 0xffa07a,
    lightseagreen: 0x20b2aa,
    lightskyblue: 0x87cefa,
    lightslategray: 0x778899,
    lightslategrey: 0x778899,
    lightsteelblue: 0xb0c4de,
    lightyellow: 0xffffe0,
    lime: 0x00ff00,
    limegreen: 0x32cd32,
    linen: 0xfaf0e6,
    magenta: 0xff00ff,
    maroon: 0x800000,
    mediumaquamarine: 0x66cdaa,
    mediumblue: 0x0000cd,
    mediumorchid: 0xba55d3,
    mediumpurple: 0x9370db,
    mediumseagreen: 0x3cb371,
    mediumslateblue: 0x7b68ee,
    mediumspringgreen: 0x00fa9a,
    mediumturquoise: 0x48d1cc,
    mediumvioletred: 0xc71585,
    midnightblue: 0x191970,
    mintcream: 0xf5fffa,
    mistyrose: 0xffe4e1,
    moccasin: 0xffe4b5,
    navajowhite: 0xffdead,
    navy: 0x000080,
    oldlace: 0xfdf5e6,
    olive: 0x808000,
    olivedrab: 0x6b8e23,
    orange: 0xffa500,
    orangered: 0xff4500,
    orchid: 0xda70d6,
    palegoldenrod: 0xeee8aa,
    palegreen: 0x98fb98,
    paleturquoise: 0xafeeee,
    palevioletred: 0xdb7093,
    papayawhip: 0xffefd5,
    peachpuff: 0xffdab9,
    peru: 0xcd853f,
    pink: 0xffc0cb,
    plum: 0xdda0dd,
    powderblue: 0xb0e0e6,
    purple: 0x800080,
    rebeccapurple: 0x663399,
    red: 0xff0000,
    rosybrown: 0xbc8f8f,
    royalblue: 0x4169e1,
    saddlebrown: 0x8b4513,
    salmon: 0xfa8072,
    sandybrown: 0xf4a460,
    seagreen: 0x2e8b57,
    seashell: 0xfff5ee,
    sienna: 0xa0522d,
    silver: 0xc0c0c0,
    skyblue: 0x87ceeb,
    slateblue: 0x6a5acd,
    slategray: 0x708090,
    slategrey: 0x708090,
    snow: 0xfffafa,
    springgreen: 0x00ff7f,
    steelblue: 0x4682b4,
    tan: 0xd2b48c,
    teal: 0x008080,
    thistle: 0xd8bfd8,
    tomato: 0xff6347,
    turquoise: 0x40e0d0,
    violet: 0xee82ee,
    wheat: 0xf5deb3,
    white: 0xffffff,
    whitesmoke: 0xf5f5f5,
    yellow: 0xffff00,
    yellowgreen: 0x9acd32,
};

/**
 * Names preferred when several map to the same value, so the reverse lookup is
 * stable rather than dependent on object key order.
 */
const PREFERRED_ALIASES: Readonly<Record<string, string>> = {
    aqua: "aqua",
    cyan: "aqua",
    fuchsia: "fuchsia",
    magenta: "fuchsia",
    gray: "gray",
    grey: "gray",
    darkgray: "darkgray",
    darkgrey: "darkgray",
    darkslategray: "darkslategray",
    darkslategrey: "darkslategray",
    dimgray: "dimgray",
    dimgrey: "dimgray",
    lightgray: "lightgray",
    lightgrey: "lightgray",
    lightslategray: "lightslategray",
    lightslategrey: "lightslategray",
    slategray: "slategray",
    slategrey: "slategray",
};

const REVERSE_LOOKUP: Map<number, string> = (() => {
    const map = new Map<number, string>();
    for (const [name, value] of Object.entries(NAMED_RGB)) {
        const preferred = PREFERRED_ALIASES[name] ?? name;
        const existing = map.get(value);
        if (existing === undefined || existing !== preferred) {
            if (existing === undefined) map.set(value, preferred);
            else if (existing.length > preferred.length) map.set(value, preferred);
        }
    }
    return map;
})();

/** Every recognised name, sorted, for the picker's name list and its search. */
export const NAMED_COLOR_NAMES: readonly string[] = Object.keys(NAMED_RGB).sort();

/** Look a name up. Returns sRGB components in 0..1, or `null` if the name is unknown. */
export function lookupNamedColor(name: string): { rgb: [number, number, number]; alpha: number } | null {
    const key = name.trim().toLowerCase();
    if (key === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
    const value = NAMED_RGB[key];
    if (value === undefined) return null;
    return {
        rgb: [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255],
        alpha: 1,
    };
}

/**
 * The name for an exact 8-bit sRGB triple, or `null` when no name matches.
 *
 * Only exact matches count. Returning the *nearest* name would make the picker
 * claim a colour is `tomato` when it is a shade the user chose deliberately.
 */
export function nameForSrgb(rgb: readonly [number, number, number], alpha: number): string | null {
    if (alpha === 0) return "transparent";
    if (alpha !== 1) return null;
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    if (Math.abs(rgb[0] * 255 - r) > 0.001) return null;
    if (Math.abs(rgb[1] * 255 - g) > 0.001) return null;
    if (Math.abs(rgb[2] * 255 - b) > 0.001) return null;
    return REVERSE_LOOKUP.get((r << 16) | (g << 8) | b) ?? null;
}
