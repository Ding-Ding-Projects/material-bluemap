<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VIcon, VList, VListItem, VTooltip } from "vuetify/components";
import { mdiCircleMedium } from "@mdi/js";
import type { BlueMapApp } from "@material-bluemap/viewer";
import MenuSearchBar from "./MenuSearchBar.vue";
import { useMenuSearch } from "./menuPrefs";
import { createMatcher } from "./regex";
import { useBlueMap } from "./useBlueMap";

/**
 * The Maps page. Replaces upstream `Menu/MapButton.vue` (one row per map) and the `v-for`
 * that produced them in `Menu/MainMenu.vue`.
 *
 * The sky dot keeps its per-map colour: that is functional data colour taken straight from
 * `map.skyColor`, not chrome, so it does not become an MD3 token.
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

const app = useBlueMap(() => props.bluemap);
const { t } = useI18n();

const search = useMenuSearch("maps");
const matcher = computed(() => createMatcher(search.query, search.regex, search.flags));

const maps = computed(() => app.value?.appState.maps ?? []);

const visibleMaps = computed(() =>
    maps.value.filter((map) => matcher.value.test(map.name) || matcher.value.test(map.id)),
);

const selectedMapId = computed(() => app.value?.mapViewer.data.map?.id ?? null);

const selection = computed<unknown[]>({
    get: () => (selectedMapId.value === null ? [] : [selectedMapId.value]),
    set: (value) => {
        const id = value[0];
        if (typeof id === "string") switchMap(id);
    },
});

const sample = computed(() => maps.value.map((map) => map.name).join("\n"));

const summary = computed(() => {
    if (!search.query) return "";
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
    // the fallback as a message too and consumes `{shown}` and `{total}` as its own named
    // parameters, so a later `replace` finds nothing left and the summary reads " of ".
    return t(
        "search.summary",
        { shown: visibleMaps.value.length, total: maps.value.length },
        "{shown} of {total}",
    );
});

function skyStyle(sky: { r: number; g: number; b: number }): Record<string, string> {
    const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
    return { color: `rgb(${channel(sky.r)}, ${channel(sky.g)}, ${channel(sky.b)})` };
}

function switchMap(mapId: string): void {
    const instance = app.value;
    if (!instance || mapId === selectedMapId.value) return;
    void instance.switchMap(mapId).catch((error: unknown) => {
        console.error("[BlueMap] Failed to switch map", error);
    });
}
</script>

<template>
    <div class="mb-maps-menu">
        <MenuSearchBar
            v-if="maps.length"
            :state="search"
            :label="t('search.button', 'Search')"
            :placeholder="t('markers.searchPlaceholder', 'Search...')"
            :sample="sample"
            :summary="summary"
        />

        <p v-if="!maps.length" class="mb-maps-menu__empty">
            {{ t("map.unloaded", "No map loaded.") }}
        </p>

        <p v-else-if="!visibleMaps.length" class="mb-maps-menu__empty">
            {{ t("search.noMatch", "Nothing matches that search.") }}
        </p>

        <v-list
            v-else
            v-model:selected="selection"
            class="mb-maps-menu__list"
            density="compact"
            selectable
            mandatory
            select-strategy="single-independent"
            :aria-label="t('maps.title', 'Maps')"
        >
            <v-list-item
                v-for="map in visibleMaps"
                :key="map.id"
                :value="map.id"
                :title="map.name"
                rounded="lg"
            >
                <template #prepend>
                    <v-icon
                        :icon="mdiCircleMedium"
                        :style="skyStyle(map.skyColor)"
                        aria-hidden="true"
                    />
                </template>
                <v-tooltip activator="parent" location="end" :text="map.id" />
            </v-list-item>
        </v-list>
    </div>
</template>

<style>
.mb-maps-menu__empty {
    padding: 12px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-maps-menu__list .v-list-item__content {
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-maps-menu__list .v-list-item {
    min-height: 44px;
}
</style>
