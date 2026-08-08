// @vitest-environment jsdom

/**
 * The shell-level theme choice: that it reads and writes the viewer's own stored record
 * (same key, same JSON encoding), that a choice made with no map open reaches the next
 * viewer to start - including one whose map never opted into `useCookies` and so loads
 * no stored settings of its own - and that a change made inside the in-map menu is
 * mirrored back out so it survives that viewer being torn down.
 *
 * The Vuetify half - `useBlueMapTheme` falling back to this module's `currentTheme` when
 * no app is running - is asserted through `currentTheme` itself here: that computed is
 * the exact value the bridge reads.
 */

import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlueMapApp } from "@worldlens/viewer";
import { blueMapApp, setBlueMapApp } from "../../stores/bluemap.js";
import {
    THEME_CHOICES,
    THEME_STORAGE_KEY,
    changeTheme,
    currentTheme,
    readStoredTheme,
    type ThemeChoice,
} from "./themeSetting.js";

interface FakeApp {
    appState: { theme: string | null };
    setTheme: ReturnType<typeof vi.fn>;
}

/** The two members this module touches, reactive the way the real viewer's state is. */
function fakeApp(theme: string | null = null): FakeApp {
    const appState = reactive({ theme });
    const app: FakeApp = {
        appState,
        setTheme: vi.fn((choice: string | null) => {
            appState.theme = choice;
        }),
    };
    return app;
}

function install(app: FakeApp): void {
    setBlueMapApp(app as unknown as BlueMapApp);
}

beforeEach(async () => {
    setBlueMapApp(null);
    localStorage.clear();
    changeTheme(null);
    await nextTick();
});

afterEach(async () => {
    setBlueMapApp(null);
    localStorage.clear();
    changeTheme(null);
    await nextTick();
});

describe("the stored record", () => {
    it("is the viewer's own: same key, same JSON encoding", () => {
        changeTheme("dark");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify("dark"));
    });

    it("reads back every choice, including follow-the-system", () => {
        for (const choice of THEME_CHOICES) {
            changeTheme(choice);
            expect(readStoredTheme()).toBe(choice);
        }
    });

    it("answers follow-the-system for a value that is not a theme", () => {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify("neon"));
        expect(readStoredTheme()).toBeNull();
        localStorage.setItem(THEME_STORAGE_KEY, "not json {");
        expect(readStoredTheme()).toBeNull();
    });
});

describe("with no viewer running", () => {
    it("a change lands in currentTheme immediately, which is what the Vuetify bridge reads", () => {
        changeTheme("contrast");
        expect(currentTheme.value).toBe("contrast");
        expect(blueMapApp.value).toBeNull();
    });
});

describe("when a viewer starts", () => {
    it("pushes the stored choice into an app that loaded none of its own", async () => {
        changeTheme("dark");

        const app = fakeApp(null);
        install(app);
        await nextTick();

        expect(app.setTheme).toHaveBeenCalledWith("dark");
        expect(currentTheme.value).toBe("dark");
    });

    it("leaves an app alone when it already loaded the same record", async () => {
        changeTheme("light");

        const app = fakeApp("light");
        install(app);
        await nextTick();

        expect(app.setTheme).not.toHaveBeenCalled();
    });

    it("a choice made on the settings surface reaches the live app too", async () => {
        const app = fakeApp(null);
        install(app);
        await nextTick();

        changeTheme("contrast");
        expect(app.setTheme).toHaveBeenCalledWith("contrast");
        expect(currentTheme.value).toBe("contrast");
    });
});

describe("when the in-map menu changes the theme", () => {
    it("mirrors the change out, so it survives the viewer being torn down", async () => {
        const app = fakeApp(null);
        install(app);
        await nextTick();

        // The viewer's own settings menu writes appState.theme directly.
        app.appState.theme = "light";
        await nextTick();

        setBlueMapApp(null);
        await nextTick();

        expect(currentTheme.value).toBe("light" satisfies ThemeChoice);
        expect(readStoredTheme()).toBe("light");
    });
});
