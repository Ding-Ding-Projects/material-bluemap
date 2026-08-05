/**
 * @vitest-environment jsdom
 *
 * The storages panel's empty state, mounted on its own.
 *
 * `ProjectEditor.test.ts` exercises the rest of this panel through the tabbed editor; this
 * file is narrowly about the guided empty state, which teaches what a storage is before it
 * says to add one -- see `project.storages.none` in `copy/surfaces/project.ts` for why.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ProjectStoragesPanel from "./ProjectStoragesPanel.vue";
import { createProject } from "./projectModel.js";

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

const STAMP = { now: "2026-08-04T09:00:00+01:00", id: "p1", appVersion: null };

function panel() {
    const vuetify = createVuetify({ components, directives });
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });
    return mount(ProjectStoragesPanel, {
        props: { project: createProject("Empty", STAMP) },
        global: { plugins: [vuetify, i18n] },
    });
}

describe("the guided empty state, before this project has a storage of its own", () => {
    it("says what a storage is, what happens without one, and offers the way to add one", () => {
        const wrapper = panel();
        const text = wrapper.text();

        // What a storage is, in beginner terms.
        expect(text).toContain("where rendered tiles are written");
        // What happens without one -- the fact the original entry already protected.
        expect(text).toContain("no storage");
        expect(text).toContain("folder the app renders into");
        // The action: an always-visible button, not a dead end.
        const addButton = wrapper.findAll("button").find((button) => button.text() === "Add a storage");
        expect(addButton).toBeDefined();
        expect(addButton?.attributes("disabled")).toBeUndefined();
    });
});
