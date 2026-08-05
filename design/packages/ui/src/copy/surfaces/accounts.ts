/**
 * The multi-account list: every GitHub account this computer has stored, not only the one
 * signed in right now.
 *
 * A new surface file rather than an addition to `github.ts` next door, because this lane
 * owns exactly this file and nothing else in `copy/` - see the house rule that a new
 * surface lands here, unregistered, and integration is what spreads it into the catalogue
 * everything else reads from. Until then these keys resolve through `useI18n().t`'s own
 * fallback argument, which is why every call site below carries the English text a second
 * time: the same pattern `GITHUB_FIXED` and `GITHUB_VOICED` already use.
 *
 * ## The one rule this surface keeps from its neighbour
 *
 * Every string here is within reach of a credential exactly as `github.ts`'s own header
 * says, so the same ban holds: no level ever quotes a token, and a refusal names what was
 * wrong (no such account, could not switch, could not renew) without repeating anything
 * secret. Account logins, scope names and the main process's own reasons stay identical in
 * both languages, because a translated `read:org` or a translated login sends the reader
 * looking for something that does not exist.
 *
 * ## The fact every removal has to keep
 *
 * Removing the *active* account is not always the end of being signed in: another stored
 * account can become active in its place. `settings.github.accounts.removedFallback` and
 * `settings.github.accounts.removedNone` are the two ways that goes, and they may not be
 * rounded into one another at any level - the whole reason the list reports a fallback
 * account by name is so a person does not have to check for themselves which is true.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const ACCOUNTS_VOICED = {
    /*
     * No accounts stored at all. This is not an error - it is the same honest "not signed
     * in" story the single-account row always told, said from the list's own empty space
     * instead, with the same one obvious next step.
     */
    "settings.github.accounts.empty": {
        en: [
            "No accounts are signed in on this computer. Signing in is optional; public worlds and public releases work without it.",
            "No accounts are signed in on this computer. Signing in is optional; public worlds and public releases work without it.",
            "No accounts are signed in on this computer yet. Signing in is optional; public worlds and public releases work fine without it.",
            "No accounts are signed in on this computer yet. Signing in is optional, and public worlds and public releases keep working fine without it.",
            "Nobody is signed in on this computer yet, and that is a perfectly good place to be. Signing in is optional, and public worlds and public releases keep working fine without it.",
        ],
        yue: [
            "呢部電腦而家冇任何帳戶登入緊。登入係自由選擇嘅，公開世界同公開發佈就算冇登入都用得。",
            "呢部電腦而家冇任何帳戶登入緊。登入係自由選擇嘅，公開世界同公開發佈就算冇登入都用得。",
            "呢部電腦而家仲未有任何帳戶登入。登入係自由選擇嘅，公開世界同公開發佈冇登入一樣用得。",
            "呢部電腦而家仲未有任何帳戶登入。登入純粹係自由選擇，公開世界同公開發佈冇登入都一樣用得好地地。",
            "呢部電腦而家一個帳戶都未登入，其實幾好呀咁樣。登入純粹係自由選擇，公開世界同公開發佈冇登入都一樣用得好地地。",
        ],
    },
    /* The body of the per-account sign-out confirmation, the same four facts as the
     * single-account one but naming the one account this row is about. */
    "settings.github.accounts.confirmSignOutBody": {
        en: [
            "Signing this account out deletes its stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing this account in again issues a new token.",
            "Signing this account out deletes its stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than merely being forgotten here. Nothing you have rendered or downloaded is touched, and signing this account in again issues a new token.",
            "Signing this account out deletes its stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than just being forgotten here. Nothing you have rendered or downloaded is touched, and signing this account in again issues a new token.",
            "Signing this account out deletes its stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than just being quietly forgotten here. Nothing you have rendered or downloaded is touched, and signing this account in again issues a new token.",
            "Signing this account out deletes its stored token from this computer and asks GitHub to revoke it, so it stops working everywhere rather than just being quietly forgotten here. That thoroughness is on purpose. Nothing you have rendered or downloaded is touched, and signing this account in again issues a new token.",
        ],
        yue: [
            "將呢個帳戶登出會將佢儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，唔淨係喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入呢個帳戶會發一個新 token。",
            "將呢個帳戶登出會將佢儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，唔淨係喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入呢個帳戶會發一個新 token。",
            "將呢個帳戶登出會將佢儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，而唔係淨係喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入呢個帳戶會發一個新 token。",
            "將呢個帳戶登出會將佢儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，而唔係靜靜雞喺呢部機唔記得咗。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入呢個帳戶會發一個新 token。",
            "將呢個帳戶登出會將佢儲低嘅 token 由呢部電腦刪走，同時要求 GitHub 撤銷佢，所以佢會喺所有地方都失效，而唔係靜靜雞喺呢部機唔記得咗。做得咁絕係特登嘅。你算好或者下載咗嘅嘢一樣都唔會郁到，再登入呢個帳戶會發一個新 token。",
        ],
    },
    /*
     * Whether GitHub actually confirmed the revocation, or only forgot the token locally.
     * This is the same distinction `github.ts`'s single-account row treats as
     * security-critical (see its own header) - rounding "revoked" and "not revoked" into
     * one message tells somebody they are safe when they are not, so every removal in this
     * list says which one actually happened, alongside (never instead of) the fallback or
     * fully-signed-out message next to it.
     */
    "settings.github.accounts.revoked": {
        en: [
            "GitHub confirmed the token was revoked, so it works nowhere any more.",
            "GitHub confirmed the token was revoked, so it works nowhere any more.",
            "GitHub confirmed the token was revoked, so it works nowhere any more, here or anywhere else.",
            "GitHub confirmed the token was revoked, so it works nowhere any more. Not here, not anywhere else.",
            "GitHub confirmed the token was revoked, so it works nowhere any more. That one is a doorstop now.",
        ],
        yue: [
            "GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。",
            "GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。",
            "GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效，呢度定其他地方都一樣。",
            "GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。呢度冇用，其他地方一樣冇用。",
            "GitHub 已確認個 token 被撤銷，所以佢喺邊度都唔再有效。嗰個而家淨係得個名。",
        ],
    },
    /* The other half of that same distinction: the token is gone from here, but GitHub
     * never confirmed it is gone everywhere, so the grant may still be standing. */
    "settings.github.accounts.notRevoked": {
        en: [
            "The token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
            "The token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account.",
            "The token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account over there.",
            "The token was deleted from this computer. GitHub did not confirm a revocation, so the grant may still be listed on your account, which is worth a look.",
            "The token was deleted from this computer. GitHub did not confirm a revocation though, so the grant may still be listed on your account, and this app is not going to pretend otherwise.",
        ],
        yue: [
            "個 token 已經喺呢部電腦刪走，但 GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住。",
            "個 token 已經喺呢部電腦刪走，但 GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住。",
            "個 token 已經喺呢部電腦刪走，但 GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶嗰邊列住。",
            "個 token 已經喺呢部電腦刪走，但 GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住，值得去睇一睇。",
            "個 token 已經喺呢部電腦刪走，不過 GitHub 冇確認撤銷，所以嗰個授權可能仲喺你個帳戶度列住，呢個程式唔會扮唔知。",
        ],
    },
    /*
     * The active account was removed and another stored one took its place. Names the
     * fallback account so nobody has to go and check which one it landed on.
     */
    "settings.github.accounts.removedFallback": {
        en: [
            "That account is signed out. {login} is now the active account.",
            "That account is signed out. {login} is now the active account.",
            "That account is signed out, and {login} is now the active account.",
            "That account is signed out, and {login} has taken over as the active account.",
            "That account is signed out, and {login} quietly stepped up to become the active account.",
        ],
        yue: [
            "嗰個帳戶已經登出。而家用緊嘅帳戶係 {login}。",
            "嗰個帳戶已經登出。而家用緊嘅帳戶係 {login}。",
            "嗰個帳戶已經登出，而家用緊嘅帳戶變咗 {login}。",
            "嗰個帳戶已經登出，{login} 已經頂上做返而家用緊嘅帳戶。",
            "嗰個帳戶已經登出，{login} 靜靜雞頂上，做返而家用緊嘅帳戶。",
        ],
    },
    /* The active account was removed and nothing else was stored, so this is a genuine
     * sign-out - the same terminal state the single-account row has always shown. */
    "settings.github.accounts.removedNone": {
        en: [
            "That account is signed out, and no other account is stored. Nobody is signed in now.",
            "That account is signed out, and no other account is stored. Nobody is signed in now.",
            "That account is signed out, and no other account is stored. Nobody is signed in now, and that is the honest state of things.",
            "That account is signed out, and no other account is stored. Nobody is signed in now, and there was no fallback to quietly land on.",
            "That account is signed out, and no other account is stored. Nobody is signed in now, and there was nobody standing by to catch it.",
        ],
        yue: [
            "嗰個帳戶已經登出，亦冇儲低第二個帳戶。而家冇任何帳戶登入緊。",
            "嗰個帳戶已經登出，亦冇儲低第二個帳戶。而家冇任何帳戶登入緊。",
            "嗰個帳戶已經登出，亦冇儲低第二個帳戶。而家冇任何帳戶登入緊，事實就係咁。",
            "嗰個帳戶已經登出，亦冇儲低第二個帳戶。而家冇任何帳戶登入緊，冇後備可以頂得上。",
            "嗰個帳戶已經登出，亦冇儲低第二個帳戶。而家冇任何帳戶登入緊，身邊冇人接得住。",
        ],
    },
    /* A refresh that could not renew the token. The scope names, if any, are the main
     * process's own and stay untranslated. */
    "settings.github.accounts.refreshFailed": {
        en: [
            "That account's token could not be renewed: {reason}",
            "That account's token could not be renewed: {reason}",
            "That account's token could not be renewed just now: {reason}",
            "That account's token could not be renewed just now, and here is why: {reason}",
            "That account's token could not be renewed just now, and here is exactly why: {reason}",
        ],
        yue: [
            "嗰個帳戶嘅 token 續唔到期：{reason}",
            "嗰個帳戶嘅 token 續唔到期：{reason}",
            "而家嗰個帳戶嘅 token 續唔到期：{reason}",
            "而家嗰個帳戶嘅 token 續唔到期，原因係：{reason}",
            "而家嗰個帳戶嘅 token 死都續唔到期，實際原因係：{reason}",
        ],
    },
    /* Switching which account is active. Nothing is deleted and nothing is revoked, which
     * is the one thing that keeps this from reading like the sign-out messages beside it. */
    "settings.github.accounts.switched": {
        en: [
            "{login} is now the active account.",
            "{login} is now the active account.",
            "Switched. {login} is now the active account.",
            "Switched. {login} is now the active account, and every other stored account stays signed in behind it.",
            "Switched. {login} is the active account now and takes the wheel, with every other stored account staying signed in behind it, waiting its turn.",
        ],
        yue: [
            "而家用緊嘅帳戶係 {login}。",
            "而家用緊嘅帳戶係 {login}。",
            "切換咗。而家用緊嘅帳戶係 {login}。",
            "切換咗。而家用緊嘅帳戶係 {login}，其他儲低嘅帳戶照樣留喺度登入緊。",
            "切換咗。而家用緊嘅帳戶係 {login}，佢揸埋大旗，其他儲低嘅帳戶照樣喺後面登入緊，等緊輪到自己。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const ACCOUNTS_FIXED = {
    "settings.github.accounts.title": { en: "Signed-in accounts", yue: "已登入嘅帳戶" },
    "settings.github.accounts.listLabel": {
        en: "Signed-in GitHub accounts",
        yue: "已登入嘅 GitHub 帳戶",
    },
    "settings.github.accounts.searchLabel": { en: "Search accounts", yue: "搜尋帳戶" },
    "settings.github.accounts.searchHint": { en: "a login, or a permission", yue: "登入名或者權限" },
    "settings.github.accounts.searchSummary": {
        en: "Showing {shown} of {total}.",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個。",
    },
    "settings.github.accounts.addAccount": { en: "Add account", yue: "新增帳戶" },
    "settings.github.accounts.closeAdd": { en: "Close", yue: "關閉" },
    "settings.github.accounts.active": { en: "Active", yue: "使用緊" },
    "settings.github.accounts.setActive": { en: "Make active", yue: "設為使用中" },
    "settings.github.accounts.signOut": { en: "Sign out", yue: "登出" },
    "settings.github.accounts.confirmSignOutTitle": { en: "Confirm signing out", yue: "確認登出" },
    "settings.github.accounts.confirmSignOut": { en: "Sign out and revoke", yue: "登出並撤銷" },
    "settings.github.accounts.keepSignedIn": { en: "Keep this account", yue: "繼續保留呢個帳戶" },
    "settings.github.accounts.refresh": { en: "Refresh", yue: "重新整理" },
    "settings.github.accounts.refreshing": { en: "Refreshing…", yue: "重新整理緊…" },
} as const satisfies Record<string, FixedString>;

export const ACCOUNTS_FACTS = {
    "settings.github.accounts.empty": {
        en: ["signed in", "optional"],
        yue: ["登入", "自由選擇"],
    },
    "settings.github.accounts.confirmSignOutBody": {
        en: [
            "deletes its stored token from this computer",
            "revoke",
            "stops working everywhere",
            "Nothing you have rendered or downloaded is touched",
            "new token",
        ],
        yue: ["由呢部電腦刪走", "撤銷", "所有地方都失效", "唔會郁到", "新 token"],
    },
    "settings.github.accounts.revoked": {
        en: ["GitHub confirmed", "revoked", "works nowhere any more"],
        yue: ["GitHub 已確認", "撤銷", "唔再有效"],
    },
    "settings.github.accounts.notRevoked": {
        en: ["deleted from this computer", "did not confirm", "may still be listed on your account"],
        yue: ["呢部電腦刪走", "冇確認撤銷", "可能仲喺你個帳戶"],
    },
    "settings.github.accounts.removedFallback": {
        en: ["signed out", "{login}", "active account"],
        yue: ["已經登出", "{login}", "用緊嘅帳戶"],
    },
    "settings.github.accounts.removedNone": {
        en: ["signed out", "no other account is stored", "Nobody is signed in now"],
        yue: ["已經登出", "冇儲低第二個帳戶", "冇任何帳戶登入緊"],
    },
    "settings.github.accounts.refreshFailed": {
        en: ["could not be renewed", "{reason}"],
        yue: ["續唔到期", "{reason}"],
    },
    "settings.github.accounts.switched": {
        en: ["{login}", "active account"],
        yue: ["{login}", "用緊嘅帳戶"],
    },
} as const satisfies Record<
    keyof typeof ACCOUNTS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
