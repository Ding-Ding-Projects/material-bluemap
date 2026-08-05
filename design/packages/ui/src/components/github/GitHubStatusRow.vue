<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VChip, VIcon } from "vuetify/components";
import { mdiCheckCircleOutline, mdiLogoutVariant } from "@mdi/js";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { formatTimestamp, type GitHubAccountState } from "./githubAccount.js";

/**
 * Who is signed in, and the one control that changes it.
 *
 * The facts are the ones that answer a real question later. `persisted` is the important
 * one: a sign-in the credential store refused lasts until the app closes, and the only
 * moment that difference shows up on its own is the next launch, when somebody is signed
 * out again with no idea why. So it is said now, in the row, rather than discovered then.
 * An account whose token reports no scopes — a GitHub App token, a fine-grained personal
 * access token — says exactly that, because an empty list rendered as "no permissions"
 * would be a fact this app cannot actually establish.
 *
 * Signing out is destructive and irreversible in the sense the shared super-confirmation
 * gate exists for: the credential is deleted from this computer and GitHub is asked to
 * revoke the token, which is not undone by signing in again — the next sign-in issues a new
 * one. It destroys no map, no file and no setting, but it is a real credential revocation
 * against a real account, so it sits behind `ConfigSuperConfirm`, the same anchored two-key
 * gate every other destructive control in this application uses, rather than a bespoke
 * inline confirmation that looked like enough but was not the contract's gate.
 *
 * What the confirmation promises is exactly what the main process can deliver: the stored
 * credential is deleted, and revocation is *attempted*. A desktop application holds no
 * client secret and GitHub's revocation endpoint wants one, so the report afterwards says
 * whether GitHub actually confirmed it rather than assuming it did.
 */
const props = defineProps<{ account: GitHubAccountState }>();

const { t, locale } = useI18n();

const state = props.account;

const account = computed(() => state.account.value);

const signedInAt = computed(() => formatTimestamp(account.value?.signedInAt ?? null, locale.value));

const expiresAt = computed(() => formatTimestamp(account.value?.expiresAt ?? null, locale.value));

const sourceLabel = computed(() => {
    switch (account.value?.source) {
        case "github-app":
            return t("settings.github.source.app", "GitHub App");
        case "oauth-app":
            return t("settings.github.source.oauth", "OAuth application");
        case "personal-access-token":
            return t("settings.github.source.token", "Personal access token");
        default:
            return "";
    }
});

/**
 * The gate's `@confirm`, fired only once both keys are on and the slider has travelled its
 * whole range. `ConfigSuperConfirm` owns opening, closing, Escape/Emergency-exit and
 * returning focus to the button that opened it; this is only the action itself.
 */
function onSignOut(): void {
    if (state.signingOut.value) return;
    void state.signOut();
}
</script>

<template>
    <div v-if="account !== null" class="mb-github-status">
        <div class="mb-github-status__header">
            <v-chip color="success" size="small" variant="tonal" class="mb-github-status__chip">
                <v-icon :icon="mdiCheckCircleOutline" start aria-hidden="true" />
                {{ t("settings.github.signedIn", "Signed in") }}
            </v-chip>
        </div>

        <dl class="mb-github-status__facts">
            <div class="mb-github-status__fact">
                <dt>{{ t("settings.github.field.account", "Account") }}</dt>
                <dd>
                    {{ account.login
                    }}<template v-if="account.name !== null"> ({{ account.name }})</template>
                </dd>
            </div>
            <div class="mb-github-status__fact">
                <dt>{{ t("settings.github.field.source", "Signed in with") }}</dt>
                <dd>{{ sourceLabel }}</dd>
            </div>
            <div v-if="signedInAt !== null" class="mb-github-status__fact">
                <dt>{{ t("settings.github.field.since", "Since") }}</dt>
                <dd>
                    <time :datetime="account.signedInAt">{{ signedInAt }}</time>
                </dd>
            </div>
            <div class="mb-github-status__fact">
                <dt>{{ t("settings.github.field.expires", "Expires") }}</dt>
                <dd>
                    <template v-if="expiresAt !== null">
                        <time :datetime="account.expiresAt ?? undefined">{{ expiresAt }}</time>
                        <template v-if="account.refreshable">
                            {{
                                t(
                                    "settings.github.renews",
                                    "(renewed on its own before it runs out)",
                                )
                            }}
                        </template>
                    </template>
                    <template v-else>
                        {{ t("settings.github.noExpiry", "Does not expire") }}
                    </template>
                </dd>
            </div>
            <div class="mb-github-status__fact mb-github-status__fact--wide">
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

        <!--
            The one that only shows up at the next launch if it is not said here.
        -->
        <v-alert
            v-if="!account.persisted"
            type="warning"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-github-status__alert mb-github-status__unstored"
        >
            {{
                t(
                    "settings.github.notPersisted",
                    "This computer has no credential store the app could use, so this sign-in lasts until the app closes and will have to be done again next time.",
                )
            }}
        </v-alert>

        <ul v-if="account.warnings.length > 0" class="mb-github-status__warnings">
            <li v-for="warning in account.warnings" :key="warning">{{ warning }}</li>
        </ul>

        <div v-if="state.canSignOut" class="mb-github-status__actions">
            <ConfigSuperConfirm
                :title="t('settings.github.confirmTitle', 'Confirm signing out')"
                :action="
                    t(
                        'settings.github.confirmBody',
                        'Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.',
                    )
                "
                :confirm-label="t('settings.github.confirmSignOut', 'Sign out and revoke')"
                :disabled="state.signingOut.value"
                @confirm="onSignOut"
            >
                <template #activator="{ props: activatorProps }">
                    <v-btn
                        v-bind="activatorProps"
                        class="mb-github-status__signout"
                        :prepend-icon="mdiLogoutVariant"
                        variant="tonal"
                        :loading="state.signingOut.value"
                    >
                        {{ t("settings.github.signOut", "Sign out") }}
                    </v-btn>
                </template>
            </ConfigSuperConfirm>
        </div>
    </div>
</template>

<style>
.mb-github-status {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-github-status__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-github-status__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 8px 24px;
    margin: 0;
}

.mb-github-status__fact--wide {
    grid-column: 1 / -1;
}

.mb-github-status__fact > dt {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-github-status__fact > dd {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.mb-github-status__warnings {
    margin: 0;
    padding-inline-start: 1.25rem;
    font-size: 0.75rem;
    line-height: 1.6;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-github-status__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-github-status__actions .v-btn {
    min-height: 40px;
}

.mb-github-status__alert {
    overflow-wrap: anywhere;
}
</style>
