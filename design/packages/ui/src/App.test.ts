// @vitest-environment jsdom

/**
 * The shell, mounted, from the outside.
 *
 * Every claim here is about a door rather than about a room. The tab system, the appearance
 * editor, the options editor, the notification corner and the surfaces behind them are all
 * tested on their own next door; what none of those tests can see is whether anything in the
 * running application ever reaches them. This project's recurring defect is a finished feature
 * nobody can open, so these assertions start where a user starts - at a tab or a button in the
 * corner - and go through the rendered DOM rather than through the component's internals.
 *
 * Three things are checked that only a mounted shell can answer: that Escape gives the focus
 * back to the button that opened the surface, that exactly one notification corner is on
 * screen, and that a feature reachable from two places does not end up with two competing ways
 * in. All three are invisible to a test that pokes at state.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "./App.vue";
import ProfileManager from "./components/ProfileManager.vue";
import { BackupScreen } from "./components/backup/index.js";
import PagesScreen from "./components/pages/PagesScreen.vue";
import { CiRenderScreen } from "./components/cirender/index.js";
import { RunLocationCard } from "./components/remote/index.js";
import { ConfigScreen } from "./components/config/index.js";
import { dismissAll } from "./components/config/notifications.js";
import { CommandPalette } from "./components/palette/index.js";
import { WorldScreen } from "./components/world/index.js";
import { ProjectsScreen } from "./components/project/index.js";
import { AppSettings } from "./components/settings/index.js";
import { EulaSurface } from "./components/eula/index.js";
import { appearanceTargets } from "./components/appearance/index.js";
import { addLocalMap, profilesStore, removeProfile } from "./stores/profiles.js";
import { notices, raiseNotice } from "./stores/notices.js";

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist: Vuetify's overlays observe their
    // own size, `matchMedia` backs the theme bridge's prefers-color-scheme check, and
    // `scrollIntoView` is called by the settings surface. Without them the mount throws
    // before any assertion runs.
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

    // Vuetify's reposition scroll strategy asks the document what is under a point, which
    // jsdom does not implement at all. Without this the anchored appearance editor throws
    // asynchronously, after the assertion that opened it has already passed, and the failure
    // surfaces as an unhandled rejection attributed to whichever test ran next.
    document.elementsFromPoint = (): Element[] => [];

    // Focus lands back on a tooltip activator, which opens the tooltip, which positions
    // itself against `visualViewport` - implemented by every browser this ships in and by
    // no version of jsdom.
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

/** Registered as `vuetify.ts` registers them; `createVuetify()` alone registers nothing. */
const vuetify = createVuetify({ components, directives });

/** The options `i18n.ts` ships: no messages, so every key falls back to its English string. */
function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/**
 * The storage this jsdom does not ship with.
 *
 * The tab layout, the appearance state and the profile list all persist, and this environment
 * starts without `localStorage` at all - which every one of them survives, and which would
 * make the layout assertions here meaningless because a tab strip that cannot remember
 * anything cannot be shown to have started fresh. A map rather than the real thing so one case
 * cannot leak a layout into the next.
 */
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

let wrapper: VueWrapper | null = null;

/**
 * With no profile active and no stored tab layout, the shell seeds one tab per page and opens
 * on the first of them. No bridge is installed, so nothing here can touch a disk.
 */
function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

/** Several ticks: opening the surface focuses it on the next one, and it mounts on another. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function configFab(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Server configuration"]',
    );
    if (button === null) throw new Error("the shell renders no configuration button");
    return button;
}

/** The full-bleed host, identified the way a screen reader finds it. */
function configHost(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        '[role="region"][aria-label="Server configuration"]',
    );
}

/**
 * A tab, found by the name it is announced under.
 *
 * An unpinned tab with no unsaved work announces exactly its visible label, so this is also
 * the string on screen; the assertions read better for saying it once.
 */
/**
 * The shell's own strip, not every tablist in the document.
 *
 * Scoped deliberately. A page is free to contain tabs of its own - the project editor has
 * seven, and other surfaces have their own - so an unscoped `[role="tab"]` query answers a
 * different question from the one these assertions ask, and starts failing the day an
 * unrelated surface grows a tab strip. What is being asserted here is the shell's pages.
 */
function shellTabs(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.mb-shell-tabs [role="tab"]')];
}

function tabButton(label: string): HTMLElement {
    const node = shellTabs().find((tab) => tab.getAttribute("aria-label") === label);
    if (node === undefined) throw new Error(`the shell renders no tab labelled ${label}`);
    return node;
}

function tabLabels(): (string | null)[] {
    return shellTabs().map((node) => node.getAttribute("aria-label"));
}

beforeEach(() => {
    dismissAll(notices);
    notices.history.length = 0;
    // The tab layout and the appearance state both persist, and jsdom keeps one storage for
    // the whole file. Cleared so each case starts on the seeded layout rather than on
    // whichever page the case before it navigated to.
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
});

describe("the tab strip", () => {
    it("separates the shell into eight pages behind one persistent strip", () => {
        shell();

        expect(tabLabels()).toEqual([
            "Map",
            "Make a map",
            "Projects",
            "GitHub runners",
            "Maps and servers",
            "Backups",
            "Publish to Pages",
            "Docs",
        ]);
    });

    it("reaches the docs browser through its own tab", async () => {
        shell();

        tabButton("Docs").click();
        await settle();

        expect(document.querySelector(".mb-docs")).not.toBeNull();
    });

    it("opens on the map, which is where the map-state message lives", () => {
        shell();

        expect(document.querySelector(".mb-map-page")).not.toBeNull();
        expect(document.querySelector(".mb-map-state")?.textContent).toContain("No map loaded.");
    });

    it("reaches the wizard through its tab rather than through having no profile", async () => {
        // The wizard used to appear only because `profilesStore.activeId` was null, which made
        // it unreachable the moment a map was open. A tab is a door that is always there.
        const app = shell();
        expect(app.findComponent(WorldScreen).exists()).toBe(false);

        tabButton("Make a map").click();
        await settle();

        expect(app.findComponent(WorldScreen).exists()).toBe(true);
        expect(document.querySelector(".mb-map-page")).toBeNull();
    });

    it("reaches the maps-and-servers list through its tab, and offers no second door to it", async () => {
        const app = shell();

        // The floating button that used to open this as an overlay is gone: a tab and a FAB
        // reaching the same surface are two navigation models arguing on one screen.
        expect(document.querySelector('button[aria-label="Servers"]')).toBeNull();

        tabButton("Maps and servers").click();
        await settle();

        expect(app.findComponent(ProfileManager).exists()).toBe(true);
    });

    it("reaches the projects surface through its tab, rather than only existing in the bundle", async () => {
        // The whole feature is "configure every map setting before rendering starts", and a
        // configuration surface nobody can open configures nothing. This project has shipped
        // five features that were built, tested and unreachable; a tab test is cheap.
        const app = shell();
        expect(app.findComponent(ProjectsScreen).exists()).toBe(false);

        tabButton("Projects").click();
        await settle();

        expect(app.findComponent(ProjectsScreen).exists()).toBe(true);
    });

    it("takes the wizard's finished project to that same page", async () => {
        // The guide writes a project file and offers to open it. Without this the offer
        // would be a button that changes nothing, which is the dead end the project format
        // exists to remove.
        const app = shell();
        tabButton("Make a map").click();
        await settle();

        app.findComponent(WorldScreen).vm.$emit("open-project", "C:/saves/Survival");
        await settle();

        expect(app.findComponent(ProjectsScreen).exists()).toBe(true);
        expect(app.findComponent(ProjectsScreen).props("openWorld")).toBe("C:/saves/Survival");
    });

    it("reaches the backup screen through its tab, rather than only existing in the bundle", async () => {
        // This project has shipped five features that were built, tested and unreachable.
        // A tab test is cheap; discovering a whole subsystem has no door is not.
        const app = shell();
        expect(app.findComponent(BackupScreen).exists()).toBe(false);

        tabButton("Backups").click();
        await settle();

        expect(app.findComponent(BackupScreen).exists()).toBe(true);
    });

    it("reaches the GitHub-runners surface through its tab, rather than only existing in the bundle", async () => {
        // The seventh feature this project built, tested and left with no door. The whole
        // path works - the main process registers it and the preload exposes all six
        // channels - so what was missing was one tab.
        const app = shell();
        expect(app.findComponent(CiRenderScreen).exists()).toBe(false);

        tabButton("GitHub runners").click();
        await settle();

        expect(app.findComponent(CiRenderScreen).exists()).toBe(true);
    });

    it("reaches the Pages-hosting surface through its tab, rather than leaving it in the bundle", async () => {
        const app = shell();
        expect(app.findComponent(PagesScreen).exists()).toBe(false);

        tabButton("Publish to Pages").click();
        await settle();

        expect(app.findComponent(PagesScreen).exists()).toBe(true);
    });

    it("puts the choice of where a render runs on the page where a render is started", async () => {
        // Three of the four places a render can go were reachable only from the bundle:
        // the local-versus-container choice and the whole SSH path had no control anywhere
        // in the application. This is that door.
        const app = shell();
        expect(app.findComponent(RunLocationCard).exists()).toBe(false);

        tabButton("Make a map").click();
        await settle();

        const card = app.findComponent(RunLocationCard);
        expect(card.exists()).toBe(true);
        // All four answers named in one place, rather than three screens to find separately.
        expect(card.text()).toContain("On this computer");
        expect(card.text()).toContain("In a container on this computer");
        expect(card.text()).toContain("On another machine, over SSH");
        expect(card.text()).toContain("GitHub");
    });

    it("takes the guide's fourth choice to the GitHub-runners page", async () => {
        // The card names four places and can only start three of them; the fourth is a
        // workflow with a page of its own, and this is the link between them.
        const app = shell();
        tabButton("Make a map").click();
        await settle();

        app.findComponent(WorldScreen).vm.$emit("open-ci-render");
        await settle();

        expect(app.findComponent(CiRenderScreen).exists()).toBe(true);
    });

    it("sends the palette's server destination to that same page", async () => {
        const app = shell();

        app.findComponent(CommandPalette).vm.$emit("open-profiles");
        await settle();

        expect(app.findComponent(ProfileManager).exists()).toBe(true);
    });

    it("takes the user to the map when a map is chosen from another page", async () => {
        // Choosing a map on the server list, or finishing a render in the wizard, would
        // otherwise load the map correctly and invisibly behind the page still on screen.
        const app = shell();
        tabButton("Maps and servers").click();
        await settle();
        expect(app.findComponent(ProfileManager).exists()).toBe(true);

        profilesStore.activeId = addLocalMap("/renders/overworld", "overworld").id;
        await settle();

        expect(document.querySelector(".mb-map-page")).not.toBeNull();
        expect(app.findComponent(ProfileManager).exists()).toBe(false);
    });
});

describe("the settings surface closing", () => {
    it("tells the pages underneath, so a setting changed in it is not read once and forgotten", async () => {
        // The shell is the only thing that sees this happen: Settings is an in-app dialog,
        // not another window, so nothing underneath it gets a focus or visibility event.
        // Mojang download consent is changed in there, and the wizard used to sample it once
        // at mount - which made the review step's own "Open the setting" remedy a dead end.
        const app = shell();
        tabButton("Make a map").click();
        await settle();

        const before = app.findComponent(WorldScreen).props("settingsEpoch");

        const settings = document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
        expect(settings).not.toBeNull();
        settings?.click();
        await settle();

        app.findComponent(AppSettings).vm.$emit("update:open", false);
        await settle();

        expect(app.findComponent(WorldScreen).props("settingsEpoch")).not.toBe(before);
    });
});

describe("the licence viewer", () => {
    it("reaches the docked EULA panel through its own FAB, rather than only existing in the bundle", async () => {
        // EulaSurface's own doc comment claims a standalone route ("mount one in the shell
        // and open it from anywhere"), but nothing ever mounted it - it was built, tested
        // and unreachable, the same defect the tab tests above catch for other surfaces.
        // Before the fix `findComponent(EulaSurface)` returns a wrapper that does not exist
        // at all, because App.vue never imported the component.
        const app = shell();
        expect(app.findComponent(EulaSurface).exists()).toBe(true);
        expect(app.findComponent(EulaSurface).props("open")).toBe(false);

        const fab = document.querySelector<HTMLButtonElement>(
            'button[aria-label="The Minecraft licence"]',
        );
        expect(fab).not.toBeNull();
        expect(fab?.getAttribute("aria-expanded")).toBe("false");

        const panel = document.querySelector<HTMLElement>('[role="dialog"].mb-eula-surface');
        expect(panel).not.toBeNull();
        expect(panel?.style.display).toBe("none");

        fab?.click();
        await settle();

        expect(app.findComponent(EulaSurface).props("open")).toBe(true);
        expect(fab?.getAttribute("aria-expanded")).toBe("true");
        expect(panel?.style.display).not.toBe("none");
        expect(panel?.textContent).toContain("The Minecraft licence");
    });
});

describe("the shell's appearance targets", () => {
    it("registers the title bar and the tab bar, so the editor can be pointed at them", () => {
        shell();

        const ids = appearanceTargets().value.map((entry) => entry.id);
        expect(ids).toContain("app.titleBar");
        expect(ids).toContain("app.tabBar");
    });

    it("opens the anchored editor straight from a Shift+right-click on the tab bar", async () => {
        shell();

        const target = document.querySelector<HTMLElement>(".mb-shell-tabs .mb-appearance-target");
        expect(target).not.toBeNull();

        target?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }));
        await settle();

        expect(document.body.textContent).toContain("Appearance of The tab bar");
    });
});

describe("the configuration button", () => {
    it("sits with the other shell controls and says it opens nothing yet", () => {
        shell();

        expect(configFab().getAttribute("aria-expanded")).toBe("false");
        expect(configHost()).toBeNull();
    });

    it("opens the editor into a full-bleed host rather than a floating card", async () => {
        const app = shell();

        configFab().click();
        await settle();

        const host = configHost();
        expect(host).not.toBeNull();
        expect(host?.classList.contains("mb-world-host")).toBe(true);
        expect(app.findComponent(ConfigScreen).exists()).toBe(true);
        expect(configFab().getAttribute("aria-expanded")).toBe("true");
    });

    it("leaves the page behind it mounted but inert, so four steps of work survive a look at the config", async () => {
        const app = shell();
        tabButton("Make a map").click();
        await settle();
        expect(app.findComponent(WorldScreen).exists()).toBe(true);

        configFab().click();
        await settle();

        // The whole tabbed shell goes inert rather than the one page, because the strip is
        // behind the editor's opaque surface too and a tab nobody can see is a tab nobody
        // should be able to reach with Tab.
        expect(app.findComponent(WorldScreen).exists()).toBe(true);
        expect(document.querySelector(".mb-shell-tabs")?.hasAttribute("inert")).toBe(true);
    });

    it("closes on Escape and hands the focus back to itself", async () => {
        const app = shell();

        configFab().click();
        await settle();

        const host = configHost();
        expect(document.activeElement).toBe(host);

        await app.find('[role="region"][aria-label="Server configuration"]').trigger("keydown", {
            key: "Escape",
        });
        await settle();

        expect(configHost()).toBeNull();
        expect(document.activeElement).toBe(configFab());
    });
});

describe("the notification corner", () => {
    it("is mounted once by the shell, whether or not the editor is open", async () => {
        shell();

        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(1);

        configFab().click();
        await settle();

        // Two mounted corners would paint two fixed stacks and show every notice twice,
        // which is the whole reason the editor no longer carries one of its own.
        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(1);
    });

    it("shows a message raised while nothing is open", async () => {
        shell();

        raiseNotice("warning", "The render engine is not installed.");
        await settle();

        expect(document.querySelector(".mb-config-notices")?.textContent).toContain(
            "The render engine is not installed.",
        );
    });
});

describe("a saved config folder", () => {
    it("closes the surface and names the folder that was written", async () => {
        const app = shell();

        configFab().click();
        await settle();

        app.findComponent(ConfigScreen).vm.$emit("saved", "/srv/bluemap/config");
        await settle();

        expect(configHost()).toBeNull();
        expect(document.activeElement).toBe(configFab());
        expect(document.querySelector(".mb-config-notices")?.textContent).toContain(
            "Saved the BlueMap configuration in /srv/bluemap/config.",
        );
    });
});
