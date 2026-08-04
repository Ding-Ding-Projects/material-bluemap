<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDownload, mdiPackageVariantClosed } from "@mdi/js";
import { VBtn, VChip, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { formatBytes } from "./downloads.js";
import type { AvailableAsset, DiscoveredRelease } from "./downloadBridge.js";

/**
 * What a release offers, and the one thing worth doing about each of them.
 *
 * A file past GitHub's two-gigabyte cap is published as numbered parts beside a manifest,
 * and the main process reports it as the single download it really is. That is why the
 * size shown here can be larger than any file a browser could fetch from the same page,
 * and why the number of parts is said out loud rather than hidden: somebody comparing this
 * list against the release page should be able to see that four files there are one
 * download here, instead of concluding that the app is showing them the wrong thing.
 *
 * The list has its own search bar, with its own regex builder anchored to it. A release
 * that publishes one world publishes a handful of names; a release that publishes a dozen
 * worlds at several resolutions publishes rather more, and the names are long, similar and
 * differ in the middle (`overworld-1.20-hires.zip` against `overworld-1.21-hires.zip`),
 * which is exactly the case that reading down a list handles badly and a pattern handles
 * well. It is `ConfigSearchField` rather than a field of this surface's own: the same
 * component the settings screens use, so the plain-text default, the regex opt-in, the
 * anchored builder and the return of focus to this field on close are the shared ones and
 * not a fourth implementation of them.
 */
const props = defineProps<{
    release: DiscoveredRelease;
    /** Asset names asked for and not yet answered. */
    starting: readonly string[];
    /** Asset names being transferred right now, whoever started them. */
    active: readonly string[];
}>();

const emit = defineEmits<{ download: [asset: AvailableAsset] }>();

const { t } = useI18n();

const assets = computed(() => props.release.downloads);

/**
 * This field's own query, mode and flags.
 *
 * Held here rather than injected, because the contract's rule about one builder per field
 * is really a rule about one state per field: a shared store would let a pattern typed
 * against a release's assets survive into a different surface's search and filter it
 * silently. Plain text is the default, which is what `regexMode` starting false means.
 */
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

/** Names only. The size and the part count are chips rather than text somebody would type. */
const shown = computed(() => assets.value.filter((asset) => matcher.value.test(asset.name)));

/** The real corpus the builder previews against, so the preview cannot disagree with this list. */
const sample = computed(() => assets.value.map((asset) => asset.name).join("\n"));

const summary = computed(() =>
    matcher.value.active
        ? t(
              "downloads.assets.searchSummary",
              { shown: shown.value.length, total: assets.value.length },
              "Showing {shown} of {total}",
          )
        : "",
);

function isStarting(asset: AvailableAsset): boolean {
    return props.starting.includes(asset.name);
}

function isActive(asset: AvailableAsset): boolean {
    return props.active.includes(asset.name);
}

/**
 * Being under way is checked before being asked for, because both are true at once.
 *
 * `startDownload` resolves only when the download has ENDED, so the request stays
 * outstanding for the whole transfer. Reading it as "Starting..." for forty minutes would
 * be a button describing the request rather than the download.
 */
function label(asset: AvailableAsset): string {
    if (isActive(asset)) return t("downloads.assets.going", "Already going");
    if (isStarting(asset)) return t("downloads.assets.starting", "Starting...");
    return t("downloads.assets.download", "Download");
}
</script>

<template>
    <section class="mb-release-assets" :aria-label="t('downloads.assets.label', 'Downloads in this release')">
        <h5 class="mb-release-assets__title">
            {{ t("downloads.assets.title", { release: release.name || release.tag }, "{release} offers") }}
        </h5>

        <p v-if="assets.length === 0" class="mb-release-assets__empty">
            {{
                t(
                    "downloads.assets.none",
                    "This release publishes nothing this app can download. A release that carries a world publishes it as a zip, on its own or in numbered parts.",
                )
            }}
        </p>

        <template v-else>
            <div class="mb-release-assets__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('downloads.assets.searchLabel', 'Search these files')"
                    :placeholder="t('downloads.assets.searchHint', 'part of a file name')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <p v-if="shown.length === 0" class="mb-release-assets__empty" role="status">
                {{
                    t(
                        "downloads.assets.noMatch",
                        "No file in this release matches that search. Clearing it brings the whole list back.",
                    )
                }}
            </p>

            <ul v-else class="mb-release-assets__list">
                <li v-for="asset in shown" :key="asset.name" class="mb-release-assets__row">
                    <v-icon :icon="mdiPackageVariantClosed" size="18" aria-hidden="true" />
                    <span class="mb-release-assets__name">{{ asset.name }}</span>
                    <v-chip size="x-small" variant="outlined">{{ formatBytes(asset.bytes, t) }}</v-chip>
                    <v-chip v-if="asset.split" size="x-small" variant="outlined">
                        {{
                            t(
                                "downloads.assets.split",
                                { n: asset.parts },
                                "published in {n} parts, checked and rejoined here",
                            )
                        }}
                    </v-chip>
                    <v-chip v-else size="x-small" variant="outlined">
                        {{ t("downloads.assets.single", "one file") }}
                    </v-chip>
                    <v-btn
                        :prepend-icon="mdiDownload"
                        :disabled="isStarting(asset) || isActive(asset)"
                        :aria-label="t('downloads.assets.downloadOne', { asset: asset.name }, 'Download {asset}')"
                        variant="tonal"
                        size="small"
                        @click="emit('download', asset)"
                    >
                        {{ label(asset) }}
                    </v-btn>
                </li>
            </ul>
        </template>
    </section>
</template>

<style>
.mb-release-assets {
    margin-block-start: 12px;
}

.mb-release-assets__title {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4;
}

.mb-release-assets__empty {
    margin-block-start: 6px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-release-assets__search {
    margin-block-start: 8px;
    max-width: 420px;
}

.mb-release-assets__list {
    margin-block-start: 8px;
    padding: 0;
    list-style: none;
}

.mb-release-assets__row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-block: 6px;
}

.mb-release-assets__name {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}
</style>
