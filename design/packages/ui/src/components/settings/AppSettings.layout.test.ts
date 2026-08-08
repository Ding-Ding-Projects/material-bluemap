import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(name: string): string {
    return readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
}

function block(text: string, pattern: RegExp, label: string): string {
    const match = text.match(pattern);
    expect(match, `missing layout rule: ${label}`).not.toBeNull();
    return match?.[0] ?? "";
}

describe("the settings sheet keeps one scroll axis", () => {
    const settings = source("./AppSettings.vue");

    it("lets the tab host shrink and contains overflow inside the active vertical scroller", () => {
        const body = block(settings, /\.mb-settings__body\s*\{[^}]*\}/s, "settings body");
        expect(body).toContain("min-width: 0");
        expect(body).toContain("overflow: hidden");

        const panel = block(
            settings,
            /\.mb-settings__body \.mb-tabs__panel,\s*\.mb-settings__body \.mb-setting\s*\{[^}]*\}/s,
            "settings panel and card",
        );
        expect(panel).toContain("min-width: 0");
        expect(panel).toContain("max-width: 100%");
    });

    it("sizes a left or right settings strip from the panel instead of the desktop viewport", () => {
        const strip = block(
            settings,
            /\.mb-settings__body \.mb-tabs-strip-row\[data-placement="left"\],\s*\.mb-settings__body \.mb-tabs-strip-row\[data-placement="right"\]\s*\{[^}]*\}/s,
            "vertical settings strip",
        );
        expect(strip).toContain("flex: 0 1 clamp(10rem, 32%, 15rem)");
        expect(strip).toContain("max-width: 40%");
    });

    it("gives both translated segmented controls intrinsic grid rows instead of overflowing a fixed group height", () => {
        for (const [name, text, selector] of [
            ["interface size", source("./UiSizeRow.vue"), "mb-ui-size__toggle"],
            ["theme", source("./ThemeRow.vue"), "mb-theme-row__toggle"],
        ] as const) {
            const group = block(text, new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`, "s"), name);
            expect(group).toContain("width: 100%");
            expect(group).toContain("max-width: 100%");
            expect(group).toContain("display: grid !important");
            expect(group).toContain(
                "grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr))",
            );
            expect(group).toContain("grid-auto-rows: minmax(48px, auto)");
            expect(group).toContain("height: auto !important");
            expect(group).toContain("overflow: visible");

            const button = block(
                text,
                new RegExp(`\\.${selector} \\.v-btn\\s*\\{[^}]*\\}`, "s"),
                `${name} button`,
            );
            expect(button).toContain("width: 100%");
            expect(button).toContain("height: 100% !important");
            expect(button).toContain("min-width: 0");
        }
    });
});
