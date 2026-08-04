/**
 * The size preference and the shortcut, tested where they can actually go wrong.
 *
 * The size is a two-value setting, which sounds untestable until you notice that everything
 * interesting about it is what happens when storage misbehaves: absent, unreadable, holding
 * a value from a future version, or refusing to be written at all. Each of those has to end
 * with the bounded card on screen and no error anywhere, because a remembered window size is
 * not worth interrupting anybody over.
 *
 * The shortcut is tested for what it must *not* claim as much as for what it must: an
 * application that swallows Ctrl+Shift+K, or that fires on a bare K typed into a search box,
 * has taken a keystroke away from whoever needed it.
 */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_PALETTE_SIZE,
    isPaletteShortcut,
    isPaletteSize,
    readPaletteSize,
    writePaletteSize,
    type PaletteStorage,
} from "./palettePrefs.js";

/** A storage whose behaviour a test can choose, including refusing to work. */
function fakeStorage(initial: string | null, refuse = false): PaletteStorage & { written: string | null } {
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

describe("which sizes exist", () => {
    it("knows the two it ships and nothing else", () => {
        expect(isPaletteSize("card")).toBe(true);
        expect(isPaletteSize("full")).toBe(true);
        expect(isPaletteSize("fullscreen")).toBe(false);
        expect(isPaletteSize(2)).toBe(false);
        expect(isPaletteSize(null)).toBe(false);
    });

    it("defaults to the bounded card, which is the whole point of having a default", () => {
        expect(DEFAULT_PALETTE_SIZE).toBe("card");
    });
});

describe("reading the stored size", () => {
    it("returns the stored value when there is one", () => {
        expect(readPaletteSize(fakeStorage('{"size":"full"}'))).toBe("full");
    });

    it("falls back to the card when nothing was ever stored", () => {
        expect(readPaletteSize(fakeStorage(null))).toBe("card");
    });

    it("falls back when the stored text is not JSON at all", () => {
        expect(readPaletteSize(fakeStorage("{not json"))).toBe("card");
    });

    it("falls back when the stored size is one this build does not know", () => {
        expect(readPaletteSize(fakeStorage('{"size":"cinema"}'))).toBe("card");
    });

    it("falls back rather than throwing when storage refuses to be read", () => {
        expect(readPaletteSize(fakeStorage(null, true))).toBe("card");
    });

    it("falls back when there is no storage to read at all", () => {
        expect(readPaletteSize(null)).toBe("card");
    });
});

describe("writing the stored size", () => {
    it("round-trips through the same reader", () => {
        const storage = fakeStorage(null);
        writePaletteSize("full", storage);
        expect(readPaletteSize(storage)).toBe("full");
    });

    it("says nothing when storage refuses, because a window size is not an error", () => {
        expect(() => writePaletteSize("full", fakeStorage(null, true))).not.toThrow();
        expect(() => writePaletteSize("full", null)).not.toThrow();
    });
});

describe("the shortcut", () => {
    /*
     * A plain object rather than `new KeyboardEvent(...)`: this file runs in the Node
     * environment, where there is no DOM constructor to call, and the predicate reads five
     * fields. Building those five is a truer unit test than dragging in jsdom for them.
     */
    const press = (init: Partial<KeyboardEvent>): boolean =>
        isPaletteShortcut({
            key: "",
            altKey: false,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            ...init,
        } as KeyboardEvent);

    it("is Control or Command with K", () => {
        expect(press({ key: "k", ctrlKey: true })).toBe(true);
        expect(press({ key: "k", metaKey: true })).toBe(true);
        expect(press({ key: "K", ctrlKey: true })).toBe(true);
    });

    it("is not a bare K, which is a letter somebody is typing", () => {
        expect(press({ key: "k" })).toBe(false);
    });

    it("leaves Ctrl+Shift+K and Ctrl+Alt+K to whoever wants them", () => {
        expect(press({ key: "K", ctrlKey: true, shiftKey: true })).toBe(false);
        expect(press({ key: "k", ctrlKey: true, altKey: true })).toBe(false);
    });

    it("is not some other Control chord", () => {
        expect(press({ key: "p", ctrlKey: true })).toBe(false);
    });
});
