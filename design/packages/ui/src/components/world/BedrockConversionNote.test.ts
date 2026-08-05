// @vitest-environment jsdom

/**
 * The wizard's "this is a Bedrock world" note, and its Convert action.
 *
 * `bedrock:detect`, `bedrock:convert` and the rest were registered on every launch and
 * fully unit-tested against a fake `IpcMain` (`main/bedrock/ipc.test.ts`), and none of it
 * was reachable: no preload method crossed the bridge, and nothing in the renderer ever
 * called one. This is the regression test for the renderer half - that a Bedrock folder
 * genuinely reaches this note, and that pressing Convert genuinely reaches `convert`.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import BedrockConversionNote from "./BedrockConversionNote.vue";
import type {
    BedrockBridge,
    BedrockDetectResult,
    ConversionOutcome,
    ConversionProgressEvent,
} from "./bedrockBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
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

const JAVA: BedrockDetectResult = {
    folder: "/srv/java-world",
    detection: {
        bedrock: false,
        confidence: null,
        markers: { levelDat: true, levelNameFile: false, database: false, databaseFiles: null },
        explanation: "",
    },
    name: null,
    suggestedOutput: null,
    estimatedSize: null,
    fidelity: null,
    memory: null,
    error: null,
};

const BEDROCK: BedrockDetectResult = {
    folder: "/srv/bedrock-world",
    detection: {
        bedrock: true,
        confidence: "certain",
        markers: { levelDat: true, levelNameFile: true, database: true, databaseFiles: 4 },
        explanation: "This is a Bedrock Edition world.",
    },
    name: "Survival Island",
    suggestedOutput: "/srv/bedrock-world (Java)",
    estimatedSize: { low: 100, high: 200 },
    fidelity: {
        notes: [{ id: "entities", title: "Entities", detail: "do not convert.", source: "chunker-readme" }],
        mayBeOutOfDate: false,
        checkedAgainst: "1.19.1",
    },
    memory: { level: "low", sourceBytes: 1000, thresholdBytes: 2000, warn: false, title: "", detail: "" },
    error: null,
};

/** A bridge stub with every method overridable, sized to what the note actually calls. */
function fakeBridge(overrides: Partial<BedrockBridge> = {}): BedrockBridge {
    return {
        detect: vi.fn(async () => JAVA),
        chunkerStatus: vi.fn(async () => {
            throw new Error("not used in these tests");
        }),
        fetchChunker: vi.fn(async () => {
            throw new Error("not used in these tests");
        }),
        convert: vi.fn(async () => ({ ok: true, outputDirectory: "", regionFiles: 0, sourceEdition: null, targetEdition: null, durationMs: 0, conversionId: "c1" }) as ConversionOutcome & { conversionId: string }),
        cancel: vi.fn(async () => true),
        onBedrockEvent: vi.fn((_listener: (event: ConversionProgressEvent) => void) => () => undefined),
        ...overrides,
    };
}

function render(bridge: BedrockBridge | null) {
    return mount(BedrockConversionNote, {
        props: { folder: "/srv/bedrock-world", bridge },
        global: { plugins: [vuetify, i18n()] },
    });
}

/** Past the component's own 400ms debounce on the folder watcher, plus its detect() call. */
async function settleDebounce(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 450));
}

describe("detecting a Bedrock world in the wizard's own folder step", () => {
    it("renders nothing for a Java world", async () => {
        const bridge = fakeBridge({ detect: vi.fn(async () => JAVA) });
        const wrapper = render(bridge);
        await settleDebounce();
        await wrapper.vm.$nextTick();

        expect(bridge.detect).toHaveBeenCalledWith("/srv/bedrock-world");
        expect(wrapper.find(".mb-bedrock-note").exists()).toBe(false);
        wrapper.unmount();
    });

    it("renders nothing at all when this build has no bedrock bridge", async () => {
        const wrapper = render(null);
        await settleDebounce();
        await wrapper.vm.$nextTick();

        expect(wrapper.find(".mb-bedrock-note").exists()).toBe(false);
        wrapper.unmount();
    });

    it("names the world and offers Convert when Bedrock is detected", async () => {
        const bridge = fakeBridge({ detect: vi.fn(async () => BEDROCK) });
        const wrapper = render(bridge);
        await settleDebounce();
        await wrapper.vm.$nextTick();

        expect(wrapper.find(".mb-bedrock-note").exists()).toBe(true);
        expect(wrapper.text()).toContain("Survival Island");
        expect(wrapper.text()).toContain("Entities");
        const convertButton = wrapper.findAll("button").find((b) => b.text().includes("Convert with Chunker"));
        expect(convertButton).toBeDefined();
        wrapper.unmount();
    });
});

describe("converting", () => {
    it("reaches bridge.convert and emits `converted` with the output directory on success", async () => {
        const bridge = fakeBridge({
            detect: vi.fn(async () => BEDROCK),
            convert: vi.fn(async () => ({
                ok: true as const,
                outputDirectory: "/srv/bedrock-world (Java)",
                regionFiles: 12,
                sourceEdition: "Bedrock 1.21",
                targetEdition: "Java 1.21.4",
                durationMs: 1000,
                conversionId: "conv-1",
            })),
        });
        const wrapper = render(bridge);
        await settleDebounce();
        await wrapper.vm.$nextTick();

        const convertButton = wrapper.findAll("button").find((b) => b.text().includes("Convert with Chunker"));
        await convertButton?.trigger("click");
        await wrapper.vm.$nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(bridge.convert).toHaveBeenCalledWith({ world: "/srv/bedrock-world" });
        expect(wrapper.emitted("converted")).toEqual([["/srv/bedrock-world (Java)"]]);
        wrapper.unmount();
    });

    it("shows the failure message rather than silently doing nothing", async () => {
        const bridge = fakeBridge({
            detect: vi.fn(async () => BEDROCK),
            convert: vi.fn(async () => ({
                ok: false as const,
                code: "chunker-failed",
                message: "Chunker could not read this world.",
                cleanedUp: true,
                diagnostics: [],
                durationMs: 500,
                conversionId: "conv-2",
            })),
        });
        const wrapper = render(bridge);
        await settleDebounce();
        await wrapper.vm.$nextTick();

        const convertButton = wrapper.findAll("button").find((b) => b.text().includes("Convert with Chunker"));
        await convertButton?.trigger("click");
        await wrapper.vm.$nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(wrapper.text()).toContain("Chunker could not read this world.");
        expect(wrapper.emitted("converted")).toBeUndefined();
        wrapper.unmount();
    });

    /**
     * `bedrock:convert`'s own id is only reported back when the invoke resolves - which
     * does not happen until the conversion is over. The only way this component can learn
     * the id sooner, so a mid-run Cancel targets the right process, is from the event
     * stream: the main process broadcasts every progress event, including the first
     * "phase: starting" one, with the id it generated at the start.
     */
    it("asks the bridge to cancel when Cancel is pressed mid-conversion", async () => {
        // A holder object rather than two bare `let`s: both are only ever written from
        // inside a nested closure, which is exactly the shape that leaves TypeScript's
        // control-flow analysis unable to see the write and narrows the read as `never`.
        const state: {
            resolveConvert: (() => void) | null;
            liveListener: ((event: ConversionProgressEvent) => void) | null;
        } = { resolveConvert: null, liveListener: null };

        const bridge = fakeBridge({
            detect: vi.fn(async () => BEDROCK),
            convert: vi.fn(
                () =>
                    new Promise<ConversionOutcome & { conversionId: string }>((resolve) => {
                        state.resolveConvert = () =>
                            resolve({
                                ok: true,
                                outputDirectory: "/srv/out",
                                regionFiles: 1,
                                sourceEdition: null,
                                targetEdition: null,
                                durationMs: 1,
                                conversionId: "conv-3",
                            });
                    }),
            ),
            onBedrockEvent: vi.fn((listener: (event: ConversionProgressEvent) => void) => {
                state.liveListener = listener;
                return () => {
                    state.liveListener = null;
                };
            }),
        });
        const wrapper = render(bridge);
        await settleDebounce();
        await wrapper.vm.$nextTick();

        const convertButton = wrapper.findAll("button").find((b) => b.text().includes("Convert with Chunker"));
        void convertButton?.trigger("click");
        await wrapper.vm.$nextTick();

        // The main process's first broadcast, the same shape `bedrock:convert`'s handler
        // sends before the conversion has done anything at all.
        state.liveListener?.({ conversionId: "conv-3", kind: "phase", phase: "starting" });

        const cancelButton = wrapper.findAll("button").find((b) => b.text().includes("Cancel the conversion"));
        expect(cancelButton).toBeDefined();
        await cancelButton?.trigger("click");

        expect(bridge.cancel).toHaveBeenCalledWith("conv-3");

        state.resolveConvert?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
        wrapper.unmount();
    });
});
