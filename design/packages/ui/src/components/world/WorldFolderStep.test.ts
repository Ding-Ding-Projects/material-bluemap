// @vitest-environment jsdom

/**
 * The door from "I have no world" to a world on this machine.
 *
 * Every claim here is about a chain rather than about a component. The downloads surface is
 * tested on its own next door, and what that test cannot see is whether anything in the
 * running application ever reaches it. This project's recurring defect is a finished
 * feature nobody can open, so these assertions start where a person starts, at the first
 * step of the create-a-map wizard, and go through the rendered DOM.
 *
 * The second test deliberately mounts {@link WorldScreen} rather than the step, and hands
 * it no downloads bridge at all: the surface is three components below, and the only way it
 * can find a bridge from there is by feature-detecting the preload itself. That is exactly
 * what happens in the shipped application, and it is the part a props-only test would
 * quietly skip.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import WorldFolderStep from "./WorldFolderStep.vue";
import WorldScreen from "./WorldScreen.vue";
import { uncheckedWorld } from "./worldFolder.js";
import type { DownloadBridge, DownloadEvent, DownloadResult } from "../downloads/downloadBridge.js";

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
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const CONTENT = "/var/maps/downloads/test-world-seed-1739-zip-6640a521/content";

/** A preload with only the download half of the bridge, which is all this needs. */
function fakePreload() {
    const listeners: ((event: DownloadEvent) => void)[] = [];
    const bridge: DownloadBridge = {
        discoverRelease: async () => ({
            ok: true,
            release: {
                tag: "v1.4.0",
                name: "Har Gow",
                htmlUrl: "https://github.com/owner/repo/releases/tag/v1.4.0",
                downloads: [{ name: "test-world-seed-1739.zip", split: true, parts: 3, bytes: 4_030_000_000 }],
            },
        }),
        startDownload: async () => await new Promise<DownloadResult>(() => undefined),
        cancelDownload: async () => true,
        activeDownloads: async () => [],
        listDownloads: async () => [],
        onDownloadEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        canCancel: true,
        canList: true,
        canSeeActive: true,
    };

    return {
        bridge,
        emit(event: DownloadEvent): void {
            for (const listener of [...listeners]) listener(event);
        },
        /** One download, from nothing to a verified folder on disk. */
        finish(): void {
            this.emit({
                type: "started",
                downloadId: "world-abc",
                asset: "test-world-seed-1739.zip",
                release: "v1.4.0",
                parts: 3,
                bytesTotal: 4_030_000_000,
                at: "t0",
            });
            this.emit({
                type: "finished",
                downloadId: "world-abc",
                archive: "/var/maps/downloads/test-world-seed-1739-zip-6640a521/test-world-seed-1739.zip",
                content: CONTENT,
                bytes: 4_030_000_000,
                sha256: "6640a521a88283195b790c8bdf6ca176e480c2f9399a8163153d02a2c5b72083",
                durationMs: 254_000,
                at: "t9",
            });
        },
    };
}

const vuetify = createVuetify();

function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function button(wrapper: VueWrapper, text: string) {
    const found = wrapper.findAll("button").find((candidate) => candidate.text().includes(text));
    if (found === undefined) {
        throw new Error(`no button says "${text}". Buttons: ${wrapper.findAll("button").map((b) => b.text()).join(" | ")}`);
    }
    return found;
}

describe("the folder step's way out for somebody with no world", () => {
    it("keeps the downloader folded away until it is asked for", () => {
        const fake = fakePreload();
        const wrapper = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: fake.bridge,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        const disclosure = button(wrapper, "Download one from a release");
        expect(disclosure.attributes("aria-expanded")).toBe("false");
        expect(wrapper.text()).not.toContain("A release can carry a whole Minecraft world");

        wrapper.unmount();
    });

    /**
     * `aria-expanded` on its own only tells a screen reader that *something* changed;
     * without `aria-controls` naming the revealed region's id there is no programmatic way
     * to jump there - the same gap this project already closed for its other disclosures
     * (RenderRunPanel's detail and log panels, DownloadRowCard's, BackupRunCard's, and the
     * rest of the `aria-expanded`-without-`aria-controls` batch).
     */
    it("points the downloads disclosure's aria-controls at the id of the region it reveals", async () => {
        const fake = fakePreload();
        const wrapper = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: fake.bridge,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        const toggle = button(wrapper, "Download one from a release");
        const controls = toggle.attributes("aria-controls");
        expect(controls).toBeTruthy();
        // Collapsed, so there is nothing yet for aria-controls to point at - fine as long
        // as the id appears the moment the region does.
        expect(wrapper.find(`#${controls}`).exists()).toBe(false);

        await toggle.trigger("click");
        await flushPromises();

        const region = wrapper.find(`#${controls}`);
        expect(region.exists()).toBe(true);
        expect(region.text()).toContain("A release can carry a whole Minecraft world");

        wrapper.unmount();
    });

    it("takes a downloaded folder as the world, and has it checked like any other", async () => {
        const fake = fakePreload();
        const wrapper = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: fake.bridge,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        await button(wrapper, "Download one from a release").trigger("click");
        await flushPromises();
        expect(button(wrapper, "Hide the release downloads").attributes("aria-expanded")).toBe("true");

        fake.finish();
        await nextTick();
        await button(wrapper, "Use this folder").trigger("click");

        expect(wrapper.emitted("update:modelValue")).toEqual([[CONTENT]]);
        // Inspected rather than trusted: an archive that unpacked into a folder holding
        // several worlds gets the same sentence as a `saves` directory picked by hand.
        expect(wrapper.emitted("inspect")).toEqual([[CONTENT]]);

        wrapper.unmount();
    });

    it("says plainly that a build with no bridge cannot download, rather than offering one", async () => {
        const wrapper = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: false,
                downloadBridge: null,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        await button(wrapper, "Download one from a release").trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("This build cannot download releases");
        expect(wrapper.findAll("button").some((candidate) => candidate.text().includes("See what it offers"))).toBe(
            false,
        );

        wrapper.unmount();
    });
});

/**
 * `main/bedrock/ipc.ts` registers `bedrock:detect`, `bedrock:convert` and the rest on every
 * launch, fully unit-tested in isolation - and until the preload bridge and this note
 * existed, nothing in the running app ever called any of them. `BedrockConversionNote`
 * resolves its own bridge from `globalThis.materialBluemap`, the same way `MinecraftWorldList`
 * finds its catalog bridge, so this proves the chain the same way "the chain from the screen
 * the app mounts" below proves the downloader's: stub the global, mount the real step, and
 * check the note a Bedrock folder is supposed to produce actually reaches the DOM.
 */
describe("the Bedrock conversion note this step now mounts", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("reaches the note when the folder is a Bedrock world, without anything passed down to it", async () => {
        const detect = vi.fn(async () => ({
            folder: "/srv/bedrock-world",
            detection: {
                bedrock: true,
                confidence: "certain",
                markers: { levelDat: true, levelNameFile: true, database: true, databaseFiles: 3 },
                explanation: "This is a Bedrock Edition world.",
            },
            name: "Creative Flat",
            suggestedOutput: null,
            estimatedSize: null,
            fidelity: { notes: [], mayBeOutOfDate: false, checkedAgainst: "1.19.1" },
            memory: null,
            error: null,
        }));
        vi.stubGlobal("materialBluemap", {
            bedrock: {
                detect,
                chunkerStatus: vi.fn(),
                fetchChunker: vi.fn(),
                convert: vi.fn(),
                cancel: vi.fn(),
                onBedrockEvent: vi.fn(() => () => undefined),
            },
        });

        const wrapper = mount(WorldFolderStep, {
            props: {
                modelValue: "/srv/bedrock-world",
                inspection: uncheckedWorld("/srv/bedrock-world"),
                inspecting: false,
                canInspect: true,
                downloadBridge: null,
                catalogBridge: null,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        // Past the note's own 400ms debounce on the folder watcher.
        await new Promise((resolve) => setTimeout(resolve, 450));
        await nextTick();

        expect(detect).toHaveBeenCalledWith("/srv/bedrock-world", undefined);
        expect(wrapper.text()).toContain("Creative Flat");
        expect(wrapper.text()).toContain("Convert with Chunker");

        wrapper.unmount();
    });
});

describe("the chain from the screen the app mounts", () => {
    it("reaches the downloader through the wizard, finding the preload for itself", async () => {
        const fake = fakePreload();
        // Nothing is passed down to it: the wizard does not know downloads exist, so the
        // surface has to feature-detect the preload from three components deep.
        vi.stubGlobal("materialBluemap", fake.bridge);

        const wrapper = mount(WorldScreen, {
            props: { bridge: null, optionalBridge: null, host: null },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        await button(wrapper, "Download one from a release").trigger("click");
        await flushPromises();
        expect(wrapper.text()).toContain("A release can carry a whole Minecraft world");

        await button(wrapper, "See what it offers").trigger("click");
        await flushPromises();
        expect(wrapper.text()).toContain("test-world-seed-1739.zip");
        expect(wrapper.text()).toContain("4.03 GB");

        fake.finish();
        await nextTick();
        await button(wrapper, "Use this folder").trigger("click");
        await nextTick();

        // The wizard's own world field, which is what the render is started from.
        const field = wrapper.find(".mb-world-step__row input");
        expect((field.element as HTMLInputElement).value).toBe(CONTENT);

        wrapper.unmount();
    });
});
