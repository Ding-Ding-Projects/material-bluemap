/**
 * The words the update surfaces say, in three language modes at five funny levels each.
 *
 * Its own catalogue rather than an entry in `copy/appCopy.ts`, for the same reason
 * `components/setup/setupStrings.ts` has one: this surface is self-contained, and a feature
 * that carries its own copy can be added, tested and reviewed without touching a catalogue
 * every other screen also reads from. It resolves the mode and the two levels from the same
 * persisted store everything else uses (`setup/setupI18n.ts`), so there is exactly one
 * language setting in the application and this is not a second one.
 *
 * ## What the level may never touch
 *
 * Two things, and the split is structural rather than a convention somebody has to
 * remember:
 *
 *  - **Version numbers and dates.** They arrive as `{version}` placeholders and are
 *    interpolated after the string is chosen, so no level can reach them. A message that
 *    reads "0.2.0 is tapping its foot" at level 5 still says `0.2.0`, exactly.
 *  - **What a button does.** Every action label lives in {@link UPDATE_FIXED}, which has one
 *    string per language and never consults a level at all. There is no code path through
 *    which a funny level can reach the word "Restart".
 *
 * Everything else - the sentence around the fact - is styled freely, including the failure
 * copy, because the rule is voice-not-facts rather than a carve-out for serious categories.
 * A level-5 failure message is still required to say that nothing was installed and nothing
 * changed; it is simply allowed to be funny about it.
 */

import {
    funnyLevel,
    languageMode,
    type FunnyLevel,
    type TextPair,
    type TranslationVars,
} from "../setup/setupI18n.js";

/* -------------------------------------------------------------------------- */
/* Voiced: five levels per language                                           */
/* -------------------------------------------------------------------------- */

interface VoicedEntry {
    readonly en: readonly [string, string, string, string, string];
    readonly yue: readonly [string, string, string, string, string];
}

export const UPDATE_VOICED = {
    "update.banner.readyTitle": {
        en: [
            "Version {version} is available to install.",
            "Version {version} is ready to install.",
            "Version {version} is downloaded and ready to install.",
            "Version {version} is packed and waiting by the door.",
            "Version {version} has finished downloading and is tapping its foot.",
        ],
        yue: [
            "版本 {version} 可以安裝。",
            "版本 {version} 已經準備好安裝。",
            "版本 {version} 下載好晒，等你嚟裝。",
            "版本 {version} 執好包袱，喺門口等緊你。",
            "版本 {version} 下載完，坐喺度托住腮等你㩒掣。",
        ],
    },
    "update.banner.readyBody": {
        en: [
            "It installs when you restart the app. Nothing changes until then.",
            "Restart the app when you are ready and it installs itself. Nothing changes until then.",
            "Restart whenever it suits you and it installs itself. Nothing changes until then.",
            "Restart when it suits you and it slots itself in. Until then, absolutely nothing happens.",
            "Restart whenever you fancy and it swaps itself in. Until then it sits there quietly, touching nothing.",
        ],
        yue: [
            "重新開機就會安裝。喺咁之前唔會有任何改動。",
            "你幾時方便重新開機，佢就會自己裝好。喺咁之前唔會有任何改動。",
            "得閒重新開機佢就自己裝，未重開之前乜都唔會郁。",
            "你幾時得閒重開，佢就自己入位。未重開之前，佢乖乖哋唔會亂郁。",
            "你鍾意幾時重開都得，佢自己換位。未重開之前佢就坐喺角落頭，乜都唔掂。",
        ],
    },
    "update.banner.heldBody": {
        en: [
            "A render is running. Installing would stop it, so Restart is unavailable until it finishes.",
            "A render is running, so Restart is held. Installing now would throw that render away.",
            "A render is running, so Restart is held - installing now would throw those hours away.",
            "A render is mid-flight. Restart is held, because quitting now would bin the whole thing.",
            "A render is hard at work. Restart waits its turn, because quitting now would tip hours of it down the drain.",
        ],
        yue: [
            "而家有 render 進行中。安裝會中斷佢，所以重新開機暫時用唔到。",
            "而家有 render 進行中，所以重新開機暫時停用。依家裝會嘥晒個 render。",
            "有 render 做緊，所以重新開機停用先 - 依家裝就白做幾個鐘。",
            "有個 render 做到一半，重新開機要等佢。依家走人就成鑊嘢倒晒。",
            "有個 render 做到頭都大，重新開機要排隊等。依家走人，幾個鐘嘅心血即刻倒落坑渠。",
        ],
    },
    "update.status.idle": {
        en: [
            "No update check has run yet.",
            "No update check has run in this session yet.",
            "Nothing has been checked yet this session.",
            "Nothing has been checked yet this session.",
            "Nothing checked yet this session - the updater has not had its coffee.",
        ],
        yue: [
            "今次未檢查過更新。",
            "今次開機未檢查過更新。",
            "今次開機仲未 check 過更新。",
            "今次開機仲未 check 過更新。",
            "今次開機仲未 check 過，個更新器未飲夠咖啡。",
        ],
    },
    "update.status.checking": {
        en: [
            "Checking for updates.",
            "Checking for updates...",
            "Having a look for updates...",
            "Off asking the server whether anything newer exists...",
            "Currently pestering the server about whether anything newer exists...",
        ],
        yue: [
            "檢查緊更新。",
            "檢查緊有冇更新...",
            "去緊睇下有冇新版本...",
            "而家問緊個伺服器有冇新嘢...",
            "而家騷擾緊個伺服器，問佢有冇新版本...",
        ],
    },
    "update.status.upToDate": {
        en: [
            "This is the newest version.",
            "You are on the newest version.",
            "You are already on the newest version.",
            "Nothing newer out there. You are bang up to date.",
            "Nothing newer exists. You are so up to date it is almost showing off.",
        ],
        yue: [
            "呢個已經係最新版本。",
            "你已經用緊最新版本。",
            "你已經係最新版本，唔使做嘢。",
            "外面冇新過你嘅嘢，你已經最新。",
            "冇嘢新得過你，最新到有啲串。",
        ],
    },
    "update.status.downloading": {
        en: [
            "Downloading the update.",
            "Downloading the update in the background.",
            "Downloading the update in the background - carry on with what you were doing.",
            "Fetching the update in the background. Carry on; it will not get in your way.",
            "Quietly hauling the update down in the background. Carry on - it will not so much as clear its throat.",
        ],
        yue: [
            "下載緊更新。",
            "喺背景下載緊更新。",
            "喺背景下載緊更新，你繼續做你嘅嘢。",
            "喺後台搬緊更新落嚟，你照做嘢，佢唔會阻你。",
            "喺後台靜靜雞搬緊更新落嚟，你照做，佢連聲都唔會出。",
        ],
    },
    "update.status.available": {
        en: [
            "A newer version exists: {version}.",
            "A newer version exists: {version}. This build cannot install it by itself.",
            "There is a newer version out ({version}), but this build cannot install it by itself.",
            "There is a newer version out there ({version}) - this build just cannot fetch it for you.",
            "A newer version ({version}) is out in the world, and this build can only point at it wistfully.",
        ],
        yue: [
            "有新版本：{version}。",
            "有新版本：{version}。呢個 build 唔可以自己安裝。",
            "出咗新版本（{version}），不過呢個 build 唔識自己裝。",
            "外面有新版本（{version}），可惜呢個 build 攞唔到落嚟。",
            "外面出咗 {version}，呢個 build 淨係識指住佢流口水。",
        ],
    },
    "update.status.failed": {
        en: [
            "The last update check did not finish. Nothing was installed.",
            "The last update check did not finish. Nothing was installed and nothing changed.",
            "The last update check did not finish, so nothing was installed and nothing changed.",
            "The last update check fell over. Nothing was installed and nothing changed.",
            "The last update check fell flat on its face. Nothing was installed, nothing changed, no harm done.",
        ],
        yue: [
            "上次檢查更新未完成，冇裝到任何嘢。",
            "上次檢查更新未完成，冇裝到任何嘢，亦都冇改過任何嘢。",
            "上次檢查更新失敗，所以乜都冇裝，乜都冇改。",
            "上次檢查更新仆咗街。乜都冇裝，乜都冇改。",
            "上次檢查更新仆到成個五體投地。乜都冇裝，乜都冇改，冇損失。",
        ],
    },
    "update.status.unsupported": {
        en: [
            "This copy does not update itself.",
            "This copy of the app does not update itself.",
            "This copy of the app does not update itself. The reason is below.",
            "This copy does not update itself, and the reason is right below.",
            "This copy is not the self-updating sort. The reason is right below, no mystery.",
        ],
        yue: [
            "呢個版本唔會自動更新。",
            "呢個 app 副本唔會自己更新。",
            "呢個 app 副本唔會自己更新，原因喺下面。",
            "呢個副本唔識自己更新，原因就喺下面。",
            "呢個副本唔係自動更新嗰款，原因就寫喺下面，冇秘密。",
        ],
    },
} as const satisfies Readonly<Record<string, VoicedEntry>>;

/* -------------------------------------------------------------------------- */
/* Fixed: one string per language, whatever the level                         */
/* -------------------------------------------------------------------------- */

export const UPDATE_FIXED = {
    "update.title": { en: "Updates", yue: "更新" },
    "update.artwork.restartAlt": {
        en: "A completed update package ready beside a workstation while the open map remains safely visible",
        yue: "更新包已經喺工作站旁邊準備好，而畫面上開住嘅地圖依然安全保留",
    },
    "update.action.restart": { en: "Restart to install", yue: "重新開機安裝" },
    "update.action.later": { en: "Later", yue: "遲啲先" },
    "update.action.notes": { en: "Release notes", yue: "更新說明" },
    "update.action.check": { en: "Check for updates", yue: "檢查更新" },
    "update.action.showBanner": { en: "Show the update banner again", yue: "再顯示更新橫額" },
    "update.action.dismiss": { en: "Dismiss this banner", yue: "收起呢個橫額" },
    "update.label.installed": { en: "Installed version", yue: "已安裝版本" },
    "update.label.new": { en: "New version", yue: "新版本" },
    "update.label.lastChecked": { en: "Last checked", yue: "上次檢查" },
    "update.label.feed": { en: "Updates come from", yue: "更新來源" },
    "update.label.detail": { en: "What the updater reported", yue: "更新器嘅原話" },
    "update.label.state": { en: "Update state", yue: "更新狀態" },
} as const satisfies Readonly<Record<string, { readonly en: string; readonly yue: string }>>;

export type UpdateVoicedKey = keyof typeof UPDATE_VOICED;
export type UpdateFixedKey = keyof typeof UPDATE_FIXED;
export type UpdateCopyKey = UpdateVoicedKey | UpdateFixedKey;

export function isUpdateVoicedKey(key: UpdateCopyKey): key is UpdateVoicedKey {
    return Object.prototype.hasOwnProperty.call(UPDATE_VOICED, key);
}

function interpolate(template: string, vars: TranslationVars): string {
    if (Object.keys(vars).length === 0) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = vars[name];
        // An unresolved placeholder stays visible rather than becoming "undefined", so a
        // missing version reads as the bug it is instead of as copy somebody wrote.
        return value === undefined ? whole : String(value);
    });
}

/**
 * One string, in one language, at one level.
 *
 * Exported with the level as a parameter so a test can walk all five without touching the
 * persisted setting, which is what makes "no level changes a version number" checkable
 * rather than merely asserted in a comment.
 */
export function updateString(
    key: UpdateCopyKey,
    language: "en" | "yue",
    level: FunnyLevel,
): string {
    if (isUpdateVoicedKey(key)) {
        const strings = UPDATE_VOICED[key][language];
        return strings[level - 1] ?? strings[2];
    }
    return UPDATE_FIXED[key][language];
}

/** The English string at the current English level, whatever the mode is. */
export function updateEnglish(key: UpdateCopyKey, vars: TranslationVars = {}): string {
    return interpolate(updateString(key, "en", funnyLevel("en")), vars);
}

/** The Cantonese string at the current Cantonese level, whatever the mode is. */
export function updateCantonese(key: UpdateCopyKey, vars: TranslationVars = {}): string {
    return interpolate(updateString(key, "yue", funnyLevel("yue")), vars);
}

/**
 * The prominent label plus the compact secondary label.
 *
 * Bilingual mode keeps English prominent and puts Cantonese beneath it in a smaller style,
 * so both are present without the banner growing sideways at 800px.
 */
export function updatePair(key: UpdateCopyKey, vars: TranslationVars = {}): TextPair {
    const mode = languageMode();
    if (mode === "en") return { primary: updateEnglish(key, vars), secondary: null };
    if (mode === "yue") return { primary: updateCantonese(key, vars), secondary: null };
    return { primary: updateEnglish(key, vars), secondary: updateCantonese(key, vars) };
}

/**
 * One flat string, for the places that can only hold one: an `aria-label`, a `title`.
 *
 * Bilingual mode joins the two rather than dropping one, because an accessible name that
 * silently loses a language is worse than a long one.
 */
export function updateText(key: UpdateCopyKey, vars: TranslationVars = {}): string {
    const both = updatePair(key, vars);
    return both.secondary === null ? both.primary : `${both.primary} / ${both.secondary}`;
}
