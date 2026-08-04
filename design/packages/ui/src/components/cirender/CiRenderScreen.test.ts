/**
 * @vitest-environment jsdom
 *
 * The CI-render surface, mounted.
 *
 * Five properties are only true of the rendered component and would be asserted against a
 * stand-in for nothing: that a build with no bridge says what is needed rather than showing
 * a button that fails on press; that a **public** repository cannot be rendered to until
 * the box has been ticked; that an unaccepted Mojang licence blocks the button and offers
 * the settings row rather than a tick box of its own; that the credential in play is on
 * screen before the button; and that the page states the trade-offs beside the pitch,
 * because advertising the upside alone is how somebody wastes an afternoon.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import CiRenderScreen from "./CiRenderScreen.vue";
import type {
    Answer,
    CiPreflight,
    CiRenderBridge,
    CiSyncEvent,
    CiSyncResult,
    RouteReport,
} from "./ciRenderBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own
    // size. The same stubs the backup and downloads suites install, for the same reason:
    // without them a component that renders perfectly well in the app throws inside a
    // watcher and looks broken here.
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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;
});

function routeReport(overrides: Partial<RouteReport> = {}): RouteReport {
    return {
        route: "session",
        describe: "Using the GitHub sign-in in this application (octocat).",
        session: { signedIn: true, usable: true, reason: null },
        gh: {
            availability: "not-installed",
            version: null,
            account: null,
            host: null,
            message: "",
            usable: false,
            reason: "not needed",
        },
        ready: true,
        canUpload: true,
        ...overrides,
    };
}

function preflight(overrides: Partial<CiPreflight> = {}): CiPreflight {
    return {
        syncId: "s",
        repository: {
            owner: "o",
            repo: "r",
            fullName: "o/r",
            private: true,
            canWrite: true,
            htmlUrl: "https://github.test/o/r",
            warning: { level: "note", message: "This repository is private." },
        },
        repositoryFailure: null,
        routeReport: routeReport(),
        eulaAccepted: true,
        plan: {
            mapId: "world",
            mapName: "World",
            dimension: "minecraft:overworld",
            inputs: {},
            notCarried: [],
        },
        planFailure: null,
        world: { label: "overworld", files: 10, bytes: 1000 },
        worldFailure: null,
        worldChanged: true,
        uploadNeeded: true,
        estimatedArchiveBytes: 1000,
        tooLargeToUpload: false,
        state: null,
        run: null,
        ...overrides,
    };
}

function fakeBridge(report: CiPreflight, started: CiSyncResult[] = []): CiRenderBridge {
    return {
        ciRenderPreflight: () => Promise.resolve({ ok: true, value: report } as Answer<CiPreflight>),
        startCiRender: (request) => {
            started.push({
                ok: false,
                syncId: "recorded",
                failure: {
                    code: "recorded",
                    message: JSON.stringify(request),
                    detail: null,
                    status: null,
                    needsSignIn: false,
                    needsEula: false,
                    route: null,
                    run: null,
                    failingJob: null,
                    logExcerpt: null,
                },
            });
            return Promise.resolve(started[started.length - 1] as CiSyncResult);
        },
        checkCiRender: () =>
            Promise.resolve({ ok: true, syncId: "s", outcome: "running", run: null, state: null as never }),
        listCiRenders: () => Promise.resolve({ ok: true, value: [] }),
        cancelCiRender: () => Promise.resolve(true),
        onCiRenderEvent: (_listener: (event: CiSyncEvent) => void) => () => {},
        canCancel: true,
        canList: true,
        canCheck: true,
    };
}

function mountScreen(bridge: CiRenderBridge | null) {
    return mount(CiRenderScreen, {
        props: { bridge, canOpenSettings: true },
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

async function check(wrapper: ReturnType<typeof mountScreen>): Promise<void> {
    const buttons = wrapper.findAll("button");
    const trigger = buttons.find((button) => button.text().includes("Check"));
    await trigger?.trigger("click");
    await flushPromises();
}

describe("a build that cannot do this says so", () => {
    it("shows the unsupported note instead of a button that would fail", () => {
        const wrapper = mountScreen(null);
        expect(wrapper.text()).toContain("desktop application");
        expect(wrapper.find('[data-test="start"]').exists()).toBe(false);
    });
});

describe("the pitch and its price are both on the page", () => {
    it("says the point is that your computer does not do the work", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        expect(wrapper.text()).toContain("cannot render a big world");
        expect(wrapper.text()).toContain("GitHub's runners");
    });

    it("states the trade-offs beside it rather than only the upside", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        const text = wrapper.text();
        expect(text).toContain("takes time and bandwidth");
        expect(text).toContain("finite for private repositories");
        expect(text).toContain("unlimited standard-runner minutes");
    });
});

describe("consent", () => {
    it("will not start against a public repository until the box is ticked", async () => {
        // The world is already uploaded, so the public acknowledgement is the only thing
        // left in the way - which is what this test is about. The upload consent has its
        // own test below.
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    uploadNeeded: false,
                    worldChanged: false,
                    repository: {
                        owner: "o",
                        repo: "r",
                        fullName: "o/r",
                        private: false,
                        canWrite: true,
                        htmlUrl: "",
                        warning: { level: "warning", message: "This repository is PUBLIC." },
                    },
                }),
            ),
        );
        await check(wrapper);

        expect(wrapper.find('[data-test="repository-warning"]').text()).toContain("PUBLIC");
        expect(wrapper.find('[data-test="ack-public"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("publicly");
        // Present but not pressable: a button that vanishes leaves nothing for the reason
        // beside it to be about.
        expect(wrapper.find('[data-test="start"]').attributes("disabled")).toBeDefined();
    });

    it("asks before a world leaves the machine, and neither box starts ticked", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await check(wrapper);

        const upload = wrapper.find('[data-test="ack-upload"] input');
        expect((upload.element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("uploaded to GitHub");
    });

    it("blocks on an unaccepted Mojang licence and offers the setting, never a tick box", async () => {
        const wrapper = mountScreen(fakeBridge(preflight({ eulaAccepted: false })));
        await check(wrapper);

        expect(wrapper.find('[data-test="eula"]').text()).toContain("will not accept it for you");
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Mojang");
        // The only control offered is the one that opens the existing consent row.
        expect(wrapper.find('[data-test="eula"] button').text()).toContain("consent");
    });
});

describe("which credential is in play is on screen before the button", () => {
    it("names the in-app sign-in when that is what will drive it", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await check(wrapper);
        expect(wrapper.find('[data-test="route"]').text()).toContain("octocat");
    });

    it("names gh when the fallback is what will drive it", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: "gh",
                        describe: "Using the gh command-line tool (ghuser), because the sign-in in this application could not.",
                        canUpload: false,
                    }),
                    uploadNeeded: false,
                    worldChanged: false,
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="route"]').text()).toContain("gh command-line tool");
    });

    it("blocks with the reason when neither credential can drive it", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: null,
                        ready: false,
                        canUpload: false,
                        describe: "Neither GitHub route can start a render. gh: not on PATH.",
                    }),
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Neither GitHub route");
    });
});

describe("what it says about an upload", () => {
    it("says plainly when nothing will be sent", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    uploadNeeded: false,
                    worldChanged: false,
                    state: { assetName: "world.zip" } as never,
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="upload-line"]').text()).toContain("has not changed");
        // No consent is asked for something that is not going to happen.
        expect(wrapper.find('[data-test="ack-upload"]').exists()).toBe(false);
    });

    it("names the settings the workflow cannot carry, rather than letting them go quietly", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    plan: {
                        mapId: "world",
                        mapName: "World",
                        dimension: "minecraft:overworld",
                        inputs: {},
                        notCarried: ["ambient-light", "sky-color"],
                    },
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.text()).toContain("ambient-light, sky-color");
        expect(wrapper.text()).toContain("BlueMap's defaults");
    });
});
