<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VIcon, VList, VListItem } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { type TabMenuItem } from "./tabMenus.js";

/**
 * A context menu's rows, with its own filter field and its shortcuts on show.
 *
 * Shared by the tab menu and the group menu so both obey the two rules that
 * apply to every context menu in this application: a keyboard-reachable search
 * that filters the visible items locally without changing what any of them does,
 * and the working keyboard shortcut displayed beside the item that has one.
 *
 * The field is the project's own search field, so the anchored regex builder
 * arrives with it. That is the contract - every search bar in this application
 * offers the builder, context menus included - and it is worth saying why the
 * obvious objection does not win: a builder is a larger surface than the menu it
 * searches, which argues for opening it rarely, not for withholding it. It is a
 * disclosure behind an affordance, so a menu of eight rows costs nothing extra
 * until somebody asks for it, and the person who wants to close every tab whose
 * name ends in a digit is not told that this particular field is the one that
 * cannot do it. Plain text stays the default here as everywhere else.
 */
const props = defineProps<{
    items: readonly TabMenuItem[];
    /** Names the menu for assistive technology, e.g. the tab or group it belongs to. */
    label: string;
}>();

const emit = defineEmits<{ choose: [id: string] }>();

const { t } = useI18n();

const query = ref("");

const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shown = computed(() => props.items.filter((item) => matcher.value.test(item.label)));

/** What the builder previews against: the rows themselves, one per line. */
const sample = computed(() => props.items.map((item) => item.label).join("\n"));
</script>

<template>
    <div class="mb-tabs-menu">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            :label="t('tabs.menu.filter', 'Filter these commands')"
            :sample="sample"
            class="mb-tabs-menu__filter"
        />

        <p v-if="shown.length === 0" class="mb-tabs-menu__empty" role="status">
            {{ t("tabs.menu.noMatch", "No command here matches that. Clearing the filter brings them all back.") }}
        </p>

        <v-list v-else density="compact" :aria-label="label" class="mb-tabs-menu__list">
            <v-list-item
                v-for="item in shown"
                :key="item.id"
                :class="{ 'mb-tabs-menu__item--danger': item.danger }"
                @click="emit('choose', item.id)"
            >
                <template #prepend>
                    <v-icon :icon="item.icon" size="18" aria-hidden="true" />
                </template>
                <span class="mb-tabs-menu__label">{{ item.label }}</span>
                <template v-if="item.shortcut !== null" #append>
                    <!--
                        `kbd` rather than a styled span so the keys are exposed as
                        keys, and the item's own accessible name already carries
                        the label, so this is not announced twice as prose.
                    -->
                    <kbd class="mb-tabs-menu__keys">{{ item.shortcut }}</kbd>
                </template>
            </v-list-item>
        </v-list>
    </div>
</template>

<style>
.mb-tabs-menu {
    min-width: 260px;
}

.mb-tabs-menu__filter {
    margin: 8px 8px 4px;
}

.mb-tabs-menu__list {
    background: transparent;
}

.mb-tabs-menu__label {
    font-size: 0.875rem;
}

.mb-tabs-menu__item--danger .mb-tabs-menu__label {
    color: rgb(var(--v-theme-error));
}

.mb-tabs-menu__keys {
    margin-inline-start: 16px;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    white-space: nowrap;
}

.mb-tabs-menu__empty {
    padding: 8px 12px 12px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
