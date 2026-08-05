/**
 * Diagnosing and repairing a failed render or web server. See `docs/automatic-repair.md`
 * and `RepairPanel.vue`'s own doc comment for what is genuinely wired today.
 */

export { default as RepairPanel } from "./RepairPanel.vue";

export {
    resolveRepairBridge,
    type AgentAvailability,
    type AgentReport,
    type AppliedChange,
    type DiagnoseAnswer,
    type FailureSummary,
    type HistoryReport,
    type RefusedEdit,
    type RepairAnswer,
    type RepairBridge,
    type RepairDiagnosis,
    type RepairRemedy,
    type RepairRemedyKind,
    type RepairResult,
    type SettingsTarget,
} from "./repairBridge.js";
