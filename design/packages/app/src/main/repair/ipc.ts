/**
 * The repair channel between the main process and the interface.
 *
 * Built like `config/ipc.ts`: Electron arrives as a *type*, `IpcMain` is a parameter, the
 * import is erased at build time, and every channel is named once in
 * {@link REPAIR_CHANNELS} so `dispose` cannot drift from the registration.
 *
 * ## The renderer names a failure; it never describes one
 *
 * Evidence is put here by the main process, at the moment a run fails, and the renderer
 * gets an id back. Every channel below takes that id. The alternative - letting the
 * renderer send an evidence record - would let whatever is running in that window choose
 * the config folder a repair writes into, choose which world folders are "not to be
 * touched", and choose what the agent is told. The guardrails would still refuse an edit
 * outside the folder, but the folder itself would be the renderer's to name, which is the
 * one input they cannot check.
 *
 * **No handler rejects.** Every answer is a value with an `ok` on it, because each one is
 * something the interface has to render: an unknown id, a repair that changed nothing, and
 * a repair that changed two files are three states of one panel.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { detectCodingAgent, opencodeRunner, type AgentAvailability, type RunAgent } from "./agent.js";
import { diagnose, type RepairDiagnosis } from "./diagnose.js";
import type { RepairEvidence } from "./evidence.js";
import type { RepairScope } from "./guardrails.js";
import { runRepairPass, type ReadText, type RecordHistory, type RepairResult, type WriteText } from "./pass.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const REPAIR_CHANNELS = [
    "repair:agent",
    "repair:failures",
    "repair:diagnose",
    "repair:run",
] as const;

/**
 * How many failures are kept.
 *
 * A person repairs the run that just failed, not the one from an hour ago, and each record
 * holds a config folder's worth of text. Twenty is far more than anybody scrolls back
 * through and small enough that the whole registry is a few hundred kilobytes.
 */
export const MAX_REMEMBERED_FAILURES = 20;

/** What the failure list shows: enough to pick one, not the whole record. */
export interface FailureSummary {
    readonly id: string;
    readonly subject: RepairEvidence["subject"];
    readonly mode: RepairEvidence["mode"];
    readonly exitCode: number | null;
    readonly at: string;
}

export type DiagnoseAnswer =
    | { readonly ok: true; readonly diagnoses: readonly RepairDiagnosis[] }
    | { readonly ok: false; readonly message: string };

export type RepairAnswer =
    | { readonly ok: true; readonly result: RepairResult }
    | { readonly ok: false; readonly message: string };

export interface RepairIpcOptions {
    /**
     * Whether a coding agent may be consulted for a failure nothing else explained.
     *
     * A function rather than a boolean because the answer can change while the app is
     * running: somebody can switch it on in Settings between two failures, and somebody
     * can switch it off. Reading it at the moment of the repair is the only reading that
     * is current.
     */
    readonly allowAgent?: () => boolean;
    /** Injected so a test needs no `opencode` on PATH. */
    readonly detectAgent?: () => Promise<AgentAvailability>;
    readonly runAgent?: RunAgent;
    readonly readText?: ReadText;
    readonly writeText?: WriteText;
    readonly recordHistory?: RecordHistory;
    /** Where the world folders come from, so a repair can be told what to keep away from. */
    readonly scopeFor?: (evidence: RepairEvidence) => RepairScope;
}

export interface RepairIpc {
    /** Files a failure and returns the id the interface asks about it by. */
    remember(evidence: RepairEvidence): string;
    /** Drops one, for a failure that has been resolved. */
    forget(id: string): void;
    dispose(): void;
}

/** The scope a repair works inside, derived from the evidence rather than supplied. */
export function scopeFromEvidence(evidence: RepairEvidence): RepairScope {
    return {
        configDir: evidence.hostConfigDir,
        worldPaths: evidence.worlds.map((world) => world.path),
    };
}

function summaryOf(id: string, evidence: RepairEvidence): FailureSummary {
    return {
        id,
        subject: evidence.subject,
        mode: evidence.mode,
        exitCode: evidence.exitCode,
        at: evidence.at,
    };
}

/**
 * Registers the repair handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has
 * one.
 */
export function registerRepairHandlers(
    ipcMain: IpcMain,
    options: RepairIpcOptions = {},
): RepairIpc {
    const failures = new Map<string, RepairEvidence>();
    let counter = 0;

    const scopeFor = options.scopeFor ?? scopeFromEvidence;
    const detect = options.detectAgent ?? (async () => await detectCodingAgent());

    // Detected once per repair rather than once per app: `opencode` can be installed while
    // the app is open, and a cached "not installed" from launch would keep saying so.
    const availability = async (): Promise<AgentAvailability> => {
        try {
            return await detect();
        } catch (error) {
            return {
                available: false,
                command: "opencode",
                version: null,
                message: `A local coding agent could not be looked for: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            };
        }
    };

    const evidenceFor = (id: unknown): RepairEvidence | null =>
        typeof id === "string" ? (failures.get(id) ?? null) : null;

    ipcMain.handle("repair:agent", async (_event: IpcMainInvokeEvent): Promise<AgentAvailability> => await availability());

    ipcMain.handle("repair:failures", (_event: IpcMainInvokeEvent): FailureSummary[] =>
        [...failures.entries()].map(([id, evidence]) => summaryOf(id, evidence)),
    );

    ipcMain.handle("repair:diagnose", (_event: IpcMainInvokeEvent, id: unknown): DiagnoseAnswer => {
        const evidence = evidenceFor(id);
        if (evidence === null) {
            return { ok: false, message: "That failure is no longer on record, so there was nothing to look at." };
        }
        try {
            return { ok: true, diagnoses: diagnose(evidence) };
        } catch (error) {
            return {
                ok: false,
                message: `The failure could not be looked at: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    });

    ipcMain.handle("repair:run", async (_event: IpcMainInvokeEvent, id: unknown): Promise<RepairAnswer> => {
        const evidence = evidenceFor(id);
        if (evidence === null) {
            return { ok: false, message: "That failure is no longer on record, so there was nothing to repair." };
        }
        const allow = options.allowAgent?.() ?? false;
        const agent = allow ? await availability() : null;
        try {
            const result = await runRepairPass(evidence, {
                scope: scopeFor(evidence),
                allowAgent: allow,
                agent,
                runAgent: options.runAgent ?? (allow ? opencodeRunner() : null),
                ...(options.readText === undefined ? {} : { readText: options.readText }),
                ...(options.writeText === undefined ? {} : { writeText: options.writeText }),
                ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
            });
            return { ok: true, result };
        } catch (error) {
            // `runRepairPass` does not reject, and this is here for the day somebody
            // changes that: an exception on this channel would arrive at the renderer as a
            // stack trace on top of the error the person was already reading.
            return {
                ok: false,
                message: `The repair could not be run: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    });

    return {
        remember(evidence: RepairEvidence): string {
            counter += 1;
            const id = `failure-${String(counter)}`;
            failures.set(id, evidence);
            while (failures.size > MAX_REMEMBERED_FAILURES) {
                const oldest = failures.keys().next();
                if (oldest.done === true) break;
                failures.delete(oldest.value);
            }
            return id;
        },
        forget(id: string): void {
            failures.delete(id);
        },
        dispose(): void {
            failures.clear();
            for (const channel of REPAIR_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
