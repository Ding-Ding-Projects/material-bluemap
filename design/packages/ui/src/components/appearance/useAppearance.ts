/**
 * The live appearance state, and how a component binds itself to a piece of it.
 *
 * One module-level state rather than a provide/inject tree, for the same reason the
 * notification centre and the palette keep theirs: an element deep in a dialog inside a menu
 * has to see the same appearance as the tab that opened it, and threading a provider through
 * every intermediate component means the one place somebody forgets is the one place the
 * theme stops applying. It is a plain `ref` over a plain immutable value, so every write goes
 * through the pure functions in `appearanceStore` and can be reasoned about there.
 *
 * ## Registration is a fact, not a claim
 *
 * A component that can be restyled calls {@link registerAppearanceTarget} when it mounts and
 * drops out again when it unmounts, so the editor's element list is a list of elements that
 * exist right now. The alternative - a hard-coded inventory of every tab, menu and toolbar
 * the app is supposed to have - is a list of claims, and the first entry to go stale is
 * indistinguishable from a bug in the editor. The editor's own chrome is the exception and is
 * listed statically, because it exists for exactly as long as the editor does.
 *
 * ## Capabilities are probed once, and absence means yes
 *
 * `CSS.supports` does not exist under jsdom and need not exist in every embedder. The
 * capability probe treats a missing `CSS` as "assume everything works" rather than as
 * "nothing works", because a false negative here would hide a control the platform can
 * perfectly well render, and hiding controls is precisely what the contract forbids.
 */

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, type ComputedRef, type Ref } from "vue";

import {
    appearanceStyle,
    emptyRecord,
    resetSurface,
    resetTypography,
    type AppearanceRecord,
    type AppearanceStyle,
    type SurfacePropertyId,
    type SurfaceSpec,
} from "./appearanceRecord.js";
import {
    EDITOR_CHROME_TARGETS,
    readAppearanceState,
    recordFor,
    resolveTarget,
    withElementReset,
    withGlobalReset,
    withRecord,
    writeAppearanceState,
    type AppearanceState,
    type AppearanceTargetInfo,
} from "./appearanceStore.js";
import { BUNDLED_FONTS, queryInstalledFonts, type FontFamily } from "./fontCatalog.js";
import {
    detectTypographyCapabilities,
    type TypographyCapabilities,
    type TypographyPropertyId,
    type TypographySpec,
} from "./typographySpec.js";

/* -------------------------------------------------------------------------- */
/* The state                                                                  */
/* -------------------------------------------------------------------------- */

const state = ref<AppearanceState>(readAppearanceState());

/** The whole appearance state, read-only to callers that only want to render it. */
export function appearanceState(): Ref<AppearanceState> {
    return state;
}

/**
 * Replaces the state and persists it.
 *
 * Every mutation in this feature funnels through here, so there is exactly one place that
 * writes to storage and exactly one thing to look at when a change fails to survive a
 * restart.
 */
export function commitAppearance(next: AppearanceState): void {
    state.value = next;
    writeAppearanceState(next);
}

/** Reloads from storage, which is what a test needs between cases. */
export function reloadAppearance(): void {
    state.value = readAppearanceState();
}

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

const registered = ref<AppearanceTargetInfo[]>([]);

export function registerAppearanceTarget(info: AppearanceTargetInfo): void {
    if (registered.value.some((entry) => entry.id === info.id)) return;
    registered.value = [...registered.value, info];
}

export function unregisterAppearanceTarget(id: string): void {
    registered.value = registered.value.filter((entry) => entry.id !== id);
}

/**
 * Every element the editor can be pointed at right now.
 *
 * The editor's own chrome first, because those entries are always present and a list whose
 * first rows move around as the user navigates is a list nobody can build muscle memory for.
 */
export function appearanceTargets(): ComputedRef<AppearanceTargetInfo[]> {
    return computed(() => [...EDITOR_CHROME_TARGETS, ...registered.value]);
}

/* -------------------------------------------------------------------------- */
/* Capabilities and fonts                                                     */
/* -------------------------------------------------------------------------- */

/** The engine's own answer about what it will render, probed once for the whole app. */
export const typographyCapabilities: TypographyCapabilities = detectTypographyCapabilities(
    typeof globalThis.CSS?.supports === "function"
        ? { supports: (property, value) => globalThis.CSS.supports(property, value) }
        : null,
);

const fonts = shallowRef<readonly FontFamily[]>(BUNDLED_FONTS);
let fontsRequested = false;

/**
 * The font catalogue, filled in from the platform the first time anybody asks.
 *
 * Deliberately lazy and deliberately silent about failure. `queryLocalFonts()` shows a
 * permission prompt, so asking for it at startup would greet a user who has never opened the
 * appearance editor with a dialog about fonts; and a denied prompt is a choice rather than an
 * error, so the answer is the bundled list and no notification.
 */
export function fontCatalog(): Ref<readonly FontFamily[]> {
    if (!fontsRequested) {
        fontsRequested = true;
        void queryInstalledFonts().then((found) => {
            fonts.value = found;
        });
    }
    return fonts;
}

/* -------------------------------------------------------------------------- */
/* Binding one element                                                        */
/* -------------------------------------------------------------------------- */

/** Everything a component needs to render itself and to be edited. */
export interface AppearanceTargetBinding {
    id: ComputedRef<string>;
    /** This element's own overrides, without anything it inherits. */
    record: ComputedRef<AppearanceRecord>;
    /** The style object to bind, plus what the platform could not do. */
    style: ComputedRef<AppearanceStyle>;
    /** True when this element has overrides of its own that a reset would remove. */
    customised: ComputedRef<boolean>;
    setTypography: <K extends TypographyPropertyId>(id: K, value: TypographySpec[K]) => void;
    setSurface: <K extends SurfacePropertyId>(id: K, value: SurfaceSpec[K]) => void;
    resetTypographyProperty: (id: TypographyPropertyId) => void;
    resetSurfaceProperty: (id: SurfacePropertyId) => void;
    setInherit: (presetId: string) => void;
    resetElement: () => void;
    resetEverything: () => void;
}

/**
 * Binds a component to one element's appearance.
 *
 * The id is a getter rather than a string so a component whose identity changes - a tab that
 * is reordered, a row that is recycled by a virtual list - keeps following the right record
 * instead of the one it happened to mount with. That is the contract's "loses its anchor when
 * tabs reorder" failure, prevented at the source rather than patched at the editor.
 */
export function useAppearanceTarget(id: string | (() => string)): AppearanceTargetBinding {
    const targetId = computed(() => (typeof id === "function" ? id() : id));

    const record = computed(() => recordFor(state.value, targetId.value));

    const style = computed(() =>
        appearanceStyle(
            resolveTarget(state.value, targetId.value),
            typographyCapabilities,
            fonts.value,
        ),
    );

    function update(next: AppearanceRecord): void {
        commitAppearance(withRecord(state.value, targetId.value, next));
    }

    return {
        id: targetId,
        record,
        style,
        customised: computed(() => state.value.elements[targetId.value] !== undefined),

        setTypography(property, value) {
            update({
                ...record.value,
                typography: { ...record.value.typography, [property]: value },
            });
        },

        setSurface(property, value) {
            update({ ...record.value, surface: { ...record.value.surface, [property]: value } });
        },

        resetTypographyProperty(property) {
            update(resetTypography(record.value, property));
        },

        resetSurfaceProperty(property) {
            update(resetSurface(record.value, property));
        },

        setInherit(presetId) {
            update({ ...record.value, inherit: presetId });
        },

        resetElement() {
            commitAppearance(withElementReset(state.value, targetId.value));
        },

        resetEverything() {
            commitAppearance(withGlobalReset(state.value));
        },
    };
}

/**
 * Registers an element for as long as the calling component is mounted.
 *
 * Paired deliberately: an entry that outlived its component would put a row in the editor's
 * element list that opens an editor for something nobody can see.
 */
export function useRegisteredTarget(info: AppearanceTargetInfo): void {
    onMounted(() => registerAppearanceTarget(info));
    onBeforeUnmount(() => unregisterAppearanceTarget(info.id));
}

/** An empty record, re-exported so a component does not reach past this module for one. */
export { emptyRecord };
