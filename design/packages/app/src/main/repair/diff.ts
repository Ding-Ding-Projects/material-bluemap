/**
 * Showing what an automatic change actually did, line by line.
 *
 * Every edit the repair pass applies is shown afterwards as a diff. That is not decoration:
 * a program that edits somebody's config while they are looking at an error message has to
 * be able to answer "what did you change?" in a form they can read in five seconds and
 * disagree with. A summary sentence cannot do that, because the sentence is written by the
 * same thing that made the change.
 *
 * The format is a unified diff with a fixed amount of context, which is the one diff format
 * every developer already reads and which pastes into an issue unchanged. It is generated
 * from a longest-common-subsequence table: config files are kilobytes, so the quadratic
 * table is a few thousand cells and finishes instantly, and the alternative - a
 * line-by-line comparison that gives up on the first difference - renders a one-line
 * insertion as "every line after this changed".
 */

/** Lines of context either side of a change. Three is `diff -u`'s own default. */
export const DIFF_CONTEXT = 3;

/**
 * Bigger than any config file, and small enough that the table below stays cheap.
 *
 * A pair of files past this is rendered as a whole-file replacement instead. That is a
 * worse diff, and it is still an honest one - unlike an operation that takes long enough
 * to look like a hang.
 */
export const MAX_DIFF_LINES = 4000;

type Step = "same" | "added" | "removed";

interface Change {
    readonly step: Step;
    readonly text: string;
}

function splitLines(text: string): string[] {
    const normalised = text.replace(/\r\n/g, "\n");
    const lines = normalised.split("\n");
    // A trailing newline produces an empty last element that is not a line anybody wrote.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
}

/** The change list between two line arrays, by longest common subsequence. */
export function lineChanges(before: readonly string[], after: readonly string[]): Change[] {
    const rows = before.length;
    const columns = after.length;

    // `(rows + 1) * (columns + 1)` in one flat array rather than an array of arrays: the
    // indexing is the same and it does not allocate a few thousand objects to compare two
    // config files.
    const width = columns + 1;
    const table = new Int32Array((rows + 1) * width);
    for (let row = rows - 1; row >= 0; row--) {
        for (let column = columns - 1; column >= 0; column--) {
            table[row * width + column] =
                before[row] === after[column]
                    ? (table[(row + 1) * width + column + 1] ?? 0) + 1
                    : Math.max(table[(row + 1) * width + column] ?? 0, table[row * width + column + 1] ?? 0);
        }
    }

    const changes: Change[] = [];
    let row = 0;
    let column = 0;
    while (row < rows && column < columns) {
        if (before[row] === after[column]) {
            changes.push({ step: "same", text: before[row] ?? "" });
            row++;
            column++;
        } else if ((table[(row + 1) * width + column] ?? 0) >= (table[row * width + column + 1] ?? 0)) {
            changes.push({ step: "removed", text: before[row] ?? "" });
            row++;
        } else {
            changes.push({ step: "added", text: after[column] ?? "" });
            column++;
        }
    }
    for (; row < rows; row++) changes.push({ step: "removed", text: before[row] ?? "" });
    for (; column < columns; column++) changes.push({ step: "added", text: after[column] ?? "" });
    return changes;
}

/**
 * A unified diff of one file, or an empty string when nothing changed.
 *
 * An empty result is meaningful and is checked by the caller: a repair that wrote a file
 * byte-for-byte identical to the one already there has changed nothing, and reporting it
 * as a change would put a row in the history panel for an event that did not happen.
 */
export function unifiedDiff(path: string, before: string | null, after: string): string {
    if (before === after) return "";

    const beforeLines = before === null ? [] : splitLines(before);
    const afterLines = splitLines(after);

    const header = [`--- ${before === null ? "/dev/null" : `a/${path}`}`, `+++ b/${path}`];

    if (beforeLines.length + afterLines.length > MAX_DIFF_LINES) {
        return [
            ...header,
            `@@ -1,${String(beforeLines.length)} +1,${String(afterLines.length)} @@`,
            ...beforeLines.map((line) => `-${line}`),
            ...afterLines.map((line) => `+${line}`),
        ].join("\n");
    }

    const changes = lineChanges(beforeLines, afterLines);

    // Where every change sits in the change list. Hunks are then just runs of these that
    // are close enough together that their context windows touch, which is how `diff -u`
    // decides the same thing - and it is far easier to get right than walking the list
    // once and trying to open and close hunks as it goes.
    const changed: number[] = [];
    for (const [index, change] of changes.entries()) {
        if (change.step !== "same") changed.push(index);
    }
    if (changed.length === 0) return "";

    // The line number each entry sits on, in each file. An added line does not advance
    // the "before" counter and a removed line does not advance the "after" one, which is
    // the whole of the arithmetic a hunk header needs.
    const beforeAt: number[] = [];
    const afterAt: number[] = [];
    let beforeLine = 1;
    let afterLine = 1;
    for (const change of changes) {
        beforeAt.push(beforeLine);
        afterAt.push(afterLine);
        if (change.step !== "added") beforeLine++;
        if (change.step !== "removed") afterLine++;
    }

    const body: string[] = [];
    let group = 0;
    while (group < changed.length) {
        const first = changed[group] ?? 0;
        let last = first;
        let next = group + 1;
        while (next < changed.length && (changed[next] ?? 0) - last <= DIFF_CONTEXT * 2) {
            last = changed[next] ?? last;
            next++;
        }

        const from = Math.max(0, first - DIFF_CONTEXT);
        const to = Math.min(changes.length, last + DIFF_CONTEXT + 1);

        const lines: string[] = [];
        let beforeCount = 0;
        let afterCount = 0;
        for (let index = from; index < to; index++) {
            const entry = changes[index];
            if (entry === undefined) continue;
            if (entry.step === "same") {
                lines.push(` ${entry.text}`);
                beforeCount++;
                afterCount++;
            } else if (entry.step === "removed") {
                lines.push(`-${entry.text}`);
                beforeCount++;
            } else {
                lines.push(`+${entry.text}`);
                afterCount++;
            }
        }

        // A hunk that adds to an empty file starts at line 0 in the original, which is
        // what `diff -u` writes for a file that had no such line.
        const startBefore = beforeCount === 0 ? 0 : (beforeAt[from] ?? 1);
        const startAfter = afterCount === 0 ? 0 : (afterAt[from] ?? 1);
        body.push(
            `@@ -${String(startBefore)},${String(beforeCount)} +${String(startAfter)},${String(afterCount)} @@`,
            ...lines,
        );
        group = next;
    }

    return [...header, ...body].join("\n");
}

/** How many lines a diff adds and removes, for a one-line summary beside it. */
export function diffCounts(diff: string): { readonly added: number; readonly removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of diff.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) added++;
        else if (line.startsWith("-") && !line.startsWith("---")) removed++;
    }
    return { added, removed };
}
