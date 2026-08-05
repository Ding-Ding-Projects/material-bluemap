// @vitest-environment jsdom

/**
 * The settings surface, mounted.
 *
 * Every claim this file makes is one that can only be checked against the rendered
 * component: that opening at an anchor really switches to that setting's tab and moves
 * focus onto it, that the row a failed render points at really is the existing consent
 * component rather than a copy of it, that the search really lists the sections it
 * matches and jumps to the one picked, that only the active tab's section is ever
 * mounted, and that the close button really emits. The logic underneath is unit-tested
 * next door in `mapStorageSetting.test.ts`, `javaSetting.test.ts` and
 * `settingsSections.test.ts`; this is the wiring, which is exactly the part that a green
 * logic test cannot vouch for.
 *
 * This jsdom starts without a storage file, so every `TabbedNavigation` this surface
 * mounts gets no persisted layout and seeds its defaults fresh - see the same note in
 * `tabs/TabbedNavigation.test.ts`. That is what keeps one test's tab switch from leaking
 * into the next: nothing here needs to clear a storage key by hand.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import AppSettings from "./AppSettings.vue";
import ConsentSettingsRow from "../setup/ConsentSettingsRow.vue";
import SetupLanguagePanel from "../setup/SetupLanguagePanel.vue";
import { currentPlatform, mapStorageExample, readMapStorageDir } from "../setup/mapStorage.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { reloadSetupLanguage, setLanguageMode } from "../setup/setupI18n.js";
import {
    SETTINGS_ANCHORS,
    SETTINGS_SECTIONS,
    type SettingsSectionAnchor,
} from "./settingsSections.js";

/** The fallback title `sectionCopy` gives each anchor, which is what the tabs read. */
const SECTION_TITLE: Readonly<Record<SettingsSectionAnchor, string>> = {
    "mojang-download-consent": "Mojang download consent",
    "java-runtime": "Java runtime",
    "map-storage-directory": "Where rendered maps go",
    "world-folder": "World folder",
    "github-account": "GitHub account",
    "language-and-tone": "Language and tone",
    "surface-placement": "Where the panels sit",
};

const scrollIntoView = vi.fn();

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist. Vuetify's drawer observes its
    // own size, `matchMedia` backs the reduced-motion check, and `scrollIntoView` is what
    // revealing a section calls; without them the mount throws before any assertion runs.
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

    Element.prototype.scrollIntoView = scrollIntoView;
});

/**
 * A preload that answers the two questions this surface asks of one.
 *
 * Deliberately without `javaRuntime`, because that is the build every user has: the
 * discovery exists in the main process and nothing exposes it, and the surface has to
 * say so rather than show a blank.
 */
function fakeBridge(): Record<string, unknown> {
    return {
        readConsent: () =>
            Promise.resolve({
                accepted: true,
                acceptedAt: "2026-08-03T09:14:00.000Z",
                documentUrl: "https://account.mojang.com/documents/minecraft_eula",
                termsVersion: 1,
                appVersion: "0.1.0",
            }),
        needsFirstRun: () => Promise.resolve(false),
        acceptDownload: () => Promise.resolve({ accepted: true }),
        revokeDownloadConsent: () => Promise.resolve({ accepted: false }),
        mapStorageDirectory: () =>
            Promise.resolve({ current: "/srv/bluemap/maps", default: "/srv/bluemap/maps" }),
        setMapStorageDirectory: (value: string) => Promise.resolve({ ok: true, directory: value }),
        listRenders: () =>
            Promise.resolve([
                {
                    renderId: "r-1",
                    outcome: "finished",
                    engine: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
                    startedAt: "2026-08-02T18:30:00.000Z",
                },
            ]),
    };
}

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
 * The shell, near enough: a layout with the surface inside it, driven by the three props
 * `App.vue` passes and listening for the one event it emits.
 */
const Host = defineComponent({
    props: {
        open: { type: Boolean, default: false },
        anchor: { type: String as PropType<SettingsSectionAnchor | null>, default: null },
        anchorMissing: { type: Boolean, default: false },
    },
    emits: ["update:open"],
    setup(props, { emit }) {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(AppSettings, {
                        open: props.open,
                        anchor: props.anchor,
                        anchorMissing: props.anchorMissing,
                        "onUpdate:open": (value: boolean) => emit("update:open", value),
                    }),
                ],
            });
    },
});

type Host = InstanceType<typeof Host>;

let wrapper: VueWrapper<Host> | null = null;

function open(props: { anchor?: SettingsSectionAnchor | null; anchorMissing?: boolean } = {}): VueWrapper<Host> {
    wrapper = mount(Host, {
        props: { open: true, anchor: props.anchor ?? null, anchorMissing: props.anchorMissing ?? false },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<Host>;
    return wrapper;
}

/** The reveal hops through several ticks: the watcher, the dedupe, the tab switch and the query reset. */
async function settle(): Promise<void> {
    for (let index = 0; index < 8; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/** The section mounted right now, or null when its tab is not the active one. */
function section(anchor: SettingsSectionAnchor): HTMLElement | null {
    return document.querySelector<HTMLElement>(`#mb-setting-${anchor}`);
}

/** The same section, asserted present - for tests where absence is the bug being checked for. */
function requireSection(anchor: SettingsSectionAnchor): HTMLElement {
    const element = section(anchor);
    if (element === null) throw new Error(`no section rendered for ${anchor}`);
    return element;
}

/** Every tab button the strip drew, in strip order. */
function tabButtons(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
}

async function clickTab(anchor: SettingsSectionAnchor): Promise<void> {
    const button = tabButtons().find((candidate) => candidate.textContent?.includes(SECTION_TITLE[anchor]) === true);
    if (button === undefined) throw new Error(`no tab button for ${anchor}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
}

/** The search result list's entries, in the order they are rendered. */
function resultTitles(): string[] {
    return [...document.querySelectorAll(".mb-settings__result-title")].map((el) => el.textContent ?? "");
}

async function clickResult(anchor: SettingsSectionAnchor): Promise<void> {
    const buttons = [...document.querySelectorAll<HTMLElement>(".mb-settings__result")];
    const button = buttons.find((candidate) =>
        candidate.querySelector(".mb-settings__result-title")?.textContent === SECTION_TITLE[anchor],
    );
    if (button === undefined) throw new Error(`no search result for ${anchor}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
    scrollIntoView.mockClear();
    (globalThis as { materialBluemap?: unknown }).materialBluemap = fakeBridge();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
    document.body.innerHTML = "";
});

describe("the surface's tabs", () => {
    it("gives every section its own tab, including the ones no render can link to", async () => {
        open();
        await settle();

        const labels = tabButtons().map((button) => button.textContent ?? "");
        for (const anchor of SETTINGS_SECTIONS) {
            expect(labels.some((label) => label.includes(SECTION_TITLE[anchor]))).toBe(true);
        }
    });

    it("mounts only the active tab's section, exactly like every other tabbed surface", async () => {
        open();
        await settle();

        // The surface opens on its first tab, consent, with no anchor asked for.
        expect(section("mojang-download-consent")).not.toBeNull();
        for (const anchor of SETTINGS_SECTIONS) {
            if (anchor === "mojang-download-consent") continue;
            expect(section(anchor)).toBeNull();
        }

        await clickTab("java-runtime");

        expect(section("java-runtime")).not.toBeNull();
        expect(section("mojang-download-consent")).toBeNull();
    });

    it("mounts the shared tabbed-navigation shell rather than a bespoke strip", async () => {
        open();
        await settle();

        // `.mb-tabs` is `TabbedNavigation`'s own root class. Its presence is what
        // makes every other claim in this describe block - one tab per section,
        // one mounted panel, persistence under a storage key - true by construction
        // rather than by this file re-implementing the strip's own tests.
        expect(document.querySelector(".mb-tabs")).not.toBeNull();
    });
});

describe("every setting a render can point at", () => {
    for (const anchor of SETTINGS_ANCHORS) {
        it(`switches to ${anchor}'s tab, reveals and focuses it when opened at it`, async () => {
            open({ anchor });
            await settle();

            const target = requireSection(anchor);

            expect(scrollIntoView).toHaveBeenCalled();
            expect(scrollIntoView.mock.instances).toContain(target);

            const active = document.activeElement;
            expect(active).not.toBeNull();
            expect(target.contains(active)).toBe(true);
        });
    }

    it("moves focus into the sheet, but onto no particular row, with no anchor", async () => {
        open();
        await settle();

        const active = document.activeElement;
        expect(active).not.toBeNull();
        expect(document.querySelector(".mb-settings__body")).toBe(active);
        // The default tab's section is mounted, but merely opening must not have
        // reached inside it for focus.
        expect(requireSection("mojang-download-consent").contains(active)).toBe(false);
    });

    it("reveals a section a leftover query was covering, by clearing the query first", async () => {
        const host = open();
        await settle();

        const input = document.querySelector<HTMLInputElement>(".mb-config-search input");
        expect(input).not.toBeNull();
        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();

        // A query about the Java runtime has nothing to do with the storage folder,
        // so the match list has to say so rather than being silently irrelevant.
        expect(resultTitles()).toContain(SECTION_TITLE["java-runtime"]);
        expect(resultTitles()).not.toContain(SECTION_TITLE["map-storage-directory"]);

        await host.setProps({ anchor: "map-storage-directory" });
        await settle();

        expect(section("map-storage-directory")).not.toBeNull();
        expect(requireSection("map-storage-directory").contains(document.activeElement)).toBe(true);
        expect(document.querySelector<HTMLInputElement>(".mb-config-search input")?.value).toBe("");
        // The match list itself is gone along with the query, not merely emptied.
        expect(document.querySelector(".mb-settings__results")).toBeNull();
    });
});

describe("the consent setting", () => {
    it("is the existing consent row, mounted, not a second copy of it", async () => {
        open();
        await settle();

        const row = wrapper?.findComponent(ConsentSettingsRow);
        expect(row?.exists()).toBe(true);
        // Its own element, with its own id, inside this surface's consent section.
        expect(requireSection("mojang-download-consent").querySelector("#mb-consent-setting")).not.toBeNull();
        expect(document.querySelectorAll("#mb-consent-setting")).toHaveLength(1);
    });

    it("passes the missing flag through, so the row says why it was opened", async () => {
        open({ anchor: "mojang-download-consent", anchorMissing: true });
        await settle();

        expect(wrapper?.findComponent(ConsentSettingsRow).props("missing")).toBe(true);
    });

    it("does not mount the consent row at all when a different anchor was asked for", async () => {
        open({ anchor: "java-runtime", anchorMissing: true });
        await settle();

        expect(wrapper?.findComponent(ConsentSettingsRow).exists()).toBe(false);
    });
});

describe("the storage folder", () => {
    it("is an editable field, not a label", async () => {
        open({ anchor: "map-storage-directory" });
        await settle();

        const input = document.querySelector<HTMLInputElement>(".mb-storage-setting__field input");
        expect(input).not.toBeNull();
        expect(input?.disabled).toBe(false);
        expect(input?.readOnly).toBe(false);
    });

    it("rejects a relative path: it says so, refuses to save, and stores nothing", async () => {
        open({ anchor: "map-storage-directory" });
        await settle();

        const field = wrapper?.find(".mb-storage-setting__field input");
        await field?.setValue("maps/over/here");
        await settle();

        // The problem is named in the field, in the platform's own notation.
        const text = document.querySelector(".mb-storage-setting")?.textContent ?? "";
        expect(text).toContain("not a full path");

        const save = wrapper?.find("button.mb-storage-setting__save");
        expect(save?.attributes("disabled")).toBeDefined();

        await save?.trigger("click");
        await settle();

        expect(readMapStorageDir()).toBeNull();
    });

    it("saves an absolute path, and reports where it landed", async () => {
        open({ anchor: "map-storage-directory" });
        await settle();

        // Absolute means different things on different platforms, and the surface reads
        // the running one; a POSIX path hard-coded here would be a *relative* path on a
        // Windows runner and the test would be asserting the opposite of its own name.
        const absolute = mapStorageExample(currentPlatform());

        const field = wrapper?.find(".mb-storage-setting__field input");
        await field?.setValue(absolute);
        await settle();

        const save = wrapper?.find("button.mb-storage-setting__save");
        expect(save?.attributes("disabled")).toBeUndefined();

        await save?.trigger("click");
        await settle();

        expect(readMapStorageDir()).toBe(absolute);
        expect(document.querySelector(".mb-storage-setting__saved")?.textContent).toContain(absolute);
    });
});

describe("the Java runtime", () => {
    it("says this build cannot report it rather than showing an empty readout", async () => {
        open({ anchor: "java-runtime" });
        await settle();

        const text = requireSection("java-runtime").textContent ?? "";
        expect(text).toContain("cannot report the Java runtime");
        expect(text).toContain("JAVA_HOME");
    });

    it("quotes the engine the most recent render ran with, labelled as a record", async () => {
        open({ anchor: "java-runtime" });
        await settle();

        const text = requireSection("java-runtime").textContent ?? "";
        expect(text).toContain("BlueMap engine (Java) 5.22-27 on Java 25.0.3");
        expect(text).toContain("not a reading of this machine now");
    });
});

describe("the world folder", () => {
    it("explains that it belongs to a map, and offers no control that would pretend otherwise", async () => {
        open({ anchor: "world-folder" });
        await settle();

        const element = requireSection("world-folder");
        expect(element.textContent).toContain("own world folder");
        expect(element.textContent).toContain("wizard");
        expect(element.querySelectorAll("input")).toHaveLength(0);
    });
});

describe("the GitHub account", () => {
    /*
     * The fake preload above has no GitHub namespace, which is exactly the build most
     * people are running: the main process holds the whole flow and nothing exposes it
     * yet. The section has to say that rather than offer a button that would throw.
     */
    it("says this build cannot sign in, and draws no control that would throw", async () => {
        open({ anchor: "github-account" });
        await settle();

        const element = requireSection("github-account");
        expect(element.textContent).toContain("cannot sign in to GitHub");
        expect(element.textContent).toContain("private repositories");
        expect(element.querySelectorAll("input")).toHaveLength(0);
        expect(element.querySelectorAll("button")).toHaveLength(0);
    });

    it("is found by the surface's own search, and a click there switches to its tab", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("GitHub");
        await settle();

        expect(resultTitles()).toEqual([SECTION_TITLE["github-account"]]);

        await clickResult("github-account");

        expect(section("github-account")).not.toBeNull();
        expect(requireSection("github-account").contains(document.activeElement)).toBe(true);
        // The list closes with the query that produced it.
        expect(document.querySelector<HTMLInputElement>(".mb-config-search input")?.value).toBe("");
    });
});

describe("the language and tone setting", () => {
    /*
     * The point of the section. Before it existed the mode and the two funny levels were
     * reachable only while first-run setup was on screen, so once setup was completed there
     * was no way back to them short of clearing the profile. Mounting the first-run flow's
     * own panel rather than reproducing it is what keeps the two surfaces from disagreeing:
     * one set of controls writes the three persisted keys, so there is no second set to fall
     * out of step with it.
     */
    it("is the first-run flow's own language panel, mounted, not a second copy of it", async () => {
        open({ anchor: "language-and-tone" });
        await settle();

        expect(wrapper?.findComponent(SetupLanguagePanel).exists()).toBe(true);
        expect(requireSection("language-and-tone").querySelector(".mb-setup-language")).not.toBeNull();
        expect(document.querySelectorAll(".mb-setup-language")).toHaveLength(1);
    });

    it("offers the real controls: a mode to pick and one funny slider per language", async () => {
        open({ anchor: "language-and-tone" });
        await settle();

        const element = requireSection("language-and-tone");
        // Three modes, as radios rather than as a label describing the current one.
        expect(element.querySelectorAll('input[type="radio"]').length).toBe(3);
        // Two sliders, and two is the whole claim: one shared slider for both languages
        // would satisfy a screenshot and none of the contract.
        expect(element.querySelectorAll('[role="slider"]').length).toBe(2);
    });

    it("is found by the surface's own search, by a word the panel is showing", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("funny");
        await settle();

        expect(resultTitles()).toContain(SECTION_TITLE["language-and-tone"]);
        expect(resultTitles()).not.toContain(SECTION_TITLE["java-runtime"]);
        expect(resultTitles()).not.toContain(SECTION_TITLE["github-account"]);
    });

    /*
     * This section is the one place where the control that changes the language and the
     * search that indexes it are on the same screen at the same time. So the words the
     * search matches against have to follow the panel as it is used, not as it was when the
     * sheet opened: switch to Cantonese in this row, search in Cantonese, and the match list
     * has to pick it up. It works because the labels are read from the reactive setup state
     * inside the computed rather than snapshotted, and it is pinned here because
     * snapshotting them would break nothing that any other test sees.
     */
    it("re-indexes itself when the mode changes, so a Cantonese search finds it", async () => {
        open({ anchor: "language-and-tone" });
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("搞笑程度");
        await settle();
        expect(resultTitles()).not.toContain(SECTION_TITLE["language-and-tone"]);

        setLanguageMode("yue");
        await settle();

        expect(resultTitles()).toContain(SECTION_TITLE["language-and-tone"]);
    });
});

describe("searching this surface", () => {
    it("is the shared settings search field, with its regex builder attached", async () => {
        open();
        await settle();

        expect(document.querySelector(".mb-config-search")).not.toBeNull();
        // The builder's own activator, which is what `ConfigSearchField` anchors the
        // full `ConfigRegexBuilder` to.
        expect(document.querySelector('[aria-label="Open the regex builder"]')).not.toBeNull();
        expect(document.querySelector('[aria-label="Search with a regular expression"]')).not.toBeNull();
    });

    it("lists only the sections that match, as destinations rather than as hidden content", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();

        expect(resultTitles()).toEqual([SECTION_TITLE["java-runtime"]]);
    });

    it("finds a section by a value that is on screen, not only by its title", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("/srv/bluemap/maps");
        await settle();

        expect(resultTitles()).toContain(SECTION_TITLE["map-storage-directory"]);
        expect(resultTitles()).not.toContain(SECTION_TITLE["java-runtime"]);
    });

    it("says plainly when nothing matches instead of showing an empty list", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("kubernetes");
        await settle();

        expect(document.querySelector(".mb-settings__empty")?.textContent).toContain(
            "No setting on this screen matches",
        );
    });

    it("removes the match list itself, not merely its rows, when the query is cleared", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();
        expect(document.querySelector(".mb-settings__results")).not.toBeNull();

        await field?.setValue("");
        await settle();

        expect(document.querySelector(".mb-settings__results")).toBeNull();
    });

    it("clicking a match switches to that section's tab and focuses it", async () => {
        open();
        await settle();
        // The default tab is consent, so java-runtime is a genuine switch.
        expect(section("java-runtime")).toBeNull();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();

        await clickResult("java-runtime");

        expect(section("java-runtime")).not.toBeNull();
        expect(requireSection("java-runtime").contains(document.activeElement)).toBe(true);
        expect(section("mojang-download-consent")).toBeNull();
    });
});

describe("closing", () => {
    it("emits update:open false from the close button", async () => {
        const host = open();
        await settle();

        // The close button belongs to `DockedSurface` now and names the panel it closes,
        // so a screen reader announces which of several open panels the button acts on.
        await host.find('button[aria-label="Close Settings"]').trigger("click");
        await settle();

        expect(host.emitted("update:open")).toEqual([[false]]);
    });

    it("emits update:open false on Escape", async () => {
        const host = open();
        await settle();

        await host.find(".mb-settings").trigger("keydown.esc");
        await settle();

        expect(host.emitted("update:open")).toEqual([[false]]);
    });

    it("never emits anything by merely being opened", async () => {
        const host = open({ anchor: "java-runtime" });
        await settle();

        expect(host.emitted("update:open")).toBeUndefined();
    });
});
