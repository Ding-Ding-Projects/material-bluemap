/**
 * Renders the structured content model into real DOM.
 *
 * Everything here builds nodes and sets `textContent`. No template strings reach
 * `innerHTML`, so no piece of content can inject markup even if it later comes from
 * somewhere less trusted than a TypeScript file in this repository.
 *
 * The block's own prose -- a paragraph, a list item, a table cell, a definition, a
 * callout's `title`/`content` -- is authored article content and stays literal English:
 * see `packages/site/src/i18n/strings.ts`'s own new-entries comment for why that line is
 * drawn where it is. The callout's tone badge and the code sample's accessible name are
 * different: they are chrome this renderer itself adds around the content, not anything an
 * article author wrote, so they are voiced through `i18n` like every other label in the
 * shell.
 */

import type {
    Block,
    CalloutTone,
    Inline,
    InlineContent,
} from "../content/types.js";
import type { I18n } from "../i18n/I18n.js";
import type { FixedKey } from "../i18n/strings.js";

const CALLOUT_LABEL_KEYS: Readonly<Record<CalloutTone, FixedKey>> = {
    note: "callout.note",
    warning: "callout.warning",
    "not-implemented": "callout.notImplemented",
};

function isInlineArray(content: InlineContent): content is readonly Inline[] {
    return Array.isArray(content);
}

/** Appends one inline run. Returns nothing; the caller owns the parent. */
function appendInline(parent: HTMLElement, run: Inline): void {
    if (typeof run === "string") {
        parent.appendChild(document.createTextNode(run));
        return;
    }

    if ("code" in run) {
        const code = document.createElement("code");
        code.textContent = run.code;
        parent.appendChild(code);
        return;
    }

    if ("strong" in run) {
        const strong = document.createElement("strong");
        strong.textContent = run.strong;
        parent.appendChild(strong);
        return;
    }

    if ("em" in run) {
        const em = document.createElement("em");
        em.textContent = run.em;
        parent.appendChild(em);
        return;
    }

    const anchor = document.createElement("a");
    anchor.textContent = run.link;
    anchor.href = run.href;
    if (run.external === true) {
        // Opening in a new context needs noopener, or the opened page gets a handle
        // back to this one through window.opener.
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.classList.add("mb-link-external");
    }
    parent.appendChild(anchor);
}

export function appendInlineContent(parent: HTMLElement, content: InlineContent): void {
    if (isInlineArray(content)) {
        for (const run of content) appendInline(parent, run);
    } else {
        appendInline(parent, content);
    }
}

function renderParagraph(content: InlineContent): HTMLElement {
    const p = document.createElement("p");
    p.className = "mb-prose-p";
    appendInlineContent(p, content);
    return p;
}

function renderBlock(block: Block, i18n: I18n): HTMLElement {
    switch (block.kind) {
        case "paragraph":
            return renderParagraph(block.content);

        case "list": {
            const list = document.createElement(block.ordered === true ? "ol" : "ul");
            list.className = "mb-prose-list";
            for (const item of block.items) {
                const li = document.createElement("li");
                appendInlineContent(li, item);
                list.appendChild(li);
            }
            return list;
        }

        case "table": {
            // The table scrolls inside its own container so a wide table never makes
            // the page itself scroll sideways.
            const wrapper = document.createElement("div");
            wrapper.className = "mb-table-scroll";

            const table = document.createElement("table");
            table.className = "mb-prose-table";

            const caption = document.createElement("caption");
            caption.textContent = block.caption;
            table.appendChild(caption);

            const thead = document.createElement("thead");
            const headRow = document.createElement("tr");
            for (const column of block.columns) {
                const th = document.createElement("th");
                th.scope = "col";
                th.textContent = column;
                headRow.appendChild(th);
            }
            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");
            for (const row of block.rows) {
                const tr = document.createElement("tr");
                for (const cell of row) {
                    const td = document.createElement("td");
                    appendInlineContent(td, cell);
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);

            wrapper.appendChild(table);
            return wrapper;
        }

        case "code": {
            const figure = document.createElement("figure");
            figure.className = "mb-code-figure";

            const label = document.createElement("figcaption");
            label.className = "mb-code-label";
            label.textContent = block.caption ?? block.language;
            figure.appendChild(label);

            const pre = document.createElement("pre");
            pre.className = "mb-code";
            // Scrollable and focusable, so a keyboard user can reach a wide block's
            // overflow instead of it simply being unreachable.
            pre.tabIndex = 0;
            pre.setAttribute("role", "region");
            i18n.bindAttr(pre, "aria-label", "content.codeSampleAria", { language: block.language });

            const code = document.createElement("code");
            code.textContent = block.code;
            pre.appendChild(code);
            figure.appendChild(pre);
            return figure;
        }

        case "definitions": {
            const dl = document.createElement("dl");
            dl.className = "mb-prose-definitions";
            for (const item of block.items) {
                const dt = document.createElement("dt");
                dt.textContent = item.term;
                dl.appendChild(dt);

                const dd = document.createElement("dd");
                appendInlineContent(dd, item.description);
                dl.appendChild(dd);
            }
            return dl;
        }

        case "callout": {
            const aside = document.createElement("aside");
            aside.className = `mb-callout mb-callout-${block.tone}`;
            // A warning that assistive technology reads as an ordinary paragraph is
            // not a warning, so the tone is announced rather than only coloured.
            aside.setAttribute("role", block.tone === "warning" ? "alert" : "note");

            const heading = document.createElement("p");
            heading.className = "mb-callout-title";

            const tone = document.createElement("span");
            tone.className = "mb-callout-tone";
            i18n.bindText(tone, CALLOUT_LABEL_KEYS[block.tone]);
            heading.appendChild(tone);

            const title = document.createElement("span");
            title.textContent = block.title;
            heading.appendChild(title);

            aside.appendChild(heading);
            aside.appendChild(renderParagraph(block.content));
            return aside;
        }
    }
}

/** Renders a sequence of blocks into `host`, replacing whatever was there. */
export function renderBlocks(host: HTMLElement, blocks: readonly Block[], i18n: I18n): void {
    host.replaceChildren();
    for (const block of blocks) host.appendChild(renderBlock(block, i18n));
}
