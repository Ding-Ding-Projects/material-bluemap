/**
 * @vitest-environment jsdom
 *
 * The Explorer-style browser, mounted against a fake bridge. Pure logic already has its own
 * 40 tests in `remoteBrowse.test.ts` and the backend has 28 more in `main/remote/browse.test.ts`;
 * what only a mounted test can prove is that the component actually wires that logic to real
 * clicks, real double-clicks, real keyboard events and real ARIA attributes rather than
 * merely importing the right functions.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RemoteFileBrowser from "./RemoteFileBrowser.vue";
import type { RemoteBridge, RemoteBrowseOutcome, RemoteEntry } from "./remoteBridge.js";

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
});

const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

function entry(overrides: Partial<RemoteEntry> = {}): RemoteEntry {
    return {
        name: "entry",
        directory: false,
        symlink: false,
        sizeBytes: null,
        modifiedAt: null,
        world: { hasLevelDat: false, regionDimensions: [], looksLikeWorld: false },
        ...overrides,
    };
}

/** A fake remote bridge that answers a fixed listing per path, and records every call. */
function fakeBridge(byPath: Record<string, readonly RemoteEntry[]>): {
    bridge: RemoteBridge;
    calls: string[];
} {
    const calls: string[] = [];
    const bridge: RemoteBridge = {
        validateRemoteTarget: async () => ({ ok: false, message: "not asked here" }),
        describeRemoteTarget: async () => ({ ok: false, message: "not asked here" }),
        remotePreflight: async () => {
            throw new Error("not asked here");
        },
        trustRemoteHostKey: async () => ({ ok: false, message: "not asked here" }),
        startRemoteRender: async () => {
            throw new Error("not asked here");
        },
        cancelRemoteRender: async () => false,
        activeRemoteRenders: async () => [],
        browseRemoteDirectory: async (_target, path): Promise<RemoteBrowseOutcome> => {
            calls.push(path);
            const entries = byPath[path];
            if (entries === undefined) {
                return { ok: false, code: "not-found", message: `nothing at ${path}`, detail: null };
            }
            return {
                ok: true,
                listing: {
                    path,
                    os: "linux",
                    separator: "/",
                    entries,
                    truncated: false,
                    totalEntries: entries.length,
                },
            };
        },
        canDescribe: false,
        canTrustHostKey: false,
        canCancel: false,
        canSeeActive: false,
        canBrowse: true,
    };
    return { bridge, calls };
}

function mountBrowser(bridge: RemoteBridge, startPath = "/srv/saves") {
    return mount(RemoteFileBrowser, {
        props: { bridge, target: { host: "build.lan", user: "renderer" }, startPath },
        global: { plugins: [vuetify, i18n] },
    });
}

describe("loading and rendering a folder", () => {
    it("lists the starting folder as soon as it mounts", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves": [entry({ name: "Bastion", directory: true }), entry({ name: "notes.txt" })],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        expect(calls).toEqual(["/srv/saves"]);
        expect(wrapper.text()).toContain("Bastion");
        expect(wrapper.text()).toContain("notes.txt");
        wrapper.unmount();
    });

    it("badges a folder with level.dat and a region folder as a Minecraft world, with an accessible reason", async () => {
        const { bridge } = fakeBridge({
            "/srv/saves": [
                entry({
                    name: "Bastion",
                    directory: true,
                    world: { hasLevelDat: true, regionDimensions: ["region"], looksLikeWorld: true },
                }),
            ],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        const badge = wrapper.find(".mb-remote-browse__badge--world");
        expect(badge.exists()).toBe(true);
        expect(badge.attributes("aria-label")).toContain("level.dat");
        expect(badge.attributes("aria-label")).toContain("region");
    });

    it("never badges an ordinary folder with neither signal", async () => {
        const { bridge } = fakeBridge({
            "/srv/saves": [entry({ name: "Backups", directory: true })],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        expect(wrapper.find(".mb-remote-browse__badge").exists()).toBe(false);
    });

    it("shows an honest empty state for a folder with nothing in it", async () => {
        const { bridge } = fakeBridge({ "/srv/saves": [] });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        expect(wrapper.text()).toContain("This folder is empty");
    });

    it("reports a failure to list without pretending the folder is empty", async () => {
        const { bridge } = fakeBridge({});
        const wrapper = mountBrowser(bridge, "/srv/gone");
        await flushPromises();

        expect(wrapper.text()).toContain("nothing at /srv/gone");
        expect(wrapper.text()).not.toContain("This folder is empty");
    });
});

describe("navigation", () => {
    it("double-clicking a folder enters it and updates the breadcrumb and the path field", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves": [entry({ name: "Bastion", directory: true })],
            "/srv/saves/Bastion": [entry({ name: "level.dat" })],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        const row = wrapper.findAll('tr[role="row"]').find((candidate) => candidate.text().includes("Bastion"));
        expect(row).toBeDefined();
        await row?.trigger("dblclick");
        await flushPromises();

        expect(calls).toEqual(["/srv/saves", "/srv/saves/Bastion"]);
        expect(wrapper.text()).toContain("level.dat");
        const pathField = wrapper.find("input");
        expect((pathField.element as HTMLInputElement).value).toBe("/srv/saves/Bastion");
    });

    it("pressing Enter on the focused row enters a folder exactly as a double-click does", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves": [entry({ name: "Bastion", directory: true })],
            "/srv/saves/Bastion": [],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        const grid = wrapper.find('table[role="grid"]');
        await grid.trigger("keydown", { key: "Enter" });
        await flushPromises();

        expect(calls).toEqual(["/srv/saves", "/srv/saves/Bastion"]);
    });

    it("the Up button goes to the parent folder", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves/Bastion": [entry({ name: "level.dat" })],
            "/srv/saves": [entry({ name: "Bastion", directory: true })],
        });
        const wrapper = mountBrowser(bridge, "/srv/saves/Bastion");
        await flushPromises();

        const upButton = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Go up one level");
        expect(upButton?.attributes("disabled")).toBeUndefined();
        await upButton?.trigger("click");
        await flushPromises();

        expect(calls).toEqual(["/srv/saves/Bastion", "/srv/saves"]);
    });

    it("disables Up at the Linux root", async () => {
        const { bridge } = fakeBridge({ "/": [entry({ name: "srv", directory: true })] });
        const wrapper = mountBrowser(bridge, "/");
        await flushPromises();

        const upButton = wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Go up one level");
        expect(upButton?.attributes("disabled")).toBeDefined();
    });

    it("clicking a breadcrumb segment jumps straight there", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves/Bastion/region": [],
            "/srv": [entry({ name: "saves", directory: true })],
        });
        const wrapper = mountBrowser(bridge, "/srv/saves/Bastion/region");
        await flushPromises();
        calls.length = 0;

        const crumb = wrapper.findAll(".mb-remote-browse__crumb").find((b) => b.text() === "srv");
        expect(crumb).toBeDefined();
        await crumb?.trigger("click");
        await flushPromises();

        expect(calls).toEqual(["/srv"]);
    });

    it("Backspace goes back, but not while typing in the path field", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves": [entry({ name: "Bastion", directory: true })],
            "/srv/saves/Bastion": [],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();
        const row = wrapper.findAll('tr[role="row"]').find((candidate) => candidate.text().includes("Bastion"));
        await row?.trigger("dblclick");
        await flushPromises();
        calls.length = 0;

        // Typing in the path field: Backspace must edit text, not navigate.
        const pathField = wrapper.find("input");
        await pathField.trigger("keydown", { key: "Backspace" });
        await flushPromises();
        expect(calls).toEqual([]);

        // Backspace anywhere else in the panel goes back.
        await wrapper.find(".mb-remote-browse").trigger("keydown", { key: "Backspace" });
        await flushPromises();
        expect(calls).toEqual(["/srv/saves"]);
    });

    it("typing a path and pressing Enter navigates there", async () => {
        const { bridge, calls } = fakeBridge({
            "/srv/saves": [],
            "/srv/other": [entry({ name: "world.dat" })],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();
        calls.length = 0;

        const pathField = wrapper.find("input");
        await pathField.setValue("/srv/other");
        await pathField.trigger("keydown.enter");
        await flushPromises();

        expect(calls).toEqual(["/srv/other"]);
    });
});

describe("choosing and cancelling", () => {
    it("emits choose with the folder currently open", async () => {
        const { bridge } = fakeBridge({ "/srv/saves": [] });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        const useButton = wrapper.findAll("button").find((b) => b.text() === "Use this folder");
        await useButton?.trigger("click");

        expect(wrapper.emitted("choose")).toEqual([["/srv/saves"]]);
    });

    it("emits cancel and chooses nothing", async () => {
        const { bridge } = fakeBridge({ "/srv/saves": [] });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        const cancelButton = wrapper.findAll("button").find((b) => b.text() === "Cancel");
        await cancelButton?.trigger("click");

        expect(wrapper.emitted("cancel")).toHaveLength(1);
        expect(wrapper.emitted("choose")).toBeUndefined();
    });
});

describe("sorting", () => {
    it("sorts by size when the Size column header is clicked, folders still first", async () => {
        const { bridge } = fakeBridge({
            "/srv/saves": [
                entry({ name: "big.txt", sizeBytes: 9000 }),
                entry({ name: "small.txt", sizeBytes: 10 }),
                entry({ name: "AFolder", directory: true }),
            ],
        });
        const wrapper = mountBrowser(bridge);
        await flushPromises();

        const sizeHeader = wrapper.findAll(".mb-remote-browse__sortBtn").find((b) => b.text() === "Size");
        await sizeHeader?.trigger("click");
        await flushPromises();

        const names = wrapper.findAll(".mb-remote-browse__name").map((n) => n.text());
        expect(names).toEqual(["AFolder", "small.txt", "big.txt"]);
    });
});
