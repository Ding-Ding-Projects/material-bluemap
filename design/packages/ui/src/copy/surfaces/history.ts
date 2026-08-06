/**
 * The local version history panel: the revision list, the day timeline, the comparison of
 * any two revisions, the readable diff, the per-row label and restore, and the one action
 * in the whole surface that genuinely cannot be undone.
 *
 * ## The guarantee this surface is built on, and what that means for the copy
 *
 * The history is append-only and a restore is itself recorded as a new revision: the state
 * a restore replaces is snapshotted *before* the write, so an undo can be undone. That is
 * not reassurance, it is the mechanism, and it is the reason the restore button asks twice
 * in place rather than opening the two-key destructive gate. Every level of
 * `history.row.restoreConfirmLong` therefore says the replaced state is saved first and
 * that the restore can be undone, and the facts below pin both clauses. A playful level
 * that trimmed that sentence to "putting {label} back" would turn a safe action into one
 * nobody dares press, which is a worse failure than an unfunny button.
 *
 * `history.trimAction` is the exact opposite and is the only entry here that gets to say
 * so. Trimming deletes revisions out of the repository for good, and no level is allowed to
 * soften it, hedge it, or imply that some other copy survives somewhere. It is the one
 * action in this panel that keeps nothing, and level 5 says precisely that rather than
 * making a joke instead of the warning.
 *
 * ## Two keys, one sentence
 *
 * `history.diff.identical` and `history.compare.exportEmpty` both report that two revisions
 * hold the same files. They are separate because one is read on screen with the panel still
 * around it and the other is read in an exported file with no panel at all, so the on-screen
 * one can say "there is nothing to show here" and the exported one cannot.
 *
 * ## Why some aria-labels are voiced and some are fixed
 *
 * A label that describes a *consequence* is voiced even though it is an aria-label: "leaving
 * every other file alone" is the whole reason somebody presses that button. A label that
 * merely names a control ("Copy this comparison to the clipboard") is fixed, for the same
 * reason a button is: a screen-reader user learns the name of a control and should not have
 * to relearn it because a slider moved.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const HISTORY_VOICED = {
    /* ---------------------------------------------------------------- */
    /* The panel's own frame                                             */
    /* ---------------------------------------------------------------- */

    "history.subtitle": {
        en: [
            "Every change to this config folder is recorded, so anything you create, edit or delete can be put back.",
            "Every change to this config folder is recorded, so anything you create, edit or delete can be put back.",
            "Every change to this config folder is recorded, so anything you create, edit or delete can be put back later.",
            "Every change to this config folder is recorded. Create something, edit it, delete it: it can all be put back.",
            "Every change to this config folder is recorded, down to the ones you would rather forget. Create it, edit it, delete it, and it can still be put back.",
        ],
        yue: [
            "呢個設定資料夾嘅每一個改動都會記錄低，所以你新增、修改或者刪除嘅嘢都可以還原返。",
            "呢個設定資料夾嘅每一個改動都會記錄低，所以你新增、修改或者刪除嘅嘢都可以還原返。",
            "呢個設定資料夾嘅每一個改動都會記錄低，所以你新增、修改或者刪除過嘅嘢，之後都可以還原返。",
            "呢個設定資料夾嘅每一個改動都會記錄低。你新增、你改、你刪，一律都可以還原返。",
            "呢個設定資料夾嘅每一個改動都會記錄低，連你想扮冇發生過嗰啲都有。你新增、你改、你刪，全部一律都可以還原返。",
        ],
    },
    /*
     * The panel with no desktop shell under it. It is not an error and must not read as one:
     * nothing is broken and nothing was lost, this build simply never had a history to keep.
     */
    "history.noHost": {
        en: [
            "This build has no version history, because it is running without the desktop shell that keeps one.",
            "This build has no version history, because it is running without the desktop shell that keeps one.",
            "This build has no version history: it is running without the desktop shell that keeps one.",
            "There is no version history in this build, because it is running without the desktop shell that keeps one.",
            "There is no version history here at all, because this build is running without the desktop shell that keeps one, and nothing else in the room is holding a copy.",
        ],
        yue: [
            "呢個組建冇版本記錄，因為佢喺冇桌面外殼嘅情況下行緊，而記錄係靠桌面外殼保管。",
            "呢個組建冇版本記錄，因為佢喺冇桌面外殼嘅情況下行緊，而記錄係靠桌面外殼保管。",
            "呢個組建冇版本記錄：佢喺冇桌面外殼嘅情況下行緊，而記錄係靠桌面外殼保管。",
            "呢度根本冇版本記錄，因為呢個組建冇咗桌面外殼行緊，而保管記錄嗰個就係桌面外殼。",
            "呢度根本冇版本記錄，因為呢個組建冇咗桌面外殼行緊，而保管記錄嗰個正正就係桌面外殼，附近亦都冇第二個人幫手抄低。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Taking the view away: copy and export                             */
    /* ---------------------------------------------------------------- */

    /*
     * Both of these promise that the file or the clipboard matches the screen, filters and
     * all. That is the promise worth keeping at every level, because somebody pasting a
     * history into a bug report is going to be believed about what it contains.
     */
    "history.copyView": {
        en: [
            "Copy what is on screen to the clipboard",
            "Copy what is on screen to the clipboard",
            "Copy what is on screen to the clipboard, filters and all",
            "Copy exactly what is on screen to the clipboard, filters and all",
            "Copy exactly what is on screen to the clipboard, filters and all, with nothing added behind your back",
        ],
        yue: [
            "將畫面上嘅嘢複製到剪貼簿",
            "將畫面上嘅嘢複製到剪貼簿",
            "將畫面上嘅嘢連埋篩選結果複製到剪貼簿",
            "將畫面上見到嘅嘢原封不動複製到剪貼簿，連篩選都照跟",
            "將畫面上見到嘅嘢原封不動複製到剪貼簿，連篩選都照跟，背後唔會偷偷加料",
        ],
    },
    "history.exportView": {
        en: [
            "Export what is on screen to a file",
            "Export what is on screen to a file",
            "Export what is on screen to a file, filters and all",
            "Export exactly what is on screen to a file, filters and all",
            "Export exactly what is on screen to a file, filters and all, so the file and the screen agree",
        ],
        yue: [
            "將畫面上嘅嘢匯出做一個檔案",
            "將畫面上嘅嘢匯出做一個檔案",
            "將畫面上嘅嘢連埋篩選結果匯出做一個檔案",
            "將畫面上見到嘅嘢原封不動匯出做一個檔案，連篩選都照跟",
            "將畫面上見到嘅嘢原封不動匯出做一個檔案，連篩選都照跟，個檔案同個畫面講返同一件事",
        ],
    },
    "history.copied": {
        en: [
            "What is on screen is on the clipboard.",
            "What is on screen is on the clipboard.",
            "What is on screen is now on the clipboard.",
            "Whatever is on screen is now sitting on the clipboard.",
            "Whatever is on screen is now sitting on the clipboard, waiting to be pasted somewhere useful.",
        ],
        yue: [
            "畫面上嘅嘢已經喺剪貼簿度。",
            "畫面上嘅嘢已經喺剪貼簿度。",
            "畫面上嘅嘢而家已經入咗剪貼簿。",
            "畫面上見到嘅嘢，而家已經好地地坐咗喺剪貼簿度。",
            "畫面上見到嘅嘢，而家已經好地地坐咗喺剪貼簿度，等你貼去啲有用嘅地方。",
        ],
    },
    "history.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "The clipboard did not answer, so nothing was copied.",
            "The clipboard did not answer at all, so nothing was copied and the history is exactly where it was.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "去唔到剪貼簿，所以乜都冇複製到。",
            "剪貼簿冇回應，所以乜都冇複製到。",
            "剪貼簿由頭到尾都冇出過聲，所以乜都冇複製到，份記錄一個字都冇變過。",
        ],
    },
    /* No level claims where the file went. The panel writes it and the shell decides. */
    "history.exported": {
        en: [
            "Exported {name}.",
            "Exported {name}.",
            "{name} has been written.",
            "{name} is written and saved.",
            "{name} is written and saved, and readable by something other than this app.",
        ],
        yue: [
            "已經匯出 {name}。",
            "已經匯出 {name}。",
            "{name} 已經寫好。",
            "{name} 已經寫好，亦都儲存咗。",
            "{name} 已經寫好亦都儲存咗，唔使返嚟呢個程式都開得到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Filters, and the empty states they produce                        */
    /* ---------------------------------------------------------------- */

    /*
     * Three different kinds of nothing, and confusing them is how somebody concludes their
     * history was lost. `noActions` and `emptyHistory` mean nothing has ever been recorded;
     * `emptyFiltered` means the revisions are all still there and none of them matched. The
     * filtered one says so out loud from level 3 on.
     */
    "history.noActions": {
        en: [
            "Nothing has been recorded yet, so there is nothing to filter.",
            "Nothing has been recorded yet, so there is nothing to filter.",
            "Nothing has been recorded yet, so there is nothing here to filter.",
            "Nothing has been recorded yet, so there is nothing to filter and nothing to find.",
            "Nothing has been recorded yet, so there is nothing to filter, and a filter with nothing behind it is only a row of buttons.",
        ],
        yue: [
            "暫時仲未記錄過任何嘢，所以冇嘢可以篩選。",
            "暫時仲未記錄過任何嘢，所以冇嘢可以篩選。",
            "暫時仲未記錄過任何嘢，所以呢度冇嘢可以篩選。",
            "暫時仲未記錄過任何嘢，所以冇嘢可以篩選，亦都冇嘢搵得到。",
            "暫時仲未記錄過任何嘢，所以冇嘢可以篩選；後面乜都冇嘅篩選，講穿咗就係幾粒掣。",
        ],
    },
    "history.emptyHistory": {
        en: [
            "Nothing has been recorded for this folder yet. Saving a change records the first revision, or press Record now.",
            "Nothing has been recorded for this folder yet. Saving a change records the first revision, or press Record now.",
            "Nothing has been recorded for this folder yet. Save a change and the first revision is recorded, or press Record now.",
            "Nothing has been recorded for this folder yet. Save a change and the first revision appears, or press Record now and skip the waiting.",
            "Nothing has been recorded for this folder yet, which is a beginning rather than a loss. Save a change and the first revision appears, or press Record now and start the story early.",
        ],
        yue: [
            "呢個資料夾暫時仲未記錄過任何嘢。儲存一次改動就會記錄低第一個版本，又或者撳「即刻記錄」。",
            "呢個資料夾暫時仲未記錄過任何嘢。儲存一次改動就會記錄低第一個版本，又或者撳「即刻記錄」。",
            "呢個資料夾暫時仲未記錄過任何嘢。儲存一次改動，第一個版本就會記錄低，又或者撳「即刻記錄」。",
            "呢個資料夾暫時仲未記錄過任何嘢。儲存一次改動，第一個版本就會出現；唔想等就撳「即刻記錄」。",
            "呢個資料夾暫時仲未記錄過任何嘢，呢個係開始，唔係唔見咗嘢。儲存一次改動第一個版本就會出現；唔想等就撳「即刻記錄」，提早開場。",
        ],
    },
    "history.emptyFiltered": {
        en: [
            "No revision matches these filters.",
            "No revision matches these filters.",
            "No revision matches these filters. Nothing has been removed.",
            "No revision matches these filters. Nothing has been removed either; they are all still recorded.",
            "No revision matches these filters. Nothing has been removed either, so every revision is still recorded and merely out of view.",
        ],
        yue: [
            "冇版本符合呢啲篩選。",
            "冇版本符合呢啲篩選。",
            "冇版本符合呢啲篩選。冇任何嘢被刪走。",
            "冇版本符合呢啲篩選。亦都冇任何嘢被刪走，全部仲記錄住。",
            "冇版本符合呢啲篩選。亦都冇任何嘢被刪走，每個版本都仲好地地記錄住，只係而家唔喺畫面度咋。",
        ],
    },
    "history.truncated": {
        en: [
            "Showing the newest {shown} of {total}. Narrow the search or the dates to reach the rest.",
            "Showing the newest {shown} of {total}. Narrow the search or the dates to reach the rest.",
            "Showing the newest {shown} of {total}. Narrow the search or the dates to reach the others.",
            "Only the newest {shown} of {total} are drawn. Narrow the search or the dates to reach the rest; none of them has gone anywhere.",
            "Only the newest {shown} of {total} are drawn, because a list of {total} rows helps nobody. Narrow the search or the dates to reach the rest; none of them has gone anywhere.",
        ],
        yue: [
            "顯示緊最新嘅 {shown} 個，共 {total} 個。收窄搜尋或者日期就睇到其餘嗰啲。",
            "顯示緊最新嘅 {shown} 個，共 {total} 個。收窄搜尋或者日期就睇到其餘嗰啲。",
            "顯示緊最新嘅 {shown} 個，共 {total} 個。收窄搜尋或者日期就搵到其餘嗰啲。",
            "而家淨係畫咗最新嘅 {shown} 個，共 {total} 個。收窄搜尋或者日期就見到其餘嘅；佢哋一個都冇走。",
            "而家淨係畫咗最新嘅 {shown} 個，共 {total} 個，因為一次過排 {total} 行對邊個都冇幫助。收窄搜尋或者日期就見到其餘嘅；佢哋一個都冇走。",
        ],
    },
    "history.keyboardHint": {
        en: [
            "In the list: up and down move between revisions, Enter opens one, A and B choose the two ends of a comparison, and Escape closes it.",
            "In the list: up and down move between revisions, Enter opens one, A and B choose the two ends of a comparison, and Escape closes it.",
            "In the list, up and down move between revisions, Enter opens one, A and B choose the two ends of a comparison, and Escape closes it.",
            "Keyboard, in the list: up and down move between revisions, Enter opens one, A and B choose the two ends of a comparison, Escape closes it.",
            "Without touching the mouse: up and down move between revisions, Enter opens one, A and B choose the two ends of a comparison, and Escape closes it again.",
        ],
        yue: [
            "喺列表入面：上下鍵喺各個版本之間移動，Enter 開一個，A 同 B 揀比較嘅兩端，Escape 閂返佢。",
            "喺列表入面：上下鍵喺各個版本之間移動，Enter 開一個，A 同 B 揀比較嘅兩端，Escape 閂返佢。",
            "喺列表入面，上下鍵喺各個版本之間移動，Enter 開一個，A 同 B 揀比較嘅兩端，Escape 閂返佢。",
            "鍵盤操作，喺列表入面：上下鍵行走各個版本，Enter 開一個，A 同 B 揀比較嘅兩端，Escape 閂返佢。",
            "唔使掂滑鼠都得：上下鍵行走各個版本，Enter 開一個，A 同 B 揀比較嘅兩端，Escape 就閂返佢。",
        ],
    },
    /* Announced on every arrow keypress, so it stays short at every level. */
    "history.row.position": {
        en: [
            "{position} of {total}. {label}",
            "{position} of {total}. {label}",
            "Revision {position} of {total}. {label}",
            "Revision {position} of {total}: {label}",
            "Revision {position} of {total}, which is: {label}",
        ],
        yue: [
            "第 {position} 個，共 {total} 個。{label}",
            "第 {position} 個，共 {total} 個。{label}",
            "版本第 {position} 個，共 {total} 個。{label}",
            "版本第 {position} 個，共 {total} 個：{label}",
            "版本第 {position} 個，共 {total} 個，即係：{label}",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Comparing two revisions                                           */
    /* ---------------------------------------------------------------- */

    "history.compare.pending": {
        en: [
            "Pick a second revision to compare against.",
            "Pick a second revision to compare against.",
            "Pick a second revision to compare this one against.",
            "One end chosen. Pick a second revision to compare it against.",
            "One end chosen, and one end has nothing to compare itself with. Pick a second revision to compare it against.",
        ],
        yue: [
            "揀多一個版本嚟比較。",
            "揀多一個版本嚟比較。",
            "揀多一個版本，同呢個比較。",
            "已經揀咗一端。揀多一個版本，同佢比較。",
            "已經揀咗一端，但一端係冇嘢可以同佢比較嘅。揀多一個版本，同佢比較。",
        ],
    },
    "history.compare.howTo": {
        en: [
            "Choose A on one revision and B on another, from any two rows in the list. They do not have to be next to each other.",
            "Choose A on one revision and B on another, from any two rows in the list. They do not have to be next to each other.",
            "Choose A on one revision and B on another, from any two rows in the list. The two do not have to be next to each other.",
            "Choose A on one revision and B on another. Any two rows in the list will do; they do not have to be next to each other.",
            "Choose A on one revision and B on another. Any two rows in the list will do, however far apart they sit: they do not have to be next to each other.",
        ],
        yue: [
            "喺一個版本揀 A，喺另一個揀 B，列表入面任何兩行都得。佢哋唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B，列表入面任何兩行都得。佢哋唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B，列表入面任何兩行都得。兩個唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B。列表入面任何兩行都得；佢哋唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B。列表入面任何兩行都得，隔幾遠都冇所謂：佢哋唔使排喺隔籬。",
        ],
    },
    /* Same instruction as `howTo`, read beside the list rather than inside the empty card. */
    "history.compare.hint": {
        en: [
            "Choose A on one revision and B on another to see everything that changed between them. They do not have to be next to each other.",
            "Choose A on one revision and B on another to see everything that changed between them. They do not have to be next to each other.",
            "Choose A on one revision and B on another to see everything that changed between them. The two do not have to be next to each other.",
            "Choose A on one revision and B on another, and everything that changed between them appears here. They do not have to be next to each other.",
            "Choose A on one revision and B on another, and everything that changed between them appears here, however many saves apart they are. They do not have to be next to each other.",
        ],
        yue: [
            "喺一個版本揀 A，喺另一個揀 B，就會見到佢哋之間改過嘅所有嘢。佢哋唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B，就會見到佢哋之間改過嘅所有嘢。佢哋唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B，就會見到佢哋之間改過嘅所有嘢。兩個唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B，佢哋之間改過嘅嘢就會喺呢度出現。佢哋唔使排喺隔籬。",
            "喺一個版本揀 A，喺另一個揀 B，佢哋之間改過嘅嘢就會喺呢度出現，隔幾多次儲存都照計。佢哋唔使排喺隔籬。",
        ],
    },
    "history.compare.loading": {
        en: [
            "Working out what changed...",
            "Working out what changed...",
            "Working out what changed between the two...",
            "Working out what changed between the two ends...",
            "Reading both ends and working out what changed between them...",
        ],
        yue: [
            "計緊改咗啲乜...",
            "計緊改咗啲乜...",
            "計緊兩者之間改咗啲乜...",
            "計緊兩端之間改咗啲乜...",
            "而家讀緊兩端，計緊佢哋之間改咗啲乜...",
        ],
    },
    /*
     * Direction is the whole meaning of a comparison: read backwards, every added setting is
     * a removed one. So both the swap control and the swap announcement name the two ends in
     * order at every level, and never say only "reversed".
     */
    "history.compare.swapLong": {
        en: [
            "Compare the other way round, from {b} to {a}",
            "Compare the other way round, from {b} to {a}",
            "Compare the other way round instead, from {b} to {a}",
            "Run the comparison the other way round, from {b} to {a}",
            "Run the comparison the other way round, from {b} to {a}, because the direction is the difference between a change and its opposite",
        ],
        yue: [
            "調轉方向比較，由 {b} 去 {a}",
            "調轉方向比較，由 {b} 去 {a}",
            "改為調轉方向比較，由 {b} 去 {a}",
            "將個比較調轉方向嚟行，由 {b} 去 {a}",
            "將個比較調轉方向嚟行，由 {b} 去 {a}；方向一調轉，一個改動就會變成佢嘅相反",
        ],
    },
    "history.compare.swapped": {
        en: [
            "The comparison now runs the other way round.",
            "The comparison now runs the other way round.",
            "The comparison now runs the other way round: the two ends have traded places.",
            "The two ends have traded places, so the comparison now runs the other way round.",
            "The two ends have traded places, so the comparison now runs the other way round, and every change in it reads as its own opposite.",
        ],
        yue: [
            "個比較而家調轉咗方向行。",
            "個比較而家調轉咗方向行。",
            "個比較而家調轉咗方向行：兩端對調咗。",
            "兩端對調咗，所以個比較而家調轉咗方向行。",
            "兩端對調咗，所以個比較而家調轉咗方向行，入面每個改動都要反轉嚟讀。",
        ],
    },
    "history.compare.pickedA": {
        en: [
            "{label} is now A, the older end.",
            "{label} is now A, the older end.",
            "{label} is now A, the older end of the comparison.",
            "{label} takes A, the older end of the comparison.",
            "{label} takes A, the older end of the comparison, and the arrows now point away from it.",
        ],
        yue: [
            "{label} 而家係 A，即係較舊嗰端。",
            "{label} 而家係 A，即係較舊嗰端。",
            "{label} 而家係 A，即係比較入面較舊嗰端。",
            "{label} 攞咗 A，即係比較入面較舊嗰端。",
            "{label} 攞咗 A，即係比較入面較舊嗰端，啲箭嘴而家由佢向外指。",
        ],
    },
    "history.compare.pickedB": {
        en: [
            "{label} is now B, the newer end.",
            "{label} is now B, the newer end.",
            "{label} is now B, the newer end of the comparison.",
            "{label} takes B, the newer end of the comparison.",
            "{label} takes B, the newer end of the comparison, and the arrows now point towards it.",
        ],
        yue: [
            "{label} 而家係 B，即係較新嗰端。",
            "{label} 而家係 B，即係較新嗰端。",
            "{label} 而家係 B，即係比較入面較新嗰端。",
            "{label} 攞咗 B，即係比較入面較新嗰端。",
            "{label} 攞咗 B，即係比較入面較新嗰端，啲箭嘴而家指住佢。",
        ],
    },
    /* Leaving the comparison changes nothing about the revision, which is what levels 4 and 5 add. */
    "history.compare.unpicked": {
        en: [
            "{label} is no longer part of the comparison.",
            "{label} is no longer part of the comparison.",
            "{label} is no longer one of the two ends of the comparison.",
            "{label} has stepped out of the comparison. The revision itself is untouched.",
            "{label} has stepped out of the comparison. Nothing happened to the revision itself; it is only no longer one of the two ends.",
        ],
        yue: [
            "{label} 已經唔再係呢個比較嘅一部分。",
            "{label} 已經唔再係呢個比較嘅一部分。",
            "{label} 已經唔再係呢個比較嘅兩端之一。",
            "{label} 退出咗個比較。個版本本身冇任何改動。",
            "{label} 退出咗個比較。個版本本身乜事都冇；佢只係唔再係兩端之一咋。",
        ],
    },
    "history.compare.stopped": {
        en: [
            "The comparison is closed.",
            "The comparison is closed.",
            "The comparison is closed. Both revisions are still in the list.",
            "The comparison is closed. Both revisions are still sitting in the list, unchanged.",
            "The comparison is closed and nothing else moved. Both revisions are still sitting in the list, unchanged.",
        ],
        yue: [
            "個比較已經閂咗。",
            "個比較已經閂咗。",
            "個比較已經閂咗。兩個版本都仲喺列表度。",
            "個比較已經閂咗。兩個版本都仲好地地喺列表度，冇改動過。",
            "個比較已經閂咗，其他嘢一啲都冇郁。兩個版本都仲好地地喺列表度，冇改動過。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What an exported file says about itself                           */
    /* ---------------------------------------------------------------- */

    /*
     * These three are read outside the app, in a file somebody opened days later with no
     * panel around it. So the filtered one has to say it is a subset and how big the whole
     * is, and the empty one has to say the history is fine and the filters simply matched
     * nobody, because in a file there is nothing else to look at that would say so.
     */
    "history.exportFiltered": {
        en: [
            "This file holds {kept} of {total} revisions, across {days} days, the ones the filters on screen matched.",
            "This file holds {kept} of {total} revisions, across {days} days, the ones the filters on screen matched.",
            "This file holds {kept} of {total} revisions, across {days} days: the ones the filters on screen matched.",
            "This file holds {kept} of {total} revisions, across {days} days, which is exactly what the filters on screen matched and nothing else.",
            "This file holds {kept} of {total} revisions, across {days} days, which is exactly what the filters on screen matched. The others are still recorded; they simply did not match.",
        ],
        yue: [
            "呢個檔案有 {total} 個版本入面嘅 {kept} 個，橫跨 {days} 日，即係畫面上啲篩選揀中嗰啲。",
            "呢個檔案有 {total} 個版本入面嘅 {kept} 個，橫跨 {days} 日，即係畫面上啲篩選揀中嗰啲。",
            "呢個檔案有 {total} 個版本入面嘅 {kept} 個，橫跨 {days} 日：即係畫面上啲篩選揀中嗰啲。",
            "呢個檔案有 {total} 個版本入面嘅 {kept} 個，橫跨 {days} 日，正正就係畫面上啲篩選揀中嗰啲，冇多冇少。",
            "呢個檔案有 {total} 個版本入面嘅 {kept} 個，橫跨 {days} 日，正正就係畫面上啲篩選揀中嗰啲。其餘嘅一樣仲記錄住，只係唔啱篩選咋。",
        ],
    },
    "history.exportAll": {
        en: [
            "This file holds every revision recorded for this folder.",
            "This file holds every revision recorded for this folder.",
            "This file holds every revision recorded for this folder, with no filter applied.",
            "This file holds every revision recorded for this folder. No filter was applied, so nothing was left out.",
            "This file holds every revision recorded for this folder. No filter was applied and nothing was left out, which makes it long and honest.",
        ],
        yue: [
            "呢個檔案有呢個資料夾記錄過嘅每一個版本。",
            "呢個檔案有呢個資料夾記錄過嘅每一個版本。",
            "呢個檔案有呢個資料夾記錄過嘅每一個版本，冇用過任何篩選。",
            "呢個檔案有呢個資料夾記錄過嘅每一個版本。冇用過任何篩選，所以一個都冇漏低。",
            "呢個檔案有呢個資料夾記錄過嘅每一個版本。冇用過任何篩選，一個都冇漏低，所以佢又長又老實。",
        ],
    },
    "history.exportEmpty": {
        en: [
            "Nothing matched these filters.",
            "Nothing matched these filters.",
            "Nothing matched these filters, so this file lists no revision.",
            "Nothing matched these filters, so this file lists no revision at all.",
            "Nothing matched these filters, so this file lists no revision at all. The history itself is untouched; the filters simply found nobody.",
        ],
        yue: [
            "冇嘢符合呢啲篩選。",
            "冇嘢符合呢啲篩選。",
            "冇嘢符合呢啲篩選，所以呢個檔案冇列出任何版本。",
            "冇嘢符合呢啲篩選，所以呢個檔案一個版本都冇列出。",
            "冇嘢符合呢啲篩選，所以呢個檔案一個版本都冇列出。份記錄本身乜事都冇，只係啲篩選搵唔到人咋。",
        ],
    },
    "history.compare.exportBetween": {
        en: [
            "From {a} ({aLabel}) to {b} ({bLabel}).",
            "From {a} ({aLabel}) to {b} ({bLabel}).",
            "From {a} ({aLabel}) to {b} ({bLabel}), in that direction.",
            "From {a} ({aLabel}) to {b} ({bLabel}), in that direction and no other.",
            "From {a} ({aLabel}) to {b} ({bLabel}), in that direction and no other, because read backwards every line below would mean its opposite.",
        ],
        yue: [
            "由 {a}（{aLabel}）去 {b}（{bLabel}）。",
            "由 {a}（{aLabel}）去 {b}（{bLabel}）。",
            "由 {a}（{aLabel}）去 {b}（{bLabel}），方向就係咁。",
            "由 {a}（{aLabel}）去 {b}（{bLabel}），方向就係咁，冇第二個方向。",
            "由 {a}（{aLabel}）去 {b}（{bLabel}），方向就係咁，冇第二個方向；倒轉嚟讀，下面每一行都會變成相反意思。",
        ],
    },
    /*
     * Read in a file, where "the comparison came out empty" and "the comparison failed" look
     * identical unless the sentence rules the second one out. Its on-screen twin is
     * `history.diff.identical`, which can lean on the panel around it and this cannot.
     */
    "history.compare.exportEmpty": {
        en: [
            "These two moments hold exactly the same files.",
            "These two moments hold exactly the same files.",
            "These two moments hold exactly the same files, byte for byte.",
            "These two moments hold exactly the same files, byte for byte. Nothing changed between them.",
            "These two moments hold exactly the same files, byte for byte. Nothing changed between them, which is a real answer rather than a missing one.",
        ],
        yue: [
            "呢兩個時刻嘅檔案完全一樣。",
            "呢兩個時刻嘅檔案完全一樣。",
            "呢兩個時刻嘅檔案完全一樣，一個位元組都冇分別。",
            "呢兩個時刻嘅檔案完全一樣，一個位元組都冇分別。中間乜都冇改過。",
            "呢兩個時刻嘅檔案完全一樣，一個位元組都冇分別。中間乜都冇改過，呢個係一個真答案，唔係讀唔到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The readable diff                                                 */
    /* ---------------------------------------------------------------- */

    "history.diff.nothing": {
        en: [
            "No file changed.",
            "No file changed.",
            "No file changed at all.",
            "Not one file changed.",
            "Not one file changed, and that is the whole report.",
        ],
        yue: [
            "冇檔案改過。",
            "冇檔案改過。",
            "完全冇檔案改過。",
            "一個檔案都冇改過。",
            "一個檔案都冇改過，成份報告就係咁多。",
        ],
    },
    /*
     * The every-file-unreadable case. It must not read as "nothing much happened": the files
     * did change and this build could not parse any of them, so the raw patch is all there is.
     */
    "history.diff.filesOnly": {
        en: [
            "{files} changed.",
            "{files} changed.",
            "{files} changed, and none of them could be read as settings.",
            "{files} changed. None of them could be read as settings, so only the raw patches are below.",
            "{files} changed. None of them could be read as settings, so what is below is the raw patch and nothing prettier.",
        ],
        yue: [
            "{files} 改咗。",
            "{files} 改咗。",
            "{files} 改咗，全部都讀唔到做設定。",
            "{files} 改咗。全部都讀唔到做設定，所以下面淨係得原始 patch。",
            "{files} 改咗。全部都讀唔到做設定，所以下面得返原始 patch，冇靚啲嘅版本。",
        ],
    },
    "history.diff.summary": {
        en: [
            "{files} changed, {settings} settings between them.",
            "{files} changed, {settings} settings between them.",
            "{files} changed, with {settings} settings between them.",
            "{files} changed, carrying {settings} settings between them.",
            "{files} changed, carrying {settings} settings between them, every one of them listed below rather than summarised.",
        ],
        yue: [
            "{files} 改咗，之間共 {settings} 項設定。",
            "{files} 改咗，之間共 {settings} 項設定。",
            "{files} 改咗，之間一共有 {settings} 項設定。",
            "{files} 改咗，之間夾住 {settings} 項設定。",
            "{files} 改咗，之間夾住 {settings} 項設定，全部喺下面逐項列出，唔係撮要。",
        ],
    },
    "history.diff.noSettings": {
        en: [
            "No setting changed in this file. Something else did: a comment, an ordering, or the spacing.",
            "No setting changed in this file. Something else did: a comment, an ordering, or the spacing.",
            "No setting changed in this file, but something did: a comment, an ordering, or the spacing.",
            "No setting changed in this file. Something did move, though: a comment, an ordering, or the spacing.",
            "No setting changed in this file. Something did move, though, and it was a comment, an ordering, or the spacing.",
        ],
        yue: [
            "呢個檔案冇設定改過。改嘅係第啲嘢：註解、次序，或者空格。",
            "呢個檔案冇設定改過。改嘅係第啲嘢：註解、次序，或者空格。",
            "呢個檔案冇設定改過，但係真係有嘢改咗：註解、次序，或者空格。",
            "呢個檔案冇設定改過。不過真係有嘢郁過：註解、次序，或者空格。",
            "呢個檔案冇設定改過。不過真係有嘢郁過，而郁嘅係註解、次序，或者空格。",
        ],
    },
    /* The on-screen twin of `history.compare.exportEmpty`, read with the panel still around it. */
    "history.diff.identical": {
        en: [
            "These two moments hold exactly the same files.",
            "These two moments hold exactly the same files.",
            "These two moments hold exactly the same files. There is nothing to show.",
            "These two moments hold exactly the same files, so there is nothing to show here.",
            "These two moments hold exactly the same files, so there is nothing to show here. That is an answer, not a failure to read them.",
        ],
        yue: [
            "呢兩個時刻嘅檔案完全一樣。",
            "呢兩個時刻嘅檔案完全一樣。",
            "呢兩個時刻嘅檔案完全一樣，冇嘢可以顯示。",
            "呢兩個時刻嘅檔案完全一樣，所以呢度冇嘢可以顯示。",
            "呢兩個時刻嘅檔案完全一樣，所以呢度冇嘢可以顯示。呢個係答案，唔係讀唔到佢哋。",
        ],
    },
    /*
     * The two selective restores. Both name the revision the value comes from, because the
     * caller decides which end that is and a button naming the wrong one of two similar
     * values is worse than a button that promises nothing. The file one also promises that no
     * other file is touched, which is the entire reason somebody reaches for it instead of
     * restoring the whole folder.
     */
    "history.diff.restoreFileLong": {
        en: [
            "Put {path} back as it was at {source}, leaving every other file alone",
            "Put {path} back as it was at {source}, leaving every other file alone",
            "Put {path} back to the way it was at {source}, leaving every other file alone",
            "Put {path} back to exactly the way it was at {source}, leaving every other file alone",
            "Put {path} back to exactly the way it was at {source}, and only that one file: this leaves every other file alone",
        ],
        yue: [
            "將 {path} 還原返做 {source} 嗰陣嘅樣，其他檔案一律唔郁",
            "將 {path} 還原返做 {source} 嗰陣嘅樣，其他檔案一律唔郁",
            "將 {path} 還原返做 {source} 嗰陣個樣，其他檔案一律唔郁",
            "將 {path} 完完全全還原返做 {source} 嗰陣個樣，其他檔案一律唔郁",
            "將 {path} 完完全全還原返做 {source} 嗰陣個樣，而且淨係郁呢一個檔案：其他檔案一律唔郁",
        ],
    },
    "history.diff.restoreSettingLong": {
        en: [
            "Put {key} back to {value}, as it was at {source}",
            "Put {key} back to {value}, as it was at {source}",
            "Put {key} back to {value}, the value it had at {source}",
            "Put {key} back to {value}, which is the value it had at {source}",
            "Put {key} back to {value}, which is the value it had at {source}, and change nothing else in the file",
        ],
        yue: [
            "將 {key} 還原返做 {value}，即係 {source} 嗰陣嘅值",
            "將 {key} 還原返做 {value}，即係 {source} 嗰陣嘅值",
            "將 {key} 還原返做 {value}，即係佢喺 {source} 嗰陣嘅值",
            "將 {key} 還原返做 {value}，呢個就係佢喺 {source} 嗰陣嘅值",
            "將 {key} 還原返做 {value}，呢個就係佢喺 {source} 嗰陣嘅值，個檔案入面其他嘢一律唔改",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* One row: labelling, comparing from it, restoring it               */
    /* ---------------------------------------------------------------- */

    "history.row.labelHint": {
        en: [
            "What this moment was, in your own words",
            "What this moment was, in your own words",
            "What this moment was, said in your own words",
            "What this moment actually was, in your own words",
            "What this moment actually was, in your own words: what changed is already recorded",
        ],
        yue: [
            "用你自己嘅講法，寫低呢一刻係咩事",
            "用你自己嘅講法，寫低呢一刻係咩事",
            "用你自己嘅講法，寫低呢一刻究竟係咩事",
            "用你自己嘅講法，寫低呢一刻真係咩事",
            "用你自己嘅講法，寫低呢一刻真係咩事：改咗乜，記錄自己已經有",
        ],
    },
    "history.row.pickALong": {
        en: [
            "Compare from here: make {label} the older end, A",
            "Compare from here: make {label} the older end, A",
            "Compare starting here: make {label} the older end, A",
            "Start the comparison here: make {label} the older end, A",
            "Start the comparison here, at {label}: that makes it the older end, A",
        ],
        yue: [
            "由呢度開始比較：將 {label} 設做較舊嗰端 A",
            "由呢度開始比較：將 {label} 設做較舊嗰端 A",
            "由呢一個開始比較：將 {label} 設做較舊嗰端 A",
            "喺呢度開始比較：將 {label} 設做較舊嗰端 A",
            "喺 {label} 呢度開始比較：即係將佢設做較舊嗰端 A",
        ],
    },
    "history.row.pickBLong": {
        en: [
            "Compare to here: make {label} the newer end, B",
            "Compare to here: make {label} the newer end, B",
            "Compare up to here: make {label} the newer end, B",
            "End the comparison here: make {label} the newer end, B",
            "End the comparison here, at {label}: that makes it the newer end, B",
        ],
        yue: [
            "比較到呢度為止：將 {label} 設做較新嗰端 B",
            "比較到呢度為止：將 {label} 設做較新嗰端 B",
            "比較去到呢一個為止：將 {label} 設做較新嗰端 B",
            "喺呢度結束比較：將 {label} 設做較新嗰端 B",
            "喺 {label} 呢度結束比較：即係將佢設做較新嗰端 B",
        ],
    },
    /*
     * The sentence the whole surface turns on. A restore rewrites files on disk, and the only
     * reason it is safe to press is that the state it replaces is snapshotted first as its own
     * revision: the history is append-only, so the undo is real and can itself be undone. Both
     * halves are pinned in `HISTORY_FACTS`, and no level may reduce this to "restore {label}".
     */
    "history.row.restoreConfirmLong": {
        en: [
            "Write the config folder back to: {label}. The state it replaces is saved first, so this can be undone.",
            "Write the config folder back to: {label}. The state it replaces is saved first, so this can be undone.",
            "Write the config folder back to: {label}. The state it replaces is saved first as its own revision, so this can be undone.",
            "Write the config folder back to {label}. Whatever is there now is saved first as its own revision, so this can be undone.",
            "Write the config folder back to {label}. Nothing is thrown away doing it: whatever is there now is saved first as its own revision, so this can be undone.",
        ],
        yue: [
            "將設定資料夾寫返做：{label}。佢頂走嗰個狀態會先儲存低，所以呢一步可以復原。",
            "將設定資料夾寫返做：{label}。佢頂走嗰個狀態會先儲存低，所以呢一步可以復原。",
            "將設定資料夾寫返做：{label}。佢頂走嗰個狀態會先以一個版本儲存低，所以呢一步可以復原。",
            "將設定資料夾寫返做 {label}。而家喺度嗰個狀態會先以一個版本儲存低，所以呢一步可以復原。",
            "將設定資料夾寫返做 {label}。過程入面冇嘢會被掉走：而家喺度嗰個狀態會先以一個版本儲存低，所以呢一步可以復原。",
        ],
    },
    "history.row.noFiles": {
        en: [
            "This revision recorded no file changes.",
            "This revision recorded no file changes.",
            "This revision recorded no file changes at all.",
            "This revision recorded no file changes. It is here because it was recorded, not because something changed.",
            "This revision recorded no file changes. It is in the list because it was recorded, not because anything moved on disk.",
        ],
        yue: [
            "呢個版本冇記錄到任何檔案改動。",
            "呢個版本冇記錄到任何檔案改動。",
            "呢個版本完全冇記錄到任何檔案改動。",
            "呢個版本冇記錄到任何檔案改動。佢喺度係因為佢被記錄咗，唔係因為有嘢改咗。",
            "呢個版本冇記錄到任何檔案改動。佢喺列表度係因為佢被記錄咗，唔係因為磁碟上有嘢郁過。",
        ],
    },
    "history.row.loadingDiff": {
        en: [
            "Reading what changed...",
            "Reading what changed...",
            "Reading what this revision changed...",
            "Reading what this revision changed, straight from the history...",
            "Reading what this revision changed, straight from the history, one file at a time...",
        ],
        yue: [
            "讀緊改咗啲乜...",
            "讀緊改咗啲乜...",
            "讀緊呢個版本改咗啲乜...",
            "喺份記錄度直接讀緊呢個版本改咗啲乜...",
            "喺份記錄度直接讀緊呢個版本改咗啲乜，一個檔案一個檔案咁讀...",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What a restore did not do                                         */
    /* ---------------------------------------------------------------- */

    /*
     * Three reports that all say "less happened than you asked for", and each has to say why
     * without sounding like a failure. The reformatting one is the subtle one: the values are
     * identical and only the layout moved, and a level that lost "JSON keeps no comments"
     * leaves somebody hunting for comments this editor never deleted, because they were never
     * in the file to begin with.
     */
    "history.restoreSkipped": {
        en: [
            "{path} was left alone, because this editor does not write that file.",
            "{path} was left alone, because this editor does not write that file.",
            "{path} was left exactly as it was, because this editor does not write that file.",
            "{path} was left exactly as it was. This editor does not write that file, so it did not touch it.",
            "{path} was left exactly as it was. This editor does not write that file, so it kept its hands off it entirely.",
        ],
        yue: [
            "{path} 冇郁過，因為呢個編輯器唔會寫嗰個檔案。",
            "{path} 冇郁過，因為呢個編輯器唔會寫嗰個檔案。",
            "{path} 完全冇郁過，因為呢個編輯器唔會寫嗰個檔案。",
            "{path} 完全冇郁過。呢個編輯器唔會寫嗰個檔案，所以佢冇掂過佢。",
            "{path} 完全冇郁過。呢個編輯器唔會寫嗰個檔案，所以佢連掂都冇掂過。",
        ],
    },
    "history.settingRefused": {
        en: [
            "{key} was left as it is.",
            "{key} was left as it is.",
            "{key} was left as it is, unchanged.",
            "{key} was left as it is. Nothing was written for it.",
            "{key} was left exactly as it is, and nothing was written for it.",
        ],
        yue: [
            "{key} 維持原樣。",
            "{key} 維持原樣。",
            "{key} 維持原樣，冇改動過。",
            "{key} 維持原樣。冇為佢寫過任何嘢。",
            "{key} 完完全全維持原樣，亦都冇為佢寫過任何嘢。",
        ],
    },
    "history.settingReformatted": {
        en: [
            "{path} is written out again in this editor's own layout, because JSON keeps no comments to preserve.",
            "{path} is written out again in this editor's own layout, because JSON keeps no comments to preserve.",
            "{path} is written out again in this editor's own layout. JSON keeps no comments to preserve.",
            "{path} comes back in this editor's own layout, because JSON keeps no comments to preserve. The values are the same ones.",
            "{path} comes back wearing this editor's own layout, because JSON keeps no comments to preserve. The values are the same ones; only the spacing changed its mind.",
        ],
        yue: [
            "{path} 會用返呢個編輯器自己嘅排版重新寫一次，因為 JSON 冇註解可以保留。",
            "{path} 會用返呢個編輯器自己嘅排版重新寫一次，因為 JSON 冇註解可以保留。",
            "{path} 會用返呢個編輯器自己嘅排版重新寫一次。JSON 本身冇註解可以保留。",
            "{path} 出返嚟嗰陣係用呢個編輯器自己嘅排版，因為 JSON 冇註解可以保留。啲值就係同一堆值。",
            "{path} 出返嚟嗰陣著咗呢個編輯器自己嘅排版，因為 JSON 冇註解可以保留。啲值一模一樣，改變主意嘅淨係啲空位。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Trimming, which is the one thing here that keeps nothing          */
    /* ---------------------------------------------------------------- */

    /*
     * The only irreversible action on this surface, and the only entry in this module whose
     * playful levels are allowed to be *less* comforting than its professional ones. Both
     * counts, the word "for good" and the flat statement that nothing can restore what is
     * removed survive every level, and level 5 makes the contrast with the rest of the panel
     * explicit rather than telling a joke in place of the warning.
     */
    "history.trimAction": {
        en: [
            "This removes {drop} older revisions for good and keeps the newest {keep}. What is removed cannot be restored afterwards, by this app or by anything else.",
            "This removes {drop} older revisions for good and keeps the newest {keep}. What is removed cannot be restored afterwards, by this app or by anything else.",
            "This removes {drop} older revisions for good and keeps the newest {keep}. What is removed cannot be restored afterwards, by this app or by any other tool.",
            "{drop} older revisions go for good and the newest {keep} stay. What is removed cannot be restored afterwards, by this app or by any other tool: this is the one action in this panel that keeps no copy.",
            "{drop} older revisions go for good and the newest {keep} stay. What is removed cannot be restored afterwards, by this app or by any other tool. Everything else here quietly keeps a copy; this is the one that does not.",
        ],
        yue: [
            "呢個操作會永久移除 {drop} 個較舊嘅版本，保留最新嘅 {keep} 個。移除咗嘅嘢之後冇得還原，呢個程式做唔到，其他任何嘢都做唔到。",
            "呢個操作會永久移除 {drop} 個較舊嘅版本，保留最新嘅 {keep} 個。移除咗嘅嘢之後冇得還原，呢個程式做唔到，其他任何嘢都做唔到。",
            "呢個操作會永久移除 {drop} 個較舊嘅版本，保留最新嘅 {keep} 個。移除咗嘅嘢之後冇得還原，呢個程式做唔到，其他任何工具都做唔到。",
            "{drop} 個較舊嘅版本會永久消失，最新嘅 {keep} 個會留低。移除咗嘅嘢之後冇得還原，呢個程式同其他任何工具都做唔到：呢個係成版入面唯一一個唔會留底嘅操作。",
            "{drop} 個較舊嘅版本會永久消失，最新嘅 {keep} 個會留低。移除咗嘅嘢之後冇得還原，呢個程式同其他任何工具都做唔到。呢版其他操作全部都會靜靜雞留底，得呢個唔會。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Where the history lives, and where it does not go                 */
    /* ---------------------------------------------------------------- */

    /*
     * Three privacy statements read together at the foot of the panel. Each is a promise
     * about what this app does *not* do with a repository full of somebody's configuration,
     * so the negations are the facts: no `.git` inside your folder, no push, no upload.
     */
    "history.whereItLives": {
        en: [
            "Kept in its own repository at {repository}, beside this app's data. Nothing is written into your config folder except by a restore.",
            "Kept in its own repository at {repository}, beside this app's data. Nothing is written into your config folder except by a restore.",
            "Kept in its own repository at {repository}, beside this app's data. Nothing is written into your config folder except by a restore you asked for.",
            "It lives in its own repository at {repository}, beside this app's data. Nothing is written into your config folder except by a restore you asked for.",
            "It lives in its own repository at {repository}, beside this app's data, and never inside your folders. Nothing is written into your config folder except by a restore you asked for.",
        ],
        yue: [
            "記錄放喺自己嘅儲存庫 {repository}，同呢個程式嘅資料擺埋一齊。除非做還原，否則唔會寫任何嘢入你嘅設定資料夾。",
            "記錄放喺自己嘅儲存庫 {repository}，同呢個程式嘅資料擺埋一齊。除非做還原，否則唔會寫任何嘢入你嘅設定資料夾。",
            "記錄放喺自己嘅儲存庫 {repository}，同呢個程式嘅資料擺埋一齊。除非你自己做還原，否則唔會寫任何嘢入你嘅設定資料夾。",
            "佢住喺自己嘅儲存庫 {repository}，同呢個程式嘅資料擺埋一齊。除非你自己做還原，否則唔會寫任何嘢入你嘅設定資料夾。",
            "佢住喺自己嘅儲存庫 {repository}，同呢個程式嘅資料擺埋一齊，唔會走入你啲資料夾度。除非你自己做還原，否則唔會寫任何嘢入你嘅設定資料夾。",
        ],
    },
    "history.local": {
        en: [
            "This history stays on this machine. It has nowhere to send itself and nothing to send it with.",
            "This history stays on this machine. It has nowhere to send itself and nothing to send it with.",
            "This history stays on this machine: it has nowhere to send itself and nothing to send it with.",
            "This history stays on this machine. There is nowhere to send itself and nothing to send it with, so it does not.",
            "This history stays on this machine. There is nowhere to send itself and nothing to send it with, so it stays exactly where it is and minds its own business.",
        ],
        yue: [
            "呢份記錄只會留喺呢部機。佢冇地方可以送出去，亦冇工具可以送。",
            "呢份記錄只會留喺呢部機。佢冇地方可以送出去，亦冇工具可以送。",
            "呢份記錄只會留喺呢部機：佢冇地方可以送出去，亦冇工具可以送。",
            "呢份記錄只會留喺呢部機。冇地方可以送出去，亦冇工具可以送，所以佢冇送。",
            "呢份記錄只會留喺呢部機。冇地方可以送出去，亦冇工具可以送，所以佢就安安樂樂留喺度，唔理外面嘅事。",
        ],
    },
    /*
     * A remote is configured but never used, which is the one shape a reader is likely to
     * misread as "so my config is on the internet". Every level says the app never sends
     * anything to it, and names the remote so it can be checked rather than trusted.
     */
    "history.remote": {
        en: [
            "This history has a remote configured ({remotes}). This app never sends anything to it.",
            "This history has a remote configured ({remotes}). This app never sends anything to it.",
            "This history has a remote configured ({remotes}). This app never sends anything to it, at any point.",
            "This history has a remote configured ({remotes}), which this app never sends anything to.",
            "This history has a remote configured ({remotes}). Somebody set that up by hand, and this app never sends anything to it.",
        ],
        yue: [
            "呢份記錄設定咗一個 remote（{remotes}）。呢個程式永遠唔會送任何嘢上去。",
            "呢份記錄設定咗一個 remote（{remotes}）。呢個程式永遠唔會送任何嘢上去。",
            "呢份記錄設定咗一個 remote（{remotes}）。呢個程式喺任何時候都唔會送任何嘢上去。",
            "呢份記錄設定咗一個 remote（{remotes}），而呢個程式永遠唔會送任何嘢上去。",
            "呢份記錄設定咗一個 remote（{remotes}）：係有人自己加落去嘅，而呢個程式永遠唔會送任何嘢上去。",
        ],
    },
    "history.gitVersion": {
        en: [
            "Recorded with Git {version}.",
            "Recorded with Git {version}.",
            "Recorded with Git {version}, the one found on this machine.",
            "Recorded with Git {version}, which is the one found on this machine.",
            "Recorded with Git {version}, which is whichever Git this machine had. The history is a real repository, not an imitation of one.",
        ],
        yue: [
            "用 Git {version} 記錄。",
            "用 Git {version} 記錄。",
            "用 Git {version} 記錄，即係喺呢部機搵到嗰個。",
            "用 Git {version} 記錄，就係喺呢部機搵到嗰個。",
            "用 Git {version} 記錄，即係呢部機有咩就用咩。份記錄係真嘅儲存庫，唔係扮出嚟嗰種。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* SimpleHistoryList.vue: browse and restore, for a history that      */
    /* offers only that - the profile list's and the application         */
    /* settings' own, per main/profiles/ipc.ts and main/settings/ipc.ts.  */
    /* ---------------------------------------------------------------- */

    /*
     * `HistoryRevisionRow`'s "reading what changed" spinner only runs while it is waiting
     * for a `diff` that never arrives; this is shown unconditionally instead, so expanding a
     * row explains what is missing rather than spinning forever. Two facts, and both matter:
     * that a comparison is genuinely absent (not merely slow), and that the file list above
     * this text still names what a revision touched.
     */
    "history.simple.diffUnavailable": {
        en: [
            "This history does not keep a comparison between revisions, only the list of files each one touched.",
            "This history does not keep a comparison between revisions, only the list of files each one touched.",
            "This history keeps no comparison between revisions - only the list of files each one touched, above.",
            "There is no comparison between revisions here, only the list of files each one touched, shown above.",
            "There is no side-by-side comparison here between revisions - only the list of files each one touched, shown above, which is honestly all this history keeps track of today.",
        ],
        yue: [
            "呢份記錄冇兩個版本之間嘅比較，淨係有每個版本改過邊啲檔案嘅清單。",
            "呢份記錄冇兩個版本之間嘅比較，淨係有每個版本改過邊啲檔案嘅清單。",
            "呢份記錄唔會兩個版本咁樣比較，淨係上面嗰張每個版本改過邊啲檔案嘅清單。",
            "呢度冇兩個版本嘅比較，淨係上面嗰張每個版本改過邊啲檔案嘅清單。",
            "呢度冇兩個版本並排比較呢回事，淨係上面嗰張每個版本改過邊啲檔案嘅清單，講句老實話，呢份記錄而家就係得咁多。",
        ],
    },

    "history.simple.unavailable": {
        en: [
            "This history is not available right now.",
            "This history is not available right now.",
            "This history is not available right now, and nothing recorded through it has been lost.",
            "This history is not available right now. Whatever has already been recorded through it is still there and has not been lost.",
            "This history is not available right now, whatever the reason - but nothing recorded through it in the past has gone anywhere.",
        ],
        yue: [
            "而家用唔到呢份記錄。",
            "而家用唔到呢份記錄。",
            "而家用唔到呢份記錄，之前記低咗嘅嘢一樣都冇唔見。",
            "而家用唔到呢份記錄。之前透過佢記低咗嘅嘢，依然喺度，冇唔見過。",
            "唔理係咩原因，而家就係用唔到呢份記錄，但之前透過佢記低咗嘅嘢，一樣都冇走鬼。",
        ],
    },

    "history.simple.empty": {
        en: [
            "No revisions recorded yet. One is kept every time this is saved.",
            "No revisions recorded yet. One is kept every time this is saved.",
            "No revisions recorded yet - one is kept every time this is saved.",
            "Nothing has been recorded here yet. A revision is kept every time this is saved, so the first one is not far off.",
            "Nothing has been recorded here yet, which is a beginning rather than a loss. A revision is kept every time this is saved, so the first one shows up the moment there is something to keep.",
        ],
        yue: [
            "暫時仲未記錄過任何版本。每次儲存都會記低一個。",
            "暫時仲未記錄過任何版本。每次儲存都會記低一個。",
            "暫時仲未記錄過任何版本，每次儲存都會記低一個。",
            "呢度暫時仲未記錄過任何嘢。每次儲存都會記低一個版本，第一個好快就會嚟。",
            "呢度暫時仲未記錄過任何嘢，呢個係開始，唔係唔見咗嘢。每次儲存都會記低一個版本，一有嘢好記，第一個就即刻出現。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const HISTORY_FIXED = {
    /* The panel's own frame. */
    "history.title": { en: "Version history", yue: "版本記錄" },
    "history.reload": { en: "Read this folder's history again", yue: "再讀一次呢個資料夾嘅記錄" },
    "history.search": { en: "Search this history", yue: "搜尋呢份記錄" },
    "history.searchHint": {
        en: "A map name, a label, a revision",
        yue: "地圖名、標籤，或者一個版本",
    },
    "history.snapshot": { en: "Record now", yue: "即刻記錄" },
    "history.snapshotTaken": { en: "Recorded: {label}", yue: "已記錄：{label}" },
    "history.copy": { en: "Copy", yue: "複製" },
    "history.export": { en: "Export", yue: "匯出" },

    /* The export menu, shared by the panel and the comparison. */
    "history.exportMarkdown": { en: "Markdown file", yue: "Markdown 檔案" },
    "history.exportJson": { en: "JSON file", yue: "JSON 檔案" },
    "history.exportCsv": { en: "CSV file", yue: "CSV 檔案" },
    "history.exportPlain": { en: "Plain text file", yue: "純文字檔案" },

    /* Filters, and the counts above them. */
    "history.summaryAll": { en: "{total} revisions", yue: "{total} 個版本" },
    "history.summary": {
        en: "Showing {kept} of {total} revisions",
        yue: "顯示緊 {total} 個版本入面嘅 {kept} 個",
    },
    "history.filters": { en: "Filters", yue: "篩選" },
    "history.actionFilter": { en: "Filter by what a revision did", yue: "按版本做過乜嚟篩選" },
    "history.clearFilters": { en: "Clear every filter", yue: "清走所有篩選" },

    /* The day timeline. */
    "history.timeline.label": {
        en: "Revisions, grouped by the day they happened",
        yue: "各個版本，按發生嗰日分組",
    },
    "history.timeline.daySummary": {
        en: "{revisions} revisions, {files} files",
        yue: "{revisions} 個版本，{files} 個檔案",
    },
    "history.timeline.undated": { en: "Revisions with no readable date", yue: "冇可讀日期嘅版本" },
    "history.timeline.holdsCurrent": {
        en: "Includes what is on disk now",
        yue: "包括而家喺磁碟上嗰個",
    },

    /* Headings written into an exported file. */
    "history.exportTitle": { en: "BlueMap config history", yue: "BlueMap 設定記錄" },
    "history.exportFolder": { en: "Config folder: {folder}", yue: "設定資料夾：{folder}" },
    "history.exportRepository": {
        en: "History repository: {repository}",
        yue: "記錄儲存庫：{repository}",
    },
    "history.compare.exportTitle": {
        en: "What changed between two revisions",
        yue: "兩個版本之間改咗啲乜",
    },

    /* The comparison surface. */
    "history.compare.title": {
        en: "What changed between {a} and {b}",
        yue: "{a} 同 {b} 之間改咗啲乜",
    },
    "history.compare.older": { en: "A, the older", yue: "A，較舊嗰個" },
    "history.compare.newer": { en: "B, the newer", yue: "B，較新嗰個" },
    "history.compare.noneYet": { en: "not chosen yet", yue: "仲未揀" },
    "history.compare.swap": { en: "Swap", yue: "調轉" },
    "history.compare.copyLong": {
        en: "Copy this comparison to the clipboard",
        yue: "將呢個比較複製到剪貼簿",
    },
    "history.compare.copy": { en: "Copy", yue: "複製" },
    "history.compare.exportLong": {
        en: "Export this comparison to a file",
        yue: "將呢個比較匯出做檔案",
    },
    "history.compare.export": { en: "Export", yue: "匯出" },
    "history.compare.close": { en: "Stop comparing", yue: "唔比較住" },

    /* The readable diff: the file this app knows a name for, and the change words. */
    "history.file.map": { en: "the {name} map", yue: "{name} 呢張地圖" },
    "history.file.storage": { en: "the {name} storage", yue: "{name} 呢個儲存" },
    "history.file.core": { en: "the core settings", yue: "核心設定" },
    "history.file.webapp": { en: "the web app settings", yue: "網頁應用設定" },
    "history.file.webserver": { en: "the web server settings", yue: "網頁伺服器設定" },
    "history.file.plugin": { en: "the plugin settings", yue: "外掛設定" },
    "history.diff.added": { en: "Added", yue: "加咗" },
    "history.diff.removed": { en: "Taken away", yue: "攞走咗" },
    "history.diff.changed": { en: "Changed", yue: "改咗" },
    "history.diff.fileCount": { en: "{count} files", yue: "{count} 個檔案" },
    /* Said in place of a value, so it has to read as a state rather than as an empty string. */
    "history.diff.notSet": { en: "not set", yue: "未設定" },
    "history.diff.wasUnset": { en: "(was not set)", yue: "（之前未設定）" },
    "history.diff.nowUnset": { en: "(no longer set)", yue: "（而家冇咗設定）" },
    "history.diff.restoreFile": { en: "Put this file back", yue: "還原返呢個檔案" },
    "history.diff.showRaw": { en: "Show the raw patch", yue: "顯示原始 patch" },
    "history.diff.rawFor": { en: "The raw patch for {path}", yue: "{path} 嘅原始 patch" },

    /*
     * The action words on a revision's chip. `started` is the first commit of the repository
     * rather than something the user did, and `pruned` is the trim, which is why neither is
     * phrased as an edit.
     */
    "history.action.started": { en: "History started", yue: "記錄開始" },
    "history.action.created": { en: "Added", yue: "加咗" },
    "history.action.changed": { en: "Changed", yue: "改咗" },
    "history.action.deleted": { en: "Deleted", yue: "刪咗" },
    "history.action.mixed": { en: "Several changes", yue: "幾樣改動" },
    "history.action.restored": { en: "Restored", yue: "還原咗" },
    "history.action.pruned": { en: "Trimmed", yue: "修剪咗" },

    /* One row. */
    "history.row.current": { en: "On disk now", yue: "而家喺磁碟上" },
    "history.row.pickedA": { en: "Chosen as A, the older end", yue: "揀咗做 A，即係較舊嗰端" },
    "history.row.pickedB": { en: "Chosen as B, the newer end", yue: "揀咗做 B，即係較新嗰端" },
    /* The chip is one letter and the same letter in both languages; the row label says which end. */
    "history.row.chipA": { en: "A", yue: "A" },
    "history.row.chipB": { en: "B", yue: "B" },
    "history.row.labelField": { en: "Label for this revision", yue: "呢個版本嘅標籤" },
    "history.row.labelSave": { en: "Save label", yue: "儲存標籤" },
    "history.row.labelCancel": { en: "Cancel", yue: "取消" },
    "history.row.hideChanges": {
        en: "Hide what this revision changed",
        yue: "收埋呢個版本改咗嘅嘢",
    },
    "history.row.showChanges": { en: "Show what this revision changed", yue: "睇呢個版本改咗啲乜" },
    "history.row.relabel": { en: "Change this revision's label", yue: "改呢個版本嘅標籤" },
    "history.row.label": { en: "Give this revision a label", yue: "俾呢個版本改個標籤" },
    "history.row.restore": { en: "Restore", yue: "還原" },
    /*
     * The second click of the in-place confirm. It says what will be written rather than
     * "Confirm", and its neighbour says what happens if you walk away, because "Cancel" beside
     * a restore is ambiguous about which state is being kept.
     */
    "history.row.restoreConfirm": { en: "Write these files back", yue: "寫返呢啲檔案" },
    "history.row.restoreCancel": { en: "Keep what is there", yue: "保留而家嗰啲" },

    /* Trimming. */
    "history.keep": { en: "Revisions to keep", yue: "保留幾多個版本" },
    "history.trimTitle": { en: "Remove older revisions", yue: "移除較舊嘅版本" },
    "history.trimConfirm": {
        en: "Slide to remove the older revisions",
        yue: "拉動嚟移除較舊嘅版本",
    },
    "history.trimNothing": { en: "Nothing to remove", yue: "冇嘢要移除" },
    "history.trim": { en: "Remove {drop} older revisions", yue: "移除 {drop} 個較舊嘅版本" },

    /* SimpleHistoryList.vue's own chrome, shared with SimpleHistoryPanel.vue below it. */
    "history.simple.refresh": { en: "Read {title} history again", yue: "重新讀取{title}嘅版本記錄" },
    "history.simple.refreshShort": { en: "Refresh", yue: "重新整理" },
    "history.simple.loading": { en: "Reading the history...", yue: "讀緊版本記錄……" },
    /*
     * SimpleHistoryPanel.vue's own search hint. Not `history.searchHint`'s "a map name": this
     * panel also covers the application's own settings, which have no map to name.
     */
    "history.simple.searchHint": {
        en: "A label, an action, a revision",
        yue: "一個標籤、一個動作，或者一個版本",
    },
} as const satisfies Record<string, FixedString>;

export const HISTORY_FACTS = {
    "history.subtitle": {
        en: ["config folder", "recorded", "put back"],
        yue: ["設定資料夾", "記錄低", "還原返"],
    },
    // Not an error and not a loss: this build never had a history to keep.
    "history.noHost": {
        en: ["version history", "desktop shell"],
        yue: ["版本記錄", "桌面外殼"],
    },

    "history.copyView": { en: ["on screen", "clipboard"], yue: ["畫面", "剪貼簿"] },
    "history.exportView": { en: ["on screen", "file"], yue: ["畫面", "檔案"] },
    "history.copied": { en: ["on screen", "clipboard"], yue: ["畫面", "剪貼簿"] },
    "history.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },
    "history.exported": { en: ["{name}"], yue: ["{name}"] },

    "history.noActions": { en: ["recorded", "filter"], yue: ["記錄", "篩選"] },
    // The button's own name, so the instruction points at something that exists on screen.
    "history.emptyHistory": { en: ["recorded", "Record now"], yue: ["記錄", "即刻記錄"] },
    "history.emptyFiltered": { en: ["revision", "filters"], yue: ["版本", "篩選"] },
    "history.truncated": {
        en: ["{shown}", "{total}", "Narrow the search"],
        yue: ["{shown}", "{total}", "收窄搜尋"],
    },
    "history.keyboardHint": {
        en: ["up and down", "Enter", "A and B", "Escape"],
        yue: ["上下鍵", "Enter", "A 同 B", "Escape"],
    },
    "history.row.position": {
        en: ["{position}", "{total}", "{label}"],
        yue: ["{position}", "{total}", "{label}"],
    },

    "history.compare.pending": { en: ["revision", "compare"], yue: ["版本", "比較"] },
    "history.compare.howTo": {
        en: ["A on one revision", "B on another", "next to each other"],
        yue: ["揀 A", "揀 B", "隔籬"],
    },
    "history.compare.hint": {
        en: ["A on one revision", "B on another", "next to each other"],
        yue: ["揀 A", "揀 B", "隔籬"],
    },
    "history.compare.loading": { en: ["what changed"], yue: ["改咗啲乜"] },
    // Which end goes first, because a comparison read backwards means its own opposite.
    "history.compare.swapLong": {
        en: ["{b}", "{a}", "other way round"],
        yue: ["{b}", "{a}", "調轉"],
    },
    "history.compare.swapped": {
        en: ["comparison", "other way round"],
        yue: ["比較", "調轉"],
    },
    "history.compare.pickedA": { en: ["{label}", "A, the older"], yue: ["{label}", "A", "較舊"] },
    "history.compare.pickedB": { en: ["{label}", "B, the newer"], yue: ["{label}", "B", "較新"] },
    "history.compare.unpicked": { en: ["{label}", "comparison"], yue: ["{label}", "比較"] },
    "history.compare.stopped": { en: ["comparison", "closed"], yue: ["比較", "閂"] },

    "history.exportFiltered": {
        en: ["{kept}", "{total}", "{days}", "filters"],
        yue: ["{kept}", "{total}", "{days}", "篩選"],
    },
    "history.exportAll": { en: ["every revision", "this folder"], yue: ["每一個版本", "資料夾"] },
    "history.exportEmpty": { en: ["filters"], yue: ["篩選"] },
    "history.compare.exportBetween": {
        en: ["{a}", "{aLabel}", "{b}", "{bLabel}"],
        yue: ["{a}", "{aLabel}", "{b}", "{bLabel}"],
    },
    "history.compare.exportEmpty": { en: ["same files"], yue: ["完全一樣"] },

    "history.diff.nothing": { en: ["file changed"], yue: ["檔案", "改過"] },
    "history.diff.filesOnly": { en: ["{files}", "changed"], yue: ["{files}", "改咗"] },
    "history.diff.summary": { en: ["{files}", "{settings}"], yue: ["{files}", "{settings}"] },
    // What did not change, so nobody goes hunting for a setting that never moved.
    "history.diff.noSettings": {
        en: ["No setting changed", "comment", "spacing"],
        yue: ["冇設定改過", "註解", "空格"],
    },
    "history.diff.identical": { en: ["same files"], yue: ["完全一樣"] },
    // The promise that makes a single-file restore worth offering at all.
    "history.diff.restoreFileLong": {
        en: ["{path}", "{source}", "every other file alone"],
        yue: ["{path}", "{source}", "其他檔案一律唔郁"],
    },
    "history.diff.restoreSettingLong": {
        en: ["{key}", "{value}", "{source}"],
        yue: ["{key}", "{value}", "{source}"],
    },

    "history.row.labelHint": { en: ["your own words"], yue: ["你自己嘅講法"] },
    "history.row.pickALong": { en: ["{label}", "older end, A"], yue: ["{label}", "較舊嗰端 A"] },
    "history.row.pickBLong": { en: ["{label}", "newer end, B"], yue: ["{label}", "較新嗰端 B"] },
    /*
     * The safety property of the whole surface: the replaced state is saved before the write,
     * so the restore can be undone. Both clauses are pinned, in both languages, because a
     * level that keeps only one of them is a level that either frightens somebody off a safe
     * action or promises an undo without saying where it comes from.
     */
    "history.row.restoreConfirmLong": {
        en: ["{label}", "config folder", "saved first", "can be undone"],
        yue: ["{label}", "設定資料夾", "儲存低", "可以復原"],
    },
    "history.row.noFiles": {
        en: ["revision", "no file changes"],
        yue: ["版本", "冇記錄到任何檔案改動"],
    },
    "history.row.loadingDiff": { en: ["Reading", "changed"], yue: ["讀緊", "改咗"] },

    "history.restoreSkipped": {
        en: ["{path}", "left", "does not write"],
        yue: ["{path}", "冇郁過", "唔會寫"],
    },
    "history.settingRefused": { en: ["{key}", "left"], yue: ["{key}", "維持原樣"] },
    "history.settingReformatted": {
        en: ["{path}", "this editor's own layout", "JSON keeps no comments"],
        yue: ["{path}", "排版", "JSON", "註解"],
    },

    // The counts, the permanence, and that nothing anywhere can bring the removed ones back.
    "history.trimAction": {
        en: ["{drop}", "{keep}", "for good", "cannot be restored"],
        yue: ["{drop}", "{keep}", "永久", "冇得還原"],
    },

    "history.whereItLives": {
        en: ["{repository}", "own repository", "config folder", "restore"],
        yue: ["{repository}", "儲存庫", "設定資料夾", "還原"],
    },
    "history.local": {
        en: ["stays on this machine", "nowhere to send"],
        yue: ["留喺呢部機", "冇地方可以送"],
    },
    "history.remote": {
        en: ["{remotes}", "remote", "never sends"],
        yue: ["{remotes}", "remote", "唔會送"],
    },
    "history.gitVersion": { en: ["Git {version}"], yue: ["Git {version}"] },

    "history.simple.diffUnavailable": {
        en: ["comparison", "list of files"],
        yue: ["比較", "清單"],
    },
    "history.simple.unavailable": { en: ["not available"], yue: ["用唔到"] },
    "history.simple.empty": { en: ["recorded", "saved"], yue: ["記錄", "儲存"] },
} as const satisfies Record<
    keyof typeof HISTORY_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
