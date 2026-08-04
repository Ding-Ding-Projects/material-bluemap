// @vitest-environment jsdom

/**
 * The maps-and-servers list, mounted.
 *
 * This card is the only place in the application where somebody chooses which map they are
 * looking at, and every claim it makes is a wiring claim rather than a logic one: whether a
 * `role="option"` really carries the row's whole sentence, whether ArrowDown really moves
 * the tab stop as well as the focus ring, whether Enter really closes the card, whether a
 * search really leaves its own field on screen when it matches nothing, whether right-
 * clicking a row really reaches that row's appearance editor and really puts focus back
 * afterwards, and whether the delete gate really refuses a single key. None of those can be
 * shown by testing a helper; all of them can be shown by pressing keys at the real thing.
 *
 * The keyboard assertions are the ones worth defending. A list of clickable rows looks
 * identical to a listbox in a screenshot and is unusable without a mouse, and that failure
 * is invisible to anybody who tests this card the way they use it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VSlider, VSwitch } from "vuetify/components";

import ProfileManager from "./ProfileManager.vue";
import { GATE_TRAVEL_END } from "./confirm/superConfirmGate.js";
import { profilesStore, type ServerProfile } from "../stores/profiles";

/** Where the stand-in `localStorage` below keeps what the stores write. */
const cells = new Map<string, string>();

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist. Vuetify's application wrapper
    // observes its own size and reads media queries, and its overlays ask the document what
    // sits under a point; without them the mount throws before an assertion runs.
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

    Element.prototype.scrollIntoView = function scrollIntoView(): void {};

    // Without this the overlay throws asynchronously, after the assertion that opened it has
    // already passed, and the failure is attributed to whichever test ran next.
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });

    // Both the profile store and the appearance store persist, and jsdom serves this
    // document from an opaque origin where `localStorage` is not available at all. A map
    // rather than the real thing so one test cannot leak a profile list into the next.
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

const vuetify = createVuetify();

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

/**
 * Four rows, because the search field appears above three and the list has to be long
 * enough for ArrowDown, Home and End to mean different things. One of them is a map
 * rendered on this computer, which is the row whose second line is a sentence rather than
 * an address.
 */
const FIXTURES: ServerProfile[] = [
    {
        id: "alpha",
        name: "Alpha Survival",
        url: "https://alpha.example.com/bluemap",
        trustCustomizations: false,
    },
    {
        id: "beta",
        name: "Beta Creative",
        url: "https://beta.example.com/bluemap",
        trustCustomizations: false,
    },
    {
        id: "home",
        name: "Home World",
        url: "",
        trustCustomizations: false,
        dataRoot: "/local/home",
    },
    {
        id: "gamma",
        name: "Gamma Skyblock",
        url: "https://gamma.example.com/bluemap",
        trustCustomizations: false,
    },
];

let host: VueWrapper | null = null;

beforeEach(() => {
    localStorage.clear();
    profilesStore.profiles.splice(
        0,
        profilesStore.profiles.length,
        ...FIXTURES.map((profile) => ({ ...profile })),
    );
    profilesStore.activeId = "beta";
});

afterEach(() => {
    host?.unmount();
    host = null;
    document.body.innerHTML = "";
});

function mountManager(): VueWrapper {
    host = mount(VApp, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n] },
        slots: { default: () => h(ProfileManager) },
    });
    return host;
}

function manager(): VueWrapper {
    if (host === null) throw new Error("the card was never mounted");
    return host.findComponent(ProfileManager) as VueWrapper;
}

async function settle(): Promise<void> {
    await nextTick();
    await nextTick();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await nextTick();
}

function listbox(): HTMLElement {
    const element = document.querySelector<HTMLElement>('[role="listbox"]');
    if (element === null) throw new Error("the list did not render as a listbox");
    return element;
}

function options(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

function optionNamed(name: string): HTMLElement {
    const found = options().find((option) => option.getAttribute("aria-label")?.startsWith(name));
    if (found === undefined) throw new Error(`no option named ${name}`);
    return found;
}

function bodyText(): string {
    return document.body.textContent ?? "";
}

function press(element: HTMLElement, key: string, extra: KeyboardEventInit = {}): void {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
}

function searchInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(".mb-config-search input");
    if (input === null) throw new Error("the search field is not on screen");
    return input;
}

async function search(text: string): Promise<void> {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
}

/* -------------------------------------------------------------------------- */
/* The listbox                                                                */
/* -------------------------------------------------------------------------- */

describe("the list is a listbox", () => {
    it("names itself and offers one option per row", async () => {
        mountManager();
        await settle();

        expect(listbox().getAttribute("aria-label")).toBeTruthy();
        expect(options()).toHaveLength(4);
    });

    it("marks the map that is open as selected, and nothing else", async () => {
        mountManager();
        await settle();

        const selected = options().filter(
            (option) => option.getAttribute("aria-selected") === "true",
        );
        expect(selected).toHaveLength(1);
        expect(selected[0]?.getAttribute("aria-label")).toContain("Beta Creative");
    });

    it("carries exactly one tab stop, on the map that is open", async () => {
        // A row per tab stop would put four presses of Tab between this list and the button
        // under it, and forty once somebody has been using the app for a month.
        mountManager();
        await settle();

        const stops = options().filter((option) => option.getAttribute("tabindex") === "0");
        expect(stops).toHaveLength(1);
        expect(stops[0]?.getAttribute("aria-label")).toContain("Beta Creative");
    });

    it("gives each option the name and the second line, which is what tells two rows apart", async () => {
        mountManager();
        await settle();

        expect(optionNamed("Home World").getAttribute("aria-label")).toBe(
            "Home World, Rendered on this computer",
        );
        expect(optionNamed("Alpha Survival").getAttribute("aria-label")).toBe(
            "Alpha Survival, https://alpha.example.com/bluemap",
        );
    });

    it("still says where a locally rendered map came from rather than leaving the line blank", async () => {
        mountManager();
        await settle();

        expect(optionNamed("Home World").textContent).toContain("Rendered on this computer");
    });
});

describe("moving around the listbox with the keyboard", () => {
    it("moves focus down a row on ArrowDown, and takes the tab stop with it", async () => {
        mountManager();
        await settle();

        press(options()[0] as HTMLElement, "ArrowDown");
        await settle();

        expect(document.activeElement).toBe(options()[1]);
        expect(options()[1]?.getAttribute("tabindex")).toBe("0");
        expect(options()[0]?.getAttribute("tabindex")).toBe("-1");
    });

    it("moves focus up a row on ArrowUp", async () => {
        mountManager();
        await settle();

        press(options()[2] as HTMLElement, "ArrowUp");
        await settle();

        expect(document.activeElement).toBe(options()[1]);
    });

    it("goes to the first row on Home and the last on End", async () => {
        mountManager();
        await settle();

        press(options()[2] as HTMLElement, "End");
        await settle();
        expect(document.activeElement).toBe(options()[3]);

        press(options()[3] as HTMLElement, "Home");
        await settle();
        expect(document.activeElement).toBe(options()[0]);
    });

    it("stops at the ends rather than wrapping round and losing the user's place", async () => {
        mountManager();
        await settle();

        press(options()[0] as HTMLElement, "ArrowUp");
        await settle();
        expect(document.activeElement).toBe(options()[0]);

        press(options()[3] as HTMLElement, "ArrowDown");
        await settle();
        expect(document.activeElement).toBe(options()[3]);
    });

    it("does not open anything while the arrows are moving", async () => {
        // Selection deliberately does not follow focus: activating closes this card, so a
        // list where it did could not be arrowed through at all.
        mountManager();
        await settle();

        press(options()[0] as HTMLElement, "ArrowDown");
        press(options()[1] as HTMLElement, "ArrowDown");
        await settle();

        expect(manager().emitted("close")).toBeUndefined();
        expect(profilesStore.activeId).toBe("beta");
    });

    it("only moves within the rows the search left on screen", async () => {
        mountManager();
        await settle();
        await search("example.com");

        expect(options()).toHaveLength(3);

        press(options()[2] as HTMLElement, "ArrowDown");
        await settle();

        expect(document.activeElement).toBe(options()[2]);
    });
});

describe("opening a map", () => {
    it("opens the focused row on Enter, and closes the card", async () => {
        mountManager();
        await settle();

        press(optionNamed("Gamma Skyblock"), "Enter");
        await settle();

        expect(profilesStore.activeId).toBe("gamma");
        expect(manager().emitted("close")).toHaveLength(1);
    });

    it("opens it on Space too", async () => {
        mountManager();
        await settle();

        press(optionNamed("Home World"), " ");
        await settle();

        expect(profilesStore.activeId).toBe("home");
        expect(manager().emitted("close")).toHaveLength(1);
    });

    it("still opens on a click, because the mouse behaviour did not change", async () => {
        mountManager();
        await settle();

        optionNamed("Alpha Survival").click();
        await settle();

        expect(profilesStore.activeId).toBe("alpha");
        expect(manager().emitted("close")).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */
/* The search                                                                 */
/* -------------------------------------------------------------------------- */

describe("the search", () => {
    it("matches on the name", async () => {
        mountManager();
        await settle();
        await search("skyblock");

        expect(options()).toHaveLength(1);
        expect(options()[0]?.getAttribute("aria-label")).toContain("Gamma Skyblock");
    });

    it("matches on the address, which is what somebody remembers about a server", async () => {
        mountManager();
        await settle();
        await search("beta.example.com");

        expect(options()).toHaveLength(1);
        expect(options()[0]?.getAttribute("aria-label")).toContain("Beta Creative");
    });

    it("matches on the kind, so 'rendered' finds the maps made on this computer", async () => {
        mountManager();
        await settle();
        await search("rendered on this computer");

        expect(options()).toHaveLength(1);
        expect(options()[0]?.getAttribute("aria-label")).toContain("Home World");
    });

    it("says how many of how many are showing, while it is showing fewer", async () => {
        mountManager();
        await settle();
        expect(bodyText()).not.toContain("Showing");

        await search("skyblock");

        expect(bodyText()).toContain("Showing 1 of 4");
    });

    it("says so honestly when nothing matches, and leaves the field on screen to clear", async () => {
        mountManager();
        await settle();
        await search("nothing here is called this");

        expect(options()).toHaveLength(0);
        expect(bodyText()).toContain("Nothing here matches that search");
        // The way out of an empty result is the field itself, so taking it away strands the
        // user in a list that is hiding everything for no visible reason.
        expect(document.querySelector(".mb-config-search")).not.toBeNull();
    });

    it("keeps the field while a query is filtering, even below the row count that summons it", async () => {
        // Four rows and a query, then one row goes: without the second clause in
        // `searchVisible` the field vanishes and its query keeps filtering from nowhere.
        mountManager();
        await settle();
        await search("example.com");

        profilesStore.profiles.splice(0, 1);
        await settle();

        expect(profilesStore.profiles).toHaveLength(3);
        expect(document.querySelector(".mb-config-search")).not.toBeNull();
        expect(searchInput().value).toBe("example.com");
    });

    it("offers the regex builder, like every other search bar in the app", async () => {
        mountManager();
        await settle();

        const builder = [...document.querySelectorAll("button")].find(
            (button) => button.getAttribute("aria-label") === "Open the regex builder",
        );
        expect(builder).not.toBeUndefined();
    });
});

/* -------------------------------------------------------------------------- */
/* Appearance, per map                                                        */
/* -------------------------------------------------------------------------- */

describe("editing one map's appearance", () => {
    it("opens that row's editor from Shift+right-click, named after that row", async () => {
        mountManager();
        await settle();

        optionNamed("Beta Creative").dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        expect(bodyText()).toContain("Appearance of Beta Creative");
    });

    it("offers the row's own commands above the appearance ones, rather than instead of them", async () => {
        mountManager();
        await settle();

        optionNamed("Beta Creative").dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true }),
        );
        await settle();

        const menu = document.querySelector(".mb-appearance-target__menu")?.textContent ?? "";
        expect(menu).toContain("Open this map");
        expect(menu).toContain("Remove Beta Creative");
        expect(menu).toContain("Edit appearance...");
        expect(menu.indexOf("Open this map")).toBeLessThan(menu.indexOf("Edit appearance..."));
    });

    it("returns focus to the row it was opened from", async () => {
        mountManager();
        await settle();

        const row = optionNamed("Gamma Skyblock");
        row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }));
        await settle();

        press(row, "Escape");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(document.activeElement).toBe(optionNamed("Gamma Skyblock"));
    });

    it("gives each row its own editor rather than one shared between them", async () => {
        mountManager();
        await settle();

        optionNamed("Home World").dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        expect(bodyText()).toContain("Appearance of Home World");
        expect(bodyText()).not.toContain("Appearance of Beta Creative");
    });

    it("opens the map from the row menu's own command", async () => {
        mountManager();
        await settle();

        optionNamed("Gamma Skyblock").dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true }),
        );
        await settle();

        const open = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find((item) =>
            item.textContent?.includes("Open this map"),
        );
        open?.click();
        await settle();

        expect(profilesStore.activeId).toBe("gamma");
        expect(manager().emitted("close")).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */
/* Removing one                                                               */
/* -------------------------------------------------------------------------- */

/** Opens the gate anchored to one row's delete button. */
async function openGateFor(name: string): Promise<void> {
    const label = `Remove ${name}`;
    const button = [...document.querySelectorAll<HTMLElement>("button")].find(
        (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (button === undefined) throw new Error(`no delete button for ${name}`);
    button.click();
    await settle();
}

function keys(): VueWrapper[] {
    return manager().findAllComponents(VSwitch) as unknown as VueWrapper[];
}

async function slideToEnd(): Promise<void> {
    manager().findComponent(VSlider).vm.$emit("update:modelValue", GATE_TRAVEL_END);
    await settle();
}

describe("the delete gate", () => {
    it("names the row it is standing in front of", async () => {
        mountManager();
        await settle();
        await openGateFor("Alpha Survival");

        expect(bodyText()).toContain("The entry named Alpha Survival");
        expect(bodyText()).toContain("Only this computer forgets the address");
    });

    it("says what a locally rendered map costs, which is not what a server costs", async () => {
        mountManager();
        await settle();
        await openGateFor("Home World");

        expect(bodyText()).toContain("The rendered tiles stay on the disk");
    });

    it("refuses a slider driven to the end with no keys turned", async () => {
        mountManager();
        await settle();
        await openGateFor("Alpha Survival");
        await slideToEnd();

        expect(profilesStore.profiles.map((profile) => profile.id)).toContain("alpha");
    });

    it("refuses one key and a completed slider", async () => {
        mountManager();
        await settle();
        await openGateFor("Alpha Survival");

        await keys()[0]?.setValue(true);
        await settle();
        await slideToEnd();

        expect(profilesStore.profiles.map((profile) => profile.id)).toContain("alpha");
    });

    it("refuses both keys with the slider only part of the way across", async () => {
        mountManager();
        await settle();
        await openGateFor("Alpha Survival");

        await keys()[0]?.setValue(true);
        await keys()[1]?.setValue(true);
        await settle();
        manager().findComponent(VSlider).vm.$emit("update:modelValue", GATE_TRAVEL_END - 1);
        await settle();

        expect(profilesStore.profiles.map((profile) => profile.id)).toContain("alpha");
    });

    it("removes the row once both keys are turned and the slider has gone all the way", async () => {
        mountManager();
        await settle();
        await openGateFor("Alpha Survival");

        await keys()[0]?.setValue(true);
        await keys()[1]?.setValue(true);
        await settle();
        await slideToEnd();

        expect(profilesStore.profiles.map((profile) => profile.id)).not.toContain("alpha");
        expect(options()).toHaveLength(3);
    });

    it("is reachable from the row menu, through that same one gate", async () => {
        mountManager();
        await settle();

        optionNamed("Alpha Survival").dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true }),
        );
        await settle();

        const remove = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find((item) =>
            item.textContent?.includes("Remove Alpha Survival"),
        );
        remove?.click();
        await settle();

        expect(bodyText()).toContain("Turn both keys");
        expect(profilesStore.profiles.map((profile) => profile.id)).toContain("alpha");
    });
});

/* -------------------------------------------------------------------------- */
/* The form underneath                                                        */
/* -------------------------------------------------------------------------- */

describe("adding a server", () => {
    it("still adds the typed address, opens it, and closes the card", async () => {
        mountManager();
        await settle();

        const fields = [...document.querySelectorAll<HTMLInputElement>(".v-card-text input")].filter(
            (input) => input.closest(".mb-config-search") === null,
        );
        expect(fields).toHaveLength(2);

        for (const [input, value] of [
            [fields[0], "Delta Hardcore"],
            [fields[1], "https://delta.example.com/bluemap"],
        ] as [HTMLInputElement, string][]) {
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await settle();

        const add = [...document.querySelectorAll<HTMLElement>("button")].find((button) =>
            button.textContent?.includes("Add server"),
        );
        add?.click();
        await settle();

        const added = profilesStore.profiles.find((profile) => profile.name === "Delta Hardcore");
        expect(added?.url).toBe("https://delta.example.com/bluemap");
        expect(profilesStore.activeId).toBe(added?.id);
        expect(manager().emitted("close")).toHaveLength(1);
    });
});
