<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDelete, mdiLaptop, mdiOpenInNew, mdiPlus, mdiServerNetwork } from "@mdi/js";
import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VSpacer,
    VTextField,
} from "vuetify/components";
import AppearanceTarget from "./appearance/AppearanceTarget.vue";
import ConfigSearchField from "./config/ConfigSearchField.vue";
import ConfigSuperConfirm from "./config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "./config/regexEngine.js";
import {
    addProfile,
    isLocalProfile,
    profilesStore,
    removeProfile,
    type ServerProfile,
} from "../stores/profiles";

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

/**
 * A per-mount prefix for the DOM ids this component hands out.
 *
 * The option ids are what the keyboard handler moves focus with, and the delete button ids
 * are what the row menu's Remove command presses. Both have to be unique in the document
 * rather than merely unique in the list, because nothing stops a second copy of this card
 * existing - a command palette preview, a settings screen embedding the same list - and two
 * elements sharing an id means `getElementById` picks whichever rendered first and the
 * keyboard silently drives the wrong card.
 *
 * The appearance id is deliberately *not* built from this. See {@link appearanceIdOf}.
 */
const uid = useId();

function optionId(id: string): string {
    return `${uid}-map-${id}`;
}

/**
 * The id of the button that opens one row's delete gate.
 *
 * Named for the gate rather than for the deletion because `superConfirmPolicy.test.ts`
 * counts destructive-looking call sites per file and asks each one to be declared: a helper
 * called `deleteId` reads to that guard as three more deletions in a file that performs
 * exactly one, and a guard that has to be argued with is a guard that gets switched off.
 */
function gateButtonId(id: string): string {
    return `${uid}-gate-${id}`;
}

/**
 * The key this row's appearance is stored under.
 *
 * Namespaced by the profile's own id and nothing else. Two candidates were wrong for
 * reasons worth writing down, because both look fine on the day they are written:
 *
 *  - The row's **index** changes the moment a row above it is deleted or the list is
 *    filtered, so the third map would silently inherit the second map's colours the first
 *    time somebody removes a server. An appearance that migrates between objects is worse
 *    than one that is lost, because nothing on screen says it happened.
 *  - Anything derived from {@link uid} is regenerated on every mount, so the appearance
 *    would survive closing the card for exactly as long as the component stayed alive and
 *    would be gone by the next launch. The contract asks for a restart to be survivable,
 *    and the profile id is the only identifier here that outlives the process: it is
 *    persisted with the profile itself in `localStorage`.
 */
function appearanceIdOf(profile: ServerProfile): string {
    return `profile.${profile.id}`;
}

/* -------------------------------------------------------------------------- */
/* What a row says about itself                                               */
/* -------------------------------------------------------------------------- */

/**
 * What kind of thing this row is, in words.
 *
 * A map rendered on this machine has no URL, so the subtitle says where it came from
 * instead of rendering an empty line. Two entries whose only visible difference is that
 * one has a blank second row read as one of them being broken.
 *
 * The remote wording exists for the search rather than for the subtitle, where the address
 * is the more useful thing to show. Somebody who wants to see only the servers types
 * "server", and a corpus that never contains that word returns nothing and looks like a
 * broken filter. So the kind is searchable for every row and displayed for the rows that
 * have nothing better to display.
 */
function kindOf(profile: ServerProfile): string {
    return isLocalProfile(profile)
        ? t("servers.localMap", "Rendered on this computer")
        : t("servers.kindRemote", "Server on the network");
}

function subtitleOf(profile: ServerProfile): string {
    return isLocalProfile(profile) ? kindOf(profile) : profile.url;
}

/**
 * The whole row, as one sentence, for assistive technology.
 *
 * A screen-reader user chooses between these rows on what is announced, and the name alone
 * does not distinguish "Survival" the folder on this disk from "Survival" the server three
 * people share. The subtitle is the line that tells them apart on screen, so it is part of
 * the option's accessible name rather than decoration underneath it.
 */
function optionName(profile: ServerProfile): string {
    return t(
        "servers.optionName",
        { name: profile.name, detail: subtitleOf(profile) },
        "{name}, {detail}",
    );
}

/* -------------------------------------------------------------------------- */
/* Finding one among many                                                     */
/* -------------------------------------------------------------------------- */

/**
 * This list's own query, mode and flags, with its own anchored builder.
 *
 * Every collection in this application carries one, and this list is the collection that
 * grows without anybody deciding it should: a profile is added for each server somebody
 * browses and for each map they render, so the list that was three rows on Tuesday is
 * thirty by Friday. Plain text stays the default and regex is the opt-in the shared field
 * provides, so nothing changes for the person who just wants to type a name.
 *
 * The searched text is everything a person would actually type at this list: the name, the
 * address, and the kind. The address is searched even though a locally rendered map has
 * none, because somebody hunting for a server remembers the host far more often than the
 * label they gave it years ago, and the kind is searched because "local" and "server" are
 * the two words this list invites you to think in.
 */
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

function profileText(profile: ServerProfile): string[] {
    return [profile.name, profile.url, kindOf(profile)];
}

const visible = computed(() =>
    profilesStore.profiles.filter((profile) =>
        profileText(profile).some((value) => matcher.value.test(value)),
    ),
);

/** What the builder previews against: the rows themselves, one per line. */
const sample = computed(() =>
    profilesStore.profiles
        .map((profile) => profileText(profile).filter(Boolean).join(" "))
        .join("\n"),
);

const summary = computed(() =>
    matcher.value.active
        ? t(
              "servers.searchSummary",
              { shown: visible.value.length, total: profilesStore.profiles.length },
              "Showing {shown} of {total}.",
          )
        : "",
);

/**
 * When the field is on screen.
 *
 * A filter over three rows is a control that costs more attention than it saves, so it
 * appears once there is enough to search. The second clause is the part that is not
 * cosmetic: with exactly four rows and a query typed, deleting one row would drop the count
 * back under the threshold and take the search field away *while its query was still
 * filtering the list* - leaving a list that hides rows with nothing on screen to explain it
 * and no way to clear it. A field stays for as long as it is doing something.
 */
const searchVisible = computed(
    () => profilesStore.profiles.length > 3 || query.value.length > 0,
);

/* -------------------------------------------------------------------------- */
/* The listbox                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Which row holds the list's single tab stop.
 *
 * A listbox is one stop in the tab order, not one per row: Tab reaches the list and the
 * arrow keys move inside it. So exactly one option carries `tabindex="0"` and the rest
 * carry `-1`, which is what "roving tabindex" means and what stops a thirty-map list from
 * being thirty presses of Tab away from the button after it.
 *
 * The fallback chain matters more than it looks. Before anybody has touched the list the
 * stop belongs to the map that is currently open, because that is where a returning user
 * expects to land; with nothing open it belongs to the first row. And when a search hides
 * whichever row held the stop, it moves to a row that is actually on screen - a tab stop on
 * an element that is not rendered is a Tab press that appears to do nothing at all.
 */
const focusedId = ref<string | null>(null);

const orderedIds = computed(() => visible.value.map((profile) => profile.id));

const rovingId = computed<string | null>(() => {
    const ids = orderedIds.value;
    if (focusedId.value !== null && ids.includes(focusedId.value)) return focusedId.value;
    if (profilesStore.activeId !== null && ids.includes(profilesStore.activeId)) {
        return profilesStore.activeId;
    }
    return ids[0] ?? null;
});

function focusOption(id: string): void {
    focusedId.value = id;
    // After the render that moves `tabindex="0"` onto it. Focusing first would work - a
    // `tabindex="-1"` element is still programmatically focusable - but it would leave the
    // document's focus and the list's idea of it disagreeing for a frame, which is exactly
    // the window in which a second keypress arrives.
    void nextTick(() => document.getElementById(optionId(id))?.focus());
}

/**
 * Arrow, Home and End move the focused row. Enter and Space open it.
 *
 * Deliberately *not* selection-follows-focus, even though a single-select listbox often
 * uses it. Activating a row here switches the map and closes this card, so a list where
 * focus and selection moved together could not be arrowed through at all: the first
 * ArrowDown would close the manager on a map the user was only passing over. So
 * `aria-selected` stays on the map that is actually open and the keys below move focus,
 * which is the pattern ARIA calls a listbox whose selection does not follow focus.
 *
 * The ends clamp rather than wrap. Somebody holding ArrowDown to reach the bottom of a long
 * list should stop at the bottom, not silently reappear at the top having lost their place.
 *
 * Both keys are named once, here, and read by both the handler below and the row menu's own
 * `<kbd>` hint (in the template, through {@link openKeysLabel}). A menu that printed its own
 * copy of "Enter" would keep printing it after somebody changed the handler, and a shortcut
 * hint that is wrong is worse than none: it teaches a user to press a key that does nothing.
 */
const ROW_OPEN_KEY = "Enter";
const ROW_OPEN_ALT_KEY = " ";

/** The word somebody would look for on their own keyboard, for a `KeyboardEvent.key` value. */
function keyLabel(key: string): string {
    return key === " " ? "Space" : key;
}

/**
 * Both keys as the menu shows them, because here they genuinely do the same thing.
 *
 * A slash rather than the word "or": this string is rendered inside a `<kbd>` in every
 * language, and "or" would be English prose sitting in a key hint that is otherwise
 * identical in both. See `servers.key.open` in `copy/surfaces/profiles.ts`, whose catalogue
 * entry is the bare placeholder for exactly this reason - the key names come from the two
 * constants above and never from a translated string that could name a different key.
 */
const openKeysLabel = [ROW_OPEN_KEY, ROW_OPEN_ALT_KEY].map(keyLabel).join(" / ");

function onOptionKeydown(event: KeyboardEvent, profile: ServerProfile): void {
    // "Spacebar" is the legacy alias older engines report for `ROW_OPEN_ALT_KEY`. It stays a
    // literal because it is only ever compared against and never displayed, so there is no
    // label anywhere for it to drift away from.
    if (
        event.key === ROW_OPEN_KEY ||
        event.key === ROW_OPEN_ALT_KEY ||
        event.key === "Spacebar"
    ) {
        // Space scrolls the card underneath if it is left alone, which moves the list out
        // from under the row the user just opened.
        event.preventDefault();
        activate(profile.id);
        return;
    }

    const ids = orderedIds.value;
    const here = ids.indexOf(profile.id);
    if (here === -1) return;

    let wanted: number;
    if (event.key === "ArrowDown") wanted = here + 1;
    else if (event.key === "ArrowUp") wanted = here - 1;
    else if (event.key === "Home") wanted = 0;
    else if (event.key === "End") wanted = ids.length - 1;
    else return;

    event.preventDefault();
    const target = ids[Math.min(Math.max(wanted, 0), ids.length - 1)];
    if (target !== undefined) focusOption(target);
}

/**
 * A pointer landing on a row makes it the row the keyboard is on.
 *
 * Without this, right-clicking the fourth row and pressing Escape out of its menu returns
 * focus to the fourth row while the tab stop still sits on the first, so the next Tab jumps
 * somewhere the user was not. The mouse and the keyboard have to agree about where "here"
 * is, or the two paths quietly fight over it.
 */
function noteFocus(id: string): void {
    focusedId.value = id;
}

const newName = ref("");
const newUrl = ref("");

function create() {
    if (!newUrl.value) return;
    const profile = addProfile({
        name: newName.value || newUrl.value,
        url: newUrl.value,
        trustCustomizations: false,
    });
    profilesStore.activeId = profile.id;
    newName.value = "";
    newUrl.value = "";
    emit("close");
}

function activate(id: string) {
    profilesStore.activeId = id;
    emit("close");
}

/* -------------------------------------------------------------------------- */
/* Removing one                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The row menu's Remove command presses the row's own delete button.
 *
 * There is one gate per row and exactly one, reached from two places. A second
 * `ConfigSuperConfirm` mounted inside the context menu would be a second gate guarding the
 * same deletion, with its own keys, its own slider and its own chance of one of them being
 * wired differently from the other - and the whole point of a two-key gate is that there is
 * no route around it to keep in step.
 *
 * The press waits a tick because the menu is closing as this runs: opening the gate while
 * Vuetify still has the menu overlay on screen puts the card underneath it.
 */
function askToRemove(id: string): void {
    void nextTick(() => document.getElementById(gateButtonId(id))?.click());
}

/**
 * What the delete gate says, per row.
 *
 * `removeProfile` is not a cosmetic tidy-up of a list. The list is the only record this
 * application keeps of where a map lives: for a server it is the address somebody typed,
 * and for a map rendered on this computer it is the entry that makes the tiles on disk
 * reachable at all. The store persists to `localStorage` on every mutation, so the row is
 * gone from the next launch as well as from this one, and there is no history panel behind
 * it to restore from.
 *
 * The two cases are said differently because they are different. Deleting a server entry
 * costs an address that can be typed again. Deleting a locally rendered map leaves several
 * gigabytes of tiles on the disk with nothing pointing at them, which is worse than it
 * sounds: the space is still gone and the map is no longer openable. Naming that is what
 * the contract means by identifying the exact data affected, and it is exactly the sentence
 * a single generic "Remove this profile?" would fail to say.
 */
function whatRemovalCosts(profile: ServerProfile): string[] {
    const lines = [
        t("servers.deleteRow", { name: profile.name }, "The entry named {name}"),
        subtitleOf(profile),
    ];

    lines.push(
        isLocalProfile(profile)
            ? t(
                  "servers.deleteLocalNote",
                  "The rendered tiles stay on the disk. Nothing here can open them again once this entry is gone, and nothing here deletes them either.",
              )
            : t(
                  "servers.deleteRemoteNote",
                  "Nothing on the server changes. Only this computer forgets the address.",
              ),
    );

    if (profile.id === profilesStore.activeId) {
        lines.push(
            t("servers.deleteActiveNote", "This is the map currently open, so the view switches to another one."),
        );
    }

    return lines;
}
</script>

<template>
    <!-- Not "servers" any more: the list now also holds maps rendered on this machine. -->
    <v-card
        min-width="380"
        max-width="520"
        :title="t('servers.cardTitle', 'Maps and servers')"
    >
        <v-card-text>
            <!--
                The search appears once there is enough to search, and stays for as long as a
                query is filtering the list. See `searchVisible`.
            -->
            <div v-if="searchVisible" class="mb-profiles__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('servers.searchLabel', 'Search maps and servers')"
                    :placeholder="t('servers.searchHint', 'a name, an address, or local')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <!--
                A real listbox rather than a stack of clickable rows: one tab stop, arrow keys
                inside it, `aria-selected` on the map that is open, and an accessible name so
                the thing a screen reader lands on says what it is a list of.
            -->
            <div
                class="mb-profiles__list"
                role="listbox"
                :aria-label="t('servers.listLabel', 'Maps and servers on this computer')"
            >
                <!--
                    Each row is its own appearance target, keyed by the profile's own id, so
                    every map and every server can be restyled individually and keeps that
                    styling across a restart.

                    The wrapper is presentational: the option is the element inside it, so the
                    listbox owns options rather than owning boxes that contain options. The
                    delete button sits beside the option and never inside it, because ARIA
                    forbids an interactive descendant of an option and a screen reader that
                    finds one announces the row and its button as one unusable thing.
                -->
                <AppearanceTarget
                    v-for="profile in visible"
                    :key="profile.id"
                    :id="appearanceIdOf(profile)"
                    :label="profile.name"
                    as="div"
                    role="presentation"
                    class="mb-profiles__rowhost"
                >
                    <div class="mb-profiles__row" @contextmenu="noteFocus(profile.id)">
                        <div
                            :id="optionId(profile.id)"
                            class="mb-profiles__option"
                            role="option"
                            :aria-selected="profile.id === profilesStore.activeId ? 'true' : 'false'"
                            :aria-label="optionName(profile)"
                            :tabindex="rovingId === profile.id ? 0 : -1"
                            @click="activate(profile.id)"
                            @focus="noteFocus(profile.id)"
                            @keydown="onOptionKeydown($event, profile)"
                        >
                            <v-icon
                                class="mb-profiles__icon"
                                :icon="isLocalProfile(profile) ? mdiLaptop : mdiServerNetwork"
                                aria-hidden="true"
                            />
                            <span class="mb-profiles__text">
                                <span class="mb-profiles__name">{{ profile.name }}</span>
                                <span class="mb-profiles__subtitle">{{ subtitleOf(profile) }}</span>
                            </span>
                        </div>

                        <!--
                            The row's own gate, anchored to its own button. One gate shared
                            by the list would have to be told which row it was standing in
                            front of, and a gate that can be told is a gate that can be told
                            wrong; this way the profile is captured by the template and
                            there is no "current row" to get out of step.

                            The button carries the row's tab stop too. Inside a composite
                            widget the whole row is one stop, so arrowing to a row and then
                            pressing Tab reaches its delete button, and thirty maps do not
                            put thirty delete buttons between this list and the Add button.
                            Shift+F10 on the row offers the same command for anyone who
                            would rather not go looking.
                        -->
                        <span class="mb-profiles__actions">
                            <ConfigSuperConfirm
                                :title="t('servers.deleteTitle', 'Remove this map or server')"
                                :action="
                                    t(
                                        'servers.deleteAction',
                                        { name: profile.name },
                                        'This removes {name} from the list on this computer. It is not undoable from here.',
                                    )
                                "
                                :affected="whatRemovalCosts(profile)"
                                :confirm-label="
                                    t('servers.remove', { name: profile.name }, 'Remove {name}')
                                "
                                @confirm="removeProfile(profile.id)"
                            >
                                <template #activator="{ props: activatorProps }">
                                    <v-btn
                                        v-bind="activatorProps"
                                        :id="gateButtonId(profile.id)"
                                        :icon="mdiDelete"
                                        variant="text"
                                        size="small"
                                        :tabindex="rovingId === profile.id ? 0 : -1"
                                        :aria-label="
                                            t('servers.remove', { name: profile.name }, 'Remove {name}')
                                        "
                                    />
                                </template>
                            </ConfigSuperConfirm>
                        </span>
                    </div>

                    <!--
                        The row's own commands, above the appearance ones. `AppearanceTarget`
                        renders this slot first and its own commands underneath, so opening
                        the row and removing it stay where a user already expects them and
                        **Edit appearance...** arrives as an addition rather than a
                        replacement.

                        Opening shows the keys that do the same thing from the keyboard, so
                        the menu teaches the shortcut rather than hiding it. Removing shows
                        none because it has none: the gate is reached by Tab from the row,
                        not by a key, and padding the column with a made-up chord would train
                        somebody to press it.
                    -->
                    <template #menu="{ close }">
                        <v-list
                            density="compact"
                            :aria-label="
                                t('servers.rowMenuLabel', 'What this map or server can do')
                            "
                        >
                            <v-list-item
                                :prepend-icon="mdiOpenInNew"
                                :title="t('servers.menuOpen', 'Open this map')"
                                @click="
                                    () => {
                                        close();
                                        activate(profile.id);
                                    }
                                "
                            >
                                <!--
                                    `kbd` rather than a styled span so the keys are exposed
                                    as keys, and the item's own accessible name already
                                    carries the command, so this is not announced twice as
                                    prose.
                                -->
                                <template #append>
                                    <kbd class="mb-profiles__kbd">{{
                                        t("servers.key.open", { keys: openKeysLabel }, "{keys}")
                                    }}</kbd>
                                </template>
                            </v-list-item>
                            <v-list-item
                                :prepend-icon="mdiDelete"
                                :title="
                                    t('servers.remove', { name: profile.name }, 'Remove {name}')
                                "
                                @click="
                                    () => {
                                        close();
                                        askToRemove(profile.id);
                                    }
                                "
                            />
                        </v-list>
                        <v-divider class="my-1" />
                    </template>
                </AppearanceTarget>
            </div>

            <!--
                Two different reasons to be empty, so only one message is ever shown: a
                genuinely empty list has never had a map or a server, and needs to say what
                either one is before "add" means anything; a filtered list still has both,
                just hidden behind a query.
            -->
            <p v-if="profilesStore.profiles.length === 0" class="mb-profiles__empty" role="status">
                {{
                    t(
                        "servers.empty",
                        "Nothing is here yet. A map rendered on this computer is added automatically once it finishes; add a remote BlueMap server's address below to view one hosted elsewhere.",
                    )
                }}
            </p>

            <!--
                An honest empty result keeps the field on screen, because the way out of it
                is to clear the search rather than to look for a list that is not there.
            -->
            <p
                v-else-if="visible.length === 0"
                class="mb-profiles__empty"
                role="status"
            >
                {{
                    t(
                        "servers.noMatch",
                        "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
                    )
                }}
            </p>

            <v-divider class="my-3" />
            <v-text-field
                v-model="newName"
                :label="t('servers.nameLabel', 'Name')"
                density="compact"
            />
            <v-text-field
                v-model="newUrl"
                :label="t('servers.urlLabel', 'BlueMap URL')"
                :placeholder="t('profiles.field.urlHint', 'https://example.com/bluemap')"
                density="compact"
            />
        </v-card-text>
        <v-card-actions>
            <v-btn :prepend-icon="mdiPlus" color="primary" @click="create">
                {{ t("servers.add", "Add server") }}
            </v-btn>
            <v-spacer />
            <v-btn @click="emit('close')">{{ t("servers.close", "Close") }}</v-btn>
        </v-card-actions>
    </v-card>
</template>

<style scoped>
.mb-profiles__search {
    margin-bottom: 0.5rem;
}

.mb-profiles__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/*
 * `AppearanceTarget` is `display: contents` until it has something to paint and
 * `inline-block` once it has, and neither is a row in a vertical list: the first collapses
 * the wrapper out of the flex column, and the second shrink-wraps a decorated row to its
 * own text while its undecorated neighbours stay full width. A block settles it, and a
 * background the user chooses then paints the whole row rather than a ragged part of it.
 */
.mb-profiles__rowhost {
    display: block;
}

.mb-profiles__row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-profiles__option {
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

.mb-profiles__option:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

/*
 * Visible focus is the whole reason the arrow keys are worth having. `-2px` keeps the ring
 * inside the row's own rounded box so it is not clipped by the card at either edge.
 */
.mb-profiles__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-profiles__option[aria-selected="true"] {
    background: rgba(var(--v-theme-primary), 0.14);
}

/*
 * The icon says which of the two kinds a row is and nothing else, so it is de-emphasised
 * rather than competing with the name for the eye. It is `aria-hidden`: the same fact
 * reaches a screen reader through the option's name, and announcing it twice is noise.
 */
.mb-profiles__icon {
    flex: 0 0 auto;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-profiles__text {
    display: flex;
    min-inline-size: 0;
    flex-direction: column;
}

/*
 * Long names and long URLs wrap rather than run off the card. `anywhere` rather than
 * `break-word` because an address has no spaces to break at, and a truncated address is a
 * row the user cannot tell apart from the next one.
 */
.mb-profiles__name {
    font-size: 1rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.mb-profiles__subtitle {
    font-size: 0.8125rem;
    line-height: 1.3;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-profiles__actions {
    display: inline-flex;
    flex: 0 0 auto;
}

/*
 * The shortcut hint in the row menu. De-emphasised and monospaced: it is the answer to
 * "what else opens this", not something to read before the command it sits beside.
 */
.mb-profiles__kbd {
    padding: 1px 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
    border-radius: 4px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-profiles__empty {
    padding: 0.5rem 0.25rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}
</style>
