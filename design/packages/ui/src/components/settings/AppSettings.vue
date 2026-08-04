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
import DockedSurface from "./DockedSurface.vue";
import JavaRuntimeRow from "./JavaRuntimeRow.vue";
import SettingsSection from "./SettingsSection.vue";
import StorageSettingRow from "./StorageSettingRow.vue";
import SurfacePlacementRow from "./SurfacePlacementRow.vue";
import WorldFolderRow from "./WorldFolderRow.vue";
import { DOCK_PLACEMENTS } from "./dockPlacement.js";
import { dockedSurfaces } from "./useDockPlacement.js";
import { createJavaSetting, describeJavaRejections } from "./javaSetting.js";
import { createMapStorageSetting } from "./mapStorageSetting.js";
import {
    dockPlacementLabel,
    githubSectionCopy,
    javaUnsupportedCopy,
    sectionCopy,
    worldFolderCopy,
} from "./settingsCopy.js";
import {
    filterSections,
    sectionSample,
    type SettingsAnchor,
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
 * **Opening at an anchor reveals the setting.** It scrolls it into view, focuses it, and
 * outlines it briefly, because a render that stopped and offered a link has promised a
 * remedy; landing somebody on a settings page with four rows on it and leaving them to
 * work out which one was meant is a hint. If a leftover search query is hiding the
 * section being revealed, the query is cleared first — being sent to a setting that is
 * filtered out of view is the same dead end wearing a different hat.
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
        anchor?: SettingsAnchor | null;
        /** True when a render said this setting was missing, not merely wrong. */
        anchorMissing?: boolean;
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

/** Every docked panel that is open right now, including this one. */
const surfaces = dockedSurfaces();

// The GitHub controller is the only one of the three that subscribes to a push channel,
// so it is the only one with a subscription to give back. Left attached it would keep
// answering events after the surface it draws has gone.
onBeforeUnmount(() => {
    github.dispose();
});

const panel = ref<HTMLElement | null>(null);
const consentRow = ref<InstanceType<typeof ConsentSettingsRow> | null>(null);
const consentSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const javaSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const storageSection = ref<InstanceType<typeof SettingsSection> | null>(null);
const worldSection = ref<InstanceType<typeof SettingsSection> | null>(null);

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
    ];
});

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const visible = computed(() => filterSections(sections.value, matcher.value));

const sample = computed(() => sectionSample(sections.value));

function shows(anchor: SettingsSectionAnchor): boolean {
    return visible.value.includes(anchor);
}

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
/* Revealing the setting a render pointed at                                  */
/* -------------------------------------------------------------------------- */

function sectionFor(anchor: SettingsAnchor): InstanceType<typeof SettingsSection> | null {
    switch (anchor) {
        case "mojang-download-consent":
            return consentSection.value;
        case "java-runtime":
            return javaSection.value;
        case "map-storage-directory":
            return storageSection.value;
        case "world-folder":
            return worldSection.value;
    }
}

async function revealAnchor(anchor: SettingsAnchor | null): Promise<void> {
    // No anchor means "just open it". Focus still moves inside the sheet, or the first
    // keystroke after it opens goes to whatever was focused behind it.
    if (anchor === null) {
        await nextTick();
        panel.value?.focus();
        return;
    }

    // A query left over from last time can be hiding the very section being revealed.
    if (!shows(anchor)) query.value = "";
    await nextTick();

    const section = sectionFor(anchor);
    if (section === null) return;

    if (anchor === "mojang-download-consent") {
        // The consent row focuses and outlines itself through its own `highlight()`, so
        // the section scrolls and outlines but does not take the focus off it. Two
        // elements racing for focus is how the ring ends up on whichever won.
        section.reveal({ focus: false });
        consentRow.value?.highlight();
        return;
    }

    section.reveal();
}

/**
 * Opening and re-anchoring both reveal, and they routinely happen in the same tick —
 * the shell sets the anchor and then opens. Collapsing them onto one pending value keeps
 * that from firing two reveals, and therefore from restarting the outline mid-flash.
 */
let pending: SettingsAnchor | null | undefined;

function scheduleReveal(anchor: SettingsAnchor | null): void {
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
            <!--
                `v-show`, not `v-if`. A section filtered out by the search must stay
                mounted: its template ref is what `reveal()` acts on, and a render
                pointing at a setting the query happens to be hiding would otherwise
                arrive at a null ref and silently do nothing.
            -->
            <SettingsSection
                v-show="shows('mojang-download-consent')"
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

            <SettingsSection
                v-show="shows('java-runtime')"
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

            <SettingsSection
                v-show="shows('map-storage-directory')"
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

            <SettingsSection
                v-show="shows('world-folder')"
                ref="worldSection"
                anchor="world-folder"
                :title="copy['world-folder'].title"
                :description="copy['world-folder'].description"
            >
                <WorldFolderRow
                    :missing="props.anchor === 'world-folder' && props.anchorMissing"
                />
            </SettingsSection>

            <!--
                No render can send somebody here: nothing in the bridge's `SettingsTarget`
                names a GitHub account, because a render that cannot reach a private
                repository fails on the repository rather than on the setting. So this
                section is reached by opening Settings, and is listed and searched exactly
                like the four that a failure can link to.
            -->
            <SettingsSection
                v-show="shows('github-account')"
                anchor="github-account"
                :title="copy['github-account'].title"
                :description="copy['github-account'].description"
            >
                <GitHubAccountRow :account="github" />
            </SettingsSection>

            <!--
                The language mode and both funny levels, which until now were reachable
                only while first-run setup was still on screen. `LanguageSettingsRow`
                mounts the first-run flow's own `SetupLanguagePanel`, so this is the same
                three controls rather than a second set writing the same stored keys.
            -->
            <SettingsSection
                v-show="shows('language-and-tone')"
                anchor="language-and-tone"
                :title="copy['language-and-tone'].title"
                :description="copy['language-and-tone'].description"
            >
                <LanguageSettingsRow />
            </SettingsSection>

            <!--
                Where every docked panel sits, and the one reset that reaches the ones
                that are closed. Each panel's own chooser is in its own title bar, which
                is where somebody moves the panel they are looking at; this is where they
                undo a move they have since forgotten making.
            -->
            <SettingsSection
                v-show="shows('surface-placement')"
                anchor="surface-placement"
                :title="copy['surface-placement'].title"
                :description="copy['surface-placement'].description"
            >
                <SurfacePlacementRow />
            </SettingsSection>

            <p v-if="visible.length === 0" class="mb-settings__empty" role="status">
                {{
                    matcher.error !== null
                        ? t("settings.search.badPattern", "The pattern is not valid, so nothing is listed.")
                        : t("settings.search.noMatches", "No setting on this screen matches that.")
                }}
            </p>
        </div>
    </DockedSurface>
</template>

<style>
/*
 * The chrome, the placement, the width cap and the Escape handling all belong to
 * `DockedSurface` now. What is left here is the two things that are this surface's own:
 * the search row above the sections, and the column the sections sit in.
 */
.mb-settings__search {
    padding: 12px 16px;
}

.mb-settings__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px 24px;
}

.mb-settings__body:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
    border-radius: 8px;
}

.mb-settings__empty {
    margin: 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
