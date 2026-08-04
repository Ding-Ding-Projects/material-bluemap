/**
 * Navigation over Mojang's document, and nothing else.
 *
 * The viewer shows a legal text in tabs so that "what may I not do with this file" is one
 * click rather than a scroll through everything. That is a genuine improvement and it is
 * also the most dangerous thing this feature could do, because every plausible way of
 * building it quietly rewrites the document: summarising a clause, reordering paragraphs
 * so a category reads coherently, dropping a sentence that fits two categories, or
 * translating a heading and rendering the translation instead of the heading.
 *
 * So this module never handles text. It handles **offsets**.
 *
 * A section is a half-open range `[start, end)` into the source string. The ranges are
 * contiguous, ordered, and cover the whole document from index 0 to `text.length`, which
 * makes the safety property structural rather than a promise: `sections` cannot omit a
 * word because every index belongs to exactly one range, and it cannot reorder a word
 * because the ranges are produced in ascending order and rendered in the order they are
 * produced. {@link sectionsCoverText} states that as a checkable condition and
 * `eulaSections.test.ts` asserts the concatenation is byte-identical to the source.
 *
 * The categories are this application's labels for ranges of somebody else's document.
 * They are shown as such - the viewer says so at the top, in a sentence the funny level
 * cannot reach - and the document itself remains the authority. A category that is wrong
 * is a navigation aid that is wrong; it is not a claim about what the licence says.
 *
 * ## Why grouping runs rather than one section per paragraph
 *
 * One tab per paragraph would be forty tabs and no navigation at all. So consecutive
 * blocks that score into the same category become one section, and a heading always
 * starts a new one. Both rules only ever *merge or split adjacent ranges*, which is why
 * neither can break the coverage property above.
 */

/** The categories this build sorts a licence into, in a stable order. */
export const EULA_CATEGORIES = [
    "overview",
    "permitted",
    "prohibited",
    "ownership",
    "changes",
    "termination",
    "liability",
    "other",
] as const;

export type EulaCategory = (typeof EULA_CATEGORIES)[number];

export function isEulaCategory(value: unknown): value is EulaCategory {
    return typeof value === "string" && (EULA_CATEGORIES as readonly string[]).includes(value);
}

/** One contiguous range of the source document, with the label this app gave it. */
export interface EulaSection {
    /** Stable within one document, so a tab keeps pointing at the same range. */
    readonly id: string;
    readonly category: EulaCategory;
    /** The document's own heading line that opened this range, or null when it had none. */
    readonly heading: string | null;
    /** Inclusive start index into the source string. */
    readonly start: number;
    /** Exclusive end index into the source string. */
    readonly end: number;
}

/**
 * A block of the document, with the exact offsets it occupies.
 *
 * The whitespace *between* blocks belongs to the block that follows it, which is what
 * lets the section ranges tile the string with no gaps: every character, including every
 * blank line, is inside exactly one block and therefore inside exactly one section.
 */
export interface EulaBlock {
    readonly start: number;
    readonly end: number;
    /** The block's text with surrounding whitespace removed, for classification only. */
    readonly text: string;
    readonly heading: boolean;
}

/**
 * Splits the document into blank-line separated blocks that tile the whole string.
 *
 * `start` of the first block is always 0 and `end` of the last is always `text.length`,
 * including any leading or trailing whitespace, so nothing falls between blocks.
 */
export function splitBlocks(text: string): readonly EulaBlock[] {
    if (text.length === 0) return [];

    const cuts: number[] = [0];
    // A run of two or more newlines (with any spaces among them) separates blocks. The
    // separator is kept inside the block that precedes it rather than discarded, so every
    // character of the document - blank lines included - belongs to exactly one block.
    const separator = /\n[^\S\n]*\n\s*/g;

    let match: RegExpExecArray | null;
    while ((match = separator.exec(text)) !== null) {
        const end = match.index + match[0].length;
        if (end > (cuts.at(-1) ?? 0) && end < text.length) cuts.push(end);
    }

    const blocks: EulaBlock[] = [];
    for (let index = 0; index < cuts.length; index++) {
        const start = cuts[index] ?? 0;
        const end = cuts[index + 1] ?? text.length;
        const block = makeBlock(text, start, end);
        // A block that is nothing but whitespace - a document opening with blank lines,
        // or an extra gap between clauses - is folded into the block after it rather than
        // becoming a tab containing no words. Extending the neighbour keeps the ranges
        // contiguous, which is the property everything else here depends on.
        const previous = blocks.at(-1);
        if (block.text.length === 0 && index + 1 < cuts.length) {
            cuts[index + 1] = start;
            continue;
        }
        if (block.text.length === 0 && previous !== undefined) {
            blocks[blocks.length - 1] = { ...previous, end: block.end };
            continue;
        }
        blocks.push(block);
    }

    return blocks;
}

function makeBlock(text: string, start: number, end: number): EulaBlock {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    return { start, end, text: trimmed, heading: looksLikeHeading(trimmed) };
}

/**
 * Whether a block is the document's own heading rather than a clause.
 *
 * Deliberately conservative. A false positive splits a section in two, which costs the
 * reader an extra tab; a false negative merges two sections, which costs them a longer
 * scroll. Both are navigation costs and neither changes a word, so this is allowed to be
 * a heuristic in a way that nothing else in this feature is.
 */
export function looksLikeHeading(block: string): boolean {
    if (block.length === 0 || block.length > 120) return false;
    if (block.includes("\n")) return false;
    // A sentence ends in punctuation; a heading almost never does. A colon is the
    // exception, because "You may not:" introduces a list and heads it.
    if (/[.!?;,]$/.test(block)) return false;

    const words = block.split(/\s+/);
    if (words.length > 14) return false;

    // Numbered clause headings ("3. Ownership", "SECTION 4 - TERMINATION") and shouted
    // headings are the two shapes a legal document actually uses.
    if (/^(?:section\s+)?\d+(?:\.\d+)*[.)]?\s+\S/i.test(block)) return true;
    const letters = block.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 3 && letters === letters.toUpperCase()) return true;

    // Title case with no terminal punctuation, and short.
    return words.length <= 8 && /^[A-Z]/.test(block);
}

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The words that put a block in a category, and what each is worth.
 *
 * Phrases rather than single words wherever a single word would be ambiguous: "you may"
 * appears in both the permitted and prohibited clauses of every licence ever written, so
 * the negated forms are matched first and scored higher. The scores are small integers
 * because the ordering between them is the only thing that matters; the absolute values
 * are meaningless.
 */
const SIGNALS: Readonly<Record<EulaCategory, readonly (readonly [RegExp, number])[]>> = {
    overview: [
        [/\bthis (?:agreement|licence|license|eula)\b/i, 2],
        [/\bby (?:using|installing|downloading|accepting)\b/i, 3],
        [/\bdefinitions?\b/i, 2],
        [/\bapplies to\b/i, 2],
    ],
    permitted: [
        [/\byou (?:may|can|are allowed to|are free to)\b(?!\s*not)/i, 3],
        [/\bwe (?:grant|give) you\b/i, 3],
        [/\bpermitted\b/i, 2],
        [/\bpersonal,? non-?commercial\b/i, 2],
    ],
    prohibited: [
        [/\byou (?:may|must|can|shall) not\b/i, 5],
        [/\bdo not\b/i, 2],
        [/\bprohibit(?:ed|ion)?\b/i, 4],
        [/\bnot allowed\b/i, 4],
        [/\bwithout our (?:prior )?(?:written )?permission\b/i, 3],
        [/\bredistribut/i, 2],
        [/\breverse engineer\b/i, 3],
    ],
    ownership: [
        [/\b(?:we|mojang|microsoft) own\b/i, 5],
        [/\bintellectual property\b/i, 4],
        [/\bcopyright\b/i, 3],
        [/\btrademarks?\b/i, 3],
        [/\bbelongs? to (?:us|mojang|microsoft)\b/i, 4],
        [/\byour (?:account|content)\b/i, 2],
    ],
    changes: [
        [/\bwe (?:may|can|reserve the right to) (?:change|update|amend|modify|revise)\b/i, 5],
        [/\bchanges to (?:this|the) (?:agreement|licence|license|eula)\b/i, 5],
        [/\bupdates?\b/i, 2],
        [/\bfrom time to time\b/i, 2],
    ],
    termination: [
        [/\btermination\b/i, 5],
        [/\bterminate\b/i, 4],
        [/\bstop (?:you )?(?:from )?using\b/i, 3],
        [/\bsuspend\b/i, 3],
        [/\bcancel (?:your )?account\b/i, 3],
    ],
    liability: [
        [/\bwarrant(?:y|ies)\b/i, 4],
        [/\bliab(?:le|ility)\b/i, 4],
        [/\bas is\b/i, 3],
        [/\bindemnif/i, 3],
        [/\bgoverning law\b/i, 3],
        [/\bdisclaim/i, 3],
    ],
    other: [],
};

/**
 * The category a block reads as, or `other` when nothing scores.
 *
 * Ties are broken by {@link EULA_CATEGORIES} order rather than by whichever regular
 * expression happened to run first, so the same document always produces the same tabs -
 * a licence whose sections shuffled between launches would be a licence nobody could
 * cite.
 */
export function categoriseBlock(block: string): EulaCategory {
    let best: EulaCategory = "other";
    let bestScore = 0;

    for (const category of EULA_CATEGORIES) {
        let score = 0;
        for (const [pattern, weight] of SIGNALS[category]) {
            if (pattern.test(block)) score += weight;
        }
        if (score > bestScore) {
            best = category;
            bestScore = score;
        }
    }

    return best;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The document, as contiguous ranges in document order.
 *
 * An empty document produces no sections at all rather than one empty one, so the viewer
 * shows its own honest empty state instead of a tab containing nothing.
 */
export function categoriseEula(text: string): readonly EulaSection[] {
    const blocks = splitBlocks(text);
    if (blocks.length === 0) return [];

    const sections: EulaSection[] = [];
    let current: { category: EulaCategory; heading: string | null; start: number; end: number } | null = null;
    /** The category a heading imposed, which its following blocks inherit. */
    let headingCategory: EulaCategory | null = null;

    for (const block of blocks) {
        if (block.heading) {
            if (current !== null) sections.push(finish(current, sections.length));
            headingCategory = categoriseBlock(block.text);
            current = {
                category: headingCategory,
                heading: block.text,
                start: block.start,
                end: block.end,
            };
            continue;
        }

        // A block under a heading takes the heading's category unless it scores into one
        // of its own, which is how a numbered clause list under "3. Your content" still
        // separates the things you may do from the things you may not.
        const own = categoriseBlock(block.text);
        const category = own === "other" ? (headingCategory ?? "other") : own;

        if (current !== null && current.category === category) {
            current.end = block.end;
            continue;
        }

        if (current !== null) sections.push(finish(current, sections.length));
        current = { category, heading: null, start: block.start, end: block.end };
    }

    if (current !== null) sections.push(finish(current, sections.length));

    // The last range always runs to the end of the string. Trailing whitespace after the
    // final block would otherwise be the one part of the document no tab contains.
    const last = sections.at(-1);
    if (last !== undefined && last.end !== text.length) {
        sections[sections.length - 1] = { ...last, end: text.length };
    }

    return sections;
}

function finish(
    current: { category: EulaCategory; heading: string | null; start: number; end: number },
    index: number,
): EulaSection {
    return {
        id: `eula-section-${String(index + 1)}`,
        category: current.category,
        heading: current.heading,
        start: current.start,
        end: current.end,
    };
}

/** The exact characters a section covers. Never transformed, never trimmed. */
export function sectionText(text: string, section: EulaSection): string {
    return text.slice(section.start, section.end);
}

/**
 * Whether the sections really are navigation over the document rather than a rewrite of it.
 *
 * Four conditions, all of which have to hold: the first range starts at 0, the last ends
 * at `text.length`, each range starts exactly where the previous one ended, and the
 * concatenation is byte-identical to the source. The fourth follows from the first three
 * and is checked anyway, because it is the property somebody actually cares about and a
 * proof by construction is only as good as the construction.
 */
export function sectionsCoverText(text: string, sections: readonly EulaSection[]): boolean {
    if (sections.length === 0) return text.length === 0;

    let expected = 0;
    for (const section of sections) {
        if (section.start !== expected) return false;
        if (section.end < section.start) return false;
        expected = section.end;
    }
    if (expected !== text.length) return false;

    return sections.map((section) => sectionText(text, section)).join("") === text;
}

/**
 * The paragraphs of one section, for rendering.
 *
 * Splitting on blank lines and rendering one element each is the only interpretation this
 * feature applies to the text, and it adds and removes nothing: the pieces joined back
 * together with their separators are the section, which `eulaSections.test.ts` checks.
 */
export function sectionParagraphs(text: string, section: EulaSection): readonly string[] {
    return sectionText(text, section)
        .split(/\n[^\S\n]*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0);
}

/**
 * A short label for a section when the document gave it no heading.
 *
 * The first few words of the range, so the tab names something the reader will recognise
 * when they get there. It is truncated with an ellipsis rather than silently cut, because
 * a tab label that looks like a complete phrase but is not is a small lie in a surface
 * whose whole point is not telling any.
 */
export function sectionPreview(text: string, section: EulaSection, words = 6): string {
    const source = sectionText(text, section).trim().split(/\s+/).filter(Boolean);
    if (source.length === 0) return "";
    const head = source.slice(0, words).join(" ");
    return source.length > words ? `${head}…` : head;
}
