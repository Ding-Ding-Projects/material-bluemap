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
import { SURFACE_FACTS, SURFACE_FIXED, SURFACE_VOICED } from "./surfaces/index.js";

/* -------------------------------------------------------------------------- */
/* VOICED: five levels per language                                           */
/* -------------------------------------------------------------------------- */

export const APP_VOICED = {
    /*
     * One module per screen, in `surfaces/`. They are spread first so that anything written
     * directly below wins a collision, which keeps this file's own entries authoritative
     * while the surface modules grow underneath them.
     */
    ...SURFACE_VOICED,

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
            "No notification matches this search, these levels and this date range.",
            "No notification matches this search, these levels and this date range.",
            "No notification matches this search, these levels and this date range, all together.",
            "Nothing matches this search, these levels and this date range at the same time.",
            "Nothing at all matches this search, these levels and this date range at the same time. Widen one of them.",
        ],
        yue: [
            "冇通知同時符合呢個搜尋、呢啲等級同埋呢個日期範圍。",
            "冇通知同時符合呢個搜尋、呢啲等級同埋呢個日期範圍。",
            "冇通知可以同時符合呢個搜尋、呢啲等級同埋呢個日期範圍。",
            "冇一個通知可以同時過到呢個搜尋、呢啲等級同呢個日期範圍呢三關。",
            "冇一個通知可以同時過到呢個搜尋、呢啲等級同呢個日期範圍呢三關。放寬其中一樣啦。",
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
    "settings.java.provisionExplain": {
        en: [
            "Downloads and installs Eclipse Temurin (roughly 140 MB) from Adoptium's own servers, into this app's own data folder. Nothing is installed system-wide, PATH is not touched, and no administrator rights are needed.",
            "Downloads and installs Eclipse Temurin (roughly 140 MB) from Adoptium's own servers, into this app's own data folder. Nothing is installed system-wide, PATH is not touched, and no administrator rights are needed.",
            "Downloads and installs Eclipse Temurin (roughly 140 MB) from Adoptium's own servers, into this app's own data folder. Nothing is installed system-wide, PATH stays untouched, and no administrator rights are needed.",
            "Fetches Eclipse Temurin (roughly 140 MB) straight from Adoptium's own servers and installs it into this app's own data folder, nowhere else. Nothing system-wide, PATH untouched, no administrator rights asked for.",
            "Fetches Eclipse Temurin (roughly 140 MB) straight from Adoptium's own servers and tucks it away in this app's own data folder, nowhere else on the machine. Nothing system-wide, PATH untouched, and not one administrator right requested.",
        ],
        yue: [
            "會由 Adoptium 自己嘅伺服器下載並安裝 Eclipse Temurin（大約 140 MB），裝入呢個程式自己嘅資料夾。唔會裝到成部機都係，PATH 都唔會郁，亦都唔使管理員權限。",
            "會由 Adoptium 自己嘅伺服器下載並安裝 Eclipse Temurin（大約 140 MB），裝入呢個程式自己嘅資料夾。唔會裝到成部機都係，PATH 都唔會郁，亦都唔使管理員權限。",
            "會由 Adoptium 自己嘅伺服器下載並安裝 Eclipse Temurin（大約 140 MB），淨係裝入呢個程式自己嘅資料夾。唔會裝到成部機都係，PATH 唔會俾佢郁，亦都唔使管理員權限。",
            "由 Adoptium 自己嘅伺服器攞返 Eclipse Temurin（大約 140 MB），裝落呢個程式自己嗰個資料夾，第度乜都冇。唔會裝到成部機都係，PATH 冇郁過，管理員權限一個都唔使。",
            "由 Adoptium 自己嘅伺服器攞返 Eclipse Temurin（大約 140 MB），靜靜雞收埋喺呢個程式自己嗰個資料夾，成部機第度乜痕跡都冇。唔會裝到成部機都係，PATH 一條毛都冇郁過，管理員權限更加一個都冇問過你要。",
        ],
    },
    "settings.dependencies.description": {
        en: [
            "Install git, the GitHub CLI, Docker Desktop and rsync through Windows's own package managers, winget or Chocolatey. Each one is real system software, not a private copy for this app alone, so most of them will ask Windows for administrator permission, always disclosed here before the button is pressed.",
            "Install git, the GitHub CLI, Docker Desktop and rsync through Windows's own package managers, winget or Chocolatey. Each one is real system software, not a private copy for this app alone, so most of them will ask Windows for administrator permission, always disclosed here before the button is pressed.",
            "Install git, the GitHub CLI, Docker Desktop and rsync through Windows's own package managers, winget or Chocolatey. Each one is real system software rather than a private copy for this app alone, so most of them ask Windows for administrator permission, always disclosed here before the button is pressed.",
            "Install git, the GitHub CLI, Docker Desktop and rsync the proper way, through Windows's own winget or Chocolatey rather than a private copy nothing else could use. Most of them ask Windows for administrator permission along the way, and that is always disclosed here before the button is pressed.",
            "Install git, the GitHub CLI, Docker Desktop and rsync the honest way, through Windows's own winget or Chocolatey, not a private stash nothing else on the machine could touch. Most of them get Windows asking about administrator permission, and that conversation always happens here before the button is pressed.",
        ],
        yue: [
            "透過 Windows 自己嘅套件管理員（winget 或者 Chocolatey）裝 git、GitHub CLI、Docker Desktop 同 rsync。個個都係真.系統軟件，唔係淨係呢個app私家用嘅一份，所以大部分都會問Windows攞管理員權限，一定喺撳掣之前講清楚。",
            "透過 Windows 自己嘅套件管理員（winget 或者 Chocolatey）裝 git、GitHub CLI、Docker Desktop 同 rsync。個個都係真.系統軟件，唔係淨係呢個app私家用嘅一份，所以大部分都會問Windows攞管理員權限，一定喺撳掣之前講清楚。",
            "透過 Windows 自己嘅winget或者Chocolatey裝返git、GitHub CLI、Docker Desktop同rsync。個個都係真.系統軟件，唔係私家版本，所以大部分都會問Windows攞管理員權限，一定喺撳掣之前講咗先。",
            "行正路用返Windows自己嘅winget或者Chocolatey裝git、GitHub CLI、Docker Desktop同rsync，唔係第啲用唔到嘅私家版本。大部分都會惹到Windows問攞管理員權限，而呢段對話一定喺撳掣之前傾晒。",
            "老老實實用返Windows自己嘅winget或者Chocolatey裝git、GitHub CLI、Docker Desktop同rsync，唔係呢部機第度乜都摸唔到嘅私家貨。大部分都會引到Windows埋嚟問攞管理員權限，而呢段對話一定喺撳掣之前就傾完。",
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
    /* ---------------------------------------------------------------- */
    /* Publishing a rendered map to GitHub Pages                        */
    /* ---------------------------------------------------------------- */

    "pages.pitch": {
        en: [
            "A finished render is served from this computer, at an address only this computer can open. This publishes it to GitHub Pages instead: a real address anybody can open, hosted for free, and still only files.",
            "A finished render is served from this computer, at an address only this computer can open. This publishes it to GitHub Pages instead: a real address anybody can open, hosted for free, and still only files.",
            "A finished render is served from this computer, at an address only this computer can open. This puts it on GitHub Pages instead: a real address anybody can open, hosted for free, and still nothing but files.",
            "Right now your map lives at an address only this computer can reach, which is not much of a map to show anyone. This moves it to GitHub Pages: a real address, open to anybody, free, and still nothing but files.",
            "Right now your map lives at an address only this computer can reach, which makes showing it to a friend a bit of a party trick involving your router. This puts it on GitHub Pages instead: a real address, open to anybody, free, and still nothing cleverer than files.",
        ],
        yue: [
            "算好嘅地圖而家由呢部電腦提供，個網址亦都只有呢部電腦開得到。呢個功能會改為發佈到 GitHub Pages：一個真正嘅網址，人人都開得到，免費，而且照樣只係一堆檔案。",
            "算好嘅地圖而家由呢部電腦提供，個網址亦都只有呢部電腦開得到。呢個功能會改為發佈到 GitHub Pages：一個真正嘅網址，人人都開得到，免費，而且照樣只係一堆檔案。",
            "算好嘅地圖而家由呢部電腦自己派，個網址亦都淨係呢部電腦開得到。呢度會改為擺上 GitHub Pages：一個真網址，個個都開得到，免費，而且依然淨係檔案。",
            "你張圖而家住喺一個淨係呢部電腦入得到嘅網址，想俾朋友睇都幾麻煩。呢個功能會搬佢上 GitHub Pages：真網址，人人入得，免費，而且都係一堆檔案咁簡單。",
            "你張圖而家匿埋喺一個淨係呢部電腦入得到嘅網址，想俾朋友睇就要同你部路由器搏鬥。呢個功能直接搬佢上 GitHub Pages：真網址，個個入得，免費，而且冇乜大道理，都係一堆檔案。",
        ],
    },
    "pages.caveats": {
        en: [
            "The trade-offs, plainly: every tile is pushed, which is gigabytes across tens of thousands of files for a large map; GitHub asks Pages sites to stay under 1 GB and refuses any single file over 100 MB; and Pages on a private repository needs a paid plan. A public repository means anybody who finds the address can download the whole map.",
            "The trade-offs, plainly: every tile is pushed, which is gigabytes across tens of thousands of files for a large map; GitHub asks Pages sites to stay under 1 GB and refuses any single file over 100 MB; and Pages on a private repository needs a paid plan. A public repository means anybody who finds the address can download the whole map.",
            "The trade-offs, stated rather than buried: every tile is pushed, which for a large map is gigabytes spread over tens of thousands of files; GitHub asks Pages sites to stay under 1 GB and refuses any single file over 100 MB; and Pages on a private repository needs a paid plan. A public repository means anybody who finds the address can download the whole map.",
            "The catches, up front rather than in a footnote: every tile goes up, which for a big map is gigabytes across tens of thousands of files; GitHub would like Pages sites to stay under 1 GB and flatly refuses any single file over 100 MB; and Pages on a private repository needs a paid plan. A public repository means anybody who finds the address can help themselves to the whole map.",
            "The catches, up front rather than hidden in a footnote nobody reads: every single tile goes up, which for a big map is gigabytes spread across tens of thousands of tiny files; GitHub politely asks that Pages sites stay under 1 GB and point blank refuses any one file over 100 MB; and Pages on a private repository needs a paid plan. A public repository means anybody who stumbles on the address can help themselves to the entire map.",
        ],
        yue: [
            "代價講清楚：所有圖磚都會上傳，大張圖即係幾 GB、幾萬個檔案；GitHub 要求 Pages 網站保持喺 1 GB 以下，而且拒絕任何單一檔案超過 100 MB；私人 repository 用 Pages 要俾錢嘅方案。公開 repository 即係任何人搵到個網址都可以下載成張圖。",
            "代價講清楚：所有圖磚都會上傳，大張圖即係幾 GB、幾萬個檔案；GitHub 要求 Pages 網站保持喺 1 GB 以下，而且拒絕任何單一檔案超過 100 MB；私人 repository 用 Pages 要俾錢嘅方案。公開 repository 即係任何人搵到個網址都可以下載成張圖。",
            "代價擺明講，唔會匿埋：所有圖磚都要上傳，大張圖即係幾 GB 散落喺幾萬個檔案度；GitHub 要求 Pages 網站保持喺 1 GB 以下，亦都拒絕任何單一檔案超過 100 MB；私人 repository 想用 Pages 就要俾錢嘅方案。公開 repository 即係邊個搵到個網址都下載到成張圖。",
            "醜話講喺前頭，唔會塞落註腳：每一塊圖磚都要上去，大張圖即係幾 GB 攤喺幾萬個細檔案度；GitHub 好想 Pages 網站企喺 1 GB 以下，而單一檔案超過 100 MB 就直接拒絕；私人 repository 想開 Pages 就要俾錢嘅方案。公開嘅意思係，邊個撞到個網址都可以搬走成張圖。",
            "醜話講喺前頭，唔會塞落冇人睇嘅註腳：每一塊圖磚都要上去，大張圖即係幾 GB 攤喺幾萬個超細檔案度；GitHub 好客氣咁請你 Pages 網站企喺 1 GB 以下，但單一檔案超過 100 MB 就一句廢話都冇咁拒絕；私人 repository 想開 Pages 就要俾錢嘅方案。公開嘅意思係，邊個撞啱個網址都可以整張圖搬走。",
        ],
    },
    "pages.decompression": {
        en: [
            "The viewer will be set to decompress tiles itself, because a static host cannot do it. That is the one setting publishing changes, and it is written into the render's own settings.json.",
            "The viewer will be set to decompress tiles itself, because a static host cannot do it. That is the one setting publishing changes, and it is written into the render's own settings.json.",
            "The viewer will be set to decompress the tiles itself, because a static host cannot do it for us. That is the one setting publishing changes, and it is written into this render's own settings.json.",
            "The viewer gets told to decompress the tiles itself, because a static host will not do it on the way out. That is the only setting publishing touches, and it goes into this render's own settings.json.",
            "The viewer gets told to unpack the tiles itself, because a static host hands over whatever file it was given and asks no questions. That is the only setting publishing touches, and it lands in this render's own settings.json.",
        ],
        yue: [
            "檢視器會設定為自己解壓圖磚，因為靜態主機做唔到呢件事。呢個係發佈唯一會改嘅設定，會寫入呢次算圖自己嘅 settings.json。",
            "檢視器會設定為自己解壓圖磚，因為靜態主機做唔到呢件事。呢個係發佈唯一會改嘅設定，會寫入呢次算圖自己嘅 settings.json。",
            "檢視器會設定成自己解壓圖磚，因為靜態主機唔會幫我哋做。呢個係發佈唯一會改嘅設定，會寫入呢次算圖本身嘅 settings.json。",
            "檢視器會被叫去自己解壓圖磚，因為靜態主機出檔案嗰陣唔會幫你拆。呢個係發佈唯一會郁嘅設定，寫入呢次算圖自己嘅 settings.json。",
            "檢視器會被叫去自己拆圖磚，因為靜態主機收到咩檔案就派咩檔案，一句都唔會問。呢個係發佈唯一會郁嘅設定，最後會落喺呢次算圖自己嘅 settings.json。",
        ],
    },
    "pages.size": {
        en: [
            "{size} across {files} files would be pushed.",
            "{size} across {files} files would be pushed.",
            "{size} spread across {files} files would be pushed.",
            "{size} spread across {files} separate files is what would go up.",
            "{size} spread across {files} separate little files is what would go up, one at a time, in its own good time.",
        ],
        yue: [
            "會上傳 {size}，分佈喺 {files} 個檔案。",
            "會上傳 {size}，分佈喺 {files} 個檔案。",
            "會上傳 {size}，攤喺 {files} 個檔案度。",
            "要上去嘅係 {size}，攤喺 {files} 個檔案度。",
            "要上去嘅係 {size}，攤喺 {files} 個細檔案度，一個一個慢慢行。",
        ],
    },
    "pages.published.size": {
        en: [
            "{size} across {files} files.",
            "{size} across {files} files.",
            "{size} spread across {files} files.",
            "{size}, spread across {files} separate files.",
            "{size}, spread across {files} separate files, every one of them now somebody else's problem to host.",
        ],
        yue: [
            "{size}，分佈喺 {files} 個檔案。",
            "{size}，分佈喺 {files} 個檔案。",
            "{size}，攤喺 {files} 個檔案度。",
            "{size}，攤喺 {files} 個檔案度。",
            "{size}，攤喺 {files} 個檔案度，而家全部都係人哋幫你擺緊。",
        ],
    },
    /*
     * The radio list a beginner meets before ever choosing a repository: it needs to say
     * what fills it in (a rendered map) and why (so one can be picked to publish) before
     * "there is nothing here" reads as a next step rather than a wall. "Make a map first"
     * is pinned verbatim because it is the one phrase that names the actual escape route.
     */
    "pages.renders.empty": {
        en: [
            "This is the list of maps rendered on this computer, so one can be chosen to publish. There is nothing rendered here yet. Make a map first, then come back.",
            "This is the list of maps rendered on this computer, so one can be chosen to publish. There is nothing rendered here yet. Make a map first, then come back.",
            "This is the list of maps rendered on this computer, so one can be chosen to publish, and there is nothing rendered here yet. Make a map first, then come back here.",
            "This lists the maps rendered on this computer, so one of them can be published, and there is nothing rendered here yet. Make a map first, then come back.",
            "This lists the maps rendered on this computer, so one of them can be published, and there is nothing rendered here yet, not so much as a single tile. Make a map first, then come back and we will talk it over.",
        ],
        yue: [
            "呢度會列出喺呢部電腦算好嘅地圖，等你揀一張出嚟發佈。而家仲未算過任何地圖。請先整一張圖，再返嚟。",
            "呢度會列出喺呢部電腦算好嘅地圖，等你揀一張出嚟發佈。而家仲未算過任何地圖。請先整一張圖，再返嚟。",
            "呢度會列出喺呢部電腦算好嘅地圖，等你揀一張出嚟發佈，而家仲未算過任何地圖。請先整一張圖，再返嚟呢度。",
            "呢度會列出喺呢部電腦算好嘅地圖，等你揀一張出嚟發佈，而家仲未算過任何地圖。請先整一張圖，再返嚟。",
            "呢度會列出喺呢部電腦算好嘅地圖，等你揀一張出嚟發佈，而家仲未算過任何地圖，一嚿圖磚都未有。請先整一張圖，再返嚟慢慢傾。",
        ],
    },
    /*
     * The card that lists sites this computer already published, always on screen now
     * rather than only after the first publish -- see `PagesScreen.vue` for why an
     * always-hidden-until-nonempty card teaches nothing. Both halves of what the card is
     * for are pinned: a published map lands here on its own, and it can be reopened or
     * taken down from here.
     */
    "pages.hosted.empty": {
        en: [
            "Nothing has been published from this computer yet. Once a map above is pushed to GitHub Pages, it appears here with its address, so it can be reopened or taken down.",
            "Nothing has been published from this computer yet. Once a map above is pushed to GitHub Pages, it appears here with its address, so it can be reopened or taken down.",
            "Nothing has been published from this computer yet. Once a map above is pushed to GitHub Pages, it appears here with its address, ready to be reopened or taken down.",
            "Nothing published from this computer yet, not one map. Once a map above is pushed to GitHub Pages, it turns up here with its address, ready to be reopened or taken down.",
            "Nothing published from this computer yet, not one map, not one byte. Once a map above is pushed to GitHub Pages, it turns up here with its address, all set to be reopened or taken down whenever you like.",
        ],
        yue: [
            "呢部電腦而家仲未發佈過任何地圖。上面嗰張圖一推咗上 GitHub Pages，就會喺呢度出現埋佢個網址，可以隨時打開返或者落架。",
            "呢部電腦而家仲未發佈過任何地圖。上面嗰張圖一推咗上 GitHub Pages，就會喺呢度出現埋佢個網址，可以隨時打開返或者落架。",
            "呢部電腦而家仲未發佈過任何地圖。上面嗰張圖一推咗上 GitHub Pages，就會喺呢度出現埋佢個網址，隨時可以打開返或者落架。",
            "呢部電腦而家仲未發佈過任何地圖，一張都未有。上面嗰張圖一推咗上 GitHub Pages，就會喺呢度冒出嚟，帶埋個網址，隨時可以打開返或者落架。",
            "呢部電腦而家仲未發佈過任何地圖，一張都未有，一個位元組都未上網。上面嗰張圖一推咗上 GitHub Pages，就會喺呢度彈出嚟，帶埋個網址，隨時任你打開返或者落架。",
        ],
    },
    "pages.ack": {
        en: [
            "I understand this pushes the whole map and replaces whatever is on that branch.",
            "I understand this pushes the whole map and replaces whatever is on that branch.",
            "I understand this pushes the whole map, and replaces whatever is currently on that branch.",
            "Yes: push the whole map, and replace whatever is sitting on that branch right now.",
            "Yes: push the whole map, and replace whatever is sitting on that branch right now, no questions asked afterwards.",
        ],
        yue: [
            "我明白呢個操作會上傳成張地圖，並且取代嗰個分支上面原有嘅內容。",
            "我明白呢個操作會上傳成張地圖，並且取代嗰個分支上面原有嘅內容。",
            "我明白呢個操作會上傳成張地圖，亦都會取代嗰個分支而家有嘅嘢。",
            "係：上傳成張地圖，同埋取代而家坐喺嗰個分支上面嘅嘢。",
            "係：上傳成張地圖，同埋取代而家坐喺嗰個分支上面嘅嘢，之後唔會再問多次。",
        ],
    },
    "pages.blocked.acknowledge": {
        en: [
            "Confirm that you mean to publish this map, replacing whatever is on that branch.",
            "Confirm that you mean to publish this map, replacing whatever is on that branch.",
            "Confirm that you do mean to publish this map, replacing whatever is on that branch.",
            "Tick the box: you do mean to publish this map, replacing whatever is on that branch.",
            "Tick the box before anything moves: you really do mean to publish this map, replacing whatever is on that branch.",
        ],
        yue: [
            "請確認你係想發佈呢張地圖，並且取代嗰個分支上面嘅內容。",
            "請確認你係想發佈呢張地圖，並且取代嗰個分支上面嘅內容。",
            "請確認你的確想發佈呢張地圖，亦都會取代嗰個分支上面嘅內容。",
            "剔咗個格先：你係真係想發佈呢張地圖，同埋取代嗰個分支上面嘅內容。",
            "郁之前剔咗個格先：你係真心想發佈呢張地圖，並且取代嗰個分支上面嘅內容。",
        ],
    },
    "pages.oversized": {
        en: [
            "{path} is past GitHub's 100 MB per-file limit and cannot be pushed at all.",
            "{path} is past GitHub's 100 MB per-file limit and cannot be pushed at all.",
            "{path} is past GitHub's 100 MB per-file limit, so it cannot be pushed at all.",
            "{path} is over GitHub's 100 MB per-file limit, so it cannot be pushed at all, no matter what else is true.",
            "{path} sails straight past GitHub's 100 MB per-file limit, so it cannot be pushed at all, however politely anyone asks.",
        ],
        yue: [
            "{path} 超出咗 GitHub 每個檔案 100 MB 嘅上限，根本上傳唔到。",
            "{path} 超出咗 GitHub 每個檔案 100 MB 嘅上限，根本上傳唔到。",
            "{path} 超出咗 GitHub 每個檔案 100 MB 嘅上限，所以完全上傳唔到。",
            "{path} 過咗 GitHub 每個檔案 100 MB 嘅上限，所以無論如何都上傳唔到。",
            "{path} 一嘢衝爆咗 GitHub 每個檔案 100 MB 嘅上限，所以幾好聲好氣求都上傳唔到。",
        ],
    },
    "pages.status.live": {
        en: [
            "Live, and answering",
            "Live, and answering",
            "Live: the address answered",
            "Live. The address was opened and it answered",
            "Live. The address was actually opened and it actually answered, which is more than most status lights can claim",
        ],
        yue: [
            "已上線，而且有回應",
            "已上線，而且有回應",
            "已上線：個網址有回應",
            "已上線。個網址開過，而且有回應",
            "已上線。個網址真係開過，亦都真係有回應，呢句唔係靠估嘅",
        ],
    },
    "pages.status.built": {
        en: [
            "GitHub says built, but the address did not answer yet",
            "GitHub says built, but the address did not answer yet",
            "GitHub says built, but the address has not answered yet",
            "GitHub says built. The address has not answered yet, so this is not being called live",
            "GitHub says built, which is GitHub's opinion. The address has not answered yet, so nobody here is calling it live",
        ],
        yue: [
            "GitHub 話已經建立好，但係個網址仲未有回應",
            "GitHub 話已經建立好，但係個網址仲未有回應",
            "GitHub 話已經建立好，不過個網址到而家都未有回應",
            "GitHub 話已經建立好。個網址仲未有回應，所以呢度唔會當佢上線",
            "GitHub 話已經建立好，嗰個係 GitHub 嘅講法。個網址仲未有回應，所以呢度冇人夠膽當佢上線",
        ],
    },
    "pages.pushUnverified": {
        en: [
            "The push reported success but GitHub does not yet show that commit on the branch, so it is reported as unverified rather than as landed.",
            "The push reported success but GitHub does not yet show that commit on the branch, so it is reported as unverified rather than as landed.",
            "The push reported success, but GitHub does not yet show that commit on the branch, so it is reported as unverified rather than as landed.",
            "The push said it worked, but GitHub does not show that commit on the branch yet, so it is reported as unverified rather than as landed.",
            "The push said it worked. GitHub does not show that commit on the branch yet, and one of them is wrong, so it is reported as unverified rather than as landed.",
        ],
        yue: [
            "推送報告成功，但係 GitHub 仲未喺個分支上面顯示到嗰個 commit，所以呢度報告為未經核實，而唔係已經完成。",
            "推送報告成功，但係 GitHub 仲未喺個分支上面顯示到嗰個 commit，所以呢度報告為未經核實，而唔係已經完成。",
            "推送話成功，不過 GitHub 到而家都未喺個分支上面顯示到嗰個 commit，所以呢度報告為未經核實，而唔係已經完成。",
            "推送話搞掂咗，但 GitHub 個分支上面仲未見到嗰個 commit，所以呢度報告為未經核實，而唔係已經完成。",
            "推送話搞掂咗。GitHub 個分支上面仲未見到嗰個 commit，兩者總有一個講錯，所以呢度報告為未經核實，而唔係已經完成。",
        ],
    },
    "pages.stop.action": {
        en: [
            "GitHub Pages will be turned off for {owner}/{repo} and the {branch} branch will be deleted. The address stops working immediately. The render on this computer is not touched, and neither is anything else in that repository.",
            "GitHub Pages will be turned off for {owner}/{repo} and the {branch} branch will be deleted. The address stops working immediately. The render on this computer is not touched, and neither is anything else in that repository.",
            "GitHub Pages will be turned off for {owner}/{repo}, and the {branch} branch will be deleted. The address stops working immediately. The render on this computer is not touched, and nothing else in that repository is either.",
            "Pages goes off for {owner}/{repo} and the {branch} branch is deleted. The address stops working straight away. The render on this computer is not touched, and nothing else in that repository is either.",
            "Pages goes off for {owner}/{repo} and the {branch} branch is deleted outright. The address stops working straight away, with no grace period and no forwarding note. The render on this computer is not touched, and nothing else in that repository is either.",
        ],
        yue: [
            "{owner}/{repo} 嘅 GitHub Pages 會關閉，{branch} 分支會被刪除。個網址會即刻失效。呢部電腦上面算好嘅圖唔會被郁到，嗰個 repository 其他嘢亦都唔會。",
            "{owner}/{repo} 嘅 GitHub Pages 會關閉，{branch} 分支會被刪除。個網址會即刻失效。呢部電腦上面算好嘅圖唔會被郁到，嗰個 repository 其他嘢亦都唔會。",
            "{owner}/{repo} 嘅 GitHub Pages 會關閉，而 {branch} 分支會被刪除。個網址會即刻失效。呢部電腦上面算好嘅圖唔會被郁到，嗰個 repository 其他嘢亦都唔會。",
            "{owner}/{repo} 嘅 Pages 會熄咗，{branch} 分支會刪除。個網址即刻失效。呢部電腦上面算好嘅圖唔會被郁到，嗰個 repository 其他嘢亦都唔會。",
            "{owner}/{repo} 嘅 Pages 會熄咗，{branch} 分支會直接刪除。個網址即刻失效，冇緩衝期，亦都唔會留張紙條話搬咗去邊。呢部電腦上面算好嘅圖唔會被郁到，嗰個 repository 其他嘢亦都唔會。",
        ],
    },
    "pages.notice.live": {
        en: [
            "The map is live at {url}.",
            "The map is live at {url}.",
            "The map is live at {url}, and the address answered.",
            "The map is live at {url}. The address was opened and it answered.",
            "The map is live at {url}. The address was opened, it answered, and you may now send it to somebody.",
        ],
        yue: [
            "地圖已經上線，網址係 {url}。",
            "地圖已經上線，網址係 {url}。",
            "地圖已經上線，網址係 {url}，而且個網址有回應。",
            "地圖已經上線：{url}。個網址開過，亦都有回應。",
            "地圖已經上線：{url}。個網址開過，有回應，而家可以放心 send 俾人。",
        ],
    },
    "pages.notice.pending": {
        en: [
            "The map was pushed and GitHub Pages was turned on, but the address has not answered yet.",
            "The map was pushed and GitHub Pages was turned on, but the address has not answered yet.",
            "The map was pushed and GitHub Pages was turned on, but the address has not answered yet. A first build often takes a minute or two.",
            "The map went up and GitHub Pages is on, but the address has not answered yet. A first build often takes a minute or two.",
            "The map went up and GitHub Pages is on, but the address has not answered yet. A first build often takes a minute or two, so this is not being called live until it does.",
        ],
        yue: [
            "地圖已經上傳，GitHub Pages 亦都開咗，但係個網址仲未有回應。",
            "地圖已經上傳，GitHub Pages 亦都開咗，但係個網址仲未有回應。",
            "地圖已經上傳，GitHub Pages 亦都開咗，不過個網址仲未有回應。第一次建立通常要一兩分鐘。",
            "地圖上咗去，GitHub Pages 亦都開咗，但個網址仲未有回應。第一次建立通常要一兩分鐘。",
            "地圖上咗去，GitHub Pages 亦都開咗，但個網址仲未有回應。第一次建立通常要一兩分鐘，所以未有回應之前，呢度唔會當佢上線。",
        ],
    },
    "pages.gh.signIn": {
        en: [
            "Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            "Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            "Run `gh auth login` in a terminal. It asks for a code interactively and cannot be driven from inside this application, so it has to be run there. Then check again.",
            "Run `gh auth login` in a terminal yourself. It asks for a code interactively and cannot be driven from inside this application, so there is no button here that would do it. Then check again.",
            "Run `gh auth login` in a terminal yourself. It asks for a code interactively and cannot be driven from inside an application at all, so there is deliberately no button here pretending otherwise. Then check again.",
        ],
        yue: [
            "喺終端機執行 `gh auth login`：佢會互動咁問你要驗證碼，喺呢個程式入面驅動唔到，之後再檢查一次。",
            "喺終端機執行 `gh auth login`：佢會互動咁問你要驗證碼，喺呢個程式入面驅動唔到，之後再檢查一次。",
            "請喺終端機執行 `gh auth login`。佢會互動咁問你要驗證碼，喺呢個程式入面驅動唔到，所以一定要喺嗰邊行。跟住再檢查一次。",
            "自己喺終端機行 `gh auth login`。佢會互動咁問你攞驗證碼，喺呢個程式入面驅動唔到，所以呢度冇一粒掣做得到。之後再檢查一次。",
            "自己喺終端機行 `gh auth login`。佢會互動咁問你攞驗證碼，喺任何程式入面都驅動唔到，所以呢度特登冇一粒掣扮做得到。之後再檢查一次。",
        ],
    },
    "pages.visibility.note": {
        en: [
            "This is only used if the repository has to be created. An existing repository is left exactly as it is.",
            "This is only used if the repository has to be created. An existing repository is left exactly as it is.",
            "This is only used if the repository has to be created. An existing repository is left exactly as it already is.",
            "This only matters if the repository has to be created. One that already exists is left exactly as it is.",
            "This only matters if the repository has to be created from scratch. One that already exists is left exactly as it is, visibility and all.",
        ],
        yue: [
            "呢個選項淨係喺需要建立 repository 嗰陣先會用到。已經存在嘅 repository 會原封不動。",
            "呢個選項淨係喺需要建立 repository 嗰陣先會用到。已經存在嘅 repository 會原封不動。",
            "呢個選項淨係喺要新開 repository 嗰陣先會用。已經存在嘅 repository 會原封不動咁擺喺度。",
            "呢個淨係喺要新開 repository 先有意義。已經存在嗰個會原封不動。",
            "呢個淨係喺要由零開一個 repository 先有意義。已經存在嗰個會原封不動，連公開定私人都唔會郁。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

/* -------------------------------------------------------------------------- */
/* FIXED: titles, buttons and the names of things                             */
/* -------------------------------------------------------------------------- */

export const APP_FIXED = {
    ...SURFACE_FIXED,
    "settings.consent.title": { en: "Mojang download consent", yue: "Mojang 下載同意" },
    "settings.java.title": { en: "Java runtime", yue: "Java 執行環境" },
    "settings.java.download": { en: "Download Java (~140 MB)", yue: "落載 Java（大約 140 MB）" },
    "settings.java.provisioning": { en: "Downloading Java…", yue: "落載緊 Java……" },
    "settings.storage.title": { en: "Where rendered maps go", yue: "算好嘅地圖去邊度" },
    "settings.github.title": { en: "GitHub account", yue: "GitHub 帳戶" },
    "settings.dependencies.title": { en: "System dependencies", yue: "系統嘅依賴" },
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

    "pages.title": { en: "Put a map on the internet", yue: "將地圖擺上網" },
    "pages.which.title": { en: "Which map, and where", yue: "邊張圖，擺去邊" },
    "pages.report.title": { en: "What this would do", yue: "呢個會做啲乜" },
    "pages.hosted.title": {
        en: "Maps this computer has published",
        yue: "呢部電腦發佈過嘅地圖",
    },
    "pages.check": { en: "Check before anything is pushed", yue: "上傳之前先檢查" },
    "pages.publish": { en: "Publish to GitHub Pages", yue: "發佈到 GitHub Pages" },
    "pages.open": { en: "Open it", yue: "開嚟睇" },
    "pages.copy": { en: "Copy the address", yue: "複製網址" },
    "pages.stopButton": { en: "Stop hosting", yue: "停止寄存" },
    "pages.cancel": { en: "Stop publishing", yue: "停止發佈" },
    "pages.field.owner": { en: "Repository owner", yue: "Repository 擁有者" },
    "pages.field.repo": { en: "Repository name", yue: "Repository 名" },
    "pages.field.branch": { en: "Publishing branch", yue: "發佈分支" },
    "pages.renders.search": { en: "Search renders", yue: "搜尋算好嘅圖" },
    "pages.stop.title": {
        en: "Take this map off the internet",
        yue: "將呢張地圖由網上落架",
    },
    "pages.stop.confirm": { en: "Take the site down", yue: "落架" },
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
    ...SURFACE_FACTS,
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
    "notices.centre.noMatch": { en: ["search", "date range"], yue: ["搜尋", "日期範圍"] },

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
    // The size, the source and the two user-scoped promises (no PATH edit, no admin
    // rights) are the facts principle 1 requires be stated before the download starts.
    // A playful rewrite that dropped any of them would turn a disclosure into a surprise.
    "settings.java.provisionExplain": {
        en: ["140 MB", "Adoptium", "system-wide", "administrator"],
        yue: ["140 MB", "Adoptium", "成部機", "管理員"],
    },
    "settings.dependencies.description": {
        en: ["administrator permission", "before the button is pressed"],
        yue: ["管理員權限", "撳掣之前"],
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

    /*
     * Publishing a map. The facts here are the two GitHub limits, the one setting that is
     * changed and where it is written, the branch that is replaced, and - most of all - the
     * difference between "GitHub says built" and "the address answered". A playful rewrite
     * that lost that last one would turn an honest status into a green tick over a dead link.
     */
    "pages.pitch": { en: ["GitHub Pages", "free"], yue: ["GitHub Pages", "免費"] },
    "pages.caveats": {
        en: ["1 GB", "100 MB", "paid plan", "public"],
        yue: ["1 GB", "100 MB", "俾錢嘅方案", "公開"],
    },
    "pages.decompression": {
        en: ["settings.json", "static host"],
        yue: ["settings.json", "靜態主機"],
    },
    "pages.size": { en: ["{size}", "{files}"], yue: ["{size}", "{files}"] },
    "pages.published.size": { en: ["{size}", "{files}"], yue: ["{size}", "{files}"] },
    "pages.renders.empty": {
        en: ["nothing rendered here yet", "Make a map first"],
        yue: ["未算過任何地圖", "請先整一張圖"],
    },
    "pages.hosted.empty": {
        en: ["pushed to GitHub Pages", "reopened or taken down"],
        yue: ["推咗上 GitHub Pages", "打開返或者落架"],
    },
    "pages.ack": { en: ["whole map", "replace"], yue: ["成張地圖", "取代"] },
    "pages.blocked.acknowledge": { en: ["publish", "branch"], yue: ["發佈", "分支"] },
    "pages.oversized": { en: ["{path}", "100 MB"], yue: ["{path}", "100 MB"] },
    // "Live" here is a claim about a request that answered, so the word has to survive.
    "pages.status.live": { en: ["Live"], yue: ["已上線"] },
    // And this one is the opposite claim, which is exactly the one a playful level is
    // tempted to round up into a success. Both halves are pinned.
    "pages.status.built": {
        en: ["GitHub says built", "not"],
        yue: ["GitHub 話已經建立好", "未有回應"],
    },
    "pages.pushUnverified": {
        en: ["unverified", "commit"],
        yue: ["未經核實", "commit"],
    },
    "pages.stop.action": {
        en: ["{owner}", "{repo}", "{branch}", "deleted", "not touched"],
        yue: ["{owner}", "{repo}", "{branch}", "刪除", "唔會被郁到"],
    },
    "pages.notice.live": { en: ["{url}", "live"], yue: ["{url}", "上線"] },
    "pages.notice.pending": { en: ["not answered yet"], yue: ["未有回應"] },
    "pages.gh.signIn": { en: ["gh auth login", "terminal"], yue: ["gh auth login", "終端機"] },
    "pages.visibility.note": { en: ["created"], yue: ["repository"] },
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
