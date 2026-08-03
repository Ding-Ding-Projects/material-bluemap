<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiConsole, mdiContentCopy, mdiInformationOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VDivider, VIcon, VSwitch, VTextField } from "vuetify/components";
import { CLI_FLAGS, buildCliArgs, formatCliCommand, resolveCliActions, type CliFlag, type CliInvocation, type PlainValue } from "@material-bluemap/config";
import ConfigControl from "./ConfigControl.vue";
import ConfigSearchField from "./ConfigSearchField.vue";
import { FLAG_GROUPS, flagSearchText, flagValue, flagsInGroup, withFlagValue, type FlagValue } from "./cliRun.js";
import { createSettingMatcher } from "./regexEngine.js";

/**
 * The run screen: every command-line flag, and an honest statement of what the
 * chosen set of them will actually do.
 *
 * The flags are not independent, which is the whole reason this screen exists
 * rather than a row of checkboxes. `-r`, `-f`, `-u` and `-e` all take the render
 * branch, and inside it `-g` stops meaning "generate the web app" and starts
 * meaning "regenerate it as part of the render", while `--markers` and `-s` are
 * never reached. `resolveCliActions` in the config package models that, and this
 * screen shows its answer instead of implying that every ticked box happens.
 */
const props = defineProps<{
    invocation: CliInvocation;
    /** Absolute path of the shadow jar, for the copyable command. */
    jarPath: string;
    /** True when Mojang download consent has been given. */
    consentAccepted: boolean;
}>();

const emit = defineEmits<{ "update:invocation": [value: CliInvocation]; consent: [] }>();

const { t } = useI18n();

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a setting name, and
// `m` because a field's searchable text is several lines (label, key, Java field,
// upstream's explanation), so `^` and `$` are only useful per line.
const flags = ref("im");
const copyState = ref("");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const groups = computed(() =>
    FLAG_GROUPS.map((group) => ({
        ...group,
        flags: flagsInGroup(group.id).filter((flag) => matcher.value.test(flagSearchText(flag))),
    })).filter((group) => group.flags.length > 0),
);

const shown = computed(() => groups.value.reduce((total, group) => total + group.flags.length, 0));

const summary = computed(() => {
    if (matcher.value.error !== null) return t("config.run.badPattern", "The pattern is not valid, so nothing is shown.");
    if (!matcher.value.active) return "";
    return t("config.run.matches", "{shown} of {total} flags match.")
        .replace("{shown}", String(shown.value))
        .replace("{total}", String(CLI_FLAGS.length));
});

const actions = computed(() => resolveCliActions(props.invocation));
const args = computed(() => buildCliArgs(props.invocation));
const command = computed(() => formatCliCommand(props.jarPath, props.invocation));

/**
 * The consent note.
 *
 * Consent is asked once at first launch and remembered. This says what is
 * missing and points at the setting; it never shows the licence itself to
 * somebody who came here to start a render.
 */
const consentBlocking = computed(() => actions.value.render !== null && !props.consentAccepted);

function set(flag: CliFlag, value: FlagValue): void {
    emit("update:invocation", withFlagValue(props.invocation, flag, value));
}

function controlValueOf(flag: CliFlag): PlainValue {
    const value = flagValue(props.invocation, flag);
    if (value === null) return "";
    if (typeof value === "boolean" || typeof value === "string") return value;
    // `--maps` is the only list flag; its readonly array is copied so the
    // control can hand a fresh mutable one straight back.
    return value.map((item) => item);
}

async function copyCommand(): Promise<void> {
    try {
        await navigator.clipboard.writeText(command.value);
        copyState.value = t("config.run.copied", "Copied the command exactly as shown.");
    } catch {
        copyState.value = t("config.run.copyFailed", "Could not reach the clipboard.");
    }
}
</script>

<template>
    <section class="mb-config-run" :aria-label="t('config.run.title', 'Run')">
        <h2 class="mb-config-run__title">{{ t("config.run.title", "Run") }}</h2>
        <p class="mb-config-run__blurb">
            {{
                t(
                    "config.run.blurb",
                    "The other half of the setup: what BlueMap is actually asked to do when it starts. Every flag the command line accepts is here.",
                )
            }}
        </p>

        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            :label="t('config.run.search', 'Search flags')"
            :placeholder="t('config.run.searchHint', 'name, option or anything in the description')"
            :sample="CLI_FLAGS.map((flag) => `${flag.label}  --${flag.long}`).join('\n')"
            :summary="summary"
        />

        <v-card variant="tonal" class="mb-config-run__result">
            <v-card-title class="mb-config-run__result-head">
                <v-icon :icon="mdiInformationOutline" size="20" aria-hidden="true" />
                {{ t("config.run.willDo", "What this run does") }}
            </v-card-title>
            <v-card-text>
                <ul class="mb-config-run__list">
                    <li v-if="actions.render">
                        {{
                            t("config.run.doRender", "Renders {maps}, {force}.")
                                .replace(
                                    "{maps}",
                                    actions.render.maps === null
                                        ? t("config.run.allMaps", "every map")
                                        : t("config.run.onlyMaps", "only {list}").replace("{list}", actions.render.maps.join(", ")),
                                )
                                .replace(
                                    "{force}",
                                    actions.render.force === "all"
                                        ? t("config.run.forceAll", "re-rendering everything")
                                        : actions.render.force === "edge"
                                          ? t("config.run.forceEdge", "re-rendering the map edges as well as changed chunks")
                                          : t("config.run.forceNone", "only the chunks that changed"),
                                )
                        }}
                    </li>
                    <li v-if="actions.render?.watch">{{ t("config.run.doWatch", "Then keeps watching for changes and keeps the map up to date.") }}</li>
                    <li v-if="actions.render?.forceGenerateWebapp">
                        {{ t("config.run.doWebappInRender", "Regenerates the web app as part of that render.") }}
                    </li>
                    <li v-if="actions.updateMarkers">{{ t("config.run.doMarkers", "Updates the markers from the map configs.") }}</li>
                    <li v-if="actions.regenerateWebapp">{{ t("config.run.doWebapp", "Generates the web app files.") }}</li>
                    <li v-if="actions.updateWebSettings">{{ t("config.run.doSettings", "Updates settings.json for the web app.") }}</li>
                    <li v-if="actions.startWebserver">
                        {{
                            actions.startWebserver.verbose
                                ? t("config.run.doServerVerbose", "Starts the built-in web server and logs every request.")
                                : t("config.run.doServer", "Starts the built-in web server.")
                        }}
                    </li>
                    <li v-if="actions.generatesMissingConfigs">
                        {{ t("config.run.doGenerate", "Writes any config file that is missing from the folder before doing anything else.") }}
                    </li>
                </ul>

                <v-alert v-for="note in actions.notes" :key="note" type="info" density="compact" variant="tonal" class="mt-2">
                    {{ note }}
                </v-alert>

                <v-alert v-if="consentBlocking" type="warning" density="compact" variant="tonal" class="mt-2">
                    {{
                        t(
                            "config.run.consentMissing",
                            "This run renders, which needs the Minecraft client jar from Mojang. That is accepted once in the app's own settings and has not been yet, so the run would stop before it starts.",
                        )
                    }}
                    <template #append>
                        <v-btn variant="tonal" size="small" @click="emit('consent')">
                            {{ t("config.run.openConsent", "Open the setting") }}
                        </v-btn>
                    </template>
                </v-alert>
            </v-card-text>
        </v-card>

        <v-card variant="tonal" class="mb-config-run__command">
            <v-card-title class="mb-config-run__result-head">
                <v-icon :icon="mdiConsole" size="20" aria-hidden="true" />
                {{ t("config.run.command", "The command") }}
                <v-chip size="x-small" variant="outlined" class="ml-2">
                    {{ t("config.run.argCount", "{n} arguments").replace("{n}", String(args.length)) }}
                </v-chip>
            </v-card-title>
            <v-card-text>
                <pre class="mb-config-run__pre">{{ command }}</pre>
                <v-btn :prepend-icon="mdiContentCopy" variant="text" size="small" density="comfortable" @click="copyCommand">
                    {{ t("config.run.copy", "Copy") }}
                </v-btn>
                <span class="mb-config-run__blurb" aria-live="polite">{{ copyState }}</span>
                <p class="mb-config-run__blurb">
                    {{
                        t(
                            "config.run.absoluteNote",
                            "Always pass an absolute config folder. BlueMap resolves the storage root and the data folder against the working directory, not against the config folder, so a relative path writes tiles wherever the program happened to be started.",
                        )
                    }}
                </p>
            </v-card-text>
        </v-card>

        <div v-for="group in groups" :key="group.id" class="mb-config-run__group">
            <h3 class="mb-config-run__group-title">{{ group.label }}</h3>
            <v-divider class="mb-2" />

            <div v-for="flag in group.flags" :key="flag.long" class="mb-config-run__flag">
                <v-switch
                    v-if="flag.control.kind === 'switch'"
                    :model-value="flagValue(invocation, flag) === true"
                    :label="flag.label"
                    color="primary"
                    density="compact"
                    hide-details="auto"
                    inset
                    @update:model-value="(value: boolean | null) => set(flag, value === true)"
                />
                <ConfigControl
                    v-else
                    :control="flag.control"
                    :model-value="controlValueOf(flag)"
                    :label="flag.label"
                    @update:model-value="(value: PlainValue) => set(flag, value as FlagValue)"
                />

                <p class="mb-config-run__doc">
                    <code>{{ flag.short === null ? `--${flag.long}` : `-${flag.short}, --${flag.long}` }}</code>
                    {{ flag.description }}
                </p>
            </div>
        </div>
    </section>
</template>

<style>
.mb-config-run__title {
    font-size: 1.25rem;
    font-weight: 400;
}

.mb-config-run__blurb,
.mb-config-run__doc {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-run__result,
.mb-config-run__command {
    margin-block: 16px;
    border-radius: 12px;
}

.mb-config-run__result-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
}

.mb-config-run__list {
    margin: 0 0 0 1.2em;
    font-size: 0.8125rem;
    line-height: 1.6;
}

.mb-config-run__pre {
    margin: 0 0 8px;
    padding: 8px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre;
}

.mb-config-run__group {
    margin-block-start: 20px;
}

.mb-config-run__group-title {
    font-size: 0.9375rem;
    font-weight: 500;
}

.mb-config-run__flag {
    padding-block: 8px;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-config-run__doc code {
    font-family: "Roboto Mono", ui-monospace, monospace;
    margin-inline-end: 6px;
}
</style>
