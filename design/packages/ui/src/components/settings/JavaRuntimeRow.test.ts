// @vitest-environment jsdom

/**
 * `JavaRuntimeRow.vue`'s download control: the button that closes the gap the roadmap
 * named - `settings.java.missingHint` has always promised "the app can fetch one for
 * you", and until this row grew a button that called `requestProvision()` that was a
 * promise with no control behind it. `javaSetting.test.ts` proves the store's own
 * `requestProvision`/`loadConsent` round trip against a fake bridge; this file proves the
 * row actually renders the button, shows progress while it downloads, and reports a
 * failure rather than swallowing it - the wiring between the screen and that object.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createJavaSetting } from "./javaSetting.js";
import JavaRuntimeRow from "./JavaRuntimeRow.vue";
import type {
    JavaDownloadConsentReadout,
    JavaProvisionEventReadout,
    JavaProvisionReadout,
    JavaRuntimeReadout,
    SettingsBridge,
} from "./settingsBridge.js";

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

    Element.prototype.scrollIntoView = () => {};
});

const vuetify = createVuetify();

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const NOTHING_SUITABLE: JavaRuntimeReadout = {
    installation: null,
    rejected: [],
    required: 25,
};

const PROVISIONED: JavaRuntimeReadout = {
    installation: {
        source: "provisioned",
        executable: "/userData/java/temurin-25/bin/java",
        home: "/userData/java/temurin-25",
        version: { feature: 25, version: "25.0.4+7", runtime: "OpenJDK Runtime Environment Temurin-25.0.4+7" },
    },
    rejected: [],
    required: 25,
};

interface FakeBridge extends SettingsBridge {
    readonly accepted: boolean[];
    readonly provisionCalls: number;
}

/** A fake whose `provisionJavaRuntime` is controlled by the test, so progress can be observed mid-flight. */
function fakeBridge(options: {
    provision: () => Promise<JavaProvisionReadout>;
    initialConsent?: JavaDownloadConsentReadout;
}): FakeBridge {
    let consent: JavaDownloadConsentReadout = options.initialConsent ?? { accepted: false, acceptedAt: null };
    let runtime: JavaRuntimeReadout = NOTHING_SUITABLE;
    const acceptedCalls: boolean[] = [];
    let provisionCalls = 0;
    let listener: ((event: JavaProvisionEventReadout) => void) | null = null;

    return {
        get accepted() {
            return acceptedCalls;
        },
        get provisionCalls() {
            return provisionCalls;
        },
        javaRuntime: () => Promise.resolve(runtime),
        javaDownloadConsent: () => Promise.resolve(consent),
        acceptJavaDownloadConsent: () => {
            acceptedCalls.push(true);
            consent = { accepted: true, acceptedAt: "2026-08-05T00:00:00.000Z" };
            return Promise.resolve(consent);
        },
        provisionJavaRuntime: async () => {
            provisionCalls += 1;
            const outcome = await options.provision();
            if (outcome.ok) runtime = PROVISIONED;
            return outcome;
        },
        onJavaProvisionEvent: (fn) => {
            listener = fn;
            return () => {
                listener = null;
            };
        },
        // Exposed so a test can push progress events while `provisionJavaRuntime` is
        // still awaiting, exactly like the real IPC event channel.
        emit(event: JavaProvisionEventReadout) {
            listener?.(event);
        },
    } as FakeBridge & { emit(event: JavaProvisionEventReadout): void };
}

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

describe("the missing state, with provisioning available", () => {
    it("explains the download and offers a button, rather than only naming JAVA_HOME", async () => {
        const bridge = fakeBridge({ provision: () => Promise.resolve({ ok: true, installation: PROVISIONED.installation!, provisioned: true }) });
        const setting = createJavaSetting({ bridge });
        await setting.load();

        const wrapper = mount(JavaRuntimeRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("Eclipse Temurin");
        expect(wrapper.text()).toContain("roughly 140 MB");
        const button = wrapper.findAll("button").find((btn) => btn.text() === "Download Java");
        expect(button?.exists()).toBe(true);

        wrapper.unmount();
    });

    it("downloads, shows progress, and lands on the installation it just provisioned", async () => {
        let resolveProvision: (outcome: JavaProvisionReadout) => void = () => {};
        const bridge = fakeBridge({
            provision: () =>
                new Promise<JavaProvisionReadout>((resolve) => {
                    resolveProvision = resolve;
                }),
        }) as FakeBridge & { emit(event: JavaProvisionEventReadout): void };
        const setting = createJavaSetting({ bridge });
        await setting.load();

        const wrapper = mount(JavaRuntimeRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        const button = wrapper.findAll("button").find((btn) => btn.text() === "Download Java");
        expect(button?.exists()).toBe(true);
        await button!.trigger("click");
        await wrapper.vm.$nextTick();

        // The click itself is the consent: pressing "Download Java" recorded agreement
        // without a second confirmation step, and the progress bar is now showing.
        expect(bridge.accepted).toHaveLength(1);
        expect(setting.provisioning.value).toBe(true);

        bridge.emit({ stage: "downloading", message: "Downloading Eclipse Temurin 25.0.4+7", received: 50, total: 100 });
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("Downloading Eclipse Temurin 25.0.4+7");

        resolveProvision({ ok: true, installation: PROVISIONED.installation!, provisioned: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(setting.provisioning.value).toBe(false);
        expect(setting.state.value).toBe("found");
        expect(wrapper.text()).toContain("25.0.4+7");

        wrapper.unmount();
    });

    it("reports a provisioning failure as an alert, and leaves the button ready to retry", async () => {
        const bridge = fakeBridge({
            provision: () => Promise.resolve({ ok: false, message: "The download's digest did not match. Nothing was installed." }),
        });
        const setting = createJavaSetting({ bridge });
        await setting.load();

        const wrapper = mount(JavaRuntimeRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        const button = wrapper.findAll("button").find((btn) => btn.text() === "Download Java");
        await button!.trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("digest did not match");
        // The button is back, not stuck behind a permanent progress bar.
        expect(wrapper.findAll("button").find((btn) => btn.text() === "Download Java")).toBeTruthy();

        wrapper.unmount();
    });

    it("shows no download button at all when this build cannot provision", async () => {
        const bridge: SettingsBridge = { javaRuntime: () => Promise.resolve(NOTHING_SUITABLE) };
        const setting = createJavaSetting({ bridge });
        await setting.load();

        const wrapper = mount(JavaRuntimeRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        expect(wrapper.findAll("button").find((btn) => btn.text() === "Download Java")).toBeUndefined();
        expect(wrapper.text()).toContain("No Java 25 or newer was found.");

        wrapper.unmount();
    });
});
