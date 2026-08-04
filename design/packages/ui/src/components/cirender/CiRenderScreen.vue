<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloudSyncOutline, mdiOpenInNew, mdiRefresh } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VProgressCircular,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createCiRenders, formatBytes, jobTone, phaseLabel, runLabel, uploadLine } from "./ciRenders.js";
import type { CiRow } from "./ciRenders.js";
import { resolveCiRenderBridge } from "./ciRenderBridge.js";
import type { CiJobReport, CiRenderBridge, CiPreflight } from "./ciRenderBridge.js";

/**
 * Having GitHub's runners render a world this computer cannot.
 *
 * ## What this screen is for, said out loud
 *
 * Rendering a large world is hours of CPU and gigabytes of disk. On a thin laptop that is
 * an afternoon of the fan at full speed and nothing else usable, and on some machines it
 * simply does not finish. A GitHub runner has four cores, fourteen gigabytes of free disk
 * and nothing else to do. This screen sends the world there and brings the map back.
 *
 * The trade-offs are on the screen too, not in a footnote. Uploading a multi-gigabyte
 * world takes hours on a domestic connection; a private repository's Actions minutes are
 * finite where a public repository's are not; and a world past a release asset's ceiling
 * cannot be dispatched at all. Advertising the upside without those is how somebody spends
 * an afternoon finding them out.
 *
 * ## Three things here are deliberate and read as omissions if they are not stated
 *
 * **Two consents, and neither is pre-ticked.** Uploading a world sends it to GitHub, and a
 * PUBLIC repository makes it downloadable by anybody - a world carries builds, coordinates
 * and whatever a friend left in a chest. The main process refuses without both, because a
 * guard that lives only in the renderer is not a guard.
 *
 * **Mojang's licence is not accepted here.** The workflow accepts it on the repository
 * owner's behalf, which is a real legal acceptance. This screen reports that it has not
 * been given and points at the settings row that already asks; there is no second tick box
 * for it anywhere in this feature.
 *
 * **Which GitHub credential is in play is shown before the button.** A machine typically
 * holds two - this application's sign-in and `gh`'s - and "permission denied" is
 * unactionable when a person cannot tell which one was refused.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this has
         * no default: `undefined` means probe, `null` means there is deliberately no bridge
         * and the unsupported state is what should be shown.
         */
        bridge?: CiRenderBridge | null | undefined;
        /** Worlds this machine already knows about, offered beside the folder field. */
        worlds?: readonly { folder: string; label: string }[] | undefined;
        /** True when the shell can open settings at a row. */
        canOpenSettings?: boolean | undefined;
    }>(),
    { worlds: () => [], canOpenSettings: false },
);

const emit = defineEmits<{
    /** Open the GitHub sign-in row in settings. */
    signIn: [];
    /** Open the Mojang download consent row in settings. */
    openConsent: [];
    /** Open a URL in the system browser. */
    open: [url: string];
    /** A map arrived and was registered. The shell can select it in the map list. */
    rendered: [where: { renderId: string; dataRoot: string; mapId: string }];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveCiRenderBridge() : props.bridge;
const renders = createCiRenders(bridge);

const worldFolder = ref(props.worlds[0]?.folder ?? "");
const owner = ref("");
const repo = ref("");
const acknowledgeUpload = ref(false);
const acknowledgePublic = ref(false);
const forceUpload = ref(false);

const preflight = computed<CiPreflight | null>(() => renders.preflight.value);
const isPublic = computed(() => preflight.value?.repository?.private === false);
const routeReport = computed(() => preflight.value?.routeReport ?? null);

/**
 * Whether the button may be pressed.
 *
 * Everything it checks is checked again in the main process. This is not belt and braces
 * for its own sake: a disabled button explains *why* it is disabled, which a refusal
 * arriving after a click cannot do as well - but the refusal is what actually protects the
 * world, because a renderer can be wrong or out of date and the main process cannot.
 */
const blockedBecause = computed<string | null>(() => {
    if (!renders.available) {
        return t("cirender.unsupported", "The desktop application is what starts a CI render.");
    }
    const report = preflight.value;
    if (report === null) return t("cirender.blocked.check", "Check the repository first.");
    if (!report.eulaAccepted) {
        return t(
            "cirender.blocked.eula",
            "Mojang's licence has not been accepted on this computer, and the render needs it.",
        );
    }
    if (report.routeReport.ready !== true) return report.routeReport.describe;
    if (report.planFailure !== null) return report.planFailure;
    if (report.worldFailure !== null) return report.worldFailure;
    if (report.tooLargeToUpload && report.uploadNeeded) {
        return t(
            "cirender.blocked.large",
            { size: formatBytes(report.estimatedArchiveBytes, t) },
            "This world packs to about {size}, past what one GitHub release asset can hold.",
        );
    }
    if (report.uploadNeeded && !report.routeReport.canUpload) {
        return t(
            "cirender.blocked.uploadRoute",
            "Uploading a world needs this application's own GitHub sign-in. Sign in from Settings.",
        );
    }
    if (report.uploadNeeded && !acknowledgeUpload.value) {
        return t("cirender.blocked.upload", "Confirm that the world may be uploaded to GitHub.");
    }
    if (isPublic.value && !acknowledgePublic.value) {
        return t("cirender.blocked.public", "Confirm that you mean to publish this world publicly.");
    }
    return null;
});

async function check(): Promise<void> {
    await renders.check({
        worldFolder: worldFolder.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
    });
}

async function start(): Promise<void> {
    const result = await renders.start({
        worldFolder: worldFolder.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        acknowledgeUpload: acknowledgeUpload.value,
        acknowledgePublic: acknowledgePublic.value,
        forceUpload: forceUpload.value,
    });
    if (result?.ok === true && result.outcome === "rendered") {
        emit("rendered", {
            renderId: result.summary.renderId,
            dataRoot: result.summary.dataRoot,
            mapId: result.summary.mapId,
        });
    }
}

/* -- the job list, searchable like every other list in the application ------ */

const jobQuery = ref("");
const jobRegex = ref(false);
const jobFlags = ref("i");

function visibleJobs(row: CiRow): readonly CiJobReport[] {
    const matcher = createSettingMatcher(jobQuery.value, jobRegex.value, jobFlags.value);
    return (row.run?.jobs ?? []).filter((job) => matcher.test(`${job.name} ${job.status} ${job.conclusion ?? ""}`));
}

function jobSample(row: CiRow): string {
    return (row.run?.jobs ?? []).map((job) => job.name).join("\n");
}

onMounted(() => {
    void renders.loadKnown();
});

onBeforeUnmount(() => {
    renders.dispose();
});
</script>

<template>
    <div class="ci-render-screen">
        <VCard variant="tonal" class="mb-4">
            <VCardTitle>{{ t("cirender.title", "Render on GitHub") }}</VCardTitle>
            <VCardText>
                <p>
                    {{
                        t(
                            "cirender.pitch",
                            "Built for computers that cannot render a big world themselves. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
                        )
                    }}
                </p>
                <p class="mt-2 text-medium-emphasis">
                    {{
                        t(
                            "cirender.caveats",
                            "The trade-offs, plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
                        )
                    }}
                </p>
            </VCardText>
        </VCard>

        <VAlert v-if="!renders.available" type="info" variant="tonal" class="mb-4">
            {{ t("cirender.unsupported", "The desktop application is what starts a CI render.") }}
        </VAlert>

        <template v-else>
            <VCard class="mb-4">
                <VCardTitle>{{ t("cirender.where.title", "What, and where") }}</VCardTitle>
                <VCardText>
                    <VTextField
                        v-model="worldFolder"
                        :label="t('cirender.field.world', 'World folder')"
                        density="compact"
                    />
                    <div class="d-flex ga-2">
                        <VTextField
                            v-model="owner"
                            :label="t('cirender.field.owner', 'Repository owner')"
                            density="compact"
                        />
                        <VTextField
                            v-model="repo"
                            :label="t('cirender.field.repo', 'Repository name')"
                            density="compact"
                        />
                    </div>
                    <VBtn
                        :prepend-icon="mdiRefresh"
                        :loading="renders.checking.value"
                        variant="tonal"
                        @click="check"
                    >
                        {{ t("cirender.check", "Check before anything is sent") }}
                    </VBtn>
                    <VAlert
                        v-if="renders.preflightFailure.value !== null"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                    >
                        {{ renders.preflightFailure.value }}
                    </VAlert>
                </VCardText>
            </VCard>

            <VCard v-if="preflight !== null" class="mb-4">
                <VCardTitle>{{ t("cirender.report.title", "What this would do") }}</VCardTitle>
                <VCardText>
                    <!--
                        Which credential is driving, before the button rather than after a
                        403. A machine typically holds two GitHub sign-ins and they are not
                        interchangeable.
                    -->
                    <VAlert
                        :type="routeReport?.ready === true ? 'info' : 'warning'"
                        variant="tonal"
                        class="mb-3"
                        data-test="route"
                    >
                        {{ routeReport?.describe }}
                    </VAlert>

                    <VAlert
                        v-if="preflight.eulaAccepted !== true"
                        type="warning"
                        variant="tonal"
                        class="mb-3"
                        data-test="eula"
                    >
                        {{
                            t(
                                "cirender.eula",
                                "The render workflow downloads a Minecraft client jar for its block models and textures, which needs Mojang's licence to have been accepted. This application will not accept it for you.",
                            )
                        }}
                        <VBtn
                            v-if="props.canOpenSettings"
                            size="small"
                            variant="text"
                            class="mt-2"
                            @click="emit('openConsent')"
                        >
                            {{ t("cirender.eula.open", "Open the consent setting") }}
                        </VBtn>
                    </VAlert>

                    <VAlert
                        v-if="preflight.repository?.warning != null"
                        :type="preflight.repository.warning.level === 'warning' ? 'warning' : 'info'"
                        variant="tonal"
                        class="mb-3"
                        data-test="repository-warning"
                    >
                        {{ preflight.repository.warning.message }}
                    </VAlert>
                    <VAlert
                        v-else-if="preflight.repositoryFailure !== null"
                        type="info"
                        variant="tonal"
                        class="mb-3"
                        data-test="repository-unknown"
                    >
                        {{
                            t(
                                "cirender.repository.unknown",
                                "This application's own GitHub sign-in could not read the repository, so whether it is public could not be checked. Nothing can be uploaded on this route.",
                            )
                        }}
                    </VAlert>

                    <p data-test="upload-line">{{ uploadLine(preflight, t) }}</p>

                    <p v-if="preflight.plan !== null && preflight.plan.notCarried.length > 0" class="text-medium-emphasis mt-2">
                        {{
                            t(
                                "cirender.notCarried",
                                { settings: preflight.plan.notCarried.join(", ") },
                                "The workflow has no input for the map's own settings, so {settings} will not be applied. It renders with BlueMap's defaults for them.",
                            )
                        }}
                    </p>

                    <VCheckbox
                        v-if="preflight.uploadNeeded"
                        v-model="acknowledgeUpload"
                        density="compact"
                        data-test="ack-upload"
                        :label="
                            t(
                                'cirender.ack.upload',
                                'I understand this uploads the whole world folder to GitHub.',
                            )
                        "
                    />
                    <VCheckbox
                        v-if="isPublic"
                        v-model="acknowledgePublic"
                        density="compact"
                        data-test="ack-public"
                        :label="
                            t(
                                'cirender.ack.public',
                                'I understand this repository is PUBLIC and anybody could download the world.',
                            )
                        "
                    />
                    <VCheckbox
                        v-model="forceUpload"
                        density="compact"
                        data-test="force-upload"
                        :label="t('cirender.force', 'Upload again even if the world looks unchanged')"
                    />

                    <VBtn
                        :prepend-icon="mdiCloudSyncOutline"
                        :disabled="blockedBecause !== null"
                        :loading="renders.starting.value"
                        color="primary"
                        data-test="start"
                        @click="start"
                    >
                        {{ t("cirender.start", "Render on GitHub") }}
                    </VBtn>
                    <p v-if="blockedBecause !== null" class="text-medium-emphasis mt-2" data-test="blocked">
                        {{ blockedBecause }}
                    </p>
                </VCardText>
            </VCard>

            <VAlert
                v-if="renders.startFailure.value !== null"
                type="error"
                variant="tonal"
                class="mb-4"
                data-test="start-failure"
            >
                {{ renders.startFailure.value.message }}
                <VBtn
                    v-if="renders.startFailure.value.needsSignIn && props.canOpenSettings"
                    size="small"
                    variant="text"
                    class="mt-2"
                    @click="emit('signIn')"
                >
                    {{ t("cirender.signIn", "Open the GitHub sign-in") }}
                </VBtn>
                <VBtn
                    v-if="renders.startFailure.value.needsEula && props.canOpenSettings"
                    size="small"
                    variant="text"
                    class="mt-2"
                    @click="emit('openConsent')"
                >
                    {{ t("cirender.eula.open", "Open the consent setting") }}
                </VBtn>
            </VAlert>

            <VCard v-for="row in renders.rows.value" :key="row.syncId" class="mb-3" data-test="row">
                <VCardTitle class="d-flex align-center ga-2">
                    <span>{{ row.repository || row.syncId }}</span>
                    <VChip size="small" data-test="row-state">{{ row.state }}</VChip>
                    <VProgressCircular v-if="row.state === 'running'" indeterminate size="18" />
                </VCardTitle>
                <VCardText>
                    <p>{{ phaseLabel(row.phase, t) }}</p>
                    <p data-test="run-label">{{ runLabel(row.run, t) }}</p>

                    <VBtn
                        v-if="row.run !== null"
                        :prepend-icon="mdiOpenInNew"
                        size="small"
                        variant="text"
                        @click="emit('open', row.run.htmlUrl)"
                    >
                        {{ t("cirender.openRun", "Open the run on GitHub") }}
                    </VBtn>

                    <template v-if="row.run !== null && row.run.jobs.length > 0">
                        <ConfigSearchField
                            v-model="jobQuery"
                            v-model:regex="jobRegex"
                            v-model:flags="jobFlags"
                            :label="t('cirender.jobs.search', 'Search jobs')"
                            :sample="jobSample(row)"
                            density="compact"
                        />
                        <ul class="ci-jobs">
                            <li v-for="job in visibleJobs(row)" :key="job.id" data-test="job">
                                <VChip size="x-small" :color="jobTone(job)">{{ job.status }}</VChip>
                                <span class="ml-2">{{ job.name }}</span>
                                <span v-if="job.conclusion !== null" class="ml-2 text-medium-emphasis">
                                    {{ job.conclusion }}
                                </span>
                            </li>
                        </ul>
                    </template>

                    <VAlert
                        v-if="row.failure !== null"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                        data-test="row-failure"
                    >
                        <p>{{ row.failure.message }}</p>
                        <p v-if="row.failure.failingJob !== null" class="mt-2" data-test="failing-job">
                            {{
                                t(
                                    "cirender.failingJob",
                                    { job: row.failure.failingJob },
                                    "The job that failed: {job}",
                                )
                            }}
                        </p>
                        <pre v-if="row.failure.logExcerpt !== null" class="ci-log" data-test="log-excerpt">{{
                            row.failure.logExcerpt
                        }}</pre>
                    </VAlert>

                    <VAlert
                        v-if="row.summary !== null"
                        type="success"
                        variant="tonal"
                        class="mt-3"
                        data-test="row-summary"
                    >
                        {{
                            t(
                                "cirender.done",
                                { map: row.summary.mapName },
                                "{map} is in the map list, rendered on GitHub.",
                            )
                        }}
                        <span v-if="!row.summary.verified" class="d-block mt-1 text-medium-emphasis">
                            {{
                                t(
                                    "cirender.recorded",
                                    "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified.",
                                )
                            }}
                        </span>
                    </VAlert>

                    <VBtn
                        v-if="row.state === 'running' && renders.canCancel"
                        size="small"
                        variant="text"
                        :loading="row.stopping"
                        data-test="stop"
                        @click="renders.stop(row.syncId)"
                    >
                        {{ t("cirender.stop", "Stop watching") }}
                    </VBtn>
                </VCardText>
            </VCard>
        </template>
    </div>
</template>

<style scoped>
.ci-jobs {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
}

.ci-log {
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 16rem;
    font-size: 0.8125rem;
}
</style>
