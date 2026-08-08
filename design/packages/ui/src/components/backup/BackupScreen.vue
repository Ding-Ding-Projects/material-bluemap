<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloudUploadOutline, mdiFolderSearchOutline, mdiRefresh, mdiRestore } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VProgressCircular,
    VRadio,
    VRadioGroup,
    VSelect,
    VTextField,
} from "vuetify/components";
import PathField from "../PathField.vue";
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import BackupRunCard from "./BackupRunCard.vue";
import { createBackups, formatBytes, repositoryNameProblem } from "./backups.js";
import type { BackupRow } from "./backups.js";
import {
    resolveBackupBridge,
    type BackupBridge,
    type BackupListing,
    type BackupSourceKind,
    type BackupSourceReport,
    type RepositoryChoice,
} from "./backupBridge.js";

/**
 * Backing a rendered map, or the world it came from, up to GitHub.
 *
 * ## Why this is not Git LFS, said here as well as in the code
 *
 * GitHub's own large-file storage gives a free account 1 GB of storage and 1 GB of
 * bandwidth a month, meters every restore against that bandwidth, and sells data packs
 * past it. A world is routinely several gigabytes, so one backup exhausts the free tier
 * and every restore is billed again. Release assets are free on a public repository and
 * capped per asset rather than in total, and this application already ships both halves of
 * the machinery for them. The format written here is Desktop Material's shipped **Cheap
 * LFS v1** pointer, checked here against that grammar line by line — format conformance,
 * proven; a live restore of a backup made by one application through the other has not
 * been run, and the surface and the documentation both say so rather than the stronger
 * claim. See `docs/backup.md` and issue #36 for the full accounting.
 *
 * The surface says this too, in one sentence, because "why is there no LFS button" is
 * otherwise a reasonable thing to wonder and an unanswerable one.
 *
 * ## Three things here are deliberate and read as omissions if they are not stated
 *
 * **Nothing is uploaded until the repository has been read.** The public-repository
 * warning is the reason: a world carries somebody's builds and coordinates, and finding
 * out it is public after it has been published is finding out too late. The main process
 * refuses an unacknowledged public repository as well, because a guard that lives only in
 * the renderer is not a guard.
 *
 * **Restoring is not built here** - this component's own job stops at emitting `restore`
 * with the release's coordinates. It *is* built now, in `main/backup/restore.ts`: a real
 * `BackupRunner` upload restores byte-for-byte through it, proven against real `github.com`
 * in `backup.realGithub.test.ts`. What is **not yet done** is wiring that engine to a
 * channel, a bridge method and this event: the shell that receives `restore` today still
 * only opens Downloads and asks the person to fetch the release by hand, because the
 * downloads surface this comment used to say would do the job cannot read a Cheap LFS
 * release at all - see `restore.ts`'s own doc comment for why. That handoff is the one
 * piece of this feature that remains.
 *
 * **Deleting a backup is not offered at all.** Backups are append-only: every one is its
 * own release under its own tag, and nothing in this application edits or removes one. A
 * backup somebody no longer wants is deleted on GitHub, deliberately, where the
 * consequences are visible.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this
         * has no default: `undefined` means probe, `null` means there is deliberately no
         * bridge and the unsupported state is what should be shown.
         */
        bridge?: BackupBridge | null | undefined;
        /** Things this machine could back up, offered instead of a typed path. */
        sources?: readonly { kind: BackupSourceKind; folder: string; label: string }[] | undefined;
        /** True when the shell can open the GitHub sign-in row in settings. */
        canOpenSettings?: boolean | undefined;
    }>(),
    { sources: () => [], canOpenSettings: false },
);

const emit = defineEmits<{
    /** Hand a backup to the downloads surface, with its release already chosen. */
    restore: [where: { owner: string; repo: string; tag: string; asset: string }];
    /** Open the GitHub sign-in row in settings. */
    signIn: [];
    /** Open a URL in the system browser. */
    open: [url: string];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveBackupBridge() : props.bridge;
const backups = createBackups(bridge);

/* -- what to back up ------------------------------------------------------- */

const kind = ref<BackupSourceKind>("world");
const folder = ref("");
const source = ref<BackupSourceReport | null>(null);
const sourceFailure = ref<string | null>(null);
const inspecting = ref(false);

const offered = computed(() => props.sources.filter((candidate) => candidate.kind === kind.value));

/**
 * What `PathField` calls this path in "Browse for {field}" / "Choose {field}", mirrored
 * from which kind of thing is being backed up so the dialog and the accessible name both
 * name the right folder rather than a generic one.
 */
const folderField = computed(() => (kind.value === "world" ? "world folder" : "render folder"));

async function inspect(): Promise<void> {
    source.value = null;
    sourceFailure.value = null;
    if (bridge === null || folder.value.trim() === "") return;
    inspecting.value = true;
    try {
        const answer = await bridge.inspectBackupSource({
            kind: kind.value,
            folder: folder.value.trim(),
        });
        if (answer.ok) source.value = answer.value;
        else sourceFailure.value = answer.message;
    } finally {
        inspecting.value = false;
    }
}

// Changing what kind of thing is being backed up invalidates whatever was read about the
// folder: the same path is a world or is not, and a stale "4,821 files" beside a refusal
// is worse than nothing.
watch(kind, () => {
    source.value = null;
    sourceFailure.value = null;
});

/* -- where it goes --------------------------------------------------------- */

const owner = ref("");
const repo = ref("");
const acknowledged = ref(false);

const canCheck = computed(
    () =>
        backups.available &&
        owner.value.trim() !== "" &&
        repo.value.trim() !== "" &&
        !backups.checking.value,
);

async function check(): Promise<void> {
    if (!canCheck.value) return;
    acknowledged.value = false;
    const report = await backups.check(owner.value.trim(), repo.value.trim());
    if (report !== null && backups.canListBackups) {
        void backups.loadListings(report.owner, report.repo);
    }
}

/** Picking a repository from the list fills both fields and reads it straight away. */
function choose(fullName: unknown): void {
    if (typeof fullName !== "string") return;
    const [chosenOwner, chosenRepo] = fullName.split("/");
    if (chosenOwner === undefined || chosenRepo === undefined) return;
    owner.value = chosenOwner;
    repo.value = chosenRepo;
    void check();
}

/*
 * Searching the repository picker, separate from the backup-listing search further down
 * this file and bound to its own query, pattern, flags and mode - the anchored builder
 * `ConfigSearchField` carries applies to this field and this field alone.
 *
 * ## The pagination-honesty rule this list has to answer to
 *
 * `listWritableRepositories` in the main process reads up to three pages of
 * `/user/repos` - 300 repositories, most recently active first - and hands the whole,
 * already-bounded set to this screen in one answer; there is no further paging from here.
 * So this search is complete over what was loaded, and "loaded" can still be short of
 * "everything the account owns" for an account past 300 repositories. The summary line
 * says exactly that rather than presenting a filtered 300 as though it were the whole
 * account, and the owner/repository text fields beside the list remain the honest way to
 * reach anything search cannot find.
 */
const repoQuery = ref("");
const repoRegex = ref(false);
const repoFlags = ref("i");

const repoMatcher = computed(() =>
    createSettingMatcher(repoQuery.value, repoRegex.value, repoFlags.value),
);

function repositoryText(repository: RepositoryChoice): string {
    return [repository.fullName, repository.owner, repository.name].join(" ");
}

const shownRepositories = computed(() =>
    backups.repositories.value.filter((repository) =>
        repoMatcher.value.test(repositoryText(repository)),
    ),
);

const repositorySample = computed(() =>
    backups.repositories.value.map((repository) => repositoryText(repository)).join("\n"),
);

/** Honest about what was searched: complete over what loaded, never "everything". */
const repositorySummary = computed(() => {
    const total = backups.repositories.value.length;
    if (total === 0) return "";
    if (repoMatcher.value.active) {
        return t(
            "backup.repo.searchSummary",
            { shown: String(shownRepositories.value.length), total: String(total) },
            "Showing {shown} of {total} loaded repositories (most recently active first, up to 300). If yours is not among them, type its owner and name below.",
        );
    }
    return t(
        "backup.repo.loadedSummary",
        { total: String(total) },
        "{total} repositories loaded (most recently active first, up to 300).",
    );
});

/* -- creating a brand-new repository, beside choosing an existing one ------- */

/**
 * Which kind of account the typed owner names.
 *
 * This screen has no owner-listing call of its own - unlike the CI-render screen, which
 * lists the signed-in login and its organisations - so there is nothing to infer this
 * from. GitHub's own create-repository call needs to know regardless, because a personal
 * repository and an organisation's are two different endpoints, so this is a real,
 * minimal picker rather than a guess: "my account" is the default, and it is only two
 * choices, not a free-text field pretending to be one.
 */
const createOwnerKind = ref<"user" | "organization">("user");
const createVisibility = ref<"public" | "private">("private");
const createRepoNameProblem = computed(() => repositoryNameProblem(repo.value, t));

/**
 * Why the "Create a new repository" button cannot be pressed, in the order somebody fills
 * the card in - the same discipline `blockedBecause` above holds the main button to.
 */
const createBlockedBecause = computed<string | null>(() => {
    if (!backups.canCreateRepository) {
        return t(
            "backup.createRepo.unsupported",
            "This build cannot create a repository from here. Create one on GitHub directly, then check it above.",
        );
    }
    if (owner.value.trim() === "") {
        return t(
            "backup.createRepo.blockedOwner",
            "Type an owner above before creating a repository.",
        );
    }
    if (repo.value.trim() === "") {
        return t(
            "backup.createRepo.blockedName",
            "Type a repository name above before creating it.",
        );
    }
    if (createRepoNameProblem.value !== null) return createRepoNameProblem.value;
    if (backups.creatingRepository.value) {
        return t("backup.createRepo.blockedCreating", "Already creating.");
    }
    return null;
});

const canCreateRepo = computed(() => createBlockedBecause.value === null);

/**
 * Creates the repository named in the owner/repo fields above, then lands at the same
 * next decision choosing an existing one from the list already does: the fields are
 * already set to what was just created, so this reads the repository straight away
 * exactly as {@link choose} does, rather than leaving somebody to press Check themselves.
 */
async function createRepo(): Promise<void> {
    if (!canCreateRepo.value) return;
    const created = await backups.createRepository({
        ownerLogin: owner.value.trim(),
        ownerKind: createOwnerKind.value,
        name: repo.value.trim(),
        private: createVisibility.value === "private",
    });
    if (created !== null) {
        owner.value = created.owner;
        repo.value = created.name;
        void check();
    }
}

const needsAcknowledgement = computed(
    () => backups.report.value !== null && !backups.report.value.private,
);

/**
 * Why the button cannot be pressed, in the words that say what to do about it.
 *
 * A six-clause conjunction is easy to write and useless to be on the wrong side of: the
 * button simply went grey, and which of the six was the problem — no world chosen, a
 * repository never checked, no write permission, an unticked acknowledgement — was left
 * for the person to guess. The CI render screen next door had already worked this out, so
 * this is the same shape: one sentence, checked in the order somebody meets them.
 *
 * `canStart` stays the single gate on the action, derived from this, so the sentence and
 * the button can never disagree about whether it may run.
 */
const blockedBecause = computed<string | null>(() => {
    if (!backups.available) {
        return t("backup.blocked.unsupported", "This build cannot publish a backup.");
    }
    if (source.value === null) {
        return t("backup.blocked.source", "Choose the world or folder to back up first.");
    }
    if (backups.report.value === null) {
        return t(
            "backup.blocked.repository",
            "Check the repository first, so its permissions are known.",
        );
    }
    if (!backups.report.value.canWrite) {
        return t(
            "backup.blocked.write",
            { repository: backups.report.value.fullName },
            "This GitHub sign-in cannot write to {repository}, so it cannot publish a release there.",
        );
    }
    if (needsAcknowledgement.value && !acknowledged.value) {
        return t(
            "backup.blocked.public",
            "Confirm that you mean to publish this to a PUBLIC repository, where anybody could download it.",
        );
    }
    if (backups.starting.value) {
        return t("backup.blocked.starting", "Already starting.");
    }
    return null;
});

const canStart = computed(() => blockedBecause.value === null);

async function start(): Promise<void> {
    if (!canStart.value || source.value === null || backups.report.value === null) return;
    await backups.start({
        kind: source.value.kind,
        folder: source.value.folder,
        owner: backups.report.value.owner,
        repo: backups.report.value.repo,
        acknowledgePublic: acknowledged.value,
    });
    if (backups.canListBackups && backups.report.value !== null) {
        void backups.loadListings(backups.report.value.owner, backups.report.value.repo);
    }
}

function resume(row: BackupRow): void {
    if (source.value === null || backups.report.value === null) return;
    void backups.start({
        kind: source.value.kind,
        folder: source.value.folder,
        owner: backups.report.value.owner,
        repo: backups.report.value.repo,
        acknowledgePublic: acknowledged.value,
        resumeTag: row.tag,
    });
}

function stop(backupId: string): void {
    void backups.stop(backupId);
}

/* -- what the repository already holds -------------------------------------- */

/*
 * The list of existing backups gets its own search, separate from anything else on the
 * screen. It is the collection that grows without bound and the one somebody comes back
 * to a week later looking for a particular world by name.
 *
 * The owner and repository fields above are not search bars and get no builder: they
 * address a repository rather than filter one, and a regular expression in either would be
 * a string sent to GitHub rather than a pattern run here.
 */
const listQuery = ref("");
const listRegex = ref(false);
const listFlags = ref("i");

const listMatcher = computed(() =>
    createSettingMatcher(listQuery.value, listRegex.value, listFlags.value),
);

function listingText(listing: BackupListing): string[] {
    return [listing.label, listing.tag, listing.archive, listing.kind, listing.createdAt].filter(
        (value) => value !== "",
    );
}

const shownListings = computed(() =>
    backups.listings.value.filter((listing) =>
        listingText(listing).some((value) => listMatcher.value.test(value)),
    ),
);

const listSample = computed(() =>
    backups.listings.value.map((listing) => listingText(listing).join(" ")).join("\n"),
);

const listSummary = computed(() =>
    listMatcher.value.active
        ? t(
              "backup.listings.searchSummary",
              {
                  shown: String(shownListings.value.length),
                  total: String(backups.listings.value.length),
              },
              "Showing {shown} of {total}",
          )
        : "",
);

function restore(listing: BackupListing): void {
    const report = backups.report.value;
    if (report === null) return;
    emit("restore", {
        owner: report.owner,
        repo: report.repo,
        tag: listing.tag,
        asset: listing.archive,
    });
}

function describeListing(listing: BackupListing): string {
    return t(
        "backup.listings.detail",
        {
            kind:
                listing.kind === "world"
                    ? t("backup.kind.world", "Minecraft world")
                    : t("backup.kind.render", "Rendered map"),
            size: formatBytes(listing.bytes, t),
            parts: String(listing.parts),
            files: String(listing.files),
        },
        "{kind} · {size} · {parts} asset(s) · {files} files",
    );
}

onMounted(() => {
    // What is already going must be on screen before anybody presses anything: a backup
    // started in another window is otherwise invisible here and gets started a second time.
    void backups.reconcile();
    if (backups.canListRepositories) void backups.loadRepositories();
});

onBeforeUnmount(() => {
    backups.dispose();
});

/**
 * The three fields and the two actions, exposed for tests.
 *
 * A mounted test that reached these through the DOM would be selecting the third
 * `<input>` on the screen, which is a radio button today and a text field tomorrow. What
 * the tests are actually about is the behaviour behind the controls - that reading a
 * folder reports what it holds, that reading a public repository gates the button - and
 * naming them here keeps those tests about that rather than about markup order.
 */
defineExpose({
    backups,
    kind,
    folder,
    owner,
    repo,
    source,
    inspect,
    check,
    createOwnerKind,
    createVisibility,
    createRepo,
    canCreateRepo,
    repoQuery,
    repoRegex,
    shownRepositories,
});
</script>

<template>
    <section class="mb-backup" :aria-label="t('backup.title', 'Back up a world or a rendered map')">
        <h4 class="mb-backup__title">
            {{ t("backup.title", "Back up a world or a rendered map") }}
        </h4>
        <p class="mb-backup__blurb">
            {{
                t(
                    "backup.blurb",
                    "A backup is packed into one archive, cut into 500 MiB parts, and published as the assets of a new GitHub release. Every part carries its own SHA-256 in a small pointer file beside it, so a restore can prove it got back exactly what went up.",
                )
            }}
        </p>
        <p class="mb-backup__blurb">
            {{
                t(
                    "backup.whyNotLfs",
                    "This deliberately does not use Git LFS. A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth a month, and every restore is metered against it, so a single multi-gigabyte world exhausts the free tier and each restore is billed again. Release assets are free on a public repository and capped per file rather than in total. The pointer format matches Desktop Material's published Cheap LFS v1 grammar, checked against it here; a live restore through that application has not been run.",
                )
            }}
        </p>

        <v-alert
            v-if="!backups.available"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-backup__alert"
        >
            {{
                t(
                    "backup.unsupported",
                    "This build cannot make a backup. The desktop application is what packs the folder, splits it and uploads the parts with your GitHub sign-in; a browser tab can do none of those. Open this in the desktop app, and sign in to GitHub from Settings.",
                )
            }}
        </v-alert>

        <template v-else>
            <!-- What to back up ------------------------------------------------ -->
            <v-card variant="tonal" class="mb-backup__step">
                <v-card-title class="mb-backup__stepTitle">
                    {{ t("backup.what", "What to back up") }}
                </v-card-title>
                <v-card-text class="mb-backup__stepBody">
                    <v-radio-group
                        v-model="kind"
                        inline
                        hide-details="auto"
                        :label="t('backup.kindLabel', 'What kind of thing is it?')"
                    >
                        <v-radio :label="t('backup.kind.world', 'Minecraft world')" value="world" />
                        <v-radio :label="t('backup.kind.render', 'Rendered map')" value="render" />
                    </v-radio-group>

                    <v-select
                        v-if="offered.length > 0"
                        :items="
                            offered.map((candidate) => ({
                                title: candidate.label,
                                value: candidate.folder,
                            }))
                        "
                        :label="t('backup.pickKnown', 'One this application already knows about')"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                        @update:model-value="
                            (value: unknown) => {
                                if (typeof value === 'string') {
                                    folder = value;
                                    void inspect();
                                }
                            }
                        "
                    />

                    <div class="mb-backup__row">
                        <PathField
                            v-model="folder"
                            :field="folderField"
                            semantic="folder"
                            :label="t('backup.folder', 'Folder')"
                            :placeholder="
                                kind === 'world'
                                    ? t('backup.folderHintWorld', 'the folder holding level.dat')
                                    : t(
                                          'backup.folderHintRender',
                                          'the render folder under your maps folder',
                                      )
                            "
                            @keydown.enter="inspect"
                        />
                        <v-btn
                            :prepend-icon="mdiFolderSearchOutline"
                            :disabled="folder.trim() === '' || inspecting"
                            variant="tonal"
                            color="primary"
                            @click="inspect"
                        >
                            {{ t("backup.readFolder", "Read this folder") }}
                        </v-btn>
                    </div>

                    <div
                        v-if="inspecting"
                        class="mb-backup__checking"
                        role="status"
                        aria-live="polite"
                    >
                        <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                        <span>{{ t("backup.reading", "Reading the folder...") }}</span>
                    </div>

                    <v-alert
                        v-else-if="sourceFailure"
                        type="warning"
                        density="compact"
                        variant="tonal"
                        class="mb-backup__alert"
                        role="alert"
                    >
                        {{ sourceFailure }}
                    </v-alert>

                    <p v-else-if="source" class="mb-backup__note" role="status">
                        {{
                            t(
                                "backup.sourceSummary",
                                {
                                    label: source.label,
                                    files: String(source.files),
                                    size: formatBytes(source.bytes, t),
                                },
                                "{label}: {files} files, {size}. Nothing has been packed or uploaded yet.",
                            )
                        }}
                    </p>

                    <v-alert
                        v-if="source && source.skipped.length > 0"
                        type="info"
                        density="compact"
                        variant="tonal"
                        class="mb-backup__alert"
                    >
                        <p>
                            {{
                                t(
                                    "backup.skipped",
                                    { n: String(source.skipped.length) },
                                    "{n} item(s) will be left out of the backup:",
                                )
                            }}
                        </p>
                        <ul class="mb-backup__skipped">
                            <li v-for="entry in source.skipped" :key="entry.name">
                                <strong>{{ entry.name }}</strong> — {{ entry.reason }}
                            </li>
                        </ul>
                    </v-alert>
                </v-card-text>
            </v-card>

            <!-- Where it goes -------------------------------------------------- -->
            <v-card variant="tonal" class="mb-backup__step">
                <v-card-title class="mb-backup__stepTitle">
                    {{ t("backup.where", "Where to keep it") }}
                </v-card-title>
                <v-card-text class="mb-backup__stepBody">
                    <template v-if="backups.repositories.value.length > 0">
                        <ConfigSearchField
                            v-model="repoQuery"
                            v-model:regex="repoRegex"
                            v-model:flags="repoFlags"
                            :label="t('backup.repo.search', 'Search your repositories')"
                            :sample="repositorySample"
                            :summary="repositorySummary"
                            density="compact"
                            data-test="repository-search"
                        />
                        <v-select
                            v-if="shownRepositories.length > 0"
                            :items="
                                shownRepositories.map((repository) => ({
                                    title: repository.private
                                        ? t(
                                              'backup.repoPrivate',
                                              { name: repository.fullName },
                                              '{name} (private)',
                                          )
                                        : t(
                                              'backup.repoPublic',
                                              { name: repository.fullName },
                                              '{name} (PUBLIC)',
                                          ),
                                    value: repository.fullName,
                                }))
                            "
                            :label="t('backup.pickRepository', 'One of your repositories')"
                            variant="outlined"
                            density="compact"
                            hide-details="auto"
                            class="mt-2"
                            @update:model-value="choose"
                        />
                        <p
                            v-else
                            class="mb-backup__note"
                            role="status"
                            data-test="repository-no-match"
                        >
                            {{
                                t(
                                    "backup.repo.noMatch",
                                    "None of the loaded repositories match that search. Type the owner and name below instead, or create a new repository.",
                                )
                            }}
                        </p>
                    </template>

                    <p
                        v-else-if="backups.loadingRepositories.value"
                        class="mb-backup__note"
                        role="status"
                    >
                        {{ t("backup.loadingRepositories", "Reading your repositories...") }}
                    </p>

                    <v-alert
                        v-else-if="backups.repositoriesFailure.value"
                        type="warning"
                        density="compact"
                        variant="tonal"
                        class="mb-backup__alert"
                    >
                        {{ backups.repositoriesFailure.value }}
                    </v-alert>

                    <p
                        v-else-if="backups.canListRepositories"
                        class="mb-backup__note"
                        role="status"
                        data-test="repository-none"
                    >
                        {{
                            t(
                                "backup.repo.none",
                                "This account has no repositories to write to yet. Create one below, or type an owner and name to check one directly.",
                            )
                        }}
                    </p>

                    <div class="mb-backup__row">
                        <v-text-field
                            v-model="owner"
                            :label="t('backup.owner', 'Owner')"
                            variant="outlined"
                            density="compact"
                            spellcheck="false"
                            autocapitalize="off"
                            autocomplete="off"
                            hide-details="auto"
                            @keydown.enter="check"
                        />
                        <v-text-field
                            v-model="repo"
                            :label="t('backup.repo', 'Repository')"
                            variant="outlined"
                            density="compact"
                            spellcheck="false"
                            autocapitalize="off"
                            autocomplete="off"
                            hide-details="auto"
                            @keydown.enter="check"
                        />
                        <v-btn
                            :prepend-icon="mdiRefresh"
                            :disabled="!canCheck"
                            variant="tonal"
                            color="primary"
                            @click="check"
                        >
                            {{ t("backup.check", "Check this repository") }}
                        </v-btn>
                    </div>

                    <!--
                        Creating a new repository, beside choosing an existing one - never
                        replacing it. Uses the owner/repository fields above as the target
                        rather than a second pair of fields, so there is exactly one place
                        that names what is about to be created or checked. Placed before the
                        "checking"/report chain below, and deliberately not part of it - this
                        card's own `v-if` must not sit between that chain's `v-if` and its
                        `v-else-if` siblings, or the chain breaks.
                    -->
                    <v-card
                        v-if="backups.canCreateRepository"
                        variant="tonal"
                        class="mt-4 pa-3"
                        data-test="create-repo"
                    >
                        <p class="text-medium-emphasis mb-2">
                            {{
                                t(
                                    "backup.createRepo.lead",
                                    "Nothing suitable to pick or check? Create a brand-new repository with the owner and name above.",
                                )
                            }}
                        </p>
                        <v-radio-group
                            v-model="createOwnerKind"
                            inline
                            density="compact"
                            hide-details="auto"
                            :label="t('backup.createRepo.ownerKind', 'The owner above is')"
                        >
                            <v-radio
                                :label="t('backup.createRepo.ownerKind.user', 'my own account')"
                                value="user"
                            />
                            <v-radio
                                :label="
                                    t(
                                        'backup.createRepo.ownerKind.org',
                                        'an organization I belong to',
                                    )
                                "
                                value="organization"
                            />
                        </v-radio-group>
                        <v-radio-group
                            v-model="createVisibility"
                            inline
                            density="compact"
                            hide-details="auto"
                            class="mt-2"
                            :label="t('backup.createRepo.visibility', 'Visibility')"
                        >
                            <v-radio
                                :label="t('backup.createRepo.visibility.private', 'Private')"
                                value="private"
                            />
                            <v-radio
                                :label="t('backup.createRepo.visibility.public', 'Public')"
                                value="public"
                            />
                        </v-radio-group>
                        <p class="text-medium-emphasis mt-1">
                            {{
                                createVisibility === "public"
                                    ? t(
                                          "backup.createRepo.visibility.publicNote",
                                          "PUBLIC means anybody can download whatever is backed up here, including the world's builds and coordinates.",
                                      )
                                    : t(
                                          "backup.createRepo.visibility.privateNote",
                                          "Private means only accounts you grant access to can see it. It is not free storage - it still counts toward the repository limits of the plan it is created under.",
                                      )
                            }}
                        </p>

                        <v-btn
                            :prepend-icon="mdiCloudUploadOutline"
                            :disabled="!canCreateRepo"
                            :title="createBlockedBecause ?? undefined"
                            :loading="backups.creatingRepository.value"
                            variant="tonal"
                            color="primary"
                            class="mt-2"
                            data-test="create-repo-button"
                            @click="createRepo"
                        >
                            {{ t("backup.createRepo.button", "Create this repository") }}
                        </v-btn>
                        <p
                            v-if="createBlockedBecause !== null"
                            class="text-medium-emphasis mt-2"
                            data-test="create-repo-blocked"
                        >
                            {{ createBlockedBecause }}
                        </p>
                        <v-alert
                            v-if="backups.createRepositoryFailure.value !== null"
                            type="warning"
                            density="compact"
                            variant="tonal"
                            class="mt-2"
                            role="alert"
                            data-test="create-repo-failure"
                        >
                            {{ backups.createRepositoryFailure.value.message }}
                        </v-alert>
                    </v-card>

                    <div
                        v-if="backups.checking.value"
                        class="mb-backup__checking"
                        role="status"
                        aria-live="polite"
                    >
                        <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                        <span>{{ t("backup.checking", "Reading the repository...") }}</span>
                    </div>

                    <v-alert
                        v-else-if="backups.reportFailure.value"
                        type="warning"
                        density="compact"
                        variant="tonal"
                        class="mb-backup__alert"
                        role="alert"
                    >
                        {{ backups.reportFailure.value }}
                    </v-alert>

                    <template v-else-if="backups.report.value">
                        <v-alert
                            v-if="backups.report.value.warning"
                            :type="
                                backups.report.value.warning.level === 'warning'
                                    ? 'warning'
                                    : 'info'
                            "
                            density="compact"
                            variant="tonal"
                            class="mb-backup__alert"
                            :role="
                                backups.report.value.warning.level === 'warning'
                                    ? 'alert'
                                    : 'status'
                            "
                        >
                            {{ backups.report.value.warning.message }}
                        </v-alert>

                        <v-alert
                            v-if="!backups.report.value.canWrite"
                            type="error"
                            density="compact"
                            variant="tonal"
                            class="mb-backup__alert"
                            role="alert"
                        >
                            {{
                                t(
                                    "backup.readOnly",
                                    { name: backups.report.value.fullName },
                                    "The signed-in account cannot write to {name}, so it cannot publish a release there.",
                                )
                            }}
                        </v-alert>

                        <v-checkbox
                            v-if="needsAcknowledgement"
                            v-model="acknowledged"
                            hide-details="auto"
                            density="compact"
                            :label="
                                t(
                                    'backup.acknowledgePublic',
                                    'I understand this repository is public, and that anybody will be able to download this backup.',
                                )
                            "
                        />
                    </template>
                </v-card-text>
            </v-card>

            <!-- Do it ---------------------------------------------------------- -->
            <ActionArtwork
                artwork="repositoryPublication"
                :alt="
                    t(
                        'backup.artwork.alt',
                        'A world folder split into checked archive parts and uploaded into a repository vault',
                    )
                "
            />
            <v-btn
                :prepend-icon="mdiCloudUploadOutline"
                :disabled="!canStart"
                size="large"
                variant="flat"
                color="primary"
                class="mb-backup__go"
                @click="start"
            >
                {{
                    backups.starting.value
                        ? t("backup.starting", "Starting...")
                        : t("backup.start", "Back this up")
                }}
            </v-btn>
            <!--
                Beside the button rather than instead of it: a control that vanishes leaves
                the explanation with nothing to be about.
            -->
            <p v-if="blockedBecause !== null" class="text-medium-emphasis mt-2" data-test="blocked">
                {{ blockedBecause }}
            </p>

            <v-alert
                v-if="backups.startFailure.value"
                type="error"
                density="compact"
                variant="tonal"
                class="mb-backup__alert"
                role="alert"
            >
                <p>{{ backups.startFailure.value.message }}</p>
                <v-btn
                    v-if="backups.startFailure.value.needsSignIn && canOpenSettings"
                    size="small"
                    variant="tonal"
                    color="primary"
                    class="mb-backup__inlineAction"
                    @click="emit('signIn')"
                >
                    {{ t("backup.signIn", "Sign in to GitHub again") }}
                </v-btn>
            </v-alert>

            <BackupRunCard
                v-for="row in backups.rows.value"
                :key="row.backupId"
                :row="row"
                :can-cancel="backups.canCancel"
                :can-open-settings="canOpenSettings === true"
                @stop="stop"
                @resume="resume"
                @sign-in="emit('signIn')"
                @open="(url: string) => emit('open', url)"
            />

            <!-- What is already there ------------------------------------------ -->
            <template v-if="backups.report.value && backups.canListBackups">
                <h5 class="mb-backup__title">
                    {{
                        t(
                            "backup.listings.title",
                            { name: backups.report.value.fullName },
                            "Backups already in {name}",
                        )
                    }}
                </h5>

                <p v-if="backups.listing.value" class="mb-backup__note" role="status">
                    {{ t("backup.listings.reading", "Reading the repository's releases...") }}
                </p>

                <v-alert
                    v-else-if="backups.listingsFailure.value"
                    type="warning"
                    density="compact"
                    variant="tonal"
                    class="mb-backup__alert"
                >
                    {{ backups.listingsFailure.value }}
                </v-alert>

                <p v-else-if="backups.listings.value.length === 0" class="mb-backup__note">
                    {{
                        t(
                            "backup.listings.none",
                            'A backup packs a world or a rendered map and pushes it to a GitHub release, so it survives even if this computer does not. Releases it holds for other reasons are left alone; only a release carrying a backup.json is one of these. There are none here yet, so use "Back this up" above to make the first one.',
                        )
                    }}
                </p>

                <template v-else>
                    <div class="mb-backup__search">
                        <ConfigSearchField
                            v-model="listQuery"
                            v-model:regex="listRegex"
                            v-model:flags="listFlags"
                            :label="t('backup.listings.searchLabel', 'Search these backups')"
                            :placeholder="t('backup.listings.searchHint', 'name, tag or archive')"
                            :sample="listSample"
                            :summary="listSummary"
                        />
                    </div>

                    <p v-if="shownListings.length === 0" class="mb-backup__note" role="status">
                        {{
                            t(
                                "backup.listings.noMatch",
                                "No backup in this repository matches that search. Clearing it brings them all back; none of them was removed.",
                            )
                        }}
                    </p>

                    <v-card
                        v-for="listing in shownListings"
                        :key="listing.tag"
                        variant="tonal"
                        class="mb-backup__listing"
                    >
                        <v-card-title class="mb-backup__listingTitle mb-responsive-card-title">
                            <span class="mb-responsive-card-title__text">{{ listing.label }}</span>
                            <v-chip
                                v-if="!listing.complete"
                                class="mb-responsive-card-title__meta"
                                size="x-small"
                                color="warning"
                                variant="flat"
                            >
                                {{ t("backup.listings.incomplete", "Did not finish") }}
                            </v-chip>
                        </v-card-title>
                        <v-card-text class="mb-backup__stepBody">
                            <p class="mb-backup__note">{{ describeListing(listing) }}</p>
                            <p class="mb-backup__note">
                                {{
                                    t(
                                        "backup.listings.made",
                                        { at: listing.createdAt, tag: listing.tag },
                                        "Made {at}, as the release {tag}",
                                    )
                                }}
                            </p>

                            <v-alert
                                v-if="listing.unsupported"
                                type="info"
                                density="compact"
                                variant="tonal"
                                class="mb-backup__alert"
                            >
                                {{ listing.unsupported }}
                            </v-alert>

                            <p v-else-if="!listing.complete" class="mb-backup__note">
                                {{
                                    t(
                                        "backup.listings.incompleteDetail",
                                        "The parts are there but the pointer that names and checksums them never went up, so there is nothing to verify a restore against. Backing the same folder up again carries this one on rather than starting over.",
                                    )
                                }}
                            </p>

                            <v-btn
                                v-else
                                :prepend-icon="mdiRestore"
                                size="small"
                                variant="tonal"
                                color="primary"
                                @click="restore(listing)"
                            >
                                {{ t("backup.listings.restore", "Restore this") }}
                            </v-btn>

                            <v-btn
                                v-if="listing.releaseUrl"
                                size="small"
                                variant="text"
                                @click="emit('open', listing.releaseUrl)"
                            >
                                {{ t("backup.listings.open", "Open the release on GitHub") }}
                            </v-btn>
                        </v-card-text>
                    </v-card>
                </template>

                <p class="mb-backup__note">
                    {{
                        t(
                            "backup.listings.appendOnly",
                            "Backups are only ever added. This application never edits, replaces or removes a release or an asset, so there is no delete here: remove one on GitHub, where what is being removed is in front of you.",
                        )
                    }}
                </p>
            </template>
        </template>
    </section>
</template>

<style>
.mb-backup {
    margin-block-start: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
}

.mb-backup__title {
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-backup__blurb,
.mb-backup__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-backup__blurb {
    font-size: 0.8125rem;
}

.mb-backup__stepTitle {
    font-size: 0.9375rem;
    font-weight: 500;
}

.mb-backup__stepBody {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
}

/*
 * Wraps rather than scrolls. At a narrow width, or at 200% display scale, a row of two
 * fields and a button does not fit on one line in any language, and in bilingual mode the
 * button's own label is the longest thing on the screen.
 */
.mb-backup__row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
    inline-size: 100%;
}

.mb-backup__row > .v-input {
    flex: 1 1 180px;
    min-inline-size: 0;
}

/* `PathField.vue` renders its own wrapper div rather than a bare `.v-input`, so it needs
   the same flex-basis spelled out again to keep wrapping the way the plain text field did. */
.mb-backup__row > .mb-path-field {
    flex: 1 1 180px;
    min-inline-size: 0;
}

.mb-backup__checking {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
}

.mb-backup__alert,
.mb-backup__step,
.mb-backup__listing,
.mb-backup__search {
    inline-size: 100%;
}

.mb-backup__go {
    align-self: flex-start;
}

.mb-backup__inlineAction {
    margin-block-start: 8px;
}

.mb-backup__skipped {
    padding-inline-start: 18px;
    font-size: 0.75rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
}

.mb-backup__listingTitle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    font-weight: 500;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * means `listing.label` never gets a line to break on, so a long listing name was
     * silently cut off with no ellipsis and no indication anything was missing. Same
     * fix as `DockerWorldSourcePanel.vue`'s `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}
</style>
