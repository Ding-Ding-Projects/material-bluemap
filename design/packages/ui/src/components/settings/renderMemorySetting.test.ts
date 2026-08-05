import { describe, expect, it } from "vitest";
import { createRenderMemorySetting } from "./renderMemorySetting.js";
import type {
    RenderMemoryReadout,
    RenderMemoryWriteRequest,
    RenderMemoryWriteResult,
    SettingsBridge,
} from "./settingsBridge.js";

/**
 * A fake `files:renderMemory` / `files:setRenderMemory` pair that actually keeps state,
 * the way the real `RenderMemoryStore` does — so a test that saves and then reads again
 * proves the round trip, not just that a promise resolved.
 */
function fakeBridge(
    initial: Partial<RenderMemoryReadout> = {},
): SettingsBridge & { readonly written: RenderMemoryWriteRequest[] } {
    const state: RenderMemoryReadout = {
        mode: "automatic",
        megabytes: 4096,
        recommendedMegabytes: 4096,
        machineMegabytes: 16384,
        minimumMegabytes: 1024,
        automaticCeilingMegabytes: 8192,
        explanation: "Chosen automatically: the render may use up to 4096 MB (4.0 GB).",
        jvmArgs: ["-Xmx4096m"],
        ...initial,
    };
    const written: RenderMemoryWriteRequest[] = [];

    return {
        written,
        renderMemory: () => Promise.resolve({ ...state }),
        setRenderMemory: (setting): Promise<RenderMemoryWriteResult> => {
            written.push(setting);
            if (setting.mode === "automatic") {
                state.mode = "automatic";
                state.megabytes = state.recommendedMegabytes;
            } else {
                if (setting.megabytes < state.minimumMegabytes) {
                    return Promise.resolve({
                        ok: false,
                        reason: `${String(setting.megabytes)} MB is below the ${String(state.minimumMegabytes)} MB minimum.`,
                    });
                }
                if (setting.megabytes > state.machineMegabytes) {
                    return Promise.resolve({
                        ok: false,
                        reason: "That is more memory than this machine has.",
                    });
                }
                state.mode = "manual";
                state.megabytes = setting.megabytes;
            }
            state.explanation =
                state.mode === "automatic"
                    ? `Chosen automatically: the render may use up to ${String(state.megabytes)} MB.`
                    : `Set by you: the render may use up to ${String(state.megabytes)} MB.`;
            state.jvmArgs = [`-Xmx${String(state.megabytes)}m`];
            return Promise.resolve({ ok: true, setting: { ...state } });
        },
    };
}

describe("no bridge at all", () => {
    it("reports unsupported rather than a value nobody measured", async () => {
        const setting = createRenderMemorySetting({ bridge: null });
        expect(setting.supported).toBe(false);
        expect(setting.canApply).toBe(false);
        expect(setting.state.value).toBe("unsupported");

        await setting.load();
        expect(setting.state.value).toBe("unsupported");
        expect(setting.readout.value).toBeNull();
    });
});

describe("loading", () => {
    it("shows the stored setting, with automatic preselected on a fresh install", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("loaded");
        expect(setting.mode.value).toBe("automatic");
        expect(setting.megabytes.value).toBe("4096");
        expect(setting.isDefault.value).toBe(true);
        expect(setting.dirty.value).toBe(false);
    });

    it("reports the exception from a bridge call that throws, rather than swallowing it", async () => {
        const bridge: SettingsBridge = {
            renderMemory: () => Promise.reject(new Error("no ipc")),
        };
        const setting = createRenderMemorySetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("failed");
        expect(setting.failure.value).toContain("no ipc");
    });
});

describe("switching to Manual", () => {
    it("refuses to save an empty field, without ever calling the bridge", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        setting.mode.value = "manual";
        setting.megabytes.value = "";

        expect(setting.problem.value).not.toBeNull();
        expect(await setting.save()).toBe(false);
        expect(bridge.written).toHaveLength(0);
    });

    it("refuses a value below the minimum, and says so before the round trip", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        setting.mode.value = "manual";
        setting.megabytes.value = "512";

        expect(setting.problem.value).toContain("1024");
        expect(await setting.save()).toBe(false);
        expect(bridge.written).toHaveLength(0);
    });

    it("saves a valid manual value, and the exact payload reaches the bridge", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        setting.mode.value = "manual";
        setting.megabytes.value = "3072";

        expect(setting.problem.value).toBeNull();
        expect(await setting.save()).toBe(true);

        expect(bridge.written).toEqual([{ mode: "manual", megabytes: 3072 }]);
        expect(setting.savedJustNow.value).toBe(true);
        expect(setting.dirty.value).toBe(false);
        expect(setting.isDefault.value).toBe(false);
        // The readout came back from the fake store, proving this is a round trip and not
        // an optimistic local update.
        expect(setting.readout.value?.megabytes).toBe(3072);
        expect(setting.readout.value?.jvmArgs).toEqual(["-Xmx3072m"]);
    });

    it("surfaces a refusal from the main process rather than pretending the save worked", async () => {
        // A number the client-side check would happily let through (well within the
        // reported bounds), refused anyway by the main process - standing in for a check
        // this row does not replicate, such as the settings file being read-only.
        const bridge = fakeBridge();
        bridge.setRenderMemory = () =>
            Promise.resolve({ ok: false, reason: "The setting could not be written: disk is read-only." });
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        setting.mode.value = "manual";
        setting.megabytes.value = "3072";
        expect(setting.problem.value).toBeNull();

        expect(await setting.save()).toBe(false);
        expect(setting.failure.value).toContain("read-only");
        // Nothing was recorded as the current setting: a refused write must not be shown
        // as though it landed.
        expect(setting.readout.value?.mode).toBe("automatic");
    });

    it("clears the 'Saved' state the moment either control is edited again", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        setting.mode.value = "manual";
        setting.megabytes.value = "3072";
        await setting.save();
        expect(setting.savedJustNow.value).toBe(true);

        setting.megabytes.value = "3073";
        expect(setting.savedJustNow.value).toBe(false);
    });
});

describe("reset", () => {
    it("puts the controls back to automatic and saves immediately", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        setting.mode.value = "manual";
        setting.megabytes.value = "3072";
        await setting.save();
        expect(setting.isDefault.value).toBe(false);

        expect(await setting.reset()).toBe(true);

        expect(setting.mode.value).toBe("automatic");
        expect(setting.isDefault.value).toBe(true);
        expect(bridge.written.at(-1)).toEqual({ mode: "automatic" });
        // Genuinely round-tripped: the store's own recommended figure comes back, not a
        // value invented locally.
        expect(setting.readout.value?.megabytes).toBe(4096);
    });
});

describe("persistence across a fresh load, the way a restart would see it", () => {
    it("a value saved by one instance is read back by a new one sharing the same store", async () => {
        const bridge = fakeBridge();

        const first = createRenderMemorySetting({ bridge });
        await first.load();
        first.mode.value = "manual";
        first.megabytes.value = "6144";
        expect(await first.save()).toBe(true);

        // A second instance, standing in for the settings surface being reopened after a
        // restart, reading through the very same bridge rather than the first instance's
        // in-memory state.
        const second = createRenderMemorySetting({ bridge });
        await second.load();

        expect(second.mode.value).toBe("manual");
        expect(second.megabytes.value).toBe("6144");
        expect(second.isDefault.value).toBe(false);
    });
});

describe("a build that can read the ceiling but not change it", () => {
    it("reports canApply as false, and a write is refused with a plain explanation", async () => {
        const bridge: SettingsBridge = {
            renderMemory: () =>
                Promise.resolve({
                    mode: "automatic",
                    megabytes: 4096,
                    recommendedMegabytes: 4096,
                    machineMegabytes: 16384,
                    minimumMegabytes: 1024,
                    automaticCeilingMegabytes: 8192,
                    explanation: "Chosen automatically.",
                    jvmArgs: ["-Xmx4096m"],
                }),
        };
        const setting = createRenderMemorySetting({ bridge });
        expect(setting.canApply).toBe(false);

        await setting.load();
        expect(setting.state.value).toBe("loaded");

        setting.mode.value = "manual";
        setting.megabytes.value = "3072";
        expect(await setting.save()).toBe(false);
        expect(setting.failure.value).toContain("cannot change");
    });
});
