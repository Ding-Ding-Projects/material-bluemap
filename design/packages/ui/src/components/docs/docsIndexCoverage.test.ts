/**
 * The guard that stops a feature article slipping between `docs/README.md` and
 * `docsModel.ts` the way nine of them just did.
 *
 * This project documents each feature twice, in two hand-maintained places that have to
 * agree:
 *
 *   - `docs/README.md` -- the category index tables a reader browses on the repository and
 *     the site, under "## The application" and "## Rendering".
 *   - `docsModel.ts`'s `APPLICATION_ORDER` and `RENDERING_ORDER` arrays -- which decide how
 *     the SAME articles are grouped and ordered inside the in-app documentation browser, via
 *     `categoryOfFile()`.
 *
 * Nothing kept them in step. An audit found nine shipped articles (dependency-provisioning,
 * docker-world-source, home, java-runtime-provisioning, path-field, remote-hosting,
 * scheduled-render, ssh-world-sources, world-git-repository) that `docs/README.md` indexed
 * correctly but that had never joined either array. `categoryOfFile()` falls back to
 * `"uncategorized"` for a file in neither array, so all nine rendered outside their proper
 * heading in the in-app browser for as long as they existed -- no error, no failing test, no
 * visible breakage, because every *existing* entry in those arrays was, and still is,
 * perfectly well-formed. A rule that only checks well-formedness is blind to an article that
 * was never added at all, which is exactly the shape of bug this file exists to catch instead.
 *
 * `docsContent.test.ts` next door already proves a related but different thing: that every
 * `.md` file physically on disk under `docs/` is bundled into the app via `import.meta.glob`.
 * It says nothing about which *category* a bundled article lands in -- that question belongs
 * to this file, which checks the two hand-maintained indexes against each other and, so
 * `docs/README.md` cannot drift either, against the real files on disk a third way.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APPLICATION_ORDER, RENDERING_ORDER, categoryOfFile } from "./docsModel.js";

/** `docs/` at the top of the repository -- `docsContent.test.ts` resolves the same directory
 *  the same way, six levels above this file (`components/docs/`). */
const DOCS_DIRECTORY = fileURLToPath(new URL("../../../../../../docs", import.meta.url));

const README_PATH = `${DOCS_DIRECTORY}/README.md`;
const README_TEXT = readFileSync(README_PATH, "utf8");

/* -------------------------------------------------------------------------- */
/* Reading docs/README.md's own two tables, by heading                        */
/* -------------------------------------------------------------------------- */

interface HeadingMatch {
    readonly name: string;
    readonly headingIndex: number;
    readonly contentStart: number;
}

/** Every `## Heading` in `markdown`, mapped to the text between it and the next one. */
function sectionsByHeading(markdown: string): ReadonlyMap<string, string> {
    const HEADING = /^##\s+(.+?)\s*$/gm;
    const headings: HeadingMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = HEADING.exec(markdown)) !== null) {
        headings.push({
            name: (match[1] ?? "").trim(),
            headingIndex: match.index,
            contentStart: match.index + match[0].length,
        });
    }
    const sections = new Map<string, string>();
    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i] as HeadingMatch;
        const end = i + 1 < headings.length ? (headings[i + 1] as HeadingMatch).headingIndex : markdown.length;
        sections.set(heading.name, markdown.slice(heading.contentStart, end));
    }
    return sections;
}

/** Every `(./file.md)` (with an optional `#anchor`) relative link found in `text`. */
function linkedMarkdownFiles(text: string): readonly string[] {
    const LINK = /\]\(\.\/([\w.-]+\.md)(?:#[^)]*)?\)/g;
    const files: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = LINK.exec(text)) !== null) {
        files.push(match[1] as string);
    }
    return files;
}

const README_SECTIONS = sectionsByHeading(README_TEXT);
const APPLICATION_SECTION = README_SECTIONS.get("The application") ?? "";
const RENDERING_SECTION = README_SECTIONS.get("Rendering") ?? "";

/** The `.md` files `docs/README.md` lists under "## The application", in table order. */
const README_APPLICATION_FILES = linkedMarkdownFiles(APPLICATION_SECTION);
/** The `.md` files `docs/README.md` lists under "## Rendering", in table order. */
const README_RENDERING_FILES = linkedMarkdownFiles(RENDERING_SECTION);

/** Every `.md` file actually present under `docs/`, read independently of both indexes. */
function diskMarkdownFiles(): readonly string[] {
    return readdirSync(DOCS_DIRECTORY).filter((name) => name.toLowerCase().endsWith(".md"));
}

const DISK_FILES = diskMarkdownFiles();

/* -------------------------------------------------------------------------- */
/* The one named exemption                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Article files this guard does not require to be indexed in `docs/README.md`'s tables or
 * named in either `docsModel.ts` ordering array, with the reason written down -- the pattern
 * this project's other guards use for a real exception (`LABEL_ONLY_SURFACES` in
 * `catalogueCoverage.test.ts`, `"not-applicable"`/`"no-menu"` rows in `menuCoverage.test.ts`),
 * rather than loosening the rule for everyone.
 */
const CATEGORY_EXEMPT: Readonly<Record<string, string>> = {
    "bluemapgui-parity.md":
        "A source-code audit article, not a feature article. docsModel.ts's own DOCS_CATEGORIES " +
        "comment says so in these words, and docsModel.test.ts's categoryOfFile suite pins " +
        "categoryOfFile('bluemapgui-parity.md') === 'uncategorized' as genuinely true today.",
    "README.md":
        "docs/README.md is the index itself, not an entry in its own tables -- the same reasoning " +
        "docsModel.ts's own DOCS_CATEGORIES comment gives for why README.md is uncategorized.",
};

/* -------------------------------------------------------------------------- */
/* The guard                                                                  */
/* -------------------------------------------------------------------------- */

describe("docs/README.md's tables and docsModel.ts's ordering arrays agree", () => {
    it("parses real tables with real rows, so a broken parser cannot pass as full coverage", () => {
        // A regex or heading lookup that silently matched nothing would make every check
        // below pass vacuously. docs/README.md has 17 application rows and 18 rendering rows
        // today; anything near zero means the parser broke, not that the indexes agree.
        expect(APPLICATION_SECTION.length).toBeGreaterThan(0);
        expect(RENDERING_SECTION.length).toBeGreaterThan(0);
        expect(README_APPLICATION_FILES.length).toBeGreaterThan(10);
        expect(README_RENDERING_FILES.length).toBeGreaterThan(10);
        expect(DISK_FILES.length).toBeGreaterThan(20);
    });

    it("names a real exemption for every entry in CATEGORY_EXEMPT, with an actual reason", () => {
        for (const [file, reason] of Object.entries(CATEGORY_EXEMPT)) {
            expect(DISK_FILES, `${file}: exempted but not even a real file under docs/`).toContain(file);
            expect(reason.trim().length, `${file}: exemption has no real reason written down`).toBeGreaterThan(
                20,
            );
        }
    });

    /* ---------------------------------------------------------------------- */
    /* Direction 1: indexed in docs/README.md, missing from an ordering array */
    /* ---------------------------------------------------------------------- */

    it("has an APPLICATION_ORDER entry for every article docs/README.md lists under 'The application'", () => {
        const missing = README_APPLICATION_FILES.filter((file) => !APPLICATION_ORDER.includes(file));
        expect(
            missing,
            missing.length === 0
                ? undefined
                : "docs/README.md's \"## The application\" table links these article(s), but " +
                      "docsModel.ts's APPLICATION_ORDER array does not name them -- so " +
                      "categoryOfFile() falls back to \"uncategorized\" and each one renders " +
                      "outside \"The application\" heading in the in-app documentation browser, " +
                      "with no error and no visible breakage. This is the exact drift that let " +
                      "nine articles slip past everything before commit ec86f50 fixed the data.\n\n" +
                      missing
                          .map(
                              (file) =>
                                  `  - ${file}\n` +
                                  `    Fix: add "${file}" to APPLICATION_ORDER in\n` +
                                  "      design/packages/ui/src/components/docs/docsModel.ts",
                          )
                          .join("\n"),
        ).toEqual([]);
    });

    it("has a RENDERING_ORDER entry for every article docs/README.md lists under 'Rendering'", () => {
        const missing = README_RENDERING_FILES.filter((file) => !RENDERING_ORDER.includes(file));
        expect(
            missing,
            missing.length === 0
                ? undefined
                : "docs/README.md's \"## Rendering\" table links these article(s), but " +
                      "docsModel.ts's RENDERING_ORDER array does not name them -- so " +
                      "categoryOfFile() falls back to \"uncategorized\" and each one renders " +
                      "outside \"Rendering\" heading in the in-app documentation browser, with no " +
                      "error and no visible breakage. This is the exact drift that let nine " +
                      "articles slip past everything before commit ec86f50 fixed the data.\n\n" +
                      missing
                          .map(
                              (file) =>
                                  `  - ${file}\n` +
                                  `    Fix: add "${file}" to RENDERING_ORDER in\n` +
                                  "      design/packages/ui/src/components/docs/docsModel.ts",
                          )
                          .join("\n"),
        ).toEqual([]);
    });

    it("never leaves an indexed, non-exempt article stranded in categoryOfFile()'s 'uncategorized' bucket", () => {
        // The same check as the two above, restated against the real product function rather
        // than the raw arrays, so this fails the same way the shipped defect actually failed:
        // an article a reader can find in docs/README.md rendering under the wrong heading (or
        // no heading) in the app itself.
        const indexed = [...README_APPLICATION_FILES, ...README_RENDERING_FILES];
        const stranded = indexed.filter(
            (file) => !(file in CATEGORY_EXEMPT) && categoryOfFile(file) === "uncategorized",
        );
        expect(
            stranded,
            stranded.length === 0
                ? undefined
                : "these articles are indexed in docs/README.md but categoryOfFile() in " +
                      "design/packages/ui/src/components/docs/docsModel.ts still calls them " +
                      "'uncategorized' -- add each one to APPLICATION_ORDER or RENDERING_ORDER " +
                      "there (whichever table docs/README.md lists it under), or add it to " +
                      "CATEGORY_EXEMPT in this test file with a written reason if it is genuinely " +
                      "not a feature article.",
        ).toEqual([]);
    });

    /* ---------------------------------------------------------------------- */
    /* Direction 2: named in an ordering array, no longer indexed or real     */
    /* ---------------------------------------------------------------------- */

    it("never keeps an APPLICATION_ORDER entry docs/README.md's 'The application' table no longer links", () => {
        const stale = APPLICATION_ORDER.filter((file) => !README_APPLICATION_FILES.includes(file));
        expect(
            stale,
            stale.length === 0
                ? undefined
                : "docsModel.ts's APPLICATION_ORDER names these article(s), but docs/README.md's " +
                      '"## The application" table no longer links them (a rename, a deletion, or a ' +
                      "row moved to a different table) -- a stale entry left behind.\n\n" +
                      stale
                          .map(
                              (file) =>
                                  `  - ${file}\n` +
                                  `    Fix: remove "${file}" from APPLICATION_ORDER in\n` +
                                  "      design/packages/ui/src/components/docs/docsModel.ts,\n" +
                                  "      or restore its row to docs/README.md's \"## The application\" " +
                                  "table if the article is meant to still exist.",
                          )
                          .join("\n"),
        ).toEqual([]);
    });

    it("never keeps a RENDERING_ORDER entry docs/README.md's 'Rendering' table no longer links", () => {
        const stale = RENDERING_ORDER.filter((file) => !README_RENDERING_FILES.includes(file));
        expect(
            stale,
            stale.length === 0
                ? undefined
                : "docsModel.ts's RENDERING_ORDER names these article(s), but docs/README.md's " +
                      '"## Rendering" table no longer links them (a rename, a deletion, or a row ' +
                      "moved to a different table) -- a stale entry left behind.\n\n" +
                      stale
                          .map(
                              (file) =>
                                  `  - ${file}\n` +
                                  `    Fix: remove "${file}" from RENDERING_ORDER in\n` +
                                  "      design/packages/ui/src/components/docs/docsModel.ts,\n" +
                                  "      or restore its row to docs/README.md's \"## Rendering\" " +
                                  "table if the article is meant to still exist.",
                          )
                          .join("\n"),
        ).toEqual([]);
    });

    it("never names a file in either ordering array that does not exist under docs/ at all", () => {
        // The most literal reading of "stale entry": the article itself is gone, checked
        // against the real directory rather than either hand-maintained index.
        const ghosts = [...APPLICATION_ORDER, ...RENDERING_ORDER].filter((file) => !DISK_FILES.includes(file));
        expect(
            ghosts,
            ghosts.length === 0
                ? undefined
                : "these files are named in docsModel.ts's APPLICATION_ORDER or RENDERING_ORDER, " +
                      "but no such file exists under docs/ -- almost certainly a rename or deletion " +
                      "that never removed the old entry.\n\n" +
                      ghosts
                          .map((file) => `  - ${file}\n    Fix: remove it from docsModel.ts's ordering arrays.`)
                          .join("\n"),
        ).toEqual([]);
    });

    it("never lists the same file in both APPLICATION_ORDER and RENDERING_ORDER", () => {
        const duplicated = APPLICATION_ORDER.filter((file) => RENDERING_ORDER.includes(file));
        expect(
            duplicated,
            duplicated.length === 0
                ? undefined
                : "these files are named in both APPLICATION_ORDER and RENDERING_ORDER at once, " +
                      "which is not a real category and hides which table docs/README.md should " +
                      "actually list them under.",
        ).toEqual([]);
    });

    /* ---------------------------------------------------------------------- */
    /* Direction 3: real on disk, absent from docs/README.md's tables         */
    /* ---------------------------------------------------------------------- */

    it("indexes every article file on disk in docs/README.md's tables, except a named exemption", () => {
        const indexed = new Set([...README_APPLICATION_FILES, ...README_RENDERING_FILES]);
        const missing = DISK_FILES.filter((file) => !indexed.has(file) && !(file in CATEGORY_EXEMPT));
        expect(
            missing,
            missing.length === 0
                ? undefined
                : "these article files exist under docs/ but docs/README.md links none of them " +
                      "under either \"## The application\" or \"## Rendering\" -- so a reader " +
                      "browsing the repository or the site index cannot find them.\n\n" +
                      missing
                          .map(
                              (file) =>
                                  `  - ${file}\n` +
                                  "    Fix: add a row for it to the right table in docs/README.md, " +
                                  "or add it to CATEGORY_EXEMPT in this test file with a written " +
                                  "reason if it is genuinely not a feature article.",
                          )
                          .join("\n"),
        ).toEqual([]);
    });
});
