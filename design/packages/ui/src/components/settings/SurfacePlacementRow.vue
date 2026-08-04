<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VChip } from "vuetify/components";
import { mdiRestore } from "@mdi/js";

import { DOCK_PLACEMENTS, type DockPlacement } from "./dockPlacement.js";
import { dockPlacementLabel } from "./settingsCopy.js";
import {
    customisedSurfaceCount,
    dockedSurfaces,
    hasStoredPlacement,
    placementFor,
    resetAllDockPlacements,
    resetDockPlacement,
    setDockPlacement,
} from "./useDockPlacement.js";

/**
 * Every docked panel that is open, where it sits, and the one control that puts them all
 * back.
 *
 * Each panel already carries its own chooser in its own title bar, which is where somebody
 * changes one they are looking at. This row exists for the other case: a panel moved
 * somewhere awkward and then closed, or four of them moved over a month and no memory of
 * which. The global reset therefore clears the *stored* record rather than only the panels
 * listed here, because the one you cannot see is exactly the one you want reset.
 *
 * The list is of panels that exist right now rather than a written inventory of panels the
 * application is supposed to have. A written list goes stale, and its first wrong entry is
 * a row offering to move something that is not there.
 */
const { t } = useI18n();

const surfaces = dockedSurfaces();

const customised = computed(() => customisedSurfaceCount());

function placementLabel(value: DockPlacement): string {
    return dockPlacementLabel(t, value);
}

/** What the search bar on this surface can find this section by. */
function searchValues(): string[] {
    return [
        ...surfaces.value.map((surface) => surface.label),
        ...DOCK_PLACEMENTS.map(placementLabel),
    ];
}

defineExpose({ searchValues });
</script>

<template>
    <div class="mb-placement-row">
        <p v-if="surfaces.length === 0" class="mb-placement-row__empty">
            {{
                t(
                    "settings.placement.none",
                    "No panel is open right now. Each one carries its own placement control in its title bar, and the reset below still applies to every panel, open or not.",
                )
            }}
        </p>

        <div v-for="surface in surfaces" :key="surface.id" class="mb-placement-row__surface">
            <div class="mb-placement-row__head">
                <span class="mb-placement-row__name">{{ surface.label }}</span>
                <v-chip
                    v-if="hasStoredPlacement(surface.id)"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                >
                    {{ t("settings.placement.moved", "Moved") }}
                </v-chip>
            </div>

            <!--
                Radio buttons rather than a select: five options is a set somebody scans,
                and a radio group announces "3 of 5" to a screen reader where a menu
                announces nothing until it is opened.
            -->
            <div
                class="mb-placement-row__choices"
                role="radiogroup"
                :aria-label="
                    t(
                        'settings.placement.groupLabel',
                        { title: surface.label },
                        'Where {title} sits',
                    )
                "
            >
                <v-btn
                    v-for="option in DOCK_PLACEMENTS"
                    :key="option"
                    class="mb-placement-row__choice"
                    :variant="placementFor(surface.id, surface.defaultPlacement) === option ? 'tonal' : 'text'"
                    size="small"
                    role="radio"
                    :aria-checked="
                        placementFor(surface.id, surface.defaultPlacement) === option ? 'true' : 'false'
                    "
                    @click="setDockPlacement(surface.id, option)"
                >
                    {{ placementLabel(option) }}
                </v-btn>
            </div>

            <v-btn
                class="mb-placement-row__reset-one"
                variant="text"
                size="small"
                :prepend-icon="mdiRestore"
                :disabled="!hasStoredPlacement(surface.id)"
                @click="resetDockPlacement(surface.id)"
            >
                {{
                    t(
                        "dock.reset.one",
                        { title: surface.label },
                        "Put {title} back where it started",
                    )
                }}
            </v-btn>
        </div>

        <div class="mb-placement-row__global">
            <v-btn
                class="mb-placement-row__reset-all"
                variant="tonal"
                size="small"
                :prepend-icon="mdiRestore"
                :disabled="customised === 0"
                @click="resetAllDockPlacements()"
            >
                {{ t("dock.reset.all", "Put every panel back where it started") }}
            </v-btn>
            <p class="mb-placement-row__count" role="status">
                {{
                    customised === 0
                        ? t("settings.placement.noneMoved", "No panel has been moved.")
                        : t(
                              "settings.placement.someMoved",
                              { n: customised },
                              "{n} panels have a remembered position, including any that are closed.",
                          )
                }}
            </p>
        </div>
    </div>
</template>

<style>
.mb-placement-row {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.mb-placement-row__surface {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-placement-row__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-placement-row__name {
    font-size: 0.875rem;
    font-weight: 500;
    overflow-wrap: anywhere;
}

/* Wraps rather than overflowing at 800x600 and at 200% display scale, where five labels
   in the longest bilingual wording are far wider than the sheet. */
.mb-placement-row__choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.mb-placement-row__choice {
    min-height: 36px;
}

.mb-placement-row__global {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
}

.mb-placement-row__empty,
.mb-placement-row__count {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}
</style>
