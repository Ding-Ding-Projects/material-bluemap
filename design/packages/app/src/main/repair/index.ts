/**
 * Working out why a render or the web server would not start, and fixing what can be fixed.
 *
 * Two halves, in this order and never the other way round:
 *
 * 1. `diagnose.ts` decides every failure this project already knows the shape of - a port
 *    in use, no Java, Java too old, an unreadable world, an unwritable output folder, the
 *    Mojang download not accepted, an out-of-memory kill, a config BlueMap itself refused.
 *    No model is involved in any of it.
 * 2. `agent.ts` and `pass.ts` hand what is left to a local coding agent, if one is
 *    installed and the user has switched it on, inside the guardrails in `guardrails.ts`:
 *    config files only, in this run's config folder only, writes only, never a deletion,
 *    never a git command, never the world.
 *
 * Every automatic change is recorded in the app's own version history before it is
 * reported, and is shown afterwards as a plain diff with what changed and why.
 *
 * ```ts
 * import { collectEvidence, registerRepairHandlers } from "./repair/index.js";
 *
 * const repair = registerRepairHandlers(ipcMain, { allowAgent: () => settings.autoRepair });
 * // ...when a run fails:
 * const id = repair.remember(collectEvidence({ ... }));
 * ```
 */

export {
    MAX_CONFIG_TEXT,
    MAX_EVIDENCE_LINES,
    REDACTED,
    collectEvidence,
    describeEvidence,
    evidenceText,
    redactSecrets,
    type CollectEvidenceInput,
    type ConfigSnapshot,
    type EvidenceWorld,
    type RepairEvidence,
    type RepairSubject,
} from "./evidence.js";

export {
    diagnose,
    explained,
    javaFeature,
    suggestedHeap,
    type RepairDiagnosis,
    type RepairDiagnosisCode,
    type RepairRemedy,
    type RepairRemedyKind,
    type RetryAdjustment,
} from "./diagnose.js";

export {
    FORBIDDEN_ACTIONS,
    MAX_REPAIR_BYTES,
    checkEdit,
    partitionEdits,
    type AllowedEdit,
    type EditCheck,
    type ProposedEdit,
    type RefusedEdit,
    type RepairScope,
} from "./guardrails.js";

export {
    DIFF_CONTEXT,
    MAX_DIFF_LINES,
    diffCounts,
    lineChanges,
    unifiedDiff,
} from "./diff.js";

export {
    AGENT_TIMEOUT_MS,
    OPENCODE_COMMAND,
    buildRepairPrompt,
    detectCodingAgent,
    opencodeRunner,
    parseAgentReply,
    type AgentAvailability,
    type AgentProposal,
    type AgentReply,
    type RunAgent,
} from "./agent.js";

export {
    runRepairPass,
    type AgentReport,
    type AppliedChange,
    type HistoryReport,
    type ReadText,
    type RecordHistory,
    type RepairOptions,
    type RepairResult,
    type WriteText,
} from "./pass.js";

export {
    MAX_REMEMBERED_FAILURES,
    REPAIR_CHANNELS,
    registerRepairHandlers,
    scopeFromEvidence,
    type DiagnoseAnswer,
    type FailureSummary,
    type RepairAnswer,
    type RepairIpc,
    type RepairIpcOptions,
} from "./ipc.js";
