<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDownload, mdiOpenInNew, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VIcon, VMenu, VProgressLinear } from "vuetify/components";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import SetupText from "../setup/SetupText.vue";
import { useSetupI18n } from "../setup/setupI18n.js";
import TabStrip from "../tabs/TabStrip.vue";
import { applyClosePlan, type TabClosePlan } from "../tabs/closePlans.js";
import {
    assignTabToGroup,
    closeTabs,
    createGroup,
    moveGroup,
    moveTab,
    moveTabToIndex,
    pinTab,
    removeGroup,
    renameGroup,
    setActiveTab,
    setGroupCollapsed,
    setGroupColor,
    unpinTab,
    type TabPage,
    type TabStripState,
} from "../tabs/tabModel.js";
import { raiseNotice } from "../../stores/notices.js";
import { createEulaController, formatFetchedAt, type EulaController } from "./eulaBridge.js";
import { exportEula, exportFilename, type EulaExportFormat } from "./eulaExport.js";
import { categoriseEula, sectionPreview, type EulaSection } from "./eulaSections.js";
import { reportSectionMatches } from "./eulaSearch.js";
import { reconcileEulaStrip, readEulaStrip, seedEulaStrip, writeEulaStrip } from "./eulaStorage.js";
import EulaSectionPanel from "./EulaSectionPanel.vue";

/**
 * Mojang's EULA, in the app, in tabs.
 *
 * ## What the tabs are, and what they are not
 *
 * They are navigation. `eulaSections.ts` cuts the document into contiguous character
 * ranges and labels each one; the ranges tile the whole document, so no tab can omit a
 * word and no arrangement of tabs can reorder one. The reader may pin, group and reorder
 * the *tabs* as freely as any other tab strip in this application, and doing so changes
 * which section they are looking at and nothing about the document: each panel states its
 * own position in Mojang's own order, and the notice above the strip says in as many
 * words that the categories belong to this app rather than to Mojang. Those two sentences
 * are in the EXACT catalogue, so no funny level at any setting can restyle them.
 *
 * ## Why the whole tab system rather than a list of headings
 *
 * Because a licence is exactly the document somebody wants to pin "What you may not do"
 * in. Reusing `TabStrip` brings the overflow surface, reordering, pinning, grouping, all
 * four searches and the bulk closes without a second implementation of any of them. What
 * it does not bring is the application's tab storage: that writes one fixed key and reads
 * `strips[0]` back, so persisting through it would replace the user's real tab layout
 * with a licence. `eulaStorage.ts` is the same shape of module with its own key, plus the
 * reconciliation a document that can change underneath a saved layout needs.
 *
 * ## Provenance is never implied
 *
 * The header says which of three things is on screen - the live document, a copy fetched
 * earlier, or the wording BlueMap quotes because nothing could be fetched - and when. A
 * failed fetch that leaves a cached copy showing says both: here is the copy, from this
 * date, and here is why it is not newer.
 */
const props = withDefaults(
    defineProps<{
        /** Injected by a test. Left out, the viewer resolves the bridge itself. */
        controller?: EulaController | null;
        /** True inside the first-run dialog, where vertical room is scarce. */
        compact?: boolean;
    }>(),
    { controller: null, compact: false },
);

const { t, locale } = useI18n();
const i18n = useSetupI18n();

const eula = props.controller ?? createEulaController();

const idPrefix = useId();
const panelId = `${idPrefix}-panel`;

onMounted(() => {
    void eula.load();
});

/* -------------------------------------------------------------------------- */
/* The document, and the sections over it                                     */
/* -------------------------------------------------------------------------- */

const text = computed(() => eula.state.value.text);

const sections = computed<readonly EulaSection[]>(() => categoriseEula(text.value));

function categoryLabel(section: EulaSection): string {
    return i18n.t(`eula.category.${section.category}` as const);
}

/**
 * A tab's label: the category, plus the document's own heading when it had one.
 *
 * The heading is quoted rather than replaced, because "3. Your content" is what the
 * reader will be looking for when they cite the thing they read. Sections with no heading
 * take the first few words of their own text.
 */
function tabLabel(section: EulaSection): string {
    const category = categoryLabel(section);
    const own = section.heading ?? sectionPreview(text.value, section, 5);
    return own.length === 0 ? category : `${category}: ${own}`;
}

const pages = computed<readonly TabPage[]>(() =>
    sections.value.map((section) => ({ id: section.id, label: tabLabel(section), icon: null })),
);

/* -------------------------------------------------------------------------- */
/* The strip                                                                  */
/* -------------------------------------------------------------------------- */

const stripLabel = computed(() => i18n.t("eula.stripLabel"));
const windowLabel = computed(() => i18n.t("eula.windowLabel"));

const strip = ref<TabStripState>(
    seedEulaStrip([], stripLabel.value, windowLabel.value),
);

/**
 * Rebuilds the strip whenever the document's sections change.
 *
 * A stored arrangement is reconciled rather than restored: tabs whose section survived
 * keep their order, pinning and group, tabs whose section is gone are closed, and new
 * sections arrive at the end. A stored layout with nothing left in common with the
 * document is discarded and the defaults are seeded, because half a layout is
 * indistinguishable from a bug and a fresh one is obviously fresh.
 */
watch(
    pages,
    (value) => {
        if (value.length === 0) {
            strip.value = seedEulaStrip([], stripLabel.value, windowLabel.value);
            return;
        }
        const stored = readEulaStrip();
        const reconciled =
            stored === null ? null : reconcileEulaStrip(stored, value, stripLabel.value, windowLabel.value);
        strip.value = reconciled ?? seedEulaStrip(value, stripLabel.value, windowLabel.value);
    },
    { immediate: true },
);

watch(
    strip,
    (value) => {
        if (value.tabs.length > 0) writeEulaStrip(value);
    },
    { deep: true },
);

const workspace = computed(() => ({ strips: [strip.value] }));

const revealed = ref<Set<string>>(new Set());

function reveal(groupId: string): void {
    revealed.value = new Set([...revealed.value, groupId]);
}

function setCollapsed(groupId: string, collapsed: boolean): void {
    if (collapsed) {
        const next = new Set(revealed.value);
        next.delete(groupId);
        revealed.value = next;
    }
    strip.value = setGroupCollapsed(strip.value, groupId, collapsed);
}

/** Every action arrives with the strip it belongs to; this viewer only owns one. */
function updateIn(stripId: string, change: (state: TabStripState) => TabStripState): void {
    if (stripId !== strip.value.id) return;
    strip.value = change(strip.value);
}

const activeTab = computed(
    () => strip.value.tabs.find((tab) => tab.id === strip.value.activeTabId) ?? null,
);

const activeSection = computed<EulaSection | null>(() => {
    const pageId = activeTab.value?.pageId;
    if (pageId === undefined) return null;
    return sections.value.find((section) => section.id === pageId) ?? null;
});

const activePosition = computed(() =>
    activeSection.value === null
        ? 0
        : sections.value.findIndex((section) => section.id === activeSection.value?.id) + 1,
);

/**
 * A tab closed here removes a way in, never a clause.
 *
 * The strip's bulk closes are the same ones every other strip has, so the notice reports
 * the same three separate facts. What is different is the sentence about the document,
 * which is here because closing a tab labelled "What you may not do" genuinely looks like
 * it might have removed something.
 */
function applyPlan(plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }): void {
    const outcome = applyClosePlan(strip.value, plan, options);
    strip.value = outcome.strip;
    raiseNotice(
        "success",
        `${t("tabs.close.done", { closed: outcome.closed.length }, "Closed {closed} tabs.")} ${t(
            "eula.close.documentIntact",
            "The document is unchanged; only these ways into it were closed.",
        )}`,
    );
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const matches = computed(() => reportSectionMatches(text.value, sections.value, matcher.value));

const searchSummary = computed(() => {
    if (matcher.value.error !== null) return i18n.t("eula.searchBadPattern");
    if (!matcher.value.active) return i18n.t("eula.searchAll", { total: sections.value.length });
    return i18n.t("eula.searchFound", {
        shown: matches.value.matching.size,
        total: sections.value.length,
    });
});

/** Real text for the builder's preview: one section per line, as the search sees it. */
const sample = computed(() =>
    sections.value
        .map((section) => text.value.slice(section.start, section.end).replace(/\s+/g, " ").trim())
        .join("\n"),
);

/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

const provenanceKey = computed(() => {
    switch (eula.state.value.source) {
        case "live":
            return "eula.live" as const;
        case "cache":
            return "eula.cachedCopy" as const;
        default:
            return "eula.fallbackCopy" as const;
    }
});

const fetchedAt = computed(() => formatFetchedAt(eula.state.value.fetchedAt, locale.value));

/* -------------------------------------------------------------------------- */
/* Export and copy                                                            */
/* -------------------------------------------------------------------------- */

const exportOpen = ref(false);

function exportContext(): Parameters<typeof exportEula>[0] {
    return {
        documentUrl: eula.state.value.documentUrl,
        source: eula.state.value.source,
        fetchedAt: eula.state.value.fetchedAt,
        text: text.value,
        sections: sections.value,
        categoryLabel,
    };
}

function render(scope: "section" | "all", format: EulaExportFormat): string {
    return exportEula(exportContext(), scope === "all" ? null : activeSection.value, format);
}

function download(scope: "section" | "all", format: EulaExportFormat): void {
    exportOpen.value = false;
    const body = render(scope, format);
    const name = exportFilename(scope === "all" ? null : activeSection.value, format);
    const blob = new Blob([body], {
        type: `${format === "markdown" ? "text/markdown" : "text/plain"};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    raiseNotice("success", i18n.t("eula.exported", { name }));
}

/**
 * The six rows of the "Export" menu, as a filterable list rather than a bare `v-list`.
 *
 * `disabled` reads straight off `activeSection`, exactly as the six `v-list-item`s used
 * to: a row scoped to "this section" makes no sense with no section open, and filtering the
 * list never changes that -- a disabled row can still be found by search, it just still
 * cannot be chosen.
 *
 * The three section-scoped rows also carry `reason` while disabled, rendered as the row's
 * own subtitle by `MenuSearchList.vue` -- a screen reader used to hear "dimmed" and nothing
 * else, and a sighted person had no way to learn what a filterable list has no tooltip to
 * anchor. `exactOptionalPropertyTypes` is why this spreads the key in rather than setting
 * it to `undefined` for the three rows that stay enabled: `reason?: string` on
 * `MenuSearchItem` rejects an explicit `undefined` under that setting.
 */
const sectionExportReason = computed(() => i18n.t("eula.exportNeedsSection"));

const exportItems = computed<MenuSearchItem[]>(() => {
    const needsSection = activeSection.value === null;
    const sectionReason = needsSection ? { reason: sectionExportReason.value } : {};
    return [
        { id: "section-markdown", label: i18n.t("eula.exportSectionMarkdown"), disabled: needsSection, ...sectionReason },
        { id: "section-text", label: i18n.t("eula.exportSectionText"), disabled: needsSection, ...sectionReason },
        { id: "all-markdown", label: i18n.t("eula.exportAllMarkdown") },
        { id: "all-text", label: i18n.t("eula.exportAllText") },
        { id: "copy-section", label: i18n.t("eula.copySection"), disabled: needsSection, ...sectionReason },
        { id: "copy-all", label: i18n.t("eula.copyAll") },
    ];
});

function chooseExport(id: string): void {
    switch (id) {
        case "section-markdown":
            download("section", "markdown");
            break;
        case "section-text":
            download("section", "text");
            break;
        case "all-markdown":
            download("all", "markdown");
            break;
        case "all-text":
            download("all", "text");
            break;
        case "copy-section":
            void copy("section");
            break;
        case "copy-all":
            void copy("all");
            break;
    }
}

/** The app's own clipboard channel first, the browser's second, a failure said out loud. */
async function copy(scope: "section" | "all"): Promise<void> {
    exportOpen.value = false;
    const body = render(scope, "text");
    try {
        const bridge = (globalThis as { materialBluemap?: { writeClipboardText?: (value: string) => Promise<void> } })
            .materialBluemap;
        if (typeof bridge?.writeClipboardText === "function") await bridge.writeClipboardText(body);
        else await navigator.clipboard.writeText(body);
        raiseNotice("success", i18n.t("eula.copied"));
    } catch {
        raiseNotice("error", i18n.t("eula.copyFailed"));
    }
}

defineExpose({ sections, activeSection, state: eula.state, exportItems });
</script>

<template>
    <div class="mb-eula" :class="{ 'mb-eula--compact': props.compact }">
        <!--
            The two statements a reader has to see before the tabs mean anything: what the
            categories are, and where this text came from. Both from the EXACT catalogue,
            so no funny level reaches them at any setting.
        -->
        <div class="mb-eula__provenance">
            <SetupText :text-key="provenanceKey" class="mb-eula__source" />
            <SetupText
                v-if="fetchedAt !== null"
                text-key="eula.fetchedAt"
                :vars="{ when: fetchedAt }"
                class="mb-eula__when"
            />
            <SetupText v-else text-key="eula.neverFetched" class="mb-eula__when" />
            <SetupText text-key="eula.authoritative" class="mb-eula__when" />

            <div class="mb-eula__provenance-actions">
                <v-btn
                    v-if="eula.available"
                    variant="text"
                    size="small"
                    :prepend-icon="mdiRefresh"
                    :loading="eula.busy.value"
                    :disabled="eula.busy.value"
                    @click="eula.load({ refresh: true })"
                >
                    {{ i18n.t("action.refetchEula") }}
                </v-btn>
                <a
                    :href="eula.state.value.documentUrl"
                    class="mb-setup-link"
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {{ i18n.t("action.openEula") }}
                    <v-icon :icon="mdiOpenInNew" size="small" aria-hidden="true" />
                </a>
            </div>
        </div>

        <v-progress-linear
            v-if="eula.busy.value"
            indeterminate
            color="primary"
            :aria-label="i18n.t('eula.fetching')"
        />

        <!--
            A failure is stated whether or not something is on screen. When a cached copy
            survived, both sentences are true at once and both are shown: this is the copy
            from that date, and this is why it is not newer.
        -->
        <v-alert
            v-if="eula.state.value.failure !== null"
            type="warning"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-eula__failure"
        >
            <SetupText text-key="eula.failureReason" :vars="{ reason: eula.state.value.failure }" />
        </v-alert>

        <SetupText text-key="eula.navigationOnly" class="mb-eula__navigation-note" />

        <div class="mb-eula__search">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="i18n.t('eula.searchLabel')"
                :placeholder="i18n.t('eula.searchHint')"
                :sample="sample"
                :summary="searchSummary"
                density="comfortable"
            />
        </div>

        <template v-if="sections.length > 0">
            <!--
                The strip is an appearance target as a whole: typography, colour and
                spacing set here inherit into every tab through the wrapper's
                `display: contents`, so a licence can be read at 24 point in high contrast
                without the tabs above it staying at 13.
            -->
            <AppearanceTarget
                id="eula.tabs"
                :label="i18n.t('eula.stripLabel')"
                as="div"
                class="mb-eula__strip"
            >
                <TabStrip
                    :strip="strip"
                    :workspace="workspace"
                    :revealed="revealed"
                    :panel-id="panelId"
                    :id-prefix="idPrefix"
                    :pages="pages"
                    @activate="(tabId, stripId) => updateIn(stripId, (state) => setActiveTab(state, tabId))"
                    @close="(tabId, stripId) => updateIn(stripId, (state) => closeTabs(state, [tabId]))"
                    @pin="(tabId, stripId) => updateIn(stripId, (state) => pinTab(state, tabId))"
                    @unpin="(tabId, stripId) => updateIn(stripId, (state) => unpinTab(state, tabId))"
                    @move-tab="(tabId, delta) => (strip = moveTab(strip, tabId, delta))"
                    @drop-tab="(tabId, index) => (strip = moveTabToIndex(strip, tabId, index))"
                    @new-group="
                        (tabId) =>
                            (strip = createGroup(strip, { name: t('tabs.group.newName', 'New group') }, [tabId]))
                    "
                    @assign="
                        (tabId, groupId, stripId) =>
                            updateIn(stripId, (state) => assignTabToGroup(state, tabId, groupId))
                    "
                    @rename-group="(groupId, name) => (strip = renameGroup(strip, groupId, name))"
                    @set-group-color="(groupId, color) => (strip = setGroupColor(strip, groupId, color))"
                    @set-group-collapsed="setCollapsed"
                    @move-group="(groupId, delta) => (strip = moveGroup(strip, groupId, delta))"
                    @remove-group="strip = removeGroup(strip, $event)"
                    @reveal="reveal"
                    @open-page="
                        (pageId) => {
                            const existing = strip.tabs.find((tab) => tab.pageId === pageId);
                            if (existing !== undefined) strip = setActiveTab(strip, existing.id);
                        }
                    "
                    @apply="applyPlan"
                />
            </AppearanceTarget>

            <div
                v-if="activeSection !== null"
                :id="panelId"
                class="mb-eula__panel"
                role="tabpanel"
                :aria-labelledby="activeTab === null ? undefined : `${idPrefix}-tab-${activeTab.id}`"
                tabindex="0"
            >
                <EulaSectionPanel
                    :text="text"
                    :section="activeSection"
                    :category-label="categoryLabel(activeSection)"
                    :position="activePosition"
                    :total="sections.length"
                    :query="query"
                    :regex-mode="regexMode"
                    :flags="flags"
                />
            </div>

            <!--
                Every tab closed. The document is still there, which is the one thing this
                empty state has to say: an empty panel under a licence reads as the licence
                having gone.
            -->
            <p v-else class="mb-eula__empty" role="status">
                {{
                    t(
                        "eula.allTabsClosed",
                        "Every section tab is closed. The document is unchanged; open one from the tab strip's plus button.",
                    )
                }}
            </p>
        </template>

        <p v-else class="mb-eula__empty" role="status">{{ i18n.t("eula.empty") }}</p>

        <div class="mb-eula__actions">
            <v-btn
                variant="tonal"
                size="small"
                :prepend-icon="mdiDownload"
                :aria-expanded="exportOpen ? 'true' : 'false'"
                aria-haspopup="menu"
            >
                {{ i18n.t("eula.export") }}
                <v-menu
                    v-model="exportOpen"
                    activator="parent"
                    :close-on-content-click="false"
                    location="top start"
                    offset="4"
                >
                    <div class="mb-eula__menu" role="none">
                        <!--
                            Gated on `exportOpen` itself, not only on the menu's own
                            visibility, so choosing a row unmounts the search field and its
                            query the moment it is chosen rather than waiting on the
                            overlay's own close transition to finish.
                        -->
                        <MenuSearchList
                            v-if="exportOpen"
                            :items="exportItems"
                            :label="i18n.t('eula.export')"
                            @choose="chooseExport"
                        />
                    </div>
                </v-menu>
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-eula {
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* Fills the height its parent hands it - `EulaSurface.vue`'s `.mb-eula-surface__body`
       when docked, nothing in particular when embedded standalone in first-run setup or
       the consent settings row, where `flex` on a non-flex parent is simply inert. Either
       way `.mb-eula__panel` below still needs `min-block-size: 0` on every box between it
       and that bounded height, or its own `flex: 1 1 auto; overflow: auto` has nothing to
       shrink against and the section text grows the whole viewer instead of scrolling. */
    flex: 1 1 auto;
    min-block-size: 0;
}

.mb-eula__provenance {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    border-radius: 12px;
    border-inline-start: 4px solid rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
}

.mb-eula__source {
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-eula__when {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-eula__provenance-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-block-start: 4px;
}

.mb-eula__navigation-note {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-eula__failure {
    overflow-wrap: anywhere;
}

.mb-eula__strip {
    /* The strip has to be able to shrink for its own overflow arithmetic to mean
       anything; without this it grows to its content and nothing ever overflows. */
    min-inline-size: 0;
}

.mb-eula__panel {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow: auto;
    border-radius: 12px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.mb-eula--compact .mb-eula__panel {
    /* Inside the first-run dialog the panel scrolls within a bounded height rather than
       pushing the Accept and Decline buttons off the bottom of the card. */
    max-block-size: min(40dvh, 320px);
}

.mb-eula__panel:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-eula__empty {
    margin: 0;
    padding: 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-eula__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-eula__menu {
    inline-size: min(320px, 92vw);
    max-block-size: min(60vh, 420px);
    overflow-y: auto;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
}

.mb-eula .v-btn:focus-visible,
.mb-eula a:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
</style>
