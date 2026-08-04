/**
 * What one element's appearance actually is, and how it turns into CSS.
 *
 * An appearance record is deliberately a record of *opinions*, not of values. A key that is
 * absent means "I have no view on this, follow whatever is above me"; a key that is present
 * means "this one, regardless". Keeping those two distinguishable is what makes per-property
 * reset work at all: resetting the weight of a tab has to remove the opinion, so the tab goes
 * back to following the theme, rather than write today's theme weight into the tab and pin it
 * there until somebody notices, six months later, that restyling the app changed everything
 * except that one tab.
 *
 * ## Colours are stored as the user wrote them
 *
 * Every colour here is a string, and it is the string the user authored: `oklch(0.7 0.1 250)`
 * stays `oklch(0.7 0.1 250)` in the record even though what is painted is an `rgb()` the
 * browser is certain to understand. Storing the resolved value instead would quietly destroy
 * information — the gamut the user chose in, the precision they typed, the notation they
 * think in — and the record is the thing that gets exported, shared and imported into a
 * build with a different engine.
 *
 * The corollary is that a colour can fail to parse, and this module never answers a failed
 * colour with black. It leaves the declaration off, keeps the authored text exactly as it
 * was, and reports it in {@link AppearanceStyle.unreadableColors} so the editor can say which
 * value it could not use and offer it back for correction. That is the contract's "never
 * silently drop a value it cannot represent" clause, applied to the one place in this feature
 * where dropping is genuinely tempting.
 */

import { colorParseErrorKey, parseColor, type ColorParseError } from "./colorParse.js";
import { cssColor } from "./colorFormat.js";
import { fontFamilyStack, type FontFamily } from "./fontCatalog.js";
import {
    DEFAULT_TYPOGRAPHY,
    mergeTypography,
    resetTypographyProperty,
    typographyCss,
    type TypographyCapabilities,
    type TypographyNote,
    type TypographyPropertyId,
    type TypographySpec,
} from "./typographySpec.js";

/* -------------------------------------------------------------------------- */
/* The surface an element paints                                              */
/* -------------------------------------------------------------------------- */

export type BorderStyle = "none" | "solid" | "dashed" | "dotted" | "double";

/**
 * Everything about an element that is not its text.
 *
 * Kept separate from typography rather than folded in, because the two are edited in
 * different tabs of the editor, reset independently, and — for a group header or a tab strip
 * — inherited from different places. A single flat bag would make "reset this element's
 * colours but keep its font" impossible to express.
 */
export interface SurfaceSpec {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderStyle: BorderStyle;
    borderRadius: number;
    paddingInline: number;
    paddingBlock: number;
    /** Material's elevation steps, 0 to 5, rendered as the tonal shadow for that level. */
    elevation: number;
    opacity: number;
}

export type SurfacePropertyId = keyof SurfaceSpec;

/** Editor order, which is also the order the search bar lists them in. */
export const SURFACE_PROPERTIES: readonly SurfacePropertyId[] = [
    "backgroundColor",
    "borderColor",
    "borderWidth",
    "borderStyle",
    "borderRadius",
    "paddingInline",
    "paddingBlock",
    "elevation",
    "opacity",
];

/**
 * An element that has been given no surface opinions at all.
 *
 * Every colour is the empty string, meaning "inherit", rather than a concrete value. An
 * element whose default background were a real colour would paint over whatever it sits on
 * the moment it acquired any override at all, which is exactly the behaviour that makes a
 * theming system feel like it is fighting the layout.
 */
export const DEFAULT_SURFACE: SurfaceSpec = {
    backgroundColor: "",
    borderColor: "",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
    paddingInline: 0,
    paddingBlock: 0,
    elevation: 0,
    opacity: 1,
};

function mergeSurface(base: SurfaceSpec, ...layers: Partial<SurfaceSpec>[]): SurfaceSpec {
    return layers.reduce<SurfaceSpec>(
        (current, layer) => ({
            backgroundColor: layer.backgroundColor ?? current.backgroundColor,
            borderColor: layer.borderColor ?? current.borderColor,
            borderWidth: layer.borderWidth ?? current.borderWidth,
            borderStyle: layer.borderStyle ?? current.borderStyle,
            borderRadius: layer.borderRadius ?? current.borderRadius,
            paddingInline: layer.paddingInline ?? current.paddingInline,
            paddingBlock: layer.paddingBlock ?? current.paddingBlock,
            elevation: layer.elevation ?? current.elevation,
            opacity: layer.opacity ?? current.opacity,
        }),
        { ...base },
    );
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One element's overrides.
 *
 * `preserved` is the interesting field. A theme file exported by a later build can carry
 * sections this build has never heard of, and the tempting thing to do with them is nothing —
 * which quietly deletes them on the next save, so a user who round-trips their theme through
 * an older version loses whatever the newer one added. They are kept verbatim instead, and
 * written back out on export. This build cannot render them and does not pretend to; it
 * simply refuses to be the reason they disappear.
 */
export interface AppearanceRecord {
    typography: Partial<TypographySpec>;
    surface: Partial<SurfaceSpec>;
    /** The id of a preset this element follows, or the empty string for none. */
    inherit: string;
    /** Keys from a future version of the format, kept so exporting does not lose them. */
    preserved: Record<string, unknown>;
}

export function emptyRecord(): AppearanceRecord {
    return { typography: {}, surface: {}, inherit: "", preserved: {} };
}

/** True when the record expresses no opinion at all, so the editor can offer no reset. */
export function isRecordEmpty(record: AppearanceRecord): boolean {
    return (
        Object.keys(record.typography).length === 0 &&
        Object.keys(record.surface).length === 0 &&
        record.inherit === "" &&
        Object.keys(record.preserved).length === 0
    );
}

/**
 * Folds a chain of records into one, later entries winning.
 *
 * The chain is built by the caller and is normally global, then preset, then element, which
 * is the order the contract's inheritance clause describes. `preserved` is merged too, so a
 * key a preset carried from a future build is not lost because an element also had one.
 */
export function mergeRecords(...records: readonly AppearanceRecord[]): AppearanceRecord {
    return records.reduce<AppearanceRecord>(
        (current, next) => ({
            typography: { ...current.typography, ...next.typography },
            surface: { ...current.surface, ...next.surface },
            inherit: next.inherit === "" ? current.inherit : next.inherit,
            preserved: { ...current.preserved, ...next.preserved },
        }),
        emptyRecord(),
    );
}

/** The fully-resolved appearance a chain of records describes. */
export interface ResolvedAppearance {
    typography: TypographySpec;
    surface: SurfaceSpec;
}

export function resolveRecords(...records: readonly AppearanceRecord[]): ResolvedAppearance {
    const merged = mergeRecords(...records);
    return {
        typography: mergeTypography(DEFAULT_TYPOGRAPHY, merged.typography),
        surface: mergeSurface(DEFAULT_SURFACE, merged.surface),
    };
}

/** Removes one typography opinion, returning a new record and leaving the old one alone. */
export function resetTypography(
    record: AppearanceRecord,
    id: TypographyPropertyId,
): AppearanceRecord {
    return { ...record, typography: resetTypographyProperty(record.typography, id) };
}

/** Removes one surface opinion, returning a new record. */
export function resetSurface(record: AppearanceRecord, id: SurfacePropertyId): AppearanceRecord {
    const surface: Partial<SurfaceSpec> = { ...record.surface };
    delete surface[id];
    return { ...record, surface };
}

/* -------------------------------------------------------------------------- */
/* Colours, resolved but never replaced                                       */
/* -------------------------------------------------------------------------- */

/** A colour string that could not be read, kept beside the reason it could not. */
export interface UnreadableColor {
    /** The record field it came from, e.g. `textColor` or `backgroundColor`. */
    property: string;
    /** Exactly what the user typed. Never normalised, never discarded. */
    authored: string;
    error: ColorParseError;
    /** The i18n key naming that failure, so the editor renders it without a switch. */
    messageKey: string;
}

/**
 * An authored colour turned into something a browser will certainly paint.
 *
 * The empty string means "inherit" and is not a failure — most colour fields are empty most
 * of the time, and treating that as an error would fill the editor with warnings about
 * settings nobody has touched.
 */
function resolveColor(
    property: string,
    authored: string,
    into: UnreadableColor[],
): string {
    if (authored.trim() === "") return "";

    const parsed = parseColor(authored);
    if (!parsed.ok) {
        into.push({
            property,
            authored,
            error: parsed.error,
            messageKey: colorParseErrorKey(parsed.error),
        });
        return "";
    }
    return cssColor(parsed.value.color);
}

/* -------------------------------------------------------------------------- */
/* CSS                                                                        */
/* -------------------------------------------------------------------------- */

/** Material Design 3's elevation shadows, indexed by level. Level 0 draws nothing. */
const ELEVATION_SHADOWS: readonly string[] = [
    "",
    "0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15)",
    "0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15)",
    "0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)",
    "0 6px 10px 4px rgba(0, 0, 0, 0.15), 0 2px 3px rgba(0, 0, 0, 0.3)",
    "0 8px 12px 6px rgba(0, 0, 0, 0.15), 0 4px 4px rgba(0, 0, 0, 0.3)",
];

/** Everything the editor needs to both render an element and explain what it could not. */
export interface AppearanceStyle {
    /** A plain object for a Vue `:style` binding. */
    style: Record<string, string>;
    /** Typography properties this engine refused. The values stay in the record. */
    unsupported: TypographyPropertyId[];
    /** Honest notes about declarations CSS can only express once. */
    notes: TypographyNote[];
    /** Colours that could not be read. Kept in the record, not applied, and reported. */
    unreadableColors: UnreadableColor[];
}

function surfaceCss(surface: SurfaceSpec, unreadable: UnreadableColor[]): Record<string, string> {
    const style: Record<string, string> = {};

    const background = resolveColor("backgroundColor", surface.backgroundColor, unreadable);
    if (background !== "") style["background-color"] = background;

    if (surface.borderStyle !== "none" && surface.borderWidth > 0) {
        const border = resolveColor("borderColor", surface.borderColor, unreadable);
        style["border-style"] = surface.borderStyle;
        style["border-width"] = `${surface.borderWidth}px`;
        if (border !== "") style["border-color"] = border;
    } else if (surface.borderColor.trim() !== "") {
        // A colour with no width and no style paints nothing, and a user who set one and
        // saw no change would reasonably conclude the editor is broken. It is still read,
        // so a malformed value is still reported rather than ignored twice over.
        resolveColor("borderColor", surface.borderColor, unreadable);
    }

    if (surface.borderRadius > 0) style["border-radius"] = `${surface.borderRadius}px`;
    if (surface.paddingInline > 0) style["padding-inline"] = `${surface.paddingInline}px`;
    if (surface.paddingBlock > 0) style["padding-block"] = `${surface.paddingBlock}px`;

    const elevation = Math.round(Math.min(5, Math.max(0, surface.elevation)));
    const shadow = ELEVATION_SHADOWS[elevation] ?? "";
    if (shadow !== "") style["box-shadow"] = shadow;

    if (surface.opacity < 1) style.opacity = String(Math.max(0, surface.opacity));

    return style;
}

/**
 * The complete style for a resolved appearance, with everything it could not do reported.
 *
 * Colours are resolved into `rgb()` before typography sees them. That is not a preference for
 * one notation: a saved `oklch()` renders as nothing at all on an engine that has not shipped
 * it, and an appearance record whose meaning depends on the browser version is not a record.
 * The authored text is untouched in the record either way, so the day the engine catches up,
 * nothing needs migrating.
 */
export function appearanceStyle(
    resolved: ResolvedAppearance,
    capabilities: TypographyCapabilities,
    catalog?: readonly FontFamily[],
): AppearanceStyle {
    const unreadableColors: UnreadableColor[] = [];

    const typography: TypographySpec = {
        ...resolved.typography,
        textColor: resolveColor("textColor", resolved.typography.textColor, unreadableColors),
        highlight: resolveColor("highlight", resolved.typography.highlight, unreadableColors),
        underlineColor: resolveColor(
            "underlineColor",
            resolved.typography.underlineColor,
            unreadableColors,
        ),
        outlineColor: resolveColor(
            "outlineColor",
            resolved.typography.outlineColor,
            unreadableColors,
        ),
        shadow: {
            ...resolved.typography.shadow,
            color: resolveColor(
                "shadow.color",
                resolved.typography.shadow.color,
                unreadableColors,
            ),
        },
        glow: {
            ...resolved.typography.glow,
            color: resolveColor("glow.color", resolved.typography.glow.color, unreadableColors),
        },
    };

    const stack = fontFamilyStack(typography.fontFamily, catalog);
    const text = typographyCss(typography, capabilities, stack);

    return {
        style: { ...text.style, ...surfaceCss(resolved.surface, unreadableColors) },
        unsupported: [...text.unsupported],
        notes: [...text.notes],
        unreadableColors,
    };
}
