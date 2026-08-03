// @vitest-environment jsdom

/**
 * The values inside the config screens' messages, mounted.
 *
 * Every message here names something the user has to act on: the map file a rename would
 * collide with, the path a delete gate is about to remove, the storages a map may point
 * at, the row a screen reader is about to activate. None of that is checkable from the
 * pure-function tests next door, because the substitution happens inside vue-i18n at
 * render time — a screen can pass every logic test in this directory and still render
 * "There is already a maps/.conf", which names no file and tells the user nothing.
 *
 * So these assertions are deliberately about the *value*, not the wording: each one names
 * the id, path or count that has to survive into the sentence.
 */

import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, type Plugin, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { generateConfigSet, renderPluginTemplate, type ListControl } from "@material-bluemap/config";
import MapsScreen from "./MapsScreen.vue";
import StoragesScreen from "./StoragesScreen.vue";
import ConfigListField from "./ConfigListField.vue";
import ConfigFileForm from "./ConfigFileForm.vue";
import ConfigSuperConfirm from "./ConfigSuperConfirm.vue";
import { addStorage, loadWorkspace, type ConfigWorkspace } from "./configWorkspace.js";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size and media observers are absent and
    // the mount throws before any assertion runs. Same shims as `AppSettings.test.ts`.
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

const OPTIONS = {
    webroot: "/srv/bluemap/web",
    dataFolder: "/srv/bluemap/data",
    world: "/srv/minecraft/world",
    version: "5.22",
};

/** A folder as it would look after the CLI had generated and written it once. */
function savedWorkspace(): ConfigWorkspace {
    const files = [...generateConfigSet(OPTIONS), { path: "plugin.conf", text: renderPluginTemplate() }];
    return loadWorkspace("/srv/bluemap/config", files);
}

const vuetify = createVuetify();

/**
 * Built exactly as `src/i18n.ts` builds the app's: no messages at all.
 *
 * That is not an artificial worst case, it is the state the app is actually in until a
 * locale finishes loading, and it is the state every one of these screens renders in on
 * the first frame. The `locale` test at the bottom covers the other half.
 */
function emptyI18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
}

let wrapper: VueWrapper<unknown> | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

/**
 * Mounts a screen inside a Vuetify app, which is what its overlays need to exist.
 *
 * `i18n` is typed as a plain Vue plugin rather than inferred from `emptyI18n()`: the
 * inferred type carries the message tree's own shape, so a caller passing an i18n with
 * different messages — which is the entire point of the loaded-locale test — is rejected.
 */
function mountIn(component: unknown, props: Record<string, unknown>, i18n: Plugin = emptyI18n()): VueWrapper<unknown> {
    const Host = defineComponent({
        props: { inner: { type: Object as PropType<Record<string, unknown>>, required: true } },
        setup(hostProps) {
            return () => h(VApp, null, { default: () => [h(component as never, hostProps.inner)] });
        },
    });

    wrapper = mount(Host, {
        props: { inner: props },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<unknown>;
    return wrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

describe("the maps screen names what it is talking about", () => {
    it("names the storages a map can point at, rather than 'Storages available: '", async () => {
        const host = mountIn(MapsScreen, { workspace: savedWorkspace(), selectedKey: "map:overworld", highlightPath: null });
        await settle();

        const text = host.find(".mb-config-maps__storages").text();
        expect(text).toContain("file");
        expect(text).toContain("sql");
    });

    it("names the map id in the editor subtitle", async () => {
        const host = mountIn(MapsScreen, { workspace: savedWorkspace(), selectedKey: "map:nether", highlightPath: null });
        await settle();

        expect(host.findComponent(ConfigFileForm).props("subtitle")).toContain("nether");
    });

    it("names the file and the map id in the delete gate, which is the whole point of the gate", async () => {
        const host = mountIn(MapsScreen, { workspace: savedWorkspace(), selectedKey: "map:nether", highlightPath: null });
        await settle();

        const gate = host.findComponent(ConfigSuperConfirm);
        expect(gate.props("action")).toContain("maps/nether.conf");

        const affected = gate.props("affected") as readonly string[];
        expect(affected.some((line) => line.includes("maps/nether.conf"))).toBe(true);
        expect(affected.some((line) => line.includes("nether"))).toBe(true);
        // The storage the tiles were written to is named, so somebody can go and reclaim
        // the space the message says is not reclaimed for them.
        expect(affected.some((line) => line.includes("file"))).toBe(true);
    });

    it("counts the matches in the search summary instead of ' of  maps match.'", async () => {
        const host = mountIn(MapsScreen, { workspace: savedWorkspace(), selectedKey: "map:overworld", highlightPath: null });
        await settle();

        const field = host.find(".mb-config-maps .mb-config-search input");
        await field.setValue("nether");
        await settle();

        const summary = host.find(".mb-config-maps aside").text();
        expect(summary).toContain("1 of 3 maps match.");
    });
});

describe("the storages screen names what it is talking about", () => {
    it("names the storage id in the editor subtitle", async () => {
        const host = mountIn(StoragesScreen, { workspace: savedWorkspace(), selectedKey: "storage:sql", highlightPath: null });
        await settle();

        expect(host.findComponent(ConfigFileForm).props("subtitle")).toContain("sql");
    });

    it("names the file the delete gate is about to remove", async () => {
        const host = mountIn(StoragesScreen, { workspace: savedWorkspace(), selectedKey: "storage:file", highlightPath: null });
        await settle();

        expect(host.findComponent(ConfigSuperConfirm).props("action")).toContain("storages/file.conf");
        const affected = host.findComponent(ConfigSuperConfirm).props("affected") as readonly string[];
        expect(affected.some((line) => line.includes("storages/file.conf"))).toBe(true);
    });

    it("names the maps that break, which is what makes deleting a storage consequential", async () => {
        const host = mountIn(StoragesScreen, { workspace: savedWorkspace(), selectedKey: "storage:file", highlightPath: null });
        await settle();

        const affected = host.findComponent(ConfigSuperConfirm).props("affected") as readonly string[];
        const breaks = affected.find((line) => line.includes("stop loading"));
        expect(breaks).toBeDefined();
        for (const map of ["overworld", "nether", "end"]) expect(breaks).toContain(map);

        // And the same list on the chip in the toolbar. The maps arrive in the workspace's
        // own order rather than the one they were written in, so assert on the names.
        const chip = host.find(".mb-config-storages__actions").text();
        expect(chip).toContain("Used by ");
        for (const map of ["overworld", "nether", "end"]) expect(chip).toContain(map);
    });
});

describe("a value containing regex substitution syntax", () => {
    /**
     * `String.prototype.replace` reads `$&`, `` $` `` and `$1` in its *replacement* as
     * substitution patterns, so a path containing one used to be mangled on top of being
     * dropped. Named arguments are not a replacement string, so nothing is interpreted.
     */
    it("survives verbatim, dollars and all", async () => {
        const workspace = addStorage(savedWorkspace(), "odd$&name", "file", "/mnt/tiles");
        const host = mountIn(StoragesScreen, { workspace, selectedKey: "storage:odd$&name", highlightPath: null });
        await settle();

        expect(host.findComponent(ConfigSuperConfirm).props("action")).toContain("storages/odd$&name.conf");
    });
});

describe("the list field's accessible names", () => {
    const control: ListControl = {
        kind: "list",
        item: { kind: "text", multiline: false, placeholder: "" },
        itemLabel: "Script",
        unique: false,
    } as ListControl;

    it("names the row each icon button acts on, so the three rows are distinguishable", async () => {
        const host = mountIn(ConfigListField, {
            control,
            modelValue: ["one.js", "two.js", "three.js"],
            label: "Scripts",
        });
        await settle();

        const labels = host.findAll(".mb-config-list__actions button").map((button) => button.attributes("aria-label"));

        expect(labels).toContain("Move Script 2 up");
        expect(labels).toContain("Move Script 2 down");
        // Remove prefers the value itself, which is more use than an ordinal.
        expect(labels).toContain("Remove two.js");
        // Nothing is left nameless, which is what the broken form produced for every row.
        expect(labels.every((label) => label !== undefined && label.trim() !== "")).toBe(true);
    });

    it("names the item kind on the add button", async () => {
        const host = mountIn(ConfigListField, { control, modelValue: [], label: "Scripts" });
        await settle();

        expect(host.text()).toContain("Add script");
    });
});

describe("with a locale actually loaded", () => {
    /**
     * Not a fallback-only bug. vue-i18n compiles the *loaded* message too, so a translated
     * BlueMap would have lost the value in exactly the same place — this pins that the fix
     * is in the call shape rather than in the absence of translations.
     */
    it("substitutes into the translated message, not the fallback", async () => {
        const i18n = createI18n({
            legacy: false,
            locale: "en",
            fallbackLocale: "en",
            silentFallbackWarn: true,
            missingWarn: false,
            fallbackWarn: false,
            messages: { en: { config: { storages: { subtitle: "Storage id: {id}" } } } },
        });

        const host = mountIn(
            StoragesScreen,
            { workspace: savedWorkspace(), selectedKey: "storage:sql", highlightPath: null },
            i18n,
        );
        await settle();

        expect(host.findComponent(ConfigFileForm).props("subtitle")).toBe("Storage id: sql");
    });
});
