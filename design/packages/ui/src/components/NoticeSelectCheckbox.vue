<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VCheckbox } from "vuetify/components";

/**
 * One row's pick-me box, in the notification centre's bulk-selection list.
 *
 * A native checkbox rather than a custom hit target: Tab reaches it, Space toggles it, and a
 * screen reader announces it as a checkbox with its own checked state for free. That native
 * behaviour is also what gives this component its keyboard path for a shift-extended range -
 * holding Shift while activating a control, by mouse or by keyboard, still fires a `click`
 * event with `shiftKey` true, so the same handler serves a mouse shift-click and a
 * keyboard-driven Shift+Space without this component having to reimplement either.
 *
 * `@click.prevent` stops the native checkbox from toggling itself before this component's
 * own `pick` event is heard: a shift-click has to run the range logic in
 * `noticeBulk.ts::rangeSelection` instead of the plain toggle a native checkbox would apply
 * on its own, and the parent is the one holding the selection, so `checked` only ever moves
 * once the parent says so.
 *
 * Lives outside `components/notifications/` on purpose - see `notificationsBulk.ts`'s file
 * header for why the components that call these keys have to sit somewhere
 * `catalogueCoverage.test.ts` does not hold to full coverage yet.
 */
const props = defineProps<{
    checked: boolean;
    /** The row's own short summary - a title or a message - filled into the accessible name. */
    summary: string;
}>();

const emit = defineEmits<{ pick: [shiftKey: boolean] }>();

const { t } = useI18n();

const label = computed(() =>
    t("noticeBulk.selectRow", { summary: props.summary }, "Select: {summary}"),
);

function onClick(event: MouseEvent): void {
    emit("pick", event.shiftKey);
}
</script>

<template>
    <v-checkbox
        class="mb-notice-select"
        :model-value="checked"
        :aria-label="label"
        density="compact"
        hide-details
        @click.prevent="onClick"
    />
</template>

<style>
/*
 * A real target even at compact density: this sits beside three or four other small buttons
 * in a row, and a checkbox smaller than the rest of the row is the one control in it a finger
 * keeps missing.
 */
.mb-notice-select {
    flex: 0 0 auto;
}

.mb-notice-select .v-selection-control {
    min-height: 40px;
    min-width: 40px;
}
</style>
