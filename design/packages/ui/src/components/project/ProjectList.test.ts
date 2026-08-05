/**
 * @vitest-environment jsdom
 *
 * The projects list, mounted.
 *
 * Four properties are only true of the rendered component and would be asserted against a
 * stand-in for nothing: that a build with no host says what is needed rather than showing an
 * empty list that reads as "you have no projects"; that the listbox is one tab stop with the
 * arrows moving inside it; that choosing rows is what arms the bulk actions and that the
 * two-key gate stands in front of the destructive one; and that the search really filters
 * the rows rather than merely existing beside them.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ProjectList from "./ProjectList.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import type { ProjectRow } from "./projectModel.js";

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

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, messages: {} });
}

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
    return {
        world: "C:/saves/Survival",
        file: "C:/saves/Survival/material-bluemap.project.json",
        id: "p1",
        name: "Survival",
        maps: 3,
        createdAt: "2026-07-01T10:00:00+01:00",
        updatedAt: "2026-08-01T10:00:00+01:00",
        fromWizard: false,
        worldName: "Survival World",
        problem: null,
        ...overrides,
    };
}

const FOUR: ProjectRow[] = [
    row(),
    row({ world: "C:/saves/Creative", id: "p2", name: "Creative", maps: 1, fromWizard: true, worldName: null, updatedAt: "2026-08-02T10:00:00+01:00" }),
    row({ world: "C:/saves/Nether", id: "p3", name: "Nether only", maps: 1, worldName: null, updatedAt: "2026-07-20T10:00:00+01:00" }),
    row({ world: "C:/saves/Old", id: "p4", name: "Old build", maps: 5, worldName: null, updatedAt: "2026-06-01T10:00:00+01:00" }),
];

function list(props: Record<string, unknown> = {}) {
    return mount(ProjectList, {
        props: { rows: FOUR, hostName: "test", canDelete: true, scanned: 12, ...props },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

function options(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

describe("a build that cannot look at a world folder", () => {
    it("says so, rather than showing an empty list that reads as having no projects", () => {
        const wrapper = mount(ProjectList, {
            props: { rows: [], hostName: null, scanned: 0 },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(wrapper.text()).toContain("needs the desktop app");
        wrapper.unmount();
    });

    it("says plainly when it can open projects but not remove one", () => {
        const wrapper = mount(ProjectList, {
            props: { rows: FOUR, hostName: "test", canDelete: false },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(wrapper.text()).toContain("cannot remove a project file");
        wrapper.unmount();
    });
});

describe("the rows", () => {
    it("says the world, the map count and when each was edited", () => {
        const wrapper = list();

        expect(wrapper.text()).toContain("Survival");
        expect(wrapper.text()).toContain("world Survival World");
        expect(wrapper.text()).toContain("3 maps");
        wrapper.unmount();
    });

    it("marks the one the guide made and nobody has edited", () => {
        const wrapper = list();
        expect(wrapper.text()).toContain("from the guide");
        wrapper.unmount();
    });

    it("names how many worlds were looked at when none of them carries a project", () => {
        // "No projects" and "this looked at twelve worlds and none had one" are different
        // sentences, and only the second tells somebody the scan actually happened.
        const wrapper = mount(ProjectList, {
            props: { rows: [], hostName: "test", scanned: 12 },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(wrapper.text()).toContain("12 worlds");
        wrapper.unmount();
    });
});

describe("the listbox", () => {
    it("is one tab stop, with exactly one option carrying it", () => {
        // Thirty projects must not be thirty presses of Tab away from the button after them.
        const wrapper = list();

        const stops = options().filter((option) => option.getAttribute("tabindex") === "0");
        expect(stops).toHaveLength(1);
        wrapper.unmount();
    });

    it("opens a project on Enter rather than on arrowing past it", () => {
        const wrapper = list();

        const first = options()[0];
        first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(wrapper.emitted("open")).toBeUndefined();

        first?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(wrapper.emitted("open")?.[0]).toEqual(["C:/saves/Creative"]);
        wrapper.unmount();
    });

    it("chooses a row with Space, and reports the choice through aria-selected", async () => {
        const wrapper = list();

        const first = options()[0];
        expect(first?.getAttribute("aria-selected")).toBe("false");

        first?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
        await flushPromises();

        expect(options()[0]?.getAttribute("aria-selected")).toBe("true");
        expect(wrapper.text()).toContain("1 selected");
        wrapper.unmount();
    });

    it("announces the whole row, not just its name", async () => {
        // Four rows announced as "Survival" are four rows nobody can choose between.
        const wrapper = list();

        const name = options()[0]?.getAttribute("aria-label") ?? "";
        expect(name).toContain("Creative");
        expect(name).toContain("map");
        wrapper.unmount();
    });
});

describe("choosing several", () => {
    it("selects what is on screen and says how many that is", async () => {
        const wrapper = list();

        await wrapper.find(".mb-projects__bulk button").trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("4 selected");
        wrapper.unmount();
    });

    it("puts the two-key gate in front of removing them", () => {
        // The bulk delete and every row's own delete each get one, and each one names the
        // files it would take before anything happens.
        const wrapper = list();

        const gates = wrapper.findAllComponents(ConfigSuperConfirm);
        expect(gates.length).toBe(FOUR.length + 1);
        expect(gates.some((gate) => String(gate.props("action")).includes("world folders"))).toBe(true);
        wrapper.unmount();
    });

    it("names the world folder and states that the world itself is untouched", () => {
        const wrapper = list();

        const gate = wrapper.findAllComponents(ConfigSuperConfirm)[1];
        const affected = (gate?.props("affected") ?? []) as string[];
        expect(affected.join(" ")).toContain("material-bluemap.project.json");
        expect(affected.join(" ")).toContain("Minecraft world itself is not touched");
        expect(affected.join(" ")).toContain("Tiles that were already rendered stay on the disk");
        wrapper.unmount();
    });
});

describe("the search", () => {
    it("filters the rows and says how many of how many are shown", async () => {
        const wrapper = list();

        await wrapper.find(".mb-config-search input").setValue("nether");
        await flushPromises();

        expect(options()).toHaveLength(1);
        expect(wrapper.text()).toContain("Showing 1 of 4");
        wrapper.unmount();
    });

    it("finds a row by the path of its file, which is not on the visible name", async () => {
        const wrapper = list();

        await wrapper.find(".mb-config-search input").setValue("C:/saves/Old");
        await flushPromises();

        expect(options()).toHaveLength(1);
        wrapper.unmount();
    });

    it("says nothing matched rather than showing an empty list with no explanation", async () => {
        const wrapper = list();

        await wrapper.find(".mb-config-search input").setValue("zzzz");
        await flushPromises();

        expect(wrapper.text()).toContain("Nothing here matches that search");
        wrapper.unmount();
    });
});

describe("rendering one straight from its row", () => {
    it("asks the screen to render that project, without opening it first", () => {
        const wrapper = list();

        const buttons = [...document.querySelectorAll<HTMLElement>("button")].filter((button) =>
            (button.getAttribute("aria-label") ?? "").startsWith("Render Survival"),
        );
        expect(buttons).toHaveLength(1);
        buttons[0]?.click();

        expect(wrapper.emitted("render")?.[0]).toEqual(["C:/saves/Survival"]);
        wrapper.unmount();
    });
});
