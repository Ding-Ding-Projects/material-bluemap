/**
 * @vitest-environment jsdom
 *
 * "Show the detail" is a plain inline disclosure, not a v-menu popover: pressing it moves
 * no focus anywhere, so the only thing a screen-reader user gets is the toggle's own
 * `aria-expanded` announcement. Without `aria-controls` pointing at the revealed `<pre>`,
 * that announcement names no region - there is nothing for assistive tech to jump to, and
 * nothing tying the button's state to the content it discloses.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RemotePreflightPanel from "./RemotePreflightPanel.vue";
import type { PreflightReport } from "./remoteBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields, radios and overlays observe their
    // own size. The same stubs every other mounted test in this package installs.
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

const report: PreflightReport = {
    ok: false,
    target: "renderer@build.lan:22",
    checks: [
        { stage: "ssh", ok: true, message: "signed in fine", detail: "ssh -v output here" },
    ],
    failure: null,
    hostKeys: [],
    docker: null,
    freeBytes: null,
    workDir: null,
};

function mountPanel() {
    return mount(RemotePreflightPanel, {
        props: {
            report,
            running: false,
            decision: { kind: "none" },
            canCheck: true,
            targetLabel: "the build server",
        },
        global: { plugins: [i18n, vuetify] },
    });
}

describe("the per-check detail disclosure", () => {
    it("points aria-controls at the id of the pre it reveals", async () => {
        const wrapper = mountPanel();
        await flushPromises();

        const toggle = wrapper
            .findAll("button")
            .find((candidate) => candidate.text().includes("Show the detail"));
        expect(toggle, "no 'Show the detail' toggle rendered").toBeTruthy();

        // Before the old fix: no aria-controls at all.
        const controlsId = toggle?.attributes("aria-controls");
        expect(controlsId, "toggle has no aria-controls").toBeTruthy();
        expect(toggle?.attributes("aria-expanded")).toBe("false");

        await toggle?.trigger("click");
        await flushPromises();

        // Before the old fix: the revealed <pre> had no id, so nothing on the page could
        // ever match aria-controls no matter what it pointed at.
        const detail = wrapper.find(`#${controlsId}`);
        expect(detail.exists(), `no element with id="${controlsId}" was revealed`).toBe(true);
        expect(detail.element.tagName).toBe("PRE");
        expect(detail.text()).toBe("ssh -v output here");
        expect(toggle?.attributes("aria-expanded")).toBe("true");
    });
});
