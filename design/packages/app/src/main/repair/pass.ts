/**
 * The repair pass: from a failure to either an explanation, a change, or an honest shrug.
 *
 * The order is fixed and is the safety property:
 *
 * 1. **Diagnose deterministically.** Every failure class this project knows is decided by
 *    `diagnose.ts` from the evidence, with no model involved.
 * 2. **If anything was explained, stop.** The agent is not called at all. A known cause
 *    with a known fix has nothing to gain from a language model and everything to lose.
 * 3. **Otherwise, and only if the user turned it on, ask the local coding agent.** Its
 *    reply is parsed strictly and every proposed edit goes through the guardrails.
 * 4. **Record before, write, diff after.** Each applied file is read first so the change
 *    can be shown as a diff, the version history is asked to snapshot the folder, and the
 *    result carries both.
 *
 * ## Nothing here throws
 *
 * Every step's failure is a field in the result. A repair pass that throws while
 * explaining a failure produces a second failure on top of the first one, at the exact
 * moment somebody is already looking at an error - and the second one has no explanation
 * at all.
 *
 * ## Doing nothing is a first-class outcome
 *
 * `explained: false`, `applied: []`, and a sentence saying so is a complete, correct
 * result. It is what happens when the agent is not installed, when it is installed and
 * says it does not know, when it answers in prose, and when everything it proposed was
 * refused. All four are reported differently, because they suggest different next steps.
 */

import { diagnose, explained, type RepairDiagnosis } from "./diagnose.js";
import { diffCounts, unifiedDiff } from "./diff.js";
import type { RepairEvidence } from "./evidence.js";
import { buildRepairPrompt, parseAgentReply, type AgentAvailability, type RunAgent } from "./agent.js";
import { partitionEdits, type RefusedEdit, type RepairScope } from "./guardrails.js";

/** One file the pass changed, with the change shown rather than described. */
export interface AppliedChange {
    /** Relative to the config folder, with forward slashes. */
    readonly path: string;
    readonly absolutePath: string;
    /** Null when the file did not exist before. */
    readonly before: string | null;
    readonly after: string;
    /** A unified diff, ready to show or paste. */
    readonly diff: string;
    readonly linesAdded: number;
    readonly linesRemoved: number;
    /** Why this was changed, in the words of whatever decided it. */
    readonly why: string;
}

/** What happened with the coding agent, whether or not one was reached. */
export interface AgentReport {
    /** True only when a prompt was actually sent. */
    readonly consulted: boolean;
    readonly available: boolean;
    /** Why it was or was not consulted, and what it said. */
    readonly message: string;
    /** The agent's own one-sentence cause, when it gave one. */
    readonly cause: string | null;
    readonly notes: string | null;
    /** Edits it proposed that the guardrails refused, with the reason for each. */
    readonly refused: readonly RefusedEdit[];
}

export interface HistoryReport {
    readonly recorded: boolean;
    readonly message: string;
}

export interface RepairResult {
    /** True when the deterministic pass named at least one known cause. */
    readonly explained: boolean;
    readonly diagnoses: readonly RepairDiagnosis[];
    readonly agent: AgentReport;
    readonly applied: readonly AppliedChange[];
    /** Null when nothing was written, so nothing needed recording. */
    readonly history: HistoryReport | null;
    /** One paragraph a person can read instead of the whole result. */
    readonly summary: string;
    readonly at: string;
}

/** Reads a file, or null when it is not there. Injected so tests need no disk. */
export type ReadText = (path: string) => Promise<string | null>;
/** Writes a file. Rejecting is fine here; the pass catches it and reports it. */
export type WriteText = (path: string, text: string) => Promise<void>;

/**
 * Asks the app's own version history to snapshot the config folder.
 *
 * A port rather than a direct call into `history/`, for two reasons. It keeps this module
 * testable without git, and it keeps the promise honest: the pass records *through*
 * whatever history the app has, so an app that later keeps history differently changes one
 * adapter rather than this file. The contract is the one `history/repository.ts` already
 * guarantees - append-only, so the automatic change can be undone, and the undo undone.
 */
export type RecordHistory = (
    folder: string,
    label: string,
) => Promise<{ readonly ok: boolean; readonly message: string }>;

export interface RepairOptions {
    readonly scope: RepairScope;
    /**
     * Whether the coding agent may be used at all.
     *
     * Off unless the caller turns it on. Handing a failure report - even a masked one - to
     * a program that may send it to a model is a decision somebody makes once, knowingly,
     * not something that happens because a render failed.
     */
    readonly allowAgent?: boolean;
    readonly agent?: AgentAvailability | null;
    readonly runAgent?: RunAgent | null;
    readonly readText?: ReadText;
    readonly writeText?: WriteText;
    readonly recordHistory?: RecordHistory;
    readonly now?: () => Date;
}

function agentReport(
    partial: Partial<AgentReport> & { readonly message: string },
): AgentReport {
    return {
        consulted: partial.consulted ?? false,
        available: partial.available ?? false,
        message: partial.message,
        cause: partial.cause ?? null,
        notes: partial.notes ?? null,
        refused: partial.refused ?? [],
    };
}

function summarise(
    diagnoses: readonly RepairDiagnosis[],
    applied: readonly AppliedChange[],
    agent: AgentReport,
): string {
    const parts: string[] = [];
    if (diagnoses.length > 0) {
        parts.push(
            diagnoses.length === 1
                ? `This failure has a known cause: ${diagnoses[0]?.message ?? ""}`
                : `This failure has ${String(diagnoses.length)} known causes: ${diagnoses
                      .map((entry) => entry.message)
                      .join(" ")}`,
        );
        const fixes = diagnoses.map((entry) => entry.remedy.summary).filter((text) => text !== "");
        if (fixes.length > 0) parts.push(fixes.join(" "));
    } else {
        parts.push("None of the failures this app knows how to recognise matched what happened.");
        parts.push(agent.message);
    }
    if (applied.length > 0) {
        parts.push(
            `${String(applied.length)} config ${applied.length === 1 ? "file was" : "files were"} changed automatically: ${applied
                .map((change) => change.path)
                .join(", ")}. Every change is in the config folder's history and can be undone.`,
        );
    }
    return parts.join(" ");
}

/**
 * Runs the whole pass. Never rejects.
 *
 * The deterministic half needs nothing injected and always runs. Everything after it is
 * optional: with no agent, no writer and no history recorder this still returns a complete
 * diagnosis, which is what makes the diagnosis the part that is always available.
 */
export async function runRepairPass(
    evidence: RepairEvidence,
    options: RepairOptions,
): Promise<RepairResult> {
    const at = (options.now?.() ?? new Date()).toISOString();
    const diagnoses = diagnose(evidence);

    if (explained(diagnoses)) {
        const agent = agentReport({
            available: options.agent?.available ?? false,
            message:
                "The coding agent was not used: this failure was explained by the checks built into the app.",
        });
        return {
            explained: true,
            diagnoses,
            agent,
            applied: [],
            history: null,
            summary: summarise(diagnoses, [], agent),
            at,
        };
    }

    if (evidence.cancelled) {
        const agent = agentReport({
            available: options.agent?.available ?? false,
            message: "The run was cancelled, so there was nothing to repair.",
        });
        return {
            explained: false,
            diagnoses,
            agent,
            applied: [],
            history: null,
            summary: "The run was cancelled, so nothing was diagnosed and nothing was changed.",
            at,
        };
    }

    if (options.allowAgent !== true) {
        const agent = agentReport({
            available: options.agent?.available ?? false,
            message:
                "Automatic repair by a coding agent is switched off, so this failure was left for a person to look at.",
        });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    const availability = options.agent ?? null;
    const run = options.runAgent ?? null;
    if (availability === null || !availability.available || run === null) {
        const agent = agentReport({
            available: false,
            message:
                availability?.message ??
                "No local coding agent is installed, so this failure was left for a person to look at.",
        });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    let output;
    try {
        output = await run(buildRepairPrompt(evidence, options.scope));
    } catch (error) {
        const agent = agentReport({
            consulted: true,
            available: true,
            message: `The coding agent could not be run: ${error instanceof Error ? error.message : String(error)}`,
        });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    if (!output.ok && output.stdout.trim() === "") {
        const agent = agentReport({
            consulted: true,
            available: true,
            message: `The coding agent exited${
                output.exitCode === null ? "" : ` with code ${String(output.exitCode)}`
            } without answering, so nothing was changed.`,
        });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    const reply = parseAgentReply(output.stdout);
    if (!reply.ok) {
        const agent = agentReport({ consulted: true, available: true, message: reply.reason });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    const proposal = reply.proposal;
    const { allowed, refused } = partitionEdits(proposal.edits, options.scope);

    if (allowed.length === 0) {
        const agent = agentReport({
            consulted: true,
            available: true,
            cause: proposal.cause,
            notes: proposal.notes,
            refused,
            message:
                refused.length > 0
                    ? `The coding agent proposed ${String(refused.length)} change${
                          refused.length === 1 ? "" : "s"
                      } that were outside what a repair is allowed to touch, so nothing was changed.`
                    : proposal.cause === null
                      ? "The coding agent could not work out why this failed either, so nothing was changed."
                      : `The coding agent suggested a cause but proposed no change: ${proposal.cause}`,
        });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    const read = options.readText ?? (async () => null);
    const write = options.writeText;
    if (write === undefined) {
        const agent = agentReport({
            consulted: true,
            available: true,
            cause: proposal.cause,
            notes: proposal.notes,
            refused,
            message:
                "The coding agent proposed changes, but this repair pass was run without permission to write, so nothing was changed.",
        });
        return { explained: false, diagnoses, agent, applied: [], history: null, summary: summarise(diagnoses, [], agent), at };
    }

    const why = proposal.cause ?? "Proposed by the local coding agent for a failure this app could not explain.";
    const applied: AppliedChange[] = [];
    const failures: RefusedEdit[] = [];

    for (const edit of allowed) {
        let before: string | null;
        try {
            before = await read(edit.absolutePath);
        } catch {
            // An unreadable existing file is treated as absent for the diff only. The
            // write below is what decides whether the change happens; refusing here would
            // turn a readable-but-locked file into a silent skip.
            before = null;
        }
        const diff = unifiedDiff(edit.relativePath, before, edit.text);
        if (diff === "") {
            // Byte-identical. Writing it would put a row in the history panel for an event
            // that did not happen.
            failures.push({
                path: edit.relativePath,
                reason: "The proposed contents were identical to the file already there, so it was left alone.",
            });
            continue;
        }
        try {
            await write(edit.absolutePath, edit.text);
        } catch (error) {
            failures.push({
                path: edit.relativePath,
                reason: `It could not be written: ${error instanceof Error ? error.message : String(error)}`,
            });
            continue;
        }
        const counts = diffCounts(diff);
        applied.push({
            path: edit.relativePath,
            absolutePath: edit.absolutePath,
            before,
            after: edit.text,
            diff,
            linesAdded: counts.added,
            linesRemoved: counts.removed,
            why,
        });
    }

    let history: HistoryReport | null = null;
    if (applied.length > 0) {
        const recorder = options.recordHistory;
        if (recorder === undefined) {
            history = {
                recorded: false,
                message:
                    "No version history was available to record this change, so it cannot be undone from the history panel.",
            };
        } else {
            try {
                const written = await recorder(
                    options.scope.configDir,
                    `Automatic repair: ${applied.map((change) => change.path).join(", ")}`,
                );
                history = { recorded: written.ok, message: written.message };
            } catch (error) {
                // A history write that fails must never undo the repair that succeeded -
                // the same rule `history/index.ts` states for a person's own save.
                history = {
                    recorded: false,
                    message: `The change was made but could not be recorded in the config folder's history: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                };
            }
        }
    }

    const agent = agentReport({
        consulted: true,
        available: true,
        cause: proposal.cause,
        notes: proposal.notes,
        refused: [...refused, ...failures],
        message:
            proposal.cause === null
                ? "The coding agent proposed a change without naming a cause."
                : `The coding agent's account of the failure: ${proposal.cause}`,
    });

    return {
        explained: false,
        diagnoses,
        agent,
        applied,
        history,
        summary: summarise(diagnoses, applied, agent),
        at,
    };
}
