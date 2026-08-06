/**
 * "Renders in progress": every render this application knows about, on every route, in one
 * list - reachable regardless of which screen (if any) started it or is watching it.
 *
 * ## What actually needed fixing, and what this page adds on top of it
 *
 * The reported defect - navigate away and a render is lost - turned out to be the *view*
 * being lost, not the render: `main/render/orchestrator.ts` keeps every running render in a
 * `Map` that belongs to the main process, entirely independent of any window or component,
 * and a container render survives the whole application closing because Docker's daemon
 * owns its lifetime. `activeRenders.ts`'s own file header has the full account. This
 * catalogue is the copy for the page that makes that truth visible: a place that always
 * knows what is running, a tab label that carries a live count wherever the strip is drawn,
 * and a Home tile that leads to the same place.
 *
 * ## Voiced sparingly, and on purpose
 *
 * Most of this surface's strings are short labels - a state, a route, a button caption - and
 * stay `_FIXED` rather than five-level prose: "Running" does not get funnier at level 5, and
 * pretending otherwise would be decoration standing in for information on a list somebody is
 * scanning quickly. What *is* voiced is the handful of real sentences: the page's own
 * introduction, the three empty states (which distinguish "still checking" from "genuinely
 * nothing" - a distinction this page's whole contract rests on, so both stay exact at every
 * level), and the destructive bulk-cancel explanation `ConfigSuperConfirm` shows before its
 * slider can even move.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const RENDERSINPROGRESS_VOICED = {
    "rendersInProgress.blurb": {
        en: [
            "Every render this application knows about right now: on this computer, in a container, or on GitHub's runners - including one this app did not start this session.",
            "Every render this application knows about right now: on this computer, in a container, or on GitHub's runners - including one this app did not start this session.",
            "Every render this application knows about right now: on this computer, in a container, or on GitHub's runners - including one this app did not start this session.",
            "Every render this application currently knows about, wherever it is going: this computer, a container, or GitHub's runners - including one that was already going before this window opened.",
            "Every render this application currently knows about, wherever it is going: this computer, a container, or GitHub's runners - including the ones that were quietly getting on with it before this window ever opened.",
        ],
        yue: [
            "而家呢個應用程式知道嘅每一個 render：喺呢部機、喺個 container 入面，定係喺 GitHub 嘅機度 —— 包括呢個 session 唔係呢個 app 開始嘅嗰啲。",
            "而家呢個應用程式知道嘅每一個 render：喺呢部機、喺個 container 入面，定係喺 GitHub 嘅機度 —— 包括呢個 session 唔係呢個 app 開始嘅嗰啲。",
            "而家呢個應用程式知道嘅每一個 render：喺呢部機、喺個 container 入面，定係喺 GitHub 嘅機度 —— 包括呢個 session 唔係呢個 app 開始嘅嗰啲。",
            "而家呢個應用程式知道嘅每一個 render，唔理佢喺邊度算緊：呢部機、一個 container，定係 GitHub 嘅機 —— 包括啲喺呢個窗未開之前已經開始咗嘅。",
            "而家呢個應用程式知道嘅每一個 render，唔理佢喺邊度默默咁算緊：呢部機、一個 container，定係 GitHub 嘅機 —— 包括啲喺呢個窗未開之前，已經自己埋頭苦幹緊嘅。",
        ],
    },

    "rendersInProgress.empty.checking": {
        en: [
            "Checking every route for a render in progress...",
            "Checking every route for a render in progress...",
            "Checking every route for a render in progress...",
            "Still checking all three routes for anything in progress...",
            "Still checking all three routes for anything in progress - this is the checking state, not the empty one, so hold your horses...",
        ],
        yue: [
            "檢查緊三條路有冇 render 喺度算緊……",
            "檢查緊三條路有冇 render 喺度算緊……",
            "檢查緊三條路有冇 render 喺度算緊……",
            "仲喺度檢查緊三條路有冇嘢喺度做緊……",
            "仲喺度慢慢檢查緊三條路有冇嘢喺度做緊 —— 呢個係「查緊」，唔係「乜都冇」，唔好心急……",
        ],
    },
    "rendersInProgress.empty.none": {
        en: [
            "Nothing is rendering right now, on this computer, in a container, or on GitHub's runners.",
            "Nothing is rendering right now, on this computer, in a container, or on GitHub's runners.",
            "Nothing is rendering right now, on this computer, in a container, or on GitHub's runners.",
            "All three routes were checked, and nothing is rendering: not on this computer, not in a container, not on GitHub's runners.",
            "All three routes were checked properly, and it turns out nothing is rendering anywhere: not this computer, not a container, not GitHub's runners. A well-earned quiet moment.",
        ],
        yue: [
            "而家冇任何嘢喺度 render，呢部機、container，同 GitHub 嘅機都係咁。",
            "而家冇任何嘢喺度 render，呢部機、container，同 GitHub 嘅機都係咁。",
            "而家冇任何嘢喺度 render，呢部機、container，同 GitHub 嘅機都係咁。",
            "三條路都查清楚咗，而家真係冇任何嘢喺度 render：唔係呢部機、唔係 container、都唔係 GitHub 嘅機。",
            "三條路實實在在查晒，而家真係冇任何嘢喺度 render：唔係呢部機、唔係 container、都唔係 GitHub 嘅機。難得清靜。",
        ],
    },
    "rendersInProgress.empty.noMatch": {
        en: [
            "Nothing running matches this search.",
            "Nothing running matches this search.",
            "Nothing currently running matches this search.",
            "Nothing that is actually running matches this search - clear it, or try a different word.",
            "Not one of the renders currently going matches this search - clear it, or try a different word.",
        ],
        yue: [
            "冇任何一個喺度行緊嘅 render 啱呢個搜尋。",
            "冇任何一個喺度行緊嘅 render 啱呢個搜尋。",
            "而家冇任何一個喺度行緊嘅 render 啱呢個搜尋。",
            "而家冇任何一個真係喺度行緊嘅 render 啱到呢個搜尋 —— 清咗佢，或者試下第個字。",
            "而家喺度行緊嘅 render，一個都冇一個啱呢個搜尋 —— 清咗佢，或者換過個字試下。",
        ],
    },

    "rendersInProgress.bulk.cancelExplain": {
        en: [
            "This stops {count} renders. Every tile each one already finished stays on disk; nothing is deleted, and a stopped render can be carried on later.",
            "This stops {count} renders. Every tile each one already finished stays on disk; nothing is deleted, and a stopped render can be carried on later.",
            "This stops {count} renders. Every tile each one already finished stays on disk; nothing is deleted, and a stopped render can be carried on later.",
            "This stops {count} renders. Whatever each one has already drawn stays on disk untouched, and every one of them can be carried on again afterwards.",
            "This stops {count} renders in their tracks. Whatever each one has already drawn stays exactly where it is, untouched, and every one of them can be carried on again afterwards.",
        ],
        yue: [
            "呢個操作會停咗 {count} 個 render。每一個已經畫好嘅 tile 都仲喺個磁碟度，冇任何嘢會被刪除，停咗之後仲可以之後再繼續嘅。",
            "呢個操作會停咗 {count} 個 render。每一個已經畫好嘅 tile 都仲喺個磁碟度，冇任何嘢會被刪除，停咗之後仲可以之後再繼續嘅。",
            "呢個操作會停咗 {count} 個 render。每一個已經畫好嘅 tile 都仲喺個磁碟度，冇任何嘢會被刪除，停咗之後仲可以之後再繼續嘅。",
            "呢個操作會即刻停咗 {count} 個 render。每一個已經畫好嘅嘢都原封不動咁喺磁碟度，之後仲可以逐個再撿返嚟繼續。",
            "呢個操作會即刻煞停 {count} 個 render。每一個已經畫好嘅嘢，一格都唔會少咁留喺磁碟度，之後想繼續隨時可以逐個撿返嚟做。",
        ],
    },

    "rendersInProgress.homeTile": {
        en: [
            "Every render going on right now, on this computer, in a container or on GitHub's runners - including one this app did not start this session.",
            "Every render going on right now, on this computer, in a container or on GitHub's runners - including one this app did not start this session.",
            "Every render going on right now, on this computer, in a container or on GitHub's runners - including one this app did not start this session.",
            "Every render currently going, wherever it is running - and including the ones already going before this window opened.",
            "Every render currently going, wherever it is quietly getting on with it - and including the ones that were already at it before this window ever opened.",
        ],
        yue: [
            "而家所有正喺度 render 緊嘅嘢，呢部機、container，或者 GitHub 嘅機都算 —— 包括呢個 session 唔係呢個 app 開始嘅嗰啲。",
            "而家所有正喺度 render 緊嘅嘢，呢部機、container，或者 GitHub 嘅機都算 —— 包括呢個 session 唔係呢個 app 開始嘅嗰啲。",
            "而家所有正喺度 render 緊嘅嘢，呢部機、container，或者 GitHub 嘅機都算 —— 包括呢個 session 唔係呢個 app 開始嘅嗰啲。",
            "而家所有正喺度做緊嘅 render，唔理喺邊度做，都包括埋啲喺呢個窗未開之前已經開始咗嘅。",
            "而家所有正喺度默默做緊嘅 render，唔理喺邊度做，都包括埋啲喺呢個窗未開之前，已經自己埋頭苦幹緊嘅。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const RENDERSINPROGRESS_FIXED = {
    "rendersInProgress.title": { en: "Renders in progress", yue: "正在進行嘅 Render" },

    "rendersInProgress.search.label": { en: "Search renders", yue: "搜尋 render" },
    "rendersInProgress.search.placeholder": {
        en: "World, project, route, or state",
        yue: "世界、project、路線，或者狀態",
    },
    "rendersInProgress.search.summary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個",
    },

    "rendersInProgress.bulk.selectAll": {
        en: "Select all {count} shown",
        yue: "全選顯示緊嘅 {count} 個",
    },
    "rendersInProgress.bulk.clear": { en: "Clear selection", yue: "清空已選" },
    "rendersInProgress.bulk.selected": { en: "{count} selected", yue: "已選 {count} 個" },
    "rendersInProgress.bulk.cancelTitle": { en: "Stop selected renders", yue: "停止已選嘅 render" },
    "rendersInProgress.bulk.cancelConfirmLabel": {
        en: "Slide to stop the selected renders",
        yue: "拖曳去停止已選嘅 render",
    },
    "rendersInProgress.bulk.cancelButton": {
        en: "Stop {count} selected",
        yue: "停止已選嘅 {count} 個",
    },
    "rendersInProgress.bulk.cancelDone": {
        en: "Stopped {count} of {of}.",
        yue: "已經停咗 {of} 個入面嘅 {count} 個。",
    },

    "rendersInProgress.route.local": { en: "Local process", yue: "本機程序" },
    "rendersInProgress.route.docker": { en: "Container (Docker)", yue: "Container（Docker）" },
    "rendersInProgress.route.ci": { en: "GitHub's runners", yue: "GitHub 嘅機" },

    "rendersInProgress.state.starting": { en: "Starting", yue: "啟動緊" },
    "rendersInProgress.state.running": { en: "Running", yue: "行緊" },
    "rendersInProgress.state.finished": { en: "Finished", yue: "完成咗" },
    "rendersInProgress.state.failed": { en: "Failed", yue: "失敗咗" },
    "rendersInProgress.state.cancelled": { en: "Stopped", yue: "已停止" },
    "rendersInProgress.state.offer": { en: "Found, not attached", yue: "搵到，未接上" },

    "rendersInProgress.row.select": {
        en: "Select the render of {world}",
        yue: "揀選 {world} 嘅 render",
    },
    "rendersInProgress.row.reattach": { en: "Reattach", yue: "重新接上" },
    "rendersInProgress.row.openConsole": { en: "Open console", yue: "打開控制台" },
    "rendersInProgress.row.cancel": { en: "Stop", yue: "停止" },

    "tabs.page.renders": { en: "Renders", yue: "Render" },
    "tabs.page.rendersCounted": { en: "Renders ({count})", yue: "Render（{count}）" },
} as const satisfies Record<string, FixedString>;

export const RENDERSINPROGRESS_FACTS = {
    "rendersInProgress.blurb": {
        en: ["this computer", "a container", "GitHub's runners", "did not start this session"],
        yue: ["呢部機", "container", "GitHub", "唔係呢個 session 開始"],
    },
    "rendersInProgress.empty.checking": {
        en: ["Checking", "in progress"],
        yue: ["檢查緊", "算緊"],
    },
    "rendersInProgress.empty.none": {
        en: ["Nothing is rendering", "this computer", "a container", "GitHub's runners"],
        yue: ["冇任何嘢喺度 render", "呢部機", "container", "GitHub"],
    },
    "rendersInProgress.empty.noMatch": {
        en: ["Nothing", "running", "matches this search"],
        yue: ["冇", "行緊", "呢個搜尋"],
    },
    "rendersInProgress.bulk.cancelExplain": {
        en: ["{count}", "stays on disk", "nothing is deleted", "carried on later"],
        yue: ["{count}", "喺個磁碟度", "冇任何嘢會被刪除", "之後再繼續"],
    },
    "rendersInProgress.homeTile": {
        en: ["this computer", "a container", "GitHub's runners", "did not start this session"],
        yue: ["呢部機", "container", "GitHub", "唔係呢個 session 開始"],
    },
} as const satisfies Record<
    keyof typeof RENDERSINPROGRESS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
