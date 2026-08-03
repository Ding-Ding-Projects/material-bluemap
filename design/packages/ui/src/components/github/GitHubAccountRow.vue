<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VDivider, VIcon } from "vuetify/components";
import { mdiOpenInNew } from "@mdi/js";
import { githubSectionCopy } from "../settings/settingsCopy.js";
import GitHubDeviceFlowPanel from "./GitHubDeviceFlowPanel.vue";
import GitHubStatusRow from "./GitHubStatusRow.vue";
import GitHubTokenForm from "./GitHubTokenForm.vue";
import type { GitHubAccountState } from "./githubAccount.js";

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

const { t } = useI18n();

const state = props.account;

const copy = computed(() => githubSectionCopy(t));

/** Both routes are hidden once somebody is signed in; the row's action is signing out. */
const offersSignIn = computed(
    () => !state.signedIn.value && (state.canDeviceSignIn || state.canUseToken),
);

const showsBoth = computed(
    () => !state.signedIn.value && state.canDeviceSignIn && state.canUseToken,
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

            <GitHubStatusRow v-if="state.signedIn.value" :account="state" />

            <p v-else class="mb-github__note mb-github__signedOut">{{ copy.signedOut }}</p>

            <!--
                What signing out actually managed to do. `revoked` is true only when GitHub
                confirmed it, so the two outcomes are said differently and the one that
                leaves work undone carries the link that finishes it.
            -->
            <template v-if="report !== null">
                <p class="mb-github__note mb-github__signOutReport" role="status" aria-live="polite">
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
</style>
