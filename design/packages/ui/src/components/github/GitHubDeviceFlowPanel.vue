<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VIcon, VProgressCircular } from "vuetify/components";
import { mdiContentCopy, mdiLogin, mdiOpenInNew } from "@mdi/js";
import {
    formatCountdown,
    spellOutCode,
    type GitHubAccountState,
} from "./githubAccount.js";

/**
 * The browser sign-in, from the button that starts it to whichever way it ended.
 *
 * A device flow asks somebody to leave the app, type a short code on github.com and come
 * back, so the code is the largest thing on this panel by a wide margin: it is what the
 * whole surface exists to hand over, and a code set in body text beside three paragraphs
 * is a code that gets mistyped. It is rendered **verbatim**, hyphen included, because the
 * verification page expects exactly what GitHub issued — reformatting it, stripping the
 * hyphen or upper-casing something GitHub did not produces a code that is refused, and
 * nothing on screen would say which of the two the person is looking at.
 *
 * Everything here came from an event. The code, the address, the seconds left and the
 * outcome are pushed by the main process on the auth event stream, and this panel renders
 * the latest of each and invents none of it. In particular the countdown does not tick on
 * its own: it is whatever the last `waiting` event said, so a screen that has stopped
 * hearing from the main process visibly stops counting instead of confidently counting
 * down to a code that died minutes ago.
 *
 * The four ways it can end are kept apart, because each has a different next step.
 * Approved is a success. Refused on the GitHub page is a decision somebody made, not a
 * fault. An expired code is neither — it wants a fresh code, which is one button. Only
 * `failed` is a real failure, and there the main process's own sentence is shown as
 * written, since it is the most precise statement available and the thing somebody would
 * search for.
 */
const props = defineProps<{ account: GitHubAccountState }>();

const { t } = useI18n();

const state = props.account;

/** Only ever set from `copyUserCode()`, and never contains the code itself. */
const copyNotice = ref("");

const code = computed(() => state.code.value);

const clock = computed(() => formatCountdown(state.secondsRemaining.value));

/** The address that fills the code in already, when GitHub offered one. */
const openUrl = computed(() => {
    const current = code.value;
    if (current === null) return null;
    return current.verificationUriComplete ?? current.verificationUri;
});

const missingScopes = computed(() => state.failure.value?.missingScopes ?? []);

function onStart(): void {
    copyNotice.value = "";
    void state.startDeviceSignIn();
}

function onStartWithOAuth(): void {
    copyNotice.value = "";
    void state.startDeviceSignIn({ useOAuthFallback: true });
}

function onCancel(): void {
    void state.cancelSignIn();
}

async function onCopy(): Promise<void> {
    const copied = await state.copyUserCode();
    copyNotice.value = copied
        ? t("settings.github.copied", "The code is on the clipboard.")
        : t(
              "settings.github.copyFailed",
              "The clipboard could not be reached, so the code has to be typed. It is on screen above.",
          );
}
</script>

<template>
    <div class="mb-github-flow">
        <!--
            No application configured in this build, which the status reports. The browser
            sign-in would be refused the moment it was started, so there is no button for
            it: a control that is certain to fail is worse than a sentence saying so.
        -->
        <p
            v-if="state.status.value !== null && !state.status.value.clientConfigured"
            class="mb-github-flow__note"
        >
            {{
                t(
                    "settings.github.noClient",
                    "This build has no GitHub application configured, so the browser sign-in cannot be started here. A personal access token still works.",
                )
            }}
        </p>

        <template v-else-if="state.phase.value === 'idle'">
            <p class="mb-github-flow__note">
                {{
                    t(
                        "settings.github.deviceExplain",
                        "The app asks GitHub for a short code, you type it on github.com, and the app is told when you have. No password is typed into this app, and the token it receives stays in the app.",
                    )
                }}
            </p>
            <div class="mb-github-flow__actions">
                <v-btn
                    class="mb-github-flow__start"
                    :prepend-icon="mdiLogin"
                    variant="tonal"
                    @click="onStart"
                >
                    {{ t("settings.github.start", "Sign in with a browser") }}
                </v-btn>
            </div>
        </template>

        <!--
            Asked, and no code yet. `adopted` is the case where the sign-in was already
            running before this screen subscribed: its code event has been and gone, so
            the code genuinely is not here to show and the panel says that instead of
            drawing an empty frame around nothing.
        -->
        <template v-else-if="state.phase.value === 'starting'">
            <p class="mb-github-flow__note" role="status" aria-live="polite">
                <v-progress-circular indeterminate size="16" width="2" aria-hidden="true" />
                {{
                    state.adopted.value
                        ? t(
                              "settings.github.adopted",
                              "A sign-in was already waiting for approval when this screen opened, so its code is not here to show. Cancel it and start again for a fresh code.",
                          )
                        : t("settings.github.asking", "Asking GitHub for a code…")
                }}
            </p>
            <div v-if="state.canCancel" class="mb-github-flow__actions">
                <v-btn variant="text" @click="onCancel">
                    {{ t("settings.github.cancel", "Cancel the sign-in") }}
                </v-btn>
            </div>
        </template>

        <template v-else-if="state.phase.value === 'waiting' && code !== null">
            <p class="mb-github-flow__note">
                {{
                    t(
                        "settings.github.typeThis",
                        "Type this code on the GitHub page, then come back here. This screen changes on its own when GitHub says you have.",
                    )
                }}
            </p>

            <!--
                The code, and the reason this panel exists. `aria-label` spells the
                characters out because a screen reader reads WDJB-MJHT as a word, and a
                word is not something anybody can type into a verification page.
            -->
            <p
                class="mb-github-flow__code"
                role="status"
                aria-live="polite"
                :aria-label="
                    t(
                        'settings.github.codeLabel',
                        { spelled: spellOutCode(code.userCode) },
                        'Your sign-in code is {spelled}',
                    )
                "
            >
                {{ code.userCode }}
            </p>

            <div class="mb-github-flow__actions">
                <v-btn
                    class="mb-github-flow__copy"
                    :prepend-icon="mdiContentCopy"
                    variant="tonal"
                    :aria-label="t('settings.github.copyCode', 'Copy the sign-in code')"
                    @click="onCopy"
                >
                    {{ t("settings.github.copyCodeLabel", "Copy the code") }}
                </v-btn>
                <v-btn
                    v-if="openUrl !== null"
                    class="mb-github-flow__open"
                    :href="openUrl"
                    target="_blank"
                    rel="noreferrer noopener"
                    :append-icon="mdiOpenInNew"
                    variant="tonal"
                >
                    {{ t("settings.github.openPage", "Open the GitHub page") }}
                </v-btn>
                <v-btn v-if="state.canCancel" variant="text" @click="onCancel">
                    {{ t("settings.github.cancel", "Cancel the sign-in") }}
                </v-btn>
            </div>

            <p v-if="copyNotice !== ''" class="mb-github-flow__note" role="status" aria-live="polite">
                {{ copyNotice }}
            </p>

            <p class="mb-github-flow__note">
                {{
                    code.browserOpened
                        ? t(
                              "settings.github.browserOpened",
                              "Your browser has been opened at this address:",
                          )
                        : t(
                              "settings.github.browserRefused",
                              "A browser could not be opened from here, so open this address yourself:",
                          )
                }}
                <a
                    class="mb-github-flow__url"
                    :href="code.verificationUri"
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {{ code.verificationUri }}
                    <v-icon :icon="mdiOpenInNew" size="small" aria-hidden="true" />
                </a>
            </p>

            <!--
                The clock is the difference between waiting and hanging. It moves only
                when an event says it has, which is every few seconds while the poll is
                alive and never again once it is not.
            -->
            <p v-if="clock !== ''" class="mb-github-flow__clock">
                {{
                    t(
                        "settings.github.expiresIn",
                        { clock },
                        "This code stops working in {clock}. A new one can be asked for afterwards.",
                    )
                }}
            </p>
        </template>

        <v-alert
            v-else-if="state.phase.value === 'signed-in'"
            type="success"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-github-flow__alert"
        >
            {{ t("settings.github.approved", "Approved on GitHub. You are signed in.") }}
        </v-alert>

        <template v-else-if="state.phase.value === 'denied'">
            <v-alert
                type="warning"
                variant="tonal"
                density="comfortable"
                role="status"
                class="mb-github-flow__alert mb-github-flow__denied"
            >
                {{
                    state.failure.value?.message ??
                    t("settings.github.denied", "Sign-in was refused on the GitHub page.")
                }}
            </v-alert>
            <p class="mb-github-flow__note">
                {{
                    t(
                        "settings.github.deniedNote",
                        "Nothing was stored and nothing changed. Starting again asks for a new code.",
                    )
                }}
            </p>
            <div class="mb-github-flow__actions">
                <v-btn class="mb-github-flow__retry" variant="tonal" @click="onStart">
                    {{ t("settings.github.tryAgain", "Try again") }}
                </v-btn>
            </div>
        </template>

        <template v-else-if="state.phase.value === 'expired'">
            <v-alert
                type="warning"
                variant="tonal"
                density="comfortable"
                role="status"
                class="mb-github-flow__alert mb-github-flow__expired"
            >
                {{
                    state.failure.value?.message ??
                    t(
                        "settings.github.expired",
                        "The code ran out of time before it was entered. Codes last about fifteen minutes.",
                    )
                }}
            </v-alert>
            <div class="mb-github-flow__actions">
                <v-btn class="mb-github-flow__retry" variant="tonal" @click="onStart">
                    {{ t("settings.github.freshCode", "Get a new code") }}
                </v-btn>
            </div>
        </template>

        <template v-else-if="state.phase.value === 'cancelled'">
            <p class="mb-github-flow__note mb-github-flow__cancelled" role="status">
                {{
                    t(
                        "settings.github.cancelled",
                        "Sign-in cancelled. Nothing was stored, and nothing on GitHub changed.",
                    )
                }}
            </p>
            <div class="mb-github-flow__actions">
                <v-btn class="mb-github-flow__retry" variant="tonal" @click="onStart">
                    {{ t("settings.github.start", "Sign in with a browser") }}
                </v-btn>
            </div>
        </template>

        <template v-else-if="state.phase.value === 'failed'">
            <v-alert
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
                class="mb-github-flow__alert mb-github-flow__failed"
            >
                {{
                    state.failure.value?.message ??
                    t("settings.github.failed", "The sign-in did not finish.")
                }}
            </v-alert>

            <p v-if="missingScopes.length > 0" class="mb-github-flow__note">
                {{
                    t(
                        "settings.github.missingScopes",
                        { scopes: missingScopes.join(", ") },
                        "The account signed in without these permissions, which the app needs: {scopes}.",
                    )
                }}
            </p>

            <div class="mb-github-flow__actions">
                <v-btn class="mb-github-flow__retry" variant="tonal" @click="onStart">
                    {{ t("settings.github.tryAgain", "Try again") }}
                </v-btn>
                <!--
                    Offered only when the main process says it would likely work: a GitHub
                    App that was never installed on the repository somebody wants is a dead
                    end otherwise, and the OAuth application is the way round it.
                -->
                <v-btn
                    v-if="state.failure.value?.offerOAuthFallback === true"
                    class="mb-github-flow__oauth"
                    variant="text"
                    @click="onStartWithOAuth"
                >
                    {{
                        t(
                            "settings.github.useOAuth",
                            "Sign in with the OAuth application instead",
                        )
                    }}
                </v-btn>
            </div>
        </template>
    </div>
</template>

<style>
.mb-github-flow {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-github-flow__note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

/* The whole point of the panel. Large, spaced, and in a face where 0 and O, 1 and l
   cannot be confused, because this is copied by eye onto another device. */
.mb-github-flow__code {
    margin: 4px 0;
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-on-surface));
    font-family: "Cascadia Mono", "Consolas", "SF Mono", "DejaVu Sans Mono", monospace;
    /* Scales with the sheet rather than a fixed size, so it stays inside 520px at 200%
       display scale instead of running off the edge. */
    font-size: clamp(1.5rem, 8vw, 2.25rem);
    font-weight: 600;
    letter-spacing: 0.24em;
    line-height: 1.3;
    text-align: center;
    overflow-wrap: anywhere;
}

.mb-github-flow__clock {
    margin: 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: rgb(var(--v-theme-on-surface));
}

.mb-github-flow__url {
    color: rgb(var(--v-theme-primary));
    overflow-wrap: anywhere;
}

.mb-github-flow__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-github-flow__actions .v-btn {
    min-height: 40px;
}

.mb-github-flow__alert {
    overflow-wrap: anywhere;
}
</style>
