// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ContainerOffers from "./ContainerOffers.vue";
import containerOffersSource from "./ContainerOffers.vue?raw";
import type { ContainerOffer, ContainerOffers as ContainerOffersState } from "./containerOffers.js";

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

afterEach(() => {
    document.body.innerHTML = "";
});

const offer: ContainerOffer = {
    renderId: "render-a",
    containerName: "worldlens-render-a",
    mode: "remote",
    where: "render-host-with-a-deliberately-long-fully-qualified-name.example.internal",
    mapIds: [
        "overworld-with-a-deliberately-long-map-identifier",
        "the-nether-with-a-second-deliberately-long-map-identifier",
    ],
    startedAt: "2026-08-07T12:00:00.000Z",
    state: "running",
    action: "attach",
    canResume: true,
    suggestRestart: false,
    message: "The remote container is still rendering.",
};

function fakeOffers(): ContainerOffersState {
    return {
        offers: ref([offer]),
        strays: ref([]),
        loading: ref(false),
        failure: ref(null),
        busy: ref(null),
        available: true,
        load: async () => {},
        accept: async () => null,
        stop: async () => true,
        dismiss: async () => true,
    };
}

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

function render(): VueWrapper {
    return mount(ContainerOffers, {
        attachTo: document.body,
        props: { offers: fakeOffers() },
        global: { plugins: [vuetify, i18n()] },
    }) as VueWrapper;
}

describe("the container-offer card head, which shares its <v-card-title> with two chips", () => {
    it("clears the inherited overflow, text-overflow and white-space so the container name can wrap", () => {
        const match = /\.mb-container-offers__head\s*\{[^}]*\}/.exec(containerOffersSource);
        expect(match).not.toBeNull();
        const rule = match?.[0] ?? "";
        expect(rule).toMatch(/overflow:\s*visible/);
        expect(rule).toMatch(/text-overflow:\s*clip/);
        expect(rule).toMatch(/white-space:\s*normal/);
    });

    it("keeps long remote-host and map-id labels in readable chip text", () => {
        const wrapper = render();
        const chips = wrapper.findAll(".mb-container-offers__head .mb-responsive-card-title__meta");

        // Chip text is the accessible label when no explicit name replaces it. None of these
        // operational identifiers may be hidden merely because the card becomes narrow.
        expect(chips.map((chip) => chip.text())).toEqual([offer.where, ...offer.mapIds]);
        expect(chips.every((chip) => chip.attributes("aria-hidden") === undefined)).toBe(true);

        wrapper.unmount();
    });

    it("gives each remote-host and map-id chip a narrow-layout wrapping rule", () => {
        const chipRule =
            /\.mb-container-offers__head \.mb-responsive-card-title__meta\.v-chip\s*\{[^}]*\}/s.exec(
                containerOffersSource,
            )?.[0] ?? "";
        const contentRule =
            /\.mb-container-offers__head \.mb-responsive-card-title__meta \.v-chip__content\s*\{[^}]*\}/s.exec(
                containerOffersSource,
            )?.[0] ?? "";

        expect(chipRule).toContain("min-width: 0");
        expect(chipRule).toContain("max-width: 100%");
        expect(chipRule).toContain("height: auto");
        expect(contentRule).toContain("white-space: normal");
        expect(contentRule).toContain("overflow-wrap: anywhere");
    });
});
