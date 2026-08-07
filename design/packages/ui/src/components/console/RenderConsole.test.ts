// @vitest-environment jsdom

/**
 * The console, mounted.
 *
 * The model beside this file proves the arithmetic. What only a mounted test can prove
 * is that the arithmetic reaches the screen: that a level really is written out as text
 * beside its colour, that this app's advice really is rendered next to the engine's line
 * and not instead of it, that the filter and the search really do change what is shown,
 * and that the setting a piece of advice points at really is offered as a control.
 *
 * The i18n here is the real one built the way `i18n.ts` builds it, with no messages
 * loaded, because that is the state a build without translations stays in and the state
 * this console is nearly always rendered in. A fallback that silently ate its `{address}`
 * would pass a stubbed translator and ship a sentence with a hole in it.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RenderConsole from "./RenderConsole.vue";
import { annotationsFor } from "./annotations.js";
import { CONSOLE_LINE_CAP, type ConsoleLine } from "./consoleModel.js";

beforeAll(() => {
    // jsdom has no layout engine. Vuetify's chip group observes its own size and the
    // mount throws before a single assertion runs without this.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    // The console feature-detects this for its reduced-motion check. Answering "no
    // preference" here keeps the test on the same path the majority of users are on.
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

    /*
     * This jsdom is started without a storage file, so `localStorage` is genuinely absent -
     * `CommandPalette.test.ts` hits the same gap and fixes it the same way. The auto-scroll
     * checkbox needs somewhere real for its preference to land and be read back from.
     * `defineProperty` rather than assignment because jsdom declares the property.
     */
    const cells = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => {
                cells.set(key, value);
            },
            removeItem: (key: string) => {
                cells.delete(key);
            },
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

beforeEach(() => {
    localStorage.clear();
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

let nextId = 1;

function engineLine(message: string, level: ConsoleLine["level"] = "info"): ConsoleLine {
    return {
        id: nextId++,
        level,
        origin: "engine",
        message,
        text: null,
        at: "2026-08-04T09:14:07.000Z",
        annotations: annotationsFor(message),
    };
}

function appLine(key: string, fallback: string): ConsoleLine {
    return {
        id: nextId++,
        level: "signal",
        origin: "app",
        message: "",
        text: { key, fallback, values: {} },
        at: "2026-08-04T09:14:07.000Z",
        annotations: [],
    };
}

function render(lines: readonly ConsoleLine[], dropped = 0, options: { attachTo?: HTMLElement } = {}) {
    return mount(RenderConsole, {
        props: { lines, dropped, cap: CONSOLE_LINE_CAP },
        global: { plugins: [vuetify, i18n()] },
        ...(options.attachTo === undefined ? {} : { attachTo: options.attachTo }),
    });
}

/** Sets the three numbers `isAtBottom` reads. jsdom computes no layout, so they are supplied by hand. */
function setScrollMetrics(el: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop: number): void {
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
    el.scrollTop = scrollTop;
}

describe("what the console shows", () => {
    it("prints the engine's line unchanged, with its level written out as text", () => {
        // Colour is never the only signal: a reader who cannot distinguish the colours,
        // and anyone pasting this into a bug report, still gets the level.
        const wrapper = render([engineLine("Address already in use", "error")]);

        expect(wrapper.text()).toContain("Address already in use");
        expect(wrapper.find(".mb-console__tag").text()).toBe("ERROR");
        expect(wrapper.find(".mb-console__line--error").exists()).toBe(true);
        wrapper.unmount();
    });

    it("shows only the time out of the event's instant", () => {
        const wrapper = render([engineLine("Loading resources...")]);

        expect(wrapper.find(".mb-console__clock").text()).toBe("09:14:07");
        wrapper.unmount();
    });

    it("translates this app's own status lines rather than showing their key", () => {
        const wrapper = render([appLine("world.console.signal.running", "Running.")]);

        expect(wrapper.text()).toContain("Running.");
        expect(wrapper.text()).not.toContain("world.console.signal");
        wrapper.unmount();
    });

    it("says the log is empty rather than showing an empty box", () => {
        const wrapper = render([]);

        expect(wrapper.text()).toContain("The engine has not printed anything yet.");
        wrapper.unmount();
    });
});

describe("advice beside the engine's line", () => {
    it("adds this app's guidance without touching what the engine said", () => {
        const wrapper = render([engineLine("Address already in use", "error")]);

        // The engine's sentence is the string somebody pastes into a search engine.
        expect(wrapper.find(".mb-console__text").text()).toBe("Address already in use");
        // And the advice is separate, and marked as this app speaking.
        expect(wrapper.find(".mb-console__advice").exists()).toBe(true);
        expect(wrapper.find(".mb-console__speaker").text()).toBe("Worldlens");
        expect(wrapper.text()).toContain("mod on the Minecraft server");
        wrapper.unmount();
    });

    it("keeps the captured value in the sentence, which the fallback path is where it is lost", () => {
        // vue-i18n compiles the English fallback as a message format, so this is the one
        // path where an interpolated value silently disappears while the sentence still
        // reads like a sentence.
        const wrapper = render([engineLine("WebServer bound to /0.0.0.0:8100")]);

        expect(wrapper.text()).toContain("The web server is up on /0.0.0.0:8100.");
        expect(wrapper.text()).not.toContain("{address}");
        wrapper.unmount();
    });

    it("offers the setting when one would fix it, and emits the anchor it points at", async () => {
        const wrapper = render([engineLine("Start updating 0 maps ...")]);

        const button = wrapper.findAll("button").find((candidate) => candidate.text().includes("Open the setting"));
        expect(button).toBeDefined();
        await button?.trigger("click");

        expect(wrapper.emitted("settings")?.[0]?.[0]).toMatchObject({ anchor: "world-folder" });
        wrapper.unmount();
    });

    it("adds nothing to a line it has nothing to say about", () => {
        const wrapper = render([engineLine("Loading map 'overworld'...")]);

        expect(wrapper.find(".mb-console__advice").exists()).toBe(false);
        wrapper.unmount();
    });
});

describe("narrowing what is shown", () => {
    const lines = [
        engineLine("Loading resources...", "info"),
        engineLine("Address already in use", "error"),
        engineLine("Stopping...", "warning"),
    ];

    it("counts the lines it is showing, so nobody has to count them", () => {
        const wrapper = render(lines);

        expect(wrapper.text()).toContain("Showing all 3 lines.");
        wrapper.unmount();
    });

    it("filters by level, and says how many of each there are", async () => {
        const wrapper = render(lines);

        const chip = wrapper.findAll(".v-chip").find((candidate) => candidate.text().includes("ERROR"));
        await chip?.trigger("click");

        expect(wrapper.text()).toContain("Showing 1 of 3 lines.");
        expect(wrapper.findAll(".mb-console__line")).toHaveLength(1);
        wrapper.unmount();
    });

    it("searches the text of the lines, plain text by default", async () => {
        const wrapper = render(lines);

        await wrapper.find('input[role="searchbox"]').setValue("resources");

        expect(wrapper.findAll(".mb-console__line")).toHaveLength(1);
        expect(wrapper.text()).toContain("Loading resources...");
        wrapper.unmount();
    });

    it("says nothing matched rather than looking like the log was lost", async () => {
        const wrapper = render(lines);

        await wrapper.find('input[role="searchbox"]').setValue("nowhere at all");

        expect(wrapper.text()).toContain("None of the 3 lines match");
        wrapper.unmount();
    });

    it("carries the shared search field, so the anchored regex builder arrives with it", () => {
        // The contract `config/regexPolicy.test.ts` enforces across the package, asserted
        // here as well because this is the surface a reader is on when they need it.
        const wrapper = render(lines);

        expect(wrapper.findAll("button").some((b) => b.text().includes(".*"))).toBe(true);
        wrapper.unmount();
    });
});

describe("the cap", () => {
    it("says every line is here when nothing has been dropped", () => {
        const wrapper = render([engineLine("Loading resources...")]);

        expect(wrapper.text()).toContain("Every line is here.");
        wrapper.unmount();
    });

    it("says how many lines it has already dropped, rather than looking complete", () => {
        // A ring that quietly forgets its own beginning is indistinguishable from a
        // complete log, which is the worse of the two failures.
        const wrapper = render([engineLine("Loading resources...")], 118);

        expect(wrapper.text()).toContain("118 earlier lines from this render have been dropped.");
        wrapper.unmount();
    });
});

describe("the scrolling region", () => {
    it("is a log region that can be reached and read with the keyboard", () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const scroller = wrapper.find(".mb-console__scroll");

        expect(scroller.attributes("role")).toBe("log");
        expect(scroller.attributes("tabindex")).toBe("0");
        expect(scroller.attributes("aria-label")).toBeTruthy();
        wrapper.unmount();
    });

    it("offers no jump control while the view is riding the bottom", () => {
        // A permanent button would be a button that does nothing for the whole of a
        // render somebody is watching from the bottom.
        const wrapper = render([engineLine("Loading resources...")]);

        expect(wrapper.find(".mb-console__jump").exists()).toBe(false);
        wrapper.unmount();
    });

    it("offers one the moment somebody scrolls away from it", async () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;

        // jsdom computes no layout, so the three numbers the rule reads are supplied
        // directly. They are the only three it reads.
        Object.defineProperty(element, "scrollHeight", { value: 1000, configurable: true });
        Object.defineProperty(element, "clientHeight", { value: 400, configurable: true });
        element.scrollTop = 100;
        await scroller.trigger("scroll");

        expect(wrapper.find(".mb-console__jump").exists()).toBe(true);
        wrapper.unmount();
    });
});

describe("the auto-scroll checkbox", () => {
    it("is on by default, with a real accessible name", () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const checkbox = wrapper.find('[data-test="console-autoscroll"] input[type="checkbox"]');

        expect(checkbox.exists()).toBe(true);
        expect((checkbox.element as HTMLInputElement).checked).toBe(true);
        expect(checkbox.attributes("aria-label")).toBe("Follow new lines");
        wrapper.unmount();
    });

    it("follows new output while checked", async () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 600); // already at the bottom

        setScrollMetrics(element, 1400, 400, 600); // more content is about to arrive
        await wrapper.setProps({ lines: [engineLine("Loading resources..."), engineLine("Stopping...")] });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(element.scrollTop).toBe(1400);
        wrapper.unmount();
    });

    it("does not move the view once unchecked", async () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const checkbox = wrapper.find('[data-test="console-autoscroll"] input[type="checkbox"]');
        await checkbox.setValue(false);

        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 600);
        setScrollMetrics(element, 1400, 400, 600);
        await wrapper.setProps({ lines: [engineLine("Loading resources..."), engineLine("Stopping...")] });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(element.scrollTop).toBe(600);
        wrapper.unmount();
    });

    it("scrolling away pauses following without unticking the checkbox", async () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 100); // scrolled well away from the bottom
        await scroller.trigger("scroll");

        expect(wrapper.find(".mb-console__jump").exists()).toBe(true);
        const checkbox = wrapper.find('[data-test="console-autoscroll"] input[type="checkbox"]');
        expect((checkbox.element as HTMLInputElement).checked).toBe(true);
        wrapper.unmount();
    });

    it("resumes, and the jump control disappears, once the reader scrolls back to the bottom", async () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 100);
        await scroller.trigger("scroll");
        expect(wrapper.find(".mb-console__jump").exists()).toBe(true);

        setScrollMetrics(element, 1000, 400, 600); // back at the bottom, by hand
        await scroller.trigger("scroll");

        expect(wrapper.find(".mb-console__jump").exists()).toBe(false);
        wrapper.unmount();
    });

    it("the jump control itself scrolls to the newest line and clears the pause", async () => {
        const wrapper = render([engineLine("Loading resources...")]);
        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 100);
        await scroller.trigger("scroll");

        await wrapper.find(".mb-console__jump").trigger("click");

        expect(element.scrollTop).toBe(1000);
        expect(wrapper.find(".mb-console__jump").exists()).toBe(false);
        wrapper.unmount();
    });

    it("does not scroll away from an active text selection inside the console", async () => {
        // The same line object, not a freshly built one, so its `id` - and therefore its
        // DOM node under `v-for`'s `:key` - survives the props update below. A selection
        // anchored on a node that gets replaced would prove nothing about the guard.
        const firstLine = engineLine("Loading resources...");
        const wrapper = render([firstLine]);
        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 600);

        const line = wrapper.find(".mb-console__text").element;
        const spy = vi
            .spyOn(document, "getSelection")
            .mockReturnValue({ isCollapsed: false, anchorNode: line } as unknown as Selection);

        setScrollMetrics(element, 1400, 400, 600);
        await wrapper.setProps({ lines: [firstLine, engineLine("Stopping...")] });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(element.scrollTop).toBe(600); // untouched
        spy.mockRestore();
        wrapper.unmount();
    });

    it("does not move keyboard focus when it follows new output", async () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const wrapper = render([engineLine("Loading resources...")], 0, { attachTo: host });

        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        expect(document.activeElement).toBe(input);

        const scroller = wrapper.find(".mb-console__scroll");
        const element = scroller.element as HTMLElement;
        setScrollMetrics(element, 1000, 400, 600);
        setScrollMetrics(element, 1400, 400, 600);
        await wrapper.setProps({ lines: [engineLine("Loading resources..."), engineLine("Stopping...")] });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(document.activeElement).toBe(input);
        wrapper.unmount();
        host.remove();
        input.remove();
    });

    it("remembers the preference across a fresh mount", async () => {
        const first = render([engineLine("Loading resources...")]);
        const checkbox = first.find('[data-test="console-autoscroll"] input[type="checkbox"]');
        await checkbox.setValue(false);
        first.unmount();

        const second = render([engineLine("Loading resources...")]);
        const secondCheckbox = second.find('[data-test="console-autoscroll"] input[type="checkbox"]');
        expect((secondCheckbox.element as HTMLInputElement).checked).toBe(false);
        second.unmount();
    });
});
