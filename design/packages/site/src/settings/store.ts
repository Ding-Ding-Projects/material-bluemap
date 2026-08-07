/**
 * Settings state.
 *
 * Values live in the site-wide `Preferences` object rather than in a private
 * localStorage key, so there is one storage namespace, one reset path, and one
 * cross-tab channel for the whole site.
 *
 * A setting can also be *bridged*: its value lives in another controller (the
 * theme controller owns the theme, the language module owns the language mode)
 * and this store reads and writes through that controller instead of storing a
 * second copy. Two copies of the same preference is how a settings page ends up
 * showing `light` while the page is dark.
 */

import type { Preferences } from "../platform/Preferences.js";
import type { SettingDefinition, SettingValue, StoredSetting } from "./types.js";
import { isStoredSetting } from "./types.js";

const KEY_PREFIX = "settings.";

export interface SettingBridge {
    read(): SettingValue;
    write(value: SettingValue): void;
    reset(): void;
    subscribe(listener: () => void): () => void;
    /** Whether the controller is still using its default rather than an explicit value. */
    readonly isDefault?: () => boolean;
    /** Truthful source shown beside the setting. */
    readonly provenance?: () => "stored" | "compiled-default" | "responsive-default";
}

export interface ImportReport {
    readonly applied: readonly string[];
    /** Recognised ids whose value was the wrong type or out of range. */
    readonly rejected: readonly { readonly id: string; readonly reason: string }[];
    /** Unrecognised ids. Written back to storage rather than dropped. */
    readonly preserved: readonly string[];
}

type Listener = (changedIds: readonly string[]) => void;

export class SettingsStore {
    private readonly prefs: Preferences;
    private readonly definitions = new Map<string, StoredSetting>();
    private readonly bridges = new Map<string, SettingBridge>();
    private readonly bridgeUnsubscribes = new Map<string, () => void>();
    private readonly listeners = new Set<Listener>();
    /** Effective scheduled values; base browser preferences remain untouched underneath. */
    private readonly overrides = new Map<string, SettingValue>();
    /** Ids written by another build. Kept so a round trip through this build loses nothing. */
    private readonly preserved = new Map<string, string>();

    constructor(prefs: Preferences) {
        this.prefs = prefs;
    }

    register(definitions: readonly SettingDefinition[]): void {
        for (const definition of definitions) {
            if (!isStoredSetting(definition)) continue;
            this.definitions.set(definition.id, definition);
        }
    }

    /**
     * Route a setting to an external controller.
     *
     * Registering a bridge does not copy the current value anywhere: the
     * controller stays the single source of truth for it.
     */
    bridge(id: string, bridge: SettingBridge): void {
        this.bridgeUnsubscribes.get(id)?.();
        this.bridges.set(id, bridge);
        this.bridgeUnsubscribes.set(
            id,
            bridge.subscribe(() => {
                this.emit([id]);
            }),
        );
    }

    definition(id: string): StoredSetting | undefined {
        return this.definitions.get(id);
    }

    definitions_(): readonly StoredSetting[] {
        return [...this.definitions.values()];
    }

    get(id: string): SettingValue {
        const definition = this.definitions.get(id);
        if (definition === undefined) throw new Error(`Unknown setting: ${id}`);

        const override = this.overrides.get(id);
        if (override !== undefined) return override;
        return this.getBase(id, definition);
    }

    private getBase(id: string, definition = this.definitions.get(id)): SettingValue {
        if (definition === undefined) throw new Error(`Unknown setting: ${id}`);

        const bridge = this.bridges.get(id);
        if (bridge !== undefined) {
            return coerce(definition, bridge.read()) ?? definition.defaultValue;
        }

        const raw = this.prefs.read(KEY_PREFIX + id, "");
        if (raw === "") return definition.defaultValue;
        const parsed = decode(definition, raw);
        return parsed === null ? definition.defaultValue : parsed;
    }

    getBoolean(id: string): boolean {
        const value = this.get(id);
        return typeof value === "boolean" ? value : false;
    }

    getNumber(id: string): number {
        const value = this.get(id);
        return typeof value === "number" ? value : 0;
    }

    getString(id: string): string {
        const value = this.get(id);
        return typeof value === "string" ? value : String(value);
    }

    isDefault(id: string): boolean {
        const definition = this.definitions.get(id);
        if (definition === undefined) return true;
        const bridge = this.bridges.get(id);
        if (bridge?.isDefault !== undefined) return bridge.isDefault();
        return this.getBase(id, definition) === definition.defaultValue;
    }

    provenance(
        id: string,
    ): "stored" | "compiled-default" | "responsive-default" | "scheduled-override" {
        const definition = this.definitions.get(id);
        if (definition === undefined) return "compiled-default";
        if (this.overrides.has(id)) return "scheduled-override";
        const bridge = this.bridges.get(id);
        if (bridge?.provenance !== undefined) return bridge.provenance();
        return this.prefs.read(KEY_PREFIX + id, "") === "" ? "compiled-default" : "stored";
    }

    changedIds(): readonly string[] {
        return [...this.definitions.keys()].filter((id) => !this.isDefault(id));
    }

    set(id: string, value: SettingValue): void {
        const definition = this.definitions.get(id);
        if (definition === undefined) throw new Error(`Unknown setting: ${id}`);
        const coerced = coerce(definition, value);
        if (coerced === null) return;
        const bridge = this.bridges.get(id);
        if (bridge !== undefined) {
            // A value equal to the current responsive default is still an explicit choice.
            // Let the bridge persist it when it currently reports itself as default.
            if (this.getBase(id, definition) === coerced && bridge.isDefault?.() !== true) return;
            bridge.write(coerced);
            this.emit([id]);
            return;
        }
        if (this.getBase(id, definition) === coerced) return;
        if (coerced === definition.defaultValue) this.prefs.remove(KEY_PREFIX + id);
        else this.prefs.write(KEY_PREFIX + id, encode(coerced));
        this.emit([id]);
    }

    reset(id: string): void {
        if (this.isDefault(id)) return;
        const bridge = this.bridges.get(id);
        if (bridge !== undefined) bridge.reset();
        else this.prefs.remove(KEY_PREFIX + id);
        this.emit([id]);
    }

    /**
     * Return every setting to its default.
     *
     * Bridged settings are reset through their controller so the controller's own
     * in-memory state goes back too. Clearing the storage key alone would leave a
     * live controller still holding the old value until the next reload.
     */
    resetAll(): void {
        const ids = [...this.definitions.keys()];
        for (const id of ids) {
            const bridge = this.bridges.get(id);
            if (bridge !== undefined) bridge.reset();
            else this.prefs.remove(KEY_PREFIX + id);
        }
        this.preserved.clear();
        this.emit(ids);
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Everything that differs from its default, plus anything preserved from another build. */
    snapshot(): Record<string, SettingValue> {
        const values: Record<string, SettingValue> = {};
        for (const id of this.definitions.keys()) {
            if (!this.isDefault(id)) values[id] = this.getBase(id);
        }
        for (const [id, raw] of this.preserved) values[id] = raw;
        return values;
    }

    import(data: unknown): ImportReport {
        const applied: string[] = [];
        const rejected: { id: string; reason: string }[] = [];
        const preserved: string[] = [];

        const record =
            typeof data === "object" && data !== null
                ? ((data as { values?: unknown }).values ?? data)
                : {};
        if (typeof record !== "object" || record === null) {
            return { applied, rejected, preserved };
        }

        for (const [id, raw] of Object.entries(record as Record<string, unknown>)) {
            const definition = this.definitions.get(id);
            if (definition === undefined) {
                this.preserved.set(id, typeof raw === "string" ? raw : JSON.stringify(raw));
                preserved.push(id);
                continue;
            }
            if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
                rejected.push({ id, reason: "type" });
                continue;
            }
            const coerced = coerce(definition, raw);
            if (coerced === null) {
                rejected.push({ id, reason: "range" });
                continue;
            }
            this.set(id, coerced);
            applied.push(id);
        }
        this.emit([...this.definitions.keys()]);
        return { applied, rejected, preserved };
    }

    /** Null when persistence works, otherwise a key naming the reason for honest display. */
    persistenceError(): string | null {
        return this.prefs.available ? null : "unavailable";
    }

    /** Validate a candidate without changing either the base or effective value. */
    validate(id: string, value: SettingValue): SettingValue | null {
        const definition = this.definitions.get(id);
        return definition === undefined ? null : coerce(definition, value);
    }

    /** Replace the complete scheduled layer without rewriting any base preference. */
    replaceScheduledOverrides(values: Readonly<Record<string, SettingValue>>): readonly string[] {
        const next = new Map<string, SettingValue>();
        for (const [id, raw] of Object.entries(values)) {
            const value = this.validate(id, raw);
            if (value !== null) next.set(id, value);
        }
        const changed = new Set<string>([...this.overrides.keys(), ...next.keys()]);
        this.overrides.clear();
        for (const [id, value] of next) this.overrides.set(id, value);
        this.emit([...changed]);
        return [...next.keys()];
    }

    scheduledOverrideIds(): readonly string[] {
        return [...this.overrides.keys()];
    }

    private emit(ids: readonly string[]): void {
        const unique = [...new Set(ids)];
        for (const listener of [...this.listeners]) listener(unique);
    }
}

function encode(value: SettingValue): string {
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
}

function decode(definition: StoredSetting, raw: string): SettingValue | null {
    switch (definition.kind) {
        case "toggle":
            return raw === "true" ? true : raw === "false" ? false : null;
        case "slider":
        case "number": {
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? coerce(definition, parsed) : null;
        }
        default:
            return coerce(definition, raw);
    }
}

/** Bring a raw value into range for its definition, or reject it outright. */
function coerce(definition: StoredSetting, value: SettingValue): SettingValue | null {
    switch (definition.kind) {
        case "toggle":
            return typeof value === "boolean" ? value : null;
        case "select": {
            if (typeof value !== "string") return null;
            return definition.options.some((option) => option.value === value) ? value : null;
        }
        case "slider":
        case "number": {
            if (typeof value !== "number" || !Number.isFinite(value)) return null;
            const clamped = Math.min(definition.max, Math.max(definition.min, value));
            const steps = Math.round((clamped - definition.min) / definition.step);
            const snapped = definition.min + steps * definition.step;
            const bounded = Math.min(definition.max, Math.max(definition.min, snapped));
            return Number(bounded.toFixed(6));
        }
        case "text":
            return typeof value === "string" ? value.slice(0, definition.maxLength) : null;
        case "color":
        case "font":
            return typeof value === "string" ? value : null;
    }
}
