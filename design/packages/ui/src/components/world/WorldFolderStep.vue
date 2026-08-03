<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCheckCircleOutline, mdiFolderSearchOutline, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VChip, VProgressCircular, VTextField } from "vuetify/components";
import { useConfigHost } from "../config/configHost.js";
import { describeWorld, describeWorldProblem, type WorldInspection } from "./worldFolder.js";

/**
 * Step one: which world.
 *
 * The folder is checked before the wizard moves on, because the alternative is a
 * render that runs for a minute inside a Java process and then reports a missing
 * `level.dat`. Each way of getting it wrong has its own sentence and its own fix:
 * the `saves` folder holding several worlds, the `region` folder from inside one,
 * a dimension folder one level too deep, and a folder that is simply not a world.
 *
 * When this build has no way to read a folder, the step says exactly that instead
 * of showing a tick it did not earn.
 */
const props = defineProps<{
    modelValue: string;
    inspection: WorldInspection;
    inspecting: boolean;
    /** True when the app can actually look inside a folder. */
    canInspect: boolean;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
    /** Asks the shell to read the folder again, after a pick or a retry. */
    inspect: [folder: string];
}>();

const { t } = useI18n();
const host = useConfigHost();

const path = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const problems = computed(() => props.inspection.problems.map((problem) => describeWorldProblem(problem, t)));
const summary = computed(() => describeWorld(props.inspection, t));
const good = computed(() => props.inspection.ok && !props.inspection.unchecked);

async function browse(): Promise<void> {
    if (host === null) return;
    const chosen = await host.pickDirectory({
        title: t("world.folder.pick", "Choose the world folder, the one that contains level.dat"),
        ...(path.value.trim() === "" ? {} : { startIn: path.value.trim() }),
    });
    if (chosen === null) return;
    emit("update:modelValue", chosen);
    emit("inspect", chosen);
}
</script>

<template>
    <section class="mb-world-step" :aria-label="t('world.wizard.step.world', 'World')">
        <h3 class="mb-world-step__title">{{ t("world.folder.title", "Choose a world") }}</h3>
        <p class="mb-world-step__blurb">
            {{
                t(
                    "world.folder.blurb",
                    "Point this at a Minecraft save folder. That is the folder holding level.dat and a region folder: on a server it is usually called world, and in the game it lives under saves.",
                )
            }}
        </p>

        <div class="mb-world-step__row">
            <v-text-field
                v-model="path"
                :label="t('world.folder.label', 'World folder')"
                :placeholder="t('world.folder.placeholder', 'the folder that contains level.dat')"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                @blur="emit('inspect', path)"
                @keydown.enter="emit('inspect', path)"
            />
            <v-btn
                :prepend-icon="mdiFolderSearchOutline"
                :disabled="host === null"
                variant="tonal"
                @click="browse"
            >
                {{ t("world.folder.browse", "Browse") }}
            </v-btn>
            <v-btn
                :prepend-icon="mdiRefresh"
                :aria-label="t('world.folder.recheck', 'Check this folder again')"
                :disabled="!canInspect || path.trim() === '' || inspecting"
                variant="text"
                @click="emit('inspect', path)"
            >
                {{ t("world.folder.recheckShort", "Check again") }}
            </v-btn>
        </div>

        <p v-if="host === null" class="mb-world-step__blurb">
            {{
                t(
                    "world.folder.noPicker",
                    "There is no folder picker in this build, so type or paste the full path. Local rendering needs the desktop app.",
                )
            }}
        </p>

        <div v-if="inspecting" class="mb-world-step__checking" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("world.folder.checking", "Reading the folder...") }}</span>
        </div>

        <template v-else>
            <v-alert
                v-for="problem in problems"
                :key="problem.title"
                type="warning"
                density="compact"
                variant="tonal"
                class="mt-3"
            >
                <p class="mb-world-step__problem">{{ problem.title }}</p>
                <p v-if="problem.fix" class="mb-world-step__fix">{{ problem.fix }}</p>
            </v-alert>

            <v-alert
                v-if="!canInspect && path.trim() !== '' && problems.length === 0"
                type="info"
                density="compact"
                variant="tonal"
                class="mt-3"
            >
                {{
                    t(
                        "world.folder.cannotCheck",
                        "This build cannot look inside a folder, so the world is taken as given. If it is not a world, the render will say so when it starts.",
                    )
                }}
            </v-alert>

            <v-alert v-if="good" type="success" density="compact" variant="tonal" class="mt-3" role="status">
                <div class="mb-world-step__found">
                    <span>{{ summary }}</span>
                    <v-chip
                        v-for="dimension in inspection.dimensions"
                        :key="dimension.key"
                        size="x-small"
                        variant="tonal"
                        :prepend-icon="mdiCheckCircleOutline"
                    >
                        {{ dimension.label }}
                        <span class="mb-world-step__count">
                            {{ t("world.folder.regionCount", "{n} regions").replace("{n}", String(dimension.regionFiles)) }}
                        </span>
                    </v-chip>
                </div>
            </v-alert>
        </template>
    </section>
</template>

<style>
.mb-world-step__title {
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-world-step__blurb,
.mb-world-step__fix {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-step__problem {
    font-size: 0.875rem;
    line-height: 1.5;
}

.mb-world-step__row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
    margin-block: 12px;
}

.mb-world-step__row .v-text-field {
    flex: 1 1 260px;
    min-width: 0;
}

.mb-world-step__checking {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    margin-block-start: 12px;
}

.mb-world-step__found {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.875rem;
}

.mb-world-step__count {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
}
</style>
