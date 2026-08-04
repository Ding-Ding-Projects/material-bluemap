/**
 * The application's own copy, in English and in playful Hong Kong Cantonese, at five
 * funny levels each.
 *
 * `components/setup/setupStrings.ts` already did this for the first-run flow, and did it
 * properly: three tiers, five levels a side, and a test that proves the consent facts do
 * not move. What it could not do is reach the rest of the application, because the rest of
 * the application does not call the setup store. It calls `vue-i18n`, roughly nine hundred
 * and fifty distinct keys of it, every one of them shaped
 * `t("world.folder.noLevelDat", { folder }, "There is no level.dat in {folder}, ...")`.
 *
 * The English string in that third argument is a *fallback*: vue-i18n uses it only when
 * the key resolves nowhere. The thirty locale files under `public/lang/` are upstream
 * BlueMap's viewer locales and carry about seventy keys between them, none of which is one
 * of ours. So every one of those nine hundred and fifty keys rendered its fallback, in
 * English, in all thirty languages, at every funny level. Not a bug in any one of them:
 * there was simply nothing on the other side of the call.
 *
 * This file is the other side of the call. `appVoice.ts` turns it into a vue-i18n message
 * set for whichever mode and levels are active and registers it ahead of the upstream
 * locale, so an entry here starts varying at every existing call site with no component
 * edited at all. A key that is *not* here still renders its English fallback exactly as
 * before, which is what makes this safe to grow one surface at a time.
 *
 * ## The three tiers, and why a string is in one rather than another
 *
 *   VOICED  Prose the user reads: errors, warnings, the sentence that says what a delete
 *           will take with it, the line that reports what was saved and where. Five
 *           English strings and five Cantonese strings, index 0 being level 1 (fully
 *           professional) and index 4 being level 5 (maximum playfulness).
 *
 *   FIXED   Titles, buttons, column headings, the names of things. One string per
 *           language, no level. A funny level cannot usefully restyle "Cancel", and a
 *           button whose label moves under somebody is a button they re-read every time.
 *           These still change with the *mode*, which is the half that matters for them.
 *
 * There is no third EXACT tier here, and the omission is deliberate rather than an
 * oversight. `setupStrings.ts` needs one because a licence quotation is a fact in the
 * shape of a whole paragraph. Out here the facts are the interpolated values -- the path,
 * the count, the map id, the folder -- and they are protected by a stronger mechanism than
 * a tier could give them: `FACTS` below, plus a test that reads every call site in the
 * package and refuses any entry that drops a placeholder its fallback carried.
 *
 * ## What a funny level is allowed to change
 *
 * Voice. Never facts. Level 5 may be as silly as it likes about the *manner* of a failed
 * delete; it may not stop naming the file, stop saying the delete cannot be undone, or
 * quietly lose the storage whose tiles are being left behind. `FACTS` names, per key and
 * per language, the substrings that have to survive every level, and `appCopy.test.ts`
 * checks all ten strings of every entry against them. A warning nobody can act on is a
 * broken warning, not a funny one.
 *
 * Placeholders are vue-i18n's `{name}`. Every level of an entry uses the same set, so a
 * level cannot drop a value out of a sentence -- and because the fallback at the call site
 * is the source of truth for which placeholders exist, an entry that invents one is
 * rejected too.
 *
 * ## Writing the Cantonese
 *
 * Natural and playful, and never at the user's expense. The house rule is narrow and
 * absolute: humour is aimed at the software's own behaviour, never at somebody's lost
 * work, their money, or their ability to use a computer. Where a sentence reports damage,
 * the Cantonese gets no funnier than the English does, at any level.
 *
 * Identifiers stay identical in both languages: `level.dat` is `level.dat`, `JAVA_HOME` is
 * `JAVA_HOME`, `maps/` is `maps/`. Translating a filename produces a sentence that reads
 * well and sends the reader looking for a file that does not exist.
 */

import type { FixedString, VoicedString } from "../components/setup/setupStrings.js";

/* -------------------------------------------------------------------------- */
/* VOICED: five levels per language                                           */
/* -------------------------------------------------------------------------- */

export const APP_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Destructive: what a delete takes, and what it leaves behind       */
    /* ---------------------------------------------------------------- */

    "config.maps.deleteAction": {
        en: [
            "This deletes {path} from the config folder when you save. It cannot be undone from here.",
            "This deletes {path} from the config folder when you save. It cannot be undone from here.",
            "Saving deletes {path} from the config folder. Nothing here can undo it afterwards.",
            "Hit save and {path} leaves the config folder for good. There is no undo on this one.",
            "Save, and {path} walks out of the config folder and does not come back. No undo, no take-backs, no quiet copy in a corner.",
        ],
        yue: [
            "儲存嘅時候，呢個操作會由設定資料夾刪除 {path}。喺呢度冇得復原。",
            "儲存嘅時候，呢個操作會由設定資料夾刪除 {path}。喺呢度冇得復原。",
            "一按儲存，{path} 就會由設定資料夾刪除咗。之後喺呢度冇得復原。",
            "㩒咗儲存，{path} 就會離開設定資料夾，唔會返嚟。呢個係冇得復原㗎。",
            "儲存落去，{path} 就會同設定資料夾講拜拜，唔會返轉頭。冇復原，冇後悔藥，冇偷偷擺喺角落嘅副本。",
        ],
    },
    "config.maps.deleteTiles": {
        en: [
            'Already-rendered tiles in storage "{storage}" are NOT deleted. BlueMap leaves them where they are; remove them yourself if you want the space back.',
            'Already-rendered tiles in storage "{storage}" are NOT deleted. BlueMap leaves them where they are; remove them yourself if you want the space back.',
            'The tiles already rendered into storage "{storage}" are NOT deleted. BlueMap leaves them exactly where they are, so delete them yourself if you want the space back.',
            'Tiles already sitting in storage "{storage}" are NOT deleted. BlueMap will not touch them, so if you want that disk space back you are the one who has to go and take it.',
            'The tiles already rendered into storage "{storage}" are NOT deleted. BlueMap leaves every last one of them exactly where it is, minding its own business, so if you want the disk space back you will have to go and evict them yourself.',
        ],
        yue: [
            "已經算好、放喺儲存空間「{storage}」入面嘅圖磚係唔會刪除嘅。BlueMap 會原封不動咁擺喺度；想攞返啲空間就要你自己去刪。",
            "已經算好、放喺儲存空間「{storage}」入面嘅圖磚係唔會刪除嘅。BlueMap 會原封不動咁擺喺度；想攞返啲空間就要你自己去刪。",
            "已經算好、放咗喺儲存空間「{storage}」嘅圖磚，唔會刪除。BlueMap 會擺返原位，一隻都唔郁；想攞返磁碟空間，就要你自己動手。",
            "已經擺咗喺儲存空間「{storage}」嘅圖磚唔會刪。BlueMap 完全唔會掂佢哋，所以你想要返啲磁碟空間，就要你自己去攞。",
            "已經算好、住咗喺儲存空間「{storage}」嘅圖磚，一隻都唔會刪。BlueMap 會由得佢哋喺度歎世界，所以你想收返啲磁碟空間，就要你親自去趕人。",
        ],
    },
    "config.storages.deleteAction": {
        en: [
            "This deletes {path} from the config folder when you save.",
            "This deletes {path} from the config folder when you save.",
            "Saving deletes {path} from the config folder.",
            "Hit save and {path} leaves the config folder.",
            "Save, and {path} is out of the config folder for good.",
        ],
        yue: [
            "儲存嘅時候，呢個操作會由設定資料夾刪除 {path}。",
            "儲存嘅時候，呢個操作會由設定資料夾刪除 {path}。",
            "一按儲存，{path} 就會由設定資料夾刪除咗。",
            "㩒咗儲存，{path} 就會離開設定資料夾。",
            "儲存落去，{path} 就正式同設定資料夾講拜拜。",
        ],
    },
    "config.storages.deleteBreaks": {
        en: [
            "These maps name this storage and will stop loading until you point them somewhere else: {maps}",
            "These maps name this storage and will stop loading until you point them somewhere else: {maps}",
            "These maps name this storage, and they stop loading until you point them somewhere else: {maps}",
            "These maps still name this storage, so they stop loading the moment it goes, until you point them somewhere else: {maps}",
            "These maps are still pointing at this storage and will stop loading the second it disappears, until you send them somewhere else: {maps}",
        ],
        yue: [
            "以下地圖有指名用呢個儲存空間，喺你將佢哋改去第二度之前，佢哋會載入唔到：{maps}",
            "以下地圖有指名用呢個儲存空間，喺你將佢哋改去第二度之前，佢哋會載入唔到：{maps}",
            "以下地圖指名咗用呢個儲存空間，你未將佢哋改去第二度之前，佢哋會載入唔到：{maps}",
            "以下地圖仲係指住呢個儲存空間，佢一走，呢啲地圖就即刻載入唔到，直到你將佢哋改去第二度：{maps}",
            "以下地圖仲死心不息咁指住呢個儲存空間，佢一消失，呢啲地圖即刻載入唔到，直到你幫佢哋搵過第二個地方：{maps}",
        ],
    },
    "superConfirm.keys": {
        en: [
            "Turn both keys, then drag the slider all the way.",
            "Turn both keys, then drag the slider all the way.",
            "Turn both keys, then drag the slider all the way to the end.",
            "Two keys first, then drag the slider all the way to the end. Both, and the whole way.",
            "Two keys, then drag the slider all the way to the end. Yes, both keys. Yes, the whole way. This one is meant to be awkward.",
        ],
        yue: [
            "扭開兩條鎖匙，然後將拉桿拖到盡頭。",
            "扭開兩條鎖匙，然後將拉桿拖到盡頭。",
            "兩條鎖匙都要扭，跟住將拉桿一路拖到盡頭。",
            "先扭兩條鎖匙，再將拉桿一路拖到盡頭。兩條都要，而且要拖到底。",
            "兩條鎖匙，然後將拉桿拖到盡頭。係，兩條都要。係，要拖到底。呢一步本來就係整到你麻煩少少㗎。",
        ],
    },
    "superConfirm.locked": {
        en: [
            "Both keys are needed before the slider moves.",
            "Both keys are needed before the slider moves.",
            "The slider does not move until both keys are turned.",
            "The slider will not budge until both keys are turned.",
            "The slider is not going anywhere until both keys are turned. It is very committed to this.",
        ],
        yue: [
            "兩條鎖匙都扭咗，拉桿先會郁。",
            "兩條鎖匙都扭咗，拉桿先會郁。",
            "兩條鎖匙未扭齊，拉桿係唔會郁㗎。",
            "兩條鎖匙未扭齊，拉桿一動都唔會動。",
            "兩條鎖匙未扭齊，拉桿邊度都唔去。佢喺呢件事上面好堅持。",
        ],
    },
    "superConfirm.armed": {
        en: [
            "Armed. Drag the slider to the end to confirm.",
            "Armed. Drag the slider to the end to confirm.",
            "Both keys are turned. Drag the slider to the end to confirm.",
            "Both keys turned. Drag the slider all the way to the end to confirm.",
            "Both keys turned, safety off. Drag the slider all the way to the end to confirm.",
        ],
        yue: [
            "已解鎖。將拉桿拖到盡頭就確認。",
            "已解鎖。將拉桿拖到盡頭就確認。",
            "兩條鎖匙都扭咗。將拉桿拖到盡頭就確認。",
            "兩條鎖匙搞掂。將拉桿一路拖到盡頭就確認。",
            "兩條鎖匙搞掂，保險掣都熄咗。將拉桿一路拖到盡頭就確認。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Errors: what failed, where, and what to do about it               */
    /* ---------------------------------------------------------------- */

    "world.folder.noLevelDat": {
        en: [
            "There is no level.dat in {folder}, so it is not a Minecraft world.",
            "There is no level.dat in {folder}, so it is not a Minecraft world.",
            "There is no level.dat in {folder}, so this is not a Minecraft world folder.",
            "No level.dat in {folder}, which means this is not a Minecraft world folder.",
            "Not a level.dat in sight anywhere in {folder}, so this is not a Minecraft world folder.",
        ],
        yue: [
            "{folder} 入面冇 level.dat，所以呢個唔係 Minecraft 世界。",
            "{folder} 入面冇 level.dat，所以呢個唔係 Minecraft 世界。",
            "{folder} 入面搵唔到 level.dat，所以呢個唔係 Minecraft 世界資料夾。",
            "{folder} 入面冇 level.dat，即係話呢個唔係 Minecraft 世界資料夾。",
            "喺 {folder} 入面掘極都冇一個 level.dat，所以呢個唔係 Minecraft 世界資料夾。",
        ],
    },
    "world.folder.noRegionData": {
        en: [
            "{folder} is a world, but no dimension in it has any region files, so there is nothing to render yet.",
            "{folder} is a world, but no dimension in it has any region files, so there is nothing to render yet.",
            "{folder} really is a world, but not one dimension in it has any region files, so there is nothing to render yet.",
            "{folder} is a world all right, but not a single dimension in it has region files, so there is nothing to render yet.",
            "{folder} is a genuine world, and completely empty: not one dimension in it has a single region file, so there is nothing to render yet.",
        ],
        yue: [
            "{folder} 係一個世界，不過入面冇任何維度有區域檔案，所以而家冇嘢可以算圖。",
            "{folder} 係一個世界，不過入面冇任何維度有區域檔案，所以而家冇嘢可以算圖。",
            "{folder} 真係一個世界，但入面冇一個維度有區域檔案，所以而家冇嘢可以算圖。",
            "{folder} 的確係個世界，不過入面連一個維度都冇區域檔案，所以而家冇嘢可以算圖。",
            "{folder} 係一個貨真價實嘅世界，同時空空如也：入面連一個維度都冇一個區域檔案，所以而家冇嘢可以算圖。",
        ],
    },
    "world.folder.savesFolder": {
        en: [
            "That folder holds several worlds rather than being one: {worlds}.",
            "That folder holds several worlds rather than being one: {worlds}.",
            "That folder holds several worlds rather than being one itself: {worlds}.",
            "That folder is not a world, it is a shelf of them: {worlds}.",
            "That folder is not a world, it is where worlds are kept: {worlds}.",
        ],
        yue: [
            "嗰個資料夾入面裝住幾個世界，本身唔係一個世界：{worlds}。",
            "嗰個資料夾入面裝住幾個世界，本身唔係一個世界：{worlds}。",
            "嗰個資料夾入面裝住幾個世界，佢自己本身唔係一個世界：{worlds}。",
            "嗰個資料夾唔係一個世界，係一個放世界嘅櫃：{worlds}。",
            "嗰個資料夾唔係世界，係啲世界住嘅屋苑：{worlds}。",
        ],
    },
    "config.shell.openFailed": {
        en: [
            "Could not read {folder}.",
            "Could not read {folder}.",
            "{folder} could not be read.",
            "{folder} would not open.",
            "{folder} would not open, and it did not say why.",
        ],
        yue: [
            "讀取唔到 {folder}。",
            "讀取唔到 {folder}。",
            "{folder} 讀取唔到。",
            "{folder} 打唔開。",
            "{folder} 打唔開，仲要一聲都唔出。",
        ],
    },
    "config.maps.idTaken": {
        en: [
            'Another map file already becomes the id "{id}". BlueMap refuses to start when two do.',
            'Another map file already becomes the id "{id}". BlueMap refuses to start when two do.',
            'Another map file already turns into the id "{id}", and BlueMap refuses to start when two of them do.',
            'Another map file already claims the id "{id}", and BlueMap flatly refuses to start when two do.',
            'The id "{id}" is taken: another map file already turns into it, and BlueMap will not start at all while two of them do.',
        ],
        yue: [
            "另一個地圖檔案已經會變成 id「{id}」。有兩個嘅話，BlueMap 會拒絕啟動。",
            "另一個地圖檔案已經會變成 id「{id}」。有兩個嘅話，BlueMap 會拒絕啟動。",
            "另一個地圖檔案已經會變成 id「{id}」，一有兩個，BlueMap 就唔肯開機。",
            "另一個地圖檔案已經霸咗 id「{id}」，一有兩個，BlueMap 就死都唔肯啟動。",
            "id「{id}」已經有人霸咗：另一個地圖檔案已經會變成佢，而只要有兩個，BlueMap 就完全唔會啟動。",
        ],
    },
    "config.maps.nameTaken": {
        en: [
            "There is already a maps/{name}.conf.",
            "There is already a maps/{name}.conf.",
            "There is already a file called maps/{name}.conf.",
            "maps/{name}.conf is taken already.",
            "maps/{name}.conf already exists, and it got there first.",
        ],
        yue: [
            "已經有一個 maps/{name}.conf。",
            "已經有一個 maps/{name}.conf。",
            "已經有個檔案叫 maps/{name}.conf。",
            "maps/{name}.conf 已經有人用咗。",
            "maps/{name}.conf 已經存在，而且佢仲快你一步。",
        ],
    },
    "config.keyValue.duplicate": {
        en: [
            "There is already a property called {key}.",
            "There is already a property called {key}.",
            "There is already a property called {key} in this file.",
            "{key} is in this file already.",
            "{key} is already in this file, sitting there quite happily.",
        ],
        yue: [
            "已經有一個屬性叫 {key}。",
            "已經有一個屬性叫 {key}。",
            "呢個檔案入面已經有一個屬性叫 {key}。",
            "{key} 喺呢個檔案入面已經有咗。",
            "{key} 早就喺呢個檔案入面，仲坐得好舒服。",
        ],
    },
    "settings.java.notFound": {
        en: [
            "No Java {required} or newer was found.",
            "No Java {required} or newer was found.",
            "No Java {required} or newer was found on this machine.",
            "Nothing on this machine is Java {required} or newer.",
            "This machine has no Java {required} or newer anywhere on it.",
        ],
        yue: [
            "搵唔到 Java {required} 或以上嘅版本。",
            "搵唔到 Java {required} 或以上嘅版本。",
            "喺呢部機搵唔到 Java {required} 或以上嘅版本。",
            "呢部機入面冇一個係 Java {required} 或以上。",
            "呢部機由頭搵到尾，都冇一個 Java {required} 或以上嘅版本。",
        ],
    },
    "settings.storage.relative": {
        en: [
            "That is not a full path. Name a folder from the top of a drive, like {example}.",
            "That is not a full path. Name a folder from the top of a drive, like {example}.",
            "That is not a full path. Name a folder from the top of a drive, such as {example}.",
            "That is not a full path. Start at the top of a drive, the way {example} does.",
            "That is not a full path. Start at the top of a drive and work down, the way {example} does.",
        ],
        yue: [
            "呢個唔係完整路徑。請由磁碟最頂開始寫個資料夾，例如 {example}。",
            "呢個唔係完整路徑。請由磁碟最頂開始寫個資料夾，例如 {example}。",
            "呢個唔係完整路徑。要由磁碟最頂開始寫個資料夾，例如 {example}。",
            "呢個唔係完整路徑。要由磁碟最頂開始寫落嚟，好似 {example} 咁。",
            "呢個唔係完整路徑。要由磁碟最頂一路寫落嚟，好似 {example} 咁樣。",
        ],
    },
    "downloads.listFailed": {
        en: [
            "Downloads already on this machine could not be listed: {message}. Anything started from here is still shown below.",
            "Downloads already on this machine could not be listed: {message}. Anything started from here is still shown below.",
            "The downloads already on this machine could not be listed: {message}. Anything you start from here is still shown below.",
            "The downloads already on this machine would not list themselves: {message}. Anything you start from here still shows up below.",
            "The downloads already on this machine flatly refused to be listed: {message}. Anything you start from here still shows up below, so this is a gap in the history rather than a broken screen.",
        ],
        yue: [
            "列舉唔到呢部機上面已有嘅下載：{message}。喺呢度開始嘅下載，下面一樣睇得到。",
            "列舉唔到呢部機上面已有嘅下載：{message}。喺呢度開始嘅下載，下面一樣睇得到。",
            "呢部機上面已有嘅下載列舉唔到：{message}。你喺呢度開始嘅下載，下面照樣睇得到。",
            "呢部機上面已有嘅下載唔肯報上名嚟：{message}。你喺呢度開始嘅下載，下面照樣出現。",
            "呢部機上面已有嘅下載死都唔肯列出嚟：{message}。你喺呢度開始嘅下載，下面照樣出現，所以係少咗段歷史，唔係成個畫面壞咗。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Reports: what was written, where, and how long it took            */
    /* ---------------------------------------------------------------- */

    "config.shell.saved": {
        en: [
            "Wrote {writes} files and deleted {deletes} in {folder}.",
            "Wrote {writes} files and deleted {deletes} in {folder}.",
            "Wrote {writes} files and deleted {deletes} in {folder}. That is what is on disk now.",
            "{writes} files written, {deletes} deleted, all in {folder}.",
            "{writes} files written and {deletes} deleted in {folder}. The config folder now says what this screen says.",
        ],
        yue: [
            "喺 {folder} 寫咗 {writes} 個檔案，刪咗 {deletes} 個。",
            "喺 {folder} 寫咗 {writes} 個檔案，刪咗 {deletes} 個。",
            "喺 {folder} 寫咗 {writes} 個檔案，刪咗 {deletes} 個。而家磁碟上面就係咁。",
            "寫咗 {writes} 個檔案，刪咗 {deletes} 個，全部喺 {folder} 度。",
            "喺 {folder} 寫咗 {writes} 個檔案、刪咗 {deletes} 個。而家設定資料夾同呢個畫面講嘅嘢終於一致。",
        ],
    },
    "config.saved": {
        en: [
            "Saved the BlueMap configuration in {folder}.",
            "Saved the BlueMap configuration in {folder}.",
            "Saved the BlueMap configuration in {folder}.",
            "BlueMap's configuration is saved in {folder}.",
            "BlueMap's configuration is safely down in {folder}.",
        ],
        yue: [
            "已將 BlueMap 設定儲存喺 {folder}。",
            "已將 BlueMap 設定儲存喺 {folder}。",
            "已經將 BlueMap 設定儲存喺 {folder}。",
            "BlueMap 嘅設定已經儲存咗喺 {folder}。",
            "BlueMap 嘅設定已經穩穩陣陣落咗喺 {folder}。",
        ],
    },
    "settings.storage.saved": {
        en: [
            "Saved. Maps will be written to {path}.",
            "Saved. Maps will be written to {path}.",
            "Saved. Rendered maps go to {path} from now on.",
            "Saved. From now on maps land in {path}.",
            "Saved. From now on every rendered map lands in {path}.",
        ],
        yue: [
            "已儲存。地圖會寫入 {path}。",
            "已儲存。地圖會寫入 {path}。",
            "已儲存。之後算好嘅地圖會寫入 {path}。",
            "已儲存。由而家開始，啲地圖會落喺 {path}。",
            "已儲存。由而家開始，每一張算好嘅地圖都會落喺 {path}。",
        ],
    },
    "world.run.finishedLine": {
        en: [
            "Finished in {duration}. The tiles are in {root}.",
            "Finished in {duration}. The tiles are in {root}.",
            "Finished in {duration}. The tiles are sitting in {root}.",
            "Done in {duration}. The tiles are in {root}, waiting for you.",
            "All done in {duration}. Every tile is in {root}, exactly where it was promised.",
        ],
        yue: [
            "用咗 {duration} 完成。圖磚喺 {root}。",
            "用咗 {duration} 完成。圖磚喺 {root}。",
            "用咗 {duration} 完成。啲圖磚而家安安穩穩擺喺 {root}。",
            "{duration} 就搞掂。啲圖磚喺 {root} 度等緊你。",
            "{duration} 全部搞掂。每一塊圖磚都喺 {root}，一塊都冇走漏。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Notifications                                                     */
    /* ---------------------------------------------------------------- */

    "notices.centre.empty": {
        en: [
            "Nothing has been reported yet. Messages appear here after they leave the corner.",
            "Nothing has been reported yet. Messages appear here after they leave the corner.",
            "Nothing has been reported yet. Messages arrive here once they have left the corner of the screen.",
            "Nothing reported yet. Messages turn up here once they have finished their moment in the corner.",
            "Nothing reported yet, which is the good kind of empty. Messages turn up here once they are done sitting in the corner.",
        ],
        yue: [
            "而家未有任何通知。訊息離開角落之後就會喺呢度出現。",
            "而家未有任何通知。訊息離開角落之後就會喺呢度出現。",
            "而家未有任何通知。訊息喺畫面角落顯示完之後，就會嚟到呢度。",
            "而家乜通知都未有。訊息喺角落亮相完，就會嚟呢度落腳。",
            "而家乜通知都未有，呢種空係好嘅嗰種。訊息喺角落亮完相，就會嚟呢度落腳。",
        ],
    },
    "notices.centre.noMatch": {
        en: [
            "No notification matches this search and these levels.",
            "No notification matches this search and these levels.",
            "No notification matches this search and these levels together.",
            "Nothing matches this search and these levels at the same time.",
            "Nothing at all matches this search and these levels at the same time. Widen one of them.",
        ],
        yue: [
            "冇通知同時符合呢個搜尋同呢啲等級。",
            "冇通知同時符合呢個搜尋同呢啲等級。",
            "冇通知可以同時符合呢個搜尋同埋呢啲等級。",
            "冇一個通知可以同時過到呢個搜尋同呢啲等級呢兩關。",
            "冇一個通知可以同時過到呢個搜尋同呢啲等級呢兩關。放寬其中一樣啦。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The render wizard and the options editor                          */
    /* ---------------------------------------------------------------- */

    "world.options.someHidden": {
        en: [
            "Showing {shown} of {total} settings. {hidden} advanced ones are hidden.",
            "Showing {shown} of {total} settings. {hidden} advanced ones are hidden.",
            "Showing {shown} of {total} settings. The other {hidden} are advanced and hidden for now.",
            "{shown} of {total} settings on screen. The other {hidden} are advanced and tucked away.",
            "{shown} of {total} settings on screen. The other {hidden} are the advanced ones, tucked away until you ask for them.",
        ],
        yue: [
            "顯示緊 {total} 個設定入面嘅 {shown} 個。有 {hidden} 個進階設定隱藏咗。",
            "顯示緊 {total} 個設定入面嘅 {shown} 個。有 {hidden} 個進階設定隱藏咗。",
            "顯示緊 {total} 個設定入面嘅 {shown} 個。剩返嗰 {hidden} 個係進階設定，暫時收埋咗。",
            "畫面上有 {total} 個設定入面嘅 {shown} 個。另外 {hidden} 個係進階嘅，收埋咗先。",
            "畫面上有 {total} 個設定入面嘅 {shown} 個。另外嗰 {hidden} 個係進階設定，你唔開聲就繼續收埋。",
        ],
    },
    "world.review.carriedNote": {
        en: [
            "These {n} settings are written into the map config file below. The local engine writes its own config for a single render and reads the world, dimension, name, sort order, starting position and storage from it, so it does not pick these up yet. Copy the file out to keep them.",
            "These {n} settings are written into the map config file below. The local engine writes its own config for a single render and reads the world, dimension, name, sort order, starting position and storage from it, so it does not pick these up yet. Copy the file out to keep them.",
            "These {n} settings are written into the map config file below. The local engine writes its own config for a single render and reads only the world, dimension, name, sort order, starting position and storage from it, so it does not pick these up yet. Copy the file out if you want to keep them.",
            "These {n} settings go into the map config file below, and the local engine will walk straight past them. It writes its own config for a single render and reads only the world, dimension, name, sort order, starting position and storage. Copy the file out if you want to keep them.",
            "These {n} settings go into the map config file below, where the local engine will walk straight past them without so much as a glance. It writes its own config for a single render and reads only the world, dimension, name, sort order, starting position and storage. Copy the file out if you want to keep them.",
        ],
        yue: [
            "呢 {n} 個設定會寫入下面嘅地圖設定檔。本機引擎每次算圖都會自己寫一份設定，只會由入面讀取世界、維度、名稱、排序、起始位置同儲存空間，所以暫時唔會用到呢啲設定。想保留就將個檔案複製出去。",
            "呢 {n} 個設定會寫入下面嘅地圖設定檔。本機引擎每次算圖都會自己寫一份設定，只會由入面讀取世界、維度、名稱、排序、起始位置同儲存空間，所以暫時唔會用到呢啲設定。想保留就將個檔案複製出去。",
            "呢 {n} 個設定會寫入下面嘅地圖設定檔。本機引擎每次算圖都自己寫一份設定，淨係讀世界、維度、名稱、排序、起始位置同儲存空間，所以暫時唔會理呢啲設定。想保留就將個檔案複製出去。",
            "呢 {n} 個設定會入咗下面嘅地圖設定檔，而本機引擎會直接行過唔理佢哋。佢每次算圖都自己寫一份設定，淨係讀世界、維度、名稱、排序、起始位置同儲存空間。想保留就將個檔案複製出去。",
            "呢 {n} 個設定會入咗下面嘅地圖設定檔，而本機引擎會眼尾都唔望一眼咁行過。佢每次算圖都自己寫一份設定，淨係讀世界、維度、名稱、排序、起始位置同儲存空間。想保留就將個檔案複製出去。",
        ],
    },
    "world.resume.progressAt": {
        en: [
            "It reached {percent}%, at {what}.",
            "It reached {percent}%, at {what}.",
            "It got to {percent}%, at {what}.",
            "It got as far as {percent}%, at {what}.",
            "It got as far as {percent}% before it stopped, at {what}.",
        ],
        yue: [
            "佢去到 {percent}%，位置係 {what}。",
            "佢去到 {percent}%，位置係 {what}。",
            "佢做到 {percent}%，位置係 {what}。",
            "佢一路做到 {percent}%，停喺 {what}。",
            "佢一路做到 {percent}% 先停低，位置係 {what}。",
        ],
    },
    "config.field.inherited": {
        en: [
            "Not set in this file, so BlueMap uses {value}.",
            "Not set in this file, so BlueMap uses {value}.",
            "Not set in this file, so BlueMap falls back to {value}.",
            "This file says nothing about it, so BlueMap uses {value}.",
            "This file says nothing about it, so BlueMap quietly uses {value} instead.",
        ],
        yue: [
            "呢個檔案冇設定，所以 BlueMap 會用 {value}。",
            "呢個檔案冇設定，所以 BlueMap 會用 {value}。",
            "呢個檔案冇寫，所以 BlueMap 會退返去用 {value}。",
            "呢個檔案完全冇提過佢，所以 BlueMap 會用 {value}。",
            "呢個檔案隻字不提，所以 BlueMap 就靜靜雞用 {value}。",
        ],
    },
    "config.apply.reRenderBody": {
        en: [
            "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving does not start that render; it only changes the config.",
            "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving does not start that render; it only changes the config.",
            "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving does not start that render, it only changes the config.",
            "These maps need rendering again before the screen catches up with the file: {maps}. Saving will not start that render; it only changes the config.",
            "These maps need rendering again before the screen catches up with the file: {maps}. Saving does not start that render, it only rewrites the config and leaves the rest to you.",
        ],
        yue: [
            "以下地圖要重新算圖，你見到嘅先會同你儲存嘅一致：{maps}。儲存唔會開始算圖，只會改設定。",
            "以下地圖要重新算圖，你見到嘅先會同你儲存嘅一致：{maps}。儲存唔會開始算圖，只會改設定。",
            "以下地圖要重新算過圖，畫面先會追返上你儲存嘅內容：{maps}。儲存唔會開始算圖，佢淨係改設定。",
            "以下地圖要重新算過圖，畫面先追得返上個檔案：{maps}。儲存唔會幫你開始算圖，佢淨係改設定。",
            "以下地圖要重新算過圖，畫面先追得返上個檔案：{maps}。儲存唔會幫你開始算圖，佢淨係改寫設定，其餘留返俾你。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Credentials and permissions                                       */
    /* ---------------------------------------------------------------- */

    "config.keyValue.secretNote": {
        en: [
            "Values for {keys} are treated as credentials: masked here, left out of search, and never written to a log or an exported diagnostic.",
            "Values for {keys} are treated as credentials: masked here, left out of search, and never written to a log or an exported diagnostic.",
            "Values for {keys} are treated as credentials: masked on this screen, left out of search, and never written to a log or an exported diagnostic.",
            "Values for {keys} are treated as credentials. They are masked here, kept out of search, and never written to a log or an exported diagnostic.",
            "Values for {keys} are treated as credentials, and treated seriously: masked here, kept out of search, and never written to a log or an exported diagnostic.",
        ],
        yue: [
            "{keys} 嘅值會當成憑證處理：喺呢度遮蔽、唔會俾搜尋搵到，亦唔會寫入記錄檔或者匯出嘅診斷檔。",
            "{keys} 嘅值會當成憑證處理：喺呢度遮蔽、唔會俾搜尋搵到，亦唔會寫入記錄檔或者匯出嘅診斷檔。",
            "{keys} 嘅值會當成憑證嚟處理：喺呢個畫面遮蔽、唔入搜尋範圍，亦唔會寫入記錄檔或者匯出嘅診斷檔。",
            "{keys} 嘅值會當成憑證。喺呢度遮蔽咗、搜尋搵唔到、亦唔會寫入記錄檔或者匯出嘅診斷檔。",
            "{keys} 嘅值會當成憑證，而且係認真對待嗰種：喺呢度遮蔽、搜尋搵唔到、亦唔會寫入記錄檔或者匯出嘅診斷檔。",
        ],
    },
    "settings.github.tokenScopes": {
        en: [
            "The token needs these permissions: {scopes}.",
            "The token needs these permissions: {scopes}.",
            "The token needs these permissions: {scopes}.",
            "The token has to carry these permissions: {scopes}.",
            "The token has to carry these permissions, all of them: {scopes}.",
        ],
        yue: [
            "個權杖需要以下權限：{scopes}。",
            "個權杖需要以下權限：{scopes}。",
            "個權杖需要以下呢啲權限：{scopes}。",
            "個權杖一定要帶齊以下權限：{scopes}。",
            "個權杖一定要帶齊以下權限，一個都唔可以少：{scopes}。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Settings section explanations                                     */
    /* ---------------------------------------------------------------- */

    "settings.consent.description": {
        en: [
            "Whether this app may download Minecraft's own client files, which BlueMap needs for block textures and models. Answered once at first launch; this is where it is changed.",
            "Whether this app may download Minecraft's own client files, which BlueMap needs for block textures and models. Answered once at first launch; this is where it is changed.",
            "Whether this app may download Minecraft's own client files, which BlueMap needs for block textures and models. It is asked once at first launch, and this is where the answer is changed.",
            "Whether this app may fetch Minecraft's own client files, which BlueMap needs for block textures and models. Asked once at first launch, changed here whenever you like.",
            "Whether this app may fetch Minecraft's own client files, which BlueMap needs for block textures and models. Asked exactly once at first launch, and changed right here whenever you feel differently.",
        ],
        yue: [
            "呢個程式可唔可以下載 Minecraft 自己嘅客戶端檔案，BlueMap 要靠佢哋攞方塊材質同模型。第一次啟動嗰陣問過一次；喺呢度可以更改。",
            "呢個程式可唔可以下載 Minecraft 自己嘅客戶端檔案，BlueMap 要靠佢哋攞方塊材質同模型。第一次啟動嗰陣問過一次；喺呢度可以更改。",
            "呢個程式可唔可以下載 Minecraft 自己嘅客戶端檔案，BlueMap 要靠佢哋攞方塊材質同模型。第一次啟動嗰陣問過一次，而答案就喺呢度改。",
            "呢個程式可唔可以攞 Minecraft 自己嘅客戶端檔案，BlueMap 要靠佢哋做方塊材質同模型。第一次啟動問過一次，之後想幾時改都喺呢度改。",
            "呢個程式可唔可以攞 Minecraft 自己嘅客戶端檔案，BlueMap 要靠佢哋做方塊材質同模型。第一次啟動淨係問一次，之後你幾時轉軚都喺呢度改。",
        ],
    },
    "settings.java.description": {
        en: [
            "Local rendering runs on BlueMap's own Java engine, so the app needs a Java runtime. It looks at JAVA_HOME, then java on PATH, then the copy it installed for itself.",
            "Local rendering runs on BlueMap's own Java engine, so the app needs a Java runtime. It looks at JAVA_HOME, then java on PATH, then the copy it installed for itself.",
            "Local rendering runs on BlueMap's own Java engine, so the app needs a Java runtime. It looks at JAVA_HOME first, then java on PATH, then the copy it installed for itself.",
            "Local rendering runs on BlueMap's own Java engine, so a Java runtime has to exist. It checks JAVA_HOME first, then java on PATH, then the copy it installed for itself.",
            "Local rendering runs on BlueMap's own Java engine, so a Java runtime has to exist somewhere. It checks JAVA_HOME first, then java on PATH, and finally the copy it installed for itself.",
        ],
        yue: [
            "本機算圖行 BlueMap 自己嘅 Java 引擎，所以程式需要一個 Java 執行環境。佢會先睇 JAVA_HOME，再睇 PATH 上面嘅 java，最後先睇佢自己裝嗰份。",
            "本機算圖行 BlueMap 自己嘅 Java 引擎，所以程式需要一個 Java 執行環境。佢會先睇 JAVA_HOME，再睇 PATH 上面嘅 java，最後先睇佢自己裝嗰份。",
            "本機算圖行 BlueMap 自己嘅 Java 引擎，所以一定要有個 Java 執行環境。佢會先睇 JAVA_HOME，跟住 PATH 上面嘅 java，最後先至係佢自己裝嗰份。",
            "本機算圖行 BlueMap 自己嘅 Java 引擎，所以一定要有 Java 執行環境。佢會先查 JAVA_HOME，跟住查 PATH 上面嘅 java，最後先輪到佢自己裝嗰份。",
            "本機算圖行 BlueMap 自己嘅 Java 引擎，所以一定要有個 Java 執行環境喺度。佢會先查 JAVA_HOME，跟住查 PATH 上面嘅 java，最後先輪到佢自己裝嗰份。",
        ],
    },
    "settings.storage.description": {
        en: [
            "The folder every rendered map is written into. It must be a full path from the top of a drive, and it can hold a great many gigabytes of tiles.",
            "The folder every rendered map is written into. It must be a full path from the top of a drive, and it can hold a great many gigabytes of tiles.",
            "The folder every rendered map is written into. It has to be a full path from the top of a drive, and it can end up holding a great many gigabytes of tiles.",
            "The folder every rendered map lands in. It has to be a full path from the top of a drive, and it can end up holding a great many gigabytes of tiles.",
            "The folder every rendered map lands in. It has to be a full path from the top of a drive, and it can end up holding a great many gigabytes of tiles, so pick a drive with room.",
        ],
        yue: [
            "每一張算好嘅地圖都會寫入呢個資料夾。佢一定要係由磁碟最頂寫起嘅完整路徑，而且可以裝到好多 GB 嘅圖磚。",
            "每一張算好嘅地圖都會寫入呢個資料夾。佢一定要係由磁碟最頂寫起嘅完整路徑，而且可以裝到好多 GB 嘅圖磚。",
            "每一張算好嘅地圖都會寫入呢個資料夾。佢一定要係由磁碟最頂寫起嘅完整路徑，最後可以裝到好多 GB 嘅圖磚。",
            "每一張算好嘅地圖都會落喺呢個資料夾。佢一定要係由磁碟最頂寫起嘅完整路徑，最後可以裝到好多 GB 嘅圖磚。",
            "每一張算好嘅地圖都會落喺呢個資料夾。佢一定要係由磁碟最頂寫起嘅完整路徑，而且最後可以裝到好多 GB 嘅圖磚，所以揀隻夠位嘅碟。",
        ],
    },
    /*
     * The one entry in this file that describes the slider it is written for, which makes
     * it the one entry where a level that quietly drops a fact is self-refuting. Both facts
     * stay in all ten strings: that the two funny levels are separate settings rather than
     * one shared slider, and that the level reaches errors and warnings rather than stopping
     * at the cheerful copy. Somebody reading this at level 5 is reading it precisely because
     * they are about to turn the level up, so that is the worst possible moment to stop
     * mentioning which messages it will reach.
     */
    "settings.language.description": {
        en: [
            "Which language the app speaks, and how playful it is in each one. The two funny levels are separate settings, and the level styles every message including errors and warnings.",
            "Which language the app speaks, and how playful it is in each one. The two funny levels are separate settings, and the level styles every message including errors and warnings.",
            "Which language the app speaks, and how playful it is in each one. The two funny levels are separate settings rather than one shared slider, and the level styles every message, errors and warnings included.",
            "Which language the app talks in, and how cheeky it gets in each one. The two funny levels are separate settings, so English can stay deadpan while Cantonese does not, and the level reaches every message including errors and warnings.",
            "Which language the app talks in, and how cheeky it gets in each one. The two funny levels are separate settings, so English can keep a straight face while Cantonese goes off the rails, and the level reaches every last message, errors and warnings very much included.",
        ],
        yue: [
            "程式用邊種語言講嘢，同埋喺每種語言入面幾好玩。兩個搞笑程度係獨立設定，而個程度會影響每一句說話，包括錯誤同警告。",
            "程式用邊種語言講嘢，同埋喺每種語言入面幾好玩。兩個搞笑程度係獨立設定，而個程度會影響每一句說話，包括錯誤同警告。",
            "程式用邊種語言講嘢，同埋喺每種語言入面有幾好玩。兩個搞笑程度係各自獨立嘅設定，唔係共用一條拉桿，而個程度會影響每一句說話，錯誤同警告都計埋。",
            "程式用邊種語言同你傾偈，同埋喺每種語言入面幾抵死。兩個搞笑程度係分開嘅設定，所以英文可以好正經，廣東話可以好放，而個程度會去到每一句說話，包括錯誤同警告。",
            "程式用邊種語言同你傾偈，同埋喺每種語言入面幾抵死。兩個搞笑程度係分開嘅設定，所以英文可以扮晒正經，廣東話照樣癲，而個程度會去到每一句說話，錯誤同警告一句都走唔甩。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

/* -------------------------------------------------------------------------- */
/* FIXED: titles, buttons and the names of things                             */
/* -------------------------------------------------------------------------- */

export const APP_FIXED = {
    "settings.consent.title": { en: "Mojang download consent", yue: "Mojang 下載同意" },
    "settings.java.title": { en: "Java runtime", yue: "Java 執行環境" },
    "settings.storage.title": { en: "Where rendered maps go", yue: "算好嘅地圖去邊度" },
    "settings.github.title": { en: "GitHub account", yue: "GitHub 帳戶" },
    // Deliberately the same words as `language.settingsTitle` in the first-run catalogue,
    // because it names the same section: the settings surface and the setup flow are two
    // routes to one panel, and a heading that renamed itself depending on which route was
    // taken would read as two different settings.
    "settings.language.title": { en: "Language and tone", yue: "語言同語氣" },

    "world.folder.title": { en: "Choose a world", yue: "揀一個世界" },
    "world.identity.title": {
        en: "Name the map and pick its dimension",
        yue: "改個地圖名，再揀維度",
    },
    "world.options.title": { en: "How the map should look", yue: "地圖想點樣" },
    "world.review.title": { en: "What is about to happen", yue: "跟住會發生咩事" },
    "world.wizard.back": { en: "Back", yue: "上一步" },
    "world.wizard.next": { en: "Next", yue: "下一步" },
    "world.wizard.cancel": { en: "Cancel", yue: "取消" },
    "world.wizard.start": { en: "Render this map", yue: "開始算呢張圖" },

    "config.apply.title": { en: "Save the config folder", yue: "儲存設定資料夾" },
    "config.apply.cancel": { en: "Cancel", yue: "取消" },
    "config.shell.save": { en: "Save", yue: "儲存" },

    "notices.centre.title": { en: "Notification centre", yue: "通知中心" },
    "notices.centre.close": { en: "Close the notification centre", yue: "閂咗通知中心" },
    "notices.centre.copy": { en: "Copy what is shown", yue: "複製顯示緊嘅內容" },
    "notices.centre.detail": { en: "Details", yue: "詳情" },
    "notices.centre.search": { en: "Search notifications", yue: "搜尋通知" },
    "notices.centre.showAgain": { en: "Show again", yue: "再顯示一次" },
    "notices.centre.showing": { en: "Showing now", yue: "而家顯示緊" },
    "notices.centre.filterLevels": { en: "Filter by level", yue: "按等級篩選" },
    "notices.level.error": { en: "Errors", yue: "錯誤" },
    "notices.level.warning": { en: "Warnings", yue: "警告" },
    "notices.level.success": { en: "Successes", yue: "成功" },
    "notices.level.info": { en: "Information", yue: "資訊" },

    "superConfirm.exit": { en: "Emergency exit", yue: "緊急退出" },
    "superConfirm.keyOne": { en: "Key 1", yue: "鎖匙 1" },
    "superConfirm.keyTwo": { en: "Key 2", yue: "鎖匙 2" },
    "superConfirm.done": { en: "Authorized.", yue: "已授權。" },
} as const satisfies Record<string, FixedString>;

/* -------------------------------------------------------------------------- */
/* FACTS: what every level of an entry has to keep saying                     */
/* -------------------------------------------------------------------------- */

/**
 * Literal substrings that must appear in every one of an entry's ten strings.
 *
 * The placeholder check next door is automatic and covers the interpolated facts: the
 * path, the count, the folder. This table covers the facts that are *words* rather than
 * values, and which a playful rewrite is genuinely tempted to drop: that a delete cannot
 * be undone, that the already-rendered tiles are NOT deleted, that a value is treated as a
 * credential and kept out of logs, that the missing file is called `level.dat`.
 *
 * Both languages are listed separately because the fact is the same and the words for it
 * are not. Identifiers appear in both lists unchanged, which is the point: `level.dat` is
 * `level.dat` in Cantonese too.
 */
export const FACTS = {
    "config.maps.deleteAction": {
        en: ["{path}", "config folder", "undo"],
        yue: ["{path}", "設定資料夾", "復原"],
    },
    "config.maps.deleteTiles": {
        en: ["{storage}", "NOT deleted", "BlueMap"],
        yue: ["{storage}", "唔會刪", "BlueMap"],
    },
    "config.storages.deleteAction": {
        en: ["{path}", "config folder"],
        yue: ["{path}", "設定資料夾"],
    },
    "config.storages.deleteBreaks": {
        en: ["{maps}", "stop loading"],
        yue: ["{maps}", "載入唔到"],
    },
    "superConfirm.keys": { en: ["keys", "slider"], yue: ["鎖匙", "拉桿"] },
    "superConfirm.locked": { en: ["keys", "slider"], yue: ["鎖匙", "拉桿"] },
    // "Armed" is the state *after* the keys, so the fact it has to keep carrying is the
    // slider and where it has to go, not the keys that are already turned.
    "superConfirm.armed": { en: ["slider", "end"], yue: ["拉桿", "盡頭"] },

    "world.folder.noLevelDat": {
        en: ["{folder}", "level.dat", "Minecraft"],
        yue: ["{folder}", "level.dat", "Minecraft"],
    },
    "world.folder.noRegionData": {
        // Singular, so it matches both "no region files" and "not a single region file".
        en: ["{folder}", "region file", "nothing to render"],
        yue: ["{folder}", "區域檔案", "冇嘢可以算圖"],
    },
    "world.folder.savesFolder": { en: ["{worlds}"], yue: ["{worlds}"] },
    "config.shell.openFailed": { en: ["{folder}"], yue: ["{folder}"] },
    "config.maps.idTaken": { en: ["{id}", "BlueMap"], yue: ["{id}", "BlueMap"] },
    "config.maps.nameTaken": { en: ["maps/{name}.conf"], yue: ["maps/{name}.conf"] },
    "config.keyValue.duplicate": { en: ["{key}"], yue: ["{key}"] },
    "settings.java.notFound": { en: ["Java {required}"], yue: ["Java {required}"] },
    "settings.storage.relative": {
        en: ["{example}", "full path"],
        yue: ["{example}", "完整路徑"],
    },
    "downloads.listFailed": { en: ["{message}"], yue: ["{message}"] },

    "config.shell.saved": {
        en: ["{writes}", "{deletes}", "{folder}"],
        yue: ["{writes}", "{deletes}", "{folder}"],
    },
    "config.saved": { en: ["{folder}", "BlueMap"], yue: ["{folder}", "BlueMap"] },
    "settings.storage.saved": { en: ["{path}"], yue: ["{path}"] },
    "world.run.finishedLine": { en: ["{duration}", "{root}"], yue: ["{duration}", "{root}"] },

    "notices.centre.empty": { en: ["corner"], yue: ["角落"] },
    "notices.centre.noMatch": { en: ["search"], yue: ["搜尋"] },

    "world.options.someHidden": {
        en: ["{shown}", "{total}", "{hidden}", "advanced"],
        yue: ["{shown}", "{total}", "{hidden}", "進階"],
    },
    "world.review.carriedNote": {
        en: ["{n}", "map config file", "Copy the file out"],
        yue: ["{n}", "地圖設定檔", "複製出去"],
    },
    "world.resume.progressAt": { en: ["{percent}", "{what}"], yue: ["{percent}", "{what}"] },
    "config.field.inherited": { en: ["{value}", "BlueMap"], yue: ["{value}", "BlueMap"] },
    "config.apply.reRenderBody": {
        en: ["{maps}", "render", "config"],
        yue: ["{maps}", "算圖", "設定"],
    },

    "config.keyValue.secretNote": {
        en: ["{keys}", "credentials", "masked", "never written to a log"],
        yue: ["{keys}", "憑證", "遮蔽", "唔會寫入記錄檔"],
    },
    "settings.github.tokenScopes": {
        en: ["{scopes}", "permissions"],
        yue: ["{scopes}", "權限"],
    },

    "settings.consent.description": {
        en: ["Minecraft", "BlueMap", "first launch"],
        yue: ["Minecraft", "BlueMap", "第一次啟動"],
    },
    "settings.java.description": {
        en: ["JAVA_HOME", "PATH", "BlueMap"],
        yue: ["JAVA_HOME", "PATH", "BlueMap"],
    },
    "settings.storage.description": {
        en: ["full path", "gigabytes"],
        yue: ["完整路徑", "GB"],
    },
    // The disclosure the contract asks for, pinned here so a playful rewrite cannot quietly
    // drop it: the level is two settings rather than one, and it reaches errors and warnings.
    // A description that stopped saying the second part would be the funny level hiding its
    // own reach from the person deciding how far to push it.
    "settings.language.description": {
        en: ["funny levels", "errors and warnings"],
        yue: ["搞笑程度", "錯誤同警告"],
    },
} as const satisfies Record<AppVoicedKey, { en: readonly string[]; yue: readonly string[] }>;

export type AppVoicedKey = keyof typeof APP_VOICED;
export type AppFixedKey = keyof typeof APP_FIXED;
export type AppCopyKey = AppVoicedKey | AppFixedKey;

export function isAppVoicedKey(key: string): key is AppVoicedKey {
    return Object.prototype.hasOwnProperty.call(APP_VOICED, key);
}

export function isAppFixedKey(key: string): key is AppFixedKey {
    return Object.prototype.hasOwnProperty.call(APP_FIXED, key);
}

export function appVoicedKeys(): readonly AppVoicedKey[] {
    return Object.keys(APP_VOICED) as AppVoicedKey[];
}

export function appFixedKeys(): readonly AppFixedKey[] {
    return Object.keys(APP_FIXED) as AppFixedKey[];
}

/** Every key this catalogue answers for, voiced and fixed alike. */
export function appCopyKeys(): readonly AppCopyKey[] {
    return [...appVoicedKeys(), ...appFixedKeys()];
}
