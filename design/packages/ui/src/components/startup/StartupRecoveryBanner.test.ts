// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import StartupRecoveryBanner from "./StartupRecoveryBanner.vue";
import { notices } from "../../stores/notices.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const mounted: VueWrapper[] = [];

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    notices.live.splice(0);
    notices.history.splice(0);
    notices.nextId = 1;
});

function bridge(overrides: Record<string, unknown> = {}) {
    return {
        read: vi.fn(async () => ({
            current: [
                {
                    id: "issue-1",
                    category: "dependency",
                    phase: "java",
                    title: "Java discovery failed",
                    message: "Rendering is unavailable, but the shell is open.",
                    detail: "No supported runtime was found.",
                    occurredAt: "2026-08-07T15:00:00.000Z",
                    recoverable: true,
                    securityBoundary: false,
                },
            ],
            storageWarning: null,
        })),
        copy: vi.fn(async () => ({ ok: true, message: "Copied." })),
        export: vi.fn(async () => ({ ok: true, message: "Exported." })),
        retry: vi.fn(async () => ({ ok: true, message: "Restarting." })),
        ...overrides,
    };
}

function render(startup: ReturnType<typeof bridge> | null): VueWrapper {
    const vuetify = createVuetify();
    const i18n = createI18n({
        legacy: false,
        locale: "en",
        messages: {
            en: {
                startup: {
                    openedAnyway: "Worldlens opened, but part of startup failed",
                    boundary:
                        "The affected path stayed disabled to protect data or security. Nothing was bypassed.",
                    partial:
                        "The affected feature stayed disabled. Everything else remains available.",
                    details: "Inspect {count} startup issues",
                    copy: "Copy details",
                    exportJson: "Export JSON",
                    exportMarkdown: "Export Markdown",
                    restart: "Restart and retry",
                },
            },
        },
    });
    const wrapper = mount(
        { render: () => h(VApp, null, () => h(StartupRecoveryBanner, { bridge: startup })) },
        { global: { plugins: [vuetify, i18n] } },
    );
    mounted.push(wrapper);
    return wrapper;
}

describe("StartupRecoveryBanner", () => {
    it("renders nothing in a browser build with no startup bridge", async () => {
        const wrapper = render(null);
        await Promise.resolve();
        expect(wrapper.find(".mb-startup-recovery").exists()).toBe(false);
    });

    it("keeps the shell non-modal, names the failed phase, and caches a persistent notice", async () => {
        const wrapper = render(bridge());
        await vi.waitFor(() => expect(wrapper.find(".mb-startup-recovery").exists()).toBe(true));
        const banner = wrapper.find(".mb-startup-recovery");
        expect(banner.attributes("role")).toBe("alert");
        expect(banner.attributes("aria-modal")).toBeUndefined();
        expect(banner.text()).toContain("Java discovery failed");
        expect(banner.text()).toContain("Rendering is unavailable, but the shell is open.");
        expect(notices.history).toHaveLength(1);
        expect(notices.history[0]?.timeout).toBeNull();
    });

    it("refuses recovery-action re-entry while the first action is running", async () => {
        let release!: () => void;
        const copy = vi.fn(
            () =>
                new Promise<{ ok: boolean; message: string }>((resolve) => {
                    release = () => resolve({ ok: true, message: "Copied." });
                }),
        );
        const startup = bridge({ copy });
        const wrapper = render(startup);
        await vi.waitFor(() =>
            expect(wrapper.find("[data-test='startup-copy']").exists()).toBe(true),
        );

        const button = wrapper.find("[data-test='startup-copy']");
        await button.trigger("click");
        await button.trigger("click");
        expect(copy).toHaveBeenCalledTimes(1);
        release();
        await vi.waitFor(() => expect(wrapper.text()).toContain("Copied."));
    });
});
