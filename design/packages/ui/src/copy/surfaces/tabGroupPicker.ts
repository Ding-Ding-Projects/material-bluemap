/**
 * `TabGroupPicker.vue`: the anchored dialog behind the tab context menu's single
 * "Move this tab into group..." entry.
 *
 * The menu used to grow one row per existing group -- `assign:g1`, `assign:g2`, and so on
 * -- which is clutter that gets worse the more groups somebody makes. This surface is the
 * replacement: one menu entry that opens a small, searchable picker, listing every other
 * group by name, colour and member count, with a "New group..." action that always
 * appears so the picker is never a dead end even on a strip with no groups yet.
 *
 * NOT registered in `copy/surfaces/index.ts` yet -- see this module's own history for why.
 * `tabGroupPicker.test.ts` in this same directory holds it to the full shape the merged
 * catalogue requires (five levels, matching placeholders, the FACTS table) directly against
 * this file's exports, the same way `project.test.ts` and `pathField.test.ts` do for their
 * own not-yet-registered surfaces. Wiring it into `APP_VOICED`/`APP_FIXED`/`FACTS` -- and
 * therefore into `catalogueCoverage.test.ts`'s `components/tabs` coverage -- is integration's
 * job, done alongside whatever else is landing in `TabStrip.vue` at the time.
 *
 * ## What is FIXED and what is VOICED, and why
 *
 * Every command label, field label and accessible name here is FIXED, matching every other
 * command on this same context menu (`tabs.action.editAppearance`, `tabs.action.newGroup`,
 * and so on in `copy/surfaces/tabs.ts`): a name that reads differently every time the funny
 * level moves is a name a keyboard or screen-reader user has to re-learn on every visit, and
 * `TabMenuList`'s own filter matches against the exact label rendered.
 *
 * Three sentences are VOICED, because they are explanations rather than labels:
 *
 *   - `tabGroupPicker.rowName`, the accessible description read out for each group in the
 *     list. This is where "FACTS pinning group names and counts" actually lives: every
 *     level names which group the tab would join and how many tabs are already in it, because
 *     a level playful enough to drop either turns a list of specific, checkable destinations
 *     into a list of jokes a screen-reader user cannot act on.
 *   - `tabGroupPicker.empty`, read when the strip has no groups at all yet, which is the
 *     "honest empty state" the picker's contract requires. Every level keeps pointing at
 *     "New group..." as the way out, because an empty list with no stated next step reads as
 *     a dead end rather than as a fact about the strip.
 *   - `tabGroupPicker.noMatch`, read when groups exist but the search matched none of them --
 *     a different fact from the one above, and confusing the two would tell a person hunting
 *     for a group that none exist when forty of them are simply filtered out of view.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const TABGROUPPICKER_FIXED = {
    /*
     * The context-menu row itself. FIXED, and matching `tabs.action.editAppearance`'s own
     * reasoning exactly: `TabMenuList`'s filter field matches this exact label, so a caption
     * that reworded itself per funny level would stop matching what somebody just typed. The
     * trailing "..." is the same platform convention every other opens-a-surface command on
     * this menu already uses.
     */
    "tabGroupPicker.menuEntry": { en: "Move this tab into group...", yue: "將呢個分頁移入群組..." },

    /* The dialog's own accessible name, naming the tab being moved so two pickers open from
     * two different tabs are never confused for each other by anyone using a screen reader. */
    "tabGroupPicker.title": { en: "Move {label} into a group", yue: "將 {label} 移入群組" },

    "tabGroupPicker.searchLabel": { en: "Search groups by name", yue: "用名搜尋群組" },
    "tabGroupPicker.searchHint": { en: "part of a group name", yue: "群組名嘅一部分" },

    /* The list itself, and the row that creates a group rather than choosing an existing
     * one. "New group..." reuses the exact wording `tabs.action.newGroup` already carries
     * for the same underlying action, so the two read as the same command everywhere it
     * appears rather than as two differently-worded ways to do the same thing. */
    "tabGroupPicker.listLabel": { en: "Groups you can move this tab into", yue: "可以移入呢個分頁嘅群組" },
    "tabGroupPicker.newGroupAction": { en: "New group...", yue: "新群組..." },

    /* The bare member-count chip on each row, read alongside the row's own accessible name
     * below rather than instead of it -- this is the compact on-screen text, that is the
     * fuller sentence a screen reader announces. */
    "tabGroupPicker.rowCount": { en: "{count} tabs", yue: "{count} 個分頁" },

    "tabGroupPicker.cancel": { en: "Cancel", yue: "取消" },
} as const satisfies Record<string, FixedString>;

export const TABGROUPPICKER_VOICED = {
    /*
     * The accessible description for one group row. `{group}` and `{count}` are what the
     * FACTS table below pins: a row that named neither would be a button a screen-reader
     * user has to activate to find out what it does, in a menu whose entire point is
     * choosing between several such buttons without doing that.
     */
    "tabGroupPicker.rowName": {
        en: [
            "Move the tab into {group}, which holds {count} tabs",
            "Move the tab into {group}, which holds {count} tabs",
            "Move the tab into {group}, which already holds {count} tabs",
            "Move the tab into {group}, joining the {count} tabs already in there",
            "Move the tab into {group}, squeezing in alongside the {count} tabs already living there",
        ],
        yue: [
            "將分頁移入 {group}，入面已經有 {count} 個分頁",
            "將分頁移入 {group}，入面已經有 {count} 個分頁",
            "將分頁移入 {group}，入面已經有 {count} 個分頁喇",
            "將分頁移入 {group}，同入面已經有嘅 {count} 個分頁做伴",
            "將分頁塞入 {group}，同入面已經有嘅 {count} 個分頁迫埋一齊住",
        ],
    },

    /*
     * The honest empty state for a strip with no groups at all. Every level keeps pointing
     * at "New group..." as the way out, and keeps saying plainly that there are none yet,
     * because a picker that opens onto a blank list with no explanation reads as broken
     * rather than as a true statement about the strip.
     */
    "tabGroupPicker.empty": {
        en: [
            "There are no groups yet. Choose New group... to create one and move the tab into it.",
            "There are no groups yet. Choose New group... to create one and move the tab into it.",
            "There are no groups yet, so pick New group... to create one and move the tab straight into it.",
            "There are still no groups here, so New group... below both creates one and moves the tab into it in the same step.",
            "There are still no groups at all, so New group... below conjures one from nothing and drops the tab straight in, no group left behind.",
        ],
        yue: [
            "而家仲未有任何群組。揀「新群組...」就可以建立一個，同時將分頁移入去。",
            "而家仲未有任何群組。揀「新群組...」就可以建立一個，同時將分頁移入去。",
            "而家仲未有任何群組，揀「新群組...」就可以建立一個，直接將分頁移入去。",
            "呢度仲未有任何群組，揀低面嘅「新群組...」，一步過建立同埋移入分頁。",
            "一個群組都未有，揀低面嘅「新群組...」就即刻無中生有整一個出嚟，連分頁都一次過塞埋入去。",
        ],
    },

    /*
     * A different fact from the one above, and the two must never be confused: groups exist,
     * the search just did not find one whose name matches. Every level says the filter only
     * hides, because the reader is one clear away from seeing every group again.
     */
    "tabGroupPicker.noMatch": {
        en: [
            "No group's name matches that search. Clearing the search brings the rest back.",
            "No group's name matches that search. Clearing the search brings the rest back.",
            "No group's name matches that search. Clearing the search brings the rest back, unfiltered.",
            "No group's name matches that search. Nothing was removed, only filtered out of this list; clearing the search brings the rest back.",
            "No group's name matches that search. Nothing was removed, only filtered out of this list for now; clearing the search brings every one of them back.",
        ],
        yue: [
            "冇群組嘅名符合嗰個搜尋。清走個搜尋就會見返晒。",
            "冇群組嘅名符合嗰個搜尋。清走個搜尋就會見返晒。",
            "冇群組嘅名符合嗰個搜尋。清走個搜尋，佢哋就會返晒嚟。",
            "冇群組嘅名符合嗰個搜尋。冇刪走任何群組，淨係喺呢張清單度篩走咗；清走個搜尋就會見返晒。",
            "冇群組嘅名符合嗰個搜尋。冇刪走任何群組，淨係暫時喺呢張清單度篩走咗；清走個搜尋，佢哋全部即刻返晒嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const TABGROUPPICKER_FACTS = {
    // The placeholder tokens themselves, so no level can style its way into dropping which
    // group the tab would join or how many tabs are already waiting there.
    "tabGroupPicker.rowName": { en: ["{group}", "{count}"], yue: ["{group}", "{count}"] },
    // "New group..." is the way out of an empty list; "no groups" is the fact that it is one.
    "tabGroupPicker.empty": { en: ["no groups", "New group"], yue: ["未有", "新群組"] },
    // The one sentence that must survive every level verbatim: which fact this empty state is.
    "tabGroupPicker.noMatch": {
        en: ["No group's name matches that search"],
        yue: ["冇群組嘅名符合嗰個搜尋"],
    },
} as const satisfies Record<
    keyof typeof TABGROUPPICKER_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
