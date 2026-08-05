/**
 * `design/HANDOFF.md` states, twice, how many issues this pass closed as a spelled-out
 * number beside the `#28` through `#47` range that is supposed to back it up. Nothing
 * mechanical kept those in step, and they drifted: the prose said "eighteen" for a range
 * that is twenty issues wide (47 - 28 + 1 = 20), wrong from the moment it was written.
 *
 * This does not hardcode "twenty" — it recomputes the range arithmetic from whatever two
 * issue numbers the document actually cites and checks the spelled-out count against that,
 * so a future edit to the range (or another typo in the count) is still caught.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const NUMBER_WORDS: Readonly<Record<string, number>> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    "twenty-one": 21,
    "twenty-two": 22,
    "twenty-three": 23,
    "twenty-four": 24,
    "twenty-five": 25,
    "twenty-six": 26,
    "twenty-seven": 27,
    "twenty-eight": 28,
    "twenty-nine": 29,
    thirty: 30,
};

// A hard-wrapped markdown paragraph puts arbitrary whitespace (including a line break)
// between "through" and the second issue number, so the gap is matched with [\s\S] rather
// than a literal space.
const CLAIM_PATTERN =
    /([a-z-]+) closed across this pass, `#(\d+)` through[\s\S]{0,40}?`#(\d+)`/gi;

function repoRoot(): string {
    // packages/site/src/content -> src -> site -> packages -> design -> repo root.
    return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
}

function handoffText(): string {
    return readFileSync(resolve(repoRoot(), "design/HANDOFF.md"), "utf8");
}

describe("HANDOFF.md issue-count arithmetic", () => {
    it("finds at least one 'N closed across this pass, #A through #B' claim to check", () => {
        const matches = [...handoffText().matchAll(CLAIM_PATTERN)];
        expect(matches.length).toBeGreaterThan(0);
    });

    it("makes every spelled-out closed count match its own cited issue range", () => {
        const matches = [...handoffText().matchAll(CLAIM_PATTERN)];
        for (const match of matches) {
            const [claim, word, lowStr, highStr] = match;
            const low = Number(lowStr);
            const high = Number(highStr);
            const expectedCount = high - low + 1;
            const spelledCount = word === undefined ? undefined : NUMBER_WORDS[word.toLowerCase()];
            expect(spelledCount, `unrecognised number word "${word}" in: ${claim}`).toBeDefined();
            expect(
                spelledCount,
                `"${claim}" says ${word} but #${low} through #${high} is ${expectedCount} issues`
            ).toBe(expectedCount);
        }
    });
});
