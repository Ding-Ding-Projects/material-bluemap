// @vitest-environment jsdom

/**
 * The download row's own log disclosure, and the auto-scroll checkbox behind it.
 *
 * `BackupRunCard.test.ts` proves the exact same mechanism for the sibling upload log; this
 * file proves it again against the real `DownloadRowCard.vue` markup, which is a `<pre>`
 * rather than a `<ul>` - a different DOM shape, so it earns its own coverage rather than
 * being assumed identical.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import DownloadRowCard from "./DownloadRowCard.vue";
import type { DownloadRow } from "./downloads.js";

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

    /*
     * This jsdom is started without a storage file - `CommandPalette.test.ts`,
     * `RenderConsole.test.ts` and `BackupRunCard.test.ts` all hit the same gap and fix it
     * the same way. The auto-scroll checkbox needs somewhere real for its preference to
     * land and be read back from.
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

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

const row: DownloadRow = {
    downloadId: "download-9001",
    asset: "test-world-seed-1739.zip",
    repository: "me/saves",
    tag: "world-backup-1",
    state: "running",
    phase: "downloading",
    task: {
        phase: "downloading",
        description: "Downloading",
        bytesDone: 680_000_000,
        bytesTotal: 1_700_000_000,
        partsDone: 0,
        partsTotal: 1,
        currentPart: null,
        percent: 40,
        etaSeconds: 90,
        etaText: null,
    },
    bytes: 1_700_000_000,
    parts: 1,
    split: false,
    archive: null,
    content: null,
    sha256: null,
    failure: null,
    startedAt: "2026-08-04T10:15:00.000Z",
    finishedAt: null,
    durationMs: null,
    live: true,
    cancelling: false,
    log: [
        { id: 1, level: "info", message: "Fetching the manifest", at: "2026-08-04T10:15:01.000Z" },
        { id: 2, level: "info", message: "Fetching part 1 of 1", at: "2026-08-04T10:15:05.000Z" },
    ],
};

function mountCard(initial: DownloadRow = row, attachTo?: HTMLElement) {
    return mount(DownloadRowCard, {
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

async function openLog(view: ReturnType<typeof mountCard>): Promise<void> {
    await view.find('button[aria-expanded]').trigger("click");
}

describe("the log disclosure", () => {
    it("points aria-controls at the id of the revealed log", async () => {
        const view = mountCard();

        const toggle = view.find("button[aria-expanded]");
        expect(toggle.exists()).toBe(true);
        expect(toggle.attributes("aria-expanded")).toBe("false");
        const controlsId = toggle.attributes("aria-controls");
        expect(controlsId).toBeTruthy();
        expect(view.find(`#${controlsId}`).exists()).toBe(false);

        await toggle.trigger("click");

        expect(toggle.attributes("aria-expanded")).toBe("true");
        const log = view.find(`#${controlsId}`);
        expect(log.exists()).toBe(true);
        expect(log.element.tagName).toBe("PRE");
        expect(log.text()).toContain("Fetching the manifest");
        view.unmount();
    });
});

describe("the log's auto-scroll checkbox", () => {
    it("is on by default once the log is opened, with a real accessible name", async () => {
        const view = mountCard();
        await openLog(view);

        const checkbox = view.find('[data-test="download-log-autoscroll"] input[type="checkbox"]');
        expect(checkbox.exists()).toBe(true);
        expect((checkbox.element as HTMLInputElement).checked).toBe(true);
        expect(checkbox.attributes("aria-label")).toBe("Follow new lines");
        view.unmount();
    });

    it("is a log region with live announcements deliberately off, per line, not per verbose stream", async () => {
        const view = mountCard();
        await openLog(view);

        const log = view.find(".mb-download-row__pre");
        expect(log.attributes("role")).toBe("log");
        expect(log.attributes("aria-live")).toBe("off");
        expect(log.attributes("tabindex")).toBe("0");
        view.unmount();
    });

    it("follows new lines while checked", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-download-row__pre");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100); // already at the bottom

        setScrollMetrics(element, 400, 100, 100); // more of the report is about to arrive
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Rejoining parts", at: "2026-08-04T10:15:30.000Z" }] },
        });
        await flush();

        expect(element.scrollTop).toBe(400);
        view.unmount();
    });

    it("does not move the log once unchecked", async () => {
        const view = mountCard();
        await openLog(view);
        const checkbox = view.find('[data-test="download-log-autoscroll"] input[type="checkbox"]');
        await checkbox.setValue(false);

        const log = view.find(".mb-download-row__pre");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100);
        setScrollMetrics(element, 400, 100, 100);
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Rejoining parts", at: "2026-08-04T10:15:30.000Z" }] },
        });
        await flush();

        expect(element.scrollTop).toBe(100);
        view.unmount();
    });

    it("scrolling away pauses without unticking the checkbox, and a jump control appears", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-download-row__pre");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 1000, 100, 200); // well away from the bottom
        await log.trigger("scroll");

        expect(view.find(".mb-download-row__jump").exists()).toBe(true);
        const checkbox = view.find('[data-test="download-log-autoscroll"] input[type="checkbox"]');
        expect((checkbox.element as HTMLInputElement).checked).toBe(true);
        view.unmount();
    });

    it("resumes and hides the jump control once scrolled back to the bottom", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-download-row__pre");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 1000, 100, 200);
        await log.trigger("scroll");
        expect(view.find(".mb-download-row__jump").exists()).toBe(true);

        setScrollMetrics(element, 1000, 100, 900);
        await log.trigger("scroll");

        expect(view.find(".mb-download-row__jump").exists()).toBe(false);
        view.unmount();
    });

    it("does not scroll away from an active text selection inside the log", async () => {
        const view = mountCard();
        await openLog(view);
        const log = view.find(".mb-download-row__pre");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100);

        // The `<pre>`'s text interpolation mutates the same underlying Text node on every
        // update rather than replacing it, so anchoring on the element itself (its one
        // child text node's ownership does not matter here) survives the props change
        // below intact - unlike a `v-for`'d list, there is no key to keep stable.
        const spy = vi
            .spyOn(document, "getSelection")
            .mockReturnValue({ isCollapsed: false, anchorNode: element } as unknown as Selection);

        setScrollMetrics(element, 400, 100, 100);
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Rejoining parts", at: "2026-08-04T10:15:30.000Z" }] },
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

        const log = view.find(".mb-download-row__pre");
        const element = log.element as HTMLElement;
        setScrollMetrics(element, 200, 100, 100);
        setScrollMetrics(element, 400, 100, 100);
        await view.setProps({
            row: { ...row, log: [...row.log, { id: 3, level: "info", message: "Rejoining parts", at: "2026-08-04T10:15:30.000Z" }] },
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
        const checkbox = first.find('[data-test="download-log-autoscroll"] input[type="checkbox"]');
        await checkbox.setValue(false);
        first.unmount();

        const second = mountCard();
        await openLog(second);
        const secondCheckbox = second.find('[data-test="download-log-autoscroll"] input[type="checkbox"]');
        expect((secondCheckbox.element as HTMLInputElement).checked).toBe(false);
        second.unmount();
    });
});
