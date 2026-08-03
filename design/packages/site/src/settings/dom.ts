/**
 * The handful of DOM helpers the settings and appearance surfaces need beyond the
 * shared ones in `platform/dom.ts`.
 *
 * Element construction, overlay placement, focus enumeration, and shortcut
 * formatting all come from `platform/dom.ts`. Nothing is reimplemented here: a
 * second `el()` in the same package is how two parts of one site end up building
 * subtly different markup for the same control.
 */

import { el } from "../platform/dom.js";

let liveRegion: HTMLElement | null = null;

/**
 * Announce a change to assistive technology.
 *
 * Polite, so it queues behind whatever the visitor is reading. The text is cleared
 * first because writing the same string into a live region twice is otherwise
 * silent.
 */
export function announce(message: string): void {
    if (liveRegion === null) {
        liveRegion = el("div", {
            class: "md-visually-hidden",
            attrs: { "aria-live": "polite", "aria-atomic": "true" },
        });
        document.body.append(liveRegion);
    }
    const region = liveRegion;
    region.textContent = "";
    window.setTimeout(() => {
        region.textContent = message;
    }, 40);
}

/** True when the visitor has asked their operating system for less motion. */
export function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
}

/**
 * Copy text, reporting honestly whether it worked.
 *
 * When the clipboard is refused the caller selects the field and says so, rather
 * than showing a success message for something that did not happen.
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard === undefined) return false;
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/** Offer a generated file for download. The blob is local; no request leaves the page. */
export function downloadFile(filename: string, contents: string, mime: string): void {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = el("a", { attrs: { href: url, download: filename } });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

/** Read a file the visitor chose. Resolves to null when they cancelled or it failed. */
export function pickFile(accept: string): Promise<string | null> {
    return new Promise((resolve) => {
        const input = el("input", { attrs: { type: "file", accept } });
        input.style.display = "none";
        document.body.append(input);
        let settled = false;
        const finish = (value: string | null): void => {
            if (settled) return;
            settled = true;
            input.remove();
            resolve(value);
        };
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (file === undefined) {
                finish(null);
                return;
            }
            void file.text().then(finish, () => {
                finish(null);
            });
        });
        input.addEventListener("cancel", () => {
            finish(null);
        });
        input.click();
    });
}

/**
 * Draw attention to a control the visitor was sent to.
 *
 * The highlight is a class with a short animation that the reduced-motion rules in
 * the stylesheet turn into a static outline, so the "here it is" signal survives
 * for someone who cannot have things move.
 */
export function flashAttention(target: HTMLElement): void {
    target.classList.remove("mb-flash");
    // Force a reflow so re-adding the class restarts the animation rather than
    // being coalesced into no change at all.
    void target.offsetWidth;
    target.classList.add("mb-flash");
    window.setTimeout(() => {
        target.classList.remove("mb-flash");
    }, 2200);
}
