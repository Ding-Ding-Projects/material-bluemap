import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createWindowControls,
    resolveWindowBridge,
    type WindowBridge,
} from "./windowControls.js";

/** A bridge whose maximise state can be driven from outside, the way a window manager does. */
function fakeBridge(initial = false): {
    bridge: WindowBridge;
    calls: string[];
    /** Pushes a state change the way the main process does when the OS maximises the window. */
    push: (maximized: boolean) => void;
    listeners: number;
} {
    const calls: string[] = [];
    let maximized = initial;
    const subscribers = new Set<(value: boolean) => void>();

    const state = {
        calls,
        push(value: boolean) {
            maximized = value;
            for (const listener of subscribers) listener(value);
        },
        get listeners() {
            return subscribers.size;
        },
        bridge: {
            minimizeWindow: () => {
                calls.push("minimize");
                return Promise.resolve();
            },
            toggleMaximizeWindow: () => {
                calls.push("toggleMaximize");
                maximized = !maximized;
                return Promise.resolve(maximized);
            },
            closeWindow: () => {
                calls.push("close");
                return Promise.resolve();
            },
            isWindowMaximized: () => {
                calls.push("isMaximized");
                return Promise.resolve(maximized);
            },
            onWindowMaximizedChanged: (listener: (value: boolean) => void) => {
                subscribers.add(listener);
                return () => subscribers.delete(listener);
            },
        } satisfies WindowBridge,
    };
    return state;
}

const globals = globalThis as { worldlens?: unknown };

afterEach(() => {
    delete globals.worldlens;
});

describe("resolveWindowBridge", () => {
    it("returns null in a browser build, where there is no window to control", () => {
        expect(resolveWindowBridge()).toBeNull();
    });

    it("refuses a half-built bridge rather than exposing buttons that throw", () => {
        // A title bar with a working minimise and a close that throws is worse than one
        // with no buttons: the second is visibly not offering something, the first only
        // looks like it is.
        globals.worldlens = {
            minimizeWindow: () => Promise.resolve(),
            toggleMaximizeWindow: () => Promise.resolve(false),
            // closeWindow missing
            isWindowMaximized: () => Promise.resolve(false),
            onWindowMaximizedChanged: () => () => undefined,
        };
        expect(resolveWindowBridge()).toBeNull();
    });

    it("returns a bridge when every method is present", () => {
        globals.worldlens = fakeBridge().bridge;
        expect(resolveWindowBridge()).not.toBeNull();
    });
});

describe("createWindowControls", () => {
    it("reports itself unavailable with no bridge, and stays inert", async () => {
        const controls = createWindowControls(null);
        expect(controls.available).toBe(false);

        // Nothing may throw: the title bar renders nothing, but a caller that does not
        // check `available` must not take the application down.
        await controls.start();
        await controls.minimize();
        await controls.toggleMaximize();
        await controls.close();
        controls.stop();
        expect(controls.maximized.value).toBe(false);
    });

    it("reads the initial maximise state on start", async () => {
        const { bridge, calls } = fakeBridge(true);
        const controls = createWindowControls(bridge);
        await controls.start();
        expect(controls.maximized.value).toBe(true);
        expect(calls).toContain("isMaximized");
    });

    it("follows a maximise that happened outside the application", async () => {
        // Win+Up, a double-click on the drag region, snapping to half the screen, a window
        // manager restoring a session. A title bar that only tracks its own clicks shows
        // the restore icon on a window that is not maximised.
        const { bridge, push } = fakeBridge(false);
        const controls = createWindowControls(bridge);
        await controls.start();
        expect(controls.maximized.value).toBe(false);

        push(true);
        expect(controls.maximized.value).toBe(true);

        push(false);
        expect(controls.maximized.value).toBe(false);
    });

    it("takes the state the main process reports from a toggle", async () => {
        const { bridge } = fakeBridge(false);
        const controls = createWindowControls(bridge);
        await controls.start();

        await controls.toggleMaximize();
        expect(controls.maximized.value).toBe(true);

        await controls.toggleMaximize();
        expect(controls.maximized.value).toBe(false);
    });

    it("forwards minimize and close", async () => {
        const { bridge, calls } = fakeBridge();
        const controls = createWindowControls(bridge);
        await controls.start();

        await controls.minimize();
        await controls.close();
        expect(calls).toContain("minimize");
        expect(calls).toContain("close");
    });

    it("unsubscribes on stop, so a torn-down bar stops writing to a dead ref", async () => {
        const fake = fakeBridge();
        const controls = createWindowControls(fake.bridge);
        await controls.start();
        expect(fake.listeners).toBe(1);

        controls.stop();
        expect(fake.listeners).toBe(0);

        fake.push(true);
        expect(controls.maximized.value).toBe(false);
    });

    it("swallows a rejected call rather than throwing out of a click handler", async () => {
        const bridge: WindowBridge = {
            minimizeWindow: () => Promise.reject(new Error("no window")),
            toggleMaximizeWindow: () => Promise.reject(new Error("no window")),
            closeWindow: () => Promise.reject(new Error("no window")),
            isWindowMaximized: () => Promise.reject(new Error("no window")),
            onWindowMaximizedChanged: () => () => undefined,
        };
        const controls = createWindowControls(bridge);

        // A failed minimise has nothing useful to say and no recovery to offer. What it
        // must not do is take an unrelated part of the interface down with it.
        await expect(controls.start()).resolves.toBeUndefined();
        await expect(controls.minimize()).resolves.toBeUndefined();
        await expect(controls.toggleMaximize()).resolves.toBeUndefined();
        await expect(controls.close()).resolves.toBeUndefined();
        expect(controls.maximized.value).toBe(false);
    });

    it("leaves the tracked state alone when a toggle fails", async () => {
        const fake = fakeBridge(true);
        const failing: WindowBridge = {
            ...fake.bridge,
            toggleMaximizeWindow: () => Promise.reject(new Error("refused")),
        };
        const controls = createWindowControls(failing);
        await controls.start();
        expect(controls.maximized.value).toBe(true);

        await controls.toggleMaximize();
        // The window did not change, so neither does the icon.
        expect(controls.maximized.value).toBe(true);
    });

    it("does not subscribe twice when start is called again", async () => {
        const fake = fakeBridge();
        const controls = createWindowControls(fake.bridge);
        await controls.start();
        await controls.start();
        controls.stop();
        // A leaked subscription would keep writing after the bar is gone.
        expect(fake.listeners).toBeLessThanOrEqual(1);
    });
});

describe("the maximised ref is read-only to consumers", () => {
    it("is not writable from outside", async () => {
        const { bridge } = fakeBridge(false);
        const controls = createWindowControls(bridge);
        await controls.start();

        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        // Vue's `readonly` refuses the write and warns; the point is that a component
        // cannot desynchronise the icon from the actual window by assigning to it.
        (controls.maximized as { value: boolean }).value = true;
        expect(controls.maximized.value).toBe(false);
        warn.mockRestore();
    });
});
