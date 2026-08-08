// @vitest-environment jsdom

/**
 * The interface-size dial's own rules: that the five stops are the project's supported
 * scale points, that a stored choice survives a restart and a corrupted one falls back
 * to the default rather than to a thrown error, and that applying a level takes the
 * bridge route when this build has one and the CSS route when it does not.
 *
 * The row component's wiring is `UiSizeRow.test.ts`'s subject; this file is the logic
 * underneath it, the same split `noticeDurationPrefs` draws with its own row.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_UI_SIZE_LEVEL,
    UI_SIZE_KEY,
    UI_SIZE_LEVELS,
    applyUiSize,
    changeUiSize,
    currentUiSizeLevel,
    installUiSize,
    isUiSizeLevel,
    readUiSizeLevel,
    resolveUiZoomBridge,
    uiSizeLevelByNumber,
    uiZoomFactor,
    writeUiSizeLevel,
} from "./uiSizeSetting.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";

const host = globalThis as { worldlens?: unknown };

beforeEach(() => {
    setSetupStorage(memoryStorage());
    delete host.worldlens;
    document.documentElement.style.removeProperty("zoom");
});

afterEach(() => {
    delete host.worldlens;
    document.documentElement.style.removeProperty("zoom");
    setSetupStorage(memoryStorage());
    installUiSize();
});

describe("the five stops", () => {
    it("are 100 to 200 percent, the scale points every layout is already required to hold at", () => {
        expect(UI_SIZE_LEVELS.map((stop) => stop.percent)).toEqual([100, 125, 150, 175, 200]);
    });

    it("start at the designed size, which is also the default", () => {
        expect(DEFAULT_UI_SIZE_LEVEL).toBe(1);
        expect(uiSizeLevelByNumber(DEFAULT_UI_SIZE_LEVEL).percent).toBe(100);
    });

    it("never go below the designed size, so the control that undoes a choice never shrinks", () => {
        for (const stop of UI_SIZE_LEVELS) expect(stop.percent).toBeGreaterThanOrEqual(100);
    });

    it("translate to the zoom factor a browser's own zoom would use", () => {
        expect(uiZoomFactor(1)).toBe(1);
        expect(uiZoomFactor(3)).toBe(1.5);
        expect(uiZoomFactor(5)).toBe(2);
    });

    it("recognise exactly themselves", () => {
        expect(isUiSizeLevel(3)).toBe(true);
        expect(isUiSizeLevel(0)).toBe(false);
        expect(isUiSizeLevel(6)).toBe(false);
        expect(isUiSizeLevel("3")).toBe(false);
        expect(isUiSizeLevel(null)).toBe(false);
    });
});

describe("persistence", () => {
    it("round-trips a chosen level", () => {
        writeUiSizeLevel(4);
        expect(readUiSizeLevel()).toBe(4);
    });

    it("answers the default when nothing has been chosen", () => {
        expect(readUiSizeLevel()).toBe(DEFAULT_UI_SIZE_LEVEL);
    });

    it("answers the default when the stored value does not parse as a stop", () => {
        const storage = memoryStorage({ [UI_SIZE_KEY]: "enormous" });
        setSetupStorage(storage);
        expect(readUiSizeLevel()).toBe(DEFAULT_UI_SIZE_LEVEL);

        setSetupStorage(memoryStorage({ [UI_SIZE_KEY]: "12" }));
        expect(readUiSizeLevel()).toBe(DEFAULT_UI_SIZE_LEVEL);
    });
});

describe("applying a level", () => {
    it("takes the bridge route when this build has one, and leaves the stylesheet alone", () => {
        const setUiZoom = vi.fn();
        host.worldlens = { setUiZoom };

        applyUiSize(3);

        expect(setUiZoom).toHaveBeenCalledWith(1.5);
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("");
    });

    it("falls back to CSS zoom on the document root without a bridge", () => {
        applyUiSize(5);
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("2");
    });

    it("removes the CSS zoom entirely at the designed size rather than writing zoom: 1", () => {
        applyUiSize(5);
        applyUiSize(1);
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("");
    });

    it("resolves no bridge from a host whose setUiZoom is not a function", () => {
        host.worldlens = { setUiZoom: "soon" };
        expect(resolveUiZoomBridge()).toBeNull();
    });
});

describe("the shared readout", () => {
    it("changeUiSize persists, applies and updates it in one step", () => {
        changeUiSize(2);
        expect(currentUiSizeLevel.value).toBe(2);
        expect(readUiSizeLevel()).toBe(2);
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1.25");
    });

    it("installUiSize applies the persisted level at startup", () => {
        setSetupStorage(memoryStorage({ [UI_SIZE_KEY]: "4" }));
        installUiSize();
        expect(currentUiSizeLevel.value).toBe(4);
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1.75");
    });
});
