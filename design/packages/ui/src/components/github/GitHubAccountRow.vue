<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VDivider, VIcon } from "vuetify/components";
import { mdiOpenInNew } from "@mdi/js";
import { githubSectionCopy } from "../settings/settingsCopy.js";
import GhCliAccountsList from "./GhCliAccountsList.vue";
import GitHubAccountsList from "./GitHubAccountsList.vue";
import GitHubDeviceFlowPanel from "./GitHubDeviceFlowPanel.vue";
import GitHubStatusRow from "./GitHubStatusRow.vue";
import GitHubTokenForm from "./GitHubTokenForm.vue";
import type { GitHubAccountState } from "./githubAccount.js";
import { createGitHubAccountsList } from "./githubAccountsStore.js";
import { createGhCliAccountsStore } from "./ghCliAccountsStore.js";

/**
 * The GitHub sign-in section of the settings surface.
 *
 * It composes three things and decides which of them a given build may show: the account
 * as it stands, the browser sign-in, and the pasted-token sign-in. Each is behind its own
 * feature detection rather than one blanket check, because the preload's methods can
 * arrive separately — a released shell can load a newer renderer than the one it was built
 * beside — and half a bridge should cost the half of the section that needs it, not all
 * of it.
 *
 * A host with no preload at all, which is what a browser tab is, gets one sentence saying
 * this build cannot sign in, and no control whatsoever. That is the honest shape: the
 * credential lives in the main process, so without one there is nothing to sign in *with*,
 * and a Sign in button that throws when it is pressed is worse than a sentence explaining
 * why there is no button.
 *
 * Signing in is optional and the section says so in every state. Public worlds render and
 * public releases download with nobody signed in at all; this is for the private ones.
 */
const props = defineProps<{ account: GitHubAccountState }>();

const emit = defineEmits<{
    /** Bubbled up so a settings screen can jump to its own System dependencies section. */
    "open-dependencies": [];
}>();

const { t } = useI18n();

const state = props.account;

/**
 * The `gh` command-line tool's OWN accounts - a completely separate store from `state`
 * above. Loaded independently and shown as its own section further down, never merged into
 * the list above it.
 */
const ghCli = createGhCliAccountsStore();
onMounted(() => {
    if (ghCli.canList) void ghCli.load();
});

/**
 * Every stored account, on top of `state` rather than instead of it.
 *
 * `state` stays "who is signed in right now" - the account every legacy render, download
 * and status read resolves to - and this is the collection behind it. A build whose
 * preload predates multi-account support has `accountsList.canList === false`, and the
 * template below falls back to exactly the single-account facts this row always showed.
 */
const accountsList = createGitHubAccountsList();
onMounted(() => {
    if (accountsList.canList) void accountsList.load();
});
onBeforeUnmount(() => accountsList.dispose());

/**
 * Whether the existing sign-in surface is open to add another account on top of whoever
 * is already signed in, rather than to sign in from empty.
 *
 * The device-flow and pasted-token panels below are the same ones a fresh sign-in always
 * used; on a build that can list accounts, opening them while already signed in is what
 * "Add account" means; the main process's own sign-in channels add and activate the new
 * account rather than replacing the one already there, so no separate "add" flow exists.
 */
const addingAccount = ref(false);

function startAddingAccount(): void {
    addingAccount.value = true;
    state.dismissOutcome();
}

async function closeAddingAccount(): Promise<void> {
    // A device flow that is still starting or waiting on GitHub is still polling in the
    // main process; hiding this panel without telling it to stop would leave that poll
    // running with its only Cancel button gone. Closing mid-flight cancels first, and
    // `dismissOutcome()` is what actually resets `phase` back to idle - it is a deliberate
    // no-op while `waiting` is true, so it does nothing until the cancellation has landed.
    if (state.waiting.value) await state.cancelSignIn();
    addingAccount.value = false;
    state.dismissOutcome();
}

// The device flow finishing while "Add account" is open is exactly the moment adding is
// done; the panel closes itself rather than leaving the sign-in form sitting open beside
// the account it just added.
watch(
    () => state.phase.value,
    (phase) => {
        if (phase === "signed-in" && addingAccount.value) addingAccount.value = false;
    },
);

const copy = computed(() => githubSectionCopy(t));

/**
 * Both routes are offered when nobody is signed in at all, which is unchanged; on a build
 * that can list accounts they are also offered while "Add account" is open, on top of
 * whoever is already signed in.
 */
const offersSignIn = computed(
    () => (!state.signedIn.value || addingAccount.value) && (state.canDeviceSignIn || state.canUseToken),
);

const showsBoth = computed(
    () => offersSignIn.value && state.canDeviceSignIn && state.canUseToken,
);

const report = computed(() => state.signOutReport.value);
</script>

<template>
    <div class="mb-github">
        <!--
            No preload: nothing here can work, so nothing here is drawn. Not styled as an
            error, because nothing failed — the question simply cannot be put from here.
        -->
        <template v-if="!state.supported">
            <v-alert
                type="info"
                variant="tonal"
                density="comfortable"
                role="status"
                class="mb-github__alert mb-github__unsupported"
            >
                {{ copy.unsupported }}
            </v-alert>
            <p class="mb-github__note">{{ copy.whatItIsFor }}</p>
        </template>

        <template v-else>
            <p class="mb-github__note">{{ copy.whatItIsFor }}</p>

            <v-alert
                v-if="state.statusFailure.value !== null"
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
                class="mb-github__alert mb-github__statusFailure"
            >
                {{ state.statusFailure.value }}
            </v-alert>

            <!--
                Said before somebody signs in rather than after: a machine with no
                credential store cannot keep a sign-in, and finding that out at the next
                launch is finding it out too late to have chosen differently.
            -->
            <v-alert
                v-if="
                    !state.signedIn.value &&
                    state.status.value !== null &&
                    !state.status.value.encryptionAvailable
                "
                type="warning"
                variant="tonal"
                density="comfortable"
                role="status"
                class="mb-github__alert mb-github__noStore"
            >
                {{
                    t(
                        "settings.github.noCredentialStore",
                        "This computer has no credential store the app can use, so a sign-in will last only until the app closes.",
                    )
                }}
            </v-alert>

            <GitHubAccountsList
                v-if="accountsList.canList"
                class="mb-github__accounts"
                :list="accountsList"
                :can-add="state.canDeviceSignIn || state.canUseToken"
                :adding="addingAccount"
                @add-account="startAddingAccount"
                @close-add="closeAddingAccount"
            />

            <GitHubStatusRow v-if="state.signedIn.value" :account="state" />

            <p v-else-if="!accountsList.canList" class="mb-github__note mb-github__signedOut">
                {{ copy.signedOut }}
            </p>

            <!--
                What signing out actually managed to do. `revoked` is true only when GitHub
                confirmed it, so the two outcomes are said differently and the one that
                leaves work undone carries the link that finishes it.

                The legacy single-account channel now falls back to another stored account
                rather than always leaving nobody signed in - `report.fallbackAccount` names
                who, exactly the fact `GitHubAccountsList.vue`'s own removal report keeps
                separate for the same reason. Saying "Signed out" unconditionally here would
                sit directly beside the "Signed in" card `GitHubStatusRow` draws for that
                fallback account a few lines above, so the two are told apart rather than
                rounded into one message.
            -->
            <template v-if="report !== null">
                <template v-if="report.fallbackAccount !== null">
                    <p class="mb-github__note mb-github__signOutReport" role="status" aria-live="polite">
                        {{
                            t(
                                "settings.github.accounts.removedFallback",
                                { login: report.fallbackAccount.login },
                                "That account is signed out. {login} is now the active account.",
                            )
                        }}
                    </p>
                    <p class="mb-github__note mb-github__signOutRevoked" role="status" aria-live="polite">
                        {{
                            report.revoked
                                ? t(
                                      "settings.github.accounts.revoked",
                                      "GitHub confirmed the token was revoked, so it works nowhere any more.",
                                  )
                                : t(
                                      "settings.github.accounts.notRevoked",
                                      "The token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
                                  )
                        }}
                    </p>
                </template>
                <p v-else class="mb-github__note mb-github__signOutReport" role="status" aria-live="polite">
                    {{
                        report.revoked
                            ? t(
                                  "settings.github.revoked",
                                  "Signed out. GitHub confirmed the token was revoked, so it works nowhere any more.",
                              )
                            : t(
                                  "settings.github.notRevoked",
                                  "Signed out, and the token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
                              )
                    }}
                </p>
                <p v-if="report.reason !== null" class="mb-github__note">{{ report.reason }}</p>
                <p v-if="report.manageUrl !== null" class="mb-github__note">
                    <a
                        class="mb-github__link"
                        :href="report.manageUrl"
                        target="_blank"
                        rel="noreferrer noopener"
                    >
                        {{ t("settings.github.manageAccess", "Review this app's access on GitHub") }}
                        <v-icon :icon="mdiOpenInNew" size="small" aria-hidden="true" />
                    </a>
                </p>
            </template>

            <template v-if="offersSignIn">
                <GitHubDeviceFlowPanel v-if="state.canDeviceSignIn" :account="state" />

                <v-divider v-if="showsBoth" class="mb-github__divider" />

                <p v-if="showsBoth" class="mb-github__or">
                    {{ t("settings.github.orToken", "Or sign in with a token instead") }}
                </p>

                <GitHubTokenForm v-if="state.canUseToken" :account="state" />
            </template>

            <!--
                A second, deliberately separate section: the gh command-line tool's OWN
                accounts, not this application's. `ghCli.canList` is its own feature
                detection - a build whose preload predates this support simply omits the
                section, the same rule `GitHubAccountsList` above already follows.
            -->
            <v-divider class="mb-github__divider" />
            <GhCliAccountsList
                v-if="ghCli.canList"
                class="mb-github__ghcli"
                :list="ghCli"
                @open-dependencies="emit('open-dependencies')"
            />
        </template>
    </div>
</template>

<style>
.mb-github {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-github__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-github__or {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-github__divider {
    margin-block: 4px;
}

.mb-github__link {
    color: rgb(var(--v-theme-primary));
    overflow-wrap: anywhere;
}

.mb-github__alert {
    overflow-wrap: anywhere;
}

.mb-github__accounts {
    margin-block-end: 4px;
}

.mb-github__ghcli {
    margin-block-start: 4px;
}
</style>
