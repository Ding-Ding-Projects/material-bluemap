<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAccountMultiplePlus,
    mdiCheckCircle,
    mdiLogoutVariant,
    mdiRefresh,
    mdiSwapHorizontal,
} from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VProgressLinear } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { formatTimestamp } from "./githubAccount.js";
import { accountSearchText, type GitHubAccountsListState } from "./githubAccountsStore.js";
import type { GitHubAccountSummaryReadout } from "./githubBridge.js";

/**
 * Every GitHub account this computer has stored, as a listbox.
 *
 * Modelled on `../project/ProjectList.vue`, the other listbox-with-its-own-search in this
 * application: same roving tabindex, same `role="listbox"`/`role="option"` pair, and the
 * same rule that a row's own action buttons sit beside its option rather than inside it -
 * ARIA forbids an interactive descendant of an option, and a screen reader that finds one
 * announces the row and its button as one unusable thing.
 *
 * It differs from that list in one way that matters: this is single-select, not
 * multi-select. Exactly one account is active at a time, `aria-selected` says which, and
 * activating a row (by Enter, by Space, or by its own "Make active" button) switches to it
 * rather than toggling a checkbox.
 *
 * A build whose preload predates multi-account support never mounts this at all - see
 * `GitHubAccountRow.vue`, which falls back to the single-account facts it always showed.
 */
const props = defineProps<{
    list: GitHubAccountsListState;
    /** True when the existing sign-in surface can be opened to add another account. */
    canAdd: boolean;
    /** True while that sign-in surface is open for adding an account. */
    adding: boolean;
}>();

const emit = defineEmits<{
    "add-account": [];
    "close-add": [];
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

const ordered = computed(() =>
    [...state.accounts.value].sort((a, b) => a.login.localeCompare(b.login)),
);

const visible = computed(() =>
    ordered.value.filter((account) => matcher.value.test(accountSearchText(account))),
);

const sample = computed(() => ordered.value.map((account) => accountSearchText(account)).join("\n"));

const summary = computed(() => {
    if (matcher.value.error !== null) {
        return t("config.search.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    if (!matcher.value.active) return "";
    return t(
        "settings.github.accounts.searchSummary",
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

function optionId(id: string): string {
    return `${uid}-account-${encodeURIComponent(id)}`;
}

const focusedId = ref<string | null>(null);

const visibleIds = computed(() => visible.value.map((account) => account.id));

/**
 * Which row holds the list's single tab stop, exactly as `ProjectList.vue`'s own
 * `rovingWorld` works: one stop for the whole listbox, moved onto a row that is really on
 * screen rather than left pointing at one a search just hid.
 */
const rovingId = computed<string | null>(() => {
    const ids = visibleIds.value;
    if (focusedId.value !== null && ids.includes(focusedId.value)) return focusedId.value;
    return ids[0] ?? null;
});

function focusOption(id: string): void {
    focusedId.value = id;
    void nextTick(() => document.getElementById(optionId(id))?.focus());
}

function noteFocus(id: string): void {
    focusedId.value = id;
}

function onOptionKeydown(event: KeyboardEvent, account: GitHubAccountSummaryReadout): void {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        void state.setActive(account.id);
        return;
    }

    const ids = visibleIds.value;
    const here = ids.indexOf(account.id);
    if (here === -1) return;

    let wanted: number;
    if (event.key === "ArrowDown") wanted = here + 1;
    else if (event.key === "ArrowUp") wanted = here - 1;
    else if (event.key === "Home") wanted = 0;
    else if (event.key === "End") wanted = ids.length - 1;
    else return;

    event.preventDefault();
    const target = ids[Math.min(Math.max(wanted, 0), ids.length - 1)];
    if (target !== undefined) focusOption(target);
}

/* -------------------------------------------------------------------------- */
/* Per-row sign-out, confirmed inline before it runs                          */
/* -------------------------------------------------------------------------- */

const confirmingId = ref<string | null>(null);

function askToSignOut(id: string): void {
    confirmingId.value = id;
}

function keepSignedIn(): void {
    confirmingId.value = null;
}

async function confirmSignOut(id: string): Promise<void> {
    confirmingId.value = null;
    await state.removeAccount(id);
}

/* -------------------------------------------------------------------------- */
/* What the last removal actually did                                        */
/* -------------------------------------------------------------------------- */

const removeReportText = computed(() => {
    const report = state.removeReport.value;
    if (report === null) return null;
    if (!report.report.removed) return null;
    if (report.report.fallbackAccount !== null) {
        return t(
            "settings.github.accounts.removedFallback",
            { login: report.report.fallbackAccount.login },
            "That account is signed out. {login} is now the active account.",
        );
    }
    return t(
        "settings.github.accounts.removedNone",
        "That account is signed out, and no other account is stored. Nobody is signed in now.",
    );
});

/**
 * Whether the removal above actually revoked the token, said separately from what became
 * active afterwards - the same security-critical distinction `GitHubAccountRow.vue`'s
 * single-account flow already makes with `settings.github.revoked` / `notRevoked`. Rounding
 * this into the fallback/none message above would tell somebody a token is dead everywhere
 * when GitHub only confirmed it was forgotten here.
 */
const revokedStatusText = computed(() => {
    const report = state.removeReport.value;
    if (report === null || !report.report.removed) return null;
    return report.report.revoked
        ? t(
              "settings.github.accounts.revoked",
              "GitHub confirmed the token was revoked, so it works nowhere any more.",
          )
        : t(
              "settings.github.accounts.notRevoked",
              "The token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
          );
});

function timestamp(value: string | null): string | null {
    return formatTimestamp(value, "en");
}
</script>

<template>
    <div class="mb-accounts">
        <div class="mb-accounts__head">
            <h3 class="mb-accounts__title">
                {{ t("settings.github.accounts.title", "Signed-in accounts") }}
            </h3>
            <v-btn
                v-if="canAdd"
                class="mb-accounts__add"
                :prepend-icon="mdiAccountMultiplePlus"
                variant="tonal"
                size="small"
                :aria-pressed="adding ? 'true' : 'false'"
                @click="adding ? emit('close-add') : emit('add-account')"
            >
                {{
                    adding
                        ? t("settings.github.accounts.closeAdd", "Close")
                        : t("settings.github.accounts.addAccount", "Add account")
                }}
            </v-btn>
        </div>

        <v-progress-linear v-if="state.loading.value" indeterminate color="primary" class="mb-2" />

        <v-alert
            v-if="state.listFailure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-accounts__alert"
        >
            {{ state.listFailure.value }}
        </v-alert>

        <v-alert
            v-if="state.actionFailure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-accounts__alert"
        >
            {{ state.actionFailure.value }}
        </v-alert>

        <p
            v-if="removeReportText !== null"
            class="mb-accounts__report"
            role="status"
            aria-live="polite"
        >
            {{ removeReportText }}
        </p>

        <p
            v-if="revokedStatusText !== null"
            class="mb-accounts__report mb-accounts__revoked"
            role="status"
            aria-live="polite"
        >
            {{ revokedStatusText }}
        </p>

        <template v-if="state.hasAccounts.value">
            <div v-if="searchVisible" class="mb-accounts__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('settings.github.accounts.searchLabel', 'Search accounts')"
                    :placeholder="t('settings.github.accounts.searchHint', 'a login, or a permission')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <div
                class="mb-accounts__list"
                role="listbox"
                :aria-label="t('settings.github.accounts.listLabel', 'Signed-in GitHub accounts')"
            >
                <div
                    v-for="account in visible"
                    :key="account.id"
                    class="mb-accounts__rowhost"
                >
                    <div class="mb-accounts__row">
                        <div
                            :id="optionId(account.id)"
                            class="mb-accounts__option"
                            role="option"
                            :aria-selected="account.active ? 'true' : 'false'"
                            :tabindex="rovingId === account.id ? 0 : -1"
                            @keydown="onOptionKeydown($event, account)"
                            @focus="noteFocus(account.id)"
                            @click="state.setActive(account.id)"
                        >
                            <div class="mb-accounts__optionHead">
                                <v-chip
                                    v-if="account.active"
                                    color="success"
                                    size="small"
                                    variant="tonal"
                                    class="mb-accounts__activeChip"
                                >
                                    <v-icon :icon="mdiCheckCircle" start aria-hidden="true" />
                                    {{ t("settings.github.accounts.active", "Active") }}
                                </v-chip>
                                <span class="mb-accounts__login">
                                    {{ account.login
                                    }}<template v-if="account.name !== null"> ({{ account.name }})</template>
                                </span>
                            </div>
                            <dl class="mb-accounts__facts">
                                <div class="mb-accounts__fact">
                                    <dt>{{ t("settings.github.field.source", "Signed in with") }}</dt>
                                    <dd>{{ account.source }}</dd>
                                </div>
                                <div v-if="timestamp(account.signedInAt) !== null" class="mb-accounts__fact">
                                    <dt>{{ t("settings.github.field.since", "Since") }}</dt>
                                    <dd>{{ timestamp(account.signedInAt) }}</dd>
                                </div>
                                <div class="mb-accounts__fact mb-accounts__fact--wide">
                                    <dt>{{ t("settings.github.field.scopes", "Permissions") }}</dt>
                                    <dd>
                                        <template v-if="account.scopesReported && account.scopes.length > 0">
                                            {{ account.scopes.join(", ") }}
                                        </template>
                                        <template v-else-if="account.scopesReported">
                                            {{ t("settings.github.noScopes", "None granted") }}
                                        </template>
                                        <template v-else>
                                            {{
                                                t(
                                                    "settings.github.scopesNotReported",
                                                    "This kind of token reports no scope list. Its permissions live on the application and on the repositories it was given.",
                                                )
                                            }}
                                        </template>
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div
                            class="mb-accounts__actions"
                            role="group"
                            :aria-label="account.login"
                        >
                            <v-btn
                                :prepend-icon="mdiSwapHorizontal"
                                variant="text"
                                size="small"
                                :disabled="account.active || state.busyId.value === account.id || !state.canSetActive"
                                @click.stop="state.setActive(account.id)"
                            >
                                {{ t("settings.github.accounts.setActive", "Make active") }}
                            </v-btn>
                            <v-btn
                                :prepend-icon="mdiRefresh"
                                variant="text"
                                size="small"
                                :loading="state.busyId.value === account.id"
                                :disabled="!state.canRefresh || (state.busyId.value !== null && state.busyId.value !== account.id)"
                                @click.stop="state.refreshAccount(account.id)"
                            >
                                {{ t("settings.github.accounts.refresh", "Refresh") }}
                            </v-btn>
                            <v-btn
                                v-if="confirmingId !== account.id"
                                class="mb-accounts__signout"
                                :prepend-icon="mdiLogoutVariant"
                                variant="text"
                                size="small"
                                :disabled="!state.canRemove || (state.busyId.value !== null && state.busyId.value !== account.id)"
                                @click.stop="askToSignOut(account.id)"
                            >
                                {{ t("settings.github.accounts.signOut", "Sign out") }}
                            </v-btn>
                        </div>

                        <div
                            v-if="confirmingId === account.id"
                            class="mb-accounts__confirm"
                            role="group"
                            :aria-label="t('settings.github.accounts.confirmSignOutTitle', 'Confirm signing out')"
                        >
                            <p class="mb-accounts__confirmText">
                                {{
                                    t(
                                        "settings.github.accounts.confirmSignOutBody",
                                        "Signing this account out deletes its stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing this account in again issues a new token.",
                                    )
                                }}
                            </p>
                            <div class="mb-accounts__confirmActions">
                                <v-btn
                                    class="mb-accounts__confirmSignout"
                                    variant="tonal"
                                    color="error"
                                    size="small"
                                    :loading="state.busyId.value === account.id"
                                    @click.stop="confirmSignOut(account.id)"
                                >
                                    {{ t("settings.github.accounts.confirmSignOut", "Sign out and revoke") }}
                                </v-btn>
                                <v-btn
                                    class="mb-accounts__keep"
                                    variant="text"
                                    size="small"
                                    @click.stop="keepSignedIn"
                                >
                                    {{ t("settings.github.accounts.keepSignedIn", "Keep this account") }}
                                </v-btn>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <template v-else-if="!state.loading.value">
            <p class="mb-accounts__empty">
                {{
                    t(
                        "settings.github.accounts.empty",
                        "No accounts are signed in on this computer. Signing in is optional; public worlds and public releases work without it.",
                    )
                }}
            </p>
        </template>
    </div>
</template>

<style>
.mb-accounts {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-accounts__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.mb-accounts__title {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.02em;
}

.mb-accounts__empty {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-accounts__report {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-accounts__alert,
.mb-accounts__report {
    overflow-wrap: anywhere;
}

.mb-accounts__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-accounts__rowhost {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 12px;
    overflow: hidden;
}

.mb-accounts__row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
}

.mb-accounts__option {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 8px;
    outline-offset: 2px;
    cursor: pointer;
}

.mb-accounts__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
}

.mb-accounts__optionHead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-accounts__login {
    font-weight: 600;
    overflow-wrap: anywhere;
}

.mb-accounts__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 4px 16px;
    margin: 0;
}

.mb-accounts__fact--wide {
    grid-column: 1 / -1;
}

.mb-accounts__fact > dt {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-accounts__fact > dd {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.mb-accounts__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.mb-accounts__confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-error), 0.4);
    background: rgba(var(--v-theme-error), 0.06);
}

.mb-accounts__confirmText {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-accounts__confirmActions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
