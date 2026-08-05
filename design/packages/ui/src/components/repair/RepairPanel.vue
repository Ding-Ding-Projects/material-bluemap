<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCheckCircleOutline, mdiRefresh, mdiRobotOutline, mdiWrenchOutline } from "@mdi/js";
import { VAlert, VBtn, VChip, VProgressCircular } from "vuetify/components";
import {
    resolveRepairBridge,
    type AgentAvailability,
    type FailureSummary,
    type RepairBridge,
    type RepairDiagnosis,
    type RepairResult,
} from "./repairBridge.js";

/**
 * Diagnosing and, when a local coding agent is switched on, repairing why a render or the
 * web server failed to start - see `docs/automatic-repair.md`.
 *
 * `main/repair/index.ts` is a complete, unit-tested subsystem: deterministic diagnosis for
 * every failure this project already knows the shape of, and a guardrailed local agent for
 * whatever is left. It was registered on every launch and reachable by nobody - no preload
 * method, no renderer code. This is the entry point: it lists the failures the main process
 * currently has on record and lets each one be diagnosed or repaired.
 *
 * **What genuinely reaches this list today.** `repair:remember` - the call that puts a
 * failure on record in the first place - is not yet wired into the render or web-server
 * failure paths; see the doc's own "the renderer names a failure, it never describes one"
 * section for why that has to happen in the main process, at the moment of failure, rather
 * than from here. So this panel is honest about the state it is actually in: it lists real
 * failures the moment something does call `remember`, and says plainly that none are on
 * record until then, rather than inventing one to look busier than it is.
 */
const props = defineProps<{
    /**
     * Injected in tests. Left out, the Electron bridge is probed; `null` says there is
     * deliberately none, in which case this says so rather than a control that would throw.
     */
    bridge?: RepairBridge | null;
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveRepairBridge() : props.bridge;

const loading = ref(true);
const agent = ref<AgentAvailability | null>(null);
const failures = ref<readonly FailureSummary[]>([]);

const diagnosingId = ref<string | null>(null);
const diagnoses = ref<Record<string, readonly RepairDiagnosis[]>>({});
const diagnosisError = ref<Record<string, string>>({});

const runningId = ref<string | null>(null);
const results = ref<Record<string, RepairResult>>({});
const runError = ref<Record<string, string>>({});

async function load(): Promise<void> {
    if (bridge === null) {
        loading.value = false;
        return;
    }
    loading.value = true;
    try {
        const [agentAnswer, failureList] = await Promise.all([bridge.agentAvailability(), bridge.failures()]);
        agent.value = agentAnswer;
        failures.value = failureList;
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void load();
});

async function diagnose(id: string): Promise<void> {
    if (bridge === null) return;
    diagnosingId.value = id;
    try {
        const answer = await bridge.diagnose(id);
        if (answer.ok) {
            diagnoses.value = { ...diagnoses.value, [id]: answer.diagnoses };
            const { [id]: _removed, ...rest } = diagnosisError.value;
            diagnosisError.value = rest;
        } else {
            diagnosisError.value = { ...diagnosisError.value, [id]: answer.message };
        }
    } finally {
        diagnosingId.value = null;
    }
}

async function run(id: string): Promise<void> {
    if (bridge === null) return;
    runningId.value = id;
    try {
        const answer = await bridge.run(id);
        if (answer.ok) {
            results.value = { ...results.value, [id]: answer.result };
            const { [id]: _removed, ...rest } = runError.value;
            runError.value = rest;
        } else {
            runError.value = { ...runError.value, [id]: answer.message };
        }
    } finally {
        runningId.value = null;
    }
}

function subjectLabel(failure: FailureSummary): string {
    return failure.subject === "render" ? t("repair.subject.render", "Render") : t("repair.subject.webServer", "Web server");
}
</script>

<template>
    <section class="mb-repair" :aria-label="t('repair.title', 'Automatic repair')">
        <div v-if="loading" class="mb-repair__loading" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("repair.loading", "Reading what is on record...") }}</span>
        </div>

        <template v-else-if="bridge === null">
            <p class="mb-repair__note">
                {{ t("repair.noHost", "This build cannot diagnose a failed run. The desktop application is what does.") }}
            </p>
        </template>

        <template v-else>
            <div class="mb-repair__agent">
                <v-chip
                    :prepend-icon="mdiRobotOutline"
                    :color="agent?.available ? 'success' : undefined"
                    size="small"
                    variant="tonal"
                >
                    {{ agent?.message ?? "" }}
                </v-chip>
                <v-btn :prepend-icon="mdiRefresh" variant="text" size="small" @click="load">
                    {{ t("repair.refresh", "Refresh") }}
                </v-btn>
            </div>

            <p v-if="failures.length === 0" class="mb-repair__note">
                {{
                    t(
                        "repair.empty",
                        "No failures are on record. One is remembered here the moment a render or the web server fails to start, so it can be diagnosed and, where the failure is understood, repaired.",
                    )
                }}
            </p>

            <ul v-else class="mb-repair__list">
                <li v-for="failure in failures" :key="failure.id" class="mb-repair__row">
                    <div class="mb-repair__rowHead">
                        <strong>{{ subjectLabel(failure) }}</strong>
                        <v-chip size="x-small" variant="tonal">{{ failure.mode }}</v-chip>
                        <span class="mb-repair__at">{{ failure.at }}</span>
                    </div>

                    <div class="mb-repair__rowActions">
                        <v-btn
                            :prepend-icon="mdiCheckCircleOutline"
                            variant="tonal"
                            size="small"
                            :loading="diagnosingId === failure.id"
                            @click="diagnose(failure.id)"
                        >
                            {{ t("repair.diagnose", "Diagnose") }}
                        </v-btn>
                        <v-btn
                            :prepend-icon="mdiWrenchOutline"
                            variant="tonal"
                            size="small"
                            color="primary"
                            :loading="runningId === failure.id"
                            @click="run(failure.id)"
                        >
                            {{ t("repair.run", "Diagnose and repair") }}
                        </v-btn>
                    </div>

                    <v-alert v-if="diagnosisError[failure.id]" type="error" density="compact" variant="tonal" class="mt-2">
                        {{ diagnosisError[failure.id] }}
                    </v-alert>
                    <ul v-else-if="diagnoses[failure.id]" class="mb-repair__diagnoses">
                        <li v-for="(diagnosis, index) in diagnoses[failure.id]" :key="index">
                            <strong>{{ diagnosis.message }}</strong>
                            <span> - {{ diagnosis.remedy.summary }}</span>
                        </li>
                        <li v-if="diagnoses[failure.id]?.length === 0">
                            {{ t("repair.unexplained", "This failure did not match anything this build knows how to explain.") }}
                        </li>
                    </ul>

                    <v-alert v-if="runError[failure.id]" type="error" density="compact" variant="tonal" class="mt-2">
                        {{ runError[failure.id] }}
                    </v-alert>
                    <div v-else-if="results[failure.id]" class="mb-repair__result">
                        <p>{{ results[failure.id]?.summary }}</p>
                        <p class="mb-repair__note">{{ results[failure.id]?.agent.message }}</p>
                        <ul v-if="(results[failure.id]?.applied.length ?? 0) > 0" class="mb-repair__applied">
                            <li v-for="change in results[failure.id]?.applied" :key="change.path">
                                {{ change.path }}
                                ({{ t("repair.lineChanges", { added: change.linesAdded, removed: change.linesRemoved }, "+{added}/-{removed}") }})
                            </li>
                        </ul>
                        <p v-if="results[failure.id]?.history" class="mb-repair__note">
                            {{ results[failure.id]?.history?.message }}
                        </p>
                    </div>
                </li>
            </ul>
        </template>
    </section>
</template>

<style>
.mb-repair__loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
}

.mb-repair__note {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin: 4px 0 0;
}

.mb-repair__agent {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 12px;
}

/* The agent chip carries a full sentence (`repair.agent.*` in `agent.ts`), not a short
   label, and Vuetify's chip content is single-line and non-wrapping by default. At the
   settings panel's default docked-right width that sentence is wider than the chip has
   room for, so without this it clips mid-word with no ellipsis, no scroll and no way to
   read the rest - the panel's own space is real, the text past the edge just is not drawn.
   `min-width: 0` lets the chip shrink inside the flex row instead of forcing an overflow;
   `overflow-wrap: anywhere` on its content lets the sentence wrap once it does. */
.mb-repair__agent .v-chip {
    min-width: 0;
    max-width: 100%;
    height: auto;
}

.mb-repair__agent .v-chip .v-chip__content {
    white-space: normal;
    overflow-wrap: anywhere;
    padding-block: 2px;
}

.mb-repair__list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-repair__row {
    padding: 10px 0;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-repair__rowHead {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.875rem;
}

.mb-repair__at {
    font-size: 0.75rem;
    opacity: 0.7;
}

.mb-repair__rowActions {
    display: flex;
    gap: 8px;
    margin-block-start: 8px;
}

.mb-repair__diagnoses,
.mb-repair__applied {
    margin: 8px 0 0 1.1em;
    font-size: 0.8125rem;
    line-height: 1.6;
}

.mb-repair__result {
    margin-block-start: 8px;
    font-size: 0.8125rem;
}
</style>
