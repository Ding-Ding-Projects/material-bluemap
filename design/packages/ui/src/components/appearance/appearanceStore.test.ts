/**
 * Persistence, presets, and the round trip a theme file has to survive.
 *
 * The assertions that matter most here are the ones about a theme from a build that does not
 * exist yet. It is easy to write an importer that reads the keys it knows and returns; the
 * consequence only shows up months later, when somebody opens their theme in an older
 * version, changes a font size, saves, and finds that everything the newer version added has
 * quietly gone. So the tests below deliberately import a file with keys this build has never
 * heard of, and with a value of the wrong type, and check both that the editor refuses to use
 * them and that exporting writes them straight back out.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { emptyRecord, type AppearanceRecord } from "./appearanceRecord.js";
import {
    APPEARANCE_FORMAT,
    APPEARANCE_STORAGE_KEY,
    BUILT_IN_PRESETS,
    effectiveRecord,
    emptyState,
    exportTheme,
    GLOBAL_TARGET,
    importTheme,
    readAppearanceState,
    recordFor,
    resolveTarget,
    withElementReset,
    withGlobalReset,
    withoutPreset,
    withPreset,
    withRecord,
    writeAppearanceState,
    type AppearanceStorage,
} from "./appearanceStore.js";
import { DEFAULT_TYPOGRAPHY } from "./typographySpec.js";

function record(partial: Partial<AppearanceRecord>): AppearanceRecord {
    return { ...emptyRecord(), ...partial };
}

/** An in-memory storage, so nothing here depends on a browser or on a real profile. */
function memoryStorage(seed: string | null = null): AppearanceStorage & { value: string | null } {
    return {
        value: seed,
        getItem(): string | null {
            return this.value;
        },
        setItem(_key: string, next: string): void {
            this.value = next;
        },
    };
}

describe("a fresh state", () => {
    it("ships the built-in presets and no overrides", () => {
        const state = emptyState();
        expect(state.elements).toEqual({});
        expect(state.presets.map((entry) => entry.id)).toEqual(
            BUILT_IN_PRESETS.map((entry) => entry.id),
        );
        expect(state.presets.every((entry) => entry.builtIn)).toBe(true);
    });

    it("resolves any element to the app's defaults", () => {
        expect(resolveTarget(emptyState(), "anything.at.all").typography).toEqual(
            DEFAULT_TYPOGRAPHY,
        );
    });
});

describe("per-element records", () => {
    it("stores an override and resolves it", () => {
        const state = withRecord(emptyState(), "app.tab", record({ typography: { fontSize: 20 } }));
        expect(resolveTarget(state, "app.tab").typography.fontSize).toBe(20);
        expect(resolveTarget(state, "app.other").typography.fontSize).toBe(
            DEFAULT_TYPOGRAPHY.fontSize,
        );
    });

    it("forgets an element whose record has become empty", () => {
        // "Reset everything on this element" and "never touched" must be the same state, or
        // an export accumulates a list of elements that say nothing and the editor cannot
        // truthfully report which elements are customised.
        const state = withRecord(emptyState(), "app.tab", record({ typography: { bold: true } }));
        expect(Object.keys(state.elements)).toEqual(["app.tab"]);

        expect(Object.keys(withElementReset(state, "app.tab").elements)).toEqual([]);
        expect(Object.keys(withRecord(state, "app.tab", emptyRecord()).elements)).toEqual([]);
    });

    it("does not mutate the state it was handed", () => {
        const before = emptyState();
        withRecord(before, "app.tab", record({ typography: { bold: true } }));
        expect(before.elements).toEqual({});
    });
});

describe("inheritance", () => {
    it("applies the global record to every element except the global one", () => {
        const state = withRecord(
            emptyState(),
            GLOBAL_TARGET,
            record({ typography: { fontSize: 16 } }),
        );

        expect(resolveTarget(state, "app.tab").typography.fontSize).toBe(16);
        expect(resolveTarget(state, GLOBAL_TARGET).typography.fontSize).toBe(16);
    });

    it("lets an element override the global record", () => {
        let state = withRecord(emptyState(), GLOBAL_TARGET, record({ typography: { fontSize: 16 } }));
        state = withRecord(state, "app.tab", record({ typography: { fontSize: 24 } }));

        expect(resolveTarget(state, "app.tab").typography.fontSize).toBe(24);
        expect(resolveTarget(state, "app.other").typography.fontSize).toBe(16);
    });

    it("lets one element follow a preset without changing anything else", () => {
        const state = withRecord(
            emptyState(),
            "app.tab",
            record({ inherit: "builtin.largeText" }),
        );

        expect(resolveTarget(state, "app.tab").typography.fontSize).toBe(18);
        expect(resolveTarget(state, "app.other").typography.fontSize).toBe(
            DEFAULT_TYPOGRAPHY.fontSize,
        );
    });

    it("applies an active preset underneath both the global and the element records", () => {
        let state = { ...emptyState(), activePreset: "builtin.largeText" };
        state = withRecord(state, "app.tab", record({ typography: { fontSize: 30 } }));

        expect(resolveTarget(state, "app.other").typography.fontSize).toBe(18);
        expect(resolveTarget(state, "app.tab").typography.fontSize).toBe(30);
        // The merged record is what an editor showing inheritance renders, so it has to
        // agree with what is actually painted.
        expect(effectiveRecord(state, "app.other").typography.fontSize).toBe(18);
    });

    it("ignores a preset id that no longer exists rather than failing to resolve", () => {
        const state = withRecord(emptyState(), "app.tab", record({ inherit: "deleted.preset" }));
        expect(resolveTarget(state, "app.tab").typography).toEqual(DEFAULT_TYPOGRAPHY);
    });
});

describe("presets", () => {
    it("saves and removes a user preset", () => {
        let state = withPreset(emptyState(), "mine", "Mine", record({ typography: { bold: true } }));
        expect(state.presets.find((entry) => entry.id === "mine")?.builtIn).toBe(false);

        state = withoutPreset(state, "mine");
        expect(state.presets.some((entry) => entry.id === "mine")).toBe(false);
    });

    it("refuses to overwrite or delete a built-in", () => {
        const state = emptyState();
        const overwritten = withPreset(state, "builtin.largeText", "Hijacked", emptyRecord());
        expect(overwritten.presets.find((entry) => entry.id === "builtin.largeText")?.name).toBe(
            "Large text",
        );
        expect(withoutPreset(state, "builtin.largeText").presets).toHaveLength(
            state.presets.length,
        );
    });

    it("stops following a preset it has just deleted", () => {
        let state = withPreset(emptyState(), "mine", "Mine", record({ typography: { bold: true } }));
        state = { ...state, activePreset: "mine" };
        expect(withoutPreset(state, "mine").activePreset).toBe("");
    });

    it("keeps user presets through a global reset", () => {
        // A reset means "put the interface back", not "throw away the themes I built".
        let state = withPreset(emptyState(), "mine", "Mine", record({ typography: { bold: true } }));
        state = withRecord(state, "app.tab", record({ typography: { fontSize: 20 } }));

        const reset = withGlobalReset(state);
        expect(reset.elements).toEqual({});
        expect(reset.presets.some((entry) => entry.id === "mine")).toBe(true);
    });
});

describe("export and import", () => {
    it("round-trips elements, user presets and the active choice", () => {
        let state = withRecord(emptyState(), "app.tab", record({ typography: { fontSize: 20 } }));
        state = withPreset(state, "mine", "Mine", record({ surface: { borderRadius: 12 } }));
        state = { ...state, activePreset: "mine" };

        const result = importTheme(exportTheme(state));
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.state.elements["app.tab"]?.typography.fontSize).toBe(20);
        expect(result.state.presets.find((entry) => entry.id === "mine")?.record.surface).toEqual({
            borderRadius: 12,
        });
        expect(result.state.activePreset).toBe("mine");
        expect(result.report.elements).toBe(1);
        expect(result.report.presets).toBe(1);
        expect(result.report.preservedKeys).toEqual([]);
    });

    it("does not write the built-in presets into the file", () => {
        // Shipping copies of them would let an old export silently restore an old definition
        // of "High contrast" over whatever a newer build means by it.
        const written: unknown = JSON.parse(exportTheme(emptyState()));
        expect(written).toMatchObject({ format: APPEARANCE_FORMAT, presets: [] });
    });

    it("keeps a section from a newer build instead of deleting it", () => {
        const fromTheFuture = JSON.stringify({
            format: APPEARANCE_FORMAT,
            version: 99,
            elements: {
                "app.tab": {
                    typography: { fontSize: 20 },
                    animation: { bounce: true },
                },
            },
        });

        const result = importTheme(fromTheFuture);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.state.elements["app.tab"]?.typography.fontSize).toBe(20);
        expect(result.state.elements["app.tab"]?.preserved).toEqual({ animation: { bounce: true } });
        expect(result.report.preservedKeys).toEqual(["app.tab.animation"]);

        // And it comes back out again, so a round trip through this build loses nothing.
        expect(exportTheme(result.state)).toContain("bounce");
    });

    it("keeps a value of the wrong type rather than dropping it, and names it", () => {
        const wrong = JSON.stringify({
            format: APPEARANCE_FORMAT,
            elements: { "app.tab": { typography: { fontSize: "large", bold: true } } },
        });

        const result = importTheme(wrong);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const stored = result.state.elements["app.tab"];
        expect(stored?.typography).toEqual({ bold: true });
        expect(stored?.preserved).toEqual({ "typography.fontSize": "large" });
        expect(result.report.preservedKeys).toEqual(["app.tab.typography.fontSize"]);
    });

    it("tells a corrupt file apart from the wrong file", () => {
        // Different sentences: one is a truncated download, the other is a mis-click. Merging
        // them leaves somebody checking their disk for a problem that is neither.
        expect(importTheme("{ not json")).toEqual({ ok: false, error: "not-json" });
        expect(importTheme('{"format":"something-else"}')).toEqual({
            ok: false,
            error: "not-a-theme",
        });
        expect(importTheme("[]")).toEqual({ ok: false, error: "not-a-theme" });
    });

    it("refuses a preset that would shadow a built-in id", () => {
        const hostile = JSON.stringify({
            format: APPEARANCE_FORMAT,
            presets: [{ id: "builtin.largeText", name: "Not really", record: {} }],
        });

        const result = importTheme(hostile);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.presets.filter((entry) => entry.id === "builtin.largeText")).toHaveLength(
            1,
        );
        expect(result.state.presets.find((entry) => entry.id === "builtin.largeText")?.name).toBe(
            "Large text",
        );
    });
});

describe("storage", () => {
    it("writes what it can read back", () => {
        const storage = memoryStorage();
        const state = withRecord(emptyState(), "app.tab", record({ typography: { fontSize: 20 } }));

        writeAppearanceState(state, storage);
        expect(readAppearanceState(storage).elements["app.tab"]?.typography.fontSize).toBe(20);
    });

    it("falls back to defaults for junk on disk rather than throwing at startup", () => {
        expect(readAppearanceState(memoryStorage("not json at all")).elements).toEqual({});
        expect(readAppearanceState(memoryStorage("{}")).elements).toEqual({});
        expect(readAppearanceState(memoryStorage(null)).elements).toEqual({});
        expect(readAppearanceState(null).elements).toEqual({});
    });

    it("says nothing when storage refuses the write", () => {
        const refusing: AppearanceStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        };
        expect(() => writeAppearanceState(emptyState(), refusing)).not.toThrow();
    });

    it("uses its own namespaced key", () => {
        const seen: string[] = [];
        writeAppearanceState(emptyState(), {
            getItem: () => null,
            setItem: (key) => void seen.push(key),
        });
        expect(seen).toEqual([APPEARANCE_STORAGE_KEY]);
    });
});

describe("mirroring into the application-settings history", () => {
    beforeEach(() => {
        vi.mocked(recordAppSetting).mockClear();
    });

    it("mirrors the state itself, structured, under the appearance key", () => {
        const state = withRecord(emptyState(), "app.tab", record({ typography: { fontSize: 20 } }));
        writeAppearanceState(state, memoryStorage());
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("appearance", state);
    });

    it("still mirrors when storage itself refuses the write", () => {
        const refusing: AppearanceStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
        };
        writeAppearanceState(emptyState(), refusing);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("appearance", emptyState());
    });

    it("still mirrors when there is no local storage to write to at all", () => {
        writeAppearanceState(emptyState(), null);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("appearance", emptyState());
    });
});

describe("recordFor", () => {
    it("answers with an empty record for an element nobody has touched", () => {
        expect(recordFor(emptyState(), "never.seen")).toEqual(emptyRecord());
    });
});
