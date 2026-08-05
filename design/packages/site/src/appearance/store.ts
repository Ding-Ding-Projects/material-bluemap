/**
 * Per-element appearance state, saved presets, and the theme file format.
 *
 * Three resets exist because three different mistakes need undoing: one property
 * the visitor mistyped, one element they over-decorated, and the whole lot. All
 * three are here rather than in the editor, so the settings page, the anchored
 * editor, and an imported theme cannot drift apart about what "default" means.
 */

import type { BoxValues, ElementAppearance, StateName, StateValues } from "./model.js";
import {
    BOX_DEFAULTS,
    STATE_DEFAULTS,
    STATE_NAMES,
    cloneAppearance,
    defaultAppearance,
    isAppearanceEmpty,
} from "./model.js";
import type { TypographyKey, TypographyValues } from "./type/model.js";
import { TYPOGRAPHY_DEFAULTS } from "./type/model.js";

const STORAGE_KEY = "material-bluemap.site.appearance.v1";
export const THEME_FORMAT = "material-bluemap.site.theme";
export const THEME_VERSION = 1;

export interface AppearancePreset {
    readonly id: string;
    readonly name: string;
    /** ISO 8601, so an exported file says when it was made without a locale in the way. */
    readonly createdAt: string;
    readonly styles: Readonly<Record<string, ElementAppearance>>;
}

export interface ThemeFile {
    readonly format: typeof THEME_FORMAT;
    readonly version: number;
    readonly exportedAt: string;
    readonly styles: Readonly<Record<string, ElementAppearance>>;
    readonly presets: readonly AppearancePreset[];
    /** Optional settings snapshot, so one file can carry a whole customised look. */
    readonly settings?: Readonly<Record<string, string | number | boolean>>;
}

export interface ThemeImportReport {
    readonly stylesApplied: number;
    readonly presetsApplied: number;
    /** Property names kept because this build has nothing to render them with. */
    readonly preservedProperties: readonly string[];
    readonly error: string | null;
}

type Listener = (changedStyleIds: readonly string[]) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AppearanceStore {
    private styles = new Map<string, ElementAppearance>();
    private presetList: AppearancePreset[] = [];
    private readonly listeners = new Set<Listener>();
    private available = true;
    private error: string | null = null;

    constructor() {
        this.hydrate();
    }

    /** The stored appearance for a style id, or a fresh default. Always a copy. */
    get(id: string): ElementAppearance {
        const stored = this.styles.get(id);
        return stored === undefined ? defaultAppearance() : cloneAppearance(stored);
    }

    /** True when this style id has anything stored at all. */
    has(id: string): boolean {
        return this.styles.has(id);
    }

    /** Every style id with something stored, for the settings page's customised list. */
    customisedIds(): readonly string[] {
        return [...this.styles.keys()].sort();
    }

    setTypography<K extends TypographyKey>(id: string, key: K, value: TypographyValues[K]): void {
        this.mutate(id, (appearance) => {
            appearance.typography[key] = value;
        });
    }

    setBox<K extends keyof BoxValues>(id: string, key: K, value: BoxValues[K]): void {
        this.mutate(id, (appearance) => {
            // `Object.assign` rather than an indexed write: TypeScript reduces a write
            // through a generic key to `never`, and casting the value would throw away
            // the type check this signature exists to provide.
            Object.assign(appearance.box, { [key]: value });
        });
    }

    setState<K extends keyof StateValues>(
        id: string,
        state: StateName,
        key: K,
        value: StateValues[K]
    ): void {
        this.mutate(id, (appearance) => {
            Object.assign(appearance.states[state], { [key]: value });
        });
    }

    /** Reset one property back to inherit, leaving everything else on the element alone. */
    resetTypographyProperty(id: string, key: TypographyKey): void {
        this.mutate(id, (appearance) => {
            Object.assign(appearance.typography, { [key]: TYPOGRAPHY_DEFAULTS[key] });
        });
    }

    resetBoxProperty(id: string, key: keyof BoxValues): void {
        this.mutate(id, (appearance) => {
            Object.assign(appearance.box, { [key]: BOX_DEFAULTS[key] });
        });
    }

    resetStateProperty(id: string, state: StateName, key: keyof StateValues): void {
        this.mutate(id, (appearance) => {
            Object.assign(appearance.states[state], { [key]: STATE_DEFAULTS[key] });
        });
    }

    /** Reset one element completely. Other elements and saved presets are untouched. */
    resetElement(id: string): void {
        if (!this.styles.has(id)) return;
        this.styles.delete(id);
        this.persist();
        this.emit([id]);
    }

    /** Reset every element. Saved presets survive, so this is recoverable. */
    resetAllElements(): void {
        const ids = [...this.styles.keys()];
        if (ids.length === 0) return;
        this.styles.clear();
        this.persist();
        this.emit(ids);
    }

    presets(): readonly AppearancePreset[] {
        return this.presetList;
    }

    /**
     * Save the current per-element appearance under a name.
     *
     * An existing name is replaced only when `overwrite` is set. Silently
     * overwriting someone's saved theme because the names collided is the failure
     * the appearance contract calls out by name.
     */
    savePreset(name: string, overwrite = false): { saved: boolean; reason: "name-taken" | null } {
        const trimmed = name.trim().slice(0, 80);
        if (trimmed === "") return { saved: false, reason: null };
        const existing = this.presetList.findIndex(
            (preset) => preset.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing >= 0 && !overwrite) return { saved: false, reason: "name-taken" };

        const preset: AppearancePreset = {
            id: existing >= 0 ? (this.presetList[existing]?.id ?? createId()) : createId(),
            name: trimmed,
            createdAt: new Date().toISOString(),
            styles: this.serialiseStyles(),
        };
        if (existing >= 0) this.presetList[existing] = preset;
        else this.presetList.push(preset);
        this.persist();
        this.emit([]);
        return { saved: true, reason: null };
    }

    applyPreset(id: string): boolean {
        const preset = this.presetList.find((candidate) => candidate.id === id);
        if (preset === undefined) return false;
        const changed = new Set([...this.styles.keys(), ...Object.keys(preset.styles)]);
        this.styles.clear();
        for (const [styleId, appearance] of Object.entries(preset.styles)) {
            this.styles.set(styleId, cloneAppearance(appearance));
        }
        this.persist();
        this.emit([...changed]);
        return true;
    }

    deletePreset(id: string): boolean {
        const index = this.presetList.findIndex((preset) => preset.id === id);
        if (index < 0) return false;
        this.presetList.splice(index, 1);
        this.persist();
        this.emit([]);
        return true;
    }

    /**
     * The bulk-selection counterpart to `deletePreset`: forgets every preset named by id,
     * keeping the rest, in one persisted write and one emitted change rather than one of
     * each per preset. Returns how many were actually removed, so a caller with a stale id
     * (a preset deleted from another tab, say) reports the true count rather than the size
     * of the selection it was given.
     */
    deletePresets(ids: readonly string[]): number {
        if (ids.length === 0) return 0;
        const doomed = new Set(ids);
        const before = this.presetList.length;
        this.presetList = this.presetList.filter((preset) => !doomed.has(preset.id));
        const removed = before - this.presetList.length;
        if (removed > 0) {
            this.persist();
            this.emit([]);
        }
        return removed;
    }

    renamePreset(id: string, name: string): boolean {
        const index = this.presetList.findIndex((preset) => preset.id === id);
        const preset = this.presetList[index];
        if (preset === undefined) return false;
        const trimmed = name.trim().slice(0, 80);
        if (trimmed === "") return false;
        this.presetList[index] = { ...preset, name: trimmed };
        this.persist();
        this.emit([]);
        return true;
    }

    exportTheme(settings?: Readonly<Record<string, string | number | boolean>>): ThemeFile {
        const base = {
            format: THEME_FORMAT,
            version: THEME_VERSION,
            exportedAt: new Date().toISOString(),
            styles: this.serialiseStyles(),
            presets: this.presetList.map((preset) => ({ ...preset })),
        } as const;
        return settings === undefined ? base : { ...base, settings };
    }

    /**
     * A theme file carrying only the named presets -- deliberately not the current
     * on-screen appearance and not the rest of the saved presets, unlike `exportTheme`.
     * "Export selected" means the selection, not everything this element also happens to
     * be able to export; a visitor who wanted the whole look still has the plain Export
     * button for that. Still a real, re-importable `ThemeFile`.
     */
    exportPresets(ids: readonly string[]): ThemeFile {
        const chosen = new Set(ids);
        return {
            format: THEME_FORMAT,
            version: THEME_VERSION,
            exportedAt: new Date().toISOString(),
            styles: {},
            presets: this.presetList.filter((preset) => chosen.has(preset.id)).map((preset) => ({ ...preset })),
        };
    }

    /**
     * Read a theme file.
     *
     * Properties this build does not know are kept in each element's `unknown` bag
     * and named in the report, so the visitor is told what was carried rather than
     * discovering later that it vanished.
     */
    importTheme(data: unknown): ThemeImportReport {
        if (!isRecord(data) || data["format"] !== THEME_FORMAT) {
            return {
                stylesApplied: 0,
                presetsApplied: 0,
                preservedProperties: [],
                error: "not-a-theme",
            };
        }
        const preserved = new Set<string>();
        const changed = new Set<string>(this.styles.keys());

        const rawStyles = data["styles"];
        if (isRecord(rawStyles)) {
            this.styles.clear();
            for (const [id, raw] of Object.entries(rawStyles)) {
                const appearance = readAppearance(raw, preserved);
                if (!isAppearanceEmpty(appearance)) this.styles.set(id, appearance);
                changed.add(id);
            }
        }

        const rawPresets = data["presets"];
        let presetsApplied = 0;
        if (Array.isArray(rawPresets)) {
            for (const raw of rawPresets) {
                if (!isRecord(raw)) continue;
                const name = typeof raw["name"] === "string" ? raw["name"] : "";
                if (name === "") continue;
                const styles: Record<string, ElementAppearance> = {};
                const rawPresetStyles = raw["styles"];
                if (isRecord(rawPresetStyles)) {
                    for (const [id, value] of Object.entries(rawPresetStyles)) {
                        styles[id] = readAppearance(value, preserved);
                    }
                }
                const existing = this.presetList.findIndex(
                    (preset) => preset.name.toLowerCase() === name.toLowerCase()
                );
                const preset: AppearancePreset = {
                    id: typeof raw["id"] === "string" ? raw["id"] : createId(),
                    name,
                    createdAt: typeof raw["createdAt"] === "string" ? raw["createdAt"] : new Date().toISOString(),
                    styles,
                };
                if (existing >= 0) this.presetList[existing] = preset;
                else this.presetList.push(preset);
                presetsApplied += 1;
            }
        }

        this.persist();
        this.emit([...changed]);
        return {
            stylesApplied: this.styles.size,
            presetsApplied,
            preservedProperties: [...preserved].sort(),
            error: null,
        };
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    persistenceError(): string | null {
        return this.error;
    }

    private mutate(id: string, apply: (appearance: ElementAppearance) => void): void {
        const current = this.styles.get(id) ?? defaultAppearance();
        const next = cloneAppearance(current);
        apply(next);
        if (isAppearanceEmpty(next)) this.styles.delete(id);
        else this.styles.set(id, next);
        this.persist();
        this.emit([id]);
    }

    private serialiseStyles(): Record<string, ElementAppearance> {
        const output: Record<string, ElementAppearance> = {};
        for (const [id, appearance] of this.styles) output[id] = cloneAppearance(appearance);
        return output;
    }

    private hydrate(): void {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw === null) return;
            const parsed: unknown = JSON.parse(raw);
            if (!isRecord(parsed)) return;
            const styles = parsed["styles"];
            if (isRecord(styles)) {
                const preserved = new Set<string>();
                for (const [id, value] of Object.entries(styles)) {
                    const appearance = readAppearance(value, preserved);
                    if (!isAppearanceEmpty(appearance)) this.styles.set(id, appearance);
                }
            }
            const presets = parsed["presets"];
            if (Array.isArray(presets)) {
                for (const raw2 of presets) {
                    if (!isRecord(raw2)) continue;
                    const name = typeof raw2["name"] === "string" ? raw2["name"] : "";
                    if (name === "") continue;
                    const presetStyles: Record<string, ElementAppearance> = {};
                    const rawPresetStyles = raw2["styles"];
                    const preserved = new Set<string>();
                    if (isRecord(rawPresetStyles)) {
                        for (const [id, value] of Object.entries(rawPresetStyles)) {
                            presetStyles[id] = readAppearance(value, preserved);
                        }
                    }
                    this.presetList.push({
                        id: typeof raw2["id"] === "string" ? raw2["id"] : createId(),
                        name,
                        createdAt:
                            typeof raw2["createdAt"] === "string"
                                ? raw2["createdAt"]
                                : new Date().toISOString(),
                        styles: presetStyles,
                    });
                }
            }
        } catch {
            this.available = false;
            this.error = "unavailable";
        }
    }

    private persist(): void {
        if (!this.available) return;
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    version: THEME_VERSION,
                    styles: this.serialiseStyles(),
                    presets: this.presetList,
                })
            );
            this.error = null;
        } catch {
            this.available = false;
            this.error = "write-failed";
        }
    }

    private emit(ids: readonly string[]): void {
        const unique = [...new Set(ids)];
        for (const listener of this.listeners) listener(unique);
    }
}

function createId(): string {
    const random = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    return `p${Date.now().toString(36)}${random}`;
}

/** Read one element's appearance, routing anything unrecognised into `unknown`. */
function readAppearance(raw: unknown, preserved: Set<string>): ElementAppearance {
    const appearance = defaultAppearance();
    if (!isRecord(raw)) return appearance;

    const typography = raw["typography"];
    if (isRecord(typography)) {
        for (const [key, value] of Object.entries(typography)) {
            if (!(key in TYPOGRAPHY_DEFAULTS)) {
                appearance.unknown[`typography.${key}`] = value;
                preserved.add(`typography.${key}`);
                continue;
            }
            const typedKey = key as TypographyKey;
            const expected = typeof TYPOGRAPHY_DEFAULTS[typedKey];
            if (typeof value !== expected) {
                appearance.unknown[`typography.${key}`] = value;
                preserved.add(`typography.${key}`);
                continue;
            }
            Object.assign(appearance.typography, { [typedKey]: value });
        }
    }

    const box = raw["box"];
    if (isRecord(box)) {
        for (const [key, value] of Object.entries(box)) {
            if (!(key in BOX_DEFAULTS)) {
                appearance.unknown[`box.${key}`] = value;
                preserved.add(`box.${key}`);
                continue;
            }
            const typedKey = key as keyof BoxValues;
            if (typeof value !== typeof BOX_DEFAULTS[typedKey]) {
                appearance.unknown[`box.${key}`] = value;
                preserved.add(`box.${key}`);
                continue;
            }
            Object.assign(appearance.box, { [typedKey]: value });
        }
    }

    const states = raw["states"];
    if (isRecord(states)) {
        for (const [stateName, stateValue] of Object.entries(states)) {
            if (!STATE_NAMES.includes(stateName as StateName) || !isRecord(stateValue)) {
                appearance.unknown[`states.${stateName}`] = stateValue;
                preserved.add(`states.${stateName}`);
                continue;
            }
            const target = appearance.states[stateName as StateName];
            for (const [key, value] of Object.entries(stateValue)) {
                if (!(key in STATE_DEFAULTS) || typeof value !== "string") {
                    appearance.unknown[`states.${stateName}.${key}`] = value;
                    preserved.add(`states.${stateName}.${key}`);
                    continue;
                }
                Object.assign(target, { [key]: value });
            }
        }
    }

    const unknown = raw["unknown"];
    if (isRecord(unknown)) {
        for (const [key, value] of Object.entries(unknown)) {
            appearance.unknown[key] = value;
            preserved.add(key);
        }
    }

    return appearance;
}

export const appearanceStore = new AppearanceStore();
