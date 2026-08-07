// @vitest-environment jsdom

/**
 * The super-confirmation contract, exercised through the two cards that implement it.
 *
 * `superConfirmGate.test.ts` proves the arithmetic. This file proves that the arithmetic is
 * actually wired to the controls a person can reach, which is a separate claim and the one
 * that has historically been wrong: a gate whose slider is not disabled, whose Escape does
 * nothing, or whose Emergency exit fires the action it was supposed to escape, passes every
 * unit test of its state machine.
 *
 * The contract lists the states to cover by name, so the describes below are named after
 * them: untouched, one key only, both keys, partial slider, full slider, cancel, Escape,
 * reduced motion, keyboard only, assistive-technology labels, localization, and the real
 * destructive operation on both its success and its failure path.
 *
 * Interaction goes through the components rather than through synthetic pointer events on
 * Vuetify's internals. `setValue` on a switch is exactly what a click produces once
 * Vuetify has done its part, and emitting `update:modelValue` from the slider is what both
 * a drag and an End keypress produce; testing Vuetify's own event plumbing here would be
 * testing somebody else's library, and it would be the flakiest part of the file.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, type Plugin, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { VApp, VBtn, VSlider, VSwitch } from "vuetify/components";
import { generateConfigSet } from "@worldlens/config";

import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import ConfigApplyDialog from "../config/ConfigApplyDialog.vue";
import MapsScreen from "../config/MapsScreen.vue";
import MenuSuperConfirm from "../menu/MenuSuperConfirm.vue";
import ProfileManager from "../ProfileManager.vue";
import { loadWorkspace, removeEntry, savePlan, type ConfigWorkspace } from "../config/configWorkspace.js";
import { profilesStore } from "../../stores/profiles.js";
import { GATE_COMPLETION_HOLD_MS, GATE_TRAVEL_END } from "./superConfirmGate.js";

/** Set by `useReducedMotion` below; read by the `matchMedia` shim. */
let reducedMotion = false;

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size and media observers are absent and
    // the mount throws before any assertion runs. Same shims as `configMessages.test.ts`.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: /prefers-reduced-motion/.test(query) ? reducedMotion : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    Element.prototype.scrollIntoView = () => {};

    // An anchored menu positions itself against `visualViewport`, which every browser this
    // ships in implements and no version of jsdom does. Same shim as `App.test.ts`.
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

    /*
     * The profiles store persists on every mutation, and under this runtime `localStorage`
     * is absent rather than merely empty, so the watcher throws on the first delete. The
     * store is not what is under test here, so it gets a map to write into.
     */
    if (typeof globalThis.localStorage === "undefined") {
        const cells = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => cells.get(key) ?? null,
                setItem: (key: string, value: string) => void cells.set(key, value),
                removeItem: (key: string) => void cells.delete(key),
                clear: () => cells.clear(),
                key: () => null,
                length: 0,
            },
        });
    }
});

/**
 * Registered as `vuetify.ts` registers them, because `ProfileManager.vue` leans on the
 * global registration rather than importing each component. `createVuetify()` alone
 * registers nothing, and the surface renders as a tree of unresolved custom elements that
 * a `findComponent` cannot see.
 */
const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

/** Built exactly as `src/i18n.ts` builds the app's: no messages at all. */
function emptyI18n(): Plugin {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    }) as unknown as Plugin;
}

let wrapper: VueWrapper<unknown> | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    reducedMotion = false;
    vi.useRealTimers();
});

function mountIn(
    component: unknown,
    props: Record<string, unknown>,
    i18n: Plugin = emptyI18n(),
): VueWrapper<unknown> {
    const Host = defineComponent({
        props: { inner: { type: Object as PropType<Record<string, unknown>>, required: true } },
        setup(hostProps, { emit }) {
            return () =>
                h(VApp, null, {
                    default: () => [
                        h(component as never, {
                            ...hostProps.inner,
                            onConfirm: () => emit("confirm"),
                        }),
                    ],
                });
        },
        emits: ["confirm"],
    });

    wrapper = mount(Host, {
        props: { inner: props },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<unknown>;
    return wrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 8; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/* -------------------------------------------------------------------------- */
/* Driving a gate                                                             */
/* -------------------------------------------------------------------------- */

interface Driver {
    turnKeyOne(value?: boolean): Promise<void>;
    turnKeyTwo(value?: boolean): Promise<void>;
    slideTo(value: number): Promise<void>;
    releaseSlider(): Promise<void>;
    sliderDisabled(): boolean;
    status(): string;
    card(): HTMLElement | null;
    exit(): VueWrapper<unknown>;
}

/**
 * The controls of whichever gate is mounted inside `host`, found by component rather than
 * by class, so the same driver works for both cards.
 */
function drive(host: VueWrapper<unknown>, gateComponent: unknown, cardClass: string): Driver {
    const gate = () => host.findComponent(gateComponent as never);
    const switches = () => gate().findAllComponents(VSwitch);
    const slider = () => gate().findComponent(VSlider);

    return {
        async turnKeyOne(value = true) {
            await switches()[0]?.setValue(value);
            await settle();
        },
        async turnKeyTwo(value = true) {
            await switches()[1]?.setValue(value);
            await settle();
        },
        async slideTo(value: number) {
            slider().vm.$emit("update:modelValue", value);
            await settle();
        },
        async releaseSlider() {
            slider().vm.$emit("end");
            await settle();
        },
        sliderDisabled: () => slider().props("disabled") === true,
        status: () => document.querySelector(`${cardClass}__status`)?.textContent?.trim() ?? "",
        card: () => document.querySelector<HTMLElement>(cardClass),
        exit: () =>
            gate()
                .findAllComponents(VBtn)
                .find((button) => button.classes().some((name) => name.endsWith("__exit"))) as VueWrapper<unknown>,
    };
}

/** Presses Escape on the gate's card, the way a keyboard user cancels out of it. */
function pressEscape(card: HTMLElement | null): void {
    card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

/* -------------------------------------------------------------------------- */
/* A host that opens the anchored gate from a real button                     */
/* -------------------------------------------------------------------------- */

/**
 * The anchored gate as its consumers use it: a button in the activator slot.
 *
 * The activator matters to more than presentation. It is the element focus is handed back
 * to, so a host that renders the gate without one would pass every test here and still
 * strand a keyboard user on cancel.
 */
const AnchoredHost = defineComponent({
    components: { ConfigSuperConfirm },
    props: {
        title: { type: String, default: "Delete this map config" },
        action: { type: String, default: "This deletes maps/nether.conf. It cannot be undone." },
        affected: { type: Array as PropType<string[]>, default: () => ["maps/nether.conf"] },
        confirmLabel: { type: String, default: "Delete the map config" },
    },
    emits: ["confirm"],
    template: `
        <ConfigSuperConfirm
            :title="title"
            :action="action"
            :affected="affected"
            :confirm-label="confirmLabel"
            @confirm="$emit('confirm')"
        >
            <template #activator="{ props: activatorProps }">
                <button id="opener" v-bind="activatorProps">Delete</button>
            </template>
        </ConfigSuperConfirm>
    `,
});

async function openAnchored(props: Record<string, unknown> = {}): Promise<VueWrapper<unknown>> {
    const host = mountIn(AnchoredHost, props);
    await settle();
    const opener = document.querySelector<HTMLElement>("#opener");
    opener?.focus();
    opener?.click();
    await settle();
    return host;
}

/** The modal gate, opened through its `modelValue`, from a button that had focus. */
const ModalHost = defineComponent({
    components: { MenuSuperConfirm },
    emits: ["confirm"],
    setup() {
        return { open: ref(false) };
    },
    template: `
        <div>
            <button id="opener" @click="open = true">Reset all settings</button>
            <MenuSuperConfirm
                v-model="open"
                title="Reset all settings"
                action="This clears every saved BlueMap setting in this browser and reloads the page. It cannot be undone."
                :affected="['Resolution', 'Render distance', 'Theme']"
                confirm-label="Reset all settings"
                @confirm="$emit('confirm')"
            />
        </div>
    `,
});

async function openModal(): Promise<VueWrapper<unknown>> {
    const host = mountIn(ModalHost, {});
    await settle();
    const opener = document.querySelector<HTMLElement>("#opener");
    opener?.focus();
    opener?.click();
    await settle();
    return host;
}

/** Both gates, so every state below is asserted against each of them. */
const CARDS = [
    { name: "the anchored gate", open: openAnchored, component: ConfigSuperConfirm, css: ".mb-config-confirm" },
    { name: "the modal gate", open: openModal, component: MenuSuperConfirm, css: ".mb-super-confirm" },
] as const;

/* -------------------------------------------------------------------------- */
/* The states the contract names                                              */
/* -------------------------------------------------------------------------- */

for (const card of CARDS) {
    describe(`${card.name}: untouched`, () => {
        it("opens with the slider disabled and says why", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            expect(gate.card()).not.toBeNull();
            expect(gate.sliderDisabled()).toBe(true);
            expect(gate.status()).toContain("Both keys");
        });

        it("does not fire even when the slider is driven to the end anyway", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.slideTo(GATE_TRAVEL_END);

            expect(host.emitted("confirm")).toBeUndefined();
        });
    });

    describe(`${card.name}: one key only`, () => {
        it("leaves the slider disabled with the first key alone", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();

            expect(gate.sliderDisabled()).toBe(true);
            expect(host.emitted("confirm")).toBeUndefined();
        });

        it("leaves the slider disabled with the second key alone", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyTwo();

            expect(gate.sliderDisabled()).toBe(true);
        });

        it("still does not fire when the slider is driven to the end with one key", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.slideTo(GATE_TRAVEL_END);

            expect(host.emitted("confirm")).toBeUndefined();
        });
    });

    describe(`${card.name}: both keys`, () => {
        it("enables the slider and says the gate is armed, without firing", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();

            expect(gate.sliderDisabled()).toBe(false);
            expect(gate.status()).toContain("Armed");
            expect(host.emitted("confirm")).toBeUndefined();
        });

        it("locks again the moment a key goes back off", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.turnKeyTwo(false);

            expect(gate.sliderDisabled()).toBe(true);
            expect(gate.status()).toContain("Both keys");
        });
    });

    describe(`${card.name}: a partial slider`, () => {
        it("moves without firing, and springs back when it is let go", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(GATE_TRAVEL_END - 1);

            expect(host.emitted("confirm")).toBeUndefined();

            await gate.releaseSlider();

            expect(host.findComponent(card.component as never).findComponent(VSlider).props("modelValue")).toBe(0);
            expect(host.emitted("confirm")).toBeUndefined();
        });
    });

    describe(`${card.name}: a full slider`, () => {
        it("fires once, exactly once, and says so", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(GATE_TRAVEL_END);

            expect(host.emitted("confirm")).toHaveLength(1);
            expect(gate.status()).toContain("Authorized");

            await gate.slideTo(GATE_TRAVEL_END);
            expect(host.emitted("confirm")).toHaveLength(1);
        });

        it("disables the slider afterwards, so the completed gate cannot be worked again", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(GATE_TRAVEL_END);

            expect(gate.sliderDisabled()).toBe(true);
        });

        it("closes itself after the completion hold, and puts focus back on the opener", async () => {
            vi.useFakeTimers();
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(GATE_TRAVEL_END);

            expect(gate.card()).not.toBeNull();

            vi.advanceTimersByTime(GATE_COMPLETION_HOLD_MS + 10);
            await settle();

            expect(document.activeElement?.id).toBe("opener");
        });
    });

    describe(`${card.name}: cancelling`, () => {
        it("closes on Emergency exit without firing", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(GATE_TRAVEL_END - 1);

            await gate.exit().trigger("click");
            await settle();

            expect(host.emitted("confirm")).toBeUndefined();
        });

        it("returns focus to the control that opened it", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.exit().trigger("click");
            await settle();

            expect(document.activeElement?.id).toBe("opener");
        });

        it("forgets both keys and the travel, so reopening starts from untouched", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(50);
            await gate.exit().trigger("click");
            await settle();

            document.querySelector<HTMLElement>("#opener")?.click();
            await settle();

            expect(gate.sliderDisabled()).toBe(true);
            expect(gate.status()).toContain("Both keys");
        });
    });

    describe(`${card.name}: Escape`, () => {
        it("cancels without firing", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            pressEscape(gate.card());
            await settle();

            expect(host.emitted("confirm")).toBeUndefined();
            expect(document.activeElement?.id).toBe("opener");
        });
    });

    describe(`${card.name}: reduced motion`, () => {
        it("still authorizes normally, because nothing here waits on an animation", async () => {
            reducedMotion = true;

            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(GATE_TRAVEL_END);

            expect(host.emitted("confirm")).toHaveLength(1);
        });
    });

    describe(`${card.name}: keyboard only`, () => {
        it("takes the slider's own value events, which is what a key press produces", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();

            // What Vuetify's slider emits for End: straight to the maximum, no drag.
            await gate.slideTo(GATE_TRAVEL_END);

            expect(host.emitted("confirm")).toHaveLength(1);
        });

        it("gives the slider a thumb that can be reached with Tab", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();

            const thumb = gate.card()?.querySelector(".v-slider-thumb");
            expect(thumb?.getAttribute("tabindex")).not.toBe("-1");
        });

        it("keeps the Emergency exit reachable and operable from the keyboard", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            const exit = gate.exit().element as HTMLElement;
            exit.focus();
            expect(document.activeElement).toBe(exit);
        });
    });

    describe(`${card.name}: what assistive technology is told`, () => {
        it("names the surface, the slider and the live region", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);
            const surface = gate.card();

            expect(surface?.getAttribute("aria-label")).toBeTruthy();

            const slider = surface?.querySelector("[role='slider']");
            expect(slider?.getAttribute("aria-label")).toBeTruthy();

            expect(surface?.querySelector("[role='status']")?.getAttribute("aria-live")).toBe("polite");
        });

        it("speaks the slider's position as a percentage rather than a bare number", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            await gate.turnKeyOne();
            await gate.turnKeyTwo();
            await gate.slideTo(42);

            const slider = gate.card()?.querySelector("[role='slider']");
            expect(slider?.getAttribute("aria-valuetext")).toContain("42");
        });

        it("labels both keys, so they are not two unnamed switches", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            const labels = [...(gate.card()?.querySelectorAll("label") ?? [])].map(
                (label) => label.textContent?.trim() ?? "",
            );

            expect(labels.some((text) => text.includes("Key 1"))).toBe(true);
            expect(labels.some((text) => text.includes("Key 2"))).toBe(true);
        });

        it("hides the progress bar from the reader, because the status sentence already says it", async () => {
            const host = await card.open();
            const gate = drive(host, card.component, card.css);

            const progress = gate.card()?.querySelector(".v-progress-linear");
            expect(progress?.getAttribute("aria-hidden")).toBe("true");
        });
    });
}

/* -------------------------------------------------------------------------- */
/* The facts survive every language and every funny level                     */
/* -------------------------------------------------------------------------- */

describe("the destructive facts are the caller's, not the gate's", () => {
    it("renders the action and the affected list verbatim, whatever the locale says", async () => {
        const playful = createI18n({
            legacy: false,
            locale: "yue",
            fallbackLocale: "yue",
            silentFallbackWarn: true,
            missingWarn: false,
            fallbackWarn: false,
            messages: {
                yue: {
                    config: {
                        confirm: {
                            keys: "扭晒兩條匙先，跟住拉到底。",
                            keyOne: "第一條匙",
                            keyTwo: "第二條匙",
                            locked: "兩條匙都未扭，條拉桿郁唔到。",
                            armed: "上咗膛。拉到底先算數。",
                            done: "批准咗。",
                            exit: "緊急離開",
                            travel: "行咗 {percent} 巴仙",
                        },
                    },
                },
            },
        }) as unknown as Plugin;

        wrapper = mountIn(
            AnchoredHost,
            {
                title: "Delete this map config",
                action: "This deletes maps/nether.conf from the config folder when you save.",
                affected: ["maps/nether.conf", "map id: nether"],
            },
            playful,
        );
        await settle();
        document.querySelector<HTMLElement>("#opener")?.click();
        await settle();

        const card = document.querySelector(".mb-config-confirm");
        const text = card?.textContent ?? "";

        // The tone around them is the translation's business.
        expect(text).toContain("扭晒兩條匙");
        expect(text).toContain("緊急離開");

        // What is destroyed is not.
        expect(text).toContain("maps/nether.conf");
        expect(text).toContain("map id: nether");
        expect(text).toContain("This deletes maps/nether.conf");
    });

    it("falls back to English that still names the file when no locale has loaded", async () => {
        wrapper = mountIn(AnchoredHost, { affected: ["maps/nether.conf"] });
        await settle();
        document.querySelector<HTMLElement>("#opener")?.click();
        await settle();

        const text = document.querySelector(".mb-config-confirm")?.textContent ?? "";
        expect(text).toContain("Turn both keys");
        expect(text).toContain("Emergency exit");
        expect(text).toContain("maps/nether.conf");
    });
});

/* -------------------------------------------------------------------------- */
/* The real destructive operations                                            */
/* -------------------------------------------------------------------------- */

describe("removing a saved map or server actually removes it, and only then", () => {
    beforeEach(() => {
        profilesStore.profiles.splice(0, profilesStore.profiles.length, {
            id: "one",
            name: "Survivor",
            url: "https://example.com/bluemap",
            trustCustomizations: false,
        });
        profilesStore.activeId = "one";
    });

    async function openRowGate(): Promise<VueWrapper<unknown>> {
        const host = mountIn(ProfileManager, {});
        await settle();
        // The row's own actions. The list is a real listbox now rather than a `v-list`, and
        // the delete button sits beside the option rather than inside it, because ARIA
        // forbids an interactive descendant of an `option`.
        document.querySelector<HTMLElement>(".mb-profiles__actions button")?.click();
        await settle();
        return host;
    }

    it("names the entry, its address and the fact that it is the open one", async () => {
        const host = await openRowGate();
        const gate = host.findComponent(ConfigSuperConfirm);

        expect(gate.props("action")).toContain("Survivor");

        const affected = gate.props("affected") as readonly string[];
        expect(affected.some((line) => line.includes("Survivor"))).toBe(true);
        expect(affected.some((line) => line.includes("https://example.com/bluemap"))).toBe(true);
        expect(affected.some((line) => line.includes("currently open"))).toBe(true);
    });

    it("keeps the profile through one key, a partial slider and an Emergency exit", async () => {
        const host = await openRowGate();
        const gate = drive(host, ConfigSuperConfirm, ".mb-config-confirm");

        await gate.turnKeyOne();
        await gate.slideTo(GATE_TRAVEL_END);
        expect(profilesStore.profiles).toHaveLength(1);

        await gate.turnKeyTwo();
        await gate.slideTo(GATE_TRAVEL_END - 1);
        expect(profilesStore.profiles).toHaveLength(1);

        await gate.exit().trigger("click");
        await settle();
        expect(profilesStore.profiles).toHaveLength(1);
    });

    it("removes it once both keys are turned and the slider is finished", async () => {
        const host = await openRowGate();
        const gate = drive(host, ConfigSuperConfirm, ".mb-config-confirm");

        await gate.turnKeyOne();
        await gate.turnKeyTwo();
        await gate.slideTo(GATE_TRAVEL_END);

        expect(profilesStore.profiles).toHaveLength(0);
        expect(profilesStore.activeId).toBeNull();
    });

    it("does not switch the open map just because the gate was opened", async () => {
        profilesStore.profiles.push({
            id: "two",
            name: "Another",
            url: "https://other.example/bluemap",
            trustCustomizations: false,
        });
        const host = mountIn(ProfileManager, {});
        await settle();

        const buttons = document.querySelectorAll<HTMLElement>(".mb-profiles__actions button");
        buttons[1]?.click();
        await settle();

        expect(profilesStore.activeId).toBe("one");
        expect(host.emitted("close")).toBeUndefined();
    });
});

describe("deleting a map config", () => {
    const OPTIONS = {
        webroot: "/srv/bluemap/web",
        dataFolder: "/srv/bluemap/data",
        world: "/srv/minecraft/world",
        version: "5.22",
    };

    function savedWorkspace(): ConfigWorkspace {
        return loadWorkspace("/srv/bluemap/config", generateConfigSet(OPTIONS));
    }

    it("emits no new workspace until both keys and the whole slider are done", async () => {
        const host = mountIn(MapsScreen, {
            workspace: savedWorkspace(),
            selectedKey: "map:nether",
            highlightPath: null,
        });
        await settle();

        const gate = drive(host, ConfigSuperConfirm, ".mb-config-confirm");
        const screen = host.findComponent(MapsScreen);

        document
            .querySelector<HTMLElement>(".mb-config-maps__actions .mb-config-confirm__anchor button")
            ?.click();
        await settle();

        await gate.turnKeyOne();
        await gate.slideTo(GATE_TRAVEL_END);
        expect(screen.emitted("update:workspace")).toBeUndefined();

        await gate.turnKeyTwo();
        await gate.slideTo(GATE_TRAVEL_END - 1);
        expect(screen.emitted("update:workspace")).toBeUndefined();

        await gate.slideTo(GATE_TRAVEL_END);
        const emitted = screen.emitted("update:workspace");
        expect(emitted).toHaveLength(1);

        const next = (emitted?.[0] as [ConfigWorkspace])[0];
        expect(savePlan(next).deletes).toContain("maps/nether.conf");
    });
});

describe("the save that takes files off the disk", () => {
    const OPTIONS = {
        webroot: "/srv/bluemap/web",
        dataFolder: "/srv/bluemap/data",
        world: "/srv/minecraft/world",
        version: "5.22",
    };

    function workspaceWithADelete(): ConfigWorkspace {
        return removeEntry(loadWorkspace("/srv/bluemap/config", generateConfigSet(OPTIONS)), "map:nether");
    }

    it("leaves an ordinary save on one plain button, because writing is not deleting", async () => {
        const workspace = loadWorkspace("/srv/bluemap/config", generateConfigSet(OPTIONS));
        const host = mountIn(ConfigApplyDialog, {
            modelValue: true,
            plan: savePlan(workspace),
            issues: [],
            folder: "/srv/bluemap/config",
        });
        await settle();

        expect(host.findComponent(ConfigSuperConfirm).exists()).toBe(false);
    });

    it("puts the gate in front of it as soon as the plan deletes anything", async () => {
        const plan = savePlan(workspaceWithADelete());
        expect(plan.deletes).toContain("maps/nether.conf");

        const host = mountIn(ConfigApplyDialog, {
            modelValue: true,
            plan,
            issues: [],
            folder: "/srv/bluemap/config",
        });
        await settle();

        const gate = host.findComponent(ConfigSuperConfirm);
        expect(gate.exists()).toBe(true);
        expect(gate.props("action")).toContain("/srv/bluemap/config");
        expect(gate.props("affected")).toContain("maps/nether.conf");
    });

    it("confirms nothing on one key, and confirms once on both keys and a finished slider", async () => {
        const host = mountIn(ConfigApplyDialog, {
            modelValue: true,
            plan: savePlan(workspaceWithADelete()),
            issues: [],
            folder: "/srv/bluemap/config",
        });
        await settle();

        const dialog = host.findComponent(ConfigApplyDialog);
        document.querySelector<HTMLElement>(".mb-config-confirm__anchor button")?.click();
        await settle();

        const gate = drive(host, ConfigSuperConfirm, ".mb-config-confirm");

        await gate.turnKeyOne();
        await gate.slideTo(GATE_TRAVEL_END);
        expect(dialog.emitted("confirm")).toBeUndefined();

        await gate.turnKeyTwo();
        await gate.slideTo(GATE_TRAVEL_END);
        expect(dialog.emitted("confirm")).toHaveLength(1);
    });

    it("keeps the failure visible and the gate usable when the write comes back an error", async () => {
        const host = mountIn(ConfigApplyDialog, {
            modelValue: true,
            plan: savePlan(workspaceWithADelete()),
            issues: [],
            folder: "/srv/bluemap/config",
            failure: "EPERM: operation not permitted, unlink '/srv/bluemap/config/maps/nether.conf'",
        });
        await settle();

        expect(document.body.textContent).toContain("EPERM");

        // The gate is still there to try again with, and still shut.
        document.querySelector<HTMLElement>(".mb-config-confirm__anchor button")?.click();
        await settle();

        const gate = drive(host, ConfigSuperConfirm, ".mb-config-confirm");
        expect(gate.sliderDisabled()).toBe(true);
        expect(host.findComponent(ConfigApplyDialog).emitted("confirm")).toBeUndefined();
    });

    it("refuses to open at all while the plan is blocked by an error", async () => {
        const host = mountIn(ConfigApplyDialog, {
            modelValue: true,
            plan: savePlan(workspaceWithADelete()),
            issues: [{ severity: "error", message: "core.conf: data folder is missing" }],
            folder: "/srv/bluemap/config",
        });
        await settle();

        expect(host.findComponent(ConfigSuperConfirm).props("disabled")).toBe(true);
    });
});
