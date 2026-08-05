/**
 * @vitest-environment jsdom
 *
 * The project editor, mounted.
 *
 * This is the surface the whole feature exists for - every setting a render will use, set
 * before the render starts - so the assertions are about the claims a screenshot could not
 * check: that the ninety-odd map settings really are on screen rather than merely reachable
 * in the bundle, that the map id is previewed *while* a name is typed rather than after,
 * that a rename onto a taken id is refused on the field, and that a project with nothing to
 * render says why instead of offering a button that would draw nothing.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { ProjectFile } from "@material-bluemap/config";
import ProjectEditor from "./ProjectEditor.vue";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ProjectMapsPanel from "./ProjectMapsPanel.vue";
import { createProject, withMapAdded, withRender } from "./projectModel.js";

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

/*
 * `ProjectEditor` now carries its own `TabbedNavigation`, which persists which tab is
 * active under `material-bluemap-project-editor-tabs`. Node's own experimental
 * `localStorage` (the thing that warns about `--localstorage-file` above every run in
 * this workspace) is a real, working store rather than jsdom's usual absent one, and it
 * is not reset between test cases in this file. Left alone, the "Core" tab a test three
 * cases ago clicked stays the active tab for every editor mounted after it - a real
 * behaviour for a real restart, and a false cross-test dependency here. Clearing this
 * one key before each test is what keeps every test's "the maps tab is open" assumption
 * true regardless of run order, without reaching for a fake store the way
 * `TabbedNavigation.test.ts` does.
 */
beforeEach(() => {
    try {
        globalThis.localStorage?.removeItem("material-bluemap-project-editor-tabs");
    } catch {
        // No real store in this run - nothing to clear, and nothing that would have leaked.
    }
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, messages: {} });
}

const STAMP = { now: "2026-08-04T09:00:00+01:00", id: "p1", appVersion: null };
const WORLD = "C:/saves/Survival";

function seeded(): ProjectFile {
    return withMapAdded(createProject("Survival", STAMP), {
        id: "overworld",
        name: "Overworld",
        dimension: "minecraft:overworld",
        world: WORLD,
    });
}

/**
 * The editor, wired to a caller that keeps the project like the real screen does.
 *
 * The editor never mutates the project it is given; it emits a new one. Holding it here is
 * what makes an assertion about the *next* render true rather than an assertion about an
 * event nobody applied.
 */
async function editor(project: ProjectFile = seeded(), extra: Record<string, unknown> = {}): Promise<VueWrapper> {
    const wrapper = mount(ProjectEditor, {
        props: {
            project,
            world: WORLD,
            canRender: true,
            ...extra,
            "onUpdate:project": async (value: ProjectFile) => {
                await wrapper.setProps({ project: value });
            },
        },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    }) as VueWrapper;
    // The tab panels register with their strip on mount, so the first one has not painted
    // until the tick after. Asserting before that reads as an editor with no content in it.
    await flushPromises();
    return wrapper;
}

/**
 * A button by its visible text, inside one root.
 *
 * Scoped rather than global on purpose: Vuetify keeps its overlay container attached to the
 * document between mounts, so a search across the whole body can find a button belonging to
 * a wrapper the previous case unmounted.
 */
function buttonIn(root: ParentNode, text: string): HTMLButtonElement | undefined {
    return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
        (button.textContent ?? "").includes(text),
    );
}

function buttonNamed(wrapper: VueWrapper, text: string): HTMLButtonElement | undefined {
    return buttonIn(wrapper.element as unknown as ParentNode, text);
}

/**
 * The add-a-map form, which opens in place rather than as a dialog.
 *
 * Deliberately not a `v-dialog`: it is a form to complete or cancel, not a decision the
 * rest of the application has to be stopped for, so it stays inside the component tree and
 * these helpers can reach it without going hunting in a teleported overlay.
 */
function createForm(wrapper: VueWrapper): ParentNode {
    const form = (wrapper.element as unknown as ParentNode).querySelector(".mb-project-maps__create");
    if (form === null) throw new Error("the add-a-map form is not open");
    return form;
}

function createInputs(wrapper: VueWrapper): HTMLInputElement[] {
    return [...createForm(wrapper).querySelectorAll<HTMLInputElement>("input")];
}

describe("every map setting, before the render starts", () => {
    it("renders the map's whole config through the same form the options editor uses", async () => {
        // Not a hand-written subset: the groups, the controls, the documentation and the
        // defaults all come from the schema, so a setting added tomorrow appears with no
        // change to the editor.
        const wrapper = await editor();

        const form = wrapper.findComponent(ConfigFileForm);
        expect(form.exists()).toBe(true);

        const paths = form.props("file").descriptor.fields.map((field) => field.path);
        expect(paths.length).toBeGreaterThan(25);
        // A few by name, because a count alone would still pass if the form were handed the
        // wrong file entirely.
        expect(paths).toContain("sky-color");
        expect(paths).toContain("remove-caves-below-y");
        expect(paths).toContain("marker-sets");
        wrapper.unmount();
    });

    it("shows the map's identity above it, including which storage its tiles go into", async () => {
        const wrapper = await editor();

        expect(wrapper.text()).toContain("Map id");
        expect(wrapper.text()).toContain("Storage the tiles go into");
        expect(wrapper.text()).toContain("Dimension");
        wrapper.unmount();
    });

    it("has a tab for each of the four whole-file settings, saying what absent means", async () => {
        const wrapper = await editor();

        expect(wrapper.text()).toContain("Web server");
        await wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("Core"))?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("carries no core.conf of its own");
        wrapper.unmount();
    });
});

describe("the live map id preview", () => {
    it("shows what the name becomes while it is still being typed", async () => {
        const wrapper = await editor();

        buttonNamed(wrapper, "Add a map")?.click();
        await flushPromises();

        const name = createInputs(wrapper)[0];
        expect(name).toBeDefined();

        name!.value = "My World!";
        name!.dispatchEvent(new Event("input"));
        await flushPromises();

        // The id becomes a folder on disk and a segment of the URL a tile is served from,
        // so meeting it for the first time in a path three screens later is the failure.
        expect(createForm(wrapper).textContent).toContain("my-world-");
        wrapper.unmount();
    });

    it("refuses an id the render engine would refuse, on the field that asked for it", async () => {
        const wrapper = await editor();

        buttonNamed(wrapper, "Add a map")?.click();
        await flushPromises();

        const inputs = createInputs(wrapper);
        inputs[0]!.value = "!!!";
        inputs[0]!.dispatchEvent(new Event("input"));
        await flushPromises();

        expect(createForm(wrapper).textContent).toContain("has to start with a letter or a digit");
        wrapper.unmount();
    });

    it("previews a rename of the map that is open, and refuses one onto a taken id", async () => {
        let project = seeded();
        project = withMapAdded(project, { id: "nether", name: "The Nether", dimension: "minecraft:the_nether", world: WORLD });
        const wrapper = await editor(project);

        const idField = wrapper
            .findAll("input")
            .find((input) => (input.element as HTMLInputElement).value === "overworld");
        expect(idField).toBeDefined();

        await idField!.setValue("Nether");
        await flushPromises();

        expect(wrapper.text()).toContain("Becomes the folder and the address segment nether");
        // BlueMap refuses to start when two maps share an id, because they would write into
        // the same folder, so this is a real failure rather than a tidiness rule.
        expect(wrapper.text()).toContain("already has a map called nether");
        wrapper.unmount();
    });
});

describe("adding and removing maps", () => {
    it("adds one written from BlueMap's own template", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        buttonNamed(wrapper, "Add a map")?.click();
        await flushPromises();

        const inputs = createInputs(wrapper);
        inputs[0]!.value = "Overworld";
        inputs[0]!.dispatchEvent(new Event("input"));
        await flushPromises();

        buttonIn(createForm(wrapper), "Add the map")?.click();
        await flushPromises();

        // `props()` whole rather than `props("project")`: the wrapper is not generic over
        // the component here, so the single-key overload narrows its argument to `never`.
        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.maps.map((map) => map.id)).toEqual(["overworld"]);
        expect(project.maps[0]?.config).toContain("sky-color");
        wrapper.unmount();
    });

    it("puts the two-key gate in front of removing one, naming the tiles it will not delete", async () => {
        const wrapper = await editor();

        // Scoped to the maps panel on purpose: the tab strip above it carries its own
        // `ConfigSuperConfirm` for the bulk-close gate, and a bare `findComponent` by
        // name returns whichever of the two the tree happens to render first.
        const gate = wrapper.findComponent(ProjectMapsPanel).findComponent({ name: "ConfigSuperConfirm" });
        expect(gate.exists()).toBe(true);
        expect((gate.props("affected") as string[]).join(" ")).toContain("are NOT deleted");
        wrapper.unmount();
    });
});

describe("starting the render", () => {
    it("says why it cannot rather than offering a button that would draw nothing", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        expect(wrapper.text()).toContain("no maps yet");
        expect(buttonNamed(wrapper, "Render this project")?.disabled).toBe(true);
        wrapper.unmount();
    });

    it("offers it once there is a map, and counts the ones that will actually be drawn", async () => {
        const wrapper = await editor();

        expect(buttonNamed(wrapper, "Render this project (1 maps)")).toBeDefined();
        expect(buttonNamed(wrapper, "Render this project (1 maps)")?.disabled).toBe(false);
        wrapper.unmount();
    });

    it("emits the render rather than starting one itself", async () => {
        const wrapper = await editor();

        buttonNamed(wrapper, "Render this project (1 maps)")?.click();
        await flushPromises();

        expect(wrapper.emitted("render")).toHaveLength(1);
        wrapper.unmount();
    });

    it("says plainly when this build cannot render at all, without hiding the settings", async () => {
        const wrapper = await editor(seeded(), { canRender: false });

        expect(wrapper.text()).toContain("cannot render locally");
        expect(wrapper.findComponent(ConfigFileForm).exists()).toBe(true);
        wrapper.unmount();
    });
});

describe("saving", () => {
    it("offers Save only once something has changed", async () => {
        const clean = await editor(seeded(), { dirty: false });
        expect(buttonNamed(clean, "Save the project")?.disabled).toBe(true);
        clean.unmount();

        const changed = await editor(seeded(), { dirty: true });
        await flushPromises();
        expect(buttonNamed(changed, "Save the project")?.disabled).toBe(false);
        expect(changed.text()).toContain("unsaved changes");
        changed.unmount();
    });

    it("shows whatever the save refused with, verbatim", async () => {
        const wrapper = await editor(seeded(), { saveFailure: "the world folder is read-only" });

        expect(wrapper.text()).toContain("the world folder is read-only");
        wrapper.unmount();
    });
});

describe("the guided empty state", () => {
    it("offers preset cards alongside Add a map, only when there truly are no maps yet", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        expect(wrapper.text()).toContain("Or start from a preset");
        expect(wrapper.text()).toContain("Start from BlueMap's defaults");
        expect(wrapper.text()).toContain("Overworld, Nether and End");
        const applyButtons = [...wrapper.element.querySelectorAll("button")].filter((button) =>
            (button.textContent ?? "").includes("Use this preset"),
        );
        expect(applyButtons).toHaveLength(4);
        wrapper.unmount();
    });

    it("does not show preset cards once the project already has a map", async () => {
        const wrapper = await editor(seeded());

        expect(wrapper.text()).not.toContain("Or start from a preset");
        wrapper.unmount();
    });

    it("applying a preset creates its maps, which stay fully editable afterwards", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        // PROJECT_PRESETS lists "Overworld, Nether and End" second, right after the single
        // "Start from BlueMap's defaults" card.
        const applyButtons = [...wrapper.element.querySelectorAll("button")].filter((button) =>
            (button.textContent ?? "").includes("Use this preset"),
        );
        applyButtons[1]!.click();
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.maps.map((map) => map.id).sort()).toEqual(["end", "nether", "overworld"]);
        // Written from BlueMap's own per-dimension templates, exactly like "Add a map" does.
        expect(project.maps.find((map) => map.id === "nether")?.config).toContain("sky-color");
        expect(project.storages.map((storage) => storage.id)).toEqual(["file"]);

        // Fully editable afterwards: the overworld map (selected first) can be renamed
        // through the ordinary identity field, exactly as a hand-added map could be.
        const nameField = wrapper.findAll("input").find((input) => (input.element as HTMLInputElement).value === "Overworld");
        expect(nameField).toBeDefined();
        await nameField!.setValue("My Overworld");
        await flushPromises();

        const after = (wrapper.props() as { project: ProjectFile }).project;
        expect(after.maps.find((map) => map.id === "overworld")?.name).toBe("My Overworld");
        wrapper.unmount();
    });
});

describe("a render option's own default indicator", () => {
    it("says a value already matches BlueMap's default, with no reset button, until something changes it", async () => {
        const wrapper = await editor();

        await wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("How it renders"))?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("This already matches BlueMap's own default.");
        expect(buttonNamed(wrapper, "Reset to BlueMap's default")).toBeUndefined();
        wrapper.unmount();
    });

    it("shows what it was set to, and a working reset back to BlueMap's default, once changed", async () => {
        const wrapper = await editor(withRender(seeded(), { force: true }));

        await wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("How it renders"))?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("Set to on. BlueMap's default is off.");
        const reset = buttonNamed(wrapper, "Reset to BlueMap's default");
        expect(reset).toBeDefined();

        reset!.click();
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.render.force).toBe(false);
        expect(wrapper.text()).not.toContain("Reset to BlueMap's default");
        wrapper.unmount();
    });
});

describe("the render output folder", () => {
    it("carries the shared browse affordance rather than a plain text box", async () => {
        const wrapper = await editor();

        await wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("How it renders"))?.trigger("click");
        await flushPromises();

        const browse = wrapper
            .findAll("button")
            .find((candidate) => candidate.attributes("aria-label") === "Browse for the render output folder");
        expect(browse).toBeDefined();
        expect(wrapper.find(".mb-path-field input").exists()).toBe(true);
        wrapper.unmount();
    });

    it("writes a typed path through the same event a pick would", async () => {
        const wrapper = await editor();

        await wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("How it renders"))?.trigger("click");
        await flushPromises();

        await wrapper.find(".mb-path-field input").setValue("D:/rendered/out");
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.render.outputFolder).toBe("D:/rendered/out");
        wrapper.unmount();
    });
});

describe("the render tab", () => {
    it("carries its own search, because a small surface is not an exempt one", async () => {
        const wrapper = await editor();

        await wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("How it renders"))?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("Render threads");
        expect(wrapper.text()).toContain("Redraw the edges too");

        const search = wrapper
            .findAll(".mb-config-search input")
            .at(-1);
        await search?.setValue("threads");
        await flushPromises();

        expect(wrapper.text()).toContain("Render threads");
        expect(wrapper.text()).not.toContain("Redraw the edges too");
        wrapper.unmount();
    });
});
