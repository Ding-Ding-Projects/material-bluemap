// @vitest-environment jsdom

/**
 * The settings surface, mounted.
 *
 * Every claim this file makes is one that can only be checked against the rendered
 * component: that opening at an anchor really moves focus onto that row, that the row a
 * failed render points at really is the existing consent component rather than a copy of
 * it, that the search really hides sections, that the close button really emits. The
 * logic underneath is unit-tested next door in `mapStorageSetting.test.ts`,
 * `javaSetting.test.ts` and `settingsSections.test.ts`; this is the wiring, which is
 * exactly the part that a green logic test cannot vouch for.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import AppSettings from "./AppSettings.vue";
import ConsentSettingsRow from "../setup/ConsentSettingsRow.vue";
import { currentPlatform, mapStorageExample, readMapStorageDir } from "../setup/mapStorage.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { reloadSetupLanguage } from "../setup/setupI18n.js";
import {
    SETTINGS_ANCHORS,
    SETTINGS_SECTIONS,
    type SettingsAnchor,
    type SettingsSectionAnchor,
} from "./settingsSections.js";

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
        anchor: { type: String as PropType<SettingsAnchor | null>, default: null },
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

function open(props: { anchor?: SettingsAnchor | null; anchorMissing?: boolean } = {}): VueWrapper<Host> {
    wrapper = mount(Host, {
        props: { open: true, anchor: props.anchor ?? null, anchorMissing: props.anchorMissing ?? false },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<Host>;
    return wrapper;
}

/** The reveal hops through several ticks: the watcher, the dedupe, and the query reset. */
async function settle(): Promise<void> {
    for (let index = 0; index < 8; index++) {
        await nextTick();
        await Promise.resolve();
    }
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

function section(anchor: SettingsSectionAnchor): HTMLElement {
    const element = document.querySelector<HTMLElement>(`#mb-setting-${anchor}`);
    if (element === null) throw new Error(`no section rendered for ${anchor}`);
    return element;
}

describe("every setting a render can point at", () => {
    it("renders every section, including the ones no render can link to", async () => {
        open();
        await settle();

        for (const anchor of SETTINGS_SECTIONS) {
            expect(section(anchor).isConnected).toBe(true);
        }
    });

    // The whole promise of the `settings` event: a render that stops offers a link, and
    // the link has to arrive at the control, not merely at the page it lives on.
    for (const anchor of SETTINGS_ANCHORS) {
        it(`reveals and focuses ${anchor} when opened at it`, async () => {
            open({ anchor });
            await settle();

            const target = section(anchor);

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
        for (const anchor of SETTINGS_SECTIONS) {
            expect(section(anchor).contains(active)).toBe(false);
        }
    });

    it("reveals a section the search was hiding, by clearing the search first", async () => {
        const host = open();
        await settle();

        const input = document.querySelector<HTMLInputElement>(".mb-config-search input");
        expect(input).not.toBeNull();
        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();

        expect(section("map-storage-directory").style.display).toBe("none");

        await host.setProps({ anchor: "map-storage-directory" });
        await settle();

        expect(section("map-storage-directory").style.display).not.toBe("none");
        expect(section("map-storage-directory").contains(document.activeElement)).toBe(true);
        expect(document.querySelector<HTMLInputElement>(".mb-config-search input")?.value).toBe("");
    });
});

describe("the consent setting", () => {
    it("is the existing consent row, mounted, not a second copy of it", async () => {
        open();
        await settle();

        const row = wrapper?.findComponent(ConsentSettingsRow);
        expect(row?.exists()).toBe(true);
        // Its own element, with its own id, inside this surface's consent section.
        expect(section("mojang-download-consent").querySelector("#mb-consent-setting")).not.toBeNull();
        expect(document.querySelectorAll("#mb-consent-setting")).toHaveLength(1);
    });

    it("passes the missing flag through, so the row says why it was opened", async () => {
        open({ anchor: "mojang-download-consent", anchorMissing: true });
        await settle();

        expect(wrapper?.findComponent(ConsentSettingsRow).props("missing")).toBe(true);
    });

    it("does not tell the row it was the missing one when a different anchor was asked for", async () => {
        open({ anchor: "java-runtime", anchorMissing: true });
        await settle();

        expect(wrapper?.findComponent(ConsentSettingsRow).props("missing")).toBe(false);
    });
});

describe("the storage folder", () => {
    it("is an editable field, not a label", async () => {
        open();
        await settle();

        const input = document.querySelector<HTMLInputElement>(".mb-storage-setting__field input");
        expect(input).not.toBeNull();
        expect(input?.disabled).toBe(false);
        expect(input?.readOnly).toBe(false);
    });

    it("rejects a relative path: it says so, refuses to save, and stores nothing", async () => {
        open();
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
        open();
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
        open();
        await settle();

        const text = section("java-runtime").textContent ?? "";
        expect(text).toContain("cannot report the Java runtime");
        expect(text).toContain("JAVA_HOME");
    });

    it("quotes the engine the most recent render ran with, labelled as a record", async () => {
        open();
        await settle();

        const text = section("java-runtime").textContent ?? "";
        expect(text).toContain("BlueMap engine (Java) 5.22-27 on Java 25.0.3");
        expect(text).toContain("not a reading of this machine now");
    });
});

describe("the world folder", () => {
    it("explains that it belongs to a map, and offers no control that would pretend otherwise", async () => {
        open();
        await settle();

        const element = section("world-folder");
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
        open();
        await settle();

        const element = section("github-account");
        expect(element.textContent).toContain("cannot sign in to GitHub");
        expect(element.textContent).toContain("private repositories");
        expect(element.querySelectorAll("input")).toHaveLength(0);
        expect(element.querySelectorAll("button")).toHaveLength(0);
    });

    it("is found by the surface's own search, like every other section", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("GitHub");
        await settle();

        expect(section("github-account").style.display).not.toBe("none");
        expect(section("java-runtime").style.display).toBe("none");
        expect(section("map-storage-directory").style.display).toBe("none");
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

    it("filters the sections down to the ones that match", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();

        expect(section("java-runtime").style.display).not.toBe("none");
        expect(section("mojang-download-consent").style.display).toBe("none");
        expect(section("map-storage-directory").style.display).toBe("none");
        expect(section("world-folder").style.display).toBe("none");
        expect(section("github-account").style.display).toBe("none");
    });

    it("finds a section by a value that is on screen, not only by its title", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("/srv/bluemap/maps");
        await settle();

        expect(section("map-storage-directory").style.display).not.toBe("none");
        expect(section("java-runtime").style.display).toBe("none");
    });

    it("says plainly when nothing matches instead of showing an empty column", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("kubernetes");
        await settle();

        expect(document.querySelector(".mb-settings__empty")?.textContent).toContain(
            "No setting on this screen matches",
        );
    });

    it("puts every section back when the query is cleared", async () => {
        open();
        await settle();

        const field = wrapper?.find(".mb-config-search input");
        await field?.setValue("JAVA_HOME");
        await settle();
        await field?.setValue("");
        await settle();

        for (const anchor of SETTINGS_SECTIONS) {
            expect(section(anchor).style.display).not.toBe("none");
        }
    });
});

describe("closing", () => {
    it("emits update:open false from the close button", async () => {
        const host = open();
        await settle();

        await host.find('button[aria-label="Close settings"]').trigger("click");
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
