/**
 * The config screen's file management: the maps and the storages it edits, the config-folder
 * shell that opens, generates, saves and deletes them, the run screen that says what BlueMap
 * will actually be asked to do, the marker sets written into a map config, and the two gates
 * that stand in front of a save that deletes something.
 *
 * This is the surface where a sentence is load-bearing rather than decorative, so three
 * distinctions are pinned into `CONFIGFILES_FACTS` and survive level 5 in both languages.
 *
 * **Saved is not rendered.** `config.shell.needsRender` and `config.apply.reRenderTitle` are
 * the only warning anybody gets that the folder on disk now disagrees with the tiles a
 * visitor is being served. Saving changes config files; it never starts a render. A level
 * that lets "have to be rendered again" soften into "will update" has told the reader the
 * opposite of what happened.
 *
 * **A delete names its file, and names what it does not take.** `config.apply.deleteAction`
 * keeps the folder, "the files listed below", "keeps no copy" and "cannot put them back" in
 * all ten strings. `config.storages.deleteKeepsTiles` keeps the other half: the tiles that
 * are already written are NOT deleted, and dropping that half inverts the message from "your
 * config is going" into "your rendered world is going". The house standard for both is
 * `config.maps.deleteTiles` and `config.storages.deleteBreaks` in `appCopy.ts`.
 *
 * **Nothing is on disk until you save.** Adding, duplicating and generating all produce
 * entries that exist only in memory, and every one of those messages says so. It is the
 * sentence that makes the delete gate honest later: if a reader believes a new file was
 * already written, they cannot reason about what the save is about to do.
 *
 * ## What is deliberately *not* here
 *
 * `config.maps.deleteAction`, `config.maps.deleteTiles`, `config.maps.idTaken`,
 * `config.maps.nameTaken`, `config.storages.deleteAction`, `config.storages.deleteBreaks`,
 * `config.shell.openFailed`, `config.shell.saved`, `config.shell.save`, `config.apply.title`,
 * `config.apply.cancel`, `config.apply.reRenderBody` and `config.saved` belong to this
 * surface and are written directly in `appCopy.ts`. Entries there win a collision with a
 * surface module, so repeating them here would be dead weight at best and a silent
 * divergence at worst.
 *
 * ## Near-duplicates that are deliberate
 *
 * There are three "the pattern is not valid" keys, one per search bar, and they are not
 * consolidated: each names the thing its own list was about to show, so a reader who has two
 * of these screens open can tell which search is broken. `config.shell.nothingToSave` and
 * `config.apply.nothing` are likewise the same news in two places, the first from the save
 * button and the second inside the dialog that was about to write, and they are worded apart
 * so that seeing both at once does not read as the app stuttering. `config.maps.deleted` and
 * `config.storages.deleted` diverge only at the top levels, where the storage one adds the
 * reassurance about tiles that the map one has no business making.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CONFIGFILES_VOICED = {
    /* ---------------------------------------------------------------- */
    /* The config folder: nothing open, opening one, generating one      */
    /* ---------------------------------------------------------------- */

    "config.shell.welcome": {
        en: [
            "Nothing is open yet.",
            "Nothing is open yet.",
            "Nothing is open yet.",
            "Nothing is open yet. This screen is waiting for a config folder.",
            "Nothing is open yet. This screen is sitting here empty, waiting for a config folder.",
        ],
        yue: [
            "而家未開任何嘢。",
            "而家未開任何嘢。",
            "而家未開任何嘢。",
            "而家未開任何嘢。呢一頁等緊你開個設定資料夾。",
            "而家未開任何嘢。呢一頁就咁吉住喺度，等緊你開個設定資料夾。",
        ],
    },
    "config.shell.welcomeBody": {
        en: [
            "Open a folder BlueMap already uses to carry on from it, or generate a new set of config files here.",
            "Open a folder BlueMap already uses to carry on from it, or generate a new set of config files here.",
            "Open a folder BlueMap already uses and carry on from it, or generate a new set of config files here.",
            "Open a folder BlueMap already uses and carry on from where it left off, or generate a new set of config files right here.",
            "Point this at a folder BlueMap already uses and carry on from where it left off, or generate a brand new set of config files right here and start from nothing.",
        ],
        yue: [
            "開一個 BlueMap 已經喺度用嘅資料夾接住做落去，或者喺呢度產生一套全新嘅設定檔。",
            "開一個 BlueMap 已經喺度用嘅資料夾接住做落去，或者喺呢度產生一套全新嘅設定檔。",
            "開一個 BlueMap 已經喺度用嘅資料夾，接住佢做落去，或者喺呢度產生一套全新嘅設定檔。",
            "開一個 BlueMap 已經喺度用嘅資料夾，由佢做到邊就接住做落去，又或者就喺呢度產生一套全新嘅設定檔。",
            "揀個 BlueMap 已經喺度用嘅資料夾，佢做到邊你就接住做落去；又或者就喺呢度由零開始，產生一套全新嘅設定檔。",
        ],
    },
    /*
     * "Read as it is, comments and all" is the promise this screen lives or dies by: a
     * config editor that silently reflows somebody's hand-annotated core.conf is a config
     * editor nobody points at a real server twice. It stays in all ten strings.
     */
    "config.shell.openHint": {
        en: [
            "Point this at a folder BlueMap already uses. Every file in it is read as it is, comments and all.",
            "Point this at a folder BlueMap already uses. Every file in it is read as it is, comments and all.",
            "Point this at a folder BlueMap already uses. Every file in it is read exactly as it is, comments and all.",
            "Point this at a folder BlueMap already uses. Every file in it is read exactly as it is, comments and all, and nothing is tidied up on the way in.",
            "Point this at a folder BlueMap already uses. Every file in it is read exactly as it is, comments and all. Nothing is tidied, reflowed or quietly improved on the way in.",
        ],
        yue: [
            "指去一個 BlueMap 已經喺度用嘅資料夾。入面每個檔案都會原樣讀入，連註解都會保留。",
            "指去一個 BlueMap 已經喺度用嘅資料夾。入面每個檔案都會原樣讀入，連註解都會保留。",
            "指去一個 BlueMap 已經喺度用嘅資料夾。入面每個檔案都會原原本本咁讀入，連註解都會保留。",
            "指去一個 BlueMap 已經喺度用嘅資料夾。入面每個檔案都會原原本本咁讀入，連註解都會保留，入嚟嗰陣唔會幫你執靚佢。",
            "指去一個 BlueMap 已經喺度用嘅資料夾。入面每個檔案都會原原本本咁讀入，連註解都會保留。冇人會幫你執、幫你重排、又或者靜靜雞幫你改佢。",
        ],
    },
    "config.shell.opened": {
        en: [
            "Read {files} config files from {folder}: {maps} maps and {storages} storages.",
            "Read {files} config files from {folder}: {maps} maps and {storages} storages.",
            "Read {files} config files from {folder}: {maps} maps and {storages} storages.",
            "Read {files} config files out of {folder}: {maps} maps and {storages} storages.",
            "Read all {files} config files out of {folder}, and they came to {maps} maps and {storages} storages.",
        ],
        yue: [
            "由 {folder} 讀咗 {files} 個設定檔：{maps} 個地圖同 {storages} 個儲存空間。",
            "由 {folder} 讀咗 {files} 個設定檔：{maps} 個地圖同 {storages} 個儲存空間。",
            "由 {folder} 讀咗 {files} 個設定檔：{maps} 個地圖，同埋 {storages} 個儲存空間。",
            "由 {folder} 讀晒 {files} 個設定檔入嚟：{maps} 個地圖同 {storages} 個儲存空間。",
            "由 {folder} 讀晒 {files} 個設定檔入嚟，埋單係 {maps} 個地圖同 {storages} 個儲存空間。",
        ],
    },
    /*
     * The reader's real question here is "what did it do to my other files", so the answer
     * comes before any humour does: they are left exactly as they are.
     */
    "config.shell.unknownFiles": {
        en: [
            "{n} files in that folder are not BlueMap configs. They are left exactly as they are.",
            "{n} files in that folder are not BlueMap configs. They are left exactly as they are.",
            "{n} files in that folder are not BlueMap configs. They are left exactly as they are.",
            "{n} files in that folder are not BlueMap configs. They are left exactly as they are, untouched and unread.",
            "{n} files in that folder are not BlueMap configs at all. They are left exactly as they are: not read, not moved, not rewritten.",
        ],
        yue: [
            "嗰個資料夾入面有 {n} 個檔案唔係 BlueMap 嘅設定檔。佢哋會原封不動咁留喺度。",
            "嗰個資料夾入面有 {n} 個檔案唔係 BlueMap 嘅設定檔。佢哋會原封不動咁留喺度。",
            "嗰個資料夾入面有 {n} 個檔案唔係 BlueMap 嘅設定檔。佢哋會原封不動咁留喺度。",
            "嗰個資料夾入面有 {n} 個檔案唔係 BlueMap 嘅設定檔。佢哋會原封不動咁留喺度，冇人讀過，亦冇人郁過。",
            "嗰個資料夾入面有成 {n} 個檔案唔係 BlueMap 嘅設定檔。佢哋會原封不動咁留喺度：冇讀過、冇搬過、亦冇改寫過。",
        ],
    },
    /* A native folder-picker title, so it has no full stop and stays short even at level 5. */
    "config.shell.pickWorld": {
        en: [
            "Choose the world folder, the one with level.dat",
            "Choose the world folder, the one with level.dat",
            "Choose the world folder, the one that has level.dat in it",
            "Choose the world folder, the one with level.dat sitting in it",
            "Choose the world folder. The one with level.dat in it, not the one beside it",
        ],
        yue: [
            "揀個世界資料夾，即係有 level.dat 嗰個",
            "揀個世界資料夾，即係有 level.dat 嗰個",
            "揀個世界資料夾，即係入面有 level.dat 嗰個",
            "揀個世界資料夾，即係入面擺住 level.dat 嗰個",
            "揀個世界資料夾。係入面有 level.dat 嗰個，唔係隔籬嗰個",
        ],
    },
    "config.shell.generated": {
        en: [
            "Generated a full config set for {folder}. Nothing is on disk until you save.",
            "Generated a full config set for {folder}. Nothing is on disk until you save.",
            "Generated a full config set for {folder}. Nothing is on disk until you save.",
            "Generated a full config set for {folder}. None of it is on disk until you save.",
            "Generated a full config set for {folder}. Not one byte of it is on disk until you save.",
        ],
        yue: [
            "已經為 {folder} 產生咗一整套設定檔。你未儲存之前，磁碟上乜都冇。",
            "已經為 {folder} 產生咗一整套設定檔。你未儲存之前，磁碟上乜都冇。",
            "已經為 {folder} 產生咗一整套設定檔。你未儲存之前，磁碟上乜都冇。",
            "已經為 {folder} 產生咗一整套設定檔。你未儲存之前，磁碟上一個檔案都冇。",
            "已經為 {folder} 產生咗一整套設定檔。你未儲存之前，磁碟上連一個位元組都冇。",
        ],
    },
    /*
     * Shown when a browser tab loads a generated set. Three separate facts, all of which a
     * reader needs: it is not on disk, this build could not write it even if asked, and the
     * paths in it are examples rather than places on their machine.
     */
    "config.shell.preview": {
        en: [
            "Loaded a generated config set to look at. It is not on disk, and this build cannot write one; the paths in it are examples.",
            "Loaded a generated config set to look at. It is not on disk, and this build cannot write one; the paths in it are examples.",
            "Loaded a generated config set to look at. It is not on disk, and this build cannot write one; the paths in it are examples.",
            "Loaded a generated config set purely to look at. It is not on disk, this build cannot write one, and the paths in it are examples rather than real places.",
            "Loaded a generated config set purely to look at. It is not on disk, this build cannot write one, and every path in it is an example rather than a real place on your machine.",
        ],
        yue: [
            "載入咗一套產生出嚟嘅設定檔畀你睇。佢唔喺磁碟上，而且呢個版本寫唔到；入面啲路徑都係例子。",
            "載入咗一套產生出嚟嘅設定檔畀你睇。佢唔喺磁碟上，而且呢個版本寫唔到；入面啲路徑都係例子。",
            "載入咗一套產生出嚟嘅設定檔畀你睇。佢唔喺磁碟上，而且呢個版本寫唔到；入面啲路徑都係例子。",
            "載入咗一套產生出嚟嘅設定檔淨係畀你睇。佢唔喺磁碟上，呢個版本亦都寫唔到，入面啲路徑全部都係例子。",
            "載入咗一套產生出嚟嘅設定檔，淨係畀你睇。佢唔喺磁碟上，呢個版本亦都寫唔到，而入面每一條路徑都只係例子，唔係你部機上面真實存在嘅地方。",
        ],
    },
    "config.shell.draft": {
        en: [
            "Showing BlueMap's own defaults so every setting is here to read. Nothing is on disk yet: choose a folder to save them into, or open one BlueMap already uses.",
            "Showing BlueMap's own defaults so every setting is here to read. Nothing is on disk yet: choose a folder to save them into, or open one BlueMap already uses.",
            "Showing BlueMap's own defaults so every setting is here to read. Nothing is on disk yet: choose a folder to save them into, or open one BlueMap already uses.",
            "Showing BlueMap's own defaults, so every setting is here to read. Nothing is on disk yet: choose a folder to save them into, or open one BlueMap already uses.",
            "These are BlueMap's own defaults, laid out so every setting is here to read. Nothing is on disk yet: choose a folder to save them into, or open one BlueMap already uses.",
        ],
        yue: [
            "而家顯示緊 BlueMap 自己嘅預設值，所以每個設定都喺呢度睇得到。磁碟上仲未有任何嘢：揀個資料夾儲存落去，或者開返一個 BlueMap 已經喺度用嘅。",
            "而家顯示緊 BlueMap 自己嘅預設值，所以每個設定都喺呢度睇得到。磁碟上仲未有任何嘢：揀個資料夾儲存落去，或者開返一個 BlueMap 已經喺度用嘅。",
            "而家顯示緊 BlueMap 自己嘅預設值，所以每個設定都喺呢度睇得到。磁碟上仲未有任何嘢：揀個資料夾儲存落去，又或者開返一個 BlueMap 已經喺度用嘅。",
            "呢度顯示緊 BlueMap 自己嘅預設值，所以每個設定都攤晒喺度畀你睇。磁碟上仲未有任何嘢：揀個資料夾儲存落去，又或者開返一個 BlueMap 已經喺度用嘅。",
            "呢啲係 BlueMap 自己嘅預設值，攤晒出嚟等你每個設定都睇得到。磁碟上仲未有任何嘢：揀個資料夾儲存落去，又或者開返一個 BlueMap 已經喺度用嘅。",
        ],
    },
    /*
     * A setting changed on the reader's behalf, so it says which one, in which file, why it
     * was allowed, and that the change is still only in memory. Any of those four missing
     * turns a helpful shortcut into an edit nobody asked for.
     */
    "config.shell.consentApplied": {
        en: [
            "Set accept-download to true in core.conf, from the download consent you already gave. It is written when you save.",
            "Set accept-download to true in core.conf, from the download consent you already gave. It is written when you save.",
            "Set accept-download to true in core.conf, from the download consent you already gave. It is written when you save.",
            "Set accept-download to true in core.conf, carried over from the download consent you already gave. It is written when you save.",
            "Set accept-download to true in core.conf, carried straight over from the download consent you already gave, so nobody has to agree to the same thing twice. It is written when you save.",
        ],
        yue: [
            "已經根據你之前畀嘅下載同意，喺 core.conf 將 accept-download 設做 true。儲存嗰陣先會寫入。",
            "已經根據你之前畀嘅下載同意，喺 core.conf 將 accept-download 設做 true。儲存嗰陣先會寫入。",
            "已經根據你之前畀過嘅下載同意，喺 core.conf 將 accept-download 設做 true。儲存嗰陣先會寫入。",
            "已經照你之前畀過嘅下載同意，喺 core.conf 將 accept-download 設做 true。儲存嗰陣先會寫入。",
            "已經照你之前畀過嘅下載同意，喺 core.conf 將 accept-download 設做 true，唔使你同一樣嘢應承兩次。儲存嗰陣先會寫入。",
        ],
    },
    "config.shell.browserMode": {
        en: [
            "This build cannot reach a file system, so nothing can be opened or saved. Every editor below still works, and the file text can be copied out of each screen.",
            "This build cannot reach a file system, so nothing can be opened or saved. Every editor below still works, and the file text can be copied out of each screen.",
            "This build cannot reach a file system, so nothing can be opened or saved. Every editor below still works, and the file text can be copied out of each screen.",
            "This build cannot reach a file system, so nothing can be opened or saved. Every editor below still works though, and the file text can be copied out of each screen.",
            "This build cannot reach a file system at all, so nothing can be opened or saved. Every editor below still works perfectly well, and the file text can be copied out of each screen by hand.",
        ],
        yue: [
            "呢個版本接觸唔到檔案系統，所以乜都開唔到、儲存唔到。下面每個編輯器一樣用得，每個畫面嘅檔案內容都可以複製出嚟。",
            "呢個版本接觸唔到檔案系統，所以乜都開唔到、儲存唔到。下面每個編輯器一樣用得，每個畫面嘅檔案內容都可以複製出嚟。",
            "呢個版本接觸唔到檔案系統，所以乜都開唔到、儲存唔到。下面每個編輯器一樣用得，每個畫面嘅檔案內容都可以複製出嚟。",
            "呢個版本完全接觸唔到檔案系統，所以乜都開唔到、儲存唔到。不過下面每個編輯器一樣用得，每個畫面嘅檔案內容都可以複製出嚟。",
            "呢個版本完全接觸唔到檔案系統，所以乜都開唔到、儲存唔到。不過下面每個編輯器照用如儀，每個畫面嘅檔案內容都可以自己複製出嚟。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Searching every setting, and the files a folder turned out to lack */
    /* ---------------------------------------------------------------- */

    /*
     * One of three "the pattern is not valid" keys, one per search bar. This one belongs to
     * the settings search; `config.maps.badPattern` and `config.run.badPattern` name maps and
     * flags instead, so two open screens never report the same broken pattern twice.
     */
    "config.shell.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "That pattern is not valid, so nothing is listed. The settings are all still there.",
            "That pattern is not valid, so nothing is listed. The settings are all still there; it is the pattern that is lost.",
        ],
        yue: [
            "個 pattern 唔正確，所以乜都冇列出嚟。",
            "個 pattern 唔正確，所以乜都冇列出嚟。",
            "個 pattern 唔正確，所以乜都冇列出嚟。",
            "個 pattern 唔正確，所以乜都冇列出嚟。啲設定全部仲喺度。",
            "個 pattern 唔正確，所以乜都冇列出嚟。啲設定全部仲好地地喺度，蕩失路嘅係個 pattern。",
        ],
    },
    "config.shell.total": {
        en: [
            "{n} settings across every screen.",
            "{n} settings across every screen.",
            "{n} settings across every screen.",
            "{n} settings, counted across every screen.",
            "{n} settings in total, counted across every screen there is.",
        ],
        yue: [
            "所有畫面加埋一共 {n} 個設定。",
            "所有畫面加埋一共 {n} 個設定。",
            "所有畫面加埋一共 {n} 個設定。",
            "數勻所有畫面，一共 {n} 個設定。",
            "數勻晒每一個畫面，總共 {n} 個設定。",
        ],
    },
    "config.shell.found": {
        en: [
            "{shown} of {total} settings match, across {screens} screens.",
            "{shown} of {total} settings match, across {screens} screens.",
            "{shown} of {total} settings match, across {screens} screens.",
            "{shown} of {total} settings match, spread across {screens} screens.",
            "{shown} of {total} settings match, spread across {screens} screens. The rest are filtered out, not gone.",
        ],
        yue: [
            "{total} 個設定入面有 {shown} 個符合，分佈喺 {screens} 個畫面。",
            "{total} 個設定入面有 {shown} 個符合，分佈喺 {screens} 個畫面。",
            "{total} 個設定入面有 {shown} 個符合，分佈喺 {screens} 個畫面。",
            "{total} 個設定之中有 {shown} 個符合，散落喺 {screens} 個畫面。",
            "{total} 個設定之中有 {shown} 個符合，散落喺 {screens} 個畫面。其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    "config.shell.noMatches": {
        en: [
            "Nothing matches on any screen.",
            "Nothing matches on any screen.",
            "Nothing matches on any screen.",
            "Nothing matches on any screen. Nothing has been hidden either.",
            "Nothing matches on any screen. Nothing has been hidden either; the settings are all still there, just not matching.",
        ],
        yue: [
            "任何一個畫面都冇符合嘅嘢。",
            "任何一個畫面都冇符合嘅嘢。",
            "任何一個畫面都冇符合嘅嘢。",
            "任何一個畫面都冇符合嘅嘢。亦都冇任何嘢被隱藏。",
            "任何一個畫面都冇符合嘅嘢。亦都冇任何嘢被隱藏，啲設定全部仲喺度，只不過啱唔到你搵嘅嘢。",
        ],
    },
    "config.shell.missingCore": {
        en: [
            "This folder has no core.conf.",
            "This folder has no core.conf.",
            "This folder has no core.conf.",
            "This folder has no core.conf in it.",
            "This folder has no core.conf in it. Looked twice; still none.",
        ],
        yue: [
            "呢個資料夾冇 core.conf。",
            "呢個資料夾冇 core.conf。",
            "呢個資料夾冇 core.conf。",
            "呢個資料夾入面冇 core.conf。",
            "呢個資料夾入面冇 core.conf。搵咗兩次，都係冇。",
        ],
    },
    "config.shell.missingWebapp": {
        en: [
            "This folder has no webapp.conf.",
            "This folder has no webapp.conf.",
            "This folder has no webapp.conf.",
            "This folder has no webapp.conf in it.",
            "This folder has no webapp.conf in it. Nothing here to configure the web app with.",
        ],
        yue: [
            "呢個資料夾冇 webapp.conf。",
            "呢個資料夾冇 webapp.conf。",
            "呢個資料夾冇 webapp.conf。",
            "呢個資料夾入面冇 webapp.conf。",
            "呢個資料夾入面冇 webapp.conf。即係冇嘢用嚟設定個網頁應用。",
        ],
    },
    "config.shell.missingWebserver": {
        en: [
            "This folder has no webserver.conf.",
            "This folder has no webserver.conf.",
            "This folder has no webserver.conf.",
            "This folder has no webserver.conf in it.",
            "This folder has no webserver.conf in it. The built-in web server has nothing to read.",
        ],
        yue: [
            "呢個資料夾冇 webserver.conf。",
            "呢個資料夾冇 webserver.conf。",
            "呢個資料夾冇 webserver.conf。",
            "呢個資料夾入面冇 webserver.conf。",
            "呢個資料夾入面冇 webserver.conf。內置嘅網頁伺服器冇嘢可以讀。",
        ],
    },
    /*
     * The odd one out of the four: a missing plugin.conf is normal rather than a problem, so
     * every level carries the reason. Without it this reads as the same defect as the three
     * above and sends somebody hunting for a file that was never supposed to exist.
     */
    "config.shell.missingPlugin": {
        en: [
            "This folder has no plugin.conf. The command-line BlueMap never writes one; only a server plugin reads it.",
            "This folder has no plugin.conf. The command-line BlueMap never writes one; only a server plugin reads it.",
            "This folder has no plugin.conf. The command-line BlueMap never writes one; only a server plugin reads it.",
            "This folder has no plugin.conf, which is normal. The command-line BlueMap never writes one, and only a server plugin reads it.",
            "This folder has no plugin.conf, and that is entirely normal. The command-line BlueMap never writes one, and only a server plugin ever reads it.",
        ],
        yue: [
            "呢個資料夾冇 plugin.conf。指令列版嘅 BlueMap 從來唔會寫呢個檔；淨係伺服器 plugin 先會讀佢。",
            "呢個資料夾冇 plugin.conf。指令列版嘅 BlueMap 從來唔會寫呢個檔；淨係伺服器 plugin 先會讀佢。",
            "呢個資料夾冇 plugin.conf。指令列版嘅 BlueMap 從來唔會寫呢個檔；淨係伺服器 plugin 先會讀佢。",
            "呢個資料夾冇 plugin.conf，其實好正常。指令列版嘅 BlueMap 從來唔會寫呢個檔，而且淨係伺服器 plugin 先會讀佢。",
            "呢個資料夾冇 plugin.conf，而呢件事完全正常。指令列版嘅 BlueMap 從來唔會寫呢個檔，亦都淨係伺服器 plugin 先會讀佢。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Saving: what stops it, and what saving does not do                */
    /* ---------------------------------------------------------------- */

    "config.shell.noFolder": {
        en: [
            "Open a config folder first.",
            "Open a config folder first.",
            "Open a config folder first.",
            "Open a config folder first. There is nowhere to write to yet.",
            "Open a config folder first. Right now there is nowhere on disk to write to.",
        ],
        yue: [
            "請先開一個設定資料夾。",
            "請先開一個設定資料夾。",
            "請先開一個設定資料夾。",
            "請先開一個設定資料夾，而家仲未有地方寫得入去。",
            "請先開一個設定資料夾。而家喺磁碟上根本冇地方可以寫入。",
        ],
    },
    "config.shell.noFolderPath": {
        en: [
            "This config set is not attached to a folder yet.",
            "This config set is not attached to a folder yet.",
            "This config set is not attached to a folder yet.",
            "This config set is not attached to any folder yet, so there is nowhere to save it.",
            "This config set is not attached to any folder yet, so there is nowhere on disk to save it to.",
        ],
        yue: [
            "呢套設定檔仲未連住任何資料夾。",
            "呢套設定檔仲未連住任何資料夾。",
            "呢套設定檔仲未連住任何資料夾。",
            "呢套設定檔仲未連住任何資料夾，所以冇地方可以儲存。",
            "呢套設定檔仲未連住任何資料夾，所以磁碟上根本冇地方可以儲存落去。",
        ],
    },
    "config.shell.nothingToSave": {
        en: [
            "Nothing has changed.",
            "Nothing has changed.",
            "Nothing has changed.",
            "Nothing has changed, so there is nothing to save.",
            "Nothing has changed, so there is nothing to save. The folder on disk already matches what is on screen.",
        ],
        yue: [
            "冇任何改動。",
            "冇任何改動。",
            "冇任何改動。",
            "冇任何改動，所以冇嘢需要儲存。",
            "冇任何改動，所以冇嘢需要儲存。磁碟上嗰個資料夾同畫面上見到嘅已經一模一樣。",
        ],
    },
    /*
     * The save-is-not-a-render line, raised beside the folder that was just written. The map
     * ids and "rendered again" are pinned because this is the only warning that the config on
     * disk and the tiles a visitor is served now disagree.
     */
    "config.shell.needsRender": {
        en: [
            "These maps have to be rendered again before what you see matches what you saved: {maps}.",
            "These maps have to be rendered again before what you see matches what you saved: {maps}.",
            "These maps have to be rendered again before what you see matches what you saved: {maps}.",
            "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving changed the config, not the tiles.",
            "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving changed the config and nothing else; the tiles are still the old ones.",
        ],
        yue: [
            "以下地圖要重新算過，你見到嘅先會同你儲存咗嘅一致：{maps}。",
            "以下地圖要重新算過，你見到嘅先會同你儲存咗嘅一致：{maps}。",
            "以下地圖要重新算過，你見到嘅先會同你儲存咗嘅一致：{maps}。",
            "以下地圖要重新算過，你見到嘅先會同你儲存咗嘅一致：{maps}。儲存改咗嘅係設定，唔係圖磚。",
            "以下地圖要重新算過，你見到嘅先會同你儲存咗嘅一致：{maps}。儲存淨係改咗設定，其他乜都冇郁；啲圖磚仲係舊嗰批。",
        ],
    },
    "config.shell.saveFailed": {
        en: [
            "The files were not written.",
            "The files were not written.",
            "The files were not written.",
            "The files were not written. The folder on disk is exactly as it was.",
            "The files were not written. The folder on disk is exactly as it was, which is the one bit of good news here.",
        ],
        yue: [
            "啲檔案冇寫入到。",
            "啲檔案冇寫入到。",
            "啲檔案冇寫入到。",
            "啲檔案冇寫入到。磁碟上嗰個資料夾同之前一模一樣。",
            "啲檔案冇寫入到。磁碟上嗰個資料夾同之前一模一樣，呢個算係唯一嘅好消息。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Maps: the list, adding one, duplicating one, deleting one         */
    /* ---------------------------------------------------------------- */

    "config.maps.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so no maps are listed.",
            "That pattern is not valid, so no maps are listed. Every map config is still there.",
            "That pattern is not valid, so no maps are listed. Every map config is still there; it is the pattern that needs fixing.",
        ],
        yue: [
            "個 pattern 唔正確，所以乜都冇列出嚟。",
            "個 pattern 唔正確，所以乜都冇列出嚟。",
            "個 pattern 唔正確，所以冇列出任何地圖。",
            "個 pattern 唔正確，所以冇列出任何地圖。每個地圖設定檔都仲喺度。",
            "個 pattern 唔正確，所以冇列出任何地圖。每個地圖設定檔都仲好地地喺度，要修嘅係個 pattern。",
        ],
    },
    "config.maps.listSummary": {
        en: [
            "{shown} of {total} maps match.",
            "{shown} of {total} maps match.",
            "{shown} of {total} maps match.",
            "{shown} of {total} maps match the search.",
            "{shown} of {total} maps match the search. The other configs are filtered out, not deleted.",
        ],
        yue: [
            "{total} 個地圖入面有 {shown} 個符合。",
            "{total} 個地圖入面有 {shown} 個符合。",
            "{total} 個地圖入面有 {shown} 個符合。",
            "{total} 個地圖之中有 {shown} 個符合搜尋。",
            "{total} 個地圖之中有 {shown} 個符合搜尋。其餘嘅設定檔係篩走咗，唔係刪咗。",
        ],
    },
    "config.maps.none": {
        en: [
            "No maps yet. Add one to tell BlueMap what to render.",
            "No maps yet. Add one to tell BlueMap what to render.",
            "No maps yet. Add one to tell BlueMap what to render.",
            "No maps yet. Add one, so BlueMap knows what to render.",
            "No maps yet, so BlueMap has nothing to render. Add one and tell it what to render.",
        ],
        yue: [
            "仲未有地圖。加一個，話俾 BlueMap 知要算咩。",
            "仲未有地圖。加一個，話俾 BlueMap 知要算咩。",
            "仲未有地圖。加一個，話俾 BlueMap 知要算咩。",
            "仲未有地圖。加一個，等 BlueMap 知要算咩先。",
            "仲未有地圖，所以 BlueMap 冇嘢好算。加一個，話俾佢知要算咩。",
        ],
    },
    "config.maps.noMatch": {
        en: [
            "No map matches that search.",
            "No map matches that search.",
            "No map matches that search.",
            "No map matches that search. None of them has been removed.",
            "No map matches that search. None of them has been removed either; they are all still in the folder.",
        ],
        yue: [
            "冇地圖符合嗰個搜尋。",
            "冇地圖符合嗰個搜尋。",
            "冇地圖符合嗰個搜尋。",
            "冇地圖符合嗰個搜尋。一個都冇被刪走。",
            "冇地圖符合嗰個搜尋。一個都冇被刪走，全部仲喺個資料夾入面。",
        ],
    },
    "config.maps.pick": {
        en: [
            "Pick a map on the left, or add one.",
            "Pick a map on the left, or add one.",
            "Pick a map on the left, or add one.",
            "Pick a map from the list on the left, or add a new one.",
            "Pick a map from the list on the left, or add a new one. Nothing is selected right now.",
        ],
        yue: [
            "喺左邊揀一張地圖，或者加一張。",
            "喺左邊揀一張地圖，或者加一張。",
            "喺左邊揀一張地圖，或者加一張。",
            "喺左邊個清單度揀一張地圖，或者加一張新嘅。",
            "喺左邊個清單度揀一張地圖，或者加一張新嘅。而家一張都冇揀。",
        ],
    },
    "config.maps.subtitle": {
        en: [
            "Map id {id}. Everything BlueMap reads about this map lives in this one file.",
            "Map id {id}. Everything BlueMap reads about this map lives in this one file.",
            "Map id {id}. Everything BlueMap reads about this map lives in this one file.",
            "Map id {id}. Everything BlueMap reads about this map lives in this one file, and nowhere else.",
            "Map id {id}. Everything BlueMap reads about this map lives in this one file, and nowhere else at all.",
        ],
        yue: [
            "地圖 id {id}。BlueMap 關於呢張地圖讀到嘅所有嘢，全部都喺呢一個檔案入面。",
            "地圖 id {id}。BlueMap 關於呢張地圖讀到嘅所有嘢，全部都喺呢一個檔案入面。",
            "地圖 id {id}。BlueMap 關於呢張地圖讀到嘅所有嘢，全部都喺呢一個檔案入面。",
            "地圖 id {id}。BlueMap 關於呢張地圖讀到嘅所有嘢，全部都喺呢一個檔案入面，第二度冇。",
            "地圖 id {id}。BlueMap 關於呢張地圖讀到嘅所有嘢，全部都塞晒喺呢一個檔案入面，第二度一樣都冇。",
        ],
    },
    "config.maps.needName": {
        en: [
            "Give the file a name. It becomes the map id.",
            "Give the file a name. It becomes the map id.",
            "Give the file a name. It becomes the map id.",
            "Give the file a name first. That name becomes the map id.",
            "Give the file a name first. Whatever you type becomes the map id, so choose something you can live with.",
        ],
        yue: [
            "同個檔案改個名。呢個名會變成地圖 id。",
            "同個檔案改個名。呢個名會變成地圖 id。",
            "同個檔案改個名。呢個名會變成地圖 id。",
            "先同個檔案改個名。呢個名會變成地圖 id。",
            "先同個檔案改個名。你打咩落去就係地圖 id，所以揀個你頂得順嘅。",
        ],
    },
    "config.maps.needWorld": {
        en: [
            "Pick the world folder, the one that contains level.dat.",
            "Pick the world folder, the one that contains level.dat.",
            "Pick the world folder, the one that contains level.dat.",
            "Pick the world folder, the one with level.dat sitting inside it.",
            "Pick the world folder. That is the one with level.dat inside it, not the folder above it.",
        ],
        yue: [
            "揀個世界資料夾，即係入面有 level.dat 嗰個。",
            "揀個世界資料夾，即係入面有 level.dat 嗰個。",
            "揀個世界資料夾，即係入面有 level.dat 嗰個。",
            "揀個世界資料夾，即係入面擺住 level.dat 嗰個。",
            "揀個世界資料夾。係入面有 level.dat 嗰個，唔係佢上一層。",
        ],
    },
    /*
     * The file name is not decoration: BlueMap derives the map id from it, and the id ends up
     * in every tile URL. Renaming later moves every URL, so the consequence is stated while
     * the reader is still typing rather than afterwards.
     */
    "config.maps.idNote": {
        en: [
            'BlueMap turns that file name into the map id "{id}", which is what appears in the tile URLs.',
            'BlueMap turns that file name into the map id "{id}", which is what appears in the tile URLs.',
            'BlueMap turns that file name into the map id "{id}", which is what appears in the tile URLs.',
            'BlueMap turns that file name into the map id "{id}", and that is what shows up in the tile URLs.',
            'BlueMap turns that file name straight into the map id "{id}", and that is what ends up in every tile URL for this map.',
        ],
        yue: [
            "BlueMap 會將呢個檔案名變成地圖 id「{id}」，即係圖磚 URL 入面見到嗰個。",
            "BlueMap 會將呢個檔案名變成地圖 id「{id}」，即係圖磚 URL 入面見到嗰個。",
            "BlueMap 會將呢個檔案名變成地圖 id「{id}」，即係圖磚 URL 入面見到嗰個。",
            "BlueMap 會直接將呢個檔案名變成地圖 id「{id}」，而圖磚 URL 入面出現嘅就係佢。",
            "BlueMap 會直接將呢個檔案名變成地圖 id「{id}」，之後呢張地圖每一條圖磚 URL 入面出現嘅都係佢。",
        ],
    },
    "config.maps.templateNote": {
        en: [
            "The file is written from BlueMap's own template for this dimension, so it arrives with every setting explained in place.",
            "The file is written from BlueMap's own template for this dimension, so it arrives with every setting explained in place.",
            "The file is written from BlueMap's own template for this dimension, so it arrives with every setting explained in place.",
            "The file is written from BlueMap's own template for this dimension, so it arrives with every setting explained in place, comments included.",
            "The file is written straight from BlueMap's own template for this dimension, so it arrives with every setting explained in place, comments and all.",
        ],
        yue: [
            "呢個檔案係由 BlueMap 自己嘅範本（對應呢個維度）寫出嚟，所以一開始就每個設定都有解釋喺旁邊。",
            "呢個檔案係由 BlueMap 自己嘅範本（對應呢個維度）寫出嚟，所以一開始就每個設定都有解釋喺旁邊。",
            "呢個檔案係由 BlueMap 自己嘅範本（對應呢個維度）寫出嚟，所以一開始就每個設定都有解釋喺旁邊。",
            "呢個檔案係由 BlueMap 自己嘅範本（對應呢個維度）寫出嚟，所以一送到手就每個設定都有解釋喺旁邊，連註解都齊。",
            "呢個檔案直接由 BlueMap 自己嘅範本（對應呢個維度）寫出嚟，一送到手就每個設定都有解釋喺旁邊，連註解都一齊帶埋。",
        ],
    },
    "config.maps.created": {
        en: [
            "Added maps/{name}.conf. It is written when you save.",
            "Added maps/{name}.conf. It is written when you save.",
            "Added maps/{name}.conf. It is written when you save.",
            "Added maps/{name}.conf. Nothing is on disk yet; it is written when you save.",
            "Added maps/{name}.conf. Nothing is on disk yet, and nothing will be: it is written when you save.",
        ],
        yue: [
            "已加入 maps/{name}.conf。儲存嗰陣先會寫入。",
            "已加入 maps/{name}.conf。儲存嗰陣先會寫入。",
            "已加入 maps/{name}.conf。儲存嗰陣先會寫入。",
            "已加入 maps/{name}.conf。磁碟上而家仲未有；儲存嗰陣先會寫入。",
            "已加入 maps/{name}.conf。磁碟上而家一個字都未有，儲存嗰陣先會寫入。",
        ],
    },
    "config.maps.duplicateNote": {
        en: [
            "Every setting and every comment is copied exactly. Only the displayed name changes.",
            "Every setting and every comment is copied exactly. Only the displayed name changes.",
            "Every setting and every comment is copied exactly. Only the displayed name changes.",
            "Every setting and every comment is copied exactly. The only thing that changes is the displayed name.",
            "Every setting and every comment is copied exactly, character for character. The only thing that changes is the displayed name.",
        ],
        yue: [
            "每個設定同每段註解都會原原本本抄過去。淨係顯示名會變。",
            "每個設定同每段註解都會原原本本抄過去。淨係顯示名會變。",
            "每個設定同每段註解都會原原本本抄過去。淨係顯示名會變。",
            "每個設定同每段註解都會原原本本抄過去。唯一會變嘅就係顯示名。",
            "每個設定同每段註解都會逐個字原原本本抄過去。唯一會變嘅就係顯示名。",
        ],
    },
    "config.maps.cloned": {
        en: [
            "Copied {from} to maps/{name}.conf, comments and all. It is written when you save.",
            "Copied {from} to maps/{name}.conf, comments and all. It is written when you save.",
            "Copied {from} to maps/{name}.conf, comments and all. It is written when you save.",
            "Copied {from} to maps/{name}.conf, comments and all. Nothing is on disk yet; it is written when you save.",
            "Copied {from} to maps/{name}.conf line for line, comments and all. Nothing is on disk yet: it is written when you save.",
        ],
        yue: [
            "已經將 {from} 複製做 maps/{name}.conf，連註解都照抄。儲存嗰陣先會寫入。",
            "已經將 {from} 複製做 maps/{name}.conf，連註解都照抄。儲存嗰陣先會寫入。",
            "已經將 {from} 複製做 maps/{name}.conf，連註解都照抄。儲存嗰陣先會寫入。",
            "已經將 {from} 複製做 maps/{name}.conf，連註解都照抄。磁碟上而家仲未有；儲存嗰陣先會寫入。",
            "已經將 {from} 一行一行複製做 maps/{name}.conf，連註解都照抄。磁碟上而家仲未有，儲存嗰陣先會寫入。",
        ],
    },
    /*
     * A bullet inside the delete gate, sitting under `config.maps.deleteFile`. Deleting the
     * config does not delete the tiles, so what actually stops is the serving of them, and
     * every level says exactly that rather than the easier and wrong "the map is deleted".
     */
    "config.maps.deleteId": {
        en: [
            'The map id "{id}", so its tiles stop being served',
            'The map id "{id}", so its tiles stop being served',
            'The map id "{id}", so its tiles stop being served',
            'The map id "{id}", so the web app stops serving its tiles',
            'The map id "{id}", so the web app stops serving its tiles and visitors stop finding them',
        ],
        yue: [
            "地圖 id「{id}」，所以佢啲圖磚唔會再供應出去",
            "地圖 id「{id}」，所以佢啲圖磚唔會再供應出去",
            "地圖 id「{id}」，所以佢啲圖磚唔會再供應出去",
            "地圖 id「{id}」，即係網頁應用唔會再供應佢啲圖磚",
            "地圖 id「{id}」，即係網頁應用唔會再供應佢啲圖磚，訪客亦搵唔返",
        ],
    },
    "config.maps.deleted": {
        en: [
            "{path} will be deleted when you save.",
            "{path} will be deleted when you save.",
            "{path} will be deleted when you save.",
            "{path} will be deleted when you save. Until then it is still on disk.",
            "{path} will be deleted when you save. Until you do, it is still sitting on disk, untouched.",
        ],
        yue: [
            "{path} 會喺你儲存嗰陣刪除。",
            "{path} 會喺你儲存嗰陣刪除。",
            "{path} 會喺你儲存嗰陣刪除。",
            "{path} 會喺你儲存嗰陣刪除。喺嗰之前佢仲喺磁碟度。",
            "{path} 會喺你儲存嗰陣刪除。你未儲存之前，佢仲好地地喺磁碟度，冇人郁過。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Storages: naming one, testing one, deleting one                   */
    /* ---------------------------------------------------------------- */

    "config.storages.pick": {
        en: [
            "Pick a storage on the left, or add one.",
            "Pick a storage on the left, or add one.",
            "Pick a storage on the left, or add one.",
            "Pick a storage from the list on the left, or add a new one.",
            "Pick a storage from the list on the left, or add a new one. Nothing is selected right now.",
        ],
        yue: [
            "喺左邊揀一個儲存空間，或者加一個。",
            "喺左邊揀一個儲存空間，或者加一個。",
            "喺左邊揀一個儲存空間，或者加一個。",
            "喺左邊個清單度揀一個儲存空間，或者加一個新嘅。",
            "喺左邊個清單度揀一個儲存空間，或者加一個新嘅。而家一個都冇揀。",
        ],
    },
    "config.storages.subtitle": {
        en: [
            "Maps refer to this storage by the name {id}.",
            "Maps refer to this storage by the name {id}.",
            "Maps refer to this storage by the name {id}.",
            "Maps refer to this storage by the name {id}, exactly as written.",
            "Maps refer to this storage by the name {id}, exactly as written, character for character.",
        ],
        yue: [
            "地圖係用 {id} 呢個名嚟指住呢個儲存空間。",
            "地圖係用 {id} 呢個名嚟指住呢個儲存空間。",
            "地圖係用 {id} 呢個名嚟指住呢個儲存空間。",
            "地圖係用 {id} 呢個名嚟指住呢個儲存空間，一個字都要一樣。",
            "地圖係用 {id} 呢個名嚟指住呢個儲存空間，逐個字都要一模一樣。",
        ],
    },
    "config.storages.needName": {
        en: [
            "Give the file a name. Maps refer to a storage by that name.",
            "Give the file a name. Maps refer to a storage by that name.",
            "Give the file a name. Maps refer to a storage by that name.",
            "Give the file a name first. Maps refer to a storage by exactly that name.",
            "Give the file a name first. Maps refer to a storage by exactly that name, so a typo here is a broken map later.",
        ],
        yue: [
            "同個檔案改個名。地圖就係用呢個名嚟指住個儲存空間。",
            "同個檔案改個名。地圖就係用呢個名嚟指住個儲存空間。",
            "同個檔案改個名。地圖就係用呢個名嚟指住個儲存空間。",
            "先同個檔案改個名。地圖就係用呢個名嚟指住個儲存空間，一個字都唔可以差。",
            "先同個檔案改個名。地圖就係用呢個名嚟指住個儲存空間，一個字都唔可以差，打錯咗即係之後有張地圖載入唔到。",
        ],
    },
    "config.storages.fileNameHint": {
        en: [
            "A map points at this storage by exactly this name.",
            "A map points at this storage by exactly this name.",
            "A map points at this storage by exactly this name.",
            "A map points at this storage by exactly this name, so it has to match.",
            "A map points at this storage by exactly this name, so it has to match character for character.",
        ],
        yue: [
            "地圖就係用呢個名，一個字唔差咁指住呢個儲存空間。",
            "地圖就係用呢個名，一個字唔差咁指住呢個儲存空間。",
            "地圖就係用呢個名，一個字唔差咁指住呢個儲存空間。",
            "地圖就係用呢個名，一個字唔差咁指住呢個儲存空間，所以要夾得返。",
            "地圖就係用呢個名，一個字唔差咁指住呢個儲存空間，所以逐個字都要夾得返。",
        ],
    },
    "config.storages.nameTaken": {
        en: [
            "There is already a storages/{name}.conf.",
            "There is already a storages/{name}.conf.",
            "There is already a storages/{name}.conf.",
            "There is already a storages/{name}.conf in this folder.",
            "There is already a storages/{name}.conf in this folder, and nothing here will overwrite it.",
        ],
        yue: [
            "已經有一個 storages/{name}.conf。",
            "已經有一個 storages/{name}.conf。",
            "已經有一個 storages/{name}.conf。",
            "呢個資料夾入面已經有一個 storages/{name}.conf。",
            "呢個資料夾入面已經有一個 storages/{name}.conf，而呢度唔會幫你冚過佢。",
        ],
    },
    "config.storages.needRoot": {
        en: [
            "Say where the tiles go. Use the web app's own maps folder unless you have a reason not to.",
            "Say where the tiles go. Use the web app's own maps folder unless you have a reason not to.",
            "Say where the tiles go. Use the web app's own maps folder unless you have a reason not to.",
            "Say where the tiles go. Use the web app's own maps folder unless you have a good reason not to.",
            "Say where the tiles go. Use the web app's own maps folder unless you have a genuinely good reason not to, because everything else has to find them there.",
        ],
        yue: [
            "話俾佢知啲圖磚擺去邊。除非你有理由唔咁做，否則用網頁應用自己嗰個 maps 資料夾。",
            "話俾佢知啲圖磚擺去邊。除非你有理由唔咁做，否則用網頁應用自己嗰個 maps 資料夾。",
            "話俾佢知啲圖磚擺去邊。除非你有理由唔咁做，否則用網頁應用自己嗰個 maps 資料夾。",
            "話俾佢知啲圖磚擺去邊。除非你有好理由唔咁做，否則就用網頁應用自己嗰個 maps 資料夾。",
            "話俾佢知啲圖磚擺去邊。除非你真係有好理由唔咁做，否則就用網頁應用自己嗰個 maps 資料夾，因為其他嘢都要喺嗰度搵佢哋。",
        ],
    },
    "config.storages.created": {
        en: [
            "Added storages/{name}.conf. It is written when you save.",
            "Added storages/{name}.conf. It is written when you save.",
            "Added storages/{name}.conf. It is written when you save.",
            "Added storages/{name}.conf. Nothing is on disk yet; it is written when you save.",
            "Added storages/{name}.conf. Nothing is on disk yet: it is written when you save, not before.",
        ],
        yue: [
            "已加入 storages/{name}.conf。儲存嗰陣先會寫入。",
            "已加入 storages/{name}.conf。儲存嗰陣先會寫入。",
            "已加入 storages/{name}.conf。儲存嗰陣先會寫入。",
            "已加入 storages/{name}.conf。磁碟上而家仲未有；儲存嗰陣先會寫入。",
            "已加入 storages/{name}.conf。磁碟上而家仲未有，要儲存嗰陣先會寫入，之前唔會。",
        ],
    },
    /*
     * Switching a storage between file and SQL leaves the other type's settings sitting in
     * the file. Nothing is thrown away, which is the reassuring half, and the validator will
     * flag them as unknown, which is the actionable half. Both survive every level.
     */
    "config.storages.switched": {
        en: [
            "This storage is now {type}. The settings the other type used are still in the file; remove any the validator flags as unknown.",
            "This storage is now {type}. The settings the other type used are still in the file; remove any the validator flags as unknown.",
            "This storage is now {type}. The settings the other type used are still in the file; remove any the validator flags as unknown.",
            "This storage is now {type}. The settings the other type used are still sitting in the file, so remove any the validator flags as unknown.",
            "This storage is now {type}. The settings the other type used are still sitting in the file, nothing was thrown away, so remove any the validator flags as unknown.",
        ],
        yue: [
            "呢個儲存空間而家係 {type}。之前嗰種類型用嘅設定仲留喺個檔案度；驗證器標示為未知嗰啲，自己刪走。",
            "呢個儲存空間而家係 {type}。之前嗰種類型用嘅設定仲留喺個檔案度；驗證器標示為未知嗰啲，自己刪走。",
            "呢個儲存空間而家係 {type}。之前嗰種類型用嘅設定仲留喺個檔案度；驗證器標示為未知嗰啲，自己刪走。",
            "呢個儲存空間而家係 {type}。之前嗰種類型用嘅設定仲原封不動咁留喺個檔案度，所以驗證器標示為未知嗰啲，記得自己刪走。",
            "呢個儲存空間而家係 {type}。之前嗰種類型用嘅設定一樣都冇掉，仲原封不動咁留喺個檔案度，所以驗證器標示為未知嗰啲，記得自己刪走。",
        ],
    },
    "config.storages.needUrl": {
        en: [
            "Fill in the connection URL first.",
            "Fill in the connection URL first.",
            "Fill in the connection URL first.",
            "Fill in the connection URL first. There is nothing to connect to yet.",
            "Fill in the connection URL first. Right now there is nothing to connect to.",
        ],
        yue: [
            "請先填咗個連線 URL。",
            "請先填咗個連線 URL。",
            "請先填咗個連線 URL。",
            "請先填咗個連線 URL，而家仲未有嘢連得到。",
            "請先填咗個連線 URL。而家根本冇嘢可以連。",
        ],
    },
    /*
     * A probe that threw is neither a pass nor a failure, and saying either would be a lie
     * about somebody's database. Every level reports exactly the state it is in.
     */
    "config.storages.probeThrew": {
        en: [
            "The connection attempt did not complete.",
            "The connection attempt did not complete.",
            "The connection attempt did not complete.",
            "The connection attempt did not complete, so nothing is known about that database yet.",
            "The connection attempt did not complete, so nothing at all is known about that database yet. It is not a pass and it is not a failure.",
        ],
        yue: [
            "今次連線嘗試冇完成到。",
            "今次連線嘗試冇完成到。",
            "今次連線嘗試冇完成到。",
            "今次連線嘗試冇完成到，所以個資料庫嘅情況一無所知。",
            "今次連線嘗試冇完成到，所以個資料庫係點完全一無所知。唔算通過，亦唔算失敗。",
        ],
    },
    /*
     * The other half of the storage delete gate, and the half a playful rewrite is most
     * tempted to drop because it is the boring sentence. Dropping it turns "your config file
     * is going" into "your rendered world is going", so NOT stays shouted at every level.
     */
    "config.storages.deleteKeepsTiles": {
        en: [
            "Tiles that are already written are NOT deleted. Removing the config only stops BlueMap using it.",
            "Tiles that are already written are NOT deleted. Removing the config only stops BlueMap using it.",
            "Tiles that are already written are NOT deleted. Removing the config only stops BlueMap using it.",
            "Tiles that are already written are NOT deleted. Removing the config only stops BlueMap using it; the tiles stay exactly where they are.",
            "Tiles that are already written are NOT deleted. Removing the config only stops BlueMap using it, so every tile stays exactly where it is until you go and remove it yourself.",
        ],
        yue: [
            "已經寫咗出嚟嘅圖磚係唔會刪除嘅。刪走個設定檔淨係令 BlueMap 唔再用佢。",
            "已經寫咗出嚟嘅圖磚係唔會刪除嘅。刪走個設定檔淨係令 BlueMap 唔再用佢。",
            "已經寫咗出嚟嘅圖磚係唔會刪除嘅。刪走個設定檔淨係令 BlueMap 唔再用佢。",
            "已經寫咗出嚟嘅圖磚係唔會刪除嘅。刪走個設定檔淨係令 BlueMap 唔再用佢；啲圖磚會原封不動咁留喺原位。",
            "已經寫咗出嚟嘅圖磚一隻都唔會刪。刪走個設定檔淨係令 BlueMap 唔再用佢，所以每一隻圖磚都會原封不動咁留喺原位，直到你自己去刪。",
        ],
    },
    "config.storages.deleted": {
        en: [
            "{path} will be deleted when you save.",
            "{path} will be deleted when you save.",
            "{path} will be deleted when you save.",
            "{path} will be deleted when you save. It is still on disk until then.",
            "{path} will be deleted when you save. Until then it is still on disk, and the tiles it points at are untouched either way.",
        ],
        yue: [
            "{path} 會喺你儲存嗰陣刪除。",
            "{path} 會喺你儲存嗰陣刪除。",
            "{path} 會喺你儲存嗰陣刪除。",
            "{path} 會喺你儲存嗰陣刪除。喺嗰之前佢仲喺磁碟度。",
            "{path} 會喺你儲存嗰陣刪除。喺嗰之前佢仲喺磁碟度，而佢指住嘅圖磚無論點都唔會郁到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Marker sets inside a map config                                   */
    /* ---------------------------------------------------------------- */

    /*
     * The scope sentence exists because this editor shows containers, not contents. Somebody
     * who thinks the markers themselves are being edited here will look for a marker they
     * cannot find, so "passed through exactly as written" is pinned in all ten strings.
     */
    "config.markers.scope": {
        en: [
            "These are the markers written into the map config itself. Their container settings are edited below; the markers inside each set are passed through exactly as written.",
            "These are the markers written into the map config itself. Their container settings are edited below; the markers inside each set are passed through exactly as written.",
            "These are the markers written into the map config itself. Their container settings are edited below; the markers inside each set are passed through exactly as written.",
            "These are the markers written into the map config itself. Their container settings are edited below, and the markers inside each set are passed through exactly as written.",
            "These are the markers written into the map config itself. Their container settings are edited below, and the markers inside each set are passed through exactly as written, untouched and unreformatted.",
        ],
        yue: [
            "呢啲係寫喺地圖設定檔本身入面嘅標記。下面編輯嘅係佢哋嘅容器設定；每個組入面嘅標記會原文照傳，一個字都唔改。",
            "呢啲係寫喺地圖設定檔本身入面嘅標記。下面編輯嘅係佢哋嘅容器設定；每個組入面嘅標記會原文照傳，一個字都唔改。",
            "呢啲係寫喺地圖設定檔本身入面嘅標記。下面編輯嘅係佢哋嘅容器設定；每個組入面嘅標記會原文照傳，一個字都唔改。",
            "呢啲係寫喺地圖設定檔本身入面嘅標記。下面編輯嘅係佢哋嘅容器設定，而每個組入面嘅標記會原文照傳，一個字都唔改。",
            "呢啲係寫喺地圖設定檔本身入面嘅標記。下面編輯嘅係佢哋嘅容器設定，而每個組入面嘅標記會原文照傳，一個字都唔改，亦唔會幫你重新排版。",
        ],
    },
    "config.markers.empty": {
        en: [
            "No marker sets in this map config.",
            "No marker sets in this map config.",
            "No marker sets in this map config.",
            "No marker sets in this map config yet.",
            "No marker sets in this map config yet. Add one below if this map needs them.",
        ],
        yue: [
            "呢個地圖設定檔冇任何標記組。",
            "呢個地圖設定檔冇任何標記組。",
            "呢個地圖設定檔冇任何標記組。",
            "呢個地圖設定檔而家仲未有任何標記組。",
            "呢個地圖設定檔而家仲未有任何標記組。呢張地圖要用嘅話，喺下面加一個。",
        ],
    },
    "config.markers.duplicate": {
        en: [
            "There is already a marker set called {id}.",
            "There is already a marker set called {id}.",
            "There is already a marker set called {id}.",
            "There is already a marker set called {id} in this map config.",
            "There is already a marker set called {id} in this map config, and nothing here will overwrite it.",
        ],
        yue: [
            "已經有一個叫 {id} 嘅標記組。",
            "已經有一個叫 {id} 嘅標記組。",
            "已經有一個叫 {id} 嘅標記組。",
            "呢個地圖設定檔入面已經有一個叫 {id} 嘅標記組。",
            "呢個地圖設定檔入面已經有一個叫 {id} 嘅標記組，而呢度唔會幫你冚過佢。",
        ],
    },
    "config.markers.notAnObject": {
        en: [
            "Markers are an object keyed by marker id, not a list.",
            "Markers are an object keyed by marker id, not a list.",
            "Markers are an object keyed by marker id, not a list.",
            "Markers are an object keyed by marker id, not a list. This one is a list, so it cannot be read.",
            "Markers are an object keyed by marker id, not a list. This one arrived as a list, so nothing here can read it.",
        ],
        yue: [
            "Markers 係一個以標記 id 做 key 嘅 object，唔係一個 list。",
            "Markers 係一個以標記 id 做 key 嘅 object，唔係一個 list。",
            "Markers 係一個以標記 id 做 key 嘅 object，唔係一個 list。",
            "Markers 係一個以標記 id 做 key 嘅 object，唔係一個 list。呢個係 list，所以讀唔到。",
            "Markers 係一個以標記 id 做 key 嘅 object，唔係一個 list。呢個入嚟嗰陣係 list，所以呢度讀唔到佢。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The run screen: what BlueMap is actually asked to do              */
    /* ---------------------------------------------------------------- */

    "config.run.blurb": {
        en: [
            "The other half of the setup: what BlueMap is actually asked to do when it starts. Every flag the command line accepts is here.",
            "The other half of the setup: what BlueMap is actually asked to do when it starts. Every flag the command line accepts is here.",
            "The other half of the setup: what BlueMap is actually asked to do when it starts. Every flag the command line accepts is here.",
            "The other half of the setup: what BlueMap is actually asked to do when it starts. Every flag the command line accepts is here, with nothing held back.",
            "The other half of the setup: what BlueMap is actually asked to do when it starts. Every flag the command line accepts is here, all of them, including the ones nobody uses.",
        ],
        yue: [
            "設定嘅另一半：BlueMap 開機嗰陣實際上被要求做啲咩。指令列接受嘅每一個旗標都喺呢度。",
            "設定嘅另一半：BlueMap 開機嗰陣實際上被要求做啲咩。指令列接受嘅每一個旗標都喺呢度。",
            "設定嘅另一半：BlueMap 開機嗰陣實際上被要求做啲咩。指令列接受嘅每一個旗標都喺呢度。",
            "設定嘅另一半：BlueMap 開機嗰陣實際上被要求做啲咩。指令列接受嘅每一個旗標都喺呢度，一個都冇收埋。",
            "設定嘅另一半：BlueMap 開機嗰陣實際上被要求做啲咩。指令列接受嘅每一個旗標都喺呢度，一個都冇少，連冇人用嗰啲都有。",
        ],
    },
    "config.run.badPattern": {
        en: [
            "The pattern is not valid, so nothing is shown.",
            "The pattern is not valid, so nothing is shown.",
            "The pattern is not valid, so no flags are shown.",
            "That pattern is not valid, so no flags are shown. Every flag is still there.",
            "That pattern is not valid, so no flags are shown. Every flag is still there; the pattern is the part that needs fixing.",
        ],
        yue: [
            "個 pattern 唔正確，所以乜都冇顯示。",
            "個 pattern 唔正確，所以乜都冇顯示。",
            "個 pattern 唔正確，所以冇顯示任何旗標。",
            "個 pattern 唔正確，所以冇顯示任何旗標。每個旗標都仲喺度。",
            "個 pattern 唔正確，所以冇顯示任何旗標。每個旗標都仲好地地喺度，要修嘅係個 pattern。",
        ],
    },
    "config.run.matches": {
        en: [
            "{shown} of {total} flags match.",
            "{shown} of {total} flags match.",
            "{shown} of {total} flags match.",
            "{shown} of {total} flags match the search.",
            "{shown} of {total} flags match the search. The rest are filtered out, not removed.",
        ],
        yue: [
            "{total} 個旗標入面有 {shown} 個符合。",
            "{total} 個旗標入面有 {shown} 個符合。",
            "{total} 個旗標入面有 {shown} 個符合。",
            "{total} 個旗標之中有 {shown} 個符合搜尋。",
            "{total} 個旗標之中有 {shown} 個符合搜尋。其餘嘅係篩走咗，唔係冇咗。",
        ],
    },
    /*
     * `{maps}` and `{force}` are both filled from FIXED fragments below, so this sentence's
     * job is to hold them in the right order and never to paraphrase either of them.
     */
    "config.run.doRender": {
        en: [
            "Renders {maps}, {force}.",
            "Renders {maps}, {force}.",
            "Renders {maps}, {force}.",
            "This run renders {maps}, {force}.",
            "This run renders {maps}, {force}. That is the actual work it does.",
        ],
        yue: [
            "會算 {maps}，{force}。",
            "會算 {maps}，{force}。",
            "會算 {maps}，{force}。",
            "今次執行會算 {maps}，{force}。",
            "今次執行會算 {maps}，{force}。呢個就係佢實際做嘅嘢。",
        ],
    },
    /*
     * One of the three `{force}` fragments, and the only one with two halves to lose: the
     * edges *and* the changed chunks. Its siblings are FIXED because they are single facts;
     * this one is voiced so the pair can be pinned and still read naturally at level 5.
     */
    "config.run.forceEdge": {
        en: [
            "re-rendering the map edges as well as changed chunks",
            "re-rendering the map edges as well as changed chunks",
            "re-rendering the map edges as well as changed chunks",
            "re-rendering the map edges as well as the chunks that changed",
            "re-rendering the map edges too, not just the chunks that changed",
        ],
        yue: [
            "連地圖邊緣同改動過嘅 chunk 一齊重新算",
            "連地圖邊緣同改動過嘅 chunk 一齊重新算",
            "連地圖邊緣同改動過嘅 chunk 一齊重新算",
            "連地圖邊緣都會重新算，唔淨止改動過嘅 chunk",
            "連地圖邊緣都會一齊重新算，唔係淨計改動過嘅 chunk",
        ],
    },
    "config.run.doWatch": {
        en: [
            "Then keeps watching for changes and keeps the map up to date.",
            "Then keeps watching for changes and keeps the map up to date.",
            "Then keeps watching for changes and keeps the map up to date.",
            "Then keeps watching for changes and keeps the map up to date, without stopping.",
            "Then stays running, watching for changes and keeping the map up to date until you stop it.",
        ],
        yue: [
            "跟住會繼續監察改動，令張地圖保持最新。",
            "跟住會繼續監察改動，令張地圖保持最新。",
            "跟住會繼續監察改動，令張地圖保持最新。",
            "跟住會一路監察改動，令張地圖保持最新，唔會停。",
            "跟住會一路行落去，監察改動，令張地圖保持最新，直到你叫停佢為止。",
        ],
    },
    "config.run.doWebappInRender": {
        en: [
            "Regenerates the web app as part of that render.",
            "Regenerates the web app as part of that render.",
            "Regenerates the web app as part of that render.",
            "Regenerates the web app as part of that same render.",
            "Regenerates the web app as part of that same render, so it is not a separate run.",
        ],
        yue: [
            "會喺嗰次算圖入面順手重新產生個網頁應用。",
            "會喺嗰次算圖入面順手重新產生個網頁應用。",
            "會喺嗰次算圖入面順手重新產生個網頁應用。",
            "會喺同一次算圖入面順手重新產生個網頁應用。",
            "會喺同一次算圖入面順手重新產生個網頁應用，唔使另外行多次。",
        ],
    },
    "config.run.doMarkers": {
        en: [
            "Updates the markers from the map configs.",
            "Updates the markers from the map configs.",
            "Updates the markers from the map configs.",
            "Updates the markers, reading them from the map configs.",
            "Updates the markers, reading them straight out of the map configs.",
        ],
        yue: [
            "會由地圖設定檔更新啲標記。",
            "會由地圖設定檔更新啲標記。",
            "會由地圖設定檔更新啲標記。",
            "會讀返啲地圖設定檔，更新啲標記。",
            "會直接由啲地圖設定檔度讀返出嚟，更新啲標記。",
        ],
    },
    "config.run.doWebapp": {
        en: [
            "Generates the web app files.",
            "Generates the web app files.",
            "Generates the web app files.",
            "Generates the web app files, and nothing else.",
            "Generates the web app files, and nothing else at all.",
        ],
        yue: [
            "會產生個網頁應用嘅檔案。",
            "會產生個網頁應用嘅檔案。",
            "會產生個網頁應用嘅檔案。",
            "會產生個網頁應用嘅檔案，其他乜都唔做。",
            "會產生個網頁應用嘅檔案，其他嘢一樣都唔會做。",
        ],
    },
    "config.run.doSettings": {
        en: [
            "Updates settings.json for the web app.",
            "Updates settings.json for the web app.",
            "Updates settings.json for the web app.",
            "Updates settings.json, the file the web app reads.",
            "Updates settings.json, which is the one file the web app reads to find its maps.",
        ],
        yue: [
            "會更新畀網頁應用用嘅 settings.json。",
            "會更新畀網頁應用用嘅 settings.json。",
            "會更新畀網頁應用用嘅 settings.json。",
            "會更新 settings.json，即係網頁應用會讀嗰個檔。",
            "會更新 settings.json，即係網頁應用用嚟搵啲地圖嗰個檔。",
        ],
    },
    "config.run.doServer": {
        en: [
            "Starts the built-in web server.",
            "Starts the built-in web server.",
            "Starts the built-in web server.",
            "Starts the built-in web server, and leaves it running.",
            "Starts the built-in web server and leaves it running until you stop it.",
        ],
        yue: [
            "會啟動內置嘅網頁伺服器。",
            "會啟動內置嘅網頁伺服器。",
            "會啟動內置嘅網頁伺服器。",
            "會啟動內置嘅網頁伺服器，然後由得佢行。",
            "會啟動內置嘅網頁伺服器，之後一路行到你叫停佢為止。",
        ],
    },
    "config.run.doServerVerbose": {
        en: [
            "Starts the built-in web server and logs every request.",
            "Starts the built-in web server and logs every request.",
            "Starts the built-in web server and logs every request.",
            "Starts the built-in web server and writes a log line for every request.",
            "Starts the built-in web server and writes a log line for every request that comes in, without exception.",
        ],
        yue: [
            "會啟動內置嘅網頁伺服器，同埋記錄每一個請求。",
            "會啟動內置嘅網頁伺服器，同埋記錄每一個請求。",
            "會啟動內置嘅網頁伺服器，同埋記錄每一個請求。",
            "會啟動內置嘅網頁伺服器，每一個請求都會寫低一行 log。",
            "會啟動內置嘅網頁伺服器，入嚟每一個請求都會寫低一行 log，一個都唔會漏。",
        ],
    },
    "config.run.doGenerate": {
        en: [
            "Writes any config file that is missing from the folder before doing anything else.",
            "Writes any config file that is missing from the folder before doing anything else.",
            "Writes any config file that is missing from the folder before doing anything else.",
            "Writes any config file that is missing from the folder first, before doing anything else.",
            "Writes any config file that is missing from the folder first, before doing anything else at all. Files already there are left alone.",
        ],
        yue: [
            "會喺做任何嘢之前，將資料夾入面缺咗嘅設定檔寫返出嚟。",
            "會喺做任何嘢之前，將資料夾入面缺咗嘅設定檔寫返出嚟。",
            "會喺做任何嘢之前，將資料夾入面缺咗嘅設定檔寫返出嚟。",
            "會喺做任何嘢之前，先將資料夾入面缺咗嘅設定檔寫返出嚟。",
            "會喺做任何嘢之前，先將資料夾入面缺咗嘅設定檔寫返出嚟；已經有嗰啲唔會郁。",
        ],
    },
    /*
     * A render needs the Minecraft client jar, and the consent for that lives in this app's
     * own settings rather than in any BlueMap config. Every level names the jar, names Mojang
     * as where it comes from, and says the run stops before it starts, because "would fail"
     * on its own sends somebody debugging their config folder for an hour.
     */
    "config.run.consentMissing": {
        en: [
            "This run renders, which needs the Minecraft client jar from Mojang. That is accepted once in the app's own settings and has not been yet, so the run would stop before it starts.",
            "This run renders, which needs the Minecraft client jar from Mojang. That is accepted once in the app's own settings and has not been yet, so the run would stop before it starts.",
            "This run renders, which needs the Minecraft client jar from Mojang. That is accepted once in the app's own settings and has not been yet, so the run would stop before it starts.",
            "This run renders, which needs the Minecraft client jar from Mojang. That is accepted once in the app's own settings, and it has not been yet, so the run would stop before it starts.",
            "This run renders, and rendering needs the Minecraft client jar from Mojang. That is accepted once in the app's own settings, it has not been yet, so the run would stop before it starts.",
        ],
        yue: [
            "今次執行會算圖，而算圖需要 Mojang 嘅 Minecraft client jar。呢樣嘢喺程式自己嘅設定度接受一次就得，但而家仲未接受過，所以今次執行未開始就會停低。",
            "今次執行會算圖，而算圖需要 Mojang 嘅 Minecraft client jar。呢樣嘢喺程式自己嘅設定度接受一次就得，但而家仲未接受過，所以今次執行未開始就會停低。",
            "今次執行會算圖，而算圖需要 Mojang 嘅 Minecraft client jar。呢樣嘢喺程式自己嘅設定度接受一次就得，但而家仲未接受過，所以今次執行未開始就會停低。",
            "今次執行會算圖，而算圖需要 Mojang 嘅 Minecraft client jar。呢樣嘢喺程式自己嘅設定度接受一次就得，不過而家仲未接受過，所以今次執行未開始就會停低。",
            "今次執行會算圖，而算圖一定要 Mojang 嘅 Minecraft client jar。呢樣嘢喺程式自己嘅設定度接受一次就搞掂，但而家仲未接受過，所以今次執行未開始就會停低。",
        ],
    },
    /*
     * The single most expensive mistake this screen can prevent. BlueMap resolves the storage
     * root against the working directory, so a relative config path renders a whole world
     * into whatever folder the shell happened to be sitting in. All three of "absolute config
     * folder", "working directory" and "relative path" are pinned.
     */
    "config.run.absoluteNote": {
        en: [
            "Always pass an absolute config folder. BlueMap resolves the storage root and the data folder against the working directory, not against the config folder, so a relative path writes tiles wherever the program happened to be started.",
            "Always pass an absolute config folder. BlueMap resolves the storage root and the data folder against the working directory, not against the config folder, so a relative path writes tiles wherever the program happened to be started.",
            "Always pass an absolute config folder. BlueMap resolves the storage root and the data folder against the working directory, not against the config folder, so a relative path writes tiles wherever the program happened to be started.",
            "Always pass an absolute config folder. BlueMap resolves the storage root and the data folder against the working directory, not against the config folder, so a relative path writes tiles wherever the program happened to be started from.",
            "Always pass an absolute config folder. BlueMap resolves the storage root and the data folder against the working directory rather than against the config folder, so a relative path scatters tiles wherever the program happened to be started from, which is rarely where you wanted them.",
        ],
        yue: [
            "永遠都要傳一個絕對路徑嘅設定資料夾。BlueMap 係用工作目錄，而唔係設定資料夾，去解析儲存空間根目錄同資料目錄，所以用相對路徑嘅話，啲圖磚會寫咗去程式啟動嗰陣啱啱身處嘅地方。",
            "永遠都要傳一個絕對路徑嘅設定資料夾。BlueMap 係用工作目錄，而唔係設定資料夾，去解析儲存空間根目錄同資料目錄，所以用相對路徑嘅話，啲圖磚會寫咗去程式啟動嗰陣啱啱身處嘅地方。",
            "永遠都要傳一個絕對路徑嘅設定資料夾。BlueMap 係用工作目錄，而唔係設定資料夾，去解析儲存空間根目錄同資料目錄，所以用相對路徑嘅話，啲圖磚會寫咗去程式啟動嗰陣啱啱身處嘅地方。",
            "永遠都要傳一個絕對路徑嘅設定資料夾。BlueMap 係用工作目錄，唔係設定資料夾，去解析儲存空間根目錄同資料目錄，所以用相對路徑嘅話，啲圖磚會寫咗去程式啟動嗰陣啱啱身處嘅地方。",
            "永遠都要傳一個絕對路徑嘅設定資料夾。BlueMap 係用工作目錄，唔係設定資料夾，去解析儲存空間根目錄同資料目錄，所以一用相對路徑，啲圖磚就會散落喺程式啟動嗰陣啱啱身處嘅地方，通常都唔係你想要嗰度。",
        ],
    },
    "config.run.copied": {
        en: [
            "Copied the command exactly as shown.",
            "Copied the command exactly as shown.",
            "Copied the command to the clipboard, exactly as shown.",
            "Copied the command to the clipboard, exactly as shown, nothing added.",
            "Copied the command to the clipboard exactly as shown, nothing added and nothing tidied up.",
        ],
        yue: [
            "已經完全照畫面顯示咁複製咗個指令。",
            "已經完全照畫面顯示咁複製咗個指令。",
            "已經完全照畫面顯示咁將個指令複製到剪貼簿。",
            "已經完全照畫面顯示咁將個指令複製到剪貼簿，一個字都冇加。",
            "已經完全照畫面顯示咁將個指令複製到剪貼簿，一個字都冇加，亦冇幫你執靚佢。",
        ],
    },
    "config.run.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "Could not reach the clipboard, so nothing was copied. The command is still on screen to copy by hand.",
            "Could not reach the clipboard, so nothing was copied. The command is still sitting on screen, ready to be copied by hand.",
        ],
        yue: [
            "接觸唔到剪貼簿。",
            "接觸唔到剪貼簿。",
            "接觸唔到剪貼簿，所以乜都冇複製到。",
            "接觸唔到剪貼簿，所以乜都冇複製到。個指令仲喺畫面度，可以自己揀嚟複製。",
            "接觸唔到剪貼簿，所以乜都冇複製到。個指令仲好地地喺畫面度，可以自己揀返嚟複製。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The save dialog: what it would write, and what it would delete    */
    /* ---------------------------------------------------------------- */

    "config.apply.nothing": {
        en: [
            "Nothing has changed, so nothing would be written.",
            "Nothing has changed, so nothing would be written.",
            "Nothing has changed, so nothing would be written.",
            "Nothing has changed, so nothing would be written to the folder.",
            "Nothing has changed, so nothing would be written to the folder. Saving now would be a very quiet operation.",
        ],
        yue: [
            "冇任何改動，所以唔會寫任何嘢入去。",
            "冇任何改動，所以唔會寫任何嘢入去。",
            "冇任何改動，所以唔會寫任何嘢入去。",
            "冇任何改動，所以唔會寫任何嘢入嗰個資料夾。",
            "冇任何改動，所以唔會寫任何嘢入嗰個資料夾。而家儲存嘅話，會係一個好靜嘅操作。",
        ],
    },
    "config.apply.reRenderTitle": {
        en: [
            "Tiles that are already rendered become wrong.",
            "Tiles that are already rendered become wrong.",
            "Tiles that are already rendered become wrong.",
            "Tiles that are already rendered become wrong after this.",
            "Tiles that are already rendered become wrong the moment this is saved.",
        ],
        yue: [
            "已經算好嘅圖磚會變成錯嘅。",
            "已經算好嘅圖磚會變成錯嘅。",
            "已經算好嘅圖磚會變成錯嘅。",
            "呢個改動之後，已經算好嘅圖磚會變成錯嘅。",
            "一儲存落去，已經算好嘅圖磚就會變成錯嘅。",
        ],
    },
    /*
     * A sentence fragment: the dialog prints the changed field's label and then this, so it
     * starts lower case and never grows a subject of its own.
     */
    "config.apply.reRenderGeneric": {
        en: [
            "changes how tiles are produced.",
            "changes how tiles are produced.",
            "changes how tiles are produced.",
            "changes how the tiles are produced.",
            "changes how the tiles are produced, so the old ones no longer match.",
        ],
        yue: [
            "改變咗啲圖磚點樣產生。",
            "改變咗啲圖磚點樣產生。",
            "改變咗啲圖磚點樣產生。",
            "改變咗啲圖磚係點樣產生出嚟。",
            "改變咗啲圖磚係點樣產生出嚟，所以舊嗰啲夾唔返。",
        ],
    },
    "config.apply.blocked": {
        en: [
            "Fix the problems above first. BlueMap would refuse to start with these.",
            "Fix the problems above first. BlueMap would refuse to start with these.",
            "Fix the problems above first. BlueMap would refuse to start with these.",
            "Fix the problems above first. BlueMap would refuse to start with these in place.",
            "Fix the problems above first. BlueMap would refuse to start at all with these in place.",
        ],
        yue: [
            "請先修好上面啲問題。BlueMap 見到呢啲會拒絕啟動。",
            "請先修好上面啲問題。BlueMap 見到呢啲會拒絕啟動。",
            "請先修好上面啲問題。BlueMap 見到呢啲會拒絕啟動。",
            "請先修好上面啲問題。呢啲仲喺度嘅話，BlueMap 會拒絕啟動。",
            "請先修好上面啲問題。呢啲仲喺度嘅話，BlueMap 連啟動都會拒絕。",
        ],
    },
    /*
     * The line above the two-key gate, and the most consequential sentence on this surface.
     * Four facts have to survive: the folder the files leave, that the list below is what
     * goes, that this application keeps no copy, and that it cannot put them back. A level
     * that keeps the joke and drops the third is a level that has promised an undo.
     */
    "config.apply.deleteAction": {
        en: [
            "Saving now deletes the files listed below from {folder}. They leave the disk, this application keeps no copy of them, and it cannot put them back.",
            "Saving now deletes the files listed below from {folder}. They leave the disk, this application keeps no copy of them, and it cannot put them back.",
            "Saving now deletes the files listed below from {folder}. They leave the disk, this application keeps no copy of them, and it cannot put them back.",
            "Saving now deletes the files listed below from {folder}. They leave the disk for good: this application keeps no copy of them, and it cannot put them back.",
            "Saving now deletes the files listed below from {folder}. They leave the disk and do not come back: this application keeps no copy of them, and it cannot put them back, however nicely it is asked.",
        ],
        yue: [
            "而家儲存就會由 {folder} 刪除下面列出嘅檔案。佢哋會離開磁碟，呢個程式冇留低任何副本，亦都放唔返佢哋返去。",
            "而家儲存就會由 {folder} 刪除下面列出嘅檔案。佢哋會離開磁碟，呢個程式冇留低任何副本，亦都放唔返佢哋返去。",
            "而家儲存就會由 {folder} 刪除下面列出嘅檔案。佢哋會離開磁碟，呢個程式冇留低任何副本，亦都放唔返佢哋返去。",
            "而家儲存就會由 {folder} 刪除下面列出嘅檔案。佢哋會永遠離開磁碟：呢個程式冇留低任何副本，亦都放唔返佢哋返去。",
            "而家儲存就會由 {folder} 刪除下面列出嘅檔案。佢哋會離開磁碟，唔會返嚟：呢個程式冇留低任何副本，亦都放唔返佢哋返去，你點好聲同佢講都冇用。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The two-key gate in front of a destructive save                   */
    /* ---------------------------------------------------------------- */

    /*
     * `superConfirm.*` in `appCopy.ts` says the same three things for the generic gate. These
     * are the config screen's own copy for its own instance of it, worded apart so that a
     * reader who has met the generic one does not read this as the app repeating itself.
     */
    "config.confirm.keys": {
        en: [
            "Turn both keys, then drag the slider all the way across.",
            "Turn both keys, then drag the slider all the way across.",
            "Turn both keys, then drag the slider all the way across.",
            "Turn both keys first, then drag the slider all the way across. Both of them, and the whole way.",
            "Turn both keys first, then drag the slider all the way across. Both keys, the whole way, no shortcuts. This gate is meant to be slow.",
        ],
        yue: [
            "扭開兩條鎖匙，然後將拉桿一路拖到另一邊。",
            "扭開兩條鎖匙，然後將拉桿一路拖到另一邊。",
            "扭開兩條鎖匙，然後將拉桿一路拖到另一邊。",
            "先扭開兩條鎖匙，再將拉桿一路拖到另一邊。兩條都要扭，而且要拖到底。",
            "先扭開兩條鎖匙，再將拉桿一路拖到另一邊。兩條鎖匙都要，成條路都要行，冇捷徑。呢道閘本來就係整到慢㗎。",
        ],
    },
    "config.confirm.locked": {
        en: [
            "Both keys are needed before the slider will move.",
            "Both keys are needed before the slider will move.",
            "Both keys are needed before the slider will move.",
            "Both keys are needed before the slider will move at all.",
            "Both keys are needed before the slider will move so much as a pixel.",
        ],
        yue: [
            "兩條鎖匙都扭埋，拉桿先會郁得。",
            "兩條鎖匙都扭埋，拉桿先會郁得。",
            "兩條鎖匙都扭埋，拉桿先會郁得。",
            "兩條鎖匙都要扭埋，個拉桿先會郁得。",
            "兩條鎖匙都要扭埋，個拉桿先會肯郁，一格都唔會例外。",
        ],
    },
    "config.confirm.armed": {
        en: [
            "Armed. Drag the slider to the end to confirm.",
            "Armed. Drag the slider to the end to confirm.",
            "Armed. Drag the slider to the end to confirm.",
            "Armed. Drag the slider all the way to the end to confirm.",
            "Armed. Drag the slider all the way to the end to confirm. It only counts at the end.",
        ],
        yue: [
            "已解鎖。將拉桿拖到尾就確認。",
            "已解鎖。將拉桿拖到尾就確認。",
            "已解鎖。將拉桿拖到尾就確認。",
            "已解鎖。將個拉桿一路拖到尾就確認。",
            "已解鎖。將個拉桿一路拖到尾先算確認，拖到一半唔計。",
        ],
    },
    "config.confirm.done": {
        en: [
            "Authorized.",
            "Authorized.",
            "Authorized.",
            "Authorized. Both keys turned, slider all the way across.",
            "Authorized. Both keys turned, slider all the way across, and the gate is open.",
        ],
        yue: [
            "已授權。",
            "已授權。",
            "已授權。",
            "已授權。兩條鎖匙都扭咗，拉桿亦都拖到底。",
            "已授權。兩條鎖匙都扭咗，拉桿亦都拖到底，道閘開得。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CONFIGFILES_FIXED = {
    /* ---------------------------------------------------------------- */
    /* The config-folder shell: toolbar, pickers, search                 */
    /* ---------------------------------------------------------------- */

    "config.shell.open": { en: "Open or import a config folder", yue: "開啟或匯入設定資料夾" },
    "config.shell.new": { en: "New config folder", yue: "新設定資料夾" },
    "config.shell.reload": { en: "Re-read from disk", yue: "由磁碟重新讀入" },
    "config.shell.reading": { en: "Reading a config folder", yue: "讀緊設定資料夾" },
    "config.shell.saving": { en: "Saving a config folder", yue: "儲存緊設定資料夾" },
    "config.shell.tabsLabel": { en: "Config screens", yue: "設定畫面" },
    "config.shell.windowLabel": { en: "The options editor", yue: "選項編輯器" },
    "config.shell.pickFolder": {
        en: "Choose a BlueMap config folder",
        yue: "揀一個 BlueMap 設定資料夾",
    },
    "config.shell.pickNewFolder": {
        en: "Choose where the config folder goes",
        yue: "揀個設定資料夾擺喺邊",
    },
    "config.shell.errorCount": { en: "{n} problems", yue: "{n} 個問題" },
    "config.shell.unsaved": { en: "Unsaved changes", yue: "有未儲存嘅改動" },
    "config.shell.search": { en: "Search every setting", yue: "搵晒所有設定" },
    "config.shell.searchHint": {
        en: "name, key, or anything in the explanation",
        yue: "名、key，或者解釋入面任何字",
    },
    /* Appended to a search result whose setting lives on a different screen. */
    "config.shell.otherScreen": { en: "on another screen", yue: "喺另一個畫面" },

    /* ---------------------------------------------------------------- */
    /* Maps                                                              */
    /* ---------------------------------------------------------------- */

    "config.maps.listLabel": { en: "Maps", yue: "地圖" },
    "config.maps.search": { en: "Search maps", yue: "搵地圖" },
    "config.maps.searchHint": {
        en: "file name, map id or display name",
        yue: "檔案名、地圖 id 或者顯示名",
    },
    "config.maps.hasError": { en: "problem", yue: "有問題" },
    "config.maps.new": { en: "New map", yue: "新地圖" },
    "config.maps.newTitle": { en: "New map", yue: "新地圖" },
    "config.maps.duplicate": { en: "Duplicate", yue: "複製一份" },
    "config.maps.duplicateTitle": { en: "Duplicate this map", yue: "複製呢張地圖" },
    "config.maps.copyOf": { en: "Copy of {name}", yue: "{name} 嘅副本" },
    "config.maps.fileName": { en: "File name", yue: "檔案名" },
    "config.maps.displayName": { en: "Name shown in the web app", yue: "網頁應用度顯示嘅名" },
    "config.maps.world": { en: "World folder", yue: "世界資料夾" },
    "config.maps.browse": { en: "Browse", yue: "瀏覽" },
    "config.maps.pickWorld": { en: "Choose the world folder", yue: "揀個世界資料夾" },
    "config.maps.dimension": { en: "Dimension", yue: "維度" },
    "config.maps.dimensionType": { en: "Dimension type", yue: "維度類型" },
    "config.maps.sorting": { en: "Sorting", yue: "排序" },
    "config.maps.storagesAvailable": {
        en: "Storages available: {list}",
        yue: "可用嘅儲存空間：{list}",
    },
    "config.maps.cancel": { en: "Cancel", yue: "取消" },
    "config.maps.create": { en: "Add the map", yue: "加入呢張地圖" },
    "config.maps.deleteTitle": { en: "Delete this map config", yue: "刪除呢個地圖設定檔" },
    "config.maps.deleteConfirm": { en: "Delete the map config", yue: "刪除個地圖設定檔" },
    "config.maps.delete": { en: "Delete", yue: "刪除" },
    /*
     * The first bullet in the delete gate. It is FIXED rather than voiced because its whole
     * job is to put the exact path in front of the reader before anything else is said about
     * it, and a restyled noun phrase can only get in the way of that.
     */
    "config.maps.deleteFile": { en: "The file {path}", yue: "檔案 {path}" },

    /* ---------------------------------------------------------------- */
    /* Storages                                                          */
    /* ---------------------------------------------------------------- */

    "config.storages.listLabel": { en: "Storages", yue: "儲存空間" },
    "config.storages.search": { en: "Search storages", yue: "搵儲存空間" },
    "config.storages.sql": { en: "SQL", yue: "SQL" },
    "config.storages.file": { en: "File", yue: "檔案" },
    "config.storages.new": { en: "New storage", yue: "新儲存空間" },
    "config.storages.newTitle": { en: "New storage", yue: "新儲存空間" },
    "config.storages.type": { en: "Storage type", yue: "儲存空間類型" },
    "config.storages.fileName": { en: "File name", yue: "檔案名" },
    "config.storages.root": { en: "Folder for rendered tiles", yue: "放算好圖磚嘅資料夾" },
    "config.storages.browse": { en: "Browse", yue: "瀏覽" },
    "config.storages.pickRoot": {
        en: "Choose the folder for rendered tiles",
        yue: "揀個資料夾放算好嘅圖磚",
    },
    "config.storages.test": { en: "Test the connection", yue: "測試連線" },
    "config.storages.testingNow": { en: "Connecting", yue: "連緊" },
    "config.storages.testing": { en: "Testing a database connection", yue: "測試緊資料庫連線" },
    "config.storages.usedBy": { en: "Used by {maps}", yue: "{maps} 用緊" },
    "config.storages.cancel": { en: "Cancel", yue: "取消" },
    "config.storages.create": { en: "Add the storage", yue: "加入呢個儲存空間" },
    "config.storages.deleteTitle": {
        en: "Delete this storage config",
        yue: "刪除呢個儲存空間設定檔",
    },
    "config.storages.deleteConfirm": {
        en: "Delete the storage config",
        yue: "刪除個儲存空間設定檔",
    },
    "config.storages.delete": { en: "Delete", yue: "刪除" },
    "config.storages.deleteFile": { en: "The file {path}", yue: "檔案 {path}" },

    /* ---------------------------------------------------------------- */
    /* Marker sets                                                       */
    /* ---------------------------------------------------------------- */

    "config.markers.count": { en: "{n} markers", yue: "{n} 個標記" },
    "config.markers.label": { en: "Label shown in the menu", yue: "選單度顯示嘅標籤" },
    "config.markers.sorting": { en: "Sorting", yue: "排序" },
    "config.markers.toggleable": {
        en: "Visitors can turn this set off",
        yue: "訪客可以熄咗呢一組",
    },
    "config.markers.defaultHidden": {
        en: "Hidden until a visitor turns it on",
        yue: "預設隱藏，訪客開咗先見到",
    },
    "config.markers.raw": { en: "Markers, as written in the file", yue: "標記，照檔案入面原文" },
    "config.markers.removeSet": { en: "Remove this marker set", yue: "移除呢個標記組" },
    "config.markers.newId": { en: "New marker set id", yue: "新標記組 id" },
    "config.markers.add": { en: "Add", yue: "加入" },

    /* ---------------------------------------------------------------- */
    /* The run screen                                                    */
    /* ---------------------------------------------------------------- */

    "config.run.title": { en: "Run", yue: "執行" },
    "config.run.search": { en: "Search flags", yue: "搵旗標" },
    "config.run.searchHint": {
        en: "name, option or anything in the description",
        yue: "名、選項，或者說明入面任何字",
    },
    "config.run.willDo": { en: "What this run does", yue: "今次執行會做咩" },
    /* The two `{maps}` fragments and two of the three `{force}` fragments of doRender. */
    "config.run.allMaps": { en: "every map", yue: "每一張地圖" },
    "config.run.onlyMaps": { en: "only {list}", yue: "淨係 {list}" },
    "config.run.forceAll": { en: "re-rendering everything", yue: "全部重新算過" },
    "config.run.forceNone": { en: "only the chunks that changed", yue: "淨係算改動過嘅 chunk" },
    "config.run.openConsent": { en: "Open the setting", yue: "開個設定" },
    "config.run.command": { en: "The command", yue: "個指令" },
    "config.run.argCount": { en: "{n} arguments", yue: "{n} 個引數" },
    "config.run.copy": { en: "Copy", yue: "複製" },

    /* ---------------------------------------------------------------- */
    /* The save dialog                                                   */
    /* ---------------------------------------------------------------- */

    "config.apply.files": { en: "Files", yue: "檔案" },
    "config.apply.fileCount": {
        en: "{writes} written, {deletes} deleted",
        yue: "寫入 {writes} 個，刪除 {deletes} 個",
    },
    "config.apply.newFile": { en: "New file", yue: "新檔案" },
    /* The list subtitle that answers "will this eat my comments". It answers: no. */
    "config.apply.updated": { en: "Updated, keeping its comments", yue: "更新咗，註解照留" },
    "config.apply.willDelete": { en: "Deleted from the folder", yue: "由資料夾刪除" },
    "config.apply.changes": { en: "What changes", yue: "有咩改動" },
    "config.apply.reRender": { en: "re-render", yue: "要重新算" },
    "config.apply.deleteTitle": {
        en: "Delete files from the config folder",
        yue: "由設定資料夾刪除檔案",
    },
    "config.apply.confirm": { en: "Write the files", yue: "寫入啲檔案" },

    /* ---------------------------------------------------------------- */
    /* The two-key gate                                                  */
    /* ---------------------------------------------------------------- */

    "config.confirm.keyOne": { en: "Key 1", yue: "鎖匙 1" },
    "config.confirm.keyTwo": { en: "Key 2", yue: "鎖匙 2" },
    "config.confirm.travel": {
        en: "{percent} percent of the way across",
        yue: "拖到全程嘅 {percent}%",
    },
    "config.confirm.exit": { en: "Emergency exit", yue: "緊急退出" },

    /*
     * The accessible names of the config screen's own window and tab strip. Both are read
     * aloud rather than displayed, and the config screen puts a tab strip inside a windowed
     * host, so a screen reader meets two unnamed landmarks in a row without them. They were
     * missing from the generated work list because both calls sit inside `:window-label="…"`
     * and `:strip-label="…"` attribute expressions.
     */
} as const satisfies Record<string, FixedString>;

export const CONFIGFILES_FACTS = {
    /* The shell: what was read, what was left alone, what is not on disk yet. */
    "config.shell.welcome": { en: ["Nothing is open"], yue: ["未開"] },
    "config.shell.welcomeBody": { en: ["BlueMap", "config files"], yue: ["BlueMap", "設定檔"] },
    "config.shell.openHint": {
        en: ["BlueMap", "comments and all"],
        yue: ["BlueMap", "註解"],
    },
    "config.shell.opened": {
        en: ["{files}", "{folder}", "{maps}", "{storages}"],
        yue: ["{files}", "{folder}", "{maps}", "{storages}"],
    },
    // "left exactly as they are" is the whole answer to "what did it do to my other files".
    "config.shell.unknownFiles": {
        en: ["{n}", "not BlueMap configs", "left exactly as they are"],
        yue: ["{n}", "BlueMap", "原封不動"],
    },
    "config.shell.pickWorld": {
        en: ["world folder", "level.dat"],
        yue: ["世界資料夾", "level.dat"],
    },
    "config.shell.generated": {
        en: ["{folder}", "on disk until you save"],
        yue: ["{folder}", "未儲存"],
    },
    "config.shell.preview": {
        en: ["not on disk", "cannot write", "example"],
        yue: ["唔喺磁碟", "寫唔到", "例子"],
    },
    "config.shell.draft": {
        en: ["BlueMap", "Nothing is on disk yet"],
        yue: ["BlueMap", "磁碟上仲未有任何嘢"],
    },
    "config.shell.consentApplied": {
        en: ["accept-download", "core.conf", "written when you save"],
        yue: ["accept-download", "core.conf", "儲存嗰陣先會寫入"],
    },
    "config.shell.browserMode": {
        en: ["cannot reach a file system", "opened or saved", "copied out"],
        yue: ["檔案系統", "開唔到", "複製出嚟"],
    },

    "config.shell.badPattern": {
        en: ["pattern is not valid", "nothing is listed"],
        yue: ["pattern 唔正確", "冇列出嚟"],
    },
    "config.shell.total": { en: ["{n}", "settings", "every screen"], yue: ["{n}", "設定", "畫面"] },
    "config.shell.found": {
        en: ["{shown}", "{total}", "{screens}"],
        yue: ["{shown}", "{total}", "{screens}"],
    },
    "config.shell.noMatches": { en: ["Nothing matches", "screen"], yue: ["冇符合", "畫面"] },
    "config.shell.missingCore": { en: ["no core.conf"], yue: ["冇 core.conf"] },
    "config.shell.missingWebapp": { en: ["no webapp.conf"], yue: ["冇 webapp.conf"] },
    "config.shell.missingWebserver": { en: ["no webserver.conf"], yue: ["冇 webserver.conf"] },
    // Why it is absent matters more than that it is absent: this one is not a defect.
    "config.shell.missingPlugin": {
        en: ["plugin.conf", "command-line BlueMap never writes one", "server plugin"],
        yue: ["plugin.conf", "從來唔會寫", "伺服器 plugin"],
    },

    "config.shell.noFolder": { en: ["config folder", "first"], yue: ["設定資料夾", "先"] },
    "config.shell.noFolderPath": {
        en: ["config set", "not attached", "folder"],
        yue: ["設定檔", "未連住", "資料夾"],
    },
    "config.shell.nothingToSave": { en: ["Nothing has changed"], yue: ["冇任何改動"] },
    // Saving wrote config, not tiles. Dropping "rendered again" hides a whole stale map.
    "config.shell.needsRender": {
        en: ["{maps}", "rendered again", "what you saved"],
        yue: ["{maps}", "重新算過", "儲存咗"],
    },
    "config.shell.saveFailed": { en: ["not written"], yue: ["冇寫入到"] },

    /* Maps. */
    "config.maps.badPattern": {
        en: ["pattern is not valid", "listed"],
        yue: ["pattern 唔正確", "列出"],
    },
    "config.maps.listSummary": {
        en: ["{shown}", "{total}", "maps"],
        yue: ["{shown}", "{total}", "地圖"],
    },
    "config.maps.none": {
        en: ["No maps", "BlueMap", "render"],
        yue: ["仲未有地圖", "BlueMap", "算"],
    },
    "config.maps.noMatch": { en: ["No map matches"], yue: ["冇地圖符合"] },
    "config.maps.pick": { en: ["map", "left"], yue: ["左邊", "地圖"] },
    "config.maps.subtitle": {
        en: ["{id}", "BlueMap", "this one file"],
        yue: ["{id}", "BlueMap", "呢一個檔案"],
    },
    "config.maps.needName": { en: ["name", "map id"], yue: ["名", "地圖 id"] },
    "config.maps.needWorld": {
        en: ["world folder", "level.dat"],
        yue: ["世界資料夾", "level.dat"],
    },
    // The id ends up in every tile URL, so renaming later moves every URL with it.
    "config.maps.idNote": {
        en: ["{id}", "BlueMap", "map id", "tile URL"],
        yue: ["{id}", "BlueMap", "地圖 id", "圖磚 URL"],
    },
    "config.maps.templateNote": {
        en: ["BlueMap", "template", "every setting explained"],
        yue: ["BlueMap", "範本", "每個設定都有解釋"],
    },
    "config.maps.created": {
        en: ["maps/{name}.conf", "written when you save"],
        yue: ["maps/{name}.conf", "儲存嗰陣先會寫入"],
    },
    "config.maps.duplicateNote": {
        en: ["Every setting and every comment", "copied exactly", "displayed name"],
        yue: ["每個設定同每段註解", "原原本本", "顯示名"],
    },
    "config.maps.cloned": {
        en: ["{from}", "maps/{name}.conf", "comments and all", "written when you save"],
        yue: ["{from}", "maps/{name}.conf", "註解", "儲存嗰陣先會寫入"],
    },
    // What stops is the serving of the tiles, not the tiles themselves.
    "config.maps.deleteId": { en: ["{id}", "map id", "tiles"], yue: ["{id}", "地圖 id", "圖磚"] },
    "config.maps.deleted": {
        en: ["{path}", "deleted when you save"],
        yue: ["{path}", "儲存嗰陣刪除"],
    },

    /* Storages. */
    "config.storages.pick": { en: ["storage", "left"], yue: ["左邊", "儲存空間"] },
    "config.storages.subtitle": {
        en: ["{id}", "Maps refer to this storage"],
        yue: ["{id}", "指住呢個儲存空間"],
    },
    "config.storages.needName": {
        en: ["name", "Maps refer to a storage"],
        yue: ["名", "地圖", "儲存空間"],
    },
    "config.storages.fileNameHint": {
        en: ["exactly this name", "storage"],
        yue: ["呢個名", "儲存空間"],
    },
    "config.storages.nameTaken": {
        en: ["storages/{name}.conf", "already"],
        yue: ["storages/{name}.conf", "已經有"],
    },
    "config.storages.needRoot": {
        en: ["where the tiles go", "web app's own maps folder"],
        yue: ["圖磚", "maps 資料夾"],
    },
    "config.storages.created": {
        en: ["storages/{name}.conf", "written when you save"],
        yue: ["storages/{name}.conf", "儲存嗰陣先會寫入"],
    },
    // Nothing was thrown away, and the validator will say which settings are now unknown.
    "config.storages.switched": {
        en: ["{type}", "still", "validator flags as unknown"],
        yue: ["{type}", "仲", "驗證器標示為未知"],
    },
    "config.storages.needUrl": { en: ["connection URL"], yue: ["連線 URL"] },
    "config.storages.probeThrew": {
        en: ["connection attempt did not complete"],
        yue: ["連線嘗試冇完成"],
    },
    // Drop this and the message inverts: the config goes, the rendered world does not.
    "config.storages.deleteKeepsTiles": {
        en: ["NOT deleted", "already written", "BlueMap"],
        yue: ["唔會刪", "已經寫咗", "BlueMap"],
    },
    "config.storages.deleted": {
        en: ["{path}", "deleted when you save"],
        yue: ["{path}", "儲存嗰陣刪除"],
    },

    /* Marker sets. */
    "config.markers.scope": {
        en: ["map config", "passed through exactly as written"],
        yue: ["地圖設定檔", "原文照傳"],
    },
    "config.markers.empty": { en: ["No marker sets", "map config"], yue: ["標記組", "地圖設定檔"] },
    "config.markers.duplicate": {
        en: ["{id}", "marker set", "already"],
        yue: ["{id}", "標記組", "已經有"],
    },
    "config.markers.notAnObject": {
        en: ["object keyed by marker id", "not a list"],
        yue: ["標記 id 做 key", "唔係一個 list"],
    },

    /* The run screen. */
    "config.run.blurb": {
        en: ["BlueMap", "Every flag the command line accepts"],
        yue: ["BlueMap", "指令列接受嘅每一個旗標"],
    },
    "config.run.badPattern": {
        en: ["pattern is not valid", "shown"],
        yue: ["pattern 唔正確", "顯示"],
    },
    "config.run.matches": {
        en: ["{shown}", "{total}", "flags"],
        yue: ["{shown}", "{total}", "旗標"],
    },
    "config.run.doRender": { en: ["{maps}", "{force}"], yue: ["{maps}", "{force}"] },
    // Both halves: the edges and the chunks that changed.
    "config.run.forceEdge": { en: ["map edges", "chunks"], yue: ["地圖邊緣", "chunk"] },
    "config.run.doWatch": {
        en: ["watching for changes", "up to date"],
        yue: ["監察改動", "保持最新"],
    },
    "config.run.doWebappInRender": { en: ["web app", "render"], yue: ["網頁應用", "算圖"] },
    "config.run.doMarkers": { en: ["markers", "map configs"], yue: ["標記", "地圖設定檔"] },
    "config.run.doWebapp": { en: ["web app files"], yue: ["網頁應用嘅檔案"] },
    "config.run.doSettings": {
        en: ["settings.json", "web app"],
        yue: ["settings.json", "網頁應用"],
    },
    "config.run.doServer": { en: ["built-in web server"], yue: ["內置嘅網頁伺服器"] },
    "config.run.doServerVerbose": {
        en: ["built-in web server", "every request"],
        yue: ["內置嘅網頁伺服器", "每一個請求"],
    },
    "config.run.doGenerate": {
        en: ["config file that is missing", "before doing anything else"],
        yue: ["缺咗嘅設定檔", "做任何嘢之前"],
    },
    // Where the consent lives, and that the run stops before it starts rather than mid-render.
    "config.run.consentMissing": {
        en: ["Minecraft client jar", "Mojang", "settings", "stop before it starts"],
        yue: ["Minecraft client jar", "Mojang", "設定", "未開始就會停低"],
    },
    "config.run.absoluteNote": {
        en: ["absolute config folder", "working directory", "relative path"],
        yue: ["絕對路徑", "工作目錄", "相對路徑"],
    },
    "config.run.copied": { en: ["command", "exactly as shown"], yue: ["指令", "照畫面顯示"] },
    "config.run.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },

    /* The save dialog. */
    "config.apply.nothing": {
        en: ["Nothing has changed", "nothing would be written"],
        yue: ["冇任何改動", "唔會寫任何嘢"],
    },
    "config.apply.reRenderTitle": {
        en: ["already rendered", "wrong"],
        yue: ["已經算好嘅圖磚", "錯"],
    },
    "config.apply.reRenderGeneric": {
        en: ["changes how", "tiles are produced"],
        yue: ["圖磚", "產生"],
    },
    "config.apply.blocked": {
        en: ["problems above", "BlueMap would refuse to start"],
        yue: ["上面啲問題", "BlueMap", "拒絕"],
    },
    // The folder, the list, no copy kept, no way back. All four, at every level.
    "config.apply.deleteAction": {
        en: ["{folder}", "listed below", "keeps no copy", "cannot put them back"],
        yue: ["{folder}", "下面列出", "冇留低任何副本", "放唔返"],
    },

    /* The two-key gate. */
    "config.confirm.keys": {
        en: ["both keys", "slider", "all the way"],
        yue: ["兩條鎖匙", "拉桿", "拖到"],
    },
    "config.confirm.locked": {
        en: ["Both keys", "slider will move"],
        yue: ["兩條鎖匙", "拉桿"],
    },
    "config.confirm.armed": {
        en: ["Armed", "slider", "to confirm"],
        yue: ["已解鎖", "拉桿", "確認"],
    },
    "config.confirm.done": { en: ["Authorized"], yue: ["已授權"] },
} as const satisfies Record<
    keyof typeof CONFIGFILES_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
