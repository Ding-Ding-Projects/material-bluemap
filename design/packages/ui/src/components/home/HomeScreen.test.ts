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
import { setHomeIntroCollapsed, setHomeSectionExpanded } from "./homeState.js";
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

/**
 * Every capability id this page has ever offered, split by whether it needs a live viewer.
 *
 * This is the inventory the redesign is held to: the layout above it may be rebuilt as often
 * as it likes, but a card that quietly stops being offered fails here. Written out by hand
 * rather than read from the component, so that deleting a tile cannot also delete the test
 * that would have caught it.
 */
const ALWAYS_PRESENT_IDS = [
    // Get started
    "world",
    "what-is-bluemap",
    "tour",
    // Make and manage maps
    "map",
    "projects",
    "servers",
    "cirender",
    "renders",
    // Share and back up
    "backups",
    "pages",
    // Learn
    "docs",
    "eula",
    // Settings and tools
    "settings",
    "display",
    "github-account",
    "config",
    "config-history",
    "appearance",
    "palette",
    "notice-centre",
    "tab-finder",
];

/** Offered only while a map is actually open, with markers and players on it. */
const LIVE_VIEWER_IDS = [
    "changelog",
    "menu-maps",
    "menu-settings",
    "menu-info",
    "reset-camera",
    "menu-markers",
    "menu-players",
];

/** A viewer with a marker set and a player set, so every conditional card is offered. */
function openALiveMap(): void {
    blueMapApp.value = {
        appState: { menu: { openPage: () => {} } },
        mapViewer: {
            markers: {
                data: {
                    id: "root",
                    markers: [{ id: "spawn" }],
                    markerSets: [{ id: "bm-players", markers: [], markerSets: [] }],
                },
            },
        },
        resetCamera: () => {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a minimal stand-in for the real viewer object
    } as any;
}

/** Every capability card actually in the document, by id. */
function renderedIds(view: VueWrapper): string[] {
    return view.findAll("[data-capability]").map((node) => node.attributes("data-capability") ?? "");
}

/** One section's disclosure button, by the section's stable id. */
function disclosure(view: VueWrapper, sectionId: string) {
    return view.find(`[data-section="${sectionId}"] button`);
}

/** One section's panel, by the section's stable id. */
function panel(view: VueWrapper, sectionId: string) {
    return view.find(`[data-section="${sectionId}"] .mb-home__panel`);
}

describe("every capability that has ever been offered is still offered", () => {
    it("renders exactly the known inventory, once each, with no map open", () => {
        const view = render();
        expect([...renderedIds(view)].sort()).toEqual([...ALWAYS_PRESENT_IDS].sort());
    });

    it("adds the live-viewer capabilities, and drops none of the others, once a map is open", async () => {
        openALiveMap();
        const view = render();
        await settle();

        expect([...renderedIds(view)].sort()).toEqual(
            [...ALWAYS_PRESENT_IDS, ...LIVE_VIEWER_IDS].sort(),
        );
    });

    it("keeps every card reachable: each one carries a real button that opens it", async () => {
        openALiveMap();
        const view = render();
        await settle();

        const unreachable = view
            .findAll("[data-capability]")
            .filter((card) => card.findAll("button").length === 0)
            .map((card) => card.attributes("data-capability"));
        expect(unreachable).toEqual([]);
    });
});

describe("the hero: one obvious next step, weighted as one", () => {
    it("renders the primary capability as the hero rather than as one tile among equals", () => {
        const view = render();
        const hero = view.find("[data-hero]");

        expect(hero.exists()).toBe(true);
        expect(hero.attributes("data-capability")).toBe("world");
        expect(hero.text()).toContain("Make a map");
        expect(hero.text()).toContain("Start here");
    });

    it("opens the guide from the hero's own action", async () => {
        const view = render();
        const cta = view.find("[data-hero] button");
        await cta.trigger("click");
        expect(view.emitted("reveal-page")?.[0]).toEqual(["world"]);
    });

    it("carries exactly one hero, because a page with two primary actions has none", () => {
        const view = render();
        expect(view.findAll("[data-hero]")).toHaveLength(1);
    });

    it("keeps the hero out of the collapsible sections, so it can never be folded away", () => {
        const view = render();
        expect(view.find(".mb-home__panel [data-hero]").exists()).toBe(false);
    });

    it("leaves 'Continue' above the hero for a returning user", async () => {
        addLocalMap("/renders/overworld", "overworld");
        const view = render();
        await settle();

        const html = view.html();
        expect(html.indexOf("mb-home-continue")).toBeGreaterThan(-1);
        expect(html.indexOf("mb-home-continue")).toBeLessThan(html.indexOf("data-hero"));
    });
});

describe("progressive disclosure: the same sections, folded by default", () => {
    it("starts every secondary section collapsed for a newcomer", () => {
        const view = render();
        for (const id of ["make-and-manage", "share", "learn", "settings"]) {
            expect(disclosure(view, id).attributes("aria-expanded"), id).toBe("false");
            expect(panel(view, id).isVisible(), id).toBe(false);
        }
    });

    it("still names what each collapsed section holds, and how many", () => {
        const view = render();
        expect(disclosure(view, "share").text()).toContain("Share and back up (2)");
        expect(disclosure(view, "learn").text()).toContain("Learn (2)");
        expect(disclosure(view, "make-and-manage").text()).toContain("Make and manage maps (5)");
    });

    it("expands one section on request, without expanding its neighbours", async () => {
        const view = render();
        await disclosure(view, "share").trigger("click");
        await nextTick();

        expect(disclosure(view, "share").attributes("aria-expanded")).toBe("true");
        expect(panel(view, "share").isVisible()).toBe(true);
        expect(view.find('[data-capability="backups"]').isVisible()).toBe(true);
        expect(panel(view, "learn").isVisible()).toBe(false);
    });

    it("collapses it again on a second press", async () => {
        const view = render();
        await disclosure(view, "share").trigger("click");
        await nextTick();
        await disclosure(view, "share").trigger("click");
        await nextTick();

        expect(disclosure(view, "share").attributes("aria-expanded")).toBe("false");
        expect(panel(view, "share").isVisible()).toBe(false);
    });

    it("remembers the choice per section, read back on the next mount", async () => {
        const first = render();
        await disclosure(first, "learn").trigger("click");
        await nextTick();
        first.unmount();
        wrapper = null;

        const second = render();
        expect(disclosure(second, "learn").attributes("aria-expanded")).toBe("true");
        expect(panel(second, "learn").isVisible()).toBe(true);
        expect(panel(second, "share").isVisible()).toBe(false);
    });

    it("reads a choice made before this mount out of storage", () => {
        setHomeSectionExpanded("settings", true);
        const view = render();
        expect(panel(view, "settings").isVisible()).toBe(true);
    });

    it("opens every section at once, and remembers that too", async () => {
        const first = render();
        const showAll = first.findAll("button").find((btn) => btn.text() === "Show every section");
        expect(showAll).toBeDefined();
        await showAll?.trigger("click");
        await nextTick();

        for (const id of ["make-and-manage", "share", "learn", "settings"]) {
            expect(panel(first, id).isVisible(), id).toBe(true);
        }
        expect(first.findAll("button").some((btn) => btn.text() === "Hide every section")).toBe(true);

        first.unmount();
        wrapper = null;
        const second = render();
        expect(panel(second, "settings").isVisible()).toBe(true);
    });

    it("closes every section again from the same control", async () => {
        const view = render();
        const showAll = view.findAll("button").find((btn) => btn.text() === "Show every section");
        await showAll?.trigger("click");
        await nextTick();
        const hideAll = view.findAll("button").find((btn) => btn.text() === "Hide every section");
        await hideAll?.trigger("click");
        await nextTick();

        for (const id of ["make-and-manage", "share", "learn", "settings"]) {
            expect(panel(view, id).isVisible(), id).toBe(false);
        }
    });

    it("gives the map's own section the same treatment once a map is open", async () => {
        openALiveMap();
        const view = render();
        await settle();

        expect(disclosure(view, "viewer").text()).toContain("The open map (6)");
        expect(panel(view, "viewer").isVisible()).toBe(false);
        await disclosure(view, "viewer").trigger("click");
        await nextTick();
        expect(view.find('[data-capability="reset-camera"]').isVisible()).toBe(true);
    });
});

describe("a collapsible section is operable without a mouse", () => {
    it("is a real button, so the platform's own Enter and Space handling applies", () => {
        const view = render();
        const control = disclosure(view, "share");
        expect(control.element.tagName).toBe("BUTTON");
        expect(control.attributes("type")).toBe("button");
    });

    it("points aria-controls at the panel it actually opens", async () => {
        const view = render();
        const controls = disclosure(view, "share").attributes("aria-controls");
        expect(controls).toBeTruthy();
        expect(panel(view, "share").attributes("id")).toBe(controls);
    });

    it("sits inside a heading, so the sections are a document outline rather than a wall", () => {
        const view = render();
        const heading = view.find('[data-section="share"] h4');
        expect(heading.exists()).toBe(true);
        expect(heading.find("button").exists()).toBe(true);

        // One page title, and the three regions beneath it are its own headings.
        expect(view.findAll("h2")).toHaveLength(1);
        const regions = view.findAll("h3").map((node) => node.text());
        expect(regions).toContain("Get started");
        expect(regions).toContain("Everything else");
    });
});

describe("searching bypasses the whole layout, collapsed sections included", () => {
    it("finds a card inside a section that is still collapsed", async () => {
        const view = render();
        // Nothing has been expanded: every section is in its newcomer default.
        expect(panel(view, "settings").isVisible()).toBe(false);

        const input = view.find('input[type="text"]');
        await input.setValue("notification centre");
        await nextTick();

        const result = view.find('[data-capability="notice-centre"]');
        expect(result.exists()).toBe(true);
        expect(result.isVisible()).toBe(true);
        expect(view.find(".mb-home__panel").exists()).toBe(false);
    });

    it("searches every capability, not only the ones a section happens to be showing", async () => {
        openALiveMap();
        const view = render();
        await settle();

        const input = view.find('input[type="text"]');
        await input.setValue("point of interest");
        await nextTick();

        // A keyword that only "Markers", inside the collapsed viewer section, carries.
        expect(renderedIds(view)).toEqual(["menu-markers"]);
    });

    it("counts against the whole inventory rather than against what is on screen", async () => {
        const view = render();
        const input = view.find('input[type="text"]');
        await input.setValue("backups");
        await nextTick();

        expect(view.text()).toContain(`of ${ALWAYS_PRESENT_IDS.length} things Home can do`);
    });

    it("puts the guided layout, hero and all, back when the search is cleared", async () => {
        const view = render();
        const input = view.find('input[type="text"]');
        await input.setValue("backups");
        await nextTick();
        expect(view.find("[data-hero]").exists()).toBe(false);

        await input.setValue("");
        await nextTick();
        expect(view.find("[data-hero]").exists()).toBe(true);
        expect([...renderedIds(view)].sort()).toEqual([...ALWAYS_PRESENT_IDS].sort());
    });
});

describe("every capability from the scout's inventory is represented", () => {
    /** Every card in one section, on screen and readable, once that section is opened. */
    function visibleIn(sectionId: string, view: VueWrapper): string[] {
        return view
            .findAll(`[data-section="${sectionId}"] [data-capability]`)
            .filter((card) => card.isVisible())
            .map((card) => card.attributes("data-capability") ?? "");
    }

    it("renders the newcomer's one obvious next step, and the orientation tiles beside it", () => {
        const view = render();
        expect(view.text()).toContain("Make a map");
        expect(view.text()).toContain("What is this?");
        expect(view.text()).toContain("Take the tour");
        // All three are in the always-visible top of the page, not behind a disclosure.
        for (const id of ["world", "what-is-bluemap", "tour"]) {
            expect(view.find(`[data-capability="${id}"]`).isVisible(), id).toBe(true);
        }
    });

    it("renders every page-mapped tile: the map, projects, servers, GitHub runners", async () => {
        setHomeSectionExpanded("make-and-manage", true);
        const view = render();
        await settle();

        expect(view.text()).toContain("Map");
        expect(view.text()).toContain("Projects");
        expect(view.text()).toContain("Maps and servers");
        expect(view.text()).toContain("GitHub runners");
        expect(visibleIn("make-and-manage", view)).toEqual([
            "map",
            "projects",
            "servers",
            "cirender",
            "renders",
        ]);
    });

    it("renders the share group: backups and publishing to Pages", async () => {
        setHomeSectionExpanded("share", true);
        const view = render();
        await settle();

        expect(view.text()).toContain("Backups");
        expect(view.text()).toContain("Publish to Pages");
        expect(visibleIn("share", view)).toEqual(["backups", "pages"]);
    });

    it("renders the learn group: docs and the licence", async () => {
        setHomeSectionExpanded("learn", true);
        const view = render();
        await settle();

        expect(view.text()).toContain("Docs");
        expect(view.text()).toContain("The Minecraft licence");
        expect(visibleIn("learn", view)).toEqual(["docs", "eula"]);
    });

    it("renders the settings and tools group in full", async () => {
        setHomeSectionExpanded("settings", true);
        const view = render();
        await settle();

        expect(view.text()).toContain("Settings");
        expect(view.text()).toContain("Server configuration");
        expect(view.text()).toContain("Config folder history");
        expect(view.text()).toContain("Command palette");
        expect(view.text()).toContain("Notification centre");
        expect(view.text()).toContain("Find a tab");
        expect(visibleIn("settings", view)).toEqual([
            "settings",
            "display",
            "github-account",
            "config",
            "config-history",
            "appearance",
            "palette",
            "notice-centre",
            "tab-finder",
        ]);
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
    // The two gated capabilities live in "Share and back up", which a newcomer sees
    // collapsed; opening it is what these assertions are about the contents of.
    beforeEach(() => {
        setHomeSectionExpanded("share", true);
    });

    it("names the unmet condition for Backups and Publish to Pages before any map is rendered", () => {
        const view = render();
        const matches = view.text().match(/This needs a map rendered on this computer\.[^]*?come back\./g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(2);
        expect(view.text()).toContain("Render one, then come back.");
        expect(view.find('[data-capability="backups"]').isVisible()).toBe(true);
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
    // Every tile below is one press away, but two presses from a newcomer's first view:
    // the sections they live in are opened here so these assertions are about a button
    // somebody can actually see and press.
    beforeEach(() => {
        for (const id of ["make-and-manage", "share", "learn", "settings"]) {
            setHomeSectionExpanded(id, true);
        }
    });

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
