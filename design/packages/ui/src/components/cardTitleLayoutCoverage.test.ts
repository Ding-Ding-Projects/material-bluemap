import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    RESPONSIVE_CARD_TITLE_MATRIX,
    RESPONSIVE_CARD_TITLE_SURFACES,
} from "./cardTitleLayoutInventory.js";

const componentsRoot = dirname(fileURLToPath(import.meta.url));
const globalStyles = readFileSync(resolve(componentsRoot, "../styles/global.scss"), "utf8");

function sourceFor(relativePath: string): string {
    return readFileSync(resolve(componentsRoot, relativePath), "utf8");
}

function classCount(source: string, className: string): number {
    return source.match(new RegExp(`\\b${className}\\b`, "g"))?.length ?? 0;
}

function ruleBody(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "m").exec(globalStyles);
    expect(match, `missing shared rule ${selector}`).not.toBeNull();
    return match?.[1] ?? "";
}

describe("responsive flexed card-title coverage inventory", () => {
    it("names all ten assigned issues and both issue #103 surfaces explicitly", () => {
        expect(RESPONSIVE_CARD_TITLE_SURFACES).toHaveLength(11);
        expect([...new Set(RESPONSIVE_CARD_TITLE_SURFACES.map(({ issue }) => issue))]).toEqual([
            93, 94, 95, 96, 97, 98, 99, 100, 101, 103,
        ]);
        expect(RESPONSIVE_CARD_TITLE_SURFACES.filter(({ issue }) => issue === 103)).toHaveLength(2);
    });

    it("pins the required compact widths, display scales and language modes", () => {
        expect(RESPONSIVE_CARD_TITLE_MATRIX.widths).toEqual([360, 390, 414, 800]);
        expect(RESPONSIVE_CARD_TITLE_MATRIX.scales).toEqual([1, 1.25, 1.5, 2]);
        expect(RESPONSIVE_CARD_TITLE_MATRIX.languages).toEqual([
            "english",
            "cantonese",
            "bilingual",
        ]);
    });

    for (const surface of RESPONSIVE_CARD_TITLE_SURFACES) {
        it(`#${surface.issue} ${surface.source} uses the shared title/text/meta/action roles`, () => {
            const source = sourceFor(surface.source);
            const titleTag = new RegExp(
                `<[Vv]-?[Cc]ard-?[Tt]itle[^>]*class="[^"]*${surface.titleClass}[^"]*mb-responsive-card-title[^"]*"`,
            );
            expect(source).toMatch(titleTag);

            if (surface.text) {
                expect(classCount(source, "mb-responsive-card-title__text")).toBeGreaterThan(0);
            }
            if (surface.metadata) {
                expect(classCount(source, "mb-responsive-card-title__meta")).toBeGreaterThan(0);
            }
            expect(classCount(source, "mb-responsive-card-title__action")).toBeGreaterThanOrEqual(
                surface.actions,
            );
        });
    }
});

describe("shared responsive flexed card-title geometry", () => {
    it("beats Vuetify's one-line clipping defaults and wraps the flex row", () => {
        const body = ruleBody(".v-card-title.mb-responsive-card-title");
        expect(body).toMatch(/display:\s*flex/);
        expect(body).toMatch(/flex-wrap:\s*wrap/);
        expect(body).toMatch(/min-inline-size:\s*0/);
        expect(body).toMatch(/max-inline-size:\s*100%/);
        expect(body).toMatch(/overflow:\s*visible/);
        expect(body).toMatch(/text-overflow:\s*clip/);
        expect(body).toMatch(/white-space:\s*normal/);
    });

    it("lets long English, Cantonese, bilingual and identifier text shrink and break", () => {
        const body = ruleBody(".mb-responsive-card-title__text");
        expect(body).toMatch(/flex:\s*1 1 12rem/);
        expect(body).toMatch(/min-inline-size:\s*0/);
        expect(body).toMatch(/max-inline-size:\s*100%/);
        expect(body).toMatch(/overflow-wrap:\s*anywhere/);
        expect(body).toMatch(/word-break:\s*break-word/);
        expect(body).toMatch(/white-space:\s*normal/);
    });

    it("lets status chips shrink and expose every character instead of opening a new clip", () => {
        const chip = ruleBody(".mb-responsive-card-title__meta.v-chip");
        const content = ruleBody(".mb-responsive-card-title__meta.v-chip .v-chip__content");
        expect(chip).toMatch(/flex:\s*0 1 auto/);
        expect(chip).toMatch(/min-inline-size:\s*0/);
        expect(chip).toMatch(/max-inline-size:\s*100%/);
        expect(chip).toMatch(/block-size:\s*auto/);
        expect(content).toMatch(/overflow-wrap:\s*anywhere/);
        expect(content).toMatch(/white-space:\s*normal/);
    });

    it("keeps title-row actions reachable at 44 CSS pixels and wraps their labels", () => {
        const action = ruleBody(".mb-responsive-card-title__action.v-btn");
        const content = ruleBody(".mb-responsive-card-title__action.v-btn .v-btn__content");
        expect(action).toMatch(/min-inline-size:\s*44px/);
        expect(action).toMatch(/min-block-size:\s*44px/);
        expect(action).toMatch(/max-inline-size:\s*100%/);
        expect(content).toMatch(/overflow-wrap:\s*anywhere/);
        expect(content).toMatch(/word-break:\s*break-word/);
        expect(content).toMatch(/white-space:\s*normal/);
    });
});
