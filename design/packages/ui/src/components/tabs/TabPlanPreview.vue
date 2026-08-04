<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert } from "vuetify/components";
import { groupsEmptiedBy, type TabClosePlan } from "./closePlans.js";
import type { TabStripState } from "./tabModel.js";

/**
 * A close plan, read out loud, before anything closes.
 *
 * Every bulk close in this folder renders this: the two text actions, close
 * others, and close to either edge. One component rather than one per action,
 * because the contract's requirements are the same for all of them - state the
 * matching mode, state the scope, state the affected count, show a reviewable
 * list, and name what was protected - and five copies of that would be five
 * chances for one of them to quietly omit the pinned line.
 *
 * It renders the plan and computes nothing of its own beyond which groups the
 * plan would empty, so what a person reads here is literally the object that
 * gets applied. A preview that recalculated the set could disagree with the
 * close by a tab, which is the failure this arrangement makes impossible.
 */
const props = defineProps<{ strip: TabStripState; plan: TabClosePlan }>();

const { t } = useI18n();

/** At most this many labels are listed before the preview says how many more. */
const PREVIEW_LIMIT = 8;

const previewLabels = computed(() => props.plan.selected.slice(0, PREVIEW_LIMIT).map((hit) => hit.label));
const previewMore = computed(() => Math.max(0, props.plan.selected.length - PREVIEW_LIMIT));
const protectedLabels = computed(() => props.plan.protectedPinned.map((entry) => entry.hit.label));
const unsavedLabels = computed(() => props.plan.unsaved.map((entry) => entry.hit.label));
const emptiedGroupNames = computed(() =>
    groupsEmptiedBy(props.strip, props.plan).map((group) => group.name),
);

/** "In this group" or "across the strip", so the scope is never left implied. */
const scopeLine = computed(() => {
    const scope = props.plan.scope;
    return scope.kind === "group"
        ? t("tabs.close.scopeGroup", { group: scope.groupName }, "Inside the group {group} only")
        : t("tabs.close.scopeStrip", "Across this whole tab strip");
});

/** Null for the actions that take no query, where claiming a mode would be a lie. */
const modeLine = computed(() => {
    if (props.plan.mode === null) return "";
    return props.plan.mode === "regex"
        ? t("tabs.close.modeRegex", "Matching as a regular expression")
        : t("tabs.close.modeText", "Matching as plain text");
});

const countLine = computed(() =>
    t(
        "tabs.close.count",
        { affected: props.plan.selected.length, eligible: props.plan.eligible.length },
        "{affected} of {eligible} tabs would close",
    ),
);

const refusalLine = computed(() => {
    if (props.plan.refusal === "empty-query") {
        return t("tabs.close.needQuery", "Type something first. An empty search closes nothing.");
    }
    if (props.plan.refusal === "invalid-pattern") {
        return t(
            "tabs.close.badPattern",
            { error: props.plan.patternError ?? "" },
            "That pattern will not compile, so nothing will close: {error}",
        );
    }
    return "";
});
</script>

<template>
    <div class="mb-tabs-preview" role="status" aria-live="polite">
        <p class="mb-tabs-preview__line">{{ scopeLine }}</p>
        <p v-if="modeLine !== ''" class="mb-tabs-preview__line">{{ modeLine }}</p>

        <v-alert
            v-if="plan.refusal !== null"
            type="warning"
            density="compact"
            variant="tonal"
            class="mb-tabs-preview__alert"
        >
            {{ refusalLine }}
        </v-alert>

        <template v-else>
            <p class="mb-tabs-preview__line mb-tabs-preview__line--strong">{{ countLine }}</p>

            <ul v-if="plan.selected.length > 0" class="mb-tabs-preview__list">
                <li v-for="label in previewLabels" :key="label">{{ label }}</li>
                <li v-if="previewMore > 0">
                    {{ t("tabs.close.more", { more: previewMore }, "and {more} more") }}
                </li>
            </ul>

            <p v-if="protectedLabels.length > 0" class="mb-tabs-preview__line">
                {{
                    t(
                        "tabs.close.protected",
                        { count: protectedLabels.length, labels: protectedLabels.join(", ") },
                        "{count} pinned tabs are protected and stay open: {labels}",
                    )
                }}
            </p>

            <p v-if="unsavedLabels.length > 0" class="mb-tabs-preview__line">
                {{
                    t(
                        "tabs.close.unsaved",
                        { labels: unsavedLabels.join(", ") },
                        "These hold unsaved work: {labels}",
                    )
                }}
            </p>

            <p v-if="emptiedGroupNames.length > 0" class="mb-tabs-preview__line">
                {{
                    t(
                        "tabs.close.wouldEmpty",
                        { groups: emptiedGroupNames.join(", ") },
                        "This would empty the groups {groups}",
                    )
                }}
            </p>
        </template>
    </div>
</template>

<style>
.mb-tabs-preview {
    margin-block: 8px;
}

.mb-tabs-preview__line,
.mb-tabs-preview__list {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tabs-preview__line--strong {
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.mb-tabs-preview__list {
    margin: 4px 0 4px 18px;
    max-height: 8.5rem;
    overflow-y: auto;
}

.mb-tabs-preview__alert {
    margin-block: 6px;
}
</style>
