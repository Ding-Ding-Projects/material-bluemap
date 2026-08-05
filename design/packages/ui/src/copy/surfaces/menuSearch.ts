/**
 * The search field every small fixed-item menu carries once it stops being fixed.
 *
 * `TabMenuList.vue` already gives the tab and group context menus a keyboard-reachable
 * filter (`tabs.menu.filter` / `tabs.menu.noMatch` in `./tabs.ts`); this module is the same
 * pair of strings for the handful of menus that used to be bare `v-list`s with no way to
 * search them at all -- the small "Export" and "Copy" format pickers on the history
 * comparison, the EULA viewer and the changelog viewer. `MenuSearchList.vue`
 * (`../../components/menuSearch/MenuSearchList.vue`) is what actually renders them, reusing
 * the wording here as its own default so a reader who has met one of these filters has met
 * all of them.
 *
 * ## NOT registered in `copy/surfaces/index.ts` yet
 *
 * Exactly the situation `tabGroupPicker.ts` and `project.ts` already document for their own
 * not-yet-registered surfaces: `copy/surfaces/index.ts` assembles `APP_VOICED`/`APP_FIXED`/
 * `FACTS` and is owned by a concurrently running lane, so wiring this module in is that
 * lane's integration step rather than this one's. Until then, `MenuSearchList.vue` calls
 * `useI18n().t(key, fallbackText)` for every key below, and vue-i18n's own default-message
 * behaviour renders `fallbackText` whenever the key is not yet present in the merged
 * catalogue -- the same graceful-degrade path every other unregistered surface in this
 * package already relies on. `menuSearch.test.ts` in this same directory holds the module to
 * the shape the merged catalogue requires anyway, mirroring `tabGroupPicker.test.ts`.
 *
 * ## What is FIXED and what is VOICED
 *
 * `menuSearch.filter` is FIXED, matching `tabs.menu.filter`'s own reasoning exactly: it is a
 * field label, not an explanation, and a label a screen-reader user has already learned
 * should not reword itself out from under them the next time the funny level moves.
 *
 * `menuSearch.noMatch` is VOICED: it is the one sentence in this module that explains rather
 * than labels, and it carries the fact every level must keep -- that nothing was deleted,
 * only filtered out of view, and clearing the search brings the rest back.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const MENUSEARCH_FIXED = {
    /** The filter field's own label, identical in wording to `tabs.menu.filter`. */
    "menuSearch.filter": { en: "Filter these commands", yue: "篩選呢啲指令" },
} as const satisfies Record<string, FixedString>;

export const MENUSEARCH_VOICED = {
    /*
     * The fact that must survive every level: the filter only hides rows, it never deletes
     * anything, and clearing the search is how the rest come back. `TabMenuList.vue`'s own
     * inline fallback text says the same thing in fewer words for the tab and group menus;
     * this is the same guarantee, worded for a menu of formats and commands rather than tabs.
     */
    "menuSearch.noMatch": {
        en: [
            "No command here matches that: clearing the search brings them all back.",
            "No command here matches that: clearing the search brings them all back.",
            "No command here matches that search; clearing it brings the rest back.",
            "Nothing here matches that search. Nothing was removed, only filtered out of view; clearing the search brings the rest back.",
            "Not one command here answers to that search, nothing vanished, only slipped out of view, and clearing the search marches the whole crew right back into place.",
        ],
        yue: [
            "冇指令符合嗰個搜尋。清走個搜尋就會見返晒。",
            "冇指令符合嗰個搜尋。清走個搜尋就會見返晒。",
            "冇指令符合嗰個搜尋。清走佢就會返晒嚟。",
            "冇一個指令符合嗰個搜尋。冇刪走任何嘢，淨係喺呢度篩走咗；清走個搜尋就會見返晒。",
            "一個都冇答應到嗰個搜尋。乜嘢都冇走過，淨係暫時匿埋咗；清走個搜尋，佢哋即刻全部返晒出嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const MENUSEARCH_FACTS = {
    // The two facts every level must keep: what to do (clear the search) and what happens
    // (the rest come back). Every level phrases "clearing" in lowercase, mid-sentence,
    // rather than as a capitalised sentence-opener, so the fact string below can stay a
    // literal, case-sensitive substring instead of one level accidentally reading "Clear".
    "menuSearch.noMatch": {
        en: ["clear", "back"],
        yue: ["清", "返"],
    },
} as const satisfies Record<
    keyof typeof MENUSEARCH_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
