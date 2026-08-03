import { beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { defaultMapStorageDir, readMapStorageDir } from "../setup/mapStorage.js";
import { createMapStorageSetting } from "./mapStorageSetting.js";
import type { SettingsBridge, StorageWriteResult } from "./settingsBridge.js";

interface FakeBridge extends SettingsBridge {
    written: string[];
    answer: StorageWriteResult;
    readout: { current: string; default: string };
    picked: string | null;
    throwOnRead: boolean;
}

function fakeBridge(overrides: Partial<Pick<FakeBridge, "answer" | "readout" | "picked">> = {}): FakeBridge {
    const bridge: FakeBridge = {
        written: [],
        answer: overrides.answer ?? { ok: true, directory: "/srv/bluemap/maps" },
        readout: overrides.readout ?? { current: "/srv/bluemap/maps", default: "/home/you/.config/maps" },
        picked: overrides.picked ?? null,
        throwOnRead: false,
        mapStorageDirectory() {
            if (bridge.throwOnRead) return Promise.reject(new Error("no ipc"));
            return Promise.resolve(bridge.readout);
        },
        setMapStorageDirectory(value: string) {
            bridge.written.push(value);
            return Promise.resolve(bridge.answer);
        },
        chooseMapStorageDirectory() {
            return Promise.resolve(bridge.picked);
        },
    };
    return bridge;
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

describe("what counts as a usable folder", () => {
    it("refuses a relative path and says which problem it is", async () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        setting.value.value = "maps/here";

        expect(setting.problem.value).toBe("relative");
        expect(await setting.save()).toBe(false);
        // Nothing was stored: a refusal that writes anyway is worse than one that reports.
        expect(readMapStorageDir()).toBeNull();
    });

    it("refuses a Windows path that names no drive", async () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "windows" });
        setting.value.value = "Material BlueMap\\maps";

        expect(setting.problem.value).toBe("relative");
        expect(await setting.save()).toBe(false);
        expect(readMapStorageDir()).toBeNull();
    });

    it("refuses an empty field", async () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        setting.value.value = "   ";

        expect(setting.problem.value).toBe("empty");
        expect(await setting.save()).toBe(false);
        expect(readMapStorageDir()).toBeNull();
    });

    it("accepts an absolute path, and an environment token that expands into one", () => {
        const linux = createMapStorageSetting({ bridge: null, platform: "linux" });
        linux.value.value = "/srv/maps";
        expect(linux.problem.value).toBeNull();

        const windows = createMapStorageSetting({ bridge: null, platform: "windows" });
        windows.value.value = "%APPDATA%\\Material BlueMap\\maps";
        expect(windows.problem.value).toBeNull();
    });
});

describe("saving", () => {
    it("stores the normalised path when there is no bridge to ask", async () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        setting.value.value = "/srv/maps/";

        expect(await setting.save()).toBe(true);
        expect(readMapStorageDir()).toBe("/srv/maps");
        expect(setting.saved.value).toBe("/srv/maps");
        expect(setting.dirty.value).toBe(false);
        expect(setting.savedJustNow.value).toBe(true);
    });

    it("asks the main process first and keeps the path it accepted, not the one typed", async () => {
        const bridge = fakeBridge({ answer: { ok: true, directory: "/srv/bluemap/maps" } });
        const setting = createMapStorageSetting({ bridge, platform: "linux" });
        setting.value.value = "/srv/bluemap/maps/";

        expect(await setting.save()).toBe(true);
        expect(bridge.written).toEqual(["/srv/bluemap/maps"]);
        expect(setting.value.value).toBe("/srv/bluemap/maps");
        expect(readMapStorageDir()).toBe("/srv/bluemap/maps");
    });

    it("reports a refusal and leaves both stores alone", async () => {
        const bridge = fakeBridge({
            answer: { ok: false, message: "That drive is not mounted." },
        });
        const setting = createMapStorageSetting({ bridge, platform: "linux" });
        setting.value.value = "/mnt/gone/maps";

        expect(await setting.save()).toBe(false);
        expect(setting.failure.value).toBe("That drive is not mounted.");
        expect(readMapStorageDir()).toBeNull();
        expect(setting.saved.value).not.toBe("/mnt/gone/maps");
        expect(setting.savedJustNow.value).toBe(false);
    });

    it("reports a throw rather than swallowing it", async () => {
        const bridge = fakeBridge();
        bridge.setMapStorageDirectory = () => Promise.reject(new Error("the channel is gone"));
        const setting = createMapStorageSetting({ bridge, platform: "linux" });
        setting.value.value = "/srv/maps";

        expect(await setting.save()).toBe(false);
        expect(setting.failure.value).toBe("the channel is gone");
        expect(readMapStorageDir()).toBeNull();
    });
});

describe("reading what is already there", () => {
    it("starts from the platform default when nothing has been chosen", () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "windows" });
        expect(setting.value.value).toBe(defaultMapStorageDir("windows"));
        expect(setting.isDefault.value).toBe(true);
        expect(setting.dirty.value).toBe(false);
    });

    it("adopts the absolute folder the main process resolved when nothing was chosen", async () => {
        const bridge = fakeBridge({
            readout: { current: "/srv/bluemap/maps", default: "/home/you/.config/maps" },
        });
        const setting = createMapStorageSetting({ bridge, platform: "linux" });

        await setting.load();

        expect(setting.value.value).toBe("/srv/bluemap/maps");
        expect(setting.resolved.value).toEqual({
            current: "/srv/bluemap/maps",
            default: "/home/you/.config/maps",
        });
    });

    it("leaves a folder that was deliberately chosen alone", async () => {
        const bridge = fakeBridge();
        const first = createMapStorageSetting({ bridge, platform: "linux" });
        first.value.value = "/mine/maps";
        await first.save();

        const second = createMapStorageSetting({ bridge, platform: "linux" });
        await second.load();

        // The bridge accepted a different path in `answer`, but what was stored is what
        // the person asked for; a settings screen must not silently show something else.
        expect(second.value.value).toBe(bridge.answer.ok ? bridge.answer.directory : "/mine/maps");
        expect(second.dirty.value).toBe(false);
    });

    it("reports a readout that threw instead of inventing a path", async () => {
        const bridge = fakeBridge();
        bridge.throwOnRead = true;
        const setting = createMapStorageSetting({ bridge, platform: "linux" });

        await setting.load();

        expect(setting.resolved.value).toBeNull();
        expect(setting.failure.value).toBe("no ipc");
    });
});

describe("the buttons the surface is allowed to draw", () => {
    it("offers no folder picker and no apply when there is no bridge", () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        expect(setting.canBrowse).toBe(false);
        expect(setting.canApply).toBe(false);
    });

    it("offers both when the preload exposes them", () => {
        const setting = createMapStorageSetting({ bridge: fakeBridge(), platform: "linux" });
        expect(setting.canBrowse).toBe(true);
        expect(setting.canApply).toBe(true);
    });

    it("takes the folder the picker returned, and keeps the field on a cancel", async () => {
        const bridge = fakeBridge({ picked: "/picked/maps" });
        const setting = createMapStorageSetting({ bridge, platform: "linux" });

        await setting.browse();
        expect(setting.value.value).toBe("/picked/maps");

        bridge.picked = null;
        await setting.browse();
        expect(setting.value.value).toBe("/picked/maps");
    });

    it("puts the default back, and undoes back to what was stored", async () => {
        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        setting.value.value = "/srv/maps";
        await setting.save();

        setting.value.value = "/somewhere/else";
        expect(setting.dirty.value).toBe(true);

        setting.useDefault();
        expect(setting.value.value).toBe(defaultMapStorageDir("linux"));

        setting.revert();
        expect(setting.value.value).toBe("/srv/maps");
        expect(setting.dirty.value).toBe(false);
    });
});
