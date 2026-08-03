<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert } from "vuetify/components";
import { worldFolderCopy } from "./settingsCopy.js";

/**
 * The world folder, which is deliberately **not** a setting on this screen.
 *
 * A world folder belongs to one map. The wizard's first step asks for it, it is written
 * into that map's own `world` key, and a person who renders three worlds has three
 * different answers at once. There is no single folder to put a control here for, so
 * there is no control: an input box on this screen would have to either edit some
 * arbitrary map's folder or edit nothing at all, and both are worse than saying where
 * the real answer lives.
 *
 * That is why this row exists at all rather than the anchor being dropped. A render that
 * stops because its world folder has moved reports `world-folder`, the surface opens
 * here, and this says in as many words where to go — which is a remedy. Quietly showing
 * nothing for that anchor would leave somebody staring at a settings page wondering
 * which of the other three rows was meant.
 */
defineProps<{
    /** True when a render said the folder was gone, not merely wrong. */
    missing: boolean;
}>();

const { t } = useI18n();

/** Resolved through the shared copy so the surface's search matches what is rendered. */
const copy = computed(() => worldFolderCopy(t));
</script>

<template>
    <div class="mb-world-folder-setting">
        <v-alert
            v-if="missing"
            type="warning"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-world-folder-setting__alert"
        >
            {{
                t(
                    "settings.worldFolder.missingHint",
                    "A render stopped because its world folder was not there any more. The folder may have been moved, renamed, or been on a drive that is not plugged in.",
                )
            }}
        </v-alert>

        <p class="mb-world-folder-setting__note">{{ copy.perMap }}</p>

        <p class="mb-world-folder-setting__note">{{ copy.where }}</p>
    </div>
</template>

<style>
.mb-world-folder-setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-world-folder-setting__note {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-world-folder-setting__alert {
    overflow-wrap: anywhere;
}
</style>
