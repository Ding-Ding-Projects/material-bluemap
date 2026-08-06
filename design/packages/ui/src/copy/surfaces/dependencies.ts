/**
 * The one-button winget/Chocolatey system-dependency installer:
 * `components/settings/DependencyInstallerPanel.vue` and the labels
 * `components/settings/dependencyModel.ts` resolves for it.
 *
 * `settings.dependencies.title`/`settings.dependencies.description` — the section's own
 * tab title and blurb — are deliberately not here. Every other settings *section* title
 * and description (`settings.java.title`, `settings.storage.title`, and the rest) is
 * written directly in `appCopy.ts` rather than in a surface module, because `appCopy.ts`
 * spreads the surface modules first so its own entries win any collision — an entry here
 * would be shadowed and would never render. Two definitions of one key, one of which
 * never renders, is exactly the kind of thing `settings.ts`'s own module doc warns about.
 *
 * ## What has to survive every funny level here
 *
 * The outcome messages are the ones this surface exists to get right: `installButton`
 * tells someone how many things are about to change, and `outcome.*` tells them what
 * actually happened afterwards. `FACTS` below pins the one thing each outcome message
 * must never lose regardless of level — an exit code, a package id, "cannot be
 * verified", "administrator permission" — because these are exactly the sentences the
 * brief asks to never turn into a generic apology.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const DEPENDENCIES_FIXED = {
    "dependencies.title": { en: "Install system dependencies", yue: "裝返啲系統嘢" },
    "dependencies.cardLabel": { en: "Install system dependencies", yue: "裝返啲系統嘢" },
    "dependencies.searchLabel": { en: "Search dependencies", yue: "搵返個依賴" },
    "dependencies.searchHint": { en: "a name, a route, or a status", yue: "個名、行邊條路，定係而家嘅狀態" },
    "dependencies.listLabel": { en: "System dependencies", yue: "系統依賴" },
    "dependencies.rowMenuLabel": { en: "What this dependency can do", yue: "呢個依賴可以做咩" },
    "dependencies.list.badPattern": {
        en: "The pattern is not valid, so nothing is listed.",
        yue: "個 pattern 唔啱，所以乜都冇列出嚟。",
    },
    "dependencies.list.chosenCount": { en: "{chosen} selected", yue: "揀咗 {chosen} 個" },
    "dependencies.list.searchSummary": { en: "Showing {shown} of {total}.", yue: "顯示緊 {total} 個入面嘅 {shown} 個。" },
    "dependencies.noMatch": {
        en: "Nothing here matches that search. Clearing it brings the whole list back.",
        yue: "冇嘢啱呢個搜尋。清咗佢個列表就會返晒嚟。",
    },
    "dependencies.bulkLabel": { en: "Actions on the chosen dependencies", yue: "已揀依賴嘅動作" },
    "dependencies.selectShown": { en: "Select the {shown} that need installing", yue: "揀晒要裝嗰 {shown} 個" },
    "dependencies.selectInverse": { en: "Invert", yue: "反選" },
    "dependencies.selectNone": { en: "Clear the selection", yue: "清空揀選" },
    "dependencies.choose": { en: "Choose {name}", yue: "揀 {name}" },
    "dependencies.menuChoose": { en: "Add it to the selection", yue: "加入揀選" },
    "dependencies.menuUnchoose": { en: "Take it out of the selection", yue: "由揀選度攞走" },
    "dependencies.installButton": { en: "Install {chosen} selected", yue: "裝返揀咗嘅 {chosen} 個" },
    "dependencies.cancelButton": { en: "Cancel", yue: "取消" },
    "dependencies.cancelling": { en: "Cancelling…", yue: "取消緊……" },
    "dependencies.progressLabel": { en: "Install progress for {name}", yue: "{name} 嘅安裝進度" },
    "dependencies.row.already": { en: "Already installed", yue: "已經裝咗" },
    "dependencies.chip.already": { en: "Already installed", yue: "已經裝咗" },
    "dependencies.chip.alreadyVersion": { en: "Already installed ({version})", yue: "已經裝咗（{version}）" },
    "dependencies.chip.elevationRequired": {
        en: "Needs administrator permission",
        yue: "要攞管理員權限",
    },
    "dependencies.chip.elevationPossible": {
        en: "May need administrator permission",
        yue: "可能要攞管理員權限",
    },
    "dependencies.chip.elevationUnknown": {
        en: "Administrator permission: depends on this machine",
        yue: "使唔使管理員權限：睇返呢部機點設定",
    },
    "dependencies.export.format": { en: "Export log as", yue: "匯出紀錄做" },
    "dependencies.export.button": { en: "Export the install log", yue: "匯出安裝紀錄" },
    "dependencies.export.json": { en: "JSON, every event, re-readable", yue: "JSON，每個事件都齊，讀得返" },
    "dependencies.export.markdown": { en: "Markdown, for pasting", yue: "Markdown，方便貼出去" },
    "dependencies.export.text": { en: "Plain text log", yue: "純文字紀錄" },
    "dependencies.route.winget": { en: "winget: {id}", yue: "winget：{id}" },
    "dependencies.route.chocolatey": { en: "Chocolatey: {id}", yue: "Chocolatey：{id}" },
    "dependencies.route.unsupported": { en: "Not installable from here", yue: "呢度裝唔到" },
    "dependencies.route.unavailable": { en: "No package manager available", yue: "冇packagemanager可以用" },
    "dependencies.stage.queued": { en: "Waiting to start", yue: "等緊開始" },
    "dependencies.stage.checkingExisting": {
        en: "Checking whether it is already installed",
        yue: "睇緊裝咗未",
    },
    "dependencies.stage.elevationNotice": {
        en: "Windows may ask for administrator permission now",
        yue: "而家Windows可能會問你攞管理員權限",
    },
    "dependencies.stage.resolving": { en: "Resolving", yue: "搵緊" },
    "dependencies.stage.downloading": { en: "Downloading", yue: "下載緊" },
    "dependencies.stage.installing": { en: "Installing", yue: "安裝緊" },
    "dependencies.stage.verifying": { en: "Confirming it actually runs", yue: "確認緊真係用得" },
    "dependencies.stage.done": { en: "Done", yue: "搞掂" },
    "dependencies.stage.skipped": { en: "Skipped", yue: "跳過咗" },
    "dependencies.stage.failed": { en: "Failed", yue: "失敗咗" },
    "dependencies.stage.cancelled": { en: "Cancelled", yue: "取消咗" },
} as const satisfies Record<string, FixedString>;

export const DEPENDENCIES_VOICED = {
    "dependencies.blurb": {
        en: [
            "Git, the GitHub CLI, Docker Desktop and rsync are real system tools, installed through Windows's own package managers, winget or Chocolatey, because a private per-app copy would not put them on your PATH or let other software use them. A real installer sometimes means Windows asks for administrator permission, and this section always says so before the button is pressed, never after.",
            "Git, the GitHub CLI, Docker Desktop and rsync are real system tools, installed through Windows's own package managers, winget or Chocolatey, because a private per-app copy would not put them on your PATH or let other software use them. A real installer sometimes means Windows asks for administrator permission, and this section always says so before the button is pressed, never after.",
            "Git, the GitHub CLI, Docker Desktop and rsync are real system tools this time, fetched through Windows's own package managers, winget or Chocolatey, rather than a private copy that would not put them on your PATH or let anything else use them. A real installer can mean Windows asks for administrator permission, and that is always said here before the button is pressed, never sprung on you afterwards.",
            "Git, the GitHub CLI, Docker Desktop and rsync are the real deal: proper system tools, fetched through Windows's own package managers, winget or Chocolatey, rather than a quiet private copy that no other program could ever borrow. Sometimes that means Windows wants a word about administrator permission, and this section always has that conversation with you before the button is pressed, never as an ambush afterwards.",
            "Git, the GitHub CLI, Docker Desktop and rsync do not fit in a private little box for this app alone; they are proper system tools, so they arrive the proper way, through Windows's own winget or Chocolatey. That sometimes means Windows leans in to ask about administrator permission, and this section always has that awkward conversation with you before the button is pressed, never as a jump-scare halfway through.",
        ],
        yue: [
            "Git、GitHub CLI、Docker Desktop 同 rsync 都係真.系統工具，靠 Windows 自己嘅套件管理員（winget 或者 Chocolatey）裝返嚟，因為私家幫呢個app裝一份唔會擺得上你部機嘅PATH，其他軟件都用唔到。真.安裝程式有時會令Windows問你攞管理員權限，呢度一定喺撳掣之前講清楚，唔會事後先話你知。",
            "Git、GitHub CLI、Docker Desktop 同 rsync 都係真.系統工具，靠 Windows 自己嘅套件管理員（winget 或者 Chocolatey）裝返嚟，因為私家幫呢個app裝一份唔會擺得上你部機嘅PATH，其他軟件都用唔到。真.安裝程式有時會令Windows問你攞管理員權限，呢度一定喺撳掣之前講清楚，唔會事後先話你知。",
            "Git、GitHub CLI、Docker Desktop 同 rsync 呢次係真.系統工具，靠 Windows 自己套winget或者Chocolatey裝返嚟，唔係私家版本咁冇得畀第啲軟件用。真.安裝程式有時會叫Windows問你攞管理員權限，呢個一定喺撳掣之前講咗先，唔會事後先劈頭嚇你一嚇。",
            "Git、GitHub CLI、Docker Desktop 同 rsync 係正正經經嘅系統工具，冇得私家收埋，所以就用返Windows自己嘅winget或者Chocolatey裝，正正經經噉裝。有時噉樣裝就要同Windows傾兩句攞管理員權限，而呢段對話一定喺撳掣之前就傾晒，唔會事後先彈出嚟嚇你一跳。",
            "Git、GitHub CLI、Docker Desktop 同 rsync 唔係擺得入呢個app私家儲物櫃嘅嘢，佢哋係正經系統工具，梗係要行正路，用返Windows自己嘅winget或者Chocolatey嚟裝。噉樣有時會惹到Windows埋嚟問你攞管理員權限，而呢段尷尬對話一定喺撳掣之前傾完，唔會撳完一半先彈出嚟嚇你標命。",
        ],
    },
    "dependencies.unsupported": {
        en: [
            "This build cannot install system dependencies from here. The desktop app owns winget and Chocolatey; a browser tab has no main process to run them with.",
            "This build cannot install system dependencies from here. The desktop app owns winget and Chocolatey; a browser tab has no main process to run them with.",
            "This build cannot install system dependencies from here. Only the desktop app can run winget or Chocolatey; a browser tab has no main process to hand either of them to.",
            "This build cannot install system dependencies from here, and it is not going to pretend otherwise. winget and Chocolatey belong to the desktop app's own main process, and a browser tab simply does not have one to ask.",
            "No installing from here in this build, sorry: winget and Chocolatey both live in the desktop app's own main process, and a browser tab has nothing of the sort to hand them the job.",
        ],
        yue: [
            "呢個build喺呢度裝唔到系統依賴。winget同Chocolatey係桌面app先有得用嘅；瀏覽器分頁冇main process可以攞嚟用。",
            "呢個build喺呢度裝唔到系統依賴。winget同Chocolatey係桌面app先有得用嘅；瀏覽器分頁冇main process可以攞嚟用。",
            "呢個build喺呢度真係裝唔到系統依賴。得桌面app先叫得動winget或者Chocolatey；瀏覽器分頁根本冇main process可以撳畀邊個做。",
            "呢個build喺呢度裝唔到系統依賴，唔會扮嘢話得。winget同Chocolatey本身就係桌面app main process嘅嘢，瀏覽器分頁淨係冇呢樣嘢問得。",
            "唔好意思，呢個build喺呢度真係裝唔到，winget同Chocolatey都住喺桌面app自己嘅main process度，瀏覽器分頁邊有咁嘅嘢可以攞去問。",
        ],
    },
    "dependencies.elevationWarning.title": {
        en: [
            "{count} of these will ask Windows for administrator permission",
            "{count} of these will ask Windows for administrator permission",
            "{count} of these will ask Windows for administrator permission",
            "{count} of these are about to have a little chat with Windows about administrator permission",
            "{count} of these are about to march up and ask Windows, politely, for administrator permission",
        ],
        yue: [
            "有 {count} 個會問Windows攞管理員權限",
            "有 {count} 個會問Windows攞管理員權限",
            "有 {count} 個真係會問Windows攞管理員權限",
            "有 {count} 個就快同Windows傾兩句，講攞管理員權限嗰單嘢",
            "有 {count} 個就快行出嚟，好聲好氣咁問Windows攞個管理員權限",
        ],
    },
    "dependencies.previewFailed": {
        en: [
            "Could not read the current state: {message}",
            "Could not read the current state: {message}",
            "Could not read the current state: {message}",
            "Could not read the current state, and this is exactly what went wrong: {message}",
            "Could not get a straight answer about the current state; here is exactly what it said instead: {message}",
        ],
        yue: [
            "讀唔到而家嘅狀態：{message}",
            "讀唔到而家嘅狀態：{message}",
            "真係讀唔到而家嘅狀態：{message}",
            "讀唔到而家嘅狀態，實情係咁樣：{message}",
            "問極都問唔到而家嘅狀態，佢就係咁答：{message}",
        ],
    },
    "dependencies.outcome.installed": {
        en: [
            "Installed and verified: {output}",
            "Installed and verified: {output}",
            "Installed and verified: {output}",
            "Installed, and actually run to prove it works: {output}",
            "Installed, and put through its paces to prove it genuinely works: {output}",
        ],
        yue: [
            "裝咗，仲驗證咗真係得：{output}",
            "裝咗，仲驗證咗真係得：{output}",
            "裝咗，仲真係開返嚟驗證過真係得：{output}",
            "裝咗，仲真係揸出嚟開過，證明真係用得：{output}",
            "裝咗，仲真係捉出嚟操練過一round，證明真係用得：{output}",
        ],
    },
    "dependencies.outcome.alreadyVerified": {
        en: [
            "Already installed and runs: {output}",
            "Already installed and runs: {output}",
            "Already installed, and it runs: {output}",
            "Already installed, and it still runs perfectly well: {output}",
            "Already installed, and it still runs like a dream: {output}",
        ],
        yue: [
            "已經裝咗，用得㗎：{output}",
            "已經裝咗，用得㗎：{output}",
            "已經裝咗，真係用得：{output}",
            "已經裝咗，仲一樣咁順用：{output}",
            "已經裝咗，仲用到猶如新機咁順：{output}",
        ],
    },
    "dependencies.outcome.alreadyUnverified": {
        en: [
            "Already installed, but running it did not look right.",
            "Already installed, but running it did not look right.",
            "Already installed, but running it did not look right.",
            "Already installed, but running it just now did not look right at all.",
            "Already installed, technically, but running it just now did not look right at all.",
        ],
        yue: [
            "已經裝咗，但係開返出嚟唔多對路。",
            "已經裝咗，但係開返出嚟唔多對路。",
            "已經裝咗，但係開返出嚟真係唔多對路。",
            "已經裝咗，但係啱啱開返出嚟就真係唔多對路。",
            "話就話已經裝咗，但係啱啱開返出嚟就真係唔多對路。",
        ],
    },
    "dependencies.outcome.declinedElevation": {
        en: [
            "Administrator permission was declined (exit code {code}). Nothing was installed.",
            "Administrator permission was declined (exit code {code}). Nothing was installed.",
            "Administrator permission was declined (exit code {code}). Nothing was installed.",
            "Administrator permission was declined (exit code {code}). Nothing was installed, and nothing else on this machine was touched either.",
            "Administrator permission was declined (exit code {code}), fair enough. Nothing was installed, and nothing else was touched.",
        ],
        yue: [
            "管理員權限俾人拒絕咗（exit code {code}）。冇裝到嘢。",
            "管理員權限俾人拒絕咗（exit code {code}）。冇裝到嘢。",
            "管理員權限俾人拒絕咗（exit code {code}）。冇裝到嘢。",
            "管理員權限俾人拒絕咗（exit code {code}）。冇裝到嘢，呢部機其他嘢都冇郁過。",
            "管理員權限俾人拒絕咗（exit code {code}），都有嘅。冇裝到嘢，呢部機其他嘢一樣冇郁過。",
        ],
    },
    "dependencies.outcome.notFound": {
        en: [
            "{manager} could not find the package {packageId}.",
            "{manager} could not find the package {packageId}.",
            "{manager} could not find the package {packageId}.",
            "{manager} looked, and could not find a package called {packageId} anywhere.",
            "{manager} had a good look and came up completely empty for a package called {packageId}.",
        ],
        yue: [
            "{manager} 搵唔到個叫 {packageId} 嘅package。",
            "{manager} 搵唔到個叫 {packageId} 嘅package。",
            "{manager} 真係搵唔到個叫 {packageId} 嘅package。",
            "{manager} 搵過晒都搵唔到個叫 {packageId} 嘅package。",
            "{manager} 搵到爆晒都完全搵唔到個叫 {packageId} 嘅package。",
        ],
    },
    "dependencies.outcome.network": {
        en: [
            "A network problem stopped the install: {message}",
            "A network problem stopped the install: {message}",
            "A network problem stopped the install: {message}",
            "The install was stopped in its tracks by a network problem: {message}",
            "The install got stopped dead by a network problem, plain and simple: {message}",
        ],
        yue: [
            "網絡問題整到裝唔到：{message}",
            "網絡問題整到裝唔到：{message}",
            "真係網絡問題整到裝唔到：{message}",
            "個安裝俾網絡問題喺半路截停咗：{message}",
            "個安裝俾網絡問題正正經經截咗個尾：{message}",
        ],
    },
    "dependencies.outcome.verificationFailed": {
        en: [
            "The package manager reported success (exit code {code}), but the tool did not run right afterwards: {message}",
            "The package manager reported success (exit code {code}), but the tool did not run right afterwards: {message}",
            "The package manager reported success (exit code {code}), but the tool did not run right afterwards: {message}",
            "The package manager said it succeeded (exit code {code}), but actually running the tool afterwards did not look right: {message}",
            "The package manager gave itself a pat on the back (exit code {code}), but actually running the tool afterwards told a different story: {message}",
        ],
        yue: [
            "package manager話成功（exit code {code}），但係之後真係開返出嚟就唔多對路：{message}",
            "package manager話成功（exit code {code}），但係之後真係開返出嚟就唔多對路：{message}",
            "package manager話成功（exit code {code}），但係之後真係開返出嚟就真係唔多對路：{message}",
            "package manager自己話成功（exit code {code}），但係之後真係開返出嚟就唔多啱樣：{message}",
            "package manager自己攞獎攞到（exit code {code}），但係之後真係開返出嚟就完全唔係嗰回事：{message}",
        ],
    },
    "dependencies.outcome.cancelled": {
        en: [
            "Cancelled before this finished.",
            "Cancelled before this finished.",
            "Cancelled before this finished.",
            "Cancelled partway through, before this finished.",
            "Cancelled partway through, before this finished, no drama, just a stop mid-step.",
        ],
        yue: [
            "喺未搞掂之前取消咗。",
            "喺未搞掂之前取消咗。",
            "真係喺未搞掂之前取消咗。",
            "做到半路就取消咗，喺未搞掂之前叫停。",
            "做到一半就取消咗，喺未搞掂之前叫停，冇乜大件事，淨係中途停低咗。",
        ],
    },
    "dependencies.outcome.failed": {
        en: [
            "Failed (exit code {code}): {message}",
            "Failed (exit code {code}): {message}",
            "Failed (exit code {code}): {message}",
            "Failed (exit code {code}), and here is exactly what it said: {message}",
            "Failed flat out (exit code {code}), and here is exactly what it had to say for itself: {message}",
        ],
        yue: [
            "失敗咗（exit code {code}）：{message}",
            "失敗咗（exit code {code}）：{message}",
            "真係失敗咗（exit code {code}）：{message}",
            "失敗咗（exit code {code}），佢就係咁講：{message}",
            "實實在在失敗咗（exit code {code}），佢自己就係咁解畫：{message}",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const DEPENDENCIES_FACTS = {
    // The blurb's whole point is naming the real trade-off: real system tool, real
    // installer, sometimes a real administrator prompt, always disclosed first.
    "dependencies.blurb": {
        en: ["administrator permission", "before the button is pressed"],
        yue: ["管理員權限", "撳掣之前"],
    },
    "dependencies.unsupported": {
        en: ["winget", "Chocolatey"],
        yue: ["winget", "Chocolatey"],
    },
    "dependencies.elevationWarning.title": {
        en: ["{count}", "administrator permission"],
        yue: ["{count}", "管理員權限"],
    },
    "dependencies.previewFailed": {
        en: ["{message}"],
        yue: ["{message}"],
    },
    "dependencies.outcome.installed": {
        en: ["{output}"],
        yue: ["{output}"],
    },
    "dependencies.outcome.alreadyVerified": {
        en: ["{output}"],
        yue: ["{output}"],
    },
    // "did not look right" is the whole reason this outcome exists to be shown - a level
    // that softens it into a plain "installed" would hide a genuine verification failure.
    "dependencies.outcome.alreadyUnverified": {
        en: ["did not look right"],
        yue: ["唔多對路"],
    },
    "dependencies.outcome.declinedElevation": {
        en: ["{code}", "Nothing was installed"],
        yue: ["{code}", "冇裝到嘢"],
    },
    "dependencies.outcome.notFound": {
        en: ["{manager}", "{packageId}"],
        yue: ["{manager}", "{packageId}"],
    },
    "dependencies.outcome.network": {
        en: ["{message}"],
        yue: ["{message}"],
    },
    // The package manager's own claimed success has to survive every level beside the
    // real exit code and message - this is the "trust, but verify" outcome, and a
    // playful rewrite must not quietly drop the "but" part.
    "dependencies.outcome.verificationFailed": {
        en: ["{code}", "{message}"],
        yue: ["{code}", "{message}"],
    },
    "dependencies.outcome.failed": {
        en: ["{code}", "{message}"],
        yue: ["{code}", "{message}"],
    },
    // No number and no message to lose here, only the one fact that matters: it did not
    // finish. A level that turns "cancelled" into something that reads like success would
    // be the one true failure this row could have.
    "dependencies.outcome.cancelled": {
        en: ["before this finished"],
        yue: ["未搞掂"],
    },
} as const satisfies Record<keyof typeof DEPENDENCIES_VOICED, { en: readonly string[]; yue: readonly string[] }>;
