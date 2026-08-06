/**
 * The persisted preference, tested where it can actually go wrong: absent, unreadable,
 * holding junk, refusing to write, and holding more than one surface's flag at once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import {
    readAutoScrollPreference,
    useAutoScrollPreference,
    writeAutoScrollPreference,
    type AutoScrollStorage,
} from "./autoScrollPrefs.js";

/** A storage whose behaviour a test can choose, including refusing to work. */
function fakeStorage(initial: string | null, refuse = false): AutoScrollStorage & { written: string | null } {
    const state = { written: initial };
    return {
        get written() {
            return state.written;
        },
        getItem: () => {
            if (refuse) throw new Error("blocked");
            return state.written;
        },
        setItem: (_key: string, value: string) => {
            if (refuse) throw new Error("blocked");
            state.written = value;
        },
    };
}

beforeEach(() => {
    vi.mocked(recordAppSetting).mockClear();
});

describe("reading the stored preference", () => {
    it("returns the stored value for the surface asked about", () => {
        const storage = fakeStorage('{"renderConsole":false,"backupLog":true}');
        expect(readAutoScrollPreference("renderConsole", true, storage)).toBe(false);
        expect(readAutoScrollPreference("backupLog", false, storage)).toBe(true);
    });

    it("falls back when the surface has never been stored", () => {
        expect(readAutoScrollPreference("renderConsole", true, fakeStorage('{"backupLog":false}'))).toBe(true);
    });

    it("falls back when there is nothing in storage at all", () => {
        expect(readAutoScrollPreference("renderConsole", true, fakeStorage(null))).toBe(true);
    });

    it("falls back when the stored text is not JSON", () => {
        expect(readAutoScrollPreference("renderConsole", true, fakeStorage("not json"))).toBe(true);
    });

    it("falls back when the stored JSON is an array rather than an object", () => {
        expect(readAutoScrollPreference("renderConsole", true, fakeStorage("[true,false]"))).toBe(true);
    });

    it("ignores a non-boolean value for the surface rather than trusting it", () => {
        expect(readAutoScrollPreference("renderConsole", true, fakeStorage('{"renderConsole":"yes"}'))).toBe(true);
    });

    it("falls back when reading itself throws", () => {
        expect(readAutoScrollPreference("renderConsole", true, fakeStorage(null, true))).toBe(true);
    });

    it("treats a null storage - no localStorage at all - as nothing stored", () => {
        expect(readAutoScrollPreference("renderConsole", true, null)).toBe(true);
    });
});

describe("writing the preference", () => {
    it("stores the surface's flag, readable straight back", () => {
        const storage = fakeStorage(null);
        writeAutoScrollPreference("renderConsole", false, storage);
        expect(readAutoScrollPreference("renderConsole", true, storage)).toBe(false);
    });

    it("leaves every other surface's already-stored flag untouched", () => {
        const storage = fakeStorage('{"backupLog":true}');
        writeAutoScrollPreference("renderConsole", false, storage);
        expect(readAutoScrollPreference("backupLog", false, storage)).toBe(true);
        expect(readAutoScrollPreference("renderConsole", true, storage)).toBe(false);
    });

    it("mirrors into the app settings history under one shared key", () => {
        const storage = fakeStorage('{"backupLog":true}');
        writeAutoScrollPreference("renderConsole", false, storage);
        expect(recordAppSetting).toHaveBeenCalledWith("autoScroll", { backupLog: true, renderConsole: false });
    });

    it("does not throw when storage refuses to write - a remembered preference is not worth a toast", () => {
        expect(() => writeAutoScrollPreference("renderConsole", true, fakeStorage(null, true))).not.toThrow();
    });

    it("does nothing to storage, and does not throw, with no storage at all", () => {
        expect(() => writeAutoScrollPreference("renderConsole", true, null)).not.toThrow();
        expect(recordAppSetting).toHaveBeenCalled();
    });
});

describe("the composable ref", () => {
    it("starts at the stored value when there is one", () => {
        const state = useAutoScrollPreference("renderConsole", true, fakeStorage('{"renderConsole":false}'));
        expect(state.value).toBe(false);
    });

    it("starts at the default when there is nothing stored yet", () => {
        const state = useAutoScrollPreference("renderConsole", true, fakeStorage(null));
        expect(state.value).toBe(true);
    });

    it("writes through the moment the ref changes", async () => {
        const storage = fakeStorage(null);
        const state = useAutoScrollPreference("renderConsole", true, storage);
        state.value = false;
        await nextTick();
        expect(readAutoScrollPreference("renderConsole", true, storage)).toBe(false);
    });

    it("does not write on its own before anything changes", async () => {
        const storage = fakeStorage(null);
        useAutoScrollPreference("renderConsole", true, storage);
        await nextTick();
        expect(storage.written).toBe(null);
    });
});
