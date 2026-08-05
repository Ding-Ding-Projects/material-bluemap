/**
 * Where appearance lives between launches, and how it travels between machines.
 *
 * Three jobs, all of them about not losing what somebody typed.
 *
 * **Persistence.** The same defensive shape the rest of this package uses for stored
 * preferences: storage that throws is a preference that does not survive a restart, which is
 * annoying and nowhere near a notification, so both the read and the write are guarded and
 * silent. A stored blob that is not the shape this build expects is repaired rather than
 * trusted, because the file is editable by hand and by an older version of this app.
 *
 * **Unknown keys survive the round trip.** A theme exported by a later build carries sections
 * this one has never heard of. Dropping them is the obvious implementation and it means a
 * user who opens their theme in an older version, changes one font, and saves silently
 * deletes everything the newer version added. Anything unrecognised is parked in the record's
 * `preserved` bag and written straight back out on export. This build cannot render those
 * values and never claims to; it just declines to be the reason they vanish.
 *
 * **A value with the wrong type is reported, not deleted.** A `fontSize` of `"large"` cannot
 * be used — the editor's stepper has nowhere to put it — but it is still something a person
 * wrote. It goes into `preserved` alongside the unknown keys and is named in the import
 * report, so the user is told which of their settings did not survive and can fix it, rather
 * than discovering later that a value is gone.
 */

import {
    emptyRecord,
    mergeRecords,
    resolveRecords,
    SURFACE_PROPERTIES,
    DEFAULT_SURFACE,
    type AppearanceRecord,
    type ResolvedAppearance,
    type SurfaceSpec,
} from "./appearanceRecord.js";
import {
    DEFAULT_TYPOGRAPHY,
    TYPOGRAPHY_PROPERTIES,
    type TypographySpec,
} from "./typographySpec.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** The storage key, namespaced like every other preference this app keeps. */
export const APPEARANCE_STORAGE_KEY = "material-bluemap-appearance";

/** The marker an exported file carries, so a stray JSON file is not read as a theme. */
export const APPEARANCE_FORMAT = "material-bluemap-appearance";

export const APPEARANCE_VERSION = 1;

/**
 * The id of the record that applies to everything.
 *
 * A reserved element id rather than a separate field, so the global settings are edited,
 * reset and exported through exactly the same code paths as any single element's. A feature
 * whose global layer had its own parallel implementation would be a feature with two reset
 * bugs instead of one.
 */
export const GLOBAL_TARGET = "global";

/* -------------------------------------------------------------------------- */
/* Targets                                                                    */
/* -------------------------------------------------------------------------- */

/** An element that can be edited, as the editor's element list shows it. */
export interface AppearanceTargetInfo {
    id: string;
    labelKey: string;
    /** The English label, used when no locale defines the key. */
    fallback: string;
}

/**
 * The editor's own chrome, as editable targets.
 *
 * The contract is explicit that the pickers must theme themselves and the chrome around them,
 * and that a theming feature that cannot theme its own dialog is incomplete. These ids are
 * bound by the editor's own components, so opening the appearance editor on the appearance
 * editor works, live, in the same way it works on anything else. They are listed here rather
 * than registered at runtime because they exist for as long as the editor does.
 *
 * Everything else registers itself when it mounts. A static list of tabs, menus and toolbars
 * would be a list of claims rather than of facts, and the first one to go stale would be
 * indistinguishable from a bug.
 */
export const EDITOR_CHROME_TARGETS: readonly AppearanceTargetInfo[] = [
    {
        id: GLOBAL_TARGET,
        labelKey: "appearance.target.global",
        fallback: "Everything (global)",
    },
    {
        id: "appearance.editor",
        labelKey: "appearance.target.editor",
        fallback: "The appearance editor itself",
    },
    {
        id: "appearance.colorPicker",
        labelKey: "appearance.target.colorPicker",
        fallback: "The colour picker panel",
    },
    {
        id: "appearance.typography",
        labelKey: "appearance.target.typography",
        fallback: "The typography panel",
    },
];

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

export interface AppearancePreset {
    id: string;
    name: string;
    /** True for the presets this build ships, which cannot be deleted or overwritten. */
    builtIn: boolean;
    record: AppearanceRecord;
}

function preset(id: string, name: string, record: Partial<AppearanceRecord>): AppearancePreset {
    return { id, name, builtIn: true, record: { ...emptyRecord(), ...record } };
}

/**
 * The presets this build ships.
 *
 * Deliberately few and deliberately useful rather than decorative: one that is the app's own
 * defaults, one that raises contrast and weight for somebody who needs it, and one that
 * enlarges text without touching anything else. A gallery of themed colour schemes would be
 * the wrong thing to ship first, because a preset a user cannot delete and did not ask for is
 * clutter, whereas these three are answers to real requests.
 */
export const BUILT_IN_PRESETS: readonly AppearancePreset[] = [
    preset("builtin.default", "App default", {}),
    preset("builtin.highContrast", "High contrast", {
        typography: { fontWeight: 600, textColor: "#ffffff" },
        surface: { backgroundColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderStyle: "solid" },
    }),
    preset("builtin.largeText", "Large text", {
        typography: { fontSize: 18, lineHeight: 1.6 },
    }),
];

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export interface AppearanceState {
    version: number;
    /** Per-element overrides, keyed by element id. `global` is one of them. */
    elements: Record<string, AppearanceRecord>;
    /** The built-in presets followed by whatever the user has saved. */
    presets: AppearancePreset[];
    /** The preset every element inherits from, or the empty string for none. */
    activePreset: string;
}

export function emptyState(): AppearanceState {
    return {
        version: APPEARANCE_VERSION,
        elements: {},
        presets: BUILT_IN_PRESETS.map((entry) => ({
            ...entry,
            record: { ...entry.record },
        })),
        activePreset: "",
    };
}

/** The record for one element, or an empty one when it has no overrides yet. */
export function recordFor(state: AppearanceState, id: string): AppearanceRecord {
    return state.elements[id] ?? emptyRecord();
}

function presetRecord(state: AppearanceState, id: string): AppearanceRecord {
    return state.presets.find((entry) => entry.id === id)?.record ?? emptyRecord();
}

/**
 * The appearance an element actually renders with.
 *
 * The chain is the contract's inheritance order, applied outward-in: the active preset, then
 * the global record, then any preset the element itself names, then the element's own
 * overrides. An element naming its own preset is what makes "this one tab follows the
 * high-contrast preset" expressible without changing anything else.
 */
export function resolveTarget(state: AppearanceState, id: string): ResolvedAppearance {
    const own = recordFor(state, id);
    const global = id === GLOBAL_TARGET ? emptyRecord() : recordFor(state, GLOBAL_TARGET);

    return resolveRecords(
        presetRecord(state, state.activePreset),
        global,
        presetRecord(state, own.inherit),
        own,
    );
}

/** The merged record behind {@link resolveTarget}, for an editor that shows inheritance. */
export function effectiveRecord(state: AppearanceState, id: string): AppearanceRecord {
    const own = recordFor(state, id);
    const global = id === GLOBAL_TARGET ? emptyRecord() : recordFor(state, GLOBAL_TARGET);
    return mergeRecords(
        presetRecord(state, state.activePreset),
        global,
        presetRecord(state, own.inherit),
        own,
    );
}

/* -------------------------------------------------------------------------- */
/* Immutable updates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The state with one element's record replaced.
 *
 * An empty record is removed rather than stored, so "reset everything on this element" and
 * "this element was never touched" are the same state. Without that, an export would carry a
 * growing list of elements that say nothing, and the editor could not truthfully tell a user
 * which elements they have customised.
 */
export function withRecord(
    state: AppearanceState,
    id: string,
    record: AppearanceRecord,
): AppearanceState {
    const elements: Record<string, AppearanceRecord> = { ...state.elements };
    const empty =
        Object.keys(record.typography).length === 0 &&
        Object.keys(record.surface).length === 0 &&
        record.inherit === "" &&
        Object.keys(record.preserved).length === 0;

    if (empty) delete elements[id];
    else elements[id] = record;

    return { ...state, elements };
}

/** The state with one element's overrides removed. */
export function withElementReset(state: AppearanceState, id: string): AppearanceState {
    return withRecord(state, id, emptyRecord());
}

/**
 * The state with every element's overrides removed.
 *
 * User-saved presets survive: a global reset means "put the interface back", not "throw away
 * the themes I built". Deleting somebody's saved work as a side effect of a reset button is
 * the kind of thing that gets a feature switched off permanently.
 */
export function withGlobalReset(state: AppearanceState): AppearanceState {
    return { ...state, elements: {}, activePreset: "" };
}

/** The state with a user preset saved or replaced. Built-ins cannot be overwritten. */
export function withPreset(
    state: AppearanceState,
    id: string,
    name: string,
    record: AppearanceRecord,
): AppearanceState {
    if (BUILT_IN_PRESETS.some((entry) => entry.id === id)) return state;

    const presets = state.presets.filter((entry) => entry.id !== id);
    presets.push({ id, name, builtIn: false, record });
    return { ...state, presets };
}

/** The state without a user preset. A built-in is left alone, and so is the active choice. */
export function withoutPreset(state: AppearanceState, id: string): AppearanceState {
    if (BUILT_IN_PRESETS.some((entry) => entry.id === id)) return state;
    return {
        ...state,
        presets: state.presets.filter((entry) => entry.id !== id),
        activePreset: state.activePreset === id ? "" : state.activePreset,
    };
}

/* -------------------------------------------------------------------------- */
/* Reading a record that came from somewhere else                             */
/* -------------------------------------------------------------------------- */

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a stored value can stand in for a default of the same name.
 *
 * A shallow type match rather than a schema. It is enough to keep a string out of a numeric
 * stepper and an object out of a colour field, which are the failures that actually break the
 * editor, and it does not need updating every time a property gains a value. Anything it
 * turns away is preserved rather than dropped, so being slightly conservative costs the user
 * nothing.
 */
function typeMatches(value: unknown, reference: unknown): boolean {
    if (isObject(reference)) return isObject(value);
    return typeof value === typeof reference && typeof value !== "object";
}

interface Sanitised {
    record: AppearanceRecord;
    /** Dotted paths that were kept verbatim rather than used, for the import report. */
    preservedKeys: string[];
}

function sanitiseRecord(raw: unknown, path: string): Sanitised {
    const record = emptyRecord();
    const preservedKeys: string[] = [];
    if (!isObject(raw)) return { record, preservedKeys };

    const typography = isObject(raw.typography) ? raw.typography : {};
    for (const [key, value] of Object.entries(typography)) {
        const id = key as keyof TypographySpec;
        if (TYPOGRAPHY_PROPERTIES.includes(id) && typeMatches(value, DEFAULT_TYPOGRAPHY[id])) {
            // The cast is the one place this module has to trust its own check: the shape
            // test above is what stands between a stored blob and the typed record, and
            // expressing it in the type system would need a schema per property.
            (record.typography as Record<string, unknown>)[key] = value;
        } else {
            record.preserved[`typography.${key}`] = value;
            preservedKeys.push(`${path}typography.${key}`);
        }
    }

    const surface = isObject(raw.surface) ? raw.surface : {};
    for (const [key, value] of Object.entries(surface)) {
        const id = key as keyof SurfaceSpec;
        if (SURFACE_PROPERTIES.includes(id) && typeMatches(value, DEFAULT_SURFACE[id])) {
            (record.surface as Record<string, unknown>)[key] = value;
        } else {
            record.preserved[`surface.${key}`] = value;
            preservedKeys.push(`${path}surface.${key}`);
        }
    }

    if (typeof raw.inherit === "string") record.inherit = raw.inherit;

    if (isObject(raw.preserved)) {
        for (const [key, value] of Object.entries(raw.preserved)) {
            record.preserved[key] = value;
            preservedKeys.push(`${path}${key}`);
        }
    }

    for (const [key, value] of Object.entries(raw)) {
        if (key === "typography" || key === "surface" || key === "inherit" || key === "preserved") {
            continue;
        }
        record.preserved[key] = value;
        preservedKeys.push(`${path}${key}`);
    }

    return { record, preservedKeys };
}

function sanitisePresets(raw: unknown): AppearancePreset[] {
    const presets = emptyState().presets;
    if (!Array.isArray(raw)) return presets;

    for (const entry of raw) {
        if (!isObject(entry)) continue;
        const id = typeof entry.id === "string" ? entry.id : "";
        const name = typeof entry.name === "string" ? entry.name : id;
        if (id === "" || BUILT_IN_PRESETS.some((builtIn) => builtIn.id === id)) continue;
        presets.push({
            id,
            name,
            builtIn: false,
            record: sanitiseRecord(entry.record, `preset(${id}).`).record,
        });
    }
    return presets;
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

/** Narrowed to the two methods used, so a test can pass a plain object. */
export interface AppearanceStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): AppearanceStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

export function readAppearanceState(
    storage: AppearanceStorage | null = defaultStorage(),
): AppearanceState {
    if (storage === null) return emptyState();
    try {
        const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
        if (raw === null) return emptyState();
        const result = importState(JSON.parse(raw));
        return result.ok ? result.state : emptyState();
    } catch {
        return emptyState();
    }
}

export function writeAppearanceState(
    state: AppearanceState,
    storage: AppearanceStorage | null = defaultStorage(),
): void {
    // Fire-and-forget mirror into the main process's own settings history. Called even when
    // there is no local `storage` at all: it is a wholly separate channel to the main
    // process, not a fallback for a blocked `localStorage` - see `appSettingsHistorySync.ts`'s
    // own doc comment for the whole rule.
    recordAppSetting("appearance", state);
    if (storage === null) return;
    try {
        storage.setItem(APPEARANCE_STORAGE_KEY, exportTheme(state));
    } catch {
        // Private mode or a full quota. A remembered theme is not worth a toast.
    }
}

/* -------------------------------------------------------------------------- */
/* Export and import                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The theme as a file.
 *
 * Built-in presets are not written out: they are part of the build, they exist in whatever
 * version imports the file, and shipping copies of them would mean an old export could
 * silently restore an old definition of "High contrast" over a newer one. Everything else —
 * every element, every user preset, and every unknown key from a future build — is written.
 */
export function exportTheme(state: AppearanceState): string {
    return JSON.stringify(
        {
            format: APPEARANCE_FORMAT,
            version: APPEARANCE_VERSION,
            activePreset: state.activePreset,
            elements: state.elements,
            presets: state.presets.filter((entry) => !entry.builtIn),
        },
        null,
        2,
    );
}

export type ImportError = "not-json" | "not-a-theme";

export interface ImportReport {
    elements: number;
    presets: number;
    /**
     * Every path that was kept verbatim instead of used.
     *
     * The editor shows this rather than swallowing it, because "your theme imported, and
     * these four settings came from a newer version so they are stored but not applied" is a
     * true and useful sentence, and silence in its place is how a user concludes the import
     * was lossless when it was not.
     */
    preservedKeys: string[];
}

export type ImportResult =
    | { ok: true; state: AppearanceState; report: ImportReport }
    | { ok: false; error: ImportError };

/** The import half, over already-parsed JSON, so storage and files share one implementation. */
export function importState(raw: unknown): ImportResult {
    if (!isObject(raw)) return { ok: false, error: "not-a-theme" };
    if (raw.format !== APPEARANCE_FORMAT) return { ok: false, error: "not-a-theme" };

    const state = emptyState();
    const preservedKeys: string[] = [];

    if (isObject(raw.elements)) {
        for (const [id, value] of Object.entries(raw.elements)) {
            const sanitised = sanitiseRecord(value, `${id}.`);
            preservedKeys.push(...sanitised.preservedKeys);
            state.elements[id] = sanitised.record;
        }
    }

    state.presets = sanitisePresets(raw.presets);
    if (typeof raw.activePreset === "string") state.activePreset = raw.activePreset;

    return {
        ok: true,
        state,
        report: {
            elements: Object.keys(state.elements).length,
            presets: state.presets.filter((entry) => !entry.builtIn).length,
            preservedKeys,
        },
    };
}

/**
 * A theme file, read.
 *
 * A parse failure and a well-formed file that is not a theme are different errors, because
 * they call for different sentences: one is a corrupt or truncated file, the other is the
 * user having picked the wrong file. Collapsing them into "could not import" leaves somebody
 * checking their disk for a problem that is a mis-click.
 */
export function importTheme(text: string): ImportResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, error: "not-json" };
    }
    return importState(parsed);
}

/** The i18n key for an import failure, so the caller renders it without a switch. */
export function importErrorKey(error: ImportError): string {
    return `appearance.import.error.${error}`;
}
