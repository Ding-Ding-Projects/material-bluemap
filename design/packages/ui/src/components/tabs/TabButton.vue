<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiPin } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import type { TabRecord } from "./tabModel.js";

/**
 * One tab, in whichever of the strip's three regions it lives.
 *
 * One component rather than three copies of the same markup, because the three
 * places a tab can appear - pinned, loose, inside a group - differ by two
 * attributes and are identical in every way that matters to a screen reader. The
 * copies drifted the moment one of them gained a close button.
 *
 * ### Why this is a `div` with `role="tab"` and not a `<button>`
 *
 * The close affordance has to sit inside the tab, and a `<button>` inside a
 * `<button>` is invalid HTML that browsers repair by moving the inner one out.
 * A `div` carrying `role="tab"` takes a real button as a child quite happily.
 * The cost is that Enter and Space are no longer free, so the strip's key
 * handler binds them; the benefit is that the close control is a genuine button
 * with a genuine accessible name rather than an icon pretending.
 *
 * The close button is out of the page's tab order on purpose. A tablist should
 * be one stop, not two per tab, so the keyboard path to closing is the
 * <kbd>Delete</kbd> key on the focused tab and the tab's own context menu -
 * both of which exist, and the menu shows the shortcut.
 *
 * ### Compact does not mean unnamed
 *
 * A pinned tab draws as its icon alone, and its `aria-label` still carries the
 * full label and the fact that it is pinned. What shrinks is the button, never
 * what is announced.
 */
const props = withDefaults(
    defineProps<{
        tab: TabRecord;
        /** DOM id, so the strip can move focus without a template ref per tab. */
        domId: string;
        active: boolean;
        /** The one tab in the strip that is in the page's tab order. */
        roving: boolean;
        /** The rendered panel, named only by the selected tab. */
        panelId: string;
        /** Icon only, full name in the accessible name. Pinned tabs, mostly. */
        compact?: boolean;
        pinned?: boolean;
    }>(),
    { compact: false, pinned: false },
);

const emit = defineEmits<{
    activate: [];
    close: [];
    menu: [event: MouseEvent];
    keydown: [event: KeyboardEvent];
    dragstart: [];
    drop: [];
}>();

const { t } = useI18n();

/**
 * The accessible name.
 *
 * Unsaved work is part of it rather than only a coloured dot, because a dot is
 * invisible to anyone not looking at it and this is the one state that changes
 * what closing the tab costs.
 */
const label = computed(() => {
    if (props.pinned && props.tab.dirty) {
        return t("tabs.strip.pinnedUnsaved", { label: props.tab.label }, "{label}, pinned, unsaved work");
    }
    if (props.pinned) return t("tabs.strip.pinnedTab", { label: props.tab.label }, "{label}, pinned");
    if (props.tab.dirty) return t("tabs.strip.unsavedTab", { label: props.tab.label }, "{label}, unsaved work");
    return props.tab.label;
});
</script>

<template>
    <div
        :id="domId"
        class="mb-tabs-strip__tab"
        :class="{
            'mb-tabs-strip__tab--active': active,
            'mb-tabs-strip__tab--compact': compact,
        }"
        role="tab"
        draggable="true"
        :aria-selected="active ? 'true' : 'false'"
        :aria-controls="active ? panelId : undefined"
        :aria-label="label"
        :title="tab.label"
        :tabindex="roving ? 0 : -1"
        @click="emit('activate')"
        @keydown="emit('keydown', $event)"
        @contextmenu="emit('menu', $event)"
        @dragstart="emit('dragstart')"
        @dragover.prevent
        @drop.prevent="emit('drop')"
    >
        <v-icon v-if="tab.icon !== null || pinned" :icon="tab.icon ?? mdiPin" size="16" aria-hidden="true" />
        <span v-if="!compact" class="mb-tabs-strip__label">{{ tab.label }}</span>
        <span v-if="tab.dirty" class="mb-tabs-strip__dot" aria-hidden="true" />
        <v-btn
            v-if="!compact"
            class="mb-tabs-strip__x"
            :icon="mdiClose"
            :aria-label="t('tabs.action.close', { label: tab.label }, 'Close {label}')"
            variant="text"
            size="x-small"
            density="comfortable"
            tabindex="-1"
            @click.stop="emit('close')"
        />
    </div>
</template>
