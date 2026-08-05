import { marked } from "marked";

import { sanitizeHtml } from "./sanitize.js";

/**
 * The one Markdown-to-HTML step this application has.
 *
 * Nothing in this repository rendered Markdown before this module: release notes open in the
 * system browser, commit bodies print as plain text inside `<pre>`, and the EULA viewer treats
 * its document as sectioned plain text. The in-app documentation browser is the first surface
 * that needs real Markdown rendering, and per the project's rule that provider-authored text is
 * rendered through one shared, isolated renderer rather than a new one per surface, this is that
 * renderer. The next surface that needs Markdown - release notes shown in-app, an issue body -
 * reuses {@link renderMarkdown} rather than growing a second parser.
 *
 * "Isolated" here means two things, both enforced inside this one function rather than left to
 * whoever calls it:
 *
 *  - `marked` never executes anything. It is a pure string-to-string parser with no `eval` and
 *    no `new Function`, which matters in this Electron shell specifically: the renderer runs
 *    under a `script-src 'self'` CSP with no `unsafe-eval` (see `vite.config.ts`'s note on
 *    `vue-i18n`'s JIT compilation for the same constraint biting a different library).
 *  - the HTML `marked` produces is untrusted regardless: it came from a file on disk, but
 *    nothing here re-verifies that the file was not tampered with, and a future caller may well
 *    hand this function text that came from further away (a fetched release note, an issue
 *    body). So the output always passes through {@link sanitizeHtml} - the same DOMPurify
 *    wrapper `InfoPage.vue` already runs upstream's locale HTML through - before anything is
 *    returned. A caller cannot forget this step because there is no way to reach the parsed
 *    HTML without it.
 *
 * Heading ids are assigned after sanitizing, matching the algorithm GitHub's own renderer uses
 * ({@link slugifyHeading}), because this repository's documentation already carries hand-written
 * `#anchor` links between articles that were written against exactly that algorithm. Rendering
 * headings with any other id scheme would silently break every one of them.
 */
export function renderMarkdown(source: string): string {
    const raw = marked.parse(source, { async: false, gfm: true, breaks: false }) as string;
    return addHeadingIds(sanitizeHtml(raw));
}

/**
 * The anchor id GitHub's own renderer would give a heading with this text: lowercase, strip
 * everything that is not a letter, a number, whitespace or a hyphen (which is what removes
 * backticks, quotes and other Markdown punctuation along with ordinary sentence punctuation),
 * then turn runs of whitespace into single hyphens and trim the ends.
 *
 * Exported on its own so a test can pin it against a real heading from this repository's
 * documentation (`docs/resumable-renders.md`'s `### How \`rstate\` is cached without
 * reintroducing the merge bug` becomes `how-rstate-is-cached-without-reintroducing-the-merge-bug`)
 * without needing to render a whole document to check it.
 */
export function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Walks the sanitized fragment and assigns every heading the id {@link slugifyHeading} would
 * give it, de-duplicating exactly as GitHub does: the first heading with a given text keeps the
 * plain slug, and each later collision gets `-2`, `-3`, and so on appended (GitHub's own scheme
 * starts the first repeat at `-1`; this repository's documentation has no repeated heading, so
 * the distinction has never mattered in practice, but the counter starts at 1 rather than 0 so
 * a slug is never suffixed with `-0`).
 *
 * Runs after sanitizing rather than as a `marked` renderer override so this function's
 * correctness does not depend on which internal hook a future `marked` major version keeps -
 * it operates on the same DOM shape {@link sanitizeHtml}'s caller already has to build to apply
 * the sanitized markup, via a detached `<template>` rather than the live document.
 */
function addHeadingIds(html: string): string {
    const template = document.createElement("template");
    template.innerHTML = html;
    const used = new Map<string, number>();
    for (const heading of Array.from(
        template.content.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    )) {
        const base = slugifyHeading(heading.textContent ?? "");
        const slug = base.length > 0 ? base : "section";
        const seen = used.get(slug) ?? 0;
        used.set(slug, seen + 1);
        heading.id = seen === 0 ? slug : `${slug}-${seen}`;
    }
    return template.innerHTML;
}
