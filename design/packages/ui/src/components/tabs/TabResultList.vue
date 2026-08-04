<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiClose, mdiPin, mdiPinOffOutline, mdiTabUnselected } from "@mdi/js";
import { VBtn, VChip, VIcon } from "vuetify/components";
import { actionsFor, type TabHit } from "./tabSearch.js";

/**
 * The rows a tab search returns, wherever the search was run from.
 *
 * Shared by the strip search, the per-group search and the master search, which
 * is the point: a result row means the same thing and offers the same actions
 * whichever field produced it. What differs between those searches is the scope,
 * and the scope is a property of the query rather than of the row.
 *
 * **Every row says where it is.** Two tabs called "Settings" in two windows are
 * otherwise indistinguishable, so the window, the strip, the group and the
 * pinned state are chips beside the label rather than something a person has to
 * infer. `showLocation` turns the window and strip chips off for a search that
 * cannot leave one strip, where repeating them on every row is noise.
 *
 * **A result in a collapsed group says so, and activating it does not un-collapse
 * the group permanently.** The host adds the group to its runtime revealed set;
 * the saved preference is untouched. See `isGroupExpanded` in `tabModel.ts`.
 *
 * **Only the valid actions are drawn.** `actionsFor` decides, so an unpinned tab
 * never shows an Unpin that would do nothing. A control that cannot perform its
 * labelled action is a defect in this project, not a greyed-out convenience.
 */
withDefaults(
    defineProps<{
        hits: readonly TabHit[];
        /** Shown in place of the list when the search matched nothing. */
        emptyMessage: string;
        /** False for a search that cannot leave one strip, where the chips repeat. */
        showLocation?: boolean;
    }>(),
    { showLocation: true },
);

const emit = defineEmits<{
    /** Select this tab, reveal it if it is inside a collapsed group, and focus it. */
    activate: [hit: TabHit];
    pin: [hit: TabHit];
    unpin: [hit: TabHit];
    ungroup: [hit: TabHit];
    close: [hit: TabHit];
}>();

const { t } = useI18n();

function act(action: string, hit: TabHit): void {
    if (action === "activate") emit("activate", hit);
    else if (action === "pin") emit("pin", hit);
    else if (action === "unpin") emit("unpin", hit);
    else if (action === "ungroup") emit("ungroup", hit);
    else if (action === "close") emit("close", hit);
}
</script>

<template>
    <p v-if="hits.length === 0" class="mb-tabs-results__empty" role="status">{{ emptyMessage }}</p>

    <ul v-else class="mb-tabs-results">
        <li v-for="hit in hits" :key="`${hit.stripId}:${hit.tabId}`" class="mb-tabs-results__row">
            <v-btn
                class="mb-tabs-results__go"
                variant="text"
                size="small"
                block
                @click="emit('activate', hit)"
            >
                <span class="mb-tabs-results__label">{{ hit.label }}</span>
            </v-btn>

            <div class="mb-tabs-results__meta">
                <v-chip v-if="showLocation" size="x-small" variant="outlined">{{ hit.windowLabel }}</v-chip>
                <v-chip v-if="showLocation" size="x-small" variant="outlined">{{ hit.stripLabel }}</v-chip>
                <v-chip v-if="hit.groupName !== null" size="x-small" variant="tonal">
                    {{ hit.groupName }}
                </v-chip>
                <v-chip v-if="hit.groupCollapsed" size="x-small" variant="outlined">
                    {{ t("tabs.find.collapsed", "in a collapsed group") }}
                </v-chip>
                <v-chip v-if="hit.pinned" size="x-small" variant="outlined">
                    <v-icon :icon="mdiPin" size="12" start aria-hidden="true" />
                    {{ t("tabs.find.pinned", "pinned") }}
                </v-chip>

                <span class="mb-tabs-results__spacer" />

                <template v-for="action in actionsFor(hit)" :key="action">
                    <v-btn
                        v-if="action === 'pin'"
                        :icon="mdiPin"
                        :aria-label="t('tabs.action.pin', { label: hit.label }, 'Pin {label}')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        @click="act(action, hit)"
                    />
                    <v-btn
                        v-else-if="action === 'unpin'"
                        :icon="mdiPinOffOutline"
                        :aria-label="t('tabs.action.unpin', { label: hit.label }, 'Unpin {label}')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        @click="act(action, hit)"
                    />
                    <v-btn
                        v-else-if="action === 'ungroup'"
                        :icon="mdiTabUnselected"
                        :aria-label="
                            t('tabs.action.ungroup', { label: hit.label }, 'Take {label} out of its group')
                        "
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        @click="act(action, hit)"
                    />
                    <v-btn
                        v-else-if="action === 'close'"
                        :icon="mdiClose"
                        :aria-label="t('tabs.action.close', { label: hit.label }, 'Close {label}')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        @click="act(action, hit)"
                    />
                </template>
            </div>
        </li>
    </ul>
</template>

<style>
.mb-tabs-results {
    margin: 4px 0;
    padding: 0;
    list-style: none;
    max-height: 15rem;
    overflow-y: auto;
}

.mb-tabs-results__row {
    padding-block: 2px;
    border-radius: 8px;
}

.mb-tabs-results__row:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.mb-tabs-results__go {
    justify-content: flex-start;
    text-transform: none;
    letter-spacing: normal;
}

.mb-tabs-results__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mb-tabs-results__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding-inline: 8px 4px;
}

.mb-tabs-results__spacer {
    flex: 1 1 auto;
}

.mb-tabs-results__empty {
    font-size: 0.75rem;
    line-height: 1.5;
    padding-block: 6px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
