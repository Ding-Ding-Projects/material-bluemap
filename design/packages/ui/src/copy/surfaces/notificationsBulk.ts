/**
 * The notification centre's bulk-action toolbar and its per-row selection checkbox:
 * `NoticeBulkToolbar.vue` and `NoticeSelectCheckbox.vue`.
 *
 * Both components live at the top of `components/`, next to `PathField.vue`, rather than
 * inside `components/notifications/` with the panel that hosts them. That is not a filing
 * accident: `components/notifications` is a finished surface in `catalogueCoverage.test.ts`,
 * every `t()` key rendered from anywhere inside it has to resolve in the merged catalogue,
 * and this module is deliberately not registered there yet (see the note below). Keeping the
 * two components that actually call these keys outside that folder is what lets the bulk
 * toolbar exist without either wiring a half-written catalogue entry into the finished
 * surface or inventing a home for orphan prose. `NoticeCentrePanel.vue` mounts them as
 * children and adds no `t()` call of its own for anything they render.
 *
 * ## Registration happens in a later phase
 *
 * This module is not yet imported by `surfaces/index.ts`, so it is not reachable through
 * `APP_VOICED`/`APP_FIXED`/`FACTS` and is not exercised by `appCopy.test.ts` or
 * `catalogueCoverage.test.ts`. `pathField.ts` and `project.test.ts` hold their own surfaces
 * to the same shape those files would, ahead of registration, for the same reason:
 * `notificationsBulk.test.ts` does that here.
 *
 * ## The four explanations, and what has to survive every funny level
 *
 * `noticeBulk.dismissExplain`, `...exportExplain`, `...markReadExplain` and
 * `...deleteExplain` are the sentence each bulk action shows before it runs, alongside the
 * exact count from `../../components/notifications/noticeBulk.ts`'s own impact functions.
 * Each one pins a fact a playful rewrite must not lose, checked in `NOTIFICATIONSBULK_FACTS`:
 *
 *   - dismiss says the notice is still in the history, because clearing the corner is not
 *     deleting anything and a level that stops saying so turns a safe action into a scary one;
 *   - export says the count matches the active filter, because an export that quietly widens
 *     to everything is not the export the button claimed;
 *   - mark-as-read says other notices "in between" ride along, because the read state is one
 *     shared line rather than a flag per notice (see that module's own comment) and a level
 *     that drops this turns a surprising side effect into a silent one;
 *   - delete says it cannot be undone, because it is the one truly destructive action here
 *     and the whole point of the super-confirmation gate it sits behind is that the person
 *     dragging the slider knows exactly what they are agreeing to.
 *
 * Everything else in this file is a control label or an accessible name: `pathField.ts`'s
 * own reasoning for keeping `pathField.browse.aria` and `pathField.dialogTitle` FIXED applies
 * here without change. A checkbox whose accessible name reads differently every time somebody
 * nudges a funny-level slider is a checkbox a screen-reader user has to re-learn mid-review.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const NOTIFICATIONSBULK_FIXED = {
    /** The per-row checkbox's accessible name. `{summary}` is the notice's own title or body. */
    "noticeBulk.selectRow": { en: "Select: {summary}", yue: "揀返嚟：{summary}" },
    "noticeBulk.selectAllVisible": { en: "Select all {count} shown", yue: "揀晒而家見到嘅 {count} 個" },
    "noticeBulk.selectAllHistory": { en: "Select all {count} in history", yue: "揀晒歷史入面成 {count} 個" },
    "noticeBulk.invert": { en: "Invert selection", yue: "反選" },
    "noticeBulk.clearSelection": { en: "Clear selection", yue: "清空揀選" },
    /** The live-region status text, announced whenever the selection changes. */
    "noticeBulk.selectionStatus": { en: "{count} selected", yue: "揀咗 {count} 個" },
    "noticeBulk.dismissButton": { en: "Dismiss {count} selected", yue: "收埋揀咗嘅 {count} 個" },
    "noticeBulk.exportJsonButton": { en: "Export {count} as JSON", yue: "將 {count} 個匯出做 JSON" },
    "noticeBulk.exportMarkdownButton": { en: "Export {count} as Markdown", yue: "將 {count} 個匯出做 Markdown" },
    "noticeBulk.markReadButton": { en: "Mark {count} as read", yue: "將 {count} 個標記做已讀" },
    "noticeBulk.deleteButton": { en: "Delete {count} selected", yue: "刪除揀咗嘅 {count} 個" },
    "noticeBulk.deleteTitle": { en: "Delete selected notifications", yue: "刪除揀咗嘅通知" },
    "noticeBulk.deleteConfirmLabel": {
        en: "Slide to delete the selected notifications",
        yue: "拉到盡刪除揀咗嘅通知",
    },
    /** Dismiss's exclusion note: the rest of the selection was not currently showing. */
    "noticeBulk.excludedDismiss": {
        en: "{excluded} of the selection were not currently showing, so dismiss left them alone",
        yue: "揀咗但而家冇顯示緊嘅 {excluded} 個，收埋呢個操作冇郁過佢哋",
    },
    /** Delete's exclusion note: the rest of the selection no longer exists in the history. */
    "noticeBulk.excludedDelete": {
        en: "{excluded} of the selection are already gone from the history, so delete left them alone",
        yue: "揀咗但已經唔喺歷史入面嘅 {excluded} 個，刪除呢個操作冇郁過佢哋",
    },
    /** Export's exclusion note: the rest of the selection does not match the active filter. */
    "noticeBulk.excludedExport": {
        en: "{excluded} of the selection do not match the active filter, so export left them out",
        yue: "揀咗但同而家篩選唔啱嘅 {excluded} 個，匯出呢個操作冇包埋佢哋",
    },
    /** The live-region status after dismiss, delete or mark-as-read actually runs. */
    "noticeBulk.actionDone": { en: "Done. {count} changed.", yue: "搞掂。改咗 {count} 個。" },
    /** The live-region status after a bulk export writes to the clipboard. */
    "noticeBulk.exported": {
        en: "Copied {count} to the clipboard.",
        yue: "已經將 {count} 個複製到剪貼簿。",
    },
    "noticeBulk.exportFailed": {
        en: "Could not reach the clipboard.",
        yue: "用唔到剪貼簿。",
    },
} as const satisfies Record<string, FixedString>;

export const NOTIFICATIONSBULK_VOICED = {
    "noticeBulk.dismissExplain": {
        en: [
            "This clears {count} notifications from the corner. Each one is still in the history and can be shown again.",
            "This clears {count} notifications from the corner. Each one is still in the history and can be shown again.",
            "This clears {count} notifications from the corner. Each one is still in the history, ready to be shown again.",
            "This clears {count} notifications out of the corner, though every one of them is still in the history, one click from coming back.",
            "This shoos {count} notifications right off the corner, but do not worry, each one is still in the history, patiently waiting for a click to come strutting back.",
        ],
        yue: [
            "呢個操作會由角落清走 {count} 個通知。每個都仲喺歷史度，隨時可以再顯示返。",
            "呢個操作會由角落清走 {count} 個通知。每個都仲喺歷史度，隨時可以再顯示返。",
            "呢個操作會由角落清走 {count} 個通知。每個都仲喺歷史度，撳一下就顯示返。",
            "呢個操作會由角落清走晒 {count} 個通知，不過個個都仲喺歷史度，撳一下就返嚟。",
            "呢個操作會將 {count} 個通知由角落度請走，唔使擔心，個個都仲喺歷史度，靜靜哋等緊你撳一下就大搖大擺返嚟。",
        ],
    },
    "noticeBulk.exportExplain": {
        en: [
            "This writes {count} notifications, exactly the ones that match your current filter.",
            "This writes {count} notifications, exactly the ones that match your current filter.",
            "This writes {count} notifications, exactly the ones that match your current filter and search.",
            "This writes out {count} notifications, exactly the set that matches your current filter, nothing more and nothing less.",
            "This writes out {count} notifications, precisely the ones that match your current filter, because an export that quietly widens to everything is not an export anybody can trust.",
        ],
        yue: [
            "呢個操作會寫出 {count} 個通知，就係啱晒而家嘅篩選嗰啲。",
            "呢個操作會寫出 {count} 個通知，就係啱晒而家嘅篩選嗰啲。",
            "呢個操作會寫出 {count} 個通知，就係啱晒而家嘅篩選同搜尋嗰啲。",
            "呢個操作會寫出 {count} 個通知，一個都唔多一個都唔少，全部同而家嘅篩選一樣。",
            "呢個操作會老老實實寫出 {count} 個通知，個個都同而家嘅篩選一樣，因為靜雞雞加多幾個嘅匯出，邊個信得過吖。",
        ],
    },
    "noticeBulk.markReadExplain": {
        en: [
            "This marks {count} notifications as read. Because read is tracked as one line rather than per notification, anything unread in between the oldest and newest of your selection is marked too.",
            "This marks {count} notifications as read. Because read is tracked as one line rather than per notification, anything unread in between the oldest and newest of your selection is marked too.",
            "This marks {count} notifications as read. Read is tracked as one shared line, so anything unread in between the oldest and newest you picked is marked too.",
            "This marks {count} notifications as read, riding on one shared line rather than a flag per notice, so whatever was unread in between the oldest and newest pick also gets swept along.",
            "This marks {count} notifications as read by nudging one shared line forward, and since there is no flag per notice, whatever unread stragglers sit in between your oldest and newest pick get swept along for the ride too.",
        ],
        yue: [
            "呢個操作會將 {count} 個通知標記做已讀。因為已讀係用一條線嚟計，唔係逐個記嘅，所以你揀嗰批入面、最舊同最新中間仲未讀嘅都會一齊變已讀。",
            "呢個操作會將 {count} 個通知標記做已讀。因為已讀係用一條線嚟計，唔係逐個記嘅，所以你揀嗰批入面、最舊同最新中間仲未讀嘅都會一齊變已讀。",
            "呢個操作會將 {count} 個通知標記做已讀。已讀係一條共用嘅線，所以最舊同最新中間仲未讀嘅都會一齊變已讀。",
            "呢個操作會將 {count} 個通知標記做已讀，靠嘅係一條共用線，而唔係逐個記，所以最舊同最新中間漏低嘅未讀都會一齊拉埋。",
            "呢個操作會將 {count} 個通知標記做已讀，靠推前一條共用線，冇逐個記嘅旗仔，所以最舊同最新中間仲賴死唔走嘅未讀，都會一齊被拖埋做已讀。",
        ],
    },
    "noticeBulk.deleteExplain": {
        en: [
            "This removes {count} notifications from the history for good. It cannot be undone.",
            "This removes {count} notifications from the history for good. It cannot be undone.",
            "This removes {count} notifications from the history for good, and it cannot be undone.",
            "This takes {count} notifications out of the history for good. It cannot be undone, and nothing here pretends otherwise.",
            "This shows {count} notifications the door, for good, straight out of the history. It cannot be undone, full stop, no matter how long you stare at the screen afterwards.",
        ],
        yue: [
            "呢個操作會由歷史入面徹底移除 {count} 個通知，冇得復原。",
            "呢個操作會由歷史入面徹底移除 {count} 個通知，冇得復原。",
            "呢個操作會由歷史入面徹底移除 {count} 個通知，而且冇得復原。",
            "呢個操作會將 {count} 個通知由歷史度徹底請走，冇得復原，呢度唔會扮嘢話仲有得返轉頭。",
            "呢個操作會將 {count} 個通知由歷史度一次過請晒出去，冇得復原，之後你點樣盯住個畫面都冇用。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const NOTIFICATIONSBULK_FACTS = {
    // Dismiss is not delete. Every level keeps saying the notice stays in the history, so a
    // playful rewrite cannot make a safe, reversible action read like a destructive one.
    "noticeBulk.dismissExplain": {
        en: ["still in the history"],
        yue: ["仲喺歷史度"],
    },
    // The export button's whole promise is that it will not quietly widen to everything.
    "noticeBulk.exportExplain": {
        en: ["your current filter"],
        yue: ["而家嘅篩選"],
    },
    // The read watermark is one shared line, not a flag per notice; every level has to keep
    // admitting that other notices ride along, or the side effect becomes a silent one.
    "noticeBulk.markReadExplain": {
        en: ["in between"],
        yue: ["中間"],
    },
    // The one truly destructive action here. No funny level may soften or drop this.
    "noticeBulk.deleteExplain": {
        en: ["cannot be undone"],
        yue: ["冇得復原"],
    },
} as const satisfies Record<
    keyof typeof NOTIFICATIONSBULK_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
