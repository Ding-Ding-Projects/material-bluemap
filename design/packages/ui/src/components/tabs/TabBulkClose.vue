<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { VDivider } from "vuetify/components";
import TabClosePanel from "./TabClosePanel.vue";
import type { TabClosePlan } from "./closePlans.js";
import type { TabStripState } from "./tabModel.js";

/**
 * The two text bulk closes, together, wherever a searchable tab list appears.
 *
 * This is the pair the contract names, and it is deliberately thin: the whole of
 * each action lives in {@link TabClosePanel}, and mounting two of them is what
 * guarantees the two directions cannot share a query, a mode, a set of flags or
 * a pinned choice. The one thing they do share is `planTextClose`, which is the
 * single predicate both are built from.
 *
 * `groupId` scopes both panels at once, because a surface belongs to one scope:
 * the copy of this that opens from a group's menu closes tabs inside that group,
 * and says so in each panel's preview.
 */
defineProps<{
    strip: TabStripState;
    /** Null for the whole strip, or a group id when this sits inside a group's menu. */
    groupId?: string | null;
}>();

const emit = defineEmits<{
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

function forward(plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }): void {
    emit("apply", plan, options);
}
</script>

<template>
    <div class="mb-tabs-close">
        <h4 class="mb-tabs-close__title">{{ t("tabs.close.title", "Close many tabs at once") }}</h4>
        <p class="mb-tabs-close__note">
            {{
                t(
                    "tabs.close.note",
                    "Both actions look only at the label you can see on the tab, never at what the page is holding.",
                )
            }}
        </p>

        <TabClosePanel :strip="strip" :group-id="groupId ?? null" direction="containing" @apply="forward" />
        <v-divider class="mb-tabs-close__rule" />
        <TabClosePanel :strip="strip" :group-id="groupId ?? null" direction="notContaining" @apply="forward" />
    </div>
</template>

<style>
.mb-tabs-close {
    min-width: 300px;
}

.mb-tabs-close__title {
    font-size: 0.9375rem;
    font-weight: 500;
}

.mb-tabs-close__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tabs-close__rule {
    margin-block: 12px;
}
</style>
