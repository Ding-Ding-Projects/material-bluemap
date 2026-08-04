<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloseBoxMultipleOutline, mdiPinOutline } from "@mdi/js";
import { VBtn, VSwitch } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import TabPlanPreview from "./TabPlanPreview.vue";
import { groupsEmptiedBy, type TabClosePlan } from "./closePlans.js";
import type { TabStripState } from "./tabModel.js";

/**
 * The preview and gate for a bulk close that has no query of its own: close
 * others, close to the left, close to the right.
 *
 * These are bulk closes too, so they get the same treatment as the text ones -
 * pinned tabs out of scope until the user says otherwise, unsaved work named
 * rather than swept up, an affected count and a reviewable list before anything
 * happens, and the project's super-confirmation as the last step. A menu item
 * that closed nine tabs the instant it was clicked would satisfy nothing in the
 * contract and would be the most dangerous control in the application.
 *
 * `build` rather than a finished plan, because the plan changes when the pinned
 * choice changes and the caller is the only thing that knows which action this
 * is. The strip passes a one-line closure over `planCloseOthers` or
 * `planCloseToEdge`, so this component stays ignorant of which one it is showing.
 */
const props = defineProps<{
    strip: TabStripState;
    /** Names the action, both as the heading and inside the gate. */
    title: string;
    /** Rebuilds the plan whenever the pinned choice changes. */
    build: (includePinned: boolean) => TabClosePlan;
}>();

const emit = defineEmits<{
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

const includePinned = ref(false);
const closeUnsaved = ref(false);
const keepEmptyGroups = ref(false);

const plan = computed(() => props.build(includePinned.value));

const emptiedGroupNames = computed(() => groupsEmptiedBy(props.strip, plan.value).map((group) => group.name));

const gateAffected = computed<readonly string[]>(() => {
    const unsaved = new Set(plan.value.unsaved.map((entry) => entry.hit.tabId));
    return plan.value.selected.map((hit) => {
        if (hit.pinned) return t("tabs.close.itemPinned", { label: hit.label }, "{label} (pinned)");
        if (unsaved.has(hit.tabId)) {
            return closeUnsaved.value
                ? t("tabs.close.itemUnsavedGoing", { label: hit.label }, "{label} (unsaved work, will be lost)")
                : t("tabs.close.itemUnsavedKept", { label: hit.label }, "{label} (unsaved work, stays open)");
        }
        return hit.label;
    });
});

const gateAction = computed(() => {
    const held = plan.value.unsaved.length;
    const closing = closeUnsaved.value ? plan.value.selected.length : plan.value.selected.length - held;

    let sentence = t(
        "tabs.close.gateAction",
        { closing },
        "{closing} tabs close now. Closing a tab cannot be undone from here.",
    );
    if (held > 0 && !closeUnsaved.value) {
        sentence +=
            " " + t("tabs.close.gateHeld", { held }, "{held} holding unsaved work stay open and are reported.");
    }
    if (emptiedGroupNames.value.length > 0 && !keepEmptyGroups.value) {
        sentence +=
            " " +
            t(
                "tabs.close.gateGroups",
                { groups: emptiedGroupNames.value.join(", ") },
                "This empties and removes the groups {groups}.",
            );
    }
    return sentence;
});

function run(): void {
    if (!plan.value.runnable) return;
    emit("apply", plan.value, {
        closeUnsaved: closeUnsaved.value,
        keepEmptyGroups: keepEmptyGroups.value,
    });
}
</script>

<template>
    <section class="mb-tabs-confirm" role="group" :aria-label="title">
        <h5 class="mb-tabs-confirm__heading">{{ title }}</h5>

        <v-switch
            v-model="includePinned"
            :label="t('tabs.close.includePinned', 'Include pinned tabs')"
            :prepend-icon="mdiPinOutline"
            color="error"
            density="compact"
            hide-details
            inset
        />

        <v-switch
            v-if="plan.unsaved.length > 0"
            v-model="closeUnsaved"
            :label="t('tabs.close.closeUnsaved', 'Also close tabs holding unsaved work')"
            color="error"
            density="compact"
            hide-details
            inset
        />

        <v-switch
            v-if="emptiedGroupNames.length > 0"
            v-model="keepEmptyGroups"
            :label="t('tabs.close.keepGroups', 'Keep a group this empties')"
            density="compact"
            hide-details
            inset
        />

        <TabPlanPreview :strip="strip" :plan="plan" />

        <ConfigSuperConfirm
            :title="title"
            :action="gateAction"
            :affected="gateAffected"
            :confirm-label="title"
            :disabled="!plan.runnable"
            @confirm="run"
        >
            <template #activator="{ props: gateProps }">
                <v-btn
                    v-bind="gateProps"
                    :prepend-icon="mdiCloseBoxMultipleOutline"
                    color="error"
                    variant="tonal"
                    size="small"
                >
                    {{ title }}
                </v-btn>
            </template>
        </ConfigSuperConfirm>
    </section>
</template>

<style>
.mb-tabs-confirm {
    min-width: 300px;
    padding: 12px;
}

.mb-tabs-confirm__heading {
    font-size: 0.875rem;
    font-weight: 500;
    margin-block-end: 4px;
}
</style>
