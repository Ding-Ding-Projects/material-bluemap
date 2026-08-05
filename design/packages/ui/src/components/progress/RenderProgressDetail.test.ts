// @vitest-environment jsdom

/**
 * The one surface, mounted, with the facts a render on GitHub's runners produces.
 *
 * `RenderRunPanel.test.ts` mounts the same component with the facts a render on this
 * machine produces. That is the point of both files existing: one component, two very
 * different routes, and no branch inside it that knows which is which.
 *
 * The i18n here is the real one built the way `i18n.ts` builds it - no messages, every key
 * falling back - because that is the state nearly every build is in, and it is the state in
 * which a value passed the wrong way through vue-i18n silently disappears.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RenderProgressDetail from "./RenderProgressDetail.vue";
import { ciProgressFacts } from "./ciProgress.js";
import { EMPTY_FACTS, STALL_AFTER_MS } from "./progressModel.js";
import type { ProgressFacts } from "./progressModel.js";
import type { CiJobReport, CiRunReport } from "../cirender/ciRenderBridge.js";

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

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function render(facts: ProgressFacts, now: number) {
    return mount(RenderProgressDetail, {
        props: { facts, now },
        global: { plugins: [vuetify, i18n()] },
    });
}

const T0 = Date.parse("2026-08-03T09:13:00.000Z");

function job(partial: Partial<CiJobReport>): CiJobReport {
    return {
        id: 1,
        name: "render (0)",
        status: "completed",
        conclusion: "success",
        htmlUrl: "https://github.test/job/1",
        startedAt: "2026-08-03T09:14:00.000Z",
        completedAt: "2026-08-03T09:18:00.000Z",
        wave: null,
        ...partial,
    };
}

function ciRun(jobs: CiJobReport[]): CiRunReport {
    return {
        runId: 42,
        runNumber: 7,
        htmlUrl: "https://github.test/run/42",
        status: "in_progress",
        conclusion: null,
        createdAt: "2026-08-03T09:13:00.000Z",
        updatedAt: "2026-08-03T09:16:00.000Z",
        headSha: "abc123",
        jobs,
    };
}

describe("a render on GitHub's runners, in the shared surface", () => {
    it("draws every shard by name and state rather than collapsing them into one bar", () => {
        const facts = ciProgressFacts({
            phase: "rendering",
            run: ciRun([
                job({ id: 1, name: "render (0)", conclusion: "success" }),
                job({ id: 2, name: "render (1)", status: "in_progress", conclusion: null, completedAt: null }),
                job({ id: 3, name: "render (2)", status: "queued", conclusion: null, startedAt: null, completedAt: null }),
                job({ id: 4, name: "collect", status: "queued", conclusion: null, startedAt: null, completedAt: null }),
            ]),
            active: true,
            startedAt: "2026-08-03T09:13:00.000Z",
        });

        const wrapper = render(facts, T0 + 300_000);
        const text = wrapper.text();

        expect(text).toContain("render (0)");
        expect(text).toContain("render (1)");
        expect(text).toContain("collect");
        expect(text).toContain("1 of 4 jobs finished");
        // The states are drawn, not summarised away.
        expect(text).toContain("Running");
        expect(text).toContain("Queued");
        // Grouped by the stem GitHub itself gave them, once there is more than one group.
        expect(text).toContain("render");
        wrapper.unmount();
    });

    it("keeps the phase indeterminate while still printing its real step count", () => {
        const facts = ciProgressFacts({
            phase: "uploading",
            run: null,
            active: true,
            startedAt: "2026-08-03T09:13:00.000Z",
        });

        const wrapper = render(facts, T0 + 60_000);

        expect(wrapper.text()).toContain("step 2 of 8");
        expect(wrapper.text()).toContain("size unknown");
        const bars = wrapper.findAll('[role="progressbar"]');
        expect(bars.every((bar) => bar.attributes("aria-busy") === "true")).toBe(true);
        wrapper.unmount();
    });

    it("says out loud what this route cannot report", () => {
        const facts = ciProgressFacts({
            phase: "uploading",
            run: null,
            active: true,
            startedAt: "2026-08-03T09:13:00.000Z",
        });

        const wrapper = render(facts, T0);

        // A gap where a number should be reads as a defect to the next person and as a
        // decision to nobody.
        expect(wrapper.text()).toContain("This panel follows the render, not the transfer.");
        wrapper.unmount();
    });
});

describe("the honesty rules, on any route", () => {
    const withTransfer: ProgressFacts = {
        ...EMPTY_FACTS,
        active: true,
        startedAtMs: T0,
        lastEventAtMs: T0,
        levels: [
            {
                id: "overall",
                label: { key: "progress.level.overall", fallback: "Overall", values: {} },
                detail: null,
                percent: 21.2,
                count: { done: 0, total: 3, unit: "maps" },
            },
        ],
        transfers: [
            {
                id: "world",
                direction: "up",
                label: { key: "progress.transfer.world", fallback: "Sending the world", values: {} },
                bytesDone: 1_400_000_000,
                bytesTotal: 6_600_000_000,
                bytesPerSecond: 22_000_000,
            },
        ],
    };

    it("gives a determinate bar a value a screen reader can actually use", () => {
        const wrapper = render(withTransfer, T0);
        const bar = wrapper.find('[role="progressbar"]');

        expect(bar.attributes("aria-valuenow")).toBe("21");
        expect(bar.attributes("aria-valuemin")).toBe("0");
        expect(bar.attributes("aria-valuemax")).toBe("100");
        // "21" on its own is a number with no subject. The text is the whole row in words.
        expect(bar.attributes("aria-valuetext")).toContain("Overall");
        expect(bar.attributes("aria-valuetext")).toContain("0 of 3 maps done");
        wrapper.unmount();
    });

    it("shows bytes and a rate when a route genuinely counts them", () => {
        const wrapper = render(withTransfer, T0);

        expect(wrapper.text()).toContain("1.4 GB of 6.6 GB at 22 MB/s");
        wrapper.unmount();
    });

    it("raises the quiet alarm on a running render and never on a finished one", () => {
        const quiet = render(withTransfer, T0 + STALL_AFTER_MS);
        expect(quiet.text()).toContain("Nothing has arrived for 1:00");
        quiet.unmount();

        const done = render({ ...withTransfer, active: false }, T0 + 3_600_000);
        expect(done.text()).not.toContain("Nothing has arrived for");
        done.unmount();
    });

    it("announces milestones in a polite region rather than every tick", async () => {
        const wrapper = render(withTransfer, T0);
        const region = wrapper.find('[aria-live="polite"]');
        const first = region.text();

        expect(first).toContain("0 of 3 maps done");

        // The bar crept. Nothing worth interrupting a screen-reader user for happened.
        await wrapper.setProps({
            facts: { ...withTransfer, levels: [{ ...withTransfer.levels[0]!, percent: 21.7 }] },
        });
        expect(wrapper.find('[aria-live="polite"]').text()).toBe(first);

        // A map finished. That is worth saying.
        await wrapper.setProps({
            facts: {
                ...withTransfer,
                levels: [{ ...withTransfer.levels[0]!, count: { done: 1, total: 3, unit: "maps" as const } }],
            },
        });
        expect(wrapper.find('[aria-live="polite"]').text()).toContain("1 of 3 maps done");
        wrapper.unmount();
    });
});
