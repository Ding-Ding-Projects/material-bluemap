/**
 * The downloads screen: a release's assets, the rows that fetch them, and the ten endings
 * a fetch can have.
 *
 * The subject matter decides the register here more than anywhere else in the catalogue.
 * A release of this project carries worlds past GitHub's two-gigabyte asset cap, so they
 * arrive as 1.7 GB parts with a SHA-256 for each, and a download is tens of minutes of
 * work with four phases and real byte counts. Every one of those numbers is a fact a
 * playful rewrite is tempted to round off, and rounding any of them off produces a screen
 * that reads well and cannot be acted on.
 *
 * Three groups of facts are pinned in `DOWNLOADS_FACTS` and never move:
 *
 *  - **What survived.** Stopping, a dropped connection and a crash all keep the bytes
 *    already on disk, and every level says so, because the difference between "carries on"
 *    and "starts again" is twenty minutes of somebody's evening.
 *  - **What was deleted.** `downloads.fail.integrity` is the one failure where something
 *    was thrown away on purpose, and it reads as a failed download at every level. A
 *    corrupt file that looks complete is the worst outcome on this screen, so no level
 *    softens it into a retry suggestion.
 *  - **Where the file is.** Paths, archive names and folder names are identifiers and are
 *    identical in both languages. A translated path sends the reader looking for a file
 *    that does not exist.
 *
 * `downloads.listFailed` is deliberately not here. It lives in `appCopy.ts` already, and
 * a second copy of a key is a merge conflict with two right answers.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const DOWNLOADS_VOICED = {
    /* ---------------------------------------------------------------- */
    /* One download's row, while it runs and after it ends               */
    /* ---------------------------------------------------------------- */

    /*
     * Why there is no resume button, when the state would otherwise offer one. A row
     * adopted from a download id alone has no repository and no asset name, so there is
     * nothing to ask for a second time. Every level says where to start it from instead,
     * because a sentence that only explains an absence leaves the reader stuck.
     */
    "downloads.row.cannotResume": {
        en: [
            "This window does not know which release this came from, so it cannot ask for it again. Find it in the release above and start it from there.",
            "This window does not know which release this came from, so it cannot ask for it again. Find it in the release above and start it from there.",
            "This window does not know which release this came from, so it has nothing to ask for a second time. Find it in the release above and start it from there.",
            "This window has no idea which release this came from, so there is nothing for it to ask for a second time. Find it in the release above and start it from there.",
            "This window never learned which release this came from, so asking again would mean guessing, and guessing is not a download strategy. Find it in the release above and start it from there.",
        ],
        yue: [
            "呢個視窗唔知呢個下載係邊個 release 嚟嘅，所以冇辦法再叫多次。喺上面個 release 度搵返佢，由嗰度開始。",
            "呢個視窗唔知呢個下載係邊個 release 嚟嘅，所以冇辦法再叫多次。喺上面個 release 度搵返佢，由嗰度開始。",
            "呢個視窗唔知呢個下載係邊個 release 嚟嘅，所以根本冇嘢可以再叫多次。喺上面個 release 度搵返佢，由嗰度開始。",
            "呢個視窗完全唔知呢個下載係邊個 release 嚟嘅，連叫多次嘅對象都冇。喺上面個 release 度搵返佢，由嗰度開始。",
            "呢個視窗由頭到尾都唔知呢個下載係邊個 release 嚟嘅，再叫就要靠估，而靠估唔算係一種下載方法。喺上面個 release 度搵返佢，由嗰度開始。",
        ],
    },
    "downloads.row.stopping": {
        en: [
            "Stopping...",
            "Stopping...",
            "Stopping it now...",
            "Stopping it, mid byte...",
            "Stopping it. Telling the transfer to put the bytes down...",
        ],
        yue: [
            "停緊...",
            "停緊...",
            "而家停緊...",
            "停緊，停喺半個位元組度...",
            "停緊。而家同個傳輸講聲夠喇，放低啲位元組...",
        ],
    },
    /*
     * The note under the Stop button, and the note under a Stop button that is not there,
     * are two different promises and are kept apart. This one promises a resume; the next
     * one promises only that nothing is lost, because this build cannot stop anything.
     */
    "downloads.row.stopNote": {
        en: [
            "Stopping keeps every byte already transferred. Starting it again continues from there rather than beginning again.",
            "Stopping keeps every byte already transferred. Starting it again continues from there rather than beginning again.",
            "Stopping keeps every byte already transferred, so starting it again continues from there rather than beginning again.",
            "Stopping is not losing: every byte already transferred stays on disk, and starting it again continues from there rather than beginning again.",
            "Stopping costs nothing at all: every byte already transferred stays exactly where it is, and starting it again continues from there rather than crawling back to zero.",
        ],
        yue: [
            "撳停會保留已經傳咗嘅每一個位元組。再開始嘅時候會由嗰度繼續，而唔係由頭開始。",
            "撳停會保留已經傳咗嘅每一個位元組。再開始嘅時候會由嗰度繼續，而唔係由頭開始。",
            "撳停會保留已經傳咗嘅每一個位元組，所以再開始嘅時候會由嗰度繼續，唔使由頭開始。",
            "撳停唔等於白費：已經傳咗嘅每一個位元組都仲喺硬碟度，再開始嘅時候會由嗰度繼續，唔使由頭開始。",
            "撳停一個位元組都唔會蝕。已經傳咗嘅每一個位元組都好地地喺硬碟度，再開始嘅時候會由嗰度繼續，唔使爬返去零。",
        ],
    },
    "downloads.row.cannotStop": {
        en: [
            "This build cannot stop a download once it has started. It will run to the end or until the app is closed, and nothing already transferred is lost either way.",
            "This build cannot stop a download once it has started. It will run to the end or until the app is closed, and nothing already transferred is lost either way.",
            "This build cannot stop a download once it has started. It runs to the end, or until the app is closed, and nothing already transferred is lost either way.",
            "This build cannot stop a download once it has started, so the Stop button is not there to be pressed. It runs to the end or until the app is closed, and nothing already transferred is lost either way.",
            "This build cannot stop a download once it has started, so there is no button here that would do it. It runs to the end or until the app is closed, and either way nothing already transferred is lost.",
        ],
        yue: [
            "呢個版本一旦開始咗下載就停唔到。佢會行到完，或者行到程式閂咗為止，兩種情況下已經傳咗嘅嘢唔會冇咗。",
            "呢個版本一旦開始咗下載就停唔到。佢會行到完，或者行到程式閂咗為止，兩種情況下已經傳咗嘅嘢唔會冇咗。",
            "呢個版本一旦開始咗下載就停唔到。佢會一路行到完，或者行到程式閂咗為止，無論邊種情況，已經傳咗嘅嘢唔會冇咗。",
            "呢個版本一旦開始咗下載就停唔到，所以呢度冇個停止掣可以撳。佢會行到完，或者行到程式閂咗為止，無論點樣已經傳咗嘅嘢唔會冇咗。",
            "呢個版本一旦開始咗下載就停唔到，想撳都冇掣可撳。佢會一直行到完，或者行到程式閂咗為止；無論邊種結局，已經傳咗嘅嘢唔會冇咗。",
        ],
    },
    /*
     * "Verified" is the load-bearing word in both of these, not "downloaded". Every part
     * was checked against the checksum published beside it before anything was kept, and a
     * level that reports only the arrival has reported the cheaper half of the fact.
     */
    "downloads.row.finishedIn": {
        en: [
            "Downloaded and verified in {duration}. Every part matched the checksum published beside it.",
            "Downloaded and verified in {duration}. Every part matched the checksum published beside it.",
            "Downloaded and verified in {duration}: every part matched the checksum published beside it.",
            "Done in {duration}, downloaded and verified. Every part matched the checksum published beside it, byte for byte.",
            "All of it arrived in {duration}, downloaded and verified. Every single part matched the checksum published beside it, so nothing here is being taken on trust.",
        ],
        yue: [
            "已經下載完並且核對過，用咗 {duration}。每一部分都同旁邊公佈嘅 checksum 對得上。",
            "已經下載完並且核對過，用咗 {duration}。每一部分都同旁邊公佈嘅 checksum 對得上。",
            "已經下載完並且核對過，用咗 {duration}：每一部分都同旁邊公佈嘅 checksum 對得上。",
            "{duration} 搞掂，下載完亦都核對過。每一部分都同旁邊公佈嘅 checksum 對得上，一個位元組都冇差。",
            "成份嘢喺 {duration} 之內到齊，下載完亦都核對過。每一部分都同旁邊公佈嘅 checksum 對得上，冇一樣嘢係靠信任收貨。",
        ],
    },
    "downloads.row.finished": {
        en: [
            "Downloaded and verified. Every part matched the checksum published beside it.",
            "Downloaded and verified. Every part matched the checksum published beside it.",
            "Downloaded and verified: every part matched the checksum published beside it.",
            "Downloaded and verified. Every part matched the checksum published beside it, byte for byte.",
            "Downloaded and verified, all of it. Every single part matched the checksum published beside it, so none of this is being taken on trust.",
        ],
        yue: [
            "已經下載完並且核對過。每一部分都同旁邊公佈嘅 checksum 對得上。",
            "已經下載完並且核對過。每一部分都同旁邊公佈嘅 checksum 對得上。",
            "已經下載完並且核對過：每一部分都同旁邊公佈嘅 checksum 對得上。",
            "已經下載完並且核對過。每一部分都同旁邊公佈嘅 checksum 對得上，一個位元組都冇差。",
            "全部下載完，亦都核對過。每一部分都同旁邊公佈嘅 checksum 對得上，冇一樣係靠信任收貨。",
        ],
    },
    /*
     * A verified archive that was never unpacked. `{archive}` is a path and stays a path:
     * it is what somebody types into a file manager, and it is the only reason this
     * sentence is worth showing rather than a shrug.
     */
    "downloads.row.archiveAt": {
        en: [
            "The archive is at {archive}. It was not unpacked, so there is no folder to render yet.",
            "The archive is at {archive}. It was not unpacked, so there is no folder to render yet.",
            "The archive is sitting at {archive}. It was not unpacked, so there is no folder to render yet.",
            "The archive is sitting at {archive}, still zipped. It was not unpacked, so there is no folder to render yet.",
            "The archive is sitting at {archive}, in one piece and still a zip. It was not unpacked, so there is no folder to render yet.",
        ],
        yue: [
            "個壓縮檔喺 {archive}。佢冇解壓過，所以暫時冇資料夾可以攞去算圖。",
            "個壓縮檔喺 {archive}。佢冇解壓過，所以暫時冇資料夾可以攞去算圖。",
            "個壓縮檔而家擺喺 {archive}。佢冇解壓過，所以暫時冇資料夾可以攞去算圖。",
            "個壓縮檔而家擺喺 {archive}，仲係一舊 zip。佢冇解壓過，所以暫時冇資料夾可以攞去算圖。",
            "個壓縮檔好地地擺喺 {archive}，原封不動，仲係一舊 zip。佢冇解壓過，所以暫時冇資料夾可以攞去算圖。",
        ],
    },
    "downloads.row.cancelled": {
        en: [
            "You stopped this download. Every byte it had already transferred is still there, and starting it again carries on from where it stopped.",
            "You stopped this download. Every byte it had already transferred is still there, and starting it again carries on from where it stopped.",
            "You stopped this download. Every byte it had already transferred is still on disk, and starting it again carries on from where it stopped.",
            "You pressed Stop, and that is all that happened. Every byte it had already transferred is still on disk, and starting it again carries on from where it stopped.",
            "You pressed Stop, and nothing else came of it. Every byte it had already transferred is still sitting on disk, and starting it again carries on from exactly where it stopped.",
        ],
        yue: [
            "你撳停咗呢個下載。已經傳咗嘅每一個位元組都仲喺度，再開始嘅時候會由停低嗰個位接住落去。",
            "你撳停咗呢個下載。已經傳咗嘅每一個位元組都仲喺度，再開始嘅時候會由停低嗰個位接住落去。",
            "你撳停咗呢個下載。已經傳咗嘅每一個位元組都仲喺硬碟度，再開始嘅時候會由停低嗰個位接住落去。",
            "你撳咗停，就係咁多。已經傳咗嘅每一個位元組都仲喺硬碟度，再開始嘅時候會由停低嗰個位接住落去。",
            "你撳咗停，之後乜嘢都冇發生過。已經傳咗嘅每一個位元組都好地地喺硬碟度，再開始嘅時候會啱啱由停低嗰個位接住落去。",
        ],
    },
    "downloads.row.interrupted": {
        en: [
            "This download was still going when the app or the machine stopped, so it never got to write an ending. What it had already transferred is still there.",
            "This download was still going when the app or the machine stopped, so it never got to write an ending. What it had already transferred is still there.",
            "This download was still going when the app or the machine stopped, so it never wrote an ending for itself. What it had already transferred is still there.",
            "This download was still going when the app or the machine stopped, so it never got as far as writing an ending. What it had already transferred is still there, all of it.",
            "This download was still going when the app or the machine stopped, so it never got to write itself an ending and the record simply trails off. What it had already transferred is still there, all of it.",
        ],
        yue: [
            "程式或者部機停低嗰陣，呢個下載仲行緊，所以佢冇機會寫低個結局。已經傳咗嘅嘢仲喺度。",
            "程式或者部機停低嗰陣，呢個下載仲行緊，所以佢冇機會寫低個結局。已經傳咗嘅嘢仲喺度。",
            "程式或者部機停低嗰陣，呢個下載仲行緊，所以佢從來冇機會寫低自己個結局。已經傳咗嘅嘢仲喺度。",
            "程式或者部機停低嗰陣，呢個下載仲行緊，連寫低個結局嘅機會都冇。已經傳咗嘅嘢仲喺度，一件都冇少。",
            "程式或者部機停低嗰陣，呢個下載仲行緊，連寫低自己個結局都嚟唔切，段紀錄就咁斷咗尾。已經傳咗嘅嘢仲喺度，一件都冇少。",
        ],
    },
    /*
     * Shown instead of a settings button when nothing above this surface can open one. It
     * has to name the setting well enough to be found by hand, because pointing at a
     * setting nobody can locate is the same as saying nothing.
     */
    "downloads.row.settingsElsewhere": {
        en: [
            "The folder downloads are written into is in the app's own settings, beside where rendered maps are written. This surface has no way to open it from here.",
            "The folder downloads are written into is in the app's own settings, beside where rendered maps are written. This surface has no way to open it from here.",
            "The folder downloads are written into lives in the app's own settings, beside where rendered maps are written. This surface has no way to open it from here.",
            "The folder downloads are written into lives in the app's own settings, right beside where rendered maps are written. This surface has no way to open it from here, so it is pointing rather than offering a button.",
            "The folder downloads are written into lives in the app's own settings, right beside where rendered maps are written. This surface has no way to open it from here, so it is pointing at the door rather than pretending to hold it open.",
        ],
        yue: [
            "下載寫入邊個資料夾，係喺程式自己嘅設定裏面，就喺算好嘅地圖寫去邊嗰項旁邊。呢個畫面喺呢度開唔到嗰版設定。",
            "下載寫入邊個資料夾，係喺程式自己嘅設定裏面，就喺算好嘅地圖寫去邊嗰項旁邊。呢個畫面喺呢度開唔到嗰版設定。",
            "下載寫入邊個資料夾呢項，擺咗喺程式自己嘅設定裏面，就喺算好嘅地圖寫去邊嗰項旁邊。呢個畫面喺呢度開唔到嗰版設定。",
            "下載寫入邊個資料夾呢項，擺咗喺程式自己嘅設定裏面，就喺算好嘅地圖寫去邊嗰項隔籬。呢個畫面喺呢度開唔到嗰版設定，所以淨係可以指路，冇掣俾你撳。",
            "下載寫入邊個資料夾呢項，擺咗喺程式自己嘅設定裏面，就喺算好嘅地圖寫去邊嗰項隔籬。呢個畫面喺呢度開唔到嗰版設定，所以淨係識指住度門，唔會扮幫你揦住。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The ten endings a download can have                               */
    /* ---------------------------------------------------------------- */

    "downloads.fail.release": {
        en: [
            "That release could not be read. Either nothing is published under that tag, or it is private and this machine has not been given a token for it. A public release never needs one.",
            "That release could not be read. Either nothing is published under that tag, or it is private and this machine has not been given a token for it. A public release never needs one.",
            "That release could not be read. Either nothing is published under that tag at all, or it is private and this machine has not been given a token for it. A public release never needs one.",
            "That release could not be read. Either nothing is published under that tag, or it is private and this machine has never been handed a token for it. A public release never needs one, so a token is only worth chasing if the release really is private.",
            "That release refused to be read. Either nothing is published under that tag, or it is private and this machine was never handed a token for it. A public release never needs one, so go hunting for a token only if the release really is private.",
        ],
        yue: [
            "讀唔到嗰個 release。可能係嗰個 tag 下面根本冇嘢發佈過，亦可能佢係 private，而呢部機冇俾過 token 佢。公開嘅 release 從來唔需要 token。",
            "讀唔到嗰個 release。可能係嗰個 tag 下面根本冇嘢發佈過，亦可能佢係 private，而呢部機冇俾過 token 佢。公開嘅 release 從來唔需要 token。",
            "讀唔到嗰個 release。可能係嗰個 tag 下面根本冇發佈過任何嘢，亦可能佢係 private，而呢部機冇俾過 token 佢。公開嘅 release 從來唔需要 token。",
            "讀唔到嗰個 release。可能嗰個 tag 下面根本冇嘢發佈過，亦可能佢係 private，而呢部機從來冇攞過 token。公開嘅 release 從來唔需要 token，所以真係 private 先值得去搞個 token。",
            "嗰個 release 唔肯俾人讀。可能嗰個 tag 下面根本冇嘢發佈過，亦可能佢係 private，而呢部機由頭到尾冇攞過 token。公開嘅 release 從來唔需要 token，所以確定咗係 private 先好去搞。",
        ],
    },
    "downloads.fail.asset": {
        en: [
            "The release exists but carries nothing by that name. The names it does carry are listed below, and a split download is named by the whole file rather than by one of its parts.",
            "The release exists but carries nothing by that name. The names it does carry are listed below, and a split download is named by the whole file rather than by one of its parts.",
            "The release is there, but it carries nothing by that name. The names it does carry are listed below, and a split download is named by the whole file rather than by one of its parts.",
            "The release is there and perfectly healthy; it simply carries nothing by that name. The names it does carry are listed below, and a split download is named by the whole file rather than by one of its parts.",
            "The release is there and in good health. It just carries nothing by that name. The names it does carry are listed below, and remember that a split download is named by the whole file rather than by one of its parts, so a part number will never match.",
        ],
        yue: [
            "個 release 係存在嘅，但係入面冇一個叫呢個名嘅嘢。佢真正有嘅名列咗喺下面，另外分開部分嘅下載係用成個檔案嘅名，唔係用其中一份嘅名。",
            "個 release 係存在嘅，但係入面冇一個叫呢個名嘅嘢。佢真正有嘅名列咗喺下面，另外分開部分嘅下載係用成個檔案嘅名，唔係用其中一份嘅名。",
            "個 release 喺度，不過入面冇一個叫呢個名嘅嘢。佢真正有嘅名列咗喺下面，另外分開部分嘅下載係用成個檔案嘅名，唔係用其中一份嘅名。",
            "個 release 喺度，仲好地地，淨係入面冇一個叫呢個名嘅嘢。佢真正有嘅名列咗喺下面，另外分開部分嘅下載係用成個檔案嘅名，唔係用其中一份嘅名。",
            "個 release 喺度，健健康康，只係入面冇一個叫呢個名嘅嘢。佢真正有嘅名列咗喺下面；記住分開部分嘅下載係用成個檔案嘅名，唔係用其中一份嘅名，所以打份數點都對唔到。",
        ],
    },
    "downloads.fail.network": {
        en: [
            "The transfer stopped before it was done. Everything already on disk was kept, so starting it again continues from the byte it reached rather than beginning again.",
            "The transfer stopped before it was done. Everything already on disk was kept, so starting it again continues from the byte it reached rather than beginning again.",
            "The transfer stopped short of the end. Everything already on disk was kept, so starting it again continues from the byte it reached rather than beginning again.",
            "The transfer stopped short of the end, which is annoying and not expensive. Everything already on disk was kept, so starting it again continues from the byte it reached rather than beginning again.",
            "The transfer gave up short of the end. That is annoying and it is not expensive: everything already on disk was kept, so starting it again continues from the byte it reached rather than crawling back to zero.",
        ],
        yue: [
            "傳輸未完就停咗。已經喺硬碟嘅嘢都留低咗，所以再開始嘅時候會由停低嗰個位元組繼續，唔使由頭嚟過。",
            "傳輸未完就停咗。已經喺硬碟嘅嘢都留低咗，所以再開始嘅時候會由停低嗰個位元組繼續，唔使由頭嚟過。",
            "傳輸未行到尾就停咗。已經喺硬碟嘅嘢都留低咗，所以再開始嘅時候會由停低嗰個位元組繼續，唔使由頭嚟過。",
            "傳輸未行到尾就停咗，煩係煩，但唔蝕本。已經喺硬碟嘅嘢都留低咗，再開始嘅時候會由停低嗰個位元組繼續，唔使由頭嚟過。",
            "傳輸未行到尾就投降咗。煩係煩，但一蚊都唔蝕：已經喺硬碟嘅嘢都留低咗，再開始嘅時候會由停低嗰個位元組繼續，唔使爬返去零。",
        ],
    },
    "downloads.fail.manifest": {
        en: [
            "This download is published in parts, and the file describing how they fit together could not be read. Without it there is no safe way to rejoin them, so nothing was assembled.",
            "This download is published in parts, and the file describing how they fit together could not be read. Without it there is no safe way to rejoin them, so nothing was assembled.",
            "This download is published in parts, and the file describing how those parts fit together could not be read. Without it there is no safe way to rejoin them, so nothing was assembled.",
            "This download is published in parts, and the one file that describes how those parts fit together could not be read. Without it there is no safe way to rejoin them, so nothing was assembled and nothing was guessed at.",
            "This download is published in parts, and the single file that explains how those parts fit together could not be read. Without it there is no safe way to rejoin them, so nothing was assembled: a guessed join produces a file that looks fine and is not.",
        ],
        yue: [
            "呢個下載係分開部分發佈嘅，而講明佢哋點樣拼返埋一齊嗰個檔案讀唔到。冇咗佢就冇安全嘅方法拼返，所以乜都冇砌過。",
            "呢個下載係分開部分發佈嘅，而講明佢哋點樣拼返埋一齊嗰個檔案讀唔到。冇咗佢就冇安全嘅方法拼返，所以乜都冇砌過。",
            "呢個下載係分開部分發佈嘅，而講明啲部分點樣拼返埋一齊嗰個檔案讀唔到。冇咗佢就冇安全嘅方法拼返，所以乜都冇砌過。",
            "呢個下載係分開部分發佈嘅，而唯一講明啲部分點拼返埋一齊嗰個檔案讀唔到。冇咗佢就冇安全嘅方法拼返，所以乜都冇砌過，亦都冇靠估。",
            "呢個下載係分開部分發佈嘅，而唯一一個講明啲部分點拼返埋一齊嘅檔案讀唔到。冇咗佢就冇安全嘅方法拼返，所以乜都冇砌過：靠估拼出嚟嗰個檔案，睇落好地地，其實唔係。",
        ],
    },
    /*
     * The one failure on this screen where something was deliberately destroyed, and the
     * one the funny level must never soften. Level 5 states outright that this is a failed
     * download, because the temptation at that level is to write a friendly retry
     * suggestion around a corruption that has to be understood before it is retried. The
     * facts pin the checksum, the delete and the word "corrupt" in all ten strings.
     */
    "downloads.fail.integrity": {
        en: [
            "What arrived does not match the checksum published beside it, so it was deleted rather than kept. A file that is corrupt and looks complete is worse than no file: it unpacks cleanly and goes wrong later, somewhere else. Starting again re-fetches the part that disagreed.",
            "What arrived does not match the checksum published beside it, so it was deleted rather than kept. A file that is corrupt and looks complete is worse than no file: it unpacks cleanly and goes wrong later, somewhere else. Starting again re-fetches the part that disagreed.",
            "What arrived does not match the checksum published beside it, so it was deleted rather than kept. A file that is corrupt and looks complete is worse than no file at all: it unpacks cleanly and goes wrong later, somewhere else. Starting again re-fetches the part that disagreed.",
            "What arrived does not match the checksum published beside it, so it was deleted rather than kept. A file that is corrupt and looks complete is the worst of both: it unpacks cleanly and then goes wrong later, somewhere else, long after anybody would connect the two. Starting again re-fetches the part that disagreed.",
            "What arrived does not match the checksum published beside it, so it was deleted rather than kept. This is a failed download and it is being called one. A file that is corrupt and looks complete is the worst thing on this screen: it unpacks cleanly, behaves for a week, and then goes wrong somewhere else entirely. Starting again re-fetches the part that disagreed.",
        ],
        yue: [
            "收到嘅嘢同旁邊公佈嘅 checksum 對唔上，所以佢已經刪咗，冇留低。一個壞咗但係睇落完整嘅檔案，比冇檔案更加差：佢解壓得好順利，之後喺第度先出事。再開始會重新攞返對唔上嗰部分。",
            "收到嘅嘢同旁邊公佈嘅 checksum 對唔上，所以佢已經刪咗，冇留低。一個壞咗但係睇落完整嘅檔案，比冇檔案更加差：佢解壓得好順利，之後喺第度先出事。再開始會重新攞返對唔上嗰部分。",
            "收到嘅嘢同旁邊公佈嘅 checksum 對唔上，所以佢已經刪咗，冇留低。一個壞咗但係睇落完整嘅檔案，仲差過乜都冇：佢解壓得好順利，之後喺第度先出事。再開始會重新攞返對唔上嗰部分。",
            "收到嘅嘢同旁邊公佈嘅 checksum 對唔上，所以佢已經刪咗，冇留低。一個壞咗但係睇落完整嘅檔案係兩頭唔到岸：解壓順順利利，過幾日先喺第度出事，到時冇人會諗到係佢。再開始會重新攞返對唔上嗰部分。",
            "收到嘅嘢同旁邊公佈嘅 checksum 對唔上，所以佢已經刪咗，冇留低。呢個係一個失敗咗嘅下載，呢度就係咁叫佢。一個壞咗但係睇落完整嘅檔案係成個畫面最陰功嗰樣：解壓順順利利，乖乖哋做足一個禮拜，然後喺完全另一個地方出事。再開始會重新攞返對唔上嗰部分。",
        ],
    },
    /*
     * The good-news failure: the bytes are verified and kept, and only the unpack fell
     * over. "Nothing has to be downloaded again" is the fact somebody acts on, so it is
     * pinned; a level that led with the failure alone would have them re-fetching twenty
     * gigabytes for no reason.
     */
    "downloads.fail.extract": {
        en: [
            "The archive itself is verified and still on disk. Unpacking it is what failed, so nothing has to be downloaded again, and the message above says what the archive contained that could not be written.",
            "The archive itself is verified and still on disk. Unpacking it is what failed, so nothing has to be downloaded again, and the message above says what the archive contained that could not be written.",
            "The archive itself is verified and still on disk. Unpacking it is the part that failed, so nothing has to be downloaded again, and the message above says what the archive contained that could not be written.",
            "The good news first: the archive itself is verified and still on disk. Unpacking it is the part that failed, so nothing has to be downloaded again, and the message above says what the archive contained that could not be written.",
            "The good news first, because there is some: the archive itself is verified and still on disk, every byte of it. Unpacking is the part that fell over, so nothing has to be downloaded again, and the message above names what the archive contained that could not be written.",
        ],
        yue: [
            "個壓縮檔本身核對過，亦都仲喺硬碟度。失敗嘅係解壓呢一步，所以唔使再下載任何嘢，上面段訊息講咗個壓縮檔入面邊樣嘢寫唔到。",
            "個壓縮檔本身核對過，亦都仲喺硬碟度。失敗嘅係解壓呢一步，所以唔使再下載任何嘢，上面段訊息講咗個壓縮檔入面邊樣嘢寫唔到。",
            "個壓縮檔本身核對過，亦都仲喺硬碟度。出事嘅係解壓呢一步，所以唔使再下載任何嘢，上面段訊息講咗個壓縮檔入面邊樣嘢寫唔到。",
            "先講好消息：個壓縮檔本身核對過，亦都仲喺硬碟度。出事嘅係解壓呢一步，所以唔使再下載任何嘢，上面段訊息講咗個壓縮檔入面邊樣嘢寫唔到。",
            "先講好消息，因為真係有：個壓縮檔本身核對過，仲喺硬碟度，一個位元組都冇少。仆低嗰步係解壓，所以唔使再下載任何嘢，上面段訊息會講明個壓縮檔入面邊樣嘢寫唔到。",
        ],
    },
    "downloads.fail.storage": {
        en: [
            "The folder downloads are written into could not be created or written. It may be read-only, full, or on a drive that is not connected.",
            "The folder downloads are written into could not be created or written. It may be read-only, full, or on a drive that is not connected.",
            "The folder downloads are written into could not be created or written. It may be read-only, it may be full, or it may be on a drive that is not connected.",
            "The folder downloads are written into could not be created or written. Three usual suspects: it is read-only, it is full, or it is on a drive that is not connected.",
            "The folder downloads are written into could not be created or written, and the disk did not volunteer a reason. The usual three: it is read-only, it is full, or it is on a drive that is not connected.",
        ],
        yue: [
            "下載要寫入嗰個資料夾，建立唔到又寫唔到。可能係唯讀、滿咗，或者喺一個冇接駁嘅磁碟度。",
            "下載要寫入嗰個資料夾，建立唔到又寫唔到。可能係唯讀、滿咗，或者喺一個冇接駁嘅磁碟度。",
            "下載要寫入嗰個資料夾，建立唔到又寫唔到。可能佢係唯讀，可能滿咗，又或者喺一個冇接駁嘅磁碟度。",
            "下載要寫入嗰個資料夾，建立唔到又寫唔到。三個慣犯：唯讀、滿咗，或者喺一個冇接駁嘅磁碟度。",
            "下載要寫入嗰個資料夾，建立唔到又寫唔到，個碟又唔肯講點解。老規矩三揀一：唯讀、滿咗，或者喺一個冇接駁嘅磁碟度。",
        ],
    },
    "downloads.fail.request": {
        en: [
            "The download was refused before anything was transferred, so nothing was written. The message above says exactly which part of the request was refused.",
            "The download was refused before anything was transferred, so nothing was written. The message above says exactly which part of the request was refused.",
            "The download was refused before anything was transferred, so nothing was written at all. The message above says exactly which part of the request was refused.",
            "The download was refused before a single byte moved, so nothing was written. The message above says exactly which part of the request was refused.",
            "The download was refused before a single byte moved, so nothing was written and there is nothing to clean up. The message above says exactly which part of the request was refused.",
        ],
        yue: [
            "呢個下載喺傳輸任何嘢之前就俾人拒絕咗，所以冇寫過任何嘢。上面段訊息講咗係請求嘅邊一部分俾人拒絕。",
            "呢個下載喺傳輸任何嘢之前就俾人拒絕咗，所以冇寫過任何嘢。上面段訊息講咗係請求嘅邊一部分俾人拒絕。",
            "呢個下載喺傳輸任何嘢之前就已經俾人拒絕咗，所以完全冇寫過任何嘢。上面段訊息講明係請求嘅邊一部分俾人拒絕。",
            "一個位元組都未郁，呢個下載就已經俾人拒絕咗，所以冇寫過任何嘢。上面段訊息講明係請求嘅邊一部分俾人拒絕。",
            "一個位元組都未郁，呢個下載就已經俾人拒絕咗，所以冇寫過任何嘢，亦都冇手尾要執。上面段訊息講明係請求嘅邊一部分俾人拒絕。",
        ],
    },
    /*
     * A cancel that came back through the failure path. Somebody who pressed Stop must
     * never be shown an error, so every level says outright that this is not a failure.
     */
    "downloads.fail.cancelled": {
        en: [
            "You stopped it. Every byte already transferred is kept, and starting it again carries on from where it stopped.",
            "You stopped it. Every byte already transferred is kept, and starting it again carries on from where it stopped.",
            "You stopped it, which is not a failure. Every byte already transferred is kept, and starting it again carries on from where it stopped.",
            "You stopped it. That is not a failure and nothing here is broken. Every byte already transferred is kept, and starting it again carries on from where it stopped.",
            "You stopped it, which is a decision rather than a fault. Every byte already transferred is kept, and starting it again carries on from exactly where it stopped.",
        ],
        yue: [
            "係你撳停嘅。已經傳咗嘅每一個位元組都保留咗，再開始嘅時候會由停低嗰個位接住落去。",
            "係你撳停嘅。已經傳咗嘅每一個位元組都保留咗，再開始嘅時候會由停低嗰個位接住落去。",
            "係你撳停嘅，唔算失敗。已經傳咗嘅每一個位元組都保留咗，再開始嘅時候會由停低嗰個位接住落去。",
            "係你撳停嘅。呢個唔算失敗，亦都冇嘢壞咗：已經傳咗嘅每一個位元組都保留咗，再開始嘅時候會由停低嗰個位接住落去。",
            "係你撳停嘅，呢個係決定，唔係故障。已經傳咗嘅每一個位元組都保留咗，再開始嘅時候會啱啱由停低嗰個位接住落去。",
        ],
    },
    "downloads.fail.unknown": {
        en: [
            "The download stopped for a reason this screen has no specific answer for. The message above is the one the app itself reported.",
            "The download stopped for a reason this screen has no specific answer for. The message above is the one the app itself reported.",
            "The download stopped for a reason this screen has no specific answer for. The message above is the one the app itself reported, word for word.",
            "The download stopped for a reason this screen has no specific answer for, and inventing one would be worse than saying so. The message above is the one the app itself reported, word for word.",
            "The download stopped for a reason this screen has no specific answer for, and making one up would be worse than admitting it. The message above is the one the app itself reported, word for word and unedited.",
        ],
        yue: [
            "呢個下載停咗，而呢個畫面對呢個原因冇特定答案。上面段訊息係程式自己報出嚟嗰句。",
            "呢個下載停咗，而呢個畫面對呢個原因冇特定答案。上面段訊息係程式自己報出嚟嗰句。",
            "呢個下載停咗，而呢個畫面對呢個原因冇特定答案。上面段訊息係程式自己報出嚟嗰句，一隻字都冇改。",
            "呢個下載停咗，而呢個畫面對呢個原因冇特定答案；作個答案出嚟仲衰過認咗佢。上面段訊息係程式自己報出嚟嗰句，一隻字都冇改。",
            "呢個下載停咗，而呢個畫面對呢個原因冇特定答案；作個似模似樣嘅解釋出嚟，仲衰過老實認咗佢。上面段訊息係程式自己報出嚟嗰句，一隻字都冇改過。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What a release offers                                             */
    /* ---------------------------------------------------------------- */

    "downloads.assets.starting": {
        en: [
            "Starting...",
            "Starting...",
            "Starting it now...",
            "Starting it up...",
            "Starting. Asking GitHub for the first byte...",
        ],
        yue: [
            "開始緊...",
            "開始緊...",
            "而家開始緊...",
            "開始緊，準備出發...",
            "開始緊。而家同 GitHub 攞緊第一個位元組...",
        ],
    },
    "downloads.assets.none": {
        en: [
            "This release publishes nothing this app can download. A release that carries a world publishes it as a zip, on its own or in numbered parts.",
            "This release publishes nothing this app can download. A release that carries a world publishes it as a zip, on its own or in numbered parts.",
            "This release publishes nothing this app can download. A release that carries a world publishes it as a zip, either on its own or in numbered parts.",
            "This release publishes nothing this app can download, so there is nothing here to press. A release that carries a world publishes it as a zip, either on its own or in numbered parts.",
            "This release publishes nothing this app can download, so the list below is empty and honestly so. A release that carries a world publishes it as a zip, either on its own or in numbered parts.",
        ],
        yue: [
            "呢個 release 冇任何呢個程式下載到嘅嘢。一個載住世界嘅 release 會用 zip 發佈，可以係單獨一個，亦可以係編咗號嘅幾份。",
            "呢個 release 冇任何呢個程式下載到嘅嘢。一個載住世界嘅 release 會用 zip 發佈，可以係單獨一個，亦可以係編咗號嘅幾份。",
            "呢個 release 冇任何呢個程式下載到嘅嘢。一個載住世界嘅 release 會用 zip 發佈，可以係單獨一個，又或者係編咗號嘅幾份。",
            "呢個 release 冇任何呢個程式下載到嘅嘢，所以呢度冇嘢可以撳。一個載住世界嘅 release 會用 zip 發佈，可以係單獨一個，又或者係編咗號嘅幾份。",
            "呢個 release 冇任何呢個程式下載到嘅嘢，所以下面個清單係空嘅，而且係老實噉空。一個載住世界嘅 release 會用 zip 發佈，可以係單獨一個，又或者係編咗號嘅幾份。",
        ],
    },
    "downloads.assets.noMatch": {
        en: [
            "No file in this release matches that search. Clearing it brings the whole list back.",
            "No file in this release matches that search. Clearing it brings the whole list back.",
            "Nothing in this release matches that search. Clearing it brings the whole list back.",
            "Nothing in this release matches that search. Nothing has been removed either; clearing it brings the whole list back.",
            "Nothing in this release matches that search. Nothing has gone anywhere either, the files are all still published; clearing it brings the whole list back.",
        ],
        yue: [
            "呢個 release 入面冇檔案符合嗰個搜尋。清走個搜尋就會成個清單返晒嚟。",
            "呢個 release 入面冇檔案符合嗰個搜尋。清走個搜尋就會成個清單返晒嚟。",
            "呢個 release 入面冇嘢符合嗰個搜尋。清走個搜尋就會成個清單返晒嚟。",
            "呢個 release 入面冇嘢符合嗰個搜尋。亦都冇任何嘢被刪走；清走個搜尋就會成個清單返晒嚟。",
            "呢個 release 入面冇嘢符合嗰個搜尋。啲檔案一個都冇走甩，全部照樣發佈緊；清走個搜尋就會成個清單返晒嚟。",
        ],
    },
    /*
     * Rendered inside a chip beside an asset name, so every level stays short enough to
     * sit on one line at a narrow width. The count and the fact that each part is checked
     * are what the chip is for; the rest is styling.
     */
    "downloads.assets.split": {
        en: [
            "published in {n} parts, checked and rejoined here",
            "published in {n} parts, checked and rejoined here",
            "published in {n} parts, each checked and rejoined here",
            "published in {n} parts, every one checked and rejoined here",
            "published in {n} parts, every one checked here before they are rejoined",
        ],
        yue: [
            "分成 {n} 份發佈，喺呢度逐份核對再拼返埋",
            "分成 {n} 份發佈，喺呢度逐份核對再拼返埋",
            "分成 {n} 份發佈，喺呢度逐份核對過先拼返埋",
            "分成 {n} 份發佈，每一份都喺呢度核對過先拼返埋",
            "分成 {n} 份發佈，每一份都要喺呢度核對過先俾拼返埋",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The screen itself                                                 */
    /* ---------------------------------------------------------------- */

    /*
     * The paragraph under the title, and the only place the split-and-verify design is
     * explained before somebody meets it. Every size in it is a real number from the
     * publishing side (GitHub's 2 GB asset cap, the 1.7 GB parts the release workflow
     * writes), so all five levels carry both.
     */
    "downloads.blurb": {
        en: [
            "A release can carry a whole Minecraft world, or a map already rendered from one. Anything past two gigabytes is published in 1.7 GB parts with a checksum for each; the app fetches them, checks every one, puts them back together and unpacks the result. Stopping is safe at any point, and starting again continues from the byte it reached.",
            "A release can carry a whole Minecraft world, or a map already rendered from one. Anything past two gigabytes is published in 1.7 GB parts with a checksum for each; the app fetches them, checks every one, puts them back together and unpacks the result. Stopping is safe at any point, and starting again continues from the byte it reached.",
            "A release can carry a whole Minecraft world, or a map already rendered from one. Anything past two gigabytes is published in 1.7 GB parts with a checksum for each; the app fetches them, checks every one, joins them back up and unpacks the result. Stopping is safe at any point, and starting again continues from the byte it reached.",
            "A release can carry a whole Minecraft world, or a map already rendered from one. GitHub stops at two gigabytes, so anything larger is published in 1.7 GB parts with a checksum for each; the app fetches them, checks every one, joins them back up and unpacks the result. Stopping is safe at any point, and starting again continues from the byte it reached.",
            "A release can carry a whole Minecraft world, or a map already rendered from one. GitHub loses its nerve at two gigabytes, so anything larger is published in 1.7 GB parts with a checksum for each; the app fetches them, checks every one, joins them back up and unpacks the result. Stopping is safe at any point, and starting again continues from the byte it reached rather than from zero.",
        ],
        yue: [
            "一個 release 可以載住成個 Minecraft 世界，又或者一張已經算好嘅地圖。任何超過 2 GB 嘅嘢會分成 1.7 GB 一份發佈，每份都有自己嘅 checksum；程式會攞晒佢哋落嚟，逐份核對，拼返埋一齊再解壓。幾時撳停都安全，再開始嘅時候會由停低嗰個位元組繼續。",
            "一個 release 可以載住成個 Minecraft 世界，又或者一張已經算好嘅地圖。任何超過 2 GB 嘅嘢會分成 1.7 GB 一份發佈，每份都有自己嘅 checksum；程式會攞晒佢哋落嚟，逐份核對，拼返埋一齊再解壓。幾時撳停都安全，再開始嘅時候會由停低嗰個位元組繼續。",
            "一個 release 可以載住成個 Minecraft 世界，又或者一張已經算好嘅地圖。任何超過 2 GB 嘅嘢會分成 1.7 GB 一份發佈，每份都有自己嘅 checksum；程式會攞晒落嚟，逐份核對過，拼返埋一齊，然後解壓。幾時撳停都安全，再開始嘅時候會由停低嗰個位元組繼續。",
            "一個 release 可以載住成個 Minecraft 世界，又或者一張已經算好嘅地圖。GitHub 到 2 GB 就唔肯再收，所以再大嘅嘢會分成 1.7 GB 一份發佈，每份都有自己嘅 checksum；程式會攞晒落嚟，逐份核對過，拼返埋一齊，然後解壓。幾時撳停都安全，再開始嘅時候會由停低嗰個位元組繼續。",
            "一個 release 可以載住成個 Minecraft 世界，又或者一張已經算好嘅地圖。GitHub 過咗 2 GB 就腳軟，所以再大嘅嘢會分成 1.7 GB 一份發佈，每份都有自己嘅 checksum；程式會攞晒落嚟，逐份核對過，拼返埋一齊，然後解壓。幾時撳停都安全，再開始嘅時候會由停低嗰個位元組繼續，唔使返去零。",
        ],
    },
    "downloads.unsupported": {
        en: [
            "This build cannot download releases. The desktop app is what fetches the parts, checks them against their published checksums and rejoins them; a browser tab has nowhere to write a world of this size.",
            "This build cannot download releases. The desktop app is what fetches the parts, checks them against their published checksums and rejoins them; a browser tab has nowhere to write a world of this size.",
            "This build cannot download releases. It is the desktop app that fetches the parts, checks them against their published checksums and rejoins them; a browser tab has nowhere to write a world of this size.",
            "This build cannot download releases, and no button here will change that. It is the desktop app that fetches the parts, checks them against their published checksums and rejoins them; a browser tab has nowhere to write a world of this size.",
            "This build cannot download releases, and no amount of pressing will change it. It is the desktop app that fetches the parts, checks them against their published checksums and rejoins them; a browser tab has nowhere to write a world of this size, and would rather admit that than fail halfway.",
        ],
        yue: [
            "呢個版本下載唔到 release。負責攞啲部分、同已公佈嘅 checksum 對數再拼返埋嘅係桌面程式；瀏覽器分頁根本冇地方寫得落一個咁大嘅世界。",
            "呢個版本下載唔到 release。負責攞啲部分、同已公佈嘅 checksum 對數再拼返埋嘅係桌面程式；瀏覽器分頁根本冇地方寫得落一個咁大嘅世界。",
            "呢個版本下載唔到 release。攞啲部分、同已公佈嘅 checksum 對數再拼返埋，呢啲全部係桌面程式做嘅；瀏覽器分頁根本冇地方寫得落一個咁大嘅世界。",
            "呢個版本下載唔到 release，撳邊個掣都改變唔到。攞啲部分、同已公佈嘅 checksum 對數再拼返埋，呢啲係桌面程式嘅工作；瀏覽器分頁根本冇地方寫得落一個咁大嘅世界。",
            "呢個版本下載唔到 release，撳幾多次都係咁話。攞啲部分、同已公佈嘅 checksum 對數再拼返埋，全部都係桌面程式嘅工作；瀏覽器分頁根本冇地方寫得落一個咁大嘅世界，與其行到一半仆街，不如而家就認咗。",
        ],
    },
    "downloads.reading": {
        en: [
            "Reading the release...",
            "Reading the release...",
            "Reading the release now...",
            "Reading the release, asking GitHub what it has...",
            "Reading the release, asking GitHub politely what it is holding...",
        ],
        yue: [
            "讀緊個 release...",
            "讀緊個 release...",
            "而家讀緊個 release...",
            "讀緊個 release，問吓 GitHub 有啲乜...",
            "讀緊個 release，客客氣氣問吓 GitHub 收埋咗啲乜...",
        ],
    },
    /*
     * Sits under the main process's own failure sentence, so it never repeats what went
     * wrong. Its job is the three fields to check and the one environment fact somebody
     * cannot guess: a private release needs a token on this machine.
     */
    "downloads.discoveryNote": {
        en: [
            "Nothing was downloaded. Check the owner, the repository and the tag; a private release also needs this machine to have a GitHub token in its environment.",
            "Nothing was downloaded. Check the owner, the repository and the tag; a private release also needs this machine to have a GitHub token in its environment.",
            "Nothing was downloaded. Worth checking the owner, the repository and the tag; a private release also needs this machine to have a GitHub token in its environment.",
            "Nothing was downloaded, so nothing on disk has changed. Worth checking the owner, the repository and the tag; a private release also needs this machine to have a GitHub token in its environment.",
            "Nothing was downloaded, so nothing on disk moved an inch. Worth a second look at the owner, the repository and the tag; and a private release also needs this machine to have a GitHub token in its environment.",
        ],
        yue: [
            "冇下載過任何嘢。檢查吓擁有者、儲存庫同個 tag；private 嘅 release 仲需要呢部機喺環境變數入面有個 GitHub token。",
            "冇下載過任何嘢。檢查吓擁有者、儲存庫同個 tag；private 嘅 release 仲需要呢部機喺環境變數入面有個 GitHub token。",
            "冇下載過任何嘢。值得檢查吓擁有者、儲存庫同個 tag；private 嘅 release 仲需要呢部機喺環境變數入面有個 GitHub token。",
            "冇下載過任何嘢，硬碟上乜都冇變過。值得檢查吓擁有者、儲存庫同個 tag；private 嘅 release 仲需要呢部機喺環境變數入面有個 GitHub token。",
            "冇下載過任何嘢，硬碟上一粒塵都冇郁過。不妨再睇多次擁有者、儲存庫同個 tag；另外 private 嘅 release 仲需要呢部機喺環境變數入面有個 GitHub token。",
        ],
    },
    "downloads.rows.noMatch": {
        en: [
            "Nothing on this machine matches that search. Clearing it brings every download back; none of them was removed.",
            "Nothing on this machine matches that search. Clearing it brings every download back; none of them was removed.",
            "Nothing on this machine matches that search. Clearing it brings every download back, and none of them was removed.",
            "Nothing on this machine matches that search. Clearing it brings every download back: this is a filter, and none of them was removed.",
            "Nothing on this machine matches that search. Clearing it brings every download back, because this is a filter and nothing more: none of them was removed.",
        ],
        yue: [
            "呢部機上面冇嘢符合嗰個搜尋。清走個搜尋就會所有下載返晒嚟；一個都冇刪走過。",
            "呢部機上面冇嘢符合嗰個搜尋。清走個搜尋就會所有下載返晒嚟；一個都冇刪走過。",
            "呢部機上面冇嘢符合嗰個搜尋。清走個搜尋就會所有下載返晒嚟，一個都冇刪走過。",
            "呢部機上面冇嘢符合嗰個搜尋。清走個搜尋就會所有下載返晒嚟：呢個係篩選，一個都冇刪走過。",
            "呢部機上面冇嘢符合嗰個搜尋。清走個搜尋就會所有下載返晒嚟，因為呢個淨係一個篩選咋：一個都冇刪走過。",
        ],
    },
    "downloads.cannotList": {
        en: [
            "This build cannot read back downloads from earlier sessions, so only the ones started here are listed.",
            "This build cannot read back downloads from earlier sessions, so only the ones started here are listed.",
            "This build cannot read back downloads from earlier sessions, so the list holds only the ones started here.",
            "This build cannot read back downloads from earlier sessions. The list holds only the ones started here; anything older is on disk, just not on screen.",
            "This build has no memory of earlier sessions, so it cannot read those downloads back. The list holds only the ones started here; anything older is still on disk, just not on this screen.",
        ],
        yue: [
            "呢個版本讀唔返之前嘅工作階段嘅下載，所以只會列出喺呢度開始嗰啲。",
            "呢個版本讀唔返之前嘅工作階段嘅下載，所以只會列出喺呢度開始嗰啲。",
            "呢個版本讀唔返之前嘅工作階段嘅下載，所以個清單只有喺呢度開始嗰啲。",
            "呢個版本讀唔返之前嘅工作階段嘅下載。個清單只有喺呢度開始嗰啲；再舊嘅仲喺硬碟度，只係唔會喺畫面出現。",
            "呢個版本對之前嘅工作階段完全冇記性，讀唔返嗰啲下載。個清單只有喺呢度開始嗰啲；再舊嘅仲好地地喺硬碟度，只係上唔到呢個畫面。",
        ],
    },
    /*
     * The log's own auto-scroll checkbox tooltip - the same behaviour `RenderConsole.vue`
     * and `BackupRunCard.vue` offer, for the same reason: a multi-part download can run for
     * a long time, and opening "Show what it reported" while it is still going is opening
     * it to watch it happen.
     */
    "downloads.row.autoScrollHint": {
        en: [
            "Keeps this log scrolled to the newest line as it arrives. Scrolling up pauses that without turning this off; scroll back down, or use Newest lines, to pick it up again.",
            "Keeps this log scrolled to the newest line as it arrives. Scrolling up pauses that without turning this off; scroll back down, or use Newest lines, to pick it up again.",
            "Keeps this log scrolled to the newest line as it arrives. Scrolling up pauses that without turning this off, so nothing needs re-ticking; scroll back to the bottom, or use Newest lines, to resume it.",
            "Keeps this log scrolled to the newest line. Scrolling up to read something pauses it too, without turning this off - scroll back down, or hit Newest lines, when you are ready to resume.",
            "Keeps this log glued to the newest line. Scroll up and it lets go on its own, without turning this off - scroll back to the bottom, or hit Newest lines, and it glues itself back on.",
        ],
        yue: [
            "跟住呢個 log 到嚟嘅最新一行，將佢捲落去。你向上捲會令佢暫停，但唔會關呢個掣；捲返落底，或者撳「最新嘅行」，就會再繼續跟。",
            "跟住呢個 log 到嚟嘅最新一行，將佢捲落去。你向上捲會令佢暫停，但唔會關呢個掣；捲返落底，或者撳「最新嘅行」，就會再繼續跟。",
            "跟住呢個 log 到嚟嘅最新一行，將佢捲落去。你向上捲嗰陣佢會暫停，但唔會關呢個剔掣；捲返去底，或者撳「最新嘅行」，就會再開始跟。",
            "呢個掣負責將呢個 log 跟住最新一行捲。你向上捲去睇嘢，佢自己會暫停，唔會關呢個剔掣；捲返落底，或者撳「最新嘅行」，準備好就繼續跟。",
            "呢個掣負責將呢個 log 黐實最新一行。你向上捲，佢會自動鬆手，唔會關呢個剔；捲返落底，或者撳「最新嘅行」，佢又會黐返實。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const DOWNLOADS_FIXED = {
    /* A download row's buttons and labels. */
    "downloads.row.retry": { en: "Try this download again", yue: "再試多次呢個下載" },
    "downloads.row.resume": { en: "Carry on from where it stopped", yue: "由停低嗰度繼續" },
    "downloads.row.splitChip": { en: "{n} parts, rejoined here", yue: "{n} 份，喺呢度拼返埋" },
    "downloads.row.progressLabel": {
        en: "Download progress for {asset}",
        yue: "{asset} 嘅下載進度",
    },
    "downloads.row.stopOne": { en: "Stop the download of {asset}", yue: "停止下載 {asset}" },
    "downloads.row.stop": { en: "Stop this download", yue: "停止呢個下載" },
    /* A path, so `{folder}` renders identically in both languages. */
    "downloads.row.contentAt": { en: "Unpacked into {folder}", yue: "已經解壓到 {folder}" },
    "downloads.row.useOne": {
        en: "Use the folder downloaded from {asset}",
        yue: "用由 {asset} 下載返嚟嘅資料夾",
    },
    "downloads.row.use": { en: "Use this folder", yue: "用呢個資料夾" },
    "downloads.row.hideDetail": { en: "Hide the detail", yue: "收埋啲細節" },
    "downloads.row.showDetail": { en: "Show what the app reported", yue: "睇吓程式報咗啲乜" },
    "downloads.row.resumeOne": {
        en: "Start downloading {asset} again",
        yue: "重新開始下載 {asset}",
    },
    "downloads.row.hideLog": { en: "Hide what it reported", yue: "收埋佢報過嘅嘢" },
    "downloads.row.showLog": {
        en: "Show what it reported ({n} lines)",
        yue: "睇佢報過嘅嘢（{n} 行）",
    },
    /* The log's own auto-scroll checkbox and jump control, on by default - see DownloadRowCard.vue. */
    "downloads.row.autoScroll": { en: "Follow new lines", yue: "跟住新增嘅行" },
    "downloads.row.jumpLatest": { en: "Newest lines", yue: "最新嘅行" },
    "downloads.row.logRegion": { en: "What this download reported", yue: "呢個下載報過嘅嘢" },

    /* The four phases a download passes through, plus the end of them. */
    "downloads.phase.resolving": { en: "Reading the release", yue: "讀緊個 release" },
    "downloads.phase.downloading": { en: "Transferring", yue: "傳輸緊" },
    "downloads.phase.joining": { en: "Putting the parts back together", yue: "拼返啲部分" },
    "downloads.phase.extracting": { en: "Unpacking the archive", yue: "解緊個壓縮檔" },
    "downloads.phase.finished": { en: "Finished", yue: "完成" },

    /*
     * The numbers, as units rather than as sentences. `{n}`, `{done}`, `{total}` and
     * `{eta}` arrive already formatted, so these entries only decide the word order and
     * the unit around them.
     */
    "downloads.size.b": { en: "{n} B", yue: "{n} B" },
    "downloads.transfer": { en: "{done} of {total}", yue: "{total} 之中嘅 {done}" },
    "downloads.parts": { en: "part {done} of {total}", yue: "第 {done} 份，共 {total} 份" },
    "downloads.eta": { en: "about {eta} left", yue: "大約仲有 {eta}" },

    /* The asset list and its own search field. */
    "downloads.assets.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 之中嘅 {shown}",
    },
    "downloads.assets.going": { en: "Already going", yue: "已經下載緊" },
    "downloads.assets.download": { en: "Download", yue: "下載" },
    "downloads.assets.label": { en: "Downloads in this release", yue: "呢個 release 入面嘅下載" },
    "downloads.assets.title": { en: "{release} offers", yue: "{release} 提供" },
    "downloads.assets.searchLabel": { en: "Search these files", yue: "搜尋呢啲檔案" },
    "downloads.assets.searchHint": { en: "part of a file name", yue: "檔案名嘅一部分" },
    "downloads.assets.single": { en: "one file", yue: "一個檔案" },
    "downloads.assets.downloadOne": { en: "Download {asset}", yue: "下載 {asset}" },

    /* The screen, its three address fields, and the search over what is on this machine. */
    "downloads.rows.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 之中嘅 {shown}",
    },
    "downloads.title": { en: "Download a world from a release", yue: "由 release 下載一個世界" },
    /*
     * The optional "paste a link" field above owner/repo/tag. Convenience over those three
     * fields, never a replacement for them, so the label says exactly that rather than
     * implying this is the only way in. A build whose bridge cannot parse a link never
     * shows this field at all -- see `ReleaseDownloads.vue`'s own doc comment -- so there
     * is nothing here promising a capability that build does not have.
     */
    "downloads.link": {
        en: "Paste a link, or type owner, repository and tag below",
        yue: "貼一個連結，或者喺下面打擁有者、儲存庫同 tag",
    },
    /* An example URL, not prose. It stays identical in both languages, the same way a path
     * or a filename does elsewhere in this file: translating it would send the reader
     * looking for a domain that does not exist. */
    "downloads.linkHint": {
        en: "https://github.com/owner/repo/releases/tag/...",
        yue: "https://github.com/owner/repo/releases/tag/...",
    },
    "downloads.owner": { en: "Owner", yue: "擁有者" },
    "downloads.repo": { en: "Repository", yue: "儲存庫" },
    /* GitHub's own noun for the field, and the word the API answers to. It stays "Tag". */
    "downloads.tag": { en: "Tag", yue: "Tag" },
    "downloads.tagPlaceholder": {
        en: "blank for the latest release",
        yue: "留空即係最新嗰個 release",
    },
    "downloads.look": { en: "See what it offers", yue: "睇吓佢有啲乜" },
    "downloads.rows.searchLabel": {
        en: "Search what is on this machine",
        yue: "搜尋呢部機上面嘅嘢",
    },
    "downloads.rows.searchHint": {
        en: "file name, repository or tag",
        yue: "檔案名、儲存庫或者 tag",
    },
} as const satisfies Record<string, FixedString>;

export const DOWNLOADS_FACTS = {
    // Where to start it from, because explaining the missing button is only half of it.
    "downloads.row.cannotResume": {
        en: ["which release this came from", "start it from there"],
        yue: ["release", "由嗰度開始"],
    },
    "downloads.row.stopping": { en: ["Stopping"], yue: ["停緊"] },
    // The resume promise, which is the whole reason Stop is safe to press.
    "downloads.row.stopNote": {
        en: ["every byte already transferred", "continues from"],
        yue: ["已經傳咗嘅每一個位元組", "由嗰度繼續"],
    },
    "downloads.row.cannotStop": {
        en: ["cannot stop", "nothing already transferred is lost"],
        yue: ["停唔到", "已經傳咗嘅嘢唔會冇咗"],
    },
    // "Verified" and the checksum, never just "downloaded".
    "downloads.row.finishedIn": {
        en: ["{duration}", "verified", "checksum"],
        yue: ["{duration}", "核對", "checksum"],
    },
    "downloads.row.finished": {
        en: ["verified", "checksum"],
        yue: ["核對", "checksum"],
    },
    "downloads.row.archiveAt": {
        en: ["{archive}", "not unpacked", "no folder to render"],
        yue: ["{archive}", "冇解壓", "冇資料夾"],
    },
    "downloads.row.cancelled": {
        en: ["Every byte", "carries on"],
        yue: ["已經傳咗嘅每一個位元組", "接住落去"],
    },
    "downloads.row.interrupted": {
        en: ["still going", "already transferred is still there"],
        yue: ["仲行緊", "已經傳咗嘅嘢仲喺度"],
    },
    "downloads.row.settingsElsewhere": {
        en: ["settings", "no way to open it from here"],
        yue: ["設定", "喺呢度開唔到"],
    },

    // Private plus token plus "a public release never needs one": all three, or the
    // reader goes looking for a credential a public release does not want.
    "downloads.fail.release": {
        en: ["private", "token", "public release"],
        yue: ["token", "公開嘅 release"],
    },
    "downloads.fail.asset": {
        en: ["nothing by that name", "listed below", "whole file"],
        yue: ["冇一個叫呢個名", "下面", "成個檔案"],
    },
    "downloads.fail.network": {
        en: ["already on disk was kept", "continues from the byte it reached"],
        yue: ["已經喺硬碟嘅嘢都留低咗", "由停低嗰個位元組"],
    },
    "downloads.fail.manifest": {
        en: ["published in parts", "no safe way to rejoin", "nothing was assembled"],
        yue: ["分開部分發佈", "冇安全嘅方法拼返", "冇砌過"],
    },
    // The delete, the mismatch and the word "corrupt". This one reads as a failure at
    // every level, in both languages, and no playful rewrite gets to round it down.
    "downloads.fail.integrity": {
        en: ["does not match the checksum", "deleted rather than kept", "corrupt"],
        yue: ["checksum 對唔上", "刪咗", "壞咗"],
    },
    "downloads.fail.extract": {
        en: ["verified and still on disk", "Unpacking", "nothing has to be downloaded again"],
        yue: ["個壓縮檔本身核對過", "解壓", "唔使再下載"],
    },
    "downloads.fail.storage": {
        en: ["could not be created or written", "read-only", "full"],
        yue: ["建立唔到又寫唔到", "唯讀", "滿咗"],
    },
    "downloads.fail.request": {
        en: ["refused", "nothing was written", "message above"],
        yue: ["拒絕", "冇寫過任何嘢", "上面段訊息"],
    },
    "downloads.fail.cancelled": {
        en: ["Every byte already transferred is kept", "carries on"],
        yue: ["已經傳咗嘅每一個位元組都保留咗", "接住落去"],
    },
    "downloads.fail.unknown": {
        en: ["no specific answer", "message above"],
        yue: ["冇特定答案", "上面段訊息"],
    },

    "downloads.assets.starting": { en: ["Starting"], yue: ["開始緊"] },
    "downloads.assets.none": {
        en: ["nothing this app can download", "zip"],
        yue: ["冇任何呢個程式下載到嘅嘢", "zip"],
    },
    "downloads.assets.noMatch": {
        en: ["matches that search", "whole list back"],
        yue: ["符合嗰個搜尋", "成個清單返晒嚟"],
    },
    "downloads.assets.split": { en: ["{n}", "checked"], yue: ["{n}", "核對"] },

    // Both published sizes, because the split is the part somebody has to understand
    // before the row count and the byte count make sense.
    "downloads.blurb": {
        en: [
            "Minecraft",
            "two gigabytes",
            "1.7 GB",
            "checksum",
            "continues from the byte it reached",
        ],
        yue: ["Minecraft", "2 GB", "1.7 GB", "checksum", "由停低嗰個位元組繼續"],
    },
    "downloads.unsupported": {
        en: [
            "cannot download releases",
            "desktop app",
            "checksums",
            "nowhere to write a world of this size",
        ],
        yue: ["下載唔到 release", "桌面程式", "checksum", "寫得落"],
    },
    "downloads.reading": { en: ["Reading the release"], yue: ["讀緊個 release"] },
    "downloads.discoveryNote": {
        en: ["Nothing was downloaded", "owner", "repository", "tag", "GitHub token"],
        yue: ["冇下載過任何嘢", "擁有者", "儲存庫", "tag", "GitHub token"],
    },
    "downloads.rows.noMatch": {
        en: ["matches that search", "none of them was removed"],
        yue: ["符合嗰個搜尋", "冇刪走過"],
    },
    "downloads.cannotList": {
        en: ["earlier sessions", "started here"],
        yue: ["之前嘅工作階段", "喺呢度開始"],
    },
    "downloads.row.autoScrollHint": {
        en: ["newest line", "without turning this off", "Newest lines"],
        yue: ["最新一行", "唔會關", "最新嘅行"],
    },
} as const satisfies Record<
    keyof typeof DOWNLOADS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
