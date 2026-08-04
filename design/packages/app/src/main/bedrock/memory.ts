/**
 * Warning somebody that Chunker is likely to run out of memory on their world, before
 * they spend twenty minutes finding out.
 *
 * ## The observation, and who is claiming it
 *
 * Chunker's memory use grows without bound on larger worlds - past roughly 200 MB of
 * source world it climbs until the JVM dies, rather than settling at some working-set
 * size. **This is an observation made in this project, not something upstream documents.**
 * The distinction matters enough to keep in the code as well as the documentation, because
 * the two accounts genuinely disagree about the cause and therefore about the remedy:
 *
 * - Chunker's maintainers describe out-of-memory as a *resource* problem - the world is
 *   big, the machine's RAM is finite - and their standing advice on the issue tracker is
 *   to close other applications, pass a larger `-Xmx`, or trim the world first.
 * - If the growth is unbounded, a larger heap is not a fix. It is a delay, and a delay
 *   that makes the landing worse: a JVM permitted to reach 12 GB on a 16 GB machine takes
 *   the machine into paging on its way down, or gets killed by the operating system, which
 *   is a far more confusing failure than an honest `OutOfMemoryError`.
 *
 * So this app does not offer a bigger heap as the remedy, and does not imply the problem
 * is solved. It says what is likely to happen, that it is a known limitation of the
 * converter rather than of the person's world or of this app, and what the real options
 * are. It does **not** try to work around it: splitting the world or retrying with more
 * memory would be guesses about somebody else's bug.
 *
 * Out-of-memory reports continue against the pinned 1.19.1 (for example
 * https://github.com/HiveGamesOSS/Chunker/issues/2482, open, reported against
 * `1.19.1-main-f642f8f`), so there is no later release to point at as a fix and nothing
 * here claims one.
 *
 * ## Why the source world's size
 *
 * It is the number the app already has - the world list measures it for every row - and it
 * is the one that correlates with the failure. It is a proxy rather than a measurement of
 * the converter's peak heap, so the thresholds are deliberately soft and every message
 * says "likely" rather than "will".
 */

/**
 * Where the risk begins, in bytes.
 *
 * 200 MB of source world, from observation rather than from a documented limit. Soft on
 * purpose: this predicts somebody else's memory behaviour from a file-size proxy, so it is
 * a place to start warning, not a boundary between working and not working.
 */
export const MEMORY_RISK_THRESHOLD_BYTES = 200 * 1024 * 1024;

/**
 * How close to the threshold counts as worth mentioning.
 *
 * A world at 90% of the threshold is not comfortably under it, and somebody about to spend
 * twenty minutes is better served by knowing that than by a reassuring silence followed by
 * a failure. Below this fraction nothing is said at all - the common case is a small world
 * that converts fine, and warning about it would train people to ignore the warning.
 */
export const MEMORY_RISK_APPROACHING_FRACTION = 0.75;

export type MemoryRiskLevel = "low" | "approaching" | "high" | "unknown";

export interface MemoryRisk {
    readonly level: MemoryRiskLevel;
    /** The world's measured size, echoed so a message can quote it. */
    readonly sourceBytes: number | null;
    readonly thresholdBytes: number;
    /** True when this deserves to be on screen before the Convert button. */
    readonly warn: boolean;
    /** The heading, empty when nothing needs saying. */
    readonly title: string;
    /** What is likely to happen, whose limitation it is, and what the options are. */
    readonly detail: string;
    /** Where the claim comes from, so nobody reads it as upstream documentation. */
    readonly attribution: string;
}

function megabytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${String(Math.round(mb))} MB`;
}

const ATTRIBUTION =
    "This limit is this app's own observation from running Chunker, not something Chunker " +
    "documents. Chunker's maintainers describe out-of-memory failures as the world being " +
    "large for the available RAM, and suggest a larger heap; that advice does not hold if " +
    "the growth is unbounded, which is why this app does not offer it as a fix.";

/**
 * Whether to warn about memory before converting this world, and what to say.
 *
 * A world comfortably under the threshold produces `low` with `warn: false` and no copy at
 * all. An unmeasured world produces `unknown`, which also does not warn: inventing a risk
 * assessment from a size nobody measured would be the same failure as inventing the size.
 */
export function assessMemoryRisk(sourceBytes: number | null): MemoryRisk {
    const base = {
        sourceBytes,
        thresholdBytes: MEMORY_RISK_THRESHOLD_BYTES,
        attribution: ATTRIBUTION,
    } as const;

    if (sourceBytes === null || sourceBytes <= 0) {
        return { ...base, level: "unknown", warn: false, title: "", detail: "" };
    }

    if (sourceBytes >= MEMORY_RISK_THRESHOLD_BYTES) {
        return {
            ...base,
            level: "high",
            warn: true,
            title: "This world is large enough that the conversion will probably fail",
            detail:
                `This world is ${megabytes(sourceBytes)}. Chunker's memory use grows without ` +
                `bound on worlds past about ${megabytes(MEMORY_RISK_THRESHOLD_BYTES)}, so the ` +
                `likely outcome is that the conversion slows down, then stops part-way with an ` +
                `out-of-memory failure. Nothing will be left behind if that happens, and your ` +
                `Bedrock world is never modified either way. This is a limitation of the ` +
                `converter, not of your world and not of this app. Giving it more memory is ` +
                `not a fix - it only moves the failure later. The options that do work are ` +
                `converting a smaller world, trimming this one first, or converting on a ` +
                `machine with considerably more RAM. You can still start it and find out.`,
        };
    }

    if (sourceBytes >= MEMORY_RISK_THRESHOLD_BYTES * MEMORY_RISK_APPROACHING_FRACTION) {
        return {
            ...base,
            level: "approaching",
            warn: true,
            title: "This world is close to the size where conversions start failing",
            detail:
                `This world is ${megabytes(sourceBytes)}, near the ` +
                `${megabytes(MEMORY_RISK_THRESHOLD_BYTES)} mark past which Chunker's memory use ` +
                `grows without bound. It may well convert; if it does not, it will stop part-way ` +
                `with an out-of-memory failure, leave nothing behind, and leave your Bedrock ` +
                `world untouched.`,
        };
    }

    return { ...base, level: "low", warn: false, title: "", detail: "" };
}
