<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCheckboxMultipleMarkedOutline, mdiCheckboxMultipleBlankOutline, mdiSelectInverse } from "@mdi/js";
import { VBtn, VCheckbox, VChip } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { WorldDimension } from "./worldFolder.js";

/**
 * Every dimension a world has, offered as a real list rather than as one dropdown.
 *
 * `MapIdentityStep.vue`'s own `<v-select>` still picks *the* dimension being named and
 * tuned in the rest of the wizard - that has not changed, and one map still needs one
 * set of answers. This is the piece that used to be missing entirely: a world with a
 * Nether and an End, or a heavily modded one with a dozen datapack dimensions, listed
 * every one of them here, so choosing them all does not mean running the wizard once
 * per dimension by hand. Every dimension ticked here renders alongside the primary map,
 * each starting from BlueMap's own template for its own dimension.
 *
 * The primary dimension appears in the list like any other - "detect every dimension
 * and show them" means all of them, including the one already chosen above - but its
 * own checkbox is disabled and says why: it is already included, as the map the rest of
 * this step is naming.
 *
 * A long list gets the same treatment as every other search surface in this app: its
 * own field, wired to the full regex builder through `ConfigSearchField`, plain text by
 * default. Bulk actions operate on whatever the search is currently showing, never on
 * dimensions a filter has hidden - "include 40 shown" should never silently reach the
 * 90 it filtered out.
 */
const props = defineProps<{
    dimensions: readonly WorldDimension[];
    /** The dimension `MapIdentityStep.vue`'s own selector is pointed at right now. */
    primaryKey: string;
    included: ReadonlySet<string>;
    /** False when nothing could read the world folder, so these are the vanilla three, not real. */
    dimensionsAreReal: boolean;
}>();

const emit = defineEmits<{
    include: [keys: readonly string[]];
    exclude: [keys: readonly string[]];
    invert: [keys: readonly string[]];
}>();

const { t } = useI18n();

function searchText(dimension: WorldDimension): string {
    const parts = [dimension.key, dimension.label, dimension.regionDirectory];
    parts.push(dimension.custom ? t("world.identity.customDimension", "Added by a mod or datapack") : t("world.identity.dimensionsVanillaBadge", "Vanilla dimension"));
    if (dimension.worldFolder !== undefined) parts.push(dimension.worldFolder);
    return parts.join(" ");
}

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shown = computed(() => props.dimensions.filter((dimension) => matcher.value.test(searchText(dimension))));

/** The real corpus, so the builder's preview and this list cannot disagree. */
const sample = computed(() => props.dimensions.map((dimension) => searchText(dimension)).join("\n"));

const summary = computed(() =>
    matcher.value.active
        ? t(
              "world.identity.dimensionsSearchSummary",
              { shown: shown.value.length, total: props.dimensions.length },
              "Showing {shown} of {total}",
          )
        : "",
);

/** The keys a bulk action actually touches: whatever is shown, minus the primary. */
const bulkKeys = computed(() => shown.value.filter((dimension) => dimension.key !== props.primaryKey).map((dimension) => dimension.key));

function isIncluded(dimension: WorldDimension): boolean {
    return dimension.key === props.primaryKey || props.included.has(dimension.key);
}

function toggle(dimension: WorldDimension, value: boolean | null): void {
    if (dimension.key === props.primaryKey) return;
    if (value === true) emit("include", [dimension.key]);
    else emit("exclude", [dimension.key]);
}

function regionsLabel(dimension: WorldDimension): string {
    return t("world.folder.regionCount", { n: dimension.regionFiles }, "{n} regions");
}
</script>

<template>
    <section class="mb-dimension-select" :aria-label="t('world.identity.dimensionsTitle', 'Also render these dimensions')">
        <h4 class="mb-dimension-select__title">{{ t("world.identity.dimensionsTitle", "Also render these dimensions") }}</h4>
        <p class="mb-dimension-select__blurb">
            {{
                t(
                    "world.identity.dimensionsBlurb",
                    "Every dimension this world has is listed below, with its region count. The Nether and the End start unticked, since rendering them is not always wanted, and a dimension added by a mod or datapack starts unticked too, since its size is not known in advance. Tick the ones to render as well; each becomes its own map, lit correctly for its dimension.",
                )
            }}
        </p>

        <p v-if="!dimensionsAreReal" class="mb-dimension-select__blurb" role="status">
            {{
                t(
                    "world.identity.guessedDimensions",
                    "These are the three vanilla dimensions rather than the ones this world has, because nothing could read the folder. A dimension the world has never generated renders an empty map.",
                )
            }}
        </p>

        <p
            v-else-if="dimensions.length <= 1"
            class="mb-dimension-select__blurb"
            role="status"
            data-test="only-overworld"
        >
            {{
                t(
                    "world.identity.dimensionsOnlyOverworld",
                    "This world only has the Overworld. There is nothing else to include.",
                )
            }}
        </p>

        <template v-else>
            <div class="mb-dimension-select__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('world.identity.dimensionsSearchLabel', 'Search these dimensions')"
                    :placeholder="t('world.identity.dimensionsSearchHint', 'a name, an id, or a region count')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <div v-if="bulkKeys.length > 0" class="mb-dimension-select__bulk">
                <v-btn
                    :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="emit('include', bulkKeys)"
                >
                    {{ t("world.identity.dimensionsIncludeShown", { n: bulkKeys.length }, "Include {n} shown") }}
                </v-btn>
                <v-btn
                    :prepend-icon="mdiCheckboxMultipleBlankOutline"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="emit('exclude', bulkKeys)"
                >
                    {{ t("world.identity.dimensionsExcludeShown", { n: bulkKeys.length }, "Exclude {n} shown") }}
                </v-btn>
                <v-btn
                    :prepend-icon="mdiSelectInverse"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="emit('invert', bulkKeys)"
                >
                    {{ t("world.identity.dimensionsInvert", "Invert shown") }}
                </v-btn>
            </div>

            <p v-if="shown.length === 0" class="mb-dimension-select__blurb" role="status">
                {{
                    t(
                        "world.identity.dimensionsNoMatch",
                        "No dimension matches that search. Clearing it brings the whole list back.",
                    )
                }}
            </p>

            <ul v-else class="mb-dimension-select__list">
                <li v-for="dimension in shown" :key="dimension.key" class="mb-dimension-select__row">
                    <!--
                        The disabled reason is a permanently visible sentence rather than a
                        hover-only tooltip, matching this app's own established rule: a fact
                        reachable only by hovering is not reachable by simply reading the
                        panel, and every disabled control here names its exact unmet condition
                        in text, not just to a mouse.
                    -->
                    <v-checkbox
                        :model-value="isIncluded(dimension)"
                        :disabled="dimension.key === primaryKey"
                        :label="dimension.label"
                        color="primary"
                        density="compact"
                        hide-details="auto"
                        @update:model-value="(value: boolean | null) => toggle(dimension, value)"
                    />
                    <span
                        v-if="dimension.key === primaryKey"
                        class="mb-dimension-select__reason"
                    >
                        {{
                            t(
                                "world.identity.dimensionsPrimaryReason",
                                "This is the map you are customising above; it is always included.",
                            )
                        }}
                    </span>
                    <div class="mb-dimension-select__facts">
                        <v-chip size="x-small" variant="outlined">{{ dimension.key }}</v-chip>
                        <v-chip size="x-small" variant="tonal">
                            {{
                                dimension.custom
                                    ? t("world.identity.customDimension", "Added by a mod or datapack")
                                    : t("world.identity.dimensionsVanillaBadge", "Vanilla dimension")
                            }}
                        </v-chip>
                        <v-chip size="x-small" variant="tonal">{{ regionsLabel(dimension) }}</v-chip>
                        <v-chip v-if="dimension.worldFolder !== undefined" size="x-small" variant="tonal" data-test="external-chip">
                            {{ t("world.identity.dimensionsExternalBadge", { folder: dimension.worldFolder }, "Stored in a sibling folder: {folder}") }}
                        </v-chip>
                    </div>
                </li>
            </ul>
        </template>
    </section>
</template>

<style>
.mb-dimension-select {
    margin-block-start: 20px;
    padding-block-start: 12px;
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-dimension-select__title {
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.4;
}

.mb-dimension-select__blurb {
    margin-block-start: 4px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-dimension-select__search {
    margin-block-start: 10px;
    max-width: 420px;
}

.mb-dimension-select__bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-block-start: 8px;
}

.mb-dimension-select__list {
    margin-block-start: 8px;
    padding: 0;
    list-style: none;
    max-height: 320px;
    overflow-y: auto;
}

.mb-dimension-select__row {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    column-gap: 12px;
    row-gap: 2px;
    padding: 6px 4px;
}

.mb-dimension-select__row + .mb-dimension-select__row {
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.mb-dimension-select__reason {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    flex: 1 1 200px;
}

.mb-dimension-select__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex-basis: 100%;
    margin-inline-start: 34px;
    max-inline-size: 100%;
}

/*
    A sibling folder's own absolute path can be long, and this chip's whole point is to
    show it in full rather than truncate the one fact that tells someone where their data
    really lives. Vuetify's own chip content is nowrap by default, which at a narrow width
    or a high display scale would push the chip past the row rather than wrap inside it.
*/
.mb-dimension-select__facts .v-chip {
    max-inline-size: 100%;
    height: auto;
}

.mb-dimension-select__facts .v-chip :deep(.v-chip__content) {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.4;
    padding-block: 2px;
}
</style>
