/**
 * The console's arithmetic.
 *
 * Everything asserted here is a decision that goes wrong invisibly. A ring that drops a
 * line and does not count it looks exactly like a complete log. A sticky-scroll rule
 * that is one pixel out looks like a console that has stopped updating. A filter that
 * reads an empty selection as "nothing" looks like the render's output has been lost.
 * None of them throws, none of them fails a type check, and none of them is noticed
 * until somebody is already reading the wrong thing.
 */

import { describe, expect, it } from "vitest";
import {
    CONSOLE_LEVELS,
    CONSOLE_LINE_CAP,
    LEVEL_TAGS,
    STICK_THRESHOLD_PX,
    appendLine,
    clockText,
    consoleText,
    countByLevel,
    describeSlice,
    distanceFromBottom,
    isAtBottom,
    normaliseLevel,
    selectRows,
    type ConsoleLevel,
    type ConsoleLine,
    type ConsoleRow,
} from "./consoleModel.js";
import { annotationsFor } from "./annotations.js";

function line(id: number, message: string, level: ConsoleLevel = "info"): ConsoleLine {
    return {
        id,
        level,
        origin: "engine",
        message,
        text: null,
        at: "2026-08-04T09:14:07.000Z",
        annotations: [],
    };
}

function row(value: ConsoleLine): ConsoleRow {
    return { line: value, text: value.message };
}

/* -------------------------------------------------------------------------- */

describe("levels", () => {
    it("reads the four the engine prints, in whichever case they arrive", () => {
        // The CLI prints upper case; the bridge types the field as a plain string, so a
        // build or a test that lower-cases them must not fall into a different colour.
        expect(normaliseLevel("INFO")).toBe("info");
        expect(normaliseLevel("info")).toBe("info");
        expect(normaliseLevel("WARNING")).toBe("warning");
        expect(normaliseLevel("warn")).toBe("warning");
        expect(normaliseLevel("ERROR")).toBe("error");
        expect(normaliseLevel("DEBUG")).toBe("debug");
    });

    it("reads this app's own two", () => {
        expect(normaliseLevel("signal")).toBe("signal");
        expect(normaliseLevel("tip")).toBe("tip");
    });

    it("shows an unrecognised level rather than hiding the line", () => {
        // Hiding a line nobody can classify is the worst possible answer to not knowing
        // what it was: it is still a line the reader needs.
        expect(normaliseLevel("banana")).toBe("info");
        expect(normaliseLevel("")).toBe("info");
    });

    it("gives every level a readable tag, so colour is never the only signal", () => {
        for (const level of CONSOLE_LEVELS) {
            expect(LEVEL_TAGS[level].length, level).toBeGreaterThan(2);
            expect(LEVEL_TAGS[level], level).toBe(LEVEL_TAGS[level].toUpperCase());
        }
    });

    it("counts each level, so the filter can show an honest zero", () => {
        const lines = [line(1, "a", "error"), line(2, "b", "info"), line(3, "c", "info")];

        expect(countByLevel(lines)).toEqual({ error: 1, warning: 0, info: 2, debug: 0, signal: 0, tip: 0 });
    });
});

/* -------------------------------------------------------------------------- */

describe("the ring", () => {
    it("keeps everything until the cap is reached, and drops nothing", () => {
        let lines: readonly ConsoleLine[] = [];
        let dropped = 0;

        for (let n = 0; n < 4; n++) {
            const result = appendLine(lines, line(n, `line ${n}`), 4);
            lines = result.lines;
            dropped += result.dropped;
        }

        expect(lines).toHaveLength(4);
        expect(dropped).toBe(0);
    });

    it("drops from the front once the cap is met, and reports how many", () => {
        // The count is the whole difference between this and the two-hundred-line ring it
        // replaces: that one forgot its own beginning and said nothing about it.
        let lines: readonly ConsoleLine[] = [];
        let dropped = 0;

        for (let n = 0; n < 7; n++) {
            const result = appendLine(lines, line(n, `line ${n}`), 4);
            lines = result.lines;
            dropped += result.dropped;
        }

        expect(lines.map((entry) => entry.message)).toEqual(["line 3", "line 4", "line 5", "line 6"]);
        expect(dropped).toBe(3);
    });

    it("keeps far more than a panel-sized window", () => {
        // The setup warning that explains a failed render is printed in the first seconds
        // of it, which is exactly the part a small ring has already thrown away.
        expect(CONSOLE_LINE_CAP).toBeGreaterThanOrEqual(10_000);
    });

    it("never returns the array it was given, so a caller cannot mutate the old one", () => {
        const before: readonly ConsoleLine[] = [line(1, "a")];
        const after = appendLine(before, line(2, "b"), 10);

        expect(after.lines).not.toBe(before);
        expect(before).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */

describe("sticking to the bottom", () => {
    it("is at the bottom when the content is shorter than the container", () => {
        // An empty console must start attached, or the very first line arrives with the
        // view already declared detached and a jump button already on screen.
        expect(isAtBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 400 })).toBe(true);
    });

    it("is at the bottom when scrolled all the way down", () => {
        expect(isAtBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    });

    it("is still at the bottom a couple of pixels short of it", () => {
        // Sub-pixel layout and a fractional device pixel ratio routinely leave a fully
        // scrolled container reporting one or two pixels short. A threshold of zero turns
        // that into a console that stops following for no visible reason and never starts
        // again.
        expect(distanceFromBottom({ scrollTop: 598, scrollHeight: 1000, clientHeight: 400 })).toBe(2);
        expect(isAtBottom({ scrollTop: 598, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    });

    it("is not at the bottom once somebody has scrolled up to read something", () => {
        // This is the whole rule. Somebody scrolls up to look at an error, the engine
        // prints its next tick a second later, and a console without this yanks them back.
        expect(isAtBottom({ scrollTop: 200, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
    });

    it("puts the boundary exactly where the threshold says", () => {
        const at = (distance: number) =>
            isAtBottom({ scrollTop: 600 - distance, scrollHeight: 1000, clientHeight: 400 });

        expect(at(STICK_THRESHOLD_PX)).toBe(true);
        expect(at(STICK_THRESHOLD_PX + 1)).toBe(false);
    });

    it("reports no negative distance when the browser over-scrolls", () => {
        // Elastic over-scroll on a trackpad reports a scrollTop past the end, which would
        // otherwise make the distance negative and the arithmetic read oddly downstream.
        expect(distanceFromBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 400 })).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */

describe("what is on screen", () => {
    const lines = [
        line(1, "Loading resources...", "info"),
        line(2, "Address already in use", "error"),
        line(3, "Start updating 3 maps ...", "info"),
        line(4, "Stopping...", "warning"),
    ];
    const rows = lines.map(row);
    const all = () => true;

    it("shows everything when no level is chosen", () => {
        // The other reading of an empty set produces an empty console the first time
        // somebody clears the last chip, which looks like the log has been lost.
        expect(selectRows(rows, new Set(), all)).toHaveLength(4);
    });

    it("shows only the chosen levels", () => {
        const chosen = selectRows(rows, new Set<ConsoleLevel>(["error", "warning"]), all);

        expect(chosen.map((entry) => entry.line.id)).toEqual([2, 4]);
    });

    it("composes the level filter with the search rather than letting either win", () => {
        const chosen = selectRows(rows, new Set<ConsoleLevel>(["info"]), (text) => text.includes("maps"));

        expect(chosen.map((entry) => entry.line.id)).toEqual([3]);
    });

    it("matches this app's advice as well as the engine's line", () => {
        // A reader who searches for a word they can see on screen and gets nothing back
        // concludes the search is broken, and they are right to.
        const annotated: ConsoleLine = {
            ...line(9, "Address already in use", "error"),
            annotations: annotationsFor("Address already in use"),
        };

        const chosen = selectRows(
            [row(annotated)],
            new Set(),
            (text) => text.includes("orphan"),
            (annotation) => `an orphaned process may still hold it (${annotation.kind})`,
        );

        expect(chosen).toHaveLength(1);
    });

    it("returns nothing when nothing matches, rather than falling back to everything", () => {
        expect(selectRows(rows, new Set(), (text) => text.includes("nowhere"))).toHaveLength(0);
    });
});

/* -------------------------------------------------------------------------- */

describe("the clock column", () => {
    it("shows the time out of the instant the event carried", () => {
        // Thirty characters of ISO in front of every line pushes the engine's own message
        // off the right of a narrow window, and the date is the same for every line.
        expect(clockText("2026-08-04T09:14:07.000Z")).toBe("09:14:07");
    });

    it("passes anything else through rather than blanking the column", () => {
        expect(clockText("12:40:33")).toBe("12:40:33");
        expect(clockText("t0")).toBe("t0");
    });
});

/* -------------------------------------------------------------------------- */

describe("taking the console away", () => {
    it("writes each line with its time, its level and its text", () => {
        const text = consoleText([row(line(1, "Loading resources...", "info"))], () => "");

        expect(text).toBe("2026-08-04T09:14:07.000Z INFO   Loading resources...");
    });

    it("indents this app's advice behind a marker, so the two are still told apart", () => {
        const annotated: ConsoleLine = {
            ...line(2, "Address already in use", "error"),
            annotations: annotationsFor("Address already in use"),
        };

        const text = consoleText([row(annotated)], () => "Material BlueMap: something already has that port.");

        expect(text.split("\n")[0]).toContain("Address already in use");
        expect(text.split("\n")[1]).toContain("> Material BlueMap: something already has that port.");
    });

    it("puts the header first, because an export that does not say what it covers misleads", () => {
        const text = consoleText([row(line(1, "a"))], () => "", "# header");

        expect(text.startsWith("# header\n")).toBe(true);
    });

    it("writes no leading blank line when there is no header", () => {
        expect(consoleText([row(line(1, "a"))], () => "").startsWith("2026")).toBe(true);
    });

    it("says a slice is filtered exactly when fewer lines went out than were held", () => {
        expect(describeSlice(40, 40, 0).filtered).toBe(false);
        expect(describeSlice(12, 40, 0).filtered).toBe(true);
    });

    it("carries the dropped count into the summary, so the export can admit to it", () => {
        const slice = describeSlice(40, 40, 118, 10_000);

        expect(slice.dropped).toBe(118);
        expect(slice.cap).toBe(10_000);
    });
});
