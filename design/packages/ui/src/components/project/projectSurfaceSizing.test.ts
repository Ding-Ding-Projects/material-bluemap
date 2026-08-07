// @vitest-environment node

/**
 * Screenshot-driven sizing contract for the project editor and its live-speed surface.
 *
 * jsdom has no layout engine, so it cannot prove a button is 44 CSS pixels or that a long
 * bilingual label wraps. This explicit inventory locks the CSS mechanisms the real browser
 * proof depends on: every named control family has a minimum target, long copy can wrap, the
 * map editor stacks from its own container width (therefore also at 125/150/200% zoom), and
 * tab overlays remain viewport-bounded and scrollable.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string => readFileSync(resolve(here, relative), "utf8");

const editor = read("ProjectEditor.vue");
const maps = read("ProjectMapsPanel.vue");
const tabs = read("../tabs/TabStrip.vue");
const search = read("../config/ConfigSearchField.vue");
const speed = read("../world/LiveSpeedControl.vue");
const throughput = read("../progress/RenderThroughput.vue");

function rule(source: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "s").exec(source)?.[0] ?? "";
}

describe("project surface sizing inventory", () => {
    it("gives the project header/actions, maps, search affordances and speed controls 44px targets", () => {
        expect(editor).toMatch(/\.mb-project-editor__headrow \.v-btn,[\s\S]*min-block-size:\s*44px/);
        expect(maps).toMatch(/\.mb-project-maps \.v-btn,[\s\S]*min-block-size:\s*44px/);
        expect(search).toMatch(/\.mb-config-search \.v-btn\s*{[^}]*min-block-size:\s*44px/s);
        expect(speed).toMatch(/\.mb-livespeed__button\s*{[^}]*min-block-size:\s*44px/s);
        expect(speed).toMatch(/\.mb-livespeed__restart\s*{[^}]*min-block-size:\s*44px/s);
    });

    it("keeps tab, close, group and edge/overflow controls at the same touch size", () => {
        for (const selector of [
            ".mb-tabs-strip__tab",
            ".mb-tabs-strip__x",
            ".mb-tabs-strip__group-head",
            ".mb-tabs-strip__controls .v-btn",
        ]) {
            expect(rule(tabs, selector), selector).toContain("44px");
        }
    });

    it("wraps tab labels and long bilingual/status copy instead of ellipsizing it", () => {
        const label = rule(tabs, ".mb-tabs-strip__label");
        expect(label).toContain("white-space: normal");
        expect(label).toContain("overflow-wrap: anywhere");
        expect(label).not.toContain("text-overflow: ellipsis");
        expect(editor).toContain("overflow-wrap: anywhere");
        expect(maps).toContain("overflow-wrap: anywhere");
        expect(speed).toContain("overflow-wrap: anywhere");
        expect(throughput).toContain("overflow-wrap: anywhere");
    });

    it("stacks the map editor from container width and bounds every tab overlay to the viewport", () => {
        expect(editor).toContain("container: project-editor / inline-size");
        expect(maps).toMatch(/@container project-editor \(max-width:\s*60rem\)/);
        const sheet = rule(tabs, ".mb-tabs-strip__sheet");
        expect(sheet).toContain("max-width: calc(100vw - 16px)");
        expect(sheet).toContain("max-height: min(calc(100vh - 24px), 640px)");
        expect(sheet).toContain("overflow-y: auto");
    });
});
