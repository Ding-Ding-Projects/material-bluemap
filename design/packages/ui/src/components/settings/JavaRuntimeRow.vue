<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VProgressCircular, VProgressLinear } from "vuetify/components";
import { mdiDownload, mdiRefresh } from "@mdi/js";
import { describeJavaRejections, type JavaSetting } from "./javaSetting.js";
import { javaUnsupportedCopy } from "./settingsCopy.js";

/**
 * The Java the app found — or, where it cannot ask, an honest account of why not.
 *
 * The discovery is real: the main process looks at `JAVA_HOME`, then `java` on `PATH`,
 * then the copy the app provisioned for itself, and **runs each one** before believing
 * it, because a path is not evidence. The desktop app answers over `java:runtime`; a
 * browser tab has no main process to put the question to, and that state is reported
 * plainly rather than as a version nobody measured. A settings row that states an
 * unmeasured fact is worse than one that admits the question cannot be put, because the
 * second can be acted on.
 *
 * One further fact is shown as exactly what it is. `listRenders()` carries the engine
 * line each render ran with, so the most recent one can be quoted — labelled as a record
 * of that render, never as a reading of this machine now.
 */
const props = defineProps<{
    setting: JavaSetting;
    /** True when a render said no Java was found, rather than that one was unsuitable. */
    missing: boolean;
}>();

const { t } = useI18n();

const rejections = computed(() => describeJavaRejections(props.setting.report.value));

/** Resolved through the shared copy so the surface's search matches what is rendered. */
const unsupported = computed(() => javaUnsupportedCopy(t));

const installation = computed(() => props.setting.report.value?.installation ?? null);

function onRefresh(): void {
    void props.setting.load();
}

/*
 * Whether a Temurin download has already been agreed to is asked for as soon as this row
 * exists at all, not only once it is showing the "missing" state - the same reason
 * `load()` itself starts eagerly. A row that only checked consent once it had something
 * to show would flash the full explanation on every visit for the first half-second, even
 * for somebody who agreed to it last week.
 */
if (props.setting.canProvision) void props.setting.loadConsent();

/**
 * The download's progress as a percentage, or null while it is indeterminate.
 *
 * `total` is only known once Adoptium's own response named a size; some builds omit it,
 * and the bar is indeterminate for exactly as long as that is true rather than pretending
 * to a precision the server never gave.
 */
const provisionPercent = computed(() => {
    const event = props.setting.provisionEvent.value;
    if (event === null || event.received === null || event.total === null || event.total <= 0) {
        return null;
    }
    return Math.min(100, (event.received / event.total) * 100);
});

const provisionStageMessage = computed(
    () => props.setting.provisionEvent.value?.message ?? t("settings.java.provisioning", "Downloading Java…"),
);

/**
 * "Roughly 180 MB" rather than an exact figure quoted from an Adoptium response this row
 * never fetched: the real size is only known once the download itself has resolved a
 * release, and asking Adoptium a second time purely to word this sentence would be a
 * network call this button does not otherwise need. The figure is an honest estimate,
 * stated as one, and the real total - once known - drives the progress bar above instead.
 */
const provisionExplain = computed(() =>
    t(
        "settings.java.provisionExplain",
        "Downloads and installs Eclipse Temurin (roughly 180 MB) from Adoptium's own servers, into " +
            "this app's own data folder. Nothing is installed system-wide, PATH is not touched, and no " +
            "administrator rights are needed.",
    ),
);

function onDownload(): void {
    void props.setting.requestProvision();
}
</script>

<template>
    <div class="mb-java-setting">
        <v-alert
            v-if="props.missing"
            type="warning"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-java-setting__alert"
        >
            {{
                t(
                    "settings.java.missingHint",
                    "A render stopped because no suitable Java was found. Installing one, or pointing JAVA_HOME at one, is what fixes it.",
                )
            }}
        </v-alert>

        <!--
            Where a host without the preload lands. It is not an error and is not styled
            as one: nothing failed, the question simply cannot be put from here.
        -->
        <template v-if="props.setting.state.value === 'unsupported'">
            <v-alert
                type="info"
                variant="tonal"
                density="comfortable"
                role="status"
                class="mb-java-setting__alert"
            >
                {{ unsupported.headline }}
            </v-alert>
            <p class="mb-java-setting__note">{{ unsupported.discoveryOrder }}</p>
        </template>

        <template v-else-if="props.setting.state.value === 'loading'">
            <p class="mb-java-setting__note" role="status" aria-live="polite">
                <v-progress-circular indeterminate size="16" width="2" aria-hidden="true" />
                {{ t("settings.java.loading", "Looking for a Java runtime…") }}
            </p>
        </template>

        <template v-else-if="props.setting.state.value === 'found' && installation !== null">
            <dl class="mb-java-setting__facts">
                <div class="mb-java-setting__fact">
                    <dt>{{ t("settings.java.version", "Version") }}</dt>
                    <dd>{{ installation.version.version }}</dd>
                </div>
                <div class="mb-java-setting__fact">
                    <dt>{{ t("settings.java.source", "Found through") }}</dt>
                    <dd>{{ installation.source }}</dd>
                </div>
                <div class="mb-java-setting__fact">
                    <dt>{{ t("settings.java.executable", "Executable") }}</dt>
                    <dd>{{ installation.executable }}</dd>
                </div>
                <div v-if="installation.version.runtime !== null" class="mb-java-setting__fact">
                    <dt>{{ t("settings.java.runtime", "Runtime") }}</dt>
                    <dd>{{ installation.version.runtime }}</dd>
                </div>
            </dl>
        </template>

        <template v-else-if="props.setting.state.value === 'missing'">
            <v-alert
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
                class="mb-java-setting__alert"
            >
                {{
                    t(
                        "settings.java.notFound",
                        { required: String(props.setting.required.value ?? "") },
                        "No Java {required} or newer was found.",
                    )
                }}
            </v-alert>

            <!--
                The one control that actually does what `settings.java.missingHint` above
                promises. `canProvision` is false in a build whose preload has not grown
                the provisioning channels yet, and the row falls back to naming
                `JAVA_HOME` as the only route rather than showing a button that would
                throw.
            -->
            <template v-if="props.setting.canProvision">
                <v-alert
                    v-if="props.setting.provisionFailure.value !== null"
                    type="error"
                    variant="tonal"
                    density="comfortable"
                    role="alert"
                    class="mb-java-setting__alert"
                >
                    {{ props.setting.provisionFailure.value }}
                </v-alert>

                <div v-if="props.setting.provisioning.value" class="mb-java-setting__provisioning">
                    <v-progress-linear
                        :model-value="provisionPercent ?? 0"
                        :indeterminate="provisionPercent === null"
                        color="primary"
                        rounded
                        aria-hidden="true"
                    />
                    <p class="mb-java-setting__note" role="status" aria-live="polite">
                        {{ provisionStageMessage }}
                    </p>
                </div>

                <template v-else>
                    <p class="mb-java-setting__note">{{ provisionExplain }}</p>
                    <div class="mb-java-setting__actions">
                        <v-btn
                            :prepend-icon="mdiDownload"
                            color="primary"
                            variant="tonal"
                            @click="onDownload"
                        >
                            {{ t("settings.java.download", "Download Java") }}
                        </v-btn>
                    </div>
                </template>
            </template>
        </template>

        <template v-else-if="props.setting.state.value === 'failed'">
            <v-alert
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
                class="mb-java-setting__alert"
            >
                {{ props.setting.failure.value }}
            </v-alert>
        </template>

        <!--
            Every candidate that was looked at and turned down, in the main process's own
            words. "JAVA_HOME points at Java 17" is actionable; "no Java found" on a
            machine with three JDKs installed is baffling.
        -->
        <template v-if="rejections.length > 0">
            <p class="mb-java-setting__note">
                {{ t("settings.java.checked", "Checked, and turned down:") }}
            </p>
            <ul class="mb-java-setting__rejections">
                <li v-for="line in rejections" :key="line">{{ line }}</li>
            </ul>
        </template>

        <p v-if="props.setting.lastRender.value !== null" class="mb-java-setting__note">
            {{
                t(
                    "settings.java.lastRender",
                    { engine: props.setting.lastRender.value.engine },
                    "The most recent render ran on: {engine}. That is a record of that render, not a reading of this machine now.",
                )
            }}
        </p>

        <div v-if="props.setting.supported" class="mb-java-setting__actions">
            <v-btn
                :prepend-icon="mdiRefresh"
                :disabled="props.setting.state.value === 'loading'"
                variant="tonal"
                @click="onRefresh"
            >
                {{ t("settings.java.recheck", "Look again") }}
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-java-setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-java-setting__note {
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

.mb-java-setting__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 8px 24px;
    margin: 0;
}

.mb-java-setting__fact > dt {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-java-setting__fact > dd {
    margin: 0;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}

.mb-java-setting__rejections {
    margin: 0;
    padding-inline-start: 1.25rem;
    font-size: 0.75rem;
    line-height: 1.6;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-java-setting__provisioning {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mb-java-setting__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-java-setting__actions .v-btn {
    min-height: 40px;
}

.mb-java-setting__alert {
    overflow-wrap: anywhere;
}
</style>
