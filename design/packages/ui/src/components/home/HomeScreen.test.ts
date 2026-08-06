// @vitest-environment jsdom

/**
 * Home, mounted.
 *
 * `homeCatalog.test.ts` and `homeState.test.ts` already prove the pure logic; what only a
 * mounted component can answer is whether that logic actually reaches the screen - every
 * capability really renders a card, a disabled reason really names what unblocks it, the
 * intro really remembers being collapsed, and the six shell-owned actions really emit rather
 * than silently doing nothing.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import HomeScreen from "./HomeScreen.vue";
import { setHomeIntroCollapsed } from "./homeState.js";
import { addLocalMap, profilesStore, removeProfile } from "../../stores/profiles.js";
import { blueMapApp } from "../../stores/bluemap.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    Element.prototype.scrollIntoView = () => {};
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });
});

const cells = new Map<string, string>();

beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

let wrapper: VueWrapper | null = null;

function render(): VueWrapper {
    wrapper = mount(HomeScreen, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 4; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
    blueMapApp.value = null;
});

describe("every capability from the scout's inventory is represented", () => {
    it("renders the newcomer's one obvious next step, and the orientation tiles beside it", () => {
        const view = render();
        expect(view.text()).toContain("Make a map");
        expect(view.text()).toContain("What is this?");
        expect(view.text()).toContain("Take the tour");
    });

    it("renders every page-mapped tile: the map, projects, servers, GitHub runners", () => {
        const view = render();
        expect(view.text()).toContain("Map");
        expect(view.text()).toContain("Projects");
        expect(view.text()).toContain("Maps and servers");
        expect(view.text()).toContain("GitHub runners");
    });

    it("renders the share group: backups and publishing to Pages", () => {
        const view = render();
        expect(view.text()).toContain("Backups");
        expect(view.text()).toContain("Publish to Pages");
    });

    it("renders the learn group: docs and the licence", () => {
        const view = render();
        expect(view.text()).toContain("Docs");
        expect(view.text()).toContain("The Minecraft licence");
    });

    it("renders the settings and tools group in full", () => {
        const view = render();
        expect(view.text()).toContain("Settings");
        expect(view.text()).toContain("Server configuration");
        expect(view.text()).toContain("Config folder history");
        expect(view.text()).toContain("Command palette");
        expect(view.text()).toContain("Notification centre");
        expect(view.text()).toContain("Find a tab");
    });

    it("omits the running-viewer group entirely when no map is open, rather than a disabled shell", () => {
        const view = render();
        expect(view.text()).not.toContain("Reset Camera & Position");
    });

    it("adds the viewer's own menu once a map is actually running", async () => {
        blueMapApp.value = {
            appState: { menu: { openPage: () => {} } },
            mapViewer: { markers: { data: null } },
            resetCamera: () => {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a minimal stand-in for the real viewer object
        } as any;
        const view = render();
        await settle();

        expect(view.text()).toContain("Reset Camera & Position");
        expect(view.text()).toContain("Changelog");
    });
});

describe("honesty about missing prerequisites", () => {
    it("names the unmet condition for Backups and Publish to Pages before any map is rendered", () => {
        const view = render();
        const matches = view.text().match(/This needs a map rendered on this computer\.[^]*?come back\./g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
        expect(view.text()).toContain("Render one, then come back.");
    });

    it("offers the remedy that actually resolves it", async () => {
        const view = render();
        const remedies = view.findAll("button").filter((btn) => btn.text() === "Make a map");
        // The hero "Make a map" CTA plus (at least) the Backups and Pages remedy buttons.
        expect(remedies.length).toBeGreaterThanOrEqual(3);

        await remedies[1]?.trigger("click");
        expect(view.emitted("reveal-page")?.[0]).toEqual(["world"]);
    });

    it("stops naming the condition, and enables the real action, once a map has been rendered", async () => {
        addLocalMap("/renders/overworld", "overworld");
        const view = render();
        await settle();

        expect(view.text()).not.toContain("This needs a map rendered on this computer.");
        const disabled = view.findAll("button").filter((btn) => btn.attributes("disabled") !== undefined);
        expect(disabled.length).toBe(0);
    });
});

describe("the introduction remembers its state", () => {
    it("shows the explanation by default, for a newcomer who has never folded it away", () => {
        const view = render();
        expect(view.text()).toContain("BlueMap turns a Minecraft world into a browsable 3D map");
    });

    it("persists a collapse through `setHomeIntroCollapsed`, read back on the next mount", async () => {
        const first = render();
        const hideButton = first.findAll("button").find((btn) => btn.text() === "Hide the explanation");
        expect(hideButton).toBeDefined();
        await hideButton?.trigger("click");
        expect(first.text()).not.toContain("BlueMap turns a Minecraft world into a browsable 3D map");
        first.unmount();
        wrapper = null;

        const second = render();
        expect(second.text()).not.toContain("BlueMap turns a Minecraft world into a browsable 3D map");
        expect(second.text()).toContain("Show the explanation");
    });

    it("expands again on request", async () => {
        setHomeIntroCollapsed(true);
        const view = render();
        expect(view.text()).toContain("Show the explanation");

        const showButton = view.findAll("button").find((btn) => btn.text() === "Show the explanation");
        await showButton?.trigger("click");
        expect(view.text()).toContain("BlueMap turns a Minecraft world into a browsable 3D map");
    });
});

describe("continuing: only for a returning user with something to continue", () => {
    it("shows nothing to continue on a first launch", () => {
        const view = render();
        expect(view.text()).not.toContain("Continue");
    });

    it("offers every rendered or connected map once one exists, by name", async () => {
        addLocalMap("/renders/overworld", "overworld");
        const view = render();
        await settle();

        expect(view.text()).toContain("Continue");
        expect(view.text()).toContain("Open overworld");
    });

    it("choosing one makes it the active profile and asks for the map tab", async () => {
        const profile = addLocalMap("/renders/overworld", "overworld");
        profilesStore.activeId = null;
        const view = render();
        await settle();

        const openButton = view.findAll("button").find((btn) => btn.text() === "Open overworld");
        await openButton?.trigger("click");

        expect(profilesStore.activeId).toBe(profile.id);
        expect(view.emitted("reveal-page")).toContainEqual(["map"]);
    });
});

describe("search, wired to the project's regex builder like every other search surface", () => {
    it("filters the visible cards down to a plain-text match", async () => {
        const view = render();
        const input = view.find('input[type="text"]');
        await input.setValue("backups");
        await nextTick();

        expect(view.text()).toContain("Backups");
        expect(view.text()).not.toContain("Docs");
    });

    it("offers the regex builder toggle beside the search field", () => {
        const view = render();
        expect(view.find('[aria-label="Search with a regular expression"]').exists()).toBe(true);
    });

    it("says plainly when nothing matches, and offers a way back", async () => {
        const view = render();
        const input = view.find('input[type="text"]');
        await input.setValue("no such capability exists anywhere on this page");
        await nextTick();

        expect(view.text()).toContain("Nothing on Home matches");
        const clear = view.findAll("button").find((btn) => btn.text() === "Clear the search");
        await clear?.trigger("click");
        expect(view.text()).toContain("Get started");
    });
});

describe("every shell-owned action emits rather than acting itself", () => {
    it("emits open-eula for the licence tile", async () => {
        const view = render();
        const button = view
            .findAll("button")
            .find((btn) => btn.attributes("aria-label") === "Open The Minecraft licence");
        expect(button).toBeDefined();
        await button?.trigger("click");
        expect(view.emitted("open-eula")).toBeTruthy();
    });

    it("emits open-settings with the app-wide anchor for the Settings tile", async () => {
        const view = render();
        const button = view.findAll("button").find((btn) => btn.attributes("aria-label") === "Open Settings");
        await button?.trigger("click");
        expect(view.emitted("open-settings")?.[0]).toEqual([null]);
    });

    it("emits open-settings with the github-account anchor for the GitHub account tile", async () => {
        const view = render();
        // "GitHub runners" (a page tile, reveals a page) also contains "GitHub" - matched on
        // the full "GitHub account" title so this does not click the wrong button.
        const button = view.findAll("button").find((btn) => btn.attributes("aria-label") === "Open GitHub account");
        expect(button).toBeDefined();
        await button?.trigger("click");
        expect(view.emitted("open-settings")?.at(-1)).toEqual(["github-account"]);
    });

    it("emits open-config for the server-configuration tile", async () => {
        const view = render();
        const button = view.findAll("button").find((btn) => btn.attributes("aria-label") === "Open Server configuration");
        await button?.trigger("click");
        expect(view.emitted("open-config")?.[0]).toEqual([null]);
    });

    it("emits open-config with 'history' for the config-history tile", async () => {
        const view = render();
        const button = view.findAll("button").find((btn) => btn.attributes("aria-label") === "Open Config folder history");
        await button?.trigger("click");
        expect(view.emitted("open-config")?.[0]).toEqual(["history"]);
    });

    it("emits open-palette for the command-palette tile", async () => {
        const view = render();
        const button = view.findAll("button").find((btn) => btn.attributes("aria-label") === "Open Command palette");
        await button?.trigger("click");
        expect(view.emitted("open-palette")).toBeTruthy();
    });

    it("emits open-welcome from the intro's own \"what is this?\" link", async () => {
        const view = render();
        const button = view.findAll("button").find((btn) => btn.text() === "What is this?");
        await button?.trigger("click");
        expect(view.emitted("open-welcome")).toBeTruthy();
    });
});
