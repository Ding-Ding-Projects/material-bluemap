/**
 * Taking the licence out of the application, with a header that says what you took.
 *
 * An export of part of a legal document is dangerous in one specific way: the file leaves
 * the app, gets read months later by somebody who was not there, and looks exactly like a
 * complete licence. So every export this module produces opens with a header naming the
 * document's address, when this copy was fetched, whether it is the live document or a
 * cached copy or BlueMap's quotation, and - the part that matters most - **which section
 * this file holds and how many sections the document has**.
 *
 * The body is the section's characters, unaltered. `Markdown` here means a header of
 * blockquoted metadata and then the text; it does not mean the clauses are turned into
 * headings, bullets or emphasis. A legal document reformatted into somebody's idea of
 * good Markdown is a legal document that has been edited.
 */

import type { EulaSection } from "./eulaSections.js";
import { sectionText } from "./eulaSections.js";
import type { EulaTextSource } from "./eulaBridge.js";

/** The formats offered. Both carry the same header; only its punctuation differs. */
export const EULA_EXPORT_FORMATS = ["markdown", "text"] as const;
export type EulaExportFormat = (typeof EULA_EXPORT_FORMATS)[number];

export interface EulaExportContext {
    readonly documentUrl: string;
    readonly source: EulaTextSource;
    /** ISO-8601, or null for the fallback wording, which was never fetched. */
    readonly fetchedAt: string | null;
    /** The full document text the sections index into. */
    readonly text: string;
    readonly sections: readonly EulaSection[];
    /** How each label reads in the language the user is running. */
    readonly categoryLabel: (section: EulaSection) => string;
}

/** Every line of the header, in order, as plain sentences a format then punctuates. */
export function exportHeaderLines(
    context: EulaExportContext,
    section: EulaSection | null,
): readonly string[] {
    const position =
        section === null
            ? `The whole document: all ${String(context.sections.length)} sections.`
            : `Section ${String(indexOf(context.sections, section) + 1)} of ${String(
                  context.sections.length,
              )}: ${context.categoryLabel(section)}.`;

    const provenance =
        context.source === "live"
            ? "Fetched from the address above."
            : context.source === "cache"
              ? "A copy the application fetched earlier and kept. It may not be the current wording."
              : "Not Mojang's document. This is the wording BlueMap itself quotes, shown because the document could not be fetched.";

    const when =
        context.fetchedAt === null
            ? "Never fetched."
            : `Fetched at ${context.fetchedAt} (UTC as recorded by the application).`;

    return [
        position,
        `Document: ${context.documentUrl}`,
        provenance,
        when,
        "The sections are this application's navigation over the document. The document itself is authoritative.",
    ];
}

function indexOf(sections: readonly EulaSection[], section: EulaSection): number {
    return sections.findIndex((candidate) => candidate.id === section.id);
}

/**
 * The exported file.
 *
 * `section` null exports the whole document, which is the only export that can honestly
 * be called the licence; every other one says in its first line that it is a part.
 */
export function exportEula(
    context: EulaExportContext,
    section: EulaSection | null,
    format: EulaExportFormat,
): string {
    const header = exportHeaderLines(context, section);
    const body = section === null ? context.text : sectionText(context.text, section);

    if (format === "markdown") {
        return `${header.map((line) => `> ${line}`).join("\n>\n")}\n\n---\n\n${body.trim()}\n`;
    }
    const rule = "-".repeat(72);
    return `${header.join("\n")}\n${rule}\n\n${body.trim()}\n`;
}

/** A filename that says what is inside without needing the file opened. */
export function exportFilename(section: EulaSection | null, format: EulaExportFormat): string {
    const extension = format === "markdown" ? "md" : "txt";
    const part = section === null ? "full" : `${String(section.category)}-${section.id}`;
    return `minecraft-eula-${part}.${extension}`;
}
