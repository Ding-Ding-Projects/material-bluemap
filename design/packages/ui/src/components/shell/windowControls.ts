/**
 * The window buttons, without the window.
 *
 * The application draws its own title bar, because the window is frameless: Electron is
 * told `frame: false` so the operating system's grey caption bar never appears as product
 * chrome. That buys a title bar which can be Material Design all the way to the corner,
 * and it costs the three buttons the operating system used to draw. This module is the
 * half of them that does not need a DOM.
 *
 * Everything here works against an injected bridge so it can be tested without Electron,
 * and returns `available: false` in a browser tab, where there is no window to minimise
 * and closing the page is the tab's job rather than the application's.
 */

import { readonly, ref, type Ref } from "vue";

/** The window half of the preload bridge. Mirrors `MaterialBlueMapBridge`. */
export interface WindowBridge {
    minimizeWindow(): Promise<void>;
    toggleMaximizeWindow(): Promise<boolean>;
    closeWindow(): Promise<void>;
    isWindowMaximized(): Promise<boolean>;
    onWindowMaximizedChanged(listener: (maximized: boolean) => void): () => void;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or null when this build has no window of its own.
 *
 * All or nothing, for the same reason the render bridge is: a title bar with a working
 * minimise and a close button that throws is worse than a title bar with no buttons,
 * because the second one is obviously not offering something and the first only looks
 * like it is.
 */
export function resolveWindowBridge(): WindowBridge | null {
    const host = (globalThis as { worldlens?: Partial<WindowBridge> }).worldlens;
    if (host === undefined) return null;

    const required = [
        host.minimizeWindow,
        host.toggleMaximizeWindow,
        host.closeWindow,
        host.isWindowMaximized,
        host.onWindowMaximizedChanged,
    ];
    if (!required.every(isFunction)) return null;

    const complete = host as WindowBridge;
    return {
        minimizeWindow: () => complete.minimizeWindow(),
        toggleMaximizeWindow: () => complete.toggleMaximizeWindow(),
        closeWindow: () => complete.closeWindow(),
        isWindowMaximized: () => complete.isWindowMaximized(),
        onWindowMaximizedChanged: (listener) => complete.onWindowMaximizedChanged(listener),
    };
}

export interface WindowControls {
    /** False in a browser build. The title bar renders no buttons at all when it is. */
    readonly available: boolean;
    /** Whether the window is maximised right now, tracked rather than assumed. */
    readonly maximized: Readonly<Ref<boolean>>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    /** Reads the initial state and subscribes. Call from `onMounted`. */
    start(): Promise<void>;
    /** Unsubscribes. Call from `onBeforeUnmount`. */
    stop(): void;
}

/**
 * Tracks the maximise state and drives the three buttons.
 *
 * The state is **subscribed to, never inferred from the last click**. A window is
 * maximised and restored by things this component will never see - a double-click on the
 * drag region, Win+Up, snapping it to half the screen, the window manager restoring a
 * session - and a button that toggles a boolean it owns locally ends up showing the
 * restore icon on a window that is not maximised. That is a button that lies about what
 * it will do, which is the specific failure this project keeps finding in decorative
 * chrome.
 *
 * Every call swallows a rejected bridge call rather than surfacing it. A minimise that
 * fails has nothing useful to say to somebody and no recovery to offer; what it must not
 * do is throw out of an event handler and take an unrelated part of the interface down
 * with it.
 */
export function createWindowControls(bridge: WindowBridge | null): WindowControls {
    const maximized = ref(false);
    let unsubscribe: (() => void) | null = null;

    const apply = (value: boolean): void => {
        maximized.value = value;
    };

    return {
        available: bridge !== null,
        maximized: readonly(maximized),

        async start(): Promise<void> {
            if (bridge === null) return;
            // Subscribe once. A second `start` that overwrote the handle would leak the
            // first subscription, and `stop` would then drop only the newer one - leaving
            // a listener writing into a ref whose component has been torn down.
            unsubscribe ??= bridge.onWindowMaximizedChanged(apply);
            try {
                apply(await bridge.isWindowMaximized());
            } catch {
                // An unreadable initial state is not worth a message. The subscription is
                // already live, so the first real change corrects it.
            }
        },

        stop(): void {
            unsubscribe?.();
            unsubscribe = null;
        },

        async minimize(): Promise<void> {
            try {
                await bridge?.minimizeWindow();
            } catch {
                /* nothing useful to say, and nothing to recover */
            }
        },

        async toggleMaximize(): Promise<void> {
            if (bridge === null) return;
            try {
                // The main process reports the state it ended in, so this does not have to
                // guess. The subscription would arrive at the same answer; taking the return
                // value means the icon does not flicker through a wrong frame first.
                apply(await bridge.toggleMaximizeWindow());
            } catch {
                /* leave the tracked state alone; the subscription is still authoritative */
            }
        },

        async close(): Promise<void> {
            try {
                await bridge?.closeWindow();
            } catch {
                /* the window is going away, or it is not; either way there is no message */
            }
        },
    };
}
