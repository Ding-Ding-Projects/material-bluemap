// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { Menu } from "./Menu.js";

describe("Menu", () => {
    it("gives context menus an accessible local filter and keeps only matching commands", () => {
        const anchor = document.createElement("button");
        document.body.append(anchor);
        const menu = new Menu(anchor, {
            label: "Page actions",
            entries: [
                { render: (label) => (label.textContent = "Pin page"), onSelect: () => undefined },
                { kind: "separator" },
                { render: (label) => (label.textContent = "Close page"), onSelect: () => undefined },
            ],
            search: { label: "Filter menu items", builderLabel: "Build the pattern", noResults: "Nothing matches." },
        });

        menu.show();
        const input = menu.element.querySelector<HTMLInputElement>("input[type='search']");
        expect(input).not.toBeNull();
        expect(input?.getAttribute("aria-controls")).toBe(menu.element.querySelector("ul")?.id);
        expect(menu.element.querySelectorAll("button.md-menu__item")).toHaveLength(2);

        input!.value = "close";
        input!.dispatchEvent(new Event("input", { bubbles: true }));
        expect([...menu.element.querySelectorAll("button.md-menu__item")].map((button) => button.textContent)).toEqual([
            "Close page",
        ]);

        input!.value = "missing";
        input!.dispatchEvent(new Event("input", { bubbles: true }));
        expect(menu.element.querySelector(".md-menu__no-results")?.textContent).toBe("Nothing matches.");
        menu.close();
    });
});
