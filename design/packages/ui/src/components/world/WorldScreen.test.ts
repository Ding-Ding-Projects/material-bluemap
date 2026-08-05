/**
 * @vitest-environment jsdom
 *
 * The guide's screen, mounted, for the two things only a mounted one can answer.
 *
 * ## The consent regression
 *
 * Consent used to be read once in `onMounted` and never again. The user-visible failure was
 * a remedy that led nowhere: the review step warned that the Mojang download had not been
 * accepted and offered **Open the setting**; the setting opened, accepting it worked and
 * persisted; and the warning stayed for the life of the window, including after navigating
 * to another step and back. The person did exactly what they were told and the application
 * went on telling them they had not.
 *
 * The test that would have caught it is the one below, and the shape of it is the point: a
 * test that only checks the warning appears when consent is false passes throughout the
 * entire life of this bug. What has to be asserted is that accepting it **while the screen
 * stays mounted** clears the warning.
 *
 * ## The other thing
 *
 * Finishing the guide writes a project file, which is what stops it being a dead end. That
 * is also invisible to a test of the wizard component on its own, because the wizard emits
 * answers and this screen is what turns them into a file.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import RenderRunPanel from "./RenderRunPanel.vue";
import WorldScreen from "./WorldScreen.vue";
import WorldWizard from "./WorldWizard.vue";
import { forgetConsent } from "./consentState.js";
import type { MapWizard } from "./wizardModel.js";
import type { RenderRequest, RenderResult, WorldBridge } from "./worldBridge.js";
import type { ProjectHost, ProjectListing, ProjectReadAnswer, ProjectWriteAnswer } from "../project/projectHost.js";
import { RunLocationCard } from "../remote/index.js";
import type { ProjectFile } from "@material-bluemap/config";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields, expansion panels and overlays all
    // observe their own size. Without these three the screen throws inside a watcher and
    // looks broken here while rendering perfectly well in the application.
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

/** The real i18n, built the way `i18n.ts` builds it: no messages, every key falling back. */
function i18n() {
    return createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, messages: {} });
}

/** The sentence the review step shows while consent is missing. */
const WARNING = "That download has not been accepted, so this render would stop before it started.";

/**
 * A bridge whose consent answer can be changed after the screen has read it, which is
 * exactly what the settings surface does to the real one.
 */
function fakeBridge(consent: { accepted: boolean }, started: RenderRequest[] = []): WorldBridge {
    return {
        startRender: (request) => {
            started.push(request);
            return Promise.resolve({
                ok: true,
                renderId: "r1",
                dataRoot: "C:/renders/web",
                mapIds: ["overworld"],
                engine: { id: "upstream-java", label: "BlueMap", version: "5", javaVersion: "25" },
                durationMs: 10,
            } satisfies RenderResult);
        },
        cancelRender: () => Promise.resolve(false),
        listRenders: () => Promise.resolve([]),
        renderEngine: () => Promise.resolve(null),
        activeRenders: () => Promise.resolve([]),
        interruptedRenders: () => Promise.resolve([]),
        resumeRender: () =>
            Promise.resolve({ started: false, refusal: { ok: false, renderId: "r1", code: "no-session", message: "no" } }),
        dismissResume: () => Promise.resolve(false),
        onRenderEvent: () => () => {},
        // Read fresh every time, so the flag can be flipped between calls.
        readConsent: () => Promise.resolve({ accepted: consent.accepted }),
    };
}

function fakeProjectHost(written: { world: string; project: ProjectFile }[], existing: ProjectFile | null = null): ProjectHost {
    return {
        name: "test",
        canDelete: true,
        listProjects: () => Promise.resolve({ projects: [], scanned: 0, problems: [] } satisfies ProjectListing),
        readProject: (world) =>
            Promise.resolve(
                existing === null
                    ? ({ ok: false, failure: { kind: "absent" } } satisfies ProjectReadAnswer)
                    : ({ ok: true, project: existing, file: `${world}/material-bluemap.project.json` } satisfies ProjectReadAnswer),
            ),
        writeProject: (world, project) => {
            written.push({ world, project });
            return Promise.resolve({ ok: true, file: `${world}/material-bluemap.project.json` } satisfies ProjectWriteAnswer);
        },
        deleteProject: () => Promise.resolve({ ok: true, file: "" } satisfies ProjectWriteAnswer),
    };
}

interface Mounted {
    readonly screen: ReturnType<typeof mount>;
    readonly wizard: MapWizard;
}

async function mountScreen(bridge: WorldBridge, projectHost: ProjectHost | null, settingsEpoch = 0): Promise<Mounted> {
    const screen = mount(WorldScreen, {
        props: { bridge, optionalBridge: null, host: null, projectHost, settingsEpoch },
        global: { plugins: [vuetify, i18n()] },
    });
    await flushPromises();

    const exposed = screen.findComponent(WorldWizard).vm as unknown as { wizard: MapWizard };
    return { screen, wizard: exposed.wizard };
}

/** Fills in the answers the review step needs, then goes there. */
async function reachReview(mounted: Mounted): Promise<void> {
    mounted.wizard.worldPath.value = "C:/saves/Survival";
    mounted.wizard.mapId.value = "overworld";
    mounted.wizard.displayName.value = "Overworld";
    mounted.wizard.storageDirectory.value = "C:/renders";
    await flushPromises();
    mounted.wizard.goTo("review");
    await flushPromises();
}

beforeEach(() => {
    // The consent value is module state, deliberately, so one case's answer would otherwise
    // be the next case's starting position.
    forgetConsent();
});

describe("Mojang download consent", () => {
    it("warns on the review step while it has not been accepted", async () => {
        const mounted = await mountScreen(fakeBridge({ accepted: false }), null);
        await reachReview(mounted);

        expect(mounted.screen.text()).toContain(WARNING);
    });

    it("clears the warning when consent is accepted while the screen stays mounted", async () => {
        // The regression. Everything below happens without a remount, because a remount is
        // precisely what the user never does and what the old code silently depended on.
        const consent = { accepted: false };
        const mounted = await mountScreen(fakeBridge(consent), null);
        await reachReview(mounted);
        expect(mounted.screen.text()).toContain(WARNING);

        // The person presses "Open the setting", accepts in Settings, and closes it. The
        // shell is the only thing that sees the dialog close, so it bumps the epoch.
        consent.accepted = true;
        await mounted.screen.setProps({ settingsEpoch: 1 });
        await flushPromises();

        expect(mounted.screen.text()).not.toContain(WARNING);
    });

    it("also re-reads it when the person walks to another step and back", async () => {
        const consent = { accepted: false };
        const mounted = await mountScreen(fakeBridge(consent), null);
        await reachReview(mounted);
        expect(mounted.screen.text()).toContain(WARNING);

        consent.accepted = true;
        mounted.wizard.goTo("storage");
        await flushPromises();
        mounted.wizard.goTo("review");
        await flushPromises();

        expect(mounted.screen.text()).not.toContain(WARNING);
    });

    it("leaves the last known answer alone when a read fails, rather than calling it a refusal", async () => {
        // A failed read is not evidence that consent was withdrawn, and treating it as one
        // would make a transient error look like the user's own answer changing under them.
        const consent = { accepted: true };
        const bridge = fakeBridge(consent);
        const mounted = await mountScreen(bridge, null);
        await reachReview(mounted);
        expect(mounted.screen.text()).not.toContain(WARNING);

        const failing: WorldBridge = { ...bridge, readConsent: () => Promise.reject(new Error("bridge gone")) };
        const second = mount(WorldScreen, {
            props: { bridge: failing, optionalBridge: null, host: null, projectHost: null },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        expect(second.text()).not.toContain(WARNING);
        second.unmount();
    });
});

describe("finishing the guide", () => {
    it("writes a project into the world, so five answers are not thrown away", async () => {
        const written: { world: string; project: ProjectFile }[] = [];
        const started: RenderRequest[] = [];
        const mounted = await mountScreen(fakeBridge({ accepted: true }, started), fakeProjectHost(written));
        await reachReview(mounted);

        mounted.screen.findComponent(WorldWizard).vm.$emit(
            "start",
            { maps: [{ id: "overworld", world: "C:/saves/Survival", name: "Overworld", dimension: "minecraft:overworld", sorting: 0 }] },
            "name: \"Overworld\"\n",
            "C:/renders",
        );
        await flushPromises();

        expect(written).toHaveLength(1);
        expect(written[0]?.world).toBe("C:/saves/Survival");
        expect(written[0]?.project.maps.map((map) => map.id)).toEqual(["overworld"]);
        expect(written[0]?.project.fromWizard).toBe(true);
        expect(written[0]?.project.render.outputFolder).toBe("C:/renders");
    });

    it("offers to open the project it just wrote, so the guide is not a dead end", async () => {
        const mounted = await mountScreen(fakeBridge({ accepted: true }), fakeProjectHost([]));
        await reachReview(mounted);

        mounted.screen.findComponent(WorldWizard).vm.$emit(
            "start",
            { maps: [{ id: "overworld", world: "C:/saves/Survival" }] },
            "",
            "",
        );
        await flushPromises();

        expect(mounted.screen.text()).toContain("Open the project");
    });

    it("renders anyway, and says so, when the project file could not be written", async () => {
        // The render is what the person asked for and it is already under way. Not being
        // able to write a settings file beside it is worth saying and not worth stopping for.
        const refusing: ProjectHost = {
            ...fakeProjectHost([]),
            writeProject: () => Promise.resolve({ ok: false, message: "the world folder is read-only" }),
        };
        const started: RenderRequest[] = [];
        const mounted = await mountScreen(fakeBridge({ accepted: true }, started), refusing);
        await reachReview(mounted);

        mounted.screen.findComponent(WorldWizard).vm.$emit(
            "start",
            { maps: [{ id: "overworld", world: "C:/saves/Survival" }] },
            "",
            "",
        );
        await flushPromises();

        expect(mounted.screen.text()).toContain("the world folder is read-only");
        expect(started).toHaveLength(1);
    });
});

describe("a world that already has a project", () => {
    it("offers to open it rather than running the guide over it again", async () => {
        const existing: ProjectFile = {
            version: 1,
            id: "p1",
            name: "Survival",
            createdAt: "2026-08-01T10:00:00+01:00",
            updatedAt: "2026-08-01T10:00:00+01:00",
            appVersion: null,
            maps: [
                {
                    id: "overworld",
                    name: "Overworld",
                    world: null,
                    dimension: "minecraft:overworld",
                    config: "",
                    storage: "file",
                    sorting: 0,
                    enabled: true,
                },
            ],
            storages: [],
            render: { threads: null, force: false, fixEdges: false, metrics: false, outputFolder: null },
            core: null,
            webapp: null,
            webserver: null,
            plugin: null,
            fromWizard: false,
        };

        const mounted = await mountScreen(fakeBridge({ accepted: true }), fakeProjectHost([], existing));
        mounted.wizard.worldPath.value = "C:/saves/Survival";
        await flushPromises();

        expect(mounted.screen.text()).toContain("This world already has a project");
        expect(mounted.screen.text()).toContain("Open the project");
    });
});

/**
 * Issue #38's gap (5): the panel never learned which of the four routes a render was on,
 * because neither of its two call sites passed one. This is the one that already knew - the
 * location picker sitting right beside the guide.
 */
describe("the route the panel reports", () => {
    it("reports whichever location the picker is set to when the render starts", async () => {
        const started: RenderRequest[] = [];
        const mounted = await mountScreen(fakeBridge({ accepted: true }, started), fakeProjectHost([]));
        await reachReview(mounted);

        // The picker sits beside the guide the whole time, so a person can change their
        // mind about where a render goes right up until the button that starts one.
        mounted.screen.findComponent(RunLocationCard).vm.$emit("update:location", "docker");
        await flushPromises();

        mounted.screen.findComponent(WorldWizard).vm.$emit(
            "start",
            { maps: [{ id: "overworld", world: "C:/saves/Survival", name: "Overworld", dimension: "minecraft:overworld", sorting: 0 }] },
            "",
            "C:/renders",
        );
        await flushPromises();

        expect(started).toHaveLength(1);
        const run = mounted.screen.findComponent(RenderRunPanel).props("run") as { progress: { value: { route: string | null } } };
        expect(run.progress.value.route).toBe("docker");
    });

    it("follows the picker even after the run was built, rather than freezing the first choice", async () => {
        const started: RenderRequest[] = [];
        const mounted = await mountScreen(fakeBridge({ accepted: true }, started), fakeProjectHost([]));
        await reachReview(mounted);

        const run = mounted.screen.findComponent(RenderRunPanel).props("run") as { progress: { value: { route: string | null } } };
        expect(run.progress.value.route).toBe("local");

        mounted.screen.findComponent(RunLocationCard).vm.$emit("update:location", "remote");
        await flushPromises();

        expect(run.progress.value.route).toBe("remote");
    });
});
