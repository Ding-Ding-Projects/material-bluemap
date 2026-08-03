/**
 * What "the appearance of an element" means on this site.
 *
 * An appearance is typography plus a box plus a small set of state overrides. It
 * is stored against a style id, which is either a kind (`tab`, every tab) or a
 * single instance (`tab#docs`, one tab). Kind rules are emitted first and instance
 * rules after, so an instance override wins without needing `!important` and
 * without either rule having to know the other exists.
 */

import type { TypographyValues } from "./type/model.js";
import { TYPOGRAPHY_DEFAULTS } from "./type/model.js";

export type StateName = "hover" | "focus" | "selected" | "collapsed";

export const STATE_NAMES: readonly StateName[] = ["hover", "focus", "selected", "collapsed"];

export interface StateValues {
    background: string;
    borderColor: string;
    textColor: string;
}

export const STATE_DEFAULTS: StateValues = { background: "", borderColor: "", textColor: "" };

export interface BoxValues {
    background: string;
    borderColor: string;
    /** -1 means "inherit". 0 is a real value, so it cannot be the sentinel. */
    borderWidth: number;
    radius: number;
    paddingBlock: number;
    paddingInline: number;
    gap: number;
    separatorColor: string;
    /** -1 inherits. 0 to 5 are the Material elevation levels. */
    elevation: number;
    /** Shown before the label. Decoration only: it never replaces the accessible name. */
    icon: string;
    /** Shown after the label, same rule. */
    badge: string;
}

export const BOX_DEFAULTS: BoxValues = {
    background: "",
    borderColor: "",
    borderWidth: -1,
    radius: -1,
    paddingBlock: -1,
    paddingInline: -1,
    gap: -1,
    separatorColor: "",
    elevation: -1,
    icon: "",
    badge: "",
};

/** -1 is the numeric inherit sentinel for box values, matching the comment above. */
export const INHERIT_BOX_NUMBER = -1;

export interface ElementAppearance {
    typography: TypographyValues;
    box: BoxValues;
    states: Record<StateName, StateValues>;
    /**
     * Values from an imported theme that this build has no property for.
     *
     * They are carried through export unchanged and reported in the editor, so a
     * theme written by a newer build survives a round trip instead of being
     * quietly trimmed to what this build happens to know about.
     */
    unknown: Record<string, unknown>;
}

export function defaultAppearance(): ElementAppearance {
    return {
        typography: { ...TYPOGRAPHY_DEFAULTS },
        box: { ...BOX_DEFAULTS },
        states: {
            hover: { ...STATE_DEFAULTS },
            focus: { ...STATE_DEFAULTS },
            selected: { ...STATE_DEFAULTS },
            collapsed: { ...STATE_DEFAULTS },
        },
        unknown: {},
    };
}

export function cloneAppearance(appearance: ElementAppearance): ElementAppearance {
    return {
        typography: { ...appearance.typography },
        box: { ...appearance.box },
        states: {
            hover: { ...appearance.states.hover },
            focus: { ...appearance.states.focus },
            selected: { ...appearance.states.selected },
            collapsed: { ...appearance.states.collapsed },
        },
        unknown: { ...appearance.unknown },
    };
}

/** True when nothing has been set, so the entry can be dropped from storage entirely. */
export function isAppearanceEmpty(appearance: ElementAppearance): boolean {
    for (const [key, value] of Object.entries(appearance.typography)) {
        if (value !== TYPOGRAPHY_DEFAULTS[key as keyof TypographyValues]) return false;
    }
    for (const [key, value] of Object.entries(appearance.box)) {
        if (value !== BOX_DEFAULTS[key as keyof BoxValues]) return false;
    }
    for (const state of STATE_NAMES) {
        const values = appearance.states[state];
        if (values.background !== "" || values.borderColor !== "" || values.textColor !== "") {
            return false;
        }
    }
    return Object.keys(appearance.unknown).length === 0;
}

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

export interface BoxProperty {
    readonly key: keyof BoxValues;
    readonly labelKey: string;
    readonly kind: "color" | "number" | "text" | "select";
    readonly min?: number | undefined;
    readonly max?: number | undefined;
    readonly step?: number | undefined;
    readonly unit?: string | undefined;
    readonly maxLength?: number | undefined;
}

export const BOX_PROPERTIES: readonly BoxProperty[] = [
    { key: "background", labelKey: "box.background", kind: "color" },
    { key: "borderColor", labelKey: "box.borderColor", kind: "color" },
    { key: "borderWidth", labelKey: "box.borderWidth", kind: "number", min: -1, max: 8, step: 0.5, unit: "px" },
    { key: "radius", labelKey: "box.radius", kind: "number", min: -1, max: 48, step: 1, unit: "px" },
    { key: "paddingBlock", labelKey: "box.paddingBlock", kind: "number", min: -1, max: 48, step: 1, unit: "px" },
    { key: "paddingInline", labelKey: "box.paddingInline", kind: "number", min: -1, max: 64, step: 1, unit: "px" },
    { key: "gap", labelKey: "box.gap", kind: "number", min: -1, max: 48, step: 1, unit: "px" },
    { key: "separatorColor", labelKey: "box.separator", kind: "color" },
    { key: "elevation", labelKey: "box.elevation", kind: "number", min: -1, max: 5, step: 1, unit: "" },
    { key: "icon", labelKey: "box.icon", kind: "text", maxLength: 8 },
    { key: "badge", labelKey: "box.badge", kind: "text", maxLength: 16 },
];

export interface AppearanceTargetDefinition {
    /** Kind id. Also the storage key for the "every element of this kind" rule. */
    readonly id: string;
    readonly labelKey: string;
    readonly descriptionKey?: string | undefined;
    /** Sample text shown in the editor's live preview. */
    readonly sampleKey: string;
    /** Which state overrides make sense here. An unused state is not offered. */
    readonly states: readonly StateName[];
}

/**
 * The elements this site can theme.
 *
 * The appearance editor itself is in the list on purpose. A theming feature that
 * cannot theme its own dialog is incomplete, and the fastest way to prove it can
 * is to make its own chrome one of the targets.
 */
export const APPEARANCE_TARGETS: readonly AppearanceTargetDefinition[] = [
    {
        id: "tab",
        labelKey: "target.tab",
        descriptionKey: "target.tab.desc",
        sampleKey: "target.tab.sample",
        states: ["hover", "focus", "selected"],
    },
    {
        id: "tab-group",
        labelKey: "target.tabGroup",
        descriptionKey: "target.tabGroup.desc",
        sampleKey: "target.tabGroup.sample",
        states: ["hover", "focus", "selected", "collapsed"],
    },
    {
        id: "tab-strip",
        labelKey: "target.tabStrip",
        descriptionKey: "target.tabStrip.desc",
        sampleKey: "target.tabStrip.sample",
        states: ["hover", "focus"],
    },
    {
        id: "toolbar",
        labelKey: "target.toolbar",
        descriptionKey: "target.toolbar.desc",
        sampleKey: "target.toolbar.sample",
        states: ["hover", "focus"],
    },
    {
        id: "card",
        labelKey: "target.card",
        descriptionKey: "target.card.desc",
        sampleKey: "target.card.sample",
        states: ["hover", "focus"],
    },
    {
        id: "settings-surface",
        labelKey: "target.settings",
        descriptionKey: "target.settings.desc",
        sampleKey: "target.settings.sample",
        states: ["hover", "focus"],
    },
    {
        id: "appearance-editor",
        labelKey: "target.editor",
        descriptionKey: "target.editor.desc",
        sampleKey: "target.editor.sample",
        states: ["hover", "focus"],
    },
    {
        id: "color-picker",
        labelKey: "target.picker",
        descriptionKey: "target.picker.desc",
        sampleKey: "target.picker.sample",
        states: ["hover", "focus"],
    },
    {
        id: "context-menu",
        labelKey: "target.menu",
        descriptionKey: "target.menu.desc",
        sampleKey: "target.menu.sample",
        states: ["hover", "focus", "selected"],
    },
];

/** `kind` for a rule that covers every element of a kind, `kind#instance` for one. */
export function styleId(kind: string, instance?: string): string {
    return instance === undefined || instance === "" ? kind : `${kind}#${instance}`;
}

export function splitStyleId(id: string): { kind: string; instance: string | null } {
    const hash = id.indexOf("#");
    if (hash < 0) return { kind: id, instance: null };
    return { kind: id.slice(0, hash), instance: id.slice(hash + 1) };
}

export function findTarget(kind: string): AppearanceTargetDefinition | undefined {
    return APPEARANCE_TARGETS.find((target) => target.id === kind);
}
