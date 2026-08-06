/**
 * The application chrome: the tab strip's page names, the window buttons, the zoom and
 * free-flight controls, the render progress readout, the notification centre, and the EULA
 * reader.
 *
 * One module per surface, spread into `appCopy.ts`. The split is not cosmetic: the
 * catalogue is the one file in this package that several people edit at once, and a single
 * two-thousand-entry object literal makes every one of those edits touch the same hunk.
 *
 * ## What is deliberately *not* here
 *
 * `maps.title`, `markers.tooltip`, `controls.freeFlight.tooltip`, `blockTooltip.position`
 * and about seventy-five of their neighbours look exactly like keys this file should carry,
 * and carrying them would be a regression. They are upstream BlueMap's *viewer* keys, and
 * the thirty `public/lang/*.conf` files translate them properly into thirty languages.
 * `mergeVoiceInto` merges this catalogue on top of the loaded locale, so an entry here for
 * `maps.title` would replace the real German string with an English one for every German
 * reader. The rule is narrow and mechanical: if a key appears in `public/lang/en.conf`, it
 * belongs to upstream and never appears in this catalogue. `appCopy.test.ts` enforces it.
 *
 * `freeFlightControls.moveForward` and `zoomButtons.zoomIn` *are* ours despite the
 * neighbourhood: upstream's file carries `freeFlightControls.title`, `.invertMouseY` and
 * `.mouseSensitivity` and stops there, so the movement labels this app added are its own.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CHROME_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Render progress                                                   */
    /* ---------------------------------------------------------------- */

    /*
     * Two estimates that must never be confused for one another, because they fail in
     * different directions: the engine's own number knows what work is left, and the
     * tracker's is arithmetic on the rate so far and goes badly wrong on a stall. Every
     * level of both says which of the two it is.
     */
    "progress.eta.engine": {
        en: [
            "About {eta} left, the engine's own estimate",
            "About {eta} left, the engine's own estimate",
            "About {eta} left, which is the engine's own estimate",
            "About {eta} left. That is the engine's own estimate, not ours",
            "About {eta} left, and that is the engine's own estimate rather than our arithmetic, so take it up with the engine",
        ],
        yue: [
            "大約仲有 {eta}，係引擎自己嘅估算",
            "大約仲有 {eta}，係引擎自己嘅估算",
            "大約仲有 {eta}，呢個係引擎自己嘅估算",
            "大約仲有 {eta}。呢個係引擎自己嘅估算，唔係我哋計嘅",
            "大約仲有 {eta}，而且係引擎自己嘅估算，唔係我哋度出嚟，唔準嘅話搵引擎理論",
        ],
    },
    "progress.eta.tracker": {
        en: [
            "About {eta} left, estimated from the rate so far",
            "About {eta} left, estimated from the rate so far",
            "About {eta} left, estimated from the rate so far rather than reported by the engine",
            "About {eta} left, worked out from the rate so far. The engine did not say, so this is arithmetic",
            "About {eta} left, worked out from the rate so far. The engine never said, so this is honest arithmetic and nothing more",
        ],
        yue: [
            "大約仲有 {eta}，係按住到目前為止嘅速度估出嚟",
            "大約仲有 {eta}，係按住到目前為止嘅速度估出嚟",
            "大約仲有 {eta}，係按到目前為止嘅速度估出嚟，唔係引擎報俾我哋知",
            "大約仲有 {eta}，用到目前為止嘅速度計出嚟。引擎冇講，所以呢個係計出嚟嘅",
            "大約仲有 {eta}，用到目前為止嘅速度計出嚟。引擎由頭到尾冇出過聲，所以呢條數係老實計出嚟，冇第二樣",
        ],
    },
    "progress.shard.unknown": {
        en: [
            "Finished, in a state this app does not recognise",
            "Finished, in a state this app does not recognise",
            "Finished, in a state this app does not recognise at all",
            "Finished, in a state this app does not recognise, so it is not being called a success",
            "Finished, in a state this app does not recognise. It is not being called a success, because nobody here knows what it was",
        ],
        yue: [
            "已完成，但係處於一個呢個程式唔認得嘅狀態",
            "已完成，但係處於一個呢個程式唔認得嘅狀態",
            "已完成，不過個狀態呢個程式完全唔認得",
            "已完成，但個狀態呢個程式唔認得，所以唔會當佢成功",
            "已完成，但個狀態呢個程式唔認得。呢度唔會當佢成功，因為根本冇人知佢係咩",
        ],
    },
    "progress.stalled": {
        en: [
            "Nothing has arrived for {since}",
            "Nothing has arrived for {since}",
            "Nothing has arrived for {since} now",
            "Nothing at all has arrived for {since}",
            "Not one byte has arrived for {since}",
        ],
        yue: [
            "已經 {since} 冇收到任何嘢",
            "已經 {since} 冇收到任何嘢",
            "到而家已經 {since} 冇收到任何嘢",
            "足足 {since} 一啲嘢都冇收到",
            "足足 {since} 連一個位元組都冇收到",
        ],
    },
    /*
     * The one place a playful level is genuinely tempted to pick a side. A stall is
     * ambiguous by nature, and both halves of the ambiguity survive every level: it may be
     * working on something it does not report, and it may be stuck. Rounding that to
     * "it is stuck" invents a failure; rounding it to "it is fine" hides one.
     */
    "progress.stalledLine": {
        en: [
            "Nothing has arrived for {since}. The render may still be working on something it does not report, or it may be stuck.",
            "Nothing has arrived for {since}. The render may still be working on something it does not report, or it may be stuck.",
            "Nothing has arrived for {since}. The render may still be busy with something it does not report, or it may be stuck.",
            "Nothing has arrived for {since}. The render may still be head down in something it never reports, or it may be stuck. Both look like this.",
            "Nothing has arrived for {since}. The render may still be head down in something it never bothers to report, or it may be stuck, and from out here the two look identical.",
        ],
        yue: [
            "已經 {since} 冇收到任何嘢。算圖可能仲喺度做緊一啲佢唔會report嘅嘢，亦可能已經卡住咗。",
            "已經 {since} 冇收到任何嘢。算圖可能仲喺度做緊一啲佢唔會report嘅嘢，亦可能已經卡住咗。",
            "已經 {since} 冇收到任何嘢。算圖可能仲忙緊一啲佢唔會report嘅嘢，亦可能已經卡住咗。",
            "已經 {since} 冇收到任何嘢。算圖可能仲埋頭做緊一啲佢從來唔report嘅嘢，亦可能已經卡住咗。兩種情況睇落一模一樣。",
            "已經 {since} 冇收到任何嘢。算圖可能埋頭做緊一啲佢懶得report嘅嘢，亦可能已經卡住咗，而喺出面睇，呢兩樣係一模一樣。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The notification centre                                           */
    /* ---------------------------------------------------------------- */

    "notices.centre.summary": {
        en: [
            "Showing {shown} of {total} notifications.",
            "Showing {shown} of {total} notifications.",
            "Showing {shown} of the {total} notifications recorded.",
            "{shown} of {total} notifications on screen.",
            "{shown} of {total} notifications on screen. The rest are filtered out, not lost.",
        ],
        yue: [
            "顯示緊 {total} 個通知入面嘅 {shown} 個。",
            "顯示緊 {total} 個通知入面嘅 {shown} 個。",
            "喺記錄低嘅 {total} 個通知入面，顯示緊 {shown} 個。",
            "畫面上有 {total} 個通知入面嘅 {shown} 個。",
            "畫面上有 {total} 個通知入面嘅 {shown} 個。其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    "notices.centre.copied": {
        en: [
            "Copied as Markdown.",
            "Copied as Markdown.",
            "Copied to the clipboard as Markdown.",
            "Copied to the clipboard, as Markdown.",
            "Copied to the clipboard as Markdown, ready to paste somewhere it will render.",
        ],
        yue: [
            "已經以 Markdown 格式複製。",
            "已經以 Markdown 格式複製。",
            "已經以 Markdown 格式複製到剪貼簿。",
            "已經複製到剪貼簿，用 Markdown 格式。",
            "已經以 Markdown 格式複製到剪貼簿，可以擺去啲識render嘅地方。",
        ],
    },
    "notices.centre.openLabel": {
        en: [
            "Notification centre. {total} recorded, {unread} new.",
            "Notification centre. {total} recorded, {unread} new.",
            "Notification centre. {total} recorded, of which {unread} are new.",
            "Notification centre: {total} recorded, {unread} of them new.",
            "Notification centre: {total} recorded and {unread} of them still new.",
        ],
        yue: [
            "通知中心。記錄咗 {total} 個，{unread} 個係新嘅。",
            "通知中心。記錄咗 {total} 個，{unread} 個係新嘅。",
            "通知中心。記錄咗 {total} 個，其中 {unread} 個係新嘅。",
            "通知中心：記錄咗 {total} 個，{unread} 個係新嘅。",
            "通知中心：記錄咗 {total} 個，仲有 {unread} 個未睇過。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Handing a restore over to Downloads                               */
    /* ---------------------------------------------------------------- */

    /*
     * A cross-screen handoff, so it has to name the asset, the repository it is coming
     * from, and the one guarantee that makes downloading a backup safe at all: every part
     * is checked against its published digest before a byte is written. That last clause is
     * a security fact and stays in all ten strings.
     */
    "backup.restoreHandoff": {
        en: [
            "Downloads is open. Fetch {asset} from {repo} there: every part is checked against its published digest before anything is written.",
            "Downloads is open. Fetch {asset} from {repo} there: every part is checked against its published digest before anything is written.",
            "Downloads is open. Fetch {asset} from {repo} there. Every part is checked against its published digest before anything is written.",
            "Downloads is open, so fetch {asset} from {repo} over there. Every part is checked against its published digest before anything is written.",
            "Downloads is open, so go and fetch {asset} from {repo} over there. Every part is checked against its published digest before a single byte is written.",
        ],
        yue: [
            "下載頁面已經開咗。喺嗰邊由 {repo} 攞 {asset}：每一部分寫入之前都會同已公佈嘅digest對過。",
            "下載頁面已經開咗。喺嗰邊由 {repo} 攞 {asset}：每一部分寫入之前都會同已公佈嘅digest對過。",
            "下載頁面已經開咗。喺嗰邊由 {repo} 攞 {asset}。每一部分寫入之前都會同已公佈嘅digest對過。",
            "下載頁面已經開咗，去嗰邊由 {repo} 攞 {asset} 啦。每一部分寫入之前都會同已公佈嘅digest對過。",
            "下載頁面已經開咗，去嗰邊由 {repo} 攞 {asset} 啦。每一部分喺寫入之前都會同已公佈嘅digest對過，一個位元組都唔會例外。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The EULA reader                                                   */
    /* ---------------------------------------------------------------- */

    /*
     * A licence reader has one obligation above being pleasant: never to imply that it has
     * edited, summarised or reordered the document. "In the order Mojang's document has
     * them" and "Nothing has been hidden" are load-bearing sentences, not filler, and they
     * survive level 5 intact.
     */
    "eula.section.label": {
        en: [
            "{label}. Section {position} of {total} of Mojang's document.",
            "{label}. Section {position} of {total} of Mojang's document.",
            "{label}. Section {position} of {total} of Mojang's document.",
            "{label}. That is section {position} of {total} of Mojang's document.",
            "{label}. That is section {position} of {total} of Mojang's document, reproduced rather than summarised.",
        ],
        yue: [
            "{label}。Mojang 份文件第 {position} 節，共 {total} 節。",
            "{label}。Mojang 份文件第 {position} 節，共 {total} 節。",
            "{label}。呢個係 Mojang 份文件嘅第 {position} 節，總共 {total} 節。",
            "{label}。即係 Mojang 份文件第 {position} 節，總共 {total} 節。",
            "{label}。即係 Mojang 份文件第 {position} 節，總共 {total} 節，原文照登，冇撮要過。",
        ],
    },
    "eula.section.where": {
        en: [
            "Section {position} of {total}, in the order Mojang's document has them.",
            "Section {position} of {total}, in the order Mojang's document has them.",
            "Section {position} of {total}, in the order Mojang's document puts them.",
            "Section {position} of {total}, kept in the order Mojang's document puts them.",
            "Section {position} of {total}, kept in the order Mojang's document puts them, because reordering a licence is not this app's job.",
        ],
        yue: [
            "第 {position} 節，共 {total} 節，次序同 Mojang 份文件一樣。",
            "第 {position} 節，共 {total} 節，次序同 Mojang 份文件一樣。",
            "第 {position} 節，共 {total} 節，次序照 Mojang 份文件嘅排法。",
            "第 {position} 節，共 {total} 節，次序完全照 Mojang 份文件嘅排法。",
            "第 {position} 節，共 {total} 節，次序完全照 Mojang 份文件嘅排法，因為執人哋份授權合約嘅次序唔係呢個程式嘅工作。",
        ],
    },
    "eula.search.noneHere": {
        en: [
            "No match in this section. Nothing has been hidden.",
            "No match in this section. Nothing has been hidden.",
            "No match in this section. Nothing has been hidden from you.",
            "Nothing matches in this section. Nothing has been hidden either; the text is all still here.",
            "Nothing matches in this section. Nothing has been hidden either, so the text is all still there, unmatched and unbothered.",
        ],
        yue: [
            "呢一節冇符合嘅內容。冇任何嘢被隱藏。",
            "呢一節冇符合嘅內容。冇任何嘢被隱藏。",
            "呢一節搵唔到符合嘅內容。亦都冇任何嘢被隱藏。",
            "呢一節搵唔到符合嘅內容。亦都冇任何嘢被隱藏，啲字全部仲喺度。",
            "呢一節搵唔到符合嘅內容。亦都冇任何嘢被隱藏，啲字全部仲好地地喺度，冇人搵到佢咋。",
        ],
    },
    "eula.search.hereCount": {
        en: [
            "{n} matches highlighted in this section.",
            "{n} matches highlighted in this section.",
            "{n} matches are highlighted in this section.",
            "{n} matches highlighted in this section, and nothing removed.",
            "{n} matches highlighted in this section, with nothing removed and nothing rearranged.",
        ],
        yue: [
            "呢一節有 {n} 個符合嘅地方標示咗。",
            "呢一節有 {n} 個符合嘅地方標示咗。",
            "呢一節入面有 {n} 個符合嘅地方已經標示出嚟。",
            "呢一節標示咗 {n} 個符合嘅地方，冇刪任何嘢。",
            "呢一節標示咗 {n} 個符合嘅地方，冇刪過任何嘢，亦都冇調過次序。",
        ],
    },
    "eula.allTabsClosed": {
        en: [
            "Every section tab is closed. The document is unchanged; open one from the tab strip's plus button.",
            "Every section tab is closed. The document is unchanged; open one from the tab strip's plus button.",
            "Every section tab is closed. The document itself is unchanged; open a section again from the tab strip's plus button.",
            "Every section tab is closed. Closing a tab leaves the document unchanged; open a section again from the tab strip's plus button.",
            "Every section tab is closed, which is a statement about the tabs and not about the licence. The document is unchanged, word for word; open a section again from the tab strip's plus button.",
        ],
        yue: [
            "所有章節分頁都閂晒。份文件冇任何改動；喺分頁列嘅加號掣可以再開返。",
            "所有章節分頁都閂晒。份文件冇任何改動；喺分頁列嘅加號掣可以再開返。",
            "所有章節分頁都閂晒。份文件本身冇任何改動；喺分頁列嘅加號掣可以再開返一節。",
            "所有章節分頁都閂晒。閂分頁唔會令份文件有任何改動；喺分頁列嘅加號掣可以再開返一節。",
            "所有章節分頁都閂晒，呢句講嘅係啲分頁，唔係份授權合約。份文件一個字都冇改動；喺分頁列嘅加號掣可以再開返一節。",
        ],
    },
    /*
     * The two halves of one notice, raised together when a bulk close finishes in the EULA
     * reader. They are separate keys because `tabs.close.done` is the generic tab-strip
     * message and the second sentence is the licence reader's own reassurance: closing a
     * tab labelled "What you may not do" genuinely looks like it removed something. That
     * reassurance is the whole reason the second key exists, so no level may drop it.
     */
    "tabs.close.done": {
        en: [
            "Closed {closed} tabs.",
            "Closed {closed} tabs.",
            "Closed {closed} tabs.",
            "{closed} tabs closed.",
            "{closed} tabs closed, and none of them put up a fight.",
        ],
        yue: [
            "閂咗 {closed} 個分頁。",
            "閂咗 {closed} 個分頁。",
            "已經閂咗 {closed} 個分頁。",
            "{closed} 個分頁閂咗。",
            "{closed} 個分頁閂晒，一個都冇反抗。",
        ],
    },
    "eula.close.documentIntact": {
        en: [
            "The document is unchanged; only these ways into it were closed.",
            "The document is unchanged; only these ways into it were closed.",
            "The document itself is unchanged; only these ways into it were closed.",
            "The document itself is unchanged. Only these ways into it were closed, not any part of it.",
            "The document itself is unchanged, every word of it. Only these ways into it were closed, which is a statement about tabs and not about your licence.",
        ],
        yue: [
            "份文件冇任何改動；閂咗嘅只係入去嘅途徑。",
            "份文件冇任何改動；閂咗嘅只係入去嘅途徑。",
            "份文件本身冇任何改動；閂咗嘅只係入去嘅途徑。",
            "份文件本身冇任何改動。閂咗嘅只係入去嘅途徑，唔係文件嘅任何部分。",
            "份文件本身冇任何改動，一隻字都冇少。閂咗嘅只係入去嘅途徑，呢句講嘅係分頁，唔係你份授權合約。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CHROME_FIXED = {
    /* The tab strip's page names. */
    "tabs.page.map": { en: "Map", yue: "地圖" },
    "tabs.page.world": { en: "Make a map", yue: "整張地圖" },
    "tabs.page.projects": { en: "Projects", yue: "專案" },
    "tabs.page.ciRender": { en: "GitHub runners", yue: "GitHub 執行器" },
    "tabs.page.servers": { en: "Maps and servers", yue: "地圖同伺服器" },
    "tabs.page.backups": { en: "Backups", yue: "備份" },
    "tabs.page.pages": { en: "Publish to Pages", yue: "發佈到 Pages" },
    "tabs.group.newName": { en: "New group", yue: "新群組" },

    "world.rendered": { en: "Rendered map", yue: "算好嘅地圖" },
    "config.title": { en: "Server configuration", yue: "伺服器設定" },
    "appearance.target.app.titleBar": { en: "The window title bar", yue: "視窗標題列" },
    "appearance.target.app.tabBar": { en: "The tab bar", yue: "分頁列" },
    /*
     * The map viewer's own control bar, named here rather than in a controlbar module
     * because it is the only key on that whole strip this catalogue is allowed to answer:
     * every other string there -- maps.title, markers.tooltip, compass.tooltip and the rest
     * -- belongs to upstream's viewer locales. See the header note above.
     */
    "appearance.target.controlbar.bar": { en: "The map control bar", yue: "地圖控制列" },

    /* The custom title bar's window buttons. */
    "window.minimize": { en: "Minimize", yue: "縮到最細" },
    "window.restore": { en: "Restore", yue: "還原" },
    "window.maximize": { en: "Maximize", yue: "放到最大" },
    "window.close": { en: "Close", yue: "閂咗佢" },

    /* Movement labels this app added beside upstream's free-flight settings. */
    "freeFlightControls.moveForward": { en: "Move forward", yue: "向前飛" },
    "freeFlightControls.moveBackward": { en: "Move backward", yue: "向後飛" },
    "freeFlightControls.height": { en: "Height", yue: "高度" },
    "freeFlightControls.moveUp": { en: "Move up", yue: "飛高啲" },
    "freeFlightControls.moveDown": { en: "Move down", yue: "飛低啲" },
    "zoomButtons.zoomIn": { en: "Zoom in", yue: "放大" },
    "zoomButtons.zoomOut": { en: "Zoom out", yue: "縮細" },

    /* Render progress readout. */
    "progress.rate": { en: "{size}/s", yue: "{size}/秒" },
    "progress.transfer.of": { en: "{done} of {total}", yue: "{total} 之中嘅 {done}" },
    "progress.transfer.at": { en: "{moved} at {rate}", yue: "{moved}，速度 {rate}" },
    "progress.unknownSize": { en: "size unknown", yue: "大細未知" },
    "progress.shard.queued": { en: "Queued", yue: "排緊隊" },
    "progress.shard.running": { en: "Running", yue: "行緊" },
    "progress.shard.succeeded": { en: "Finished", yue: "完成" },
    "progress.shard.failed": { en: "Failed", yue: "失敗" },
    "progress.shard.cancelled": { en: "Cancelled", yue: "取消咗" },
    "progress.shard.skipped": { en: "Skipped", yue: "跳過咗" },
    "progress.region": { en: "Render progress in detail", yue: "算圖進度詳情" },
    "progress.elapsed": { en: "Running for", yue: "已經行咗" },
    "progress.sinceEvent": { en: "Last heard from", yue: "最後一次有消息" },
    "progress.sinceProgress": { en: "Last moved", yue: "最後一次有進展" },
    "progress.shards": { en: "Jobs", yue: "工作" },
    "progress.shardLink": { en: "Open {name}", yue: "開 {name}" },

    /* Notification centre. */
    "notices.centre.searchHint": {
        en: "Message, detail, level or timestamp",
        yue: "訊息、詳情、等級或者時間",
    },
    "notices.centre.levelChip": { en: "{level} ({count})", yue: "{level}（{count}）" },
    /*
     * The toggle for the collapsible row holding the date range and the level chips. Starts
     * collapsed, the same as `HistoryPanel.vue`'s own filter row, so the badge beside it is
     * what keeps a collapsed row from hiding an active filter silently.
     */
    "notices.centre.filters": { en: "Filters", yue: "篩選" },
    "notices.centre.clearFilters": { en: "Clear every filter", yue: "清走所有篩選" },
} as const satisfies Record<string, FixedString>;

export const CHROME_FACTS = {
    // Which of the two estimates this is, because they fail differently.
    "progress.eta.engine": { en: ["{eta}", "engine"], yue: ["{eta}", "引擎"] },
    "progress.eta.tracker": { en: ["{eta}", "rate so far"], yue: ["{eta}", "速度"] },
    "progress.shard.unknown": {
        en: ["Finished", "does not recognise"],
        yue: ["已完成", "唔認得"],
    },
    "progress.stalled": { en: ["{since}"], yue: ["{since}"] },
    // Both halves of the ambiguity, so no level can round a stall up or down.
    "progress.stalledLine": {
        en: ["{since}", "may still be", "stuck"],
        yue: ["{since}", "可能", "卡住咗"],
    },

    "notices.centre.summary": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "notices.centre.copied": { en: ["Markdown"], yue: ["Markdown"] },
    "notices.centre.openLabel": { en: ["{total}", "{unread}"], yue: ["{total}", "{unread}"] },

    // The digest check is the security fact that makes the handoff safe to accept.
    "backup.restoreHandoff": {
        en: ["{asset}", "{repo}", "digest"],
        yue: ["{asset}", "{repo}", "digest"],
    },

    // A licence reader must never imply it edited, reordered or hid anything.
    "eula.section.label": {
        en: ["{label}", "{position}", "{total}", "Mojang"],
        yue: ["{label}", "{position}", "{total}", "Mojang"],
    },
    "eula.section.where": {
        en: ["{position}", "{total}", "Mojang"],
        yue: ["{position}", "{total}", "Mojang"],
    },
    "eula.search.noneHere": { en: ["hidden"], yue: ["隱藏"] },
    "eula.search.hereCount": { en: ["{n}"], yue: ["{n}"] },
    "eula.allTabsClosed": { en: ["unchanged", "plus button"], yue: ["改動", "加號掣"] },
    "tabs.close.done": { en: ["{closed}"], yue: ["{closed}"] },
    "eula.close.documentIntact": { en: ["unchanged"], yue: ["改動"] },
} as const satisfies Record<
    keyof typeof CHROME_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
