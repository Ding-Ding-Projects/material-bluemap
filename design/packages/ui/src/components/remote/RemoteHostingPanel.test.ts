// @vitest-environment jsdom

/**
 * The hosting panel, mounted.
 *
 * What a unit test of `hostingBridge.ts` cannot vouch for: that a build with no bridge
 * really draws nothing but the honest "cannot do this" sentence, that pressing Publish
 * really calls through to the bridge with the target and maps it was given, that a
 * successful publish really shows the verified state, and that Stop hosting really sits
 * behind the shared super-confirmation gate rather than calling through on its own click.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import RemoteHostingPanel from "./RemoteHostingPanel.vue";
import type {
    RemoteHostingBridge,
    RemoteHostingRecord,
    RemoteTarget,
} from "./hostingBridge.js";

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

    // The super-confirmation gate anchors an overlay against `visualViewport`, which every
    // browser this ships in implements and no version of jsdom does. Same shim used by
    // superConfirm.test.ts and App.test.ts.
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

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const TARGET: RemoteTarget = {
    id: "box",
    label: "the box",
    host: "render.example",
    port: 22,
    user: "renderer",
    identityFile: null,
    workDir: "~/.material-bluemap/renders",
    image: "eclipse-temurin:25-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

const RECORD: RemoteHostingRecord = {
    hostingId: "overworld-abc",
    renderId: "overworld-abc",
    target: TARGET,
    containerName: "material-bluemap-host-overworld-abc",
    remoteRoot: "/home/renderer/hosting/host-overworld-abc",
    mapIds: ["overworld"],
    publish: { hostPort: 8100, bindMode: "public" },
    status: "running",
    url: "http://render.example:8100/",
    verified: true,
    verifiedVia: "network",
    remoteFilesKept: false,
    startedAt: "2026-08-05T12:00:00.000Z",
    lastCheckedAt: "2026-08-05T12:00:01.000Z",
    notes: ["Connected to render.example:8100 from this computer."],
};

function fakeBridge(overrides: Partial<RemoteHostingBridge> = {}): RemoteHostingBridge {
    return {
        startRemoteHosting: vi.fn(() => Promise.resolve({ ok: true, hostingId: "overworld-abc", record: RECORD })),
        remoteHostingRecords: vi.fn(() => Promise.resolve([])),
        remoteHostingRecord: vi.fn(() => Promise.resolve(null)),
        refreshRemoteHosting: vi.fn(() => Promise.resolve(null)),
        stopRemoteHosting: vi.fn(() =>
            Promise.resolve({
                ok: true,
                report: { hostingId: "overworld-abc", target: "renderer@render.example:22", containerRemoved: true, filesRemoved: true, notes: [] },
            }),
        ),
        onRemoteHostingEvent: vi.fn(() => () => undefined),
        canWatchEvents: true,
        ...overrides,
    };
}

let wrapper: VueWrapper | null = null;

function mountPanel(props: {
    bridge?: RemoteHostingBridge | null;
    target?: RemoteTarget | null;
    renderId?: string;
    maps?: readonly { id: string; world: string }[];
}): VueWrapper {
    const Host = defineComponent({
        setup() {
            return () =>
                h(VApp, null, {
                    default: () => [
                        h(RemoteHostingPanel, {
                            bridge: props.bridge === undefined ? null : props.bridge,
                            target: props.target === undefined ? TARGET : props.target,
                            renderId: props.renderId ?? "overworld-abc",
                            maps: props.maps ?? [{ id: "overworld", world: "/home/me/saves/world" }],
                        }),
                    ],
                });
        },
    });
    wrapper = mount(Host, { global: { plugins: [vuetify, i18n] }, attachTo: document.body }) as unknown as VueWrapper;
    return wrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("with no bridge at all", () => {
    it("says plainly that this build cannot do it, and draws no publish control", async () => {
        const w = mountPanel({ bridge: null });
        await settle();
        expect(w.text()).toContain("This build cannot hand a render to another machine");
        expect(w.findComponent({ name: "VTextField" }).exists()).toBe(false);
    });
});

describe("publishing", () => {
    it("calls the bridge with the target, hosting id, render id and maps it was given", async () => {
        const bridge = fakeBridge();
        const w = mountPanel({ bridge });
        await settle();

        const buttons = w.findAll("button");
        const publish = buttons.find((btn) => btn.text().includes("Publish"));
        expect(publish).toBeDefined();
        await publish?.trigger("click");
        await settle();

        expect(bridge.startRemoteHosting).toHaveBeenCalledTimes(1);
        const call = (bridge.startRemoteHosting as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(call.target.host).toBe("render.example");
        expect(call.hostingId).toBe("overworld-abc");
        expect(call.renderId).toBe("overworld-abc");
        expect(call.maps).toEqual([{ id: "overworld", world: "/home/me/saves/world" }]);
    });

    it("shows the verified state once a publish succeeds, and a Stop hosting control appears", async () => {
        const bridge = fakeBridge();
        const w = mountPanel({ bridge });
        await settle();

        const publish = w.findAll("button").find((btn) => btn.text().includes("Publish"));
        await publish?.trigger("click");
        await settle();

        expect(w.text()).toContain("Verified, and answering");
        expect(w.text()).toContain("http://render.example:8100/");
        expect(w.findAll("button").some((btn) => btn.text().includes("Stop hosting"))).toBe(true);
    });

    it("does not offer to publish at all with no target", async () => {
        const bridge = fakeBridge();
        const w = mountPanel({ bridge, target: null });
        await settle();

        const publish = w.findAll("button").find((btn) => btn.text().includes("Publish"));
        expect(publish?.attributes("disabled")).toBeDefined();
    });
});

describe("stopping", () => {
    async function publishedPanel(): Promise<{ wrapper: VueWrapper; bridge: RemoteHostingBridge }> {
        const bridge = fakeBridge();
        const w = mountPanel({ bridge });
        await settle();
        const publish = w.findAll("button").find((btn) => btn.text().includes("Publish"));
        await publish?.trigger("click");
        await settle();
        return { wrapper: w, bridge };
    }

    it("never calls stopRemoteHosting from a single click on the activator button", async () => {
        const { wrapper: w, bridge } = await publishedPanel();

        const stopButton = w.findAll("button").find((btn) => btn.text().includes("Stop hosting"));
        expect(stopButton).toBeDefined();
        await stopButton?.trigger("click");
        await settle();

        // The activator only opens the gate; it does not itself authorize anything. The
        // real destructive call needs both keys and a full-range slider, none of which a
        // single click on the button that opened the card can produce.
        expect(bridge.stopRemoteHosting).not.toHaveBeenCalled();
    });

    it("names exactly what stopping destroys, in the gate that opens", async () => {
        const { wrapper: w } = await publishedPanel();
        const stopButton = w.findAll("button").find((btn) => btn.text().includes("Stop hosting"));
        await stopButton?.trigger("click");
        await settle();

        // The gate's own card is teleported to the end of the document body by Vuetify's
        // overlay, outside the mounted wrapper's own root - so the body is what is read.
        const body = document.body.textContent ?? "";
        expect(body).toContain("unless the target keeps its files");
        expect(body).toContain("removes the uploaded world");
    });
});
