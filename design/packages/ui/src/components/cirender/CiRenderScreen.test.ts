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

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VSelect } from "vuetify/components";
import CiRenderScreen from "./CiRenderScreen.vue";
import type {
    Answer,
    CiPreflight,
    CiRenderBridge,
    CiRepositoryNameAvailability,
    CiSyncEvent,
    CiSyncRequest,
    CiSyncResult,
    RouteReport,
} from "./ciRenderBridge.js";
import type { GitHubAccountSummaryReadout, GitHubBridge } from "../github/githubBridge.js";
import type { MinecraftFolder, MinecraftWorldSummary, WorldCatalogBridge } from "../world/worldCatalog.js";

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
            // Not probed, because the in-app sign-in worked. Distinct from "not installed",
            // which is what the surface must not claim about software it never looked for.
            availability: "not-checked",
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

/**
 * A bridge that actually forwards events, so a test can drive the mounted rows the way the
 * main process really would - `started`, then `phase`, then `progress` and `run`.
 */
function eventBridge(report: CiPreflight): { bridge: CiRenderBridge; emit: (event: CiSyncEvent) => void } {
    let listener: ((event: CiSyncEvent) => void) | null = null;
    return {
        emit: (event) => listener?.(event),
        bridge: {
            ciRenderPreflight: () => Promise.resolve({ ok: true, value: report } as Answer<CiPreflight>),
            startCiRender: () =>
                Promise.resolve({
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "test",
                        message: "not stubbed",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                }),
            checkCiRender: () =>
                Promise.resolve({ ok: true, syncId: "s", outcome: "running", run: null, state: null as never }),
            listCiRenders: () => Promise.resolve({ ok: true, value: [] }),
            cancelCiRender: () => Promise.resolve(true),
            onCiRenderEvent: (candidate) => {
                listener = candidate;
                return () => {
                    listener = null;
                };
            },
            canCancel: true,
            canList: true,
            canCheck: true,
        },
    };
}

function mountScreen(bridge: CiRenderBridge | null, extraProps: Record<string, unknown> = {}) {
    return mount(CiRenderScreen, {
        props: { bridge, canOpenSettings: true, ...extraProps },
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

/** A `MinecraftFolder`, filled with sane defaults so a test only has to name what it cares about. */
function catalogFolder(overrides: Partial<MinecraftFolder> = {}): MinecraftFolder {
    return {
        id: "f1",
        label: "Minecraft",
        labelled: false,
        chosenPath: "/mc",
        savesPath: "/mc/saves",
        resolution: "installation",
        builtIn: true,
        origin: "home",
        state: "ok",
        stateDetail: null,
        mountedAt: null,
        ...overrides,
    };
}

/** A `MinecraftWorldSummary`, filled with sane defaults for the same reason. */
function catalogWorld(overrides: Partial<MinecraftWorldSummary> = {}): MinecraftWorldSummary {
    return {
        folderId: "f1",
        path: "/mc/saves/My World",
        directoryName: "My World",
        name: "My World",
        lastPlayed: null,
        versionName: null,
        snapshot: null,
        gameMode: null,
        hardcore: null,
        cheats: null,
        seed: null,
        regionFiles: {},
        sizeBytes: null,
        sizeComplete: true,
        detailsError: null,
        ...overrides,
    };
}

function fakeCatalogBridge(
    folders: readonly MinecraftFolder[],
    worldsByFolder: Readonly<Record<string, readonly MinecraftWorldSummary[]>>,
): WorldCatalogBridge {
    return {
        listMinecraftFolders: () => Promise.resolve(folders),
        mountMinecraftFolder: () => Promise.resolve({ ok: false, message: "not stubbed" }),
        unmountMinecraftFolder: () => Promise.resolve(true),
        labelMinecraftFolder: () => Promise.resolve(true),
        scanMinecraftFolder: (id) =>
            Promise.resolve({
                ok: true,
                scan: { folderId: id, savesPath: "", worlds: worldsByFolder[id] ?? [], truncated: false },
            }),
    };
}

/** A `GitHubAccountSummaryReadout`, filled with sane defaults so a test only names what it cares about. */
function ghAccount(overrides: Partial<GitHubAccountSummaryReadout> = {}): GitHubAccountSummaryReadout {
    return {
        id: "acct",
        login: "octocat",
        userId: 1,
        name: null,
        scopes: [],
        scopesReported: true,
        source: "oauth-app",
        signedInAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        refreshable: false,
        persisted: true,
        warnings: [],
        active: false,
        ...overrides,
    };
}

/**
 * A scripted `GitHubBridge` behind the account picker: `list` answers with whichever account
 * is currently active, `setActive` really changes it (so a follow-up list reflects the
 * switch), and every call is recorded so a test can prove a switch actually reached the
 * bridge rather than only updating on-screen state.
 */
function fakeAccountsBridge(
    accounts: readonly GitHubAccountSummaryReadout[],
    activeId: string | null,
    options: { readonly setActiveFails?: string } = {},
): { bridge: GitHubBridge; calls: string[] } {
    let active = activeId;
    const calls: string[] = [];
    return {
        calls,
        bridge: {
            githubListAccounts: () => {
                calls.push("list");
                return Promise.resolve({
                    accounts: accounts.map((account) => ({ ...account, active: account.id === active })),
                    activeId: active,
                });
            },
            githubSetActiveAccount: (id) => {
                calls.push(`setActive:${id}`);
                if (options.setActiveFails !== undefined) {
                    return Promise.resolve({
                        ok: false,
                        activeId: active,
                        account: null,
                        reason: options.setActiveFails,
                    });
                }
                const account = accounts.find((candidate) => candidate.id === id) ?? null;
                if (account === null) {
                    return Promise.resolve({
                        ok: false,
                        activeId: active,
                        account: null,
                        reason: "No stored account has that id.",
                    });
                }
                active = id;
                return Promise.resolve({ ok: true, activeId: active, account, reason: null });
            },
        },
    };
}

async function check(wrapper: ReturnType<typeof mountScreen>): Promise<void> {
    // The Check button is disabled until a world folder, an owner and a repository name
    // are all filled in - the guided card's own doing. Every test below predates that gate
    // and only cares what happens once a check actually runs, so ordinary values go in for
    // the three fields first.
    await wrapper.find('[data-test="world-field"] input').setValue("/world");
    await wrapper.find('[data-test="owner-field"] input').setValue("o");
    await wrapper.find('[data-test="repo-field"] input').setValue("r");
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

    it("says nothing about gh when it was never probed, rather than calling it missing", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await check(wrapper);
        // The in-app sign-in worked, so `gh` was deliberately not looked for. Reporting
        // that as "not installed" would tell somebody to install software they may have.
        expect(wrapper.find('[data-test="route-gh"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="route-aside"]').exists()).toBe(false);
    });

    it.each([
        [
            "not-installed" as const,
            null,
            "is not on this computer",
            "Install it from cli.github.com",
        ],
        ["signed-out" as const, null, "nobody is signed in to it", "gh auth login"],
        ["ready" as const, "ghuser", "signed in as ghuser", "github.com"],
    ])("keeps the gh state %s distinct, because the remedies differ", async (availability, account, said, remedy) => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: availability === "ready" ? "gh" : "session",
                        gh: {
                            availability,
                            version: null,
                            account,
                            host: "github.com",
                            message: "",
                            usable: availability === "ready",
                            reason: null,
                        },
                    }),
                    uploadNeeded: false,
                    worldChanged: false,
                }),
            ),
        );
        await check(wrapper);

        const text = wrapper.find('[data-test="route-gh"]').text();
        expect(text).toContain(said);
        expect(text).toContain(remedy);
    });

    it("says why the other sign-in was passed over, so a denial is actionable", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: "gh",
                        describe: "Using the gh command-line tool (ghuser).",
                        session: { signedIn: true, usable: false, reason: "GitHub answered 403" },
                        gh: {
                            availability: "ready",
                            version: null,
                            account: "ghuser",
                            host: "github.com",
                            message: "",
                            usable: true,
                            reason: null,
                        },
                    }),
                    uploadNeeded: false,
                    worldChanged: false,
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="route-aside"]').text()).toContain("403");
    });

    it("lets a gh-only machine upload, and only blocks when neither route can publish", async () => {
        const canPublish = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: "gh",
                        describe: "Using the gh command-line tool (ghuser).",
                        canUpload: true,
                    }),
                }),
            ),
        );
        await check(canPublish);
        // The only thing left in the way is the consent, not the credential.
        expect(canPublish.find('[data-test="blocked"]').text()).toContain("uploaded to GitHub");

        const cannot = mountScreen(
            fakeBridge(preflight({ routeReport: routeReport({ route: "gh", canUpload: false }) })),
        );
        await check(cannot);
        const blocked = cannot.find('[data-test="blocked"]').text();
        // Both remedies, because only the person knows which sign-in they can fix.
        expect(blocked).toContain("Settings");
        expect(blocked).toContain("gh auth login");
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

describe("hosting the finished map on GitHub Pages", () => {
    it("does not ask for it unless somebody says so", async () => {
        // Rendering a world is a private act until the person says otherwise. A default
        // that put somebody's world on the open web the first time they pressed the
        // button would be wrong even in a repository that is already public.
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started));
        await check(wrapper);

        const box = wrapper.find('[data-test="publish-pages"] input');
        expect((box.element as HTMLInputElement).checked).toBe(false);

        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();
        expect(JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}")).toMatchObject({
            output: "artifact",
        });
    });

    it("asks the workflow to publish when it is ticked", async () => {
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started));
        await check(wrapper);

        await wrapper.find('[data-test="publish-pages"] input').setValue(true);
        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();

        expect(JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}")).toMatchObject({
            output: "artifact-and-pages",
        });
    });

    it("says where the map lands and what a map in parts means, before it is started", async () => {
        // Two things somebody would otherwise find out afterwards: the map goes under the
        // documentation site rather than over it, and a world too big to assemble on one
        // runner cannot be hosted this way at all.
        const wrapper = mountScreen(fakeBridge(preflight({ uploadNeeded: false, worldChanged: false })));
        await check(wrapper);
        await wrapper.find('[data-test="publish-pages"] input').setValue(true);

        const text = wrapper.text();
        expect(text).toContain("/map/");
        expect(text).toContain("in parts");
    });
});

describe("a running row shows the real numbers the main process actually sends", () => {
    it("says nothing about the route until the first phase event, then names it", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        await flushPromises();
        expect(wrapper.find('[data-test="row-route"]').exists()).toBe(false);

        emit({ type: "phase", syncId: "s", phase: "checking", route: "gh", at: "2026-08-04T10:00:01Z" });
        await flushPromises();
        expect(wrapper.find('[data-test="row-route"]').text()).toContain("gh command-line tool");
    });

    it("shows the upload's own item count beside the bytes, not only the bytes", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        emit({ type: "phase", syncId: "s", phase: "uploading", route: "session", at: "2026-08-04T10:00:01Z" });
        emit({
            type: "progress",
            syncId: "s",
            phase: "uploading",
            description: "Uploading part 2 of 3",
            bytesDone: 500,
            bytesTotal: 1000,
            assetsDone: 1,
            assetsTotal: 3,
            asset: "world.zip.001",
            at: "2026-08-04T10:00:02Z",
        });
        await flushPromises();

        const text = wrapper.find('[data-test="transfer"]').text();
        expect(text).toContain("Uploading part 2 of 3");
        expect(text).toContain("1 of 3 pieces");
    });

    it("groups shards by the wave their own name says, and shows it per job too", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        emit({
            type: "run",
            syncId: "s",
            run: {
                runId: 7,
                runNumber: 1,
                htmlUrl: "https://github.test/runs/7",
                status: "in_progress",
                conclusion: null,
                createdAt: "2026-08-04T10:00:00Z",
                updatedAt: "2026-08-04T10:00:00Z",
                headSha: "abc",
                jobs: [
                    {
                        id: 1,
                        name: "Wave 1 shard 0",
                        status: "completed",
                        conclusion: "success",
                        htmlUrl: "",
                        startedAt: null,
                        completedAt: null,
                        wave: 1,
                    },
                    {
                        id: 2,
                        name: "Wave 1 shard 1",
                        status: "in_progress",
                        conclusion: null,
                        htmlUrl: "",
                        startedAt: null,
                        completedAt: null,
                        wave: 1,
                    },
                    {
                        id: 3,
                        name: "Wave 2 shard 0",
                        status: "queued",
                        conclusion: null,
                        htmlUrl: "",
                        startedAt: null,
                        completedAt: null,
                        wave: 2,
                    },
                ],
            },
            at: "2026-08-04T10:00:03Z",
        });
        await flushPromises();

        const summary = wrapper.find('[data-test="wave-summary"]').text();
        expect(summary).toContain("Wave 1: 1 of 2");
        expect(summary).toContain("Wave 2: 0 of 1");

        const jobWaves = wrapper.findAll('[data-test="job-wave"]').map((node) => node.text());
        expect(jobWaves).toEqual(["Wave 1", "Wave 1", "Wave 2"]);
    });
});

describe("the world folder: a picker of what this machine already knows about", () => {
    it("shows worlds already found, and fills the field when one is chosen", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [catalogWorld({ path: "/mc/saves/My World", name: "My World" })],
        });
        const wrapper = mountScreen(fakeBridge(preflight()), { catalogBridge });
        await flushPromises();

        expect(wrapper.text()).toContain("My World");

        const option = wrapper.find('[role="option"]');
        expect(option.exists()).toBe(true);
        await option.trigger("click");
        await flushPromises();

        expect((wrapper.find('[data-test="world-field"] input').element as HTMLInputElement).value).toBe(
            "/mc/saves/My World",
        );
    });

    it("says plainly when nothing was found, and how to add a folder", async () => {
        const catalogBridge = fakeCatalogBridge([], {});
        const wrapper = mountScreen(fakeBridge(preflight()), { catalogBridge });
        await flushPromises();

        expect(wrapper.text()).toContain("No Minecraft folder was found");
        expect(wrapper.text()).toContain("Mount another Minecraft folder");
    });

    it("hides the browse button when the shared browse affordance is not on this build", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        expect(wrapper.find('[data-test="world-browse"]').attributes("disabled")).toBeDefined();
    });

    it("gives the disabled Browse button a reason that is on screen, not only in a hover title", () => {
        // A `title` attribute is a mouse-hover tooltip and nothing else: it never reaches a
        // keyboard-only user, and a disabled button is skipped by Tab entirely, so an
        // aria-label attached to the button can go unheard too. The one route both a
        // keyboard user and a screen reader in normal reading order actually encounter is
        // plain text sitting on the page - which this asserts exists and says why.
        const wrapper = mountScreen(fakeBridge(preflight()));
        const browse = wrapper.find('[data-test="world-browse"]');
        expect(browse.attributes("disabled")).toBeDefined();

        const reason = wrapper.find('[data-test="world-browse-unavailable"]');
        expect(reason.exists()).toBe(true);
        expect(reason.text().length).toBeGreaterThan(0);
        // The visible text and the button's own accessible name say the same thing, so a
        // screen reader landing on either route hears an actual reason rather than a bare
        // "Browse, dimmed".
        expect(browse.attributes("aria-label")).toContain(reason.text());
    });

    it("fills the field from the shared browse affordance when this build carries it", async () => {
        vi.stubGlobal("materialBluemap", { dialog: { pickFolder: () => Promise.resolve("/browsed/world") } });
        try {
            const wrapper = mountScreen(fakeBridge(preflight()));
            expect(wrapper.find('[data-test="world-browse"]').attributes("disabled")).toBeUndefined();
            await wrapper.find('[data-test="world-browse"]').trigger("click");
            await flushPromises();
            expect((wrapper.find('[data-test="world-field"] input').element as HTMLInputElement).value).toBe(
                "/browsed/world",
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("the repository owner: chosen from the signed-in account, or typed", () => {
    it("offers the sign-in action when nobody is signed in, rather than a dead end", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({ ok: false, signedIn: false, message: "Nobody is signed in to GitHub." }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        expect(wrapper.find('[data-test="owner-signed-out"]').text()).toContain("Nobody is signed in");
        const signInButton = wrapper.find('[data-test="owner-signed-out"] button');
        expect(signInButton.exists()).toBe(true);
        await signInButton.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("offers a retry when somebody is signed in but the list itself could not be read", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () => Promise.resolve({ ok: false, signedIn: true, message: "GitHub answered 500." }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        expect(wrapper.find('[data-test="owner-load-failed"]').text()).toContain("500");
        expect(wrapper.find('[data-test="owner-signed-out"]').exists()).toBe(false);
    });

    it("announces the signed-out and load-failed owner states to assistive technology", async () => {
        // Both states relied on VAlert's own hardcoded default of role="alert" *regardless
        // of severity* - correct by accident for a real failure, but exactly wrong for the
        // signed-out state, which is routine information with a remedy, not an emergency
        // that should interrupt whatever a screen reader was already saying. Every sibling
        // that shows the same kind of "nothing is wrong, here's what to do" info alert -
        // `GitHubAccountRow.vue`, `JavaRuntimeRow.vue`, `StorageSettingRow.vue`,
        // `ConsentSettingsRow.vue` - downgrades it to the polite `role="status"` instead,
        // and this screen's owner-signed-out alert is the same kind of message.
        const signedOut = mountScreen({
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({ ok: false, signedIn: false, message: "Nobody is signed in to GitHub." }),
        });
        await flushPromises();
        const signedOutAlert = signedOut.find('[data-test="owner-signed-out"]');
        expect(signedOutAlert.attributes("role")).toBe("status");
        expect(signedOutAlert.attributes("aria-live")).toBe("polite");

        // The load-failed state is a genuine failure - the list itself could not be read -
        // so it keeps the assertive `role="alert"` every sibling failure alert uses
        // (`dropFailure`, `sourceFailure`, the repositories-failure alert on this same
        // screen), stated explicitly here rather than left to a library default that could
        // change under it.
        const loadFailed = mountScreen({
            ...fakeBridge(preflight()),
            listCiOwners: () => Promise.resolve({ ok: false, signedIn: true, message: "GitHub answered 500." }),
        });
        await flushPromises();
        const loadFailedAlert = loadFailed.find('[data-test="owner-load-failed"]');
        expect(loadFailedAlert.attributes("role")).toBe("alert");
    });

    it("lists the signed-in login and every organisation to choose from", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({
                    ok: true,
                    login: "octocat",
                    owners: [
                        { login: "octocat", kind: "user" },
                        { login: "octo-org", kind: "organization" },
                    ],
                }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Choose an owner");
        expect(select?.props("items")).toEqual([
            { title: "octocat (you)", value: "octocat" },
            { title: "octo-org (organization)", value: "octo-org" },
        ]);
    });
});

describe("render as: which stored GitHub account this render authenticates as", () => {
    it("shows no picker when this build cannot list accounts at all", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge: null });
        await flushPromises();
        expect(wrapper.find('[data-test="account-select"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="account-signed-out"]').exists()).toBe(false);
    });

    it("offers the sign-in action when the registry exists but nobody is stored in it", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge([], null);
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        expect(wrapper.find('[data-test="account-signed-out"]').text()).toContain("Nobody is signed in");
        expect(wrapper.find('[data-test="account-select"]').exists()).toBe(false);
        const signInButton = wrapper.find('[data-test="account-signed-out"] button');
        expect(signInButton.exists()).toBe(true);
        await signInButton.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("still shows exactly one signed-in account, disabled, naming why", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge([ghAccount({ id: "a1", login: "octocat" })], "a1");
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        // Trivially satisfied rather than hidden: the picker still names which account it
        // is fixed to, even though there is nothing to switch to.
        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        expect(select?.props("items")).toEqual([{ title: "octocat (active)", value: "a1" }]);
        expect(select?.props("disabled")).toBe(true);
        expect(wrapper.find('[data-test="account-select-disabled"]').text()).toContain(
            "Only one GitHub account is signed in",
        );
    });

    it("lists every stored account, naming the active one, and defaults the display to it", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        expect(select?.props("items")).toEqual([
            { title: "monalisa", value: "a2" },
            { title: "octocat (active)", value: "a1" },
        ]);
        expect(select?.props("modelValue")).toBe("a1");
        expect(select?.props("disabled")).toBe(false);
    });

    it("re-resolves the owner list for the chosen account rather than the active one, and never switches the active account", async () => {
        const { bridge: accountsBridge, calls: accountCalls } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const ownerCalls: (string | undefined)[] = [];
        const wrapper = mountScreen(
            {
                ...fakeBridge(preflight()),
                listCiOwners: (accountId) => {
                    ownerCalls.push(accountId);
                    const login = accountId === "a2" ? "monalisa" : "octocat";
                    return Promise.resolve({ ok: true, login, owners: [{ login, kind: "user" }] });
                },
            },
            { accountsBridge },
        );
        await flushPromises();
        // The active account, resolved implicitly - the exact call a single-account build
        // has always made, with no id named at all.
        expect(ownerCalls).toEqual([undefined]);

        // Selecting from the picker is what a keyboard-driven choice reaches too: Vuetify's
        // VSelect emits this same `update:modelValue` event whether an option is activated
        // by Enter on a focused row or by a click, so this is not a mouse-only path.
        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        await select?.vm.$emit("update:modelValue", "a2");
        await flushPromises();

        expect(ownerCalls.at(-1)).toBe("a2");
        // Never the application-wide active-account switch. A call log holding only "list"
        // proves Settings, downloads, backups and everything else kept reading whichever
        // account was already active - this picker only ever read the list, never wrote it.
        expect(accountCalls).toEqual(["list"]);
    });

    it("clears the owner field and a stale preflight report when a different account is chosen", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await check(wrapper);
        expect(wrapper.find('[data-test="route"]').exists()).toBe(true);
        expect((wrapper.find('[data-test="owner-field"] input').element as HTMLInputElement).value).toBe("o");

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        await select?.vm.$emit("update:modelValue", "a2");
        await flushPromises();

        expect((wrapper.find('[data-test="owner-field"] input').element as HTMLInputElement).value).toBe("");
        // Nothing re-checks automatically: "Check before anything is sent" stays the one
        // deliberate action that reads a report, so the stale one is dropped rather than
        // silently re-fetched.
        expect(wrapper.find('[data-test="route"]').exists()).toBe(false);
    });

    it("carries the chosen account id into the preflight check and the real dispatch", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const preflightRequests: CiSyncRequest[] = [];
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(
            {
                ...fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started),
                ciRenderPreflight: (request) => {
                    preflightRequests.push(request);
                    return Promise.resolve({
                        ok: true,
                        value: preflight({ uploadNeeded: false, worldChanged: false }),
                    });
                },
            },
            { accountsBridge },
        );
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        await select?.vm.$emit("update:modelValue", "a2");
        await flushPromises();

        await check(wrapper);
        expect(preflightRequests.at(-1)).toMatchObject({ accountId: "a2" });

        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();
        expect(JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}")).toMatchObject({
            accountId: "a2",
        });
    });

    it("leaves the account id off a request entirely while the picker is untouched", async () => {
        // The exact wire shape a single-account build, or anybody who never opens the
        // picker, has always sent - proven here rather than only asserted from behaviour,
        // because a stray `accountId: undefined` key would still pass a looser check.
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started));
        await check(wrapper);
        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();
        const request = JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}") as Record<
            string,
            unknown
        >;
        expect("accountId" in request).toBe(false);
    });
});

describe("an existing repository, offered because this flow never creates one", () => {
    it("fills owner and name when one is picked from the account's own repositories", async () => {
        const bridgeWithRepositories: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listExistingRepositories: () =>
                Promise.resolve({
                    ok: true,
                    value: [
                        {
                            owner: "octocat",
                            name: "maps",
                            fullName: "octocat/maps",
                            private: true,
                            canWrite: true,
                            htmlUrl: "https://github.test/octocat/maps",
                        },
                    ],
                }),
        };
        const wrapper = mountScreen(bridgeWithRepositories);
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "One of your repositories");
        expect(select?.props("items")).toEqual([{ title: "octocat/maps (private)", value: "octocat/maps" }]);

        await select?.vm.$emit("update:modelValue", "octocat/maps");
        await flushPromises();

        expect((wrapper.find('[data-test="owner-field"] input').element as HTMLInputElement).value).toBe(
            "octocat",
        );
        expect((wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value).toBe("maps");
    });
});

describe("the repository name: suggested once a world is chosen, checked live", () => {
    it("fills the empty repository field with the suggestion", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [catalogWorld({ path: "/mc/saves/My World", name: "My World" })],
        });
        const bridgeWithSuggest: CiRenderBridge = {
            ...fakeBridge(preflight()),
            suggestCiRepoName: (sourceName) => Promise.resolve(sourceName.toLowerCase().replace(/\s+/g, "-")),
        };
        const wrapper = mountScreen(bridgeWithSuggest, { catalogBridge });
        await flushPromises();

        await wrapper.find('[role="option"]').trigger("click");
        await flushPromises();

        expect((wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value).toBe(
            "my-world",
        );
    });

    it("never overwrites a repository name somebody already typed", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [catalogWorld({ path: "/mc/saves/My World", name: "My World" })],
        });
        const bridgeWithSuggest: CiRenderBridge = {
            ...fakeBridge(preflight()),
            suggestCiRepoName: () => Promise.resolve("suggested-name"),
        };
        const wrapper = mountScreen(bridgeWithSuggest, { catalogBridge });
        await flushPromises();

        await wrapper.find('[data-test="repo-field"] input').setValue("already-typed");
        await wrapper.find('[role="option"]').trigger("click");
        await flushPromises();

        expect((wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value).toBe(
            "already-typed",
        );
    });

    it("applies the suggestion for the world chosen last, not whichever round trip resolves first", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [
                catalogWorld({ path: "/mc/saves/World A", directoryName: "World A", name: "World A" }),
                catalogWorld({ path: "/mc/saves/World B", directoryName: "World B", name: "World B" }),
            ],
        });

        // World A's suggestion resolves fast (5ms); World B's resolves slow (50ms). A user
        // who chooses A then quickly chooses B - before A's round trip has returned - must
        // end up with B's suggested name, because B is what is actually selected, not A's
        // just because A's round trip happened to land first.
        const bridgeWithSuggest: CiRenderBridge = {
            ...fakeBridge(preflight()),
            suggestCiRepoName: (sourceName) =>
                new Promise<string>((resolve) => {
                    const slug = sourceName.toLowerCase().replace(/\s+/g, "-");
                    setTimeout(() => resolve(slug), sourceName === "World A" ? 5 : 50);
                }),
        };
        const wrapper = mountScreen(bridgeWithSuggest, { catalogBridge });
        await flushPromises();

        const options = wrapper.findAll('[role="option"]');
        expect(options.length).toBeGreaterThanOrEqual(2);

        await options[0]!.trigger("click"); // World A, chosen first
        await options[1]!.trigger("click"); // World B, chosen last

        await new Promise((resolve) => setTimeout(resolve, 80));
        await flushPromises();

        expect((wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value).toBe(
            "world-b",
        );
    });

    it.each([
        [
            "available" as const,
            { status: "available", owner: "o", repo: "r" } as CiRepositoryNameAvailability,
            "free on GitHub",
        ],
        [
            "taken" as const,
            { status: "taken", owner: "o", repo: "r", private: false, htmlUrl: null } as CiRepositoryNameAvailability,
            "already exists",
        ],
        [
            "unknown" as const,
            { status: "unknown", owner: "o", repo: "r", message: "offline" } as CiRepositoryNameAvailability,
            "Could not check",
        ],
    ])("says the %s verdict in plain words, after a pause rather than on every keystroke", async (_label, answer, expected) => {
        vi.useFakeTimers();
        try {
            const bridgeWithCheck: CiRenderBridge = {
                ...fakeBridge(preflight()),
                checkCiRepoName: () => Promise.resolve(answer),
            };
            const wrapper = mountScreen(bridgeWithCheck);

            await wrapper.find('[data-test="owner-field"] input').setValue("o");
            await wrapper.find('[data-test="repo-field"] input').setValue("r");
            // Nothing yet: the check is debounced rather than fired on every keystroke.
            expect(wrapper.find('[data-test="repo-availability"]').exists()).toBe(false);

            await vi.advanceTimersByTimeAsync(600);
            await flushPromises();

            expect(wrapper.find('[data-test="repo-availability"]').text()).toContain(expected);
        } finally {
            vi.useRealTimers();
        }
    });

    it("marks both the checking and the settled availability text as a polite live region", async () => {
        // The paragraph used to carry no ARIA role at all, so "checking...", then "taken" or
        // "free", silently replaced each other on screen with nothing telling a screen
        // reader that had moved on to another field that either had happened. Real timers
        // and a manually-resolved promise, rather than fake timers, because
        // `advanceTimersByTimeAsync` also drains the already-resolved bridge promise in the
        // same tick and there would be no window left in which "checking" is actually on
        // screen to assert against.
        let resolveCheck: (value: CiRepositoryNameAvailability) => void = () => {};
        const bridgeWithCheck: CiRenderBridge = {
            ...fakeBridge(preflight()),
            checkCiRepoName: () =>
                new Promise<CiRepositoryNameAvailability>((resolve) => {
                    resolveCheck = resolve;
                }),
        };
        const wrapper = mountScreen(bridgeWithCheck);

        await wrapper.find('[data-test="owner-field"] input').setValue("o");
        await wrapper.find('[data-test="repo-field"] input').setValue("r");

        // Past the 600ms debounce, so the check has actually started, but the bridge's own
        // promise is still deliberately unresolved.
        await new Promise((resolve) => setTimeout(resolve, 650));
        await flushPromises();

        const checking = wrapper.find('[data-test="repo-availability"]');
        expect(checking.exists()).toBe(true);
        expect(checking.attributes("role")).toBe("status");
        expect(checking.attributes("aria-live")).toBe("polite");

        resolveCheck({ status: "available", owner: "o", repo: "r" });
        await flushPromises();

        const settled = wrapper.find('[data-test="repo-availability"]');
        expect(settled.attributes("role")).toBe("status");
        expect(settled.attributes("aria-live")).toBe("polite");
    });

    it("names the exact GitHub naming rule a typed name breaks", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await wrapper.find('[data-test="repo-field"] input').setValue("bad name");
        await flushPromises();
        expect(wrapper.find('[data-test="repo-field"]').text()).toContain("letters, digits");
    });
});

describe("the Check button names exactly which field is missing or invalid", () => {
    it("blocks on a missing world, then owner, then repository name, one at a time", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("world folder");

        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("repository owner");

        await wrapper.find('[data-test="owner-field"] input').setValue("o");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("repository name");

        await wrapper.find('[data-test="repo-field"] input').setValue("r");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').exists()).toBe(false);
    });

    it("stays blocked on an invalid repository name, even once every field has something in it", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await wrapper.find('[data-test="owner-field"] input').setValue("o");
        await wrapper.find('[data-test="repo-field"] input').setValue("bad name");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("letters, digits");
    });
});
