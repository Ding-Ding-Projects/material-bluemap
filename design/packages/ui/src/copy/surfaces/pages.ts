/**
 * Publishing a rendered map to GitHub Pages: the phase readout, GitHub's own build status,
 * the `gh` sign-in check, the repository-visibility choice, and the notices raised when a
 * publish finishes, resumes, or is taken down again.
 *
 * `appCopy.ts` already carries this surface's long-form prose: the pitch, the caveats with
 * their two GitHub limits, the decompression note, the acknowledgement, the stop action and
 * the live-versus-built distinction. This module is the rest of the screen.
 *
 * ## The one distinction this whole surface is built around
 *
 * GitHub saying it built a site and the address actually answering are two different facts,
 * and rounding the first up into the second turns an honest status into a green tick over a
 * dead link. `appCopy.ts` pins that on `pages.status.live` and `pages.status.built`; the
 * entries here have to stay on the right side of the same line. `pages.phase.verifying` is
 * the step that establishes it, so it says what it is doing rather than announcing success,
 * and `pages.status.errored` says GitHub's build failed rather than that something went
 * a bit wrong.
 *
 * ## Why the two visibility options are voiced and not labels
 *
 * They read like radio-button captions and they are not: each one states a consequence the
 * user is choosing between. Public means anybody who finds the address downloads the whole
 * map; private means Pages needs a paid plan. Those are the entire decision, so they carry
 * five levels and their facts are pinned. A caption that got playful and dropped "anybody
 * can download the map" would be the app hiding the cost of the option it recommends.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PAGES_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Phases that make a claim, rather than just naming a step          */
    /* ---------------------------------------------------------------- */

    /*
     * "A host that only serves files" is the reason the whole preparation step exists, and
     * it is what makes the decompression change further down comprehensible rather than
     * arbitrary. Every level keeps it.
     */
    "pages.phase.preparing": {
        en: [
            "Preparing the map for a host that only serves files",
            "Preparing the map for a host that only serves files",
            "Preparing the map for a host that only serves files and does nothing else",
            "Getting the map ready for a host that only serves files and will not lift a finger beyond that",
            "Getting the map ready for a host that only serves files, asks no questions and does absolutely nothing else",
        ],
        yue: [
            "準備緊張地圖，等佢啱一個淨係識派檔案嘅主機",
            "準備緊張地圖，等佢啱一個淨係識派檔案嘅主機",
            "準備緊張地圖，去一個淨係識派檔案、其他乜都唔做嘅主機",
            "執緊張地圖，準備擺去一個淨係識派檔案、多一步都唔肯行嘅主機",
            "執緊張地圖，準備擺去一個淨係識派檔案、乜都唔問、亦都乜都唔做嘅主機",
        ],
    },
    /*
     * The step that turns "GitHub says built" into "the address answered", so it describes
     * the request it is making instead of reporting a result it does not have yet.
     */
    "pages.phase.verifying": {
        en: [
            "Opening the published address to check it answers",
            "Opening the published address to check it answers",
            "Opening the published address to check that it actually answers",
            "Opening the published address to find out whether it actually answers",
            "Actually opening the published address to find out whether it actually answers, rather than taking anybody's word for it",
        ],
        yue: [
            "開緊已發佈嘅網址，睇下佢有冇回應",
            "開緊已發佈嘅網址，睇下佢有冇回應",
            "開緊已發佈嘅網址，睇下佢係咪真係有回應",
            "開緊已發佈嘅網址，睇下佢究竟有冇回應",
            "真係去開個已發佈嘅網址，睇下佢究竟有冇回應，而唔係聽人講就算",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The gh command-line tool                                          */
    /* ---------------------------------------------------------------- */

    "pages.gh.ready": {
        en: [
            "The gh command-line tool is installed and signed in.",
            "The gh command-line tool is installed and signed in.",
            "The gh command-line tool is installed and signed in, so publishing can go ahead.",
            "The gh command-line tool is installed and signed in. Nothing is in the way.",
            "The gh command-line tool is installed and signed in, which is the whole checklist.",
        ],
        yue: [
            "gh 命令列工具已經安裝，亦都已經登入。",
            "gh 命令列工具已經安裝，亦都已經登入。",
            "gh 命令列工具已經安裝同登入，所以可以開始發佈。",
            "gh 命令列工具已經安裝同登入。冇嘢阻住。",
            "gh 命令列工具已經安裝同登入，整份清單就係得咁多。",
        ],
    },
    "pages.gh.readyAs": {
        en: [
            "The gh command-line tool is signed in as {account} on {host}.",
            "The gh command-line tool is signed in as {account} on {host}.",
            "The gh command-line tool is signed in as {account} on {host}, and that is the account this will publish with.",
            "The gh command-line tool is signed in as {account} on {host}. That is the account this will publish with, so check it is the one you meant.",
            "The gh command-line tool is signed in as {account} on {host}. That is the account this will publish with, so if it is not the one you meant, this is the moment to notice.",
        ],
        yue: [
            "gh 命令列工具而家喺 {host} 以 {account} 身分登入。",
            "gh 命令列工具而家喺 {host} 以 {account} 身分登入。",
            "gh 命令列工具而家喺 {host} 以 {account} 身分登入，而發佈就會用呢個帳戶。",
            "gh 命令列工具而家喺 {host} 以 {account} 身分登入。發佈就係用呢個帳戶，所以睇清楚係咪你想要嗰個。",
            "gh 命令列工具而家喺 {host} 以 {account} 身分登入。發佈就係用呢個帳戶，如果唔係你想要嗰個，而家就係發現嘅時候。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Blocked, unsupported, and the notices                             */
    /* ---------------------------------------------------------------- */

    "pages.unsupported": {
        en: [
            "The desktop application is what publishes a map.",
            "The desktop application is what publishes a map.",
            "Publishing a map is something the desktop application does.",
            "Publishing a map is something only the desktop application can do.",
            "Publishing a map is something only the desktop application can do, because it is the one holding the files.",
        ],
        yue: [
            "發佈地圖係由桌面程式做嘅。",
            "發佈地圖係由桌面程式做嘅。",
            "發佈地圖呢件事係桌面程式先做到。",
            "發佈地圖呢件事淨係桌面程式先做得到。",
            "發佈地圖呢件事淨係桌面程式先做得到，因為啲檔案喺佢手上。",
        ],
    },
    "pages.blocked.check": {
        en: [
            "Check the repository first.",
            "Check the repository first.",
            "Check the repository before publishing.",
            "Run the check on the repository before anything is pushed.",
            "Run the check on the repository first. Nothing is pushed until it has been.",
        ],
        yue: [
            "請先檢查個 repository。",
            "請先檢查個 repository。",
            "發佈之前，請先檢查個 repository。",
            "上傳任何嘢之前，先檢查一次個 repository。",
            "先檢查個 repository。未檢查過，一個字節都唔會上傳。",
        ],
    },
    "pages.notice.copied": {
        en: [
            "The address was copied.",
            "The address was copied.",
            "The address was copied to the clipboard.",
            "The address is on the clipboard.",
            "The address is on the clipboard, ready to send to somebody.",
        ],
        yue: [
            "個網址已經複製咗。",
            "個網址已經複製咗。",
            "個網址已經複製到剪貼簿。",
            "個網址而家喺剪貼簿度。",
            "個網址而家喺剪貼簿度，隨時 send 得俾人。",
        ],
    },
    /*
     * A destructive outcome, so both halves stay: the site is down AND the publishing branch
     * was deleted. A level that mentioned only the first would leave somebody believing the
     * branch is still there to republish from.
     */
    "pages.notice.stopped": {
        en: [
            "The site was taken down and the publishing branch deleted.",
            "The site was taken down and the publishing branch deleted.",
            "The site was taken down and the publishing branch was deleted.",
            "The site has been taken down and the publishing branch deleted.",
            "The site has been taken down and the publishing branch deleted, so there is nothing left there to republish from.",
        ],
        yue: [
            "個網站已經落架，發佈分支亦都已經刪除。",
            "個網站已經落架，發佈分支亦都已經刪除。",
            "個網站已經落架，而發佈分支亦都已經刪除咗。",
            "個網站已經落架，發佈分支亦都刪除咗。",
            "個網站已經落架，發佈分支亦都刪除咗，所以嗰邊冇嘢剩返俾你重新發佈。",
        ],
    },
    "pages.notice.stopFailed": {
        en: [
            "The site could not be taken down.",
            "The site could not be taken down.",
            "The site could not be taken down, so it is still reachable.",
            "The site could not be taken down, so assume it is still reachable.",
            "The site could not be taken down, so assume it is still reachable and still serving the map.",
        ],
        yue: [
            "個網站落唔到架。",
            "個網站落唔到架。",
            "個網站落唔到架，所以佢仲入得到。",
            "個網站落唔到架，所以當佢仲入得到。",
            "個網站落唔到架，所以當佢仲入得到，亦都仲喺度派緊張圖。",
        ],
    },
    "pages.notice.resumed": {
        en: [
            "The interrupted Pages publish is continuing.",
            "The interrupted Pages publish is continuing.",
            "The interrupted Pages publish is continuing from where it stopped.",
            "The interrupted Pages publish is continuing from exactly where it stopped.",
            "The interrupted Pages publish is continuing from exactly where it stopped, rather than starting the whole climb again.",
        ],
        yue: [
            "之前中斷咗嘅 Pages 發佈而家繼續緊。",
            "之前中斷咗嘅 Pages 發佈而家繼續緊。",
            "之前中斷咗嘅 Pages 發佈，而家由停低嗰度繼續。",
            "之前中斷咗嘅 Pages 發佈，而家由停低嗰個位原地繼續。",
            "之前中斷咗嘅 Pages 發佈，而家由停低嗰個位原地繼續，唔使成件事由頭嚟過。",
        ],
    },
    "pages.notice.refreshed": {
        en: [
            "The recorded Pages site status is up to date.",
            "The recorded Pages site status is up to date.",
            "The recorded Pages site status is now up to date.",
            "The recorded Pages site status has been brought up to date.",
            "The recorded Pages site status has been brought up to date, so what is on screen is what GitHub says.",
        ],
        yue: [
            "記錄低嘅 Pages 網站狀態已經係最新。",
            "記錄低嘅 Pages 網站狀態已經係最新。",
            "記錄低嘅 Pages 網站狀態而家已經係最新。",
            "記錄低嘅 Pages 網站狀態已經更新到最新。",
            "記錄低嘅 Pages 網站狀態已經更新到最新，所以畫面上見到嘅，就係 GitHub 講嘅。",
        ],
    },
    "pages.notice.refreshFailed": {
        en: [
            "The Pages status could not be refreshed.",
            "The Pages status could not be refreshed.",
            "The Pages status could not be refreshed, so what is shown may be out of date.",
            "The Pages status could not be refreshed, so treat what is shown as possibly out of date.",
            "The Pages status could not be refreshed, so treat what is shown as possibly out of date rather than as news.",
        ],
        yue: [
            "更新唔到 Pages 嘅狀態。",
            "更新唔到 Pages 嘅狀態。",
            "更新唔到 Pages 嘅狀態，所以畫面上顯示嘅可能係舊嘅。",
            "更新唔到 Pages 嘅狀態，所以當畫面上顯示嘅可能係舊嘅。",
            "更新唔到 Pages 嘅狀態，所以當畫面上顯示嘅可能係舊嘅，唔好當佢係最新消息。",
        ],
    },
    /*
     * The stage is the whole value of this sentence: it is what tells somebody whether the
     * interruption happened before or after anything was pushed. It stays interpolated, and
     * so does the promise that there is a saved checkpoint to continue from.
     */
    "pages.hosted.interrupted": {
        en: [
            "This publish stopped during {stage}; it can continue from its saved checkpoint.",
            "This publish stopped during {stage}; it can continue from its saved checkpoint.",
            "This publish stopped during {stage}. It can continue from its saved checkpoint.",
            "This publish stopped during {stage}, and it can continue from its saved checkpoint rather than starting again.",
            "This publish stopped during {stage}, and it can continue from its saved checkpoint rather than starting the whole climb again.",
        ],
        yue: [
            "呢次發佈喺 {stage} 嗰陣停咗；佢可以由儲存低嘅檢查點繼續。",
            "呢次發佈喺 {stage} 嗰陣停咗；佢可以由儲存低嘅檢查點繼續。",
            "呢次發佈喺 {stage} 嗰陣停咗。佢可以由儲存低嘅檢查點繼續。",
            "呢次發佈喺 {stage} 嗰陣停咗，可以由儲存低嘅檢查點繼續，唔使由頭再嚟。",
            "呢次發佈喺 {stage} 嗰陣停咗，可以由儲存低嘅檢查點繼續，唔使成條路由頭再爬一次。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The visibility choice, which is a decision and not a caption      */
    /* ---------------------------------------------------------------- */

    "pages.visibility.public": {
        en: [
            "Public repository (Pages is free; anybody can download the map)",
            "Public repository (Pages is free; anybody can download the map)",
            "Public repository. Pages is free, and anybody who finds it can download the map",
            "Public repository. Pages is free, and anybody who finds the address can download the whole map",
            "Public repository. Pages is free, and anybody who stumbles on the address can download the whole map, tile by tile, at their leisure",
        ],
        yue: [
            "公開 repository（Pages 免費；任何人都可以下載張地圖）",
            "公開 repository（Pages 免費；任何人都可以下載張地圖）",
            "公開 repository。Pages 免費，而任何人搵到都可以下載張地圖",
            "公開 repository。Pages 免費，而任何人搵到個網址都可以下載成張地圖",
            "公開 repository。Pages 免費，而任何人撞到個網址，都可以慢慢逐塊圖磚下載成張地圖",
        ],
    },
    "pages.visibility.private": {
        en: [
            "Private repository (Pages needs a paid GitHub plan)",
            "Private repository (Pages needs a paid GitHub plan)",
            "Private repository. Pages on one of these needs a paid GitHub plan",
            "Private repository. Pages on a private repository needs a paid GitHub plan",
            "Private repository. Pages on a private repository needs a paid GitHub plan, and there is no way around that from in here",
        ],
        yue: [
            "私人 repository（Pages 需要付費嘅 GitHub 方案）",
            "私人 repository（Pages 需要付費嘅 GitHub 方案）",
            "私人 repository。呢類 repository 開 Pages 需要付費嘅 GitHub 方案",
            "私人 repository。私人 repository 想開 Pages，需要付費嘅 GitHub 方案",
            "私人 repository。私人 repository 想開 Pages 就要付費嘅 GitHub 方案，喺呢度點撳都繞唔過",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PAGES_FIXED = {
    /* Phase names: each one labels a step, and none of them claims an outcome. */
    "pages.phase.starting": { en: "Starting", yue: "開始緊" },
    "pages.phase.checking": {
        en: "Checking the repository and the publishing branch",
        yue: "檢查緊 repository 同發佈分支",
    },
    "pages.phase.staging": { en: "Staging the map's files", yue: "整理緊地圖嘅檔案" },
    "pages.phase.pushing": { en: "Pushing to GitHub", yue: "上傳緊去 GitHub" },
    "pages.phase.enabling": { en: "Turning GitHub Pages on", yue: "開緊 GitHub Pages" },
    "pages.phase.waiting": {
        en: "Waiting for GitHub to build the site",
        yue: "等緊 GitHub 建立個網站",
    },
    "pages.phase.finished": { en: "Finished", yue: "完成" },

    /*
     * GitHub's own reported state, which is deliberately never the same vocabulary as
     * `pages.status.live` in `appCopy.ts`. That one is a claim about a request that
     * answered; these four are all reports of what GitHub said.
     */
    "pages.status.queued": { en: "Queued at GitHub", yue: "喺 GitHub 排緊隊" },
    "pages.status.building": { en: "GitHub is building it", yue: "GitHub 建立緊" },
    "pages.status.errored": { en: "GitHub's build failed", yue: "GitHub 建立失敗" },
    "pages.status.unknown": { en: "GitHub has not said yet", yue: "GitHub 仲未講" },

    "pages.renders.summary": {
        en: "Showing {shown} of {total} renders",
        yue: "顯示緊 {total} 張算好嘅圖入面嘅 {shown} 張",
    },
    "pages.progress.count": { en: "{done} of {total}", yue: "{total} 之中嘅 {done}" },
    "pages.resume": { en: "Continue publishing", yue: "繼續發佈" },
    "pages.refresh": { en: "Refresh status", yue: "更新狀態" },
    // Substituted into a sentence about a site being taken down, so it has to read as a
    // clause rather than as a heading.
    "pages.stop.noUrl": { en: "no address was published", yue: "當時冇發佈過網址" },
} as const satisfies Record<string, FixedString>;

export const PAGES_FACTS = {
    "pages.phase.preparing": { en: ["only serves files"], yue: ["派檔案"] },
    // Checking, not concluding. The word that must not turn into "verified" early.
    "pages.phase.verifying": { en: ["address", "answers"], yue: ["網址", "回應"] },

    "pages.gh.ready": { en: ["gh", "signed in"], yue: ["gh", "登入"] },
    "pages.gh.readyAs": {
        en: ["gh", "{account}", "{host}"],
        yue: ["gh", "{account}", "{host}"],
    },
    "pages.unsupported": { en: ["desktop application"], yue: ["桌面程式"] },
    "pages.blocked.check": { en: ["repository"], yue: ["repository"] },
    "pages.notice.copied": { en: ["address"], yue: ["網址"] },
    // Both halves of the damage, so no level can report only the gentler one.
    "pages.notice.stopped": {
        en: ["taken down", "publishing branch", "delete"],
        yue: ["落架", "發佈分支", "刪除"],
    },
    "pages.notice.stopFailed": { en: ["could not be taken down"], yue: ["落唔到架"] },
    "pages.notice.resumed": { en: ["Pages", "continu"], yue: ["Pages", "繼續"] },
    "pages.notice.refreshed": { en: ["Pages", "up to date"], yue: ["Pages", "最新"] },
    "pages.notice.refreshFailed": {
        en: ["Pages", "could not be refreshed"],
        yue: ["Pages", "更新唔到"],
    },
    "pages.hosted.interrupted": {
        en: ["{stage}", "checkpoint"],
        yue: ["{stage}", "檢查點"],
    },
    // The cost of each option, which is the entire content of the choice.
    "pages.visibility.public": {
        en: ["Public repository", "free", "anybody", "download"],
        yue: ["公開 repository", "免費", "任何人", "下載"],
    },
    "pages.visibility.private": {
        en: ["Private repository", "paid GitHub plan"],
        yue: ["私人 repository", "付費"],
    },
} as const satisfies Record<
    keyof typeof PAGES_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
