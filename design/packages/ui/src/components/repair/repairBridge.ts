/**
 * The repair bridge, structurally mirrored from the preload for the same reason
 * `bedrockBridge.ts` restates its own: this package compiles and runs in three places and
 * only one of them has a preload.
 */

export interface AgentAvailability {
    readonly available: boolean;
    readonly command: string;
    readonly version: string | null;
    readonly message: string;
}

export interface FailureSummary {
    readonly id: string;
    readonly subject: "render" | "web-server";
    readonly mode: "local" | "docker";
    readonly exitCode: number | null;
    readonly at: string;
}

export type RepairRemedyKind =
    | "settings"
    | "retry"
    | "retry-container"
    | "restore-config"
    | "fix-config"
    | "none";

export interface SettingsTarget {
    readonly surface: "settings";
    readonly anchor: "mojang-download-consent" | "java-runtime" | "map-storage-directory" | "world-folder";
    readonly missing: boolean;
}

export interface RepairRemedy {
    readonly kind: RepairRemedyKind;
    readonly summary: string;
    readonly settings: SettingsTarget | null;
    readonly retry: Record<string, unknown> | null;
}

export interface RepairDiagnosis {
    readonly code: string;
    readonly message: string;
    readonly because: string;
    readonly remedy: RepairRemedy;
}

export type DiagnoseAnswer =
    | { readonly ok: true; readonly diagnoses: readonly RepairDiagnosis[] }
    | { readonly ok: false; readonly message: string };

export interface RefusedEdit {
    readonly path: string;
    readonly reason: string;
}

export interface AgentReport {
    readonly consulted: boolean;
    readonly available: boolean;
    readonly message: string;
    readonly cause: string | null;
    readonly notes: string | null;
    readonly refused: readonly RefusedEdit[];
}

export interface AppliedChange {
    readonly path: string;
    readonly absolutePath: string;
    readonly before: string | null;
    readonly after: string;
    readonly diff: string;
    readonly linesAdded: number;
    readonly linesRemoved: number;
}

export interface HistoryReport {
    readonly recorded: boolean;
    readonly message: string;
}

export interface RepairResult {
    readonly explained: boolean;
    readonly diagnoses: readonly RepairDiagnosis[];
    readonly agent: AgentReport;
    readonly applied: readonly AppliedChange[];
    readonly history: HistoryReport | null;
    readonly summary: string;
    readonly at: string;
}

export type RepairAnswer =
    | { readonly ok: true; readonly result: RepairResult }
    | { readonly ok: false; readonly message: string };

/** What this surface needs from the shell. All or nothing, per this project's usual rule. */
export interface RepairBridge {
    agentAvailability(): Promise<AgentAvailability>;
    failures(): Promise<readonly FailureSummary[]>;
    diagnose(id: string): Promise<DiagnoseAnswer>;
    run(id: string): Promise<RepairAnswer>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The repair bridge, or null when this build cannot diagnose or repair a failed run. */
export function resolveRepairBridge(): RepairBridge | null {
    const host = (globalThis as { worldlens?: { repair?: unknown } }).worldlens;
    if (host === undefined) return null;
    const api = host.repair;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<RepairBridge>;
    const required = [candidate.agentAvailability, candidate.failures, candidate.diagnose, candidate.run];
    if (!required.every(isFunction)) return null;

    const complete = api as RepairBridge;
    return {
        agentAvailability: () => complete.agentAvailability(),
        failures: () => complete.failures(),
        diagnose: (id) => complete.diagnose(id),
        run: (id) => complete.run(id),
    };
}
