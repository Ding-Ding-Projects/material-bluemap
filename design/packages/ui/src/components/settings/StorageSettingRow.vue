<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn } from "vuetify/components";
import PathField from "../PathField.vue";
import {
    expandsAtRenderTime,
    mapStorageExample,
    pathToken,
} from "../setup/mapStorage.js";
import type { MapStorageSetting } from "./mapStorageSetting.js";

/**
 * Where rendered maps are written — a real editable path, not a label.
 *
 * The rules are `setup/mapStorage.ts`, unchanged, which is the same module first-run
 * setup validates against, so a path this row accepts is a path that step would have
 * accepted and the other way round. The field reports a relative path as the problem it
 * is, in the platform's own notation, and Save stays out of reach until it is fixed —
 * and refuses again in the handler, because a keyboard submit walks straight past a
 * disabled button.
 *
 * The browse button is the shared `PathField` affordance rather than a row-local one.
 * `props.setting.canBrowse` (backed by `settingsBridge.ts`'s `chooseMapStorageDirectory`)
 * never turns true in the shipped app - nothing on the real preload implements that
 * method - so a row-local "Choose folder" button gated on it never rendered.
 * `PathField.vue` probes `window.materialBluemap.dialog` instead, which the desktop
 * app's dialog bridge does implement, so the button now actually opens a folder picker
 * rather than staying permanently absent. Where the main process can be asked, the
 * absolute folder it resolved is shown underneath, because `%APPDATA%\...` is the value
 * and the expanded path is the place, and somebody looking for their tiles needs the
 * second.
 */
const props = defineProps<{
    setting: MapStorageSetting;
    /** True when a render said this folder was missing rather than merely wrong. */
    missing: boolean;
}>();

const { t } = useI18n();

const value = computed<string>({
    get: () => props.setting.value.value,
    set: (next) => {
        props.setting.value.value = next;
    },
});

/** The lowercase phrase `PathField` reads into "Browse for {field}" / "Choose {field}". */
const fieldName = computed(() =>
    t("settings.storage.field", "Folder for rendered maps").toLowerCase(),
);

const errorMessage = computed(() => {
    const problem = props.setting.problem.value;
    if (problem === "empty") {
        return t("settings.storage.empty", "Give a folder for the maps to be written into.");
    }
    if (problem === "relative") {
        // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
        // compiles the fallback as a message too, so it consumes `{example}` as a named
        // parameter of its own and a later `replace` finds nothing left to substitute.
        // The sentence then reads "…like ." and the one useful part of it is gone.
        return t(
            "settings.storage.relative",
            { example: mapStorageExample(props.setting.platform) },
            "That is not a full path. Name a folder from the top of a drive, like {example}.",
        );
    }
    return "";
});

const showTokenHint = computed(() =>
    expandsAtRenderTime(props.setting.value.value, props.setting.platform),
);

const canSave = computed(
    () =>
        props.setting.dirty.value &&
        props.setting.problem.value === null &&
        !props.setting.busy.value,
);

function onSave(): void {
    void props.setting.save();
}
</script>

<template>
    <div class="mb-storage-setting">
        <v-alert
            v-if="props.missing"
            type="info"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-storage-setting__alert"
        >
            {{
                t(
                    "settings.storage.missingHint",
                    "A render stopped because this folder was not there. Point it somewhere that exists and start the render again.",
                )
            }}
        </v-alert>

        <div class="mb-storage-setting__row">
            <div class="mb-storage-setting__field">
                <PathField
                    v-model="value"
                    :field="fieldName"
                    :label="t('settings.storage.field', 'Folder for rendered maps')"
                    semantic="folder"
                    :disabled="props.setting.busy.value"
                    :error="errorMessage"
                    density="comfortable"
                />
                <p v-if="props.setting.isDefault.value" class="mb-storage-setting__note">
                    {{ t("settings.storage.isDefault", "This is the default folder.") }}
                </p>
            </div>
            <div class="mb-storage-setting__actions">
                <v-btn
                    :disabled="props.setting.busy.value || props.setting.isDefault.value"
                    variant="text"
                    @click="props.setting.useDefault()"
                >
                    {{ t("settings.storage.useDefault", "Use the default") }}
                </v-btn>
                <v-btn
                    v-if="props.setting.dirty.value"
                    :disabled="props.setting.busy.value"
                    variant="text"
                    @click="props.setting.revert()"
                >
                    {{ t("settings.storage.revert", "Undo the change") }}
                </v-btn>
                <v-btn
                    class="mb-storage-setting__save"
                    :disabled="!canSave"
                    :loading="props.setting.busy.value"
                    variant="tonal"
                    @click="onSave"
                >
                    {{ t("settings.storage.save", "Save this folder") }}
                </v-btn>
            </div>
        </div>

        <p v-if="showTokenHint" class="mb-storage-setting__note">
            {{
                t(
                    "settings.storage.tokenNote",
                    { token: pathToken(props.setting.platform) },
                    "{token} is expanded when a render starts, so this is a real value rather than an example.",
                )
            }}
        </p>

        <dl v-if="props.setting.resolved.value !== null" class="mb-storage-setting__facts">
            <div class="mb-storage-setting__fact">
                <dt>{{ t("settings.storage.resolved", "Maps are written to") }}</dt>
                <dd>{{ props.setting.resolved.value.current }}</dd>
            </div>
            <div class="mb-storage-setting__fact">
                <dt>{{ t("settings.storage.resolvedDefault", "The default folder is") }}</dt>
                <dd>{{ props.setting.resolved.value.default }}</dd>
            </div>
        </dl>

        <p v-else class="mb-storage-setting__note">
            {{
                t(
                    "settings.storage.unresolved",
                    "This build cannot ask where that expands to on disk. The desktop app resolves it when a render starts.",
                )
            }}
        </p>

        <p v-if="!props.setting.canApply" class="mb-storage-setting__note">
            {{
                t(
                    "settings.storage.localOnly",
                    "Saving records the choice for the map wizard. Moving the folder the desktop app renders into needs the desktop app.",
                )
            }}
        </p>

        <p
            v-if="props.setting.savedJustNow.value"
            class="mb-storage-setting__saved"
            role="status"
            aria-live="polite"
        >
            {{
                t(
                    "settings.storage.saved",
                    { path: props.setting.saved.value },
                    "Saved. Maps will be written to {path}.",
                )
            }}
        </p>

        <v-alert
            v-if="props.setting.failure.value !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-storage-setting__alert"
        >
            {{ props.setting.failure.value }}
        </v-alert>
    </div>
</template>

<style>
.mb-storage-setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-storage-setting__row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 12px;
}

.mb-storage-setting__field {
    /* Wide enough for a real path, and allowed to be the whole row at 800x600 and at
       200% display scale, where the button cluster wraps underneath it. */
    flex: 1 1 18rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-storage-setting__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    /* Aligns with the field's input row rather than with its floating label. */
    padding-block-start: 4px;
}

.mb-storage-setting__actions .v-btn {
    min-height: 40px;
}

.mb-storage-setting__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-storage-setting__saved {
    margin: 0;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-primary));
    overflow-wrap: anywhere;
}

.mb-storage-setting__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 8px 24px;
    margin: 0;
}

.mb-storage-setting__fact > dt {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-storage-setting__fact > dd {
    margin: 0;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}

.mb-storage-setting__alert {
    overflow-wrap: anywhere;
}
</style>
