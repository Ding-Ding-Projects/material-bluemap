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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "./App.vue";
import { HomeScreen } from "./components/home/index.js";
import ProfileManager from "./components/ProfileManager.vue";
import { BackupScreen } from "./components/backup/index.js";
import PagesScreen from "./components/pages/PagesScreen.vue";
import WorldRepoScreen from "./components/worldrepo/WorldRepoScreen.vue";
import PreviewScreen from "./components/preview/PreviewScreen.vue";
import { CiRenderScreen } from "./components/cirender/index.js";
import { RunLocationCard } from "./components/remote/index.js";
import { ConfigScreen } from "./components/config/index.js";
import { dismissAll } from "./components/config/notifications.js";
import { CommandPalette } from "./components/palette/index.js";
import { WorldScreen } from "./components/world/index.js";
import { ProjectsScreen } from "./components/project/index.js";
import { AppSettings } from "./components/settings/index.js";
import { EulaSurface } from "./components/eula/index.js";
import { FirstRunSetup, WelcomeSurface } from "./components/setup/index.js";
import { appearanceTargets } from "./components/appearance/index.js";
import { addLocalMap, profilesStore, removeProfile } from "./stores/profiles.js";
import { notices, raiseNotice } from "./stores/notices.js";
import { createProject, withMapAdded } from "./components/project/projectModel.js";

/**
 * Every case in this file mounts the whole shell, and the whole shell is the single most
 * expensive thing this workspace's jsdom suite mounts - a title bar, eleven tab pages'
 * worth of wiring, the appearance system, the command palette, first-run setup and the
 * notification corner, all real components rather than stand-ins. The workspace default of
 * 30s (see `vitest.config.ts`) is nowhere near that on a developer machine - every test here
 * runs in under a second and a half in isolation - but it was measured too close on the
 * self-hosted CI runner this project moved onto, and measurement rather than a doubled
 * guess is what earns this file its own number:
 *
 *   - CI run 31074156612 (commit be82630) failed exactly two of this file's 34 tests, both
 *     with `Error: Test timed out in 30000ms`: "the notification corner > is mounted once
 *     by the shell..." (`App.test.ts:717`) at 43561ms elapsed, and "...shows a message
 *     raised while nothing is open" (`App.test.ts:730`) at 36517ms - the process itself
 *     did not even notice the 30s mark until well past it, which is contention delaying
 *     the timeout's own report, not a test quietly doing 43 seconds of real work.
 *   - The whole file is the tell: that same run logged
 *     `App.test.ts (34 tests | 2 failed) 146739ms` - about 3.3x a clean local run of this
 *     exact file alone (44.37s wall, 24.58s of that in tests). Every other test here mounts
 *     the identical shell and stayed under 30s only by margin, not because it is cheaper.
 *   - It is not this file, or App.vue, getting slower to start: `ProjectEditor.test.ts`, a
 *     comparably heavy jsdom-mount file elsewhere in this package, took 119199ms in that
 *     same CI run against 27.99s run alone locally - roughly the same ~4x factor - while
 *     running concurrently with this file in the other of `vitest.config.ts`'s two pinned
 *     forks. A `TabGroupPicker.typecheck.test.ts` in the same run spent 53941ms shelling
 *     out to `vue-tsc` in that same two-fork pool. Profiling `App.vue`'s own mount path
 *     found nothing eager to blame either: `renderIndicator.reconcile()`, wired in
 *     `onMounted`, resolves near-instantly the moment `window.materialBluemap` is
 *     undefined (true for every test in this file), and `HomeScreen` - the page the shell
 *     opens on by default - has no eager work of its own. Measured here: 952ms and 563ms
 *     mounting alone, 972ms and 606ms mounting early inside a full, two-fork-pinned run of
 *     this workspace's entire 9,329-test suite. The shell is not the regression; the
 *     runner's shared two-process pool getting oversubscribed by other files' real work is.
 *
 * 60s (this codebase's own convention for known-slow, real-world work - see the several
 * `{ timeout: 60_000 }` "on a real disk" describes in `packages/app`) leaves comfortable
 * room above the worst measured 43.5s without pretending a genuine hang would go unnoticed.
 */
vi.setConfig({ testTimeout: 60_000 });

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
        missingWarn: false,
        fallbackWarn: false,
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
const originalBridge = (globalThis as { materialBluemap?: unknown }).materialBluemap;

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
    (globalThis as { materialBluemap?: unknown }).materialBluemap = originalBridge;
});

describe("the tab strip", () => {
    it("separates the shell into twelve pages behind one persistent strip", () => {
        shell();

        expect(tabLabels()).toEqual([
            // Pinned tabs announce that state in their own accessible name - see
            // `TabButton.vue`'s `tabs.strip.pinnedTab` - which is also the proof that Home
            // really did seed pinned rather than merely first in the ordinary region.
            "Home, pinned",
            "Map",
            "Make a map",
            "Projects",
            "GitHub runners",
            // No count in the label: nothing in this shell's fake bridges reports a render in
            // flight, so the always-mounted indicator behind this label reads zero, exactly
            // as it should for a shell with nothing running.
            "Renders",
            "Maps and servers",
            "Backups",
            "Publish to Pages",
            // A world synced into a git repository, and a repository this application already
            // prepared on another computer recognised and adopted - see
            // WorldRepoScreen.vue's own doc comment.
            "World repository",
            // The local twin of Pages: no address for a fake bridge-less shell to have
            // started hosting, so this always mounts as an ordinary, unhosted tab.
            "Watch it live",
            "Docs",
        ]);
    });

    it("reaches Home through its own tab, pinned so it cannot be swept up by a bulk close", async () => {
        const app = shell();

        const homeTab = tabButton("Home, pinned");
        expect(homeTab.closest(".mb-tabs-strip__pinned")).not.toBeNull();

        homeTab.click();
        await settle();

        expect(app.findComponent(HomeScreen).exists()).toBe(true);
    });

    it("reaches the docs browser through its own tab", async () => {
        shell();

        tabButton("Docs").click();
        await settle();

        expect(document.querySelector(".mb-docs")).not.toBeNull();
    });

    it("seeds a brand-new, unmounted workspace open on Home rather than an unexplained tab of eight strangers", () => {
        // What this proves, narrowly: `TabbedNavigation`'s own `seedStrip()` picks the first
        // declared page as the starting tab, and Home is first in `pages`. It says nothing
        // about first-run setup, which has its own test right below - a bare `shell()` mount
        // never drives `FirstRunSetup`'s `finished` event at all, so this alone cannot tell
        // the two apart.
        const app = shell();

        expect(app.findComponent(HomeScreen).exists()).toBe(true);
        expect(document.querySelector(".mb-map-page")).toBeNull();
    });

    it("opens on Home for a fresh install, the moment first-run setup genuinely completes", async () => {
        // The seed test above passing is not proof that a real first-time user ever reaches
        // Home: it never drives first-run setup at all, so it would keep passing unchanged
        // even while `App.vue`'s `onFirstRunFinished` was calling `revealPage(PAGE_WORLD)`
        // directly - which is exactly what shipped, landing every fresh install straight on
        // the wizard and skipping Home every single time. This exercises the actual
        // completion path instead: the same `finished` event `FirstRunSetup` emits on a real
        // "Finish setup" success (proven to fire only on that success by
        // `FirstRunSetup.test.ts`), rather than a workspace pre-seeded in isolation.
        const app = shell();
        expect(app.findComponent(HomeScreen).exists()).toBe(true);

        await app.findComponent(FirstRunSetup).vm.$emit("finished");
        await settle();

        expect(app.findComponent(HomeScreen).exists()).toBe(true);
        expect(document.querySelector(".mb-map-page")).toBeNull();
        expect(app.findComponent(WorldScreen).exists()).toBe(false);
        expect(tabButton("Home, pinned").getAttribute("aria-selected")).toBe("true");
    });

    it("returns a user with a saved workspace to their last active tab, not forced back to Home", () => {
        // The regression the Home fix above could plausibly introduce: a persisted
        // workspace, from a build old enough to have Home but a person who was last looking
        // at "Make a map", must not be yanked back to Home just because the shell mounted.
        // `onFirstRunFinished` only ever fires once, for a genuine first-time completion, so
        // it plays no part in an ordinary returning-user mount - this proves the mount path
        // itself stays exactly as untouched as the task asked.
        cells.set(
            "material-bluemap-tabs",
            JSON.stringify({
                version: 1,
                strips: [
                    {
                        id: "strip-main",
                        label: "Main",
                        windowId: "window-main",
                        windowLabel: "Material BlueMap",
                        tabs: [
                            { id: "t-home", pageId: "home", label: "Home" },
                            { id: "t-map", pageId: "map", label: "Map" },
                            { id: "t-world", pageId: "world", label: "Make a map" },
                        ],
                        groups: [],
                        pinnedOrder: ["t-home"],
                        slots: [],
                        activeTabId: "t-world",
                    },
                ],
            }),
        );

        const app = shell();

        expect(app.findComponent(WorldScreen).exists()).toBe(true);
        expect(app.findComponent(HomeScreen).exists()).toBe(false);
        expect(tabButton("Make a map").getAttribute("aria-selected")).toBe("true");
    });

    it("shows the map-state message once the Map tab is chosen", async () => {
        shell();

        tabButton("Map").click();
        await settle();

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

    it("keeps a project editor's nested tab panel interactive while the shell panel passes map clicks through", async () => {
        const world = "C:/saves/Survival";
        const project = withMapAdded(
            createProject("Survival", { now: "2026-08-06T12:00:00Z", id: "project-1", appVersion: null }),
            { id: "overworld", name: "Overworld", dimension: "minecraft:overworld", world },
        );
        (globalThis as { materialBluemap?: unknown }).materialBluemap = {
            project: {
                listProjects: async () => ({
                    projects: [{
                        world,
                        file: `${world}/material-bluemap.project.json`,
                        id: project.id,
                        name: project.name,
                        maps: project.maps.length,
                        createdAt: project.createdAt,
                        updatedAt: project.updatedAt,
                        fromWizard: project.fromWizard,
                        worldName: "Survival",
                        problem: null,
                    }],
                    scanned: 1,
                    problems: [],
                }),
                readProject: async () => ({ ok: true, project, file: `${world}/material-bluemap.project.json` }),
                writeProject: async () => ({ ok: true, file: `${world}/material-bluemap.project.json` }),
            },
        };

        const app = shell();
        tabButton("Projects").click();
        await settle();
        const row = app.findComponent(ProjectsScreen).find('[role="option"]');
        expect(row.exists()).toBe(true);
        await row.trigger("click");
        await settle();

        const outerPanel = document.querySelector<HTMLElement>(
            ".mb-tabs__panel.mb-shell-primary-panel",
        );
        const nestedPanel = document.querySelector<HTMLElement>(
            ".mb-project-editor__tabs .mb-tabs__panel",
        );
        expect(outerPanel).not.toBeNull();
        expect(nestedPanel).not.toBeNull();
        expect(getComputedStyle(outerPanel!).pointerEvents).toBe("none");
        expect(getComputedStyle(nestedPanel!).pointerEvents).not.toBe("none");

        const core = [...document.querySelectorAll<HTMLElement>('.mb-project-editor__tabs [role="tab"]')]
            .find((tab) => (tab.textContent ?? "").includes("Core"));
        core?.click();
        await settle();
        expect(core?.getAttribute("aria-selected")).toBe("true");
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

    it("takes the CI-render screen's sign-in button to the GitHub row, not to Settings left blind", async () => {
        // `openSettings()` used to be called with no anchor at all for this button, which
        // opened the sheet on whichever tab it last remembered - anywhere but the GitHub
        // sign-in row the button claims to open. A click that looks like it worked and
        // leaves the person exactly where they started is worse than no button.
        const app = shell();
        tabButton("GitHub runners").click();
        await settle();

        app.findComponent(CiRenderScreen).vm.$emit("signIn");
        await settle();

        const settings = app.findComponent(AppSettings);
        expect(settings.props("open")).toBe(true);
        expect(settings.props("anchor")).toBe("github-account");
    });

    it("reaches the Pages-hosting surface through its tab, rather than leaving it in the bundle", async () => {
        const app = shell();
        expect(app.findComponent(PagesScreen).exists()).toBe(false);

        tabButton("Publish to Pages").click();
        await settle();

        expect(app.findComponent(PagesScreen).exists()).toBe(true);
    });

    it("reaches the world-repository surface through its tab, rather than leaving it in the bundle", async () => {
        // The eighth feature this project built - a full sync-and-adopt engine and eleven
        // working IPC channels - and left with no door at all.
        const app = shell();
        expect(app.findComponent(WorldRepoScreen).exists()).toBe(false);

        tabButton("World repository").click();
        await settle();

        expect(app.findComponent(WorldRepoScreen).exists()).toBe(true);
    });

    it("takes an adopted repository's project to the Projects page, open at that world", async () => {
        const app = shell();
        tabButton("World repository").click();
        await settle();

        app.findComponent(WorldRepoScreen).vm.$emit("adopted", "/worlds/andyville");
        await settle();

        expect(tabLabels().some((label) => label !== null && label.startsWith("Projects"))).toBe(true);
        const projects = app.findComponent(ProjectsScreen);
        expect(projects.exists()).toBe(true);
        expect(projects.props("openWorld")).toBe("/worlds/andyville");
    });

    it("routes the world-repository screen's Settings request to the dependency anchor it names", async () => {
        const app = shell();
        tabButton("World repository").click();
        await settle();

        app.findComponent(WorldRepoScreen).vm.$emit("open-settings", "java-runtime");
        await settle();

        const settings = app.findComponent(AppSettings);
        expect(settings.props("open")).toBe(true);
        expect(settings.props("anchor")).toBe("java-runtime");
    });

    it("reaches the live-preview surface through its tab, rather than leaving it in the bundle", async () => {
        const app = shell();
        expect(app.findComponent(PreviewScreen).exists()).toBe(false);

        tabButton("Watch it live").click();
        await settle();

        expect(app.findComponent(PreviewScreen).exists()).toBe(true);
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

describe("\"what is this?\"", () => {
    it("reaches the docked welcome panel through its own FAB, and stays reachable after first run", async () => {
        // Same "built, tested, unreachable" regression the EULA test above guards against,
        // for `WelcomeSurface`'s own claim to be a standalone route rather than only
        // existing inside the welcome step's bundle.
        const app = shell();
        expect(app.findComponent(WelcomeSurface).exists()).toBe(true);
        expect(app.findComponent(WelcomeSurface).props("open")).toBe(false);

        const fab = document.querySelector<HTMLButtonElement>('button[aria-label="What is this?"]');
        expect(fab).not.toBeNull();
        expect(fab?.getAttribute("aria-expanded")).toBe("false");

        const panel = document.querySelector<HTMLElement>('[role="dialog"].mb-welcome-surface');
        expect(panel).not.toBeNull();
        expect(panel?.style.display).toBe("none");

        fab?.click();
        await settle();

        expect(app.findComponent(WelcomeSurface).props("open")).toBe(true);
        expect(fab?.getAttribute("aria-expanded")).toBe("true");
        expect(panel?.style.display).not.toBe("none");
        expect(panel?.textContent).toContain("What is this?");
        expect(panel?.textContent).toContain("BlueMap turns a Minecraft world into a 3D map");
    });

    it("switches to \"Make a map\" and closes itself when \"Start here\" is pressed", async () => {
        const app = shell();
        const fab = document.querySelector<HTMLButtonElement>('button[aria-label="What is this?"]');
        fab?.click();
        await settle();

        const start = [
            ...document.querySelectorAll<HTMLButtonElement>(".mb-welcome-surface button"),
        ].find((candidate) => (candidate.textContent ?? "").trim() === "Start here");
        expect(start, "no 'Start here' button in the panel").not.toBeUndefined();

        start?.click();
        await settle();

        expect(tabButton("Make a map").getAttribute("aria-selected")).toBe("true");
        expect(app.findComponent(WelcomeSurface).props("open")).toBe(false);
    });

    it("lands on Home - not straight on \"Make a map\" - the moment first-run setup genuinely completes", async () => {
        // Deliberately a different destination from the test right above. Pressing "Start
        // here" inside the panel is an explicit, in-the-moment choice by someone already
        // reading the panel's own description of the wizard, and `onWelcomeStart` still
        // sends that click straight to "Make a map" unchanged. Finishing setup without ever
        // opening the panel is not that choice - it is a first-time user's very first
        // moment in the app - and `App.vue`'s `onFirstRunFinished` used to treat the two as
        // the same thing, landing on the wizard directly and skipping Home, the screen built
        // for exactly this moment, every time. `FirstRunSetup` decides for itself whether to
        // show anything with no bridge installed, so its own `finished` event is exercised
        // directly here rather than by driving all four of its steps again -
        // `FirstRunSetup.test.ts` already proves the event fires only on a real success.
        const app = shell();
        await app.findComponent(FirstRunSetup).vm.$emit("finished");
        await settle();

        expect(tabButton("Home, pinned").getAttribute("aria-selected")).toBe("true");
        expect(app.findComponent(HomeScreen).exists()).toBe(true);
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
