<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloudSyncOutline, mdiFolderSearchOutline, mdiOpenInNew, mdiRefresh } from "@mdi/js";
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
    VSelect,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createGitHubAccountsList } from "../github/githubAccountsStore.js";
import type { GitHubBridge } from "../github/githubBridge.js";
import MinecraftWorldList from "../world/MinecraftWorldList.vue";
import { resolveWorldCatalogBridge } from "../world/worldCatalog.js";
import type { WorldCatalogBridge } from "../world/worldCatalog.js";
import {
    createCiRenders,
    formatBytes,
    jobTone,
    phaseLabel,
    repoNameProblem,
    routeLabel,
    runLabel,
    uploadLine,
    waveSummaries,
    worldFolderName,
} from "./ciRenders.js";
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
 *
 * **More than one signed-in account, and picking one here never touches the others.** The
 * application can hold several GitHub accounts side by side
 * (`GitHubAccountsList.vue` in Settings is where they are added, removed and made active);
 * before this picker existed, every call this screen made - who could own the repository,
 * whether the world was uploaded before, the credential that actually dispatches the
 * workflow - resolved to whichever one was *active*, with no way to render as a different
 * signed-in account short of switching in Settings and back. "Render as" is a *local*
 * choice: picking a different stored account here re-reads the owner list for it and
 * carries its id through the check and the render, but it never calls the active-account
 * switch Settings uses. Downloads, backups and every other GitHub-authenticated feature
 * keep running on whichever account was already active, and leaving the picker untouched
 * behaves exactly as it always did.
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
        /**
         * The world catalog's own bridge, handed down for tests exactly the way
         * `WorldFolderStep.vue` accepts one. Left out, `undefined` means probe the Electron
         * bridge itself; an explicit `null` means there is deliberately none.
         */
        catalogBridge?: WorldCatalogBridge | null | undefined;
        /**
         * The GitHub bridge behind the "Render as" account picker, injected in tests exactly
         * like `catalogBridge` above: `undefined` probes the Electron preload, an explicit
         * `null` means there is deliberately none and the picker never appears. Deliberately
         * a separate probe from `bridge` - the multi-account registry predates CI rendering
         * and belongs to `github/`, not to this screen, so it is fine for a build to carry
         * one bridge and not the other.
         */
        accountsBridge?: GitHubBridge | null | undefined;
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

/**
 * Every GitHub account this computer has stored, and which one is active - the exact same
 * store `GitHubAccountsList.vue` drives from Settings, reused rather than forked so this
 * screen never carries a second idea of what an "account" is. Read-only from here: this
 * screen calls `load()` to list accounts and reads `activeId` as the picker's default, but
 * never calls `setActive()` - see "Render as" below for why. A build carrying no accounts
 * namespace at all reports `canList: false` and the picker section simply never renders.
 */
const accountsList = createGitHubAccountsList(
    props.accountsBridge === undefined ? {} : { bridge: props.accountsBridge },
);

const worldFolder = ref(props.worlds[0]?.folder ?? "");
const owner = ref("");
const repo = ref("");
const acknowledgeUpload = ref(false);
const acknowledgePublic = ref(false);

/* -------------------------------------------------------------------------- */
/* The world folder: a picker of what this machine already knows about,       */
/* a browse button, and free text that all three keep in step with each other */
/* -------------------------------------------------------------------------- */

/**
 * The world catalog's own bridge, probed exactly as `WorldFolderStep.vue` probes it: left
 * undefined it probes the Electron preload itself, and a build with none of it simply shows
 * no list, leaving the field, the browse button and typing it by hand untouched.
 */
const worldCatalogBridge = computed<WorldCatalogBridge | null>(() =>
    props.catalogBridge === undefined ? resolveWorldCatalogBridge() : props.catalogBridge,
);

/**
 * The shared folder-browse affordance, probed by hand rather than through `useConfigHost()`.
 *
 * This screen is not nested under `provideConfigHost()` the way the config editor is, and
 * `window.materialBluemap.dialog` asks nothing of its caller beyond existing - it is the
 * same "screen-agnostic path field" surface Settings and the remote target editor already
 * reach through. A build carrying none of it simply hides the Browse button; typing the
 * path, or choosing it from the list below, both still work.
 */
const dialogPickFolder = computed<((options: { title: string; startIn?: string }) => Promise<string | null>) | null>(
    () => {
        const host = (
            globalThis as {
                materialBluemap?: { dialog?: { pickFolder?: (options: { title: string; startIn?: string }) => Promise<string | null> } };
            }
        ).materialBluemap;
        const pick = host?.dialog?.pickFolder;
        return typeof pick === "function" ? pick : null;
    },
);

/**
 * Why the Browse button is dead on this build, or null when it works.
 *
 * The same discipline `checkBlockedBecause` and `blockedBecause` hold their buttons to:
 * a disabled control in this card always says why, sighted or via a screen reader, rather
 * than a button that simply does nothing when clicked.
 */
const browseUnavailableBecause = computed<string | null>(() => {
    if (dialogPickFolder.value !== null) return null;
    return t(
        "cirender.field.world.browseUnavailable",
        "This build cannot open a folder picker. Type the world's path above, or choose it from the list below.",
    );
});

async function browseWorldFolder(): Promise<void> {
    const pick = dialogPickFolder.value;
    if (pick === null) return;
    const chosen = await pick({
        title: t("cirender.field.world.browsePrompt", "Choose the world folder, the one that contains level.dat"),
        ...(worldFolder.value.trim() === "" ? {} : { startIn: worldFolder.value.trim() }),
    });
    if (chosen === null) return;
    worldFolder.value = chosen;
    void applySuggestedRepoName(chosen);
}

/** A world picked from the list. Filled in exactly like a typed or browsed one. */
function chooseWorld(folder: string): void {
    worldFolder.value = folder;
    void applySuggestedRepoName(folder);
}

/**
 * Fills the repository name from the world's own folder name, once - never overwriting
 * something already typed.
 *
 * Checked again after the suggestion arrives, not only before asking for it: a person can
 * type a name into the field during the round trip, and that keystroke must win. The world
 * folder is checked too, not just the repo field: choosing world A and then world B before
 * A's round trip has returned leaves two requests in flight, and A's slower-or-faster return
 * must not overwrite the field with a name for a world that is no longer chosen.
 */
async function applySuggestedRepoName(folder: string): Promise<void> {
    if (repo.value.trim() !== "") return;
    const name = worldFolderName(folder);
    if (name === "") return;
    const suggestion = await renders.suggestRepoName(name);
    if (suggestion !== null && repo.value.trim() === "" && worldFolder.value === folder) repo.value = suggestion;
}

/* -------------------------------------------------------------------------- */
/* Render as: which signed-in account this render authenticates as, chosen    */
/* on this card and carried through the check and the dispatch - never the   */
/* application-wide active-account switch                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which stored account this render runs as. Null means "whichever account is active",
 * which is the default nobody has to touch: every request this screen sends leaves
 * `accountId` out entirely while this stays null, so the main process resolves it exactly
 * the way it always did for a single-account build. Set only by {@link chooseAccount}.
 */
const selectedAccountId = ref<string | null>(null);

/**
 * True once the account list has answered at least once.
 *
 * The signed-out state below is only ever shown once this is true - the same rule
 * `renders.owners` already follows by starting `null` - so the picker never flashes
 * "nobody is signed in" for the instant before its own first load has come back.
 */
const accountsLoaded = ref(false);

const accountOrdered = computed(() =>
    [...accountsList.accounts.value].sort((a, b) => a.login.localeCompare(b.login)),
);

/** The account id every request this screen sends actually carries. Undefined for "active". */
const effectiveAccountId = computed<string | undefined>(() => selectedAccountId.value ?? undefined);

/** Shown once the multi-account registry exists on this build and has answered once. */
const showAccountPicker = computed(() => accountsList.canList && accountsLoaded.value);

/** Nobody is signed in to GitHub at all - the "sign in" case, not "one account, nothing to choose". */
const accountSignedOut = computed(() => accountOrdered.value.length === 0);

const accountItems = computed(() =>
    accountOrdered.value.map((account) => ({
        title: account.active
            ? t("cirender.account.itemActive", { login: account.login }, "{login} (active)")
            : account.login,
        value: account.id,
    })),
);

/**
 * Why the picker cannot be used to choose anything, or null when a real choice exists.
 *
 * The same discipline every disabled control on this card holds to: naming the unmet
 * condition rather than merely going grey. Exactly one signed-in account has nothing to
 * switch to, so the picker still renders - showing which one it is - but is trivially
 * satisfied rather than hidden outright, per the guided-setup convention this screen
 * already follows for the Browse button and the Check button.
 */
const accountPickerDisabledBecause = computed<string | null>(() => {
    if (accountOrdered.value.length !== 1) return null;
    return t("cirender.account.single", "Only one GitHub account is signed in, so this is fixed to it.");
});

/**
 * Chooses which stored account this render authenticates as.
 *
 * Deliberately local to this card and nowhere else: this never calls
 * `accountsList.setActive`, so it never touches which account Settings, downloads or
 * backups already resolve to - only which one *this render* does. The owner list is
 * re-resolved for the account just chosen (its own login and organisations, not the
 * previous account's), the repository owner field is cleared because a login or
 * organisation typed for one account may mean nothing under another, and any earlier
 * "Check before anything is sent" report is dropped because it described the account that
 * was in play before this choice.
 */
function chooseAccount(value: unknown): void {
    const current = selectedAccountId.value ?? accountsList.activeId.value;
    if (typeof value !== "string" || value === current) return;
    selectedAccountId.value = value;
    owner.value = "";
    renders.clearPreflight();
    renders.clearNameAvailability();
    if (renders.canListOwners) void renders.loadOwners(value);
}

/* -------------------------------------------------------------------------- */
/* The repository owner: the signed-in account and its organisations          */
/* -------------------------------------------------------------------------- */

const ownerItems = computed(() => {
    const answer = renders.owners.value;
    if (answer === null || !answer.ok) return [];
    return answer.owners.map((choice) => ({
        title:
            choice.kind === "organization"
                ? t("cirender.owner.asOrg", { login: choice.login }, "{login} (organization)")
                : t("cirender.owner.asYou", { login: choice.login }, "{login} (you)"),
        value: choice.login,
    }));
});

function chooseOwner(value: unknown): void {
    if (typeof value === "string") owner.value = value;
}

/** Nobody is signed in at all - the "sign in" case, not the "try again" one. */
const ownerSignedOut = computed(() => {
    const answer = renders.owners.value;
    return answer !== null && !answer.ok && !answer.signedIn;
});

/** Somebody is signed in, but the list itself could not be read - "try again" applies here. */
const ownerLoadFailed = computed(() => {
    const answer = renders.owners.value;
    return answer !== null && !answer.ok && answer.signedIn;
});

const ownerFailureMessage = computed(() => {
    const answer = renders.owners.value;
    return answer !== null && !answer.ok ? answer.message : "";
});

/* -------------------------------------------------------------------------- */
/* The repository name: an existing repository picked, or a name checked live */
/* -------------------------------------------------------------------------- */

const repositoryItems = computed(() =>
    renders.repositories.value.map((repository) => ({
        title: repository.private
            ? t("cirender.repo.itemPrivate", { name: repository.fullName }, "{name} (private)")
            : t("cirender.repo.itemPublic", { name: repository.fullName }, "{name} (PUBLIC)"),
        value: repository.fullName,
    })),
);

function chooseRepository(value: unknown): void {
    if (typeof value !== "string") return;
    const [chosenOwner, chosenRepo] = value.split("/");
    if (chosenOwner === undefined || chosenRepo === undefined) return;
    owner.value = chosenOwner;
    repo.value = chosenRepo;
}

/** Which of GitHub's naming rules `repo` breaks, or null when it is fine or still empty. */
const repoProblem = computed(() => repoNameProblem(repo.value, t));

let nameCheckTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Checks the typed name against GitHub, on a delay.
 *
 * A network call on every keystroke would ask GitHub about "w", "wo", "wor" and every
 * letter after - debounced here so it asks about the name somebody actually meant to type,
 * once they have paused rather than mid-keystroke. Any stale verdict is dropped the instant
 * either field changes, so a "taken" from the previous name is never shown beside a new one.
 */
watch([owner, repo], ([nextOwner, nextRepo]) => {
    renders.clearNameAvailability();
    if (nameCheckTimer !== null) clearTimeout(nameCheckTimer);
    const trimmedOwner = nextOwner.trim();
    const trimmedRepo = nextRepo.trim();
    if (trimmedOwner === "" || trimmedRepo === "" || repoProblem.value !== null) return;
    nameCheckTimer = setTimeout(() => {
        void renders.checkRepoName(trimmedOwner, trimmedRepo);
    }, 600);
});

const repoAvailabilityTone = computed<"success" | "warning" | "muted">(() => {
    const availability = renders.nameAvailability.value;
    if (availability === null) return "muted";
    if (availability.status === "available") return "success";
    if (availability.status === "taken") return "warning";
    return "muted";
});

const repoAvailabilityText = computed<string>(() => {
    const availability = renders.nameAvailability.value;
    if (availability === null) return "";
    if (availability.status === "available") {
        return t(
            "cirender.repo.available",
            { owner: availability.owner, repo: availability.repo },
            "{owner}/{repo} is free on GitHub.",
        );
    }
    if (availability.status === "taken") {
        return t(
            "cirender.repo.taken",
            { owner: availability.owner, repo: availability.repo },
            "{owner}/{repo} already exists on GitHub.",
        );
    }
    return t(
        "cirender.repo.unknown",
        { owner: availability.owner, repo: availability.repo, message: availability.message },
        "Could not check whether that name is free: {message}",
    );
});

/**
 * Why the Check button will not go yet, in the order somebody fills the card in.
 *
 * The same discipline `blockedBecause` below holds the Render button to: one sentence,
 * naming exactly which field is missing or invalid, rather than a button that simply went
 * grey.
 */
const checkBlockedBecause = computed<string | null>(() => {
    if (!renders.available) return null;
    if (worldFolder.value.trim() === "") {
        return t("cirender.checkBlocked.world", "Choose a world folder before checking.");
    }
    if (owner.value.trim() === "") {
        return t("cirender.checkBlocked.owner", "Choose or type a repository owner before checking.");
    }
    if (repo.value.trim() === "") {
        return t("cirender.checkBlocked.repo", "Choose or type a repository name before checking.");
    }
    if (repoProblem.value !== null) return repoProblem.value;
    return null;
});

/**
 * Whether the finished map is published to the repository's Pages site as well as
 * downloaded.
 *
 * Off by default, deliberately. Rendering a world is a private act until somebody says
 * otherwise, and a switch that quietly put a person's world on the open web the first
 * time they used it would be the wrong default even in a public repository.
 */
const publishToPages = ref(false);
const forceUpload = ref(false);

const preflight = computed<CiPreflight | null>(() => renders.preflight.value);
const isPublic = computed(() => preflight.value?.repository?.private === false);
const routeReport = computed(() => preflight.value?.routeReport ?? null);

/**
 * What `gh` is on this machine, as one of three sentences rather than "unavailable".
 *
 * The three states have three different remedies and collapsing them sends most people to
 * the wrong one: "not installed" wants a download, "signed out" wants a command run in a
 * terminal that this application deliberately does not drive, and "ready" wants nothing at
 * all. The account is named when there is one, because a machine can be signed in to `gh`
 * as somebody other than the person expects.
 */
const ghState = computed<{ tone: "info" | "warning"; text: string } | null>(() => {
    const gh = routeReport.value?.gh;
    if (gh === undefined) return null;
    // Never asked, so nothing is said. Reporting an unprobed `gh` as missing would tell
    // somebody to install software they may well already have, on every single check.
    if (gh.availability === "not-checked") return null;
    if (gh.availability === "not-installed") {
        return {
            tone: "warning",
            text: t(
                "cirender.gh.missing",
                "The gh command-line tool is not on this computer, so it cannot be used as a second route. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            ),
        };
    }
    if (gh.availability === "signed-out") {
        return {
            tone: "warning",
            text: t(
                "cirender.gh.signedOut",
                "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            ),
        };
    }
    return {
        tone: "info",
        text:
            gh.account === null
                ? t("cirender.gh.ready", "The gh command-line tool is installed and signed in.")
                : t(
                      "cirender.gh.readyAs",
                      { account: gh.account, host: gh.host ?? "github.com" },
                      "The gh command-line tool is signed in as {account} on {host}.",
                  ),
    };
});

/**
 * Why the credential that is *not* driving this sync was passed over.
 *
 * Only when there is a real reason. When the in-app sign-in works, `gh` is not probed at
 * all, and "not needed" is a placeholder rather than something a person should read.
 */
const routeAside = computed<string | null>(() => {
    const report = routeReport.value;
    if (report === null || report.route === null) return null;
    const reason = report.route === "gh" ? report.session.reason : report.gh.reason;
    return reason === null || reason === "not needed" ? null : reason;
});

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
    // Both shipped credentials can publish a world, so this is the genuine "neither can"
    // case rather than the old "gh cannot" one - and it names both remedies, because only
    // the person knows which of their two GitHub sign-ins they are able to fix.
    if (report.uploadNeeded && !report.routeReport.canUpload) {
        return t(
            "cirender.blocked.uploadRoute",
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
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
        ...(effectiveAccountId.value === undefined ? {} : { accountId: effectiveAccountId.value }),
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
        output: publishToPages.value ? "artifact-and-pages" : "artifact",
        ...(effectiveAccountId.value === undefined ? {} : { accountId: effectiveAccountId.value }),
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

/**
 * The waves this row's jobs actually named, in the order first seen.
 *
 * Filters out the `wave: null` bucket - jobs the workflow does not shard, like `Build the
 * BlueMap CLI` - so the summary only lists real waves rather than a row for "no wave" that
 * would read as one more wave.
 */
function waves(row: CiRow): readonly { wave: number; done: number; total: number }[] {
    return waveSummaries(row.run?.jobs ?? []).flatMap((summary) =>
        summary.wave === null ? [] : [{ wave: summary.wave, done: summary.done, total: summary.total }],
    );
}

onMounted(() => {
    void renders.loadKnown();
    if (renders.canListOwners) void renders.loadOwners(effectiveAccountId.value);
    if (renders.canListRepositories) void renders.loadRepositories();
    if (accountsList.canList) {
        void accountsList.load().then(() => {
            accountsLoaded.value = true;
        });
    }
    // A world already prefilled from `props.worlds` is a world chosen too, so the name
    // suggestion applies to it exactly as it would to one picked or browsed after mount.
    if (worldFolder.value.trim() !== "") void applySuggestedRepoName(worldFolder.value);
});

onBeforeUnmount(() => {
    if (nameCheckTimer !== null) clearTimeout(nameCheckTimer);
    renders.dispose();
    accountsList.dispose();
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
                    <!--
                        "Render as": local to this card, never the application-wide
                        active-account switch. Nobody signed in offers the sign-in action
                        rather than a dead picker; exactly one signed-in account still shows
                        the picker, naming why it is fixed, per the guided-setup convention
                        this card already follows for the Browse and Check buttons.
                    -->
                    <div v-if="showAccountPicker" class="mb-4">
                        <VAlert
                            v-if="accountSignedOut"
                            type="info"
                            variant="tonal"
                            density="compact"
                            data-test="account-signed-out"
                            role="status"
                            aria-live="polite"
                        >
                            {{
                                t(
                                    "cirender.account.signedOut",
                                    "Nobody is signed in to GitHub, so there is no account to render as. Sign in from Settings.",
                                )
                            }}
                            <VBtn
                                v-if="props.canOpenSettings"
                                size="small"
                                variant="text"
                                class="mt-1"
                                @click="emit('signIn')"
                            >
                                {{ t("cirender.signIn", "Open the GitHub sign-in") }}
                            </VBtn>
                        </VAlert>
                        <template v-else>
                            <VSelect
                                :items="accountItems"
                                :model-value="selectedAccountId ?? accountsList.activeId.value"
                                :label="t('cirender.account.pick', 'Render as')"
                                :hint="
                                    t(
                                        'cirender.account.help',
                                        'Which signed-in account this render authenticates as. Choosing a different one here does not change the active account used anywhere else in the app.',
                                    )
                                "
                                persistent-hint
                                :disabled="accountPickerDisabledBecause !== null"
                                :title="accountPickerDisabledBecause ?? undefined"
                                :aria-label="
                                    accountPickerDisabledBecause !== null
                                        ? t(
                                              'cirender.account.disabledLabel',
                                              { reason: accountPickerDisabledBecause },
                                              'Render as: {reason}',
                                          )
                                        : undefined
                                "
                                variant="outlined"
                                density="compact"
                                data-test="account-select"
                                @update:model-value="chooseAccount"
                            />
                            <p
                                v-if="accountPickerDisabledBecause !== null"
                                class="text-medium-emphasis mt-1"
                                data-test="account-select-disabled"
                            >
                                {{ accountPickerDisabledBecause }}
                            </p>
                        </template>
                    </div>

                    <!--
                        The world folder: a text field kept in step with a picker of what
                        this machine already knows about and a browse button, exactly the
                        three routes `WorldFolderStep.vue` offers for the same choice. None
                        of the three is the "real" one; they all write the same ref.
                    -->
                    <div class="d-flex ga-2 flex-wrap align-start">
                        <VTextField
                            v-model="worldFolder"
                            :label="t('cirender.field.world', 'World folder')"
                            :hint="t('cirender.field.world.help', 'Pick a world below, browse for one, or type its full path.')"
                            persistent-hint
                            density="compact"
                            data-test="world-field"
                            class="flex-grow-1"
                            style="min-width: 220px"
                        />
                        <VBtn
                            :prepend-icon="mdiFolderSearchOutline"
                            :disabled="dialogPickFolder === null"
                            :title="browseUnavailableBecause ?? undefined"
                            :aria-label="
                                browseUnavailableBecause !== null
                                    ? t(
                                          'cirender.field.world.browseUnavailableLabel',
                                          { reason: browseUnavailableBecause },
                                          'Browse: {reason}',
                                      )
                                    : undefined
                            "
                            variant="tonal"
                            data-test="world-browse"
                            @click="browseWorldFolder"
                        >
                            {{ t("cirender.field.world.browse", "Browse") }}
                        </VBtn>
                    </div>
                    <p
                        v-if="browseUnavailableBecause !== null"
                        class="text-medium-emphasis mt-1"
                        data-test="world-browse-unavailable"
                    >
                        {{ browseUnavailableBecause }}
                    </p>

                    <MinecraftWorldList :model-value="worldFolder" :bridge="worldCatalogBridge" @choose="chooseWorld" />

                    <!--
                        The repository owner: signed out points at the sign-in row that
                        already exists rather than opening a second one; signed in but
                        unreadable offers a retry; either way the free-text field beneath
                        keeps working on its own.
                    -->
                    <VAlert
                        v-if="ownerSignedOut"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mt-4 mb-2"
                        data-test="owner-signed-out"
                        role="status"
                        aria-live="polite"
                    >
                        {{
                            t(
                                "cirender.owner.signedOut",
                                "Nobody is signed in to GitHub, so there is no list of accounts to choose from. Sign in from Settings, or type the owner directly below.",
                            )
                        }}
                        <VBtn
                            v-if="props.canOpenSettings"
                            size="small"
                            variant="text"
                            class="mt-1"
                            @click="emit('signIn')"
                        >
                            {{ t("cirender.signIn", "Open the GitHub sign-in") }}
                        </VBtn>
                    </VAlert>
                    <VAlert
                        v-else-if="ownerLoadFailed"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mt-4 mb-2"
                        data-test="owner-load-failed"
                        role="alert"
                    >
                        {{ ownerFailureMessage }}
                        <VBtn
                            size="small"
                            variant="text"
                            class="mt-1"
                            @click="renders.loadOwners(effectiveAccountId)"
                        >
                            {{ t("cirender.owner.retry", "Try again") }}
                        </VBtn>
                    </VAlert>

                    <VSelect
                        v-if="ownerItems.length > 0"
                        :items="ownerItems"
                        :label="t('cirender.owner.pick', 'Choose an owner')"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                        class="mb-2"
                        data-test="owner-select"
                        @update:model-value="chooseOwner"
                    />

                    <VSelect
                        v-if="repositoryItems.length > 0"
                        :items="repositoryItems"
                        :label="t('cirender.repo.pick', 'One of your repositories')"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                        class="mb-2"
                        data-test="repository-select"
                        @update:model-value="chooseRepository"
                    />
                    <p
                        v-else-if="renders.loadingRepositories.value"
                        class="text-medium-emphasis mb-2"
                        data-test="repositories-loading"
                    >
                        {{ t("cirender.repo.loadingRepositories", "Reading your repositories...") }}
                    </p>
                    <VAlert
                        v-else-if="renders.repositoriesFailure.value !== null"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mb-2"
                        data-test="repositories-failure"
                    >
                        {{ renders.repositoriesFailure.value }}
                    </VAlert>

                    <div class="d-flex ga-2 flex-wrap">
                        <VTextField
                            v-model="owner"
                            :label="t('cirender.field.owner', 'Repository owner')"
                            :hint="t('cirender.field.owner.help', 'Pick an account above, or type any owner you have write access to.')"
                            persistent-hint
                            density="compact"
                            data-test="owner-field"
                            class="flex-grow-1"
                            style="min-width: 200px"
                        />
                        <VTextField
                            v-model="repo"
                            :label="t('cirender.field.repo', 'Repository name')"
                            :hint="
                                repoProblem ??
                                t(
                                    'cirender.field.repo.help',
                                    'A name is suggested once you choose a world. It stays yours to change before checking.',
                                )
                            "
                            :error="repoProblem !== null"
                            persistent-hint
                            density="compact"
                            data-test="repo-field"
                            class="flex-grow-1"
                            style="min-width: 200px"
                        />
                    </div>

                    <p
                        v-if="renders.checkingName.value"
                        class="text-medium-emphasis mt-1"
                        data-test="repo-availability"
                        role="status"
                        aria-live="polite"
                    >
                        {{ t("cirender.repo.checking", "Checking whether that name is free...") }}
                    </p>
                    <p
                        v-else-if="renders.nameAvailability.value !== null"
                        class="mt-1"
                        :class="{
                            'text-success': repoAvailabilityTone === 'success',
                            'text-warning': repoAvailabilityTone === 'warning',
                            'text-medium-emphasis': repoAvailabilityTone === 'muted',
                        }"
                        data-test="repo-availability"
                        role="status"
                        aria-live="polite"
                    >
                        {{ repoAvailabilityText }}
                    </p>

                    <VBtn
                        :prepend-icon="mdiRefresh"
                        :disabled="checkBlockedBecause !== null"
                        :loading="renders.checking.value"
                        variant="tonal"
                        class="mt-3"
                        @click="check"
                    >
                        {{ t("cirender.check", "Check before anything is sent") }}
                    </VBtn>
                    <p v-if="checkBlockedBecause !== null" class="text-medium-emphasis mt-2" data-test="check-blocked">
                        {{ checkBlockedBecause }}
                    </p>
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
                        interchangeable, so the reason the other one was passed over is here
                        too - "permission denied" is unactionable without it.
                    -->
                    <VAlert
                        :type="routeReport?.ready === true ? 'info' : 'warning'"
                        variant="tonal"
                        class="mb-3"
                        data-test="route"
                    >
                        {{ routeReport?.describe }}
                        <p v-if="routeAside !== null" class="mt-1 text-medium-emphasis" data-test="route-aside">
                            {{
                                t(
                                    "cirender.route.other",
                                    { reason: routeAside },
                                    "The other sign-in was not used: {reason}",
                                )
                            }}
                        </p>
                        <p v-if="ghState !== null" class="mt-1 text-medium-emphasis" data-test="route-gh">
                            {{ ghState.text }}
                        </p>
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
                        v-if="preflight.repository === null && preflight.repositoryFailure !== null"
                        type="warning"
                        variant="tonal"
                        class="mb-3"
                        data-test="repository-unknown"
                    >
                        {{
                            t(
                                "cirender.repository.unknown",
                                "Neither GitHub sign-in on this computer could read the repository, so whether it is public could not be checked. Nothing will be uploaded until one of them can.",
                            )
                        }}
                    </VAlert>
                    <!--
                        The warning above came from the chosen route rather than from the
                        application's own sign-in. Said out loud, because the wording differs
                        and somebody comparing two machines deserves to know why.
                    -->
                    <p
                        v-else-if="preflight.repositoryFailure !== null"
                        class="text-medium-emphasis mb-3"
                        data-test="repository-fallback"
                    >
                        {{
                            t(
                                "cirender.repository.fallback",
                                "This application's own GitHub sign-in could not read the repository, so the note above was read with the credential that will do the work instead.",
                            )
                        }}
                    </p>

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
                    <VCheckbox
                        v-model="publishToPages"
                        density="compact"
                        data-test="publish-pages"
                        :label="
                            t(
                                'cirender.pages.publish',
                                'Also host the finished map on this repository’s GitHub Pages site',
                            )
                        "
                    />
                    <p v-if="publishToPages" class="text-caption text-medium-emphasis mb-2">
                        {{
                            t(
                                "cirender.pages.explain",
                                "The map is published under the documentation site at /map/, so publishing it does not take that site down. Anybody with the link can see the map, whether or not the repository is private.",
                            )
                        }}
                        {{
                            t(
                                "cirender.pages.parts",
                                "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly and the map is still downloadable.",
                            )
                        }}
                    </p>

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

                    <!--
                        Which credential is actually driving this sync. Null for the moment
                        between `started` and the first `phase` event - the route genuinely
                        is not known yet, so nothing is shown rather than a placeholder.
                    -->
                    <p v-if="row.route !== null" class="text-medium-emphasis" data-test="row-route">
                        {{ routeLabel(row.route, t) }}
                    </p>

                    <!--
                        The upload's own byte count, and the pieces those bytes are made of.
                        A world is gigabytes and a domestic connection is hours, so a phase
                        label with no number beside it is indistinguishable from a hang for
                        most of an afternoon.
                    -->
                    <template v-if="row.transfer !== null">
                        <VProgressLinear
                            :model-value="row.transfer.percent"
                            class="my-2"
                            data-test="transfer-bar"
                        />
                        <p class="text-medium-emphasis" data-test="transfer">
                            {{ row.transfer.description }} —
                            {{
                                t(
                                    "cirender.transfer.bytes",
                                    {
                                        done: formatBytes(row.transfer.bytesDone, t),
                                        total: formatBytes(row.transfer.bytesTotal, t),
                                    },
                                    "{done} of {total}",
                                )
                            }}
                            <template v-if="row.transfer.assetsTotal > 0">
                                —
                                {{
                                    t(
                                        "cirender.transfer.items",
                                        { done: row.transfer.assetsDone, total: row.transfer.assetsTotal },
                                        "{done} of {total} pieces",
                                    )
                                }}
                            </template>
                        </p>
                    </template>

                    <p data-test="run-label">{{ runLabel(row.run, t) }}</p>

                    <!--
                        Which wave each shard is in, summed per wave. The workflow runs
                        shards in sequential waves of at most 256; this is the one real
                        proportion available inside a wave still in progress.
                    -->
                    <ul v-if="waves(row).length > 0" class="ci-waves" data-test="wave-summary">
                        <li v-for="w in waves(row)" :key="w.wave">
                            {{
                                t(
                                    "cirender.wave.summary",
                                    { wave: w.wave, done: w.done, total: w.total },
                                    "Wave {wave}: {done} of {total}",
                                )
                            }}
                        </li>
                    </ul>

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
                                <span v-if="job.wave !== null" class="ml-2 text-medium-emphasis" data-test="job-wave">
                                    {{ t("cirender.job.wave", { wave: job.wave }, "Wave {wave}") }}
                                </span>
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
.ci-jobs,
.ci-waves {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
}

.ci-waves li {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.ci-log {
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 16rem;
    font-size: 0.8125rem;
}
</style>
