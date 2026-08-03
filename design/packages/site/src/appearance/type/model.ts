/**
 * The typography model behind the per-element appearance editors.
 *
 * Every property is declared once, as data. The editor renders from that
 * declaration, the CSS emitter reads from it, the reset machinery walks it, and
 * export/import round-trips it. A property that the browser cannot render is still
 * declared, still shown, still stored, and still exported; it is marked instead of
 * removed, because removing it is how a saved value disappears without anyone
 * being told.
 */

export type ItalicMode = "none" | "italic" | "oblique";
export type UnderlineStyle = "none" | "solid" | "double" | "dotted" | "dashed" | "wavy";
export type StrikeMode = "none" | "single" | "double";
export type Capitalization = "none" | "uppercase" | "lowercase" | "capitalize";
export type TextPosition = "normal" | "super" | "sub";
export type Alignment = "start" | "center" | "end" | "justify";
export type TextDirection = "ltr" | "rtl";

export interface TypographyValues {
    fontFamilyId: string;
    fontSize: number;
    fontWeight: number;
    italic: ItalicMode;
    obliqueAngle: number;
    underline: UnderlineStyle;
    /** Empty string means "inherit the text colour". */
    underlineColor: string;
    strikethrough: StrikeMode;
    overline: boolean;
    capitalization: Capitalization;
    smallCaps: boolean;
    position: TextPosition;
    textColor: string;
    highlightColor: string;
    letterSpacing: number;
    wordSpacing: number;
    lineHeight: number;
    baselineOffset: number;
    alignment: Alignment;
    direction: TextDirection;
    outlineWidth: number;
    outlineColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowBlur: number;
    shadowColor: string;
    glowRadius: number;
    glowColor: string;
    /** Free entry, for example `"wght" 620, "opsz" 32`. Passed through untouched. */
    variationSettings: string;
}

export type TypographyKey = keyof TypographyValues;

export const TYPOGRAPHY_DEFAULTS: TypographyValues = {
    fontFamilyId: "",
    fontSize: 0,
    fontWeight: 0,
    italic: "none",
    obliqueAngle: 14,
    underline: "none",
    underlineColor: "",
    strikethrough: "none",
    overline: false,
    capitalization: "none",
    smallCaps: false,
    position: "normal",
    textColor: "",
    highlightColor: "",
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 0,
    baselineOffset: 0,
    alignment: "start",
    direction: "ltr",
    outlineWidth: 0,
    outlineColor: "",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    shadowColor: "",
    glowRadius: 0,
    glowColor: "",
    variationSettings: "",
};

/**
 * `0` and `""` mean "inherit", not "zero".
 *
 * Storing an explicit sentinel rather than `undefined` keeps the value object a
 * flat record, which is what makes a per-property reset a single assignment and
 * an export a plain JSON object.
 */
export const INHERIT_NUMBER = 0;
export const INHERIT_TEXT = "";

export type ControlKind = "font" | "number" | "select" | "toggle" | "color" | "text";

export interface SelectChoice {
    readonly value: string;
    readonly labelKey: string;
}

export interface TypographyProperty {
    readonly key: TypographyKey;
    readonly labelKey: string;
    readonly descriptionKey?: string | undefined;
    readonly kind: ControlKind;
    readonly group: "family" | "weightStyle" | "decoration" | "case" | "color" | "metrics" | "effects";
    readonly min?: number | undefined;
    readonly max?: number | undefined;
    readonly step?: number | undefined;
    readonly unit?: string | undefined;
    readonly choices?: readonly SelectChoice[] | undefined;
    readonly maxLength?: number | undefined;
    /** The CSS feature tested with `CSS.supports` before the control is marked. */
    readonly probe?: readonly [string, string] | undefined;
}

export const TYPOGRAPHY_PROPERTIES: readonly TypographyProperty[] = [
    { key: "fontFamilyId", labelKey: "type.family", kind: "font", group: "family" },
    {
        key: "fontSize",
        labelKey: "type.size",
        kind: "number",
        group: "family",
        min: 0,
        max: 128,
        step: 0.5,
        unit: "px",
    },
    {
        key: "fontWeight",
        labelKey: "type.weight",
        kind: "select",
        group: "weightStyle",
        choices: [
            { value: "0", labelKey: "type.inherit" },
            { value: "100", labelKey: "type.weight.100" },
            { value: "200", labelKey: "type.weight.200" },
            { value: "300", labelKey: "type.weight.300" },
            { value: "400", labelKey: "type.weight.400" },
            { value: "500", labelKey: "type.weight.500" },
            { value: "600", labelKey: "type.weight.600" },
            { value: "700", labelKey: "type.weight.700" },
            { value: "800", labelKey: "type.weight.800" },
            { value: "900", labelKey: "type.weight.900" },
        ],
    },
    {
        key: "italic",
        labelKey: "type.italic",
        kind: "select",
        group: "weightStyle",
        choices: [
            { value: "none", labelKey: "type.italic.none" },
            { value: "italic", labelKey: "type.italic.italic" },
            { value: "oblique", labelKey: "type.italic.oblique" },
        ],
    },
    {
        key: "obliqueAngle",
        labelKey: "type.obliqueAngle",
        kind: "number",
        group: "weightStyle",
        min: -90,
        max: 90,
        step: 1,
        unit: "deg",
        probe: ["font-style", "oblique 14deg"],
    },
    {
        key: "variationSettings",
        labelKey: "type.variation",
        descriptionKey: "type.variation.desc",
        kind: "text",
        group: "weightStyle",
        maxLength: 200,
        probe: ["font-variation-settings", '"wght" 400'],
    },
    {
        key: "underline",
        labelKey: "type.underline",
        kind: "select",
        group: "decoration",
        choices: [
            { value: "none", labelKey: "type.underline.none" },
            { value: "solid", labelKey: "type.underline.solid" },
            { value: "double", labelKey: "type.underline.double" },
            { value: "dotted", labelKey: "type.underline.dotted" },
            { value: "dashed", labelKey: "type.underline.dashed" },
            { value: "wavy", labelKey: "type.underline.wavy" },
        ],
        probe: ["text-decoration-style", "wavy"],
    },
    { key: "underlineColor", labelKey: "type.underlineColor", kind: "color", group: "decoration", probe: ["text-decoration-color", "red"] },
    {
        key: "strikethrough",
        labelKey: "type.strike",
        kind: "select",
        group: "decoration",
        choices: [
            { value: "none", labelKey: "type.strike.none" },
            { value: "single", labelKey: "type.strike.single" },
            { value: "double", labelKey: "type.strike.double" },
        ],
    },
    { key: "overline", labelKey: "type.overline", kind: "toggle", group: "decoration" },
    {
        key: "capitalization",
        labelKey: "type.case",
        kind: "select",
        group: "case",
        choices: [
            { value: "none", labelKey: "type.case.none" },
            { value: "uppercase", labelKey: "type.case.upper" },
            { value: "lowercase", labelKey: "type.case.lower" },
            { value: "capitalize", labelKey: "type.case.title" },
        ],
    },
    {
        key: "smallCaps",
        labelKey: "type.smallCaps",
        kind: "toggle",
        group: "case",
        probe: ["font-variant-caps", "small-caps"],
    },
    {
        key: "position",
        labelKey: "type.position",
        kind: "select",
        group: "case",
        choices: [
            { value: "normal", labelKey: "type.position.normal" },
            { value: "super", labelKey: "type.position.super" },
            { value: "sub", labelKey: "type.position.sub" },
        ],
    },
    { key: "textColor", labelKey: "type.textColor", kind: "color", group: "color" },
    { key: "highlightColor", labelKey: "type.highlight", kind: "color", group: "color" },
    {
        key: "letterSpacing",
        labelKey: "type.letterSpacing",
        kind: "number",
        group: "metrics",
        min: -0.2,
        max: 1,
        step: 0.005,
        unit: "em",
    },
    {
        key: "wordSpacing",
        labelKey: "type.wordSpacing",
        kind: "number",
        group: "metrics",
        min: -0.5,
        max: 3,
        step: 0.01,
        unit: "em",
    },
    {
        key: "lineHeight",
        labelKey: "type.lineHeight",
        kind: "number",
        group: "metrics",
        min: 0,
        max: 4,
        step: 0.05,
        unit: "",
    },
    {
        key: "baselineOffset",
        labelKey: "type.baseline",
        kind: "number",
        group: "metrics",
        min: -2,
        max: 2,
        step: 0.05,
        unit: "em",
    },
    {
        key: "alignment",
        labelKey: "type.align",
        kind: "select",
        group: "metrics",
        choices: [
            { value: "start", labelKey: "type.align.start" },
            { value: "center", labelKey: "type.align.center" },
            { value: "end", labelKey: "type.align.end" },
            { value: "justify", labelKey: "type.align.justify" },
        ],
    },
    {
        key: "direction",
        labelKey: "type.direction",
        kind: "select",
        group: "metrics",
        choices: [
            { value: "ltr", labelKey: "type.direction.ltr" },
            { value: "rtl", labelKey: "type.direction.rtl" },
        ],
    },
    {
        key: "outlineWidth",
        labelKey: "type.outline",
        descriptionKey: "type.outline.desc",
        kind: "number",
        group: "effects",
        min: 0,
        max: 4,
        step: 0.25,
        unit: "px",
        probe: ["-webkit-text-stroke-width", "1px"],
    },
    { key: "outlineColor", labelKey: "type.outlineColor", kind: "color", group: "effects", probe: ["-webkit-text-stroke-color", "red"] },
    { key: "shadowOffsetX", labelKey: "type.shadowX", kind: "number", group: "effects", min: -20, max: 20, step: 0.5, unit: "px" },
    { key: "shadowOffsetY", labelKey: "type.shadowY", kind: "number", group: "effects", min: -20, max: 20, step: 0.5, unit: "px" },
    { key: "shadowBlur", labelKey: "type.shadowBlur", kind: "number", group: "effects", min: 0, max: 40, step: 0.5, unit: "px" },
    { key: "shadowColor", labelKey: "type.shadowColor", kind: "color", group: "effects" },
    {
        key: "glowRadius",
        labelKey: "type.glow",
        descriptionKey: "type.glow.desc",
        kind: "number",
        group: "effects",
        min: 0,
        max: 40,
        step: 0.5,
        unit: "px",
    },
    { key: "glowColor", labelKey: "type.glowColor", kind: "color", group: "effects" },
];

export interface CapabilityReport {
    readonly supported: boolean;
    /** i18n key naming why, shown beside the control when unsupported. */
    readonly reasonKey: string | null;
}

const capabilityCache = new Map<TypographyKey, CapabilityReport>();

/**
 * Whether this browser can render a property.
 *
 * A negative answer never hides the control. It shows a note, the value stays
 * editable, and it is written to storage and to any exported theme exactly as
 * entered, so opening the same theme in a browser that does render it works.
 */
export function capabilityOf(property: TypographyProperty): CapabilityReport {
    const cached = capabilityCache.get(property.key);
    if (cached !== undefined) return cached;

    let report: CapabilityReport = { supported: true, reasonKey: null };
    const probe = property.probe;
    if (probe !== undefined) {
        let supported = true;
        try {
            supported =
                typeof CSS !== "undefined" && typeof CSS.supports === "function"
                    ? CSS.supports(probe[0], probe[1])
                    : true;
        } catch {
            supported = true;
        }
        if (!supported) report = { supported: false, reasonKey: "type.unsupported" };
    }
    capabilityCache.set(property.key, report);
    return report;
}

export function propertyByKey(key: TypographyKey): TypographyProperty | undefined {
    return TYPOGRAPHY_PROPERTIES.find((property) => property.key === key);
}

/** True when a property is at its inherit sentinel, so the reset button can be disabled. */
export function isPropertyInherited(values: TypographyValues, key: TypographyKey): boolean {
    return values[key] === TYPOGRAPHY_DEFAULTS[key];
}

/**
 * Turn the values into CSS declarations.
 *
 * `resolveFont` maps a stored family id to a stack, and `resolveColor` turns a
 * stored colour string into something a browser will render. Both are passed in
 * so this module needs neither the font list nor the colour parser.
 */
export function typographyToCss(
    values: TypographyValues,
    resolveFont: (id: string) => string | null,
    resolveColor: (value: string) => string | null
): Record<string, string> {
    const css: Record<string, string> = {};

    if (values.fontFamilyId !== INHERIT_TEXT) {
        const stack = resolveFont(values.fontFamilyId);
        if (stack !== null) css["font-family"] = stack;
    }
    if (values.fontSize !== INHERIT_NUMBER) css["font-size"] = `${values.fontSize}px`;
    if (values.fontWeight !== INHERIT_NUMBER) css["font-weight"] = String(values.fontWeight);

    if (values.italic === "italic") css["font-style"] = "italic";
    else if (values.italic === "oblique") css["font-style"] = `oblique ${values.obliqueAngle}deg`;

    if (values.variationSettings !== INHERIT_TEXT) {
        css["font-variation-settings"] = values.variationSettings;
    }

    const lines: string[] = [];
    if (values.underline !== "none") lines.push("underline");
    if (values.strikethrough !== "none") lines.push("line-through");
    if (values.overline) lines.push("overline");
    if (lines.length > 0) {
        css["text-decoration-line"] = lines.join(" ");
        // `double` is the only way CSS draws a doubled strike or underline, and it
        // applies to every line at once. When the two disagree the underline wins and
        // the editor says so, rather than pretending both were honoured.
        const style =
            values.underline !== "none" && values.underline !== "solid"
                ? values.underline
                : values.strikethrough === "double"
                  ? "double"
                  : "solid";
        css["text-decoration-style"] = style;
        if (values.underlineColor !== INHERIT_TEXT) {
            const resolved = resolveColor(values.underlineColor);
            if (resolved !== null) css["text-decoration-color"] = resolved;
        }
    }

    if (values.capitalization !== "none") css["text-transform"] = values.capitalization;
    if (values.smallCaps) css["font-variant-caps"] = "small-caps";

    if (values.position === "super" || values.position === "sub") {
        css["vertical-align"] = values.position;
        if (values.fontSize === INHERIT_NUMBER) css["font-size"] = "0.75em";
    } else if (values.baselineOffset !== INHERIT_NUMBER) {
        css["vertical-align"] = `${values.baselineOffset}em`;
    }

    if (values.textColor !== INHERIT_TEXT) {
        const resolved = resolveColor(values.textColor);
        if (resolved !== null) css["color"] = resolved;
    }
    if (values.highlightColor !== INHERIT_TEXT) {
        const resolved = resolveColor(values.highlightColor);
        if (resolved !== null) css["background-color"] = resolved;
    }

    if (values.letterSpacing !== INHERIT_NUMBER) css["letter-spacing"] = `${values.letterSpacing}em`;
    if (values.wordSpacing !== INHERIT_NUMBER) css["word-spacing"] = `${values.wordSpacing}em`;
    if (values.lineHeight !== INHERIT_NUMBER) css["line-height"] = String(values.lineHeight);
    if (values.alignment !== "start") css["text-align"] = values.alignment;
    if (values.direction !== "ltr") css["direction"] = values.direction;

    if (values.outlineWidth !== INHERIT_NUMBER) {
        css["-webkit-text-stroke-width"] = `${values.outlineWidth}px`;
        if (values.outlineColor !== INHERIT_TEXT) {
            const resolved = resolveColor(values.outlineColor);
            if (resolved !== null) css["-webkit-text-stroke-color"] = resolved;
        }
    }

    const shadows: string[] = [];
    const hasShadow =
        values.shadowOffsetX !== 0 || values.shadowOffsetY !== 0 || values.shadowBlur !== 0;
    if (hasShadow) {
        const shadowColor = resolveColor(values.shadowColor) ?? "rgb(0 0 0 / 0.45)";
        shadows.push(
            `${values.shadowOffsetX}px ${values.shadowOffsetY}px ${values.shadowBlur}px ${shadowColor}`
        );
    }
    if (values.glowRadius > 0) {
        const glowColor = resolveColor(values.glowColor) ?? "currentColor";
        shadows.push(`0 0 ${values.glowRadius}px ${glowColor}`);
    }
    if (shadows.length > 0) css["text-shadow"] = shadows.join(", ");

    return css;
}

/** A clean copy, so an editor can preview without mutating the stored value. */
export function cloneTypography(values: TypographyValues): TypographyValues {
    return { ...values };
}
