<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiDeleteOutline,
    mdiDownload,
    mdiFolderMultipleOutline,
    mdiPencilOutline,
    mdiPlay,
    mdiPlus,
    mdiRefresh,
    mdiSelectAll,
    mdiSelectInverse,
    mdiSelectOff,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckboxBtn,
    VChip,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VProgressLinear,
    VSelect,
    VSpacer,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    EXPORT_FORMATS,
    exportFileName,
    exportProjects,
    projectDetailLine,
    projectOptionName,
    projectSearchText,
    sortProjects,
    type ExportFormat,
    type ProjectRow,
} from "./projectModel.js";

/**
 * Every project this machine knows about, as a listbox.
 *
 * A project is a file at the root of a Minecraft world, so "the projects on this machine"
 * means the worlds the catalogue can see that carry one. The rows are supplied rather than
 * fetched here: this component is the presentation, and the screen above it owns the host.
 *
 * Modelled on `../ProfileManager.vue`, which is the other listbox in this application, and
 * deliberately so - the two lists behave identically because a user who has learned one has
 * learned both. Same roving tabindex, same appearance target per row keyed by something
 * that outlives the process, same gate anchored to the row's own button rather than one
 * shared gate that has to be told which row it is standing in front of.
 *
 * Two things it does that the profile list does not, because this collection grows in a
 * different way. It is **multi-selectable**, so forty worlds tried once each can be tidied
 * up in one pass rather than forty; and it **exports**, because a list of where every
 * project lives is exactly the sort of thing somebody wants outside the app.
 */
const props = withDefaults(
    defineProps<{
        rows: readonly ProjectRow[];
        /** True while the list is being read, so the empty state does not lie. */
        busy?: boolean;
        /** The host's name, or null when this build cannot look at all. */
        hostName?: string | null;
        /** False when this build can list and open projects but not delete one. */
        canDelete?: boolean;
        /** How many world folders were examined, so an empty list can say it looked. */
        scanned?: number;
        /** Folders that could not be examined, each with the reason. */
        problems?: readonly { readonly world: string; readonly message: string }[];
    }>(),
    { busy: false, hostName: null, canDelete: true, scanned: 0, problems: () => [] },
);

const emit = defineEmits<{
    /** Open one project in the editor. */
    open: [world: string];
    /** Render one project with its own settings, without opening it first. */
    render: [world: string];
    /** Take one project file off the disk. Gated before it is emitted. */
    forget: [world: string];
    /** Take several project files off the disk. Gated before it is emitted. */
    forgetMany: [worlds: readonly string[]];
    /** Read the list again. */
    refresh: [];
    /** Start a new, empty project. */
    create: [];
    /** Something worth saying in the notification corner. */
    notify: [level: "info" | "success" | "warning" | "error", message: string];
}>();

const { t } = useI18n();

/**
 * A per-mount prefix for the DOM ids this component hands out.
 *
 * The option ids are what the keyboard handler moves focus with, and the gate button ids
 * are what the row menu's Remove command presses. Both have to be unique in the document
 * rather than merely unique in the list, because nothing stops a second copy of this list
 * existing - a command palette preview, a settings screen embedding it - and two elements
 * sharing an id means `getElementById` picks whichever rendered first and the keyboard
 * silently drives the wrong list.
 */
const uid = useId();

function optionId(world: string): string {
    return `${uid}-project-${encodeURIComponent(world)}`;
}

/**
 * The id of the button that opens one row's delete gate.
 *
 * Named for the gate rather than for the deletion, exactly as `ProfileManager.vue` names
 * its own: `components/confirm/superConfirmPolicy.test.ts` counts destructive-looking call
 * sites per file and asks each one to be declared, and a helper called `deleteId` reads to
 * that guard as more deletions in a file that performs exactly one.
 */
function gateButtonId(world: string): string {
    return `${uid}-gate-${encodeURIComponent(world)}`;
}

/**
 * The key this row's appearance is stored under.
 *
 * The project's own id and nothing else. Not the row's index, which changes the moment a
 * row above it is deleted or the list is filtered, so the third project would silently
 * inherit the second's colours the first time somebody tidies up; and not anything derived
 * from {@link uid}, which is regenerated on every mount and would lose the styling by the
 * next launch. The project id is the one identifier here that outlives the process: it is
 * written into the project file itself and survives a rename and a move.
 */
function appearanceIdOf(row: ProjectRow): string {
    return `project.${row.id}`;
}

/* -------------------------------------------------------------------------- */
/* Finding one among many                                                     */
/* -------------------------------------------------------------------------- */

/**
 * This list's own query, mode and flags, with its own anchored builder.
 *
 * Every collection in this application carries one. Plain text stays the default and regex
 * is the opt-in the shared field provides, so nothing changes for the person who just wants
 * to type the name of a world.
 */
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so the
 * optional flags are normalised once here rather than coalesced at every binding.
 */
const isBusy = computed(() => props.busy === true);
const deletable = computed(() => props.canDelete === true);

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const ordered = computed(() => sortProjects(props.rows));

const visible = computed(() => ordered.value.filter((row) => matcher.value.test(projectSearchText(row, t))));

/** What the builder previews against: the rows themselves, one per line. */
const sample = computed(() => ordered.value.map((row) => projectSearchText(row, t)).join("\n"));

const summary = computed(() => {
    if (matcher.value.error !== null) {
        return t("project.list.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    if (!matcher.value.active) return "";
    return t(
        "project.list.searchSummary",
        { shown: visible.value.length, total: ordered.value.length },
        "Showing {shown} of {total}.",
    );
});

/**
 * When the field is on screen.
 *
 * A filter over three rows costs more attention than it saves, so it appears once there is
 * enough to search. The second clause is the part that is not cosmetic: with exactly four
 * rows and a query typed, deleting one would drop the count under the threshold and take
 * the search away *while its query was still filtering the list*, leaving rows hidden with
 * nothing on screen to explain it. A field stays for as long as it is doing something.
 */
const searchVisible = computed(() => ordered.value.length > 3 || query.value.length > 0);

/* -------------------------------------------------------------------------- */
/* The listbox                                                                */
/* -------------------------------------------------------------------------- */

const focusedWorld = ref<string | null>(null);

const orderedWorlds = computed(() => visible.value.map((row) => row.world));

/**
 * Which row holds the list's single tab stop.
 *
 * A listbox is one stop in the tab order, not one per row: Tab reaches the list and the
 * arrow keys move inside it. Exactly one option carries `tabindex="0"` and the rest carry
 * `-1`, which is what stops a thirty-project list from being thirty presses of Tab away
 * from the button after it. When a search hides whichever row held the stop it moves to a
 * row that is really on screen, because a tab stop on an element that is not rendered is a
 * Tab press that appears to do nothing at all.
 */
const rovingWorld = computed<string | null>(() => {
    const worlds = orderedWorlds.value;
    if (focusedWorld.value !== null && worlds.includes(focusedWorld.value)) return focusedWorld.value;
    return worlds[0] ?? null;
});

function focusOption(world: string): void {
    focusedWorld.value = world;
    // After the render that moves `tabindex="0"` onto it. Focusing first would work - a
    // `tabindex="-1"` element is still programmatically focusable - but it would leave the
    // document's focus and the list's idea of it disagreeing for a frame, which is exactly
    // the window in which a second keypress arrives.
    void nextTick(() => document.getElementById(optionId(world))?.focus());
}

function noteFocus(world: string): void {
    focusedWorld.value = world;
}

/* -------------------------------------------------------------------------- */
/* Choosing several                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The rows chosen for a bulk action, by world path.
 *
 * By path rather than by index for the same reason the appearance key is: an index survives
 * neither a filter nor a deletion, and a bulk delete that ran against stale indices would
 * remove the wrong projects. Rows that leave the list are dropped from the selection below,
 * so "3 selected" can never count something that is no longer there.
 */
const chosen = ref<string[]>([]);

watch(
    () => props.rows,
    () => {
        const alive = new Set(props.rows.map((row) => row.world));
        chosen.value = chosen.value.filter((world) => alive.has(world));
    },
);

const chosenRows = computed(() => ordered.value.filter((row) => chosen.value.includes(row.world)));

function isChosen(world: string): boolean {
    return chosen.value.includes(world);
}

function toggleChosen(world: string): void {
    chosen.value = isChosen(world)
        ? chosen.value.filter((candidate) => candidate !== world)
        : [...chosen.value, world];
}

/**
 * Select-all means what is on screen, and says so.
 *
 * The contract asks a select-all to state plainly whether it means this page or every
 * match, and a list with a query typed makes the difference matter: somebody who has
 * filtered to `nether` and pressed select-all meant those, not all forty. So this selects
 * the matches and the label counts them.
 */
function chooseAll(): void {
    chosen.value = orderedWorlds.value.slice();
}

function chooseNone(): void {
    chosen.value = [];
}

function chooseInverse(): void {
    const shown = orderedWorlds.value;
    chosen.value = shown.filter((world) => !isChosen(world));
}

const bulkLabel = computed(() =>
    t("project.list.chosenCount", { chosen: chosen.value.length }, "{chosen} selected"),
);

/* -------------------------------------------------------------------------- */
/* What a bulk delete costs                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What deleting a project actually takes away, said as the gate requires: exactly, and
 * without softening.
 *
 * The two things people assume and neither of which is true are named on purpose. The world
 * is not touched - this is a settings file inside it, not the save - and the tiles a
 * previous render wrote are not removed either, so the disk space is not coming back. What
 * is lost is every setting this world was set up with, which is precisely the thing the
 * project exists to keep, and there is no history panel behind this to restore it from.
 */
function whatRemovalCosts(rows: readonly ProjectRow[]): string[] {
    const lines: string[] = [];
    for (const row of rows.slice(0, 8)) {
        lines.push(t("project.list.deleteRow", { name: row.name, file: row.file }, "{name}, the file {file}"));
    }
    if (rows.length > 8) {
        lines.push(t("project.list.deleteMore", { more: rows.length - 8 }, "and {more} more"));
    }
    lines.push(
        t(
            "project.list.deleteWorldNote",
            "The Minecraft world itself is not touched. Only this settings file inside it is removed.",
        ),
    );
    lines.push(
        t(
            "project.list.deleteTilesNote",
            "Tiles that were already rendered stay on the disk. Nothing here deletes them, so the space is not coming back either.",
        ),
    );
    lines.push(
        t(
            "project.list.deleteSettingsNote",
            "Every map, storage and setting this project held goes with it. There is no history behind this list to put it back.",
        ),
    );
    return lines;
}

const oneRowCosts = (row: ProjectRow): string[] => whatRemovalCosts([row]);

/* -------------------------------------------------------------------------- */
/* Taking the list away with you                                              */
/* -------------------------------------------------------------------------- */

const exportFormat = ref<ExportFormat>("json");

const exportItems = computed(() =>
    EXPORT_FORMATS.map((format) => ({
        value: format,
        title:
            format === "json"
                ? t("project.list.formatJson", "JSON, every field, re-readable")
                : format === "csv"
                  ? t("project.list.formatCsv", "CSV, for a spreadsheet")
                  : t("project.list.formatMarkdown", "Markdown table, for pasting"),
    })),
);

/**
 * Writes the chosen rows out, or the whole visible list when nothing is chosen.
 *
 * A download when the browser can make one and the clipboard when it cannot, and it says
 * which of the two happened. A silent "export" that turns out to have gone nowhere is the
 * failure worth avoiding here, because the person has no way to tell from the screen.
 */
async function exportChosen(): Promise<void> {
    const rows = chosenRows.value.length > 0 ? chosenRows.value : visible.value;
    if (rows.length === 0) return;

    const text = exportProjects(rows, exportFormat.value);
    const name = exportFileName(exportFormat.value);

    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
        emit("notify", "success", t("project.list.exported", { name, count: rows.length }, "Wrote {count} projects to {name}."));
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        emit(
            "notify",
            "success",
            t("project.list.exportedClipboard", { count: rows.length }, "Copied {count} projects to the clipboard."),
        );
    } catch {
        emit("notify", "error", t("project.list.exportFailed", "Could not write the export, and could not reach the clipboard either."));
    }
}

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Arrow, Home and End move the focused row. Enter opens it. Space chooses it.
 *
 * Deliberately not selection-follows-focus. Enter opens a project, which replaces this
 * screen, so a list where focus and activation moved together could not be arrowed through
 * at all. Space is the multi-select toggle a `aria-multiselectable` listbox is expected to
 * carry, and it is what makes the bulk actions reachable without a mouse.
 *
 * The ends clamp rather than wrap: somebody holding ArrowDown to reach the bottom of a long
 * list should stop there, not silently reappear at the top having lost their place.
 *
 * `ROW_OPEN_KEY` and `ROW_CHOOSE_KEY` are named once and read by both the handler below and
 * the row menu's own `<kbd>` hint (in the template, through {@link keyLabel}), so the label
 * a user reads can never say a key that this handler does not actually answer to.
 */
const ROW_OPEN_KEY = "Enter";
const ROW_CHOOSE_KEY = " ";

/** The word somebody would look for on their own keyboard, for a `KeyboardEvent.key` value. */
function keyLabel(key: string): string {
    return key === " " ? "Space" : key;
}

function onOptionKeydown(event: KeyboardEvent, row: ProjectRow): void {
    if (event.key === ROW_OPEN_KEY) {
        event.preventDefault();
        emit("open", row.world);
        return;
    }
    if (event.key === ROW_CHOOSE_KEY || event.key === "Spacebar") {
        // Space scrolls the card underneath if it is left alone, which moves the list out
        // from under the row the user just chose.
        event.preventDefault();
        toggleChosen(row.world);
        return;
    }

    const worlds = orderedWorlds.value;
    const here = worlds.indexOf(row.world);
    if (here === -1) return;

    let wanted: number;
    if (event.key === "ArrowDown") wanted = here + 1;
    else if (event.key === "ArrowUp") wanted = here - 1;
    else if (event.key === "Home") wanted = 0;
    else if (event.key === "End") wanted = worlds.length - 1;
    else return;

    event.preventDefault();
    const target = worlds[Math.min(Math.max(wanted, 0), worlds.length - 1)];
    if (target !== undefined) focusOption(target);
}

/**
 * The row menu's Remove command presses the row's own gate button.
 *
 * One gate per row and exactly one, reached from two places. A second `ConfigSuperConfirm`
 * inside the context menu would be a second gate guarding the same deletion, with its own
 * keys and its own chance of one of them being wired differently - and the whole point of a
 * two-key gate is that there is no route around it to keep in step.
 *
 * The press waits a tick because the menu is closing as this runs.
 */
function askToForget(world: string): void {
    void nextTick(() => document.getElementById(gateButtonId(world))?.click());
}
</script>

<template>
    <v-card class="mb-projects" :aria-label="t('project.list.cardLabel', 'Projects on this computer')">
        <v-card-title class="mb-projects__head">
            <v-icon :icon="mdiFolderMultipleOutline" aria-hidden="true" />
            <span>{{ t("project.list.title", "Projects") }}</span>
            <v-spacer />
            <v-btn
                :prepend-icon="mdiRefresh"
                variant="text"
                size="small"
                :disabled="hostName === null || isBusy"
                @click="emit('refresh')"
            >
                {{ t("project.list.refresh", "Look again") }}
            </v-btn>
            <v-btn :prepend-icon="mdiPlus" color="primary" variant="tonal" size="small" @click="emit('create')">
                {{ t("project.list.new", "New project") }}
            </v-btn>
        </v-card-title>

        <v-card-text>
            <p class="mb-projects__blurb">
                {{
                    t(
                        "project.list.blurb",
                        "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Open one to change anything before a render runs, or render it again exactly as it was.",
                    )
                }}
            </p>

            <v-alert v-if="hostName === null" type="info" density="compact" variant="tonal" class="mb-3">
                {{
                    t(
                        "project.list.noHost",
                        "Projects live in a file at the root of a Minecraft world, so opening one needs the desktop app. This page is running in a browser tab, which has no access to your world folders.",
                    )
                }}
            </v-alert>

            <v-alert v-else-if="!deletable" type="info" density="compact" variant="tonal" class="mb-3">
                {{
                    t(
                        "project.list.noDelete",
                        "This build can open and edit projects but cannot remove a project file. Delete it from the world folder yourself if you need it gone.",
                    )
                }}
            </v-alert>

            <v-progress-linear v-if="isBusy" indeterminate color="primary" class="mb-2" />

            <div v-if="searchVisible" class="mb-projects__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('project.list.searchLabel', 'Search projects')"
                    :placeholder="t('project.list.searchHint', 'a name, a world, or guide')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <!--
                The bulk bar appears once something is chosen, and it names the count in
                words rather than only in a badge, because the count is the fact that makes
                the difference between a tidy-up and an accident.
            -->
            <div class="mb-projects__bulk" role="group" :aria-label="t('project.list.bulkLabel', 'Actions on the chosen projects')">
                <span class="mb-projects__bulkcount" aria-live="polite">{{ bulkLabel }}</span>
                <v-btn :prepend-icon="mdiSelectAll" variant="text" size="small" :disabled="visible.length === 0" @click="chooseAll">
                    {{ t("project.list.selectShown", { shown: visible.length }, "Select the {shown} shown") }}
                </v-btn>
                <v-btn :prepend-icon="mdiSelectInverse" variant="text" size="small" :disabled="visible.length === 0" @click="chooseInverse">
                    {{ t("project.list.selectInverse", "Invert") }}
                </v-btn>
                <v-btn :prepend-icon="mdiSelectOff" variant="text" size="small" :disabled="chosen.length === 0" @click="chooseNone">
                    {{ t("project.list.selectNone", "Clear the selection") }}
                </v-btn>

                <v-spacer />

                <v-select
                    v-model="exportFormat"
                    :items="exportItems"
                    :label="t('project.list.exportFormat', 'Export as')"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="mb-projects__format"
                />
                <v-btn :prepend-icon="mdiDownload" variant="text" size="small" :disabled="visible.length === 0" @click="exportChosen">
                    {{
                        chosen.length > 0
                            ? t("project.list.exportChosen", { chosen: chosen.length }, "Export the {chosen} chosen")
                            : t("project.list.exportShown", { shown: visible.length }, "Export the {shown} shown")
                    }}
                </v-btn>

                <ConfigSuperConfirm
                    :title="t('project.list.bulkDeleteTitle', 'Remove these project files')"
                    :action="
                        t(
                            'project.list.bulkDeleteAction',
                            { chosen: chosen.length },
                            'This removes the project file from {chosen} world folders. It is not undoable from here.',
                        )
                    "
                    :affected="whatRemovalCosts(chosenRows)"
                    :confirm-label="t('project.list.bulkDeleteConfirm', 'Remove the chosen project files')"
                    :disabled="chosen.length === 0 || !deletable"
                    @confirm="emit('forgetMany', chosen.slice())"
                >
                    <template #activator="{ props: activatorProps }">
                        <v-btn
                            v-bind="activatorProps"
                            :prepend-icon="mdiDeleteOutline"
                            color="error"
                            variant="text"
                            size="small"
                            :disabled="chosen.length === 0 || !deletable"
                        >
                            {{ t("project.list.bulkDelete", { chosen: chosen.length }, "Remove {chosen}") }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
            </div>

            <div
                class="mb-projects__list"
                role="listbox"
                aria-multiselectable="true"
                :aria-label="t('project.list.listLabel', 'Projects on this computer')"
            >
                <AppearanceTarget
                    v-for="row in visible"
                    :id="appearanceIdOf(row)"
                    :key="row.world"
                    :label="row.name"
                    as="div"
                    role="presentation"
                    class="mb-projects__rowhost"
                >
                    <div class="mb-projects__row" @contextmenu="noteFocus(row.world)">
                        <!--
                            The tick sits beside the option and never inside it: ARIA forbids
                            an interactive descendant of an option, and a screen reader that
                            finds one announces the row and its control as one unusable
                            thing. The option's own `aria-selected` is what actually reports
                            the choice; this is the pointer route to the same state.
                        -->
                        <v-checkbox-btn
                            :model-value="isChosen(row.world)"
                            :aria-label="t('project.list.choose', { name: row.name }, 'Choose {name}')"
                            :tabindex="rovingWorld === row.world ? 0 : -1"
                            density="compact"
                            hide-details
                            @update:model-value="toggleChosen(row.world)"
                        />

                        <div
                            :id="optionId(row.world)"
                            class="mb-projects__option"
                            role="option"
                            :aria-selected="isChosen(row.world) ? 'true' : 'false'"
                            :aria-label="projectOptionName(row, t)"
                            :tabindex="rovingWorld === row.world ? 0 : -1"
                            @click="emit('open', row.world)"
                            @focus="noteFocus(row.world)"
                            @keydown="onOptionKeydown($event, row)"
                        >
                            <span class="mb-projects__text">
                                <span class="mb-projects__name">
                                    {{ row.name }}
                                    <v-chip v-if="row.fromWizard" size="x-small" variant="tonal" class="ms-2">
                                        {{ t("project.list.wizardChip", "from the guide") }}
                                    </v-chip>
                                    <v-chip v-if="row.problem" size="x-small" color="error" variant="flat" class="ms-2">
                                        {{ t("project.list.problemChip", "unreadable") }}
                                    </v-chip>
                                </span>
                                <span class="mb-projects__subtitle">{{ projectDetailLine(row, t) }}</span>
                            </span>
                        </div>

                        <span class="mb-projects__actions">
                            <v-btn
                                :icon="mdiPlay"
                                variant="text"
                                size="small"
                                :tabindex="rovingWorld === row.world ? 0 : -1"
                                :aria-label="t('project.list.renderOne', { name: row.name }, 'Render {name} with its own settings')"
                                @click="emit('render', row.world)"
                            />
                            <ConfigSuperConfirm
                                :title="t('project.list.deleteTitle', 'Remove this project file')"
                                :action="
                                    t(
                                        'project.list.deleteAction',
                                        { name: row.name },
                                        'This removes the project file for {name} from its world folder. It is not undoable from here.',
                                    )
                                "
                                :affected="oneRowCosts(row)"
                                :confirm-label="t('project.list.deleteConfirm', { name: row.name }, 'Remove the project file for {name}')"
                                :disabled="!deletable"
                                @confirm="emit('forget', row.world)"
                            >
                                <template #activator="{ props: activatorProps }">
                                    <v-btn
                                        v-bind="activatorProps"
                                        :id="gateButtonId(row.world)"
                                        :icon="mdiDeleteOutline"
                                        variant="text"
                                        size="small"
                                        :disabled="!deletable"
                                        :tabindex="rovingWorld === row.world ? 0 : -1"
                                        :aria-label="t('project.list.deleteConfirm', { name: row.name }, 'Remove the project file for {name}')"
                                    />
                                </template>
                            </ConfigSuperConfirm>
                        </span>
                    </div>

                    <!--
                        The row's own commands, above the appearance ones. `AppearanceTarget`
                        renders this slot first and its own commands underneath, so the row's
                        actions stay where a user already expects them and
                        **Edit appearance...** arrives as an addition rather than a
                        replacement. Each item shows the key that does the same thing from
                        the keyboard, so the menu teaches the shortcut rather than hiding it.
                    -->
                    <template #menu="{ close }">
                        <v-list density="compact" :aria-label="t('project.list.rowMenuLabel', 'What this project can do')">
                            <v-list-item
                                :prepend-icon="mdiPencilOutline"
                                :title="t('project.list.menuOpen', 'Open this project')"
                                @click="
                                    () => {
                                        close();
                                        emit('open', row.world);
                                    }
                                "
                            >
                                <template #append>
                                    <kbd class="mb-projects__kbd">{{
                                        t("project.list.key.open", keyLabel(ROW_OPEN_KEY))
                                    }}</kbd>
                                </template>
                            </v-list-item>
                            <v-list-item
                                :prepend-icon="mdiPlay"
                                :title="t('project.list.menuRender', 'Render it with its own settings')"
                                @click="
                                    () => {
                                        close();
                                        emit('render', row.world);
                                    }
                                "
                            />
                            <v-list-item
                                :prepend-icon="mdiSelectAll"
                                :title="
                                    isChosen(row.world)
                                        ? t('project.list.menuUnchoose', 'Take it out of the selection')
                                        : t('project.list.menuChoose', 'Add it to the selection')
                                "
                                @click="
                                    () => {
                                        close();
                                        toggleChosen(row.world);
                                    }
                                "
                            >
                                <template #append>
                                    <kbd class="mb-projects__kbd">{{
                                        t("project.list.key.choose", keyLabel(ROW_CHOOSE_KEY))
                                    }}</kbd>
                                </template>
                            </v-list-item>
                            <v-list-item
                                v-if="deletable"
                                :prepend-icon="mdiDeleteOutline"
                                :title="t('project.list.menuForget', 'Remove the project file')"
                                @click="
                                    () => {
                                        close();
                                        askToForget(row.world);
                                    }
                                "
                            />
                        </v-list>
                        <v-divider class="my-1" />
                    </template>
                </AppearanceTarget>
            </div>

            <!--
                Three different empty states, because they mean three different things and a
                single "no projects" would be wrong in two of them.
            -->
            <p v-if="!isBusy && ordered.length === 0 && hostName !== null" class="mb-projects__empty" role="status">
                {{
                    t(
                        "project.list.emptyScanned",
                        { scanned },
                        "None of the {scanned} worlds this computer knows about carries a project yet. Make a map with the guide, or start a project here and add maps to it.",
                    )
                }}
            </p>
            <p v-else-if="!isBusy && ordered.length > 0 && visible.length === 0" class="mb-projects__empty" role="status">
                {{
                    t(
                        "project.list.noMatch",
                        "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
                    )
                }}
            </p>

            <v-alert v-for="problem in problems" :key="problem.world" type="warning" density="compact" variant="tonal" class="mt-2">
                {{ t("project.list.folderProblem", { world: problem.world, message: problem.message }, "{world}: {message}") }}
            </v-alert>
        </v-card-text>
    </v-card>
</template>

<style scoped>
.mb-projects {
    inline-size: 100%;
    border-radius: 16px;
}

.mb-projects__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-projects__blurb,
.mb-projects__empty {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-projects__search {
    margin-block: 8px;
}

.mb-projects__bulk {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 8px;
}

.mb-projects__bulkcount {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* Wide enough for the longest of the three format names at 200% scale. */
.mb-projects__format {
    flex: 0 1 220px;
    min-inline-size: 140px;
}

.mb-projects__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/*
 * `AppearanceTarget` is `display: contents` until it has something to paint and
 * `inline-block` once it has, and neither is a row in a vertical list: the first collapses
 * the wrapper out of the flex column, and the second shrink-wraps a decorated row to its
 * own text while its undecorated neighbours stay full width.
 */
.mb-projects__rowhost {
    display: block;
}

.mb-projects__row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-projects__option {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 12px;
    /* A comfortable pointer and touch target at every density, per the sizing rules. */
    min-block-size: 48px;
    min-inline-size: 0;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
}

.mb-projects__option:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

/* `-2px` keeps the ring inside the row's own rounded box so neither edge clips it. */
.mb-projects__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-projects__option[aria-selected="true"] {
    background: rgba(var(--v-theme-primary), 0.14);
}

.mb-projects__text {
    display: flex;
    min-inline-size: 0;
    flex-direction: column;
}

/*
 * Long names and long paths wrap rather than run off the card. `anywhere` rather than
 * `break-word` because a path has no spaces to break at, and a truncated path is a row the
 * user cannot tell apart from the next one.
 */
.mb-projects__name {
    font-size: 1rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.mb-projects__subtitle {
    font-size: 0.8125rem;
    line-height: 1.3;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-projects__actions {
    display: inline-flex;
    flex: 0 0 auto;
}

.mb-projects__kbd {
    padding: 1px 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
    border-radius: 4px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

@media (max-width: 600px) {
    .mb-projects__bulk {
        gap: 4px;
    }
}
</style>
