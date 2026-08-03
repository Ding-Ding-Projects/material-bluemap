<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VChip, VIcon } from "vuetify/components";
import { mdiCheckCircleOutline, mdiLogoutVariant } from "@mdi/js";
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
 * Signing out is confirmed, and the confirmation is inline rather than a dialog. It is a
 * decision worth pausing over: the credential is deleted from this computer and GitHub is
 * asked to revoke the token, which is not undone by signing in again — the next sign-in
 * issues a new one. But it destroys no map, no file and no setting, so the ceremony
 * reserved for irreversible deletion would be teaching people to click through ceremony,
 * and a modal would halt an application that has no reason to stop.
 *
 * What the confirmation promises is exactly what the main process can deliver: the stored
 * credential is deleted, and revocation is *attempted*. A desktop application holds no
 * client secret and GitHub's revocation endpoint wants one, so the report afterwards says
 * whether GitHub actually confirmed it rather than assuming it did.
 */
const props = defineProps<{ account: GitHubAccountState }>();

const { t, locale } = useI18n();

const state = props.account;

const confirming = ref(false);
const confirmButton = ref<InstanceType<typeof VBtn> | null>(null);
const signOutButton = ref<InstanceType<typeof VBtn> | null>(null);

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
 * Focuses a Vuetify button through its root element.
 *
 * `$el` is the rendered `<button>` here, and the optional call is what keeps jsdom — where
 * a component may render before layout exists — from turning a focus move into a thrown
 * exception that costs the rest of the handler.
 */
function focusButton(button: InstanceType<typeof VBtn> | null): void {
    const element: unknown = button?.$el;
    if (element instanceof HTMLElement) element.focus();
}

async function askToSignOut(): Promise<void> {
    confirming.value = true;
    // Focus follows the decision, or the next keystroke goes to a button that has just
    // been replaced by the question it asked.
    await nextTick();
    focusButton(confirmButton.value);
}

async function keepSignedIn(): Promise<void> {
    confirming.value = false;
    await nextTick();
    focusButton(signOutButton.value);
}

function onSignOut(): void {
    if (state.signingOut.value) return;
    confirming.value = false;
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
            <v-btn
                v-if="!confirming"
                ref="signOutButton"
                class="mb-github-status__signout"
                :prepend-icon="mdiLogoutVariant"
                variant="tonal"
                :disabled="state.signingOut.value"
                :loading="state.signingOut.value"
                @click="askToSignOut"
            >
                {{ t("settings.github.signOut", "Sign out") }}
            </v-btn>
        </div>

        <!--
            Anchored beside the control it belongs to, not a dialog over the app. It states
            both halves of what will happen, including the half that is only attempted.
        -->
        <div
            v-if="confirming"
            class="mb-github-status__confirm"
            role="group"
            :aria-label="t('settings.github.confirmTitle', 'Confirm signing out')"
        >
            <p class="mb-github-status__confirmText">
                {{
                    t(
                        "settings.github.confirmBody",
                        "Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.",
                    )
                }}
            </p>
            <div class="mb-github-status__actions">
                <v-btn
                    ref="confirmButton"
                    class="mb-github-status__confirmSignout"
                    variant="tonal"
                    color="error"
                    :disabled="state.signingOut.value"
                    :loading="state.signingOut.value"
                    @click="onSignOut"
                >
                    {{ t("settings.github.confirmSignOut", "Sign out and revoke") }}
                </v-btn>
                <v-btn class="mb-github-status__keep" variant="text" @click="keepSignedIn">
                    {{ t("settings.github.keepSignedIn", "Stay signed in") }}
                </v-btn>
            </div>
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

.mb-github-status__confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-error), 0.4);
    background: rgba(var(--v-theme-error), 0.06);
}

.mb-github-status__confirmText {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-github-status__alert {
    overflow-wrap: anywhere;
}
</style>
