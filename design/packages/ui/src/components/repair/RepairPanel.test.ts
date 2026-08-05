// @vitest-environment jsdom

/**
 * The repair panel, mounted.
 *
 * `main/repair/index.ts` was registered on every launch and fully unit-tested against a
 * fake `IpcMain` (`main/repair/ipc.test.ts`), and nothing in the running app ever called
 * `repair:agent`, `repair:failures`, `repair:diagnose` or `repair:run` - no preload method,
 * no renderer code. These are the regression tests for the renderer half.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import RepairPanel from "./RepairPanel.vue";
import type { FailureSummary, RepairBridge } from "./repairBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

const FAILURE: FailureSummary = {
    id: "failure-1",
    subject: "render",
    mode: "local",
    exitCode: 1,
    at: "2026-08-05T00:00:00.000Z",
};

function fakeBridge(overrides: Partial<RepairBridge> = {}): RepairBridge {
    return {
        agentAvailability: vi.fn(async () => ({
            available: false,
            command: "opencode",
            version: null,
            message: "opencode is not on this account's PATH.",
        })),
        failures: vi.fn(async () => []),
        diagnose: vi.fn(async () => ({ ok: true as const, diagnoses: [] })),
        run: vi.fn(async () => ({
            ok: true as const,
            result: {
                explained: true,
                diagnoses: [],
                agent: { consulted: false, available: false, message: "not consulted", cause: null, notes: null, refused: [] },
                applied: [],
                history: null,
                summary: "Fixed.",
                at: "2026-08-05T00:00:00.000Z",
            },
        })),
        ...overrides,
    };
}

function render(bridge: RepairBridge | null) {
    return mount(RepairPanel, {
        props: { bridge },
        global: { plugins: [vuetify, i18n()] },
    });
}

describe("no bridge", () => {
    it("says plainly that this build cannot diagnose a failed run", async () => {
        const wrapper = render(null);
        await wrapper.vm.$nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(wrapper.text()).toContain("This build cannot diagnose a failed run");
        wrapper.unmount();
    });
});

describe("with a bridge but nothing on record", () => {
    it("says plainly that no failures are on record, rather than showing an empty list", async () => {
        const bridge = fakeBridge();
        const wrapper = render(bridge);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        expect(bridge.agentAvailability).toHaveBeenCalled();
        expect(bridge.failures).toHaveBeenCalled();
        expect(wrapper.text()).toContain("No failures are on record");
        expect(wrapper.find(".mb-repair__list").exists()).toBe(false);
        wrapper.unmount();
    });

    it("reports the agent's own availability message", async () => {
        const bridge = fakeBridge({
            agentAvailability: vi.fn(async () => ({
                available: true,
                command: "opencode",
                version: "1.2.3",
                message: "opencode 1.2.3 is installed.",
            })),
        });
        const wrapper = render(bridge);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("opencode 1.2.3 is installed.");
        wrapper.unmount();
    });
});

describe("with a failure on record", () => {
    it("lists it and reaches diagnose() on click", async () => {
        const bridge = fakeBridge({
            failures: vi.fn(async () => [FAILURE]),
            diagnose: vi.fn(async () => ({
                ok: true as const,
                diagnoses: [
                    {
                        code: "port-in-use",
                        message: "The port was already in use.",
                        because: "BlueMap failed to bind to the configured address",
                        remedy: {
                            kind: "retry" as const,
                            summary: "Retry on a port the operating system picks.",
                            settings: null,
                            retry: null,
                        },
                    },
                ],
            })),
        });
        const wrapper = render(bridge);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        expect(wrapper.find(".mb-repair__list").exists()).toBe(true);
        expect(wrapper.text()).toContain("Render");

        const diagnoseButton = wrapper.findAll("button").find((b) => b.text().includes("Diagnose") && !b.text().includes("repair"));
        await diagnoseButton?.trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        expect(bridge.diagnose).toHaveBeenCalledWith("failure-1");
        expect(wrapper.text()).toContain("The port was already in use.");
        expect(wrapper.text()).toContain("Retry on a port the operating system picks.");
        wrapper.unmount();
    });

    it("reaches run() and shows the result summary", async () => {
        const bridge = fakeBridge({
            failures: vi.fn(async () => [FAILURE]),
            run: vi.fn(async () => ({
                ok: true as const,
                result: {
                    explained: true,
                    diagnoses: [],
                    agent: {
                        consulted: false,
                        available: false,
                        message: "The deterministic pass already explained this, so the agent was not consulted.",
                        cause: null,
                        notes: null,
                        refused: [],
                    },
                    applied: [
                        { path: "core.conf", absolutePath: "/srv/config/core.conf", before: "a", after: "b", diff: "", linesAdded: 1, linesRemoved: 1 },
                    ],
                    history: { recorded: true, message: "Recorded as a new revision." },
                    summary: "Fixed the port conflict by retrying on a free port.",
                    at: "2026-08-05T00:00:00.000Z",
                },
            })),
        });
        const wrapper = render(bridge);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        const runButton = wrapper.findAll("button").find((b) => b.text().includes("Diagnose and repair"));
        await runButton?.trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        expect(bridge.run).toHaveBeenCalledWith("failure-1");
        expect(wrapper.text()).toContain("Fixed the port conflict by retrying on a free port.");
        expect(wrapper.text()).toContain("core.conf");
        expect(wrapper.text()).toContain("Recorded as a new revision.");
        wrapper.unmount();
    });

    it("shows the refusal message rather than silently doing nothing when run() fails", async () => {
        const bridge = fakeBridge({
            failures: vi.fn(async () => [FAILURE]),
            run: vi.fn(async () => ({ ok: false as const, message: "That failure is no longer on record." })),
        });
        const wrapper = render(bridge);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        const runButton = wrapper.findAll("button").find((b) => b.text().includes("Diagnose and repair"));
        await runButton?.trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("That failure is no longer on record.");
        wrapper.unmount();
    });
});
