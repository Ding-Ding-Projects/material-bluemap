/**
 * @vitest-environment jsdom
 *
 * The backup row's "Show what it reported" log disclosure.
 *
 * The toggle button announces `aria-expanded`, but a screen reader still has to be told
 * *what* it expands. That association is `aria-controls` on the button pointing at the
 * `id` of the revealed list - without it, the button's expanded/collapsed state is
 * announced with no link to the region it discloses.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import BackupRunCard from "./BackupRunCard.vue";
import type { BackupRow } from "./backups.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's cards and buttons observe their own size.
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

    /*
     * This jsdom is started without a storage file - `CommandPalette.test.ts` and
     * `RenderConsole.test.ts` hit the same gap and fix it the same way. The auto-scroll
     * checkbox needs somewhere real for its preference to land and be read back from.
     */
    const cells = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => {
                cells.set(key, value);
            },
            removeItem: (key: string) => {
                cells.delete(key);
            },
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

beforeEach(() => {
    localStorage.clear();
});

const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

const row: BackupRow = {
    backupId: "backup-9001",
    repository: "me/saves",
    tag: "mbm-backup-world-overworld-20260804T101500Z",
    kind: "world",
    label: "Overworld",
    state: "finished",
    phase: null,
    task: null,
    summary: null,
    failure: null,
    startedAt: "2026-08-04T10:15:00.000Z",
    finishedAt: "2026-08-04T10:20:00.000Z",
    durationMs: 300_000,
    live: true,
    stopping: false,
    log: [
        { id: 1, level: "info", message: "Packed the world folder", at: "2026-08-04T10:16:00.000Z" },
        { id: 2, level: "info", message: "Uploaded part 1 of 1", at: "2026-08-04T10:19:00.000Z" },
    ],
};

function mountCard(initial: BackupRow = row, attachTo?: HTMLElement) {
    return mount(BackupRunCard, {
        props: { row: initial, canCancel: true, canOpenSettings: true },
        global: { plugins: [i18n, vuetify] },
        ...(attachTo === undefined ? {} : { attachTo }),
    });
}

/** Sets the three numbers `isAtBottom` reads. jsdom computes no layout, so they are supplied by hand. */
function setScrollMetrics(el: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop: number): void {
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
    el.scrollTop = scrollTop;
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("the log toggle is programmatically tied to the log it discloses", () => {
    it("points aria-controls at the id of the revealed log list", async () => {
        const view = mountCard();

        const toggle = view.find('button[aria-expanded]');
        expect(toggle.exists()).toBe(true);
        expect(toggle.attributes("aria-expanded")).toBe("false");

        // This is the regression check: the old markup set aria-expanded with no
        // aria-controls at all, so this attribute did not exist on the toggle.
        const controlsId = toggle.attributes("aria-controls");
        expect(controlsId).toBeTruthy();

        // Before expanding, the list this id names is not in the document (v-if).
        expect(view.find(`#${controlsId}`).exists()).toBe(false);

        await toggle.trigger("click");

        expect(toggle.attributes("aria-expanded")).toBe("true");
        const log = view.find(`#${controlsId}`);
        expect(log.exists()).toBe(true);
        expect(log.element.tagName).toBe("UL");
        expect(log.text()).toContain("Packed the world folder");
    });
});

describe("the log's auto-scroll checkbox", () => {
    async function openLog(view: ReturnType<typeof mountCard>): Promise<void> {
        await view.find('button[aria-expanded]').trigger("click");
    }

    it("is on by default once the log is opened, with a real accessible name", async () => {
        const view = mountCard();
        await openLog(view);

        const checkbox = view.find('[data-test="backup-log-autoscroll"] input[type="checkbox"]');
        expect(checkbox.exists()).toBe(true);
        expect((checkbox.element as HTMLInputElement).checked).toBe(true);
        expect(checkbox.attributes("aria-label")).toBe("Follow new lines");
        view.unmount();
    });

    it("is a log region with live announcements deliberately off, per line, not per verbose stream", async () => {
        const view = mountCard();
        await openLog(view);

        const log = view.find(".mb-backup-row__log");
        expect(log.attributes("role")).toBe("log");
        expect(log.attributes("aria-live")).toBe("off");
        expect(log.attributes("tabindex")).toBe("0");
        view.unmount();
    });

    it("follows new lines while checked", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-backup-row__log");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100); // already at the bottom

        setScrollMetrics(element, 400, 100, 100); // more of the report is about to arrive
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Verifying", at: "2026-08-04T10:19:30.000Z" }] },
        });
        await flush();

        expect(element.scrollTop).toBe(400);
        view.unmount();
    });

    it("does not move the log once unchecked", async () => {
        const view = mountCard();
        await openLog(view);
        const checkbox = view.find('[data-test="backup-log-autoscroll"] input[type="checkbox"]');
        await checkbox.setValue(false);

        const log = view.find(".mb-backup-row__log");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100);
        setScrollMetrics(element, 400, 100, 100);
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Verifying", at: "2026-08-04T10:19:30.000Z" }] },
        });
        await flush();

        expect(element.scrollTop).toBe(100);
        view.unmount();
    });

    it("scrolling away pauses without unticking the checkbox, and a jump control appears", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-backup-row__log");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 1000, 100, 200); // well away from the bottom
        await log.trigger("scroll");

        expect(view.find(".mb-backup-row__jump").exists()).toBe(true);
        const checkbox = view.find('[data-test="backup-log-autoscroll"] input[type="checkbox"]');
        expect((checkbox.element as HTMLInputElement).checked).toBe(true);
        view.unmount();
    });

    it("resumes and hides the jump control once scrolled back to the bottom", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-backup-row__log");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 1000, 100, 200);
        await log.trigger("scroll");
        expect(view.find(".mb-backup-row__jump").exists()).toBe(true);

        setScrollMetrics(element, 1000, 100, 900);
        await log.trigger("scroll");

        expect(view.find(".mb-backup-row__jump").exists()).toBe(false);
        view.unmount();
    });

    it("does not scroll away from an active text selection inside the log", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-backup-row__log");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100);

        const firstEntry = view.find(".mb-backup-row__log li").element;
        const spy = vi
            .spyOn(document, "getSelection")
            .mockReturnValue({ isCollapsed: false, anchorNode: firstEntry } as unknown as Selection);

        setScrollMetrics(element, 400, 100, 100);
        await view.setProps({
            row: {
                ...row,
                log: [row.log[0] as (typeof row.log)[number], { id: 3, level: "info", message: "Verifying", at: "2026-08-04T10:19:30.000Z" }],
            },
        });
        await flush();

        expect(element.scrollTop).toBe(100); // untouched
        spy.mockRestore();
        view.unmount();
    });

    it("does not move keyboard focus when it follows new lines", async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const view = mountCard(row, host);
        await openLog(view);

        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        expect(document.activeElement).toBe(input);

        const log = view.find(".mb-backup-row__log");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100);
        setScrollMetrics(element, 400, 100, 100);
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Verifying", at: "2026-08-04T10:19:30.000Z" }] },
        });
        await flush();

        expect(document.activeElement).toBe(input);
        view.unmount();
        host.remove();
        input.remove();
    });

    it("remembers the preference across a fresh mount", async () => {
        const first = mountCard();
        await openLog(first);
        const checkbox = first.find('[data-test="backup-log-autoscroll"] input[type="checkbox"]');
        await checkbox.setValue(false);
        first.unmount();

        const second = mountCard();
        await openLog(second);
        const secondCheckbox = second.find('[data-test="backup-log-autoscroll"] input[type="checkbox"]');
        expect((secondCheckbox.element as HTMLInputElement).checked).toBe(false);
        second.unmount();
    });
});

describe("the run's own head row, which shares its <v-card-title> with a state chip", () => {
    /**
     * Regression: `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title (Vuetify's own `VCard.css`).
     * `.mb-backup-row__head` turns it into a flex row so the state chip sits beside the run
     * name, but `display: flex` alone does not clear any of the three inherited properties:
     * `overflow: hidden` still clips, and the inherited `nowrap` means
     * `.mb-backup-row__name`'s own `overflow-wrap: anywhere` never gets a line to break on
     * (`overflow-wrap` only has an effect when `white-space` allows wrapping). A long run
     * name was silently cut off with no ellipsis and no indication anything was missing.
     * `test.css` is not enabled for this suite's `vitest.config.ts`, so a `?raw` import
     * reads the exact rule the fix landed in, the same way `ConfigApplyDialog.test.ts` does
     * for its own CSS fix.
     */
    it("clears the inherited overflow, text-overflow and white-space so the name can wrap", async () => {
        const source = (await import("./BackupRunCard.vue?raw")).default as string;
        const match = /\.mb-backup-row__head\s*\{[^}]*\}/.exec(source);
        expect(match).not.toBeNull();
        const rule = match?.[0] ?? "";
        expect(rule).toMatch(/overflow:\s*visible/);
        expect(rule).toMatch(/text-overflow:\s*clip/);
        expect(rule).toMatch(/white-space:\s*normal/);
    });
});
