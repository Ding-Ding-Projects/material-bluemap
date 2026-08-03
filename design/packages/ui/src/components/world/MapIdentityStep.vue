<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VChip, VListItem, VSelect, VTextField } from "vuetify/components";
import { MAP_ID_MAX_LENGTH, MAP_ID_PATTERN, suggestMapId } from "./wizardModel.js";
import type { WorldDimension } from "./worldFolder.js";

/**
 * Step two: what the map is called, and which dimension of the world it is.
 *
 * The id is not cosmetic. It becomes a folder name on disk and a path segment in
 * the address the tiles are served from, and the engine refuses one outside its
 * own character set before it writes anything. So it is checked here, where it
 * was typed, rather than at the end of the wizard.
 *
 * The dimension list is the dimensions this world actually has, when the folder
 * could be read. Offering the nether for a world nobody has ever been to the
 * nether in produces a render of nothing, reported as a success.
 */
const props = defineProps<{
    displayName: string;
    mapId: string;
    idFollowsName: boolean;
    dimensionKey: string;
    sorting: number;
    dimensions: readonly WorldDimension[];
    /** False when nothing could read the world folder, so these are the vanilla three. */
    dimensionsAreReal: boolean;
}>();

const emit = defineEmits<{
    "update:displayName": [value: string];
    "update:mapId": [value: string];
    "update:idFollowsName": [value: boolean];
    "update:sorting": [value: number];
    /** Chooses a dimension, which also resets the preset and the sort order. */
    chooseDimension: [key: string];
}>();

const { t } = useI18n();

const name = computed<string>({
    get: () => props.displayName,
    set: (value) => {
        emit("update:displayName", value);
        // The id follows the name until somebody edits the id. After that it is
        // theirs, and quietly rewriting it as they keep typing the name would
        // undo a deliberate choice.
        if (props.idFollowsName) emit("update:mapId", suggestMapId(value));
    },
});

const id = computed<string>({
    get: () => props.mapId,
    set: (value) => {
        emit("update:idFollowsName", false);
        emit("update:mapId", value);
    },
});

const sortValue = computed<number>({
    get: () => props.sorting,
    set: (value) => emit("update:sorting", Number.isFinite(value) ? value : 0),
});

const idError = computed(() => {
    const value = props.mapId.trim();
    if (value === "") return "";
    if (value.length > MAP_ID_MAX_LENGTH) {
        return t("world.identity.idTooLong", "At most {max} characters.").replace("{max}", String(MAP_ID_MAX_LENGTH));
    }
    if (!MAP_ID_PATTERN.test(value)) {
        return t(
            "world.identity.idCharacters",
            "Lower-case letters, digits, hyphens and underscores only, starting with a letter or a digit.",
        );
    }
    return "";
});

const dimensionItems = computed(() =>
    props.dimensions.map((dimension) => ({
        value: dimension.key,
        title: dimension.label,
        subtitle: dimension.custom
            ? t("world.identity.customDimension", "Added by a mod or datapack")
            : dimension.regionFiles > 0
              ? t("world.identity.regionCount", "{n} region files on disk").replace("{n}", String(dimension.regionFiles))
              : t("world.identity.notChecked", "Not checked"),
    })),
);
</script>

<template>
    <section class="mb-world-step" :aria-label="t('world.wizard.step.identity', 'Name and dimension')">
        <h3 class="mb-world-step__title">{{ t("world.identity.title", "Name the map and pick its dimension") }}</h3>
        <p class="mb-world-step__blurb">
            {{
                t(
                    "world.identity.blurb",
                    "The name is what the map is called in the viewer, and can be changed at any time. The id is what it is called on disk and in its address, and changing it later means rendering it again.",
                )
            }}
        </p>

        <div class="mb-world-identity__grid">
            <v-text-field
                v-model="name"
                :label="t('world.identity.name', 'Map name')"
                :placeholder="t('world.identity.namePlaceholder', 'shown in the viewer')"
                variant="outlined"
                density="compact"
                hide-details="auto"
                autocomplete="off"
            />
            <v-text-field
                v-model="id"
                :label="t('world.identity.id', 'Map id')"
                :error-messages="idError"
                :hint="t('world.identity.idHint', 'Used as the folder name and in the address the tiles are served from.')"
                persistent-hint
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
            />
            <v-select
                :model-value="dimensionKey"
                :items="dimensionItems"
                :label="t('world.identity.dimension', 'Dimension')"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="compact"
                hide-details="auto"
                @update:model-value="(value: string) => emit('chooseDimension', value)"
            >
                <template #item="{ props: itemProps, item }">
                    <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
                </template>
            </v-select>
            <v-text-field
                v-model.number="sortValue"
                :label="t('world.identity.sorting', 'Sort order')"
                :hint="t('world.identity.sortingHint', 'A lower number puts this map earlier in the viewer\'s list.')"
                persistent-hint
                type="number"
                variant="outlined"
                density="compact"
            />
        </div>

        <v-alert v-if="!dimensionsAreReal" type="info" density="compact" variant="tonal" class="mt-3">
            {{
                t(
                    "world.identity.guessedDimensions",
                    "These are the three vanilla dimensions rather than the ones this world has, because nothing could read the folder. A dimension the world has never generated renders an empty map.",
                )
            }}
        </v-alert>

        <p class="mb-world-step__blurb mt-3">
            {{ t("world.identity.presetNote", "The map starts from BlueMap's own template for this dimension:") }}
            <v-chip size="x-small" variant="tonal" class="ml-1">{{ dimensionKey }}</v-chip>
            <span class="ml-1">
                {{
                    t(
                        "world.identity.presetDetail",
                        "which sets the sky colour, the void colour, the ambient light and the cave removal that suit it. Changing the dimension rewrites those and keeps every option you have changed yourself.",
                    )
                }}
            </span>
        </p>
    </section>
</template>

<style>
.mb-world-identity__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-block: 16px;
}
</style>
