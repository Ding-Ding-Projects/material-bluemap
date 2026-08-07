<script setup lang="ts">
import { computed } from "vue";
import { VAlert, VBtn } from "vuetify/components";
import { mdiOpenInNew, mdiRestart } from "@mdi/js";
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import { langAttr } from "../setup/setupI18n.js";
import { updatePair, updateText } from "./updateCopy.js";
import type { UpdateBannerModel } from "./updateModel.js";

/**
 * The persistent, non-blocking "ready to install" banner.
 *
 * Modelled on GitHub Desktop's: it sits in the layout rather than over it, it never takes
 * focus, it never gates anything, and it stays until the user acts on it. That persistence
 * is the point - the offer has to survive an hour of rendering so it can be taken at a
 * moment of the user's choosing, which is exactly what a toast that auto-dismisses cannot
 * do.
 *
 * What it never does is block. It is an `alert` region announced politely, not a dialog:
 * nothing behind it is disabled, `Escape` is not trapped, and the only two actions are
 * "install it now" and "not now".
 *
 * **Restart is visibly held while a render runs.** The main process refuses either way, but
 * a button that looks live and silently does nothing is indistinguishable from a broken
 * one, so the button goes disabled and the body text changes to say why. The version number
 * in that copy is interpolated after the funny level has chosen the sentence, so no level
 * can touch it.
 */
const props = defineProps<{
    model: UpdateBannerModel;
    /** Set while the restart request is in flight, so it cannot be pressed twice. */
    busy?: boolean;
}>();

const emit = defineEmits<{
    (event: "restart"): void;
    (event: "dismiss"): void;
    (event: "open-notes", url: string): void;
}>();

// `updatePair` owns the whole mode rule - which language leads, and whether there is a
// second one at all - so neither this component nor the settings row restates it.
const titlePair = computed(() => updatePair(props.model.titleKey, props.model.vars));
const bodyPair = computed(() => updatePair(props.model.bodyKey, props.model.vars));

const restartLabel = computed(() => updateText("update.action.restart"));
const laterLabel = computed(() => updateText("update.action.later"));
const notesLabel = computed(() => updateText("update.action.notes"));
const dismissLabel = computed(() => updateText("update.action.dismiss"));

function onRestart(): void {
    if (!props.model.canRestart || props.busy === true) return;
    emit("restart");
}

function onNotes(): void {
    const url = props.model.notesUrl;
    if (url !== null) emit("open-notes", url);
}
</script>

<template>
    <v-alert
        v-if="props.model.visible"
        :type="props.model.tone === 'warning' ? 'warning' : 'success'"
        variant="tonal"
        density="comfortable"
        role="status"
        aria-live="polite"
        class="mb-update-banner"
    >
        <ActionArtwork artwork="restartToInstall" :alt="updateText('update.artwork.restartAlt')" />
        <div class="mb-update-banner__text">
            <p class="mb-update-banner__title">{{ titlePair.primary }}</p>
            <p
                v-if="titlePair.secondary !== null"
                class="mb-update-banner__secondary"
                :lang="langAttr('yue')"
            >
                {{ titlePair.secondary }}
            </p>
            <p class="mb-update-banner__body">{{ bodyPair.primary }}</p>
            <p
                v-if="bodyPair.secondary !== null"
                class="mb-update-banner__secondary"
                :lang="langAttr('yue')"
            >
                {{ bodyPair.secondary }}
            </p>
        </div>

        <div class="mb-update-banner__actions">
            <v-btn
                :prepend-icon="mdiRestart"
                :disabled="!props.model.canRestart || props.busy === true"
                :loading="props.busy === true"
                variant="tonal"
                class="mb-update-banner__restart"
                @click="onRestart"
            >
                {{ restartLabel }}
            </v-btn>
            <v-btn
                v-if="props.model.notesUrl !== null"
                :prepend-icon="mdiOpenInNew"
                variant="text"
                class="mb-update-banner__notes"
                @click="onNotes"
            >
                {{ notesLabel }}
            </v-btn>
            <v-btn
                variant="text"
                class="mb-update-banner__later"
                :aria-label="dismissLabel"
                @click="emit('dismiss')"
            >
                {{ laterLabel }}
            </v-btn>
        </div>
    </v-alert>
</template>

<style>
.mb-update-banner {
    display: flex;
    /* Grows downward at a narrow width rather than clipping the buttons off the end,
       which is what a single row does at 800px in bilingual mode. */
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 16px;
    overflow-wrap: anywhere;
}

.mb-update-banner__text {
    flex: 1 1 18rem;
    min-width: 0;
}

.mb-update-banner .mb-action-artwork {
    flex: 1 1 18rem;
    max-inline-size: 24rem;
    margin: 0;
    aspect-ratio: 16 / 9;
}

.mb-update-banner__title {
    margin: 0;
    font-weight: 600;
    text-wrap: pretty;
}

.mb-update-banner__body {
    margin: 4px 0 0;
    font-size: 0.875rem;
    text-wrap: pretty;
}

.mb-update-banner__secondary {
    margin: 2px 0 0;
    font-size: 0.75rem;
    line-height: 1.5;
    opacity: 0.85;
    text-wrap: pretty;
}

.mb-update-banner__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-update-banner__actions .v-btn {
    /* An adequate target at every supported display scale. */
    min-height: 40px;
}

@media (max-width: 720px) {
    .mb-update-banner .mb-action-artwork {
        flex-basis: 100%;
        max-inline-size: none;
    }
}
</style>
