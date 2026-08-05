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

import { beforeAll, describe, expect, it } from "vitest";
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
});

const i18n = createI18n({ legacy: false, locale: "none", fallbackLocale: "none", messages: {} });
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

function mountCard() {
    return mount(BackupRunCard, {
        props: { row, canCancel: true, canOpenSettings: true },
        global: { plugins: [i18n, vuetify] },
    });
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
