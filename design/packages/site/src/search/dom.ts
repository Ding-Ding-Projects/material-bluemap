/**
 * A small element helper. Text is always set through `textContent` and never through `innerHTML`,
 * so nothing a visitor types and nothing an article contains can be interpreted as markup.
 */

import { phrase, secondaryPhrase } from "./strings.js";
import type { SearchStringKey } from "./strings.js";

export interface ElementOptions {
    readonly class?: string | undefined;
    readonly text?: string | undefined;
    readonly attrs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
    readonly children?: readonly (Node | null | undefined)[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (options.class !== undefined) {
        node.className = options.class;
    }
    if (options.text !== undefined) {
        node.textContent = options.text;
    }
    if (options.attrs !== undefined) {
        for (const [name, value] of Object.entries(options.attrs)) {
            if (value === null || value === undefined || value === false) {
                continue;
            }
            node.setAttribute(name, value === true ? "" : String(value));
        }
    }
    if (options.children !== undefined) {
        for (const child of options.children) {
            if (child) {
                node.append(child);
            }
        }
    }
    return node;
}

/** Remove every child without touching the element itself. */
export function clearChildren(node: Element): void {
    node.replaceChildren();
}

/**
 * Render a label in the active language mode. In bilingual mode the English label stays the
 * prominent one and the Cantonese label is rendered as a smaller second line, rather than both
 * being crammed onto one.
 */
export function localisedLabel(
    key: SearchStringKey,
    values: Readonly<Record<string, string | number>> = {},
    options: { readonly class?: string | undefined } = {},
): HTMLSpanElement {
    const secondary = secondaryPhrase(key, values);
    const wrapper = el("span", {
        class: options.class === undefined ? "mbm-label" : `mbm-label ${options.class}`,
    });
    wrapper.append(el("span", { class: "mbm-label__primary", text: phrase(key, values) }));
    if (secondary !== null) {
        wrapper.append(
            el("span", { class: "mbm-label__secondary", text: secondary, attrs: { lang: "zh-HK" } }),
        );
    }
    return wrapper;
}

/** Ids are generated once per field so several copies of a surface cannot collide. */
let idCounter = 0;

export function uniqueId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}
