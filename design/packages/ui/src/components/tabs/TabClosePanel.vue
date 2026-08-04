<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloseBoxMultipleOutline, mdiPinOutline } from "@mdi/js";
import { VBtn, VSwitch } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import TabPlanPreview from "./TabPlanPreview.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { groupsEmptiedBy, planTextClose, type TabClosePlan } from "./closePlans.js";
import type { TabStripState } from "./tabModel.js";
import { groupSample, stripSample } from "./tabSearch.js";

/**
 * One direction of the text bulk close, with its own field and its own builder.
 *
 * It is a component rather than half of a bigger template for one reason: the
 * contract forbids the two directions sharing hidden state, and two component
 * instances cannot share state by accident. Every ref below is per instance, so
 * "containing" and "not containing" have separate queries, separate modes,
 * separate flags and separate pinned choices without anyone having to remember
 * to keep them apart.
 *
 * What the two instances *do* share is the predicate, and that is the point:
 * both call `planTextClose` with a matcher built the same way, and that function
 * applies the identical `matcher.test` to the identical eligible set, flipping
 * only the sign. See `closePlans.ts`.
 *
 * Nothing closes here. The plan is built, rendered as the preview, and emitted;
 * the host owns the strip. The preview and the close are therefore the same
 * object rather than two calculations that usually agree.
 */
const props = withDefaults(
    defineProps<{
        strip: TabStripState;
        direction: "containing" | "notContaining";
        /** Null for the whole strip, or a group id to keep this action inside it. */
        groupId?: string | null;
    }>(),
    { groupId: null },
);

const emit = defineEmits<{
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

/* This instance's own state. Nothing here is shared with the other direction. */
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");
const includePinned = ref(false);
const closeUnsaved = ref(false);
const keepEmptyGroups = ref(false);

const scopeId = computed(() => props.groupId ?? null);

/** The real corpus this builder previews against: the labels in scope, nothing else. */
const sample = computed(() =>
    scopeId.value === null ? stripSample(props.strip) : groupSample(props.strip, scopeId.value),
);

const plan = computed(() =>
    planTextClose(props.strip, {
        direction: props.direction,
        query: query.value,
        regexMode: regexMode.value,
        matcher: createSettingMatcher(query.value, regexMode.value, flags.value),
        includePinned: includePinned.value,
        groupId: scopeId.value,
    }),
);

const heading = computed(() =>
    props.direction === "containing"
        ? t("tabs.close.containing", "Close tabs containing text")
        : t("tabs.close.notContaining", "Close tabs not containing text"),
);

const fieldLabel = computed(() =>
    props.direction === "containing"
        ? t("tabs.close.containingField", "Close tabs whose label contains")
        : t("tabs.close.notContainingField", "Close tabs whose label does not contain"),
);

const emptiedGroupNames = computed(() => groupsEmptiedBy(props.strip, plan.value).map((group) => group.name));

/**
 * The affected list the gate shows, with the reason attached to each awkward one.
 *
 * A pinned tab that is only in scope because the user asked for it, and a tab
 * holding unsaved work, both read as ordinary rows without this. The gate is the
 * last surface before the tabs go, so it is where being explicit matters most.
 */
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

/**
 * The gate's one-sentence statement of what is about to happen.
 *
 * The funny level may restyle the voice of everything around it; these numbers
 * and names may not move, which is why they are interpolated as named arguments
 * rather than assembled from prose.
 */
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
    <section class="mb-tabs-close__panel" role="group" :aria-label="heading">
        <h5 class="mb-tabs-close__heading">{{ heading }}</h5>

        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            :label="fieldLabel"
            :placeholder="t('tabs.close.hint', 'part of a tab label')"
            :sample="sample"
        />

        <v-switch
            v-model="includePinned"
            :label="t('tabs.close.includePinned', 'Include pinned tabs')"
            :prepend-icon="mdiPinOutline"
            color="error"
            density="compact"
            hide-details
            inset
        />

        <!--
            Both of these appear only when they would actually change something.
            A switch offering to close unsaved work when nothing in the plan holds
            any is a control with no effect, which this project treats as a defect
            rather than as harmless.
        -->
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
            :title="heading"
            :action="gateAction"
            :affected="gateAffected"
            :confirm-label="heading"
            :disabled="!plan.runnable"
            @confirm="run"
        >
            <template #activator="{ props: gateProps }">
                <v-btn
                    v-bind="gateProps"
                    :prepend-icon="mdiCloseBoxMultipleOutline"
                    class="mb-tabs-close__go"
                    color="error"
                    variant="tonal"
                    size="small"
                >
                    {{ heading }}
                </v-btn>
            </template>
        </ConfigSuperConfirm>
    </section>
</template>

<style>
.mb-tabs-close__heading {
    margin-block: 8px 4px;
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-tabs-close__line,
.mb-tabs-close__list {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tabs-close__line--strong {
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.mb-tabs-close__preview {
    margin-block: 8px;
}

.mb-tabs-close__list {
    margin: 4px 0 4px 18px;
    max-height: 8.5rem;
    overflow-y: auto;
}

.mb-tabs-close__alert {
    margin-block: 6px;
}

.mb-tabs-close__go {
    margin-block-start: 4px;
}
</style>
