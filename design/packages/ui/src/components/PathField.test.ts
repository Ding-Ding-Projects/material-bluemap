// @vitest-environment jsdom

/**
 * `PathField.vue`, exercised as any consuming screen would drive it: props in, a bridge
 * stood in for the preload, and the rendered DOM read back exactly as a keyboard or a
 * screen-reader user would meet it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VTooltip } from "vuetify/components";
import PathField from "./PathField.vue";
import type { PathFieldBridge } from "./pathFieldHost.js";

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

function fakeBridge(overrides?: Partial<PathFieldBridge>): PathFieldBridge & {
    readonly folderCalls: unknown[];
    readonly fileCalls: unknown[];
} {
    const folderCalls: unknown[] = [];
    const fileCalls: unknown[] = [];
    return {
        folderCalls,
        fileCalls,
        pickFolder: async (options) => {
            folderCalls.push(options);
            return overrides?.pickFolder ? await overrides.pickFolder(options) : "/picked/world";
        },
        pickFile: async (options) => {
            fileCalls.push(options);
            return overrides?.pickFile ? await overrides.pickFile(options) : "/picked/id_ed25519";
        },
    };
}

function buttonByAria(wrapper: VueWrapper, aria: string) {
    const found = wrapper.findAll("button").find((candidate) => candidate.attributes("aria-label") === aria);
    if (found === undefined) {
        const seen = wrapper.findAll("button").map((b) => b.attributes("aria-label"));
        throw new Error(`no button has aria-label "${aria}". Seen: ${JSON.stringify(seen)}`);
    }
    return found;
}

describe("semantic: folder", () => {
    it("shows exactly one browse button, named for the field", () => {
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "world folder", semantic: "folder", bridge: fakeBridge() },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(wrapper.findAll("button")).toHaveLength(1);
        const button = buttonByAria(wrapper, "Browse for world folder");
        // A real <button>, so Enter and Space activate it through the browser's own native
        // keyboard handling - nothing here has to reimplement that.
        expect(button.element.tagName).toBe("BUTTON");
        expect(button.attributes("disabled")).toBeUndefined();

        wrapper.unmount();
    });

    it("writes the chosen path through the same event typing uses, and asks with the field's own title", async () => {
        const bridge = fakeBridge();
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "world folder", semantic: "folder", bridge },
            global: { plugins: [vuetify, i18n()] },
        });

        await buttonByAria(wrapper, "Browse for world folder").trigger("click");

        expect(bridge.folderCalls).toEqual([{ title: "Choose world folder" }]);
        expect(wrapper.emitted("update:modelValue")).toEqual([["/picked/world"]]);

        wrapper.unmount();
    });

    it("starts the dialog at the current value, once there is one", async () => {
        const bridge = fakeBridge();
        const wrapper = mount(PathField, {
            props: { modelValue: "  /srv/existing/world  ", field: "world folder", semantic: "folder", bridge },
            global: { plugins: [vuetify, i18n()] },
        });

        await buttonByAria(wrapper, "Browse for world folder").trigger("click");

        expect(bridge.folderCalls).toEqual([{ title: "Choose world folder", startIn: "/srv/existing/world" }]);

        wrapper.unmount();
    });

    it("changes nothing on a cancelled pick", async () => {
        const bridge = fakeBridge({ pickFolder: async () => null });
        const wrapper = mount(PathField, {
            props: { modelValue: "/keep/me", field: "world folder", semantic: "folder", bridge },
            global: { plugins: [vuetify, i18n()] },
        });

        await buttonByAria(wrapper, "Browse for world folder").trigger("click");

        expect(wrapper.emitted("update:modelValue")).toBeUndefined();

        wrapper.unmount();
    });

    it("writes through typing exactly as browsing does", async () => {
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "world folder", semantic: "folder", bridge: fakeBridge() },
            global: { plugins: [vuetify, i18n()] },
        });

        const field = wrapper.find("input");
        await field.setValue("C:\\typed\\path");

        expect(wrapper.emitted("update:modelValue")).toEqual([["C:\\typed\\path"]]);

        wrapper.unmount();
    });

    it("disables the browse button and explains why as reachable text, not a tooltip nobody can open", () => {
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "world folder", semantic: "folder", bridge: null },
            global: { plugins: [vuetify, i18n()] },
        });

        const button = buttonByAria(wrapper, "Browse for world folder");
        expect(button.attributes("disabled")).toBeDefined();

        // A native `disabled` <button> never fires hover/focus events and drops out of the tab
        // order (Vuetify also sets `pointer-events: none` on it), so a tooltip anchored to this
        // button could never be opened by mouse, touch, or keyboard - regression coverage for
        // that trap: no tooltip is rendered on the disabled button at all...
        expect(wrapper.findComponent(VTooltip).exists()).toBe(false);

        // ...instead the explanation is always-visible text, wired to the button through
        // `aria-describedby` so it's reachable without the disabled control ever needing focus.
        const describedBy = button.attributes("aria-describedby");
        expect(describedBy).toBeTruthy();
        const hint = wrapper.find(`#${describedBy}`);
        expect(hint.exists()).toBe(true);
        expect(hint.text()).toContain("needs the desktop app");

        wrapper.unmount();
    });
});

describe("semantic: file", () => {
    it("shows exactly one browse button, and threads extensions through to the picker", async () => {
        const bridge = fakeBridge();
        const wrapper = mount(PathField, {
            props: {
                modelValue: "",
                field: "the SSH identity file",
                semantic: "file",
                extensions: ["pem"],
                bridge,
            },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(wrapper.findAll("button")).toHaveLength(1);
        await buttonByAria(wrapper, "Browse for the SSH identity file").trigger("click");

        expect(bridge.fileCalls).toEqual([{ title: "Choose the SSH identity file", extensions: ["pem"] }]);
        expect(wrapper.emitted("update:modelValue")).toEqual([["/picked/id_ed25519"]]);

        wrapper.unmount();
    });

    it("omits extensions entirely when none were given, e.g. an SSH identity file with no fixed suffix", async () => {
        const bridge = fakeBridge();
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "the SSH identity file", semantic: "file", bridge },
            global: { plugins: [vuetify, i18n()] },
        });

        await buttonByAria(wrapper, "Browse for the SSH identity file").trigger("click");

        expect(bridge.fileCalls).toEqual([{ title: "Choose the SSH identity file" }]);

        wrapper.unmount();
    });
});

describe("semantic: either", () => {
    it("shows both buttons, each with its own distinguishable name", async () => {
        const bridge = fakeBridge();
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "the Java runtime", semantic: "either", bridge },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(wrapper.findAll("button")).toHaveLength(2);
        const folderButton = buttonByAria(wrapper, "Browse for a folder, for the Java runtime");
        const fileButton = buttonByAria(wrapper, "Browse for a file, for the Java runtime");
        expect(folderButton.attributes("aria-label")).not.toBe(fileButton.attributes("aria-label"));

        await folderButton.trigger("click");
        expect(bridge.folderCalls).toHaveLength(1);
        expect(bridge.fileCalls).toHaveLength(0);

        await fileButton.trigger("click");
        expect(bridge.fileCalls).toHaveLength(1);

        wrapper.unmount();
    });

    it("points both disabled buttons at the same reachable explanation when there is no bridge", () => {
        const wrapper = mount(PathField, {
            props: { modelValue: "", field: "the Java runtime", semantic: "either", bridge: null },
            global: { plugins: [vuetify, i18n()] },
        });

        const folderButton = buttonByAria(wrapper, "Browse for a folder, for the Java runtime");
        const fileButton = buttonByAria(wrapper, "Browse for a file, for the Java runtime");
        expect(folderButton.attributes("disabled")).toBeDefined();
        expect(fileButton.attributes("disabled")).toBeDefined();

        const folderDescribedBy = folderButton.attributes("aria-describedby");
        const fileDescribedBy = fileButton.attributes("aria-describedby");
        expect(folderDescribedBy).toBeTruthy();
        expect(folderDescribedBy).toBe(fileDescribedBy);
        expect(wrapper.find(`#${folderDescribedBy}`).text()).toContain("needs the desktop app");

        wrapper.unmount();
    });
});
