/**
 * Language modes and funny levels.
 *
 * Three modes (English, playful Hong Kong Cantonese, bilingual) and two entirely separate
 * funny levels, one per language, all persisted per visitor. The English level never touches
 * Cantonese copy and the Cantonese level never touches English copy: they are two settings
 * that happen to sit next to each other, not one setting with two labels.
 *
 * Text reaches the DOM through `bindText` and `bindAttr` rather than being assigned once.
 * A binding remembers its key and its values, so changing mode or level rewrites the copy in
 * place without rebuilding the page and without moving focus off whatever the visitor is
 * using. Bindings whose element has left the document are dropped on the next refresh.
 */

import { FIXED, VOICED, type FixedKey, type StringKey, type VoicedKey } from "./strings.js";
import type { Preferences } from "../platform/Preferences.js";

export const LANGUAGE_MODES = ["en", "yue", "bilingual"] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export const FUNNY_LEVELS = [1, 2, 3, 4, 5] as const;
export type FunnyLevel = (typeof FUNNY_LEVELS)[number];

export type TranslationVars = Readonly<Record<string, string | number>>;

export interface TextPair {
    /** The prominent label. English in bilingual mode. */
    readonly primary: string;
    /** The compact secondary label, or null when only one language is showing. */
    readonly secondary: string | null;
}

/**
 * Text that reaches the interface is either a catalogue key, so it follows the language mode
 * and both funny levels, or a literal string for content that is already resolved: a group
 * name the visitor typed, an error message from the regular-expression engine, a dish name
 * from the dim sum catalogue.
 */
export type TextSource =
    | { readonly key: StringKey; readonly vars?: TranslationVars }
    | { readonly text: string; readonly secondary?: string };

const MODE_KEY = "language.mode";
const FUNNY_EN_KEY = "language.funny.en";
const FUNNY_YUE_KEY = "language.funny.yue";

interface TextBinding {
    readonly node: HTMLElement;
    readonly key: StringKey;
    readonly kind: "text" | "attr";
    readonly attribute: string;
    vars: TranslationVars;
}

function isVoiced(key: StringKey): key is VoicedKey {
    return Object.prototype.hasOwnProperty.call(VOICED, key);
}

function interpolate(template: string, vars: TranslationVars): string {
    if (Object.keys(vars).length === 0) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = vars[name];
        // An unresolved placeholder stays visible rather than turning into "undefined",
        // so a missing value reads as the bug it is instead of as copy.
        return value === undefined ? whole : String(value);
    });
}

export class I18n {
    private readonly prefs: Preferences;
    private readonly listeners = new Set<() => void>();
    private bindings: TextBinding[] = [];
    private currentMode: LanguageMode;
    private currentFunnyEn: FunnyLevel;
    private currentFunnyYue: FunnyLevel;

    constructor(prefs: Preferences) {
        this.prefs = prefs;
        this.currentMode = prefs.readOneOf<LanguageMode>(MODE_KEY, LANGUAGE_MODES, "en");
        this.currentFunnyEn = clampLevel(prefs.readInt(FUNNY_EN_KEY, 3, 1, 5));
        this.currentFunnyYue = clampLevel(prefs.readInt(FUNNY_YUE_KEY, 3, 1, 5));
        this.applyDocumentLanguage();
    }

    get mode(): LanguageMode {
        return this.currentMode;
    }

    get funnyEn(): FunnyLevel {
        return this.currentFunnyEn;
    }

    get funnyYue(): FunnyLevel {
        return this.currentFunnyYue;
    }

    setMode(mode: LanguageMode): void {
        if (mode === this.currentMode) return;
        this.currentMode = mode;
        this.prefs.write(MODE_KEY, mode);
        this.applyDocumentLanguage();
        this.refresh();
    }

    setFunnyLevel(language: "en" | "yue", level: FunnyLevel): void {
        if (language === "en") {
            if (level === this.currentFunnyEn) return;
            this.currentFunnyEn = level;
            this.prefs.write(FUNNY_EN_KEY, String(level));
        } else {
            if (level === this.currentFunnyYue) return;
            this.currentFunnyYue = level;
            this.prefs.write(FUNNY_YUE_KEY, String(level));
        }
        this.refresh();
    }

    /** Return all three choices to their defaults: English, level 3 in both languages. */
    reset(): void {
        this.prefs.remove(MODE_KEY);
        this.prefs.remove(FUNNY_EN_KEY);
        this.prefs.remove(FUNNY_YUE_KEY);
        this.currentMode = "en";
        this.currentFunnyEn = 3;
        this.currentFunnyYue = 3;
        this.applyDocumentLanguage();
        this.refresh();
    }

    /** The English string at the current English level, whatever the mode is. */
    english(key: StringKey, vars: TranslationVars = {}): string {
        return interpolate(this.raw(key, "en"), vars);
    }

    /** The Cantonese string at the current Cantonese level, whatever the mode is. */
    cantonese(key: StringKey, vars: TranslationVars = {}): string {
        return interpolate(this.raw(key, "yue"), vars);
    }

    /**
     * A flat string, for places that can only hold one: an attribute, a document title, a
     * prompt. Bilingual mode joins the two with a slash rather than dropping one.
     */
    t(key: StringKey, vars: TranslationVars = {}): string {
        const pair = this.pair(key, vars);
        return pair.secondary === null ? pair.primary : `${pair.primary} / ${pair.secondary}`;
    }

    /**
     * The prominent label plus the compact secondary label. Bilingual mode keeps English
     * prominent and puts Cantonese underneath it in a smaller style, so both are present
     * without the control growing sideways.
     */
    pair(key: StringKey, vars: TranslationVars = {}): TextPair {
        if (this.currentMode === "en") return { primary: this.english(key, vars), secondary: null };
        if (this.currentMode === "yue") return { primary: this.cantonese(key, vars), secondary: null };
        return { primary: this.english(key, vars), secondary: this.cantonese(key, vars) };
    }

    /**
     * A TextSource as one flat string. This is what bulk-close and every tab search match
     * against, so matching sees exactly the text the visitor can read on the tab.
     */
    text(source: TextSource): string {
        if ("key" in source) return this.t(source.key, source.vars ?? {});
        return source.secondary === undefined ? source.text : `${source.text} / ${source.secondary}`;
    }

    /** Render a TextSource into an element, binding it when it is a catalogue key. */
    applyTo(node: HTMLElement, source: TextSource): void {
        if ("key" in source) {
            this.bindText(node, source.key, source.vars ?? {});
            return;
        }
        node.textContent = source.text;
        if (source.secondary !== undefined && this.currentMode === "bilingual") {
            const secondary = document.createElement("span");
            secondary.className = "i18n-secondary";
            secondary.lang = "zh-HK";
            secondary.textContent = source.secondary;
            node.append(secondary);
        }
    }

    /** The display name of a funny level, in the language it labels. */
    levelName(level: FunnyLevel, language: "en" | "yue"): string {
        const key = `language.level.${level}` as FixedKey;
        return FIXED[key][language];
    }

    /**
     * Render a key into an element and keep it in step with the language settings. Replaces
     * whatever the element contained.
     */
    bindText(node: HTMLElement, key: StringKey, vars: TranslationVars = {}): void {
        // One text binding per element. Re-binding replaces the previous key rather than
        // stacking beside it, so an element whose copy changes cannot end up with two
        // bindings fighting over it on the next refresh.
        this.bindings = this.bindings.filter((existing) => !(existing.node === node && existing.kind === "text"));
        const binding: TextBinding = { node, key, kind: "text", attribute: "", vars };
        this.bindings.push(binding);
        this.renderBinding(binding);
    }

    /** Render a key into an attribute (aria-label, title, placeholder) and keep it in step. */
    bindAttr(node: HTMLElement, attribute: string, key: StringKey, vars: TranslationVars = {}): void {
        this.bindings = this.bindings.filter(
            (existing) => !(existing.node === node && existing.kind === "attr" && existing.attribute === attribute),
        );
        const binding: TextBinding = { node, key, kind: "attr", attribute, vars };
        this.bindings.push(binding);
        this.renderBinding(binding);
    }

    /** Change the interpolated values of an existing binding, for counts that move. */
    updateVars(node: HTMLElement, vars: TranslationVars): void {
        for (const binding of this.bindings) {
            if (binding.node === node) {
                binding.vars = vars;
                this.renderBinding(binding);
            }
        }
    }

    /** Re-render every live binding. Called on any language or level change. */
    refresh(): void {
        this.bindings = this.bindings.filter((binding) => binding.node.isConnected);
        for (const binding of this.bindings) this.renderBinding(binding);
        for (const listener of [...this.listeners]) listener();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private renderBinding(binding: TextBinding): void {
        if (binding.kind === "attr") {
            binding.node.setAttribute(binding.attribute, this.t(binding.key, binding.vars));
            return;
        }
        const pair = this.pair(binding.key, binding.vars);
        binding.node.textContent = pair.primary;
        if (pair.secondary !== null) {
            const secondary = document.createElement("span");
            secondary.className = "i18n-secondary";
            secondary.lang = "zh-HK";
            secondary.textContent = pair.secondary;
            binding.node.append(secondary);
        }
    }

    private raw(key: StringKey, language: "en" | "yue"): string {
        if (isVoiced(key)) {
            const entry = VOICED[key];
            const level = language === "en" ? this.currentFunnyEn : this.currentFunnyYue;
            const strings = language === "en" ? entry.en : entry.yue;
            return strings[level - 1] ?? strings[2];
        }
        return FIXED[key][language];
    }

    private applyDocumentLanguage(): void {
        const root = document.documentElement;
        root.dataset.language = this.currentMode;
        // Bilingual pages lead with English, so the document language is English and the
        // Cantonese fragments carry lang="zh-HK" themselves. A screen reader then switches
        // voice per fragment instead of reading English through a Cantonese synthesiser.
        root.lang = this.currentMode === "yue" ? "zh-HK" : "en";
    }
}

function clampLevel(value: number): FunnyLevel {
    const level = Math.min(5, Math.max(1, Math.round(value)));
    return level as FunnyLevel;
}
