/**
 * Every word the first-run flow and the consent settings row put on screen, in English
 * and in playful Hong Kong Cantonese.
 *
 * Three catalogues, because three kinds of string exist here and they have genuinely
 * different rules:
 *
 *   VOICED  Headings, leads and help text, where the wording really does read
 *           differently at different funny levels. Five English strings and five
 *           Cantonese strings each, index 0 being level 1 (fully professional) and
 *           index 4 being level 5 (maximum playfulness).
 *
 *   FIXED   Control labels, step names, mode names and the names of the funny levels
 *           themselves. One string per language. A level cannot usefully restyle the
 *           word "Back", and a button whose label moves under somebody is a button they
 *           have to re-read every time.
 *
 *   EXACT   The consent facts. One string per language, and the funny level may not
 *           touch them at any setting. These are the sentences that say what is being
 *           agreed to, what accepting permits, and what declining costs. `exactKeys()`
 *           enumerates them so a test can prove level 1 and level 5 produce byte
 *           identical text, rather than that being a promise in a comment.
 *
 * The quotation itself is not in any catalogue. It is `CONSENT_QUOTE`, upstream
 * BlueMap's own wording copied without a character changed, and it is shown in English
 * in every language mode. `CONSENT_QUOTE_TRANSLATION` sits underneath it in Cantonese
 * and bilingual modes, labelled as a reading of the quotation rather than as the
 * quotation, because replacing the text somebody is agreeing to with a translation of
 * it changes what they agreed to.
 *
 * Placeholders are `{name}`. Every level of an entry uses the same placeholders, so a
 * level can never drop a value out of a sentence.
 */

export interface VoicedString {
    readonly en: readonly [string, string, string, string, string];
    readonly yue: readonly [string, string, string, string, string];
}

export interface FixedString {
    readonly en: string;
    readonly yue: string;
}

/** The document being accepted. Mirrors `MOJANG_EULA_URL` in the main process. */
export const MOJANG_EULA_URL = "https://account.mojang.com/documents/minecraft_eula";

/** Where the client file comes from, named because "Mojang's servers" is vaguer. */
export const MOJANG_DOWNLOAD_HOST = "https://piston-meta.mojang.com/";

/**
 * The text being agreed to, quoted verbatim from upstream BlueMap's `core.conf`
 * (`common/src/main/resources/de/bluecolored/bluemap/config/core.conf`, the comment
 * above `accept-download`). Accepting here is what sets that key to true.
 *
 * Do not reword this, do not shorten it, and do not run it through the funny level.
 * Its spelling is upstream's, including "license", because a quotation that has been
 * tidied up is no longer a quotation.
 */
export const CONSENT_QUOTE: readonly string[] = [
    "By changing the setting (accept-download) below to TRUE you are indicating that you have accepted Mojang's EULA (https://account.mojang.com/documents/minecraft_eula),",
    "you confirm that you own a license to Minecraft (Java Edition),",
    "and you agree that BlueMap will download and use a Minecraft client file (depending on the Minecraft version) from Mojang's servers (https://piston-meta.mojang.com/) for you.",
    "This file contains resources that belong to Mojang and you must not redistribute it or do anything else that is not compliant with Mojang's EULA.",
];

/**
 * A Cantonese reading of `CONSENT_QUOTE`, line for line, shown beneath the English in
 * Cantonese and bilingual modes and always labelled as a translation. It is an aid to
 * understanding the quotation above it; it is never the thing being agreed to, which is
 * why the English stays on screen in every mode.
 */
export const CONSENT_QUOTE_TRANSLATION: readonly string[] = [
    "將下面嘅設定 (accept-download) 改成 TRUE，即表示你已接受 Mojang 嘅 EULA（https://account.mojang.com/documents/minecraft_eula），",
    "你確認自己擁有 Minecraft（Java Edition）嘅授權，",
    "並且同意由 BlueMap 代你從 Mojang 嘅伺服器（https://piston-meta.mojang.com/）下載同使用 Minecraft 客戶端檔案（視乎 Minecraft 版本）。",
    "呢個檔案入面嘅資源屬於 Mojang，你唔可以再散佈佢，亦唔可以做任何唔符合 Mojang EULA 嘅事。",
];

/* -------------------------------------------------------------------------- */
/* EXACT: consent facts, identical at every funny level                       */
/* -------------------------------------------------------------------------- */

export const EXACT = {
    "consent.quoteLabel": {
        en: "This is the text you are agreeing to, quoted from BlueMap without changes:",
        yue: "以下就係你要同意嘅內容，原文照錄自 BlueMap，一個字都冇改：",
    },
    "consent.translationLabel": {
        en: "Cantonese reading of the quotation above. The English text is what you are agreeing to.",
        yue: "上面引文嘅廣東話解讀。你真正同意嘅係上面嘅英文原文。",
    },
    "consent.why": {
        en: "BlueMap textures a map from the real Minecraft client file. The block textures, the models and the colours all come out of it, so without that file nothing can be rendered on this computer at all.",
        yue: "BlueMap 要用真正嘅 Minecraft 客戶端檔案去為地圖上材質。方塊材質、模型同顏色全部都喺入面攞，所以冇咗個檔案，喺呢部電腦度乜都算唔到圖。",
    },
    "consent.ifAccept": {
        en: "If you accept: when you render a world on this computer, the app downloads the matching Minecraft client file from Mojang. The file stays on this computer and is never passed on to anyone.",
        yue: "如果你接受：當你喺呢部電腦算圖嘅時候，程式會向 Mojang 下載對應版本嘅 Minecraft 客戶端檔案。個檔案只會留喺呢部電腦，唔會俾第二個人。",
    },
    "consent.ifDecline": {
        en: "If you decline: remote BlueMap servers still work exactly as they do now. Rendering a world on this computer stays switched off until you accept it in Settings.",
        yue: "如果你拒絕：連遠端 BlueMap 伺服器嘅功能一切照舊，完全冇分別。喺呢部電腦算圖就會繼續停用，直到你喺「設定」入面接受為止。",
    },
    "consent.askedOnce": {
        en: "This is asked once. Whichever answer you give is remembered, setup will not open again, and nothing in the app will ask you a second time.",
        yue: "呢條問題只會問一次。你答邊個答案都會記住，設定畫面唔會再出，程式入面亦唔會有第二個地方再問你。",
    },
    "consent.reversible": {
        en: "You can change this answer at any time in Settings.",
        yue: "你隨時可以喺「設定」入面改呢個答案。",
    },
    "consent.acceptedFact": {
        en: "Accepted. The app may download the Minecraft client file from Mojang when it renders a world on this computer.",
        yue: "已接受。當程式喺呢部電腦算圖嘅時候，可以向 Mojang 下載 Minecraft 客戶端檔案。",
    },
    "consent.declinedFact": {
        en: "Not accepted. Remote BlueMap servers work as normal. Rendering a world on this computer is switched off.",
        yue: "未接受。連遠端 BlueMap 伺服器一切正常。喺呢部電腦算圖就停用咗。",
    },
    "consent.withdrawFact": {
        en: "Withdrawing stops the app downloading anything from Mojang. Maps that were already rendered stay where they are.",
        yue: "收回之後，程式唔會再向 Mojang 下載任何嘢。之前已經算好嘅地圖照舊留喺原處。",
    },
    "consent.unavailable": {
        en: "This build cannot render worlds on this computer, so there is nothing here to consent to.",
        yue: "呢個版本唔可以喺呢部電腦算圖，所以呢度冇嘢需要你同意。",
    },
    "consent.missingHint": {
        en: "Rendering on this computer needs this answer. Accept it here and the render can start.",
        yue: "喺呢部電腦算圖需要呢個答案。喺呢度接受咗，就可以開始算圖。",
    },

    /*
     * The EULA viewer's own statements.
     *
     * Every one of these is a claim about the document on screen: what it is, where it
     * came from, when, and what the tabs above it are. They are EXACT because a funny
     * level that reworded "this is a copy from last month" into something breezier would
     * be restyling the one sentence that stops somebody reading an out-of-date licence
     * and believing it is the current one.
     */
    "eula.navigationOnly": {
        en: "The tabs below are this application's navigation over Mojang's document. They add nothing to it, remove nothing from it and reorder nothing inside it. Mojang's document is what you are agreeing to.",
        yue: "下面啲分頁只係本程式為 Mojang 份文件加嘅導覽。冇加過任何嘢入去，冇刪過任何嘢，入面嘅次序亦一個字都冇調換過。你真正同意嘅係 Mojang 份文件本身。",
    },
    "eula.live": {
        en: "This is Mojang's document, fetched from Mojang.",
        yue: "呢份就係 Mojang 份文件，直接向 Mojang 攞返嚟。",
    },
    "eula.cachedCopy": {
        en: "This is a copy the application fetched earlier and kept. It may not be the current wording.",
        yue: "呢份係程式之前攞落嚟儲住嘅副本，未必係最新嘅版本。",
    },
    "eula.fallbackCopy": {
        en: "This is not Mojang's document. Mojang's document could not be fetched, so the wording BlueMap itself quotes is shown instead.",
        yue: "呢份唔係 Mojang 份文件。攞唔到 Mojang 份文件，所以改為顯示 BlueMap 自己引用嘅字句。",
    },
    "eula.fetchedAt": {
        en: "Fetched {when}.",
        yue: "喺 {when} 攞落嚟。",
    },
    "eula.neverFetched": {
        en: "Never fetched from Mojang on this computer.",
        yue: "喺呢部電腦從來未向 Mojang 攞過。",
    },
    "eula.failureReason": {
        en: "Why the live document is not on screen: {reason}",
        yue: "點解而家見唔到即時版本：{reason}",
    },
    "eula.readingIsNotAgreeing": {
        en: "Reading this agrees to nothing. You are asked to accept or decline on the next step, and both answers are real.",
        yue: "睇呢份嘢唔等於同意咗任何嘢。下一步先會問你接受定拒絕，兩個答案都係真㗎。",
    },
    "eula.authoritative": {
        en: "If this application's copy and Mojang's published document ever differ, Mojang's document is the one that counts.",
        yue: "如果本程式呢份副本同 Mojang 公佈嘅文件有出入，以 Mojang 份文件為準。",
    },
} as const satisfies Record<string, FixedString>;

/* -------------------------------------------------------------------------- */
/* FIXED: control labels and names                                            */
/* -------------------------------------------------------------------------- */

export const FIXED = {
    "app.name": { en: "Material BlueMap", yue: "Material BlueMap" },

    "setup.dialogLabel": { en: "First-run setup", yue: "首次啟動設定" },
    "setup.progress": { en: "Step {step} of {total}", yue: "第 {step} 步，共 {total} 步" },

    "step.welcome": { en: "Welcome", yue: "歡迎" },
    "welcome.limitations": { en: "What does not work yet", yue: "而家仲未得嘅嘢" },
    "step.consent": { en: "Minecraft files", yue: "Minecraft 檔案" },
    "step.storage": { en: "Map storage", yue: "地圖存放位置" },

    "action.back": { en: "Back", yue: "上一步" },
    "action.next": { en: "Next", yue: "下一步" },
    "action.accept": { en: "Accept", yue: "接受" },
    "action.decline": { en: "Decline", yue: "拒絕" },
    "action.finish": { en: "Finish setup", yue: "完成設定" },
    "action.openEula": { en: "Read the Minecraft EULA", yue: "睇 Minecraft EULA" },
    "action.useDefault": { en: "Use the default", yue: "用預設位置" },
    "action.change": { en: "Change this answer", yue: "更改呢個答案" },
    "action.withdraw": { en: "Withdraw consent", yue: "收回同意" },
    "action.acceptNow": { en: "Accept", yue: "接受" },
    "action.cancel": { en: "Cancel", yue: "取消" },
    "action.continueAnyway": { en: "Continue anyway", yue: "照樣繼續" },
    "action.retry": { en: "Try again", yue: "再試一次" },

    "language.title": { en: "Language", yue: "語言" },
    "language.settingsTitle": { en: "Language and tone", yue: "語言同語氣" },
    "action.resetLanguage": { en: "Reset language and tone", yue: "還原語言同語氣" },
    "language.mode.en": { en: "English", yue: "English" },
    "language.mode.yue": { en: "廣東話", yue: "廣東話" },
    "language.mode.bilingual": { en: "Bilingual", yue: "雙語" },
    "language.funny.en": { en: "Funny level, English", yue: "搞笑程度（英文）" },
    "language.funny.yue": { en: "Funny level, Cantonese", yue: "搞笑程度（廣東話）" },
    "language.level.1": { en: "Fully serious", yue: "完全正經" },
    "language.level.2": { en: "Mostly serious", yue: "大致正經" },
    "language.level.3": { en: "Balanced", yue: "中間落墨" },
    "language.level.4": { en: "Playful", yue: "貪玩" },
    "language.level.5": { en: "Maximum playfulness", yue: "玩到盡" },

    "storage.fieldLabel": { en: "Folder for rendered maps", yue: "存放已算圖地圖嘅資料夾" },
    "storage.defaultLabel": { en: "Default", yue: "預設" },
    "storage.invalid": {
        en: "Enter a full path, such as {example}.",
        yue: "請輸入完整路徑，例如 {example}。",
    },
    "storage.empty": {
        en: "A folder is needed. Use the default if you have no preference.",
        yue: "要有個資料夾先得。冇特別要求嘅話，用預設位置就可以。",
    },

    "consent.settingsTitle": { en: "Minecraft download consent", yue: "Minecraft 下載同意" },
    "consent.status.accepted": { en: "Accepted", yue: "已接受" },
    "consent.status.declined": { en: "Not accepted", yue: "未接受" },
    "consent.field.document": { en: "Document", yue: "文件" },
    "consent.field.answered": { en: "Answered", yue: "回答時間" },
    "consent.field.appVersion": { en: "App version at the time", yue: "當時嘅程式版本" },
    "consent.field.never": { en: "Never answered", yue: "未曾回答" },
    "consent.field.declined": { en: "Declined during setup", yue: "喺設定嗰陣拒絕咗" },
    "consent.field.unknown": { en: "Not recorded", yue: "冇記錄" },

    /* The EULA viewer's controls and the names of its categories. */
    "step.eula": { en: "The licence", yue: "授權條款" },
    "eula.title": { en: "Minecraft End User Licence Agreement", yue: "Minecraft 最終用戶授權合約" },
    "eula.viewerTitle": { en: "The Minecraft licence", yue: "Minecraft 授權條款" },
    "eula.stripLabel": { en: "Sections of the licence", yue: "授權條款嘅章節" },
    "eula.windowLabel": { en: "Licence viewer", yue: "授權條款檢視器" },
    "action.readLicence": { en: "Read the licence in the app", yue: "喺程式入面睇授權條款" },
    "action.hideLicence": { en: "Hide the licence", yue: "收埋授權條款" },
    "action.refetchEula": { en: "Fetch it again", yue: "再攞多次" },
    "eula.fetching": { en: "Fetching Mojang's document", yue: "攞緊 Mojang 份文件" },
    "eula.searchLabel": { en: "Search the licence", yue: "搜尋授權條款" },
    "eula.searchHint": { en: "a word or phrase in the document", yue: "文件入面嘅字或者詞" },
    "eula.searchAll": {
        en: "{total} sections. Nothing is hidden by a search.",
        yue: "共 {total} 個章節。搜尋唔會收埋任何一段。",
    },
    "eula.searchFound": {
        en: "{shown} of {total} sections contain that. Every section is still listed.",
        yue: "{total} 個章節之中有 {shown} 個搵到。所有章節照樣列晒出嚟。",
    },
    "eula.searchBadPattern": {
        en: "That pattern is not valid, so nothing is marked. The document is unchanged.",
        yue: "呢個式唔啱格式，所以冇標記到任何嘢。文件本身冇變過。",
    },
    "eula.empty": {
        en: "There is no document to show yet.",
        yue: "而家仲未有文件可以顯示。",
    },
    "eula.export": { en: "Export or copy", yue: "匯出或者複製" },
    "eula.exportSectionMarkdown": { en: "This section, as Markdown", yue: "呢個章節，Markdown 格式" },
    "eula.exportSectionText": { en: "This section, as plain text", yue: "呢個章節，純文字格式" },
    "eula.exportAllMarkdown": { en: "The whole document, as Markdown", yue: "成份文件，Markdown 格式" },
    "eula.exportAllText": { en: "The whole document, as plain text", yue: "成份文件，純文字格式" },
    "eula.copySection": { en: "Copy this section", yue: "複製呢個章節" },
    "eula.copyAll": { en: "Copy the whole document", yue: "複製成份文件" },
    "eula.copied": {
        en: "Copied, with a header saying which part of the document it is.",
        yue: "已複製，開頭有註明呢段係文件邊一部分。",
    },
    "eula.copyFailed": { en: "Could not reach the clipboard.", yue: "接觸唔到剪貼簿。" },
    "eula.exported": { en: "Exported {name}.", yue: "已匯出 {name}。" },

    "eula.category.overview": { en: "Overview", yue: "概覽" },
    "eula.category.permitted": { en: "What you may do", yue: "你可以做嘅嘢" },
    "eula.category.prohibited": { en: "What you may not do", yue: "你唔可以做嘅嘢" },
    "eula.category.ownership": { en: "Ownership", yue: "擁有權" },
    "eula.category.changes": { en: "Updates and changes", yue: "更新同改動" },
    "eula.category.termination": { en: "Termination", yue: "終止" },
    "eula.category.liability": { en: "Warranties and liability", yue: "保證同責任" },
    "eula.category.other": { en: "Other terms", yue: "其他條款" },
} as const satisfies Record<string, FixedString>;

/* -------------------------------------------------------------------------- */
/* VOICED: five levels per language                                           */
/* -------------------------------------------------------------------------- */

export const VOICED = {
    "welcome.heading": {
        en: [
            "Welcome to Material BlueMap",
            "Welcome to Material BlueMap",
            "Welcome to Material BlueMap",
            "Hello, and welcome to Material BlueMap",
            "Well hello there. Material BlueMap, reporting for duty",
        ],
        yue: [
            "歡迎使用 Material BlueMap",
            "歡迎使用 Material BlueMap",
            "歡迎使用 Material BlueMap，好高興見到你",
            "哈囉，歡迎入嚟 Material BlueMap",
            "喂喂喂，Material BlueMap 恭候多時喇",
        ],
    },
    "welcome.what": {
        en: [
            "Material BlueMap is a desktop application for BlueMap, the Minecraft 3D map renderer. It connects to BlueMap servers and shows their maps, and it is being built to render a world from your own save on this computer.",
            "Material BlueMap is a desktop application for BlueMap, the Minecraft 3D map renderer. It connects to BlueMap servers and shows their maps, and it is being built to render a world from your own save on this computer.",
            "Material BlueMap is a desktop application for BlueMap, the Minecraft 3D map renderer. It connects to BlueMap servers and shows their maps in 3D, and it is being built to render a world from your own save on this computer.",
            "Material BlueMap is your Minecraft world seen from above, and from the side, and from wherever else you fancy. It connects to BlueMap servers and shows their maps in 3D, and it is being built to render a world from your own save on this computer.",
            "Material BlueMap flies you around Minecraft worlds without the fall damage. It connects to BlueMap servers and shows their maps in 3D, and it is being built to render a world from your own save on this computer.",
        ],
        yue: [
            "Material BlueMap 係 BlueMap 嘅桌面應用程式，BlueMap 就係 Minecraft 嘅 3D 地圖算圖工具。佢可以連去 BlueMap 伺服器睇佢哋嘅地圖，而由你自己嘅存檔喺呢部電腦算圖嘅功能仲喺度做緊。",
            "Material BlueMap 係 BlueMap 嘅桌面應用程式，BlueMap 就係 Minecraft 嘅 3D 地圖算圖工具。佢可以連去 BlueMap 伺服器睇佢哋嘅地圖，而由你自己嘅存檔喺呢部電腦算圖嘅功能仲喺度做緊。",
            "Material BlueMap 係 BlueMap 嘅桌面版，BlueMap 就係將 Minecraft 世界整成 3D 地圖嗰個工具。佢可以連去 BlueMap 伺服器，用 3D 睇佢哋嘅地圖；至於用你自己嘅存檔喺呢部電腦算圖，就仲喺度做緊。",
            "Material BlueMap 帶你由天上望落你個 Minecraft 世界，想點望都得。佢可以連去 BlueMap 伺服器用 3D 睇地圖；用你自己嘅存檔喺呢部電腦算圖嗰部分，仲喺度趕工。",
            "Material BlueMap 俾你喺 Minecraft 世界上面飛嚟飛去，仲唔使食跌落地嘅傷害。佢可以連去 BlueMap 伺服器用 3D 睇地圖；用你自己嘅存檔喺呢部電腦算圖，就仲喺度趕工中。",
        ],
    },
    "welcome.cannot": {
        en: [
            "What it cannot do yet: render a world from your own save. Reading the world files and the resource packs is finished and tested. The renderer itself runs upstream BlueMap's Java engine, and the part of the application that drives it is still being written. Browsing a BlueMap server works today, from end to end.",
            "What it cannot do yet, stated plainly: render a world from your own save. Reading the world files and the resource packs is finished and tested. The renderer itself runs upstream BlueMap's Java engine, and the part of the application that drives it is still being written. Browsing a BlueMap server works today, from end to end.",
            "What it cannot do yet, because pretending otherwise helps nobody: render a world from your own save. Reading the world files and the resource packs is finished and tested. The renderer runs upstream BlueMap's Java engine, and the part of the application that drives it is still being written. Browsing a BlueMap server works today, from end to end.",
            "The honest bit, before you find out the hard way: it cannot render a world from your own save yet. Reading the world files and the resource packs is finished and tested. The renderer runs upstream BlueMap's Java engine, and the part that drives it is still being written. Browsing a BlueMap server works today, from end to end.",
            "Now the part every other installer hides in a changelog: rendering your own save does not work yet. Reading the world files and the resource packs is done and tested. The renderer runs upstream BlueMap's Java engine, and the part that drives it is still on the workbench. Browsing a BlueMap server works today, from end to end.",
        ],
        yue: [
            "而家仲未做到嘅嘢：由你自己嘅存檔算圖。讀取世界檔案同資源包嘅部分已經完成同測試好。算圖本身係行上游 BlueMap 嘅 Java 引擎，而程式入面負責驅動佢嗰部分仲寫緊。連去 BlueMap 伺服器瀏覽地圖，今日已經由頭到尾都用得。",
            "而家仲未做到嘅嘢，直接講：由你自己嘅存檔算圖。讀取世界檔案同資源包嘅部分已經完成同測試好。算圖本身係行上游 BlueMap 嘅 Java 引擎，而程式入面負責驅動佢嗰部分仲寫緊。連去 BlueMap 伺服器瀏覽地圖，今日已經由頭到尾都用得。",
            "講定唔好扮嘢：而家仲未可以由你自己嘅存檔算圖。讀取世界檔案同資源包嗰邊已經搞掂又測試過。算圖本身行緊上游 BlueMap 嘅 Java 引擎，程式度驅動佢嗰橛仲寫緊。連去 BlueMap 伺服器睇地圖，今日已經完全用得。",
            "老實話講埋先，唔好等你自己撞板：而家仲未可以由你自己嘅存檔算圖。讀世界檔案同資源包已經搞掂晒又測試過。算圖行緊上游 BlueMap 嘅 Java 引擎，驅動佢嗰橛仲喺度寫。連 BlueMap 伺服器睇地圖就已經完全冇問題。",
            "以下呢段，人哋通常會收埋喺更新日誌最底：而家仲未可以由你自己嘅存檔算圖。讀世界檔案同資源包已經搞掂又測試過。算圖行緊上游 BlueMap 嘅 Java 引擎，驅動佢嗰橛仲喺工作枱上面。連 BlueMap 伺服器睇地圖就已經完全冇問題。",
        ],
    },
    "welcome.lead": {
        en: [
            "Three short steps and setup is done.",
            "Three short steps and setup is done.",
            "Three short steps and you are through. Nothing here is asked twice.",
            "Three short steps, then it gets out of your way for good.",
            "Three steps. Shorter than the loading screen you just sat through.",
        ],
        yue: [
            "三個簡短步驟就完成設定。",
            "三個簡短步驟就完成設定。",
            "三個短步驟就搞掂，呢度啲嘢一次過問晒，唔會問第二次。",
            "三步就完，之後佢就唔會再阻住你。",
            "三步咋。比你頭先等嗰個載入畫面仲快。",
        ],
    },
    "language.lead": {
        en: [
            "Choose how the application talks to you. Both settings can be changed later in Settings.",
            "Choose how the application talks to you. Both settings can be changed later in Settings.",
            "Choose how the application talks to you. The two funny levels are separate, so English can stay buttoned up while Cantonese lets loose. Change either later in Settings.",
            "Pick a voice. The two funny levels are separate, so English can wear a tie while Cantonese wears slippers. Change either later in Settings.",
            "Pick a voice, any voice. The two funny levels move independently, so one language can be in a suit and the other in pyjamas. All changeable later in Settings.",
        ],
        yue: [
            "揀程式用咩方式同你講嘢。兩個設定之後都可以喺「設定」度改。",
            "揀程式用咩方式同你講嘢。兩個設定之後都可以喺「設定」度改。",
            "揀程式用咩語氣同你講嘢。兩條搞笑程度係分開嘅，英文可以正正經經，廣東話可以放飛自我。之後喺「設定」度隨時改得。",
            "揀把聲。兩條搞笑程度分開行，英文打領呔，廣東話著拖鞋都得。之後喺「設定」度改返都得。",
            "隨你揀把聲。兩條搞笑程度各行各路，一種語言著西裝，另一種著睡衣都冇問題。之後喺「設定」度改幾多次都得。",
        ],
    },
    /**
     * The honest disclosure, in the setting itself and at first run alike.
     *
     * Every level of it says the same three things: the level styles every message, errors
     * and warnings are included rather than exempt, and what a message says happened does
     * not change. That is the disclosure the contract asks for, and
     * `copy/appCopy.test.ts` checks all ten strings still carry those words, because a
     * disclosure that gets funnier until it stops disclosing is worse than none.
     */
    "language.disclosure": {
        en: [
            "The funny level styles every message in the application, including errors and warnings. It changes the wording only. What a message says happened, what it affects and what your options are stay exactly the same at every level.",
            "The funny level styles every message in the application, including errors and warnings. It changes the wording only. What a message says happened, what it affects and what your options are stay exactly the same at every level.",
            "The funny level styles every message in the application, and nothing is exempt: errors and warnings get the same treatment as everything else. Only the wording moves. What happened, what it affects and what your options are read the same at every level.",
            "The funny level restyles every message in here, errors and warnings included. It moves the wording and nothing else, so what happened, what it affects and what you can do about it read the same at level 1 and at level 5.",
            "The funny level restyles every message in here, and yes, that includes errors and warnings. It moves the wording and nothing else, so what happened, what it affects and what you can do about it read exactly the same at level 1 and at level 5.",
        ],
        yue: [
            "搞笑程度會影響程式入面每一個訊息嘅語氣，包括錯誤同警告。佢只會改措辭。訊息講嘅係發生咗咩事、影響邊啲嘢、你有咩選擇，喺每一級都完全一樣。",
            "搞笑程度會影響程式入面每一個訊息嘅語氣，包括錯誤同警告。佢只會改措辭。訊息講嘅係發生咗咩事、影響邊啲嘢、你有咩選擇，喺每一級都完全一樣。",
            "搞笑程度會影響程式入面每一個訊息嘅語氣，冇一個例外：錯誤同警告一樣照計。佢淨係改措辭。發生咗咩事、影響邊啲嘢、你有咩選擇，每一級讀落都一樣。",
            "搞笑程度會將呢度每一個訊息換過個語氣，錯誤同警告都包埋。佢淨係郁措辭，所以發生咗咩事、影響邊啲嘢、你可以點做，第 1 級同第 5 級讀落都一樣。",
            "搞笑程度會將呢度每一個訊息換過個語氣，係，錯誤同警告都包埋。佢淨係郁措辭，所以發生咗咩事、影響邊啲嘢、你可以點做，第 1 級同第 5 級讀落一模一樣。",
        ],
    },
    "language.settingsLead": {
        en: [
            "The language mode and the two funny levels chosen during setup. Both can be changed here at any time.",
            "The language mode and the two funny levels chosen during setup. Both can be changed here at any time.",
            "The language mode and the two funny levels you chose during setup. Change either one here whenever you like.",
            "Whatever you picked during setup is here, and none of it is permanent.",
            "Whatever voice you picked during setup lives here, and you can change your mind as often as you like.",
        ],
        yue: [
            "設定時所揀嘅語言模式同兩條搞笑程度。兩樣都可以喺呢度隨時更改。",
            "設定時所揀嘅語言模式同兩條搞笑程度。兩樣都可以喺呢度隨時更改。",
            "你喺設定嗰陣揀嘅語言模式同兩條搞笑程度。想改邊樣，幾時都喺呢度改得。",
            "你設定嗰陣揀咗乜，全部喺呢度，而且冇一樣係改唔到嘅。",
            "你設定嗰陣揀咗把咩聲，全部住喺呢度，想轉幾多次軚都得。",
        ],
    },
    "consent.heading": {
        en: [
            "Minecraft's own files",
            "Minecraft's own files",
            "Minecraft's own files",
            "One licence, then we never mention it again",
            "The paperwork. One page, one answer, gone forever",
        ],
        yue: [
            "Minecraft 自己嘅檔案",
            "Minecraft 自己嘅檔案",
            "Minecraft 自己嘅檔案",
            "簽一次授權，之後唔再提",
            "文件時間。一版紙，一個答案，之後永世唔再見",
        ],
    },
    "consent.lead": {
        en: [
            "Rendering a world on this computer needs files that belong to Mojang, so the decision is yours to make.",
            "Rendering a world on this computer needs files that belong to Mojang, so the decision is yours to make.",
            "Rendering a world on this computer needs files that belong to Mojang, so this one is genuinely your call, not a box to click through.",
            "Rendering a world here needs files that belong to Mojang. Read it, then pick. Both buttons are real.",
            "Rendering a world here needs files that belong to Mojang, and neither we nor Mojang can decide that for you. Read it, then pick. Both buttons are real.",
        ],
        yue: [
            "喺呢部電腦算圖需要用到屬於 Mojang 嘅檔案，所以呢個決定要你自己嚟做。",
            "喺呢部電腦算圖需要用到屬於 Mojang 嘅檔案，所以呢個決定要你自己嚟做。",
            "喺呢部電腦算圖要用到 Mojang 嘅檔案，所以呢個真係你話事，唔係求求其其㩒個掣算數。",
            "喺呢度算圖要用到 Mojang 嘅檔案。睇完先揀，兩個掣都係真㗎。",
            "喺呢度算圖要用到 Mojang 嘅檔案，呢件事我哋同 Mojang 都幫你決定唔到。睇完先揀，兩個掣都係真㗎。",
        ],
    },
    "storage.heading": {
        en: [
            "Where rendered maps are stored",
            "Where rendered maps are stored",
            "Where rendered maps are stored",
            "Where all those tiles are going to live",
            "Somewhere to put a few hundred thousand tiny files",
        ],
        yue: [
            "算好嘅地圖存放喺邊",
            "算好嘅地圖存放喺邊",
            "算好嘅地圖存放喺邊",
            "啲圖磚將來住喺邊度",
            "搵個位放幾十萬個超細嘅檔案",
        ],
    },
    "storage.lead": {
        en: [
            "Rendering a world writes many small tile files. Choose the folder they are written to. This can be changed later in Settings.",
            "Rendering a world writes many small tile files. Choose the folder they are written to. This can be changed later in Settings.",
            "Rendering a world writes an alarming number of small tile files. Choose where they go. Changeable later in Settings.",
            "Rendering a world produces small tile files by the thousand. Tell it where to put them. Changeable later in Settings.",
            "Rendering a world spits out small tile files like a confetti cannon. Point it at a folder before you pull the trigger. Changeable later in Settings.",
        ],
        yue: [
            "算圖會寫出好多細細粒嘅圖磚檔案。揀個資料夾俾佢哋。之後喺「設定」度改得。",
            "算圖會寫出好多細細粒嘅圖磚檔案。揀個資料夾俾佢哋。之後喺「設定」度改得。",
            "算一次圖會生出多到嚇你一跳嘅細圖磚檔案。揀個位放低佢哋。之後喺「設定」度改得。",
            "算圖會一千幾百咁生出細圖磚檔案。話俾佢知放邊度。之後喺「設定」度改得。",
            "算圖噴細圖磚檔案就好似五彩紙碎炮咁，一嘢噴晒出嚟。開槍之前，記得指定個資料夾。之後喺「設定」度改得。",
        ],
    },
    "storage.note": {
        en: [
            "The folder is created when the first render starts. Nothing is written now.",
            "The folder is created when the first render starts. Nothing is written now.",
            "The folder is created when the first render starts, so nothing is written to your disk right now.",
            "Nothing is written yet. The folder appears when the first render does.",
            "Your disk is untouched so far. The folder shows up when the first render does, not a second earlier.",
        ],
        yue: [
            "第一次算圖開始嗰陣先會建立呢個資料夾。而家唔會寫任何嘢。",
            "第一次算圖開始嗰陣先會建立呢個資料夾。而家唔會寫任何嘢。",
            "第一次算圖開始嗰陣先會整呢個資料夾，所以而家你個磁碟乜都冇寫落去。",
            "而家乜都未寫。第一次算圖嗰陣，個資料夾先至會出現。",
            "你個磁碟到目前為止一條毛都冇郁過。第一次算圖嗰陣個資料夾先至出現，早一秒都唔會。",
        ],
    },
    "storage.pathHint": {
        en: [
            "{token} is expanded by the application when a render starts.",
            "{token} is expanded by the application when a render starts.",
            "{token} is expanded by the application when a render starts, so the path stays right if your account moves.",
            "{token} gets expanded when a render starts, so the path survives your account moving house.",
            "{token} is expanded at render time, so this path still works after your account moves house, changes name, and joins a band.",
        ],
        yue: [
            "{token} 會喺算圖開始嗰陣由程式展開成實際路徑。",
            "{token} 會喺算圖開始嗰陣由程式展開成實際路徑。",
            "{token} 會喺算圖開始嗰陣由程式展開，就算你個帳戶搬咗屋，路徑一樣啱。",
            "{token} 會喺算圖嗰陣先展開，所以你個帳戶搬屋佢都跟得切。",
            "{token} 會喺算圖嗰陣先展開，所以就算你個帳戶搬屋、改名、再夾埋隊 band，呢條路徑都仲用得。",
        ],
    },
    "setup.failureNote": {
        en: [
            "The answer could not be recorded, so setup will open again the next time the application starts.",
            "The answer could not be recorded, so setup will open again the next time the application starts.",
            "The answer did not make it to disk, so setup will open again next launch and ask exactly once more.",
            "That answer never reached the disk, so setup will be back next launch, asking the same three things.",
            "The answer bounced on its way to the disk, so setup will be waiting for you at the next launch, same three questions, same energy.",
        ],
        yue: [
            "個答案未能記錄低，所以下次啟動程式嗰陣，設定畫面會再出現。",
            "個答案未能記錄低，所以下次啟動程式嗰陣，設定畫面會再出現。",
            "個答案冇寫到落磁碟，所以下次開程式設定畫面會再出，再問多一次。",
            "個答案根本冇去到磁碟度，所以下次開機佢會返嚟，問返同樣嗰三條嘢。",
            "個答案喺去磁碟嘅路上彈返轉頭，所以下次開程式佢會喺度等你，一樣嘅三條問題，一樣嘅精神。",
        ],
    },
    "settings.lead": {
        en: [
            "The answer given during setup, and where to change it.",
            "The answer given during setup, and where to change it.",
            "The answer you gave during setup. Change it here whenever you like.",
            "Whatever you told us during setup is right here, and it is not set in stone.",
            "Your setup answer, on display, and completely reversible. No hard feelings either way.",
        ],
        yue: [
            "設定時所給嘅答案，以及喺邊度更改。",
            "設定時所給嘅答案，以及喺邊度更改。",
            "你喺設定嗰陣俾嘅答案。想改幾時都改得。",
            "你設定嗰陣講咗乜，全部喺呢度，仲要唔係石頭刻嘅。",
            "你嘅設定答案擺晒喺呢度，隨時反口都得，我哋唔會唔開心。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export type VoicedKey = keyof typeof VOICED;
export type FixedKey = keyof typeof FIXED;
export type ExactKey = keyof typeof EXACT;
export type StringKey = VoicedKey | FixedKey | ExactKey;

export function isVoicedKey(key: StringKey): key is VoicedKey {
    return Object.prototype.hasOwnProperty.call(VOICED, key);
}

export function isExactKey(key: StringKey): key is ExactKey {
    return Object.prototype.hasOwnProperty.call(EXACT, key);
}

/** Every consent-critical key, so a test can prove the funny level never moves them. */
export function exactKeys(): readonly ExactKey[] {
    return Object.keys(EXACT) as ExactKey[];
}

export function voicedKeys(): readonly VoicedKey[] {
    return Object.keys(VOICED) as VoicedKey[];
}
