// @vitest-environment jsdom

/**
 * The world list as it is really rendered, driven the way a person drives it.
 *
 * The rules are tested next door in `worldCatalog.test.ts` without a DOM. What that
 * cannot see is whether the list somebody actually gets is a listbox: whether the options
 * carry their details in their accessible names, whether exactly one row holds the tab
 * stop, whether an arrow key moves it, and whether the honest states are on the screen
 * rather than merely available. Those are properties of the rendered component, and a
 * test that asserts them against a stand-in proves nothing about the thing that ships.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import MinecraftWorldList from "./MinecraftWorldList.vue";
import WorldFolderStep from "./WorldFolderStep.vue";
import { uncheckedWorld } from "./worldFolder.js";
import type {
    FolderScanResult,
    MinecraftFolder,
    MinecraftWorldSummary,
    WorldCatalogBridge,
} from "./worldCatalog.js";

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

const vuetify = createVuetify();

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

function folder(overrides: Partial<MinecraftFolder> = {}): MinecraftFolder {
    return {
        id: "default:home",
        label: ".minecraft",
        labelled: false,
        chosenPath: "/home/ada/.minecraft",
        savesPath: "/home/ada/.minecraft/saves",
        resolution: "installation",
        builtIn: true,
        origin: "home",
        state: "ok",
        stateDetail: null,
        mountedAt: null,
        ...overrides,
    };
}

function world(overrides: Partial<MinecraftWorldSummary> = {}): MinecraftWorldSummary {
    return {
        folderId: "default:home",
        path: "/home/ada/.minecraft/saves/New World (2)",
        directoryName: "New World (2)",
        name: "Survival",
        lastPlayed: 1_764_547_200_000,
        versionName: "1.21.4",
        snapshot: false,
        gameMode: "survival",
        hardcore: false,
        cheats: false,
        seed: "77",
        regionFiles: { "": 0, region: 40 },
        sizeBytes: 512_000_000,
        sizeComplete: true,
        detailsError: null,
        ...overrides,
    };
}

interface FakeOptions {
    readonly folders?: readonly MinecraftFolder[];
    readonly worlds?: Readonly<Record<string, readonly MinecraftWorldSummary[]>>;
    readonly scanFailures?: Readonly<Record<string, string>>;
    /** Held open so the scanning state can be observed rather than raced past. */
    readonly hold?: boolean;
}

function fakeBridge(options: FakeOptions = {}) {
    const folders = options.folders ?? [folder()];
    const unmounted: string[] = [];
    const labelled: [string, string][] = [];
    let releaseScan: (() => void) | null = null;

    const bridge: WorldCatalogBridge = {
        listMinecraftFolders: async () => folders.filter((entry) => !unmounted.includes(entry.id)),
        mountMinecraftFolder: async () => ({ ok: false, message: "not used in this test" }),
        unmountMinecraftFolder: async (id) => {
            unmounted.push(id);
            return true;
        },
        labelMinecraftFolder: async (id, label) => {
            labelled.push([id, label]);
            return true;
        },
        scanMinecraftFolder: async (id): Promise<FolderScanResult> => {
            if (options.hold === true) await new Promise<void>((resolve) => (releaseScan = resolve));
            const failure = options.scanFailures?.[id];
            if (failure !== undefined) return { ok: false, folderId: id, message: failure };
            return {
                ok: true,
                scan: {
                    folderId: id,
                    savesPath: `/saves/${id}`,
                    worlds: options.worlds?.[id] ?? [],
                    truncated: false,
                },
            };
        },
    };

    return {
        bridge,
        unmounted,
        labelled,
        release(): void {
            releaseScan?.();
        },
    };
}

function list(bridge: WorldCatalogBridge | null, modelValue = ""): VueWrapper {
    return mount(MinecraftWorldList, {
        props: { modelValue, bridge },
        global: { plugins: [vuetify, i18n()] },
    });
}

function options(view: VueWrapper) {
    return view.findAll("[role='option']");
}

/* -------------------------------------------------------------------------- */

describe("the list is a listbox", () => {
    it("gives the list a name and every row an option role", async () => {
        const fake = fakeBridge({ worlds: { "default:home": [world(), world({ path: "/b", name: "Creative" })] } });
        const view = list(fake.bridge);
        await flushPromises();

        const box = view.find("[role='listbox']");
        expect(box.exists()).toBe(true);
        expect(box.attributes("aria-label")).toContain("Worlds found on this computer");
        expect(options(view)).toHaveLength(2);

        view.unmount();
    });

    it("carries the details in each option's accessible name, not in a title attribute", async () => {
        // The details are the entire difference between two worlds called "New World (2)",
        // and a tooltip is not an accessible name.
        const fake = fakeBridge({ worlds: { "default:home": [world({ hardcore: true })] } });
        const view = list(fake.bridge);
        await flushPromises();

        const option = options(view)[0];
        const spoken = option?.attributes("aria-label") ?? "";
        expect(spoken).toContain("Survival");
        expect(spoken).toContain("1.21.4");
        expect(spoken).toContain("Hardcore");
        expect(option?.attributes("title")).toBeUndefined();

        view.unmount();
    });

    it("shows the details as a real second line under the name", async () => {
        const fake = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = list(fake.bridge);
        await flushPromises();

        const details = view.find(".mb-world-list__details");
        expect(details.exists()).toBe(true);
        expect(details.text()).toContain("1.21.4");
        expect(view.find(".mb-world-list__name").text()).toContain("Survival");

        view.unmount();
    });

    it("holds exactly one tab stop and moves it with the arrow keys", async () => {
        const worlds = [world({ path: "/a", name: "A" }), world({ path: "/b", name: "B" }), world({ path: "/c", name: "C" })];
        const fake = fakeBridge({ worlds: { "default:home": worlds } });
        const view = list(fake.bridge);
        await flushPromises();

        const tabbable = (): string[] =>
            options(view).map((option) => option.attributes("tabindex") ?? "");
        expect(tabbable().filter((value) => value === "0")).toHaveLength(1);
        expect(tabbable()[0]).toBe("0");

        await view.find("[role='listbox']").trigger("keydown", { key: "ArrowDown" });
        await flushPromises();
        expect(tabbable()).toEqual(["-1", "0", "-1"]);

        await view.find("[role='listbox']").trigger("keydown", { key: "End" });
        await flushPromises();
        expect(tabbable()).toEqual(["-1", "-1", "0"]);

        // Stops at the end rather than wrapping round to the top.
        await view.find("[role='listbox']").trigger("keydown", { key: "ArrowDown" });
        await flushPromises();
        expect(tabbable()).toEqual(["-1", "-1", "0"]);

        view.unmount();
    });

    it("marks the world the wizard is pointed at as the selected one", async () => {
        const worlds = [world({ path: "/a", name: "A" }), world({ path: "/b", name: "B" })];
        const fake = fakeBridge({ worlds: { "default:home": worlds } });
        const view = list(fake.bridge, "/b");
        await flushPromises();

        expect(options(view).map((option) => option.attributes("aria-selected"))).toEqual(["false", "true"]);

        view.unmount();
    });

    it("resolves a folder named elsewhere to the row it already has, rather than a second row", async () => {
        // A folder dropped or picked from inside a mounted folder is the world that is
        // already in this list. Spelled differently - a trailing slash, the other
        // separator, a different case - it is still the same world and still one row.
        const worlds = [world({ path: "/home/ada/.minecraft/saves/Bastion", name: "Bastion" })];
        const fake = fakeBridge({ worlds: { "default:home": worlds } });
        const view = list(fake.bridge, "\\home\\ada\\.minecraft\\saves\\bastion\\");
        await flushPromises();

        expect(options(view)).toHaveLength(1);
        expect(options(view)[0]?.attributes("aria-selected")).toBe("true");

        view.unmount();
    });

    it("chooses a world on a click and on Enter, and only then", async () => {
        // Deliberately not on arrow movement: choosing runs a folder inspection, and
        // walking ninety rows must not start ninety of them.
        const worlds = [world({ path: "/a", name: "A" }), world({ path: "/b", name: "B" })];
        const fake = fakeBridge({ worlds: { "default:home": worlds } });
        const view = list(fake.bridge);
        await flushPromises();

        await view.find("[role='listbox']").trigger("keydown", { key: "ArrowDown" });
        await flushPromises();
        expect(view.emitted("choose")).toBeUndefined();

        await options(view)[1]?.trigger("keydown.enter");
        expect(view.emitted("choose")).toEqual([["/b"]]);

        await options(view)[0]?.trigger("click");
        expect(view.emitted("choose")).toEqual([["/b"], ["/a"]]);

        view.unmount();
    });
});

describe("the search", () => {
    it("filters the list and says how much of it is showing", async () => {
        const worlds = [
            world({ path: "/a", name: "Bastion", versionName: "1.21.4" }),
            world({ path: "/b", name: "Skyblock", versionName: "1.20.1" }),
        ];
        const fake = fakeBridge({ worlds: { "default:home": worlds } });
        const view = list(fake.bridge);
        await flushPromises();

        await view.find("[role='searchbox'] input, input[role='searchbox']").setValue("1.20");
        await flushPromises();

        expect(options(view)).toHaveLength(1);
        expect(options(view)[0]?.text()).toContain("Skyblock");
        expect(view.text()).toContain("Showing 1 of 2");

        view.unmount();
    });

    it("finds a world by a detail rather than only by its name", async () => {
        const worlds = [
            world({ path: "/a", name: "Bastion", hardcore: true }),
            world({ path: "/b", name: "Skyblock", hardcore: false }),
        ];
        const fake = fakeBridge({ worlds: { "default:home": worlds } });
        const view = list(fake.bridge);
        await flushPromises();

        await view.find("input[role='searchbox']").setValue("hardcore");
        await flushPromises();

        expect(options(view)).toHaveLength(1);
        expect(options(view)[0]?.text()).toContain("Bastion");

        view.unmount();
    });

    it("keeps the field on screen when nothing matches, so it can be cleared", async () => {
        const fake = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = list(fake.bridge);
        await flushPromises();

        await view.find("input[role='searchbox']").setValue("no such world");
        await flushPromises();

        expect(options(view)).toHaveLength(0);
        expect(view.text()).toContain("No world matches that search");
        expect(view.find("input[role='searchbox']").exists()).toBe(true);

        view.unmount();
    });

    it("offers the shared regex builder beside the field rather than a filter box of its own", async () => {
        const fake = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = list(fake.bridge);
        await flushPromises();

        const labels = view.findAll("button").map((button) => button.attributes("aria-label") ?? "");
        expect(labels).toContain("Open the regex builder");
        expect(labels).toContain("Search with a regular expression");

        view.unmount();
    });
});

describe("the honest states", () => {
    it("says it is reading while a folder is still being read", async () => {
        const fake = fakeBridge({ hold: true });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.find("[role='status']").text()).toContain("Reading your Minecraft folders");
        expect(view.text()).toContain("reading...");

        fake.release();
        await flushPromises();
        view.unmount();
    });

    it("names the places it looked when it found no worlds at all", async () => {
        const fake = fakeBridge({ folders: [folder()], worlds: {} });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.text()).toContain("No worlds were found");
        expect(view.text()).toContain("/home/ada/.minecraft/saves");

        view.unmount();
    });

    it("says there is no Minecraft folder here when there is none", async () => {
        const fake = fakeBridge({ folders: [] });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.text()).toContain("No Minecraft folder was found on this computer");

        view.unmount();
    });

    it("keeps a folder that has gone away, and says which, rather than dropping it", async () => {
        const fake = fakeBridge({ folders: [folder({ state: "missing" })] });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.text()).toContain("/home/ada/.minecraft/saves");
        expect(view.text()).toContain("unplugged");

        view.unmount();
    });

    it("reports a folder it could not read on that folder's own row", async () => {
        const fake = fakeBridge({
            folders: [folder(), folder({ id: "mount:x", label: "Archive", builtIn: false, origin: null })],
            worlds: { "default:home": [world()] },
            scanFailures: { "mount:x": "That drive is not responding." },
        });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.text()).toContain("That drive is not responding.");
        // And the other folder's worlds are still on the screen.
        expect(options(view)).toHaveLength(1);

        view.unmount();
    });

    it("lists a world whose level.dat could not be read, with what is known", async () => {
        const broken = world({ name: null, versionName: null, gameMode: null, detailsError: "not NBT" });
        const fake = fakeBridge({ worlds: { "default:home": [broken] } });
        const view = list(fake.bridge);
        await flushPromises();

        expect(options(view)).toHaveLength(1);
        expect(options(view)[0]?.text()).toContain("New World (2)");
        expect(options(view)[0]?.text()).toContain("its level.dat could not be read");

        view.unmount();
    });

    it("renders nothing at all when this build has no way to look", async () => {
        // A browser tab. The list is simply absent and the manual routes are untouched.
        const view = list(null);
        await flushPromises();

        expect(view.find(".mb-world-list").exists()).toBe(false);

        view.unmount();
    });
});

describe("mounted folders", () => {
    it("says which folder came from where, and how many worlds it holds", async () => {
        const fake = fakeBridge({ worlds: { "default:home": [world(), world({ path: "/b" })] } });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.text()).toContain(".minecraft");
        expect(view.text()).toContain("found automatically");
        expect(view.text()).toContain("the default .minecraft folder in your home directory");
        expect(view.text()).toContain("2 worlds");

        view.unmount();
    });

    it("offers no unmount on a folder the app found by itself", async () => {
        const fake = fakeBridge({ folders: [folder()] });
        const view = list(fake.bridge);
        await flushPromises();

        expect(view.findAll("button").some((button) => button.text().includes("Unmount"))).toBe(false);

        view.unmount();
    });

    it("unmounts a folder the person added, and says plainly that nothing was deleted", async () => {
        const added = folder({ id: "mount:x", label: "Archive", builtIn: false, origin: null });
        const fake = fakeBridge({ folders: [folder(), added], worlds: { "mount:x": [world({ folderId: "mount:x" })] } });
        const view = list(fake.bridge);
        await flushPromises();

        const button = view.findAll("button").find((candidate) => candidate.text().includes("Unmount"));
        expect(button?.attributes("aria-label")).toContain("changes nothing on your disk");

        await button?.trigger("click");
        await flushPromises();

        expect(fake.unmounted).toEqual(["mount:x"]);
        expect(view.text()).toContain("Nothing on your disk was changed");

        view.unmount();
    });

    it("renames a folder, because two folders both called saves distinguish nothing", async () => {
        const fake = fakeBridge({ folders: [folder({ id: "mount:x", label: "saves", builtIn: false, origin: null })] });
        const view = list(fake.bridge);
        await flushPromises();

        const rename = view
            .findAll("button")
            .find((candidate) => (candidate.attributes("aria-label") ?? "").startsWith("Rename"));
        await rename?.trigger("click");
        await flushPromises();

        const field = view.find(".mb-world-list__mount input");
        await field.setValue("Modded 1.20");
        await field.trigger("keydown.enter");
        await flushPromises();

        expect(fake.labelled).toEqual([["mount:x", "Modded 1.20"]]);

        view.unmount();
    });
});

describe("the step around it", () => {
    it("keeps the typed field, the picker and the drop target when there is no list", async () => {
        // The rule the whole feature is subordinate to: somebody with one world in an
        // unusual place must need nothing mounted and nothing configured.
        const view = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: null,
                catalogBridge: null,
            },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        expect(view.find(".mb-world-step__row input").exists()).toBe(true);
        expect(view.findAll("button").some((button) => button.text().includes("Browse"))).toBe(true);
        expect(view.find(".mb-world-step__drop").exists()).toBe(true);
        expect(view.find(".mb-world-list").exists()).toBe(false);

        view.unmount();
    });

    it("fills in and checks a world chosen from the list, exactly like a typed one", async () => {
        const fake = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: null,
                catalogBridge: fake.bridge,
            },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        await view.find("[role='option']").trigger("click");

        expect(view.emitted("update:modelValue")).toEqual([["/home/ada/.minecraft/saves/New World (2)"]]);
        expect(view.emitted("inspect")).toEqual([["/home/ada/.minecraft/saves/New World (2)"]]);

        view.unmount();
    });

    it("says so when a dropped folder names nothing this build can locate", async () => {
        const view = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: null,
                catalogBridge: null,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        await view.find(".mb-world-step__drop").trigger("drop", { dataTransfer: { files: [] } });
        await flushPromises();

        expect(view.text()).toContain("That drop carried no file or folder");
        expect(view.emitted("inspect")).toBeUndefined();

        view.unmount();
    });

    it("takes a dropped folder when the shell can say where it is", async () => {
        const dropped = "/media/usb/Bastion";
        vi.stubGlobal("worldlens", { pathForDroppedFile: () => dropped });

        const view = mount(WorldFolderStep, {
            props: {
                modelValue: "",
                inspection: uncheckedWorld(""),
                inspecting: false,
                canInspect: true,
                downloadBridge: null,
                catalogBridge: null,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        await view
            .find(".mb-world-step__drop")
            .trigger("drop", { dataTransfer: { files: [new File([], "Bastion")] } });
        await flushPromises();

        expect(view.emitted("update:modelValue")).toEqual([[dropped]]);
        expect(view.emitted("inspect")).toEqual([[dropped]]);

        view.unmount();
    });
});
