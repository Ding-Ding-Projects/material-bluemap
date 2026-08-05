/**
 * The GitHub account screen: the status row, the device-flow panel, the personal access
 * token form, and the sign-out confirmation.
 *
 * One module per surface, spread into `appCopy.ts`. The split is not cosmetic: the
 * catalogue is the one file in this package that several people edit at once, and a single
 * two-thousand-entry object literal makes every one of those edits touch the same hunk.
 *
 * ## What is deliberately *not* here
 *
 * `settings.github.title` and `settings.github.tokenScopes` are written directly in
 * `appCopy.ts`, and `settings.github.description`, `.whatFor`, `.signedOut` and
 * `.unsupported` belong to `surfaces/settings.ts`, which is the screen that introduces this
 * one. They are all `settings.github.*` and none of them belongs here; an entry here would
 * be shadowed anyway, because `appCopy.ts` spreads the surface modules before its own
 * entries.
 *
 * ## The one rule this surface adds
 *
 * Every string here is within reach of a credential, so none of them ever quotes one. No
 * level says how long a token is, what it starts with, or what was typed: a refusal names
 * what was wrong with the token (unknown to GitHub, missing a permission) and stops there,
 * so nothing that could reach a screenshot, a notice or a bug report carries a secret. The
 * device code is the one value shown on purpose, because it is a short-lived pairing string
 * that is worthless without the account holder approving it in their own browser.
 *
 * Two distinctions carry real consequences and are pinned as facts at every level:
 *
 *  - **revoked versus deleted.** `settings.github.revoked` is GitHub confirming the token
 *    is dead everywhere. `settings.github.notRevoked` is the token being gone from this
 *    computer with no such confirmation, so the grant may still be listed on the account.
 *    Rounding the second up to the first tells somebody they are safe when they are not.
 *  - **signed in versus signed in without a scope.** `settings.github.missingScopes` and
 *    `settings.github.tokenMissingScopes` both name the exact scope strings, because
 *    "something went wrong with permissions" is not something anybody can act on.
 *
 * Scope names, account names and GitHub's own error text stay identical in both languages
 * for the same reason a filename does: a translated `read:org` sends the reader looking for
 * a permission that does not exist.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const GITHUB_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Where the sign-in is kept, and for how long                       */
    /* ---------------------------------------------------------------- */

    /*
     * The same fact from two places: the row that offers a sign-in warns before, and the
     * row that reports one warns after. Both say the sign-in ends when the app closes,
     * because a session that silently evaporates overnight reads as the app forgetting
     * things at random rather than as this machine having nowhere to keep it.
     */
    "settings.github.noCredentialStore": {
        en: [
            "This computer has no credential store the app can use, so a sign-in will last only until the app closes.",
            "This computer has no credential store the app can use, so a sign-in will last only until the app closes.",
            "This computer has no credential store the app can use, so a sign-in lasts only until the app closes.",
            "This computer has no credential store the app can use, so a sign-in lasts only until the app closes and then has to be done again.",
            "This computer has no credential store the app can use, so a sign-in lasts only until the app closes, at which point it is forgotten completely.",
        ],
        yue: [
            "呢部電腦冇程式用得嘅憑證儲存區，所以登入只會維持到程式閂為止。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以登入只會維持到程式閂為止。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以一次登入只維持到程式閂為止。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以一次登入只維持到程式閂為止，跟住要再登入過。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以一次登入只維持到程式閂為止，一閂就忘記得一乾二淨。",
        ],
    },
    "settings.github.notPersisted": {
        en: [
            "This computer has no credential store the app could use, so this sign-in lasts until the app closes and will have to be done again next time.",
            "This computer has no credential store the app could use, so this sign-in lasts until the app closes and will have to be done again next time.",
            "This computer has no credential store the app could use, so this sign-in lasts until the app closes and has to be done again next time.",
            "This computer has no credential store the app could use, so this sign-in lasts until the app closes and has to be done again the next time round.",
            "This computer has no credential store the app could use, so this sign-in lasts until the app closes and then has to be done again next time, from the top.",
        ],
        yue: [
            "呢部電腦冇程式用得嘅憑證儲存區，所以呢次登入淨係維持到程式閂為止，下次要再登入過。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以呢次登入淨係維持到程式閂為止，下次要再登入過。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以呢次登入只維持到程式閂為止，下次要再登入過。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以呢次登入只維持到程式閂為止，下次開返又要再登入過。",
            "呢部電腦冇程式用得嘅憑證儲存區，所以呢次登入只維持到程式閂為止，下次開返要由頭再登入過。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Signing out: what GitHub confirmed, and what it did not           */
    /* ---------------------------------------------------------------- */

    /*
     * These two are the reason this module has a header comment. They differ by exactly one
     * thing, and it is the thing that matters: whether GitHub confirmed the revocation.
     * `revoked` may say the token works nowhere; `notRevoked` may not, and every level of it
     * keeps "may still be listed on your account" so the reader knows there is somewhere
     * else to look.
     */
    "settings.github.revoked": {
        en: [
            "Signed out. GitHub confirmed the token was revoked, so it works nowhere any more.",
            "Signed out. GitHub confirmed the token was revoked, so it works nowhere any more.",
            "Signed out. GitHub confirmed the token was revoked, so it works nowhere any more, here or anywhere else.",
            "Signed out. GitHub confirmed the token was revoked, so it works nowhere any more. Not here, not anywhere else.",
            "Signed out, and GitHub confirmed the token was revoked, so it works nowhere any more. That one is a doorstop now.",
        ],
        yue: [
            "已登出。GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。",
            "已登出。GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。",
            "已登出。GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效，呢度定其他地方都一樣。",
            "已登出。GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。呢度冇用，其他地方一樣冇用。",
            "已登出，而 GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。嗰個而家淨係得個名。",
        ],
    },
    "settings.github.notRevoked": {
        en: [
            "Signed out, and the token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
            "Signed out, and the token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
            "Signed out, and the token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account over there.",
            "Signed out, and the token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account, which is worth a look.",
            "Signed out, and the token was deleted from this computer. GitHub did not confirm a revocation though, so the grant may still be listed on your account, and this app is not going to pretend otherwise.",
        ],
        yue: [
            "已登出，個 token 亦已經喺呢部電腦刪走。GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住。",
            "已登出，個 token 亦已經喺呢部電腦刪走。GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住。",
            "已登出，個 token 亦已經喺呢部電腦刪走。GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶嗰邊列住。",
            "已登出，個 token 亦已經喺呢部電腦刪走。GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住，值得去睇一睇。",
            "已登出，個 token 亦已經喺呢部電腦刪走。不過 GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住，呢個程式唔會扮唔知。",
        ],
    },
    /*
     * The body of the sign-out confirmation, so it is the one text a reader is deciding
     * against. It carries four facts at every level: the token is deleted from this
     * computer, GitHub is asked to revoke it, it stops working everywhere rather than only
     * here, and nothing already rendered or downloaded is touched.
     */
    "settings.github.confirmBody": {
        en: [
            "Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.",
            "Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.",
            "Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than just being forgotten here. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.",
            "Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than just being quietly forgotten here. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.",
            "Signing out deletes the stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than just being quietly forgotten here. That thoroughness is on purpose. Nothing you have rendered or downloaded is touched, and signing in again issues a new token.",
        ],
        yue: [
            "登出會將儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，唔淨係喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入嗰陣會發一個新 token。",
            "登出會將儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，唔淨係喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入嗰陣會發一個新 token。",
            "登出會將儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，而唔係淨係喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入嗰陣會發一個新 token。",
            "登出會將儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，而唔係靜靜雞喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入嗰陣會發一個新 token。",
            "登出會將儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，而唔係靜靜雞喺呢部機唔記得咗。做得咁絕係特登嘅。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入嗰陣會發一個新 token。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The device flow                                                   */
    /* ---------------------------------------------------------------- */

    /*
     * The explanation somebody reads before deciding to trust this. Both security clauses
     * survive level 5 word for word: no password is typed into this app, and the token it
     * receives stays in the app.
     */
    "settings.github.deviceExplain": {
        en: [
            "The app asks GitHub for a short code, you type it on github.com, and the app is told when you have. No password is typed into this app, and the token it receives stays in the app.",
            "The app asks GitHub for a short code, you type it on github.com, and the app is told when you have. No password is typed into this app, and the token it receives stays in the app.",
            "The app asks GitHub for a short code, you type it on github.com, and GitHub tells the app when you have. No password is typed into this app, and the token it receives stays in the app.",
            "The app asks GitHub for a short code, you type it on github.com, and GitHub tells the app the moment you have. No password is typed into this app, and the token it receives stays in the app.",
            "The app asks GitHub for a short code, you type it on github.com, and GitHub taps the app on the shoulder the moment you have. No password is typed into this app, and the token it receives stays in the app.",
        ],
        yue: [
            "程式向 GitHub 攞一個短 code，你喺 github.com 打入去，然後程式會收到通知。你唔使喺呢個程式打密碼，而程式收到嘅 token 只會留喺程式入面。",
            "程式向 GitHub 攞一個短 code，你喺 github.com 打入去，然後程式會收到通知。你唔使喺呢個程式打密碼，而程式收到嘅 token 只會留喺程式入面。",
            "程式向 GitHub 攞一個短 code，你喺 github.com 打入去，GitHub 就會通知程式。你唔使喺呢個程式打密碼，而程式收到嘅 token 只會留喺程式入面。",
            "程式向 GitHub 攞一個短 code，你喺 github.com 打入去，你一打完 GitHub 就會通知程式。你唔使喺呢個程式打密碼，而程式收到嘅 token 只會留喺程式入面。",
            "程式向 GitHub 攞一個短 code，你喺 github.com 打入去，你一打完 GitHub 就即刻拍膊頭通知程式。你唔使喺呢個程式打密碼，而程式收到嘅 token 只會留喺程式入面。",
        ],
    },
    "settings.github.noClient": {
        en: [
            "This build has no GitHub application configured, so the browser sign-in cannot be started here. A personal access token still works.",
            "This build has no GitHub application configured, so the browser sign-in cannot be started here. A personal access token still works.",
            "This build has no GitHub application configured, so the browser sign-in cannot be started from here. A personal access token still works.",
            "This build has no GitHub application configured, so the browser sign-in cannot be started from here at all. A personal access token still works.",
            "This build has no GitHub application configured, so the browser sign-in cannot be started from here, not with the best will in the world. A personal access token still works.",
        ],
        yue: [
            "呢個版本冇設定 GitHub application，所以喺呢度開唔到瀏覽器登入。personal access token 一樣用得。",
            "呢個版本冇設定 GitHub application，所以喺呢度開唔到瀏覽器登入。personal access token 一樣用得。",
            "呢個版本冇設定 GitHub application，所以喺呢度開唔到瀏覽器登入。用 personal access token 一樣得。",
            "呢個版本冇設定 GitHub application，所以喺呢度完全開唔到瀏覽器登入。用 personal access token 一樣得。",
            "呢個版本冇設定 GitHub application，所以喺呢度點都開唔到瀏覽器登入。用 personal access token 一樣得。",
        ],
    },
    /*
     * A sign-in started before this screen opened. Its code was handed out somewhere this
     * panel cannot see, so it genuinely cannot be shown, which every level says outright
     * rather than leaving a blank space where a code should be.
     */
    "settings.github.adopted": {
        en: [
            "A sign-in was already waiting for approval when this screen opened, so its code is not here to show. Cancel it and start again for a fresh code.",
            "A sign-in was already waiting for approval when this screen opened, so its code is not here to show. Cancel it and start again for a fresh code.",
            "A sign-in was already waiting for approval when this screen opened, so its code is not here to be shown. Cancel it and start again for a fresh code.",
            "A sign-in was already waiting for approval when this screen opened, so its code is not here to be shown. Cancel it and start again to get a fresh code.",
            "A sign-in was already waiting for approval when this screen opened, so its code is not here to be shown; it was handed out before this panel existed. Cancel it and start again to get a fresh code.",
        ],
        yue: [
            "呢個畫面開嗰陣，已經有一個登入等緊批准，所以佢個 code 唔喺呢度顯示。取消佢再重新開始，就會有個新 code。",
            "呢個畫面開嗰陣，已經有一個登入等緊批准，所以佢個 code 唔喺呢度顯示。取消佢再重新開始，就會有個新 code。",
            "呢個畫面開嗰陣，已經有一個登入等緊批准，所以佢個 code 唔喺呢度顯示。取消佢再開過，就會有個新 code。",
            "呢個畫面開嗰陣，已經有一個登入等緊批准，所以佢個 code 唔喺呢度顯示。取消佢再開過，就攞到個新 code。",
            "呢個畫面開嗰陣，已經有一個登入等緊批准，所以佢個 code 唔喺呢度顯示，因為佢喺呢塊面板出世之前就派咗出去。取消佢再開過，就攞到個新 code。",
        ],
    },
    "settings.github.typeThis": {
        en: [
            "Type this code on the GitHub page, then come back here. This screen changes on its own when GitHub says you have.",
            "Type this code on the GitHub page, then come back here. This screen changes on its own when GitHub says you have.",
            "Type this code on the GitHub page, then come back here. This screen changes by itself when GitHub says you have.",
            "Type this code on the GitHub page, then come back here. This screen changes by itself when GitHub says you have, so there is no button to press.",
            "Type this code on the GitHub page, then come back here. This screen changes by itself when GitHub says you have, so there is nothing to press and no need to stare at it.",
        ],
        yue: [
            "喺 GitHub 嗰版打呢個 code，然後返返嚟。GitHub 話你打咗之後，呢個畫面會自己變。",
            "喺 GitHub 嗰版打呢個 code，然後返返嚟。GitHub 話你打咗之後，呢個畫面會自己變。",
            "喺 GitHub 嗰版打呢個 code，然後返返嚟。GitHub 話你打咗之後，呢個畫面會自己變過嚟。",
            "喺 GitHub 嗰版打呢個 code，然後返返嚟。GitHub 話你打咗之後，呢個畫面會自己變，唔使撳任何掣。",
            "喺 GitHub 嗰版打呢個 code，然後返返嚟。GitHub 話你打咗之後，呢個畫面會自己變，唔使撳掣，亦都唔使坐喺度盯住佢。",
        ],
    },
    "settings.github.copied": {
        en: [
            "The code is on the clipboard.",
            "The code is on the clipboard.",
            "The code is on the clipboard now.",
            "The code is on the clipboard, ready to paste.",
            "The code is on the clipboard, ready to paste on the GitHub page.",
        ],
        yue: [
            "個 code 已經喺剪貼簿。",
            "個 code 已經喺剪貼簿。",
            "個 code 而家已經喺剪貼簿。",
            "個 code 已經喺剪貼簿，可以貼。",
            "個 code 已經喺剪貼簿，可以直接貼落 GitHub 嗰版。",
        ],
    },
    /*
     * A failed copy is not a failed sign-in, and the code has not been lost with it. Every
     * level points back at the screen, because the alternative is a reader asking for a new
     * code they do not need.
     */
    "settings.github.copyFailed": {
        en: [
            "The clipboard could not be reached, so the code has to be typed. It is on screen above.",
            "The clipboard could not be reached, so the code has to be typed. It is on screen above.",
            "The clipboard could not be reached, so the code has to be typed by hand. It is on screen above.",
            "The clipboard could not be reached, so the code has to be typed by hand. It is still on screen above.",
            "The clipboard could not be reached, so the code has to be typed by hand, the old way. It is still on screen above, unharmed.",
        ],
        yue: [
            "掂唔到剪貼簿，所以個 code 要自己打。佢喺上面畫面度。",
            "掂唔到剪貼簿，所以個 code 要自己打。佢喺上面畫面度。",
            "掂唔到剪貼簿，所以個 code 要自己一個個打。佢喺上面畫面度。",
            "掂唔到剪貼簿，所以個 code 要自己一個個打。佢仲喺上面畫面度。",
            "掂唔到剪貼簿，所以個 code 要用手打返轉頭。佢仲好地地喺上面畫面度。",
        ],
    },
    "settings.github.browserOpened": {
        en: [
            "Your browser has been opened at this address:",
            "Your browser has been opened at this address:",
            "Your browser should now be open at this address:",
            "Your browser has been sent to this address:",
            "Your browser has been sent off to this address:",
        ],
        yue: [
            "已經幫你開咗瀏覽器，去咗呢個網址：",
            "已經幫你開咗瀏覽器，去咗呢個網址：",
            "應該已經幫你開咗瀏覽器，去咗呢個網址：",
            "已經打發咗你個瀏覽器去呢個網址：",
            "已經一手推咗你個瀏覽器去呢個網址：",
        ],
    },
    "settings.github.browserRefused": {
        en: [
            "A browser could not be opened from here, so open this address yourself:",
            "A browser could not be opened from here, so open this address yourself:",
            "A browser could not be opened from here, so please open this address yourself:",
            "No browser could be opened from here, so open this address yourself:",
            "No browser would open from here, so this part is manual. You will have to open this address yourself:",
        ],
        yue: [
            "喺呢度開唔到瀏覽器，所以請你自己開呢個網址：",
            "喺呢度開唔到瀏覽器，所以請你自己開呢個網址：",
            "喺呢度開唔到瀏覽器，唯有請你自己開呢個網址：",
            "喺呢度點都開唔到瀏覽器，唯有請你自己開呢個網址：",
            "喺呢度點都開唔到瀏覽器，呢步唯有靠人手，請你自己開呢個網址：",
        ],
    },
    "settings.github.expiresIn": {
        en: [
            "This code stops working in {clock}. A new one can be asked for afterwards.",
            "This code stops working in {clock}. A new one can be asked for afterwards.",
            "This code stops working in {clock}. A new one can be asked for after that.",
            "This code stops working in {clock}. A new one can be asked for after that, as many times as needed.",
            "This code stops working in {clock}. A new one can be asked for after that, and there is no limit on the asking.",
        ],
        yue: [
            "呢個 code 喺 {clock} 之後會失效。之後可以再攞一個新嘅。",
            "呢個 code 喺 {clock} 之後會失效。之後可以再攞一個新嘅。",
            "呢個 code 喺 {clock} 之後會失效。之後可以再攞過一個新嘅。",
            "呢個 code 喺 {clock} 之後會失效。之後想攞幾多次新嘅都得。",
            "呢個 code 喺 {clock} 之後會失效。之後想攞幾多次新嘅都得，冇上限。",
        ],
    },
    "settings.github.approved": {
        en: [
            "Approved on GitHub. You are signed in.",
            "Approved on GitHub. You are signed in.",
            "Approved on GitHub. You are now signed in.",
            "Approved on GitHub, and you are now signed in.",
            "Approved on GitHub, and you are now signed in. That is the whole ceremony.",
        ],
        yue: [
            "GitHub 嗰邊批咗。你已經登入咗。",
            "GitHub 嗰邊批咗。你已經登入咗。",
            "GitHub 嗰邊批咗。你而家已經登入咗。",
            "GitHub 嗰邊批咗，你而家已經登入咗。",
            "GitHub 嗰邊批咗，你而家已經登入咗。個儀式就係咁多。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The four ways a sign-in ends without signing anybody in           */
    /* ---------------------------------------------------------------- */

    /*
     * Refused, expired, cancelled and simply unfinished are four different things and the
     * reader's next move differs for each. None of them may borrow another's wording: an
     * expired code needs a new code, a refusal needs a different answer on GitHub, and a
     * cancellation needs nothing at all.
     */
    "settings.github.denied": {
        en: [
            "Sign-in was refused on the GitHub page.",
            "Sign-in was refused on the GitHub page.",
            "The sign-in was refused on the GitHub page.",
            "The sign-in was refused on the GitHub page, so nothing came back.",
            "The sign-in was refused on the GitHub page, so the app came back empty-handed.",
        ],
        yue: [
            "登入喺 GitHub 嗰版俾人拒絕咗。",
            "登入喺 GitHub 嗰版俾人拒絕咗。",
            "呢次登入喺 GitHub 嗰版俾人拒絕咗。",
            "呢次登入喺 GitHub 嗰版俾人拒絕咗，所以乜都攞唔到。",
            "呢次登入喺 GitHub 嗰版俾人拒絕咗，程式空手而回。",
        ],
    },
    "settings.github.deniedNote": {
        en: [
            "Nothing was stored and nothing changed. Starting again asks for a new code.",
            "Nothing was stored and nothing changed. Starting again asks for a new code.",
            "Nothing was stored and nothing changed. Starting again asks GitHub for a new code.",
            "Nothing was stored and nothing changed here. Starting again asks GitHub for a new code.",
            "Nothing was stored and nothing changed here, so there is nothing to tidy up. Starting again asks GitHub for a new code.",
        ],
        yue: [
            "冇儲低任何嘢，亦冇改動過任何嘢。重新開始會攞一個新 code。",
            "冇儲低任何嘢，亦冇改動過任何嘢。重新開始會攞一個新 code。",
            "冇儲低任何嘢，亦冇改動過任何嘢。重新開始會向 GitHub 攞一個新 code。",
            "呢度冇儲低任何嘢，亦冇改動過任何嘢。重新開始會向 GitHub 攞一個新 code。",
            "呢度冇儲低任何嘢，亦冇改動過任何嘢，所以冇手尾要執。重新開始會向 GitHub 攞一個新 code。",
        ],
    },
    "settings.github.expired": {
        en: [
            "The code ran out of time before it was entered. Codes last about fifteen minutes.",
            "The code ran out of time before it was entered. Codes last about fifteen minutes.",
            "The code ran out of time before it was entered. Codes last about fifteen minutes each.",
            "The code ran out of time before it was entered. Codes last about fifteen minutes, and that one is past it.",
            "The code ran out of time before it was entered. Codes last about fifteen minutes, and that one used every second of them.",
        ],
        yue: [
            "個 code 未輸入就已經過咗時。啲 code 大約得十五分鐘。",
            "個 code 未輸入就已經過咗時。啲 code 大約得十五分鐘。",
            "個 code 未輸入就已經過咗時。每個 code 大約得十五分鐘。",
            "個 code 未輸入就已經過咗時。每個 code 大約得十五分鐘，嗰個已經過晒。",
            "個 code 未輸入就已經過咗時。每個 code 大約得十五分鐘，嗰個一秒都冇嘥，全部用晒。",
        ],
    },
    "settings.github.cancelled": {
        en: [
            "Sign-in cancelled. Nothing was stored, and nothing on GitHub changed.",
            "Sign-in cancelled. Nothing was stored, and nothing on GitHub changed.",
            "The sign-in was cancelled. Nothing was stored, and nothing on GitHub changed.",
            "The sign-in was cancelled. Nothing was stored, and nothing on GitHub changed either.",
            "The sign-in was cancelled and left no trace. Nothing was stored, and nothing on GitHub changed.",
        ],
        yue: [
            "登入取消咗。冇儲低任何嘢，GitHub 嗰邊亦冇任何改動。",
            "登入取消咗。冇儲低任何嘢，GitHub 嗰邊亦冇任何改動。",
            "呢次登入取消咗。冇儲低任何嘢，GitHub 嗰邊亦冇任何改動。",
            "呢次登入取消咗。冇儲低任何嘢，GitHub 嗰邊亦都冇任何改動。",
            "呢次登入取消咗，乾乾淨淨冇留低痕跡。冇儲低任何嘢，GitHub 嗰邊亦都冇任何改動。",
        ],
    },
    /*
     * The one that reports nothing about *why*, because the panel does not know. It says
     * only that the flow did not finish, and no level may improve on that by guessing at a
     * cause the app never learned.
     */
    "settings.github.failed": {
        en: [
            "The sign-in did not finish.",
            "The sign-in did not finish.",
            "That sign-in did not finish.",
            "That sign-in did not finish, and stopped short of signing you in.",
            "That sign-in did not finish. It got part of the way and stopped, so you are not signed in.",
        ],
        yue: [
            "呢次登入冇完成。",
            "呢次登入冇完成。",
            "嗰次登入冇完成。",
            "嗰次登入冇完成，行到一半就停低，你冇登入到。",
            "嗰次登入冇完成。行到一半就停咗，所以你而家仲係未登入。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Signed in, but not with enough                                    */
    /* ---------------------------------------------------------------- */

    /*
     * Two keys, two routes in, one fact: the account is signed in and the app still cannot
     * do its job, because `{scopes}` are missing. The scope strings are GitHub's own and
     * stay identical in both languages, since a translated `read:org` is a permission
     * nobody can go and grant.
     */
    "settings.github.missingScopes": {
        en: [
            "The account signed in without these permissions, which the app needs: {scopes}.",
            "The account signed in without these permissions, which the app needs: {scopes}.",
            "The account is signed in, but without these permissions, which the app needs: {scopes}.",
            "The account is signed in, but it is missing these permissions, which the app needs: {scopes}.",
            "The account is signed in, but it turned up missing these permissions, which the app needs: {scopes}. Signed in is not the same as signed in with enough.",
        ],
        yue: [
            "個帳戶登入咗，但係冇呢啲程式需要嘅權限：{scopes}。",
            "個帳戶登入咗，但係冇呢啲程式需要嘅權限：{scopes}。",
            "個帳戶已經登入咗，不過冇呢啲程式需要嘅權限：{scopes}。",
            "個帳戶已經登入咗，不過就係欠咗呢啲程式需要嘅權限：{scopes}。",
            "個帳戶已經登入咗，不過就係欠咗呢啲程式需要嘅權限：{scopes}。登入咗同權限夠，係兩回事。",
        ],
    },
    "settings.github.tokenMissingScopes": {
        en: [
            "That token is missing these permissions: {scopes}. A new token with them is what fixes it.",
            "That token is missing these permissions: {scopes}. A new token with them is what fixes it.",
            "That token is missing these permissions: {scopes}. A new token carrying them is what fixes it.",
            "That token is missing these permissions: {scopes}. Only a new token carrying them fixes it.",
            "That token is missing these permissions: {scopes}. There is no way round it from here: only a new token carrying them fixes it.",
        ],
        yue: [
            "嗰個 token 欠咗呢啲權限：{scopes}。要整個有齊呢啲權限嘅新 token 先搞得掂。",
            "嗰個 token 欠咗呢啲權限：{scopes}。要整個有齊呢啲權限嘅新 token 先搞得掂。",
            "嗰個 token 欠咗呢啲權限：{scopes}。要整個帶齊呢啲權限嘅新 token 先搞得掂。",
            "嗰個 token 欠咗呢啲權限：{scopes}。淨係整個帶齊呢啲權限嘅新 token 先搞得掂。",
            "嗰個 token 欠咗呢啲權限：{scopes}。呢度冇捷徑行，淨係整個帶齊呢啲權限嘅新 token 先搞得掂。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The status row's two footnotes                                    */
    /* ---------------------------------------------------------------- */

    /*
     * An empty permissions list means two opposite things depending on the token, so this
     * one exists to say which: silence from the token, not an absence of grants. Reading it
     * as "no permissions" sends somebody off to re-issue a token that was fine.
     */
    "settings.github.scopesNotReported": {
        en: [
            "This kind of token reports no scope list. Its permissions live on the application and on the repositories it was given.",
            "This kind of token reports no scope list. Its permissions live on the application and on the repositories it was given.",
            "This kind of token reports no scope list at all. Its permissions live on the application and on the repositories it was given.",
            "This kind of token reports no scope list at all, so there is nothing to show here. Its permissions live on the application and on the repositories it was given.",
            "This kind of token reports no scope list at all, so an empty space here means silence rather than nothing granted. Its permissions live on the application and on the repositories it was given.",
        ],
        yue: [
            "呢類 token 唔會報 scope 清單。佢嘅權限係喺 application 同埋分配俾佢嘅 repository 上面。",
            "呢類 token 唔會報 scope 清單。佢嘅權限係喺 application 同埋分配俾佢嘅 repository 上面。",
            "呢類 token 完全唔會報 scope 清單。佢嘅權限係喺 application 同埋分配俾佢嘅 repository 上面。",
            "呢類 token 完全唔會報 scope 清單，所以呢度冇嘢可以顯示。佢嘅權限係喺 application 同埋分配俾佢嘅 repository 上面。",
            "呢類 token 完全唔會報 scope 清單，所以呢度一片空白係佢唔出聲，唔係代表冇授權。佢嘅權限係喺 application 同埋分配俾佢嘅 repository 上面。",
        ],
    },
    /* Sits directly after the expiry date, which is why it stays a parenthesis. */
    "settings.github.renews": {
        en: [
            "(renewed on its own before it runs out)",
            "(renewed on its own before it runs out)",
            "(renewed on its own before it runs out, with nothing to do)",
            "(renewed on its own before it runs out, so there is nothing to do)",
            "(renewed on its own before it runs out, so this date is a formality)",
        ],
        yue: [
            "（到期之前會自己續期）",
            "（到期之前會自己續期）",
            "（到期之前會自己續期，你唔使做嘢）",
            "（到期之前會自己續期，所以唔使你做嘢）",
            "（到期之前會自己續期，所以呢個日期只係做個樣）",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The token form                                                    */
    /* ---------------------------------------------------------------- */

    /*
     * The token is checked with GitHub on the way in rather than at the first render, so a
     * token with the wrong permissions is refused here in one sentence instead of two
     * screens later in the middle of a job. That is the sentence, and the check survives
     * every level.
     */
    "settings.github.tokenExplain": {
        en: [
            "A personal access token works instead of the browser sign-in, and is the way in when a network blocks GitHub's device sign-in. It is checked with GitHub before it is accepted.",
            "A personal access token works instead of the browser sign-in, and is the way in when a network blocks GitHub's device sign-in. It is checked with GitHub before it is accepted.",
            "A personal access token works instead of the browser sign-in, and is the way in when a network blocks GitHub's device sign-in. It is checked with GitHub before it is accepted, not at the first render.",
            "A personal access token works instead of the browser sign-in, and is the way in when a network blocks GitHub's device sign-in. It is checked with GitHub before it is accepted, rather than two screens later.",
            "A personal access token works instead of the browser sign-in, and is the way in when a network blocks GitHub's device sign-in. It is checked with GitHub before it is accepted, rather than two screens later in the middle of a job.",
        ],
        yue: [
            "personal access token 可以代替瀏覽器登入，如果個網絡封咗 GitHub 嘅裝置登入，呢個就係入口。佢會先同 GitHub 核對過先接受。",
            "personal access token 可以代替瀏覽器登入，如果個網絡封咗 GitHub 嘅裝置登入，呢個就係入口。佢會先同 GitHub 核對過先接受。",
            "personal access token 可以代替瀏覽器登入，如果個網絡封咗 GitHub 嘅裝置登入，呢個就係入口。佢會先同 GitHub 核對過先接受，唔會等到第一次算圖先講。",
            "personal access token 可以代替瀏覽器登入，如果個網絡封咗 GitHub 嘅裝置登入，呢個就係入口。佢會先同 GitHub 核對過先接受，唔會遲兩版先話你知。",
            "personal access token 可以代替瀏覽器登入，如果個網絡封咗 GitHub 嘅裝置登入，呢個就係入口。佢會先同 GitHub 核對過先接受，唔會等到你做到一半、遲兩版先話你知。",
        ],
    },
    /* The text of a link out to github.com, so the destination stays in the sentence. */
    "settings.github.tokenPage": {
        en: [
            "Make a token on github.com",
            "Make a token on github.com",
            "Make a new token on github.com",
            "Go and make a token on github.com",
            "Go and make yourself a token on github.com",
        ],
        yue: [
            "喺 github.com 整一個 token",
            "喺 github.com 整一個 token",
            "喺 github.com 整一個新 token",
            "去 github.com 整一個 token",
            "去 github.com 整返個 token 俾自己",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const GITHUB_FIXED = {
    /* The account row's own actions. */
    "settings.github.manageAccess": {
        en: "Review this app's access on GitHub",
        yue: "喺 GitHub 度檢視呢個程式嘅存取權",
    },
    "settings.github.orToken": {
        en: "Or sign in with a token instead",
        yue: "或者改用 token 登入",
    },

    /* The device flow, in the order the panel walks through it. */
    "settings.github.start": { en: "Sign in with a browser", yue: "用瀏覽器登入" },
    "settings.github.asking": { en: "Asking GitHub for a code…", yue: "向 GitHub 攞緊個 code…" },
    /*
     * `{spelled}` is the device code with its characters separated, so a screen reader says
     * it letter by letter instead of trying to pronounce it as a word. Never shorten this
     * label to the point where the code stops being in it.
     */
    "settings.github.codeLabel": {
        en: "Your sign-in code is {spelled}",
        yue: "你嘅登入碼係 {spelled}",
    },
    "settings.github.copyCode": { en: "Copy the sign-in code", yue: "複製登入碼" },
    "settings.github.copyCodeLabel": { en: "Copy the code", yue: "複製個 code" },
    "settings.github.openPage": { en: "Open the GitHub page", yue: "開 GitHub 嗰版" },
    "settings.github.cancel": { en: "Cancel the sign-in", yue: "取消登入" },
    "settings.github.tryAgain": { en: "Try again", yue: "再試多次" },
    "settings.github.freshCode": { en: "Get a new code", yue: "攞個新 code" },
    "settings.github.useOAuth": {
        en: "Sign in with the OAuth application instead",
        yue: "改用 OAuth application 登入",
    },

    /*
     * How the app got its token. These three are GitHub's own names for three different
     * things, and the difference decides whether a scope list exists at all, so they are
     * kept as names rather than translated into a description of each.
     */
    "settings.github.source.app": { en: "GitHub App", yue: "GitHub App" },
    "settings.github.source.oauth": { en: "OAuth application", yue: "OAuth application" },
    "settings.github.source.token": { en: "Personal access token", yue: "personal access token" },

    /* The status row's field names. */
    "settings.github.signedIn": { en: "Signed in", yue: "已登入" },
    "settings.github.field.account": { en: "Account", yue: "帳戶" },
    "settings.github.field.source": { en: "Signed in with", yue: "用咩登入" },
    "settings.github.field.since": { en: "Since", yue: "由幾時開始" },
    "settings.github.field.expires": { en: "Expires", yue: "幾時到期" },
    "settings.github.noExpiry": { en: "Does not expire", yue: "唔會到期" },
    "settings.github.field.scopes": { en: "Permissions", yue: "權限" },
    /* An empty grant, as distinct from a token that reports no list. See the voiced key. */
    "settings.github.noScopes": { en: "None granted", yue: "冇授權任何權限" },

    /*
     * Signing out, and the confirmation it opens. There is no "stay signed in" key here any
     * more: the confirmation used to be a bespoke inline yes/no, and now it is
     * ConfigSuperConfirm, the shared super-confirmation gate, whose Emergency exit and
     * Escape path are its own component's copy rather than this surface's.
     */
    "settings.github.signOut": { en: "Sign out", yue: "登出" },
    "settings.github.confirmTitle": { en: "Confirm signing out", yue: "確認登出" },
    "settings.github.confirmSignOut": { en: "Sign out and revoke", yue: "登出並撤銷" },

    /* The token form. The field is a password field; these two label its reveal toggle. */
    "settings.github.tokenField": { en: "Personal access token", yue: "personal access token" },
    "settings.github.hideToken": { en: "Hide the token", yue: "收埋個 token" },
    "settings.github.showToken": { en: "Show the token", yue: "顯示個 token" },
    "settings.github.tokenSubmit": { en: "Sign in with this token", yue: "用呢個 token 登入" },
} as const satisfies Record<string, FixedString>;

export const GITHUB_FACTS = {
    // A sign-in that ends with the app is a fact about this machine, not about the account.
    "settings.github.noCredentialStore": {
        en: ["no credential store", "until the app closes"],
        yue: ["冇程式用得嘅憑證儲存區", "程式閂"],
    },
    "settings.github.notPersisted": {
        en: ["no credential store", "until the app closes", "again"],
        yue: ["冇程式用得嘅憑證儲存區", "程式閂", "再登入過"],
    },

    // Confirmed dead everywhere ...
    "settings.github.revoked": {
        en: ["Signed out", "GitHub confirmed", "revoked", "works nowhere any more"],
        yue: ["已登出", "GitHub 已確認", "撤銷", "唔再有效"],
    },
    // ... versus gone from here, with the grant possibly still standing on the account.
    "settings.github.notRevoked": {
        en: [
            "deleted from this computer",
            "did not confirm",
            "may still be listed on your account",
        ],
        yue: ["呢部電腦刪走", "冇確認撤銷", "可能仲喺你個帳戶"],
    },
    "settings.github.confirmBody": {
        en: [
            "deletes the stored token from this computer",
            "revoke",
            "stops working everywhere",
            "Nothing you have rendered or downloaded is touched",
            "new token",
        ],
        yue: ["由呢部電腦刪走", "撤銷", "所有地方都失效", "唔會郁到", "新 token"],
    },

    // The two security clauses of the device flow, kept word for word.
    "settings.github.deviceExplain": {
        en: ["github.com", "No password is typed into this app", "stays in the app"],
        yue: ["github.com", "唔使喺呢個程式打密碼", "留喺程式入面"],
    },
    "settings.github.noClient": {
        en: ["no GitHub application configured", "browser sign-in", "personal access token"],
        yue: ["冇設定 GitHub application", "瀏覽器登入", "personal access token"],
    },
    "settings.github.adopted": {
        en: ["already waiting for approval", "code is not here", "fresh code"],
        yue: ["等緊批准", "唔喺呢度顯示", "新 code"],
    },
    "settings.github.typeThis": {
        en: ["GitHub page", "come back here", "This screen changes"],
        yue: ["GitHub 嗰版", "返返嚟", "呢個畫面會自己變"],
    },
    "settings.github.copied": { en: ["code", "clipboard"], yue: ["code", "剪貼簿"] },
    // The code survived the failed copy, so every level says where it still is.
    "settings.github.copyFailed": {
        en: ["clipboard could not be reached", "typed", "on screen above"],
        yue: ["掂唔到剪貼簿", "打", "上面畫面"],
    },
    "settings.github.browserOpened": { en: ["browser", "address:"], yue: ["瀏覽器", "網址："] },
    "settings.github.browserRefused": {
        en: ["browser", "open this address yourself:"],
        yue: ["開唔到瀏覽器", "自己開呢個網址："],
    },
    "settings.github.expiresIn": { en: ["{clock}", "stops working"], yue: ["{clock}", "失效"] },
    "settings.github.approved": {
        en: ["Approved on GitHub", "signed in"],
        yue: ["GitHub 嗰邊批咗", "登入咗"],
    },

    // Four endings, four different next moves, so none of them may borrow another's words.
    "settings.github.denied": {
        en: ["refused on the GitHub page"],
        yue: ["GitHub 嗰版", "拒絕咗"],
    },
    "settings.github.deniedNote": {
        en: ["Nothing was stored", "nothing changed", "new code"],
        yue: ["冇儲低任何嘢", "冇改動過任何嘢", "新 code"],
    },
    "settings.github.expired": {
        en: ["ran out of time", "fifteen minutes"],
        yue: ["過咗時", "十五分鐘"],
    },
    "settings.github.cancelled": {
        en: ["cancelled", "Nothing was stored", "nothing on GitHub changed"],
        yue: ["取消咗", "冇儲低任何嘢", "冇任何改動"],
    },
    "settings.github.failed": { en: ["did not finish"], yue: ["冇完成"] },

    // The scope strings are GitHub's own and are the only actionable part of the sentence.
    "settings.github.missingScopes": {
        en: ["{scopes}", "signed in", "the app needs"],
        yue: ["{scopes}", "登入咗", "程式需要嘅權限"],
    },
    "settings.github.tokenMissingScopes": {
        en: ["{scopes}", "missing these permissions", "new token"],
        yue: ["{scopes}", "欠咗呢啲權限", "新 token"],
    },

    // Silence from the token, not an absence of permissions.
    "settings.github.scopesNotReported": {
        en: ["reports no scope list", "the application", "repositories"],
        yue: ["唔會報 scope 清單", "application", "repository"],
    },
    "settings.github.renews": {
        en: ["renewed on its own", "before it runs out"],
        yue: ["自己續期", "到期之前"],
    },

    "settings.github.tokenExplain": {
        en: [
            "personal access token",
            "browser sign-in",
            "checked with GitHub before it is accepted",
        ],
        yue: ["personal access token", "瀏覽器登入", "同 GitHub 核對過先接受"],
    },
    "settings.github.tokenPage": { en: ["token", "github.com"], yue: ["token", "github.com"] },
} as const satisfies Record<
    keyof typeof GITHUB_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
