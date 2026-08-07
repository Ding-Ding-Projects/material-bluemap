/**
 * Moving one setting between three shapes: what HOCON holds, what a control
 * binds to, and what a person reads.
 *
 * Nothing here decides *which* controls exist. That comes from
 * `@worldlens/config`, whose `FieldMeta.control` already names the right
 * one for every setting BlueMap has. This module is only the translation layer,
 * and it is kept separate from the components so it can be tested without a DOM.
 */

import type { Control, FieldMeta, PlainValue } from "@worldlens/config";

/** Java `Integer.MIN_VALUE`, which every mask uses to mean "no limit below". */
export const JAVA_INT_MIN = -2147483648;
/** Java `Integer.MAX_VALUE`, which every mask uses to mean "no limit above". */
export const JAVA_INT_MAX = 2147483647;
/** Java `Double.MAX_VALUE`, the default radius of a circle mask. */
export const JAVA_DOUBLE_MAX = 1.7976931348623157e308;

/**
 * True when a number is one of the sentinels BlueMap uses for "unbounded".
 *
 * A box mask with no minimum X really does hold -2147483648 in the file. Showing
 * that number in a spin box invites somebody to think it is a coordinate, so the
 * control says "no limit" beside it instead.
 */
export function isUnboundedSentinel(value: unknown): boolean {
    return value === JAVA_INT_MIN || value === JAVA_INT_MAX || value === JAVA_DOUBLE_MAX;
}

/**
 * True for a field whose documented default is `null`.
 *
 * Those are the fields where clearing the control means "remove the key" rather
 * than "write an empty string": `world`, `dimension`, `driver-jar` and friends.
 * A field whose default is `""` keeps an empty string as a real value.
 */
export function acceptsAbsence(field: FieldMeta): boolean {
    return field.default === null;
}

/** A value suitable for binding a control to, derived from a HOCON value. */
export function toControlValue(control: Control, value: PlainValue | undefined): PlainValue {
    switch (control.kind) {
        case "switch":
            return typeof value === "boolean" ? value : false;
        case "number":
        case "slider":
            return typeof value === "number" ? value : 0;
        case "text":
        case "path":
        case "color":
            return typeof value === "string" ? value : "";
        case "select":
            return typeof value === "string" || typeof value === "number" ? value : "";
        case "vector": {
            const record = isRecord(value) ? value : {};
            const out: Record<string, PlainValue> = {};
            for (const axis of control.axes) {
                const axisValue = record[axis.key];
                out[axis.key] = typeof axisValue === "number" ? axisValue : 0;
            }
            return out;
        }
        case "list":
        case "mask-list":
            return Array.isArray(value) ? value : [];
        case "key-value":
        case "marker-sets":
            return isRecord(value) ? value : {};
    }
}

function isRecord(value: unknown): value is Record<string, PlainValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a number out of whatever a text-mode numeric input produced.
 *
 * Vuetify hands back a string for `type="number"`, and an empty field is `""`
 * rather than a number. `null` means "the user cleared it", which the caller
 * turns into either the default or a removed key. A non-numeric string is
 * refused rather than silently coerced to 0, because 0 is a perfectly valid
 * coordinate and a silent 0 is a wrong render nobody can explain.
 */
export function parseNumberInput(raw: unknown, integer: boolean): number | null | "invalid" {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "number") return integer ? Math.trunc(raw) : raw;
    if (typeof raw !== "string") return "invalid";

    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "+") return null;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return "invalid";
    return integer ? Math.trunc(parsed) : parsed;
}

/** A default value for a freshly added list item or mask shape. */
export function blankValueFor(control: Control): PlainValue {
    switch (control.kind) {
        case "switch":
            return false;
        case "number":
        case "slider":
            return control.min ?? 0;
        case "text":
        case "path":
        case "select":
            return "";
        case "color":
            return "#000000";
        case "vector": {
            const out: Record<string, PlainValue> = {};
            for (const axis of control.axes) out[axis.key] = 0;
            return out;
        }
        case "list":
        case "mask-list":
            return [];
        case "key-value":
        case "marker-sets":
            return {};
    }
}

/**
 * A one-line rendering of a value, for the search index and for the summary a
 * collapsed group shows.
 *
 * Secrets never reach this. {@link searchTextForField} drops them, and the
 * key-value control masks them in the interface.
 */
export function valueToText(value: PlainValue | undefined): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") {
        if (value === JAVA_INT_MIN || value === JAVA_INT_MAX) return "no limit";
        if (value === JAVA_DOUBLE_MAX) return "unlimited";
        return String(value);
    }
    if (typeof value === "boolean") return value ? "on" : "off";
    if (Array.isArray(value)) {
        if (value.length === 0) return "empty";
        return value.map(valueToText).join(", ");
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return "empty";
    return entries.map(([key, child]) => `${key}=${valueToText(child)}`).join(", ");
}

/**
 * Everything about a field that a search should look at.
 *
 * The upstream documentation text is included on purpose: somebody who remembers
 * "the setting about the nether ceiling" and not `remove-caves-below-y` should
 * still find it. A field marked `secret` contributes its label and documentation
 * but never its value, so typing a password fragment cannot confirm a password.
 *
 * The parts are newline-separated rather than run together, so a pattern cannot
 * match across two of them by accident. That is also why every settings search
 * bar starts with the `m` flag on: without it `^lod-` would only ever be tested
 * against the label, and would silently find nothing.
 */
export function searchTextForField(field: FieldMeta, value: PlainValue | undefined): string {
    const parts = [field.label, field.path, field.key, field.javaField, field.doc];
    if (field.secret !== true) parts.push(valueToText(value));
    return parts.join("\n");
}

/** True when the effective value equals the default the Java class carries. */
export function isDefaultValue(field: FieldMeta, value: PlainValue | undefined): boolean {
    return JSON.stringify(value ?? null) === JSON.stringify(field.default ?? null);
}

/**
 * The number of decimals a step implies, so a slider's label does not read
 * `0.30000000000000004`.
 */
export function decimalsForStep(step: number): number {
    if (!Number.isFinite(step) || step <= 0) return 0;
    const text = String(step);
    const dot = text.indexOf(".");
    return dot === -1 ? 0 : text.length - dot - 1;
}

/** Rounds to the precision the control's own step implies. */
export function roundToStep(value: number, step: number): number {
    const decimals = decimalsForStep(step);
    if (decimals === 0) return Math.round(value / step) * step;
    return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * A colour normalised to the `#rrggbb` or `#rrggbbaa` form BlueMap writes, or
 * null when the text is not a colour yet.
 *
 * BlueMap's own parser takes 3, 4, 6 and 8 hex digits, so all four are accepted
 * and the short forms are expanded on the way out. Refusing to normalise
 * something the Java side reads happily would be this editor being wrong about
 * the file, not the file being wrong.
 */
export function normalizeHexColor(text: string): string | null {
    const match = /^#?([0-9a-fA-F]{3,8})$/.exec(text.trim());
    if (!match) return null;
    const digits = match[1] as string;

    if (digits.length === 3 || digits.length === 4) {
        return `#${[...digits].map((digit) => digit + digit).join("")}`.toLowerCase();
    }
    if (digits.length === 6 || digits.length === 8) return `#${digits.toLowerCase()}`;
    return null;
}

/** The opaque `#rrggbb` part of a colour, for a swatch that cannot show alpha. */
export function opaquePart(color: string): string {
    const normalized = normalizeHexColor(color);
    if (normalized === null) return "#000000";
    return normalized.slice(0, 7);
}

/** The alpha byte of a colour as 0 to 1, or 1 when the colour carries none. */
export function alphaPart(color: string): number {
    const normalized = normalizeHexColor(color);
    if (normalized === null || normalized.length < 9) return 1;
    return Number.parseInt(normalized.slice(7, 9), 16) / 255;
}

/** Puts an alpha of 0 to 1 back onto a colour, dropping it entirely at 1. */
export function withAlpha(color: string, alpha: number): string {
    const base = opaquePart(color);
    const clamped = Math.min(1, Math.max(0, alpha));
    if (clamped >= 1) return base;
    return `${base}${Math.round(clamped * 255)
        .toString(16)
        .padStart(2, "0")}`;
}
