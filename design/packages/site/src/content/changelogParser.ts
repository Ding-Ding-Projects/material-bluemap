export interface ParsedChangeEntry {
    readonly id: string;
    readonly version: string;
    readonly date: string;
    readonly category: string;
    readonly subject: string;
    readonly commit: string | null;
    readonly commitUrl: string | null;
}
const VERSION = /^##\s+(.+?)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
const CATEGORY = /^###\s+(.+)$/;
/**
 * `scripts/build-changelog.mjs`'s `renderMarkdownEntry` emits one of two shapes for a `- ` line:
 *
 *   - `SUBJECT - [\`sha\`](url)`
 *   - `SUBJECT - [\`sha\`](url) _(summary of N commits, also listed here)_`  (merge commits)
 *
 * The second shape used to defeat this regex entirely: the commit link was only ever matched
 * when it was the last thing on the line, so a merge entry's trailing `_(summary...)_` prose
 * made the whole optional group fail, and the raw `- [\`sha\`](url)` markdown stayed embedded
 * in `subject` instead of being extracted. Capturing whatever text follows the link (group 4)
 * instead of requiring the line to end there fixes that without loosening the SHA pattern
 * itself - a wrong SHA is worse than none, so the hex-in-backticks-then-`/commit/`-URL shape
 * stays exact; only what is allowed to trail it has changed.
 */
const ENTRY = /^-\s+(.+?)(?:\s+-\s+\[`([0-9a-f]{7,40})`\]\((https:\/\/[^)]+\/commit\/[0-9a-f]+)\)(.*))?\s*$/i;

export function parseChangelog(markdown: string): readonly ParsedChangeEntry[] {
    let version = "Unreleased";
    let date = "";
    let category = "Changes";
    const rows: ParsedChangeEntry[] = [];
    for (const line of markdown.split(/\r?\n/)) {
        const versionMatch = VERSION.exec(line);
        if (versionMatch !== null) {
            version = versionMatch[1] ?? "Unreleased";
            date = versionMatch[2] ?? "";
            category = "Changes";
            continue;
        }
        const categoryMatch = CATEGORY.exec(line);
        if (categoryMatch !== null) {
            category = categoryMatch[1] ?? "Changes";
            continue;
        }
        const entryMatch = ENTRY.exec(line);
        if (entryMatch === null) continue;
        const subject = entryMatch[1]?.trim();
        if (subject === undefined || subject === "") continue;
        // Prose after the commit link (a merge's "_(summary of N commits...)_") is real
        // content, not markup to discard - fold it back onto the subject rather than
        // swallowing it or leaving the raw link syntax sitting in the rendered text.
        const trailing = entryMatch[4]?.trim();
        const fullSubject = trailing !== undefined && trailing !== "" ? `${subject} ${trailing}` : subject;
        rows.push({
            id: `${version}:${category}:${rows.length}`,
            version,
            date,
            category,
            subject: fullSubject,
            commit: entryMatch[2] ?? null,
            commitUrl: entryMatch[3] ?? null,
        });
    }
    return rows;
}
