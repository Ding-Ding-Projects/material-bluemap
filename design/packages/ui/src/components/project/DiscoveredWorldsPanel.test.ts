/**
 * @vitest-environment jsdom
 *
 * Worlds ready to use, mounted for real.
 *
 * `discoveredWorlds.test.ts` proves the pure filtering rule with no DOM at all. What that
 * cannot see is whether a discovered world actually shows up on screen without anybody doing
 * anything first, whether it disappears once a project exists for it, whether the honest
 * "nothing to show" states are told apart, and whether choosing several and pressing the
 * bulk action really emits every path chosen rather than only the one that was clicked.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import DiscoveredWorldsPanel from "./DiscoveredWorldsPanel.vue";
import type { FolderScanResult, MinecraftFolder, MinecraftWorldSummary, WorldCatalogBridge } from "../world/worldCatalog.js";

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
        path: "/home/ada/.minecraft/saves/Bastion",
        directoryName: "Bastion",
        name: "Bastion",
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
}

function fakeBridge(options: FakeOptions = {}) {
    const folders = options.folders ?? [folder()];
    const bridge: WorldCatalogBridge = {
        listMinecraftFolders: async () => folders,
        mountMinecraftFolder: async () => ({ ok: false, message: "not used in this test" }),
        unmountMinecraftFolder: async () => true,
        labelMinecraftFolder: async () => true,
        scanMinecraftFolder: async (id): Promise<FolderScanResult> => ({
            ok: true,
            scan: { folderId: id, savesPath: `/saves/${id}`, worlds: options.worlds?.[id] ?? [], truncated: false },
        }),
    };
    return bridge;
}

function panel(bridge: WorldCatalogBridge | null, projectWorlds: readonly string[] = []) {
    return mount(DiscoveredWorldsPanel, {
        props: { bridge, projectWorlds },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

function options_(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

/* -------------------------------------------------------------------------- */

describe("automatic discovery, without the user doing anything first", () => {
    it("shows worlds from the default folder as soon as it mounts", async () => {
        const bridge = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = panel(bridge);
        await flushPromises();

        expect(view.text()).toContain("Bastion");
        expect(view.find("[role='listbox']").exists()).toBe(true);
        view.unmount();
    });
});

describe("discovered versus project", () => {
    it("leaves out a world that already has a project", async () => {
        const bridge = fakeBridge({
            worlds: {
                "default:home": [
                    world({ path: "/home/ada/.minecraft/saves/Bastion", name: "Bastion" }),
                    world({ path: "/home/ada/.minecraft/saves/Creative", name: "Creative", directoryName: "Creative" }),
                ],
            },
        });
        const view = panel(bridge, ["/home/ada/.minecraft/saves/Bastion"]);
        await flushPromises();

        expect(view.text()).not.toContain("Bastion");
        expect(view.text()).toContain("Creative");
        view.unmount();
    });

    it("marks a discovered row as not yet a project", async () => {
        const bridge = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = panel(bridge);
        await flushPromises();

        expect(view.text()).toContain("not yet a project");
        view.unmount();
    });
});

describe("the honest empty states, told apart", () => {
    it("says no folder was found, when there is not one", async () => {
        const bridge = fakeBridge({ folders: [] });
        const view = panel(bridge);
        await flushPromises();

        expect(view.text()).toContain("No Minecraft folder was found");
        view.unmount();
    });

    it("says folders were added but nothing was found in them, distinct from no folders at all", async () => {
        const bridge = fakeBridge({ worlds: { "default:home": [] } });
        const view = panel(bridge);
        await flushPromises();

        expect(view.text()).toContain("No worlds were found");
        expect(view.text()).not.toContain("No Minecraft folder was found");
        view.unmount();
    });

    it("says every world already has a project, distinct from finding none at all", async () => {
        const bridge = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = panel(bridge, ["/home/ada/.minecraft/saves/Bastion"]);
        await flushPromises();

        expect(view.text()).toContain("already has a project");
        view.unmount();
    });
});

describe("a folder that has gone missing or cannot be read", () => {
    it("keeps its row and says so, rather than silently dropping it from the list", async () => {
        const bridge = fakeBridge({
            folders: [folder({ id: "mount:gone", label: "External drive", state: "missing" })],
        });
        const view = panel(bridge);
        await flushPromises();

        // Reused, unmodified: `describeFolderState` (worldCatalog.ts) is the exact function
        // MinecraftWorldList.vue already renders this same sentence with.
        expect(view.text()).toContain("External drive");
        expect(view.text()).toMatch(/nothing at .* right now/);
        view.unmount();
    });
});

describe("one-click route into starting a project", () => {
    it("emits use with the world path when a row is clicked", async () => {
        const bridge = fakeBridge({ worlds: { "default:home": [world()] } });
        const view = panel(bridge);
        await flushPromises();

        await options_()[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();

        expect(view.emitted("use")).toEqual([["/home/ada/.minecraft/saves/Bastion"]]);
        view.unmount();
    });
});

describe("bulk actions", () => {
    it("selecting several and using them emits every chosen path, not only one", async () => {
        const worlds = [
            world({ path: "/a/Bastion", directoryName: "Bastion", name: "Bastion" }),
            world({ path: "/a/Creative", directoryName: "Creative", name: "Creative" }),
        ];
        const bridge = fakeBridge({ worlds: { "default:home": worlds } });
        const view = panel(bridge);
        await flushPromises();

        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        expect(checkboxes.length).toBeGreaterThanOrEqual(2);
        for (const checkbox of Array.from(checkboxes)) {
            (checkbox as HTMLInputElement).click();
        }
        await flushPromises();

        const bulkButton = [...document.querySelectorAll("button")].find((button) =>
            button.textContent?.includes("Start projects for"),
        );
        expect(bulkButton).toBeDefined();
        bulkButton?.click();
        await flushPromises();

        const emitted = view.emitted("useMany");
        expect(emitted).toBeDefined();
        const paths = (emitted?.[0]?.[0] as readonly string[]) ?? [];
        expect([...paths].sort()).toEqual(["/a/Bastion", "/a/Creative"]);
        view.unmount();
    });
});

describe("a build with no bridge at all", () => {
    it("renders nothing rather than a broken panel", () => {
        const view = panel(null);
        expect(view.find(".mb-discovered").exists()).toBe(false);
        view.unmount();
    });
});
