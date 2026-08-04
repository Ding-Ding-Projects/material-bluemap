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
const ENTRY = /^-\s+(.+?)(?:\s+-\s+\[`([0-9a-f]{7,40})`\]\((https:\/\/[^)]+\/commit\/[0-9a-f]+)\))?\s*$/i;

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
        rows.push({
            id: `${version}:${category}:${rows.length}`,
            version,
            date,
            category,
            subject,
            commit: entryMatch[2] ?? null,
            commitUrl: entryMatch[3] ?? null,
        });
    }
    return rows;
}
