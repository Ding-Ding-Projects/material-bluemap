/**
 * The language port for the settings and appearance surfaces.
 *
 * This module owns no policy. It holds the active language mode and the two funny
 * levels, and resolves a key into copy. Whoever owns the site-wide i18n module
 * calls `setI18nState` whenever the visitor changes either; whoever owns a surface
 * calls `registerStrings` with its own table. Nothing here reaches into another
 * agent's files, so the two can land in either order.
 *
 * Facts never move with the funny level. A level only picks a differently worded
 * variant of the same statement, and a phrase with no variant for a level falls
 * back to the nearest lower one, so copy is never missing.
 */

import { APPEARANCE_STRINGS } from "../appearance/strings.js";
import { SETTINGS_STRINGS } from "./strings.js";

export type LanguageMode = "en" | "yue" | "bilingual";
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;

export const LANGUAGE_MODES: readonly LanguageMode[] = ["en", "yue", "bilingual"];
export const FUNNY_LEVELS: readonly FunnyLevel[] = [1, 2, 3, 4, 5];

export interface I18nState {
    readonly mode: LanguageMode;
    readonly funnyEn: FunnyLevel;
    readonly funnyYue: FunnyLevel;
}

/**
 * One phrase in both languages.
 *
 * A plain string is the same at every funny level, which is the right shape for
 * anything factual: a colour space name, a numeric unit, a keyboard shortcut.
 * A record supplies variants keyed by the level they start applying at.
 */
export type LocalisedPhrase = string | Partial<Record<FunnyLevel, string>>;

export interface Phrase {
    readonly en: LocalisedPhrase;
    readonly yue: LocalisedPhrase;
}

export type StringTable = Readonly<Record<string, Phrase>>;

export type Interpolations = Readonly<Record<string, string | number>>;

const DEFAULT_STATE: I18nState = { mode: "en", funnyEn: 3, funnyYue: 3 };

let state: I18nState = DEFAULT_STATE;
const tables = new Map<string, StringTable>();
const listeners = new Set<() => void>();

export function registerStrings(namespace: string, table: StringTable): void {
    tables.set(namespace, table);
    notify();
}

export function getI18nState(): I18nState {
    return state;
}

export function setI18nState(next: Partial<I18nState>): void {
    const merged: I18nState = {
        mode: next.mode ?? state.mode,
        funnyEn: next.funnyEn ?? state.funnyEn,
        funnyYue: next.funnyYue ?? state.funnyYue,
    };
    if (
        merged.mode === state.mode &&
        merged.funnyEn === state.funnyEn &&
        merged.funnyYue === state.funnyYue
    ) {
        return;
    }
    state = merged;
    notify();
}

export function subscribeI18n(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function notify(): void {
    for (const listener of listeners) listener();
}

/** The `lang` attribute value that matches the active mode. */
export function documentLanguage(): string {
    return state.mode === "yue" ? "zh-HK" : "en";
}

function lookup(key: string): Phrase | null {
    const separator = key.indexOf(".");
    if (separator > 0) {
        const table = tables.get(key.slice(0, separator));
        const phrase = table?.[key];
        if (phrase !== undefined) return phrase;
    }
    for (const table of tables.values()) {
        const phrase = table[key];
        if (phrase !== undefined) return phrase;
    }
    return null;
}

function resolveLevel(phrase: LocalisedPhrase, level: FunnyLevel): string {
    if (typeof phrase === "string") return phrase;
    for (let candidate = level; candidate >= 1; candidate--) {
        const text = phrase[candidate as FunnyLevel];
        if (text !== undefined) return text;
    }
    for (let candidate = level + 1; candidate <= 5; candidate++) {
        const text = phrase[candidate as FunnyLevel];
        if (text !== undefined) return text;
    }
    return "";
}

function interpolate(text: string, values: Interpolations | undefined): string {
    if (values === undefined) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => {
        const replacement = values[name];
        return replacement === undefined ? match : String(replacement);
    });
}

export interface PhraseParts {
    /** The prominent label. English in English and bilingual modes, Cantonese in Cantonese mode. */
    readonly primary: string;
    /** The compact secondary label, or `null` outside bilingual mode. */
    readonly secondary: string | null;
}

/**
 * Both halves of a phrase, so bilingual mode can render a prominent primary label
 * and a compact secondary one instead of one long run-on string.
 */
export function tParts(key: string, values?: Interpolations): PhraseParts {
    const phrase = lookup(key);
    if (phrase === null) {
        // A missing key shows the key. That is ugly on purpose: a silent fallback to
        // English would hide the gap until a visitor found it.
        return { primary: key, secondary: null };
    }
    const english = interpolate(resolveLevel(phrase.en, state.funnyEn), values);
    const cantonese = interpolate(resolveLevel(phrase.yue, state.funnyYue), values);
    switch (state.mode) {
        case "en":
            return { primary: english, secondary: null };
        case "yue":
            return { primary: cantonese === "" ? english : cantonese, secondary: null };
        case "bilingual":
            return { primary: english, secondary: cantonese === "" ? null : cantonese };
    }
}

/** One string. Bilingual mode joins the two with a middle dot. */
export function t(key: string, values?: Interpolations): string {
    const parts = tParts(key, values);
    return parts.secondary === null ? parts.primary : `${parts.primary} · ${parts.secondary}`;
}

/**
 * Fill an element with a phrase, rendering the secondary half as a separate node
 * so stylesheets can shrink it rather than letting bilingual copy crowd a control.
 */
export function fillPhrase(element: HTMLElement, key: string, values?: Interpolations): void {
    const parts = tParts(key, values);
    element.replaceChildren();
    const primary = document.createElement("span");
    primary.className = "i18n-primary";
    primary.textContent = parts.primary;
    element.append(primary);
    if (parts.secondary !== null) {
        const secondary = document.createElement("span");
        // `i18n-secondary` is the shared class the site stylesheet already styles, and
        // the inline variant is what the visitor's own preference switches on. Bilingual
        // copy is the longest copy the site renders, so the two layouts matter.
        const inline = document.documentElement.dataset["secondaryInline"] === "true";
        secondary.className = inline ? "i18n-secondary i18n-secondary--inline" : "i18n-secondary";
        secondary.lang = "zh-HK";
        secondary.textContent = parts.secondary;
        element.append(secondary);
    }
}

/** Every registered key, used by the settings search to index copy it did not author. */
export function allKeys(): readonly string[] {
    const keys: string[] = [];
    for (const table of tables.values()) keys.push(...Object.keys(table));
    return keys;
}

/*
 * The two tables this port serves are registered here rather than by each caller.
 *
 * A caller that forgets leaves its surface rendering raw keys, and the surfaces
 * that use these strings are reachable on their own (the colour picker and the
 * anchored editor open without the settings page). Both string modules import only
 * a type from here, and a type import is erased, so this creates no runtime cycle.
 */
registerStrings("settings", SETTINGS_STRINGS);
registerStrings("appearance", APPEARANCE_STRINGS);

/** Both language renderings of a key, so search matches text the visitor cannot currently see. */
export function searchableText(key: string, values?: Interpolations): string {
    const phrase = lookup(key);
    if (phrase === null) return key;
    const english = interpolate(resolveLevel(phrase.en, state.funnyEn), values);
    const cantonese = interpolate(resolveLevel(phrase.yue, state.funnyYue), values);
    return `${english} ${cantonese}`.trim();
}
