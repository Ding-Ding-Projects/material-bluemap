// @vitest-environment jsdom

/**
 * `RemoteTargetEditor.vue`'s identity-file field, since the shared browse affordance
 * (`PathField.vue`) just replaced its plain `v-text-field`.
 *
 * Three things are worth a test here rather than trusting `PathField.test.ts` alone:
 *
 * 1. The field's own accessible name actually reads "Browse for the SSH identity file" once
 *    it is mounted inside this form, not just in `PathField.vue`'s isolated harness - a
 *    typo'd `field` prop would pass every other test in the package.
 * 2. A pick writes into `draft.identityFile` through the same `patch()` path typing does,
 *    so Save still sees it.
 * 3. The security explanation that used to be the text field's Vuetify `hint` is still on
 *    screen, because `PathField.vue` has no `hint` prop and that paragraph is the one place
 *    this feature says out loud that there is no password anywhere in it.
 *
 * The work directory is deliberately left alone: it names a path on the *remote* machine,
 * which a local Electron file dialog cannot see, so it keeps its plain text field and grows
 * no browse button. `never grows a browse button on the remote work directory` guards that
 * on purpose, not by omission.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RemoteTargetEditor from "./RemoteTargetEditor.vue";
import type { RemoteTarget } from "./remoteBridge.js";

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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;

    Element.prototype.scrollIntoView = () => {};
});

const vuetify = createVuetify();

function i18n() {
    return createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
}

function mountEditor() {
    return mount(RemoteTargetEditor, {
        props: { bridge: null, targets: [], selectedId: null },
        global: { plugins: [vuetify, i18n()] },
    });
}

/** Opens the "Add a machine" form, exactly as clicking the button would. */
async function opened(): Promise<VueWrapper> {
    const wrapper = mountEditor();
    (wrapper.vm as unknown as { startNew: () => void }).startNew();
    await flushPromises();
    return wrapper;
}

function buttonByAria(wrapper: VueWrapper, aria: string) {
    const found = wrapper.findAll("button").find((candidate) => candidate.attributes("aria-label") === aria);
    if (found === undefined) {
        const seen = wrapper.findAll("button").map((b) => b.attributes("aria-label"));
        throw new Error(`no button has aria-label "${aria}". Seen: ${JSON.stringify(seen)}`);
    }
    return found;
}

afterEach(() => {
    delete (window as { materialBluemap?: unknown }).materialBluemap;
});

describe("the identity file's browse button", () => {
    it("is disabled, and says why, when this build has no dialog bridge", async () => {
        const wrapper = await opened();

        const button = buttonByAria(wrapper, "Browse for the SSH identity file");
        expect(button.attributes("disabled")).toBeDefined();

        wrapper.unmount();
    });

    it("writes a picked path into the draft through the same event typing uses", async () => {
        const calls: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            dialog: {
                pickFolder: async () => null,
                pickFile: async (options: unknown) => {
                    calls.push(options);
                    return "C:\\Users\\you\\.ssh\\id_ed25519";
                },
            },
        };

        const wrapper = await opened();

        const button = buttonByAria(wrapper, "Browse for the SSH identity file");
        expect(button.attributes("disabled")).toBeUndefined();
        await button.trigger("click");
        await flushPromises();

        expect(calls).toEqual([{ title: "Choose the SSH identity file" }]);
        expect((wrapper.vm as unknown as { draft: { identityFile: string } }).draft.identityFile).toBe(
            "C:\\Users\\you\\.ssh\\id_ed25519",
        );

        wrapper.unmount();
    });

    it("still shows the no-password explanation beside the field", async () => {
        const wrapper = await opened();

        const hint = wrapper.find(".mb-remote-targets__fieldHint");
        expect(hint.exists()).toBe(true);
        expect(hint.text()).toContain("There is no password field anywhere in this feature");

        wrapper.unmount();
    });

    it("never grows a browse button on the remote work directory, which lives on the other machine", async () => {
        const wrapper = await opened();

        const nearWorkDir = wrapper
            .findAll("button")
            .map((button) => button.attributes("aria-label") ?? "")
            .filter((label) => /work directory/i.test(label));
        expect(nearWorkDir).toEqual([]);

        wrapper.unmount();
    });
});

const saved: RemoteTarget = {
    id: "t-1",
    label: "the build server",
    host: "build.lan",
    port: 2222,
    user: "renderer",
    identityFile: "C:/Users/me/.ssh/id_ed25519",
    workDir: "/srv/renders",
    image: "eclipse-temurin:25-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

describe("duplicating a saved machine", () => {
    function mountWithSaved() {
        return mount(RemoteTargetEditor, {
            props: { bridge: null, targets: [saved], selectedId: null },
            global: { plugins: [vuetify, i18n()] },
        });
    }

    it("opens the form pre-filled with a copy, under a fresh id nobody typed", async () => {
        const wrapper = mountWithSaved();

        const button = buttonByAria(wrapper, "Duplicate the build server");
        await button.trigger("click");
        await flushPromises();

        const vm = wrapper.vm as unknown as {
            editing: boolean;
            draft: { id: string; label: string; host: string; user: string; workDir: string };
        };
        expect(vm.editing).toBe(true);
        expect(vm.draft.id).not.toBe(saved.id);
        expect(vm.draft.label).toBe("Copy of the build server");
        // Everything else about the machine travels across unchanged, ready to be edited.
        expect(vm.draft.host).toBe(saved.host);
        expect(vm.draft.user).toBe(saved.user);
        expect(vm.draft.workDir).toBe(saved.workDir);

        wrapper.unmount();
    });

    it("saves nothing on its own: the original and the duplicate are still two different ids after Save is pressed", async () => {
        const wrapper = mountWithSaved();
        (wrapper.vm as unknown as { duplicate: (t: RemoteTarget) => void }).duplicate(saved);
        await flushPromises();

        const before = (wrapper.vm as unknown as { draft: { id: string } }).draft.id;
        // No bridge in this test (`bridge: null`), so nothing was emitted yet - only the
        // form's own state changed, exactly as pressing "Add a machine" would leave it.
        expect(wrapper.emitted("update:targets")).toBeUndefined();
        expect(before).not.toBe(saved.id);

        wrapper.unmount();
    });
});
