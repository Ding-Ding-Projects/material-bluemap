/**
 * A static complexity guard against catastrophic backtracking.
 *
 * Every search bar in this app compiles its pattern with the host runtime's own
 * `RegExp` and runs it on the thread that draws the interface. That is the right
 * engine to use, because it is the engine the search itself runs, but it comes
 * with one property that no amount of care around the call site can fix: a single
 * `exec()` call cannot be interrupted. Once the engine enters an exponential
 * backtrack there is no timer, no `AbortSignal` and no cooperative yield that will
 * get the thread back. The window stops repainting until the pattern finishes,
 * which for `(a+)+$` against a few thousand characters is not a length of time
 * anybody will wait through.
 *
 * The three engine adapters each cap their pattern length, their sample length,
 * their match count and their wall clock between matches. Those bounds are real
 * and they are worth having, but they do not cover this case and the arithmetic
 * says why: the settings adapter allows a 20000-character sample, and `(a+)+$`
 * against twenty thousand `a`s is 2^20000 steps. A budget checked *between*
 * matches is never reached, because the first match never returns. Capping the
 * inputs bounds a polynomial pattern and does nothing at all to an exponential
 * one.
 *
 * So the pattern is inspected before it is compiled, and a shape that is known to
 * blow up is refused with an explicit reason rather than run. Refusing is a real
 * cost — a user who genuinely wanted `(\w+\s*)+` is told no — and it is the right
 * trade against a frozen window with no way back, because the same intent is
 * almost always expressible in a form that does not backtrack (`\w+\s*` here).
 * The refusal says so in as many words rather than reporting a bare failure.
 *
 * ### What is detected, and what deliberately is not
 *
 * Two shapes, both chosen because they are the classic exponential cases and both
 * because a realistic search query does not accidentally take either form:
 *
 * - **A nested unbounded quantifier.** A group repeated by `*`, `+` or `{n,}`
 *   whose body already contains an unbounded repetition: `(a+)+`, `(a*)*`,
 *   `([a-z]+)*`, `((a+)b)+`. Every one of these gives the engine an exponential
 *   number of ways to divide the same input between the two quantifiers.
 * - **A repeated group with two identical alternatives.** `(a|a)+`, where each
 *   character can be consumed by either branch, so the branch choices multiply.
 *   Identity is compared literally, so `(a|b)+` and `(foo|bar)*` — patterns people
 *   really write — are left alone.
 *
 * Overlapping-but-unequal alternatives (`(a|ab)+`) are not detected. Deciding
 * whether two branches can match the same text is the ambiguity problem for
 * regular expressions, and an approximation of it would refuse ordinary patterns.
 * That gap is stated rather than papered over: this is a guard against the shapes
 * that make a search bar hang in practice, not a proof of termination.
 *
 * Nothing here is a substitute for the adapters' own limits. Those still bound a
 * pattern that is merely slow; this bounds a pattern that would never finish.
 */

/** What the guard concluded about a pattern. */
export interface RiskReport {
    /** True when compiling and running this pattern could hang the interface. */
    readonly risky: boolean;
    /** Why, in words a person can act on. Null when the pattern is fine. */
    readonly reason: string | null;
}

const SAFE: RiskReport = { risky: false, reason: null };

interface Quantifier {
    /** Characters consumed, including a trailing lazy `?`. */
    readonly length: number;
    /** True for `*`, `+` and `{n,}`, which have no upper bound. */
    readonly unbounded: boolean;
}

/** `{n}`, `{n,}` or `{n,m}` at the start of the string, and nothing else. */
const BRACED = /^\{(\d+)(,(\d*))?\}/;

/**
 * The quantifier starting at `index`, or null when there is none there.
 *
 * A trailing `?` is folded in rather than left to be read as a quantifier of its
 * own, because `a+?` is one lazy repetition and not a `+` followed by an optional
 * nothing. Laziness changes which match is preferred and not how many ways there
 * are to find one, so it does not change `unbounded`.
 */
function quantifierAt(pattern: string, index: number): Quantifier | null {
    const ch = pattern[index];
    if (ch === undefined) return null;

    if (ch === "*" || ch === "+") {
        const lazy = pattern[index + 1] === "?" ? 1 : 0;
        return { length: 1 + lazy, unbounded: true };
    }

    if (ch === "?") {
        const lazy = pattern[index + 1] === "?" ? 1 : 0;
        return { length: 1 + lazy, unbounded: false };
    }

    if (ch === "{") {
        const braced = BRACED.exec(pattern.slice(index));
        // An unmatched `{` is a literal brace in ECMAScript, not a broken
        // quantifier, so a pattern such as `\{v\}` must fall through untouched.
        if (braced === null) return null;
        const lazy = pattern[index + braced[0].length] === "?" ? 1 : 0;
        // `{2,}` has an open upper bound; `{2}` and `{2,5}` do not.
        const unbounded = braced[2] !== undefined && (braced[3] ?? "") === "";
        return { length: braced[0].length + lazy, unbounded };
    }

    return null;
}

/** One `(...)` being read, with the branches seen so far. */
interface Frame {
    /** Where the current alternative began, so `|` and `)` can slice it out. */
    branchStart: number;
    /** Every alternative of this group, filled in as each one closes. */
    readonly branches: string[];
    /** True once anything inside this group repeats without an upper bound. */
    unbounded: boolean;
}

/** True when two alternatives of the same group are written identically. */
function hasIdenticalBranches(branches: readonly string[]): boolean {
    if (branches.length < 2) return false;
    const seen = new Set<string>();
    for (const branch of branches) {
        const trimmed = branch.trim();
        // Two empty branches (`(a||b)`) are a redundancy rather than a blow-up:
        // an empty alternative matches once, at one position, and adds no choice
        // the engine has to explore repeatedly.
        if (trimmed === "") continue;
        if (seen.has(trimmed)) return true;
        seen.add(trimmed);
    }
    return false;
}

const NESTED =
    "This pattern nests one unbounded repetition inside another, which can take " +
    "exponential time on text that does not match. Repeat the inner part only, " +
    "for example a+ rather than (a+)+.";

const AMBIGUOUS =
    "This pattern repeats a group whose alternatives are identical, which gives " +
    "the engine an exponential number of ways to match the same text. Remove the " +
    "duplicate alternative.";

/**
 * Reads a pattern for the shapes that backtrack exponentially.
 *
 * A single left-to-right pass, which is enough because both shapes are decided at
 * the moment a group closes: everything that could make the group ambiguous has
 * already been seen, and the quantifier that repeats it is the next token. The
 * pattern is treated as text rather than parsed into a tree, so it is analysed
 * whether or not `RegExp` would accept it; an invalid pattern that happens to look
 * risky is refused here and would have been refused by the compiler a line later
 * anyway, with a different sentence.
 *
 * Escapes and character classes are skipped so that `\(`, `\+` and `[+*]` are read
 * as the literals they are. Without that, `[a-z+]` would look like a quantifier
 * and every pattern containing a class of punctuation would be refused.
 */
export function inspectPattern(pattern: string): RiskReport {
    const stack: Frame[] = [];
    let inClass = false;

    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];

        if (ch === "\\") {
            i++;
            continue;
        }

        if (inClass) {
            if (ch === "]") inClass = false;
            continue;
        }

        if (ch === "[") {
            inClass = true;
            continue;
        }

        if (ch === "(") {
            stack.push({ branchStart: i + 1, branches: [], unbounded: false });
            continue;
        }

        if (ch === "|") {
            const frame = stack.at(-1);
            if (frame !== undefined) {
                frame.branches.push(pattern.slice(frame.branchStart, i));
                frame.branchStart = i + 1;
            }
            continue;
        }

        if (ch === ")") {
            const frame = stack.pop();
            // An unbalanced `)` is a syntax error the compiler will report; there
            // is nothing to conclude about risk from it.
            if (frame === undefined) continue;
            frame.branches.push(pattern.slice(frame.branchStart, i));

            const quantifier = quantifierAt(pattern, i + 1);
            if (quantifier !== null && quantifier.unbounded) {
                if (frame.unbounded) return { risky: true, reason: NESTED };
                if (hasIdenticalBranches(frame.branches)) return { risky: true, reason: AMBIGUOUS };
            }

            // Either way this group is now an unbounded repetition as far as
            // whatever encloses it is concerned: because it is quantified, or
            // because something inside it was. That is what makes `((a+)b)+`
            // reachable, where the two quantifiers are not adjacent.
            const parent = stack.at(-1);
            if (parent !== undefined && (frame.unbounded || (quantifier?.unbounded ?? false))) {
                parent.unbounded = true;
            }

            if (quantifier !== null) i += quantifier.length;
            continue;
        }

        const quantifier = quantifierAt(pattern, i);
        if (quantifier !== null) {
            if (quantifier.unbounded) {
                const frame = stack.at(-1);
                if (frame !== undefined) frame.unbounded = true;
            }
            i += quantifier.length - 1;
        }
    }

    return SAFE;
}

/**
 * The reason a pattern must not be compiled, or null when it is safe.
 *
 * This is the shape every engine adapter calls: one line at the top of its own
 * compile function, returning the reason as the error it already had a field for,
 * so a refused pattern reaches the interface through exactly the same path as a
 * syntax error and needs no second way of being displayed.
 */
export function backtrackingRefusal(pattern: string): string | null {
    return inspectPattern(pattern).reason;
}
