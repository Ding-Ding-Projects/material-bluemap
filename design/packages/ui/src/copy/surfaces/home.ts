/**
 * Home's own words: the tab label, its one-line "what BlueMap is" lede, its search chrome,
 * its section headings, and the one disabled-state sentence Backups and Publish to Pages
 * share.
 *
 * Deliberately short. Every tile that mirrors an existing page or shell surface - Make a
 * map, Settings, the options editor, the notification centre and a dozen more - reads its
 * title and description from the catalogue entry that surface already voices (`palette.*`,
 * `docsViewer.lede`, `tabs.page.*`), per `HomeScreen.vue`'s own doc comment on why. Nothing
 * here duplicates one of those; this module is only the words that belong to Home and to no
 * other surface.
 *
 * `tabs.page.home` lives here rather than beside its seven siblings in `chrome.ts`, because
 * that file was not this feature's to edit while a sibling workflow was touching unrelated
 * parts of the tree at the same time this was written. A future pass is free to move it;
 * nothing about where a key is registered changes what it resolves to.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const HOME_VOICED = {
    /*
     * The one sentence Home says about what this application makes, before any control on
     * screen is asked to mean anything. "Minecraft" and "web browser" are the two facts a
     * newcomer needs before anything else here makes sense, so both survive every level.
     */
    "home.lede": {
        en: [
            "BlueMap turns a Minecraft world into a browsable 3D map you open in a web browser.",
            "BlueMap turns a Minecraft world into a browsable 3D map you open in a web browser.",
            "BlueMap turns a Minecraft world into a browsable 3D map, opened in an ordinary web browser.",
            "BlueMap takes your Minecraft world and turns it into a 3D map you can wander around, right there in a web browser.",
            "BlueMap takes your Minecraft world and turns it into a 3D map you can wander around in a web browser, no mods, no drama.",
        ],
        yue: [
            "BlueMap 可以將 Minecraft 世界變成一個喺網頁瀏覽器打得開嘅 3D 地圖。",
            "BlueMap 可以將 Minecraft 世界變成一個喺網頁瀏覽器打得開嘅 3D 地圖。",
            "BlueMap 會將你個 Minecraft 世界，變成一個喺網頁瀏覽器度打得開嘅 3D 地圖。",
            "BlueMap 可以將你個 Minecraft 世界，變成一個喺網頁瀏覽器度隨便行嘅 3D 地圖。",
            "BlueMap 分分鐘可以將你個 Minecraft 世界，變做一個喺網頁瀏覽器度隨便飛嘅 3D 地圖，唔使裝 mod，好簡單。",
        ],
    },
    /* The honest count line, matching `docsViewer.showing`'s own structure word for word. */
    "home.search.showing": {
        en: [
            "Showing {shown} of {total} things Home can do.",
            "Showing {shown} of {total} things Home can do.",
            "Showing {shown} of the {total} things Home can do.",
            "{shown} of {total} on screen.",
            "{shown} of {total} on screen. The rest are filtered out, not missing.",
        ],
        yue: [
            "顯示緊 {total} 樣嘢入面嘅 {shown} 樣。",
            "顯示緊 {total} 樣嘢入面嘅 {shown} 樣。",
            "喺 Home 可以做嘅 {total} 樣嘢入面，顯示緊 {shown} 樣。",
            "畫面上有 {total} 樣入面嘅 {shown} 樣。",
            "畫面上有 {total} 樣入面嘅 {shown} 樣。其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    "home.search.noMatches": {
        en: [
            "Nothing on Home matches. {filters} Clear the search to see the rest.",
            "Nothing on Home matches. {filters} Clear the search to see the rest.",
            "Nothing on Home matches these. {filters} Clear the search to see the rest.",
            "Nothing on Home matches. {filters} The rest is hidden rather than gone. Clear the search to see it.",
            "Nothing on Home matches, which is a statement about the search and not about the app. {filters} The rest is hidden rather than gone. Clear the search to get it back.",
        ],
        yue: [
            "Home 度冇嘢符合。{filters} 清走搜尋條件就見返其餘嘅。",
            "Home 度冇嘢符合。{filters} 清走搜尋條件就見返其餘嘅。",
            "Home 度冇嘢符合呢啲條件。{filters} 清走搜尋條件就見返其餘嘅。",
            "Home 度冇嘢符合。{filters} 其餘嗰啲係收埋咗，唔係冇咗：清走搜尋條件就見返。",
            "Home 度冇嘢符合，呢句講嘅係搜尋條件，唔係講呢個程式本身。{filters} 其餘嗰啲係收埋咗，唔係冇咗：清走搜尋條件就攞得返。",
        ],
    },
    /*
     * Backups and Publish to Pages share this one sentence rather than each writing their
     * own, because the fact is genuinely identical: neither has anything to work with until
     * a map has actually been rendered on this computer. "a map rendered on this computer"
     * is the pinned phrase - present verbatim at every level, in both languages - because a
     * disabled action that stops naming what would fix it is exactly the broken-warning
     * failure the project's funny-level rule exists to prevent.
     */
    "home.tile.needsRenderedMap": {
        en: [
            "This needs a map rendered on this computer. Render one, then come back.",
            "This needs a map rendered on this computer. Render one, then come back.",
            "This needs a map rendered on this computer first.",
            "Nothing to work with yet - this needs a map rendered on this computer before it can do anything.",
            "Nothing to work with yet - this one flat out needs a map rendered on this computer before it can lift a finger.",
        ],
        yue: [
            "呢個要用返呢部電腦算好嘅地圖先得。去算一個，再返嚟啦。",
            "呢個要用返呢部電腦算好嘅地圖先得。去算一個，再返嚟啦。",
            "呢個要有返一個呢部電腦算好嘅地圖先得。",
            "而家仲未有嘢用，呢個要有返一個呢部電腦算好嘅地圖先做得到嘢。",
            "而家仲未有嘢用，呢個硬係要有返一個呢部電腦算好嘅地圖先郁得。",
        ],
    },
    "home.tile.palette.description": {
        en: [
            "Every command, setting and destination this app has, found by typing its name. Opens with Ctrl+Shift+F.",
            "Every command, setting and destination this app has, found by typing its name. Opens with Ctrl+Shift+F.",
            "Every command, setting and destination this app has, searchable by name, opened with Ctrl+Shift+F.",
            "Type the name of almost anything in this app and jump straight to it. The shortcut is Ctrl+Shift+F.",
            "Type the name of almost anything in this app and teleport straight to it, no scavenger hunt required. Ctrl+Shift+F, whenever the mood strikes.",
        ],
        yue: [
            "呢個程式所有指令、設定同去處，打個名就搵到。用 Ctrl+Shift+F 打開。",
            "呢個程式所有指令、設定同去處，打個名就搵到。用 Ctrl+Shift+F 打開。",
            "呢個程式所有指令、設定同去處，打個名就搵到，用 Ctrl+Shift+F 打開。",
            "打幾隻字，就可以跳去程式入面差唔多任何一樣嘢。捷徑係 Ctrl+Shift+F。",
            "打幾隻字，就可以即刻飛去程式入面差唔多任何一樣嘢，唔使周圍搵。Ctrl+Shift+F，想用就用。",
        ],
    },
    "home.tile.eula.description": {
        en: [
            "Mojang's end-user licence agreement, readable in full inside the app.",
            "Mojang's end-user licence agreement, readable in full inside the app.",
            "Mojang's own end-user licence agreement, the whole document, readable inside the app.",
            "The full text of Mojang's licence agreement, right here in the app, if you ever want to actually read it.",
            "Mojang's licence agreement, every word of it, sitting right here in the app for the rare soul who actually reads these things.",
        ],
        yue: [
            "Mojang 嘅使用者授權協議，成份文件都喺個程式入面睇得到。",
            "Mojang 嘅使用者授權協議，成份文件都喺個程式入面睇得到。",
            "Mojang 自己嘅使用者授權協議，成份文件都可以喺個程式入面睇。",
            "Mojang 個授權協議全文，就喺個程式入面，畀真係想睇嘅人睇。",
            "Mojang 個授權協議，一字一句都喺個程式入面，等嗰啲真係會睇嘅有心人細閱。",
        ],
    },

    /*
     * The seven page descriptions, shared word for word with `paletteCatalog.ts`'s own
     * `PAGE_NOTES`. That table reads them through a variable
     * (`t(note.description[0], note.description[1])`), which is invisible to
     * `catalogueCoverage.test.ts`'s literal-string scanner, so the command palette has never
     * actually needed these voiced, in any language, at any funny level, despite
     * `components/palette` being on the covered list. `HomeScreen.vue` calls the same seven
     * keys with a literal string, the ordinary and correct way to call `t()`, which is what
     * exposed the gap. They live here, in this module, because this is where their one real
     * literal call site is - `copy/surfaces/palette.test.ts` requires every key `palette.ts`
     * carries to have a call site under `components/palette/`, and these do not. Voicing them
     * here still answers `paletteCatalog.ts`'s own dynamic lookup: the catalogue is one merged
     * set keyed by string, so it does not matter which module registered the entry.
     */
    "palette.page.map": {
        en: [
            "The rendered map itself, with the viewer's own menu, markers and camera.",
            "The rendered map itself, with the viewer's own menu, markers and camera.",
            "The rendered map itself, complete with the viewer's own menu, markers and camera.",
            "The map, live: the viewer's own menu, every marker on it, and the camera that flies around it.",
            "The map itself, live and clickable: the viewer's own menu, every marker somebody dropped on it, and the camera that swoops around the whole thing.",
        ],
        yue: [
            "已算好嘅地圖本身，連埋睇圖器自己嘅選單、標記同鏡頭。",
            "已算好嘅地圖本身，連埋睇圖器自己嘅選單、標記同鏡頭。",
            "已算好嘅地圖本身，仲有埋睇圖器自己嘅選單、標記同鏡頭。",
            "張地圖本身，即時嘅：睇圖器自己嘅選單、上面每一個標記，同埋周圍飛嘅鏡頭。",
            "張地圖本身，即時又㩒得郁：睇圖器自己嘅選單、上面每一個人擺低嘅標記，仲有周圍飛嚟飛去嗰個鏡頭。",
        ],
    },
    "palette.page.world": {
        en: [
            "The guide that turns a world folder into a rendered map: pick the folder, answer five questions, watch the render run.",
            "The guide that turns a world folder into a rendered map: pick the folder, answer five questions, watch the render run.",
            "The guide that turns a world folder into a rendered map: pick the folder, answer five questions, then watch the render run.",
            "The guide that turns a world folder into a rendered map. Pick the folder, answer five short questions, and watch it render.",
            "The guide that turns a world folder into a rendered map, start to finish: pick the folder, answer five short questions, then sit back and watch the render run.",
        ],
        yue: [
            "呢個導引會將一個世界資料夾變成已算好嘅地圖：揀資料夾，答五條問題，睇住算圖行。",
            "呢個導引會將一個世界資料夾變成已算好嘅地圖：揀資料夾，答五條問題，睇住算圖行。",
            "呢個導引會將一個世界資料夾變成已算好嘅地圖：揀資料夾，答五條問題，之後睇住算圖行。",
            "呢個導引會將一個世界資料夾，變做已算好嘅地圖。揀個資料夾，答五條簡單問題，然後睇住佢算圖。",
            "呢個導引會由頭到尾，將一個世界資料夾變做已算好嘅地圖：揀個資料夾，答五條簡單問題，之後坐低慢慢睇住算圖行。",
        ],
    },
    "palette.page.projects": {
        en: [
            "Every saved render project, and every setting one can carry beyond the five the guide asks about.",
            "Every saved render project, and every setting one can carry beyond the five the guide asks about.",
            "Every saved render project, and every setting one can carry beyond the five short questions the guide asks.",
            "Every project the guide has ever saved, and everything beyond its own five questions that one can hold.",
            "Every project the guide has ever saved, plus every last setting a project can carry beyond the five short questions the guide bothers asking.",
        ],
        yue: [
            "每一個已儲存嘅算圖專案，同埋除咗導引問嘅五條問題之外，一個專案仲可以帶埋嘅所有設定。",
            "每一個已儲存嘅算圖專案，同埋除咗導引問嘅五條問題之外，一個專案仲可以帶埋嘅所有設定。",
            "每一個已儲存嘅算圖專案，同埋除咗導引嗰五條問題之外，一個專案仲可以帶埋嘅所有設定。",
            "導引儲存過嘅每一個專案，仲有埋除咗自己嗰五條問題之外，一個專案帶得埋嘅每一樣設定。",
            "導引儲存過嘅每一個專案，加埋除咗自己嗰五條簡單問題之外，一個專案帶得埋嘅每一項設定，一樣都冇走漏。",
        ],
    },
    "palette.page.ciRender": {
        en: [
            "Rendering on GitHub's machines instead of this one: a repository, the consents, the upload, and the run watched job by job.",
            "Rendering on GitHub's machines instead of this one: a repository, the consents, the upload, and the run watched job by job.",
            "Rendering on GitHub's own machines instead of this one: a repository, the two consents, the upload, and the run watched job by job.",
            "Rendering on GitHub's machines rather than this one - a repository, both consents, an upload, and a run watched job by job as it goes.",
            "Handing the whole render off to GitHub's own machines instead of this one - a repository, both consents, an upload, and a run watched job by job the whole way through.",
        ],
        yue: [
            "喺 GitHub 自己嘅機器度算圖，而唔係呢部機：一個 repository、兩個同意、上傳，同埋逐個工作咁樣睇住個運行。",
            "喺 GitHub 自己嘅機器度算圖，而唔係呢部機：一個 repository、兩個同意、上傳，同埋逐個工作咁樣睇住個運行。",
            "喺 GitHub 自己嘅機器度算圖，唔係呢部機：一個 repository、兩個同意、上傳，之後逐個工作咁樣睇住個運行。",
            "將算圖交俾 GitHub 自己嘅機器嚟做，而唔係呢部機：一個 repository、兩個同意、上傳，逐個工作睇住個運行行緊到邊。",
            "成個算圖直接交俾 GitHub 自己嘅機器嚟做，唔係呢部機：一個 repository、兩個同意、上傳，然後由頭到尾逐個工作睇實個運行。",
        ],
    },
    "palette.page.servers": {
        en: [
            "The list of servers and rendered maps this app can open, and where a new one is added.",
            "The list of servers and rendered maps this app can open, and where a new one is added.",
            "The list of servers and rendered maps this app can open, and where a new entry is added.",
            "Every server and rendered map this app can open, and the one place a new one gets added.",
            "Every server and every rendered map this app can open, all in one list, with the one place a new one actually gets added.",
        ],
        yue: [
            "呢個程式打得開嘅伺服器同已算好嘅地圖清單，仲有加新項目嘅地方。",
            "呢個程式打得開嘅伺服器同已算好嘅地圖清單，仲有加新項目嘅地方。",
            "呢個程式打得開嘅伺服器同已算好嘅地圖清單，仲有加新項目嘅位置。",
            "呢個程式打得開嘅每一個伺服器同每一張已算好嘅地圖，仲有加新項目嗰個位。",
            "呢個程式打得開嘅每一個伺服器、每一張已算好嘅地圖，全部擺喺一張清單度，仲有加新項目嗰個真正位置。",
        ],
    },
    "palette.page.backups": {
        en: [
            "Backing a world or a rendered map up to GitHub release assets, and restoring one that is already there.",
            "Backing a world or a rendered map up to GitHub release assets, and restoring one that is already there.",
            "Backing a world or a rendered map up to GitHub release assets, and restoring one that is already stored there.",
            "Packing a world or a rendered map off to GitHub release assets for safekeeping, or restoring one already sitting there.",
            "Packing a world or a rendered map off to GitHub release assets for safekeeping, or restoring one that is already sitting there waiting.",
        ],
        yue: [
            "將一個世界或者已算好嘅地圖備份去 GitHub 嘅 release assets，同埋還原返一個已經喺嗰度嘅備份。",
            "將一個世界或者已算好嘅地圖備份去 GitHub 嘅 release assets，同埋還原返一個已經喺嗰度嘅備份。",
            "將一個世界或者已算好嘅地圖備份去 GitHub 嘅 release assets，同埋還原返一個已經儲存喺嗰度嘅備份。",
            "將一個世界或者已算好嘅地圖打包送去 GitHub 嘅 release assets 度存返份，或者還原返一個已經喺嗰度嘅備份。",
            "將一個世界或者已算好嘅地圖打包送去 GitHub 嘅 release assets 度存返份保平安，或者還原返一個已經喺嗰度等緊嘅備份。",
        ],
    },
    "palette.page.pages": {
        en: [
            "Publishing a rendered map as a website on GitHub Pages, and what the published site currently holds.",
            "Publishing a rendered map as a website on GitHub Pages, and what the published site currently holds.",
            "Publishing a rendered map as a website on GitHub Pages, and what the currently published site holds.",
            "Turning a rendered map into a website on GitHub Pages, and what is currently sitting on the published site.",
            "Turning a rendered map into a real website on GitHub Pages, and an honest account of what is currently sitting on the published site.",
        ],
        yue: [
            "將已算好嘅地圖發佈做一個喺 GitHub Pages 上面嘅網站，同埋而家已發佈網站入面有咩。",
            "將已算好嘅地圖發佈做一個喺 GitHub Pages 上面嘅網站，同埋而家已發佈網站入面有咩。",
            "將已算好嘅地圖發佈做一個喺 GitHub Pages 上面嘅網站，同埋而家已發佈網站度裝住咩。",
            "將一張已算好嘅地圖變成一個 GitHub Pages 網站，同埋而家已發佈網站度實際擺緊咩。",
            "將一張已算好嘅地圖真真正正變成一個 GitHub Pages 網站，仲老老實實話你知而家已發佈網站度擺緊咩。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const HOME_FIXED = {
    /* The shell tab that opens this page. */
    "tabs.page.home": { en: "Home", yue: "主頁" },

    "home.title": { en: "Home", yue: "主頁" },
    "home.intro.show": { en: "Show the explanation", yue: "顯示解說" },
    "home.intro.hide": { en: "Hide the explanation", yue: "收埋解說" },

    "home.search.label": { en: "Search everything Home can do", yue: "搜尋主頁入面嘅所有功能" },
    "home.search.placeholder": { en: "A feature, a setting, a page name", yue: "功能、設定或者分頁名" },
    "home.search.clear": { en: "Clear the search", yue: "清走搜尋條件" },

    "home.section.continue": { en: "Continue", yue: "繼續" },
    "home.section.getStarted": { en: "Get started", yue: "開始" },
    "home.section.makeAndManage": { en: "Make and manage maps", yue: "製作同管理地圖" },
    "home.section.share": { en: "Share and back up", yue: "分享同備份" },
    "home.section.learn": { en: "Learn", yue: "學習" },
    "home.section.settings": { en: "Settings and tools", yue: "設定同工具" },
    "home.section.viewer": { en: "The open map", yue: "打開緊嘅地圖" },

    "home.continue.open": { en: "Open {name}", yue: "打開 {name}" },

    "home.tile.open": { en: "Open", yue: "打開" },
    "home.tile.openNamed": { en: "Open {title}", yue: "打開 {title}" },
    "home.tile.palette.title": { en: "Command palette", yue: "指令面板" },
} as const satisfies Record<string, FixedString>;

export const HOME_FACTS = {
    "home.lede": { en: ["Minecraft", "web browser"], yue: ["Minecraft", "瀏覽器"] },
    "home.search.showing": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "home.search.noMatches": { en: ["{filters}", "Clear the search"], yue: ["{filters}", "清走搜尋條件"] },
    "home.tile.needsRenderedMap": {
        en: ["a map rendered on this computer"],
        yue: ["呢部電腦算好嘅地圖"],
    },
    "home.tile.palette.description": { en: ["Ctrl+Shift+F"], yue: ["Ctrl+Shift+F"] },
    "home.tile.eula.description": { en: ["Mojang"], yue: ["Mojang"] },

    "palette.page.map": { en: ["menu", "marker", "camera"], yue: ["選單", "標記", "鏡頭"] },
    "palette.page.world": { en: ["world folder", "five"], yue: ["世界資料夾", "五"] },
    "palette.page.projects": { en: ["project", "five"], yue: ["專案", "五"] },
    "palette.page.ciRender": {
        en: ["GitHub", "repository", "consents"],
        yue: ["GitHub", "repository", "同意"],
    },
    "palette.page.servers": { en: ["server", "rendered map"], yue: ["伺服器", "已算好嘅地圖"] },
    "palette.page.backups": {
        en: ["GitHub release assets", "restoring"],
        yue: ["GitHub 嘅 release assets", "還原"],
    },
    "palette.page.pages": { en: ["GitHub Pages", "published site"], yue: ["GitHub Pages", "已發佈網站"] },
} as const satisfies Record<
    keyof typeof HOME_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
