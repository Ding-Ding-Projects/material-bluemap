<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import GitHubAccountRow from "../github/GitHubAccountRow.vue";
import { createGitHubAccount, githubSearchValues } from "../github/githubAccount.js";
import ConsentSettingsRow from "../setup/ConsentSettingsRow.vue";
import LanguageSettingsRow from "../setup/LanguageSettingsRow.vue";
import { consentSearchLabels } from "../setup/consentSearch.js";
import { languageSearchLabels } from "../setup/languageSearch.js";
import { defaultMapStorageDir } from "../setup/mapStorage.js";
import { TabbedNavigation, type TabPage } from "../tabs/index.js";
import DockedSurface from "./DockedSurface.vue";
import JavaRuntimeRow from "./JavaRuntimeRow.vue";
import SettingsSection from "./SettingsSection.vue";
import StorageSettingRow from "./StorageSettingRow.vue";
import SurfacePlacementRow from "./SurfacePlacementRow.vue";
import WorldFolderRow from "./WorldFolderRow.vue";
import UpdateStatusRow from "../update/UpdateStatusRow.vue";
import { updateText } from "../update/updateCopy.js";
import type { UpdatesController } from "../update/useUpdates.js";
import { SimpleHistoryList, simpleHistoryHostFrom } from "../history/index.js";
import { RepairPanel } from "../repair/index.js";
import { DOCK_PLACEMENTS } from "./dockPlacement.js";
import { dockedSurfaces } from "./useDockPlacement.js";
import { createJavaSetting, describeJavaRejections } from "./javaSetting.js";
import { createMapStorageSetting } from "./mapStorageSetting.js";
import { createRenderMemorySetting } from "./renderMemorySetting.js";
import RenderMemoryRow from "./RenderMemoryRow.vue";
import {
    dockPlacementLabel,
    githubSectionCopy,
    javaUnsupportedCopy,
    sectionCopy,
    worldFolderCopy,
} from "./settingsCopy.js";
import {
    SETTINGS_SECTIONS,
    filterSections,
    sectionSample,
    type SettingsSectionAnchor,
    type SettingsSectionText,
} from "./settingsSections.js";

/**
 * The settings surface a failed render points at.
 *
 * Four settings live here, and every one of them is the real control rather than a
 * label describing one. Consent is the existing `ConsentSettingsRow`, mounted, not
 * reimplemented — the same component the first-run flow's other end uses, so the record
 * it shows and the record a render reads are the same record. The storage folder is an
 * editable path validated by the same module first-run setup validates against. The two
 * that cannot be controls here say why in as many words: this build has no way to ask
 * about the Java runtime, and a world folder belongs to one map rather than to the app.
 *
 * The two sections underneath them are reached only by opening Settings, because no
 * `SettingsTarget` names either: GitHub sign-in, and the language mode with its two funny
 * levels. The language section mounts the same `SetupLanguagePanel` the first-run flow
 * shows rather than a second copy of it, so the three persisted keys have exactly one set
 * of controls writing them. Two panels writing the same keys would disagree the moment one
 * of them was opened second, and both would look right while doing it.
 *
 * **Every section is its own browser-style tab**, carried by the project's own
 * `TabbedNavigation` rather than one long scrolling column: an overflow surface when
 * the strip cannot fit them all, reordering, pinning, grouping, and a tab order that
 * survives a restart under its own storage key so this surface's layout never fights
 * the map shell's. Only the active tab's section is mounted at a time — the same rule
 * `TabbedNavigation` applies everywhere else — so the search above the strip does not
 * hide sections with `v-show` any more; it lists which sections match and jumps to the
 * one you pick, exactly the pattern the config editor's own cross-screen search already
 * uses.
 *
 * **Opening at an anchor reveals the setting.** It switches to that setting's tab,
 * scrolls it into view, focuses it, and outlines it briefly, because a render that
 * stopped and offered a link has promised a remedy; landing somebody on a settings
 * surface and leaving them to find the right tab is a hint. A leftover search query is
 * cleared on the way, because a stale query would show a match list over the tab that
 * was just switched to.
 *
 * **Not a modal.** It is a side sheet with no scrim: the application behind it stays
 * visible and usable, Escape closes it, and nothing about it halts anything. A blocking
 * dialog is reserved for a decision that genuinely must be made before continuing, and
 * changing a folder is not one.
 *
 * **Where it sits is the user's choice.** It was a right-hand drawer because somebody had
 * to pick one, which is fine on a wide display and wrong for anyone whose map is on the
 * right. `DockedSurface` gives it a persisted placement - floating, or docked to any of
 * the four edges - a chooser in its own title bar, and geometry that never covers the
 * button that opened it. The chrome, the Escape handling, the focus return and the
 * placement all live there rather than here, so the next docked panel is a wrapper rather
 * than a second implementation of any of it.
 */
const props = withDefaults(
    defineProps<{
        /** Whether the surface is showing. */
        open: boolean;
        /** Reveal and focus this setting when opening. Null just opens the surface. */
        anchor?: SettingsSectionAnchor | null;
        /** True when a render said this setting was missing, not merely wrong. */
        anchorMissing?: boolean;
        /**
         * The shell's one shared updater, per `components/update/index.ts`'s own wiring
         * recipe: `App.vue` mounts exactly one `createUpdates()` and hands it to both the
         * always-on banner and this settings row, so the two surfaces can never disagree
         * about what is staged.
         */
        updates: UpdatesController;
    }>(),
    { anchor: null, anchorMissing: false },
);

const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();

/**
 * The bridge is resolved by the controllers themselves, from `globalThis.materialBluemap`,
 * exactly as the setup flow and the render flow resolve theirs. It is deliberately not a
 * prop: the shell mounts this with three props and nothing else, and a fourth for
 * plumbing would be a fourth thing for it to get wrong.
 */
const storage = createMapStorageSetting();
const java = createJavaSetting();
const github = createGitHubAccount();
const renderMemory = createRenderMemorySetting();

/** Every docked panel that is open right now, including this one. */
const surfaces = dockedSurfaces();

// The GitHub controller is the only one of the three that subscribes to a push channel,
// so it is the only one with a subscription to give back. Left attached it would keep
// answering events after the surface it draws has gone.
onBeforeUnmount(() => {
    github.dispose();
});

const panel = ref<HTMLElement | null>(null);
const tabsNav = ref<InstanceType<typeof TabbedNavigation> | null>(null);
const consentRow = ref<InstanceType<typeof ConsentSettingsRow> | null>(null);
const consentSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const javaSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const storageSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const worldSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const githubSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const languageSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const placementSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const renderMemorySection = ref<InstanceType<typeof SettingsSection> | null>(null);
const updatesSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const historySection = ref<InstanceType<typeof SettingsSection> | null>(null);
const diagnosticsSection = ref<InstanceType<typeof SettingsSection> | null>(null);

/**
 * Resolved once, from the same `globalThis.materialBluemap` every other controller on this
 * surface probes, rather than handed down: this surface mounts with three props and
 * nothing else, and a fourth pair for two capabilities most builds and most sessions never
 * touch would be plumbing for its own sake. Null in a browser tab, exactly like every other
 * bridge-backed capability here.
 */
const profilesHistoryHost = simpleHistoryHostFrom(
    typeof window === "undefined" ? null : window.materialBluemap,
    "profilesHistory",
);
const appSettingsHistoryHost = simpleHistoryHostFrom(
    typeof window === "undefined" ? null : window.materialBluemap,
    "appSettingsHistory",
);

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a setting name, and `m`
// because a section's searchable text is several lines — title, explanation, and every
// current value — so `^` and `$` are only useful per line.
const flags = ref("im");

const copy = computed(() => sectionCopy(t));

/** The two `SimpleHistoryList` headings, read live so a language switch renames them too. */
const historyCopy = computed(() => ({
    profiles: t("settings.history.profiles", "Server profiles"),
    appSettings: t("settings.history.appSettings", "Application settings"),
}));

/**
 * What each section can be found by: its title, its explanation, and the values it is
 * showing right now.
 *
 * The consent row publishes its own labels through `consentSearchLabels()`, which exists
 * for exactly this — a settings page folds them into the search it already owns rather
 * than the row growing a second search bar to compete with this one. They come from the
 * live catalogue at the current language mode, so searching for a word that is on screen
 * finds the row that is on screen even in Cantonese.
 */
const sections = computed<SettingsSectionText[]>(() => {
    const text = copy.value;
    const javaCopy = javaUnsupportedCopy(t);
    const worldCopy = worldFolderCopy(t);

    const javaValues: string[] = [...describeJavaRejections(java.report.value)];
    const installation = java.report.value?.installation ?? null;
    if (installation !== null) {
        javaValues.push(installation.version.version, installation.executable, installation.source);
        if (installation.version.runtime !== null) javaValues.push(installation.version.runtime);
    }
    if (java.lastRender.value !== null) javaValues.push(java.lastRender.value.engine);
    if (!java.supported) javaValues.push(javaCopy.headline, javaCopy.discoveryOrder);

    const storageValues = [storage.value.value, storage.saved.value, defaultMapStorageDir(storage.platform)];
    if (storage.resolved.value !== null) {
        storageValues.push(storage.resolved.value.current, storage.resolved.value.default);
    }

    // The account's own words: the login somebody can see on screen, the kind of token,
    // the scopes it reports. A build that cannot sign in contributes the sentence saying
    // so instead, so searching for "GitHub" finds the section either way.
    const githubCopy = githubSectionCopy(t);
    const githubValues = [
        ...githubSearchValues({ status: github.status.value, account: github.account.value }),
        githubCopy.whatItIsFor,
        github.supported ? "" : githubCopy.unsupported,
    ];

    return [
        {
            anchor: "mojang-download-consent",
            title: text["mojang-download-consent"].title,
            description: text["mojang-download-consent"].description,
            values: consentSearchLabels(),
        },
        {
            anchor: "java-runtime",
            title: text["java-runtime"].title,
            description: text["java-runtime"].description,
            values: javaValues,
        },
        {
            anchor: "map-storage-directory",
            title: text["map-storage-directory"].title,
            description: text["map-storage-directory"].description,
            values: storageValues,
        },
        {
            anchor: "world-folder",
            title: text["world-folder"].title,
            description: text["world-folder"].description,
            values: [worldCopy.perMap, worldCopy.where],
        },
        {
            anchor: "github-account",
            title: text["github-account"].title,
            description: text["github-account"].description,
            values: githubValues,
        },
        // Same arrangement as consent: the row's words come from `languageSearchLabels()`
        // rather than from the component, read live at the current mode and levels, so a
        // Cantonese profile searching in Cantonese finds the row that is on screen and the
        // level a slider is actually sitting on is searchable by its name as well as its
        // number.
        {
            anchor: "language-and-tone",
            title: text["language-and-tone"].title,
            description: text["language-and-tone"].description,
            values: languageSearchLabels(),
        },
        // The names of the panels that are open and the five placements they can take, so
        // somebody who can read "Docked to the bottom" on screen finds this row by typing
        // it. Same rule as consent and language: the search matches the words rendered,
        // not a hand-written keyword list beside them.
        {
            anchor: "surface-placement",
            title: text["surface-placement"].title,
            description: text["surface-placement"].description,
            values: [
                ...surfaces.value.map((surface) => surface.label),
                ...DOCK_PLACEMENTS.map((placement) => dockPlacementLabel(t, placement)),
            ],
        },
        // The current mode, the number, and the machine's own memory when this build can
        // ask about it - the same "search what is actually on screen" rule every other
        // section follows, so typing "automatic" or a megabyte figure finds this tab.
        {
            anchor: "render-memory",
            title: text["render-memory"].title,
            description: text["render-memory"].description,
            values:
                renderMemory.readout.value === null
                    ? []
                    : [
                          renderMemory.readout.value.mode,
                          String(renderMemory.readout.value.megabytes),
                          renderMemory.readout.value.explanation,
                      ],
        },
        // The installed and staged versions, the last check and the feed, plus the row's
        // own words for whatever it is currently saying (checking, up to date, failed,
        // unsupported) - the same "search what is actually on screen" rule every other
        // section here follows, so typing a version number or "feed" finds this tab.
        {
            anchor: "updates",
            title: text.updates.title,
            description: text.updates.description,
            values: [
                props.updates.state.value.currentVersion,
                props.updates.state.value.newVersion ?? "",
                props.updates.state.value.readyVersion ?? "",
                props.updates.state.value.feedUrl ?? "",
                updateText(props.updates.status.value.messageKey, props.updates.status.value.vars),
            ].filter((value) => value !== ""),
        },
        // The two headings this tab actually renders, so typing "profiles" or "application
        // settings" finds the version-history tab, the same "search what is on screen"
        // rule every other section follows.
        {
            anchor: "history",
            title: text.history.title,
            description: text.history.description,
            values: [historyCopy.value.profiles, historyCopy.value.appSettings],
        },
        {
            anchor: "diagnostics",
            title: text.diagnostics.title,
            description: text.diagnostics.description,
            values: [],
        },
    ];
});

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

/** The anchors a query leaves showing. Every anchor, in order, when the query is inactive. */
const visible = computed(() => filterSections(sections.value, matcher.value));

/**
 * The sections a query actually matched, in the surface's own order.
 *
 * Only rendered while the query is active: an inactive matcher already means "everything
 * matches", and a full-length list restating that fact would be a match list nobody asked
 * to see, sitting above a tab strip that already shows every section's name.
 */
const matchedSections = computed<SettingsSectionText[]>(() => {
    if (!matcher.value.active) return [];
    const shown = new Set(visible.value);
    return sections.value.filter((section) => shown.has(section.anchor));
});

const sample = computed(() => sectionSample(sections.value));

/** An honest "showing X of Y", including the case where the pattern itself is broken. */
const searchSummary = computed(() => {
    if (matcher.value.error !== null) {
        return t("settings.search.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    if (!matcher.value.active) {
        return t("settings.search.total", { n: sections.value.length }, "{n} settings.");
    }
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
    // the fallback as a message too and consumes `{shown}` and `{total}` as its own named
    // parameters, so a later `replace` has nothing left to substitute and the numbers
    // vanish from the sentence that exists to state them.
    return t(
        "settings.search.found",
        { shown: visible.value.length, total: sections.value.length },
        "{shown} of {total} settings match.",
    );
});

/* -------------------------------------------------------------------------- */
/* The tabs                                                                   */
/* -------------------------------------------------------------------------- */

/** One tab per section, in the surface's own order, labelled from the live copy. */
const settingsPages = computed<TabPage[]>(() =>
    SETTINGS_SECTIONS.map((anchor) => ({ id: anchor, label: copy.value[anchor].title, icon: null })),
);

/* -------------------------------------------------------------------------- */
/* Revealing the setting a render pointed at                                  */
/* -------------------------------------------------------------------------- */

function sectionRef(anchor: SettingsSectionAnchor): InstanceType<typeof SettingsSection> | null {
    switch (anchor) {
        case "mojang-download-consent":
            return consentSection.value;
        case "java-runtime":
            return javaSection.value;
        case "map-storage-directory":
            return storageSection.value;
        case "world-folder":
            return worldSection.value;
        case "github-account":
            return githubSection.value;
        case "language-and-tone":
            return languageSection.value;
        case "surface-placement":
            return placementSection.value;
        case "render-memory":
            return renderMemorySection.value;
        case "updates":
            return updatesSection.value;
        case "history":
            return historySection.value;
        case "diagnostics":
            return diagnosticsSection.value;
    }
}

/* -------------------------------------------------------------------------- */
/* Updates                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Set only around this row's own Restart press, independent of the banner's `busy` in
 * `App.vue` - the same "disable the control you actually pressed" rule `UpdateBanner`
 * already follows, not a second copy of its state.
 */
const updatesBusy = ref(false);

/**
 * Whether the ready version's banner has been put away.
 *
 * `UpdatesController` does not expose the dismissed version itself (`useUpdates.ts` keeps
 * it private on purpose, so nothing outside it can drift from what `bannerFor` decided).
 * `bannerFor` hides the banner for exactly two reasons - no ready version, or the ready
 * version is the dismissed one - and a render in progress is not one of them (it still
 * shows the banner, held). So once a version is genuinely ready, an invisible banner can
 * only mean dismissed, and that is the one condition this reads back out.
 */
const updatesDismissed = computed(
    () =>
        props.updates.state.value.status === "ready" &&
        props.updates.state.value.readyVersion !== null &&
        !props.updates.banner.value.visible,
);

function checkForUpdate(): void {
    void props.updates.check();
}

async function restartForSettingsUpdate(): Promise<void> {
    updatesBusy.value = true;
    try {
        await props.updates.restart();
    } finally {
        updatesBusy.value = false;
    }
}

function showUpdateBannerAgain(): void {
    props.updates.showAgain();
}

/**
 * Switches to a section's tab, then scrolls, focuses and outlines it.
 *
 * The two steps are deliberately separate ticks: `revealPage` changes which page's slot
 * `TabbedNavigation` renders, and the section inside that slot does not exist as a
 * component - and therefore has no ref to call `reveal()` on - until Vue has patched the
 * DOM for that change. Skipping the wait would call `reveal()` on last tab's leftover ref.
 */
async function revealSection(anchor: SettingsSectionAnchor): Promise<void> {
    tabsNav.value?.revealPage(anchor);
    await nextTick();
    await nextTick();

    const target = sectionRef(anchor);
    if (target === null) return;

    if (anchor === "mojang-download-consent") {
        // The consent row focuses and outlines itself through its own `highlight()`, so
        // the section scrolls and outlines but does not take the focus off it. Two
        // elements racing for focus is how the ring ends up on whichever won.
        target.reveal({ focus: false });
        consentRow.value?.highlight();
        return;
    }

    target.reveal();
}

/** A match in the search list was picked: close the list and go straight there. */
function goToSection(anchor: SettingsSectionAnchor): void {
    query.value = "";
    void revealSection(anchor);
}

async function revealAnchor(anchor: SettingsSectionAnchor | null): Promise<void> {
    // No anchor means "just open it". Focus still moves inside the sheet, or the first
    // keystroke after it opens goes to whatever was focused behind it. No tab is switched,
    // so whichever tab this surface last remembered stays exactly where it was left.
    if (anchor === null) {
        await nextTick();
        panel.value?.focus();
        return;
    }

    // A leftover query would show a match list over the tab this is about to switch to,
    // which is the opposite of the remedy a failed render just promised.
    query.value = "";
    await revealSection(anchor);
}

/**
 * Opening and re-anchoring both reveal, and they routinely happen in the same tick —
 * the shell sets the anchor and then opens. Collapsing them onto one pending value keeps
 * that from firing two reveals, and therefore from restarting the outline mid-flash.
 */
let pending: SettingsSectionAnchor | null | undefined;

function scheduleReveal(anchor: SettingsSectionAnchor | null): void {
    pending = anchor;
    void nextTick(() => {
        if (pending === undefined) return;
        const target = pending;
        pending = undefined;
        void revealAnchor(target);
    });
}

watch(
    () => props.open,
    (open) => {
        if (!open) return;
        // Re-read on every opening: the folder may have been changed by a render, and a
        // settings screen showing a value from twenty minutes ago is a settings screen
        // somebody will act on.
        void storage.load();
        void java.load();
        // Cheap: it reads stored metadata rather than the credential, so asking never
        // prompts the operating system's credential store.
        void github.load();
        void renderMemory.load();
        scheduleReveal(props.anchor);
    },
    { immediate: true },
);

watch(
    () => props.anchor,
    (anchor) => {
        if (!props.open) return;
        scheduleReveal(anchor);
    },
);

function close(): void {
    emit("update:open", false);
}

function onDrawer(value: boolean): void {
    if (!value) close();
}
</script>

<template>
    <DockedSurface
        class="mb-settings"
        surface-id="app-settings"
        :title="t('settings.title', 'Settings')"
        :open="props.open"
        default-placement="right"
        :preferred-thickness="520"
        :preferred-width="520"
        :preferred-height="720"
        @update:open="onDrawer"
    >
        <template #prepend>
            <div class="mb-settings__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('settings.search.label', 'Search settings')"
                    :placeholder="t('settings.search.hint', 'name, explanation, or a value on screen')"
                    :sample="sample"
                    :summary="searchSummary"
                    density="comfortable"
                />

                <!--
                    A search here no longer hides tabs with `v-show`: only the active
                    tab's section is ever mounted, the same rule every `TabbedNavigation`
                    follows. So a match is a destination to jump to, listed here exactly
                    the way the config editor already lists cross-screen matches, rather
                    than content folded away somewhere off-tab.
                -->
                <div v-if="matcher.active" class="mb-settings__results">
                    <p v-if="matcher.error !== null" class="mb-settings__empty" role="status">
                        {{ t("settings.search.badPattern", "The pattern is not valid, so nothing is listed.") }}
                    </p>
                    <p v-else-if="matchedSections.length === 0" class="mb-settings__empty" role="status">
                        {{ t("settings.search.noMatches", "No setting on this screen matches that.") }}
                    </p>
                    <ul v-else class="mb-settings__result-list">
                        <li v-for="match in matchedSections" :key="match.anchor">
                            <button
                                type="button"
                                class="mb-settings__result"
                                @click="goToSection(match.anchor)"
                            >
                                <span class="mb-settings__result-title">{{ match.title }}</span>
                                <span class="mb-settings__result-desc">{{ match.description }}</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </template>

        <!--
            Named distinctly from the sheet around it. Two nested regions both called
            "Settings" is what a screen reader would otherwise announce, which tells
            somebody they have moved without telling them where to.
        -->
        <div
            ref="panel"
            class="mb-settings__body"
            tabindex="-1"
            role="region"
            :aria-label="t('settings.body', 'All settings')"
        >
            <TabbedNavigation
                ref="tabsNav"
                :pages="settingsPages"
                storage-key="material-bluemap-settings-tabs"
                :strip-label="t('settings.tabs.strip', 'Settings sections')"
                :window-label="t('settings.title', 'Settings')"
            >
                <template #mojang-download-consent>
                    <SettingsSection
                        ref="consentSection"
                        anchor="mojang-download-consent"
                        :title="copy['mojang-download-consent'].title"
                        :description="copy['mojang-download-consent'].description"
                    >
                        <!--
                            The real component, not a copy of it. It owns the consent record, both
                            directions of changing it, and the verbatim quotation that has to be on
                            screen before anybody accepts.
                        -->
                        <ConsentSettingsRow
                            ref="consentRow"
                            :missing="props.anchor === 'mojang-download-consent' && props.anchorMissing"
                        />
                    </SettingsSection>
                </template>

                <template #java-runtime>
                    <SettingsSection
                        ref="javaSection"
                        anchor="java-runtime"
                        :title="copy['java-runtime'].title"
                        :description="copy['java-runtime'].description"
                    >
                        <JavaRuntimeRow
                            :setting="java"
                            :missing="props.anchor === 'java-runtime' && props.anchorMissing"
                        />
                    </SettingsSection>
                </template>

                <template #map-storage-directory>
                    <SettingsSection
                        ref="storageSection"
                        anchor="map-storage-directory"
                        :title="copy['map-storage-directory'].title"
                        :description="copy['map-storage-directory'].description"
                    >
                        <StorageSettingRow
                            :setting="storage"
                            :missing="props.anchor === 'map-storage-directory' && props.anchorMissing"
                        />
                    </SettingsSection>
                </template>

                <template #world-folder>
                    <SettingsSection
                        ref="worldSection"
                        anchor="world-folder"
                        :title="copy['world-folder'].title"
                        :description="copy['world-folder'].description"
                    >
                        <WorldFolderRow
                            :missing="props.anchor === 'world-folder' && props.anchorMissing"
                        />
                    </SettingsSection>
                </template>

                <!--
                    No render can send somebody here: nothing in the bridge's `SettingsTarget`
                    names a GitHub account, because a render that cannot reach a private
                    repository fails on the repository rather than on the setting. So this
                    section is reached by opening Settings, and is listed and searched exactly
                    like the four that a failure can link to.
                -->
                <template #github-account>
                    <SettingsSection
                        ref="githubSection"
                        anchor="github-account"
                        :title="copy['github-account'].title"
                        :description="copy['github-account'].description"
                    >
                        <GitHubAccountRow :account="github" />
                    </SettingsSection>
                </template>

                <!--
                    The language mode and both funny levels, which until now were reachable
                    only while first-run setup was still on screen. `LanguageSettingsRow`
                    mounts the first-run flow's own `SetupLanguagePanel`, so this is the same
                    three controls rather than a second set writing the same stored keys.
                -->
                <template #language-and-tone>
                    <SettingsSection
                        ref="languageSection"
                        anchor="language-and-tone"
                        :title="copy['language-and-tone'].title"
                        :description="copy['language-and-tone'].description"
                    >
                        <LanguageSettingsRow />
                    </SettingsSection>
                </template>

                <!--
                    Where every docked panel sits, and the one reset that reaches the ones
                    that are closed. Each panel's own chooser is in its own title bar, which
                    is where somebody moves the panel they are looking at; this is where they
                    undo a move they have since forgotten making.
                -->
                <template #surface-placement>
                    <SettingsSection
                        ref="placementSection"
                        anchor="surface-placement"
                        :title="copy['surface-placement'].title"
                        :description="copy['surface-placement'].description"
                    >
                        <SurfacePlacementRow />
                    </SettingsSection>
                </template>

                <!--
                    The `-Xmx` heap ceiling a render's JVM may use. `files/renderMemory.ts`
                    has stored, validated and reported this since it was written; what was
                    missing was a control, and a render that actually read the choice back
                    (see `render/orchestrator.ts`'s `jvmArgs` option). No render can send
                    somebody here today - see `settingsSections.ts`'s own note on why - so
                    like surface placement and updates this is reached by opening Settings.
                -->
                <template #render-memory>
                    <SettingsSection
                        ref="renderMemorySection"
                        anchor="render-memory"
                        :title="copy['render-memory'].title"
                        :description="copy['render-memory'].description"
                    >
                        <RenderMemoryRow :setting="renderMemory" />
                    </SettingsSection>
                </template>

                <!--
                    The always-reachable half of `components/update/index.ts`'s two update
                    surfaces: the installed version, the last check, the feed, and a manual
                    Check for updates, plus bringing back a banner this build's own row
                    dismissed. `App.vue` mounts exactly one `createUpdates()` and hands it to
                    this row and to `UpdateBanner` alike, so the two can never disagree about
                    what is staged.
                -->
                <template #updates>
                    <SettingsSection
                        ref="updatesSection"
                        anchor="updates"
                        :title="copy.updates.title"
                        :description="copy.updates.description"
                    >
                        <UpdateStatusRow
                            :state="props.updates.state.value"
                            :model="props.updates.status.value"
                            :dismissed="updatesDismissed"
                            :busy="updatesBusy"
                            @check="checkForUpdate"
                            @restart="restartForSettingsUpdate"
                            @show-banner="showUpdateBannerAgain"
                        />
                    </SettingsSection>
                </template>

                <!--
                    The server-profile list's and the application settings' own version
                    histories, per `main/profiles/ipc.ts` and `main/settings/ipc.ts`. Both
                    resolve their host from the same bridge the config-folder history panel
                    probes, feature-detected the same way: `null` when this build has neither
                    method, never a control that throws.
                -->
                <template #history>
                    <SettingsSection
                        ref="historySection"
                        anchor="history"
                        :title="copy.history.title"
                        :description="copy.history.description"
                    >
                        <SimpleHistoryList :title="historyCopy.profiles" :host="profilesHistoryHost" />
                        <SimpleHistoryList :title="historyCopy.appSettings" :host="appSettingsHistoryHost" />
                    </SettingsSection>
                </template>

                <!--
                    `main/repair/index.ts`: the deterministic diagnosis and the guardrailed
                    local-agent repair for a render or web server that failed to start, per
                    `docs/automatic-repair.md`. See `RepairPanel.vue`'s own doc comment for
                    what genuinely reaches this list today.
                -->
                <template #diagnostics>
                    <SettingsSection
                        ref="diagnosticsSection"
                        anchor="diagnostics"
                        :title="copy.diagnostics.title"
                        :description="copy.diagnostics.description"
                    >
                        <RepairPanel />
                    </SettingsSection>
                </template>
            </TabbedNavigation>
        </div>
    </DockedSurface>
</template>

<style>
/*
 * The chrome, the placement, the width cap and the Escape handling all belong to
 * `DockedSurface` now. What is left here is the search row above the tabs, the match
 * list a search produces, and the column the tabbed body fills.
 */
.mb-settings__search {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-settings__results {
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.mb-settings__result-list {
    margin: 0;
    padding: 4px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mb-settings__result {
    display: flex;
    flex-direction: column;
    gap: 2px;
    inline-size: 100%;
    text-align: start;
    padding: 8px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.mb-settings__result:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-settings__result:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-settings__result-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
}

.mb-settings__result-desc {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-settings__body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: 0 16px 24px;
}

.mb-settings__body:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
    border-radius: 8px;
}

.mb-settings__empty {
    margin: 0;
    padding: 8px 10px;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
