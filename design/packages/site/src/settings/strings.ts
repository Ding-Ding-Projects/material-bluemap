/**
 * Copy for the settings surface, in English and Hong Kong Cantonese.
 *
 * Where a phrase carries a fact (a unit, a colour space, a keyboard shortcut, what
 * a reset will erase) it is a plain string and reads the same at every funny level.
 * Only the framing varies by level, and only where varying it cannot change what
 * the visitor is being told.
 */

import type { StringTable } from "./i18n.js";

export const SETTINGS_STRINGS: StringTable = {
    "settings.kicker": {
        en: {
            1: "Your browser, your rules",
            3: "Your browser, your rules",
            5: "Your browser. Your rules. Our nagging stays switched off.",
        },
        yue: {
            1: "你部機你話事",
            3: "你部機你話事",
            5: "你部機你話事，我哋唔會嘈你。",
        },
    },
    "settings.title": {
        en: {
            1: "Settings",
            3: "Settings",
            5: "Settings, the knobs room",
        },
        yue: {
            1: "設定",
            3: "設定",
            5: "設定，全部掣喺呢度",
        },
    },
    "settings.subtitle": {
        en: {
            1: "Preferences are stored in this browser only. Nothing is sent anywhere.",
            3: "Every preference here lives in this browser and goes nowhere else.",
            5: "Everything you change here stays in this browser. No servers, no snooping, no drama.",
        },
        yue: {
            1: "所有設定只係存喺呢個瀏覽器，唔會傳去任何地方。",
            3: "全部設定都淨係留喺你部機，唔會寄去邊。",
            5: "全部設定收埋喺你個瀏覽器度，冇伺服器、冇偷睇、冇是非。",
        },
    },
    "settings.searchLabel": { en: "Search settings", yue: "搜尋設定" },
    "settings.searchPlaceholder": {
        en: "Search every tab",
        yue: "搜尋全部分頁",
    },
    "settings.searchHint": {
        en: "Plain text by default. Open the pattern builder for regular expressions.",
        yue: "預設係普通文字。要用正則就開圖案建構器。",
    },
    "settings.searchClear": { en: "Clear search", yue: "清除搜尋" },
    "settings.tabSearchLabel": { en: "Search this settings section", yue: "搜尋呢個設定分類" },
    "settings.tabSearchPlaceholder": { en: "Search this section", yue: "搜尋呢個分類" },
    "settings.tabSearchHint": {
        en: "This field searches only the visible settings section. Plain text is the default; open the pattern builder for regular expressions.",
        yue: "呢個欄位淨係搜尋目前設定分類。預設係普通文字；要用正則就開圖案建構器。",
    },
    "settings.searchResults": {
        en: "{count} settings match",
        yue: "有 {count} 項設定合到",
    },
    "settings.searchResultsOne": { en: "1 setting matches", yue: "有 1 項設定合到" },
    "settings.searchNoResults": {
        en: {
            1: "No setting matches that.",
            3: "Nothing matches that.",
            5: "Nothing matches. Either it does not exist, or it is hiding better than expected.",
        },
        yue: {
            1: "冇設定符合。",
            3: "搵唔到符合嘅設定。",
            5: "搵唔到喎。要唔係冇呢樣嘢，要唔係佢匿得太好。",
        },
    },
    "settings.searchInvalid": {
        en: "That pattern is not valid, so nothing was filtered.",
        yue: "個圖案唔啱格式，所以冇篩過。",
    },
    "settings.searchOtherTab": {
        en: "{count} matches on {tab}",
        yue: "{tab} 有 {count} 項合到",
    },
    "settings.searchOtherTabOne": {
        en: "1 match on {tab}",
        yue: "{tab} 有 1 項合到",
    },
    "settings.searchGoToTab": { en: "Go to {tab}", yue: "去 {tab}" },
    "settings.tabsLabel": { en: "Settings sections", yue: "設定分類" },
    "settings.reset": { en: "Reset", yue: "還原" },
    "settings.resetOne": { en: "Reset {name} to its default", yue: "將「{name}」還原做預設" },
    "settings.resetOneDone": {
        en: "{name} is back to its default.",
        yue: "「{name}」已經還原做預設。",
    },
    "settings.atDefault": { en: "Already at its default", yue: "已經係預設值" },
    "settings.changed": { en: "Changed", yue: "已改" },
    "settings.changedCount": {
        en: "{count} settings differ from their defaults",
        yue: "有 {count} 項設定同預設唔同",
    },
    "settings.dependsOn": {
        en: "Takes effect when {name} is on.",
        yue: "要開咗「{name}」先會生效。",
    },
    "settings.storageUnavailable": {
        en: "This browser is blocking local storage, so changes will not survive a reload.",
        yue: "呢個瀏覽器封鎖咗本機儲存，所以改完 reload 就會冇咗。",
    },
    "settings.storageWriteFailed": {
        en: "Local storage refused the last write. Changes apply now but will not survive a reload.",
        yue: "本機儲存寫唔入。而家改到，但係 reload 之後會冇咗。",
    },

    "settings.tab.general": { en: "General", yue: "一般" },
    "settings.tab.general.desc": {
        en: "Theme, contrast, density, and motion.",
        yue: "主題、對比、密度同動畫。",
    },
    "settings.tab.language": { en: "Language", yue: "語言" },
    "settings.tab.language.desc": {
        en: "Which language the site speaks, and how playful it is in each.",
        yue: "個站用邊種語言講嘢，同每種語言玩得幾癲。",
    },
    "settings.tab.appearance": { en: "Appearance", yue: "外觀" },
    "settings.tab.appearance.desc": {
        en: "Type, shape, colour, per-element editors, and saved themes.",
        yue: "字型、形狀、顏色、逐個元素嘅編輯器同儲低嘅主題。",
    },
    "settings.tab.access": { en: "Accessibility", yue: "無障礙" },
    "settings.tab.access.desc": {
        en: "Focus rings, target sizes, and text spacing.",
        yue: "focus 框、可點擊範圍同字距。",
    },
    "settings.tab.data": { en: "Data", yue: "資料" },
    "settings.tab.data.desc": {
        en: "Export, import, and reset what this browser has stored.",
        yue: "匯出、匯入同清走呢個瀏覽器儲低嘅嘢。",
    },

    "settings.group.theme": { en: "Theme and surface", yue: "主題同底色" },
    "settings.group.motion": { en: "Motion", yue: "動態" },
    "settings.group.languageMode": { en: "Language mode", yue: "語言模式" },
    "settings.group.tone": { en: "Tone", yue: "語氣" },
    "settings.group.type": { en: "Typography", yue: "字體" },
    "settings.group.shape": { en: "Shape and elevation", yue: "形狀同層次" },
    "settings.group.elements": { en: "Per-element appearance", yue: "逐個元素外觀" },
    "settings.group.presets": { en: "Presets and themes", yue: "預設同主題" },
    "settings.group.focus": { en: "Focus and contrast", yue: "Focus 同對比" },
    "settings.group.targets": { en: "Targets and spacing", yue: "點擊範圍同間距" },
    "settings.group.transfer": { en: "Export and import", yue: "匯出同匯入" },
    "settings.group.resetGroup": { en: "Reset", yue: "還原" },

    "set.themeMode": { en: "Theme", yue: "主題" },
    "set.themeMode.desc": {
        en: "Follow the operating system, or pin light or dark.",
        yue: "跟系統，或者定死光或者暗。",
    },
    "set.themeMode.system": { en: "Follow system", yue: "跟系統" },
    "set.themeMode.light": { en: "Light", yue: "淺色" },
    "set.themeMode.dark": { en: "Dark", yue: "深色" },

    "set.contrast": { en: "Contrast", yue: "對比" },
    "set.contrast.desc": {
        en: "Raises the separation between text and its surface.",
        yue: "加大文字同底色之間嘅分別。",
    },
    "set.contrast.standard": { en: "Standard", yue: "標準" },
    "set.contrast.medium": { en: "Medium", yue: "中" },
    "set.contrast.high": { en: "High", yue: "高" },

    "set.density": { en: "Density", yue: "密度" },
    "set.density.desc": {
        en: "How tightly rows, controls, and padding are packed.",
        yue: "行、控制項同留白逼得幾實。",
    },
    "set.density.comfortable": { en: "Comfortable", yue: "寬鬆" },
    "set.density.standard": { en: "Standard", yue: "標準" },
    "set.density.compact": { en: "Compact", yue: "緊湊" },

    "set.accentSeed": { en: "Accent colour", yue: "主色" },
    "set.accentSeed.desc": {
        en: "The seed the light and dark palettes are derived from.",
        yue: "淺色同深色色板都由呢隻色推出嚟。",
    },

    "set.surfaceTint": { en: "Tint surfaces with the accent", yue: "用主色染底色" },
    "set.surfaceTint.desc": {
        en: "Material tints raised surfaces towards the accent colour.",
        yue: "Material 會將浮起嘅底色向主色偏。",
    },

    "set.reduceMotion": { en: "Reduce motion", yue: "減少動畫" },
    "set.reduceMotion.desc": {
        en: "System follows your operating system setting.",
        yue: "「跟系統」即係跟你部機嘅設定。",
    },
    "set.reduceMotion.system": { en: "Follow system", yue: "跟系統" },
    "set.reduceMotion.always": { en: "Always reduce", yue: "一定減" },
    "set.reduceMotion.never": { en: "Never reduce", yue: "唔好減" },

    "set.motionScale": { en: "Motion speed", yue: "動畫速度" },
    "set.motionScale.desc": {
        en: "1.00 is the Material duration. Lower is faster. 0 removes transitions.",
        yue: "1.00 係 Material 原本嘅時間。細啲即係快啲，0 就冇晒過渡。",
    },

    "set.languageMode": { en: "Language", yue: "語言" },
    "set.languageMode.desc": {
        en: "Bilingual shows English with a compact Cantonese line beneath.",
        yue: "雙語模式會英文為主，下面加一行細嘅廣東話。",
    },
    "set.languageMode.en": { en: "English", yue: "英文" },
    "set.languageMode.yue": { en: "Cantonese", yue: "廣東話" },
    "set.languageMode.bilingual": { en: "English and Cantonese", yue: "英文加廣東話" },

    "set.funnyEn": { en: "Funny level, English", yue: "英文搞笑程度" },
    "set.funnyEn.desc": {
        en: "1 is fully professional and 5 is maximum playfulness. It changes wording only. What a control does, what a reset erases, and what an error says stay exact at every level.",
        yue: "1 係完全專業，5 係玩到盡。佢淨係改措辭。每一級入面，掣做乜、還原會刪乜、錯誤講乜都一樣咁準確。",
    },
    "set.funnyYue": { en: "Funny level, Cantonese", yue: "廣東話搞笑程度" },
    "set.funnyYue.desc": {
        en: "Set separately from English. Same rule: tone changes, facts do not.",
        yue: "同英文分開調。一樣規矩：語氣變，事實唔變。",
    },
    "set.funny.1": { en: "1, fully professional", yue: "1，完全專業" },
    "set.funny.2": { en: "2, mostly plain", yue: "2，大致平實" },
    "set.funny.3": { en: "3, relaxed", yue: "3，輕鬆" },
    "set.funny.4": { en: "4, cheeky", yue: "4，有啲串" },
    "set.funny.5": { en: "5, maximum playfulness", yue: "5，玩到盡" },

    "set.secondaryInline": { en: "Show the Cantonese line inline", yue: "廣東話行內顯示" },
    "set.secondaryInline.desc": {
        en: "Off puts the second language on its own line, which is easier to read at narrow widths.",
        yue: "熄咗就將第二語言另起一行，窄畫面易睇啲。",
    },

    "set.fontFamily": { en: "Interface font", yue: "介面字體" },
    "set.fontFamily.desc": {
        en: "Each option is drawn in its own face. All stacks end in a CJK-safe fallback.",
        yue: "每個選項都用返自己嗰隻字體畫。全部字體組合最後都有中日韓後備。",
    },
    "set.monoFamily": { en: "Monospace font", yue: "等寬字體" },
    "set.monoFamily.desc": {
        en: "Used for patterns, colour values, and code.",
        yue: "用喺圖案、色值同程式碼。",
    },
    "set.fontScale": { en: "Text size", yue: "字級" },
    "set.fontScale.desc": {
        en: "Scales every type role together, so the Material type ramp keeps its proportions.",
        yue: "全部字級一齊縮放，Material 嘅字階比例保持唔變。",
    },
    "set.fontWeight": { en: "Text weight", yue: "字重" },
    "set.fontWeight.desc": {
        en: "Applied to body copy. Headings keep their own relative weight.",
        yue: "用喺內文。標題保持自己嘅相對字重。",
    },

    "set.cornerScale": { en: "Corner radius", yue: "圓角" },
    "set.cornerScale.desc": {
        en: "Scales the Material shape scale. 0 gives square corners.",
        yue: "縮放 Material 嘅形狀比例。0 就係直角。",
    },
    "set.elevation": { en: "Show elevation shadows", yue: "顯示層次陰影" },
    "set.elevation.desc": {
        en: "Off replaces shadows with outlines, which some displays render more cleanly.",
        yue: "熄咗就用邊框代替陰影，有啲螢幕會靚啲。",
    },
    "set.borderWidth": { en: "Outline width", yue: "邊框粗幼" },
    "set.borderWidth.desc": {
        en: "Applies to outlined buttons, fields, and cards.",
        yue: "用喺有邊框嘅掣、輸入格同卡片。",
    },

    "set.focusWidth": { en: "Focus ring width", yue: "Focus 框粗幼" },
    "set.focusWidth.desc": {
        en: "The ring drawn around whatever the keyboard is on. It is never removed.",
        yue: "鍵盤停喺邊就框住邊。呢個框永遠唔會拎走。",
    },
    "set.focusColor": { en: "Focus ring colour", yue: "Focus 框顏色" },
    "set.focusColor.desc": {
        en: "The picker reports contrast against the surface behind the ring.",
        yue: "揀色器會報返個框同底色之間嘅對比。",
    },
    "set.underlineLinks": { en: "Underline links", yue: "連結加底線" },
    "set.underlineLinks.desc": {
        en: "Underlines links in body copy so colour is not the only signal.",
        yue: "內文連結加底線，唔淨係靠顏色分。",
    },
    "set.minTarget": { en: "Minimum target size", yue: "最細可點擊範圍" },
    "set.minTarget.desc": {
        en: "In CSS pixels. Small controls grow an invisible hit area to reach this.",
        yue: "以 CSS 像素計。細掣會加大隱形嘅感應範圍去夠呢個尺寸。",
    },
    "set.textSpacing": { en: "Increase text spacing", yue: "加大字距" },
    "set.textSpacing.desc": {
        en: "Raises line height, letter spacing, and word spacing to the WCAG text spacing values.",
        yue: "將行高、字距同詞距加到 WCAG 建議嘅數值。",
    },

    "action.exportSettings": { en: "Export settings", yue: "匯出設定" },
    "action.exportSettings.desc": {
        en: "Writes a JSON file with every setting that differs from its default, plus any value this build did not recognise.",
        yue: "寫低一個 JSON 檔，入面有全部同預設唔同嘅設定，仲有呢個版本認唔到嘅值。",
    },
    "action.exportSettings.button": { en: "Download JSON", yue: "下載 JSON" },
    "action.importSettings": { en: "Import settings", yue: "匯入設定" },
    "action.importSettings.desc": {
        en: "Reads a settings JSON file. Values this build does not recognise are kept, not dropped.",
        yue: "讀返個設定 JSON 檔。呢個版本認唔到嘅值會保留，唔會刪走。",
    },
    "action.importSettings.button": { en: "Choose a file", yue: "揀個檔案" },
    "action.importDone": {
        en: "Applied {applied}, kept {preserved} unrecognised, rejected {rejected}.",
        yue: "套用咗 {applied} 項，保留咗 {preserved} 項認唔到嘅，拒收 {rejected} 項。",
    },
    "action.importFailed": {
        en: "That file is not settings JSON, so nothing changed.",
        yue: "個檔唔係設定 JSON，所以乜都冇改到。",
    },
    "action.resetAll": { en: "Reset every setting", yue: "還原所有設定" },
    "action.resetAll.desc": {
        en: "Erases every preference in this browser, including saved appearance presets, and returns the site to its defaults. This cannot be undone.",
        yue: "會清走呢個瀏覽器入面所有偏好，包括儲低嘅外觀預設，全部還原做預設值。呢個動作冇得復原。",
    },
    "action.resetAll.button": { en: "Reset everything", yue: "全部還原" },
    "action.resetAll.done": {
        en: "Every setting is back to its default.",
        yue: "所有設定已經還原做預設。",
    },

    "confirm.title": { en: "Confirm", yue: "確認" },
    "confirm.cancel": { en: "Cancel", yue: "取消" },
    "confirm.proceed": { en: "Yes, do it", yue: "係，做啦" },
    "confirm.irreversible": {
        en: "This cannot be undone.",
        yue: "呢個動作冇得復原。",
    },
    "confirm.super.instructions": {
        en: "Enter RESET in the first box and ALL in the second. Then move the full-range slider to authorize this exact action.",
        yue: "第一格輸入 RESET，第二格輸入 ALL，跟住推滿條滑桿，先可以批准呢個指定動作。",
    },
    "confirm.super.firstLabel": { en: "Key one: RESET", yue: "第一條匙：RESET" },
    "confirm.super.secondLabel": { en: "Key two: ALL", yue: "第二條匙：ALL" },
    "confirm.super.sliderLabel": { en: "Authorization slider", yue: "授權滑桿" },
    "confirm.super.locked": { en: "Two keys are still required.", yue: "仲差兩條匙。" },
    "confirm.super.unlocked": {
        en: "Both keys accepted. Slide all the way.",
        yue: "兩條匙啱晒，推到盡頭啦。",
    },
    "confirm.super.complete": { en: "Authorization complete.", yue: "授權完成。" },
    "confirm.super.emergency": { en: "Emergency exit", yue: "緊急退出" },
};
