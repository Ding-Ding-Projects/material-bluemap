// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { appearanceElements } from "./coverage.js";

describe("appearance target traversal", () => {
    it("includes every rendered element and excludes document plumbing", () => {
        const root = document.createElement("main");
        root.innerHTML = `
            <header><h1>Material BlueMap</h1><p>Read the map.</p></header>
            <details><summary>More</summary><div><a href="#docs">Documentation</a></div></details>
            <script>window.neverDecorateMe = true;</script>
            <style>.ignored { color: red; }</style>
            <template><p>not rendered</p></template>
        `;

        const elements = appearanceElements(root);
        expect(elements).toEqual([
            root,
            root.querySelector("header"),
            root.querySelector("h1"),
            root.querySelector("p"),
            root.querySelector("details"),
            root.querySelector("summary"),
            root.querySelector("div"),
            root.querySelector("a"),
        ]);
        expect(elements.some((element) => element.tagName === "SCRIPT")).toBe(false);
        expect(elements.some((element) => element.tagName === "STYLE")).toBe(false);
        expect(elements.some((element) => element.tagName === "TEMPLATE")).toBe(false);
    });
});
