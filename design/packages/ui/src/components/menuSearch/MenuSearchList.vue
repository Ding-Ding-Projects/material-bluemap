<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VList, VListItem } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";

/**
 * One row a bare fixed-item menu can offer: an id the host maps back to whatever the row
 * actually does, the label filtered and rendered, and an optional reason the row is
 * temporarily unavailable (no active section, nothing selected, and so on).
 */
export interface MenuSearchItem {
    readonly id: string;
    readonly label: string;
    readonly disabled?: boolean;
}

/**
 * A small fixed-item command menu's own filter field, for every menu in this application
 * that used to be a bare `v-list` with no way to search it.
 *
 * `TabMenuList.vue` already gives the tab and group context menus a keyboard-reachable
 * local filter with a no-match state and Escape support; this is the same shape for
 * everything that was not built on that component -- the history comparison's "Export"
 * picker, the EULA viewer's "Export" picker, and the changelog viewer's "Copy" and "Export"
 * pickers. Filtering only ever hides rows: `shown` narrows what is rendered, never what an
 * item's `id` or `disabled` state is, so a chosen row still does exactly what it always did.
 *
 * ### Escape, in two steps
 *
 * With something typed, Escape clears the query and stops there -- `preventDefault` and
 * `stopPropagation` keep it from reaching the surrounding `v-menu`, so the full list comes
 * back rather than the whole menu vanishing out from under someone who only meant to see
 * the rest of it again. With nothing left to clear, Escape is left alone: it bubbles to the
 * `v-menu` hosting this list, which already closes itself on Escape by default, exactly the
 * behaviour every other filterable menu in this application relies on.
 *
 * ### What is announced
 *
 * The list carries the caller's own accessible name (`label`), the empty state is
 * `role="status"` so a screen reader hears it the moment filtering leaves nothing, and the
 * search field is the project's own `ConfigSearchField`, so the anchored regex builder
 * arrives with it -- the same contract every search bar in this application keeps.
 */
const props = defineProps<{
    items: readonly MenuSearchItem[];
    /** Names the list of rows for assistive technology, e.g. what the menu is for. */
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

function choose(item: MenuSearchItem): void {
    if (item.disabled === true) return;
    emit("choose", item.id);
}

/**
 * Escape clears before it closes. A query still in the field is consumed here and the
 * event is stopped in its tracks; an empty field means there is nothing left for this
 * component to do, so the keydown is left alone to reach the `v-menu` around it.
 */
function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (query.value === "") return;
    event.preventDefault();
    event.stopPropagation();
    query.value = "";
}
</script>

<template>
    <div class="mb-menu-search" @keydown="onKeydown">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            :label="t('menuSearch.filter', 'Filter these commands')"
            :sample="sample"
            class="mb-menu-search__filter"
        />

        <p v-if="shown.length === 0" class="mb-menu-search__empty" role="status">
            {{
                t(
                    "menuSearch.noMatch",
                    "No command here matches that. Clearing the search brings them all back.",
                )
            }}
        </p>

        <v-list v-else density="compact" :aria-label="label" class="mb-menu-search__list">
            <v-list-item
                v-for="item in shown"
                :key="item.id"
                :title="item.label"
                :disabled="item.disabled === true"
                @click="choose(item)"
            />
        </v-list>
    </div>
</template>

<style>
.mb-menu-search {
    min-width: 240px;
}

.mb-menu-search__filter {
    margin: 8px 8px 4px;
}

.mb-menu-search__list {
    background: transparent;
}

.mb-menu-search__empty {
    padding: 8px 12px 12px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
