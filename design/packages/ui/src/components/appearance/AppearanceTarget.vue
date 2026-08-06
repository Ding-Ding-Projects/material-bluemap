<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiPalette, mdiRestore } from "@mdi/js";
import { VList, VListItem, VMenu } from "vuetify/components";

import AppearanceEditor from "./AppearanceEditor.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    claimAppearancePopup,
    releaseAppearancePopup,
    useAppearanceTarget,
    useRegisteredTarget,
} from "./useAppearance.js";

/**
 * Wraps any element and gives it the whole appearance feature.
 *
 * This is the per-element integration the contract describes, expressed once as a wrapper
 * rather than repeated per surface. A host writes `<AppearanceTarget id="app.tab" ...>` around
 * whatever it renders and gets: the resolved appearance applied live, a context menu with
 * **Edit appearance...**, a keyboard path to the same command, Shift+right-click straight to
 * the editor, a non-modal editor anchored beside the element that tracks it and flips at the
 * viewport edge, and focus back on the element when it closes.
 *
 * ## Why a wrapper and not a mixin on every component
 *
 * Because the alternative is twenty near-identical implementations and nineteen chances to
 * forget the focus return. The failures the contract names - a right-click path with no
 * keyboard equivalent, an editor that traps focus, an anchor lost when tabs reorder - are all
 * failures of consistency rather than of ambition, and they are prevented by there being one
 * copy of this code.
 *
 * ## The keyboard path is not a courtesy
 *
 * `Shift+F10` and the Menu key are what a Windows user presses to open a context menu, so
 * they open this one. `Ctrl+Shift+F10` goes straight to the editor, mirroring Shift+right-click
 * exactly, and the menu item displays that shortcut beside its label - the same shortcut, from
 * the same handler, so the two cannot drift apart. The wrapper advertises both through
 * `aria-keyshortcuts`, which is how assistive technology learns about a binding it cannot see.
 *
 * ## The host keeps its own menu
 *
 * The `menu` slot is rendered above the appearance commands, so a tab that already has a
 * management menu keeps it and gains **Edit appearance...** underneath, which is what the
 * contract asks for rather than a menu that replaces whatever was there.
 */
const props = withDefaults(
    defineProps<{
        /** The element id this appearance is stored under. Stable across re-renders. */
        id: string;
        /** The element's name, shown in the editor heading and the element list. */
        label: string;
        /** The tag the wrapper renders as, so it can be inline where the host is inline. */
        as?: string;
    }>(),
    { as: "span" },
);

const { t } = useI18n();

const target = useAppearanceTarget(() => props.id);

useRegisteredTarget({
    id: props.id,
    labelKey: `appearance.target.${props.id}`,
    fallback: props.label,
});

/**
 * The declarations that need a box, and therefore forbid `display: contents`.
 *
 * The wrapper is `display: contents` by default so that adding it to an existing surface
 * changes nothing about that surface's layout. That works for typography because CSS
 * inheritance passes straight through a contents box - the font, colour, spacing and
 * alignment all reach the slot content - and it does not work for anything that needs a box
 * to paint on. A background, a border, padding, a shadow or an opacity set on a contents box
 * renders nothing at all, silently, which would look exactly like the editor being broken.
 *
 * So the wrapper becomes a real box the moment one of these is present and goes back to being
 * invisible when the user resets them.
 */
const BOX_DECLARATIONS = [
    "background-color",
    "border-style",
    "border-width",
    "border-color",
    "border-radius",
    "padding-inline",
    "padding-block",
    "box-shadow",
    "opacity",
];

const root = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const editorOpen = ref(false);

/**
 * Where the context menu appears.
 *
 * The pointer position for a right-click, because that is where the user is looking, and the
 * element itself for the keyboard path, because a keyboard user has no pointer and a menu at
 * the last mouse position would be somewhere else entirely.
 */
const contextTarget = ref<[number, number] | HTMLElement | undefined>(undefined);

/**
 * Stable ids for the two popups, so the wrapper can advertise `aria-controls` itself.
 *
 * These exist because of what they are *not* used for: neither `<v-menu>` below takes an
 * `:activator`. Vuetify's own `useActivator` composable would happily write
 * `aria-haspopup`/`aria-controls` onto whatever `:activator` points at - but it would also
 * register that same element in the overlay's outside-click `include` list (see
 * `VOverlay.js`'s `include: () => [activatorEl.value]`), so a click anywhere inside it stops
 * counting as "outside". `root` here is the *entire* wrapped surface - for `id="app.tabBar"`
 * that is the whole tab bar and every page under it - so that inclusion is exactly how "right
 * click menu not closing when clicking off the menu" was reported: the click that was
 * supposed to dismiss the menu landed inside `root` and the directive waved it through.
 *
 * `:target` positions an overlay without any of that side effect, so both menus below use
 * `:target` only and the wrapper wires the accessibility attributes onto `root` by hand
 * instead of trusting `:activator` to do it as a side effect.
 */
const menuId = useId();
const editorId = useId();

const paintsABox = computed(() =>
    BOX_DECLARATIONS.some((declaration) => declaration in target.style.value.style),
);

const search = ref("");
const searchRegex = ref(false);
const searchFlags = ref("i");

/** The shortcut, in the notation Windows itself uses, from the handler that implements it. */
const EDITOR_SHORTCUT = "Ctrl+Shift+F10";

interface Command {
    key: string;
    label: string;
    shortcut: string;
    icon: string;
    run: () => void;
}

const commands = computed<Command[]>(() => {
    const list: Command[] = [
        {
            key: "edit",
            label: t("appearance.menu.edit", "Edit appearance..."),
            shortcut: EDITOR_SHORTCUT,
            icon: mdiPalette,
            run: openEditor,
        },
    ];

    if (target.customised.value) {
        list.push({
            key: "reset",
            label: t("appearance.menu.reset", "Reset this element's appearance"),
            shortcut: "",
            icon: mdiRestore,
            run: () => {
                target.resetElement();
                closeMenu();
            },
        });
    }

    return list;
});

const visibleCommands = computed(() => {
    const matcher = createSettingMatcher(search.value, searchRegex.value, searchFlags.value);
    return commands.value.filter((command) => matcher.test(`${command.label} ${command.shortcut}`));
});

const commandCorpus = computed(() => commands.value.map((command) => command.label).join("\n"));

/* -------------------------------------------------------------------------- */
/* Opening and closing                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Focus goes back to the element, never to the page.
 *
 * The first focusable thing inside the slot when there is one, because that is the control
 * the user was on; the wrapper otherwise, which carries `tabindex="-1"` for exactly this.
 * Losing focus to `<body>` after closing a popover is the single most common way a keyboard
 * user gets stranded, and it is invisible to anyone testing with a mouse.
 */
function returnFocus(): void {
    const element = root.value;
    if (element === null) return;

    const focusable = element.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? element).focus();
}

function openMenu(at: [number, number] | HTMLElement | undefined): void {
    contextTarget.value = at;
    search.value = "";
    // The regex toggle and its flags belong to this one menu session, not to the element - a
    // menu that closed with regex mode on must not silently hand it to the next menu that
    // opens, whether that is the same element reopened or a different AppearanceTarget
    // entirely. Reset both back to ConfigSearchField's own defaults (see `searchRegex`/
    // `searchFlags` above) every time a menu opens, so a freshly opened search field always
    // starts as a plain-text substring match.
    searchRegex.value = false;
    searchFlags.value = "i";
    editorOpen.value = false;
    menuOpen.value = true;
}

function closeMenu(): void {
    menuOpen.value = false;
    returnFocus();
}

function openEditor(): void {
    menuOpen.value = false;
    editorOpen.value = true;
}

function closeEditor(): void {
    editorOpen.value = false;
    returnFocus();
}

function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Shift+right-click is the contract's direct route: no menu, straight to the editor,
    // anchored to the element rather than to the pointer so it behaves identically to the
    // keyboard shortcut that mirrors it.
    if (event.shiftKey) {
        openEditor();
        return;
    }

    openMenu([event.clientX, event.clientY]);
}

function onKeydown(event: KeyboardEvent): void {
    const isContextKey = event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
    if (!isContextKey) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey) openEditor();
    else openMenu(root.value ?? undefined);
}
</script>

<template>
    <component
        :is="as"
        ref="root"
        class="mb-appearance-target"
        :class="{ 'mb-appearance-target--box': paintsABox }"
        tabindex="-1"
        :style="target.style.value.style"
        :aria-keyshortcuts="`Shift+F10 ${EDITOR_SHORTCUT}`"
        aria-haspopup="menu"
        :aria-expanded="menuOpen || editorOpen ? 'true' : 'false'"
        :aria-controls="menuOpen ? menuId : editorOpen ? editorId : undefined"
        @contextmenu="onContextMenu"
        @keydown="onKeydown"
    >
        <slot />

        <!--
            The context menu. Anchored at the pointer for a right-click and at the element for
            the keyboard path, painting its own surface, bounded and scrollable, and carrying
            its own search field wired to the project's regex builder like every other search
            surface in this app. `:target` only, deliberately no `:activator` - see the comment
            on `menuId` above for why.
        -->
        <v-menu
            v-model="menuOpen"
            :id="menuId"
            :target="contextTarget"
            :open-on-click="false"
            :close-on-content-click="false"
            location="bottom start"
            offset="4"
            @update:model-value="(value: boolean) => !value && closeMenu()"
        >
            <div class="mb-appearance-target__menu" role="none">
                <ConfigSearchField
                    v-model="search"
                    v-model:regex="searchRegex"
                    v-model:flags="searchFlags"
                    :label="t('appearance.menu.search', 'Search this menu')"
                    :sample="commandCorpus"
                />

                <!--
                    The host's own menu first. A tab that already had management commands keeps
                    them and gains the appearance commands underneath, rather than having its
                    menu replaced by this one.
                -->
                <slot name="menu" :close="closeMenu" />

                <v-list density="compact" :aria-label="t('appearance.menu.label', 'Appearance commands')">
                    <v-list-item
                        v-for="command in visibleCommands"
                        :key="command.key"
                        :prepend-icon="command.icon"
                        :title="command.label"
                        @click="command.run()"
                    >
                        <template v-if="command.shortcut" #append>
                            <kbd class="mb-appearance-target__shortcut">{{ command.shortcut }}</kbd>
                        </template>
                    </v-list-item>
                </v-list>

                <p v-if="visibleCommands.length === 0" class="mb-appearance-target__empty">
                    {{ t("appearance.menu.noMatch", "No command matches that search.") }}
                </p>
            </div>
        </v-menu>

        <!--
            The editor. Anchored to the element and tracking it, non-modal, with no scrim, so
            the element it is editing stays visible and usable while it is open. `location`
            puts it beside rather than over the element, and Vuetify's connected strategy
            flips it at the viewport edge without detaching it from the anchor. `:target`
            only, deliberately no `:activator` - see the comment on `menuId` above for why;
            it matters even more here, because this popup has no scrim, so an outside click
            is the *only* pointer route that can dismiss it.
        -->
        <v-menu
            v-model="editorOpen"
            :id="editorId"
            :target="root ?? undefined"
            :open-on-click="false"
            :close-on-content-click="false"
            :scrim="false"
            location="end top"
            offset="12"
            @update:model-value="(value: boolean) => !value && closeEditor()"
        >
            <AppearanceEditor :target-id="id" :target-label="label" />
        </v-menu>
    </component>
</template>

<style>
/*
 * No box until one is needed. Typography reaches the slot content through ordinary CSS
 * inheritance even here, so the default costs the host nothing; a background or a border
 * would render nothing on a contents box, so the class above turns the wrapper into a real
 * one exactly when there is something to paint.
 */
.mb-appearance-target {
    display: contents;
}

/*
 * `root` carries `aria-haspopup`/`aria-expanded`/`aria-controls` by hand (see the script's
 * `menuId`/`editorId` comment for why it is hand-wired rather than left to Vuetify's
 * `:activator`), which is correct ARIA - a screen reader should be told this element owns a
 * popup - and it is also exactly what trips Vuetify's own normalize stylesheet:
 * `[aria-controls] { cursor: pointer }` exists to give a small, dedicated trigger - a
 * disclosure button, a combobox - a hand cursor. It was never written with "the wrapper
 * around every rendered element in the application" in mind.
 *
 * `cursor` inherits, and this wrapper is `display: contents`, so left unanswered that one
 * attribute turned into a pointer cursor over literally everything on screen: headings,
 * empty panels, the title bar's drag region, prose nobody can click - "the full GUI has a
 * mouse click cursor" as filed. The wrapper itself is not a left-click target (it opens on
 * right-click and on a keyboard shortcut only), so `auto` is also the honest cursor for it,
 * not just the fix for its descendants. `aria-controls` is only present while a popup is
 * actually open, but the rule below is unconditional so there is nothing to leak either way.
 *
 * `[aria-controls]` and a single class both carry specificity (0,1,0), so a plain
 * `.mb-appearance-target { cursor: auto }` would only win by source-order luck. The class
 * is doubled to reach (0,2,0) and settle it outright, which is a smaller hammer than
 * `!important` for a rule that only ever needs to out-rank one specific selector.
 */
.mb-appearance-target.mb-appearance-target {
    cursor: auto;
}

.mb-appearance-target--box {
    display: inline-block;
    min-inline-size: 0;
}

.mb-appearance-target:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-appearance-target__menu {
    inline-size: min(320px, 92vw);
    max-block-size: min(60vh, 420px);
    overflow-y: auto;
    padding: 8px;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
}

.mb-appearance-target__shortcut {
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
    font-family: inherit;
    font-size: 0.7rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-appearance-target__empty {
    margin: 0;
    padding: 8px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
