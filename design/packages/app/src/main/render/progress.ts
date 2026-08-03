/**
 * Reading upstream BlueMap's CLI output.
 *
 * The CLI is the engine decisions D17 and D18 put behind local rendering, and its only
 * progress channel is the log it prints. Everything in this file was written against
 * output captured from a real render on this machine rather than from the shape a
 * console log usually has; the formats below are quoted from that capture and, where a
 * quotation would be ambiguous, from the upstream source that produces it.
 *
 * The line format comes from `PrintStreamLogger.log`:
 *
 * ```java
 * stream.printf("[%1$tT %2$s] %3$s%n", zdt, level, message);
 * ```
 *
 * so every line is `[HH:MM:SS LEVEL] message`, and the levels are exactly `INFO`,
 * `WARNING`, `DEBUG` (all on stdout) and `ERROR` (on **stderr**, followed by a raw
 * stack trace with no prefix at all). Both streams have to be read; a reader that
 * watches only stdout is a reader that never sees a failure.
 *
 * The progress line comes from `BlueMapCLI`:
 *
 * ```java
 * Logger.global.logInfo(task.getDescription() + ": " + (Math.round(progress * 100000) / 1000.0) + "%" + eta);
 * ```
 *
 * on a timer that fires **every ten seconds**, which is why a render emits progress in
 * ten-second steps and why a map can finish without ever reporting 100%. In the
 * two-map capture below, `overworld` was last seen at 88.601% and the next tick was
 * already reporting `nether`:
 *
 * ```
 * [12:40:33 INFO] updating map 'overworld': 88.601% (ETA: 29 seconds)
 * [12:40:43 INFO] updating map 'nether': 6.267% (ETA: 27 seconds)
 * ```
 *
 * Nothing here may assume a map reaches 100%, and a caller that waits for one waits
 * forever.
 */

/** The four levels `PrintStreamLogger` can print. */
export type CliLogLevel = "INFO" | "WARNING" | "ERROR" | "DEBUG";

export interface CliLogLine {
    /** `HH:MM:SS` exactly as the CLI printed it, in the CLI's own local time. */
    readonly time: string;
    readonly level: CliLogLevel;
    readonly message: string;
    /**
     * True when the line carried no `[HH:MM:SS LEVEL]` prefix and inherited the level
     * of the line before it. Upstream prints multi-line warnings and raw stack traces
     * this way, so dropping unprefixed lines drops precisely the detail that explains
     * a failure.
     */
    readonly continuation: boolean;
}

const LOG_LINE = /^\[(\d{2}:\d{2}:\d{2}) (INFO|WARNING|ERROR|DEBUG)\] ?(.*)$/;

/** Parses one line's prefix. Returns null for a line that has none. */
export function parseLogLine(line: string): CliLogLine | null {
    const match = LOG_LINE.exec(line);
    if (match === null) return null;
    const [, time, level, message] = match;
    if (time === undefined || level === undefined || message === undefined) return null;
    return { time, level: level as CliLogLevel, message, continuation: false };
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which of upstream's render tasks a progress line is reporting.
 *
 * The names come from the `getDescription()` implementations in
 * `common/.../rendermanager/`: `MapUpdateTask`, `MapUpdatePreparationTask`,
 * `MapSaveTask`, `MapPurgeTask`, `StorageDeleteTask` and `WorldRegionUpdateTask`.
 * A description this port has never seen is reported as `unknown` with its text
 * preserved, rather than being silently dropped or forced into the nearest match.
 */
export type RenderTaskKind =
    | "updating-map"
    | "preparing-map"
    | "saving-map"
    | "purging-map"
    | "deleting-map"
    | "updating-region"
    | "unknown";

export interface RenderTaskProgress {
    readonly kind: RenderTaskKind;
    /** The map the task is working on, or null for a task that names no map. */
    readonly mapId: string | null;
    /** Upstream's own description, kept verbatim so nothing is lost in translation. */
    readonly description: string;
    /** 0 to 100, with upstream's three decimal places preserved. */
    readonly percent: number;
    /**
     * Estimated seconds remaining, or null when the CLI printed no estimate.
     *
     * Absent is a real and frequent case: `BlueMapCLI` omits the estimate entirely
     * when `etaMs` is not positive, which is what produces the final
     * `updating map 'nether': 100.0%` with nothing after it.
     */
    readonly etaSeconds: number | null;
    /** The estimate exactly as printed, e.g. `1.9 minutes`. Null when there was none. */
    readonly etaText: string | null;
}

const PROGRESS_LINE = /^(.+?): (\d+(?:[.,]\d+)?)%(?: \(ETA: (.+)\))?$/;

/**
 * `TextFormat.duration` picks the largest unit whose value exceeds 1 and formats it
 * with `%.1f` below 2 (except for seconds) and `%.0f` otherwise, so the observed
 * shapes are `3 minutes`, `1.9 minutes`, `1.0 minutes`, `41 seconds` and `10 seconds`.
 * Only these four units can appear; `DURATION_UNITS` lists exactly them.
 *
 * The decimal separator is whatever `String.format` used, which follows the JVM's
 * default locale rather than the CLI's own choice. A comma is accepted for the same
 * reason a full stop is: on a machine running a German locale that is what gets
 * printed, and refusing it would lose the estimate on that machine only.
 */
const ETA = /^(\d+(?:[.,]\d+)?) (days|hours|minutes|seconds)$/;

const ETA_UNIT_SECONDS: Readonly<Record<string, number>> = {
    days: 86400,
    hours: 3600,
    minutes: 60,
    seconds: 1,
};

function parseDecimal(text: string): number {
    return Number.parseFloat(text.replace(",", "."));
}

/** Seconds remaining, or null when the text is not an estimate this port recognises. */
export function parseEta(text: string): number | null {
    const match = ETA.exec(text.trim());
    if (match === null) return null;
    const [, value, unit] = match;
    if (value === undefined || unit === undefined) return null;
    const seconds = ETA_UNIT_SECONDS[unit];
    if (seconds === undefined) return null;
    const parsed = parseDecimal(value);
    return Number.isFinite(parsed) ? parsed * seconds : null;
}

const TASK_PATTERNS: readonly { readonly kind: RenderTaskKind; readonly pattern: RegExp }[] = [
    { kind: "updating-map", pattern: /^updating map '(.+)'$/ },
    { kind: "preparing-map", pattern: /^preparing map '(.+)' update$/ },
    { kind: "saving-map", pattern: /^saving map '(.+)'$/ },
    { kind: "purging-map", pattern: /^purging map '(.+)'$/ },
    { kind: "deleting-map", pattern: /^deleting map '(.+)'$/ },
    { kind: "updating-region", pattern: /^updating region (.+)$/ },
];

/** Splits one of upstream's task descriptions into a kind and the map it names. */
export function classifyTaskDescription(description: string): {
    readonly kind: RenderTaskKind;
    readonly mapId: string | null;
} {
    for (const { kind, pattern } of TASK_PATTERNS) {
        const match = pattern.exec(description);
        if (match === null) continue;
        // "updating region <pos>" names a region, not a map, so it carries no id.
        const captured = kind === "updating-region" ? null : (match[1] ?? null);
        return { kind, mapId: captured };
    }
    return { kind: "unknown", mapId: null };
}

/**
 * Parses `updating map 'overworld': 25.663% (ETA: 47 seconds)` out of a log message.
 *
 * The message is the part after the `[HH:MM:SS LEVEL]` prefix, not the whole line.
 * Returns null for anything that is not a progress report, which is most of the log.
 */
export function parseProgress(message: string): RenderTaskProgress | null {
    const match = PROGRESS_LINE.exec(message);
    if (match === null) return null;
    const [, description, percentText, etaText] = match;
    if (description === undefined || percentText === undefined) return null;

    const percent = parseDecimal(percentText);
    if (!Number.isFinite(percent)) return null;

    const { kind, mapId } = classifyTaskDescription(description);
    return {
        kind,
        mapId,
        description,
        percent,
        etaSeconds: etaText === undefined ? null : parseEta(etaText),
        etaText: etaText ?? null,
    };
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where a render has got to, derived from the messages that actually mark each move.
 *
 * `stopping` is a real phase and not cosmetic: the CLI writes its final tiles during
 * it, so a run reported as finished at `Your maps are now all up-to-date!` is reported
 * finished while it is still writing to disk.
 */
export type RenderPhase =
    | "starting"
    | "downloading-resources"
    | "loading-resources"
    | "loading-maps"
    | "rendering"
    | "watching"
    | "stopping"
    | "finished";

export type RenderSignal =
    | { readonly kind: "log"; readonly line: CliLogLine }
    | { readonly kind: "phase"; readonly phase: RenderPhase }
    | { readonly kind: "progress"; readonly progress: RenderTaskProgress }
    | { readonly kind: "downloading"; readonly url: string; readonly target: string }
    | { readonly kind: "maps-scheduled"; readonly count: number }
    | { readonly kind: "map-loaded"; readonly mapId: string }
    | { readonly kind: "up-to-date" }
    | { readonly kind: "consent-missing" }
    | { readonly kind: "setup-problem"; readonly text: string };

const DOWNLOADING = /^Downloading '(.+)' to '(.+)'\.\.\.$/;
const LOADING_RESOURCES = /^Loading resources\.\.\.$/;
const INITIALIZING_STORAGE = /^Initializing Storage: '(.+?)' \(Type: '(.+?)'\)$/;
const LOADING_MAP = /^Loading map '(.+)'\.\.\.$/;
const START_UPDATING = /^Start updating (\d+) maps? \.\.\.$/;
const WAITING = /^Waiting for changes on the world-files\.\.\.$/;
const UP_TO_DATE = /^Your maps are now all up-to-date!$/;
const STOPPING = /^Stopping\.\.\.$/;
const SAVING = /^Saving\.\.\.$/;
const STOPPED = /^Stopped\.$/;

/**
 * The line upstream prints when `accept-download` is false. This port never spawns
 * the CLI without consent, so seeing it means something got past the gate: the config
 * was edited by hand, or a stale config directory was reused. It is recognised so that
 * case reports "consent required" rather than an unexplained exit code 2.
 */
const CONSENT_MISSING = /^You must accept the required file download in order for BlueMap to work!$/;

/** The `####` rules around upstream's multi-line setup-problem banner. */
const BANNER_RULE = /^#{4,}$/;
const SETUP_PROBLEM_HEADING = /There is a problem with your BlueMap setup!/;

/**
 * Turns a stream of CLI lines into typed signals.
 *
 * Stateful by necessity rather than by preference: the level of a continuation line is
 * the level of the line before it, and upstream's setup-problem banner is only
 * complete once its closing rule arrives, so neither can be decided from one line
 * alone. Everything else here is a pure function of the line.
 */
export class RenderOutputTracker {
    private phase: RenderPhase = "starting";
    private lastLevel: CliLogLevel = "INFO";
    private lastTime = "";
    private bannerLines: string[] | null = null;

    /** The phase the tracker currently believes the render is in. */
    currentPhase(): RenderPhase {
        return this.phase;
    }

    /**
     * Feeds one line and returns everything it means.
     *
     * A `log` signal is always first, so a caller that only wants the raw log can take
     * it without re-parsing, and the interpreted signals follow.
     */
    push(rawLine: string): RenderSignal[] {
        // Windows line endings survive the pipe; a trailing \r turns every anchored
        // pattern below into a non-match, which would silently disable the whole file.
        const line = rawLine.replace(/\r$/, "");
        const parsed = parseLogLine(line);

        if (parsed === null) {
            const inherited: CliLogLine = {
                time: this.lastTime,
                level: this.lastLevel,
                message: line,
                continuation: true,
            };
            return [{ kind: "log", line: inherited }, ...this.banner(line)];
        }

        this.lastLevel = parsed.level;
        this.lastTime = parsed.time;

        const signals: RenderSignal[] = [{ kind: "log", line: parsed }];
        // A prefixed line ends any banner still open, so an unterminated banner is
        // reported rather than swallowed by the next hundred lines of progress.
        signals.push(...this.closeBanner());
        signals.push(...this.interpret(parsed.message));
        return signals;
    }

    /** Flushes anything held back waiting for more lines. Call once at end of stream. */
    finish(): RenderSignal[] {
        return this.closeBanner();
    }

    private setPhase(phase: RenderPhase): RenderSignal[] {
        if (this.phase === phase) return [];
        this.phase = phase;
        return [{ kind: "phase", phase }];
    }

    private banner(line: string): RenderSignal[] {
        if (BANNER_RULE.test(line.trim())) {
            if (this.bannerLines === null) {
                this.bannerLines = [];
                return [];
            }
            return this.closeBanner();
        }
        if (this.bannerLines !== null) this.bannerLines.push(line.trim());
        return [];
    }

    private closeBanner(): RenderSignal[] {
        const lines = this.bannerLines;
        this.bannerLines = null;
        if (lines === null) return [];
        const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        if (text.length === 0) return [];
        return [{ kind: "setup-problem", text }];
    }

    private interpret(message: string): RenderSignal[] {
        const progress = parseProgress(message);
        if (progress !== null) {
            return [...this.setPhase("rendering"), { kind: "progress", progress }];
        }

        const downloading = DOWNLOADING.exec(message);
        if (downloading !== null) {
            const [, url, target] = downloading;
            if (url !== undefined && target !== undefined) {
                return [
                    ...this.setPhase("downloading-resources"),
                    { kind: "downloading", url, target },
                ];
            }
        }

        if (LOADING_RESOURCES.test(message)) return this.setPhase("loading-resources");
        if (INITIALIZING_STORAGE.test(message)) return this.setPhase("loading-maps");

        const loadingMap = LOADING_MAP.exec(message);
        if (loadingMap !== null && loadingMap[1] !== undefined) {
            return [...this.setPhase("loading-maps"), { kind: "map-loaded", mapId: loadingMap[1] }];
        }

        const scheduled = START_UPDATING.exec(message);
        if (scheduled !== null && scheduled[1] !== undefined) {
            return [
                ...this.setPhase("rendering"),
                { kind: "maps-scheduled", count: Number.parseInt(scheduled[1], 10) },
            ];
        }

        if (WAITING.test(message)) return this.setPhase("watching");
        if (UP_TO_DATE.test(message)) return [{ kind: "up-to-date" }];
        if (STOPPING.test(message) || SAVING.test(message)) return this.setPhase("stopping");
        if (STOPPED.test(message)) return this.setPhase("finished");
        if (CONSENT_MISSING.test(message)) return [{ kind: "consent-missing" }];
        if (SETUP_PROBLEM_HEADING.test(message)) return [{ kind: "setup-problem", text: message }];

        return [];
    }
}

/* -------------------------------------------------------------------------- */
/* Line splitting                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Splits a byte stream into lines.
 *
 * A child process's stdout arrives in whatever chunks the pipe happens to deliver, and
 * a progress line landing across two of them is normal rather than exceptional. The
 * held-back remainder is what stops that line from being parsed as two broken halves.
 */
export class LineSplitter {
    private buffer = "";

    push(chunk: string): string[] {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        // The last element is whatever came after the final newline: either an empty
        // string, or the beginning of a line whose end has not arrived yet.
        this.buffer = lines.pop() ?? "";
        return lines;
    }

    /** The unterminated remainder, if the stream ended without a final newline. */
    flush(): string[] {
        const remainder = this.buffer;
        this.buffer = "";
        return remainder.length > 0 ? [remainder] : [];
    }
}
