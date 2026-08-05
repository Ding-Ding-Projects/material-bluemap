// @vitest-environment jsdom

/**
 * The overlay itself: opening on request, the four controls, focus, persistence and the one
 * real auto-advance signal. `tutorialAnchors.test.ts` next door proves the step list's own
 * selectors resolve against the real shell; this file mounts the overlay in isolation against
 * stand-in anchors, because what is under test here is the overlay's own behaviour rather than
 * the rest of the application.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import TutorialOverlay from "./TutorialOverlay.vue";
import { requestTutorialLaunch, resetTutorialLaunchRequests } from "./tutorialLaunch.js";
import { emitTutorialSignal, resetTutorialSignals } from "./tutorialSignals.js";
import { tutorialCompleted } from "./tutorialController.js";
import { TUTORIAL_STEPS } from "./tutorialSteps.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";

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

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        locale: "en",
        fallbackLocale: "en",
        missingWarn: false,
        fallbackWarn: false,
        messages: { en: {} },
    });
}

/** One stand-in element per real anchor selector `TUTORIAL_STEPS` names, plus a focusable
 * control outside the overlay so focus-restoration has somewhere real to return to. */
function installStandInAnchors(): HTMLButtonElement {
    for (const step of TUTORIAL_STEPS) {
        const marker = document.createElement("div");
        const match = /\[data-tutorial-anchor="([^"]+)"\]/.exec(step.anchor);
        if (match) marker.setAttribute("data-tutorial-anchor", match[1] as string);
        marker.style.position = "fixed";
        marker.tabIndex = -1;
        document.body.appendChild(marker);
    }
    const launcher = document.createElement("button");
    launcher.textContent = "open the tour";
    document.body.appendChild(launcher);
    return launcher;
}

let wrapper: VueWrapper | null = null;
let revealPage: ReturnType<typeof vi.fn>;

function open(): VueWrapper {
    revealPage = vi.fn();
    wrapper = mount(TutorialOverlay, {
        props: { revealPage },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
    return wrapper;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await nextTick();
        await Promise.resolve();
    }
}

function dialog(): HTMLElement | null {
    return document.querySelector('[role="dialog"].mb-tutorial__card');
}

function clickButton(label: string): void {
    const buttons = [...document.querySelectorAll("button")];
    const match = buttons.find((btn) => btn.textContent?.trim() === label);
    if (match === undefined) throw new Error(`no button labelled "${label}"`);
    match.click();
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    resetTutorialLaunchRequests();
    resetTutorialSignals();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("opening on request", () => {
    it("renders nothing until asked to open", () => {
        installStandInAnchors();
        open();

        expect(dialog()).toBeNull();
    });

    it("opens on requestTutorialLaunch(), on step one", async () => {
        installStandInAnchors();
        open();

        requestTutorialLaunch();
        await settle();

        expect(dialog()).not.toBeNull();
        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("asks the shell to reveal the first step's page", async () => {
        installStandInAnchors();
        open();

        requestTutorialLaunch();
        await settle();

        expect(revealPage).toHaveBeenCalledWith(TUTORIAL_STEPS[0]?.pageId);
    });
});

describe("progress, and the four controls", () => {
    it("shows step N of M and it advances on Next", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        expect(dialog()?.textContent).toContain(`Step 1 of ${TUTORIAL_STEPS.length}`);

        clickButton("Next");
        await settle();

        expect(dialog()?.textContent).toContain(`Step 2 of ${TUTORIAL_STEPS.length}`);
        expect(revealPage).toHaveBeenCalledWith(TUTORIAL_STEPS[1]?.pageId);
    });

    it("Back is disabled on the first step and works after advancing", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        const backButtons = [...document.querySelectorAll("button")].filter(
            (btn) => btn.textContent?.trim() === "Back",
        );
        expect(backButtons[0]?.disabled).toBe(true);

        clickButton("Next");
        await settle();
        clickButton("Back");
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of");
    });

    it("Skip this step moves forward exactly like Next", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        clickButton("Skip this step");
        await settle();

        expect(dialog()?.textContent).toContain("Step 2 of");
    });

    it("the exit control is always present and closes the tour without completing it", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        const exitButton = document.querySelector<HTMLButtonElement>(".mb-tutorial__exit");
        expect(exitButton).not.toBeNull();
        exitButton?.click();
        await settle();

        expect(dialog()).toBeNull();
        expect(tutorialCompleted()).toBe(false);
    });

    it("the last step's button reads Finish and completes the tour", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }

        expect(dialog()?.textContent).toContain("Finish");
        clickButton("Finish");
        await settle();

        expect(dialog()).toBeNull();
        expect(tutorialCompleted()).toBe(true);
    });
});

describe("keyboard: Escape exits", () => {
    it("Escape on the card closes the tour", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        const card = dialog();
        expect(card).not.toBeNull();
        card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(dialog()).toBeNull();
    });
});

describe("focus management", () => {
    it("moves focus to the card when a step becomes active", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();

        expect(document.activeElement).toBe(dialog());
    });

    it("restores focus to the control that launched it, on exit", async () => {
        const launcher = installStandInAnchors();
        open();
        launcher.focus();
        expect(document.activeElement).toBe(launcher);

        requestTutorialLaunch();
        await settle();
        expect(document.activeElement).not.toBe(launcher);

        const exitButton = document.querySelector<HTMLButtonElement>(".mb-tutorial__exit");
        exitButton?.click();
        await settle();

        expect(document.activeElement).toBe(launcher);
    });

    it("restores focus on completion too, not only on explicit exit", async () => {
        const launcher = installStandInAnchors();
        open();
        launcher.focus();

        requestTutorialLaunch();
        await settle();
        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();

        expect(document.activeElement).toBe(launcher);
    });
});

describe("completion persists, and it does not reappear on its own", () => {
    it("a completed tour does not reopen itself on a later mount", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";

        // A fresh mount - the app restarting - must not show the tour on its own. Nothing
        // calls requestTutorialLaunch() here at all.
        installStandInAnchors();
        open();
        await settle();

        expect(dialog()).toBeNull();
    });

    it("is relaunchable afterwards, restarting at step one", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            clickButton("Next");
            await settle();
        }
        clickButton("Finish");
        await settle();

        requestTutorialLaunch();
        await settle();

        expect(dialog()).not.toBeNull();
        expect(dialog()?.textContent).toContain("Step 1 of");
    });
});

describe("advancing on the real signal, not only on Next", () => {
    it("the findWorld step advances itself when world-chosen fires", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        // Step 1: welcome. Step 2: makeAMap. Step 3: findWorld, the one with a signal.
        clickButton("Next");
        await settle();
        clickButton("Next");
        await settle();
        expect(TUTORIAL_STEPS[2]?.id).toBe("findWorld");
        expect(dialog()?.textContent).toContain("Step 3 of");

        emitTutorialSignal("world-chosen");
        await settle();

        expect(dialog()?.textContent).toContain("Step 4 of");
    });

    it("a signal is ignored while the tour is closed", async () => {
        installStandInAnchors();
        open();

        emitTutorialSignal("world-chosen");
        await settle();

        expect(dialog()).toBeNull();
    });

    it("a signal is ignored on a step that is not listening for it", async () => {
        installStandInAnchors();
        open();
        requestTutorialLaunch();
        await settle();
        // Step 1 (welcome) has no signal.
        emitTutorialSignal("world-chosen");
        await settle();

        expect(dialog()?.textContent).toContain("Step 1 of");
    });
});
