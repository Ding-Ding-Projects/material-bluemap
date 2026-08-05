/**
 * Turning stored appearance into CSS that the page actually wears.
 *
 * Everything is written into one managed stylesheet and one set of custom
 * properties on the root element. Nothing is applied as an inline style, so a
 * hover or focus state can be themed, an element can be restyled without touching
 * the node, and clearing an override is deleting a rule rather than hunting down
 * whatever wrote it.
 */

import type { AppearanceStore } from "./store.js";
import type { BoxValues, ElementAppearance, StateName } from "./model.js";
import { INHERIT_BOX_NUMBER, splitStyleId } from "./model.js";
import type { FontFamilyEntry } from "./type/fonts.js";
import { stackFor } from "./type/fonts.js";
import { typographyToCss } from "./type/model.js";
import { parseColor } from "./color/representations.js";
import { inSpace, srgb, toRenderableCss } from "./color/value.js";
import { clipToSrgb, isInSrgbGamut, toSrgb } from "./color/spaces.js";
import type { ColorValue } from "./color/value.js";

const STYLE_ELEMENT_ID = "mb-appearance-styles";

/** Resolve a stored colour string into something a browser will paint, or null. */
export function resolveColor(stored: string): string | null {
    if (stored === "") return null;
    const parsed = parseColor(stored);
    if (parsed.value === null) return null;
    return toRenderableCss(parsed.value);
}

/**
 * The CSS attribute selectors a rule attaches to.
 *
 * Kind rules come first and instance rules after, so the later rule wins on equal
 * specificity. That ordering is the whole inheritance model: no `!important`
 * anywhere, and an instance override is removable by deleting one rule.
 */
function selectorFor(id: string): string {
    const { kind, instance } = splitStyleId(id);
    if (instance === null) return `[data-mb-kind="${cssEscape(kind)}"]`;
    return `[data-mb-style="${cssEscape(`${kind}#${instance}`)}"]`;
}

const STATE_SELECTORS: Readonly<Record<StateName, string>> = {
    hover: ":hover",
    focus: ":focus-visible",
    selected: '[aria-selected="true"], &[aria-current="page"], &[data-selected="true"]',
    collapsed: '[aria-expanded="false"]',
};

function cssEscape(value: string): string {
    return value.replace(/["\\]/g, "\\$&");
}

function declarations(entries: Record<string, string>): string {
    return Object.entries(entries)
        .map(([property, value]) => `    ${property}: ${value};`)
        .join("\n");
}

function boxToCss(box: BoxValues): Record<string, string> {
    const css: Record<string, string> = {};
    const background = resolveColor(box.background);
    if (background !== null) css["background"] = background;
    const border = resolveColor(box.borderColor);
    if (border !== null) css["border-color"] = border;
    if (box.borderWidth !== INHERIT_BOX_NUMBER) {
        css["border-width"] = `${box.borderWidth}px`;
        css["border-style"] = "solid";
    }
    if (box.radius !== INHERIT_BOX_NUMBER) css["border-radius"] = `${box.radius}px`;
    if (box.paddingBlock !== INHERIT_BOX_NUMBER) css["padding-block"] = `${box.paddingBlock}px`;
    if (box.paddingInline !== INHERIT_BOX_NUMBER) css["padding-inline"] = `${box.paddingInline}px`;
    if (box.gap !== INHERIT_BOX_NUMBER) css["gap"] = `${box.gap}px`;
    const separator = resolveColor(box.separatorColor);
    if (separator !== null) css["--mb-separator-color"] = separator;
    if (box.elevation !== INHERIT_BOX_NUMBER) {
        css["box-shadow"] = elevationShadow(box.elevation);
    }
    return css;
}

/** Material elevation levels 0 to 5, expressed as the two-layer shadow M3 uses. */
export function elevationShadow(level: number): string {
    const clamped = Math.min(5, Math.max(0, Math.round(level)));
    if (clamped === 0) return "none";
    const umbra = [0, 1, 2, 4, 6, 8][clamped] ?? 1;
    const penumbra = [0, 2, 4, 8, 10, 12][clamped] ?? 2;
    return `0 ${umbra}px ${penumbra}px rgb(0 0 0 / 0.20), 0 ${clamped}px ${clamped * 2}px rgb(0 0 0 / 0.12)`;
}

function ruleFor(id: string, appearance: ElementAppearance, fonts: readonly FontFamilyEntry[]): string {
    const selector = selectorFor(id);
    const chunks: string[] = [];

    const base = {
        ...boxToCss(appearance.box),
        ...typographyToCss(
            appearance.typography,
            (fontId) => (fontId === "" ? null : stackFor(fonts, fontId)),
            resolveColor
        ),
    };
    if (Object.keys(base).length > 0) {
        chunks.push(`${selector} {\n${declarations(base)}\n}`);
    }

    if (appearance.box.icon !== "") {
        chunks.push(
            `${selector} .mb-decor-icon { content: ""; }`,
            `${selector} { --mb-decor-icon: "${cssEscape(appearance.box.icon)}"; }`
        );
    }

    for (const [state, values] of Object.entries(appearance.states)) {
        const entries: Record<string, string> = {};
        const background = resolveColor(values.background);
        if (background !== null) entries["background"] = background;
        const border = resolveColor(values.borderColor);
        if (border !== null) entries["border-color"] = border;
        const text = resolveColor(values.textColor);
        if (text !== null) entries["color"] = text;
        if (Object.keys(entries).length === 0) continue;

        const suffix = STATE_SELECTORS[state as StateName];
        // The selected state carries several forms because different surfaces mark
        // selection differently. They are expanded here rather than relying on `&`
        // nesting, which older engines in the support range do not parse.
        const selectors = suffix
            .split(",")
            .map((part) => `${selector}${part.trim().replace(/^&/, "")}`)
            .join(", ");
        chunks.push(`${selectors} {\n${declarations(entries)}\n}`);
    }

    return chunks.join("\n");
}

function ensureStyleElement(): HTMLStyleElement {
    const existing = document.getElementById(STYLE_ELEMENT_ID);
    if (existing instanceof HTMLStyleElement) return existing;
    const element = document.createElement("style");
    element.id = STYLE_ELEMENT_ID;
    document.head.append(element);
    return element;
}

/** Rebuild the managed stylesheet from the store. Cheap enough to run on every change. */
export function applyAppearance(store: AppearanceStore, fonts: readonly FontFamilyEntry[]): void {
    const ids = store.customisedIds();
    // Kind rules before instance rules. Sorting by the presence of `#` is enough
    // because an instance id always contains one and a kind id never does.
    const ordered = [...ids].sort((a, b) => Number(a.includes("#")) - Number(b.includes("#")));
    const css = ordered
        .map((id) => ruleFor(id, store.get(id), fonts))
        .filter((chunk) => chunk !== "")
        .join("\n\n");
    ensureStyleElement().textContent = css;
}

/* ------------------------------------------------------------------ *
 * Accent palette
 * ------------------------------------------------------------------ */

/**
 * A tone from the seed colour.
 *
 * Material tones are CIELAB lightness, so the seed is taken to LCH, its lightness
 * replaced, and its chroma reduced until the result fits in sRGB. Clamping the
 * channels instead would shift the hue, which is exactly what a tonal palette is
 * supposed to prevent.
 */
export function toneOf(seed: ColorValue, tone: number): ColorValue {
    const lch = inSpace(seed, "lch").coords;
    let low = 0;
    let high = lch[1];
    const candidate = (chroma: number): ColorValue => ({
        space: "lch",
        coords: [tone, chroma, lch[2]],
        alpha: 1,
    });
    if (isInSrgbGamut(toSrgb("lch", [tone, high, lch[2]]))) return candidate(high);
    for (let step = 0; step < 24; step++) {
        const middle = (low + high) / 2;
        if (isInSrgbGamut(toSrgb("lch", [tone, middle, lch[2]]))) low = middle;
        else high = middle;
    }
    return candidate(low);
}

export interface AccentPalette {
    readonly primary: string;
    readonly onPrimary: string;
    readonly primaryContainer: string;
    readonly onPrimaryContainer: string;
    readonly accentFixed: string;
}

/** The four accent roles for a theme, derived from one seed. */
export function accentPalette(seedText: string, dark: boolean): AccentPalette | null {
    const parsed = parseColor(seedText);
    if (parsed.value === null) return null;
    const seed = parsed.value;
    const tones = dark ? [80, 20, 30, 90] : [40, 100, 90, 10];
    const [primaryTone, onPrimaryTone, containerTone, onContainerTone] = tones;
    return {
        primary: toRenderableCss(toneOf(seed, primaryTone ?? 40)),
        onPrimary: toRenderableCss(toneOf(seed, onPrimaryTone ?? 100)),
        primaryContainer: toRenderableCss(toneOf(seed, containerTone ?? 90)),
        onPrimaryContainer: toRenderableCss(toneOf(seed, onContainerTone ?? 10)),
        accentFixed: toRenderableCss(seed),
    };
}

/* ------------------------------------------------------------------ *
 * Root custom properties
 * ------------------------------------------------------------------ */

export interface RootAppearance {
    /**
     * What the page is showing after `system` has been resolved. The theme
     * controller owns `data-theme` itself; this is read, not written, so the two
     * cannot disagree about which palette is on screen.
     */
    readonly resolvedDark: boolean;
    readonly contrast: "standard" | "medium" | "high";
    readonly fontStack: string;
    readonly monoStack: string;
    readonly fontScale: number;
    readonly fontWeight: number;
    readonly cornerScale: number;
    readonly elevationEnabled: boolean;
    readonly borderWidth: number;
    readonly focusWidth: number;
    readonly focusColor: string;
    readonly underlineLinks: boolean;
    readonly minTarget: number;
    readonly textSpacing: boolean;
    readonly motionScale: number;
    readonly accentSeed: string;
}

/**
 * Write the site-wide values.
 *
 * The `--md-sys-*` names are the Material Design 3 token names the site's token
 * layer defines. Only the accent roles are overridden here, and only when a seed
 * parses, so an unreadable value leaves the token layer's own palette in place
 * rather than blanking the page.
 */
export function applyRootAppearance(root: HTMLElement, values: RootAppearance): void {
    const style = root.style;
    root.dataset["contrast"] = values.contrast;
    // The stylesheet only takes these values into account when this flag is present,
    // so a page that never mounts the settings surface keeps the token layer's own
    // typeface, shape and motion rather than silently inheriting this module's.
    root.dataset["mbAppearance"] = "on";
    root.dataset["mbElevation"] = values.elevationEnabled ? "on" : "off";

    style.setProperty("--mb-font-family", values.fontStack);
    style.setProperty("--mb-mono-family", values.monoStack);
    style.setProperty("--mb-font-scale", String(values.fontScale));
    style.setProperty("--mb-font-weight", String(values.fontWeight));
    style.setProperty("--mb-corner-scale", String(values.cornerScale));
    style.setProperty("--mb-border-width", `${values.borderWidth}px`);
    style.setProperty("--mb-focus-width", `${values.focusWidth}px`);
    style.setProperty("--mb-min-target", `${values.minTarget}px`);
    style.setProperty("--mb-motion-scale", String(values.motionScale));
    style.setProperty("--mb-link-decoration", values.underlineLinks ? "underline" : "none");
    style.setProperty("--mb-elevation-enabled", values.elevationEnabled ? "1" : "0");

    // WCAG 1.4.12 text spacing, applied as multipliers the stylesheet reads.
    style.setProperty("--mb-line-height", values.textSpacing ? "1.5" : "1.4");
    style.setProperty("--mb-letter-spacing", values.textSpacing ? "0.12em" : "0em");
    style.setProperty("--mb-word-spacing", values.textSpacing ? "0.16em" : "0em");
    style.setProperty("--mb-paragraph-spacing", values.textSpacing ? "2em" : "1em");

    const focus = resolveColor(values.focusColor);
    style.setProperty(
        // #7e4e00 is the last-resort fallback only: it matches the shipped Beacon Amber seed
        // (settings/schema.ts) so an unreadable focus colour still degrades to the site's own
        // brand rather than the retired purple placeholder.
        "--mb-focus-color",
        focus ?? "var(--md-sys-color-secondary, var(--md-sys-color-primary, #7e4e00))"
    );

    const palette = accentPalette(values.accentSeed, values.resolvedDark);
    if (palette === null) {
        style.removeProperty("--md-sys-color-primary");
        style.removeProperty("--md-sys-color-on-primary");
        style.removeProperty("--md-sys-color-primary-container");
        style.removeProperty("--md-sys-color-on-primary-container");
        style.removeProperty("--mb-accent");
        return;
    }
    style.setProperty("--md-sys-color-primary", palette.primary);
    style.setProperty("--md-sys-color-on-primary", palette.onPrimary);
    style.setProperty("--md-sys-color-primary-container", palette.primaryContainer);
    style.setProperty("--md-sys-color-on-primary-container", palette.onPrimaryContainer);
    style.setProperty("--mb-accent", palette.accentFixed);
}

/** A readable text colour for a background, used by swatch previews. */
export function readableTextOn(background: ColorValue): ColorValue {
    const rgb = clipToSrgb(toSrgb(background.space, background.coords));
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return luminance > 0.55 ? srgb(0, 0, 0, 1) : srgb(1, 1, 1, 1);
}
