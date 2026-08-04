<script setup lang="ts">
import { useSetupI18n } from "../setup/setupI18n.js";
import DockedSurface from "../settings/DockedSurface.vue";
import EulaViewer from "./EulaViewer.vue";

/**
 * The licence viewer as a panel the user places.
 *
 * The second docked surface in the application, and the reason `DockedSurface` is a
 * wrapper rather than something bolted onto the settings sheet: this one wants to default
 * to the bottom edge, because a legal document is read in wide short lines and because a
 * left or right dock would sit on top of the settings sheet somebody opened it from.
 *
 * Its placement is remembered separately from every other panel's, it carries its own
 * chooser in its own title bar, and the global reset in Settings reaches it whether or not
 * it is open.
 *
 * The viewer itself is also embedded directly - in the first-run flow's licence step and
 * in the consent settings row - because those are surfaces the reader is already inside.
 * This is the standalone route: mount one in the shell and open it from anywhere.
 */
defineProps<{ open: boolean }>();

defineEmits<{ "update:open": [value: boolean] }>();

const i18n = useSetupI18n();
</script>

<template>
    <DockedSurface
        class="mb-eula-surface"
        surface-id="eula-viewer"
        :title="i18n.t('eula.viewerTitle')"
        :open="open"
        default-placement="bottom"
        :preferred-thickness="480"
        :preferred-width="720"
        :preferred-height="720"
        @update:open="$emit('update:open', $event)"
    >
        <div class="mb-eula-surface__body">
            <EulaViewer />
        </div>
    </DockedSurface>
</template>

<style>
.mb-eula-surface__body {
    padding: 16px;
}
</style>
