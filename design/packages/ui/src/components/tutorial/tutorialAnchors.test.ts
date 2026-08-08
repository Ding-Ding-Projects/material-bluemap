// @vitest-environment jsdom

/**
 * The guard that stops the tour rotting as the rest of the UI changes.
 *
 * Every other test in this folder proves the tour's own logic - stepping, persistence,
 * placement arithmetic - against fakes. None of that says whether `TUTORIAL_STEPS` in
 * `tutorialSteps.ts` still points at something real. This file is the one place that mounts
 * the actual application shell, the actual tab strip, and the actual owning surfaces, and for
 * every declared step: switches to its real page the same way a user's click would (through
 * its own `data-tutorial-anchor="tab-<pageId>"`, added to `TabStrip.vue` for exactly this),
 * then asks the real DOM for `document.querySelector(step.anchor)`.
 *
 * A step whose control was renamed, removed, or moved behind a disclosure that is not open by
 * default fails here, by name, rather than shipping a tour that highlights nothing.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "../../App.vue";
import { profilesStore, removeProfile } from "../../stores/profiles.js";
import { TUTORIAL_STEPS } from "./tutorialSteps.js";

beforeAll(() => {
    // The same layout-engine stand-ins `App.test.ts` installs: jsdom draws nothing, and
    // Vuetify's overlays, the theme bridge and the settings surface all reach for one of
    // these during a mount.
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

    document.elementsFromPoint = (): Element[] => [];

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

const cells = new Map<string, string>();

beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

let wrapper: VueWrapper | null = null;

/** With no bridge and no stored layout, the shell seeds one tab per page, opened on the first. */
function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

/** Several ticks: switching pages, mounting a slot, and settling any surface it opens. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/**
 * Opens every collapsed group in the shell's strip.
 *
 * A fresh workspace seeds four loose tabs plus three named, collapsed groups rather than
 * twelve flat ones, so most pages have no tab button until their group is opened. The tour
 * itself never trips over this - it navigates through `revealPage`, which reveals the group
 * holding the tab it activates - but these tests navigate by clicking the button, which is a
 * stronger claim and the one worth keeping: the tab a step lands on is a real control, not
 * merely a page id the shell happens to accept. So they open the groups first and then make
 * exactly the assertion they always made.
 */
async function expandGroups(): Promise<void> {
    for (const head of document.querySelectorAll<HTMLElement>(
        '.mb-shell-tabs .mb-tabs-strip__group-head[aria-expanded="false"]',
    )) {
        head.click();
    }
    await settle();
}

/**
 * Navigates to `pageId` the same way the tour itself does: through the real tab button, found
 * by the same `data-tutorial-anchor` attribute a highlighted step would resolve.
 */
async function goToPage(pageId: string): Promise<void> {
    await expandGroups();
    const tab = document.querySelector<HTMLElement>(`[data-tutorial-anchor="tab-${pageId}"]`);
    expect(tab, `no tab button for page "${pageId}"`).not.toBeNull();
    tab?.click();
    await settle();
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
});

describe("every tour step's anchor resolves to a real element", () => {
    it.each(TUTORIAL_STEPS.map((step) => [step.id, step] as const))(
        '"%s" (page "%s") finds its control after the real navigation',
        async (_id, step) => {
            shell();
            await settle();

            await goToPage(step.pageId);

            const anchor = document.querySelector(step.anchor);
            expect(
                anchor,
                `step "${step.id}" points at "${step.anchor}" on page "${step.pageId}", ` +
                    "which the real shell does not render there any more",
            ).not.toBeNull();
        },
    );

    it("every step's own page tab is itself a real, clickable control", async () => {
        shell();
        await settle();
        // Every destination is still a tab; three of them start inside a collapsed group,
        // one disclosure away. See `expandGroups` above for why opening them keeps this
        // assertion honest rather than weakening it.
        await expandGroups();

        for (const step of TUTORIAL_STEPS) {
            const tab = document.querySelector(`[data-tutorial-anchor="tab-${step.pageId}"]`);
            expect(tab, step.pageId).not.toBeNull();
        }
    });
});
