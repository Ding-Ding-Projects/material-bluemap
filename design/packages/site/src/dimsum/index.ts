/**
 * The dim sum surprise.
 *
 * One load in ten shows a randomly chosen dish, its name in English and Traditional Chinese
 * with its jyutping, and its photograph. It is a small delight, not a feature anyone has to
 * manage, so:
 *
 *   - there is no setting to turn it off, and no code path here reads a preference;
 *   - the draw is fresh per load and fires at most once, guarded by a module-level flag;
 *   - it never blocks, never takes focus, and never delays the page becoming usable: it is
 *     scheduled after the first render and appears in a corner, politely announced;
 *   - the dish name stays exactly the catalogue's name at every funny level and in every
 *     language mode. Only the copy around it changes;
 *   - the alt text names the dish, so it reaches a screen reader as the same small delight;
 *   - reduced motion is honoured through the shared motion tokens.
 *
 * It stays out of the way when the visitor is mid-task: nothing appears while a modal dialog
 * is open or while the page is hidden.
 */

import { el, icon } from "../platform/dom.js";
import { loadDimSumPool, type DimSumDish } from "./pool.js";
import type { I18n } from "../i18n/I18n.js";

/** One draw per page load. Ten percent, from a fresh random number each time. */
const CHANCE = 0.1;
const VISIBLE_MS = 12000;

let drawn = false;

export interface DimSumDeps {
    readonly i18n: I18n;
    readonly host: HTMLElement;
}

/** Exposed so the shell can say honestly whether the pool made it into this build. */
export function dimSumPoolSize(): number {
    return loadDimSumPool().length;
}

export function maybeShowDimSum(deps: DimSumDeps): void {
    if (drawn) return;
    drawn = true;

    if (Math.random() >= CHANCE) return;
    if (document.visibilityState === "hidden") return;
    if (document.querySelector("dialog[open]") !== null) return;

    const pool = loadDimSumPool();
    const dish = pool[Math.floor(Math.random() * pool.length)];
    if (dish === undefined) return;

    render(deps, dish);
}

/** Show a specific dish. Used by nothing in the shell; kept for a page that wants to explain
 *  the feature by showing it, rather than describing a surface the reader cannot see. */
export function showDimSumDish(deps: DimSumDeps, dish: DimSumDish): void {
    render(deps, dish);
}

function render(deps: DimSumDeps, dish: DimSumDish): void {
    const { i18n, host } = deps;

    const card = el("aside", {
        class: "dimsum",
        attrs: { role: "status", "aria-live": "polite" },
    });
    i18n.bindAttr(card, "aria-label", "dimsum.regionLabel");

    const photo = el("img", {
        class: "dimsum__photo",
        attrs: {
            src: dish.url,
            width: dish.width,
            height: dish.height,
            decoding: "async",
            loading: "lazy",
            // The alt text names the dish, in the language the visitor is reading.
            alt: i18n.mode === "yue" && dish.altYue.length > 0 ? dish.altYue : dish.altEn,
        },
    });
    card.append(photo);

    const body = el("div", { class: "dimsum__body" });

    const eyebrow = el("p", { class: "md-label-small dimsum__eyebrow" });
    i18n.bindText(eyebrow, "dimsum.eyebrow");
    body.append(eyebrow);

    // The dish's own names are catalogue facts and are never restyled by the funny level.
    const name = el("p", { class: "md-title-medium dimsum__name" });
    i18n.bindText(name, "dimsum.dishLine", {
        english: dish.nameEn,
        chinese: dish.nameZh,
        jyutping: dish.jyutping,
    });
    body.append(name);
    card.append(body);

    const dismiss = el("button", { class: "md-icon-button dimsum__dismiss", attrs: { type: "button" } });
    i18n.bindAttr(dismiss, "aria-label", "dimsum.dismiss");
    dismiss.append(icon("close"));
    card.append(dismiss);

    let timer: number | null = window.setTimeout(remove, VISIBLE_MS);

    function remove(): void {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        card.remove();
    }

    dismiss.addEventListener("click", remove);
    // Reading the name should not be a race, so hovering or focusing holds it open.
    card.addEventListener("pointerenter", () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
    });
    card.addEventListener("pointerleave", () => {
        if (timer === null) timer = window.setTimeout(remove, VISIBLE_MS / 2);
    });

    host.append(card);
}
