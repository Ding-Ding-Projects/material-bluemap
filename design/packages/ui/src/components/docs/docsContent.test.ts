/**
 * The completeness guard: everything `docs/*.md` has on disk, right now, is in the bundle.
 *
 * `docsContent.ts` builds its list from `import.meta.glob`, which is exactly the mechanism this
 * test does not trust blindly - a glob pattern with one wrong `../` bundles nothing and no type
 * error would ever say so. So this reads the real directory a second way, with plain
 * `node:fs.readdirSync`, and fails loudly the moment the two disagree in either direction: a
 * file on disk the bundle is missing, or a bundled entry with no file behind it.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { DOCS_ARTICLES, DOCS_ARTICLES_BY_ID, DOCS_ARTICLE_IDS, bundledFilenames } from "./docsContent.js";
import { idFromFile } from "./docsModel.js";

/** `docs/` at the top of the repository, resolved independently of the glob under test. */
const DOCS_DIRECTORY = fileURLToPath(new URL("../../../../../../docs", import.meta.url));

function realMarkdownFiles(): readonly string[] {
    return readdirSync(DOCS_DIRECTORY).filter((name) => name.toLowerCase().endsWith(".md"));
}

describe("the docs bundle is complete", () => {
    it("bundles every .md file docs/ actually has, and nothing that is not there", () => {
        const onDisk = [...realMarkdownFiles()].sort((a, b) => a.localeCompare(b));
        const bundled = [...bundledFilenames()].sort((a, b) => a.localeCompare(b));
        expect(bundled).toEqual(onDisk);
    });

    it("finds more than a handful of articles, so an empty glob cannot pass by accident", () => {
        // A regression guard for the failure mode the module doc warns about: a broken glob
        // path resolves to zero matches, which the array-equality check above would call
        // "complete" if docs/ were also (wrongly) read as empty by the same broken assumption.
        // This assertion is independent of DOCS_DIRECTORY, so it still catches that case.
        expect(DOCS_ARTICLES.length).toBeGreaterThan(10);
    });

    it("gives every article a stable, unique id derived from its filename", () => {
        expect(DOCS_ARTICLE_IDS.size).toBe(DOCS_ARTICLES.length);
        for (const article of DOCS_ARTICLES) {
            expect(article.id).toBe(idFromFile(article.file));
            expect(DOCS_ARTICLES_BY_ID.get(article.id)).toBe(article);
        }
    });

    it("carries non-empty markdown for every article", () => {
        for (const article of DOCS_ARTICLES) {
            expect(article.markdown.length).toBeGreaterThan(0);
        }
    });

    it("carries the known articles this feature was built against", () => {
        // Not a substitute for the disk comparison above - a spot check that names articles
        // this test's author actually read, so a passing suite means something was verified
        // by eye at least once, not only compared against itself.
        for (const id of ["command-palette", "large-worlds", "readme", "bluemapgui-parity"]) {
            expect(DOCS_ARTICLE_IDS.has(id)).toBe(true);
        }
    });
});
