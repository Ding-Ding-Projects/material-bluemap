// @vitest-environment jsdom

/**
 * `MenuSearchList.vue`, mounted.
 *
 * Every bare fixed-item menu this task gave a search field routes through this component,
 * so its own behaviour is proved once here rather than three times over in each host. What
 * is asserted: that a query narrows what is rendered without changing what a row's `id` is,
 * that a disabled row cannot be chosen even when it is still shown, that the empty state is
 * announced (`role="status"`), and that Escape is two separate steps -- clearing the query
 * first, and only reaching the surrounding menu once there is nothing left to clear.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import MenuSearchList, { type MenuSearchItem } from "./MenuSearchList.vue";

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

const ITEMS: MenuSearchItem[] = [
    { id: "markdown", label: "Markdown file" },
    { id: "json", label: "JSON file" },
    { id: "csv", label: "CSV file", disabled: true },
    { id: "text", label: "Plain text file" },
];

function render(items: MenuSearchItem[] = ITEMS): VueWrapper {
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
    return mount(MenuSearchList, {
        props: { items, label: "Export this to a file" },
        global: { plugins: [i18n, createVuetify()] },
        attachTo: document.body,
    });
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

async function type(text: string): Promise<void> {
    const input = wrapper?.find('input[type="text"]');
    await input?.setValue(text);
    await nextTick();
}

describe("the filter", () => {
    it("renders every item when the query is empty", () => {
        wrapper = render();
        const text = wrapper.text();
        expect(text).toContain("Markdown file");
        expect(text).toContain("JSON file");
        expect(text).toContain("CSV file");
        expect(text).toContain("Plain text file");
    });

    it("narrows the list to rows whose label matches, case-insensitively", async () => {
        wrapper = render();
        await type("json");
        const text = wrapper.text();
        expect(text).toContain("JSON file");
        expect(text).not.toContain("Markdown file");
        expect(text).not.toContain("Plain text file");
    });

    it("never changes what a row's id is: choosing a filtered row still emits its real id", async () => {
        wrapper = render();
        await type("plain");
        const item = wrapper.findAll(".v-list-item").find((row) => row.text().includes("Plain text file"));
        await item?.trigger("click");
        expect(wrapper.emitted("choose")?.[0]).toEqual(["text"]);
    });

    it("shows an honest, announced no-match state rather than an empty list", async () => {
        wrapper = render();
        await type("nothing in this list is named that");
        const status = wrapper.find('[role="status"]');
        expect(status.exists()).toBe(true);
        expect(status.text()).toContain("Clearing");
        expect(wrapper.find(".v-list").exists()).toBe(false);
    });

    it("carries the project's own search field, with the regex builder available from it", () => {
        wrapper = render();
        const builder = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label")?.includes("regex builder"));
        expect(builder).toBeDefined();
    });
});

describe("disabled rows", () => {
    it("still shows a disabled row while filtering, but never emits choose for it", async () => {
        wrapper = render();
        await type("csv");
        expect(wrapper.text()).toContain("CSV file");
        const item = wrapper.findAll(".v-list-item").find((row) => row.text().includes("CSV file"));
        await item?.trigger("click");
        expect(wrapper.emitted("choose")).toBeUndefined();
    });
});

describe("Escape, in two steps", () => {
    it("clears the query first, and keeps the list open and unfiltered", async () => {
        wrapper = render();
        await type("json");
        expect(wrapper.text()).not.toContain("Markdown file");

        const input = wrapper.find('input[type="text"]');
        const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
        input.element.dispatchEvent(event);
        await nextTick();

        expect((input.element as HTMLInputElement).value).toBe("");
        expect(wrapper.text()).toContain("Markdown file");
        // Consumed here, not left to reach whatever hosts this list.
        expect(event.defaultPrevented).toBe(true);
    });

    it("leaves a second Escape, with nothing left to clear, alone to reach the host menu", async () => {
        wrapper = render();
        const input = wrapper.find('input[type="text"]');
        expect((input.element as HTMLInputElement).value).toBe("");

        const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
        input.element.dispatchEvent(event);
        await nextTick();

        // Nothing to clear, so this component leaves the event exactly as it found it: not
        // prevented, and free to keep bubbling to the `v-menu` that closes on Escape itself.
        expect(event.defaultPrevented).toBe(false);
    });
});
