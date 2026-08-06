// @vitest-environment jsdom

/**
 * The live speed dial, mounted against a real `createRenderRun`.
 *
 * `renderRun.test.ts` proves `adjustSpeed`/`restartWithLevel` work against the run itself;
 * this proves the mapping actually reaches the screen: the disabled reasons per route, the
 * current-level readout, and that clicking a level really calls the bridge and shows the
 * honest live-versus-deferred outcome the bridge reported.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VBtn } from "vuetify/components";
import LiveSpeedControl from "./LiveSpeedControl.vue";
import { createRenderRun } from "./renderRun.js";
import type { RenderEvent, RenderResult, SpeedAdjustmentResult, WorldBridge } from "./worldBridge.js";

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

const vuetify = createVuetify();

function emptyI18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
}

function fakeBridge(adjustResult: SpeedAdjustmentResult | null) {
    const listeners: ((event: RenderEvent) => void)[] = [];
    const adjustRenderSpeed = vi.fn(
        async (renderId: string, level): Promise<SpeedAdjustmentResult> =>
            adjustResult ?? {
                ok: true,
                renderId,
                level,
                route: "local",
                appliedNow: true,
                needsRestart: true,
                reason: "applied",
                message: "applied",
                detail: null,
            },
    );
    const bridge: WorldBridge = {
        startRender: () => new Promise<RenderResult>(() => undefined),
        cancelRender: vi.fn(async () => true),
        adjustRenderSpeed,
        listRenders: async () => [],
        renderEngine: async () => null,
        activeRenders: async () => [],
        interruptedRenders: async () => [],
        resumeRender: async () => ({
            started: false,
            refusal: { ok: false, renderId: "world-abc", code: "no-session", message: "" },
        }),
        dismissResume: async () => true,
        onRenderEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        readConsent: async () => ({ accepted: true }),
    };
    return {
        bridge,
        adjustRenderSpeed,
        emit(event: RenderEvent): void {
            for (const listener of [...listeners]) listener(event);
        },
    };
}

/** A run, started and adopted, with `route` reported via the `route` option. */
function runningOn(route: "local" | "docker" | "remote" | "actions" | null, adjustResult: SpeedAdjustmentResult | null = null) {
    const fake = fakeBridge(adjustResult);
    const run = createRenderRun(fake.bridge, { route: () => route });
    void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
    fake.emit({
        type: "started",
        renderId: "world-abc",
        mapIds: ["survival"],
        engine: { id: "upstream-java", label: "BlueMap engine (Java) 5.22-27", version: "5.22-27", javaVersion: "25" },
        at: "t0",
    });
    return { fake, run };
}

function mountControl(run: ReturnType<typeof createRenderRun>) {
    const host = defineComponent({
        setup: () => () => h(VApp, () => [h(LiveSpeedControl, { run })]),
    });
    return mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
}

function levelButton(wrapper: ReturnType<typeof mount>, text: string) {
    const button = wrapper.findAllComponents(VBtn).find((btn) => btn.text().includes(text));
    expect(button, `no button with text "${text}"`).toBeDefined();
    return button!;
}

/* -------------------------------------------------------------------------- */
/* Disabled routes name their exact reason                                    */
/* -------------------------------------------------------------------------- */

describe("a render on a route this control cannot reach", () => {
    it("shows the GitHub Actions route disabled with its own exact reason", () => {
        const { run } = runningOn("actions");
        const wrapper = mountControl(run);
        expect(wrapper.text()).toContain("GitHub's own runners");
        expect(wrapper.text()).toContain("belongs to GitHub");
    });

    it("shows the remote SSH route disabled with its own exact reason", () => {
        const { run } = runningOn("remote");
        const wrapper = mountControl(run);
        expect(wrapper.text()).toContain("SSH");
    });

    it("shows an unknown route disabled rather than silently enabled", () => {
        const { run } = runningOn(null);
        const wrapper = mountControl(run);
        expect(wrapper.text()).toContain("does not yet know where this render is running");
    });

    it("never lets a click on a disabled route reach the bridge", async () => {
        const { run, fake } = runningOn("actions");
        const wrapper = mountControl(run);
        const gentle = levelButton(wrapper, "1 · Gentle");
        expect(gentle.props("disabled")).toBe(true);
        await gentle.trigger("click");
        expect(fake.adjustRenderSpeed).not.toHaveBeenCalled();
    });
});

/* -------------------------------------------------------------------------- */
/* An enabled route shows the dial and reaches the bridge                     */
/* -------------------------------------------------------------------------- */

describe("a render on the local route", () => {
    it("shows the dial enabled, with every level offered", () => {
        const { run } = runningOn("local");
        const wrapper = mountControl(run);
        for (const label of ["1 · Gentle", "2 · Light", "3 · Balanced", "4 · Fast", "5 · Fastest"]) {
            expect(levelButton(wrapper, label).attributes("disabled")).toBeFalsy();
        }
    });

    it("states what the extremes mean, in words", () => {
        const { run } = runningOn("local");
        const wrapper = mountControl(run);
        expect(wrapper.text()).toContain("Level 1");
        expect(wrapper.text()).toContain("Level 5");
    });

    it("clicking a level calls the bridge with this render's own id and that level", async () => {
        const { run, fake } = runningOn("local");
        const wrapper = mountControl(run);
        await levelButton(wrapper, "4 · Fast").trigger("click");
        await wrapper.vm.$nextTick();
        expect(fake.adjustRenderSpeed).toHaveBeenCalledWith("world-abc", 4);
    });

    it("reports what applied live and what only applies on the next render", async () => {
        const applied: SpeedAdjustmentResult = {
            ok: true,
            renderId: "world-abc",
            level: 5,
            route: "local",
            appliedNow: true,
            needsRestart: true,
            reason: "applied",
            message: "This render's OS priority is now 'High', effective immediately.",
            detail: null,
        };
        const { run } = runningOn("local", applied);
        const wrapper = mountControl(run);
        await levelButton(wrapper, "5 · Fastest").trigger("click");
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        // The live-applied fact.
        expect(wrapper.text()).toContain("effective immediately");
        // The always-true deferred fact, shown beside it.
        expect(wrapper.text()).toContain("only change on the next render");
        // The main process's own words, quoted.
        expect(wrapper.text()).toContain("This render's OS priority is now 'High'");
    });

    it("offers restarting as an explicit choice rather than doing it automatically", async () => {
        const { run, fake } = runningOn("local");
        const wrapper = mountControl(run);
        expect(wrapper.text()).not.toContain("Restart at this level");

        await levelButton(wrapper, "2 · Light").trigger("click");
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("Restart at this level");
        // Nothing about a restart happens on its own: cancel/start are only ever called
        // from the explicit button, and clicking a level does not call either.
        expect(fake.bridge.cancelRender).not.toHaveBeenCalled();
    });

    it("reports a blocked outcome honestly rather than pretending it applied", async () => {
        const blocked: SpeedAdjustmentResult = {
            ok: true,
            renderId: "world-abc",
            level: 3,
            route: "docker",
            appliedNow: false,
            needsRestart: true,
            reason: "container-stopped",
            message: "Docker refused the CPU change - most likely because the container has already stopped.",
            detail: null,
        };
        const { run } = runningOn("docker", blocked);
        const wrapper = mountControl(run);
        await levelButton(wrapper, "3 · Balanced").trigger("click");
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("could not be applied");
        expect(wrapper.text()).not.toContain("effective immediately");
    });
});
