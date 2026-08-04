/**
 * This app's advice beside the engine's own output.
 *
 * BlueMap's CLI prints lines that are correct and unhelpful. `Address already in use`
 * is exactly true and tells a person nothing about what to do; `Start updating 0 maps
 * ...` is reported at INFO and is almost always a misconfigured map rather than good
 * news. The knowledge that closes those gaps exists, and until now it existed only in
 * the heads of people who had already hit them.
 *
 * So it is encoded here, as a **table** of `(pattern -> advice kind)` rather than as
 * conditionals scattered through a stream handler. The table shape is the point: a rule
 * can be read, tested and argued about on its own, a new one is three lines, and nothing
 * about adding one can change what the four beside it match. Conditionals grown one at a
 * time inside `RenderOutputTracker.interpret` would have exactly the opposite property.
 *
 * ## What this may and may not do
 *
 * It never touches the engine's line. `quoted` is the message exactly as it arrived, and
 * the advice sits beside it. That separation is the whole contract: the fact is the
 * engine's, the advice is this app's, and a reader can always see which is which. An
 * annotator that rewrote the engine's sentence would be destroying the one string a
 * person could search the internet for.
 *
 * It also carries no prose. A `kind` and the values captured out of the line are what
 * comes out, because the main process has no locale, no language mode and no funny
 * level, and a sentence chosen here would be an English sentence chosen for a person who
 * may have asked for Cantonese. The renderer owns the words; this owns the recognition.
 *
 * ## The renderer keeps its own copy of the table
 *
 * `packages/ui/src/components/console/annotations.ts` holds the same five rules, because
 * `packages/ui` and `packages/app` compile under separate `rootDir`s with no module
 * either can import from the other, exactly as `ui/.../world/worldBridge.ts` restates the
 * failure and event types rather than importing them. **A pattern changed here has to be
 * changed there**, and each side's tests fix its own behaviour against the same sample
 * lines so a drift shows up as a failing test rather than as advice that appears in one
 * build and not the other.
 */

import type { SettingsTarget } from "./failure.js";

/** The five things this app knows how to say something useful about. */
export type RenderAdviceKind =
    | "port-conflict"
    | "render-threads"
    | "no-maps-updating"
    | "web-server-started"
    | "config-error";

export interface RenderAdvice {
    readonly kind: RenderAdviceKind;
    /**
     * The engine's message exactly as it printed it.
     *
     * Kept on the record so a consumer that only has the advice can still show the line
     * that produced it. Never edited: see the file comment.
     */
    readonly quoted: string;
    /** What the pattern captured, for the sentence the renderer builds. */
    readonly values: Readonly<Record<string, string>>;
    /** The place in this app's interface that fixes it, when one exists. */
    readonly settings: SettingsTarget | null;
}

export interface AdviceRule {
    readonly kind: RenderAdviceKind;
    readonly pattern: RegExp;
    /**
     * True when the advice is worth saying once per render and not once per line.
     *
     * The estimate tip is the obvious case: it is offered on the first line that carries
     * an `(ETA: ...)` and a render prints one of those every ten seconds for four
     * minutes, so a rule that fired every time would bury the log it is annotating under
     * twenty-four copies of the same paragraph.
     */
    readonly once: boolean;
    readonly settings: SettingsTarget | null;
    /** Pulls the values the advice interpolates out of the match. */
    readonly capture?: (match: RegExpExecArray) => Record<string, string>;
}

/**
 * The world folder and dimension, which is where a broken map config is actually fixed.
 *
 * This app writes BlueMap's config files itself from the map settings, so "edit
 * core.conf" is advice for a different application. The anchor is the same one
 * `worldNotFound` uses, because the failure is the same one seen earlier: a map pointing
 * at a folder or a dimension that is not there.
 */
const WORLD_SETTING: SettingsTarget = { surface: "settings", anchor: "world-folder", missing: false };

/**
 * The table.
 *
 * Order is evaluation order and nothing more; the rules are written so that no line can
 * match two of them, and `advice()` collects every match rather than stopping at the
 * first, so a future overlap degrades into two annotations instead of into one silently
 * dropped one.
 */
export const ADVICE_RULES: readonly AdviceRule[] = [
    {
        // `java.net.BindException: Address already in use`, and the two other shapes the
        // JVM and BlueMap produce for the same condition. Anchored on the whole phrase
        // rather than on "in use", which appears in ordinary prose about a resource pack.
        kind: "port-conflict",
        pattern: /address already in use|bindexception|failed to bind/i,
        // The JVM retries and prints this several times running. The advice does not
        // change between attempts, so saying it once is the difference between a hint
        // and a wall.
        once: true,
        settings: null,
    },
    {
        // The progress line's estimate, from `BlueMapCLI`: `... : 25.663% (ETA: 47
        // seconds)`. A progress line with no estimate (which is what the last tick of a
        // map looks like) deliberately does not match, because the tip is about how long
        // the remaining work will take and there is no remaining work being reported.
        kind: "render-threads",
        pattern: /\(ETA: [^)]+\)/,
        once: true,
        settings: null,
    },
    {
        // `Start updating 0 maps ...`. The digit is part of the pattern rather than
        // captured and compared, so `Start updating 10 maps ...` cannot match it: a
        // zero-check written as "starts with 0" is precisely how a ten-map render gets
        // reported as a misconfiguration.
        kind: "no-maps-updating",
        pattern: /^Start updating 0 maps? ?\.\.\.$/,
        // Not once. In a watching run the engine says this each time it wakes and finds
        // nothing to do, and each of those really is a separate occasion worth seeing.
        once: false,
        settings: WORLD_SETTING,
    },
    {
        // `WebServer bound to /0.0.0.0:8100`. Anchored at the start so `Stopping
        // WebServer...` and `WebServer is disabled` cannot be read as the server coming
        // up, which would invite somebody to open a map that is not being served.
        kind: "web-server-started",
        pattern: /^WebServer bound to (.+)$/i,
        once: false,
        settings: null,
        capture: (match) => ({ address: (match[1] ?? "").trim() }),
    },
    {
        // Upstream's setup banner heading, plus the config load failures it wraps.
        // `Failed to load` is required, so an ordinary `Loading config ...` is not read
        // as a problem.
        kind: "config-error",
        pattern: /There is a problem with your BlueMap setup!|Failed to load\b[^\n]*\bconfigs?\b/i,
        once: true,
        settings: WORLD_SETTING,
    },
];

/**
 * Every rule one message matches, with nothing remembered between calls.
 *
 * Exported separately from {@link createAdvisor} so the table can be tested as a pure
 * function of the line. The one-shot behaviour is state, and state tested through the
 * same entry point as matching makes it impossible to tell which of the two a failure is
 * about.
 */
export function adviseOnLine(message: string): RenderAdvice[] {
    const found: RenderAdvice[] = [];
    for (const rule of ADVICE_RULES) {
        // `lastIndex` is not reset here because no rule carries `g` or `y`; a sticky or
        // global pattern in this table would make the same line match only every other
        // time it arrived, which is the sort of bug that looks like a race.
        const match = rule.pattern.exec(message);
        if (match === null) continue;
        found.push({
            kind: rule.kind,
            quoted: message,
            values: rule.capture?.(match) ?? {},
            settings: rule.settings,
        });
    }
    return found;
}

export interface Advisor {
    /** The advice for one engine line, with one-shot rules already spent. */
    advise(message: string): RenderAdvice[];
    /** Forgets what has been said. Call when a new render starts. */
    reset(): void;
}

/**
 * An advisor for one render.
 *
 * The state is only which one-shot rules have fired. It is per render rather than per
 * process because the tip that is stale on the twentieth progress line of a render is
 * useful again on the first line of the next one, and a process-wide advisor would show
 * it to whoever happened to render first that day and to nobody afterwards.
 */
export function createAdvisor(): Advisor {
    const spent = new Set<RenderAdviceKind>();

    return {
        advise(message: string): RenderAdvice[] {
            const found: RenderAdvice[] = [];
            for (const advice of adviseOnLine(message)) {
                const rule = ADVICE_RULES.find((candidate) => candidate.kind === advice.kind);
                if (rule?.once === true) {
                    if (spent.has(advice.kind)) continue;
                    spent.add(advice.kind);
                }
                found.push(advice);
            }
            return found;
        },
        reset(): void {
            spent.clear();
        },
    };
}
