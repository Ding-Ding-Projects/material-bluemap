<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCheckCircle,
    mdiConsole,
    mdiContentCopy,
    mdiOpenInNew,
    mdiRefresh,
    mdiSwapHorizontal,
} from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VProgressLinear } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
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
 * `gh auth login`/`gh auth refresh` cannot be driven from inside this application at all -
 * both suppress their device-code prompt the moment stdin is not a real terminal, which is
 * always true of a process this application spawns, so they would hang forever with nothing
 * printed. "Add an account" and "this account is short a scope" are therefore both answered
 * the same way: the exact command to run, in the user's own terminal, with a copy button and
 * a "Check again" to pick up the result - never a button that tries to run either command.
 */
const props = defineProps<{ list: GhCliAccountsStoreState }>();

const emit = defineEmits<{
    "open-dependencies": [];
}>();

const { t } = useI18n();

const state = props.list;

/* -------------------------------------------------------------------------- */
/* Finding one among many                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const ordered = computed(() => [...state.accounts.value].sort((a, b) => a.login.localeCompare(b.login)));

const visible = computed(() => ordered.value.filter((account) => matcher.value.test(ghCliAccountSearchText(account))));

const sample = computed(() => ordered.value.map((account) => ghCliAccountSearchText(account)).join("\n"));

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
    return t("settings.github.ghCli.switchFailed", { reason: report.result.message }, "gh: {reason}");
});

/* -------------------------------------------------------------------------- */
/* The status line - the main process's own words, wrapped rather than lost   */
/* -------------------------------------------------------------------------- */

const statusLineText = computed(() => {
    if (state.statusMessage.value === "") return null;
    return t("settings.github.ghCli.statusLine", { reason: state.statusMessage.value }, "gh: {reason}");
});

/* -------------------------------------------------------------------------- */
/* Terminal commands this application can name but never run                  */
/* -------------------------------------------------------------------------- */

const clipboardAvailable = computed(() => canWriteClipboard(resolveGitHubBridge()));
const copiedKey = ref<string | null>(null);

async function copyCommand(command: string, key: string): Promise<void> {
    try {
        const write = resolveGitHubBridge()?.writeClipboardText;
        if (typeof write === "function") {
            await write(command);
        } else {
            const clipboard = globalThis.navigator?.clipboard;
            if (clipboard === undefined) return;
            await clipboard.writeText(command);
        }
        copiedKey.value = key;
    } catch {
        // The command is on screen either way, which is the thing that has to be true.
    }
}

const addAccountCommand = "gh auth login";

function refreshCommandFor(account: GhCliAccountReadout): string {
    return `gh auth refresh --hostname ${account.host} --scopes ${account.missingAppScopes.join(",")}`;
}

async function checkAgain(): Promise<void> {
    await state.checkAgain();
}
</script>

<template>
    <div class="mb-ghcli">
        <div class="mb-ghcli__head">
            <h3 class="mb-ghcli__title">{{ t("settings.github.ghCli.title", "gh command-line tool accounts") }}</h3>
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
            {{ t("settings.github.ghCli.explainer", "The gh command-line tool keeps its own separate sign-in, shared by every terminal and tool on this computer, not managed by this application.") }}
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

        <!-- Not installed: say so, name what still works, and point at the installer. -->
        <template v-if="state.availability.value === 'not-installed'">
            <v-alert type="info" variant="tonal" density="comfortable" role="status" class="mb-ghcli__alert">
                {{ statusLineText }}
            </v-alert>
            <v-btn
                class="mb-ghcli__openDeps"
                :append-icon="mdiOpenInNew"
                variant="tonal"
                size="small"
                @click="emit('open-dependencies')"
            >
                {{ t("settings.github.ghCli.openDependencies", "Open the System dependencies settings") }}
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
                        :placeholder="t('settings.github.ghCli.searchHint', 'a login, a host, or a permission')"
                        :sample="sample"
                        :summary="summary"
                    />
                </div>

                <p v-if="searchVisible && visible.length === 0" class="mb-ghcli__note mb-ghcli__empty">
                    {{ t("settings.github.ghCli.emptySearch", "Nothing here matches that search. Clearing it brings the whole list back.") }}
                </p>

                <div
                    v-else
                    class="mb-ghcli__list"
                    role="listbox"
                    :aria-label="t('settings.github.ghCli.listLabel', 'gh command-line tool accounts')"
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
                                        <v-icon :icon="mdiAlertCircleOutline" start aria-hidden="true" />
                                        {{ t("settings.github.ghCli.unhealthy", "gh reports a problem with this account") }}
                                    </v-chip>
                                    <span class="mb-ghcli__login">{{ account.login }}</span>
                                    <v-chip size="small" variant="outlined">{{ account.host }}</v-chip>
                                </div>

                                <dl class="mb-ghcli__facts">
                                    <div class="mb-ghcli__fact">
                                        <dt>{{ t("settings.github.ghCli.field.source", "Signed in with") }}</dt>
                                        <dd>{{ account.tokenSource ?? "-" }}</dd>
                                    </div>
                                    <div class="mb-ghcli__fact">
                                        <dt>{{ t("settings.github.ghCli.field.protocol", "Git protocol") }}</dt>
                                        <dd>{{ account.gitProtocol ?? "-" }}</dd>
                                    </div>
                                    <div class="mb-ghcli__fact mb-ghcli__fact--wide">
                                        <dt>{{ t("settings.github.ghCli.field.scopes", "Permissions") }}</dt>
                                        <dd>
                                            <template v-if="account.scopesReported && account.scopes.length > 0">
                                                {{ account.scopes.join(", ") }}
                                            </template>
                                            <template v-else>
                                                {{ t("settings.github.ghCli.noScopes", "Not reported by this token") }}
                                            </template>
                                        </dd>
                                    </div>
                                </dl>

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
                                        {{ t("settings.github.ghCli.terminalOnlyExplainer", "gh cannot be signed in from inside this application - it asks for a code interactively, so it can only be run in your own terminal.") }}
                                    </p>
                                    <p v-if="!account.active" class="mb-ghcli__note">
                                        {{ t("settings.github.ghCli.refreshNeedsActiveNote", "gh can only refresh the active account's scopes, so switch to this account first if it is not already active.") }}
                                    </p>
                                    <div class="mb-ghcli__command">
                                        <label class="mb-ghcli__commandLabel">{{ t("settings.github.ghCli.refreshCommandLabel", "Run this in a terminal to add the missing scopes") }}</label>
                                        <code class="mb-ghcli__commandText">{{ refreshCommandFor(account) }}</code>
                                        <v-btn
                                            v-if="clipboardAvailable"
                                            :prepend-icon="mdiContentCopy"
                                            variant="text"
                                            size="small"
                                            @click="copyCommand(refreshCommandFor(account), `refresh-${keyOf(account)}`)"
                                        >
                                            {{
                                                copiedKey === `refresh-${keyOf(account)}`
                                                    ? t("settings.github.ghCli.commandCopied", "Copied.")
                                                    : t("settings.github.ghCli.copyCommand", "Copy the command")
                                            }}
                                        </v-btn>
                                    </div>
                                </v-alert>
                            </div>

                            <div class="mb-ghcli__actions" role="group" :aria-label="account.login">
                                <v-btn
                                    :prepend-icon="mdiSwapHorizontal"
                                    variant="text"
                                    size="small"
                                    :loading="state.busyKey.value === keyOf(account)"
                                    :disabled="
                                        account.active ||
                                        !state.canSwitch ||
                                        (state.busyKey.value !== null && state.busyKey.value !== keyOf(account))
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

            <!--
                Adding an account, or an unrecognised answer: both are a command to name, a
                copy button, and a Check again - never a button that tries to run gh itself.
            -->
            <div class="mb-ghcli__addAccount">
                <p class="mb-ghcli__note">
                    {{ t("settings.github.ghCli.terminalOnlyExplainer", "gh cannot be signed in from inside this application - it asks for a code interactively, so it can only be run in your own terminal.") }}
                </p>
                <div class="mb-ghcli__command">
                    <label class="mb-ghcli__commandLabel">
                        <v-icon :icon="mdiConsole" size="small" aria-hidden="true" />
                        {{ t("settings.github.ghCli.addAccountCommandLabel", "Run this in a terminal to add an account") }}
                    </label>
                    <code class="mb-ghcli__commandText">{{ addAccountCommand }}</code>
                    <v-btn
                        v-if="clipboardAvailable"
                        :prepend-icon="mdiContentCopy"
                        variant="text"
                        size="small"
                        @click="copyCommand(addAccountCommand, 'add-account')"
                    >
                        {{
                            copiedKey === "add-account"
                                ? t("settings.github.ghCli.commandCopied", "Copied.")
                                : t("settings.github.ghCli.copyCommand", "Copy the command")
                        }}
                    </v-btn>
                </div>
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

.mb-ghcli__command {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
}

.mb-ghcli__commandLabel {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    flex-basis: 100%;
}

.mb-ghcli__commandText {
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
}

.mb-ghcli__addAccount {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
</style>
