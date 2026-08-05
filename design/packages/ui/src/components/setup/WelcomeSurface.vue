<script setup lang="ts">
import { mdiMapPlus } from "@mdi/js";
import { VBtn } from "vuetify/components";
import DockedSurface from "../settings/DockedSurface.vue";
import WelcomeIntro from "./WelcomeIntro.vue";
import { useSetupI18n } from "./setupI18n.js";

/**
 * "What is this?", as a panel the user places, standalone from first-run setup.
 *
 * The first-run flow answers this question once, inside a modal that never reappears
 * once setup is complete - by design, per `firstRunFlow.ts`'s own doc comment. That is
 * correct for the question "do you want to see this now", and wrong for "can I ever see
 * this again": the scouting pass this exists to fix explicitly asked for a surface that
 * "must stay reachable afterwards (Help/About or the docs browser)". This is that route,
 * modelled directly on `EulaSurface.vue` two directories over - the same
 * `DockedSurface.vue` wrapper, the same "mount one in the shell and open it from
 * anywhere" shape, opened from its own FAB in `App.vue` rather than only existing inside
 * the bundle. `WelcomeIntro.vue` is the shared body, so the words here are exactly the
 * words the welcome step showed, not a second, potentially drifting explanation.
 *
 * The one thing this panel has that the first-run step does not: a live "Start here"
 * button. The welcome step can only ever *say* where the wizard is, because it sits
 * inside a blocking modal opened before anybody has had a reason to navigate; this panel
 * is mounted beside the real tab strip, so its button can actually switch to it.
 */
defineProps<{ open: boolean }>();

const emit = defineEmits<{
    "update:open": [value: boolean];
    /** "Start here" was pressed: the caller switches to the "Make a map" tab. */
    start: [];
}>();

const i18n = useSetupI18n();

function onStart(): void {
    emit("start");
    emit("update:open", false);
}
</script>

<template>
    <DockedSurface
        class="mb-welcome-surface"
        surface-id="welcome-viewer"
        :title="i18n.t('welcome.viewerTitle')"
        :open="open"
        default-placement="bottom"
        :preferred-thickness="480"
        :preferred-width="720"
        :preferred-height="720"
        @update:open="$emit('update:open', $event)"
    >
        <div class="mb-welcome-surface__body">
            <WelcomeIntro />
            <v-btn
                class="mb-welcome-surface__start mb-interactive"
                variant="tonal"
                :prepend-icon="mdiMapPlus"
                @click="onStart"
            >
                {{ i18n.t("action.startHere") }}
            </v-btn>
        </div>
    </DockedSurface>
</template>

<style>
/*
 * A flex column filling `DockedSurface`'s own `.mb-docked__body`, matching the pattern
 * `EulaSurface.vue`'s own `.mb-eula-surface__body` documents: `WelcomeIntro.vue` wants a
 * real height handed down to it so its content can scroll while the title bar above it
 * stays in view, and the button stays reachable at the bottom rather than trailing off
 * the end of unbounded content.
 */
.mb-welcome-surface__body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1 1 auto;
    min-block-size: 0;
    padding: 16px;
    overflow-y: auto;
}

.mb-welcome-surface__start {
    align-self: flex-start;
}
</style>
