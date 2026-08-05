<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiFolderPlusOutline } from "@mdi/js";
import { VBtn, VChip, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    filterPickerRows,
    pickerEntries,
    pickerRows,
    pickerSample,
    stepEntryIndex,
    type TabGroupPickerEntry,
    type TabGroupPickerRow,
} from "./tabGroupPicker.js";
import type { TabStripState } from "./tabModel.js";

/**
 * The picker behind the tab context menu's single "Move this tab into group..." entry.
 *
 * Replaces what used to be one menu item per existing group. This is the anchored,
 * non-modal surface `TabStrip.vue` opens from that one entry: a search field wired to the
 * project's own regex builder (via `ConfigSearchField`, the same field `TabMenuList` and
 * `TabGroupMenu` already use for their own search bars), a list of every other group by
 * name, colour and member count, and a "New group..." row that always appears so the
 * picker is never a dead end -- not on a strip with no groups yet, and not when a search
 * has filtered every existing group out of view.
 *
 * Selecting an existing group or "New group..." is the only thing this component decides;
 * doing it is the host's job. `assign` carries the chosen group's id straight to
 * `assignTabToGroup`, the same store action the group menu's own "Take this tab out of its
 * group" and the master search's per-result actions already call, and `new-group` is the
 * same event `TabStrip.vue` already emits for its existing "Put this tab in a new group"
 * command -- both reused rather than forked, so there is exactly one way a tab ever changes
 * group in this application.
 *
 * ### Keyboard and focus
 *
 * Opening the picker focuses the search field, exposed as `focus()` for the host to call
 * right after it renders the dialog open. ArrowDown/ArrowUp move a tracked `activeIndex`
 * across the flat entry list (rendered rows first, "New group..." last) and move real DOM
 * focus onto that entry, using a standard roving-tabindex listbox: only the active option
 * carries `tabindex="0"`, every other option carries `-1`, and `aria-selected` names which
 * one that is for a screen reader. Enter commits whichever entry has focus, and Escape
 * cancels from anywhere in the dialog. Tab and Shift+Tab wrap between this dialog's first
 * and last focusable elements rather than escaping onto the tab strip behind the picker
 * while it is open -- and that trap also covers the search field's own regex-builder
 * popover (`ConfigRegexBuilder.vue`, reached from the ".*" button `ConfigSearchField.vue`
 * renders): Vuetify's `v-menu` teleports that popover's content straight to `document.body`,
 * outside this dialog's own DOM subtree, so it is folded into the trap by a document-level
 * listener rather than the local `@keydown` binding, which a teleported subtree's events
 * never bubble into. See `openBuilderElements` and `trapAcrossBuilder` below. The host is
 * responsible for returning focus to the tab that opened the picker once it closes, exactly
 * as it already does for the tab's own appearance editor.
 */
const props = defineProps<{
    strip: TabStripState;
    /** The tab's current group, excluded from the list. Null for a tab with no group. */
    excludeGroupId: string | null;
    /** The tab being moved, named in the dialog's own accessible title. */
    tabLabel: string;
}>();

const emit = defineEmits<{
    assign: [groupId: string];
    "new-group": [];
    cancel: [];
}>();

const { t } = useI18n();

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");
const activeIndex = ref(-1);

const rootRef = ref<HTMLElement | null>(null);
const optionRefs = ref<(HTMLElement | null)[]>([]);

function setOptionRef(index: number, el: Element | null): void {
    optionRefs.value[index] = el as HTMLElement | null;
}

const allRows = computed(() => pickerRows(props.strip, props.excludeGroupId));

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shownRows = computed(() => filterPickerRows(allRows.value, matcher.value));

const entries = computed<readonly TabGroupPickerEntry[]>(() => pickerEntries(shownRows.value));

/** True once search narrowed an otherwise non-empty list down to nothing but "New group...". */
const noSearchMatch = computed(() => allRows.value.length > 0 && shownRows.value.length === 0);

/** True while the strip has no groups at all, independent of anything typed in the search. */
const noGroupsYet = computed(() => allRows.value.length === 0);

const summary = computed(() =>
    t("tabs.group.searchSummary", { shown: shownRows.value.length, total: allRows.value.length }, "Showing {shown} of {total}"),
);

// A search that changes the list never leaves a stale index pointing at a row that no
// longer exists, or at a row that used to be "New group..." and is now something else.
watch(entries, () => {
    if (activeIndex.value >= entries.value.length) activeIndex.value = entries.value.length - 1;
});

function focusSearch(): void {
    void nextTick(() => {
        rootRef.value?.querySelector("input")?.focus();
    });
}

/**
 * Called by the host right after it renders the picker open.
 *
 * `TabStrip.vue` mounts exactly one `TabGroupPicker` behind a `v-menu` and keeps it alive
 * across a close -- `closeTabGroupPicker` only flips the menu's own `v-model` shut, so the
 * same component instance (and the same `query`/`regexMode`/`flags` refs `matcher` reads)
 * is what reopens next time, whether that is the same tab again or a different one entirely.
 * `focus()` is the one call the host already makes on every open, so it is also where the
 * search that belonged to whichever tab this was open for last gets put away: without this,
 * a search typed while moving one tab stays on screen, still filtering the list, the next
 * time any tab's picker opens -- including a "No group's name matches that search" empty
 * state for a group that is right there, because the query nobody can see any more is still
 * active.
 */
function focus(): void {
    query.value = "";
    regexMode.value = false;
    flags.value = "i";
    activeIndex.value = -1;
    focusSearch();
}

defineExpose({ focus });

function move(delta: number): void {
    activeIndex.value = stepEntryIndex(entries.value.length, activeIndex.value, delta);
    void nextTick(() => optionRefs.value[activeIndex.value]?.focus());
}

function commit(entry: TabGroupPickerEntry): void {
    if (entry.kind === "group") emit("assign", entry.row.id);
    else emit("new-group");
}

function commitActive(): void {
    const entry = entries.value[activeIndex.value];
    if (entry !== undefined) commit(entry);
}

/**
 * Every focusable element inside the dialog's own subtree, in DOM order: the search field's
 * own input plus its clear/regex/builder buttons, the active list option (the rest carry
 * `tabindex="-1"` and are deliberately excluded, since giving every option a stop would
 * make the whole list one long detour on every lap of the trap), and the Cancel button.
 *
 * Deliberately excludes the regex-builder popover -- see `openBuilderElements`, which finds
 * that separately, since it does not live in this subtree at all once open.
 */
function focusableElements(): HTMLElement[] {
    if (rootRef.value === null) return [];
    return [
        ...rootRef.value.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])'),
    ].filter((element) => !element.hasAttribute("disabled"));
}

/** The selector for `ConfigRegexBuilder.vue`'s own root, tagged on its `v-card`. */
const BUILDER_SELECTOR = ".mb-config-regex";

/**
 * The regex-builder popover's own focusable elements, but only while it is genuinely open.
 *
 * Vuetify's `v-menu` (in `ConfigSearchField.vue`) teleports the popover straight to
 * `document.body` once it has ever opened, and then leaves it there `v-show`-hidden between
 * opens rather than removing it -- so it has to be found by its own class rather than by DOM
 * containment (containment is exactly what teleporting breaks), and `.v-overlay--active` is
 * what actually distinguishes "open" from "present but hidden".
 */
function openBuilderElements(): HTMLElement[] {
    const builder = document.querySelector<HTMLElement>(BUILDER_SELECTOR);
    if (builder === null || builder.closest(".v-overlay--active") === null) return [];
    return [...builder.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')].filter(
        (element) => !element.hasAttribute("disabled"),
    );
}

/** Wraps Tab and Shift+Tab at the dialog's own edges rather than letting focus escape it. */
function trapTab(event: KeyboardEvent): void {
    const elements = focusableElements();
    if (elements.length === 0) return;
    const first = elements[0] as HTMLElement;
    const last = elements[elements.length - 1] as HTMLElement;
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * Wraps Tab and Shift+Tab across this dialog's own elements *and* the open regex-builder
 * popover together, stepping every press through the merged list by hand rather than only
 * intervening at the two edges the way `trapTab` does. Native traversal cannot be trusted at
 * all once part of the sequence lives outside `rootRef`'s subtree: the browser's own
 * document-order traversal either skips over the teleported popover entirely (it sits far
 * later in `document.body`, wherever `v-menu` first appended its container) or, once focus
 * is inside it, has nothing here to stop it walking straight out past the dialog again.
 *
 * The popover's own elements are spliced in right after the ".*" button that opens it --
 * identified by `aria-expanded`, the one attribute unique to that button in this dialog --
 * rather than appended after everything else. Appending at the end would still let a forward
 * Tab from that button skip straight to Cancel (`focusableElements()`'s own last element),
 * which is the exact "silently skips its visible controls" half of the reported bug; splicing
 * it in there instead means stepping forward from the button enters the popover, stepping
 * forward off the popover's own last control reaches Cancel next, and Shift+Tab off the
 * popover's own first control returns to the button that opened it, matching what a sighted
 * mouse user already sees happen visually.
 *
 * Also stops the event from bubbling any further once handled. `onKeydown` below and
 * `onDocumentKeydown` can both end up looking at the very same Tab press -- a press that
 * starts inside `rootRef` reaches `onKeydown` first via ordinary bubbling and, if this
 * function moved focus into the popover, would otherwise keep bubbling to `document` and be
 * read a second time there, stepping focus one extra place. Stopping it here keeps every Tab
 * press handled exactly once regardless of which of the two listeners saw it first.
 */
function trapAcrossBuilder(event: KeyboardEvent, builder: readonly HTMLElement[]): void {
    const own = focusableElements();
    const anchorIndex = own.findIndex((element) => element.hasAttribute("aria-expanded"));
    const elements =
        anchorIndex === -1
            ? [...own, ...builder]
            : [...own.slice(0, anchorIndex + 1), ...builder, ...own.slice(anchorIndex + 1)];
    if (elements.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey) {
        const previous = index <= 0 ? elements.length - 1 : index - 1;
        elements[previous]?.focus();
    } else {
        const next = index === -1 || index >= elements.length - 1 ? 0 : index + 1;
        elements[next]?.focus();
    }
}

/**
 * Catches the Tab presses `onKeydown` below structurally cannot: the regex-builder popover's
 * teleported content is not a descendant of `rootRef` in the real DOM, so a keydown fired
 * while focus is inside it never bubbles up to this dialog's own `@keydown` binding at all.
 * A `document`-level listener sees it regardless of where it physically lives.
 *
 * Left a no-op whenever the popover isn't open, so it never double-handles a Tab press that
 * originated inside `rootRef` and was already dealt with there by the ordinary `trapTab`
 * path in `onKeydown` -- that path already covers the popover-closed case identically to
 * before this listener existed.
 *
 * Also a no-op whenever focus is no longer inside the popover by the time this runs, which is
 * not the same condition as "the popover is open": Vuetify's own `v-menu` binds its own
 * bubble-phase `keydown` listener directly to the popover's content, closer to the pressed key
 * than this `document`-level one, and it already implements exactly the boundary this trap
 * exists for -- Shift+Tab on the popover's own first control (with `retain-focus` off, the
 * default) closes the menu and returns focus to the activator that opened it, which is this
 * dialog's own ".*" button. Left unguarded, this listener still ran on the very same keydown
 * afterwards, read the *new* `document.activeElement` (the button `v-menu` had just focused,
 * not the control the press actually started on), and stepped it one place further -- turning
 * a boundary `v-menu` had already handled correctly into one this dialog then mishandled.
 * Bailing out once focus has already left the popover leaves that already-correct outcome
 * alone rather than second-guessing it.
 */
function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const builder = openBuilderElements();
    if (builder.length === 0) return;
    if (!builder.includes(document.activeElement as HTMLElement)) return;
    trapAcrossBuilder(event, builder);
}

onMounted(() => {
    document.addEventListener("keydown", onDocumentKeydown);
});

onUnmounted(() => {
    document.removeEventListener("keydown", onDocumentKeydown);
});

function onKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
    } else if (event.key === "Home") {
        event.preventDefault();
        activeIndex.value = entries.value.length === 0 ? -1 : 0;
        void nextTick(() => optionRefs.value[activeIndex.value]?.focus());
    } else if (event.key === "End") {
        event.preventDefault();
        activeIndex.value = entries.value.length === 0 ? -1 : entries.value.length - 1;
        void nextTick(() => optionRefs.value[activeIndex.value]?.focus());
    } else if (event.key === "Enter") {
        if (activeIndex.value < 0) return;
        event.preventDefault();
        commitActive();
    } else if (event.key === "Escape") {
        event.preventDefault();
        emit("cancel");
    } else if (event.key === "Tab") {
        // A Tab press that starts inside rootRef always reaches this local handler first
        // (real DOM bubbling, unaffected by teleporting). While the popover is open, hand
        // off to the merged-list path instead of the edges-only one, so forward Tab from the
        // ".*" button actually steps into the popover rather than jumping straight to
        // Cancel; onDocumentKeydown owns every Tab press whose origin is inside the popover
        // itself, which this listener structurally never sees.
        const builder = openBuilderElements();
        if (builder.length > 0) trapAcrossBuilder(event, builder);
        else trapTab(event);
    }
}

// Both helpers take the already-narrowed `row` rather than the whole `TabGroupPickerEntry`
// union, and every call site below passes `entry.row` from inside a branch where
// `entry.kind === "group"` already holds (the same narrowing the template already relies on
// for `entry.row.id`, `entry.row.color` and `entry.row.name` a few lines down). Passing the
// still-union `entry` itself through an inline `entry as TabGroupPickerEntry & { kind:
// "group" }` cast used to be the shape here, but `vue-tsc`'s stricter template-expression
// parser cannot parse that object-type-literal intersection cast inside a template attribute
// binding (TS1005/TS1128) even though Vite/esbuild's looser transform tolerates it fine --
// see `TabGroupPicker.typecheck.test.ts` for the regression guard. Accepting the plain `row`
// sidesteps the whole parser limitation instead of working around it.
const rowCount = (row: TabGroupPickerRow): string =>
    t("tabGroupPicker.rowCount", { count: row.memberCount }, "{count} tabs");

const rowName = (row: TabGroupPickerRow): string =>
    t(
        "tabGroupPicker.rowName",
        { group: row.name, count: row.memberCount },
        "Move the tab into {group}, which holds {count} tabs",
    );
</script>

<template>
    <div
        ref="rootRef"
        class="mb-tab-group-picker"
        role="dialog"
        :aria-label="t('tabGroupPicker.title', { label: tabLabel }, 'Move {label} into a group')"
        @keydown="onKeydown"
    >
        <ConfigSearchField
            v-model="query"
            v-model:regex="regexMode"
            v-model:flags="flags"
            :label="t('tabGroupPicker.searchLabel', 'Search groups by name')"
            :placeholder="t('tabGroupPicker.searchHint', 'part of a group name')"
            :sample="pickerSample(allRows)"
            :summary="allRows.length > 0 ? summary : ''"
            class="mb-tab-group-picker__search"
        />

        <p v-if="noGroupsYet" class="mb-tab-group-picker__empty" role="status">
            {{ t("tabGroupPicker.empty", "There are no groups yet. Choose New group... to create one and move the tab into it.") }}
        </p>
        <p v-else-if="noSearchMatch" class="mb-tab-group-picker__empty" role="status">
            {{ t("tabGroupPicker.noMatch", "No group's name matches that search. Clearing the search brings the rest back.") }}
        </p>

        <ul
            class="mb-tab-group-picker__list"
            role="listbox"
            :aria-label="t('tabGroupPicker.listLabel', 'Groups you can move this tab into')"
        >
            <li
                v-for="(entry, index) in entries"
                :ref="(el) => setOptionRef(index, el as Element | null)"
                :key="entry.kind === 'group' ? entry.row.id : 'new-group'"
                role="option"
                :tabindex="index === activeIndex ? 0 : -1"
                :aria-selected="index === activeIndex ? 'true' : 'false'"
                :aria-label="
                    entry.kind === 'group'
                        ? rowName(entry.row)
                        : t('tabGroupPicker.newGroupAction', 'New group...')
                "
                class="mb-tab-group-picker__row"
                :class="{ 'mb-tab-group-picker__row--active': index === activeIndex }"
                @click="commit(entry)"
                @mouseenter="activeIndex = index"
                @focus="activeIndex = index"
            >
                <template v-if="entry.kind === 'group'">
                    <v-chip
                        size="x-small"
                        :color="entry.row.color"
                        variant="tonal"
                        class="mb-tab-group-picker__swatch"
                        aria-hidden="true"
                    >
                        {{ entry.row.name }}
                    </v-chip>
                    <span class="mb-tab-group-picker__count" aria-hidden="true">
                        {{ rowCount(entry.row) }}
                    </span>
                </template>
                <template v-else>
                    <v-icon :icon="mdiFolderPlusOutline" size="18" aria-hidden="true" />
                    <span class="mb-tab-group-picker__new-group" aria-hidden="true">
                        {{ t("tabGroupPicker.newGroupAction", "New group...") }}
                    </span>
                </template>
            </li>
        </ul>

        <div class="mb-tab-group-picker__actions">
            <v-btn size="small" variant="text" :prepend-icon="mdiClose" @click="emit('cancel')">
                {{ t("tabGroupPicker.cancel", "Cancel") }}
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-tab-group-picker {
    min-width: 280px;
    max-width: 360px;
    max-height: min(70vh, 480px);
    overflow-y: auto;
    padding: 8px 8px 4px;
    /*
     * This dialog is mounted unwrapped inside the same kind of scrim-less, click-through
     * v-menu as AppearanceEditor.vue (see TabStrip.vue), which paints no surface of its
     * own behind whatever it opens. Without an explicit background/border/elevation here,
     * every row, the search field and the empty-state text render directly over the tab
     * strip with nothing behind them -- match AppearanceEditor.vue's root treatment.
     */
    border-radius: 16px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 6px 10px 4px rgba(0, 0, 0, 0.15), 0 2px 3px rgba(0, 0, 0, 0.3);
}

.mb-tab-group-picker__search {
    margin: 0 4px 4px;
}

.mb-tab-group-picker__empty {
    padding: 4px 12px 8px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tab-group-picker__list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-tab-group-picker__row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
}

.mb-tab-group-picker__row:hover,
.mb-tab-group-picker__row--active {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-tab-group-picker__swatch {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mb-tab-group-picker__count {
    margin-inline-start: auto;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tab-group-picker__new-group {
    font-size: 0.875rem;
}

.mb-tab-group-picker__actions {
    display: flex;
    justify-content: flex-end;
    padding: 4px 4px 0;
}

@media (prefers-reduced-motion: reduce) {
    .mb-tab-group-picker__row {
        transition: none;
    }
}
</style>
