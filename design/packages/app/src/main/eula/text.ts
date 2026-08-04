/**
 * Turning Mojang's published EULA page into the text of the EULA.
 *
 * The document at `MOJANG_EULA_URL` is a web page, not a text file: it arrives as HTML
 * wrapped in navigation, cookie banners, a footer and a great deal of script. Showing
 * that raw in a viewer would be showing somebody markup and calling it a licence, so
 * this module extracts the readable text and nothing else.
 *
 * ## Why extraction is allowed to fail, loudly
 *
 * Mojang can restructure that page at any time, and the failure mode of a lenient
 * extractor is the dangerous one: it returns *something*, the viewer renders it, and a
 * person reads four paragraphs of cookie policy believing they have read the licence.
 * So {@link extractDocumentText} is deliberately suspicious of its own output and
 * {@link looksLikeTheEula} states, as checkable conditions, what a plausible result has
 * to contain. A result that fails them is discarded and the caller falls back to the
 * text BlueMap itself quotes, labelled as such - which is honest - rather than to a
 * substitute presented as the real thing, which is not.
 *
 * ## No HTML parser
 *
 * There is no DOM in the main process and pulling in a parser for one page would be a
 * dependency to keep current for the rest of the product's life. The extraction here is
 * a scanner: drop the elements whose content is never prose, turn the block-level tags
 * into line breaks, strip what is left, decode the handful of entities that actually
 * appear in a legal document. It is not a general HTML-to-text converter and does not
 * claim to be one; it is checked against the plausibility rules above before anything
 * downstream is allowed to call the result a licence.
 */

/** Elements whose text content is never part of the document a reader wants. */
const NON_PROSE = /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Tags that end a line. Everything else is inline and joins the text around it. */
const BLOCK_TAG =
    /<\/?(p|div|br|li|ul|ol|tr|td|th|table|section|article|header|footer|nav|h[1-6]|blockquote|pre|hr|main|aside|form|figure|figcaption)\b[^>]*>/gi;

/** Any remaining tag, including comments and doctypes. */
const ANY_TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?[a-z][^>]*>/gi;

/**
 * The named entities a legal document actually contains, plus the four that must be
 * decoded last because decoding them earlier would let `&amp;lt;` become a tag.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
    // An ordinary space rather than U+00A0. Whitespace is normalised straight after
    // this, and a non-breaking space that survived into the text would be a character a
    // search for a two-word phrase then silently fails to match.
    nbsp: " ",
    quot: '"',
    apos: "'",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    copy: "©",
    reg: "®",
    trade: "™",
    deg: "°",
    sect: "§",
    para: "¶",
    middot: "·",
    bull: "•",
    lt: "<",
    gt: ">",
    amp: "&",
};

/** Decodes numeric and the named entities above. Unknown entities are left as written. */
export function decodeEntities(value: string): string {
    return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
        if (body.startsWith("#")) {
            const hex = body[1] === "x" || body[1] === "X";
            const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
            // A code point outside Unicode, or one that is not a number at all, means the
            // source was not what this expected; leaving the entity visible is better than
            // throwing a replacement character into the middle of a licence.
            if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
            return String.fromCodePoint(code);
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    });
}

/**
 * The readable text of an HTML document, with paragraph breaks preserved.
 *
 * Paragraph structure survives because the viewer categorises the document by looking
 * at blank-line-separated blocks. Flattening everything to one line would leave the
 * whole licence as a single unnavigable section, which is the thing the viewer exists
 * to avoid.
 */
export function extractDocumentText(html: string): string {
    // The body only, when there is one. A page's `<head>` holds meta descriptions that
    // read like prose and would otherwise be pulled in above the actual document.
    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    const source = body?.[1] ?? html;

    const withoutNoise = source.replace(NON_PROSE, "\n");
    const withBreaks = withoutNoise.replace(BLOCK_TAG, "\n");
    const stripped = withBreaks.replace(ANY_TAG, "");
    const decoded = decodeEntities(stripped);

    return normaliseWhitespace(decoded);
}

/**
 * Collapses runs of spaces and blank lines without joining paragraphs together.
 *
 * Two newlines are kept because they are the paragraph boundary the categoriser reads;
 * three or more become two, and trailing spaces go, so that two fetches of an unchanged
 * page produce byte-identical text and a "the document changed" check means something.
 */
export function normaliseWhitespace(value: string): string {
    return value
        .replace(/\r\n?/g, "\n")
        .replace(/[^\S\n]+/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** The shortest text this build will accept as a licence rather than as a stub page. */
export const MINIMUM_PLAUSIBLE_LENGTH = 1500;

/**
 * Phrases the Minecraft EULA contains and a navigation shell does not.
 *
 * All of them, not one of them. Any single phrase can appear on a marketing page, and a
 * one-of check is what lets a redirect to a "sorry, this page has moved" notice sail
 * through wearing the word "Minecraft".
 */
export const REQUIRED_PHRASES: readonly string[] = ["minecraft", "you", "mojang"];

export interface PlausibilityVerdict {
    readonly ok: boolean;
    /** Why it was refused, in a sentence the interface can show. Null when accepted. */
    readonly reason: string | null;
}

/**
 * Whether extracted text is plausibly the licence.
 *
 * This is not a proof and does not pretend to be one. It is the line between "Mojang
 * served the document" and "Mojang served something else and we are about to call it the
 * document", and every refusal it produces is shown to the user rather than swallowed,
 * because the alternative to knowing is guessing.
 */
export function looksLikeTheEula(text: string): PlausibilityVerdict {
    const trimmed = text.trim();
    if (trimmed.length < MINIMUM_PLAUSIBLE_LENGTH) {
        return {
            ok: false,
            reason:
                `The page at that address returned ${String(trimmed.length)} characters of text, ` +
                `which is too short to be the licence (at least ${String(MINIMUM_PLAUSIBLE_LENGTH)} ` +
                "would be expected). It was not shown.",
        };
    }

    const lowered = trimmed.toLowerCase();
    const missing = REQUIRED_PHRASES.filter((phrase) => !lowered.includes(phrase));
    if (missing.length > 0) {
        return {
            ok: false,
            reason:
                "The page at that address does not read like the Minecraft EULA: it never mentions " +
                `${missing.join(", ")}. It was not shown.`,
        };
    }

    return { ok: true, reason: null };
}
