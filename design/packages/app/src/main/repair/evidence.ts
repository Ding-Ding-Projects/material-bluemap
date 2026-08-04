/**
 * What was actually observed when a run failed.
 *
 * Everything the repair pass does is a decision about this record, and the record is
 * assembled once, at the moment of the failure, from the things that stop being true
 * afterwards: the exit code, the last lines the engine printed, the config that was in
 * force *then* rather than after somebody edited it, which Java was used, what Docker
 * said, which port was refused. A diagnosis made from a config re-read ten seconds later
 * is a diagnosis of a different failure.
 *
 * ## Secrets never leave this record intact
 *
 * A BlueMap config folder can hold database credentials: `storages/*.conf` carries a JDBC
 * URL and a `connection-properties` block with a user name and a password in it. This
 * evidence is shown on screen, copied into bug reports, and - when the deterministic
 * diagnosis comes up empty - put into a prompt for a local coding agent that may send it
 * to whatever model it is configured to use.
 *
 * So {@link redactSecrets} runs over every piece of config text before it is stored here,
 * not on the way out. Redacting on the way out means one caller who forgets, and a
 * password in a screenshot. The keys are masked and the structure is kept, which is what
 * a diagnosis needs: "the password is set" and "the password is `hunter2`" are the same
 * fact for every purpose this module has.
 */

import type { DockerReport } from "../runtime/docker.js";
import type { RuntimeMode } from "../runtime/plan.js";
import type { EngineRunResult } from "../runtime/process.js";

/** What the run was for. The two fail differently and are diagnosed differently. */
export type RepairSubject = "render" | "web-server";

/** One config file exactly as it was when the run started, with secrets masked. */
export interface ConfigSnapshot {
    /** Relative to the config folder, always with forward slashes. */
    readonly path: string;
    readonly text: string;
}

export interface EvidenceWorld {
    readonly mapId: string;
    /** The world folder on this computer, whatever the engine saw it as. */
    readonly path: string;
}

export interface RepairEvidence {
    readonly subject: RepairSubject;
    readonly mode: RuntimeMode;
    /** The binary that was spawned: the JVM, or `docker`. */
    readonly command: string;
    readonly args: readonly string[];
    readonly exitCode: number | null;
    readonly signal: string | null;
    /** `ENOENT` and friends: why the launch itself failed, when it did. */
    readonly spawnError: string | null;
    readonly cancelled: boolean;
    readonly stderr: readonly string[];
    /** The WARNING and ERROR lines the log reader kept. */
    readonly diagnostics: readonly string[];
    /** Upstream's multi-line "problem with your BlueMap setup" banners. */
    readonly setupProblems: readonly string[];
    readonly consentMissing: boolean;
    /** The count from `Start updating N maps ...`; zero means nothing was rendered. */
    readonly mapsScheduled: number | null;
    readonly config: readonly ConfigSnapshot[];
    /** The config folder on this computer - the only folder a repair may write to. */
    readonly hostConfigDir: string;
    /** Where tiles are written, when the run had one. */
    readonly outputRoot: string | null;
    readonly worlds: readonly EvidenceWorld[];
    readonly javaExecutable: string | null;
    readonly javaVersion: string | null;
    /** The feature version this app requires, so "too old" can name both numbers. */
    readonly requiredJavaFeature: number;
    /** What Docker was doing, when the mode was Docker. Null for a local run. */
    readonly docker: DockerReport | null;
    /** The port a web server tried to bind, when there was one. */
    readonly port: number | null;
    readonly host: string | null;
    readonly at: string;
}

/**
 * How many lines of engine output are kept.
 *
 * The interesting ones are always at the end - a JVM prints its reason last - and a
 * repair pass is not a log viewer. Eighty lines comfortably holds a stack trace plus the
 * banner above it.
 */
export const MAX_EVIDENCE_LINES = 80;

/** Longest config file kept in evidence. Past this it is not a config anybody wrote. */
export const MAX_CONFIG_TEXT = 64 * 1024;

/** What a masked value is replaced with. Fixed text, so it reads as deliberate. */
export const REDACTED = '"[removed]"';

/**
 * Keys whose values are credentials.
 *
 * Deliberately broad. A key this misses is a password in a screenshot; a key it catches
 * unnecessarily costs a diagnosis nothing, because no diagnosis below reads a value - they
 * read whether a key is set, and what the engine said about it.
 */
const SECRET_KEY =
    /^(\s*"?)([A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|credential|api[-_]?key|access[-_]?key|private[-_]?key|user(?:name)?)"?\s*[:=]\s*)(.+)$/i;

/** `scheme://user:password@host` - the other place a credential hides in a config. */
const URL_USERINFO = /:\/\/[^/\s"@]+:[^/\s"@]+@/g;

/** Everything after the `?` in a JDBC URL, which is where drivers take a password. */
const JDBC_QUERY = /(jdbc:[^\s"]*?)\?[^\s"]*/gi;

/**
 * Masks credentials in config text, keeping every line and every key.
 *
 * Line by line rather than with one pass over the document, because a config is HOCON and
 * a value can be almost anything; keeping the key and replacing only the value is the one
 * transformation that is safe to do without parsing.
 */
export function redactSecrets(text: string): string {
    return text
        .split("\n")
        .map((line) => {
            const match = SECRET_KEY.exec(line);
            if (match !== null) {
                const [, indent, key] = match;
                return `${indent ?? ""}${key ?? ""}${REDACTED}`;
            }
            return line.replace(URL_USERINFO, "://[removed]@").replace(JDBC_QUERY, "$1?[removed]");
        })
        .join("\n");
}

/** The last `MAX_EVIDENCE_LINES` non-empty lines of something. */
function tail(lines: readonly string[]): string[] {
    const kept = lines.map((line) => line.replace(/\r$/, "")).filter((line) => line.trim() !== "");
    return kept.slice(Math.max(0, kept.length - MAX_EVIDENCE_LINES));
}

export interface CollectEvidenceInput {
    readonly subject: RepairSubject;
    readonly mode: RuntimeMode;
    readonly command: string;
    readonly args: readonly string[];
    readonly result: EngineRunResult;
    readonly config?: readonly ConfigSnapshot[];
    readonly hostConfigDir: string;
    readonly outputRoot?: string | null;
    readonly worlds?: readonly EvidenceWorld[];
    readonly javaExecutable?: string | null;
    readonly javaVersion?: string | null;
    readonly requiredJavaFeature: number;
    readonly docker?: DockerReport | null;
    readonly port?: number | null;
    readonly host?: string | null;
    readonly now?: () => Date;
}

/**
 * Builds the record from a finished run.
 *
 * Config text is redacted and truncated here, on the way in, so nothing downstream can
 * hold an unmasked copy even by accident.
 */
export function collectEvidence(input: CollectEvidenceInput): RepairEvidence {
    const result = input.result;
    return {
        subject: input.subject,
        mode: input.mode,
        command: input.command,
        args: [...input.args],
        exitCode: result.exitCode,
        signal: result.signal,
        spawnError: result.spawnError,
        cancelled: result.cancelled,
        stderr: tail(result.stderr),
        diagnostics: tail(result.diagnostics),
        setupProblems: [...result.setupProblems],
        consentMissing: result.consentMissing,
        mapsScheduled: result.mapsScheduled,
        config: (input.config ?? []).map((file) => ({
            path: file.path,
            text: redactSecrets(file.text).slice(0, MAX_CONFIG_TEXT),
        })),
        hostConfigDir: input.hostConfigDir,
        outputRoot: input.outputRoot ?? null,
        worlds: [...(input.worlds ?? [])],
        javaExecutable: input.javaExecutable ?? null,
        javaVersion: input.javaVersion ?? null,
        requiredJavaFeature: input.requiredJavaFeature,
        docker: input.docker ?? null,
        port: input.port ?? null,
        host: input.host ?? null,
        at: (input.now?.() ?? new Date()).toISOString(),
    };
}

/**
 * Every line of engine output, as one string to match patterns against.
 *
 * One haystack rather than three loops: a JVM's reason can land on stdout as a WARNING
 * banner, on stderr as a stack trace, or inside a setup-problem block, and a diagnosis
 * that only reads one of them is a diagnosis that works on half the failures.
 */
export function evidenceText(evidence: RepairEvidence): string {
    return [...evidence.diagnostics, ...evidence.stderr, ...evidence.setupProblems].join("\n");
}

/**
 * The evidence written out for a person, or for a coding agent.
 *
 * The config is included because a config error cannot be diagnosed without it, and it is
 * already masked by {@link collectEvidence}. Paths are not masked: they are the whole
 * subject of half the failures, and this text never leaves the machine except through a
 * local agent the user turned on deliberately.
 */
export function describeEvidence(evidence: RepairEvidence): string {
    const lines: string[] = [];
    lines.push(`What failed: ${evidence.subject === "render" ? "a render" : "the map web server"}`);
    lines.push(`Where it ran: ${evidence.mode === "docker" ? "in a Docker container" : "on this computer"}`);
    lines.push(`Command: ${evidence.command} ${evidence.args.join(" ")}`);
    lines.push(
        `Exit code: ${evidence.exitCode === null ? "none" : String(evidence.exitCode)}${
            evidence.signal === null ? "" : ` (signal ${evidence.signal})`
        }`,
    );
    if (evidence.spawnError !== null) lines.push(`The process could not be started: ${evidence.spawnError}`);
    if (evidence.javaVersion !== null) lines.push(`Java: ${evidence.javaVersion}`);
    lines.push(`Java feature version required by this app: ${String(evidence.requiredJavaFeature)}`);
    if (evidence.docker !== null) lines.push(`Docker: ${evidence.docker.status} - ${evidence.docker.message}`);
    if (evidence.port !== null) lines.push(`Port: ${String(evidence.port)}`);
    if (evidence.outputRoot !== null) lines.push(`Output folder: ${evidence.outputRoot}`);
    for (const world of evidence.worlds) lines.push(`World for map '${world.mapId}': ${world.path}`);
    lines.push(`Config folder: ${evidence.hostConfigDir}`);

    if (evidence.setupProblems.length > 0) {
        lines.push("", "The engine's own setup-problem report:");
        for (const problem of evidence.setupProblems) lines.push(problem);
    }
    if (evidence.diagnostics.length > 0) {
        lines.push("", "Warnings and errors from the engine:");
        lines.push(...evidence.diagnostics);
    }
    if (evidence.stderr.length > 0) {
        lines.push("", "Standard error:");
        lines.push(...evidence.stderr);
    }
    if (evidence.config.length > 0) {
        lines.push("", "The config that was in force (credentials already removed):");
        for (const file of evidence.config) {
            lines.push(`--- ${file.path} ---`, file.text.trimEnd());
        }
    }
    return lines.join("\n");
}
