/**
 * @vitest-environment jsdom
 *
 * The "world kept in a git repository" screen, mounted.
 *
 * The properties worth pinning are the ones that are only true of the rendered component:
 *
 *  - a build with no bridge says what is needed rather than drawing a button that fails on
 *    press;
 *  - creating a repository is its own explicit button, never something Sync does silently -
 *    pressing it never calls `sync`, and pressing Sync never calls `createBackupRepository`;
 *  - the acknowledgement genuinely gates the Sync button, and the disabled button names why;
 *  - the tracked-worlds list is searchable through the shared field, and its bulk "stop
 *    tracking" sits behind the two-key gate rather than behind a plain button;
 *  - adoption never writes: probing and viewing a plan never call `sync` or `remove`, and
 *    the only place `remove`/`sync` are ever called from is the sync/records sections;
 *  - a repository's hedge ("looks like yours") is shown verbatim rather than upgraded to a
 *    claim of certainty, and every cannot-cross-machines item in a plan is shown with a route
 *    to fixing it rather than silently dropped.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VSlider, VSwitch } from "vuetify/components";

import WorldRepoScreen from "./WorldRepoScreen.vue";
import worldRepoScreenSource from "./WorldRepoScreen.vue?raw";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { GATE_TRAVEL_END } from "../confirm/superConfirmGate.js";
import type {
    WorldRepoAdoptionPlan,
    WorldRepoAdoptionSignal,
    WorldRepoBridge,
    WorldRepoEvent,
    WorldRepoPreflight,
    WorldRepoRecord,
    WorldRepoTarget,
} from "./worldRepoBridge.js";
import type { BackupBridge, CreateRepositoryRequest, RepositoryChoice } from "../backup/backupBridge.js";
import type { ProjectHost, ProjectWriteAnswer } from "../project/projectHost.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own size.
    // The same stubs the Pages/backup suites install, for the same reason: without them a
    // component that renders perfectly well in the app throws inside a watcher here.
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

const RECORD: WorldRepoRecord = {
    version: 1,
    worldPath: "/worlds/andyville",
    owner: "octocat",
    repo: "andyville-world",
    branch: "world",
    stage: "finished",
    commit: "abc123",
    pushVerified: true,
    bytes: 512_000_000,
    fileCount: 8_213,
    syncedAt: "2026-08-01T00:00:00.000Z",
};

function preflight(overrides: Partial<WorldRepoPreflight> = {}): WorldRepoPreflight {
    return {
        worldPath: "/worlds/andyville",
        owner: "octocat",
        repo: "andyville-world",
        branch: "world",
        world: { fileCount: 8213, bytes: 512_000_000, oversizedFiles: [], looksLikeWorld: true, overSoftLimit: false, overHeavyLimit: false },
        worldFailure: null,
        gh: { availability: "ready", version: "gh version 2.62.0", account: "octocat", host: "github.com", scopes: null, message: "gh is signed in as octocat on github.com." },
        gitVersion: "git version 2.47.0",
        repository: { fullName: "octocat/andyville-world", exists: true, private: true, canWrite: true, htmlUrl: "https://github.com/octocat/andyville-world", branchExists: false, branchIsOurs: null, branchMarker: null, branchSha: null, failure: null },
        blockers: [],
        warnings: ["This world is over the 1 GB GitHub asks repositories to stay under."],
        published: null,
        ...overrides,
    };
}

interface FakeWorldRepo {
    bridge: WorldRepoBridge;
    fire(event: WorldRepoEvent): void;
    readonly syncCalls: unknown[];
    readonly removeCalls: WorldRepoTarget[];
    readonly probeCalls: unknown[];
    readonly planCalls: unknown[];
}

function fakeWorldRepo(overrides: Partial<WorldRepoBridge> = {}): FakeWorldRepo {
    const listeners: ((event: WorldRepoEvent) => void)[] = [];
    const syncCalls: unknown[] = [];
    const removeCalls: WorldRepoTarget[] = [];
    const probeCalls: unknown[] = [];
    const planCalls: unknown[] = [];
    const base: WorldRepoBridge = {
        owners: () => Promise.resolve({ ok: true, value: [{ login: "octocat", kind: "user" }] }),
        preflight: () => Promise.resolve({ ok: true, value: preflight() }),
        sync: (request) => {
            syncCalls.push(request);
            return Promise.resolve({
                ok: true,
                report: {
                    worldPath: request.worldPath,
                    owner: request.owner,
                    repo: request.repo,
                    branch: request.branch ?? "world",
                    repositoryUrl: `https://github.com/${request.owner}/${request.repo}`,
                    commit: "def456",
                    pushVerified: true,
                    bytes: 100,
                    fileCount: 5,
                    notes: [],
                },
                durationMs: 10,
            });
        },
        remove: (target) => {
            removeCalls.push(target);
            return Promise.resolve({ ok: true, report: { owner: target.owner, repo: target.repo, branch: target.branch ?? "world", branchDeleted: true, notes: [] } });
        },
        cancel: () => Promise.resolve(true),
        active: () => Promise.resolve([]),
        records: () => Promise.resolve({ ok: true, value: [RECORD] }),
        resume: () => Promise.resolve({ ok: false, failure: { code: "x", message: "no", detail: null, needsGhSignIn: false } }),
        remoteTip: () => Promise.resolve({ ok: true, value: { exists: false, sha: null } }),
        adoptionProbe: (request) => {
            probeCalls.push(request);
            return Promise.resolve({
                ok: true,
                value: request.candidates.map(
                    (c): WorldRepoAdoptionSignal => ({
                        fullName: `${c.owner}/${c.repo}`,
                        branch: "world",
                        status: "prepared",
                        marker: { tool: "worldlens", version: 1, branch: "world", updatedAt: "2026-01-01T00:00:00.000Z" },
                        bootstrapMarker: null,
                        message: `${c.owner}/${c.repo}: its world branch carries this application's world marker - it looks like a repository this application prepared.`,
                    }),
                ),
            });
        },
        adoptionPlan: (request) => {
            planCalls.push(request);
            return Promise.resolve({
                ok: true,
                value: {
                    ok: true,
                    owner: request.owner,
                    repo: request.repo,
                    branch: request.branch ?? "world",
                    marker: { tool: "worldlens", version: 1, branch: "world", updatedAt: "2026-01-01T00:00:00.000Z" },
                    bootstrapMarker: null,
                    preparedByNewerMarkerVersion: false,
                    project: { version: 1, id: "p1", name: "Andyville", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", appVersion: null, maps: [], storages: [], render: { threads: null, force: false, fixEdges: false, metrics: false, outputFolder: null }, core: null, webapp: null, webserver: null, plugin: null, fromWizard: false },
                    restoring: { projectName: "Andyville", fromWizard: false, maps: [{ id: "world", name: "Overworld", dimension: "overworld" }], storageIds: ["main"], renderNotes: [], coreCustomized: false, webappCustomized: false, webserverCustomized: false, pluginCustomized: false },
                    needsAttention: [
                        { id: "world-folder", mapId: null, message: "The Minecraft world folder itself travels separately from this repository." },
                        { id: "dependencies", mapId: null, message: "A local Java runtime belongs to the old computer." },
                        { id: "remote-host", mapId: null, message: "Any remote host or SSH configuration is not stored in this repository." },
                    ],
                    alreadyLocal: null,
                } satisfies WorldRepoAdoptionPlan,
            });
        },
        onWorldRepoEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        ...overrides,
    };
    return {
        bridge: base,
        fire: (event) => { for (const l of [...listeners]) l(event); },
        syncCalls,
        removeCalls,
        probeCalls,
        planCalls,
    };
}

function fakeRepoBridge(overrides: Partial<BackupBridge> = {}): { bridge: BackupBridge; createCalls: CreateRepositoryRequest[] } {
    const createCalls: CreateRepositoryRequest[] = [];
    const repos: RepositoryChoice[] = [
        { owner: "octocat", name: "andyville-world", fullName: "octocat/andyville-world", private: true, canWrite: true, htmlUrl: "https://github.com/octocat/andyville-world" },
        { owner: "octocat", name: "unrelated-repo", fullName: "octocat/unrelated-repo", private: false, canWrite: true, htmlUrl: "https://github.com/octocat/unrelated-repo" },
    ];
    const bridge: BackupBridge = {
        listBackupRepositories: () => Promise.resolve({ ok: true, value: repos }),
        createBackupRepository: (request) => {
            createCalls.push(request);
            return Promise.resolve({
                ok: true,
                value: { owner: request.ownerLogin, name: request.name, fullName: `${request.ownerLogin}/${request.name}`, private: request.private, canWrite: true, htmlUrl: `https://github.com/${request.ownerLogin}/${request.name}` },
            });
        },
        inspectBackupRepository: () => Promise.resolve({ ok: false, message: "unused" }),
        inspectBackupSource: () => Promise.resolve({ ok: false, message: "unused" }),
        listBackups: () => Promise.resolve({ ok: true, value: [] }),
        startBackup: () => Promise.resolve({ ok: false, backupId: "x", failure: { code: "x", message: "unused", detail: null, status: null, needsSignIn: false } }),
        cancelBackup: () => Promise.resolve(false),
        activeBackups: () => Promise.resolve([]),
        onBackupEvent: () => () => {},
        canCancel: true,
        canListRepositories: true,
        canListBackups: true,
        canSeeActive: true,
        canCreateRepository: true,
        ...overrides,
    };
    return { bridge, createCalls };
}

function fakeProjectHost(): { host: ProjectHost; writes: { world: string; project: unknown }[] } {
    const writes: { world: string; project: unknown }[] = [];
    const host: ProjectHost = {
        name: "test",
        canDelete: false,
        listProjects: () => Promise.resolve({ projects: [], scanned: 0, problems: [] }),
        readProject: () => Promise.resolve({ ok: false, failure: { kind: "absent" } }),
        writeProject: (world, project) => {
            writes.push({ world, project });
            return Promise.resolve({ ok: true, file: `${world}/worldlens.project.json`, historyOk: true, revision: null, historyMessage: "" } satisfies ProjectWriteAnswer);
        },
    };
    return { host, writes };
}

function mountScreen(
    bridge: WorldRepoBridge | null,
    repoBridge: BackupBridge | null = fakeRepoBridge().bridge,
    projectHost: ProjectHost | null = fakeProjectHost().host,
) {
    return mount(WorldRepoScreen, {
        props: { bridge, repoBridge, projectHost },
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, fallbackWarn: false }),
            ],
        },
    });
}

describe("a build that cannot do this says so", () => {
    it("shows the unsupported note instead of a button that would fail", () => {
        const wrapper = mountScreen(null);
        expect(wrapper.text()).toContain("desktop application");
        expect(wrapper.find('[data-test="check"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="sync"]').exists()).toBe(false);
    });
});

describe("checking, then syncing", () => {
    it("loads owners into a real picker rather than a bare text box", async () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        await flushPromises();
        expect(wrapper.find('[data-test="owner-select"]').exists()).toBe(true);
    });

    it("shows the report, including GitHub's own warnings, once checked", async () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        await flushPromises();
        await wrapper.find('[data-test="check"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="size-line"]').text()).toContain("8213");
        expect(wrapper.findAll('[data-test="warning"]').length).toBeGreaterThan(0);
        expect(wrapper.text()).toContain("1 GB");
    });

    it("names exactly why the Sync button is disabled, in the order somebody meets it", async () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        await flushPromises();
        // Before any check: blocked on "check first".
        expect(wrapper.find('[data-test="blocked"]').exists()).toBe(false); // report card not shown yet
        await wrapper.find('[data-test="check"]').trigger("click");
        await flushPromises();
        const syncButton = wrapper.find('[data-test="sync"]');
        expect(syncButton.attributes("disabled")).toBeDefined();
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Confirm that you mean to sync");
    });

    it("syncs only once acknowledged, and reports a verified push", async () => {
        const fake = fakeWorldRepo();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();
        await wrapper.find('[data-test="check"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="acknowledge"] input').setValue(true);
        await flushPromises();
        expect(wrapper.find('[data-test="sync"]').attributes("disabled")).toBeUndefined();
        await wrapper.find('[data-test="sync"]').trigger("click");
        await flushPromises();
        expect(fake.syncCalls).toHaveLength(1);
        expect((fake.syncCalls[0] as { acknowledgeSync: boolean }).acknowledgeSync).toBe(true);
    });

    it("shows a syncing row with real progress, not only a spinner", async () => {
        const fake = fakeWorldRepo();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();
        await wrapper.find('[data-test="check"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="acknowledge"] input').setValue(true);
        await flushPromises();
        await wrapper.find('[data-test="sync"]').trigger("click");
        await flushPromises();
        fake.fire({ type: "progress", key: "octocat__andyville-world__world", phase: "staging", description: "Staging the world's files", done: 40, total: 100, at: "t" });
        await flushPromises();
        expect(wrapper.find('[data-test="progress"]').text()).toContain("40");
    });
});

describe("creating a repository is explicit, never implicit", () => {
    it("offers its own button, distinct from Sync", async () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        await flushPromises();
        expect(wrapper.find('[data-test="create-repo-button"]').exists()).toBe(true);
    });

    it("names why the create button is disabled before an owner and a name exist", () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        expect(wrapper.find('[data-test="create-repo-blocked"]').text()).toContain("Type an owner");
    });

    it("pressing Create never calls sync, and pressing Sync never calls createBackupRepository", async () => {
        const worldRepo = fakeWorldRepo();
        const repo = fakeRepoBridge();
        const wrapper = mountScreen(worldRepo.bridge, repo.bridge);
        await flushPromises();

        // Fill owner/repo through the exposed refs to avoid depending on Vuetify's own
        // internal select/text-field DOM shape for this assertion.
        const vm = wrapper.vm as unknown as { owner: string; repo: string; createRepo: () => Promise<void> };
        vm.owner = "octocat";
        vm.repo = "brand-new-world";
        await flushPromises();
        await wrapper.find('[data-test="create-repo-button"]').trigger("click");
        await flushPromises();

        expect(repo.createCalls).toHaveLength(1);
        expect(repo.createCalls[0]?.name).toBe("brand-new-world");
        expect(worldRepo.syncCalls).toHaveLength(0);
    });
});

describe("worlds this computer is tracking", () => {
    it("lists a tracked world with its facts", async () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        await flushPromises();
        const record = wrapper.find('[data-test="record"]');
        expect(record.text()).toContain("octocat/andyville-world");
        expect(record.text()).toContain("world");
    });

    it("is searchable through the shared field that carries the regex builder", async () => {
        const wrapper = mountScreen(fakeWorldRepo().bridge);
        await flushPromises();
        expect(wrapper.find(".mb-config-search").exists()).toBe(true);
    });

    it("keeps one world through one key and a partial slider, then removes it only at full travel", async () => {
        const fake = fakeWorldRepo();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();

        await wrapper.find('[data-test="record-stop"]').trigger("click");
        await flushPromises();

        const gate = wrapper
            .findAllComponents(ConfigSuperConfirm)
            .find((candidate) => candidate.props("title") === "Stop tracking this world");
        expect(gate?.exists()).toBe(true);
        expect(gate?.props("action")).toContain("world branch of octocat/andyville-world");
        expect(gate?.props("affected")).toEqual(["octocat/andyville-world (world)"]);

        const switches = gate?.findAllComponents(VSwitch) ?? [];
        const slider = gate?.findComponent(VSlider);

        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await flushPromises();
        expect(fake.removeCalls).toHaveLength(0);

        await switches[0]?.setValue(true);
        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await flushPromises();
        expect(fake.removeCalls).toHaveLength(0);

        await switches[1]?.setValue(true);
        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END - 1);
        await flushPromises();
        expect(fake.removeCalls).toHaveLength(0);

        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await flushPromises();
        expect(fake.removeCalls).toEqual([
            { worldPath: RECORD.worldPath, owner: RECORD.owner, repo: RECORD.repo, branch: RECORD.branch },
        ]);
    });

    it("puts bulk stop-tracking behind both keys and the full slider", async () => {
        const fake = fakeWorldRepo();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();

        // Choose the one tracked record.
        await wrapper.find('[data-test="record"] input[type="checkbox"]').setValue(true);
        await flushPromises();

        await wrapper.find('[data-test="bulk-stop"]').trigger("click");
        await flushPromises();

        const gate = wrapper
            .findAllComponents(ConfigSuperConfirm)
            .find((candidate) => candidate.props("title") === "Stop tracking these worlds");
        expect(gate?.exists()).toBe(true);
        expect(gate?.props("action")).toContain("deleted for 1 world(s)");
        expect(gate?.props("affected")).toEqual(["octocat/andyville-world (world)"]);
        expect(fake.removeCalls).toHaveLength(0);

        const switches = gate?.findAllComponents(VSwitch) ?? [];
        const slider = gate?.findComponent(VSlider);
        await switches[0]?.setValue(true);
        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await flushPromises();
        expect(fake.removeCalls).toHaveLength(0);

        await switches[1]?.setValue(true);
        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await flushPromises();
        expect(fake.removeCalls).toEqual([
            { worldPath: RECORD.worldPath, owner: RECORD.owner, repo: RECORD.repo, branch: RECORD.branch },
        ]);
    });

    it("keeps the tracked world and shows the host's exact failure when branch deletion is refused", async () => {
        const fake = fakeWorldRepo({
            remove: (target) => {
                fake.removeCalls.push(target);
                return Promise.resolve({
                    ok: false,
                    failure: {
                        code: "not-ours",
                        message: "The world branch no longer carries this application's marker, so it was not deleted.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                });
            },
        });
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();

        await wrapper.find('[data-test="record-stop"]').trigger("click");
        await flushPromises();
        const gate = wrapper
            .findAllComponents(ConfigSuperConfirm)
            .find((candidate) => candidate.props("title") === "Stop tracking this world");
        const switches = gate?.findAllComponents(VSwitch) ?? [];
        const slider = gate?.findComponent(VSlider);

        await switches[0]?.setValue(true);
        await switches[1]?.setValue(true);
        slider?.vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await flushPromises();

        expect(fake.removeCalls).toEqual([
            { worldPath: RECORD.worldPath, owner: RECORD.owner, repo: RECORD.repo, branch: RECORD.branch },
        ]);
        expect(wrapper.find('[data-test="record"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="remove-failure"]').text()).toContain(
            "The world branch no longer carries this application's marker, so it was not deleted.",
        );
    });
});

describe("a syncing row's title is not silently clipped by a long owner/repo/branch", () => {
    /**
     * `owner/repo#branch` is typed by whoever set the sync up - GitHub alone allows a
     * 39-character owner plus a 100-character repo name, before bilingual mode doubles it
     * again. The row title is a `VCardTitle` turned into a flex row (`d-flex`) so the state
     * chip and spinner sit beside it; Vuetify's own `.v-card-title` rule still contributes
     * `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` underneath that, and
     * `text-overflow` has no effect once the box is a flex formatting context, so the target
     * and the chip were clipped at the card edge with no ellipsis and no scrollbar to say
     * anything was missing.
     */
    it("keeps the full target text in the DOM and marks the title as wrap-safe", async () => {
        const fake = fakeWorldRepo();
        const wrapper = mountScreen(fake.bridge);
        await flushPromises();

        const longTarget =
            "a-very-long-organisation-name-that-github-would-actually-allow/an-equally-long-repository-name-that-github-would-also-allow#a-noticeably-long-branch-name";
        fake.fire({ type: "started", key: "row-1", target: longTarget, at: "2026-01-01T00:00:00.000Z" });
        await flushPromises();

        const row = wrapper.find('[data-test="row"]');
        expect(row.exists()).toBe(true);
        // Not truncated by application code before it ever reaches the DOM.
        expect(row.text()).toContain(longTarget);

        // Carries the class the stylesheet uses to beat Vuetify's bare `.v-card-title` on
        // specificity, rather than being left to the framework's clip-with-no-ellipsis default.
        const title = row.find(".mb-worldrepo-row__title");
        expect(title.exists()).toBe(true);
        expect(title.find(".mb-worldrepo-row__name").text()).toBe(longTarget);
    });

    it("declares the wrap-safe rule with enough specificity to beat Vuetify's own .v-card-title", () => {
        const source = worldRepoScreenSource;
        const rule = /\.mb-worldrepo-row__title\s*\{[^}]*\}/s.exec(source)?.[0] ?? "";
        expect(rule).toContain("overflow: visible");
        expect(rule).toContain("white-space: normal");
        expect(rule).toContain("flex-wrap: wrap");

        const nameRule = /\.mb-worldrepo-row__name\s*\{[^}]*\}/s.exec(source)?.[0] ?? "";
        expect(nameRule).toContain("min-width: 0");
        expect(nameRule).toContain("overflow-wrap: anywhere");

        // The template actually wires the class onto the title and the span, not just the
        // stylesheet declaring it in isolation.
        expect(source).toMatch(/VCardTitle class="d-flex align-center ga-2 mb-worldrepo-row__title mb-responsive-card-title"/);
        expect(source).toMatch(/<span class="mb-worldrepo-row__name mb-responsive-card-title__text">\{\{ row\.target \}\}<\/span>/);
    });
});

describe("adoption: hedged, and never a write", () => {
    it("checks the account's repositories and shows the honest hedge, not a certainty", async () => {
        const worldRepo = fakeWorldRepo();
        const wrapper = mountScreen(worldRepo.bridge, fakeRepoBridge().bridge);
        await flushPromises();
        await wrapper.find('[data-test="adopt-check"]').trigger("click");
        await flushPromises();

        expect(worldRepo.probeCalls).toHaveLength(1);
        expect(wrapper.find('[data-test="signal"]').text()).toContain("looks like a repository this application prepared");
        // Never asserted as fact - the hedge word survives into the rendered text.
        expect(wrapper.text()).toContain("Looks like yours");
    });

    it("never calls sync or remove while checking or viewing a plan", async () => {
        const worldRepo = fakeWorldRepo();
        const wrapper = mountScreen(worldRepo.bridge, fakeRepoBridge().bridge);
        await flushPromises();
        await wrapper.find('[data-test="adopt-check"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="view-plan"]').trigger("click");
        await flushPromises();

        expect(worldRepo.syncCalls).toHaveLength(0);
        expect(worldRepo.removeCalls).toHaveLength(0);
        expect(worldRepo.probeCalls).toHaveLength(1);
        expect(worldRepo.planCalls).toHaveLength(1);
    });

    it("names every cannot-cross-machines item, with a route rather than a silent restore", async () => {
        const worldRepo = fakeWorldRepo();
        const wrapper = mountScreen(worldRepo.bridge, fakeRepoBridge().bridge);
        await flushPromises();
        await wrapper.find('[data-test="adopt-check"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="view-plan"]').trigger("click");
        await flushPromises();

        const items = wrapper.findAll('[data-test="attention-item"]');
        expect(items.length).toBe(3);
        expect(wrapper.find('[data-test="attention-dependencies"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="attention-remote-host"]').exists()).toBe(true);
        // The world folder is fixed through the PathField + Adopt button below the list, not
        // a button of its own inside the list.
        expect(wrapper.find('[data-test="plan"]').findComponent({ name: "PathField" }).exists()).toBe(true);
    });

    it("routes the dependency item to Settings at the java-runtime anchor", async () => {
        const worldRepo = fakeWorldRepo();
        const wrapper = mountScreen(worldRepo.bridge, fakeRepoBridge().bridge);
        await flushPromises();
        await wrapper.find('[data-test="adopt-check"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="view-plan"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="attention-dependencies"]').trigger("click");
        expect(wrapper.emitted("openSettings")?.[0]).toEqual(["java-runtime"]);
    });

    it("adopts by writing the project through ProjectHost.writeProject, and only that", async () => {
        const worldRepo = fakeWorldRepo();
        const project = fakeProjectHost();
        const wrapper = mountScreen(worldRepo.bridge, fakeRepoBridge().bridge, project.host);
        await flushPromises();
        await wrapper.find('[data-test="adopt-check"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="view-plan"]').trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="adopt-button"]').attributes("disabled")).toBeDefined();

        const vm = wrapper.vm as unknown as { adoptWorldPath: string };
        vm.adoptWorldPath = "/worlds/andyville-new";
        await flushPromises();
        expect(wrapper.find('[data-test="adopt-button"]').attributes("disabled")).toBeUndefined();

        await wrapper.find('[data-test="adopt-button"]').trigger("click");
        await flushPromises();

        expect(project.writes).toHaveLength(1);
        expect(project.writes[0]?.world).toBe("/worlds/andyville-new");
        expect(worldRepo.syncCalls).toHaveLength(0);
        expect(worldRepo.removeCalls).toHaveLength(0);
        expect(wrapper.emitted("adopted")?.[0]).toEqual(["/worlds/andyville-new"]);
    });
});
