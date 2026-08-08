<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAccountKey,
    mdiAlertCircleOutline,
    mdiCancel,
    mdiCheckCircle,
    mdiContentCopy,
    mdiDownload,
    mdiLogin,
    mdiOpenInNew,
    mdiRefresh,
    mdiSwapHorizontal,
} from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VProgressLinear } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createDependencyInstaller, type DependencyRow } from "../settings/dependencyInstaller.js";
import type { DependencyInstallerBridge, SysdepOutcome } from "../settings/dependencyBridge.js";
import { dependencyRouteLabel, dependencyStageLabel } from "../settings/dependencyModel.js";
import { canWriteClipboard, resolveGitHubBridge } from "./githubBridge.js";
import { ghCliAccountSearchText, type GhCliAccountsStoreState } from "./ghCliAccountsStore.js";
import type { GhCliAccountReadout } from "./ghCliBridge.js";

/**
 * Every account the `gh` command-line tool itself is signed in as - a completely separate
 * list from `GitHubAccountsList.vue`'s own, which is this application's own multi-account
 * store. The two are never merged: this component's own explainer says so at the top, in
 * every language mode and at every funny level, and nothing here reads a value from the
 * other store or writes one to it.
 *
 * Modelled on `GitHubAccountsList.vue` for the listbox mechanics - roving tabindex, the
 * `role="listbox"`/`role="option"` pair, a row's own action sitting beside the option rather
 * than inside it - but single-action per row (Switch) rather than three, and with no
 * remove/sign-out at all: this application never deletes a `gh` credential, because `gh`'s
 * own sign-in is not something it manages.
 *
 * The main process requests the public device code itself, shows only the one-time user code
 * and URL here, and hands the approved token directly to `gh auth login --with-token` over
 * stdin. The token never reaches this component, its store, IPC, a file, or an argument.
 * Adding an account and repairing scopes therefore use the same visible browser-approval
 * flow rather than copying a terminal command that the application cannot monitor. When
 * `gh` is absent, this originating surface first composes the existing system-dependency
 * installer, re-probes the command after verified installation, and only then starts that
 * same device flow.
 */
const props = defineProps<{
    list: GhCliAccountsStoreState;
    /** Injected only by focused tests. Production resolves the existing preload bridge. */
    dependencyBridge?: DependencyInstallerBridge | null;
}>();

const emit = defineEmits<{
    "open-dependencies": [];
}>();

const { t } = useI18n();

const state = props.list;

/* -------------------------------------------------------------------------- */
/* One-click install, re-probe, then GUI sign-in                              */
/* -------------------------------------------------------------------------- */

const GH_CLI_DEPENDENCY_ID = "githubCli";
type InstallChainStage = "idle" | "preparing" | "installing" | "cancelling" | "checking";

const installer = createDependencyInstaller(
    props.dependencyBridge === undefined ? {} : { bridge: props.dependencyBridge },
);
const installChainStage = ref<InstallChainStage>("idle");
const installFailure = ref<string | null>(null);
const installStopped = ref<string | null>(null);
let installChainGeneration = 0;
let componentDisposed = false;
let previewPromise: Promise<void> | null = null;

const ghInstallRow = computed<DependencyRow | null>(
    () => installer.rows.value.find((row) => row.id === GH_CLI_DEPENDENCY_ID) ?? null,
);

const installChainBusy = computed(() => installChainStage.value !== "idle");

function isCurrentInstallChain(generation: number): boolean {
    return !componentDisposed && generation === installChainGeneration;
}

const installCancelText = computed(() => {
    if (installer.runState.value === "cancelling") {
        return t("settings.github.ghCli.installCancelling", "Cancelling installation…");
    }
    if (installChainStage.value === "installing") {
        return t("settings.github.ghCli.installCancel", "Cancel installation");
    }
    return t("settings.github.ghCli.installStopBeforeSignIn", "Stop before sign-in");
});

const ghInstallCanProceed = computed(() => {
    const row = ghInstallRow.value;
    if (row === null) return false;
    return row.preview.alreadyInstalled || row.preview.route.kind === "package-manager";
});

const installActionText = computed(() =>
    ghInstallRow.value?.preview.alreadyInstalled === true
        ? t("settings.github.ghCli.continueToSignIn", "Continue to gh sign-in")
        : t("settings.github.ghCli.installAndSignIn", "Install GitHub CLI and sign in"),
);

const ghInstallRouteText = computed(() => {
    const row = ghInstallRow.value;
    if (row === null) return null;
    return dependencyRouteLabel(row.preview.route, t);
});

const ghInstallStageText = computed(() => {
    const row = ghInstallRow.value;
    if (row === null || row.stage === "idle") return null;
    return dependencyStageLabel(row.stage, t);
});

const ghInstallPreviewIssue = computed(() => {
    if (installer.previewState.value === "unsupported") {
        return t(
            "settings.github.ghCli.installUnsupported",
            "This build cannot install GitHub CLI from this screen. Open System dependencies for the available routes.",
        );
    }
    if (installer.previewState.value === "failed") {
        return t(
            "settings.github.ghCli.installPreviewFailed",
            { reason: installer.previewFailure.value ?? "" },
            "The GitHub CLI installer preview could not be loaded: {reason}",
        );
    }
    if (installer.previewState.value !== "ready") return null;
    const row = ghInstallRow.value;
    if (row === null) {
        return t(
            "settings.github.ghCli.installMissingFromRegistry",
            "This build's dependency registry does not include GitHub CLI, so nothing was installed.",
        );
    }
    if (!row.preview.alreadyInstalled && row.preview.route.kind !== "package-manager") {
        return row.preview.route.reason;
    }
    return null;
});

function progressPercent(row: DependencyRow): number {
    return row.progress.kind === "determinate" ? row.progress.percent : 0;
}

function progressValueNow(row: DependencyRow): number | undefined {
    return row.progress.kind === "determinate" ? row.progress.percent : undefined;
}

function describeInstallFailure(reason: string): string {
    return t(
        "settings.github.ghCli.installFailed",
        { reason },
        "GitHub CLI is not ready, so sign-in did not start: {reason}",
    );
}

function outcomeFailureReason(outcome: SysdepOutcome | undefined): string {
    if (outcome === undefined) {
        return t(
            "settings.github.ghCli.installNoOutcome",
            "the installer returned no GitHub CLI result",
        );
    }
    switch (outcome.kind) {
        case "installed":
        case "already-installed":
            return t(
                "settings.github.ghCli.installVerificationFailed",
                "the package manager finished, but gh could not be verified afterwards",
            );
        case "declined-elevation":
            return t(
                "settings.github.ghCli.installElevationDeclined",
                "administrator permission was declined",
            );
        case "not-found":
            return t(
                "settings.github.ghCli.installPackageNotFound",
                { manager: outcome.manager, package: outcome.packageId },
                "{manager} could not find {package}",
            );
        case "network-failure":
        case "verification-failed":
        case "failed":
            return outcome.message;
        case "cancelled":
            return t(
                "settings.github.ghCli.installCancelledReason",
                "the installation was cancelled",
            );
        case "unsupported":
            return outcome.message;
    }
}

async function ensureGhInstallPreview(): Promise<void> {
    if (!installer.supported || installer.previewState.value === "ready") return;
    if (previewPromise !== null) return previewPromise;
    previewPromise = installer.loadPreview().finally(() => {
        previewPromise = null;
    });
    return previewPromise;
}

watch(
    () => state.availability.value,
    (availability) => {
        if (availability === "not-installed") void ensureGhInstallPreview();
    },
    { immediate: true },
);

async function installGhAndLogin(): Promise<void> {
    if (installChainBusy.value || state.loginBusy.value) return;

    const generation = ++installChainGeneration;
    installFailure.value = null;
    installStopped.value = null;
    installChainStage.value = "preparing";

    try {
        await ensureGhInstallPreview();
        if (!isCurrentInstallChain(generation)) return;

        const row = ghInstallRow.value;
        if (row === null) {
            installFailure.value = describeInstallFailure(
                t(
                    "settings.github.ghCli.installMissingFromRegistryReason",
                    "the dependency registry has no GitHub CLI entry",
                ),
            );
            return;
        }

        if (!row.preview.alreadyInstalled) {
            if (row.preview.route.kind !== "package-manager") {
                installFailure.value = describeInstallFailure(row.preview.route.reason);
                return;
            }

            installer.selectNone();
            installer.toggle(GH_CLI_DEPENDENCY_ID);
            installChainStage.value = "installing";
            await installer.run();
            if (!isCurrentInstallChain(generation)) return;

            const outcome = installer.lastResult.value?.outcomes.find(
                (candidate) => candidate.dependency === GH_CLI_DEPENDENCY_ID,
            );
            if (installer.lastResult.value?.cancelled === true) {
                installStopped.value = t(
                    "settings.github.ghCli.installStopped",
                    "Installation and sign-in stopped. The account check did not start.",
                );
                return;
            }
            const verified =
                (outcome?.kind === "installed" || outcome?.kind === "already-installed") &&
                outcome.verified;
            if (!verified) {
                installFailure.value = describeInstallFailure(outcomeFailureReason(outcome));
                return;
            }
        }

        installChainStage.value = "checking";
        await state.load();
        if (!isCurrentInstallChain(generation)) return;
        if (state.listFailure.value !== null || state.availability.value === null) {
            installFailure.value = describeInstallFailure(
                state.listFailure.value ??
                    t(
                        "settings.github.ghCli.installCheckNoAnswer",
                        "the account check returned no result",
                    ),
            );
            return;
        }
        if (state.availability.value === "not-installed") {
            installFailure.value = describeInstallFailure(
                t(
                    "settings.github.ghCli.installStillMissing",
                    "the installer finished, but gh is still not available on this application's PATH",
                ),
            );
            return;
        }

        installChainStage.value = "idle";
        if (!isCurrentInstallChain(generation)) return;
        await startLogin();
    } catch (error) {
        installFailure.value = describeInstallFailure(
            error instanceof Error ? error.message : String(error),
        );
    } finally {
        if (isCurrentInstallChain(generation)) {
            installChainStage.value = "idle";
        }
    }
}

async function cancelInstallChain(): Promise<void> {
    if (!installChainBusy.value) return;
    const cancelledStage = installChainStage.value;
    installChainGeneration += 1;
    if (installer.runState.value !== "idle") {
        installChainStage.value = "cancelling";
        installStopped.value = t(
            "settings.github.ghCli.installStopped",
            "Installation and sign-in stopped. The account check did not start.",
        );
        try {
            await installer.cancel();
        } catch (error) {
            installFailure.value = describeInstallFailure(
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            if (!componentDisposed && installChainStage.value === "cancelling") {
                installChainStage.value = "idle";
            }
        }
        return;
    }
    installStopped.value =
        cancelledStage === "checking"
            ? t(
                  "settings.github.ghCli.installStoppedAfterCheck",
                  "Setup stopped after checking gh. Sign-in did not start.",
              )
            : t(
                  "settings.github.ghCli.installStoppedBeforeNextStage",
                  "Setup stopped before the next stage began.",
              );
    installChainStage.value = "idle";
}

onBeforeUnmount(() => {
    componentDisposed = true;
    installChainGeneration += 1;
    if (state.loginBusy.value) void state.cancelLogin();
});

/* -------------------------------------------------------------------------- */
/* Finding one among many                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const ordered = computed(() =>
    [...state.accounts.value].sort((a, b) => a.login.localeCompare(b.login)),
);

const visible = computed(() =>
    ordered.value.filter((account) => matcher.value.test(ghCliAccountSearchText(account))),
);

const sample = computed(() =>
    ordered.value.map((account) => ghCliAccountSearchText(account)).join("\n"),
);

const summary = computed(() => {
    if (matcher.value.error !== null) {
        return t("config.search.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    if (!matcher.value.active) return "";
    return t(
        "settings.github.ghCli.searchSummary",
        { shown: visible.value.length, total: ordered.value.length },
        "Showing {shown} of {total}.",
    );
});

/** Only worth the space once there is enough to search through. */
const searchVisible = computed(() => ordered.value.length > 3 || query.value.length > 0);

/* -------------------------------------------------------------------------- */
/* The listbox                                                                */
/* -------------------------------------------------------------------------- */

const uid = useId();

function optionId(account: GhCliAccountReadout): string {
    return `${uid}-ghcli-${encodeURIComponent(account.host)}-${encodeURIComponent(account.login)}`;
}

function keyOf(account: GhCliAccountReadout): string {
    return `${account.host} ${account.login}`;
}

const focusedKey = ref<string | null>(null);

const visibleKeys = computed(() => visible.value.map((account) => keyOf(account)));

const rovingKey = computed<string | null>(() => {
    const keys = visibleKeys.value;
    if (focusedKey.value !== null && keys.includes(focusedKey.value)) return focusedKey.value;
    return keys[0] ?? null;
});

function focusOption(key: string): void {
    focusedKey.value = key;
    const account = visible.value.find((candidate) => keyOf(candidate) === key);
    if (account === undefined) return;
    void nextTick(() => document.getElementById(optionId(account))?.focus());
}

function noteFocus(key: string): void {
    focusedKey.value = key;
}

function onOptionKeydown(event: KeyboardEvent, account: GhCliAccountReadout): void {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        void doSwitch(account);
        return;
    }

    const keys = visibleKeys.value;
    const here = keys.indexOf(keyOf(account));
    if (here === -1) return;

    let wanted: number;
    if (event.key === "ArrowDown") wanted = here + 1;
    else if (event.key === "ArrowUp") wanted = here - 1;
    else if (event.key === "Home") wanted = 0;
    else if (event.key === "End") wanted = keys.length - 1;
    else return;

    event.preventDefault();
    const target = keys[Math.min(Math.max(wanted, 0), keys.length - 1)];
    if (target !== undefined) focusOption(target);
}

/* -------------------------------------------------------------------------- */
/* Switching - machine-wide, and always re-verified before it is called a win */
/* -------------------------------------------------------------------------- */

async function doSwitch(account: GhCliAccountReadout): Promise<void> {
    if (account.active) return;
    await state.switchAccount(account.host, account.login);
}

const switchOutcomeText = computed(() => {
    const report = state.switchReport.value;
    if (report === null) return null;
    if (report.result.ok) {
        return t(
            "settings.github.ghCli.switchSucceeded",
            { message: report.result.message },
            "gh: {message}",
        );
    }
    return t(
        "settings.github.ghCli.switchFailed",
        { reason: report.result.message },
        "gh: {reason}",
    );
});

/* -------------------------------------------------------------------------- */
/* The status line - the main process's own words, wrapped rather than lost   */
/* -------------------------------------------------------------------------- */

const statusLineText = computed(() => {
    if (state.statusMessage.value === "") return null;
    return t(
        "settings.github.ghCli.statusLine",
        { reason: state.statusMessage.value },
        "gh: {reason}",
    );
});

/* -------------------------------------------------------------------------- */
/* GUI device login: public code and URL in, no token ever out                */
/* -------------------------------------------------------------------------- */

const clipboardAvailable = computed(() => canWriteClipboard(resolveGitHubBridge()));
const copiedKey = ref<string | null>(null);

async function copyValue(value: string, key: string): Promise<void> {
    try {
        const write = resolveGitHubBridge()?.writeClipboardText;
        if (typeof write === "function") {
            await write(value);
        } else {
            const clipboard = globalThis.navigator?.clipboard;
            if (clipboard === undefined) return;
            await clipboard.writeText(value);
        }
        copiedKey.value = key;
    } catch {
        // The code remains on screen either way, which is the thing that has to be true.
    }
}

const loginLink = computed(() => {
    const current = state.loginState.value;
    return current?.verificationUriComplete ?? current?.verificationUri ?? null;
});

const loginAlertType = computed<"success" | "error" | "info">(() => {
    const stage = state.loginState.value?.stage;
    if (stage === "succeeded") return "success";
    if (stage === "failed" || stage === "denied" || stage === "expired") return "error";
    return "info";
});

async function startLogin(expectedLogin?: string): Promise<void> {
    copiedKey.value = null;
    await state.startLogin(expectedLogin);
}

async function cancelLogin(): Promise<void> {
    await state.cancelLogin();
}

async function checkAgain(): Promise<void> {
    installFailure.value = null;
    installStopped.value = null;
    await state.checkAgain();
}
</script>

<template>
    <div class="mb-ghcli">
        <div class="mb-ghcli__head">
            <h3 class="mb-ghcli__title">
                {{ t("settings.github.ghCli.title", "gh command-line tool accounts") }}
            </h3>
            <v-btn
                :prepend-icon="mdiRefresh"
                variant="text"
                size="small"
                :loading="state.loading.value"
                @click="checkAgain"
            >
                {{
                    state.loading.value
                        ? t("settings.github.ghCli.checking", "Checking…")
                        : t("settings.github.ghCli.checkAgain", "Check again")
                }}
            </v-btn>
        </div>

        <p class="mb-ghcli__note">
            {{
                t(
                    "settings.github.ghCli.explainer",
                    "The gh command-line tool keeps its own separate sign-in, shared by every terminal and tool on this computer, not managed by this application.",
                )
            }}
        </p>

        <v-progress-linear v-if="state.loading.value" indeterminate color="primary" class="mb-2" />

        <v-alert
            v-if="state.listFailure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-ghcli__alert"
        >
            {{ state.listFailure.value }}
        </v-alert>

        <v-alert
            v-if="state.actionFailure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-ghcli__alert"
        >
            {{ state.actionFailure.value }}
        </v-alert>

        <v-alert
            v-if="installFailure !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-ghcli__alert"
        >
            {{ installFailure }}
        </v-alert>

        <p
            v-if="installStopped !== null"
            class="mb-ghcli__note mb-ghcli__status"
            role="status"
            aria-live="polite"
        >
            {{ installStopped }}
        </p>

        <v-alert
            v-if="state.loginState.value !== null"
            :type="loginAlertType"
            variant="tonal"
            density="comfortable"
            :role="loginAlertType === 'error' ? 'alert' : 'status'"
            aria-live="polite"
            class="mb-ghcli__alert mb-ghcli__loginPanel"
        >
            <p class="mb-ghcli__loginMessage">{{ state.loginState.value.message }}</p>

            <div v-if="state.loginState.value.userCode !== null" class="mb-ghcli__deviceCode">
                <span class="mb-ghcli__deviceLabel">
                    {{ t("settings.github.ghCli.codeLabel", "One-time code") }}
                </span>
                <code class="mb-ghcli__deviceValue" data-testid="gh-cli-user-code">
                    {{ state.loginState.value.userCode }}
                </code>
                <v-btn
                    v-if="clipboardAvailable"
                    :prepend-icon="mdiContentCopy"
                    variant="text"
                    size="small"
                    @click="copyValue(state.loginState.value.userCode, 'user-code')"
                >
                    {{
                        copiedKey === "user-code"
                            ? t("settings.github.ghCli.codeCopied", "Code copied.")
                            : t("settings.github.ghCli.copyCode", "Copy code")
                    }}
                </v-btn>
            </div>

            <div v-if="loginLink !== null" class="mb-ghcli__verification">
                <span class="mb-ghcli__deviceLabel">
                    {{ t("settings.github.ghCli.verificationUrlLabel", "GitHub approval page") }}
                </span>
                <a
                    :href="loginLink"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mb-ghcli__verificationLink"
                >
                    {{ state.loginState.value.verificationUri }}
                    <v-icon :icon="mdiOpenInNew" size="x-small" aria-hidden="true" />
                </a>
            </div>

            <p v-if="state.loginState.value.secondsRemaining !== null" class="mb-ghcli__note">
                {{
                    t(
                        "settings.github.ghCli.secondsRemaining",
                        { seconds: state.loginState.value.secondsRemaining },
                        "{seconds} seconds remaining.",
                    )
                }}
            </p>

            <div class="mb-ghcli__loginActions">
                <v-btn
                    v-if="state.loginBusy.value"
                    :prepend-icon="mdiCancel"
                    variant="text"
                    size="small"
                    @click="cancelLogin"
                >
                    {{ t("settings.github.ghCli.cancelLogin", "Cancel sign-in") }}
                </v-btn>
                <v-btn v-else variant="text" size="small" @click="state.clearLogin()">
                    {{ t("settings.github.ghCli.dismissLogin", "Dismiss") }}
                </v-btn>
            </div>
        </v-alert>

        <!-- Not installed: preview the exact installer route before the one-click chain starts. -->
        <template v-if="state.availability.value === 'not-installed'">
            <v-alert
                type="info"
                variant="tonal"
                density="comfortable"
                role="status"
                class="mb-ghcli__alert"
            >
                {{ statusLineText }}
            </v-alert>

            <v-progress-linear
                v-if="installer.previewState.value === 'loading'"
                indeterminate
                color="primary"
                class="mb-ghcli__installBar"
                :aria-label="
                    t(
                        'settings.github.ghCli.installPreviewProgress',
                        'Checking how GitHub CLI can be installed',
                    )
                "
            />

            <v-alert
                v-if="ghInstallPreviewIssue !== null"
                :type="installer.previewState.value === 'failed' ? 'error' : 'warning'"
                variant="tonal"
                density="comfortable"
                :role="installer.previewState.value === 'failed' ? 'alert' : 'status'"
                class="mb-ghcli__alert"
            >
                {{ ghInstallPreviewIssue }}
            </v-alert>

            <div
                v-if="installer.previewState.value === 'ready' && ghInstallRow !== null"
                class="mb-ghcli__installCard"
            >
                <div class="mb-ghcli__installHead">
                    <span class="mb-ghcli__installName">{{ ghInstallRow.displayName }}</span>
                    <v-chip size="small" variant="tonal">{{ ghInstallRouteText }}</v-chip>
                    <v-chip
                        v-if="ghInstallRow.preview.alreadyInstalled"
                        size="small"
                        variant="outlined"
                    >
                        {{
                            ghInstallRow.preview.installedVersion === null
                                ? t(
                                      "settings.github.ghCli.installAlreadyInstalled",
                                      "Already installed",
                                  )
                                : t(
                                      "settings.github.ghCli.installAlreadyInstalledVersion",
                                      { version: ghInstallRow.preview.installedVersion },
                                      "Already installed ({version})",
                                  )
                        }}
                    </v-chip>
                </div>

                <v-alert
                    v-if="
                        !ghInstallRow.preview.alreadyInstalled &&
                        ghInstallRow.preview.elevation !== 'none'
                    "
                    type="warning"
                    variant="tonal"
                    density="comfortable"
                    role="status"
                    class="mb-ghcli__installDisclosure"
                >
                    {{ ghInstallRow.preview.elevationDisclosure }}
                </v-alert>

                <div
                    v-if="ghInstallStageText !== null || ghInstallRow.message !== ''"
                    class="mb-ghcli__installProgress"
                    role="status"
                    aria-live="polite"
                >
                    <strong v-if="ghInstallStageText !== null">{{ ghInstallStageText }}</strong>
                    <span v-if="ghInstallRow.message !== ''">{{ ghInstallRow.message }}</span>
                </div>

                <v-progress-linear
                    v-if="ghInstallRow.progress.kind !== 'none'"
                    :model-value="progressPercent(ghInstallRow)"
                    :indeterminate="ghInstallRow.progress.kind === 'indeterminate'"
                    :aria-label="
                        t(
                            'settings.github.ghCli.installProgressLabel',
                            'GitHub CLI installation progress',
                        )
                    "
                    :aria-valuenow="progressValueNow(ghInstallRow)"
                    color="primary"
                    height="6"
                    rounded
                    class="mb-ghcli__installBar"
                />

                <div class="mb-ghcli__installActions">
                    <v-btn
                        :prepend-icon="mdiDownload"
                        variant="tonal"
                        size="small"
                        :loading="installChainBusy"
                        :disabled="
                            !ghInstallCanProceed || installChainBusy || state.loginBusy.value
                        "
                        @click="installGhAndLogin"
                    >
                        {{ installActionText }}
                    </v-btn>
                    <v-btn
                        v-if="installChainBusy"
                        :prepend-icon="mdiCancel"
                        variant="text"
                        size="small"
                        :disabled="installer.runState.value === 'cancelling'"
                        @click="cancelInstallChain"
                    >
                        {{ installCancelText }}
                    </v-btn>
                </div>
            </div>

            <v-btn
                v-if="installer.previewState.value !== 'loading' && !ghInstallCanProceed"
                class="mb-ghcli__openDeps"
                :append-icon="mdiOpenInNew"
                variant="tonal"
                size="small"
                @click="emit('open-dependencies')"
            >
                {{
                    t(
                        "settings.github.ghCli.openDependencies",
                        "Open the System dependencies settings",
                    )
                }}
            </v-btn>
        </template>

        <template v-else>
            <p
                v-if="statusLineText !== null && !state.hasAccounts.value"
                class="mb-ghcli__note mb-ghcli__status"
                role="status"
                aria-live="polite"
            >
                {{ statusLineText }}
            </p>

            <p
                v-if="switchOutcomeText !== null"
                class="mb-ghcli__note mb-ghcli__report"
                role="status"
                aria-live="polite"
            >
                {{ switchOutcomeText }}
            </p>

            <template v-if="state.hasAccounts.value">
                <p class="mb-ghcli__warning" role="note">
                    {{
                        t(
                            "settings.github.ghCli.switchWarning",
                            "Switching here changes gh's active account for the whole computer: every terminal, script and other tool that uses gh, not only this application.",
                        )
                    }}
                </p>

                <div v-if="searchVisible" class="mb-ghcli__search">
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regexMode"
                        v-model:flags="flags"
                        :label="t('settings.github.ghCli.searchLabel', 'Search gh accounts')"
                        :placeholder="
                            t(
                                'settings.github.ghCli.searchHint',
                                'a login, a host, or a permission',
                            )
                        "
                        :sample="sample"
                        :summary="summary"
                    />
                </div>

                <p
                    v-if="searchVisible && visible.length === 0"
                    class="mb-ghcli__note mb-ghcli__empty"
                >
                    {{
                        t(
                            "settings.github.ghCli.emptySearch",
                            "Nothing here matches that search. Clearing it brings the whole list back.",
                        )
                    }}
                </p>

                <div
                    v-else
                    class="mb-ghcli__list"
                    role="listbox"
                    :aria-label="
                        t('settings.github.ghCli.listLabel', 'gh command-line tool accounts')
                    "
                >
                    <div v-for="account in visible" :key="keyOf(account)" class="mb-ghcli__rowhost">
                        <div class="mb-ghcli__row">
                            <div
                                :id="optionId(account)"
                                class="mb-ghcli__option"
                                role="option"
                                :aria-selected="account.active ? 'true' : 'false'"
                                :tabindex="rovingKey === keyOf(account) ? 0 : -1"
                                @keydown="onOptionKeydown($event, account)"
                                @focus="noteFocus(keyOf(account))"
                            >
                                <div class="mb-ghcli__optionHead">
                                    <v-chip
                                        v-if="account.active"
                                        color="success"
                                        size="small"
                                        variant="tonal"
                                        class="mb-ghcli__activeChip"
                                    >
                                        <v-icon :icon="mdiCheckCircle" start aria-hidden="true" />
                                        {{ t("settings.github.ghCli.active", "Active") }}
                                    </v-chip>
                                    <v-chip
                                        v-if="!account.healthy"
                                        color="warning"
                                        size="small"
                                        variant="tonal"
                                    >
                                        <v-icon
                                            :icon="mdiAlertCircleOutline"
                                            start
                                            aria-hidden="true"
                                        />
                                        {{
                                            t(
                                                "settings.github.ghCli.unhealthy",
                                                "gh reports a problem with this account",
                                            )
                                        }}
                                    </v-chip>
                                    <span class="mb-ghcli__login">{{ account.login }}</span>
                                    <v-chip size="small" variant="outlined">{{
                                        account.host
                                    }}</v-chip>
                                </div>

                                <dl class="mb-ghcli__facts">
                                    <div class="mb-ghcli__fact">
                                        <dt>
                                            {{
                                                t(
                                                    "settings.github.ghCli.field.source",
                                                    "Signed in with",
                                                )
                                            }}
                                        </dt>
                                        <dd>{{ account.tokenSource ?? "-" }}</dd>
                                    </div>
                                    <div class="mb-ghcli__fact">
                                        <dt>
                                            {{
                                                t(
                                                    "settings.github.ghCli.field.protocol",
                                                    "Git protocol",
                                                )
                                            }}
                                        </dt>
                                        <dd>{{ account.gitProtocol ?? "-" }}</dd>
                                    </div>
                                    <div class="mb-ghcli__fact mb-ghcli__fact--wide">
                                        <dt>
                                            {{
                                                t(
                                                    "settings.github.ghCli.field.scopes",
                                                    "Permissions",
                                                )
                                            }}
                                        </dt>
                                        <dd>
                                            <template
                                                v-if="
                                                    account.scopesReported &&
                                                    account.scopes.length > 0
                                                "
                                            >
                                                {{ account.scopes.join(", ") }}
                                            </template>
                                            <template v-else>
                                                {{
                                                    t(
                                                        "settings.github.ghCli.noScopes",
                                                        "Not reported by this token",
                                                    )
                                                }}
                                            </template>
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            <v-alert
                                v-if="account.missingAppScopes.length > 0"
                                type="warning"
                                variant="tonal"
                                density="compact"
                                class="mb-ghcli__scopeWarning"
                            >
                                <p class="mb-ghcli__scopeWarningText">
                                    {{
                                        t(
                                            "settings.github.ghCli.missingScopesWarning",
                                            { scopes: account.missingAppScopes.join(", ") },
                                            "This account is missing {scopes} for full support in this application.",
                                        )
                                    }}
                                </p>
                                <p class="mb-ghcli__note">
                                    {{
                                        t(
                                            "settings.github.ghCli.loginExplainer",
                                            "Sign-in starts here and approval happens on GitHub in your browser. The approved credential goes directly to gh's own credential store; this application does not keep it.",
                                        )
                                    }}
                                </p>
                                <v-btn
                                    :prepend-icon="mdiAccountKey"
                                    variant="tonal"
                                    size="small"
                                    class="mt-2"
                                    :loading="
                                        state.loginBusy.value &&
                                        state.loginState.value?.expectedLogin === account.login
                                    "
                                    :disabled="!state.canLogin || state.loginBusy.value"
                                    @click.stop="startLogin(account.login)"
                                >
                                    {{
                                        t(
                                            "settings.github.ghCli.repairScopesAction",
                                            "Approve required permissions",
                                        )
                                    }}
                                </v-btn>
                            </v-alert>

                            <div class="mb-ghcli__actions" role="group" :aria-label="account.login">
                                <v-btn
                                    :prepend-icon="mdiSwapHorizontal"
                                    variant="text"
                                    size="small"
                                    :loading="state.busyKey.value === keyOf(account)"
                                    :disabled="
                                        account.active ||
                                        !state.canSwitch ||
                                        (state.busyKey.value !== null &&
                                            state.busyKey.value !== keyOf(account))
                                    "
                                    @click.stop="doSwitch(account)"
                                >
                                    {{
                                        state.busyKey.value === keyOf(account)
                                            ? t("settings.github.ghCli.switching", "Switching…")
                                            : t("settings.github.ghCli.switchAction", "Switch")
                                    }}
                                </v-btn>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- Adding an account and repairing scopes share the same GUI device flow. -->
            <div class="mb-ghcli__addAccount">
                <p class="mb-ghcli__note">
                    {{
                        t(
                            "settings.github.ghCli.loginExplainer",
                            "Sign-in starts here and approval happens on GitHub in your browser. The approved credential goes directly to gh's own credential store; this application does not keep it.",
                        )
                    }}
                </p>
                <v-btn
                    :prepend-icon="mdiLogin"
                    variant="tonal"
                    size="small"
                    class="mb-ghcli__signIn"
                    :loading="
                        state.loginBusy.value && state.loginState.value?.expectedLogin === null
                    "
                    :disabled="!state.canLogin || state.loginBusy.value"
                    @click="startLogin()"
                >
                    {{ t("settings.github.ghCli.signInAction", "Sign in with gh") }}
                </v-btn>
            </div>
        </template>
    </div>
</template>

<style>
.mb-ghcli {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-ghcli__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.mb-ghcli__title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.02em;
}

.mb-ghcli__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-ghcli__status,
.mb-ghcli__report {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), 0.87);
}

.mb-ghcli__warning {
    margin: 0;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(var(--v-theme-warning), 0.12);
    font-size: 0.75rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-ghcli__alert,
.mb-ghcli__empty {
    overflow-wrap: anywhere;
}

.mb-ghcli__loginMessage {
    margin: 0;
    line-height: 1.5;
}

.mb-ghcli__deviceCode,
.mb-ghcli__verification,
.mb-ghcli__loginActions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
}

.mb-ghcli__deviceLabel {
    flex-basis: 100%;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-ghcli__deviceValue {
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    font-family: monospace;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
}

.mb-ghcli__verificationLink {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    overflow-wrap: anywhere;
}

.mb-ghcli__installCard {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
}

.mb-ghcli__installHead,
.mb-ghcli__installActions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-ghcli__installName {
    font-weight: 600;
}

.mb-ghcli__installDisclosure {
    overflow-wrap: anywhere;
}

.mb-ghcli__installProgress {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.mb-ghcli__installBar {
    flex: 0 0 auto;
}

.mb-ghcli__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-ghcli__rowhost {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 12px;
    overflow: hidden;
}

.mb-ghcli__row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
}

.mb-ghcli__option {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 8px;
    outline-offset: 2px;
}

.mb-ghcli__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
}

.mb-ghcli__optionHead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-ghcli__login {
    font-weight: 600;
    overflow-wrap: anywhere;
}

.mb-ghcli__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 4px 16px;
    margin: 0;
}

.mb-ghcli__fact--wide {
    grid-column: 1 / -1;
}

.mb-ghcli__fact > dt {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-ghcli__fact > dd {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.mb-ghcli__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.mb-ghcli__scopeWarning {
    margin-top: 4px;
}

.mb-ghcli__scopeWarningText {
    margin: 0 0 4px 0;
    font-size: 0.8125rem;
}

.mb-ghcli__addAccount {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.mb-ghcli__signIn {
    align-self: flex-start;
}
</style>
