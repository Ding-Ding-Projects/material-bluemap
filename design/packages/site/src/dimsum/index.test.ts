// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { dimSumPoolSize, maybeShowDimSum, showDimSumDish } from "./index.js";
import type { DimSumDish } from "./pool.js";

const dimsumCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "dimsum.css"), "utf8");
const notificationsCss = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../notifications/notifications.css"),
    "utf8",
);

const SAMPLE_DISH: DimSumDish = {
    id: "hk-dish-0001",
    slug: "classic-har-gow",
    file: "hk-dish-0001-classic-har-gow.png",
    nameEn: "Classic Har Gow",
    nameZh: "蝦餃",
    jyutping: "haa1 gaau2",
    altEn: "Photograph of classic har gow, a translucent shrimp dumpling",
    altYue: "傳統蝦餃嘅相",
    width: 320,
    height: 320,
    url: "data:image/png;base64,iVBORw0KGgo=",
};

function makeI18n(): I18n {
    return new I18n(new Preferences(null));
}

describe("dim sum surprise", () => {
    let host: HTMLElement;
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.append(host);
    });

    afterEach(() => {
        host.remove();
        randomSpy?.mockRestore();
    });

    it("dimSumPoolSize reports a real, non-negative count without throwing", () => {
        expect(dimSumPoolSize()).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(dimSumPoolSize())).toBe(true);
    });

    it("shows the dish's bilingual name, jyutping and photo untouched by the funny level", () => {
        const i18n = makeI18n();
        i18n.setFunnyLevel("en", 5);
        i18n.setFunnyLevel("yue", 5);
        showDimSumDish({ i18n, host }, SAMPLE_DISH);

        const card = host.querySelector(".dimsum");
        expect(card).not.toBeNull();
        expect(card!.textContent).toContain("Classic Har Gow");
        expect(card!.textContent).toContain("蝦餃");
        expect(card!.textContent).toContain("haa1 gaau2");

        const img = host.querySelector<HTMLImageElement>(".dimsum__photo")!;
        expect(img.src).toBe(SAMPLE_DISH.url);
    });

    it("names the dish in the alt text, in English outside Cantonese mode", () => {
        const i18n = makeI18n();
        showDimSumDish({ i18n, host }, SAMPLE_DISH);
        const img = host.querySelector<HTMLImageElement>(".dimsum__photo")!;
        expect(img.alt).toBe(SAMPLE_DISH.altEn);
    });

    it("names the dish in the alt text, in Cantonese when that mode is active", () => {
        const i18n = makeI18n();
        i18n.setMode("yue");
        showDimSumDish({ i18n, host }, SAMPLE_DISH);
        const img = host.querySelector<HTMLImageElement>(".dimsum__photo")!;
        expect(img.alt).toBe(SAMPLE_DISH.altYue);
    });

    it("dismisses on its own dismiss button and stops showing afterward", () => {
        const i18n = makeI18n();
        showDimSumDish({ i18n, host }, SAMPLE_DISH);
        const dismiss = host.querySelector<HTMLButtonElement>(".dimsum__dismiss")!;
        dismiss.click();
        expect(host.querySelector(".dimsum")).toBeNull();
    });

    it("keeps the dismiss button at the shared 44 CSS pixel minimum target", () => {
        const rule = /\.dimsum__dismiss\s*{[^}]*}/.exec(dimsumCss)?.[0] ?? "";
        expect(rule).toContain("width: var(--md-sys-min-touch-target)");
        expect(rule).toContain("height: var(--md-sys-min-touch-target)");
    });

    it("is announced politely rather than gating anything, per its status role", () => {
        const i18n = makeI18n();
        showDimSumDish({ i18n, host }, SAMPLE_DISH);
        const card = host.querySelector(".dimsum")!;
        expect(card.getAttribute("role")).toBe("status");
        expect(card.getAttribute("aria-live")).toBe("polite");
    });

    it("never draws when a modal dialog is already open, so it cannot interrupt a decision", () => {
        randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
        const dialog = document.createElement("dialog");
        dialog.setAttribute("open", "");
        document.body.append(dialog);
        try {
            maybeShowDimSum({ i18n: makeI18n(), host });
            expect(host.querySelector(".dimsum")).toBeNull();
        } finally {
            dialog.remove();
        }
    });
});

describe("the two corner cards never overlap (dimsum.css vs notifications.css)", () => {
    // jsdom lays nothing out, so these read the stylesheets' own source, the same way the
    // touch-target test above and content/content.css.test.ts already do.

    it("starts stacking above the toast region at the width the two cards need side by side", () => {
        // The arithmetic, derived from the two stylesheets rather than restated by hand:
        // this card is min(22rem, ...) wide in the bottom-left, the toast region
        // min(24rem, ...) in the bottom-right, and three 16px gutters separate them from
        // the edges and each other. 352px + 384px + 48px = 784px. The old breakpoint of
        // 600px left a 601-783px band where both cards sat on the same bottom edge and
        // the toast region (z-index 90) painted over this card (z-index 80).
        const cardWidth = /width:\s*min\((\d+)rem/.exec(dimsumCss);
        const toastWidth = /width:\s*min\((\d+)rem/.exec(notificationsCss);
        expect(cardWidth, "dimsum.css lost its min(<n>rem, ...) width").not.toBeNull();
        expect(toastWidth, "notifications.css lost its min(<n>rem, ...) width").not.toBeNull();
        const needed = (Number(cardWidth![1]) + Number(toastWidth![1])) * 16 + 3 * 16;
        expect(needed).toBe(784);
        expect(dimsumCss).toContain(`@media (width <= ${needed}px)`);
    });

    it("clears the toast stack by its published height, not a hard-coded guess", () => {
        // Below the breakpoint the toast region is full-width and grows upward without
        // bound (wrapping text, wrapped action rows, bilingual second lines), so the
        // clearance has to come from Notifications.ts's measured --mbm-toast-stack-height.
        // The 5.5rem fallback stays on purpose: a failed observer degrades to the old
        // fixed clearance rather than to zero.
        expect(dimsumCss).toMatch(
            /bottom:\s*calc\(var\(--md-sys-spacing-2\)\s*\+\s*var\(--mbm-toast-stack-height,\s*5\.5rem\)\s*\+\s*var\(--md-sys-spacing-2\)\)/,
        );
    });
});
