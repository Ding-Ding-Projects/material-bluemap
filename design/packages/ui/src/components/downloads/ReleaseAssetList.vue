<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDownload, mdiPackageVariantClosed } from "@mdi/js";
import { VBtn, VChip, VIcon } from "vuetify/components";
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

        <ul v-else class="mb-release-assets__list">
            <li v-for="asset in assets" :key="asset.name" class="mb-release-assets__row">
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
