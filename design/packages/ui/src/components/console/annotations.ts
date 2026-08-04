/**
 * This app's advice beside the engine's own output, in the words a person reads.
 *
 * BlueMap's CLI prints lines that are correct and unhelpful. `Address already in use` is
 * exactly true and says nothing about what to do about it. `Start updating 0 maps ...`
 * is printed at INFO, immediately before `Your maps are now all up-to-date!` and an exit
 * code of zero, and it almost always means a misconfigured map rather than a render that
 * had nothing left to do. The knowledge that closes those gaps exists; until now it
 * existed only in the heads of people who had already been caught by them.
 *
 * It is encoded here as a **table** of `(pattern -> advice)` rather than as conditionals
 * grown one at a time inside whatever function happens to see the line. The table shape
 * is the point: a rule can be read, tested and argued about on its own, adding one is
 * three lines, and nothing about adding one can change what the four beside it match.
 *
 * ## The fact is the engine's, the advice is ours
 *
 * Nothing here edits the engine's line. The annotation is a separate record rendered
 * beside it, with this application named as the speaker, so a reader can always tell
 * which of the two sentences came from BlueMap. That matters beyond tidiness: the
 * engine's own wording is the string somebody pastes into a search engine, and an app
 * that "improves" it has taken away the only thing that was going to help them.
 *
 * The advice itself is a `vue-i18n` key with an English fallback, so it goes through the
 * language mode and the per-language funny level like every other sentence in this
 * application. The captured values travel as named arguments and are never baked into
 * the string, which is what keeps a level 5 rewrite from losing the address the web
 * server actually bound to.
 *
 * ## The main process keeps its own copy of the table
 *
 * `packages/app/src/main/render/annotate.ts` holds the same five rules. The two packages
 * compile under separate roots with no module either can import from the other, exactly
 * as `world/worldBridge.ts` restates the render event types rather than importing them.
 * **A pattern changed here has to be changed there**, and both sides are tested against
 * the same sample lines so a drift fails a test rather than producing advice that
 * appears in one half of the app and not the other.
 */

import type { SettingsTarget } from "../world/worldBridge.js";

/**
 * A sentence this app has not rendered yet.
 *
 * Held as a key, a fallback and its values rather than as finished text because the
 * console model runs where there is no translator: `createRenderRun` is constructed from
 * a bridge and nothing else. Translating at render time is also what makes a line change
 * language when the mode changes, instead of keeping whatever language it was in when it
 * arrived, which for a render that has been on screen for four minutes is most of them.
 */
export interface ConsoleText {
    readonly key: string;
    readonly fallback: string;
    readonly values: Readonly<Record<string, string | number>>;
}

/** The five things this app knows how to say something useful about. */
export type AnnotationKind =
    | "port-conflict"
    | "render-threads"
    | "no-maps-updating"
    | "web-server-started"
    | "config-error";

/**
 * How loudly the advice is presented.
 *
 * Two tones rather than the full level palette, because advice is either "here is
 * something that will help" or "this looks like success and is not". A third tone would
 * be a shade nobody could name.
 */
export type AnnotationTone = "tip" | "warning";

export interface ConsoleAnnotation {
    readonly kind: AnnotationKind;
    readonly tone: AnnotationTone;
    /** The advice, translated where it is shown. */
    readonly text: ConsoleText;
    /** The place in this app that fixes it, or null when no setting would. */
    readonly settings: SettingsTarget | null;
}

export interface AnnotationRule {
    readonly kind: AnnotationKind;
    readonly pattern: RegExp;
    readonly tone: AnnotationTone;
    /**
     * True when the advice is worth saying once per render rather than once per line.
     *
     * The estimate tip is the case that forces this to exist: it is offered on the first
     * line carrying an `(ETA: ...)`, and a render prints one of those every ten seconds
     * for several minutes. A rule without the flag would bury the log it is annotating
     * under two dozen copies of the same paragraph.
     */
    readonly once: boolean;
    readonly settings: SettingsTarget | null;
    readonly key: string;
    readonly fallback: string;
    /** Pulls the values the sentence interpolates out of the match. */
    readonly capture?: (match: RegExpExecArray) => Record<string, string>;
}

/**
 * The world folder and dimension, which is where a map that renders nothing is fixed.
 *
 * This app writes BlueMap's config files itself from the map settings, so "edit
 * core.conf" would be advice for a different application. `world-folder` is the anchor
 * `worldNotFound` already uses, because the underlying mistake is the same one seen
 * earlier: a map pointing at a folder or a dimension that is not there.
 */
const WORLD_SETTING: SettingsTarget = { surface: "settings", anchor: "world-folder", missing: false };

/**
 * The table.
 *
 * Order is evaluation order and nothing more. The rules are written so no line can match
 * two of them, and {@link annotationsFor} collects every match rather than stopping at
 * the first, so a future overlap degrades into two annotations instead of one silently
 * dropped one.
 */
export const ANNOTATION_RULES: readonly AnnotationRule[] = [
    {
        // `java.net.BindException: Address already in use`, and the two other shapes the
        // JVM and BlueMap produce for the same condition. Anchored on the whole phrase
        // rather than on "in use", which appears in ordinary prose about resource packs.
        kind: "port-conflict",
        pattern: /address already in use|bindexception|failed to bind/i,
        tone: "warning",
        // The JVM retries and prints this several times running, and the advice does not
        // change between attempts.
        once: true,
        settings: null,
        key: "world.console.advice.portConflict",
        fallback:
            "Something else is already listening on that port. Two things usually explain it. " +
            "BlueMap can also run as a mod on the Minecraft server itself, where it uses the " +
            "server's own port, so a copy installed there may already be serving. Or a BlueMap " +
            "process from an earlier run is still alive and still holding the port.",
    },
    {
        // The progress line's estimate, from `BlueMapCLI`: `... : 25.663% (ETA: 47
        // seconds)`. A progress line with no estimate deliberately does not match: the
        // tip is about how long the remaining work takes, and that line reports none.
        kind: "render-threads",
        pattern: /\(ETA: [^)]+\)/,
        tone: "tip",
        once: true,
        settings: null,
        key: "world.console.advice.renderThreads",
        fallback:
            "This render is using the thread count it was started with. Raising Render threads, " +
            "on the render options step of the map wizard, gives the next render more of the " +
            "processor and brings that estimate down.",
    },
    {
        // `Start updating 0 maps ...`. The digit is part of the pattern rather than
        // captured and compared, so `Start updating 10 maps ...` cannot match it: a
        // zero-check written as "starts with a 0" is exactly how a ten-map render gets
        // reported as a misconfiguration.
        kind: "no-maps-updating",
        pattern: /^Start updating 0 maps? ?\.\.\.$/,
        tone: "warning",
        // Not once. A watching run says this each time it wakes and finds nothing to do,
        // and each of those is a separate occasion worth seeing.
        once: false,
        settings: WORLD_SETTING,
        key: "world.console.advice.noMaps",
        fallback:
            "Zero maps means nothing will be drawn, and the engine will still finish and report " +
            "success. It nearly always means a map is misconfigured rather than that the world " +
            "is already up to date: check the world folder the map points at, and the dimension " +
            "inside it.",
    },
    {
        // `WebServer bound to /0.0.0.0:8100`. Anchored at the start so `Stopping
        // WebServer...` and `WebServer is disabled` cannot be read as the server coming
        // up, which would invite somebody to open a map that is not being served.
        kind: "web-server-started",
        pattern: /^WebServer bound to (.+)$/i,
        tone: "tip",
        once: false,
        settings: null,
        key: "world.console.advice.webServer",
        fallback:
            "The web server is up on {address}. The map can be opened now; the rest of it keeps " +
            "rendering while you look at it.",
        capture: (match) => ({ address: (match[1] ?? "").trim() }),
    },
    {
        // Upstream's setup banner heading, plus the config load failures it wraps.
        // `Failed to load` is required, so an ordinary `Loading config ...` is not read
        // as a problem.
        kind: "config-error",
        pattern: /There is a problem with your BlueMap setup!|Failed to load\b[^\n]*\bconfigs?\b/i,
        tone: "warning",
        once: true,
        settings: WORLD_SETTING,
        key: "world.console.advice.configError",
        fallback:
            "BlueMap could not read one of its own config files. This app writes those files from " +
            "the map settings rather than expecting you to edit them, so the fix is in the " +
            "settings: check the world folder and the dimension the map points at.",
    },
];

/**
 * Every rule one message matches, with nothing remembered between calls.
 *
 * Exported separately from {@link createAnnotator} so the table can be tested as a pure
 * function of the line. One-shot suppression is state, and testing it through the same
 * entry point as matching makes it impossible to tell which of the two a failure is
 * about.
 */
export function annotationsFor(message: string): ConsoleAnnotation[] {
    const found: ConsoleAnnotation[] = [];
    for (const rule of ANNOTATION_RULES) {
        // No rule carries `g` or `y`, so `lastIndex` is never left mid-string. A global
        // pattern in this table would match the same line only every other time it
        // arrived, which reads as a race and is not one.
        const match = rule.pattern.exec(message);
        if (match === null) continue;
        found.push({
            kind: rule.kind,
            tone: rule.tone,
            settings: rule.settings,
            text: { key: rule.key, fallback: rule.fallback, values: rule.capture?.(match) ?? {} },
        });
    }
    return found;
}

export interface Annotator {
    /** The advice for one engine line, with one-shot rules already spent. */
    annotate(message: string): readonly ConsoleAnnotation[];
    /** Forgets what has been said. Called when a run starts another render. */
    reset(): void;
}

/**
 * An annotator for one render.
 *
 * The only state is which one-shot rules have fired, and it is per render rather than
 * per session: a tip that is stale on the twentieth progress line of one render is
 * useful again on the first line of the next, and a shared annotator would show it to
 * whoever rendered first and to nobody after.
 */
export function createAnnotator(): Annotator {
    const spent = new Set<AnnotationKind>();

    return {
        annotate(message: string): readonly ConsoleAnnotation[] {
            const found: ConsoleAnnotation[] = [];
            for (const annotation of annotationsFor(message)) {
                const rule = ANNOTATION_RULES.find((candidate) => candidate.kind === annotation.kind);
                if (rule?.once === true) {
                    if (spent.has(annotation.kind)) continue;
                    spent.add(annotation.kind);
                }
                found.push(annotation);
            }
            return found;
        },
        reset(): void {
            spent.clear();
        },
    };
}
