import { describe, expect, it } from "vitest";
import { createDownloadConcurrencySetting } from "./downloadConcurrencySetting.js";
import type { DownloadConcurrencyReadout, DownloadConcurrencyWriteResult, SettingsBridge } from "./settingsBridge.js";

/** The bridge's own readout is `readonly` for every real caller; this fake is the one place allowed to mutate it. */
type MutableReadout = { -readonly [Key in keyof DownloadConcurrencyReadout]: DownloadConcurrencyReadout[Key] };

/**
 * A fake `files:downloadConcurrency` / `files:setDownloadConcurrency` pair that actually
 * keeps state, the way the real `DownloadConcurrencyStore` does - so a test that saves and
 * then reads again proves the round trip, not just that a promise resolved.
 */
function fakeBridge(
    initial: Partial<DownloadConcurrencyReadout> = {},
): SettingsBridge & { readonly written: number[] } {
    const state: MutableReadout = {
        workers: 4,
        isDefault: true,
        defaultWorkers: 4,
        minimumWorkers: 1,
        maximumWorkers: 16,
        explanation: "Up to 4 parts of a split download are fetched at once.",
        ...initial,
    };
    const written: number[] = [];

    return {
        written,
        downloadConcurrency: () => Promise.resolve({ ...state }),
        setDownloadConcurrency: (workers): Promise<DownloadConcurrencyWriteResult> => {
            written.push(workers);
            if (!Number.isInteger(workers) || workers < state.minimumWorkers) {
                return Promise.resolve({
                    ok: false,
                    reason: `At least ${String(state.minimumWorkers)} part has to be fetched at a time.`,
                });
            }
            if (workers > state.maximumWorkers) {
                return Promise.resolve({
                    ok: false,
                    reason: `That is more than the ${String(state.maximumWorkers)} this setting allows.`,
                });
            }
            state.workers = workers;
            state.isDefault = workers === state.defaultWorkers;
            state.explanation = `Up to ${String(workers)} parts of a split download are fetched at once.`;
            return Promise.resolve({ ok: true, setting: { ...state } });
        },
    };
}

describe("no bridge at all", () => {
    it("reports unsupported rather than a value nobody measured", async () => {
        const setting = createDownloadConcurrencySetting({ bridge: null });
        expect(setting.supported).toBe(false);
        expect(setting.canApply).toBe(false);
        expect(setting.state.value).toBe("unsupported");

        await setting.load();
        expect(setting.state.value).toBe("unsupported");
        expect(setting.readout.value).toBeNull();
    });
});

describe("loading", () => {
    it("shows the stored setting, with the default preselected on a fresh install", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("loaded");
        expect(setting.workers.value).toBe("4");
        expect(setting.isDefault.value).toBe(true);
        expect(setting.dirty.value).toBe(false);
    });

    it("reports the exception from a bridge call that throws, rather than swallowing it", async () => {
        const bridge: SettingsBridge = {
            downloadConcurrency: () => Promise.reject(new Error("no ipc")),
        };
        const setting = createDownloadConcurrencySetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("failed");
        expect(setting.failure.value).toContain("no ipc");
    });
});

describe("changing the worker count", () => {
    it("refuses to save an empty field, without ever calling the bridge", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "";

        expect(setting.problem.value).not.toBeNull();
        expect(await setting.save()).toBe(false);
        expect(bridge.written).toHaveLength(0);
    });

    it("refuses a value below the minimum, and says so before the round trip", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "0";

        expect(setting.problem.value).toContain("1 part");
        expect(await setting.save()).toBe(false);
        expect(bridge.written).toHaveLength(0);
    });

    it("refuses a value above the maximum, and says so before the round trip", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "99";

        expect(setting.problem.value).toContain("16");
        expect(await setting.save()).toBe(false);
        expect(bridge.written).toHaveLength(0);
    });

    it("saves a valid value, and the exact payload reaches the bridge", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "8";

        expect(setting.problem.value).toBeNull();
        expect(await setting.save()).toBe(true);

        expect(bridge.written).toEqual([8]);
        expect(setting.savedJustNow.value).toBe(true);
        expect(setting.dirty.value).toBe(false);
        expect(setting.isDefault.value).toBe(false);
        // The readout came back from the fake store, proving this is a round trip and not
        // an optimistic local update.
        expect(setting.readout.value?.workers).toBe(8);
    });

    it("surfaces a refusal from the main process rather than pretending the save worked", async () => {
        const bridge = fakeBridge();
        bridge.setDownloadConcurrency = () =>
            Promise.resolve({ ok: false, reason: "The setting could not be written: disk is read-only." });
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "8";
        expect(setting.problem.value).toBeNull();

        expect(await setting.save()).toBe(false);
        expect(setting.failure.value).toContain("read-only");
        // Nothing was recorded as the current setting: a refused write must not be shown
        // as though it landed.
        expect(setting.readout.value?.workers).toBe(4);
    });

    it("clears the 'Saved' state the moment the field is edited again", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "8";
        await setting.save();
        expect(setting.savedJustNow.value).toBe(true);

        setting.workers.value = "9";
        expect(setting.savedJustNow.value).toBe(false);
    });
});

describe("reset", () => {
    it("puts the field back to the shipped default and saves immediately", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        setting.workers.value = "8";
        await setting.save();
        expect(setting.isDefault.value).toBe(false);

        expect(await setting.reset()).toBe(true);

        expect(setting.workers.value).toBe("4");
        expect(setting.isDefault.value).toBe(true);
        expect(bridge.written.at(-1)).toBe(4);
    });
});

describe("persistence across a fresh load, the way a restart would see it", () => {
    it("a value saved by one instance is read back by a new one sharing the same store", async () => {
        const bridge = fakeBridge();

        const first = createDownloadConcurrencySetting({ bridge });
        await first.load();
        first.workers.value = "12";
        expect(await first.save()).toBe(true);

        // A second instance, standing in for the settings surface being reopened after a
        // restart, reading through the very same bridge rather than the first instance's
        // in-memory state.
        const second = createDownloadConcurrencySetting({ bridge });
        await second.load();

        expect(second.workers.value).toBe("12");
        expect(second.isDefault.value).toBe(false);
    });
});

describe("a build that can read the setting but not change it", () => {
    it("reports canApply as false, and a write is refused with a plain explanation", async () => {
        const bridge: SettingsBridge = {
            downloadConcurrency: () =>
                Promise.resolve({
                    workers: 4,
                    isDefault: true,
                    defaultWorkers: 4,
                    minimumWorkers: 1,
                    maximumWorkers: 16,
                    explanation: "Up to 4 parts of a split download are fetched at once.",
                }),
        };
        const setting = createDownloadConcurrencySetting({ bridge });
        expect(setting.canApply).toBe(false);

        await setting.load();
        expect(setting.state.value).toBe("loaded");

        setting.workers.value = "8";
        expect(await setting.save()).toBe(false);
        expect(setting.failure.value).toContain("cannot change");
    });
});
