/**
 * The EULA viewer's own tab layout, mirrored into the application-settings history.
 *
 * `eulaStorage.ts` otherwise has no dedicated test file - its read/write round trip and its
 * reconciliation against a changed document are exercised through `EulaViewer.test.ts`'s
 * mounted component instead. This file covers exactly the piece that file does not: that
 * `writeEulaStrip` calls the shared history mirror, under its own key, independent of
 * whether the local `localStorage` write itself succeeds.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { seedEulaStrip, writeEulaStrip, type EulaTabStorage } from "./eulaStorage.js";
import type { TabPage } from "../tabs/tabModel.js";

const PAGES: readonly TabPage[] = [
    { id: "scope", label: "Scope", icon: null },
    { id: "termination", label: "Termination", icon: null },
];

function memoryStorage(): EulaTabStorage & { cells: Map<string, string> } {
    const cells = new Map<string, string>();
    return {
        cells,
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
    };
}

describe("mirroring into the application-settings history", () => {
    beforeEach(() => {
        vi.mocked(recordAppSetting).mockClear();
    });

    it("mirrors the strip under the eulaTabs key", () => {
        const strip = seedEulaStrip(PAGES, "Licence", "This window");
        writeEulaStrip(strip, memoryStorage());
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("eulaTabs", strip);
    });

    it("still mirrors when storage itself refuses the write", () => {
        const strip = seedEulaStrip(PAGES, "Licence", "This window");
        const refusing: EulaTabStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("blocked");
            },
        };
        writeEulaStrip(strip, refusing);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("eulaTabs", strip);
    });

    it("still mirrors when there is no local storage to write to at all", () => {
        const strip = seedEulaStrip(PAGES, "Licence", "This window");
        writeEulaStrip(strip, null);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("eulaTabs", strip);
    });
});
