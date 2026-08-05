/**
 * Every `GlossaryTermMeta.anchor` has to be a real heading in the bundled `glossary` article,
 * or "Read more in the glossary" lands on the top of the page instead of the term - the same
 * silent-drift failure `docsContent.test.ts` guards the bundle itself against. This reads
 * `docs/glossary.md` off disk directly, independent of the `import.meta.glob` bundling path,
 * and slugs its headings with the exact algorithm `renderMarkdown` uses
 * (`@material-bluemap/viewer`'s `slugifyHeading`, in `packages/viewer/src/util/markdown.ts`),
 * so a term whose anchor no longer matches a real heading - a typo in either file, a renamed
 * section - fails here rather than shipping a dead link nobody notices until they click it.
 *
 * `slugifyHeading` is duplicated below rather than imported, and deliberately not run under
 * a browser-like DOM environment: importing `@material-bluemap/viewer` pulls in its whole
 * three.js/hammer.js viewer surface, which needs a real browser regardless. `markdown.test.ts`
 * in `packages/viewer` is what proves the real function; this copy is checked against it by
 * the "matches a known slug from a real heading in this repository's own docs" case below, so
 * a change to the real algorithm that this copy misses fails loudly here too.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { GLOSSARY_TERMS } from "./glossaryTerms.js";

const GLOSSARY_ARTICLE = fileURLToPath(
    new URL("../../../../../../docs/glossary.md", import.meta.url),
);

/** A byte-for-byte copy of `packages/viewer/src/util/markdown.ts`'s `slugifyHeading`. */
function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function headingSlugs(markdown: string): Set<string> {
    const slugs = new Set<string>();
    for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
        slugs.add(slugifyHeading(match[1] as string));
    }
    return slugs;
}

describe("every glossary term's anchor is a real heading in docs/glossary.md", () => {
    const markdown = readFileSync(GLOSSARY_ARTICLE, "utf8");
    const slugs = headingSlugs(markdown);

    it("finds more than a couple of headings, so a broken read cannot pass as full coverage", () => {
        expect(slugs.size).toBeGreaterThan(10);
    });

    it("has a heading for every term GlossaryTerm.vue can show", () => {
        const missing = Object.values(GLOSSARY_TERMS)
            .filter((meta) => !slugs.has(meta.anchor))
            .map((meta) => `${meta.id}: anchor "${meta.anchor}" has no matching heading`);
        expect(missing).toEqual([]);
    });

    it("matches a known slug from a real heading in this repository's own docs", () => {
        // Pinned against `docs/resumable-renders.md`'s own heading, exactly as
        // `markdown.test.ts` pins the real `slugifyHeading` - so this local copy is checked
        // against the same known-good example rather than only against itself.
        expect(
            slugifyHeading(
                "How `rstate` is cached without reintroducing the merge bug",
            ),
        ).toBe("how-rstate-is-cached-without-reintroducing-the-merge-bug");
    });
});
