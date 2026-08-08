/**
 * The `gh` command-line tool's own accounts: a second, separate list beside this
 * application's own multi-account GitHub sign-in (`accounts.ts` next door), for the account
 * `gh` itself is signed in as - shared by every terminal, script and other tool on this
 * computer, not managed by this application at all.
 *
 * ## The one distinction every string here exists to keep clear
 *
 * `gh`'s account store and this application's own are two different things that can
 * disagree at any moment. Nothing in this surface's copy may read as though they are one
 * list - `settings.github.ghCli.explainer` says so in as many words, at every funny level,
 * and it is one of the strings `GHCLIACCOUNTS_FACTS` pins hardest.
 *
 * ## The main process's own words travel through unchanged
 *
 * `main/ghcli/accounts.ts` already writes a complete, honest sentence for every state
 * (`gh` not installed, installed with nobody signed in, an unrecognised answer, how many
 * accounts are signed in) and for a switch's real outcome - including the machine-wide
 * disclosure requirement 3 asks for. Rewriting that prose per funny level here would be a
 * second place for the same fact to drift from the first, so every one of those messages
 * arrives as a `{reason}`/`{message}` placeholder inside a voiced shell, exactly the pattern
 * `settings.github.accounts.refreshFailed` next door already uses for the same reason: "the
 * main process's own reasons stay identical in both languages, because a translated one
 * sends the reader looking for something that does not exist." The literal word `gh` is
 * pinned into every level of those shells for the same reason a login or a scope name is
 * never touched - it is the product's own name, not prose to translate.
 *
 * ## The switch warning may never disappear
 *
 * `settings.github.ghCli.switchWarning` is shown beside the Switch action itself, before it
 * is pressed - not only after - because `gh auth switch` changes the active account for
 * every terminal, script and other tool on this computer, not only this application.
 * `GHCLIACCOUNTS_FACTS` pins "whole computer" (and its Cantonese equivalent) into every
 * level of that one key specifically so a rewrite can never quietly soften it away.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const GHCLIACCOUNTS_VOICED = {
    /*
     * The core distinction: gh's own accounts are not this application's own accounts, and
     * the two stores can disagree. Shown above the list at all times, not only when the two
     * genuinely differ, because the moment somebody needs to know this is exactly the
     * moment a failure has already made the two routes visible side by side.
     */
    "settings.github.ghCli.explainer": {
        en: [
            "The gh command-line tool keeps its own separate sign-in, shared by every terminal and tool on this computer, not managed by this application.",
            "The gh command-line tool keeps its own separate sign-in, shared by every terminal and tool on this computer, not managed by this application.",
            "The gh command-line tool keeps its own separate sign-in, shared by every terminal and tool on this computer, not managed by this application - and it is not the same list as the app's own accounts above.",
            "gh keeps its own separate sign-in, shared by every terminal and tool on this computer, not managed by this application - a different account book from the app's own accounts above.",
            "gh keeps its own separate sign-in, not managed by this application, shared by every terminal and tool on this computer - not the same book as the app's own accounts above, and the two are allowed to disagree, and often do.",
        ],
        yue: [
            "gh command-line 工具有佢自己獨立嘅登入，同呢部電腦嘅每個 terminal 同工具共用，唔係呢個程式管理緊嘅。",
            "gh command-line 工具有佢自己獨立嘅登入，同呢部電腦嘅每個 terminal 同工具共用，唔係呢個程式管理緊嘅。",
            "gh command-line 工具有佢自己獨立嘅登入，同呢部電腦嘅每個 terminal 同工具共用，唔係呢個程式管理緊嘅，同上面呢個程式自己嘅帳戶唔係同一個名單。",
            "gh 有佢自己獨立嘅登入，同呢部電腦嘅每個 terminal 同工具共用，唔係呢個程式管理緊嘅，係同上面嗰度完全唔同嘅另一本數簿。",
            "gh 有佢自己獨立嘅登入，唔係呢個程式管理緊嘅，同呢部電腦每個 terminal 同工具共用，同上面嗰本唔係同一本數簿，兩本可以唔一致，仲成日都係。",
        ],
    },
    /* The main process's own status sentence, wrapped rather than rewritten - see the
     * module header for why "gh" is pinned literally into every level. */
    "settings.github.ghCli.statusLine": {
        en: [
            "gh: {reason}",
            "gh: {reason}",
            "Here is what gh says: {reason}",
            "Straight from gh itself: {reason}",
            "In gh's own words: {reason}",
        ],
        yue: [
            "gh：{reason}",
            "gh：{reason}",
            "gh 而家咁講：{reason}",
            "直接由 gh 講出嚟：{reason}",
            "用 gh 自己嘅口吻講：{reason}",
        ],
    },
    /*
     * Shown before the Switch action is pressed, permanently, not only after. Facts-pinned
     * hardest of everything on this surface: this changes gh for the whole computer, and
     * that must survive every level unchanged.
     */
    "settings.github.ghCli.switchWarning": {
        en: [
            "Switching here changes gh's active account for the whole computer: every terminal, script and other tool that uses gh, not only this application.",
            "Switching here changes gh's active account for the whole computer: every terminal, script and other tool that uses gh, not only this application.",
            "Switching here changes gh's active account for the whole computer - every terminal, script and other tool that uses gh, not only this application - so it is worth knowing before you press it.",
            "Switching here is not scoped to this application: it changes gh's active account for the whole computer, and every terminal, script and other tool that uses gh picks it up too.",
            "Fair warning: this is not a this-app-only switch. It changes gh's active account for the whole computer, and every terminal, script and other tool that uses gh will feel it the moment you press the button.",
        ],
        yue: [
            "喺呢度切換會改埋成部電腦嘅 gh 使用中帳戶：所有用緊 gh 嘅 terminal、腳本同其他工具都會受影響，唔淨係呢個程式。",
            "喺呢度切換會改埋成部電腦嘅 gh 使用中帳戶：所有用緊 gh 嘅 terminal、腳本同其他工具都會受影響，唔淨係呢個程式。",
            "喺呢度切換會改埋成部電腦嘅 gh 使用中帳戶，所有用緊 gh 嘅 terminal、腳本同其他工具都會受影響，唔淨係呢個程式，所以按之前最好知道呢點。",
            "喺呢度切換唔係淨係呢個程式嘅事：佢會改埋成部電腦嘅 gh 使用中帳戶，所有用緊 gh 嘅 terminal、腳本同其他工具都會跟住變。",
            "醜話講埋先：呢個唔係淨係呢個程式用嘅切換。佢會改埋成部電腦嘅 gh 使用中帳戶，一撳落去，所有用緊 gh 嘅 terminal、腳本同其他工具即刻感受到。",
        ],
    },
    /* A switch that genuinely landed. The main process's own message already carries the
     * machine-wide fact, so it travels through as {message} rather than being restated. */
    "settings.github.ghCli.switchSucceeded": {
        en: [
            "gh: {message}",
            "gh: {message}",
            "Done. gh says: {message}",
            "That went through. gh says: {message}",
            "Switched, and gh confirms it: {message}",
        ],
        yue: [
            "gh：{message}",
            "gh：{message}",
            "搞掂。gh 話：{message}",
            "搞掂咗。gh 話：{message}",
            "切換咗，gh 都確認咗：{message}",
        ],
    },
    /* A switch that did not take, or a switch gh refused outright. */
    "settings.github.ghCli.switchFailed": {
        en: [
            "gh: {reason}",
            "gh: {reason}",
            "That switch did not go through. gh says: {reason}",
            "gh would not switch to that account: {reason}",
            "No dice on that switch. gh says: {reason}",
        ],
        yue: [
            "gh：{reason}",
            "gh：{reason}",
            "嗰次切換冇成功。gh 話：{reason}",
            "gh 唔肯切換去嗰個帳戶：{reason}",
            "嗰次切換搞唔掂。gh 話：{reason}",
        ],
    },
    /* An account this application cares about but that is short a scope it needs. Names the
     * exact missing scopes, which stay untranslated the same way a login does. */
    "settings.github.ghCli.missingScopesWarning": {
        en: [
            "This account is missing {scopes} for full support in this application.",
            "This account is missing {scopes} for full support in this application.",
            "This account is missing {scopes}, which this application needs for full support.",
            "This account is short {scopes} - this application needs those for full support.",
            "This account is running light on scopes: it is missing {scopes}, and this application wants those for full support.",
        ],
        yue: [
            "呢個帳戶欠咗 {scopes}，呢個程式要有先至用得晒晒齊。",
            "呢個帳戶欠咗 {scopes}，呢個程式要有先至用得晒晒齊。",
            "呢個帳戶欠咗 {scopes}，呢個程式要呢啲先用得晒晒齊。",
            "呢個帳戶少咗 {scopes} 呢啲權限，呢個程式要有先至用得晒晒齊。",
            "呢個帳戶權限唔夠喉：欠咗 {scopes}，呢個程式要有呢啲先至用得晒晒齊。",
        ],
    },
    /* The code and approval are visible here, while the approved credential goes straight
     * to gh and is never retained by this application. */
    "settings.github.ghCli.loginExplainer": {
        en: [
            "Sign-in starts here and approval happens on GitHub in your browser. The approved credential goes directly to gh's own credential store; this application does not keep it.",
            "Sign-in starts here and approval happens on GitHub in your browser. The approved credential goes directly to gh's own credential store; this application does not keep it.",
            "Start sign-in here, then approve it on GitHub in your browser. The credential travels straight into gh's own store, and this application does not keep a copy.",
            "This screen handles the one-time code while your browser handles GitHub approval. The approved credential lands directly in gh's store; this application does not keep it.",
            "This screen shows the one-time code, your browser gets the GitHub approval ceremony, and gh gets the credential. This application does not keep it or hide a souvenir copy in a drawer.",
        ],
        yue: [
            "喺呢度開始登入，再喺 browser 入面嘅 GitHub 批准。批准咗嘅憑證會直接入 gh 自己個儲存庫，呢個程式唔會保存。",
            "喺呢度開始登入，再喺 browser 入面嘅 GitHub 批准。批准咗嘅憑證會直接入 gh 自己個儲存庫，呢個程式唔會保存。",
            "呢度開始登入，去 browser 入面批准 GitHub，憑證就直接交畀 gh 自己保存，呢個程式唔會保存副本。",
            "呢個畫面負責一次性 code，browser 負責 GitHub 批准，批准咗嘅憑證直接落 gh 個儲存庫，呢個程式唔會保存。",
            "呢度拎一次性 code，browser 搞掂 GitHub 批准，gh 收好憑證；呢個程式唔會保存，更加唔會偷偷留張紀念品喺櫃桶。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const GHCLIACCOUNTS_FIXED = {
    "settings.github.ghCli.title": {
        en: "gh command-line tool accounts",
        yue: "gh command-line 工具帳戶",
    },
    "settings.github.ghCli.listLabel": {
        en: "gh command-line tool accounts",
        yue: "gh command-line 工具帳戶",
    },
    "settings.github.ghCli.searchLabel": { en: "Search gh accounts", yue: "搜尋 gh 帳戶" },
    "settings.github.ghCli.searchHint": {
        en: "a login, a host, or a permission",
        yue: "登入名、主機或者權限",
    },
    "settings.github.ghCli.searchSummary": {
        en: "Showing {shown} of {total}.",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個。",
    },
    "settings.github.ghCli.emptySearch": {
        en: "Nothing here matches that search. Clearing it brings the whole list back.",
        yue: "冇嘢啱呢個搜尋。清咗佢個列表就會返晒嚟。",
    },
    "settings.github.ghCli.active": { en: "Active", yue: "使用緊" },
    "settings.github.ghCli.switchAction": { en: "Switch", yue: "切換" },
    "settings.github.ghCli.switching": { en: "Switching…", yue: "切換緊…" },
    "settings.github.ghCli.checkAgain": { en: "Check again", yue: "再檢查" },
    "settings.github.ghCli.checking": { en: "Checking…", yue: "檢查緊…" },
    "settings.github.ghCli.copyCode": { en: "Copy code", yue: "複製 code" },
    "settings.github.ghCli.codeCopied": { en: "Code copied.", yue: "Code 複製咗。" },
    "settings.github.ghCli.openDependencies": {
        en: "Open the System dependencies settings",
        yue: "打開「系統依賴」設定",
    },
    "settings.github.ghCli.signInAction": { en: "Sign in with gh", yue: "用 gh 登入" },
    "settings.github.ghCli.repairScopesAction": {
        en: "Approve required permissions",
        yue: "批准需要嘅權限",
    },
    "settings.github.ghCli.cancelLogin": { en: "Cancel sign-in", yue: "取消登入" },
    "settings.github.ghCli.dismissLogin": { en: "Dismiss", yue: "收起" },
    "settings.github.ghCli.codeLabel": { en: "One-time code", yue: "一次性 code" },
    "settings.github.ghCli.verificationUrlLabel": {
        en: "GitHub approval page",
        yue: "GitHub 批准頁面",
    },
    "settings.github.ghCli.secondsRemaining": {
        en: "{seconds} seconds remaining.",
        yue: "仲有 {seconds} 秒。",
    },
    "settings.github.ghCli.field.source": { en: "Signed in with", yue: "用咩登入" },
    "settings.github.ghCli.field.protocol": { en: "Git protocol", yue: "Git 協議" },
    "settings.github.ghCli.field.scopes": { en: "Permissions", yue: "權限" },
    "settings.github.ghCli.noScopes": {
        en: "Not reported by this token",
        yue: "呢個 token 冇報呢項",
    },
    "settings.github.ghCli.unhealthy": {
        en: "gh reports a problem with this account",
        yue: "gh 話呢個帳戶有問題",
    },
} as const satisfies Record<string, FixedString>;

export const GHCLIACCOUNTS_FACTS = {
    "settings.github.ghCli.explainer": {
        en: ["gh", "separate", "not managed by this application"],
        yue: ["gh", "獨立", "唔係呢個程式管理緊嘅"],
    },
    "settings.github.ghCli.statusLine": {
        en: ["gh", "{reason}"],
        yue: ["gh", "{reason}"],
    },
    "settings.github.ghCli.switchWarning": {
        en: ["whole computer", "every terminal"],
        yue: ["成部電腦", "terminal"],
    },
    "settings.github.ghCli.switchSucceeded": {
        en: ["gh", "{message}"],
        yue: ["gh", "{message}"],
    },
    "settings.github.ghCli.switchFailed": {
        en: ["gh", "{reason}"],
        yue: ["gh", "{reason}"],
    },
    "settings.github.ghCli.missingScopesWarning": {
        en: ["{scopes}"],
        yue: ["{scopes}"],
    },
    "settings.github.ghCli.loginExplainer": {
        en: ["gh", "browser", "does not keep"],
        yue: ["gh", "browser", "唔會保存"],
    },
} as const satisfies Record<
    keyof typeof GHCLIACCOUNTS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
