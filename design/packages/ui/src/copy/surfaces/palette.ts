/**
 * The command palette: everything `CommandPalette.vue`, `PaletteRow.vue`, `paletteCatalog.ts`
 * and `viewerSettings.ts` put on screen that is not already voiced somewhere else.
 *
 * ## What is deliberately absent
 *
 * The palette calls `t()` with a great many keys this module does not answer, and every one
 * of them falls into one of two buckets that are wrong to fill in here:
 *
 *  - **Upstream's own words.** `settings.title`, `maps.title`, `markers.title`,
 *    `players.title`, `info.title`, `resetCamera.tooltip`, and the whole run of viewer
 *    settings labels (`controls.title`, `lighting.sunlight`, `resolution.high`,
 *    `renderDistance.hiresLayer`, `mapControls.showZoomButtons`, `freeFlightControls.*`,
 *    `theme.*`, `screenshot.clipboard`, `language.title`, `chunkBorders.button`,
 *    `debug.button`, and the rest) are rows the palette *reuses the name of* rather than
 *    strings it owns. Every one of them is a key from the bundled viewer locales in
 *    `public/lang/*.conf`. Answering them here would replace a real translation in
 *    twenty-nine languages with an English string, which is exactly the mistake
 *    `catalogueCoverage.test.ts` exists to catch.
 *  - **Another surface's own key.** `config.title`, `notices.centre.title` and
 *    `changelog.title` are this app's own words, and they already have a catalogue entry -
 *    `chrome.ts` for the first, `appCopy.ts` for the second, `changelog.ts` for the third -
 *    because those keys are shared with the surfaces that opened first. Repeating them here
 *    would not be wrong so much as pointless: the merge is keyed by string, so whichever
 *    entry loads is the one that answers both call sites, and a second one just sits unused.
 *
 * What *is* answered here are the two screen names the palette currently is the only place
 * in the whole package that names: `servers.title` ("Servers", the destination row that opens
 * the server list when the shell has no tab strip of its own) and `tabs.finder.title` ("Find a
 * tab", the tab strip's own search). Neither is an upstream key - `public/lang/*.conf` has no
 * such paths - and neither has a call site anywhere outside `paletteCatalog.ts` yet. They are
 * this app's own words with nowhere else claiming them, so they belong here until whichever
 * surface actually owns that screen grows a matching call site of its own.
 *
 * ## Titles versus descriptions, the same split every other surface uses
 *
 * A row's `title` is a name, so it is FIXED: "Appearance preset" does not read differently at
 * five funny levels, and a name that moves under somebody is a name they have to re-read. A
 * row's `description` and every `where.*` sentence are prose that tells the reader what a row
 * actually is or what choosing it actually does, so those are VOICED. `paletteItems.ts` draws
 * exactly this line for the type itself: `title` is short, `description` is "one sentence
 * saying what it is", and `where` is "a plain sentence naming the surface this opens" - never
 * blank, because a row that moves somebody without saying where is worse than a menu item.
 *
 * The viewer settings under `viewerSettings.ts` follow the same split against upstream's own
 * naming: the label on each row (`lighting.sunlight`, `resolution.title`, and so on) is
 * upstream's word for the control and stays untouched, but the one sentence explaining what
 * the control actually does (`palette.sunlight.description`, `palette.resolution.description`)
 * is this app's own addition, sitting beside a control the settings page itself has no
 * equivalent sentence for. Voicing it here is not overriding upstream; it is the only place
 * that sentence exists at all.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PALETTE_VOICED = {
    /* ---------------------------------------------------------------- */
    /* The palette's own chrome: the footer hint, the search summary,    */
    /* and the note shown with no map open                               */
    /* ---------------------------------------------------------------- */

    "palette.hint": {
        en: [
            "Up and down move through the list, Enter takes the first result, Escape closes.",
            "Up and down move through the list, Enter takes the first result, Escape closes.",
            "Up and down arrow through the list, Enter jumps straight to the first result, and Escape closes the palette.",
            "Arrow up and down through the list, Enter grabs the first result, Escape shuts the whole thing.",
            "Up and down walk the list, Enter grabs whatever is on top, and Escape slams the door on the way out.",
        ],
        yue: [
            "上下鍵可以喺列表度郁，Enter 會揀第一項結果，Escape 就閂咗佢。",
            "上下鍵可以喺列表度郁，Enter 會揀第一項結果，Escape 就閂咗佢。",
            "上下鍵喺列表度郁嚟郁去，Enter 會直接揀第一項結果，Escape 就會閂咗個面板。",
            "上下鍵郁嚟郁去揀嘢，Enter 撳落去就攞第一項，Escape 就成個面板閂埋。",
            "上下鍵周圍郁，Enter 一撳就攞走排頭位嗰個，Escape 就砰一聲閂晒門走人。",
        ],
    },
    /*
     * With no map open there is nothing for a theme select or a render-distance box to
     * change, so the whole viewer group is absent rather than present and inert - but
     * somebody who came looking for it deserves the reason, not a shorter list nobody
     * explains.
     */
    "palette.noMap": {
        en: [
            "The map's own settings appear here once a map is open. With no map on screen there is nothing for them to change.",
            "The map's own settings appear here once a map is open. With no map on screen there is nothing for them to change.",
            "The map's own settings show up here once a map is open. With no map on screen, there is nothing for them to change yet.",
            "The map's own settings turn up here once a map is open. No map on screen means there is nothing here for them to touch.",
            "The map's own settings show up here the moment a map is open. With no map on screen, they would be adjusting a view that does not exist, so they stay out of the list.",
        ],
        yue: [
            "地圖自己嘅設定會喺呢度出現，前提係開咗張地圖。冇地圖喺畫面上嘅話，呢啲設定就冇嘢好改。",
            "地圖自己嘅設定會喺呢度出現，前提係開咗張地圖。冇地圖喺畫面上嘅話，呢啲設定就冇嘢好改。",
            "地圖自己嘅設定會喺呢度出現，前提係開咗張地圖。而家冇地圖喺畫面上，呢啲設定暫時冇嘢好改。",
            "地圖自己嘅設定要開咗張地圖先會喺呢度出現。冇地圖喺畫面度，呢啲設定就冇嘢俾佢哋郁。",
            "地圖自己嘅設定，一開咗張地圖就會喺呢度現身。冇地圖喺畫面，呢啲設定就等於要調校一張唔存在嘅圖，所以索性唔喺呢張清單度出現。",
        ],
    },
    /*
     * `badPattern` and `noMatches` are the same distinction `settings.search.*` already draws
     * next door: a broken pattern is the app refusing to guess, an empty result is the app
     * having looked and found nothing. Both keep saying so at every level rather than letting
     * either read as "the app lost some rows".
     */
    "palette.search.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "That pattern is not valid, so nothing is listed here.",
            "That pattern will not compile, so nothing is listed until it does.",
            "That pattern refuses to compile, so nothing is listed rather than a guess at what you meant.",
        ],
        yue: [
            "個 pattern 唔正確，所以冇列出任何嘢。",
            "個 pattern 唔正確，所以冇列出任何嘢。",
            "呢個 pattern 唔啱，所以呢度冇列出任何嘢。",
            "個 pattern compile 唔到，喺搞掂之前都係冇列出任何嘢。",
            "個 pattern 死都 compile 唔到，所以寧願冇列出任何嘢，都唔會亂咁估你想搵乜。",
        ],
    },
    "palette.search.found": {
        en: [
            "{shown} of {total} rows match.",
            "{shown} of {total} rows match.",
            "{shown} of {total} rows match this search.",
            "{shown} of the {total} rows match, and the rest are just filtered out.",
            "{shown} out of {total} rows made the cut; the rest are filtered out, not gone.",
        ],
        yue: [
            "{total} 項入面有 {shown} 項符合。",
            "{total} 項入面有 {shown} 項符合。",
            "{total} 項入面，有 {shown} 項符合呢個搜尋。",
            "{total} 項入面有 {shown} 項符合，其餘嘅淨係篩走咗。",
            "{total} 項入面有 {shown} 項有幸入圍，其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    "palette.search.total": {
        en: [
            "{commands} commands, {settings} settings and {places} places.",
            "{commands} commands, {settings} settings and {places} places.",
            "{commands} commands, {settings} settings and {places} places in total.",
            "{commands} commands, {settings} settings and {places} places, all sitting here ready to go.",
            "{commands} commands, {settings} settings and {places} places, the whole app in one list.",
        ],
        yue: [
            "{commands} 個指令、{settings} 個設定，同埋 {places} 個地方。",
            "{commands} 個指令、{settings} 個設定，同埋 {places} 個地方。",
            "總共 {commands} 個指令、{settings} 個設定，同埋 {places} 個地方。",
            "{commands} 個指令、{settings} 個設定，仲有 {places} 個地方，全部擺晒喺度等你揀。",
            "{commands} 個指令、{settings} 個設定，加埋 {places} 個地方，成個程式濃縮晒喺呢張清單度。",
        ],
    },
    "palette.search.noMatches": {
        en: [
            "Nothing in this app matches that.",
            "Nothing in this app matches that.",
            "Nothing in this app matches that search.",
            "Nothing in this app matches that, so try a different word.",
            "Nothing in the whole app matches that, not even close, so it is time to try a different word.",
        ],
        yue: [
            "呢個程式入面冇嘢符合。",
            "呢個程式入面冇嘢符合。",
            "呢個程式入面冇嘢符合呢個搜尋。",
            "呢個程式入面冇嘢符合，不如試下第二個字。",
            "成個程式搵勻都冇嘢符合，一啲都冇，不如轉個字再試。",
        ],
    },
    "palette.page.generic": {
        en: [
            "One of this app's pages, on the tab strip along the top.",
            "One of this app's pages, on the tab strip along the top.",
            "One of this app's pages, reachable from the tab strip along the top.",
            "One of this app's pages, sitting on the tab strip along the top like all the rest.",
            "One of this app's pages, up on the tab strip with all the others, just waiting to be clicked.",
        ],
        yue: [
            "呢個程式其中一個頁面，喺頂部嘅分頁列度。",
            "呢個程式其中一個頁面，喺頂部嘅分頁列度。",
            "呢個程式其中一個頁面，可以喺頂部嘅分頁列搵到。",
            "呢個程式其中一個頁面，同其他頁面一齊擺喺頂部嘅分頁列。",
            "呢個程式其中一個頁面，同一班兄弟一齊企喺頂部嘅分頁列，等緊你嚟撳。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* "where": the plain sentence every destination row promises        */
    /* ---------------------------------------------------------------- */

    "palette.where.page": {
        en: [
            "Shows the {page} page, exactly as its tab does.",
            "Shows the {page} page, exactly as its tab does.",
            "Shows the {page} page, exactly as clicking its tab would.",
            "Jumps straight to the {page} page, same as clicking its tab.",
            "Jumps straight to the {page} page, no different from clicking its tab yourself.",
        ],
        yue: [
            "顯示 {page} 頁面，同撳嗰個分頁一樣。",
            "顯示 {page} 頁面，同撳嗰個分頁一樣。",
            "顯示 {page} 頁面，同撳一撳嗰個分頁效果一樣。",
            "直接跳去 {page} 頁面，同你自己撳個分頁冇分別。",
            "一鍵直接飛去 {page} 頁面，同你親手撳嗰個分頁完全一樣，慳返隻手指。",
        ],
    },
    "palette.where.settings": {
        en: [
            "Opens the Settings panel on the right.",
            "Opens the Settings panel on the right.",
            "Opens the Settings panel on the right of the screen.",
            "Slides open the Settings panel on the right.",
            "Slides the Settings panel open on the right, exactly where it always lives.",
        ],
        yue: [
            "打開右邊嘅設定面板。",
            "打開右邊嘅設定面板。",
            "打開喺畫面右邊嘅設定面板。",
            "由右邊滑出設定面板。",
            "由右邊滑出設定面板，佢一直都住喺嗰度。",
        ],
    },
    "palette.where.config": {
        en: [
            "Opens the server configuration editor over the map.",
            "Opens the server configuration editor over the map.",
            "Opens the server configuration editor, laid over the map.",
            "Opens the server configuration editor right over the top of the map.",
            "Opens the server configuration editor, dropping it right over the map like a curtain.",
        ],
        yue: [
            "打開伺服器設定編輯器，蓋喺地圖上面。",
            "打開伺服器設定編輯器，蓋喺地圖上面。",
            "打開伺服器設定編輯器，覆蓋喺地圖上面嗰層。",
            "打開伺服器設定編輯器，直接蓋落地圖上面。",
            "打開伺服器設定編輯器，好似落幕咁蓋晒落地圖上面。",
        ],
    },
    "palette.where.profiles": {
        en: [
            "Opens the server list.",
            "Opens the server list.",
            "Opens the server list, every entry in it.",
            "Opens up the server list.",
            "Pops open the server list, every one of them.",
        ],
        yue: [
            "打開伺服器清單。",
            "打開伺服器清單。",
            "打開個伺服器清單。",
            "打開成個伺服器清單。",
            "唰一聲打開成個伺服器清單，一個都冇走漏。",
        ],
    },
    "palette.where.section": {
        en: [
            "Opens Settings and outlines this setting.",
            "Opens Settings and outlines this setting.",
            "Opens Settings and draws an outline around this setting.",
            "Opens Settings, scrolls to this setting, and outlines it.",
            "Opens Settings, scrolls straight to this setting, and puts a glowing outline round it so you cannot miss it.",
        ],
        yue: [
            "打開設定，並將呢個設定圈起嚟。",
            "打開設定，並將呢個設定圈起嚟。",
            "打開設定，喺呢個設定四周圈返個框。",
            "打開設定，捲去呢個設定嗰度，仲圈埋佢。",
            "打開設定，直接捲去呢個設定，仲用個發光框圈住佢，想唔見都難。",
        ],
    },
    // Both the fact that this is the last section AND the fact that nothing outlines it stay
    // literal at every level: a playful rewrite that dropped either would leave somebody
    // hunting for a highlight that was never coming.
    "palette.where.githubSection": {
        en: [
            "Opens Settings. This one is the last section in the panel; nothing outlines it, because no failure links to it.",
            "Opens Settings. This one is the last section in the panel; nothing outlines it, because no failure links to it.",
            "Opens Settings. This is the last section in the panel, and nothing outlines it, because no failure ever points here.",
            "Opens Settings, landing on the last section in the panel; nothing outlines it, because no failure ever links here.",
            "Opens Settings and drops you on the last section in the panel; nothing outlines it, because no failure has ever bothered pointing here.",
        ],
        yue: [
            "打開設定。呢個係面板入面最尾嗰個部分；冇嘢會圈住佢，因為冇任何失敗會指去呢度。",
            "打開設定。呢個係面板入面最尾嗰個部分；冇嘢會圈住佢，因為冇任何失敗會指去呢度。",
            "打開設定。呢個已經係面板入面最尾嗰個部分，冇嘢會圈住佢，因為由頭到尾都冇失敗會指去呢度。",
            "打開設定，直接去到面板入面最尾嗰個部分；冇嘢會圈住佢，因為冇失敗試過指去呢度。",
            "打開設定，直接放你喺面板入面最尾嗰個部分；冇嘢會圈住佢，因為由嚟冇一個失敗費事指過嚟呢度。",
        ],
    },
    "palette.where.configAll": {
        en: [
            "Opens the server configuration editor at its first tab, Core. The tab strip along the top has the rest.",
            "Opens the server configuration editor at its first tab, Core. The tab strip along the top has the rest.",
            "Opens the server configuration editor at its first tab, Core, and the tab strip along the top has the other six.",
            "Opens the server configuration editor at its first tab, Core. The rest are one click away on the tab strip up top.",
            "Opens the server configuration editor at its first tab, Core, and leaves the other six tabs sitting right there on the strip for you to explore.",
        ],
        yue: [
            "打開伺服器設定編輯器，喺第一個分頁「Core」度。頂部嘅分頁列有其餘嘅。",
            "打開伺服器設定編輯器，喺第一個分頁「Core」度。頂部嘅分頁列有其餘嘅。",
            "打開伺服器設定編輯器，停喺第一個分頁「Core」，其餘六個都喺頂部嘅分頁列。",
            "打開伺服器設定編輯器，喺第一個分頁「Core」度。其餘嘅一撳頂部分頁列就到。",
            "打開伺服器設定編輯器，喺第一個分頁「Core」度，其餘六個就大大方方擺喺頂部分頁列度，等你慢慢逛。",
        ],
    },
    "palette.where.configScreen": {
        en: [
            "Opens the server configuration editor at the {tab} tab.",
            "Opens the server configuration editor at the {tab} tab.",
            "Opens the server configuration editor, straight to the {tab} tab.",
            "Opens the server configuration editor and jumps to the {tab} tab.",
            "Opens the server configuration editor and jumps straight to the {tab} tab, no scrolling required.",
        ],
        yue: [
            "打開伺服器設定編輯器，去到「{tab}」分頁。",
            "打開伺服器設定編輯器，去到「{tab}」分頁。",
            "打開伺服器設定編輯器，直接去到「{tab}」分頁。",
            "打開伺服器設定編輯器，一嘢跳去「{tab}」分頁。",
            "打開伺服器設定編輯器，一嘢跳去「{tab}」分頁，唔使你自己撳嚟撳去搵。",
        ],
    },
    "palette.where.configHistoryRouted": {
        en: [
            "Opens the server configuration editor at its History tab.",
            "Opens the server configuration editor at its History tab.",
            "Opens the server configuration editor, straight to its History tab.",
            "Opens the server configuration editor and jumps to its History tab.",
            "Opens the server configuration editor and jumps straight to its History tab, no hunting required.",
        ],
        yue: [
            "打開伺服器設定編輯器，去到佢嘅「History」分頁。",
            "打開伺服器設定編輯器，去到佢嘅「History」分頁。",
            "打開伺服器設定編輯器，直接去到「History」分頁。",
            "打開伺服器設定編輯器，一嘢跳去「History」分頁。",
            "打開伺服器設定編輯器，一嘢跳去「History」分頁，唔使你周圍搵。",
        ],
    },
    "palette.where.configHistory": {
        en: [
            "Opens the server configuration editor. Its History tab, at the end of the tab strip, holds the saved versions.",
            "Opens the server configuration editor. Its History tab, at the end of the tab strip, holds the saved versions.",
            "Opens the server configuration editor. The saved versions live in its History tab, at the end of the tab strip.",
            "Opens the server configuration editor. The saved versions are in the History tab, tucked at the far end of the tab strip.",
            "Opens the server configuration editor, where the saved versions are waiting in the History tab, all the way at the end of the tab strip.",
        ],
        yue: [
            "打開伺服器設定編輯器。已儲存嘅版本喺佢嘅「History」分頁，就係分頁列最尾嗰個。",
            "打開伺服器設定編輯器。已儲存嘅版本喺佢嘅「History」分頁，就係分頁列最尾嗰個。",
            "打開伺服器設定編輯器。已儲存嘅版本住喺「History」分頁，分頁列最尾嗰個。",
            "打開伺服器設定編輯器。已儲存嘅版本收喺「History」分頁，匿埋喺分頁列最盡嗰邊。",
            "打開伺服器設定編輯器，已儲存嘅版本喺「History」分頁度等緊你，就喺分頁列最盡嗰頭。",
        ],
    },
    "palette.where.menuPage": {
        en: [
            "Opens the menu at this page.",
            "Opens the menu at this page.",
            "Opens the menu, straight to this page.",
            "Opens the menu and jumps to this page.",
            "Opens the menu and jumps straight to this page, no scrolling.",
        ],
        yue: [
            "打開選單，去到呢一頁。",
            "打開選單，去到呢一頁。",
            "打開選單，直接去到呢一頁。",
            "打開選單，一嘢跳去呢一頁。",
            "打開選單，一嘢跳去呢一頁，唔使你撳嚟撳去搵。",
        ],
    },
    "palette.where.appearanceEditors": {
        en: [
            "Opens Settings. Each editor itself is anchored to the element it edits: right-click any element and choose Edit appearance, or Shift+right-click to open it directly.",
            "Opens Settings. Each editor itself is anchored to the element it edits: right-click any element and choose Edit appearance, or Shift+right-click to open it directly.",
            "Opens Settings. Each editor is anchored to the element it edits: right-click any element and choose Edit appearance, or Shift+right-click to open it directly.",
            "Opens Settings. Every editor is anchored to whatever it edits, so right-click an element and choose Edit appearance, or Shift+right-click to skip straight there.",
            "Opens Settings. Every editor is anchored to the exact element it edits, so right-click anything and choose Edit appearance, or Shift+right-click to skip the menu entirely.",
        ],
        yue: [
            "打開設定。每個編輯器都會錨定喺佢編輯緊嗰個元素度：右鍵撳任何元素，揀「編輯外觀」，或者 Shift+右鍵直接打開。",
            "打開設定。每個編輯器都會錨定喺佢編輯緊嗰個元素度：右鍵撳任何元素，揀「編輯外觀」，或者 Shift+右鍵直接打開。",
            "打開設定。每個編輯器都錨定喺佢負責嗰個元素度：右鍵任何元素，揀「編輯外觀」，或者 Shift+右鍵直接打開。",
            "打開設定。每個編輯器都錨定喺自己負責嗰個元素，右鍵任何元素揀「編輯外觀」就得，或者 Shift+右鍵直接跳過去。",
            "打開設定。每個編輯器都黐實住自己負責嗰個元素，右鍵隨便一嘢揀「編輯外觀」，或者 Shift+右鍵直接跳過成個選單。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The shell's own surfaces, described                               */
    /* ---------------------------------------------------------------- */

    "palette.shell.settings": {
        en: [
            "The app's own settings: download consent, the Java runtime, where maps are written, and the GitHub account.",
            "The app's own settings: download consent, the Java runtime, where maps are written, and the GitHub account.",
            "The app's own settings: download consent, the Java runtime, where maps get written, and the connected GitHub account.",
            "The app's own settings, all in one place: download consent, the Java runtime, where maps land, and the GitHub account.",
            "The app's own settings, the whole junk drawer: download consent, the Java runtime, where maps land, and the GitHub account.",
        ],
        yue: [
            "呢個程式自己嘅設定：下載同意、Java 執行環境、地圖寫去邊，同埋 GitHub 帳戶。",
            "呢個程式自己嘅設定：下載同意、Java 執行環境、地圖寫去邊，同埋 GitHub 帳戶。",
            "呢個程式自己嘅設定：下載同意、Java 執行環境、地圖寫去邊度，同埋接駁緊嘅 GitHub 帳戶。",
            "呢個程式自己嘅設定，成套喺呢度：下載同意、Java 執行環境、地圖落邊，同埋 GitHub 帳戶。",
            "呢個程式自己嘅設定，成個雜物櫃咁齊：下載同意、Java 執行環境、地圖落邊，仲有 GitHub 帳戶。",
        ],
    },
    "palette.shell.config": {
        en: [
            "The options editor: every setting BlueMap itself reads, plus the flags a run is started with.",
            "The options editor: every setting BlueMap itself reads, plus the flags a run is started with.",
            "The options editor: every setting BlueMap itself reads, along with the flags a render is started with.",
            "The options editor, where every setting BlueMap actually reads lives, plus the flags a render starts with.",
            "The options editor: every setting BlueMap itself pays attention to, plus the flags a render is kicked off with.",
        ],
        yue: [
            "選項編輯器：BlueMap 自己會讀嘅每一個設定，加埋算圖開始時嘅參數旗標。",
            "選項編輯器：BlueMap 自己會讀嘅每一個設定，加埋算圖開始時嘅參數旗標。",
            "選項編輯器：BlueMap 自己會讀嘅每一個設定，仲有每次算圖開始時用嘅旗標。",
            "選項編輯器，BlueMap 真正會理嘅設定全部喺度，仲有算圖起步嗰陣用嘅旗標。",
            "選項編輯器：BlueMap 自己真正上心嗰啲設定，加埋算圖起步嗰陣攞嚟用嘅旗標。",
        ],
    },
    "palette.shell.profiles": {
        en: [
            "The list of servers and rendered maps this app can open, and where a new one is added.",
            "The list of servers and rendered maps this app can open, and where a new one is added.",
            "The list of servers and rendered maps this app can open, and the place a new one gets added.",
            "The list of servers and rendered maps this app knows about, and where you add another.",
            "The list of every server and rendered map this app can open, and the exact spot where a new one joins the family.",
        ],
        yue: [
            "呢個程式識開嘅伺服器同已算好嘅地圖清單，同埋加新項嘅位置。",
            "呢個程式識開嘅伺服器同已算好嘅地圖清單，同埋加新項嘅位置。",
            "呢個程式識開嘅伺服器同已算好嘅地圖清單，加新項就喺呢度。",
            "呢個程式識嘅伺服器同已算好嘅地圖，全部喺呢張清單，加多個都喺呢度加。",
            "呢個程式識開嘅每一個伺服器同每一張已算好嘅地圖，全部喺呢張清單度，新丁要加入都係呢個位。",
        ],
    },
    "palette.shell.resetCamera": {
        en: [
            "Puts the camera back where the map opens, facing north, at the default distance.",
            "Puts the camera back where the map opens, facing north, at the default distance.",
            "Puts the camera back where the map first opens: facing north, at the default distance.",
            "Sends the camera back to where the map opens, facing north, at the default distance.",
            "Snaps the camera straight back to where the map opens, facing north, at the default distance, no questions asked.",
        ],
        yue: [
            "將個鏡頭放返去地圖初開嗰個位置：向住北面，用預設距離。",
            "將個鏡頭放返去地圖初開嗰個位置：向住北面，用預設距離。",
            "將個鏡頭放返去地圖一開始嘅位置：向住北面，距離係預設嗰個。",
            "將個鏡頭送返去地圖啱啱開嗰陣嘅位置：向北，預設距離。",
            "唰一聲將個鏡頭送返去地圖初開嗰個位：向住北面，預設距離，二話不說。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Chrome that is not a page and not a settings section               */
    /* ---------------------------------------------------------------- */

    "palette.chrome.noticeCentre": {
        en: [
            "Every message this app has raised, searchable and filterable by level, including the ones that dismissed themselves before you read them.",
            "Every message this app has raised, searchable and filterable by level, including the ones that dismissed themselves before you read them.",
            "Every message this app has raised, searchable and filterable by level, even the ones that dismissed themselves before you got to read them.",
            "Every message this app has ever raised, searchable and filterable by level, including the ones that vanished before you noticed them.",
            "Every message this app has ever raised, searchable and filterable by level, including the ones that quietly vanished before you even noticed them.",
        ],
        yue: [
            "呢個程式發出過嘅每一個通知，可以搜尋，亦可以按等級篩選，連自己已經消失咗、你未睇到嗰啲都有。",
            "呢個程式發出過嘅每一個通知，可以搜尋，亦可以按等級篩選，連自己已經消失咗、你未睇到嗰啲都有。",
            "呢個程式發出過嘅每一個通知，可以搜尋，亦可以按等級篩選，連自己消失咗、你未睇到嗰啲都算埋。",
            "呢個程式試過發出嘅每一個通知，可以搜尋，可以按等級篩選，連自己靜靜雞消失、你未睇到嗰啲都有。",
            "呢個程式一路以嚟發出過嘅每一個通知，可以搜尋，可以按等級篩選，連自己靜雞雞消失咗、你眼角都未望到嗰啲都齊齊喺度。",
        ],
    },
    "palette.chrome.tabFinder": {
        en: [
            "The tab strip's own search: every open tab and every group, with the bulk-close actions and their regex builders.",
            "The tab strip's own search: every open tab and every group, with the bulk-close actions and their regex builders.",
            "The tab strip's own search: every open tab and every group, plus the bulk-close actions and their regex builders.",
            "The tab strip's own search, covering every open tab and every group, with the bulk-close actions and their regex builders right there.",
            "The tab strip's own search: every open tab, every group, the bulk-close actions, and their regex builders, all in one box.",
        ],
        yue: [
            "分頁列自己嘅搜尋：每個開緊嘅分頁同每個群組，仲有批量閂掣同佢哋嘅 regex 建構器。",
            "分頁列自己嘅搜尋：每個開緊嘅分頁同每個群組，仲有批量閂掣同佢哋嘅 regex 建構器。",
            "分頁列自己嘅搜尋：每個開緊嘅分頁同每個群組，加埋批量閂掣同佢哋嘅 regex 建構器。",
            "分頁列自己嘅搜尋，涵蓋每個開緊嘅分頁同每個群組，批量閂掣同 regex 建構器就喺手邊。",
            "分頁列自己嘅搜尋：每個開緊嘅分頁、每個群組、批量閂掣，同埋佢哋嘅 regex 建構器，全部濃縮喺一個框度。",
        ],
    },
    "palette.chrome.changelog": {
        en: [
            "Every released version and what changed in it, with a date filter and a search, each entry linked to the commit that made it.",
            "Every released version and what changed in it, with a date filter and a search, each entry linked to the commit that made it.",
            "Every released version and what changed in it, with a date filter and a search, and each entry linked to the commit behind it.",
            "Every released version and what changed in it, with a date filter and a search that actually finds things, every entry linked back to the commit that made it.",
            "Every released version, every change in it, with a date filter, a search, and every single entry linked straight back to the commit that made it real.",
        ],
        yue: [
            "每一個已發佈嘅版本同入面改咗啲乜，有日期篩選同搜尋，每一項都連住整出佢嗰個 commit。",
            "每一個已發佈嘅版本同入面改咗啲乜，有日期篩選同搜尋，每一項都連住整出佢嗰個 commit。",
            "每一個已發佈嘅版本同入面改咗啲乜，有日期篩選、有搜尋，每一項都連返去整出佢嗰個 commit。",
            "每一個已發佈嘅版本、入面改咗啲乜，可以按日期篩選，可以搜尋，每一項都連返去整出佢嗰個 commit。",
            "每一個已發佈嘅版本，入面改咗啲乜，可以按日期篩選、可以搜尋，每一項都實實在在連返去整出佢嗰個 commit。",
        ],
    },
    "palette.chrome.tutorial": {
        en: [
            "A short guided walkthrough of finding a world, rendering it, and opening the result, with the real controls highlighted as it goes.",
            "A short guided walkthrough of finding a world, rendering it, and opening the result, with the real controls highlighted as it goes.",
            "A short guided walkthrough of finding a world, rendering it, and opening the result, highlighting the real controls the whole way through.",
            "The guided walkthrough: finding a world, rendering it, opening the result, with the real controls lit up as it goes rather than a wall of text.",
            "The guided walkthrough, real controls lit up the whole way: finding a world, rendering it, opening the result, no wall of text in sight.",
        ],
        yue: [
            "一個簡短嘅導覽，會帶你搵世界、算圖、打開結果，沿途仲會標示出真正嘅控制項。",
            "一個簡短嘅導覽，會帶你搵世界、算圖、打開結果，沿途仲會標示出真正嘅控制項。",
            "一個簡短嘅導覽，帶你搵世界、算圖、打開結果，成程都會標示出真正嘅控制項。",
            "呢個導覽：搵世界、算圖、打開結果，真正嘅控制項會沿途發光提示你，唔使睇成堆文字。",
            "呢個導覽全程幫你標亮真正嘅控制項：搵世界、算圖、打開結果，一個字都唔使睇。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The options editor's "everything" row and its History tab         */
    /* ---------------------------------------------------------------- */

    "palette.config.allDescription": {
        en: [
            "The options editor holds one tab per group of settings. Open it and pick the tab named below.",
            "The options editor holds one tab per group of settings. Open it and pick the tab named below.",
            "The options editor holds one tab per group of settings: open it and pick the tab named below.",
            "The options editor has one tab per group of settings, so open it and go straight to the tab named below.",
            "The options editor keeps one tab per group of settings, so open it up and head straight for the tab named below.",
        ],
        yue: [
            "選項編輯器每一組設定都有一個分頁。打開佢，揀返下面講嗰個分頁。",
            "選項編輯器每一組設定都有一個分頁。打開佢，揀返下面講嗰個分頁。",
            "選項編輯器每一組設定都有一個分頁：打開佢，揀返下面講嗰個分頁。",
            "選項編輯器每一組設定都各有一個分頁，打開佢直接去下面講嗰個分頁。",
            "選項編輯器每一組設定都各佔一個分頁，打開佢，直接殺去下面講嗰個分頁。",
        ],
    },
    "palette.config.historyDescription": {
        en: [
            "Every saved version of the open config folder, kept on this computer: browse them, see what each one changed, and put one back.",
            "Every saved version of the open config folder, kept on this computer: browse them, see what each one changed, and put one back.",
            "Every saved version of the open config folder, kept on this computer: browse them, see what each one changed, and restore any of them.",
            "Every saved version of the open config folder, all kept right here on this computer: browse them, see what changed, and put one back.",
            "Every saved version of the open config folder, safely hoarded on this computer: browse them, see exactly what each one changed, and put any one of them back.",
        ],
        yue: [
            "呢個開緊嘅設定資料夾，每一個已儲存嘅版本都存喺呢部電腦：可以瀏覽、睇每個版本改咗乜，仲可以擺返轉頭。",
            "呢個開緊嘅設定資料夾，每一個已儲存嘅版本都存喺呢部電腦：可以瀏覽、睇每個版本改咗乜，仲可以擺返轉頭。",
            "呢個開緊嘅設定資料夾，每一個已儲存嘅版本都存喺呢部電腦：可以瀏覽、睇每個版本改咗乜，仲可以還原返任何一個。",
            "呢個開緊嘅設定資料夾，每一個已儲存嘅版本全部囤咗喺呢部電腦：可以慢慢瀏覽、睇改咗乜，仲可以擺返轉頭。",
            "呢個開緊嘅設定資料夾，每一個已儲存嘅版本都穩穩陣陣囤咗喺呢部電腦：慢慢瀏覽、逐個睇改咗乜，鍾意邊個就擺返轉頭。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Appearance: the preset in force, and the way back                 */
    /* ---------------------------------------------------------------- */

    "palette.appearance.presetDescription": {
        en: [
            "The saved look applied underneath every element's own customisation. Built-in presets and any you have saved yourself.",
            "The saved look applied underneath every element's own customisation. Built-in presets and any you have saved yourself.",
            "The saved look applied underneath every element's own customisation: built-in presets, plus any you have saved yourself.",
            "The saved look sitting underneath every element's own customisation, whether a built-in preset or one you saved yourself.",
            "The saved look that sits quietly underneath every element's own customisation, whether it is a built-in preset or one you cooked up yourself.",
        ],
        yue: [
            "套用喺每個元素自訂之下嘅已儲存外觀。有內建預設，亦有你自己儲存嘅。",
            "套用喺每個元素自訂之下嘅已儲存外觀。有內建預設，亦有你自己儲存嘅。",
            "套用喺每個元素自訂之下嘅已儲存外觀：有內建預設，亦有你自己儲存嘅。",
            "呢個係墊喺每個元素自訂底下嗰層已儲存外觀，可以係內建預設，亦可以係你自己儲存嗰個。",
            "呢個係靜靜地墊喺每個元素自訂底下嗰層已儲存外觀，可以係內建預設，亦可以係你自己整出嚟儲存嗰個。",
        ],
    },
    "palette.appearance.resetDescription": {
        en: [
            "Puts every element back to the app's own look and clears the active preset. Saved presets are kept, so this is undone by choosing one again.",
            "Puts every element back to the app's own look and clears the active preset. Saved presets are kept, so this is undone by choosing one again.",
            "Puts every element back to the app's own look and clears the active preset. Saved presets stay kept, so choosing one again undoes it.",
            "Puts every element back to the app's own default look and clears whichever preset was active. Saved presets are kept, so picking one again undoes it.",
            "Puts every single element back to the app's own default look and wipes out whichever preset was active. Saved presets are kept untouched, so picking one again is your undo button.",
        ],
        yue: [
            "將每個元素都放返去程式自己嘅原廠外觀，並清除緊用緊嘅預設。已儲存嘅預設會保留，之後再揀返一個就等於復原。",
            "將每個元素都放返去程式自己嘅原廠外觀，並清除緊用緊嘅預設。已儲存嘅預設會保留，之後再揀返一個就等於復原。",
            "將每個元素都放返去程式自己嘅原廠外觀，清除緊用緊嘅預設。已儲存嘅預設仍然保留，再揀返一個就係復原。",
            "將每一個元素都打回程式原廠外觀，清埋原本用緊嗰個預設。已儲存嘅預設保留無損，再揀返一個就等於復原。",
            "將每一個元素通通打回程式原廠外觀，原本用緊嗰個預設一鑊清埋。已儲存嘅預設原封不動咁保留低，再揀返一個就係你嘅復原掣。",
        ],
    },
    "palette.appearance.editorsDescription": {
        en: [
            "Font, size, weight, colour, highlight, spacing, borders and shape, per element, with the infinite colour picker and its translator.",
            "Font, size, weight, colour, highlight, spacing, borders and shape, per element, with the infinite colour picker and its translator.",
            "Font, size, weight, colour, highlight, spacing, borders and shape, all per element, with the infinite colour picker and its translator.",
            "Font, size, weight, colour, highlight, spacing, borders and shape, every one of them per element, plus the infinite colour picker with its translator.",
            "Font, size, weight, colour, highlight, spacing, borders and shape, all of it per element, plus the infinite colour picker and its translator for good measure.",
        ],
        yue: [
            "字型、大細、粗幼、顏色、高光、間距、邊框同形狀，逐個元素都可以自訂，仲有無限色彩選擇器同佢嘅轉換器。",
            "字型、大細、粗幼、顏色、高光、間距、邊框同形狀，逐個元素都可以自訂，仲有無限色彩選擇器同佢嘅轉換器。",
            "字型、大細、粗幼、顏色、高光、間距、邊框同形狀，全部逐個元素自訂，仲有無限色彩選擇器同佢嘅轉換器。",
            "字型、大細、粗幼、顏色、高光、間距、邊框同形狀，每一樣都可以逐個元素自訂，仲有無限色彩選擇器連轉換器一齊嚟。",
            "字型、大細、粗幼、顏色、高光、間距、邊框同形狀，逐個元素通通任你自訂，仲外加無限色彩選擇器同佢嘅轉換器伴駕。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The viewer's own menu, page by page                               */
    /* ---------------------------------------------------------------- */

    "palette.menu.maps": {
        en: [
            "Every map this server publishes, and which one is on screen.",
            "Every map this server publishes, and which one is on screen.",
            "Every map this server publishes, plus which one is currently on screen.",
            "Every map this server publishes, and a clear marker for which one is on screen right now.",
            "Every map this server publishes, all lined up, with a clear marker for which one is on screen right this second.",
        ],
        yue: [
            "呢個伺服器發佈嘅每一張地圖，同埋而家顯示緊邊一張。",
            "呢個伺服器發佈嘅每一張地圖，同埋而家顯示緊邊一張。",
            "呢個伺服器發佈嘅每一張地圖，加埋而家顯示緊邊一張。",
            "呢個伺服器發佈嘅每一張地圖，清楚標明而家顯示緊邊一張。",
            "呢個伺服器發佈嘅每一張地圖，齊齊整整排晒出嚟，仲清楚標明邊一張而家實實在在顯示緊。",
        ],
    },
    "palette.menu.settings": {
        en: [
            "The viewer's settings page, which is also where resetting every saved setting lives behind its confirmation.",
            "The viewer's settings page, which is also where resetting every saved setting lives behind its confirmation.",
            "The viewer's settings page, and also where resetting every saved setting sits, behind its confirmation.",
            "The viewer's settings page, and the place where resetting every saved setting hides, behind its confirmation gate.",
            "The viewer's settings page, plus the one place where resetting every saved setting is hiding, safely behind its confirmation gate.",
        ],
        yue: [
            "檢視器嘅設定頁面，重設所有已儲存設定嘅功能，都收埋喺呢度嘅確認步驟後面。",
            "檢視器嘅設定頁面，重設所有已儲存設定嘅功能，都收埋喺呢度嘅確認步驟後面。",
            "檢視器嘅設定頁面，重設所有已儲存設定嘅功能都喺呢度，收埋喺確認步驟後面。",
            "檢視器嘅設定頁面，重設所有已儲存設定嗰個功能都收埋喺呢度，確認步驟後面先揾到。",
            "檢視器嘅設定頁面，重設所有已儲存設定嗰個殺著都匿埋喺呢度，確認步驟後面先肯現身。",
        ],
    },
    "palette.menu.info": {
        en: [
            "What the controls do, and what this build of BlueMap is.",
            "What the controls do, and what this build of BlueMap is.",
            "What the controls do, plus what this build of BlueMap actually is.",
            "What every control does, and exactly what this build of BlueMap is.",
            "What every control actually does, and exactly what this build of BlueMap claims to be.",
        ],
        yue: [
            "各項控制嘅作用，同埋呢個 BlueMap build 係乜。",
            "各項控制嘅作用，同埋呢個 BlueMap build 係乜。",
            "各項控制嘅作用，加埋呢個 BlueMap build 究竟係乜。",
            "每一項控制嘅作用，同埋呢個 BlueMap build 實際係乜嚟。",
            "每一項控制實際做緊乜，同埋呢個 BlueMap build 究竟自稱係乜。",
        ],
    },
    "palette.menu.markers": {
        en: [
            "Every marker set on this map, and the markers inside them.",
            "Every marker set on this map, and the markers inside them.",
            "Every marker set on this map, plus the markers sitting inside each one.",
            "Every marker set on this map, and every marker tucked inside them.",
            "Every marker set on this map, right down to every last marker tucked inside them.",
        ],
        yue: [
            "呢張地圖上面嘅每一個標記集，同埋入面嘅標記。",
            "呢張地圖上面嘅每一個標記集，同埋入面嘅標記。",
            "呢張地圖上面嘅每一個標記集，加埋收埋喺入面嘅標記。",
            "呢張地圖上面嘅每一個標記集，仲有匿埋喺入面每一個標記。",
            "呢張地圖上面嘅每一個標記集，一路數到匿埋最入面嗰個標記都唔放過。",
        ],
    },
    "palette.menu.players": {
        en: [
            "Who is online right now, and where they are standing.",
            "Who is online right now, and where they are standing.",
            "Who is online right now, plus exactly where they are standing.",
            "Who is online right now, and exactly where each of them is standing.",
            "Who is actually online right now, and exactly where every last one of them is standing.",
        ],
        yue: [
            "而家有邊個上緊線，同埋佢哋企緊邊度。",
            "而家有邊個上緊線，同埋佢哋企緊邊度。",
            "而家有邊個上緊線，加埋佢哋實際企緊邊度。",
            "而家實實在在有邊個上緊線，仲有每一個實際企緊邊度。",
            "而家真金白銀有邊個上緊線，一個一個實際企緊邊度都話俾你知。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The palette's own size                                            */
    /* ---------------------------------------------------------------- */

    "palette.size.description": {
        en: [
            "Whether this palette opens as a bounded card or fills the window. Remembered between launches.",
            "Whether this palette opens as a bounded card or fills the window. Remembered between launches.",
            "Whether this palette opens as a bounded card or fills the whole window, remembered between launches.",
            "Whether this palette opens small as a card or takes over the whole window, and it remembers your choice next time.",
            "Whether this palette opens as a tidy little card or takes over the entire window, and it remembers whichever one you like, every time.",
        ],
        yue: [
            "呢個面板開嘅時候係卡片形式定係撐滿成個視窗。下次開返都會記得。",
            "呢個面板開嘅時候係卡片形式定係撐滿成個視窗。下次開返都會記得。",
            "呢個面板開嘅時候係卡片形式定係撐滿成個視窗，下次開返都會記得。",
            "呢個面板細細張咁開做卡片，定係一嘢佔晒成個視窗，你揀嗰個佢會記住，下次照樣。",
            "呢個面板係整整齊齊做返張卡片，定係一鑊過霸晒成個視窗，你鍾意邊款佢都幫你記住，次次都係咁。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Every viewer setting, described                                   */
    /*                                                                    */
    /* The label on each row (lighting.sunlight, resolution.title, and    */
    /* so on) is upstream's own word for the control and is not answered  */
    /* here - see the header note. What is here is the one sentence       */
    /* explaining what the control actually does, which the settings      */
    /* page itself has no equivalent for.                                 */
    /* ---------------------------------------------------------------- */

    "palette.view.description": {
        en: [
            "How the camera looks at the world: an angled perspective, straight down, or free flight.",
            "How the camera looks at the world: an angled perspective, straight down, or free flight.",
            "How the camera looks at the world: angled perspective, straight down flat, or free flight.",
            "How the camera sees the world, whether that is an angled perspective, straight down flat, or free flight.",
            "How the camera sees the world, whether that is a moody angled perspective, dead flat from above, or full free flight.",
        ],
        yue: [
            "個鏡頭點睇個世界：斜角透視、直落平面，定係自由飛行。",
            "個鏡頭點睇個世界：斜角透視、直落平面，定係自由飛行。",
            "個鏡頭點樣睇住個世界：斜角透視、直落平面，或者自由飛行。",
            "個鏡頭用邊種方式睇個世界，可以係斜角透視、直落平面，或者自由飛行。",
            "個鏡頭用邊種姿態睇個世界，可以係型格斜角透視、直落平面掃描，又或者自由飛行任你闖。",
        ],
    },
    "palette.sunlight.description": {
        en: [
            "How strong the directional daylight is, from none to full.",
            "How strong the directional daylight is, from none to full.",
            "How strong the directional daylight is, anywhere from none to full.",
            "How strong the directional daylight is, anywhere from pitch dark to full blast.",
            "How strong the directional daylight is, from pitch dark all the way up to full blast.",
        ],
        yue: [
            "有方向性嘅日光有幾強，由冇到全開都得。",
            "有方向性嘅日光有幾強，由冇到全開都得。",
            "有方向性嘅日光有幾強，由完全冇到全開之間都得。",
            "有方向性嘅日光有幾強，由烏燈黑火到全開火力都任揀。",
            "有方向性嘅日光有幾勁，由烏燈黑火一路推到全開火力都任你搓。",
        ],
    },
    "palette.ambientLight.description": {
        en: [
            "How much light reaches surfaces the sun is not hitting.",
            "How much light reaches surfaces the sun is not hitting.",
            "How much light still reaches surfaces the sun is not hitting.",
            "How much light manages to reach surfaces the sun is not hitting.",
            "How much light sneaks onto surfaces the sun never quite reaches.",
        ],
        yue: [
            "太陽照唔到嘅表面，有幾多光線都可以照到。",
            "太陽照唔到嘅表面，有幾多光線都可以照到。",
            "太陽照唔到嘅表面，仲有幾多光線可以照到。",
            "太陽照唔到嘅表面，仍然可以有幾多光線滲埋入去。",
            "太陽死都照唔到嘅表面，居然仲有幾多光偷偷摸摸滲埋入去。",
        ],
    },
    "palette.resolution.description": {
        en: [
            "How many pixels are rendered per screen pixel. Higher looks sharper and costs more.",
            "How many pixels are rendered per screen pixel. Higher looks sharper and costs more.",
            "How many pixels get rendered per screen pixel. Higher looks sharper, and costs more.",
            "How many pixels get rendered for every screen pixel. Higher looks sharper, and it costs more to render.",
            "How many pixels get crammed into every single screen pixel. Higher looks sharper, and your machine pays for every bit of it.",
        ],
        yue: [
            "每個螢幕像素會算幾多個像素出嚟。愈高愈銳利，都愈食資源。",
            "每個螢幕像素會算幾多個像素出嚟。愈高愈銳利，都愈食資源。",
            "每個螢幕像素會算幾多個像素出嚟，愈高會愈銳利，同時都愈食資源。",
            "每個螢幕像素背後會算幾多個像素，愈高就愈銳利，機器都要俾多啲力。",
            "每個螢幕像素背後死命塞幾多個像素，愈高就愈銳利，你部機亦都要為呢份銳利埋單。",
        ],
    },
    "palette.hires.description": {
        en: [
            "How far the detailed tiles are loaded, where zero turns the detailed layer off entirely.",
            "How far the detailed tiles are loaded, where zero turns the detailed layer off entirely.",
            "How far the detailed tiles get loaded. Setting it to zero turns the detailed layer off entirely.",
            "How far out the detailed tiles load. Drag it to zero and the detailed layer switches off completely.",
            "How far out the detailed tiles load before they give up. Drag it all the way to zero and the detailed layer switches off completely.",
        ],
        yue: [
            "精細圖磚會載入幾遠。設做零就會將精細層完全關閉。",
            "精細圖磚會載入幾遠。設做零就會將精細層完全關閉。",
            "精細圖磚載入到幾遠。設做零就將精細層完全關閉。",
            "精細圖磚會由近載到幾遠。拖到零，成個精細層就完全熄咗。",
            "精細圖磚會撐到幾遠先肯放棄。一路拖到零，成個精細層就徹底熄晒燈。",
        ],
    },
    "palette.lowres.description": {
        en: [
            "How far the coarse tiles are loaded, which is what fills the horizon.",
            "How far the coarse tiles are loaded, which is what fills the horizon.",
            "How far the coarse tiles get loaded, which is what fills in the horizon.",
            "How far out the coarse tiles load, which is what fills the horizon in the distance.",
            "How far out the coarse tiles load before the world gives up, which is what fills that far horizon.",
        ],
        yue: [
            "粗略圖磚會載入幾遠，決定咗地平線填成點。",
            "粗略圖磚會載入幾遠，決定咗地平線填成點。",
            "粗略圖磚載入到幾遠，決定咗地平線填成點樣。",
            "粗略圖磚會由近載到幾遠，遠處嘅地平線就係靠佢填返晒。",
            "粗略圖磚會撐到幾遠先罷休，成條遙遠地平線就係靠佢一手填返晒。",
        ],
    },
    "palette.loadHires.description": {
        en: [
            "Whether detailed tiles keep loading while the camera moves. Off is smoother on a slow machine.",
            "Whether detailed tiles keep loading while the camera moves. Off is smoother on a slow machine.",
            "Whether detailed tiles keep loading while the camera is moving. Off tends to run smoother on a slow machine.",
            "Whether detailed tiles keep loading while the camera is on the move. Turning it off usually runs smoother on a slow machine.",
            "Whether detailed tiles keep piling in while the camera is dashing about. Turning it off usually buys a slow machine a much smoother ride.",
        ],
        yue: [
            "鏡頭郁緊嗰陣，精細圖磚會唔會繼續載入。慢機關咗會流暢啲。",
            "鏡頭郁緊嗰陣，精細圖磚會唔會繼續載入。慢機關咗會流暢啲。",
            "鏡頭郁緊嗰陣，精細圖磚會唔會繼續載入，慢機關咗通常會流暢啲。",
            "鏡頭喺度郁緊嗰陣，精細圖磚會唔會照樣載入，慢機關咗通常跑得順啲。",
            "鏡頭四圍飛嗰陣，精細圖磚仲會唔會死頂住載，慢機關咗分分鐘順到飛起。",
        ],
    },
    "palette.zoomButtons.description": {
        en: [
            "Whether the plus and minus buttons sit over the map.",
            "Whether the plus and minus buttons sit over the map.",
            "Whether the plus and minus buttons sit on top of the map.",
            "Whether the plus and minus buttons show up over the map at all.",
            "Whether the plus and minus buttons bother showing up over the map at all.",
        ],
        yue: [
            "加號同減號按鈕會唔會擺喺地圖上面。",
            "加號同減號按鈕會唔會擺喺地圖上面。",
            "加號同減號按鈕會唔會擺喺地圖上面嗰層。",
            "加號同減號按鈕會唔會索性喺地圖上面出現。",
            "加號同減號按鈕仲使唔使費事喺地圖上面現身。",
        ],
    },
    "palette.sensitivity.description": {
        en: [
            "How far the free-flight camera turns for a given mouse movement.",
            "How far the free-flight camera turns for a given mouse movement.",
            "How far the free-flight camera turns for a given amount of mouse movement.",
            "How far the free-flight camera swings for a given nudge of the mouse.",
            "How far the free-flight camera swings around for the smallest nudge of the mouse.",
        ],
        yue: [
            "自由飛行嗰陣，滑鼠郁一啲，鏡頭會轉幾多。",
            "自由飛行嗰陣，滑鼠郁一啲，鏡頭會轉幾多。",
            "自由飛行嗰陣，滑鼠郁一定幅度，鏡頭會轉幾多。",
            "自由飛行嗰陣，滑鼠輕輕郁一郁，鏡頭會擺盪幾大幅。",
            "自由飛行嗰陣，滑鼠一丁點郁動，鏡頭都可以擺盪好大幅。",
        ],
    },
    "palette.invertMouse.description": {
        en: [
            "Whether moving the mouse up looks down in free flight.",
            "Whether moving the mouse up looks down in free flight.",
            "Whether moving the mouse upward looks downward in free flight.",
            "Whether pushing the mouse up actually makes you look down in free flight.",
            "Whether pushing the mouse up makes you look down instead, purely to keep free flight interesting.",
        ],
        yue: [
            "自由飛行嗰陣，滑鼠向上郁會唔會變成望落。",
            "自由飛行嗰陣，滑鼠向上郁會唔會變成望落。",
            "自由飛行嗰陣，將滑鼠向上郁會唔會反而望落。",
            "自由飛行嗰陣，滑鼠向上郁，係咪反而搞到你望落。",
            "自由飛行嗰陣，滑鼠明明向上郁，係咪偏偏搞到你望落，成日玩你。",
        ],
    },
    "palette.theme.description": {
        en: [
            "Light, dark, high contrast, or whatever the operating system is set to.",
            "Light, dark, high contrast, or whatever the operating system is set to.",
            "Light, dark, high contrast, or simply whatever the operating system is set to.",
            "Light, dark, high contrast, or leave it to whatever the operating system already decided.",
            "Light, dark, high contrast, or just leave it to whatever mood the operating system happens to be in.",
        ],
        yue: [
            "淺色、深色、高對比，或者跟返作業系統嘅設定。",
            "淺色、深色、高對比，或者跟返作業系統嘅設定。",
            "淺色、深色、高對比，或者索性跟返作業系統嘅設定。",
            "淺色、深色、高對比，或者直情交返俾作業系統自己決定。",
            "淺色、深色、高對比，或者索性交晒俾作業系統，睇下佢嗰刻心情點。",
        ],
    },
    "palette.screenshot.description": {
        en: [
            "Whether a screenshot goes to the clipboard instead of being downloaded.",
            "Whether a screenshot goes to the clipboard instead of being downloaded.",
            "Whether a screenshot lands on the clipboard instead of being downloaded.",
            "Whether a screenshot lands on the clipboard instead of downloading to disk.",
            "Whether a screenshot lands straight on the clipboard instead of bothering to download at all.",
        ],
        yue: [
            "截圖會唔會去咗剪貼簿，而唔係下載落嚟。",
            "截圖會唔會去咗剪貼簿，而唔係下載落嚟。",
            "截圖會唔會落咗剪貼簿，而唔係下載落嚟。",
            "截圖會唔會直接去剪貼簿，而唔係落磁碟下載。",
            "截圖會唔會爽爽脆脆去咗剪貼簿，費事落磁碟下載。",
        ],
    },
    "palette.language.description": {
        en: [
            "The language the interface is written in.",
            "The language the interface is written in.",
            "The language this interface is written in.",
            "Which language the interface speaks.",
            "Whichever language the interface has decided to speak today.",
        ],
        yue: [
            "呢個介面用緊嘅語言。",
            "呢個介面用緊嘅語言。",
            "呢個介面而家用緊嘅語言。",
            "呢個介面用邊種語言講嘢。",
            "呢個介面今日心情揀咗邊種語言講嘢。",
        ],
    },
    "palette.chunkBorders.description": {
        en: [
            "Draws the sixteen-block chunk grid over the world.",
            "Draws the sixteen-block chunk grid over the world.",
            "Draws the sixteen-block chunk grid across the world.",
            "Draws a sixteen-block chunk grid right over the whole world.",
            "Paints a sixteen-block chunk grid over the entire world, so every boundary is on full display.",
        ],
        yue: [
            "喺個世界上面畫返十六格方塊嘅區塊網格。",
            "喺個世界上面畫返十六格方塊嘅區塊網格。",
            "喺成個世界上面畫返十六格方塊嘅區塊網格。",
            "喺成個世界上面畫返一個十六格方塊嘅區塊網格。",
            "喺成個世界上面畫到成個十六格方塊嘅區塊網格出晒嚟，一條界線都走唔甩。",
        ],
    },
    "palette.debug.description": {
        en: [
            "Shows the viewer's own diagnostics and logs more to the console.",
            "Shows the viewer's own diagnostics and logs more to the console.",
            "Shows the viewer's own diagnostics, and logs more to the console.",
            "Shows the viewer's own diagnostics on screen and pushes more logging to the console.",
            "Shows the viewer's own diagnostics right there on screen and floods the console with extra logging.",
        ],
        yue: [
            "顯示檢視器自己嘅診斷資訊，並喺主控台輸出多啲記錄。",
            "顯示檢視器自己嘅診斷資訊，並喺主控台輸出多啲記錄。",
            "顯示檢視器自己嘅診斷資訊，仲會喺主控台輸出多啲記錄。",
            "喺畫面顯示檢視器自己嘅診斷資訊，仲會落多啲記錄去主控台。",
            "喺畫面顯示檢視器自己嘅診斷資訊，仲會癲咗咁落大量記錄去主控台。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PALETTE_FIXED = {
    /* The palette's own chrome. */
    "palette.title": { en: "Command palette", yue: "指令面板" },
    "palette.close": { en: "Close the command palette", yue: "閂咗指令面板" },
    "palette.search.label": { en: "Search everything", yue: "搜尋所有嘢" },
    "palette.search.hint": {
        en: "a command, a setting, or where you want to go",
        yue: "一個指令、一個設定，或者你想去嘅地方",
    },

    /*
     * The badge on every row, naming what kind of row it is: something that runs, something
     * that carries a real control, or something that opens a surface. Part of the accessible
     * name, not decoration, so a level cannot usefully restyle a word that has to stay this
     * short and this exact.
     */
    "palette.kind.command": { en: "Command", yue: "指令" },
    "palette.kind.setting": { en: "Setting", yue: "設定" },
    "palette.kind.destination": { en: "Opens", yue: "會開" },

    /* The headings rows are bucketed under, first-seen order in the catalogue. */
    "palette.group.app": { en: "App", yue: "程式" },
    "palette.group.pages": { en: "Pages", yue: "頁面" },
    "palette.group.chrome": { en: "Shell", yue: "介面" },
    "palette.group.appSettings": { en: "App settings", yue: "程式設定" },
    "palette.group.config": { en: "Server configuration", yue: "伺服器設定" },
    "palette.group.appearance": { en: "Appearance", yue: "外觀" },
    "palette.group.menu": { en: "Menu", yue: "選單" },
    "palette.group.palette": { en: "Command palette", yue: "指令面板" },

    /* The palette's own size, as a setting row's title and its two choice labels. */
    "palette.size.title": { en: "Command palette size", yue: "指令面板大小" },
    "palette.size.card": { en: "Card", yue: "卡片" },
    "palette.size.full": { en: "Full window", yue: "全視窗" },
    "palette.size.toCard": { en: "Shrink to a card", yue: "縮返做卡片" },
    "palette.size.toFull": { en: "Fill the window", yue: "撐滿成個視窗" },

    /* The options editor's "everything" row and the appearance rows: names, not sentences. */
    "palette.config.allTitle": { en: "Every BlueMap setting", yue: "所有 BlueMap 設定" },
    "palette.config.historyTitle": { en: "Config folder history", yue: "設定資料夾歷史" },
    "palette.appearance.presetTitle": { en: "Appearance preset", yue: "外觀預設" },
    "palette.appearance.resetTitle": {
        en: "Reset every appearance customisation",
        yue: "重設所有外觀自訂",
    },
    "palette.appearance.editorsTitle": {
        en: "Customise one element's appearance",
        yue: "自訂單一元素嘅外觀",
    },
    "palette.appearance.noPreset": { en: "No preset", yue: "冇預設" },

    /* The unit rendered beside the two render-distance number boxes. */
    "palette.blocks": { en: "blocks", yue: "方塊" },

    /*
     * Two screen names with no call site anywhere else in the package yet - see the header
     * note. Not upstream keys: `public/lang/*.conf` has no `servers` or `tabs.finder` path.
     */
    "servers.title": { en: "Servers", yue: "伺服器" },
    "tabs.finder.title": { en: "Find a tab", yue: "搵分頁" },
} as const satisfies Record<string, FixedString>;

export const PALETTE_FACTS = {
    "palette.hint": { en: ["Enter", "Escape"], yue: ["Enter", "Escape"] },
    "palette.noMap": { en: ["map is open"], yue: ["開咗張地圖"] },
    "palette.search.badPattern": {
        en: ["pattern", "nothing is listed"],
        yue: ["pattern", "冇列出任何嘢"],
    },
    "palette.search.found": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "palette.search.total": {
        en: ["{commands}", "{settings}", "{places}"],
        yue: ["{commands}", "{settings}", "{places}"],
    },
    "palette.search.noMatches": { en: ["Nothing", "matches"], yue: ["冇嘢符合"] },
    "palette.page.generic": { en: ["tab strip"], yue: ["分頁列"] },

    "palette.where.page": { en: ["{page}"], yue: ["{page}"] },
    "palette.where.settings": { en: ["Settings panel"], yue: ["設定面板"] },
    "palette.where.config": { en: ["server configuration editor"], yue: ["伺服器設定編輯器"] },
    "palette.where.profiles": { en: ["server list"], yue: ["伺服器清單"] },
    "palette.where.section": { en: ["Settings", "outline"], yue: ["設定", "圈"] },
    "palette.where.githubSection": {
        en: ["Settings", "last section", "nothing outlines it"],
        yue: ["設定", "最尾嗰個部分", "冇嘢會圈住佢"],
    },
    "palette.where.configAll": {
        en: ["server configuration editor", "Core"],
        yue: ["伺服器設定編輯器", "Core"],
    },
    "palette.where.configScreen": {
        en: ["server configuration editor", "{tab}"],
        yue: ["伺服器設定編輯器", "{tab}"],
    },
    "palette.where.configHistoryRouted": {
        en: ["server configuration editor", "History"],
        yue: ["伺服器設定編輯器", "History"],
    },
    "palette.where.configHistory": {
        en: ["server configuration editor", "History", "saved versions"],
        yue: ["伺服器設定編輯器", "History", "已儲存嘅版本"],
    },
    "palette.where.menuPage": { en: ["menu"], yue: ["選單"] },
    "palette.where.appearanceEditors": {
        en: ["Settings", "Edit appearance", "Shift+right-click"],
        yue: ["設定", "編輯外觀", "Shift+右鍵"],
    },

    "palette.shell.settings": {
        en: ["download consent", "Java runtime", "GitHub account"],
        yue: ["下載同意", "Java 執行環境", "GitHub 帳戶"],
    },
    "palette.shell.config": { en: ["BlueMap", "flags"], yue: ["BlueMap", "旗標"] },
    "palette.shell.profiles": {
        en: ["server", "rendered map"],
        yue: ["伺服器", "已算好嘅地圖"],
    },
    "palette.shell.resetCamera": { en: ["camera", "north"], yue: ["鏡頭", "北"] },

    "palette.chrome.noticeCentre": {
        en: ["searchable", "filterable by level"],
        yue: ["搜尋", "按等級篩選"],
    },
    "palette.chrome.tabFinder": {
        en: ["tab", "group", "regex"],
        yue: ["分頁", "群組", "regex"],
    },
    "palette.chrome.changelog": {
        en: ["date filter", "commit"],
        yue: ["日期篩選", "commit"],
    },
    "palette.chrome.tutorial": {
        en: ["guided walkthrough"],
        yue: ["導覽"],
    },

    "palette.config.allDescription": {
        en: ["options editor", "tab"],
        yue: ["選項編輯器", "分頁"],
    },
    "palette.config.historyDescription": {
        en: ["config folder", "this computer"],
        yue: ["設定資料夾", "呢部電腦"],
    },

    "palette.appearance.presetDescription": {
        en: ["preset", "customisation"],
        yue: ["預設", "自訂"],
    },
    "palette.appearance.resetDescription": { en: ["preset", "kept"], yue: ["預設", "保留"] },
    "palette.appearance.editorsDescription": {
        en: ["colour picker", "per element"],
        yue: ["色彩選擇器", "逐個元素"],
    },

    "palette.menu.maps": { en: ["Every map", "on screen"], yue: ["每一張地圖", "顯示緊"] },
    "palette.menu.settings": {
        en: ["viewer's settings", "reset", "confirmation"],
        yue: ["檢視器嘅設定", "重設", "確認"],
    },
    "palette.menu.info": { en: ["control", "BlueMap"], yue: ["控制", "BlueMap"] },
    "palette.menu.markers": { en: ["marker set", "marker"], yue: ["標記集", "標記"] },
    "palette.menu.players": { en: ["online", "standing"], yue: ["上緊線", "企緊"] },

    "palette.size.description": { en: ["card", "window"], yue: ["卡片", "視窗"] },

    "palette.view.description": {
        en: ["perspective", "free flight"],
        yue: ["透視", "自由飛行"],
    },
    "palette.sunlight.description": { en: ["daylight"], yue: ["日光"] },
    "palette.ambientLight.description": { en: ["sun"], yue: ["太陽"] },
    "palette.resolution.description": { en: ["pixel", "sharper"], yue: ["像素", "銳利"] },
    "palette.hires.description": { en: ["detailed tiles", "zero"], yue: ["精細圖磚", "零"] },
    "palette.lowres.description": { en: ["coarse tiles", "horizon"], yue: ["粗略圖磚", "地平線"] },
    "palette.loadHires.description": {
        en: ["detailed tiles", "camera"],
        yue: ["精細圖磚", "鏡頭"],
    },
    "palette.zoomButtons.description": { en: ["plus and minus"], yue: ["加號同減號"] },
    "palette.sensitivity.description": {
        en: ["free-flight camera", "mouse"],
        yue: ["自由飛行", "滑鼠"],
    },
    "palette.invertMouse.description": {
        en: ["mouse", "free flight"],
        yue: ["自由飛行", "滑鼠"],
    },
    "palette.theme.description": { en: ["operating system"], yue: ["作業系統"] },
    "palette.screenshot.description": {
        en: ["clipboard", "download"],
        yue: ["剪貼簿", "下載"],
    },
    "palette.language.description": { en: ["language", "interface"], yue: ["介面", "語言"] },
    "palette.chunkBorders.description": {
        en: ["sixteen-block", "chunk grid"],
        yue: ["十六格方塊", "區塊網格"],
    },
    "palette.debug.description": { en: ["diagnostics", "console"], yue: ["診斷資訊", "主控台"] },
} as const satisfies Record<
    keyof typeof PALETTE_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
