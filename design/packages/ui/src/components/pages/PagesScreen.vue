<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiContentCopy,
    mdiEarth,
    mdiOpenInNew,
    mdiRefresh,
    mdiWeb,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VProgressCircular,
    VProgressLinear,
    VRadio,
    VRadioGroup,
    VSelect,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { raiseNotice } from "../../stores/notices.js";
import {
    createPagesHosting,
    formatBytes,
    phaseLabel,
    sizeLine,
    statusLabel,
    statusTone,
} from "./pagesHosting.js";
import type { PagesRow } from "./pagesHosting.js";
import { resolvePagesBridge } from "./pagesBridge.js";
import type { PagesBridge, PagesCandidate, PagesPreflight, PagesRecord } from "./pagesBridge.js";

/**
 * Putting a map this computer rendered on the internet, at an address somebody else can open.
 *
 * ## What this screen is for, said out loud
 *
 * A finished render is served at `http://127.0.0.1:<port>/local/<id>/`, which is a URL that
 * works for exactly one person on exactly one machine that has to stay switched on. This
 * screen turns that into a GitHub Pages site: a real address, hosted by somebody else, free,
 * and still just files.
 *
 * ## Four things here are deliberate and read as omissions if they are not stated
 *
 * **The report comes before the button.** Publishing pushes every tile in the map, which is
 * routinely gigabytes across tens of thousands of files, and turns a repository's publishing
 * branch into whatever this render is. The size, the file count, GitHub's two limits, the map
 * files the viewer would ask for and not find, and what `gh` is on this machine are all on
 * screen before anything can be pressed.
 *
 * **A branch this application did not write is refused, not warned about.** Publishing
 * force-replaces the publishing branch, so pointing it at a repository that already has a site
 * would destroy that site. The main process checks for a marker file and refuses without it;
 * this screen shows that refusal as a blocker rather than as a checkbox somebody can tick.
 *
 * **"Built" is not "live".** GitHub reports a Pages build as built up to a minute before the
 * address resolves. The green state on this screen means a request to the published URL came
 * back 200, and nothing else produces it.
 *
 * **Taking a site down is behind the two-key gate.** It disables Pages and deletes the
 * publishing branch, which is the map gone from the internet, so it sits behind the same
 * super-confirmation every other destructive action in this application does.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this has no
         * default: `undefined` means probe, `null` means there is deliberately no bridge and
         * the unsupported state is what should be shown.
         */
        bridge?: PagesBridge | null | undefined;
    }>(),
    {},
);

const emit = defineEmits<{
    /** Open a URL in the system browser. */
    open: [url: string];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolvePagesBridge() : props.bridge;
const pages = createPagesHosting(bridge);

const renderId = ref("");
const owner = ref("");
const repo = ref("");
const branch = ref("gh-pages");
const visibility = ref<"public" | "private">("public");
const acknowledge = ref(false);

const preflight = computed<PagesPreflight | null>(() => pages.preflight.value);

/* -- the render list, searchable like every other list in the application --- */

const renderQuery = ref("");
const renderRegex = ref(false);
const renderFlags = ref("i");

const visibleRenders = computed<readonly PagesCandidate[]>(() => {
    const matcher = createSettingMatcher(renderQuery.value, renderRegex.value, renderFlags.value);
    return pages.candidates.value.filter((row) => matcher.test(`${row.renderId} ${row.maps.join(" ")}`));
});

const renderSample = computed(() =>
    pages.candidates.value.map((row) => `${row.renderId} ${row.maps.join(" ")}`).join("\n"),
);

const renderSummary = computed(() =>
    t(
        "pages.renders.summary",
        { shown: visibleRenders.value.length, total: pages.candidates.value.length },
        "Showing {shown} of {total} renders",
    ),
);

/**
 * What `gh` is on this machine, as one of three sentences rather than "unavailable".
 *
 * The three states have three different remedies and collapsing them sends most people to the
 * wrong one: "not installed" wants a download, "signed out" wants a command run in a terminal
 * this application deliberately does not drive, and "ready" wants nothing at all.
 */
const ghState = computed<{ tone: "info" | "warning"; text: string } | null>(() => {
    const gh = preflight.value?.gh;
    if (gh === undefined) return null;
    if (gh.availability === "ready") {
        return {
            tone: "info",
            text:
                gh.account === null
                    ? t("pages.gh.ready", "The gh command-line tool is installed and signed in.")
                    : t(
                          "pages.gh.readyAs",
                          { account: gh.account, host: gh.host ?? "github.com" },
                          "The gh command-line tool is signed in as {account} on {host}.",
                      ),
        };
    }
    return { tone: "warning", text: gh.message };
});

/**
 * Whether the button may be pressed.
 *
 * Everything it checks is checked again in the main process. This is not belt and braces for
 * its own sake: a disabled button can explain *why* it is disabled, which a refusal arriving
 * after a click cannot do as well - but the refusal is what actually protects the repository,
 * because a renderer can be wrong or out of date and the main process cannot.
 */
const blockedBecause = computed<string | null>(() => {
    if (!pages.available) {
        return t("pages.unsupported", "The desktop application is what publishes a map.");
    }
    const report = preflight.value;
    if (report === null) return t("pages.blocked.check", "Check the repository first.");
    if (report.blockers.length > 0) return report.blockers[0] ?? null;
    if (!acknowledge.value) {
        return t(
            "pages.blocked.acknowledge",
            "Confirm that you mean to publish this map, replacing whatever is on that branch.",
        );
    }
    return null;
});

async function check(): Promise<void> {
    await pages.check({
        renderId: renderId.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        branch: branch.value.trim(),
    });
}

async function publish(): Promise<void> {
    const result = await pages.publish({
        renderId: renderId.value.trim(),
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        branch: branch.value.trim(),
        visibility: visibility.value,
        acknowledgePublish: acknowledge.value,
    });
    if (result === null) return;
    if (!result.ok) {
        raiseNotice("error", result.failure.message);
        return;
    }
    // Two different sentences on purpose. "Published" and "published and answering" are not
    // the same claim, and the one people act on is the second.
    raiseNotice(
        result.report.verified ? "success" : "warning",
        result.report.verified
            ? t(
                  "pages.notice.live",
                  { url: result.report.url ?? "" },
                  "The map is live at {url}.",
              )
            : t(
                  "pages.notice.pending",
                  "The map was pushed and GitHub Pages was turned on, but the address has not answered yet.",
              ),
    );
}

function copy(url: string): void {
    void navigator.clipboard?.writeText(url);
    raiseNotice("info", t("pages.notice.copied", "The address was copied."));
}

async function removeHosting(record: PagesRecord): Promise<void> {
    const gone = await pages.removeHosting({
        renderId: record.renderId,
        owner: record.owner,
        repo: record.repo,
        branch: record.branch,
    });
    raiseNotice(
        gone ? "success" : "error",
        gone
            ? t("pages.notice.stopped", "The site was taken down and the publishing branch deleted.")
            : (pages.stopFailure.value ??
                  t("pages.notice.stopFailed", "The site could not be taken down.")),
    );
}

async function resume(site: PagesRecord): Promise<void> {
    const result = await pages.resumePublished(site);
    if (result === null) return;
    raiseNotice(
        result.ok ? "info" : "error",
        result.ok
            ? t("pages.notice.resumed", "The interrupted Pages publish is continuing.")
            : result.failure.message,
    );
}

async function refreshStatus(site: PagesRecord): Promise<void> {
    const refreshed = await pages.refreshPublishedStatus(site);
    raiseNotice(
        refreshed ? "success" : "error",
        refreshed
            ? t("pages.notice.refreshed", "The recorded Pages site status is up to date.")
            : (pages.publishedFailure.value ?? t("pages.notice.refreshFailed", "The Pages status could not be refreshed.")),
    );
}

function rowTitle(row: PagesRow): string {
    return row.target.length > 0 ? row.target : row.renderId;
}

onMounted(() => {
    void pages.loadCandidates();
    void pages.loadPublished();
    if (pages.canListOwners) void pages.loadOwners();
});

onBeforeUnmount(() => {
    pages.dispose();
});
</script>

<template>
    <div class="mb-pages-screen">
        <VCard variant="tonal" class="mb-4">
            <VCardTitle>{{ t("pages.title", "Put a map on the internet") }}</VCardTitle>
            <VCardText>
                <p>
                    {{
                        t(
                            "pages.pitch",
                            "A finished render is served from this computer, at an address only this computer can open. This publishes it to GitHub Pages instead: a real address anybody can open, hosted for free, and still only files.",
                        )
                    }}
                </p>
                <p class="mt-2 text-medium-emphasis">
                    {{
                        t(
                            "pages.caveats",
                            "The trade-offs, plainly: every tile is pushed, which is gigabytes across tens of thousands of files for a large map; GitHub asks Pages sites to stay under 1 GB and refuses any single file over 100 MB; and Pages on a private repository needs a paid plan. A public repository means anybody who finds the address can download the whole map.",
                        )
                    }}
                </p>
            </VCardText>
        </VCard>

        <VAlert v-if="!pages.available" type="info" variant="tonal" class="mb-4">
            {{ t("pages.unsupported", "The desktop application is what publishes a map.") }}
        </VAlert>

        <template v-else>
            <VCard class="mb-4">
                <VCardTitle>{{ t("pages.which.title", "Which map, and where") }}</VCardTitle>
                <VCardText>
                    <ConfigSearchField
                        v-model="renderQuery"
                        v-model:regex="renderRegex"
                        v-model:flags="renderFlags"
                        :label="t('pages.renders.search', 'Search renders')"
                        :sample="renderSample"
                        :summary="renderSummary"
                        density="compact"
                    />
                    <VAlert
                        v-if="pages.candidatesFailure.value !== null"
                        type="warning"
                        variant="tonal"
                        class="my-2"
                        data-test="renders-failure"
                    >
                        {{ pages.candidatesFailure.value }}
                    </VAlert>
                    <p
                        v-else-if="pages.candidates.value.length === 0"
                        class="text-medium-emphasis my-2"
                        data-test="no-renders"
                    >
                        {{
                            t(
                                "pages.renders.empty",
                                "There is nothing rendered on this computer yet. Make a map first, then come back.",
                            )
                        }}
                    </p>
                    <VRadioGroup v-else v-model="renderId" hide-details class="mb-2">
                        <VRadio
                            v-for="candidate in visibleRenders"
                            :key="candidate.renderId"
                            :value="candidate.renderId"
                            data-test="render-choice"
                        >
                            <template #label>
                                <span>{{ candidate.renderId }}</span>
                                <span v-if="candidate.maps.length > 0" class="ml-2 text-medium-emphasis">
                                    {{ candidate.maps.join(", ") }}
                                </span>
                                <span v-if="candidate.problem !== null" class="ml-2 text-error">
                                    {{ candidate.problem }}
                                </span>
                            </template>
                        </VRadio>
                    </VRadioGroup>

                    <div class="d-flex ga-2 flex-wrap">
                        <VSelect
                            v-if="pages.canListOwners && pages.owners.value.length > 0"
                            v-model="owner"
                            :items="pages.owners.value.map((entry) => entry.login)"
                            :label="t('pages.field.owner', 'Repository owner')"
                            density="compact"
                            data-test="owner-select"
                        />
                        <VTextField
                            v-else
                            v-model="owner"
                            :label="t('pages.field.owner', 'Repository owner')"
                            density="compact"
                        />
                        <VTextField
                            v-model="repo"
                            :label="t('pages.field.repo', 'Repository name')"
                            density="compact"
                        />
                        <VTextField
                            v-model="branch"
                            :label="t('pages.field.branch', 'Publishing branch')"
                            density="compact"
                        />
                    </div>

                    <VRadioGroup v-model="visibility" inline hide-details class="mb-2">
                        <VRadio
                            :value="'public'"
                            :label="
                                t(
                                    'pages.visibility.public',
                                    'Public repository (Pages is free; anybody can download the map)',
                                )
                            "
                        />
                        <VRadio
                            :value="'private'"
                            :label="
                                t(
                                    'pages.visibility.private',
                                    'Private repository (Pages needs a paid GitHub plan)',
                                )
                            "
                        />
                    </VRadioGroup>
                    <p class="text-medium-emphasis mb-2">
                        {{
                            t(
                                "pages.visibility.note",
                                "This is only used if the repository has to be created. An existing repository is left exactly as it is.",
                            )
                        }}
                    </p>

                    <VBtn
                        :prepend-icon="mdiRefresh"
                        :loading="pages.checking.value"
                        variant="tonal"
                        data-test="check"
                        @click="check"
                    >
                        {{ t("pages.check", "Check before anything is pushed") }}
                    </VBtn>
                    <VAlert
                        v-if="pages.preflightFailure.value !== null"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                        data-test="preflight-failure"
                    >
                        {{ pages.preflightFailure.value }}
                    </VAlert>
                </VCardText>
            </VCard>

            <VCard v-if="preflight !== null" class="mb-4">
                <VCardTitle>{{ t("pages.report.title", "What this would do") }}</VCardTitle>
                <VCardText>
                    <VAlert
                        v-if="ghState !== null"
                        :type="ghState.tone"
                        variant="tonal"
                        class="mb-3"
                        data-test="gh"
                    >
                        {{ ghState.text }}
                    </VAlert>

                    <p data-test="size-line">{{ sizeLine(preflight, t) }}</p>
                    <p
                        v-if="preflight.site !== null && preflight.site.changedSettings === false"
                        class="text-medium-emphasis mt-1"
                        data-test="decompression"
                    >
                        {{
                            t(
                                "pages.decompression",
                                "The viewer will be set to decompress tiles itself, because a static host cannot do it. That is the one setting publishing changes, and it is written into the render's own settings.json.",
                            )
                        }}
                    </p>

                    <VAlert
                        v-for="blocker in preflight.blockers"
                        :key="blocker"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                        data-test="blocker"
                    >
                        {{ blocker }}
                    </VAlert>

                    <VAlert
                        v-for="warning in preflight.warnings"
                        :key="warning"
                        type="warning"
                        variant="tonal"
                        class="mt-3"
                        data-test="warning"
                    >
                        {{ warning }}
                    </VAlert>

                    <p
                        v-if="preflight.site !== null && preflight.site.oversizedFiles.length > 0"
                        class="mt-3"
                        data-test="oversized"
                    >
                        {{
                            t(
                                "pages.oversized",
                                { path: preflight.site.oversizedFiles[0]?.path ?? "" },
                                "{path} is past GitHub's 100 MB per-file limit and cannot be pushed at all.",
                            )
                        }}
                    </p>

                    <VCheckbox
                        v-model="acknowledge"
                        density="compact"
                        data-test="acknowledge"
                        :label="
                            t(
                                'pages.ack',
                                'I understand this pushes the whole map and replaces whatever is on that branch.',
                            )
                        "
                    />

                    <VBtn
                        :prepend-icon="mdiEarth"
                        :disabled="blockedBecause !== null"
                        :loading="pages.starting.value"
                        color="primary"
                        data-test="publish"
                        @click="publish"
                    >
                        {{ t("pages.publish", "Publish to GitHub Pages") }}
                    </VBtn>
                    <p v-if="blockedBecause !== null" class="text-medium-emphasis mt-2" data-test="blocked">
                        {{ blockedBecause }}
                    </p>
                </VCardText>
            </VCard>

            <VAlert
                v-if="pages.startFailure.value !== null"
                type="error"
                variant="tonal"
                class="mb-4"
                data-test="start-failure"
            >
                {{ pages.startFailure.value.message }}
                <p v-if="pages.startFailure.value.needsGhSignIn" class="mt-2">
                    {{
                        t(
                            "pages.gh.signIn",
                            "Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
                        )
                    }}
                </p>
            </VAlert>

            <!-- What is happening right now, with real numbers rather than a spinner. -->
            <VCard v-for="row in pages.rows.value" :key="row.renderId" class="mb-3" data-test="row">
                <VCardTitle class="d-flex align-center ga-2">
                    <span>{{ rowTitle(row) }}</span>
                    <VChip size="small" data-test="row-state">{{ row.state }}</VChip>
                    <VProgressCircular v-if="row.state === 'publishing'" indeterminate size="18" />
                </VCardTitle>
                <VCardText>
                    <p data-test="row-phase">{{ phaseLabel(row.phase, t) }}</p>

                    <template v-if="row.progress !== null">
                        <VProgressLinear
                            :model-value="row.progress.percent"
                            class="my-2"
                            data-test="progress-bar"
                        />
                        <p class="text-medium-emphasis" data-test="progress">
                            {{ row.progress.description }} -
                            {{
                                t(
                                    "pages.progress.count",
                                    { done: row.progress.done, total: row.progress.total },
                                    "{done} of {total}",
                                )
                            }}
                        </p>
                    </template>

                    <VAlert
                        v-if="row.failure !== null"
                        type="error"
                        variant="tonal"
                        class="mt-3"
                        data-test="row-failure"
                    >
                        <p>{{ row.failure.message }}</p>
                        <pre v-if="row.failure.detail !== null" class="mb-pages-detail">{{
                            row.failure.detail
                        }}</pre>
                    </VAlert>

                    <template v-if="row.report !== null">
                        <VAlert
                            :type="statusTone(row.report.status)"
                            variant="tonal"
                            class="mt-3"
                            data-test="row-status"
                        >
                            {{ statusLabel(row.report.status, t) }}
                            <p v-if="row.report.url !== null" class="mt-1">{{ row.report.url }}</p>
                            <p v-if="!row.report.pushVerified" class="mt-1" data-test="push-unverified">
                                {{
                                    t(
                                        "pages.pushUnverified",
                                        "The push reported success but GitHub does not yet show that commit on the branch, so it is reported as unverified rather than as landed.",
                                    )
                                }}
                            </p>
                            <p v-for="note in row.report.notes" :key="note" class="mt-1 text-medium-emphasis">
                                {{ note }}
                            </p>
                        </VAlert>
                        <p class="mt-2 text-medium-emphasis" data-test="row-size">
                            {{
                                t(
                                    "pages.published.size",
                                    {
                                        size: formatBytes(row.report.site.totalBytes, t),
                                        files: row.report.site.fileCount,
                                    },
                                    "{size} across {files} files.",
                                )
                            }}
                        </p>
                    </template>

                    <VBtn
                        v-if="row.state === 'publishing' && pages.canCancel"
                        size="small"
                        variant="text"
                        :loading="row.stopping"
                        data-test="cancel"
                        @click="pages.stopPublishing(row.renderId)"
                    >
                        {{ t("pages.cancel", "Stop publishing") }}
                    </VBtn>
                </VCardText>
            </VCard>

            <!-- Sites this computer knows it published, so one can be found and taken down. -->
            <VCard v-if="pages.published.value.length > 0" class="mb-3">
                <VCardTitle>{{ t("pages.hosted.title", "Maps this computer has published") }}</VCardTitle>
                <VCardText>
                    <div
                        v-for="site in pages.published.value"
                        :key="`${site.owner}/${site.repo}/${site.branch}`"
                        class="mb-pages-site"
                        data-test="hosted"
                    >
                        <div class="d-flex align-center ga-2 flex-wrap">
                            <VChip size="small" :color="statusTone(site.status)">
                                {{ statusLabel(site.status, t) }}
                            </VChip>
                            <span>{{ site.owner }}/{{ site.repo }}</span>
                            <span class="text-medium-emphasis">{{ site.renderId }}</span>
                        </div>
                        <p v-if="site.url !== null" class="mt-1" data-test="hosted-url">{{ site.url }}</p>
                        <p v-if="site.stage !== undefined && site.stage !== 'finished'" class="mt-1 text-warning" data-test="hosted-interrupted">
                            {{ t("pages.hosted.interrupted", { stage: site.stage }, "This publish stopped during {stage}; it can continue from its saved checkpoint.") }}
                        </p>
                        <div class="d-flex align-center ga-2 flex-wrap mt-1">
                            <VBtn
                                v-if="site.stage !== undefined && site.stage !== 'finished' && pages.canResume"
                                :prepend-icon="mdiRefresh"
                                size="small"
                                variant="tonal"
                                data-test="hosted-resume"
                                @click="resume(site)"
                            >
                                {{ t("pages.resume", "Continue publishing") }}
                            </VBtn>
                            <VBtn
                                v-if="pages.canRefreshStatus"
                                :prepend-icon="mdiRefresh"
                                size="small"
                                variant="text"
                                data-test="hosted-refresh"
                                @click="refreshStatus(site)"
                            >
                                {{ t("pages.refresh", "Refresh status") }}
                            </VBtn>
                            <VBtn
                                v-if="site.url !== null"
                                :prepend-icon="mdiOpenInNew"
                                size="small"
                                variant="text"
                                data-test="hosted-open"
                                @click="emit('open', site.url)"
                            >
                                {{ t("pages.open", "Open it") }}
                            </VBtn>
                            <VBtn
                                v-if="site.url !== null"
                                :prepend-icon="mdiContentCopy"
                                size="small"
                                variant="text"
                                data-test="hosted-copy"
                                @click="copy(site.url)"
                            >
                                {{ t("pages.copy", "Copy the address") }}
                            </VBtn>
                            <ConfigSuperConfirm
                                v-if="pages.canStop"
                                :title="t('pages.stop.title', 'Take this map off the internet')"
                                :action="
                                    t(
                                        'pages.stop.action',
                                        { owner: site.owner, repo: site.repo, branch: site.branch },
                                        'GitHub Pages will be turned off for {owner}/{repo} and the {branch} branch will be deleted. The address stops working immediately. The render on this computer is not touched, and neither is anything else in that repository.',
                                    )
                                "
                                :affected="[
                                    `${site.owner}/${site.repo} (${site.branch})`,
                                    site.url ?? t('pages.stop.noUrl', 'no address was published'),
                                ]"
                                :confirm-label="t('pages.stop.confirm', 'Take the site down')"
                                @confirm="removeHosting(site)"
                            >
                                <template #activator="{ props: activator }">
                                    <VBtn
                                        v-bind="activator"
                                        :prepend-icon="mdiWeb"
                                        size="small"
                                        variant="text"
                                        color="error"
                                        data-test="hosted-stop"
                                    >
                                        {{ t("pages.stopButton", "Stop hosting") }}
                                    </VBtn>
                                </template>
                            </ConfigSuperConfirm>
                        </div>
                    </div>
                    <VAlert
                        v-if="pages.stopFailure.value !== null"
                        type="error"
                        variant="tonal"
                        class="mt-2"
                        data-test="stop-failure"
                    >
                        {{ pages.stopFailure.value }}
                    </VAlert>
                </VCardText>
            </VCard>
        </template>
    </div>
</template>

<style scoped>
.mb-pages-site + .mb-pages-site {
    margin-block-start: 16px;
    padding-block-start: 16px;
    border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-pages-detail {
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 12rem;
    font-size: 0.8125rem;
}
</style>
