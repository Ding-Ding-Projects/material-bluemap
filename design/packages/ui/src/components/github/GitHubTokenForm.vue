<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VIcon, VTextField } from "vuetify/components";
import { mdiEye, mdiEyeOff, mdiOpenInNew } from "@mdi/js";
import type { GitHubAccountState } from "./githubAccount.js";

/**
 * The other way in: a personal access token, pasted.
 *
 * It exists because the device flow is a POST to github.com that a corporate proxy can
 * and does block, and because plenty of people already hold a token and would rather use
 * the one they have than approve a new grant.
 *
 * **The value goes straight across and is kept nowhere.** It lives in this field while it
 * is being typed, is handed to the main process, and the field is emptied the moment the
 * sign-in is accepted. It is never written to a notice, an error, a log line or a title:
 * the refusal that comes back names what was wrong with the token — unknown to GitHub,
 * missing a permission — and never quotes it, so nothing that could reach a screenshot or
 * a bug report ever carries a credential. The reveal toggle is the one place it can be
 * read, by the person who typed it, on purpose, and it starts hidden.
 *
 * The token is checked against the API on the way in rather than at the first render, so
 * one with the wrong permissions is refused here, in one sentence naming what is missing,
 * instead of two screens later in the middle of a job.
 */
const props = defineProps<{ account: GitHubAccountState }>();

const { t } = useI18n();

const state = props.account;

const token = ref("");
const revealed = ref(false);

const requiredScopes = computed(() => state.status.value?.requiredScopes ?? []);

const missingScopes = computed(() => state.tokenFailure.value?.missingScopes ?? []);

const canSubmit = computed(() => token.value.trim().length > 0 && !state.tokenBusy.value);

async function onSubmit(): Promise<void> {
    // The disabled button is the visible guard, not the real one: a keyboard submit walks
    // straight past it, and signing in twice with the same token is two grants.
    if (!canSubmit.value) return;
    const accepted = await state.signInWithToken(token.value.trim());
    // Emptied on success only. A refusal usually means one character was mistyped, and
    // clearing the field would make somebody paste the whole thing again to find out.
    if (accepted) {
        token.value = "";
        revealed.value = false;
    }
}
</script>

<template>
    <form class="mb-github-token" novalidate @submit.prevent="onSubmit">
        <p class="mb-github-token__note">
            {{
                t(
                    "settings.github.tokenExplain",
                    "A personal access token works instead of the browser sign-in, and is the way in when a network blocks GitHub's device sign-in. It is checked with GitHub before it is accepted.",
                )
            }}
        </p>

        <p v-if="requiredScopes.length > 0" class="mb-github-token__note">
            {{
                t(
                    "settings.github.tokenScopes",
                    { scopes: requiredScopes.join(", ") },
                    "The token needs these permissions: {scopes}.",
                )
            }}
        </p>

        <p class="mb-github-token__note">
            <a
                class="mb-github-token__link"
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer noopener"
            >
                {{ t("settings.github.tokenPage", "Make a token on github.com") }}
                <v-icon :icon="mdiOpenInNew" size="small" aria-hidden="true" />
            </a>
        </p>

        <div class="mb-github-token__row">
            <v-text-field
                v-model="token"
                class="mb-github-token__field"
                :type="revealed ? 'text' : 'password'"
                :label="t('settings.github.tokenField', 'Personal access token')"
                :disabled="state.tokenBusy.value"
                variant="outlined"
                density="comfortable"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
            />
            <div class="mb-github-token__actions">
                <!--
                    A real button rather than an icon inside the field: Vuetify's inner
                    adornment is not in the tab order, and a control only a mouse can reach
                    is the kind of thing that turns "show what I typed" into "retype it".
                -->
                <v-btn
                    class="mb-github-token__reveal"
                    :icon="revealed ? mdiEyeOff : mdiEye"
                    variant="text"
                    :aria-pressed="revealed"
                    :aria-label="
                        revealed
                            ? t('settings.github.hideToken', 'Hide the token')
                            : t('settings.github.showToken', 'Show the token')
                    "
                    @click="revealed = !revealed"
                />
                <v-btn
                    class="mb-github-token__submit"
                    type="submit"
                    variant="tonal"
                    :disabled="!canSubmit"
                    :loading="state.tokenBusy.value"
                >
                    {{ t("settings.github.tokenSubmit", "Sign in with this token") }}
                </v-btn>
            </div>
        </div>

        <!--
            The main process's own sentence, shown as written. It names what was wrong with
            the token and never quotes the token itself.
        -->
        <v-alert
            v-if="state.tokenFailure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-github-token__alert"
        >
            {{ state.tokenFailure.value.message }}
        </v-alert>

        <p v-if="missingScopes.length > 0" class="mb-github-token__note">
            {{
                t(
                    "settings.github.tokenMissingScopes",
                    { scopes: missingScopes.join(", ") },
                    "That token is missing these permissions: {scopes}. A new token with them is what fixes it.",
                )
            }}
        </p>
    </form>
</template>

<style>
.mb-github-token {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-github-token__row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 12px;
}

.mb-github-token__field {
    /* Allowed to be the whole row at 800x600 and at 200% display scale, where the button
       wraps underneath it rather than squeezing the field to nothing. */
    flex: 1 1 16rem;
    min-width: 0;
}

.mb-github-token__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    /* Aligns with the field's input row rather than with its floating label. */
    padding-block-start: 4px;
}

.mb-github-token__actions .v-btn {
    min-height: 40px;
}

.mb-github-token__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-github-token__link {
    color: rgb(var(--v-theme-primary));
}

.mb-github-token__alert {
    overflow-wrap: anywhere;
}
</style>
