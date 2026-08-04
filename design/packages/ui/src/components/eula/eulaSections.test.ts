/**
 * The one property the licence viewer must never lose.
 *
 * Categorising a legal document is navigation, and navigation is allowed to be wrong: a
 * clause filed under the wrong tab costs somebody a click. What it is never allowed to be
 * is *editing*, and every plausible implementation of it edits - by summarising, by
 * reordering paragraphs so a category reads coherently, by dropping a sentence that fits
 * two categories, or by rendering a translated heading instead of the heading.
 *
 * So the central assertion in this file is one line, repeated against several documents:
 * the sections' text, concatenated in the order they were produced, is byte-identical to
 * the source. It holds by construction, because a section is a range of offsets rather
 * than a copy of any text - and it is asserted anyway, because a proof by construction is
 * only as good as the construction.
 */

import { describe, expect, it } from "vitest";

import {
    EULA_CATEGORIES,
    categoriseBlock,
    categoriseEula,
    isEulaCategory,
    looksLikeHeading,
    sectionParagraphs,
    sectionPreview,
    sectionText,
    sectionsCoverText,
    splitBlocks,
} from "./eulaSections.js";

/** A document with a heading of each shape and a clause of each category. */
const DOCUMENT = [
    "MINECRAFT END USER LICENCE AGREEMENT",
    "",
    "By using the game you agree to this agreement. This agreement applies to you.",
    "",
    "1. What you may do",
    "",
    "You may play the game on your own computer. We grant you a personal, non-commercial licence to do so.",
    "",
    "2. What you may not do",
    "",
    "You may not distribute the game files. You may not reverse engineer the client.",
    "",
    "3. Ownership",
    "",
    "We own the game and everything in it. Our trademarks and copyright remain ours.",
    "",
    "SECTION 4 - TERMINATION",
    "",
    "We may terminate this agreement if you break it. We may suspend your access.",
    "",
    "5. Changes",
    "",
    "We may change this agreement from time to time. Updates are published on our site.",
].join("\n");

describe("splitting a document into blocks", () => {
    it("covers every character, so nothing can fall between two blocks", () => {
        const blocks = splitBlocks(DOCUMENT);
        expect(blocks.map((block) => DOCUMENT.slice(block.start, block.end)).join("")).toBe(DOCUMENT);
        expect(blocks[0]?.start).toBe(0);
        expect(blocks.at(-1)?.end).toBe(DOCUMENT.length);
    });

    it("keeps leading and trailing blank lines inside a block rather than losing them", () => {
        const padded = `\n\n\nA heading\n\nA clause of some length.\n\n\n`;
        const blocks = splitBlocks(padded);
        expect(blocks.map((block) => padded.slice(block.start, block.end)).join("")).toBe(padded);
        // No block is nothing but whitespace: those are folded into their neighbour so the
        // viewer never draws a tab containing no words.
        for (const block of blocks) expect(block.text.length).toBeGreaterThan(0);
    });

    it("has no blocks at all for an empty document", () => {
        expect(splitBlocks("")).toEqual([]);
    });
});

describe("recognising a heading", () => {
    it("accepts the shapes a legal document actually uses", () => {
        expect(looksLikeHeading("1. What you may do")).toBe(true);
        expect(looksLikeHeading("SECTION 4 - TERMINATION")).toBe(true);
        expect(looksLikeHeading("MINECRAFT END USER LICENCE AGREEMENT")).toBe(true);
        expect(looksLikeHeading("Ownership")).toBe(true);
        expect(looksLikeHeading("You may not:")).toBe(true);
    });

    it("refuses a sentence, a paragraph and an over-long line", () => {
        expect(looksLikeHeading("We own the game and everything in it.")).toBe(false);
        expect(looksLikeHeading("A heading\nand a second line")).toBe(false);
        expect(looksLikeHeading("word ".repeat(40))).toBe(false);
        expect(looksLikeHeading("")).toBe(false);
    });
});

describe("classifying a block", () => {
    it("separates what you may do from what you may not", () => {
        expect(categoriseBlock("You may play the game on your own computer.")).toBe("permitted");
        expect(categoriseBlock("You may not distribute the game files.")).toBe("prohibited");
    });

    it("recognises ownership, changes, termination and liability", () => {
        expect(categoriseBlock("We own the game. Our trademarks remain ours.")).toBe("ownership");
        expect(categoriseBlock("We may change this agreement from time to time.")).toBe("changes");
        expect(categoriseBlock("Termination: we may terminate this agreement.")).toBe("termination");
        expect(categoriseBlock("The game is provided as is with no warranty.")).toBe("liability");
    });

    it("falls back to other rather than guessing", () => {
        expect(categoriseBlock("The quick brown fox.")).toBe("other");
    });

    it("is deterministic, which is what stops the tabs shuffling between launches", () => {
        const block = "You may not do this. We own that. We may change either.";
        const first = categoriseBlock(block);
        for (let run = 0; run < 5; run++) expect(categoriseBlock(block)).toBe(first);
    });

    it("only ever returns a category this build knows", () => {
        for (const category of EULA_CATEGORIES) expect(isEulaCategory(category)).toBe(true);
        expect(isEulaCategory("summary")).toBe(false);
        expect(isEulaCategory(null)).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* The property this whole feature rests on                                   */
/* -------------------------------------------------------------------------- */

describe("categorising is navigation and not editing", () => {
    const CASES: Readonly<Record<string, string>> = {
        "a structured licence": DOCUMENT,
        "a document with no headings at all": "One clause.\n\nAnother clause.\n\nA third clause.",
        "a single paragraph": "Everything in one paragraph, with no blank line anywhere.",
        "a document with unusual whitespace": "\n\n  A heading  \n\n\n   A clause.   \n\n",
        "a document that is only a heading": "OWNERSHIP",
    };

    for (const [name, source] of Object.entries(CASES)) {
        it(`puts ${name} back together, character for character`, () => {
            const sections = categoriseEula(source);
            // The assertion the feature exists to keep: no word omitted, none added, none
            // reordered. `sectionsCoverText` also checks the ranges tile the string.
            expect(sections.map((section) => sectionText(source, section)).join("")).toBe(source);
            expect(sectionsCoverText(source, sections)).toBe(true);
        });

        it(`produces ranges in document order for ${name}`, () => {
            const sections = categoriseEula(source);
            let previous = -1;
            for (const section of sections) {
                expect(section.start).toBeGreaterThan(previous);
                expect(section.end).toBeGreaterThan(section.start);
                previous = section.start;
            }
        });
    }

    it("produces no sections for an empty document rather than one empty one", () => {
        expect(categoriseEula("")).toEqual([]);
        expect(sectionsCoverText("", [])).toBe(true);
    });

    it("separates the licence into the categories a reader is looking for", () => {
        const sections = categoriseEula(DOCUMENT);
        const found = new Set(sections.map((section) => section.category));
        expect(found).toContain("permitted");
        expect(found).toContain("prohibited");
        expect(found).toContain("ownership");
        expect(found).toContain("termination");
        expect(found).toContain("changes");
    });

    it("quotes the document's own heading rather than replacing it with a category name", () => {
        const sections = categoriseEula(DOCUMENT);
        const headings = sections.map((section) => section.heading).filter((h) => h !== null);
        expect(headings).toContain("2. What you may not do");
        expect(headings).toContain("SECTION 4 - TERMINATION");
    });

    it("rejects a set of ranges that leaves a gap, so the guard is not vacuous", () => {
        const sections = categoriseEula(DOCUMENT);
        const broken = sections.slice(1);
        expect(sectionsCoverText(DOCUMENT, broken)).toBe(false);
        const truncated = sections.map((section, index) =>
            index === 0 ? { ...section, end: section.end - 1 } : section,
        );
        expect(sectionsCoverText(DOCUMENT, truncated)).toBe(false);
    });
});

describe("rendering a section", () => {
    it("splits into paragraphs without losing a word", () => {
        const sections = categoriseEula(DOCUMENT);
        for (const section of sections) {
            const words = sectionText(DOCUMENT, section).split(/\s+/).filter(Boolean);
            const rendered = sectionParagraphs(DOCUMENT, section).join(" ").split(/\s+/).filter(Boolean);
            expect(rendered).toEqual(words);
        }
    });

    it("previews a section with an ellipsis rather than a silent cut", () => {
        const sections = categoriseEula(DOCUMENT);
        const first = sections[0];
        expect(first).toBeDefined();
        if (first === undefined) return;
        expect(sectionPreview(DOCUMENT, first, 2)).toMatch(/…$/);
        expect(sectionPreview("Two words", { ...first, start: 0, end: 9 }, 6)).toBe("Two words");
    });
});
