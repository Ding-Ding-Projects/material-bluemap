/**
 * The browser-style tab strip: the strip itself and its overflow surface, tab and group
 * context menus, the four tab-discovery searches, and every part of the bulk close that
 * runs before a tab actually goes.
 *
 * ## The one thing this module exists to get right
 *
 * A bulk close is the only place in the tab strip where a sentence can cost somebody
 * their work. Three facts therefore survive every funny level in both languages, and the
 * `FACTS` table at the bottom pins each of them:
 *
 *   - the **count**, and which count it is. `tabs.close.count` says how many of the
 *     eligible tabs would close, not how many exist; `tabs.close.gateAction` says how many
 *     close the moment the gate completes. Neither may round.
 *   - **who is excluded and why**. Pinned tabs are protected, tabs holding unsaved work
 *     stay open unless the user deliberately included them, and both exclusions are named
 *     rather than implied.
 *   - **that closing cannot be undone from here**, which is the sentence a playful level
 *     is most tempted to trade for a joke.
 *
 * ## The inverse pair
 *
 * `tabs.close.containing` and `tabs.close.notContaining` are exact inverses of one
 * predicate, and a reader who confuses them closes precisely the forty tabs they meant to
 * keep. They are FIXED so neither can drift under somebody, and the Cantonese uses two
 * visibly different words (含有 against 缺少) rather than the same phrase with a 唔 bolted
 * on, because a one-character difference is not a difference at a glance.
 *
 * ## What is deliberately *not* here
 *
 * `tabs.close.done`, `tabs.group.newName` and the `tabs.page.*` names live in `chrome.ts`.
 * `tabs.close.done` in particular is raised by the EULA reader as well as by this strip,
 * so it sits beside `eula.close.documentIntact`, the sentence it is always paired with.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const TABS_VOICED = {
    /* ---------------------------------------------------------------- */
    /* What a finished bulk close reports                                */
    /* ---------------------------------------------------------------- */

    /*
     * Four sentences appended to one notification after the close has run. They are one
     * register on purpose: at level 5 a jaunty "closed them all!" beside a flat "Pinned and
     * left alone" reads as though only one of the two was written by somebody who cared.
     * Each names its own exclusion, because the reader is counting tabs that are still on
     * screen and wants to know which rule kept each one.
     */
    "tabs.close.doneKept": {
        en: [
            "These stayed open because they hold unsaved work: {labels}",
            "These stayed open because they hold unsaved work: {labels}",
            "These stayed open, because they hold unsaved work: {labels}",
            "These stayed open rather than lose what is in them. They hold unsaved work: {labels}",
            "These would not budge, and quite right too, because they hold unsaved work: {labels}",
        ],
        yue: [
            "呢啲因為有未儲存嘅嘢，所以冇閂：{labels}",
            "呢啲因為有未儲存嘅嘢，所以冇閂：{labels}",
            "呢啲仲開住，因為佢哋有未儲存嘅嘢：{labels}",
            "呢啲寧願繼續開住，都唔想入面啲嘢冇咗。佢哋有未儲存嘅嘢：{labels}",
            "呢啲死攬住唔肯閂，而且係應該嘅，因為佢哋有未儲存嘅嘢：{labels}",
        ],
    },
    "tabs.close.doneProtected": {
        en: [
            "Pinned, and left alone: {labels}",
            "Pinned, and left alone: {labels}",
            "Pinned, so they were left alone: {labels}",
            "Pinned, so nothing touched them: {labels}",
            "Pinned, so the close walked straight past them without slowing down: {labels}",
        ],
        yue: [
            "已釘住，冇郁過：{labels}",
            "已釘住，冇郁過：{labels}",
            "呢啲已釘住，所以冇郁過：{labels}",
            "呢啲已釘住，所以完全冇郁到：{labels}",
            "呢啲已釘住，個閂嘅動作行過都冇望佢哋一眼：{labels}",
        ],
    },
    "tabs.close.doneGroupsKept": {
        en: [
            "These groups are now empty and were kept: {groups}",
            "These groups are now empty and were kept: {groups}",
            "These groups are now empty and were kept rather than removed: {groups}",
            "These groups are now empty, and were kept rather than removed, as asked: {groups}",
            "These groups are now empty, and were kept anyway rather than removed, exactly as asked: {groups}",
        ],
        yue: [
            "呢啲群組而家空咗，但係保留咗：{groups}",
            "呢啲群組而家空咗，但係保留咗：{groups}",
            "呢啲群組而家空咗，不過保留咗，冇刪走：{groups}",
            "呢啲群組而家空咗，照你講嘅保留咗，冇刪走：{groups}",
            "呢啲群組而家空空如也，但照你講嘅保留咗，一個都冇刪走：{groups}",
        ],
    },
    /* The opposite outcome of the same choice, so no level may let it read like the one
     * above. Every level says both halves: emptied, and then removed. */
    "tabs.close.doneGroupsGone": {
        en: [
            "These groups were emptied and removed: {groups}",
            "These groups were emptied and removed: {groups}",
            "These groups were emptied, and then removed: {groups}",
            "These groups were emptied, and removed once there was nothing left in them: {groups}",
            "These groups were emptied, and then removed, an empty group being a name with nothing under it: {groups}",
        ],
        yue: [
            "呢啲群組被清空咗，亦都刪走咗：{groups}",
            "呢啲群組被清空咗，亦都刪走咗：{groups}",
            "呢啲群組被清空咗，跟住刪走咗：{groups}",
            "呢啲群組清空咗、入面一個都唔剩之後，就刪走咗：{groups}",
            "呢啲群組清空咗之後就刪走咗，因為得個名、下面乜都冇嘅群組，留嚟都係嘥位：{groups}",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The panel behind the strip                                        */
    /* ---------------------------------------------------------------- */

    "tabs.panel.missing": {
        en: [
            "This build has no content for the page {page}.",
            "This build has no content for the page {page}.",
            "This build has nothing to show for the page {page}.",
            "This build carries no content for the page {page}, so there is nothing to draw here.",
            "This build carries no content at all for the page {page}, so the tab is real and the page behind it is not.",
        ],
        yue: [
            "呢個 build 冇 {page} 呢一頁嘅內容。",
            "呢個 build 冇 {page} 呢一頁嘅內容。",
            "呢個 build 冇嘢可以喺 {page} 呢一頁度顯示。",
            "呢個 build 冇帶 {page} 呢一頁嘅內容，所以呢度冇嘢可以畫。",
            "呢個 build 根本冇帶 {page} 呢一頁嘅內容，所以個分頁係真嘅，後面嗰頁唔係。",
        ],
    },
    /* Closing the last tab looks like data loss to anybody who has ever closed the wrong
     * window. Every level above 2 says outright that nothing went with them. */
    "tabs.panel.empty": {
        en: [
            "Every tab is closed.",
            "Every tab is closed.",
            "Every tab is closed. Nothing was lost by closing them.",
            "Every tab is closed. Nothing was lost by closing them; open one again below.",
            "Every tab is closed, and the strip is as empty as it looks. Nothing was lost by closing them; open one again below.",
        ],
        yue: [
            "所有分頁都閂咗。",
            "所有分頁都閂咗。",
            "所有分頁都閂咗。閂佢哋冇令任何嘢唔見咗。",
            "所有分頁都閂咗。閂佢哋冇令任何嘢唔見咗；喺下面可以再開返一個。",
            "所有分頁都閂晒，條分頁列而家真係空空如也。閂佢哋冇令任何嘢唔見咗；喺下面可以再開返一個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The bulk close: what it looks at, what it would do                */
    /* ---------------------------------------------------------------- */

    /*
     * The privacy sentence. Both text actions match the visible tab label and nothing else,
     * and a user typing a password fragment into that box deserves to know the page's own
     * contents were never read. "never" and "the page is holding" are pinned in all ten
     * strings for that reason.
     */
    "tabs.close.note": {
        en: [
            "Both actions look only at the label you can see on the tab, never at what the page is holding.",
            "Both actions look only at the label you can see on the tab, never at what the page is holding.",
            "Both actions look only at the label you can see on the tab, and never at what the page is holding.",
            "Both actions read only the label you can see on the tab. What the page is holding is never looked at.",
            "Both actions read the label you can see on the tab and nothing else. What the page is holding is never looked at, never searched, never mentioned.",
        ],
        yue: [
            "兩個動作都只係睇你喺分頁上面見到嘅標籤，永遠唔會睇個頁面入面有咩。",
            "兩個動作都只係睇你喺分頁上面見到嘅標籤，永遠唔會睇個頁面入面有咩。",
            "兩個動作都淨係睇你喺分頁上面見到嘅標籤，永遠唔會睇個頁面入面有咩。",
            "兩個動作淨係讀你喺分頁上面見到嘅標籤。個頁面入面有咩，永遠唔會睇。",
            "兩個動作淨係讀你喺分頁上面見到嘅標籤，其他一律唔理。個頁面入面有咩，永遠唔會睇、唔會搵、唔會提。",
        ],
    },

    /*
     * The three sentences of the super-confirmation gate, concatenated in this order by
     * `TabClosePanel` and `TabPlanConfirm`. `{closing}` is the number that actually goes,
     * already net of anything held back, so it is the one number a reader can trust to
     * match what happens next.
     */
    "tabs.close.gateAction": {
        en: [
            "{closing} tabs close now. Closing a tab cannot be undone from here.",
            "{closing} tabs close now. Closing a tab cannot be undone from here.",
            "{closing} tabs close now, and closing a tab cannot be undone from here.",
            "{closing} tabs close the moment this finishes, and closing a tab cannot be undone from here.",
            "{closing} tabs go the moment this slider lands, and closing a tab cannot be undone from here, so there is no asking for them back.",
        ],
        yue: [
            "{closing} 個分頁而家會閂。閂咗嘅分頁喺呢度冇得復原。",
            "{closing} 個分頁而家會閂。閂咗嘅分頁喺呢度冇得復原。",
            "{closing} 個分頁而家會閂，而閂咗嘅分頁喺呢度冇得復原。",
            "呢個一完，{closing} 個分頁就會閂，而閂咗嘅分頁喺呢度冇得復原。",
            "支滑桿一到底，{closing} 個分頁即刻走人，而閂咗嘅分頁喺呢度冇得復原，之後點講都冇用。",
        ],
    },
    "tabs.close.gateHeld": {
        en: [
            "{held} holding unsaved work stay open and are reported.",
            "{held} holding unsaved work stay open and are reported.",
            "{held} holding unsaved work stay open, and are reported afterwards.",
            "{held} of them are holding unsaved work, so they stay open and are named afterwards.",
            "{held} of them are holding unsaved work, so they stay open, and you get told exactly which ones afterwards.",
        ],
        yue: [
            "{held} 個有未儲存嘅嘢，會繼續開住，之後會報返俾你知。",
            "{held} 個有未儲存嘅嘢，會繼續開住，之後會報返俾你知。",
            "{held} 個有未儲存嘅嘢，會繼續開住，跟住會報返俾你知。",
            "有 {held} 個入面有未儲存嘅嘢，所以會繼續開住，之後會逐個報返俾你知。",
            "有 {held} 個入面有未儲存嘅嘢，所以佢哋會繼續開住，之後仲會逐個報返俾你知邊個。",
        ],
    },
    "tabs.close.gateGroups": {
        en: [
            "This empties and removes the groups {groups}.",
            "This empties and removes the groups {groups}.",
            "This empties the groups {groups} and then removes them.",
            "This empties the groups {groups}, and then removes them for being empty.",
            "This empties the groups {groups}, and then removes them for the crime of being empty.",
        ],
        yue: [
            "呢個動作會清空並刪走 {groups} 呢啲群組。",
            "呢個動作會清空並刪走 {groups} 呢啲群組。",
            "呢個動作會清空 {groups} 呢啲群組，跟住刪走佢哋。",
            "呢個動作會清空 {groups} 呢啲群組，然後因為佢哋空咗而刪走。",
            "呢個動作會清空 {groups} 呢啲群組，然後就趁佢哋空咗，順手刪走。",
        ],
    },

    /*
     * The preview's headline. `{affected}` of `{eligible}`, never of "all tabs": the
     * eligible set has already had the pinned and the out-of-scope taken out of it, so a
     * level that shortened this to "{affected} tabs would close" would be describing a
     * different, larger operation than the one about to run.
     */
    "tabs.close.count": {
        en: [
            "{affected} of {eligible} tabs would close",
            "{affected} of {eligible} tabs would close",
            "{affected} of the {eligible} tabs in scope would close",
            "{affected} of the {eligible} tabs in scope would close, and the rest stay",
            "{affected} of the {eligible} tabs in scope would close, and the others stay exactly where they are",
        ],
        yue: [
            "{eligible} 個分頁入面，有 {affected} 個會閂",
            "{eligible} 個分頁入面，有 {affected} 個會閂",
            "範圍內嘅 {eligible} 個分頁入面，有 {affected} 個會閂",
            "範圍內嘅 {eligible} 個分頁入面，有 {affected} 個會閂，其餘嘅照留",
            "範圍內嘅 {eligible} 個分頁入面，有 {affected} 個會閂，其餘嘅原封不動企喺度",
        ],
    },
    "tabs.close.needQuery": {
        en: [
            "Type something first. An empty search closes nothing.",
            "Type something first. An empty search closes nothing.",
            "Type something first: an empty search closes nothing.",
            "Type something first. An empty search closes nothing, which is the safe answer rather than the helpful one.",
            "Type something first. An empty search closes nothing, on the grounds that a blank box asking to close every tab is not a request anybody meant to make.",
        ],
        yue: [
            "請先打啲嘢。空白嘅搜尋咩都唔會閂。",
            "請先打啲嘢。空白嘅搜尋咩都唔會閂。",
            "請先打啲嘢：空白嘅搜尋咩都唔會閂。",
            "請先打啲嘢。空白嘅搜尋咩都唔會閂，呢個係最穩陣嘅答案，唔係最幫到手嗰個。",
            "請先打啲嘢。空白嘅搜尋咩都唔會閂，因為一個吉格仔叫人閂晒所有分頁，多數唔係邊個真心想要嘅嘢。",
        ],
    },
    /* `{error}` is the engine's own words. It is quoted, never paraphrased, because the
     * reader is about to fix a pattern with it. */
    "tabs.close.badPattern": {
        en: [
            "That pattern will not compile, so nothing will close: {error}",
            "That pattern will not compile, so nothing will close: {error}",
            "That pattern will not compile, so nothing will close. The engine said: {error}",
            "That pattern will not compile, so nothing will close. What the engine actually said: {error}",
            "That pattern will not compile, so nothing will close and every tab is still here. What the engine actually said: {error}",
        ],
        yue: [
            "呢個 pattern 編譯唔到，所以咩都唔會閂：{error}",
            "呢個 pattern 編譯唔到，所以咩都唔會閂：{error}",
            "呢個 pattern 編譯唔到，所以咩都唔會閂。引擎話：{error}",
            "呢個 pattern 編譯唔到，所以咩都唔會閂。引擎原話係：{error}",
            "呢個 pattern 編譯唔到，所以咩都唔會閂，啲分頁全部仲喺度。引擎原話係：{error}",
        ],
    },
    "tabs.close.protected": {
        en: [
            "{count} pinned tabs are protected and stay open: {labels}",
            "{count} pinned tabs are protected and stay open: {labels}",
            "{count} pinned tabs are protected, and stay open: {labels}",
            "{count} pinned tabs are protected from this close and stay open: {labels}",
            "{count} pinned tabs are protected from this close and stay open, pins being the entire point of pins: {labels}",
        ],
        yue: [
            "{count} 個已釘住嘅分頁受保護，會繼續開住：{labels}",
            "{count} 個已釘住嘅分頁受保護，會繼續開住：{labels}",
            "有 {count} 個已釘住嘅分頁受保護，會繼續開住：{labels}",
            "有 {count} 個已釘住嘅分頁受呢次閂嘅保護，會繼續開住：{labels}",
            "有 {count} 個已釘住嘅分頁受呢次閂嘅保護，會繼續開住，釘就係為咗呢一刻而存在：{labels}",
        ],
    },
    "tabs.close.unsaved": {
        en: [
            "These hold unsaved work: {labels}",
            "These hold unsaved work: {labels}",
            "These are holding unsaved work: {labels}",
            "These are holding unsaved work, and would lose it: {labels}",
            "These are holding unsaved work, and would lose it on the way out: {labels}",
        ],
        yue: [
            "呢啲有未儲存嘅嘢：{labels}",
            "呢啲有未儲存嘅嘢：{labels}",
            "呢啲入面有未儲存嘅嘢：{labels}",
            "呢啲入面有未儲存嘅嘢，閂咗就會冇咗：{labels}",
            "呢啲入面有未儲存嘅嘢，一閂就會跟住一齊走：{labels}",
        ],
    },
    "tabs.close.wouldEmpty": {
        en: [
            "This would empty the groups {groups}",
            "This would empty the groups {groups}",
            "This would empty the groups {groups}, leaving nothing in them",
            "This would empty the groups {groups} completely, leaving nothing in them",
            "This would empty the groups {groups} completely, leaving a name with nothing left underneath it",
        ],
        yue: [
            "咁樣會清空 {groups} 呢啲群組",
            "咁樣會清空 {groups} 呢啲群組",
            "咁樣會清空 {groups} 呢啲群組，入面一個都唔剩",
            "咁樣會完全清空 {groups} 呢啲群組，入面一個都唔剩",
            "咁樣會完全清空 {groups} 呢啲群組，剩返個名喺度，下面乜都冇",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The bulk-close commands on the tab context menu                   */
    /* ---------------------------------------------------------------- */

    /*
     * Three commands that differ only in which tabs they take, so each one states its own
     * direction and, from level 4, states the direction it leaves alone. Getting "left" and
     * "right" the wrong way round here is the whole failure, and a menu item that only says
     * "close the tabs" gives a reader nothing to check it against.
     */
    "tabs.action.closeOthers": {
        en: [
            "Close the other tabs...",
            "Close the other tabs...",
            "Close every other tab, keeping this one...",
            "Close every other tab and keep this one...",
            "Close every other tab and keep this one, the last tab standing...",
        ],
        yue: [
            "閂其他分頁...",
            "閂其他分頁...",
            "閂晒其他分頁，留低呢個...",
            "閂晒其他分頁，淨係留低呢一個...",
            "閂晒其他分頁，淨係留低呢一個做最後生還者...",
        ],
    },
    "tabs.action.closeToStart": {
        en: [
            "Close the tabs to the left...",
            "Close the tabs to the left...",
            "Close every tab to the left of this one...",
            "Close every tab to the left of this one, and nothing on the other side...",
            "Close every tab to the left of this one, and not one single tab on the other side...",
        ],
        yue: [
            "閂左邊嘅分頁...",
            "閂左邊嘅分頁...",
            "閂晒呢個分頁左邊嘅所有分頁...",
            "閂晒呢個分頁左邊嘅所有分頁，另一邊嗰啲一個都唔郁...",
            "閂晒呢個分頁左邊嘅所有分頁，另一邊嗰啲連一個都唔會郁...",
        ],
    },
    "tabs.action.closeToEnd": {
        en: [
            "Close the tabs to the right...",
            "Close the tabs to the right...",
            "Close every tab to the right of this one...",
            "Close every tab to the right of this one, and nothing on the other side...",
            "Close every tab to the right of this one, and not one single tab on the other side...",
        ],
        yue: [
            "閂右邊嘅分頁...",
            "閂右邊嘅分頁...",
            "閂晒呢個分頁右邊嘅所有分頁...",
            "閂晒呢個分頁右邊嘅所有分頁，另一邊嗰啲一個都唔郁...",
            "閂晒呢個分頁右邊嘅所有分頁，另一邊嗰啲連一個都唔會郁...",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Finding a tab, and the tabs that do not fit                       */
    /* ---------------------------------------------------------------- */

    /* The overflow button's accessible name. It says hidden, not closed: a tab that has
     * scrolled out of the strip is still open, and a screen-reader user has no other way
     * to know that. */
    "tabs.strip.overflow": {
        en: [
            "{count} tabs do not fit. Show them.",
            "{count} tabs do not fit. Show them.",
            "{count} tabs do not fit in the strip. Show them.",
            "{count} tabs do not fit in the strip and are hidden, not closed. Show them.",
            "{count} tabs do not fit in the strip, so they are hidden in here rather than closed. Show them.",
        ],
        yue: [
            "{count} 個分頁擺唔落。撳嚟睇。",
            "{count} 個分頁擺唔落。撳嚟睇。",
            "{count} 個分頁喺條分頁列度擺唔落。撳嚟睇。",
            "{count} 個分頁喺條分頁列度擺唔落，係收埋咗，唔係閂咗。撳嚟睇。",
            "{count} 個分頁喺條分頁列度擺唔落，係收埋咗喺呢度等你，唔係閂咗。撳嚟睇。",
        ],
    },

    "tabs.find.allSummary": {
        en: [
            "Showing {shown} of {total} tabs, across {windows} windows and {strips} strips",
            "Showing {shown} of {total} tabs, across {windows} windows and {strips} strips",
            "Showing {shown} of {total} tabs, counted across {windows} windows and {strips} strips",
            "{shown} of {total} tabs shown, counted across {windows} windows and {strips} strips",
            "{shown} of {total} tabs shown, counted across {windows} windows and {strips} strips, the rest filtered out rather than gone",
        ],
        yue: [
            "顯示緊 {total} 個分頁入面嘅 {shown} 個，橫跨 {windows} 個視窗、{strips} 條分頁列",
            "顯示緊 {total} 個分頁入面嘅 {shown} 個，橫跨 {windows} 個視窗、{strips} 條分頁列",
            "喺 {windows} 個視窗、{strips} 條分頁列入面數，{total} 個分頁之中顯示緊 {shown} 個",
            "喺 {windows} 個視窗、{strips} 條分頁列入面數，{total} 個分頁之中有 {shown} 個喺畫面上",
            "喺 {windows} 個視窗、{strips} 條分頁列入面數，{total} 個分頁之中有 {shown} 個喺畫面上，其餘嘅係篩走咗，唔係唔見咗",
        ],
    },

    /*
     * Four no-match messages for four different searches, and the scope is the only thing
     * that distinguishes them. "this strip", "anywhere", "this group" and "No group" are
     * pinned so that a reader who has three of these open at once can tell which one just
     * came up empty.
     */
    "tabs.find.noneStrip": {
        en: [
            "No tab in this strip has a label matching that search.",
            "No tab in this strip has a label matching that search.",
            "No tab in this strip has a label matching that search. Nothing was closed or hidden.",
            "No tab in this strip has a label matching that search. Nothing was closed or hidden either; they simply did not match.",
            "No tab in this strip has a label matching that search. Nothing was closed or hidden either; the tabs are all still there, blissfully unmatched.",
        ],
        yue: [
            "呢條分頁列入面冇分頁嘅標籤符合嗰個搜尋。",
            "呢條分頁列入面冇分頁嘅標籤符合嗰個搜尋。",
            "呢條分頁列入面冇分頁嘅標籤符合嗰個搜尋。冇閂過亦冇收埋過任何嘢。",
            "呢條分頁列入面冇分頁嘅標籤符合嗰個搜尋。亦都冇閂過或者收埋過任何嘢，佢哋純粹係唔啱。",
            "呢條分頁列入面冇分頁嘅標籤符合嗰個搜尋。亦都冇閂過或者收埋過任何嘢，啲分頁全部好地地喺度，只係冇一個啱。",
        ],
    },
    "tabs.find.noneAll": {
        en: [
            "No open tab anywhere has a label matching that search.",
            "No open tab anywhere has a label matching that search.",
            "No open tab anywhere, in any window, has a label matching that search.",
            "No open tab anywhere, in any window, has a label matching that search. Every one of them is still open.",
            "No open tab anywhere, in any window, has a label matching that search. Every one of them is still open, and not one of them so much as flinched.",
        ],
        yue: [
            "任何地方都冇一個開住嘅分頁，個標籤符合嗰個搜尋。",
            "任何地方都冇一個開住嘅分頁，個標籤符合嗰個搜尋。",
            "任何視窗、任何地方，都冇一個開住嘅分頁嘅標籤符合嗰個搜尋。",
            "任何視窗、任何地方，都冇一個開住嘅分頁嘅標籤符合嗰個搜尋。佢哋全部仲開住。",
            "任何視窗、任何地方，都冇一個開住嘅分頁嘅標籤符合嗰個搜尋。佢哋全部仲開住，一個都冇郁過。",
        ],
    },
    "tabs.find.noneGroups": {
        en: [
            "No group has a name matching that search.",
            "No group has a name matching that search.",
            "No group has a name matching that search. No group was removed.",
            "No group has a name matching that search. No group was removed either; the filter only hides.",
            "No group has a name matching that search. No group was removed either; the filter only hides, and right now it is hiding all of them.",
        ],
        yue: [
            "冇群組嘅名符合嗰個搜尋。",
            "冇群組嘅名符合嗰個搜尋。",
            "冇群組嘅名符合嗰個搜尋。冇群組被刪走。",
            "冇群組嘅名符合嗰個搜尋。亦都冇群組被刪走，個篩選淨係會收埋。",
            "冇群組嘅名符合嗰個搜尋。亦都冇群組被刪走，個篩選淨係會收埋，而佢而家收埋咗全部。",
        ],
    },
    "tabs.group.noMatch": {
        en: [
            "No tab in this group has a label matching that search.",
            "No tab in this group has a label matching that search.",
            "No tab in this group has a label matching that search. The rest of the group is untouched.",
            "No tab in this group has a label matching that search. The rest of the group is untouched, only filtered out of this list.",
            "No tab in this group has a label matching that search. The rest of the group is untouched, only filtered out of this list and waiting quietly.",
        ],
        yue: [
            "呢個群組入面冇分頁嘅標籤符合嗰個搜尋。",
            "呢個群組入面冇分頁嘅標籤符合嗰個搜尋。",
            "呢個群組入面冇分頁嘅標籤符合嗰個搜尋。群組其他嘢冇郁過。",
            "呢個群組入面冇分頁嘅標籤符合嗰個搜尋。群組其他嘢冇郁過，淨係喺呢張清單度篩走咗。",
            "呢個群組入面冇分頁嘅標籤符合嗰個搜尋。群組其他嘢冇郁過，淨係喺呢張清單度篩走咗，靜靜哋等緊你。",
        ],
    },
    /* The menu filter hides commands; it never removes them. A user who has filtered a
     * destructive menu down to nothing needs to know the command is still there. */
    "tabs.menu.noMatch": {
        en: [
            "No command here matches that. Clearing the filter brings them all back.",
            "No command here matches that. Clearing the filter brings them all back.",
            "No command in this menu matches that. Clearing the filter brings them all back.",
            "No command in this menu matches that. Clearing the filter brings them all back; nothing was removed.",
            "No command in this menu matches that. Clearing the filter brings them all back, because nothing was removed, only hidden behind what you typed.",
        ],
        yue: [
            "呢度冇指令符合。清走個篩選就會全部返嚟。",
            "呢度冇指令符合。清走個篩選就會全部返嚟。",
            "呢個選單入面冇指令符合。清走個篩選就會全部返嚟。",
            "呢個選單入面冇指令符合。清走個篩選就會全部返嚟，冇任何指令被刪走。",
            "呢個選單入面冇指令符合。清走個篩選就會全部返嚟，因為冇任何指令被刪走，佢哋淨係俾你打嗰幾隻字擋住咗。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const TABS_FIXED = {
    /* The strip and the window it belongs to, used when the host names neither. */
    "tabs.strip.main": { en: "Main", yue: "主分頁列" },
    "tabs.window.main": { en: "This window", yue: "呢個視窗" },
    "tabs.strip.label": { en: "{strip}, {count} tabs", yue: "{strip}，{count} 個分頁" },
    "tabs.strip.newTab": { en: "Open a new tab", yue: "開個新分頁" },
    "tabs.strip.overflowList": { en: "Tabs that do not fit", yue: "擺唔落嘅分頁" },

    /*
     * Accessible names for a tab button. Pinned and unsaved are separate states that can
     * both be true, so there are three labels rather than one with a comma bolted on.
     */
    "tabs.strip.pinnedUnsaved": {
        en: "{label}, pinned, unsaved work",
        yue: "{label}，已釘住，有未儲存嘅嘢",
    },
    "tabs.strip.pinnedTab": { en: "{label}, pinned", yue: "{label}，已釘住" },
    "tabs.strip.unsavedTab": { en: "{label}, unsaved work", yue: "{label}，有未儲存嘅嘢" },

    /* Tab and group context menus. */
    "tabs.action.menuLabel": {
        en: "Commands for the tab {label}",
        yue: "{label} 呢個分頁嘅指令",
    },
    "tabs.action.close": { en: "Close {label}", yue: "閂 {label}" },
    "tabs.action.closeThis": { en: "Close this tab", yue: "閂咗呢個分頁" },
    "tabs.action.moveLeft": { en: "Move this tab left", yue: "將呢個分頁移去左邊" },
    "tabs.action.moveRight": { en: "Move this tab right", yue: "將呢個分頁移去右邊" },
    "tabs.action.pin": { en: "Pin {label}", yue: "釘住 {label}" },
    "tabs.action.unpin": { en: "Unpin {label}", yue: "解除釘住 {label}" },
    "tabs.action.pinThis": { en: "Pin this tab", yue: "釘住呢個分頁" },
    "tabs.action.unpinThis": { en: "Unpin this tab", yue: "解除釘住呢個分頁" },
    "tabs.action.ungroup": {
        en: "Take {label} out of its group",
        yue: "將 {label} 由佢所屬嘅群組拎返出嚟",
    },
    "tabs.action.ungroupThis": {
        en: "Take this tab out of its group",
        yue: "將呢個分頁由佢所屬嘅群組拎返出嚟",
    },
    "tabs.menu.filter": { en: "Filter these commands", yue: "篩選呢啲指令" },

    /*
     * Key names as the keyboard prints them, so they are identifiers and stay byte for byte
     * identical in both languages. Translating "Ctrl+Shift+Left" gives a reader a chord
     * that is not on any keyboard they own.
     */
    "tabs.key.enter": { en: "Enter", yue: "Enter" },
    "tabs.key.delete": { en: "Delete", yue: "Delete" },
    "tabs.key.moveLeft": { en: "Ctrl+Shift+Left", yue: "Ctrl+Shift+Left" },
    "tabs.key.moveRight": { en: "Ctrl+Shift+Right", yue: "Ctrl+Shift+Right" },

    /* Groups: the header, its menu, and the editable properties. */
    "tabs.group.headLabel": { en: "{group}, {count} tabs", yue: "{group}，{count} 個分頁" },
    "tabs.group.menu": { en: "Commands for the group {group}", yue: "{group} 呢個群組嘅指令" },
    "tabs.group.menuLabel": { en: "Commands for the group {group}", yue: "{group} 呢個群組嘅指令" },
    "tabs.group.expand": { en: "Expand", yue: "展開" },
    "tabs.group.collapse": { en: "Collapse", yue: "收埋" },
    "tabs.group.moveLeft": { en: "Move this group left", yue: "將呢個群組移去左邊" },
    "tabs.group.moveRight": { en: "Move this group right", yue: "將呢個群組移去右邊" },
    /* "keeping every tab" is the difference between ungrouping and closing, and it is the
     * reason this label is longer than the button it sits on would prefer. */
    "tabs.group.remove": { en: "Ungroup, keeping every tab", yue: "解散群組，所有分頁照留" },
    "tabs.group.name": { en: "Group name", yue: "群組名" },
    "tabs.group.color": { en: "Group colour", yue: "群組顏色" },
    "tabs.group.colorNamed": { en: "Colour this group {color}", yue: "將呢個群組設做 {color}" },
    "tabs.group.searchTitle": { en: "Search inside {group}", yue: "喺 {group} 入面搵" },
    "tabs.group.searchLabel": { en: "Search the tabs in {group}", yue: "搜尋 {group} 入面嘅分頁" },
    "tabs.group.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "{total} 個之中顯示緊 {shown} 個",
    },

    /* The four tab-discovery searches. */
    "tabs.find.title": { en: "Find a tab", yue: "搵分頁" },
    "tabs.find.strip": { en: "Search this strip: {strip}", yue: "搜尋呢條分頁列：{strip}" },
    "tabs.find.stripLabel": {
        en: "Search the tabs in this strip",
        yue: "搜尋呢條分頁列入面嘅分頁",
    },
    "tabs.find.stripSummary": {
        en: "Showing {shown} of {total}",
        yue: "{total} 個之中顯示緊 {shown} 個",
    },
    "tabs.find.all": {
        en: "Search every open tab, in every window",
        yue: "搜尋所有視窗入面每一個開住嘅分頁",
    },
    "tabs.find.allLabel": { en: "Search every open tab", yue: "搜尋每一個開住嘅分頁" },
    "tabs.find.groups": { en: "Search tab groups by name", yue: "用名搜尋分頁群組" },
    "tabs.find.groupsLabel": { en: "Search group names", yue: "搜尋群組名" },
    "tabs.find.groupSummary": {
        en: "Showing {shown} of {total} groups",
        yue: "{total} 個群組之中顯示緊 {shown} 個",
    },
    "tabs.find.groupCount": { en: "{count} tabs", yue: "{count} 個分頁" },
    "tabs.find.hint": { en: "part of a tab label", yue: "分頁標籤嘅一部分" },
    "tabs.find.groupHint": { en: "part of a group name", yue: "群組名嘅一部分" },
    /* Result badges. A hit inside a collapsed group is revealed without expanding it, so
     * the badge is the only thing telling the reader where the tab actually lives. */
    "tabs.find.collapsed": { en: "in a collapsed group", yue: "喺一個收埋咗嘅群組入面" },
    "tabs.find.pinned": { en: "pinned", yue: "已釘住" },

    /* ---------------------------------------------------------------- */
    /* The bulk close: the two inverse actions and their controls        */
    /* ---------------------------------------------------------------- */

    "tabs.close.title": { en: "Close many tabs at once", yue: "一次過閂好多分頁" },
    /*
     * The inverse pair, and the pair of field labels under them. The Cantonese picks 含有
     * against 缺少 rather than the same verb with a negation particle, because at a glance
     * 唔含有 and 含有 are one character apart and this is the one place in the strip where
     * misreading by one character closes the wrong set of tabs.
     */
    "tabs.close.containing": {
        en: "Close tabs containing text",
        yue: "閂標籤含有該段文字嘅分頁",
    },
    "tabs.close.notContaining": {
        en: "Close tabs not containing text",
        yue: "閂標籤缺少該段文字嘅分頁",
    },
    "tabs.close.containingField": {
        en: "Close tabs whose label contains",
        yue: "閂標籤含有以下文字嘅分頁",
    },
    "tabs.close.notContainingField": {
        en: "Close tabs whose label does not contain",
        yue: "閂標籤缺少以下文字嘅分頁",
    },
    "tabs.close.hint": { en: "part of a tab label", yue: "分頁標籤嘅一部分" },

    /* The three choices that change which tabs the plan takes. */
    "tabs.close.includePinned": { en: "Include pinned tabs", yue: "連已釘住嘅分頁一齊閂" },
    "tabs.close.closeUnsaved": {
        en: "Also close tabs holding unsaved work",
        yue: "連有未儲存嘅嘢嘅分頁都一齊閂",
    },
    "tabs.close.keepGroups": { en: "Keep a group this empties", yue: "保留因此變空嘅群組" },

    /* Scope and mode, stated on every preview so neither is left implied. */
    "tabs.close.scopeGroup": {
        en: "Inside the group {group} only",
        yue: "淨係喺 {group} 呢個群組入面",
    },
    "tabs.close.scopeStrip": { en: "Across this whole tab strip", yue: "橫跨成條分頁列" },
    "tabs.close.modeRegex": { en: "Matching as a regular expression", yue: "以正則表達式比對" },
    "tabs.close.modeText": { en: "Matching as plain text", yue: "以純文字比對" },

    /*
     * Per-row annotations in the reviewable list. `itemUnsavedGoing` and `itemUnsavedKept`
     * describe the same tab under two different settings, so each spells out its own
     * outcome instead of sharing a "(unsaved work)" that would make the two rows identical.
     */
    "tabs.close.itemPinned": { en: "{label} (pinned)", yue: "{label}（已釘住）" },
    "tabs.close.itemUnsavedGoing": {
        en: "{label} (unsaved work, will be lost)",
        yue: "{label}（有未儲存嘅嘢，會冇咗）",
    },
    "tabs.close.itemUnsavedKept": {
        en: "{label} (unsaved work, stays open)",
        yue: "{label}（有未儲存嘅嘢，會繼續開住）",
    },
    "tabs.close.more": { en: "and {more} more", yue: "仲有 {more} 個" },

    /*
     * The two "Edit appearance..." context-menu commands and the shortcut shown beside them.
     *
     * They are FIXED for the same reason `appearance.menu.edit` is: the menu's own search
     * filters on this exact label, so a caption that reworded itself per funny level would
     * stop matching what the user typed. The trailing "..." is the platform convention for a
     * command that opens something rather than acting immediately, and it survives
     * translation because the convention does.
     *
     * `tabs.key.editAppearance` is a key combination, not prose. It is byte-identical in both
     * languages because the keys on the keyboard are.
     */
    "tabs.action.editAppearance": { en: "Edit tab appearance...", yue: "編輯分頁外觀..." },
    "tabs.group.editAppearance": { en: "Edit group appearance...", yue: "編輯群組外觀..." },
    "tabs.key.editAppearance": { en: "Ctrl+Shift+F10", yue: "Ctrl+Shift+F10" },
    /*
     * Shown only once the tab or group actually has an override, so it never offers to undo
     * nothing. Both are labels for the same reason as the pair above, and both name what
     * they reset -- this tab, this group -- rather than saying "Reset", which in a menu that
     * also contains a global reset is the difference between one tab and every tab.
     */
    "tabs.action.resetAppearance": {
        en: "Reset this tab's appearance",
        yue: "重設呢個分頁嘅外觀",
    },
    "tabs.group.resetAppearance": {
        en: "Reset this group's appearance",
        yue: "重設呢個群組嘅外觀",
    },
} as const satisfies Record<string, FixedString>;

export const TABS_FACTS = {
    // Which rule kept each tab that is still on screen after the close.
    "tabs.close.doneKept": { en: ["unsaved work", "{labels}"], yue: ["未儲存", "{labels}"] },
    "tabs.close.doneProtected": { en: ["Pinned", "{labels}"], yue: ["已釘住", "{labels}"] },
    "tabs.close.doneGroupsKept": {
        en: ["empty", "kept", "{groups}"],
        yue: ["空", "保留", "{groups}"],
    },
    // Both halves, so this can never be mistaken for the "were kept" outcome above.
    "tabs.close.doneGroupsGone": {
        en: ["emptied", "removed", "{groups}"],
        yue: ["清空", "刪走", "{groups}"],
    },

    "tabs.panel.missing": { en: ["{page}", "build"], yue: ["{page}", "build"] },
    "tabs.panel.empty": { en: ["Every tab is closed"], yue: ["所有分頁都閂"] },

    // The privacy claim: the label only, and never the page's contents.
    "tabs.close.note": {
        en: ["label", "never", "the page is holding"],
        yue: ["標籤", "永遠唔會睇", "頁面"],
    },

    // The gate. The count that actually goes, and the fact that it does not come back.
    "tabs.close.gateAction": {
        en: ["{closing}", "cannot be undone"],
        yue: ["{closing}", "冇得復原"],
    },
    "tabs.close.gateHeld": {
        en: ["{held}", "unsaved work", "stay open"],
        yue: ["{held}", "未儲存", "繼續開住"],
    },
    "tabs.close.gateGroups": {
        en: ["{groups}", "empties", "removes"],
        yue: ["{groups}", "清空", "刪走"],
    },

    // Both numbers, because the affected count means nothing without the eligible one.
    "tabs.close.count": {
        en: ["{affected}", "{eligible}", "would close"],
        yue: ["{affected}", "{eligible}", "會閂"],
    },
    "tabs.close.needQuery": {
        en: ["empty search closes nothing"],
        yue: ["空白嘅搜尋咩都唔會閂"],
    },
    "tabs.close.badPattern": {
        en: ["{error}", "will not compile", "nothing will close"],
        yue: ["{error}", "編譯唔到", "咩都唔會閂"],
    },
    "tabs.close.protected": {
        en: ["{count}", "{labels}", "pinned", "stay open"],
        yue: ["{count}", "{labels}", "已釘住", "繼續開住"],
    },
    "tabs.close.unsaved": { en: ["unsaved work", "{labels}"], yue: ["未儲存", "{labels}"] },
    "tabs.close.wouldEmpty": { en: ["{groups}", "empty"], yue: ["{groups}", "清空"] },

    // Direction, pinned at every level: these three commands differ by nothing else.
    "tabs.action.closeOthers": { en: ["Close", "other"], yue: ["閂", "其他分頁"] },
    "tabs.action.closeToStart": { en: ["Close", "to the left"], yue: ["閂", "左邊"] },
    "tabs.action.closeToEnd": { en: ["Close", "to the right"], yue: ["閂", "右邊"] },

    "tabs.strip.overflow": {
        en: ["{count}", "do not fit", "Show them"],
        yue: ["{count}", "擺唔落", "撳嚟睇"],
    },
    "tabs.find.allSummary": {
        en: ["{shown}", "{total}", "{windows}", "{strips}"],
        yue: ["{shown}", "{total}", "{windows}", "{strips}"],
    },

    // Scope, so four otherwise identical no-match messages stay tellable apart.
    "tabs.find.noneStrip": {
        en: ["this strip", "label", "matching that search"],
        yue: ["呢條分頁列", "標籤", "符合嗰個搜尋"],
    },
    "tabs.find.noneAll": {
        en: ["anywhere", "label", "matching that search"],
        yue: ["任何地方", "標籤", "符合嗰個搜尋"],
    },
    "tabs.find.noneGroups": {
        en: ["No group", "name matching that search"],
        yue: ["冇群組嘅名符合嗰個搜尋"],
    },
    "tabs.group.noMatch": {
        en: ["this group", "label", "matching that search"],
        yue: ["呢個群組", "標籤", "符合嗰個搜尋"],
    },
    "tabs.menu.noMatch": {
        en: ["Clearing the filter", "matches that"],
        yue: ["清走個篩選", "符合"],
    },
} as const satisfies Record<
    keyof typeof TABS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
