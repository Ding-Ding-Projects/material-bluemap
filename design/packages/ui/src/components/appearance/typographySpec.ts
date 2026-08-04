/**
 * The typography half of the appearance editor: what a user can decide about text, and
 * what the engine underneath is actually willing to draw.
 *
 * The shape below is deliberately wider than CSS. A word processor's font dialog offers
 * small caps, a synthetic bold, an oblique angle, a double strikethrough, an outline and a
 * glow, and somebody who has used one expects to find them here. Several of those map onto
 * a single CSS declaration that can only hold one value at a time, and one or two are not
 * guaranteed to exist in every engine at all. Both of those facts are the interesting part
 * of this module.
 *
 * ### Nothing is ever silently dropped
 *
 * The rule this module exists to keep is: *a property the platform cannot support stays
 * visible with a clear explanation, rather than disappearing or quietly losing the value
 * somebody saved.* So capability detection and style generation are two separate steps.
 * {@link detectTypographyCapabilities} asks the engine what it can do; {@link typographyCss}
 * emits only what the engine accepted and returns the list of properties it had to leave
 * out. The value stays in the {@link TypographySpec} either way, so turning the control back
 * on — or opening the same profile on a machine whose engine is newer — brings it back
 * untouched.
 *
 * The second honesty problem is subtler and has no capability flag to hang off. CSS draws
 * underline, strikethrough and overline through one `text-decoration-line` declaration with
 * *one* `text-decoration-style` and *one* `text-decoration-color` between them. A wavy
 * underline beside a double strikethrough is not a thing CSS can express, and picking one
 * silently would leave somebody staring at a control whose value the preview ignores. So
 * this module picks a documented winner — see {@link typographyCss} — and returns a
 * {@link TypographyNote} naming the property that lost, for the editor to show beside it.
 *
 * ### Purity
 *
 * No DOM is touched at import time and Vue is not imported. The one thing this module needs
 * from the browser — `CSS.supports` — arrives as the injected {@link CssSupport}, which is
 * also what lets a Node test drive every branch without a jsdom.
 */

/* ------------------------------------------------------------------------------------- *
 * The spec
 * ------------------------------------------------------------------------------------- */

/** How a font size is written. `rem` scales with the app's own density setting. */
export type FontSizeUnit = "px" | "pt" | "rem";

/** Upright, true italic, or a slanted upright face at a chosen angle. */
export type ItalicStyle = "none" | "italic" | "oblique";

/** The line styles the underline control offers, mirroring `text-decoration-style`. */
export type UnderlineStyle = "none" | "solid" | "double" | "dotted" | "dashed" | "wavy";

/** A strikethrough is one line or two; CSS draws the second with `text-decoration-style`. */
export type StrikethroughStyle = "none" | "single" | "double";

/** `text-transform`, under the name a word processor uses for it. */
export type Capitalization = "none" | "uppercase" | "lowercase" | "capitalize";

/** Raised, lowered, or sitting on the baseline like everything else. */
export type BaselineShift = "none" | "superscript" | "subscript";

export type TextDirection = "ltr" | "rtl";

/** Logical alignment, so `start`/`end` follow {@link TypographySpec.textDirection}. */
export type TextAlign = "start" | "center" | "end" | "justify";

/** A drop shadow, in the four numbers CSS's `text-shadow` takes. */
export interface TextShadowSpec {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blur: number;
    /** CSS colour. `""` means no shadow is drawn at all. */
    readonly color: string;
}

/**
 * A glow, which is a shadow with no offset.
 *
 * Kept as its own property rather than folded into {@link TextShadowSpec} because they are
 * two different ideas to the person editing them — one throws the text forward off the page,
 * the other makes it luminous — and because CSS is happy to draw both at once. They compose
 * into a single comma-separated `text-shadow`; see {@link typographyCss}.
 */
export interface TextGlowSpec {
    readonly radius: number;
    /** CSS colour. `""` means no glow. */
    readonly color: string;
}

/**
 * Every typographic decision the editor exposes, fully populated.
 *
 * This is the *resolved* shape: every field has a value, because something has to be drawn.
 * Per-element overrides are `Partial<TypographySpec>`, where an absent key means "inherit",
 * and {@link mergeTypography} folds a stack of those onto {@link DEFAULT_TYPOGRAPHY}.
 */
export interface TypographySpec {
    /**
     * A family *name*, not a CSS stack.
     *
     * Building the stack — quoting, Latin fallbacks, the CJK tail, the generic terminator —
     * belongs to `fontCatalog.ts`, which is the module that knows which families exist. The
     * finished stack is handed to {@link typographyCss} as its `fontStack` argument.
     */
    fontFamily: string;
    /** Size as a bare number; the unit lives in {@link fontSizeUnit}. */
    fontSize: number;
    fontSizeUnit: FontSizeUnit;
    /** CSS numeric weight, 1–1000. Variable fonts use the whole range; static faces snap. */
    fontWeight: number;
    /**
     * The **B** button, which is not the same control as {@link fontWeight}.
     *
     * A numeric weight picks a face. The bold toggle says "whatever face this is, make it
     * bold", which is what somebody pressing Ctrl+B means and what they expect to be able to
     * turn off again without losing the weight they chose. The two combine by taking the
     * larger: bold raises the effective weight to at least 700, and a numeric weight already
     * above 700 is preserved rather than being pulled down to it. So 300 + bold renders 700,
     * 800 + bold renders 800, and clearing the toggle restores 300 and 800 respectively.
     */
    bold: boolean;
    italic: ItalicStyle;
    /** Slant in degrees, used only when {@link italic} is `"oblique"`. */
    obliqueAngle: number;
    /**
     * Variable-font axes by tag — `wght`, `wdth`, `slnt`, `opsz`, and whatever else a face
     * declares. Empty for a static font.
     *
     * A `wght` axis here and {@link fontWeight} both reach the same rendered weight, and CSS
     * gives `font-variation-settings` the final say. That is intentional: the numeric weight
     * is the coarse control everybody knows, and the axis is the fine one for somebody who
     * has opened the variable-axis panel on purpose.
     */
    variableAxes: Record<string, number>;
    underline: UnderlineStyle;
    /** CSS colour for the decoration lines. `""` inherits {@link textColor}. */
    underlineColor: string;
    strikethrough: StrikethroughStyle;
    overline: boolean;
    capitalization: Capitalization;
    smallCaps: boolean;
    baselineShift: BaselineShift;
    /**
     * A manual vertical nudge in px, independent of {@link baselineShift}.
     *
     * CSS has exactly one `vertical-align`, so the two cannot both be applied. The shift wins
     * when it is set — it is the one with a name a user recognises — and a non-zero offset
     * alongside it is reported as a {@link TypographyNote} rather than being applied on the
     * quiet or thrown away.
     */
    baselineOffset: number;
    textColor: string;
    /** Background/highlight colour behind the text. `""` means no highlight. */
    highlight: string;
    /** Outline (stroke) thickness in px. `0` means no outline. */
    outlineWidth: number;
    /** Outline colour; `""` falls back to `currentColor` so a width alone still draws. */
    outlineColor: string;
    shadow: TextShadowSpec;
    glow: TextGlowSpec;
    /** Character spacing (tracking) in px. */
    letterSpacing: number;
    wordSpacing: number;
    /** Unitless multiplier, so it scales with the font size the way a leading should. */
    lineHeight: number;
    textDirection: TextDirection;
    textAlign: TextAlign;
}

/** Every editable typography property, addressed by its {@link TypographySpec} key. */
export type TypographyPropertyId = keyof TypographySpec;

/**
 * The order the editor lists properties in, grouped the way a font dialog groups them:
 * the face, then the slant, then decoration, then case, then position, then colour, then
 * the effects, then spacing, then the paragraph-level settings.
 *
 * The `satisfies` is load-bearing rather than decorative. Adding a property to
 * {@link TypographySpec} without giving it a position here is a compile error, which is the
 * only thing standing between this list and silently falling behind the shape it describes —
 * and everything downstream (per-property reset, the editor's search, the capability record)
 * is built by walking it.
 */
const PROPERTY_ORDER = {
    fontFamily: 0,
    fontSize: 1,
    fontSizeUnit: 2,
    fontWeight: 3,
    bold: 4,
    italic: 5,
    obliqueAngle: 6,
    variableAxes: 7,
    underline: 8,
    underlineColor: 9,
    strikethrough: 10,
    overline: 11,
    capitalization: 12,
    smallCaps: 13,
    baselineShift: 14,
    baselineOffset: 15,
    textColor: 16,
    highlight: 17,
    outlineWidth: 18,
    outlineColor: 19,
    shadow: 20,
    glow: 21,
    letterSpacing: 22,
    wordSpacing: 23,
    lineHeight: 24,
    textDirection: 25,
    textAlign: 26,
} satisfies Record<TypographyPropertyId, number>;

/**
 * Every property id, in editor order.
 *
 * Sorted by the explicit numbers above rather than trusting key insertion order, so the list
 * is the same on every engine and reordering the literal cannot quietly reorder the editor.
 */
export const TYPOGRAPHY_PROPERTIES: readonly TypographyPropertyId[] = (
    Object.keys(PROPERTY_ORDER) as TypographyPropertyId[]
).sort((left, right) => PROPERTY_ORDER[left] - PROPERTY_ORDER[right]);

/**
 * Material Design 3 body text, which is what an element with no overrides renders as.
 *
 * Roboto at 14px/1.5 with a 400 weight is the M3 `body-medium` role. Everything decorative
 * is off, every colour is `""` (inherit), and the shadow and glow are present-but-colourless
 * so that turning one on is a colour change rather than a structural one.
 */
export const DEFAULT_TYPOGRAPHY: TypographySpec = {
    fontFamily: "Roboto",
    fontSize: 14,
    fontSizeUnit: "px",
    fontWeight: 400,
    bold: false,
    italic: "none",
    obliqueAngle: 14,
    variableAxes: {},
    underline: "none",
    underlineColor: "",
    strikethrough: "none",
    overline: false,
    capitalization: "none",
    smallCaps: false,
    baselineShift: "none",
    baselineOffset: 0,
    textColor: "",
    highlight: "",
    outlineWidth: 0,
    outlineColor: "",
    shadow: { offsetX: 0, offsetY: 0, blur: 0, color: "" },
    glow: { radius: 0, color: "" },
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 1.5,
    textDirection: "ltr",
    textAlign: "start",
};

/* ------------------------------------------------------------------------------------- *
 * Layering and reset
 * ------------------------------------------------------------------------------------- */

/** Returns `next` unless it is absent, in which case the inherited value stands. */
function pick<T>(current: T, next: T | undefined): T {
    return next === undefined ? current : next;
}

function applyLayer(base: TypographySpec, layer: Partial<TypographySpec>): TypographySpec {
    return {
        fontFamily: pick(base.fontFamily, layer.fontFamily),
        fontSize: pick(base.fontSize, layer.fontSize),
        fontSizeUnit: pick(base.fontSizeUnit, layer.fontSizeUnit),
        fontWeight: pick(base.fontWeight, layer.fontWeight),
        bold: pick(base.bold, layer.bold),
        italic: pick(base.italic, layer.italic),
        obliqueAngle: pick(base.obliqueAngle, layer.obliqueAngle),
        // Deep, not wholesale: an override that sets `wdth` must not wipe an inherited
        // `opsz`. Axes are independent dials on the same face, and a profile that carries
        // one of them is not a statement about the others.
        variableAxes:
            layer.variableAxes === undefined
                ? { ...base.variableAxes }
                : { ...base.variableAxes, ...layer.variableAxes },
        underline: pick(base.underline, layer.underline),
        underlineColor: pick(base.underlineColor, layer.underlineColor),
        strikethrough: pick(base.strikethrough, layer.strikethrough),
        overline: pick(base.overline, layer.overline),
        capitalization: pick(base.capitalization, layer.capitalization),
        smallCaps: pick(base.smallCaps, layer.smallCaps),
        baselineShift: pick(base.baselineShift, layer.baselineShift),
        baselineOffset: pick(base.baselineOffset, layer.baselineOffset),
        textColor: pick(base.textColor, layer.textColor),
        highlight: pick(base.highlight, layer.highlight),
        outlineWidth: pick(base.outlineWidth, layer.outlineWidth),
        outlineColor: pick(base.outlineColor, layer.outlineColor),
        // Field-by-field for the same reason as the axes, and because these two arrive from
        // JSON on disk as often as from a typed caller. `Partial<TypographySpec>` types a
        // supplied `shadow` as complete, so for a well-typed layer this is indistinguishable
        // from wholesale replacement; for a half-written record it keeps the fields the file
        // did not mention instead of resetting them to zero.
        shadow: layer.shadow === undefined ? { ...base.shadow } : { ...base.shadow, ...layer.shadow },
        glow: layer.glow === undefined ? { ...base.glow } : { ...base.glow, ...layer.glow },
        letterSpacing: pick(base.letterSpacing, layer.letterSpacing),
        wordSpacing: pick(base.wordSpacing, layer.wordSpacing),
        lineHeight: pick(base.lineHeight, layer.lineHeight),
        textDirection: pick(base.textDirection, layer.textDirection),
        textAlign: pick(base.textAlign, layer.textAlign),
    };
}

/**
 * Folds override layers onto a fully-resolved base, later layers winning.
 *
 * `undefined` never overwrites. That is the whole contract of an override record: a key that
 * is absent means "I have no opinion", not "reset this to nothing", and the two have to stay
 * distinguishable or a per-element override could not express "bold, everything else as the
 * theme says". Removing an opinion is {@link resetTypographyProperty}, which deletes the key.
 *
 * Neither the base nor any layer is mutated; the nested objects are rebuilt too, so the
 * result shares no reference with its inputs.
 */
export function mergeTypography(base: TypographySpec, ...layers: Partial<TypographySpec>[]): TypographySpec {
    return layers.reduce<TypographySpec>(applyLayer, applyLayer(base, {}));
}

/**
 * Drops one property's override, returning a new record.
 *
 * This is the editor's per-property reset. Deleting the key rather than writing the default
 * value back matters: an element that has *no opinion* about its weight follows the theme
 * when the theme changes, whereas an element that has been told "400" is pinned to 400
 * forever and looks identical until the day somebody restyles the app.
 */
export function resetTypographyProperty(
    spec: Partial<TypographySpec>,
    id: TypographyPropertyId,
): Partial<TypographySpec> {
    const next: Partial<TypographySpec> = { ...spec };
    delete next[id];
    return next;
}

/* ------------------------------------------------------------------------------------- *
 * Capability detection
 * ------------------------------------------------------------------------------------- */

/**
 * The narrow slice of `CSS` this module needs, injected rather than reached for.
 *
 * Narrowed to one method so a test can pass a plain object, and so the module stays pure:
 * nothing here touches a global at import time. The app passes `globalThis.CSS ?? null`.
 */
export interface CssSupport {
    supports: (property: string, value: string) => boolean;
}

export interface TypographyCapability {
    readonly supported: boolean;
    /** `""` when supported; otherwise one plain sentence naming the refused declaration. */
    readonly reason: string;
}

export type TypographyCapabilities = Record<TypographyPropertyId, TypographyCapability>;

/**
 * The i18n key for the sentence a caller shows when it passed `null` for {@link CssSupport}.
 *
 * Passing `null` means "there is no `CSS.supports` here", which this module answers by
 * assuming everything works — see {@link detectTypographyCapabilities}. The caller is the
 * one that passed `null`, so it is the one that knows to say so, and this is the string it
 * says it with. Exported as a key rather than as English because this module does no i18n.
 */
export const ASSUMED_SUPPORT_LABEL_KEY = "appearance.type.assumedSupport";

interface CapabilityProbe {
    /** The CSS property name handed to `CSS.supports`. */
    readonly property: string;
    /** A realistic value, not a token — engines answer per declaration, not per property. */
    readonly value: string;
    /** The editor properties that cannot be drawn if this declaration is refused. */
    readonly gates: readonly TypographyPropertyId[];
}

/**
 * Every declaration this module might emit, paired with the controls it backs.
 *
 * The values are the real ones — `oblique 14deg` rather than `oblique`, `"wght" 700` rather
 * than a bare tag — because `CSS.supports` answers about a whole declaration and will happily
 * accept a property whose interesting values it rejects.
 *
 * Two gates are deliberately conservative:
 *
 * - `text-decoration-style: wavy` and `text-underline-offset` gate the whole `underline`
 *   control, not just its wavy value. The capability record's granularity is one entry per
 *   editor property, and the underline control offers wavy; an engine that refuses the newest
 *   members of the underline family cannot honour everything the control offers, and marking
 *   the control as a whole is more useful than a control that silently works for four of its
 *   six values. In the Chromium this app actually ships on, all of these are supported.
 * - `-webkit-text-stroke` gates both outline properties, and `text-shadow` gates both the
 *   shadow and the glow, because in each case the two properties share one declaration.
 */
const CAPABILITY_PROBES: readonly CapabilityProbe[] = [
    { property: "font-family", value: "Roboto, sans-serif", gates: ["fontFamily"] },
    { property: "font-size", value: "14pt", gates: ["fontSize", "fontSizeUnit"] },
    { property: "font-weight", value: "700", gates: ["fontWeight"] },
    { property: "font-synthesis", value: "weight", gates: ["bold"] },
    { property: "font-style", value: "oblique 14deg", gates: ["italic", "obliqueAngle"] },
    { property: "font-variation-settings", value: '"wght" 700', gates: ["variableAxes"] },
    {
        property: "text-decoration-line",
        value: "underline line-through overline",
        gates: ["underline", "strikethrough", "overline"],
    },
    { property: "text-decoration-style", value: "wavy", gates: ["underline"] },
    { property: "text-underline-offset", value: "2px", gates: ["underline"] },
    { property: "text-decoration-style", value: "double", gates: ["strikethrough"] },
    { property: "text-decoration-color", value: "#ff0000", gates: ["underlineColor"] },
    { property: "text-transform", value: "uppercase", gates: ["capitalization"] },
    { property: "font-variant-caps", value: "small-caps", gates: ["smallCaps"] },
    { property: "vertical-align", value: "super", gates: ["baselineShift"] },
    { property: "vertical-align", value: "2px", gates: ["baselineOffset"] },
    { property: "color", value: "#000000", gates: ["textColor"] },
    { property: "background-color", value: "#ffff00", gates: ["highlight"] },
    { property: "-webkit-text-stroke", value: "1px #000000", gates: ["outlineWidth", "outlineColor"] },
    { property: "text-shadow", value: "0 0 2px #000000", gates: ["shadow", "glow"] },
    { property: "letter-spacing", value: "0.5px", gates: ["letterSpacing"] },
    { property: "word-spacing", value: "2px", gates: ["wordSpacing"] },
    { property: "line-height", value: "1.5", gates: ["lineHeight"] },
    { property: "direction", value: "rtl", gates: ["textDirection"] },
    { property: "text-align", value: "justify", gates: ["textAlign"] },
];

const SUPPORTED: TypographyCapability = { supported: true, reason: "" };

function refusalReason(probe: CapabilityProbe): string {
    return `This build's rendering engine does not support \`${probe.property}: ${probe.value}\`, so the value stays saved but cannot be applied.`;
}

/**
 * Asks the engine what it can draw, one editor property at a time.
 *
 * **`null` means assume everything works.** A missing `CSS.supports` — a Node test, a jsdom,
 * an engine old enough not to have the API — is an absence of evidence, not evidence of
 * absence, and reporting a property as unsupported on that basis would hide a control that
 * works perfectly well. The caller passed the `null`, so the caller knows to show
 * {@link ASSUMED_SUPPORT_LABEL_KEY} beside the results.
 *
 * A `supports` implementation that *throws* is treated the same way, for the same reason.
 */
export function detectTypographyCapabilities(support: CssSupport | null): TypographyCapabilities {
    const capabilities = {} as Record<TypographyPropertyId, TypographyCapability>;
    // Safe because PROPERTY_ORDER is `satisfies Record<TypographyPropertyId, number>`, so
    // TYPOGRAPHY_PROPERTIES names every key of the spec and this loop fills every entry.
    for (const id of TYPOGRAPHY_PROPERTIES) capabilities[id] = SUPPORTED;

    if (support === null) return capabilities;

    for (const probe of CAPABILITY_PROBES) {
        let accepted: boolean;
        try {
            accepted = support.supports(probe.property, probe.value);
        } catch {
            accepted = true;
        }
        if (accepted) continue;
        const capability: TypographyCapability = { supported: false, reason: refusalReason(probe) };
        for (const id of probe.gates) capabilities[id] = capability;
    }

    return capabilities;
}

/* ------------------------------------------------------------------------------------- *
 * Style generation
 * ------------------------------------------------------------------------------------- */

/** What a note is about. Each code has exactly one cause, spelled out in {@link typographyCss}. */
export type TypographyNoteCode =
    | "decoration-style-conflict"
    | "decoration-color-shared"
    | "baseline-offset-ignored";

/**
 * A value that survived capability detection but still could not be drawn faithfully,
 * because CSS has fewer knobs than the editor does.
 *
 * Distinct from {@link TypographyCssResult.unsupported}: an unsupported property was refused
 * by the engine and emits nothing, whereas a noted property *is* drawn — just not the way the
 * control says. Both end up beside the still-visible control; only the wording differs.
 */
export interface TypographyNote {
    readonly property: TypographyPropertyId;
    readonly code: TypographyNoteCode;
    /** One plain sentence, in English, for the editor to show. */
    readonly message: string;
}

export interface TypographyCssResult {
    /** Kebab-case CSS property names to values, ready for a Vue `:style` binding. */
    readonly style: Record<string, string>;
    /** Properties the engine refused, in editor order. Their values remain in the spec. */
    readonly unsupported: TypographyPropertyId[];
    /** Values that are drawn, but not exactly as asked. */
    readonly notes: TypographyNote[];
}

/** How much smaller a raised or lowered run is drawn. Matches the usual browser default. */
export const BASELINE_SHIFT_FONT_SCALE = 0.75;

/** The weight a synthetic bold guarantees; a heavier numeric weight is left alone. */
export const BOLD_MINIMUM_WEIGHT = 700;

function px(value: number): string {
    return `${value}px`;
}

/** Rounds to two decimals so `14 * 0.75` reads as `10.5px`, not `10.500000000000002px`. */
function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/** The style a decoration line would be drawn in if it were the only line on the text. */
interface DecorationLine {
    readonly property: TypographyPropertyId;
    readonly wanted: string;
}

/**
 * Turns a resolved spec into a `:style` object, leaving out whatever the engine refused.
 *
 * `fontStack` is the finished CSS `font-family` value; `fontCatalog.fontFamilyStack` builds
 * it, because that is the module that knows which families exist and what has to be quoted.
 *
 * ### The decisions worth knowing about
 *
 * **Bold and weight combine by taking the larger.** `bold` raises the effective weight to at
 * least {@link BOLD_MINIMUM_WEIGHT}; a numeric weight above that is preserved. See
 * {@link TypographySpec.bold}.
 *
 * **Decoration style: the underline wins.** CSS draws underline, strikethrough and overline
 * with one `text-decoration-style` between them. When more than one line is present and they
 * do not all want the same style, the underline's style is used — it is the line the style
 * control visibly belongs to — and every other line that wanted something different gets a
 * `decoration-style-conflict` note naming it. So a wavy underline beside a double
 * strikethrough draws both lines wavy and returns a note on `strikethrough`; nothing is
 * dropped, and nothing is applied behind the user's back. With no underline present the
 * strikethrough's own style is used instead, since it is then the only line with an opinion.
 *
 * **Decoration colour is shared the same way**, for the same reason: `text-decoration-color`
 * colours every line at once, so setting it with more than one line present returns a
 * `decoration-color-shared` note on `underlineColor`.
 *
 * **Baseline shift beats a manual offset.** A superscript or subscript emits
 * `vertical-align: super`/`sub` *and* a font size scaled by
 * {@link BASELINE_SHIFT_FONT_SCALE}, because a raised run that is still full size looks
 * broken. With no shift, a non-zero `baselineOffset` emits `vertical-align` in px instead.
 * They cannot both apply — there is one `vertical-align` — so an offset set alongside a shift
 * returns a `baseline-offset-ignored` note and keeps its value in the spec.
 *
 * **Shadow and glow compose.** Both emit into `text-shadow`, shadow first, comma-separated,
 * so switching one on never turns the other off.
 */
export function typographyCss(
    spec: TypographySpec,
    capabilities: TypographyCapabilities,
    fontStack: string,
): TypographyCssResult {
    const style: Record<string, string> = {};
    const notes: TypographyNote[] = [];
    const can = (id: TypographyPropertyId): boolean => capabilities[id].supported;

    // --- face ---------------------------------------------------------------------------
    if (can("fontFamily")) style["font-family"] = fontStack;

    if (can("fontSize") && can("fontSizeUnit")) {
        const scaled = spec.baselineShift === "none" ? spec.fontSize : spec.fontSize * BASELINE_SHIFT_FONT_SCALE;
        style["font-size"] = `${round2(scaled)}${spec.fontSizeUnit}`;
    }

    if (can("fontWeight")) {
        const bold = spec.bold && can("bold");
        style["font-weight"] = String(bold ? Math.max(spec.fontWeight, BOLD_MINIMUM_WEIGHT) : spec.fontWeight);
    }

    if (can("italic") && spec.italic !== "none") {
        style["font-style"] = spec.italic === "oblique" ? `oblique ${spec.obliqueAngle}deg` : "italic";
    }

    if (can("variableAxes")) {
        // Sorted by tag so the same axes always produce the same declaration; an unsorted
        // object key order would make this string depend on how the record was assembled.
        const axes = Object.entries(spec.variableAxes)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([tag, value]) => `"${tag}" ${value}`);
        if (axes.length > 0) style["font-variation-settings"] = axes.join(", ");
    }

    // --- decoration ---------------------------------------------------------------------
    const lineNames: string[] = [];
    const wanted: DecorationLine[] = [];

    if (spec.underline !== "none" && can("underline")) {
        lineNames.push("underline");
        wanted.push({ property: "underline", wanted: spec.underline });
    }
    if (spec.strikethrough !== "none" && can("strikethrough")) {
        lineNames.push("line-through");
        wanted.push({
            property: "strikethrough",
            wanted: spec.strikethrough === "double" ? "double" : "solid",
        });
    }
    if (spec.overline && can("overline")) {
        lineNames.push("overline");
        wanted.push({ property: "overline", wanted: "solid" });
    }

    if (lineNames.length > 0) {
        style["text-decoration-line"] = lineNames.join(" ");
        // `wanted[0]` is the underline when there is one, because it was pushed first.
        const effective = wanted[0]?.wanted ?? "solid";
        style["text-decoration-style"] = effective;

        for (const line of wanted) {
            if (line.wanted === effective) continue;
            notes.push({
                property: line.property,
                code: "decoration-style-conflict",
                message: `CSS draws every decoration line in one style, so this line is drawn ${effective} rather than ${line.wanted}; the setting is kept.`,
            });
        }

        if (spec.underlineColor !== "" && can("underlineColor")) {
            style["text-decoration-color"] = spec.underlineColor;
            if (lineNames.length > 1) {
                notes.push({
                    property: "underlineColor",
                    code: "decoration-color-shared",
                    message: "CSS colours every decoration line at once, so this colour is also used for the other lines on this text.",
                });
            }
        }
    }

    // --- case ---------------------------------------------------------------------------
    if (spec.capitalization !== "none" && can("capitalization")) {
        style["text-transform"] = spec.capitalization;
    }
    if (spec.smallCaps && can("smallCaps")) style["font-variant-caps"] = "small-caps";

    // --- vertical position --------------------------------------------------------------
    if (spec.baselineShift !== "none") {
        if (can("baselineShift")) {
            style["vertical-align"] = spec.baselineShift === "superscript" ? "super" : "sub";
        }
        if (spec.baselineOffset !== 0) {
            notes.push({
                property: "baselineOffset",
                code: "baseline-offset-ignored",
                message: "CSS has one vertical-align, and the superscript or subscript is using it, so this manual offset is not applied; the setting is kept.",
            });
        }
    } else if (spec.baselineOffset !== 0 && can("baselineOffset")) {
        style["vertical-align"] = px(spec.baselineOffset);
    }

    // --- colour -------------------------------------------------------------------------
    if (spec.textColor !== "" && can("textColor")) style.color = spec.textColor;
    if (spec.highlight !== "" && can("highlight")) style["background-color"] = spec.highlight;

    // --- effects ------------------------------------------------------------------------
    if (spec.outlineWidth > 0 && can("outlineWidth") && can("outlineColor")) {
        style["-webkit-text-stroke"] = `${px(spec.outlineWidth)} ${spec.outlineColor === "" ? "currentColor" : spec.outlineColor}`;
    }

    const shadows: string[] = [];
    if (spec.shadow.color !== "" && can("shadow")) {
        shadows.push(`${px(spec.shadow.offsetX)} ${px(spec.shadow.offsetY)} ${px(spec.shadow.blur)} ${spec.shadow.color}`);
    }
    if (spec.glow.color !== "" && spec.glow.radius > 0 && can("glow")) {
        shadows.push(`0 0 ${px(spec.glow.radius)} ${spec.glow.color}`);
    }
    if (shadows.length > 0) style["text-shadow"] = shadows.join(", ");

    // --- spacing and paragraph ----------------------------------------------------------
    if (spec.letterSpacing !== 0 && can("letterSpacing")) style["letter-spacing"] = px(spec.letterSpacing);
    if (spec.wordSpacing !== 0 && can("wordSpacing")) style["word-spacing"] = px(spec.wordSpacing);
    if (spec.lineHeight > 0 && can("lineHeight")) style["line-height"] = String(spec.lineHeight);
    if (can("textDirection")) style.direction = spec.textDirection;
    if (can("textAlign")) style["text-align"] = spec.textAlign;

    return {
        style,
        // Editor order, so the caller's list is stable and reads top to bottom the way the
        // controls do. Everything the engine refused is listed, whether or not this
        // particular spec would have emitted it — the control is annotated either way.
        unsupported: TYPOGRAPHY_PROPERTIES.filter((id) => !capabilities[id].supported),
        notes,
    };
}

/* ------------------------------------------------------------------------------------- *
 * Labels and search
 * ------------------------------------------------------------------------------------- */

/**
 * The i18n key for a property's label. Keys only — no translation happens in this module,
 * so it stays importable from a test and from anything that has no i18n instance yet.
 */
export function typographyPropertyLabelKey(id: TypographyPropertyId): string {
    return `appearance.type.${id}`;
}

/**
 * What somebody might type to find each control.
 *
 * These are the *other* words for each setting, not the label: a user looking for letter
 * spacing may well type "tracking", and one looking for capitalization may type "all caps".
 * A settings search that only matches the label is a search that finds nothing whenever the
 * user's vocabulary differs from the designer's, which is most of the time.
 */
const SEARCH_TEXT: Record<TypographyPropertyId, string> = {
    fontFamily: "font family typeface face font name",
    fontSize: "font size text size point size",
    fontSizeUnit: "font size unit px pt rem points pixels",
    fontWeight: "font weight thin light regular medium semibold bold black numeric weight",
    bold: "bold strong heavy b synthetic bold",
    italic: "italic oblique slant slanted cursive",
    obliqueAngle: "oblique angle slant degrees skew",
    variableAxes: "variable font axes wght wdth slnt opsz variation settings",
    underline: "underline underlined single double dotted dashed wavy",
    underlineColor: "underline colour underline color decoration colour line colour",
    strikethrough: "strikethrough strike through struck out crossed out line through",
    overline: "overline line above overscore",
    capitalization: "capitalization capitalisation uppercase lowercase title case all caps text transform",
    smallCaps: "small caps small capitals",
    baselineShift: "superscript subscript baseline shift raised lowered",
    baselineOffset: "baseline offset raise lower vertical nudge vertical align",
    textColor: "text colour text color foreground colour font colour",
    highlight: "highlight background colour marker pen",
    outlineWidth: "outline width stroke width text stroke outlined",
    outlineColor: "outline colour stroke colour text stroke",
    shadow: "shadow drop shadow text shadow offset blur",
    glow: "glow halo bloom outer glow",
    letterSpacing: "letter spacing character spacing tracking kerning",
    wordSpacing: "word spacing space between words",
    lineHeight: "line height leading line spacing",
    textDirection: "text direction ltr rtl right to left bidirectional",
    textAlign: "text align alignment left right centre center justify start end",
};

/** The plain-English words the editor's search bar tests a query against. */
export function typographySearchText(id: TypographyPropertyId): string {
    return SEARCH_TEXT[id];
}
