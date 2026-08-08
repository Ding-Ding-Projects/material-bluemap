// @vitest-environment jsdom

/**
 * The palette, mounted.
 *
 * Everything asserted here is a property of the rendered component and could not be checked
 * any other way: that the search box really takes focus when the palette opens, that focus
 * really goes back where it came from when it closes, that an arrow key really lands on the
 * first row, that a switch drawn in the list really writes the setting, and that choosing a
 * destination really emits the value the shell's existing handler expects. The catalogue and
 * the row model are unit-tested next door, where they belong; this file is the wiring, which
 * is exactly the part a green logic test cannot vouch for.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import type { BlueMapApp } from "@worldlens/viewer";
import CommandPalette from "./CommandPalette.vue";
import { usePaletteShortcut } from "./palettePrefs.js";
import { setBlueMapApp } from "../../stores/bluemap.js";

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist. Vuetify's overlay observes its own
    // size, `matchMedia` backs the reduced-motion check, and the rows call `scrollIntoView`
    // through Vuetify's own list handling; without them the mount throws before an assertion.
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

    // Vuetify's overlay positions itself against the visual viewport, which jsdom has no
    // concept of. Without it the dialog throws while opening and nothing renders at all.
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

    /*
     * This jsdom is started without a storage file, so `localStorage` is genuinely absent -
     * which the palette itself handles by keeping the default size and writing nothing. The
     * size test needs somewhere for the preference to land, so a map-backed one is installed
     * here. `defineProperty` rather than assignment because jsdom declares the property.
     */
    const cells = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => {
                cells.set(key, value);
            },
            removeItem: (key: string) => {
                cells.delete(key);
            },
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

/** Just enough of the running viewer for the settings rows to be built and written. */
function fakeApp(): { app: BlueMapApp; state: { debug: boolean; saved: number } } {
    const state = { debug: false, saved: 0 };
    const data = {
        map: { views: ["perspective"], perspectiveView: true, flatView: false, freeFlightView: false },
        uniforms: {
            sunlightStrength: { value: 1 },
            ambientLight: { value: 0 },
            chunkBorders: { value: false },
        },
        superSampling: 1,
        loadedHiresViewDistance: 100,
        loadedLowresViewDistance: 2000,
    };

    const app = {
        settings: { hiresSliderMin: 50, hiresSliderMax: 500, lowresSliderMin: 500, lowresSliderMax: 10000 },
        appState: {
            theme: null,
            debug: false,
            screenshot: { clipboard: false },
            controls: {
                state: "perspective",
                pauseTileLoading: false,
                showZoomButtons: true,
                mouseSensitivity: 1,
                invertMouse: false,
            },
            menu: { openPage: () => {} },
        },
        mapViewer: {
            data,
            markers: { data: { id: "root", markers: [], markerSets: [] } },
            redraw: () => {},
            updateLoadedMapArea: () => {},
            set superSampling(value: number) {
                data.superSampling = value;
            },
        },
        setTheme: () => {},
        setDebug: (value: boolean) => {
            state.debug = value;
        },
        setChunkBorders: () => {},
        saveUserSettings: () => {
            state.saved++;
        },
        saveUserSetting: () => {},
        updateControlsSettings: () => {},
        updatePageAddress: () => {},
        resetCamera: () => {},
        setPerspectiveView: () => {},
        setFlatView: () => {},
        setFreeFlight: () => {},
    };

    return { app: app as unknown as BlueMapApp, state };
}

/** The shell, near enough: the one prop `App.vue` binds and the events it listens for. */
const Host = defineComponent({
    props: { open: { type: Boolean, default: false } },
    emits: [
        "update:open",
        "reveal-setting",
        "open-settings",
        "open-config",
        "open-profiles",
        "open-eula",
        "open-welcome",
    ],
    setup(props, { emit }) {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(CommandPalette, {
                        open: props.open,
                        "onUpdate:open": (value: boolean) => emit("update:open", value),
                        onRevealSetting: (target: unknown) => emit("reveal-setting", target),
                        onOpenSettings: () => emit("open-settings"),
                        onOpenConfig: (screen: unknown) => emit("open-config", screen),
                        onOpenProfiles: () => emit("open-profiles"),
                        onOpenEula: () => emit("open-eula"),
                        onOpenWelcome: () => emit("open-welcome"),
                    }),
                ],
            });
    },
});

let wrapper: VueWrapper<InstanceType<typeof Host>> | null = null;

async function open(): Promise<VueWrapper<InstanceType<typeof Host>>> {
    const mounted = mount(Host, {
        props: { open: false },
        attachTo: document.body,
        global: { plugins: [vuetify, i18n] },
    });
    wrapper = mounted;
    await mounted.setProps({ open: true });
    await nextTick();
    await nextTick();
    return mounted;
}

/** Every row's own focus target, in the order the list renders them. */
function rows(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>("[data-palette-row]")];
}

function searchBox(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(".mb-palette__search input");
    if (input === null) throw new Error("the palette has no search box");
    return input;
}

async function type(text: string): Promise<void> {
    const input = searchBox();
    input.value = text;
    input.dispatchEvent(new Event("input"));
    await nextTick();
    await nextTick();
}

beforeEach(() => {
    setBlueMapApp(null);
    localStorage.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    setBlueMapApp(null);
    document.body.innerHTML = "";
});

describe("opening and closing", () => {
    it("renders nothing until it is opened", () => {
        wrapper = mount(Host, { props: { open: false }, attachTo: document.body, global: { plugins: [vuetify, i18n] } });
        expect(rows()).toHaveLength(0);
    });

    it("lists the app's commands, settings and destinations, and focuses the search box", async () => {
        await open();

        expect(rows().length).toBeGreaterThan(5);
        expect(document.activeElement).toBe(searchBox());
    });

    it("puts focus back where it came from when it closes", async () => {
        const before = document.createElement("button");
        document.body.append(before);
        before.focus();

        const mounted = await open();
        expect(document.activeElement).not.toBe(before);

        await mounted.setProps({ open: false });
        await nextTick();
        expect(document.activeElement).toBe(before);
    });

    it("asks the shell to close when its own close button is pressed", async () => {
        const mounted = await open();
        const close = document.querySelector<HTMLElement>('[aria-label="Close the command palette"]');
        close?.click();
        await nextTick();

        expect(mounted.emitted("update:open")?.at(-1)).toEqual([false]);
    });
});

describe("searching", () => {
    it("filters the list down to what matches", async () => {
        await open();
        const all = rows().length;

        await type("mojang");
        expect(rows().length).toBeLessThan(all);
        expect(document.body.textContent).toContain("Mojang download consent");
    });

    it("says so plainly when nothing matches, rather than showing an empty list", async () => {
        await open();
        await type("zzzz no such thing zzzz");

        expect(rows()).toHaveLength(0);
        expect(document.body.textContent).toContain("Nothing in this app matches that.");
    });

    it("reports a broken regular expression instead of quietly showing the last good result", async () => {
        await open();

        const regexButton = document.querySelector<HTMLElement>('[aria-label="Search with a regular expression"]');
        regexButton?.click();
        await nextTick();

        await type("[unclosed");
        expect(rows()).toHaveLength(0);
        expect(document.body.textContent).toContain("The pattern is not valid");
    });
});

describe("keyboard navigation", () => {
    it("moves from the search box onto the first row on the way down", async () => {
        await open();

        const card = document.querySelector<HTMLElement>(".mb-palette__card");
        card?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        await nextTick();

        const first = rows()[0];
        expect(first?.contains(document.activeElement)).toBe(true);
    });
});

describe("destinations", () => {
    /*
     * "mojang download" rather than "mojang": the licence row (`chrome.eula`) also says
     * Mojang in its own description, and the chrome group is listed ahead of the app
     * settings group, so the bare word now surfaces that command first. This test is about
     * the consent destination specifically, and "mojang download" is in that row's own
     * title and no other row's text.
     */
    it("emits the settings target the shell's existing reveal handler already takes", async () => {
        const mounted = await open();
        await type("mojang download");

        const button = rows()[0]?.querySelector<HTMLElement>("button");
        button?.click();
        await nextTick();

        expect(mounted.emitted("reveal-setting")?.[0]).toEqual([
            { surface: "settings", anchor: "mojang-download-consent", missing: false },
        ]);
        // Having gone somewhere, the palette gets out of the way.
        expect(mounted.emitted("update:open")?.at(-1)).toEqual([false]);
    });

    /*
     * The two docked panels lost their permanent corner buttons, so the palette row wired
     * here (plus each panel's Home card) is the whole of their reachability. "gavel" is one
     * of the licence row's own keywords and appears nowhere else in the catalogue, so it
     * isolates exactly the row this test means to run; "what is this" is the welcome row's
     * own title.
     */
    it("emits open-eula from the licence row, so the shell can open the panel it mounts", async () => {
        const mounted = await open();
        await type("gavel");

        rows()[0]?.querySelector<HTMLElement>("button")?.click();
        await nextTick();

        expect(mounted.emitted("open-eula")).toHaveLength(1);
        expect(mounted.emitted("update:open")?.at(-1)).toEqual([false]);
    });

    it("emits open-welcome from the \"what is this?\" row", async () => {
        const mounted = await open();
        await type("what is this");

        rows()[0]?.querySelector<HTMLElement>("button")?.click();
        await nextTick();

        expect(mounted.emitted("open-welcome")).toHaveLength(1);
        expect(mounted.emitted("update:open")?.at(-1)).toEqual([false]);
    });
});

describe("settings rows are the real control", () => {
    /*
     * This used to search "diagnostics" and take rows()[0] on faith. That stopped being
     * safe once the app settings surface grew its own "Diagnostics" section (repair
     * diagnosis and the guardrailed local-agent repair, per `settingsSections.ts`): that
     * section's own keyword is literally "diagnostics", it is a *destination* rather than
     * a setting, and `buildPaletteCatalog` lists the app-settings group ahead of the
     * viewer's own settings — so "diagnostics" now surfaces that destination row first,
     * ahead of the Debug toggle this test actually means to flip. Filtering preserves
     * catalogue order rather than ranking matches (see `paletteItems.ts`'s own doc
     * comment), so that is not a bug to fix here; the query just stopped being unique.
     *
     * "developer" is one of the Debug toggle's own keywords (`viewerSettings.ts`) and,
     * unlike "debug" itself, does not also appear in "Show chunk borders"' keywords or in
     * the config screens' collapsed-search text (the Core tab's own description mentions
     * "the debug log") — so it isolates exactly the row this test means to exercise.
     */
    it("writes the setting from inside the palette, and persists it", async () => {
        const fake = fakeApp();
        setBlueMapApp(fake.app);

        await open();
        await type("developer");

        const checkbox = rows()[0]?.querySelector<HTMLInputElement>("input[type=checkbox]");
        expect(checkbox, "the Debug row should render a switch, not a label").not.toBeNull();

        checkbox?.click();
        await nextTick();

        expect(fake.state.debug).toBe(true);
        expect(fake.state.saved).toBeGreaterThan(0);
    });
});

/* -------------------------------------------------------------------------- */
/* The shortcut, as a real keystroke on a real window                         */
/* -------------------------------------------------------------------------- */

/**
 * `isPaletteShortcut` is unit-tested next door against five fields of a plain object. That
 * says the predicate is right; it says nothing about whether the listener is bound, bound to
 * the right target, or bound in a phase that a form can beat. This is the other half, and it
 * is here rather than there because it needs a window to dispatch on.
 *
 * The chord is Ctrl+Shift+F. It used to be Ctrl+K, which the documentation site disagreed
 * with, so the case for the old chord is asserted dead: a Ctrl+K that still opened this would
 * be an app answering two shortcuts, which is the thing that got fixed.
 */
describe("the Ctrl+Shift+F binding", () => {
    /**
     * A host that binds the shortcut, which the shared `Host` above deliberately does not.
     *
     * That one takes `open` as a prop so every other test can put the palette in a known state
     * without going through the keyboard. This one is `App.vue`'s actual arrangement - a ref,
     * `usePaletteShortcut` over it, and the palette bound to it - because the thing being
     * tested here is precisely the wiring the other host bypasses.
     */
    const shortcutOpen = ref(false);

    const ShortcutHost = defineComponent({
        setup() {
            usePaletteShortcut(shortcutOpen);
            return () =>
                h(VApp, null, {
                    default: () => [
                        h(CommandPalette, {
                            open: shortcutOpen.value,
                            "onUpdate:open": (value: boolean) => {
                                shortcutOpen.value = value;
                            },
                        }),
                    ],
                });
        },
    });

    function press(target: EventTarget, init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
    }

    function mountHost(): void {
        shortcutOpen.value = false;
        wrapper = mount(ShortcutHost, {
            attachTo: document.body,
            global: { plugins: [vuetify, i18n] },
        }) as unknown as VueWrapper<InstanceType<typeof Host>>;
    }

    it("opens the palette, and closes it again, from Ctrl+Shift+F", async () => {
        mountHost();
        expect(rows()).toHaveLength(0);

        press(window, { key: "F", ctrlKey: true, shiftKey: true });
        await nextTick();
        await nextTick();
        // The rows are the proof the keystroke reached the palette rather than only the ref.
        expect(rows().length).toBeGreaterThan(5);

        // Toggling matters: the same keystroke arriving twice must not leave somebody with a
        // palette they now have to find the Escape key for. Asserted on the state the shell
        // holds rather than on the DOM, because Vuetify's dialog tears its overlay down across
        // a transition and "gone yet?" would be a race rather than a fact.
        press(window, { key: "F", ctrlKey: true, shiftKey: true });
        await nextTick();
        expect(shortcutOpen.value).toBe(false);
    });

    it("swallows the keystroke it acted on, and leaves every other one alone", () => {
        mountHost();

        const handled = press(window, { key: "F", ctrlKey: true, shiftKey: true });
        expect(handled.defaultPrevented).toBe(true);

        // Plain Ctrl+F still belongs to find-in-page, and the old Ctrl+K to nobody here: an
        // app answering both chords is the thing that got fixed.
        expect(press(window, { key: "f", ctrlKey: true }).defaultPrevented).toBe(false);
        expect(press(window, { key: "k", ctrlKey: true }).defaultPrevented).toBe(false);
    });

    it("works from inside a text field, which is why the listener captures", async () => {
        // A palette reachable from anywhere except the form you are filling in is a palette
        // that is missing at the moment people most want it. The listener sits on `window` in
        // the capture phase, so a field that stops propagation cannot beat it to the key.
        mountHost();

        const field = document.createElement("input");
        field.addEventListener("keydown", (event) => {
            event.stopPropagation();
        });
        document.body.append(field);
        field.focus();

        press(field, { key: "F", ctrlKey: true, shiftKey: true });
        await nextTick();
        await nextTick();
        expect(rows().length).toBeGreaterThan(5);
    });
});

describe("size", () => {
    it("opens as a bounded card, and remembers being made full-window", async () => {
        await open();
        expect(document.querySelector(".mb-palette--full")).toBeNull();

        const grow = document.querySelector<HTMLElement>('[aria-label="Fill the window"]');
        grow?.click();
        await nextTick();

        expect(document.querySelector(".mb-palette--full")).not.toBeNull();
        expect(localStorage.getItem("worldlens-palette")).toBe('{"size":"full"}');
    });
});
