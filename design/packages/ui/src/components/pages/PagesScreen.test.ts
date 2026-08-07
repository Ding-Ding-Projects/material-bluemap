/**
 * @vitest-environment jsdom
 *
 * The Pages-publishing surface, mounted.
 *
 * Seven properties are only true of the rendered component and would be asserted against a
 * stand-in for nothing:
 *
 *  - a build with no bridge says what is needed rather than drawing a button that fails on
 *    press;
 *  - the price is on the page beside the pitch, because publishing pushes gigabytes across
 *    tens of thousands of files and advertising the upside alone wastes somebody's evening;
 *  - a blocker really does disable the button, and names itself rather than leaving a grey
 *    rectangle to be puzzled over;
 *  - a branch this application did not write is shown as a refusal rather than as a warning
 *    somebody can tick past;
 *  - the acknowledgement is genuinely required and genuinely reaches the main process;
 *  - taking a site down is behind the two-key gate rather than behind a plain button;
 *  - the render list is searchable through the shared field that carries the regex builder,
 *    like every other list in the application.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import PagesScreen from "./PagesScreen.vue";
import pagesScreenSource from "./PagesScreen.vue?raw";
import type {
    PagesBridge,
    PagesCandidate,
    PagesEvent,
    PagesPreflight,
    PagesPublishRequest,
    PagesRecord,
} from "./pagesBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own size.
    // The same stubs the CI-render and backup suites install, for the same reason: without
    // them a component that renders perfectly well in the app throws inside a watcher and
    // looks broken here.
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

const RENDER: PagesCandidate = {
    renderId: "world-abc123",
    webRoot: "/maps/world-abc123/web",
    maps: ["world"],
    problem: null,
};

const NETHER: PagesCandidate = {
    renderId: "nether-def456",
    webRoot: "/maps/nether-def456/web",
    maps: ["nether"],
    problem: null,
};

function preflight(overrides: Partial<PagesPreflight> = {}): PagesPreflight {
    return {
        renderId: RENDER.renderId,
        webRoot: RENDER.webRoot,
        owner: "octocat",
        repo: "maps",
        branch: "gh-pages",
        site: {
            servable: true,
            changedSettings: false,
            addedNoJekyll: false,
            maps: [{ id: "world", missing: [] }],
            totalBytes: 2_400_000_000,
            fileCount: 41_233,
            oversizedFiles: [],
            overSoftLimit: true,
            notes: [],
        },
        siteFailure: null,
        gh: {
            availability: "ready",
            version: "gh version 2.62.0",
            account: "octocat",
            host: "github.com",
            message: "gh is signed in as octocat on github.com.",
        },
        gitVersion: "git version 2.47.0",
        repository: {
            fullName: "octocat/maps",
            exists: true,
            private: false,
            canWrite: true,
            htmlUrl: "https://github.com/octocat/maps",
            branchExists: false,
            branchIsOurs: null,
            branchMarker: null,
            failure: null,
        },
        blockers: [],
        warnings: ["This repository is public, so anybody who finds the URL can download it."],
        published: null,
        ...overrides,
    };
}

const HOSTED: PagesRecord = {
    version: 1,
    renderId: RENDER.renderId,
    owner: "octocat",
    repo: "maps",
    branch: "gh-pages",
    url: "https://octocat.github.io/maps/",
    commit: "c".repeat(40),
    status: "live",
    verified: true,
    publishedAt: "2026-08-04T12:00:00Z",
};

interface Fake {
    readonly bridge: PagesBridge;
    readonly published: PagesPublishRequest[];
    readonly removed: unknown[];
    /** Feeds a live event straight to the component, as the real bridge would mid-publish. */
    fire(event: PagesEvent): void;
}

function fakeBridge(
    options: {
        report?: PagesPreflight | null;
        renders?: readonly PagesCandidate[];
        hosted?: readonly PagesRecord[];
        canStop?: boolean;
    } = {},
): Fake {
    const published: PagesPublishRequest[] = [];
    const removed: unknown[] = [];
    const listeners: ((event: PagesEvent) => void)[] = [];
    // `in` rather than `??`, because `report: null` means "the check fails" and coalescing
    // would quietly turn that case into the happy one.
    const report = "report" in options ? options.report : preflight();
    const bridge: PagesBridge = {
        listRenders: () => Promise.resolve({ ok: true, value: options.renders ?? [RENDER, NETHER] }),
        preflight: () =>
            report === null
                ? Promise.resolve({ ok: false, message: "no such repository" })
                : Promise.resolve({ ok: true, value: report }),
        publish: (request) => {
            published.push(request);
            return Promise.resolve({
                ok: false,
                failure: { code: "recorded", message: "recorded", detail: null, needsGhSignIn: false },
            });
        },
        onEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        listOwners: () => Promise.resolve({ ok: true, value: [] }),
        listPublished: () => Promise.resolve({ ok: true, value: options.hosted ?? [] }),
        removeHosting: (request) => {
            removed.push(request);
            return Promise.resolve({
                ok: true,
                report: {
                    owner: "octocat",
                    repo: "maps",
                    branch: "gh-pages",
                    pagesDisabled: true,
                    branchDeleted: true,
                    notes: [],
                },
            });
        },
        cancel: () => Promise.resolve(true),
        canListOwners: false,
        canListPublished: true,
        canStop: options.canStop ?? true,
        canCancel: true,
    };
    return { bridge, published, removed, fire: (event) => { for (const l of [...listeners]) l(event); } };
}

function mountScreen(bridge: PagesBridge | null) {
    return mount(PagesScreen, {
        props: { bridge },
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

async function check(wrapper: ReturnType<typeof mountScreen>): Promise<void> {
    await wrapper.find('[data-test="check"]').trigger("click");
    await flushPromises();
}

describe("a build that cannot do this says so", () => {
    it("shows the unsupported note instead of a button that would fail", () => {
        const wrapper = mountScreen(null);
        expect(wrapper.text()).toContain("desktop application");
        expect(wrapper.find('[data-test="publish"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="check"]').exists()).toBe(false);
    });
});

describe("the pitch and its price are both on the page", () => {
    it("says what publishing is for, and what it costs, in the same card", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        expect(wrapper.text()).toContain("GitHub Pages");
        expect(wrapper.text()).toContain("1 GB");
        expect(wrapper.text()).toContain("100 MB");
        expect(wrapper.text()).toContain("paid plan");
    });

    it("reports the size and file count once the check has run", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        await check(wrapper);
        expect(wrapper.find('[data-test="size-line"]').text()).toContain("41233");
        expect(wrapper.find('[data-test="decompression"]').text()).toContain("settings.json");
    });

    it("shows GitHub's own warnings as warnings rather than burying them", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        await check(wrapper);
        expect(wrapper.findAll('[data-test="warning"]').length).toBeGreaterThan(0);
        expect(wrapper.text()).toContain("anybody who finds the URL");
    });
});

describe("the render list", () => {
    it("offers what this computer has rendered, and its honest empty state", async () => {
        const withRenders = mountScreen(fakeBridge().bridge);
        await flushPromises();
        expect(withRenders.findAll('[data-test="render-choice"]').length).toBe(2);

        const empty = mountScreen(fakeBridge({ renders: [] }).bridge);
        await flushPromises();
        const emptyText = empty.find('[data-test="no-renders"]').text();
        expect(emptyText).toContain("chosen to publish");
        expect(emptyText).toContain("Make a map first");
    });

    it("is searched through the shared field, which is what carries the regex builder", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        // The field itself is asserted by components/config/regexPolicy.test.ts across the
        // whole package; what matters here is that this list is really filtered by it.
        expect(wrapper.findComponent({ name: "ConfigSearchField" }).exists()).toBe(true);

        await wrapper.findComponent({ name: "ConfigSearchField" }).setValue("nether");
        await flushPromises();
        const choices = wrapper.findAll('[data-test="render-choice"]');
        expect(choices).toHaveLength(1);
        expect(choices[0]?.text()).toContain("nether");
    });
});

describe("a publishing row's title is not silently clipped by a long owner/repo", () => {
    /**
     * `owner/repo` is typed by whoever set publishing up - GitHub alone allows a
     * 39-character owner plus a 100-character repo name, before bilingual mode doubles it
     * again. The row title is a `VCardTitle` turned into a flex row (`d-flex`) so the state
     * chip and spinner sit beside it; Vuetify's own `.v-card-title` rule still contributes
     * `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` underneath that, and
     * `text-overflow` has no effect once the box is a flex formatting context, so the title
     * and the chip were clipped at the card edge with no ellipsis and no scrollbar to say
     * anything was missing.
     */
    it("keeps the full title text in the DOM and marks it as wrap-safe", async () => {
        const fake = fakeBridge();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();

        const longTarget =
            "a-very-long-organisation-name-that-github-would-actually-allow/an-equally-long-repository-name-that-github-would-also-allow";
        fake.fire({ type: "started", renderId: RENDER.renderId, target: longTarget, at: "2026-01-01T00:00:00.000Z" });
        await flushPromises();

        const row = wrapper.find('[data-test="row"]');
        expect(row.exists()).toBe(true);
        // Not truncated by application code before it ever reaches the DOM.
        expect(row.text()).toContain(longTarget);

        // Carries the class the stylesheet uses to beat Vuetify's bare `.v-card-title` on
        // specificity, rather than being left to the framework's clip-with-no-ellipsis default.
        const title = row.find(".mb-pages-row__title");
        expect(title.exists()).toBe(true);
        expect(title.find(".mb-pages-row__name").text()).toBe(longTarget);
    });

    it("declares the wrap-safe rule with enough specificity to beat Vuetify's own .v-card-title", () => {
        const source = pagesScreenSource;
        const rule = /\.mb-pages-row__title\s*\{[^}]*\}/s.exec(source)?.[0] ?? "";
        expect(rule).toContain("overflow: visible");
        expect(rule).toContain("white-space: normal");
        expect(rule).toContain("flex-wrap: wrap");

        const nameRule = /\.mb-pages-row__name\s*\{[^}]*\}/s.exec(source)?.[0] ?? "";
        expect(nameRule).toContain("min-width: 0");
        expect(nameRule).toContain("overflow-wrap: anywhere");

        // The template actually wires the class onto the title and the span, not just the
        // stylesheet declaring it in isolation.
        expect(source).toMatch(/VCardTitle class="d-flex align-center ga-2 mb-pages-row__title"/);
        expect(source).toMatch(/<span class="mb-pages-row__name">\{\{ rowTitle\(row\) \}\}<\/span>/);
    });
});

describe("nothing is pushed until the report has been seen and agreed to", () => {
    it("will not publish before the check has run", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        expect(wrapper.find('[data-test="publish"]').exists()).toBe(false);
    });

    it("keeps the button disabled, and says why, until the box is ticked", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        await check(wrapper);

        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Confirm");
        expect(wrapper.find('[data-test="publish"]').attributes("disabled")).toBeDefined();
    });

    it("passes the acknowledgement through once it is ticked", async () => {
        const fake = fakeBridge();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();
        await check(wrapper);

        await wrapper.find('[data-test="acknowledge"] input').setValue(true);
        await flushPromises();
        expect(wrapper.find('[data-test="blocked"]').exists()).toBe(false);

        await wrapper.find('[data-test="publish"]').trigger("click");
        await flushPromises();

        expect(fake.published).toHaveLength(1);
        expect(fake.published[0]?.acknowledgePublish).toBe(true);
        expect(fake.published[0]?.branch).toBe("gh-pages");
    });
});

describe("a branch somebody else wrote", () => {
    it("is a refusal on the page rather than a warning that can be ticked past", async () => {
        const refused = preflight({
            blockers: [
                "octocat/maps already has a gh-pages branch that this application did not write.",
            ],
            repository: {
                fullName: "octocat/maps",
                exists: true,
                private: false,
                canWrite: true,
                htmlUrl: "https://github.com/octocat/maps",
                branchExists: true,
                branchIsOurs: false,
                branchMarker: null,
                failure: null,
            },
        });
        const fake = fakeBridge({ report: refused });
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();
        await check(wrapper);

        expect(wrapper.find('[data-test="blocker"]').text()).toContain("did not write");

        // Even with the box ticked, the button stays shut and the reason stays on screen.
        await wrapper.find('[data-test="acknowledge"] input').setValue(true);
        await flushPromises();
        expect(wrapper.find('[data-test="publish"]').attributes("disabled")).toBeDefined();
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("did not write");
        expect(fake.published).toHaveLength(0);
    });
});

describe("gh, as three remedies rather than one dead end", () => {
    it("names the command to run when nobody is signed in to it", async () => {
        const wrapper = mountScreen(
            fakeBridge({
                report: preflight({
                    gh: {
                        availability: "signed-out",
                        version: "gh version 2.62.0",
                        account: null,
                        host: null,
                        message: "gh is installed but nobody is signed in to it. Run `gh auth login`.",
                    },
                    blockers: ["gh is installed but nobody is signed in to it."],
                }),
            }).bridge,
        );
        await flushPromises();
        await check(wrapper);
        expect(wrapper.find('[data-test="gh"]').text()).toContain("gh auth login");
    });

    it("says who it is signed in as, because a machine can hold two accounts", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();
        await check(wrapper);
        expect(wrapper.find('[data-test="gh"]').text()).toContain("octocat");
    });
});

describe("a published site", () => {
    it("explains the list and stays visible, even before anything has been published", async () => {
        const wrapper = mountScreen(fakeBridge().bridge);
        await flushPromises();

        const empty = wrapper.find('[data-test="hosted-empty"]');
        expect(empty.exists()).toBe(true);
        expect(empty.text()).toContain("pushed to GitHub Pages");
        expect(empty.text()).toContain("reopened or taken down");
        expect(wrapper.find('[data-test="hosted"]').exists()).toBe(false);
    });

    it("is listed with its address, and with actions that really act", async () => {
        const wrapper = mountScreen(fakeBridge({ hosted: [HOSTED] }).bridge);
        await flushPromises();

        expect(wrapper.find('[data-test="hosted-url"]').text()).toContain("octocat.github.io");
        await wrapper.find('[data-test="hosted-open"]').trigger("click");
        expect(wrapper.emitted("open")?.[0]).toEqual(["https://octocat.github.io/maps/"]);
    });

    it("puts taking it down behind the two-key gate rather than behind a plain button", async () => {
        const wrapper = mountScreen(fakeBridge({ hosted: [HOSTED] }).bridge);
        await flushPromises();

        const gate = wrapper.findComponent({ name: "ConfigSuperConfirm" });
        expect(gate.exists()).toBe(true);
        expect(gate.props("action")).toContain("deleted");
        expect(gate.props("action")).toContain("not touched");
        expect(gate.props("affected")).toContain("octocat/maps (gh-pages)");
    });

    it("takes the site down only when the gate authorizes it", async () => {
        const fake = fakeBridge({ hosted: [HOSTED] });
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();

        expect(fake.removed).toHaveLength(0);
        wrapper.findComponent({ name: "ConfigSuperConfirm" }).vm.$emit("confirm");
        await flushPromises();
        expect(fake.removed).toEqual([
            { renderId: RENDER.renderId, owner: "octocat", repo: "maps", branch: "gh-pages" },
        ]);
    });

    it("offers no way to take a site down at all when the build cannot", async () => {
        const wrapper = mountScreen(fakeBridge({ hosted: [HOSTED], canStop: false }).bridge);
        await flushPromises();
        expect(wrapper.findComponent({ name: "ConfigSuperConfirm" }).exists()).toBe(false);
        expect(wrapper.find('[data-test="hosted-stop"]').exists()).toBe(false);
    });
});

describe("a check that failed", () => {
    it("says so where the button is, rather than leaving the form looking untouched", async () => {
        const wrapper = mountScreen(fakeBridge({ report: null }).bridge);
        await flushPromises();
        await check(wrapper);
        expect(wrapper.find('[data-test="preflight-failure"]').text()).toContain("no such repository");
        expect(wrapper.find('[data-test="publish"]').exists()).toBe(false);
    });
});
