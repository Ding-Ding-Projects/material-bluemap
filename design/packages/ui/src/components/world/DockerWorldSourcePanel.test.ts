// @vitest-environment jsdom

import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DockerWorldSourcePanel from "./DockerWorldSourcePanel.vue";
import dockerWorldSourcePanelSource from "./DockerWorldSourcePanel.vue?raw";
import type {
    DockerContainerDetail,
    DockerWorldEvent,
    DockerWorldSourceBridge,
} from "./dockerWorldSourceBridge.js";
import type { RuntimeBridge } from "../remote/remoteBridge.js";

const vuetify = createVuetify();

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

function i18n() {
    return createI18n({
        legacy: false,
        locale: "en",
        fallbackLocale: "en",
        missingWarn: false,
        fallbackWarn: false,
        messages: { en: {} },
    });
}

const stopped: DockerContainerDetail = {
    id: "abc123",
    name: "minecraft-server",
    image: "itzg/minecraft-server:latest",
    status: "exited",
    running: false,
    startedAt: "2026-08-01T10:00:00Z",
    mounts: [
        {
            type: "volume",
            source: "/var/lib/docker/volumes/world/_data",
            volumeName: "minecraft_world",
            destination: "/data/world",
            readOnly: false,
        },
    ],
};

function runtimeBridge(): RuntimeBridge {
    return {
        dockerRuntime: vi.fn(async () => ({
            status: "available" as const,
            available: true,
            clientVersion: "29.1.0",
            serverVersion: "29.1.0",
            message: "Docker is available.",
            detail: null,
        })),
        runtimeModes: vi.fn(async () => ({
            preferred: "local" as const,
            dockerImage: "",
            modes: [],
        })),
        renderModes: vi.fn(async () => ["local"] as const),
        canProbeDocker: true,
    };
}

function bridge(overrides: Partial<DockerWorldSourceBridge> = {}) {
    let eventListener: ((event: DockerWorldEvent) => void) | null = null;
    const fake: DockerWorldSourceBridge = {
        list: vi.fn(async () => ({
            ok: true as const,
            containers: [stopped],
            volumes: [{ name: "minecraft_world", driver: "local" }],
        })),
        inspectContainer: vi.fn(async () => ({ ok: true as const, detail: stopped })),
        inspectVolume: vi.fn(async () => ({
            ok: true as const,
            detail: {
                name: "minecraft_world",
                driver: "local",
                mountpoint: "/var/lib/docker/volumes/world/_data",
            },
        })),
        fetch: vi.fn(async () => ({
            ok: true as const,
            fetchId: "container:abc123:/data/world",
            filesCopied: 3,
            filesUnchanged: 2,
        })),
        cancel: vi.fn(async () => true),
        active: vi.fn(async () => []),
        fingerprint: vi.fn(async () => ({
            ok: true as const,
            fingerprint: { regions: [{ path: "region/r.0.0.mca", bytes: 42, modifiedAt: 1 }] },
        })),
        fingerprintsEqual: vi.fn(async () => true),
        onDockerWorldEvent: vi.fn((listener) => {
            eventListener = listener;
            return () => {
                eventListener = null;
            };
        }),
        ...overrides,
    };
    return { fake, emit: (event: DockerWorldEvent) => eventListener?.(event) };
}

type Exposed = {
    open: boolean;
    kind: "container" | "volume";
    selectedContainerId: string | null;
    selectedVolumeName: string | null;
    selectedMountDestination: string | null;
    destination: string;
    acknowledgeLiveRisk: boolean;
    containers: readonly { readonly id: string; readonly name: string }[];
    volumes: readonly { readonly name: string }[];
    container: DockerContainerDetail | null;
    refresh(): Promise<void>;
    fetchWorld(): Promise<void>;
};

function mounted(source: ReturnType<typeof bridge>): VueWrapper & { vm: Exposed } {
    return mount(DockerWorldSourcePanel, {
        props: { bridge: source.fake, runtimeBridge: runtimeBridge() },
        global: { plugins: [vuetify, i18n()] },
    }) as VueWrapper & { vm: Exposed };
}

async function load(wrapper: VueWrapper & { vm: Exposed }): Promise<void> {
    wrapper.vm.open = true;
    await nextTick();
    await wrapper.vm.refresh();
    await nextTick();
}

afterEach(() => vi.unstubAllGlobals());

describe("DockerWorldSourcePanel", () => {
    it("lists Docker's actual containers, volumes and inspected mounts instead of free-text ids", async () => {
        const source = bridge();
        const wrapper = mounted(source);
        await load(wrapper);

        expect(wrapper.vm.containers.map((entry) => entry.name)).toEqual(["minecraft-server"]);
        expect(wrapper.vm.volumes.map((entry) => entry.name)).toEqual(["minecraft_world"]);
        expect(source.fake.list).toHaveBeenCalled();

        wrapper.vm.selectedContainerId = "abc123";
        await vi.waitFor(() => expect(source.fake.inspectContainer).toHaveBeenCalledWith("abc123"));
        await nextTick();
        expect(wrapper.vm.container?.mounts.map((mount) => mount.destination)).toEqual([
            "/data/world",
        ]);
        expect(wrapper.text()).toContain("Stopped");
    });

    it("requires a fresh exact torn-region acknowledgement for every live-container fetch", async () => {
        const running = { ...stopped, running: true, status: "running" };
        const source = bridge({
            inspectContainer: vi.fn(async () => ({ ok: true as const, detail: running })),
        });
        const wrapper = mounted(source);
        await load(wrapper);
        wrapper.vm.selectedContainerId = "abc123";
        await vi.waitFor(() => expect(wrapper.text()).toContain("torn .mca region file"));
        wrapper.vm.selectedMountDestination = "/data/world";
        wrapper.vm.destination = "C:\\Fetched\\world";
        await nextTick();

        await wrapper.vm.fetchWorld();
        expect(source.fake.fetch).not.toHaveBeenCalled();

        wrapper.vm.acknowledgeLiveRisk = true;
        await wrapper.vm.fetchWorld();
        expect(source.fake.fetch).toHaveBeenCalledWith({
            source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" },
            destination: "C:\\Fetched\\world",
            acknowledgeLiveRisk: true,
        });
        expect(wrapper.vm.acknowledgeLiveRisk).toBe(false);

        await wrapper.vm.fetchWorld();
        expect(source.fake.fetch).toHaveBeenCalledTimes(1);
    });

    it("states null honestly for a named-volume fingerprint and hands success to the ordinary wizard", async () => {
        const source = bridge({
            fingerprint: vi.fn(async () => ({ ok: true as const, fingerprint: null })),
        });
        const wrapper = mounted(source);
        await load(wrapper);
        wrapper.vm.kind = "volume";
        await nextTick();
        wrapper.vm.selectedVolumeName = "minecraft_world";
        await vi.waitFor(() => expect(wrapper.text()).toContain("has no cheap fingerprint"));
        wrapper.vm.destination = "C:\\Fetched\\volume-world";
        await wrapper.vm.fetchWorld();

        expect(wrapper.emitted("use")).toEqual([["C:\\Fetched\\volume-world"]]);
        expect(source.fake.fetch).toHaveBeenCalledWith({
            source: { kind: "volume", volumeName: "minecraft_world" },
            destination: "C:\\Fetched\\volume-world",
        });
    });

    it("renders actual determinate file progress and forwards cancellation by the active fetch id", async () => {
        let finish!: (value: Awaited<ReturnType<DockerWorldSourceBridge["fetch"]>>) => void;
        const source = bridge({
            fetch: vi.fn(
                () =>
                    new Promise<Awaited<ReturnType<DockerWorldSourceBridge["fetch"]>>>(
                        (resolve) => {
                            finish = resolve;
                        },
                    ),
            ),
        });
        const wrapper = mounted(source);
        await load(wrapper);
        wrapper.vm.kind = "volume";
        await nextTick();
        wrapper.vm.selectedVolumeName = "minecraft_world";
        await vi.waitFor(() => expect(source.fake.fingerprint).toHaveBeenCalled());
        wrapper.vm.destination = "C:\\Fetched\\volume-world";
        const pending = wrapper.vm.fetchWorld();
        await nextTick();
        source.emit({
            type: "progress",
            fetchId: "volume:minecraft_world",
            phase: "placement",
            filesDone: 4,
            filesTotal: 10,
            currentFile: "region/r.0.0.mca",
            message: "Placing the fetched world into its chosen local folder.",
            at: "2026-08-06T00:00:00Z",
        });
        await nextTick();
        expect(wrapper.text()).toContain("4 of 10 files checked");
        expect(wrapper.text()).toContain("region/r.0.0.mca");

        const cancel = wrapper.find('[data-test="docker-cancel"]');
        await cancel.trigger("click");
        expect(source.fake.cancel).toHaveBeenCalledWith("volume:minecraft_world");

        finish({
            ok: false,
            fetchId: "volume:minecraft_world",
            failure: { code: "cancelled", message: "Cancelled.", detail: null },
        });
        await pending;
    });
});

describe("the source-kind toggle's sizing rule", () => {
    /**
     * Regression: the rule pinned both the toggle and its buttons to a single 44px
     * `block-size !important` -- one line-height -- so in bilingual mode the second line
     * of `world.docker.container` / `world.docker.volume` was clipped inside the box.
     * The action buttons a few rules above already had the correct shape
     * (`min-block-size: 44px; block-size: auto`, a touch-target floor the text may grow
     * past); the toggle now matches it, keeping the `!important` that out-ranks Vuetify's
     * own toggle sizing.
     *
     * Asserted against the component source because this workspace's `vitest.config.ts`
     * does not enable `test.css`, so no stylesheet reaches a mounted component and the
     * cascade is not observable from the mounted tests above. Comments are stripped from
     * the rule first so prose never trips an assertion.
     */
    it("keeps 44px as a floor rather than a ceiling, so a second label line can grow the box", () => {
        const rule =
            /\.mb-docker-world \.v-btn-toggle,\s*\.mb-docker-world \.v-btn-toggle \.v-btn\s*\{[^}]*\}/.exec(
                dockerWorldSourcePanelSource,
            )?.[0] ?? "";
        const declarations = rule.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(declarations).not.toBe("");
        expect(declarations).toContain("min-block-size: 44px !important");
        expect(declarations).toContain("block-size: auto !important");
        // The pinned height is what did the clipping; it must not come back.
        expect(declarations).not.toMatch(/(?<!min-)block-size: 44px/);
    });

    it("pads the buttons so a grown box does not press its text against the border", () => {
        // The lookbehind skips the combined sizing rule above, whose second selector is
        // this same selector preceded by a comma.
        const rule =
            /(?<!,\n)\.mb-docker-world \.v-btn-toggle \.v-btn\s*\{[^}]*\}/.exec(
                dockerWorldSourcePanelSource,
            )?.[0] ?? "";
        const declarations = rule.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(declarations).not.toBe("");
        expect(declarations).toContain("padding-block: 6px");
    });
});
