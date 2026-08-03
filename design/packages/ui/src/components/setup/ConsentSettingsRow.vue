<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VChip, VIcon } from "vuetify/components";
import { mdiCheckCircleOutline, mdiCloseCircleOutline, mdiOpenInNew } from "@mdi/js";
import SetupText from "./SetupText.vue";
import ConsentQuote from "./ConsentQuote.vue";
import { useSetupI18n } from "./setupI18n.js";
import { MOJANG_EULA_URL } from "./setupStrings.js";
import { createConsentSettings, formatConsentTimestamp } from "./firstRunFlow.js";

/**
 * The consent state, in Settings: what was answered, when, and how to change it.
 *
 * This is the destination, not another asker. A render that needs consent and does not
 * have it reports what is missing and links here; it never puts a licence in front of
 * somebody who is halfway through choosing a world. Pass `missing` to have this row say
 * why it was opened, which is what that link sets.
 *
 * Both directions are offered and both are real. Accepting from here shows the same
 * verbatim quotation the first-run step showed, through the same component, because
 * agreeing to a licence you were not shown is not agreeing to anything. Withdrawing says
 * what it costs and what it leaves alone before it is pressed.
 *
 * Withdrawing is deliberately **not** behind a super-confirmation gate. It destroys
 * nothing: no map, no file, no setting is lost, and the very next press of Accept puts it
 * back. Gating a reversible preference behind the ceremony reserved for irreversible
 * deletion teaches people to work through that ceremony without reading it, which is the
 * opposite of what the gate is for.
 */
withDefaults(
    defineProps<{
        /** True when a render sent the person here because consent was missing. */
        missing?: boolean;
    }>(),
    { missing: false },
);

const { locale } = useI18n();

const i18n = useSetupI18n();
const consent = createConsentSettings();

const root = ref<HTMLElement | null>(null);

onMounted(() => {
    void consent.load();
});

const accepted = computed(() => consent.accepted.value);

const answeredAt = computed(() =>
    formatConsentTimestamp(consent.record.value?.acceptedAt ?? null, locale.value),
);

const appVersion = computed(() => consent.record.value?.appVersion ?? null);

const documentUrl = computed(() => consent.record.value?.documentUrl ?? MOJANG_EULA_URL);

/**
 * Focus and briefly outline the row, for the link a failed render offers. Landing
 * somebody on the right page and leaving them to hunt for the control is not arriving.
 */
const flash = ref(false);

function highlight(): void {
    root.value?.focus();
    flash.value = true;
    globalThis.setTimeout?.(() => {
        flash.value = false;
    }, 2000);
}

defineExpose({ highlight, reload: consent.load });
</script>

<template>
    <section
        id="mb-consent-setting"
        ref="root"
        class="mb-consent-row"
        :class="{ 'mb-consent-row--flash': flash }"
        tabindex="-1"
        :aria-label="i18n.t('consent.settingsTitle')"
    >
        <header class="mb-consent-row__header">
            <h3 class="mb-consent-row__title">{{ i18n.t("consent.settingsTitle") }}</h3>
            <v-chip
                :color="accepted ? 'success' : 'warning'"
                size="small"
                variant="tonal"
                class="mb-consent-row__chip"
            >
                <v-icon
                    :icon="accepted ? mdiCheckCircleOutline : mdiCloseCircleOutline"
                    start
                    aria-hidden="true"
                />
                {{
                    accepted
                        ? i18n.t("consent.status.accepted")
                        : i18n.t("consent.status.declined")
                }}
            </v-chip>
        </header>

        <SetupText text-key="settings.lead" class="mb-consent-row__lead" />

        <v-alert
            v-if="missing && !accepted"
            type="info"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-consent-row__alert"
        >
            <SetupText text-key="consent.missingHint" />
        </v-alert>

        <SetupText :text-key="accepted ? 'consent.acceptedFact' : 'consent.declinedFact'" />

        <dl class="mb-consent-row__facts">
            <div class="mb-consent-row__fact">
                <dt>{{ i18n.t("consent.field.answered") }}</dt>
                <dd>
                    <template v-if="accepted && answeredAt !== null">
                        <time :datetime="consent.record.value?.acceptedAt ?? undefined">
                            {{ answeredAt }}
                        </time>
                    </template>
                    <template v-else-if="accepted">
                        {{ i18n.t("consent.field.unknown") }}
                    </template>
                    <template v-else-if="consent.asked.value">
                        {{ i18n.t("consent.field.declined") }}
                    </template>
                    <template v-else>
                        {{ i18n.t("consent.field.never") }}
                    </template>
                </dd>
            </div>
            <div class="mb-consent-row__fact">
                <dt>{{ i18n.t("consent.field.document") }}</dt>
                <dd>
                    <a
                        :href="documentUrl"
                        class="mb-setup-link"
                        target="_blank"
                        rel="noreferrer noopener"
                    >
                        {{ i18n.t("action.openEula") }}
                        <v-icon :icon="mdiOpenInNew" size="small" aria-hidden="true" />
                    </a>
                </dd>
            </div>
            <div v-if="accepted" class="mb-consent-row__fact">
                <dt>{{ i18n.t("consent.field.appVersion") }}</dt>
                <dd>{{ appVersion ?? i18n.t("consent.field.unknown") }}</dd>
            </div>
        </dl>

        <!--
            Not accepted: the quotation is on screen before the button that accepts it.
            Accepted: the quotation stays available, because "what did I agree to" is a
            question somebody is entitled to answer without withdrawing first.
        -->
        <ConsentQuote v-if="!accepted" />

        <SetupText v-if="accepted" text-key="consent.withdrawFact" class="mb-consent-row__lead" />

        <div class="mb-consent-row__actions">
            <v-btn
                v-if="!accepted"
                variant="tonal"
                :disabled="!consent.available || consent.busy.value"
                :loading="consent.busy.value"
                @click="consent.accept"
            >
                {{ i18n.t("action.acceptNow") }}
            </v-btn>
            <v-btn
                v-else
                variant="tonal"
                :disabled="!consent.available || consent.busy.value"
                :loading="consent.busy.value"
                @click="consent.withdraw"
            >
                {{ i18n.t("action.withdraw") }}
            </v-btn>
        </div>

        <v-alert
            v-if="consent.failure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-consent-row__alert"
        >
            {{ consent.failure.value }}
        </v-alert>

        <p v-if="!consent.available" class="mb-consent-row__lead">
            {{ i18n.t("consent.unavailable") }}
        </p>
    </section>
</template>

<style>
.mb-consent-row {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.mb-consent-row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

/* The link a failed render offers lands here; this is what says "the control is this one". */
.mb-consent-row--flash {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

@media (prefers-reduced-motion: no-preference) {
    .mb-consent-row {
        transition: outline-color 200ms ease;
    }
}

.mb-consent-row__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-consent-row__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.mb-consent-row__lead {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-consent-row__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 8px 24px;
    margin: 0;
}

.mb-consent-row__fact > dt {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-consent-row__fact > dd {
    margin: 0;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
}

.mb-consent-row__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-consent-row__actions .v-btn {
    min-height: 40px;
}

/* As in the setup dialog: a real ring, not only Vuetify's low-opacity focus overlay. */
.mb-consent-row .v-btn:focus-visible,
.mb-consent-row a:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-consent-row__alert {
    overflow-wrap: anywhere;
}
</style>
