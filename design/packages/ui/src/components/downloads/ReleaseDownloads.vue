<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloudSearchOutline } from "@mdi/js";
import { VAlert, VBtn, VProgressCircular, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import DownloadRowCard from "./DownloadRowCard.vue";
import ReleaseAssetList from "./ReleaseAssetList.vue";
import { DEFAULT_RELEASE, adviseOnDownloadFailure, createDownloads, type DownloadRow } from "./downloads.js";
import {
    resolveDownloadBridge,
    type AvailableAsset,
    type DownloadBridge,
    type ReleaseCoordinates,
    type SettingsTarget,
} from "./downloadBridge.js";
import { useSettingsOpener } from "./settingsOpener.js";

/**
 * Getting a world, or a rendered map, out of a release and onto this machine.
 *
 * A release of this project carries worlds and maps that are far past GitHub's
 * two-gigabyte asset cap, so they are published as 1.7 GB parts with a SHA-256 for every
 * part beside them. Nothing about that split is somebody's problem here: the app reads the
 * manifest, fetches the parts several at a time, checks each one as it arrives, rejoins
 * them, checks the whole file, and unpacks it. What this surface owes in return is an
 * honest account of a process that takes tens of minutes, which is why every row carries
 * real byte counts rather than a spinner.
 *
 * The world does not have to be this project's own release, either. `owner`, `repo` and
 * `tag` reach `worldsource:discover`/`worldsource:fetch`, which understand any public
 * repository and both split layouts this project knows about - its own parts manifest and
 * the far more common `SHA256SUMS` beside numbered parts a plain `sha256sum` produces. See
 * `docs/world-sources.md`. The optional "paste a link" field above them calls
 * `bridge.parseLink` on every keystroke and writes what it resolves to into those same
 * three fields; it is convenience over them, never a replacement, and a bridge that cannot
 * parse a link (`canParseLink` false) simply never shows it.
 *
 * Three behaviours are deliberate and easy to mistake for omissions.
 *
 * **Nothing is fetched until somebody asks.** Mounting this reconciles with what is
 * already on disk and in flight, which costs nothing and touches no network; reading a
 * release is a network request and waits for the button. A surface that quietly called
 * GitHub every time a wizard step was opened would be spending somebody's rate limit on a
 * question they never asked.
 *
 * **A build with no bridge says so and stops.** There is no browser fallback that could
 * work: a browser tab has nowhere to write a twenty gigabyte world, no way to resume a
 * ranged request into a file, and no zip reader that streams. Saying that plainly is worth
 * more than a Download button that fails on press.
 *
 * **A pasted link never overwrites a repository somebody already typed by hand, on its
 * own.** Parsing runs on every keystroke and only ever fills the three fields in when it
 * resolves to something real; text that names no repository - which is what most
 * keystrokes look like while somebody is still typing - leaves them exactly as they were.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this
         * has no default: `undefined` means probe, `null` means there is deliberately no
         * bridge and the unsupported state is what should be shown.
         */
        // `| undefined` is spelled out rather than left to the `?`, because
        // `exactOptionalPropertyTypes` distinguishes the two and a parent that forwards a
        // possibly-absent bridge of its own has to be able to pass it straight through.
        bridge?: DownloadBridge | null | undefined;
        /** Which release to look at first. Every field stays editable. */
        where?: ReleaseCoordinates | undefined;
    }>(),
    {},
);

const emit = defineEmits<{
    /** A downloaded, verified and unpacked folder somebody chose to use. */
    use: [folder: string];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveDownloadBridge() : props.bridge;
const downloads = createDownloads(bridge);

/**
 * Where a failure's settings button goes, when anything above offered a route.
 *
 * Injected rather than emitted because this surface is mounted several steps deep inside
 * the create-a-map wizard, and only the screen at the top of that tree can open a settings
 * anchor. Null is a real answer: the row then names the setting in words rather than
 * showing a button with nowhere to go.
 */
const openSettings = useSettingsOpener();

const owner = ref(props.where?.owner ?? DEFAULT_RELEASE.owner);
const repo = ref(props.where?.repo ?? DEFAULT_RELEASE.repo);
const tag = ref(props.where?.tag ?? DEFAULT_RELEASE.tag);

/**
 * A whole `owner/repo`, a URL, or a release link, resolved into the three fields above.
 *
 * A build whose bridge cannot parse one - `bridge?.canParseLink` false - simply never
 * shows this field rather than showing a control that would silently do nothing: the
 * three fields underneath stay the only way in, exactly as they always were. Resolved on
 * every keystroke, the same way `main/worldsource/repository.ts` was built to be called:
 * it touches no network, so there is nothing here worth waiting for a blur or an Enter to
 * ask.
 */
const link = ref("");

async function onLinkInput(): Promise<void> {
    if (bridge === null) return;
    const parsed = await bridge.parseLink(link.value);
    // Text that names no repository leaves the three fields exactly as they were, rather
    // than clearing them: that is what the field looks like for every keystroke before it
    // resolves to something real, and blanking a repository somebody had already typed
    // out from under them would be a worse field than no parsing at all.
    if (parsed === null) return;
    owner.value = parsed.owner;
    repo.value = parsed.repo;
    tag.value = parsed.tag ?? "";
}

/** Asset names being transferred right now, so the list never offers a second copy. */
const activeAssets = computed(() =>
    downloads.rows.value.filter((row) => row.state === "running" && row.asset !== "").map((row) => row.asset),
);

const canLook = computed(
    () => downloads.available && owner.value.trim() !== "" && repo.value.trim() !== "" && !downloads.discovering.value,
);

/*
 * The rows below get their own search, separate from the one over a release's assets.
 *
 * They are two different collections that happen to sit on one screen: the assets are
 * what a release offers, the rows are what this machine has fetched, is fetching, or
 * failed to fetch, across every session it can read back. The second list is the one
 * that grows without bound, and the one somebody comes back to a week later looking
 * for a particular world by name. One shared field would filter whichever list was
 * touched last, which is precisely the failure the contract names.
 *
 * The three fields above are not search bars and get no builder: owner, repository
 * and tag address a release rather than filter one, and a regular expression in any
 * of them would be a string sent to GitHub, not a pattern run here.
 */
const rowQuery = ref("");
const rowRegex = ref(false);
const rowFlags = ref("i");

const rowMatcher = computed(() => createSettingMatcher(rowQuery.value, rowRegex.value, rowFlags.value));

/**
 * What a row can be found by: the file name, the repository it came from, its tag, and
 * the id, which is all a row started in another session has until its first event lands.
 * Only text that is on screen, so searching for something visible finds the row showing it.
 */
function rowText(row: DownloadRow): string[] {
    return [row.asset, row.repository, row.tag, row.downloadId].filter((value) => value !== "");
}

const shownRows = computed(() =>
    downloads.rows.value.filter((row) => rowText(row).some((value) => rowMatcher.value.test(value))),
);

const rowSample = computed(() => downloads.rows.value.map((row) => rowText(row).join(" ")).join("\n"));

const rowSummary = computed(() =>
    rowMatcher.value.active
        ? t(
              "downloads.rows.searchSummary",
              { shown: shownRows.value.length, total: downloads.rows.value.length },
              "Showing {shown} of {total}",
          )
        : "",
);

const startAdvice = computed(() => {
    const failure = downloads.startFailure.value;
    return failure === null ? null : adviseOnDownloadFailure(failure, t);
});

onMounted(() => {
    // What is already going must be on screen before anybody presses anything: a download
    // started in another window, or before this was opened, is otherwise invisible here
    // and gets started a second time.
    void downloads.reconcile();
});

onBeforeUnmount(() => {
    downloads.dispose();
});

function look(): void {
    if (!canLook.value) return;
    void downloads.discover({ owner: owner.value, repo: repo.value, tag: tag.value });
}

function download(asset: AvailableAsset): void {
    const chosen = downloads.release.value;
    if (chosen === null) return;
    // The tag comes from the release that was actually read rather than from the field,
    // which may say `latest` or nothing at all. A row that named the tag as "latest" would
    // point at a different release tomorrow.
    void downloads.start({
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        tag: chosen.tag,
        asset: asset.name,
    });
}

function cancel(downloadId: string): void {
    void downloads.cancel(downloadId);
}

function resume(row: DownloadRow): void {
    void downloads.resume(row);
}

function reveal(target: SettingsTarget): void {
    openSettings?.(target);
}

defineExpose({ downloads });
</script>

<template>
    <section class="mb-downloads" :aria-label="t('downloads.title', 'Download a world from a release')">
        <h4 class="mb-downloads__title">{{ t("downloads.title", "Download a world from a release") }}</h4>
        <p class="mb-downloads__blurb">
            {{
                t(
                    "downloads.blurb",
                    "A release can carry a whole Minecraft world, or a map already rendered from one. Anything past two gigabytes is published in 1.7 GB parts with a checksum for each; the app fetches them, checks every one, puts them back together and unpacks the result. Stopping is safe at any point, and starting again continues from the byte it reached.",
                )
            }}
        </p>

        <v-alert
            v-if="!downloads.available"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-downloads__alert"
        >
            {{
                t(
                    "downloads.unsupported",
                    "This build cannot download releases. The desktop app is what fetches the parts, checks them against their published checksums and rejoins them; a browser tab has nowhere to write a world of this size.",
                )
            }}
        </v-alert>

        <template v-else>
            <v-text-field
                v-if="downloads.available && bridge?.canParseLink"
                v-model="link"
                :label="t('downloads.link', 'Paste a link, or type owner, repository and tag below')"
                :placeholder="t('downloads.linkHint', 'https://github.com/owner/repo/releases/tag/...')"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                class="mb-downloads__link"
                @update:model-value="onLinkInput"
            />

            <div class="mb-downloads__where">
                <v-text-field
                    v-model="owner"
                    :label="t('downloads.owner', 'Owner')"
                    variant="outlined"
                    density="compact"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    hide-details="auto"
                    @keydown.enter="look"
                />
                <v-text-field
                    v-model="repo"
                    :label="t('downloads.repo', 'Repository')"
                    variant="outlined"
                    density="compact"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    hide-details="auto"
                    @keydown.enter="look"
                />
                <v-text-field
                    v-model="tag"
                    :label="t('downloads.tag', 'Tag')"
                    :placeholder="t('downloads.tagPlaceholder', 'blank for the latest release')"
                    variant="outlined"
                    density="compact"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    hide-details="auto"
                    @keydown.enter="look"
                />
                <v-btn
                    :prepend-icon="mdiCloudSearchOutline"
                    :disabled="!canLook"
                    color="primary"
                    variant="tonal"
                    @click="look"
                >
                    {{ t("downloads.look", "See what it offers") }}
                </v-btn>
            </div>

            <div v-if="downloads.discovering.value" class="mb-downloads__checking" role="status" aria-live="polite">
                <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                <span>{{ t("downloads.reading", "Reading the release...") }}</span>
            </div>

            <v-alert
                v-else-if="downloads.discoveryFailure.value"
                type="warning"
                density="compact"
                variant="tonal"
                class="mb-downloads__alert"
                role="alert"
            >
                <p>{{ downloads.discoveryFailure.value }}</p>
                <p class="mb-downloads__note">
                    {{
                        t(
                            "downloads.discoveryNote",
                            "Nothing was downloaded. Check the owner, the repository and the tag; a private release also needs this machine to have a GitHub token in its environment.",
                        )
                    }}
                </p>
            </v-alert>

            <ReleaseAssetList
                v-if="downloads.release.value"
                :release="downloads.release.value"
                :starting="downloads.starting.value"
                :active="activeAssets"
                @download="download"
            />

            <v-alert
                v-if="startAdvice"
                type="error"
                density="compact"
                variant="tonal"
                class="mb-downloads__alert"
                role="alert"
            >
                <p>{{ startAdvice.message }}</p>
                <p class="mb-downloads__note">{{ startAdvice.explanation }}</p>
                <p v-if="startAdvice.detail" class="mb-downloads__detail">{{ startAdvice.detail }}</p>
            </v-alert>

            <v-alert
                v-if="downloads.listFailure.value"
                type="warning"
                density="compact"
                variant="tonal"
                class="mb-downloads__alert"
            >
                {{
                    t(
                        "downloads.listFailed",
                        { message: downloads.listFailure.value },
                        "Downloads already on this machine could not be listed: {message}. Anything started from here is still shown below.",
                    )
                }}
            </v-alert>

            <!--
                Only once there is something to filter. A search bar over an empty list is
                a control that cannot do anything, and the empty state below already says
                what is going on far better than "showing 0 of 0" would.
            -->
            <div v-if="downloads.rows.value.length > 0" class="mb-downloads__search">
                <ConfigSearchField
                    v-model="rowQuery"
                    v-model:regex="rowRegex"
                    v-model:flags="rowFlags"
                    :label="t('downloads.rows.searchLabel', 'Search what is on this machine')"
                    :placeholder="t('downloads.rows.searchHint', 'file name, repository or tag')"
                    :sample="rowSample"
                    :summary="rowSummary"
                />
            </div>

            <p
                v-if="downloads.rows.value.length > 0 && shownRows.length === 0"
                class="mb-downloads__note"
                role="status"
            >
                {{
                    t(
                        "downloads.rows.noMatch",
                        "Nothing on this machine matches that search. Clearing it brings every download back; none of them was removed.",
                    )
                }}
            </p>

            <!--
                The single-element form of the same entry (styles/motion.scss). Not the
                staggered container form the renders and notification lists use: these cards
                share their parent with the search field and two explanatory notes, and a
                cascade keyed on `nth-child` would count those as rows.
            -->
            <DownloadRowCard
                v-for="row in shownRows"
                :key="row.downloadId"
                class="mb-motion-enter"
                :row="row"
                :can-cancel="downloads.canCancel"
                :can-open-settings="openSettings !== null"
                @cancel="cancel"
                @resume="resume"
                @use="(folder: string) => emit('use', folder)"
                @settings="reveal"
            />

            <p v-if="!downloads.canList" class="mb-downloads__note">
                {{
                    t(
                        "downloads.cannotList",
                        "This build cannot read back downloads from earlier sessions, so only the ones started here are listed.",
                    )
                }}
            </p>
        </template>
    </section>
</template>

<style>
.mb-downloads {
    margin-block-start: 12px;
}

.mb-downloads__title {
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-downloads__blurb,
.mb-downloads__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-downloads__blurb {
    margin-block-start: 4px;
    font-size: 0.8125rem;
}

.mb-downloads__note {
    margin-block-start: 6px;
}

.mb-downloads__detail {
    margin-block-start: 6px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
}

.mb-downloads__alert {
    margin-block-start: 12px;
}

.mb-downloads__link {
    margin-block-start: 12px;
    max-width: 480px;
}

.mb-downloads__where {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
    margin-block: 12px;
}

.mb-downloads__search {
    margin-block-start: 12px;
    max-width: 420px;
}

.mb-downloads__where .v-text-field {
    flex: 1 1 160px;
    min-width: 0;
}

.mb-downloads__checking {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    margin-block-start: 12px;
}
</style>
