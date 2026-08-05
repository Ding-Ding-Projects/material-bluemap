/**
 * The site's own copy, in English and in playful Hong Kong Cantonese, at all five funny
 * levels for each language independently.
 *
 * Two catalogues, because two kinds of string exist:
 *
 *   VOICED  Sentences, headings, help text, notifications and the action labels where the
 *           wording genuinely reads differently. Each entry carries five English strings and
 *           five Cantonese strings, index 0 being level 1 (fully professional) and index 4
 *           being level 5 (maximum playfulness).
 *
 *   FIXED   One-word and two-word control labels, proper nouns, mode names and the names of
 *           the funny levels themselves. These have one string per language. A level cannot
 *           usefully restyle the word "Close", and a control whose label moves under the
 *           visitor is a control they have to re-read every time.
 *
 * The level changes voice and nothing else. Every version number, count, date, keyboard
 * shortcut and description of what a control does is identical across all five levels of a
 * given entry; only the wrapping changes. An entry that made a fact vaguer at a higher level
 * would be a defect, not a joke.
 *
 * `{name}` placeholders are interpolated by the I18n class. Every level of an entry uses the
 * same placeholders, so a level can never drop a value out of a sentence.
 */

export interface VoicedString {
    readonly en: readonly [string, string, string, string, string];
    readonly yue: readonly [string, string, string, string, string];
}

export interface FixedString {
    readonly en: string;
    readonly yue: string;
}

export const VOICED = {
    "shell.tagline": {
        en: [
            "A Material Design 3 port of BlueMap.",
            "A Material Design 3 port of BlueMap, built in the open.",
            "BlueMap, rebuilt in Material Design 3 and still arguing with itself about tabs.",
            "BlueMap wearing a full Material Design 3 outfit. It cleans up nicely.",
            "BlueMap went to the Material Design 3 barber and came back unrecognisable.",
        ],
        yue: [
            "BlueMap 嘅 Material Design 3 移植版本。",
            "BlueMap 嘅 Material Design 3 移植版，公開開發中。",
            "BlueMap 換咗 Material Design 3 新裝，仲喺度同 tab 較勁。",
            "BlueMap 著咗成套 Material Design 3，靚仔咗好多。",
            "BlueMap 去咗 Material Design 3 飛髮鋪，出返嚟阿媽都唔認得。",
        ],
    },
    "shell.skipToContent": {
        en: [
            "Skip to the page content",
            "Skip to the page content",
            "Skip straight to the content",
            "Jump the queue, straight to the content",
            "Beam me down to the content",
        ],
        yue: ["跳去內容", "跳去內容", "直接跳去內容", "唔使排隊，直踩內容", "咻一聲彈去內容"],
    },
    "shell.footerNote": {
        en: [
            "Everything on this page is served from this site. No external scripts, fonts, images or analytics.",
            "Everything here is served from this site: no external scripts, fonts, images or analytics.",
            "Everything is served from here. No external scripts, fonts, images or analytics, and nobody counting your clicks.",
            "All local, all the time. No external scripts, fonts, images or analytics, so nothing phones home.",
            "One hundred percent home cooked. No external scripts, fonts, images or analytics, and no tracker gets a table.",
        ],
        yue: [
            "本頁所有資源都由本站提供，冇外部指令碼、字型、圖片或分析工具。",
            "全部嘢都喺本站出，冇外部指令碼、字型、圖片同分析工具。",
            "全部本地出品，冇外部指令碼、字型、圖片同分析工具，冇人數你撳過幾多下。",
            "梗係自己屋企煮，冇外部指令碼、字型、圖片同分析工具，唔會偷偷打電話返鄉下。",
            "百分百自家廚房，冇外部指令碼、字型、圖片同分析工具，追蹤器連張凳都冇得坐。",
        ],
    },
    "shell.statusNote": {
        en: [
            "Version {version}. This is pre-release work in progress; no release has been published yet.",
            "Version {version}. Still pre-release work in progress, and no release has been published yet.",
            "Version {version}. Pre-release, work in progress, and no release published yet. You are early.",
            "Version {version}. Pre-release and unfinished, with no release published yet. You beat the crowd.",
            "Version {version}. Pre-release, unfinished, zero releases published. You are so early the paint is still wet.",
        ],
        yue: [
            "版本 {version}。此為開發中的預發布內容，尚未發布任何正式版本。",
            "版本 {version}。仲喺開發中嘅預發布階段，未出過正式版。",
            "版本 {version}。開發中預發布，未出過正式版，你嚟得好早。",
            "版本 {version}。仲未做完嘅預發布，一個正式版都未出，你贏晒班街坊。",
            "版本 {version}。預發布、未收工、零個正式版。你嚟到油都未乾。",
        ],
    },
    "shell.appearanceButton": {
        en: ["Appearance", "Appearance", "Appearance", "Change the look", "Redecorate"],
        yue: ["外觀", "外觀", "外觀設定", "換個樣", "執靚佢"],
    },
    "shell.languageButton": {
        en: [
            "Language and tone",
            "Language and tone",
            "Language and tone",
            "Language and how funny",
            "Language and silliness dial",
        ],
        yue: ["語言同語氣", "語言同語氣", "語言同語氣", "語言同幾好笑", "語言同搞笑旋鈕"],
    },
    "shell.notificationsButton": {
        en: [
            "Notifications",
            "Notifications",
            "Notifications",
            "What the site told you",
            "The shouting box",
        ],
        yue: ["通知", "通知", "通知", "個網頭先講咗咩", "叫嚷箱"],
    },
    "shell.tabListButton": {
        en: ["All pages", "All pages", "Every page", "Every page there is", "The full page menu"],
        yue: ["所有頁面", "所有頁面", "全部頁面", "有幾多頁都喺呢度", "成張頁面菜單"],
    },
    "appearance.title": {
        en: [
            "Appearance",
            "Appearance",
            "Appearance",
            "How this should look",
            "Interior decorating",
        ],
        yue: ["外觀", "外觀", "外觀設定", "想個樣點呢", "室內設計時間"],
    },
    "appearance.themeHelp": {
        en: [
            "Follow the system setting, or choose light or dark explicitly. The choice is remembered in this browser.",
            "Follow your system setting, or pick light or dark yourself. This browser remembers the choice.",
            "Follow the system, or overrule it with light or dark. This browser remembers what you picked.",
            "Let the system decide, or overrule it. Light or dark, this browser will not forget.",
            "Follow the system like a good citizen, or stage a coup with light or dark. This browser remembers either way.",
        ],
        yue: [
            "可跟隨系統設定，或自行選擇淺色或深色。選擇會記喺呢個瀏覽器。",
            "跟系統設定，或者自己揀淺色定深色，呢個瀏覽器會記住。",
            "跟系統走，定係自己話事揀淺色深色都得，瀏覽器會記住你揀咗乜。",
            "畀系統話事，定係你話事？淺色深色隨你，瀏覽器唔會唔記得。",
            "乖乖跟系統，定係起義自己揀淺深色？點都好，瀏覽器記得一清二楚。",
        ],
    },
    "appearance.densityHelp": {
        en: [
            "Compact reduces the vertical padding of controls. Pointer targets stay at least 44 pixels.",
            "Compact tightens the vertical padding on controls. Pointer targets stay at least 44 pixels.",
            "Compact squeezes the padding out of controls. Targets still stay at least 44 pixels, so nothing gets fiddly.",
            "Compact squashes the padding. Targets stay at least 44 pixels, because tiny buttons are a crime.",
            "Compact wrings the padding out. Targets stay at least 44 pixels, so your thumb keeps its dignity.",
        ],
        yue: [
            "緊湊模式會減少控制項的垂直內距，點擊範圍仍保持至少 44 像素。",
            "緊湊模式會收窄控制項嘅上下留白，點擊範圍照樣至少 44 像素。",
            "緊湊模式榨走啲留白，但點擊範圍照樣至少 44 像素，唔會撳到痛苦。",
            "緊湊模式壓扁啲留白，點擊範圍仲係至少 44 像素，細掣係罪行嚟㗎。",
            "緊湊模式扭乾晒啲留白，點擊範圍死守 44 像素，隻姆指都要有尊嚴。",
        ],
    },
    "appearance.resetDone": {
        en: [
            "Appearance returned to its defaults: theme follows the system, density is comfortable.",
            "Appearance is back to defaults: theme follows the system, density is comfortable.",
            "Appearance reset. Theme follows the system again and density is comfortable.",
            "Wiped clean. Theme follows the system again, density is back to comfortable.",
            "Factory settings restored. Theme obeys the system again, density is comfortable once more.",
        ],
        yue: [
            "外觀已回復預設：主題跟隨系統，密度為舒適。",
            "外觀已還原預設：主題跟系統，密度係舒適。",
            "外觀重設好晒，主題返去跟系統，密度返舒適。",
            "抹清晒。主題返去聽系統話，密度返返舒適。",
            "回復出廠設定。主題乖返晒跟系統，密度都返舒適嘞。",
        ],
    },
    "language.title": {
        en: [
            "Language and tone",
            "Language and tone",
            "Language and tone",
            "Language and how funny",
            "Language and the silliness dial",
        ],
        yue: ["語言同語氣", "語言同語氣", "語言同語氣", "語言同幾好笑", "語言同搞笑旋鈕"],
    },
    "language.modeHelp": {
        en: [
            "Choose English, Cantonese, or both together. Bilingual shows English first with Cantonese underneath.",
            "Choose English, Cantonese, or both. Bilingual puts English first with Cantonese underneath.",
            "English, Cantonese, or both at once. Bilingual leads with English and tucks Cantonese underneath.",
            "English, Cantonese, or the both of them. Bilingual leads with English and slips Cantonese under it.",
            "English, Cantonese, or greedy mode. Bilingual leads with English and hides Cantonese right beneath.",
        ],
        yue: [
            "可選擇英文、廣東話或雙語。雙語模式會先顯示英文，廣東話置於下方。",
            "揀英文、廣東話定雙語都得。雙語模式英文行先，廣東話喺下面。",
            "英文、廣東話，或者兩樣一齊。雙語模式英文帶頭，廣東話跟住埋位。",
            "英文、廣東話、定係兩樣都要？雙語模式英文行頭，廣東話收埋喺下面。",
            "英文、廣東話、定係貪心模式？雙語英文帶路，廣東話匿埋喺下面等你。",
        ],
    },
    "language.funnyHelp": {
        en: [
            "Two independent settings, one per language. Level 1 is fully professional; level 5 is maximum playfulness.",
            "Two separate settings, one per language. Level 1 is fully professional, level 5 is maximum playfulness.",
            "Two dials, one per language, and they do not talk to each other. Level 1 is buttoned up; level 5 is not.",
            "Two dials that mind their own business. Level 1 wears a tie; level 5 lost the tie somewhere.",
            "Two dials, no supervision. Level 1 files its taxes on time; level 5 has never seen a form.",
        ],
        yue: [
            "兩個獨立設定，每種語言各一。第 1 級完全專業，第 5 級最玩味。",
            "兩個獨立設定，一種語言一個。第 1 級好正經，第 5 級最玩味。",
            "兩個掣，各管各嘅語言，唔會互相干擾。第 1 級好嚴肅，第 5 級就唔係嘞。",
            "兩個掣各有各做。第 1 級打晒領呔，第 5 級條呔唔知去咗邊。",
            "兩個掣冇人管。第 1 級準時交稅，第 5 級連表格都未見過。",
        ],
    },
    "language.disclosure": {
        en: [
            "The tone setting styles every message on this site, including warnings and errors. What a message says never changes: the same facts, counts and consequences appear at every level.",
            "The tone setting styles every message here, warnings and errors included. What a message says never changes: the same facts, counts and consequences at every level.",
            "The tone setting styles every message, warnings and errors included. The facts do not move: same numbers, same consequences, at any level you pick.",
            "The tone setting restyles everything, warnings and errors and all. The facts stay bolted down: same numbers, same consequences, whichever level you land on.",
            "The tone setting redecorates every message on the site, warnings and errors included. The facts are welded to the floor: same numbers, same consequences, at every level.",
        ],
        yue: [
            "語氣設定會影響本站所有訊息，包括警告同錯誤。訊息內容不變：每一級都係同樣的事實、數字同後果。",
            "語氣設定會影響所有訊息，警告同錯誤都包括。訊息講嘅嘢唔會變：每一級都係同樣事實、數字同後果。",
            "語氣設定會改晒所有訊息嘅語氣，警告錯誤都唔例外。但事實唔會郁：數字同後果每一級都一樣。",
            "語氣設定會將全部訊息重新裝修，警告錯誤一樣有份。事實就釘死咗：數字同後果，邊一級都一樣。",
            "語氣設定會將成站訊息翻新一次，警告錯誤照計。事實就焊死咗喺地下：數字同後果，級級都一樣。",
        ],
    },
    "language.preview": {
        en: [
            "This sentence is written at level {level}. Changing the slider rewrites it.",
            "This sentence is written at level {level}. Move the slider and it gets rewritten.",
            "This sentence is level {level} talking. Slide the slider and watch it change its mind.",
            "Level {level} wrote this sentence. Nudge the slider and it will write another one.",
            "Level {level} typed this with its feet. Move the slider and it will try again.",
        ],
        yue: [
            "呢句嘢係第 {level} 級寫嘅，拉動滑桿就會重寫。",
            "呢句係第 {level} 級寫嘅，拉一拉滑桿佢就會改。",
            "呢句係第 {level} 級講嘅，你拉一拉滑桿佢就轉軚。",
            "第 {level} 級寫咗呢句，你篤一篤滑桿佢就寫過另一句。",
            "第 {level} 級用隻腳打咗呢句，拉滑桿佢會再試多次。",
        ],
    },
    "language.storageWarning": {
        en: [
            "This browser is refusing local storage, so preferences apply now but will not survive a reload.",
            "This browser is refusing local storage. Preferences apply now, but a reload will forget them.",
            "This browser will not let the page store anything. Your choices work now and vanish on reload.",
            "This browser has locked the storage cupboard. Choices work now, then evaporate on reload.",
            "This browser has bolted the storage cupboard shut. Choices work now and disappear the moment you reload.",
        ],
        yue: [
            "此瀏覽器拒絕本機儲存，偏好設定現時有效，但重新載入後不會保留。",
            "呢個瀏覽器唔畀用本機儲存，設定而家有效，但重新載入就會冇咗。",
            "呢個瀏覽器唔准頁面儲存嘢，你揀嘅嘢而家有效，一 reload 就唔見。",
            "呢個瀏覽器將個儲存櫃鎖埋。你揀嘅嘢而家用得，一 reload 就化灰。",
            "呢個瀏覽器將個儲存櫃焊死咗。而家揀乜都得，一 reload 即刻人間蒸發。",
        ],
    },
    "notify.centreTitle": {
        en: [
            "Notification centre",
            "Notification centre",
            "Notification centre",
            "Everything the site said",
            "The complaints department",
        ],
        yue: ["通知中心", "通知中心", "通知中心", "個網講過嘅嘢", "投訴部"],
    },
    "notify.centreEmpty": {
        en: [
            "No notifications yet.",
            "Nothing to report yet.",
            "Nothing to report. Reassuring, on balance.",
            "Empty. Either nothing happened or nothing went wrong. Both are fine.",
            "Completely empty. Suspiciously peaceful around here.",
        ],
        yue: [
            "暫時未有通知。",
            "而家未有嘢報告。",
            "冇嘢報告，總算係好消息。",
            "空空如也。冇嘢發生或者冇嘢出錯，兩樣都唔錯。",
            "乾淨到得個桔。靜到有啲可疑。",
        ],
    },
    "notify.regionLabel": {
        en: ["Notifications", "Notifications", "Notifications", "Notifications", "Notifications"],
        yue: ["通知", "通知", "通知", "通知", "通知"],
    },
    "tabs.stripLabel": {
        en: ["Site sections", "Site sections", "Site sections", "Site sections", "Site sections"],
        yue: ["網站分頁", "網站分頁", "網站分頁", "網站分頁", "網站分頁"],
    },
    "tabs.pinnedRegionLabel": {
        en: [
            "Pinned pages",
            "Pinned pages",
            "Pinned pages",
            "Pages you nailed down",
            "Pages under lock and key",
        ],
        yue: ["已釘選頁面", "已釘選頁面", "釘咗嘅頁面", "你釘死咗嘅頁面", "上晒鎖嘅頁面"],
    },
    "tabs.overflowButton": {
        en: [
            "{count} more pages",
            "{count} more pages",
            "{count} more, hiding out here",
            "{count} more that did not fit",
            "{count} more, squeezed out of the strip",
        ],
        yue: [
            "仲有 {count} 頁",
            "仲有 {count} 頁",
            "仲有 {count} 頁匿喺呢度",
            "仲有 {count} 頁擺唔落",
            "仲有 {count} 頁畀人擠咗出嚟",
        ],
    },
    "tabs.listHeading": {
        en: [
            "All pages",
            "All pages",
            "Every page",
            "Every page there is",
            "The complete page inventory",
        ],
        yue: ["所有頁面", "所有頁面", "全部頁面", "有幾多頁都喺呢度", "全套頁面清單"],
    },
    "tabs.listFilterHelp": {
        en: [
            "Filters by the visible page name. Plain text unless you switch to a regular expression.",
            "Filters on the visible page name. Plain text unless you switch to a regular expression.",
            "Filters on what the page is actually called. Plain text unless you ask for a regular expression.",
            "Filters on the visible name only. Plain text, unless you fancy a regular expression.",
            "Filters on the visible name and nothing sneaky. Plain text, unless you unleash a regular expression.",
        ],
        yue: [
            "按顯示的頁面名稱篩選，預設為純文字，除非切換至正規表示式。",
            "按頁面顯示名稱篩選，預設純文字，除非你轉用正規表示式。",
            "淨係睇頁面顯示個名嚟篩，預設純文字，你想用正規表示式就轉。",
            "只認頁面睇得見嗰個名。預設純文字，想玩正規表示式就轉。",
            "只認頁面表面嗰個名，唔會偷睇入面。預設純文字，夠膽就開正規表示式。",
        ],
    },
    "tabs.emptyStrip": {
        en: [
            "Every page is closed. Reopen one from the page list.",
            "Every page is closed. Reopen one from the page list.",
            "You closed all of them. Impressive. The page list will bring one back.",
            "All closed. Genuinely impressive. The page list has them all waiting.",
            "You closed every last one. Respect. The page list is holding them for you.",
        ],
        yue: [
            "所有頁面已關閉，可從頁面清單重新開啟。",
            "全部頁面都關咗，喺頁面清單度開返。",
            "你將全部都關晒，勁。頁面清單可以開返。",
            "全部關晒，真係佩服。頁面清單度全部等緊你。",
            "一頁都唔剩，好嘢。頁面清單幫你留晒起。",
        ],
    },
    "tabs.reopen": {
        en: [
            "Reopen the last closed page",
            "Reopen the last closed page",
            "Bring back the last one",
            "Undo that last close",
            "Resurrect the last one",
        ],
        yue: [
            "重開最後關閉的頁面",
            "重開最後關咗嗰頁",
            "開返最後嗰頁",
            "撤銷頭先關咗嗰下",
            "翻生最後嗰頁",
        ],
    },
    "tabs.recentlyClosed": {
        en: [
            "Recently closed",
            "Recently closed",
            "Recently closed",
            "Recently shown the door",
            "The recently departed",
        ],
        yue: ["最近關閉", "最近關閉", "啱啱關咗嘅", "啱啱畀人踢走嘅", "最近往生嘅"],
    },
    "tabs.menu.closeContaining": {
        en: [
            "Close pages containing text…",
            "Close pages containing text…",
            "Close pages containing text…",
            "Close everything containing…",
            "Evict every page containing…",
        ],
        yue: [
            "關閉名稱包含文字的頁面…",
            "關閉名包含某啲字嘅頁面…",
            "關閉個名含住某啲字嘅頁面…",
            "凡係含住呢啲字嘅通通關…",
            "含住呢啲字嘅一律趕走…",
        ],
    },
    "tabs.menu.closeNotContaining": {
        en: [
            "Close pages not containing text…",
            "Close pages not containing text…",
            "Close pages not containing text…",
            "Close everything that does not contain…",
            "Evict every page that does not contain…",
        ],
        yue: [
            "關閉名稱不包含文字的頁面…",
            "關閉名唔包含某啲字嘅頁面…",
            "關閉個名冇呢啲字嘅頁面…",
            "冇呢啲字嘅通通關…",
            "冇呢啲字嘅一律趕走…",
        ],
    },
    "tabs.group.newGroup": {
        en: [
            "New group from this page…",
            "New group from this page…",
            "Start a group with this page…",
            "Start a new group here…",
            "Found a new dynasty here…",
        ],
        yue: [
            "以此頁建立新群組…",
            "用呢頁開個新群組…",
            "同呢頁開個群組…",
            "喺呢度開個新群組…",
            "喺呢度開山立派…",
        ],
    },
    "tabs.group.namePrompt": {
        en: [
            "Name for the new group",
            "Name for the new group",
            "What should this group be called?",
            "Give the group a name",
            "Name your new dynasty",
        ],
        yue: [
            "新群組名稱",
            "新群組個名",
            "呢個群組叫咩名好？",
            "畀個名個群組",
            "你個新門派叫咩名？",
        ],
    },
    "tabs.group.defaultName": {
        en: [
            "Group {number}",
            "Group {number}",
            "Group {number}",
            "Group {number}",
            "Group {number}",
        ],
        yue: ["群組 {number}", "群組 {number}", "群組 {number}", "群組 {number}", "群組 {number}"],
    },
    "bulk.containingTitle": {
        en: [
            "Close pages containing text",
            "Close pages containing text",
            "Close pages containing text",
            "Close everything that contains this",
            "Evict every page that contains this",
        ],
        yue: [
            "關閉名稱包含文字的頁面",
            "關閉名包含某啲字嘅頁面",
            "關閉個名含住呢啲字嘅頁面",
            "凡係含住呢啲字嘅通通關",
            "含住呢啲字嘅一律趕走",
        ],
    },
    "bulk.notContainingTitle": {
        en: [
            "Close pages not containing text",
            "Close pages not containing text",
            "Close pages not containing text",
            "Close everything that does not contain this",
            "Evict every page that does not contain this",
        ],
        yue: [
            "關閉名稱不包含文字的頁面",
            "關閉名唔包含某啲字嘅頁面",
            "關閉個名冇呢啲字嘅頁面",
            "冇呢啲字嘅通通關",
            "冇呢啲字嘅一律趕走",
        ],
    },
    "bulk.queryHelp": {
        en: [
            "Matched against the visible page name only. Page content and hidden data are never inspected.",
            "Matched against the visible page name only. Page content and hidden data are never inspected.",
            "It reads the visible page name and nothing else. No peeking at page content or hidden data.",
            "It only reads the name on the tab. No rummaging through page content or hidden data.",
            "It reads the name on the tab and stops there. No rummaging through anything else, ever.",
        ],
        yue: [
            "只比對頁面顯示名稱，不會檢查頁面內容或隱藏資料。",
            "淨係比對頁面顯示個名，唔會睇頁面內容或者隱藏資料。",
            "淨係讀頁面個名，唔會偷睇內容或者隱藏資料。",
            "淨係睇個 tab 上面嗰個名，唔會喺內容或者隱藏資料度搲。",
            "睇完個 tab 上面嗰個名就收工，其他嘢一律唔郁。",
        ],
    },
    "bulk.includePinned": {
        en: [
            "Include pinned pages",
            "Include pinned pages",
            "Include pinned pages too",
            "Yes, the pinned ones as well",
            "Take the pinned ones down too",
        ],
        yue: [
            "包括已釘選的頁面",
            "連釘咗嘅頁面都計",
            "連釘咗嗰啲都計埋",
            "係，釘咗嗰啲都要",
            "連釘死咗嗰啲都拆埋佢",
        ],
    },
    "bulk.previewHeading": {
        en: [
            "Pages that will close",
            "Pages that will close",
            "Pages that will close",
            "Pages about to go",
            "Pages on the way out",
        ],
        yue: [
            "將會關閉的頁面",
            "將會關閉嘅頁面",
            "會被關掉嘅頁面",
            "就嚟走嘅頁面",
            "準備出門口嘅頁面",
        ],
    },
    "bulk.emptyQuery": {
        en: [
            "Enter some text first. An empty query closes nothing.",
            "Enter some text first. An empty query closes nothing.",
            "Type something first. An empty query closes nothing, which is the safe answer.",
            "Type something first. An empty query closes nothing, and that is deliberate.",
            "Type something first. An empty query closes precisely nothing, on purpose.",
        ],
        yue: [
            "請先輸入文字，空白條件不會關閉任何頁面。",
            "請先打啲字，空白條件唔會關任何頁面。",
            "打啲字先啦，空白條件乜都唔會關，咁先安全。",
            "打啲字先，空白條件一頁都唔會關，係特登嘅。",
            "打啲字先得㗎，空白條件一頁都唔關，特登整成咁。",
        ],
    },
    "bulk.invalidPattern": {
        en: [
            "The pattern is not valid, so nothing will close. {message}",
            "The pattern is not valid, so nothing will close. {message}",
            "That pattern does not compile, so nothing closes. {message}",
            "That pattern will not compile, so nothing closes. {message}",
            "That pattern refuses to compile, so nothing closes at all. {message}",
        ],
        yue: [
            "此規則無效，不會關閉任何頁面。{message}",
            "呢條式唔啱，唔會關到任何頁面。{message}",
            "呢條式砌唔起，所以乜都唔會關。{message}",
            "呢條式砌唔掂，所以一頁都唔關。{message}",
            "呢條式死都唔肯砌，所以一頁都唔會關。{message}",
        ],
    },
    "bulk.noMatches": {
        en: [
            "No page names match. Nothing will close.",
            "No page names match, so nothing will close.",
            "Nothing matches, so nothing closes. Try a shorter piece of text.",
            "Not a single match, so nothing closes. Maybe try less text.",
            "Zero matches, zero closures. Try aiming with less text.",
        ],
        yue: [
            "沒有頁面名稱符合，不會關閉任何頁面。",
            "冇頁面個名夾到，所以乜都唔會關。",
            "冇一個夾到，所以乜都唔關。試下打少啲字。",
            "一個都唔夾，所以一頁都唔關。不如打少啲字？",
            "零個夾到，零頁被關。打少啲字瞄準下啦。",
        ],
    },
    "bulk.willClose": {
        en: [
            "{count} of {total} pages will close.",
            "{count} of {total} pages will close.",
            "{count} of {total} pages are for the chop.",
            "{count} of {total} pages are going.",
            "{count} of {total} pages are walking the plank.",
        ],
        yue: [
            "{total} 個頁面中將關閉 {count} 個。",
            "{total} 頁入面會關 {count} 頁。",
            "{total} 頁入面有 {count} 頁要走。",
            "{total} 頁入面 {count} 頁要收工。",
            "{total} 頁入面 {count} 頁要跳船。",
        ],
    },
    "bulk.excludedPinned": {
        en: [
            "{count} pinned pages are excluded and will stay open.",
            "{count} pinned pages are excluded and will stay open.",
            "{count} pinned pages are sitting this one out and will stay open.",
            "{count} pinned pages are staying put, because pinned means pinned.",
            "{count} pinned pages are staying exactly where they are. Pinned means pinned.",
        ],
        yue: [
            "已排除 {count} 個已釘選頁面，該等頁面將保持開啟。",
            "已排除 {count} 個釘咗嘅頁面，佢哋會照樣開住。",
            "有 {count} 個釘咗嘅頁面唔玩呢鋪，會照樣開住。",
            "{count} 個釘咗嘅頁面唔會郁，釘咗就係釘咗。",
            "{count} 個釘咗嘅頁面企定定唔郁。釘咗就係釘咗，冇得傾。",
        ],
    },
    "bulk.result": {
        en: [
            "Closed {closed} pages. {excluded} pinned pages were excluded.",
            "Closed {closed} pages. {excluded} pinned pages were excluded.",
            "Closed {closed} pages. {excluded} pinned ones were left alone.",
            "{closed} pages closed. {excluded} pinned ones survived.",
            "{closed} pages gone. {excluded} pinned ones survived the cull.",
        ],
        yue: [
            "已關閉 {closed} 個頁面，排除了 {excluded} 個已釘選頁面。",
            "關咗 {closed} 頁，排除咗 {excluded} 個釘咗嘅頁面。",
            "關咗 {closed} 頁，{excluded} 個釘咗嘅冇郁佢。",
            "{closed} 頁收工，{excluded} 個釘咗嘅生還。",
            "{closed} 頁執笠，{excluded} 個釘咗嘅大難不死。",
        ],
    },
    "dimsum.eyebrow": {
        en: [
            "Dim sum",
            "A little dim sum",
            "A little dim sum, on the house",
            "Dim sum, unrequested",
            "Dim sum, arriving whether you ordered it or not",
        ],
        yue: ["點心", "少少點心", "少少點心，本店請客", "點心，冇人叫都上", "點心到，唔理你叫唔叫"],
    },
    "home.lede": {
        en: [
            "material-bluemap is a TypeScript port of BlueMap with a Material Design 3 interface. This site documents what exists and what does not.",
            "material-bluemap is a TypeScript port of BlueMap with a Material Design 3 interface. This site documents what exists and what does not.",
            "material-bluemap is BlueMap ported to TypeScript, wearing Material Design 3. This site documents what exists and, just as usefully, what does not.",
            "material-bluemap is BlueMap rebuilt in TypeScript with a Material Design 3 face. This site says what exists and, more usefully, what does not.",
            "material-bluemap is BlueMap reborn in TypeScript with a Material Design 3 makeover. This site says what exists and, far more usefully, what does not.",
        ],
        yue: [
            "material-bluemap 係 BlueMap 嘅 TypeScript 移植版，配 Material Design 3 介面。本站記錄現有功能同尚未完成的部分。",
            "material-bluemap 係 BlueMap 嘅 TypeScript 移植版，配 Material Design 3 介面。本站記錄咗有咩同未有咩。",
            "material-bluemap 就係 BlueMap 用 TypeScript 重寫，著上 Material Design 3。本站寫低有咩，同埋一樣重要嘅：未有咩。",
            "material-bluemap 就係 BlueMap 用 TypeScript 重生，仲整咗個 Material Design 3 靚面。本站講明有咩，仲更加有用咁講明未有咩。",
            "material-bluemap 就係 BlueMap 用 TypeScript 投胎，順便做埋 Material Design 3 全身整容。本站坦白講有咩，仲坦白講未有咩。",
        ],
    },
    "home.statusBody": {
        en: [
            "Eight packages build, the linter is clean and the test suite passes. No release has been published, so nothing here is downloadable yet.",
            "Eight packages build, the linter is clean and the test suite passes. No release has been published, so there is nothing to download yet.",
            "Eight packages build, the linter has no complaints and the tests pass. No release has been published, so there is nothing to download yet.",
            "Eight packages build, the linter has nothing to say and the tests pass. No release exists, so there is nothing to download yet.",
            "Eight packages build, the linter has run out of complaints and the tests pass. No release exists, so the download button is still imaginary.",
        ],
        yue: [
            "八個套件可成功建置，程式碼檢查無誤，測試全部通過。尚未發布任何版本，因此暫時無法下載。",
            "八個套件都砌得起，lint 冇投訴，測試全部過。未出過任何版本，所以暫時冇嘢可以下載。",
            "八個套件砌得起，lint 冇嘢好講，測試全過。未出過版本，所以暫時冇嘢落得。",
            "八個套件砌得起，lint 收晒聲，測試全過。一個版本都未出，所以未有嘢落得。",
            "八個套件砌得起，lint 投訴到冇嘢好投訴，測試全過。一個版本都未出，所以個下載掣仲係幻想。",
        ],
    },
    "home.shellBody": {
        en: [
            "This page is the site shell: Material Design 3 tokens, tabbed navigation, the three language modes, two funny-level sliders, non-blocking notifications and a dim sum surprise.",
            "This page is the site shell: Material Design 3 tokens, tabbed navigation, three language modes, two funny-level sliders, non-blocking notifications and a dim sum surprise.",
            "You are looking at the shell: Material Design 3 tokens, real tabs, three language modes, two funny-level sliders, notifications that never block you, and a dim sum surprise.",
            "You are looking at the shell itself: Material Design 3 tokens, real tabs, three languages, two funny dials, notifications that never block you, and the occasional dumpling.",
            "You are staring at the shell: Material Design 3 tokens, real tabs, three languages, two funny dials, notifications that refuse to block you, and the occasional flying dumpling.",
        ],
        yue: [
            "本頁為網站外殼：Material Design 3 設計權杖、分頁導覽、三種語言模式、兩個搞笑程度滑桿、非阻斷式通知，以及點心驚喜。",
            "呢頁就係網站外殼：Material Design 3 設計權杖、分頁導覽、三種語言模式、兩個搞笑程度滑桿、唔阻你做嘢嘅通知，同埋點心驚喜。",
            "你而家睇緊嘅就係外殼：Material Design 3 權杖、真 tab、三種語言、兩個搞笑掣、唔會阻住你嘅通知，仲有點心驚喜。",
            "你望緊嘅就係個外殼本身：Material Design 3 權杖、真 tab、三種語言、兩個搞笑掣、死都唔阻你嘅通知，同埋間唔中飛出嚟嘅點心。",
            "你眼前呢舊就係外殼：Material Design 3 權杖、真 tab、三種語言、兩個搞笑掣、死都唔肯阻你嘅通知，同埋間唔中飛出嚟嘅蝦餃。",
        ],
    },
    "tabs.closedNotice": {
        en: [
            "Closed {label}.",
            "Closed {label}.",
            "Closed {label}.",
            "{label} has left the building.",
            "{label} has left the building, waving.",
        ],
        yue: [
            "已關閉 {label}。",
            "已經關咗 {label}。",
            "{label} 關咗嘞。",
            "{label} 走咗喇。",
            "{label} 揮下手就走咗喇。",
        ],
    },
    "tabs.pinnedNotice": {
        en: [
            "Pinned {label}. Pinned pages stay visible when the strip overflows and are excluded from bulk closes.",
            "Pinned {label}. Pinned pages stay visible when the strip overflows and are excluded from bulk closes.",
            "Pinned {label}. It stays visible when the strip overflows and sits out bulk closes.",
            "{label} is nailed down. It stays visible when the strip overflows and sits out bulk closes.",
            "{label} is nailed to the floor. It stays visible when the strip overflows and laughs off bulk closes.",
        ],
        yue: [
            "已釘選 {label}。已釘選的頁面在分頁溢位時仍會顯示，並會被大量關閉排除。",
            "釘咗 {label}。釘咗嘅頁面就算分頁擺唔落都會照顯示，大量關閉唔會計佢。",
            "釘咗 {label}。分頁逼爆都照顯示，大量關閉唔會關到佢。",
            "{label} 釘實咗。分頁逼爆都照顯示，大量關閉搞佢唔掂。",
            "{label} 釘死咗喺地下。分頁逼爆都照顯示，大量關閉當佢冇到。",
        ],
    },
    "bulk.timedOut": {
        en: [
            "Matching stopped at the {budget} millisecond limit, so this preview is incomplete and may miss pages.",
            "Matching stopped at the {budget} millisecond limit, so this preview is incomplete and may miss pages.",
            "Matching hit the {budget} millisecond limit and stopped, so this preview is incomplete and may miss pages.",
            "The pattern ran out its {budget} millisecond allowance, so this preview is incomplete and may miss pages.",
            "The pattern blew its {budget} millisecond allowance and got cut off, so this preview is incomplete and may miss pages.",
        ],
        yue: [
            "比對已達 {budget} 毫秒上限而停止，因此本預覽並不完整，可能遺漏頁面。",
            "比對去到 {budget} 毫秒上限就停咗，所以呢個預覽唔完整，可能漏咗啲頁面。",
            "比對撞到 {budget} 毫秒上限停咗，呢個預覽唔完整，可能漏咗啲頁面。",
            "條式用爆咗 {budget} 毫秒配額，呢個預覽唔完整，可能漏咗啲頁面。",
            "條式使爆 {budget} 毫秒配額畀人截咗糊，呢個預覽唔完整，可能漏咗啲頁面。",
        ],
    },
    "dimsum.dishLine": {
        en: [
            "{english} · {chinese} ({jyutping})",
            "{english} · {chinese} ({jyutping})",
            "{english} · {chinese} ({jyutping})",
            "{english} · {chinese} ({jyutping})",
            "{english} · {chinese} ({jyutping})",
        ],
        yue: [
            "{english} · {chinese}（{jyutping}）",
            "{english} · {chinese}（{jyutping}）",
            "{english} · {chinese}（{jyutping}）",
            "{english} · {chinese}（{jyutping}）",
            "{english} · {chinese}（{jyutping}）",
        ],
    },
    "site.discoverySubtitle": {
        en: [
            "Each search stays attached to its own surface, with plain text first and a full regex builder beside it.",
            "Each search stays attached to its own surface: plain text first, with a full regex builder beside it.",
            "Every search keeps its own little desk, with plain text first and the full regex toolbox right beside it.",
            "Every search gets its own desk and regex toolbox, so patterns do not wander into the wrong field.",
            "Each search has its own desk, its own toolbox, and absolutely no excuse for borrowing another field's pattern.",
        ],
        yue: [
            "每個搜尋都黐返自己個介面，預設純文字，旁邊有完整正規表示式工具箱。",
            "每個搜尋都有自己個位，先用純文字，旁邊跟住完整正規表示式工具箱。",
            "每個搜尋都有自己張枱，純文字打頭陣，正規表示式工具箱就喺隔籬。",
            "每個搜尋一人一張枱一套工具，條式唔會周街亂撞去第二個欄位。",
            "每個搜尋有自己張枱同工具箱，條式冇藉口走去人哋個欄位搞事。",
        ],
    },
    "site.clipboardUnavailable": {
        en: [
            "Clipboard access is unavailable; use Export Markdown instead.",
            "Clipboard access is unavailable; Export Markdown is still ready.",
            "The clipboard is taking the day off; Export Markdown remains available.",
            "The clipboard wandered off; use Export Markdown and keep moving.",
            "The clipboard has left the building; Export Markdown is holding the fort.",
        ],
        yue: [
            "剪貼簿不可用，請改用匯出 Markdown。",
            "剪貼簿而家用唔到，但仲可以匯出 Markdown。",
            "剪貼簿今日放假，匯出 Markdown 仲健在。",
            "剪貼簿走失咗，匯出 Markdown 幫你頂住先。",
            "剪貼簿離場，匯出 Markdown 留低守城。",
        ],
    },
    "site.changelogSubtitle": {
        en: [
            "Every recorded version, date, category, and the commit that made it real.",
            "Every recorded version, date, category, and the commit that made it real, in one searchable place.",
            "Every version, date, category, and the commit that did the actual work, all in one tidy ledger.",
            "Every version, date, category, and commit, lined up so the changelog cannot play hide-and-seek.",
            "Every version, date, category, and commit on parade: no mystery meat in this history.",
        ],
        yue: [
            "每個記錄版本、日期、分類，同埋令佢成真嗰個 commit。",
            "每個記錄版本、日期、分類，同埋真正做成件事嗰個 commit，全部可搜尋。",
            "每個版本、日期、分類，同埋真正落手做嗰個 commit，整齊排喺同一本帳。",
            "版本、日期、分類同 commit 全部排好，變更記錄唔使玩捉迷藏。",
            "版本、日期、分類同 commit 全部上台巡遊，呢本歷史冇神秘肉丸。",
        ],
    },
    "site.filteredCopied": {
        en: [
            "Filtered changelog copied.",
            "Filtered changelog copied.",
            "Filtered changelog copied without drama.",
            "Filtered changelog copied; the clipboard behaved.",
            "Filtered changelog copied; tiny clipboard victory.",
        ],
        yue: [
            "已複製篩選後的變更記錄。",
            "已複製篩選後嘅變更記錄。",
            "篩選後嘅變更記錄複製好，冇出花。",
            "篩選記錄複製成功，剪貼簿今次乖。",
            "篩選記錄複製成功，剪貼簿終於贏一局。",
        ],
    },
    "site.clipboardFailed": {
        en: [
            "Clipboard access failed; use Export Markdown instead.",
            "Clipboard access failed; Export Markdown is still available.",
            "The clipboard failed; Export Markdown will get you out.",
            "The clipboard tripped; use Export Markdown instead.",
            "The clipboard face-planted; Export Markdown is the reliable escape hatch.",
        ],
        yue: [
            "剪貼簿存取失敗，請改用匯出 Markdown。",
            "剪貼簿存取失敗，但仲可以匯出 Markdown。",
            "剪貼簿跌低咗，匯出 Markdown 可以救場。",
            "剪貼簿跣親，改用匯出 Markdown。",
            "剪貼簿成個趴低，匯出 Markdown 係可靠出口。",
        ],
    },
    "site.filteredExported": {
        en: [
            "Filtered changelog exported.",
            "Filtered changelog exported.",
            "Filtered changelog exported successfully.",
            "Filtered changelog packed and exported.",
            "Filtered changelog escaped into a Markdown file.",
        ],
        yue: [
            "已匯出篩選後的變更記錄。",
            "已匯出篩選後嘅變更記錄。",
            "篩選後嘅變更記錄匯出成功。",
            "篩選記錄執好包匯出。",
            "篩選記錄成功逃入 Markdown 檔案。",
        ],
    },

    /* ---------------------------------------------------------------------- */
    /* Chrome the shared content renderer (shell/renderBlocks.ts) and the     */
    /* home/docs page framing add around structured articles, not authored    */
    /* article prose itself -- see this file's own header and FACTS' doc      */
    /* comment below for the line drawn between the two.                      */
    /* ---------------------------------------------------------------------- */

    "home.heroEyebrowAvailable": {
        en: [
            "Verified release · v{version}",
            "Verified release · v{version}",
            "A verified release is up: v{version}",
            "It is real: v{version} is a verified release",
            "Bragging rights secured: v{version} is a genuinely verified release",
        ],
        yue: [
            "已驗證版本 · v{version}",
            "已驗證版本 · v{version}",
            "有個已驗證版本喇：v{version}",
            "係真㗎：v{version} 係已驗證版本",
            "威番次：v{version} 係貨真價實已驗證版本",
        ],
    },
    "home.heroEyebrowUnavailable": {
        en: [
            "No verified release yet",
            "No verified release yet",
            "No verified release exists yet",
            "Nothing verified to release yet, hang tight",
            "Zero verified releases yet, but the suspense is real",
        ],
        yue: [
            "未有已驗證版本",
            "未有已驗證版本",
            "暫時未有已驗證版本",
            "仲未有嘢驗證好攞出嚟，唔使急",
            "一個已驗證版本都未有，不過緊張感係真㗎",
        ],
    },
    "shell.startupFailedTitle": {
        en: [
            "This page failed to start.",
            "This page failed to start.",
            "This page failed to start, and that is a real problem.",
            "Well, this page failed to start. Not exactly the plan.",
            "This page tripped over its own shoelaces and failed to start.",
        ],
        yue: [
            "呢頁未能啟動。",
            "呢頁未能啟動。",
            "呢頁未能啟動，呢個係真係有問題。",
            "呢頁未能啟動，唔係原本個計劃。",
            "呢頁跣一跤，未能啟動。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const FIXED = {
    "brand.name": { en: "material-bluemap", yue: "material-bluemap" },
    "common.close": { en: "Close", yue: "關閉" },
    "common.cancel": { en: "Cancel", yue: "取消" },
    "common.apply": { en: "Apply", yue: "套用" },
    "common.reset": { en: "Reset", yue: "重設" },
    "common.done": { en: "Done", yue: "完成" },
    "common.search": { en: "Search", yue: "搜尋" },
    "common.rename": { en: "Rename", yue: "重新命名" },
    "common.remove": { en: "Remove", yue: "移除" },
    "common.more": { en: "More", yue: "更多" },
    "common.openRepository": { en: "Open the repository", yue: "開啟程式庫" },

    "language.mode.en": { en: "English", yue: "English" },
    "language.mode.yue": { en: "廣東話", yue: "廣東話" },
    "language.mode.bilingual": { en: "English + 廣東話", yue: "English + 廣東話" },
    "language.modeLabel": { en: "Language mode", yue: "語言模式" },
    "language.funnyEnLabel": { en: "English funny level", yue: "英文搞笑程度" },
    "language.funnyYueLabel": { en: "廣東話 funny level", yue: "廣東話搞笑程度" },
    "language.level.1": { en: "1 Serious", yue: "1 正經" },
    "language.level.2": { en: "2 Plain", yue: "2 平實" },
    "language.level.3": { en: "3 Light", yue: "3 輕鬆" },
    "language.level.4": { en: "4 Playful", yue: "4 搞笑" },
    "language.level.5": { en: "5 Maximum", yue: "5 癲晒" },

    "appearance.themeLabel": { en: "Theme", yue: "主題" },
    "appearance.theme.system": { en: "Follow the system", yue: "跟隨系統" },
    "appearance.theme.light": { en: "Light", yue: "淺色" },
    "appearance.theme.dark": { en: "Dark", yue: "深色" },
    "appearance.densityLabel": { en: "Density", yue: "密度" },
    "appearance.density.comfortable": { en: "Comfortable", yue: "舒適" },
    "appearance.density.compact": { en: "Compact", yue: "緊湊" },

    "notify.dismiss": { en: "Dismiss", yue: "關閉通知" },
    "notify.dismissAll": { en: "Clear all", yue: "全部清除" },
    "notify.clearAllConfirm": {
        en: "Clear all {count} notification records from this browser session? This cannot be undone.",
        yue: "清除呢個瀏覽器工作階段入面全部 {count} 條通知記錄？呢個動作無法撤銷。",
    },
    "notify.severity.info": { en: "Information", yue: "資訊" },
    "notify.severity.success": { en: "Success", yue: "成功" },
    "notify.severity.warning": { en: "Warning", yue: "警告" },
    "notify.severity.error": { en: "Error", yue: "錯誤" },

    "tabs.menu.pin": { en: "Pin", yue: "釘選" },
    "tabs.menu.unpin": { en: "Unpin", yue: "取消釘選" },
    "tabs.menu.moveLeft": { en: "Move left", yue: "向左移" },
    "tabs.menu.moveRight": { en: "Move right", yue: "向右移" },
    "tabs.menu.close": { en: "Close", yue: "關閉" },
    "tabs.menu.closeOthers": { en: "Close others", yue: "關閉其他" },
    "tabs.menu.closeRight": { en: "Close to the right", yue: "關閉右邊全部" },
    "tabs.closeConfirm": {
        en: "Close {label}? It will leave the open tab strip and can be reopened from Recently closed.",
        yue: "關閉「{label}」？佢會離開目前分頁列，但可以喺最近關閉度重新開返。",
    },
    "tabs.closeOthersConfirm": {
        en: "Close {count} other unpinned pages? Pinned pages stay open and the closed pages can be reopened from Recently closed.",
        yue: "關閉其他 {count} 頁未釘選頁面？已釘選頁面會保留，關閉咗嘅頁面可以喺最近關閉度開返。",
    },
    "tabs.closeRightConfirm": {
        en: "Close {count} unpinned pages to the right? They can be reopened from Recently closed.",
        yue: "關閉右邊 {count} 頁未釘選頁面？佢哋可以喺最近關閉度開返。",
    },
    "tabs.menu.addToGroup": { en: "Add to group", yue: "加入群組" },
    "tabs.menu.removeFromGroup": { en: "Remove from group", yue: "移出群組" },
    "tabs.menu.pageActions": { en: "Page actions", yue: "頁面操作" },
    "tabs.menu.search": { en: "Filter menu items", yue: "篩選選單項目" },
    "tabs.menu.noItems": { en: "Nothing matches that menu search.", yue: "呢個選單搜尋冇嘢啱。" },
    "tabs.group.collapse": { en: "Collapse group", yue: "收合群組" },
    "tabs.group.expand": { en: "Expand group", yue: "展開群組" },
    "tabs.group.rename": { en: "Rename group…", yue: "重新命名群組…" },
    "tabs.group.remove": { en: "Remove group", yue: "移除群組" },
    "tabs.removeGroupConfirm": {
        en: "Remove group {name}? Its pages stay open and become ungrouped.",
        yue: "移除群組「{name}」？入面嘅頁面會保留，但會變成未分組。",
    },
    "tabs.group.colour": { en: "Group colour", yue: "群組顏色" },
    "tabs.group.actions": { en: "Group actions", yue: "群組操作" },
    "tabs.group.none": { en: "No group", yue: "唔屬於任何群組" },
    "tabs.colour.blue": { en: "Blue", yue: "藍" },
    "tabs.colour.green": { en: "Green", yue: "綠" },
    "tabs.colour.amber": { en: "Amber", yue: "琥珀" },
    "tabs.colour.purple": { en: "Purple", yue: "紫" },
    "tabs.colour.red": { en: "Red", yue: "紅" },
    "tabs.colour.grey": { en: "Grey", yue: "灰" },
    "tabs.filterLabel": { en: "Filter pages", yue: "篩選頁面" },

    "bulk.queryLabel": { en: "Text to match", yue: "要比對的文字" },
    "bulk.modeLabel": { en: "Match mode", yue: "比對模式" },
    "bulk.mode.plain": { en: "Plain text", yue: "純文字" },
    "bulk.mode.regex": { en: "Regular expression", yue: "正規表示式" },
    "bulk.caseSensitive": { en: "Match case", yue: "區分大小寫" },
    "bulk.confirm": { en: "Close them", yue: "關閉佢哋" },
    "bulk.closeConfirm": {
        en: "Close {count} pages matched by this {mode} search? Pinned or protected pages outside the count stay open.",
        yue: "關閉呢個 {mode} 搜尋搵到嘅 {count} 頁？唔計入數目嘅釘選或受保護頁面會保留。",
    },
    "bulk.builderButton": { en: "Build the pattern", yue: "砌條式" },
    "bulk.scopeLabel": { en: "Scope", yue: "範圍" },
    "bulk.scope.all": { en: "All open pages", yue: "所有開啟中的頁面" },
    "bulk.scope.group": { en: "Group: {name}", yue: "群組：{name}" },
    "bulk.eligible": { en: "{count} pages in scope", yue: "範圍內有 {count} 頁" },

    "home.title": { en: "material-bluemap", yue: "material-bluemap" },
    "home.statusHeading": { en: "Current state", yue: "目前狀態" },
    "home.shellHeading": { en: "What this shell provides", yue: "呢個外殼有咩" },
    "home.tabLabel": { en: "Home", yue: "主頁" },

    "dimsum.dismiss": { en: "Dismiss", yue: "收起" },
    "dimsum.regionLabel": { en: "Dim sum surprise", yue: "點心驚喜" },

    "site.homeTab": { en: "Home", yue: "主頁" },
    "site.docsTab": { en: "Documentation", yue: "說明文件" },
    "site.screenshotsTab": { en: "Screenshots", yue: "螢幕截圖" },
    "site.settingsTab": { en: "Settings", yue: "設定" },
    "site.searchTab": { en: "Search", yue: "搜尋" },
    "site.changelogTab": { en: "Changelog", yue: "變更記錄" },
    "site.notificationsTab": { en: "Notifications", yue: "通知" },
    "site.discoveryTitle": { en: "Search everything", yue: "搜尋所有嘢" },
    "site.docsSearchHeading": { en: "Documentation search", yue: "說明文件搜尋" },
    "site.settingsSearchHeading": { en: "Settings search", yue: "設定搜尋" },
    "site.tabDiscoveryHeading": { en: "Tab discovery", yue: "分頁探索" },
    "site.bulkCloseHeading": { en: "Bulk close actions", yue: "大量關閉操作" },
    "site.currentStrip": { en: "Current tab strip", yue: "目前分頁列" },
    "site.tabGroups": { en: "Tab groups", yue: "分頁群組" },
    "site.everyOpenTab": { en: "Every open tab", yue: "所有開啟中的分頁" },
    "site.groupPrefix": { en: "Group: {name}", yue: "群組：{name}" },
    "site.changelogTitle": { en: "Changelog", yue: "變更記錄" },
    "site.searchChangelog": { en: "Search changelog", yue: "搜尋變更記錄" },
    "site.searchChangelogPlaceholder": {
        en: "Search versions, changes, or commits",
        yue: "搜尋版本、變更或 commit",
    },
    "site.changelogEntries": { en: "Changelog entries", yue: "變更記錄項目" },
    "site.commitLabel": { en: "commit", yue: "commit" },
    "site.commitMissing": { en: "Commit not recorded", yue: "未記錄 commit" },
    "site.openCommit": { en: "Open commit {commit}", yue: "開啟 commit {commit}" },
    "site.changelogDateFilter": { en: "Changelog date filter", yue: "變更記錄日期篩選" },
    "site.from": { en: "From", yue: "由" },
    "site.to": { en: "To", yue: "至" },
    "site.allDates": { en: "All dates", yue: "所有日期" },
    "site.last30": { en: "Last 30 days", yue: "最近 30 日" },
    "site.last90": { en: "Last 90 days", yue: "最近 90 日" },
    "site.dateRangeButton": { en: "Choose date range", yue: "選擇日期範圍" },
    "site.datePickerTitle": { en: "Changelog date range", yue: "變更記錄日期範圍" },
    "site.applyRange": { en: "Apply date range", yue: "套用日期範圍" },
    "site.resetRange": { en: "Reset date range", yue: "重設日期範圍" },
    "site.previousMonth": { en: "Previous month", yue: "上個月" },
    "site.nextMonth": { en: "Next month", yue: "下個月" },
    "site.selectStart": { en: "Select range start", yue: "選擇範圍開始" },
    "site.selectEnd": { en: "Select range end", yue: "選擇範圍結束" },
    "site.dateInvalid": {
        en: "Enter a valid ISO date or a locale date such as 08/04/2026.",
        yue: "請輸入有效 ISO 日期，或者例如 08/04/2026 嘅本地日期。",
    },
    "site.copyFiltered": { en: "Copy filtered changelog", yue: "複製篩選後變更記錄" },
    "site.exportMarkdown": { en: "Export Markdown", yue: "匯出 Markdown" },
    "site.commandPalette": { en: "Command palette", yue: "指令面板" },
    "site.useFullWindow": { en: "Use full window", yue: "使用全視窗" },
    "site.useBoundedCard": { en: "Use bounded card", yue: "使用有界卡片" },
    "site.paletteSearchLabel": {
        en: "Search commands, pages, settings, and appearance",
        yue: "搜尋指令、頁面、設定同外觀",
    },
    "site.paletteSearchPlaceholder": {
        en: "Type a command or destination",
        yue: "輸入指令或目的地",
    },
    "site.paletteResults": { en: "Command palette results", yue: "指令面板結果" },
    "site.notificationTitle": { en: "Notification centre", yue: "通知中心" },
    "site.searchNotifications": { en: "Search notifications", yue: "搜尋通知" },
    "site.searchNotificationsPlaceholder": {
        en: "Search notification titles and details",
        yue: "搜尋通知標題同詳情",
    },
    "site.notificationEntries": { en: "Notification history", yue: "通知歷史" },
    "site.clearNotifications": { en: "Clear notification history", yue: "清除通知歷史" },
    "site.clearNotificationsConfirm": {
        en: "Clear all {count} notification records from this browser session? This cannot be undone.",
        yue: "清除呢個瀏覽器工作階段入面全部 {count} 條通知記錄？呢個動作無法撤銷。",
    },
    "site.exportNotifications": { en: "Export notification history", yue: "匯出通知歷史" },
    "site.notificationsCleared": { en: "Notification history cleared.", yue: "通知歷史已清除。" },
    "site.notificationsExported": { en: "Notification history exported.", yue: "通知歷史已匯出。" },
    "site.selectAllShown": { en: "Select all shown", yue: "全選顯示中" },
    "site.clearSelection": { en: "Clear selection", yue: "清除揀選" },
    "site.invertSelection": { en: "Invert selection", yue: "反選" },
    "site.notificationSelectionCount": {
        en: "{selected} of {shown} shown selected",
        yue: "已揀選 {shown} 個顯示中嘅 {selected} 個",
    },
    "site.selectNotification": { en: "Select {title}", yue: "揀選 {title}" },
    "site.deleteSelected": { en: "Delete selected", yue: "刪除已揀選" },
    "site.deleteSelectedConfirm": {
        en: "Delete {count} selected notification record(s) from this browser session? This cannot be undone.",
        yue: "刪除呢個瀏覽器工作階段入面已揀選嘅 {count} 條通知記錄？呢個動作無法撤銷。",
    },
    "site.exportSelected": { en: "Export selected", yue: "匯出已揀選" },
    "site.selectionDeleted": { en: "Selected notifications deleted.", yue: "已揀選嘅通知已刪除。" },
    "site.selectionExported": { en: "Selected notifications exported.", yue: "已揀選嘅通知已匯出。" },
    "site.openHome": { en: "Open Home", yue: "開啟主頁" },
    "site.openDocs": { en: "Open Documentation", yue: "開啟說明文件" },
    "site.openScreenshots": { en: "Open Screenshots", yue: "開啟螢幕截圖" },
    "site.openSearch": { en: "Open Search everything", yue: "開啟搜尋所有嘢" },
    "site.openChangelog": { en: "Open Changelog", yue: "開啟變更記錄" },
    "site.openNotifications": { en: "Open Notification centre", yue: "開啟通知中心" },
    "site.openSettings": { en: "Open Settings", yue: "開啟設定" },
    "site.openArticle": { en: "Open article: {title}", yue: "開啟文章：{title}" },
    "site.descriptionHome": { en: "Return to the landing page", yue: "返回主頁" },
    "site.descriptionDocs": { en: "Read every feature article", yue: "閱讀全部功能文章" },
    "site.descriptionSearch": {
        en: "Search docs, settings, tabs, groups, and bulk actions",
        yue: "搜尋文件、設定、分頁、群組同大量操作",
    },
    "site.descriptionChangelog": {
        en: "Filter and export every recorded version",
        yue: "篩選同匯出所有記錄版本",
    },
    "site.descriptionNotifications": {
        en: "Review dismissed notifications",
        yue: "查看已收起的通知",
    },
    "site.descriptionSettings": {
        en: "Language, funny levels, appearance, and data",
        yue: "語言、搞笑程度、外觀同資料",
    },
    "site.descriptionAppearance": {
        en: "Open the per-element Material appearance editor",
        yue: "開啟每個元素的 Material 外觀編輯器",
    },
    "site.editAppearance": { en: "Edit appearance…", yue: "編輯外觀…" },
    "site.brandAria": {
        en: "material-bluemap: go to Home",
        yue: "material-bluemap：返回主頁",
    },
    "site.descriptionScreenshots": {
        en: "See real captures from continuous integration",
        yue: "睇吓 CI 攞返嚟嘅真實截圖",
    },

    /* Chrome the content renderer adds -- see the matching comment in VOICED above. */
    "callout.note": { en: "Note", yue: "注意" },
    "callout.warning": { en: "Warning", yue: "警告" },
    "callout.notImplemented": { en: "Not implemented", yue: "未實作" },
    "content.codeSampleAria": { en: "{language} code sample", yue: "{language} 程式碼範例" },
    "content.suggestedArticlesHeading": { en: "Suggested articles", yue: "推薦文章" },
    "content.sourcesHeading": { en: "Sources", yue: "資料來源" },
    "content.phaseTableCaption": { en: "Port progress by phase", yue: "各階段嘅移植進度" },
    "content.phaseColumnPhase": { en: "Phase", yue: "階段" },
    "content.phaseColumnScope": { en: "Scope", yue: "範圍" },
    "content.phaseColumnStatus": { en: "Status", yue: "狀態" },
    "status.shipped": { en: "Shipped", yue: "已完成" },
    "status.portedUnverified": { en: "Ported, not yet verified", yue: "已移植，未驗證" },
    "status.specified": { en: "Specified, not built", yue: "已定義，未實作" },
    "category.application": { en: "Application", yue: "應用程式" },
    "category.engine": { en: "Engine", yue: "引擎" },
    "category.delivery": { en: "Build and delivery", yue: "建置同發佈" },
    "category.contracts": { en: "Product contracts", yue: "產品約章" },
    "phase.done": { en: "Done", yue: "完成" },
    "phase.inProgress": { en: "In progress", yue: "進行中" },
    "phase.pending": { en: "Pending", yue: "待處理" },
    "shell.startupFailedReport": { en: "Report this", yue: "回報呢個問題" },
    "home.glossaryButtonLabel": { en: "Read the glossary of terms", yue: "閱讀詞彙表" },
    "home.heroKicker": {
        en: "Open source · TypeScript port of BlueMap",
        yue: "開源項目 · BlueMap 嘅 TypeScript 移植版",
    },
    "home.changelogButtonLabel": { en: "See what changed", yue: "睇吓改咗啲乜" },

    /* The small kicker line above each capability group's own heading in "What it can
       do" -- see FEATURE_GROUP_KICKER_KEYS in main.ts. */
    "home.groupKickerRender": {
        en: "Ways to render a world",
        yue: "起世界地圖嘅幾種方法",
    },
    "home.groupKickerApp": {
        en: "Inside the desktop app",
        yue: "喺桌面應用程式入面",
    },
    "home.groupKickerWorking": {
        en: "Day to day in the shell",
        yue: "喺介面入面嘅日常操作",
    },
    "home.groupKickerEngine": {
        en: "How blocks become geometry",
        yue: "方塊點樣變成模型",
    },
    "home.groupKickerDelivery": {
        en: "From push to release",
        yue: "由推送到發佈",
    },
} as const satisfies Record<string, FixedString>;

export type VoicedKey = keyof typeof VOICED;
export type FixedKey = keyof typeof FIXED;
export type StringKey = VoicedKey | FixedKey;

/* -------------------------------------------------------------------------- */
/* FACTS: the literal substrings a playful rewrite may never drop             */
/* -------------------------------------------------------------------------- */

/**
 * The literal substring(s) a `VOICED` entry's wording must keep at every funny level, in
 * both languages -- the same convention `packages/ui/src/copy/appCopy.ts`'s own `FACTS`
 * documents: the level styles the voice, and this is the mechanical check that it never
 * touches the one fact the sentence exists to state.
 *
 * `Partial` rather than mandatory for every `VOICED` key, unlike the UI package's stricter
 * version. This catalogue's roughly 150 pre-existing entries were written before this guard
 * existed, and auditing every one of them for the fact it is meant to pin is a separate pass
 * this addition does not claim to have done -- see `contract-localization.ts`'s own
 * `statusNote` for that gap tracked in the open. What this guarantees is narrower and honest
 * about it: every entry named here keeps its literal fact at every level in both languages,
 * checked by `strings.test.ts`, and every entry this pass adds for chrome that states a real
 * claim -- whether a verified release exists, that a page failed to start -- is named here
 * rather than left to human review alone.
 */
export interface VoicedFact {
    readonly en: readonly string[];
    readonly yue: readonly string[];
}

export const FACTS: Partial<Record<VoicedKey, VoicedFact>> = {
    "home.heroEyebrowAvailable": { en: ["release"], yue: ["已驗證"] },
    "home.heroEyebrowUnavailable": { en: ["yet"], yue: ["未有"] },
    "shell.startupFailedTitle": { en: ["failed to start"], yue: ["未能啟動"] },
};
