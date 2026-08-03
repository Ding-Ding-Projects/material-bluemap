<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { sanitizeHtml } from "@material-bluemap/viewer";
import type { BlueMapApp } from "@material-bluemap/viewer";
import { useBlueMap } from "./useBlueMap";

/**
 * The Info page: upstream renders `info.content` from the locale file straight through
 * `v-html`. That content is markup (a logo, three control tables, `<kbd>` keys and an
 * external link), so it has to be rendered rather than printed.
 *
 * Two deviations from upstream, both deliberate:
 *  - the markup goes through the port's shared sanitizer before it reaches the DOM;
 *  - external links get `target="_blank" rel="noopener noreferrer"`, because in the desktop
 *    shell an in-place navigation would replace the whole application window.
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

const app = useBlueMap(() => props.bluemap);
const { t } = useI18n();

const content = computed(() => {
    const version = app.value?.settings?.version ?? "?";
    const raw = t("info.content", { version });
    if (!raw || raw === "info.content") return "";

    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(raw);
    for (const anchor of Array.from(template.content.querySelectorAll("a[href]"))) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
    }
    return template.innerHTML;
});
</script>

<template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized above; the source is a bundled locale file -->
    <div v-if="content" class="mb-info-page" v-html="content" />
    <p v-else class="mb-info-page__empty">
        {{ t("info.title", "Info") }}
    </p>
</template>

<style>
.mb-info-page {
    padding: 8px 16px 16px;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-info-page img {
    display: block;
    width: 40%;
    margin: 2em auto;
    border-radius: 50%;
}

.mb-info-page h2 {
    font-size: 0.9375rem;
    font-weight: 500;
    margin-block: 12px 4px;
}

.mb-info-page p {
    margin-block: 0;
}

.mb-info-page table {
    border-collapse: collapse;
    width: 100%;
    display: block;
    overflow-x: auto;
}

.mb-info-page th,
.mb-info-page td {
    padding: 4px 8px;
    border: solid 1px rgba(var(--v-theme-on-surface), 0.12);
    font-weight: inherit;
    text-align: start;
    vertical-align: top;
}

.mb-info-page kbd {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 4px;
    border: solid 1px rgba(var(--v-theme-on-surface), 0.24);
    background: rgba(var(--v-theme-on-surface), 0.08);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
}

.mb-info-page hr {
    border: none;
    border-block-start: solid 1px rgba(var(--v-theme-on-surface), 0.12);
    margin-block: 12px;
}

.mb-info-page a {
    color: rgb(var(--v-theme-primary));
}

.mb-info-page .info-footer {
    text-align: center;
}

.mb-info-page__empty {
    padding: 12px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
