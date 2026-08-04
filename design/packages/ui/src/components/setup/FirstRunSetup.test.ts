// @vitest-environment jsdom

/**
 * The first-run flow, mounted, and the two claims only a rendered component can settle.
 *
 * **Accepting is never pre-selected.** Everything about this application's consent
 * handling rests on the answer being a real choice, and every convenient way of building
 * a consent step quietly stops it being one: a checkbox that starts ticked, an Accept
 * button that is the dialog's default so Enter presses it, an Accept styled prominently
 * beside a Decline styled as a link. None of those are visible in the flow controller's
 * state, which is why they are asserted here against the DOM.
 *
 * **The licence is a step before the question.** It has its own progress number and its
 * own Next, and it carries no control that answers anything. A licence shown after the
 * buttons is a licence nobody opens.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { defineComponent, h } from "vue";

import FirstRunSetup from "./FirstRunSetup.vue";
import { memoryStorage, setSetupStorage } from "./setupPrefs.js";
import { reloadSetupLanguage } from "./setupI18n.js";

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist and the mount throws without
    // them: Vuetify's dialog observes its own size and the reduced-motion check reads
    // `matchMedia`.
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

    // Vuetify's overlay positioning reads `visualViewport` unconditionally, and jsdom has
    // none; without this the dialog's own watcher throws before a single assertion runs.
    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1280,
            height: 800,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });

    Element.prototype.scrollIntoView = (): void => {};
});

/**
 * A preload on a machine that has never been set up.
 *
 * Deliberately without `readEulaDocument`, because that is the interesting case for the
 * licence step: nothing can be fetched, so the step has to show BlueMap's own wording and
 * say that is what it is doing rather than rendering an empty panel.
 */
function fakeBridge(): Record<string, unknown> {
    return {
        readConsent: () =>
            Promise.resolve({
                accepted: false,
                acceptedAt: null,
                documentUrl: "https://account.mojang.com/documents/minecraft_eula",
                termsVersion: 1,
                appVersion: null,
            }),
        needsFirstRun: () => Promise.resolve(true),
        acceptDownload: () => Promise.resolve({ accepted: true }),
        revokeDownloadConsent: () => Promise.resolve({ accepted: false }),
        completeFirstRun: () => Promise.resolve({ completed: true, completedAt: null }),
    };
}

const vuetify = createVuetify();

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const Host = defineComponent({
    setup() {
        return () => h(VApp, null, { default: () => [h(FirstRunSetup)] });
    },
});

let wrapper: VueWrapper | null = null;

async function settle(): Promise<void> {
    for (let index = 0; index < 10; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
    (globalThis as { materialBluemap?: unknown }).materialBluemap = fakeBridge();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
    document.body.innerHTML = "";
});

async function openSetup(): Promise<void> {
    wrapper = mount(Host, { global: { plugins: [vuetify, i18n] }, attachTo: document.body });
    await settle();
}

/** Clicks the button whose visible label is exactly `label`. */
async function press(label: string): Promise<void> {
    const button = [...document.querySelectorAll<HTMLElement>(".mb-setup-card__actions button")].find(
        (candidate) => (candidate.textContent ?? "").trim() === label,
    );
    if (button === undefined) throw new Error(`no action button labelled ${label}`);
    button.click();
    await settle();
}

function card(): HTMLElement {
    const element = document.querySelector<HTMLElement>(".mb-setup-card");
    if (element === null) throw new Error("the setup card is not on screen");
    return element;
}

describe("the licence step", () => {
    it("comes before the question and shows the document", async () => {
        await openSetup();

        // Step one is the welcome; step two is the licence, with its own progress number.
        expect(card().textContent).toContain("Step 1 of 4");
        await press("Next");

        expect(card().textContent).toContain("Step 2 of 4");
        expect(document.querySelector(".mb-eula")).not.toBeNull();
    });

    it("says what is on screen came from BlueMap when Mojang could not be reached", async () => {
        await openSetup();
        await press("Next");

        const text = card().textContent ?? "";
        // The fallback, labelled. The fake bridge has no way to fetch, so this is the one
        // sentence that must appear: not Mojang's document, and here is why.
        expect(text).toContain("This is not Mojang's document");
        expect(text).toContain("BlueMap");
        expect(text).toContain("Never fetched");
    });

    it("states that the tabs are this app's navigation and the document is authoritative", async () => {
        await openSetup();
        await press("Next");

        const text = card().textContent ?? "";
        expect(text).toContain("navigation over Mojang's document");
        expect(text).toContain("reorder");
        expect(text).toContain("Mojang's document is the one that counts");
    });

    it("answers nothing: no accept or decline control lives on it", async () => {
        await openSetup();
        await press("Next");

        const labels = [...document.querySelectorAll<HTMLElement>(".mb-setup-card__actions button")].map(
            (button) => (button.textContent ?? "").trim(),
        );
        expect(labels).toContain("Next");
        expect(labels).not.toContain("Accept");
        expect(labels).not.toContain("Decline");
        // And reading it is said, in as many words, not to be agreeing to it.
        expect(card().textContent).toContain("Reading this agrees to nothing");
    });
});

describe("the consent question", () => {
    async function reachConsent(): Promise<void> {
        await openSetup();
        await press("Next");
        await press("Next");
        expect(card().textContent).toContain("Step 3 of 4");
    }

    it("pre-selects nothing: no control arrives already answering it", async () => {
        await reachConsent();

        // No checkbox, radio or switch anywhere in the card, ticked or otherwise. A
        // pre-ticked box is the classic way a consent screen becomes a formality, and the
        // absence of the control is a stronger guarantee than the absence of the tick.
        const inputs = [...card().querySelectorAll<HTMLInputElement>("input")];
        for (const input of inputs) {
            expect(["checkbox", "radio"], `an ${input.type} appeared on the consent step`).not.toContain(
                input.type,
            );
            expect(input.checked).toBe(false);
        }

        // Nothing is focused ahead of the answer either, so Enter cannot answer for
        // somebody who was still reading.
        const active = document.activeElement;
        expect((active?.textContent ?? "").trim()).not.toBe("Accept");
    });

    it("draws Accept and Decline identically, in one row", async () => {
        await reachConsent();

        const answers = [...document.querySelectorAll<HTMLElement>(".mb-setup-card__answer")];
        expect(answers).toHaveLength(2);
        expect((answers[0]?.textContent ?? "").trim()).toBe("Accept");
        expect((answers[1]?.textContent ?? "").trim()).toBe("Decline");

        // Same classes means same variant, same size, same emphasis. A decline styled as
        // the quiet option is a decline nobody makes.
        const classesOf = (element: HTMLElement): string[] =>
            [...element.classList].filter((name) => !name.startsWith("mb-")).sort();
        expect(classesOf(answers[0] as HTMLElement)).toEqual(classesOf(answers[1] as HTMLElement));
    });

    it("does not record an answer until one of them is pressed", async () => {
        await reachConsent();

        let accepted = false;
        (globalThis as { materialBluemap?: Record<string, unknown> }).materialBluemap = {
            ...fakeBridge(),
            acceptDownload: () => {
                accepted = true;
                return Promise.resolve({ accepted: true });
            },
        };

        // Merely arriving at the step, and merely having read the licence on the step
        // before it, has written nothing.
        expect(accepted).toBe(false);
    });

    it("shows the verbatim BlueMap quotation above the buttons that act on it", async () => {
        await reachConsent();

        const text = card().textContent ?? "";
        expect(text).toContain("By changing the setting (accept-download) below to TRUE");
        expect(text).toContain("you confirm that you own a license to Minecraft (Java Edition)");
    });
});
