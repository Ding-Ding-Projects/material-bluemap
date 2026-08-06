/**
 * The in-app changelog viewer: every released version, the date filter and its calendar, the
 * search line, the export and copy actions, and the per-entry commit links.
 *
 * ## What a funny level is not allowed to touch here
 *
 * This surface is a record, and a record has one job. Version numbers, dates and commit SHAs
 * are values the app renders around, never words it rewrites, so they arrive as
 * `{placeholder}` and leave unchanged in both languages at all five levels. `changelogData.generated.ts`
 * is generated from the repository's own history, so an entry this catalogue invented would be
 * a claim about a commit that never happened.
 *
 * Three of the entries below carry that weight and are worth reading as a group:
 *
 *  - `changelog.noChanges` says a version recorded nothing, and every level keeps saying it.
 *    A release whose tag lands on a commit an earlier release already carried genuinely has no
 *    changes, and padding that out is the one lie a changelog cannot survive.
 *  - `changelog.exportRange` is the header of the exported file, so it states the scope the
 *    file covers and that every entry still carries its full commit SHA. A file that leaves
 *    the app without saying what is in it is a file nobody can check.
 *  - the three `changelog.date.*` errors report an unreadable entry without discarding it.
 *    `ChangelogDateFilter.vue` leaves the typed text and the previous range alone on a parse
 *    failure, so the higher levels are describing real behaviour rather than being reassuring.
 *
 * ## Tier notes
 *
 * `changelog.exportView` labels a button and sits in FIXED beside `changelog.copyView`,
 * despite reading like a sentence. The two are aria-labels on adjacent buttons in the same
 * toolbar, and a level that made one of them playful while the other stayed flat would read as
 * a bug to anybody listening to both.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CHANGELOG_VOICED = {
    /* ---------------------------------------------------------------- */
    /* The date filter's three parse errors                              */
    /* ---------------------------------------------------------------- */

    /*
     * Three errors, deliberately three and not one, because they mean different things to the
     * person typing. "Incomplete" is somebody four keystrokes into a date and has not made a
     * mistake yet; "impossible" is a date the calendar does not have; "unparsable" is a format
     * this field cannot read. All three keep `{hint}`, which is the locale's own example of a
     * whole date, and all three say the typed text was left alone, because it was.
     */
    "changelog.date.incomplete": {
        en: [
            "Keep going: a whole date looks like {hint}.",
            "Keep going: a whole date looks like {hint}.",
            "Keep going, a whole date looks like {hint}. What you typed is still here.",
            "Not a whole date yet. One looks like {hint}, and what you typed has been left exactly as it is.",
            "Halfway to a date. A whole one looks like {hint}, and not one character of what you typed has been thrown away while you finish it.",
        ],
        yue: [
            "繼續打落去：完整嘅日期係咁樣 {hint}。",
            "繼續打落去：完整嘅日期係咁樣 {hint}。",
            "繼續打落去，完整嘅日期係咁樣 {hint}。你打咗嘅嘢仲喺度。",
            "而家仲未係完整日期。完整嘅係 {hint} 咁樣，你打咗嘅嘢一個字都冇郁過。",
            "打到一半啫。完整日期係 {hint} 咁樣，你打咗嘅嘢一個字都冇掉，慢慢打完佢。",
        ],
    },
    "changelog.date.impossible": {
        en: [
            "That date does not exist on the calendar.",
            "That date does not exist on the calendar.",
            "That date does not exist on the calendar, so the filter has not moved.",
            "That date does not exist on the calendar. The filter has not moved, and what you typed is still in the field.",
            "The calendar has no such date, and this app is not going to invent one. Nothing has moved, and what you typed is still sitting in the field.",
        ],
        yue: [
            "呢個日期喺日曆上面唔存在。",
            "呢個日期喺日曆上面唔存在。",
            "呢個日期喺日曆上面唔存在，所以個篩選冇郁過。",
            "呢個日期喺日曆上面唔存在。個篩選冇郁過，你打咗嘅嘢仲喺格仔入面。",
            "日曆入面根本冇呢個日期，呢個程式亦都唔會變一個出嚟。乜都冇郁過，你打嗰個日期仲好地地喺格仔度。",
        ],
    },
    "changelog.date.unparsable": {
        en: [
            "This field reads dates like {hint}.",
            "This field reads dates like {hint}.",
            "This field reads dates like {hint}. What you typed is still here.",
            "This field reads dates written like {hint}, and could not read that one. What you typed has been left alone.",
            "This field reads dates written like {hint}, and made nothing at all of that one. What you typed has been left exactly where it is, unread but unharmed.",
        ],
        yue: [
            "呢格睇得明嘅日期格式係 {hint} 咁樣。",
            "呢格睇得明嘅日期格式係 {hint} 咁樣。",
            "呢格睇得明嘅日期格式係 {hint} 咁樣。你打咗嘅嘢仲喺度。",
            "呢格淨係睇得明 {hint} 咁樣嘅日期，你嗰個佢睇唔明。你打咗嘅嘢冇郁過。",
            "呢格淨係識睇 {hint} 咁樣嘅日期，你嗰個佢望完一頭霧水。你打咗嘅嘢原封不動擺喺度，冇人郁過。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What is on screen, and why the rest is not                        */
    /* ---------------------------------------------------------------- */

    "changelog.showing": {
        en: [
            "Showing {shown} of {total} entries.",
            "Showing {shown} of {total} entries.",
            "Showing {shown} of the {total} entries recorded.",
            "{shown} of {total} entries on screen.",
            "{shown} of {total} entries on screen. The other ones are filtered out, not missing.",
        ],
        yue: [
            "顯示緊 {total} 條記錄入面嘅 {shown} 條。",
            "顯示緊 {total} 條記錄入面嘅 {shown} 條。",
            "喺記錄低嘅 {total} 條入面，顯示緊 {shown} 條。",
            "畫面上有 {total} 條入面嘅 {shown} 條。",
            "畫面上有 {total} 條入面嘅 {shown} 條。其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    /*
     * `{filters}` arrives already built out of `changelog.filterRegex`, `.filterText` and
     * `.filterDates`, so this entry supplies only the frame around them. The frame is where
     * the honest half lives: filtered out is not the same as gone, and every level says so
     * from level 3 up.
     */
    "changelog.filteredBy": {
        en: [
            "Filtered by {filters}.",
            "Filtered by {filters}.",
            "Filtered by {filters}, so the rest is hidden rather than gone.",
            "Filtered by {filters}. Everything else is hidden, not gone.",
            "Filtered by {filters}. Everything else is still in the changelog, it just did not get invited on screen.",
        ],
        yue: [
            "已按 {filters} 篩選。",
            "已按 {filters} 篩選。",
            "已按 {filters} 篩選，其餘嘅係收埋咗，唔係冇咗。",
            "已按 {filters} 篩選。其餘嘅只係收埋咗，唔係冇咗。",
            "已按 {filters} 篩選。其餘嘅仲喺changelog入面，只係今次冇請佢哋出嚟。",
        ],
    },
    /*
     * The label on a summary entry that stands for several commits. "Listed here as well" is
     * the load-bearing clause and is pinned: a summary that read as a replacement would make a
     * reader think the individual commits had been folded away, when they are all right below.
     */
    "changelog.summaryOf": {
        en: [
            "Summary of {count} commits, which are listed here as well",
            "Summary of {count} commits, which are listed here as well",
            "A summary of {count} commits, each of which is listed here as well",
            "A summary of {count} commits. Not one of them is hidden: every one is listed here as well",
            "A summary of {count} commits, and not a replacement for them. All {count} are listed here as well, individually, right below",
        ],
        yue: [
            "{count} 個 commit 嘅摘要，呢啲 commit 喺下面都列咗出嚟",
            "{count} 個 commit 嘅摘要，呢啲 commit 喺下面都列咗出嚟",
            "呢個係 {count} 個 commit 嘅摘要，每一個 commit 喺下面都列咗出嚟",
            "呢個係 {count} 個 commit 嘅摘要。一個都冇收埋，每一個 commit 喺下面都列咗出嚟",
            "呢個係 {count} 個 commit 嘅摘要，唔係攞嚟代替佢哋。{count} 個 commit 逐個喺下面都列咗出嚟",
        ],
    },
    /*
     * A version that recorded nothing. The reason is the whole message: the tag points at a
     * commit an earlier release already carried, which is a real and unremarkable thing for a
     * release to do. Every level keeps "No changes were recorded" verbatim, because the one
     * failure this surface cannot recover from is a level that fills an empty version with
     * something plausible.
     */
    "changelog.noChanges": {
        en: [
            "No changes were recorded for this version: its tag points at a commit an earlier release already carried.",
            "No changes were recorded for this version: its tag points at a commit an earlier release already carried.",
            "No changes were recorded for this version. Its tag points at a commit an earlier release already carried.",
            "No changes were recorded for this version, and nothing has been invented to fill the gap. Its tag points at a commit an earlier release already carried.",
            "No changes were recorded for this version, and the gap is staying empty rather than being padded out. Its tag points at a commit an earlier release already carried, so there was genuinely nothing new to list.",
        ],
        yue: [
            "呢個版本冇記錄到任何改動：佢個 tag 指住嘅 commit，之前個 release 已經載過。",
            "呢個版本冇記錄到任何改動：佢個 tag 指住嘅 commit，之前個 release 已經載過。",
            "呢個版本冇記錄到任何改動。佢個 tag 指住嘅 commit，之前個 release 已經載過。",
            "呢個版本冇記錄到任何改動，亦都冇作啲嘢出嚟填個位。佢個 tag 指住嘅 commit，之前個 release 已經載過。",
            "呢個版本冇記錄到任何改動，個位就咁空住，唔會屈啲嘢入去。佢個 tag 指住嘅 commit，之前個 release 已經載過，即係真係冇新嘢可以列。",
        ],
    },
    "changelog.unreleasedMeta": {
        en: [
            "Committed to the repository, not yet carried by a published release.",
            "Committed to the repository, not yet carried by a published release.",
            "Committed to the repository, but not yet carried by a published release.",
            "Committed to the repository. No published release carries these yet.",
            "Committed to the repository and nowhere else so far. No published release carries these yet, so nobody has installed them.",
        ],
        yue: [
            "已經 commit 入倉庫，但係未有已發佈嘅 release 載住。",
            "已經 commit 入倉庫，但係未有已發佈嘅 release 載住。",
            "已經 commit 入倉庫，不過未有已發佈嘅 release 載住。",
            "已經 commit 入倉庫。而家仲未有任何已發佈嘅 release 載住呢啲嘢。",
            "已經 commit 入倉庫，暫時淨係喺嗰度。冇任何已發佈嘅 release 載住呢啲嘢，即係仲未有人裝到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Empty states                                                      */
    /* ---------------------------------------------------------------- */

    /*
     * Two empties that must never be confused: `noEntries` is a build that carries no
     * changelog at all, `noMatches` is a changelog the current filters excluded. The first is
     * about the build, the second is about the filters, and telling somebody the wrong one
     * sends them to fix the wrong thing.
     */
    "changelog.noEntries": {
        en: [
            "This build carries no changelog entries at all.",
            "This build carries no changelog entries at all.",
            "This build carries no changelog entries at all, and none have been invented to fill the page.",
            "This build carries no changelog entries at all. The page stays empty rather than being padded with something plausible.",
            "This build carries no changelog entries at all, so the page is staying empty. A changelog that makes entries up is worse than one with none.",
        ],
        yue: [
            "呢個build完全冇changelog記錄。",
            "呢個build完全冇changelog記錄。",
            "呢個build完全冇changelog記錄，亦都冇作啲嘢出嚟填個版。",
            "呢個build完全冇changelog記錄。個版就咁空住，唔會屈啲似層層嘅嘢入去。",
            "呢個build完全冇changelog記錄，所以個版就咁空住。一份識自己作嘢嘅changelog，仲衰過一份乜都冇嘅。",
        ],
    },
    "changelog.noMatches": {
        en: [
            "Nothing in the changelog matches. {filters} Widen the dates or clear the search to see the rest.",
            "Nothing in the changelog matches. {filters} Widen the dates or clear the search to see the rest.",
            "Nothing in the changelog matches these. {filters} Widen the dates or clear the search to see the rest.",
            "Nothing in the changelog matches. {filters} The rest is hidden rather than gone. Widen the dates or clear the search to see it.",
            "Nothing in the changelog matches, which is a statement about the filters and not about the changelog. {filters} The rest is hidden rather than gone. Widen the dates or clear the search to get it back.",
        ],
        yue: [
            "changelog入面冇嘢符合。{filters} 放寬啲日期，或者清走搜尋條件，就見返其餘嘅。",
            "changelog入面冇嘢符合。{filters} 放寬啲日期，或者清走搜尋條件，就見返其餘嘅。",
            "changelog入面冇嘢符合呢啲條件。{filters} 放寬啲日期，或者清走搜尋條件，就見返其餘嘅。",
            "changelog入面冇嘢符合。{filters} 其餘嗰啲係收埋咗，唔係冇咗：放寬啲日期或者清走搜尋條件就見返。",
            "changelog入面冇嘢符合，呢句講嘅係啲篩選條件，唔係講changelog本身。{filters} 其餘嗰啲係收埋咗，唔係冇咗：放寬啲日期或者清走搜尋條件就攞得返。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Copy, and export to a file                                        */
    /* ---------------------------------------------------------------- */

    "changelog.copied": {
        en: [
            "The changelog on screen is on the clipboard.",
            "The changelog on screen is on the clipboard.",
            "The changelog on screen is on the clipboard, filters and all.",
            "What is on screen is on the clipboard, filters and all, rather than the whole changelog.",
            "Whatever is on screen is now sitting on the clipboard, filters and all. The rest of the changelog was not invited.",
        ],
        yue: [
            "畫面上嘅changelog已經喺剪貼簿。",
            "畫面上嘅changelog已經喺剪貼簿。",
            "畫面上嘅changelog已經喺剪貼簿，連篩選一齊。",
            "畫面上見到嘅嘢已經喺剪貼簿，連篩選一齊，唔係成份changelog。",
            "畫面上見到嘅嘢而家坐咗喺剪貼簿度，連篩選一齊。changelog其餘嗰啲今次冇份。",
        ],
    },
    "changelog.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "Could not reach the clipboard, so nothing was copied. The changelog itself is untouched.",
            "The clipboard would not answer, so nothing was copied. The changelog itself is untouched, so try again, or export to a file instead.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "去唔到剪貼簿，所以乜都冇複製到。",
            "去唔到剪貼簿，所以乜都冇複製到。份changelog本身冇任何改動。",
            "剪貼簿唔應機，所以乜都冇複製到。份changelog本身冇任何改動，可以再試多次，或者改為匯出做檔案。",
        ],
    },
    "changelog.exported": {
        en: [
            "Exported {name}.",
            "Exported {name}.",
            "Exported {name}, holding what is on screen.",
            "Exported {name}. It holds what is on screen, filters and all.",
            "Exported {name}. It holds exactly what is on screen, filters and all, and its own opening lines say so.",
        ],
        yue: [
            "已匯出 {name}。",
            "已匯出 {name}。",
            "已匯出 {name}，入面裝住畫面上嘅嘢。",
            "已匯出 {name}。入面裝住畫面上嘅嘢，連篩選一齊。",
            "已匯出 {name}。入面裝住嘅正正係畫面上嗰啲，連篩選一齊，開頭幾行仲自己寫咗出嚟。",
        ],
    },
    /*
     * The exported file's own header. `{scope}` is what the file covers and `{filters}` is why
     * it covers that and not more, so between them they are the range statement an export owes
     * its reader. The commit SHA clause is pinned because it is what keeps the file traceable
     * once it is no longer in the app that wrote it.
     */
    "changelog.exportRange": {
        en: [
            "This file holds {scope}. {filters} Every entry carries the full commit SHA it came from.",
            "This file holds {scope}. {filters} Every entry carries the full commit SHA it came from.",
            "This file holds {scope}. {filters} Every entry in it carries the full commit SHA it came from.",
            "This file holds {scope}, and says so here so nobody has to guess. {filters} Every entry carries the full commit SHA it came from.",
            "This file holds {scope}, stated up front so nobody has to guess what is in it. {filters} Every entry still carries the full commit SHA it came from, so it stays traceable long after it leaves the app.",
        ],
        yue: [
            "呢個檔案載住 {scope}。{filters} 每一條記錄都帶住佢原本嘅完整 commit SHA。",
            "呢個檔案載住 {scope}。{filters} 每一條記錄都帶住佢原本嘅完整 commit SHA。",
            "呢個檔案載住 {scope}。{filters} 入面每一條記錄都帶住佢原本嘅完整 commit SHA。",
            "呢個檔案載住 {scope}，喺開頭寫明晒，唔使人估。{filters} 每一條記錄都帶住佢原本嘅完整 commit SHA。",
            "呢個檔案載住 {scope}，一開頭就寫明，唔使人自己估入面有咩。{filters} 每一條記錄照樣帶住佢原本嘅完整 commit SHA，離開咗個app之後都仲查得返。",
        ],
    },
    /* The `{filters}` half of the header above, when there was nothing to filter by. */
    "changelog.exportNoFilter": {
        en: [
            "No filter was applied.",
            "No filter was applied.",
            "No filter was applied, so this is everything.",
            "No filter was applied, so this is the whole changelog.",
            "No filter was applied anywhere, so this is the whole changelog with nothing held back.",
        ],
        yue: [
            "冇用過任何篩選。",
            "冇用過任何篩選。",
            "冇用過任何篩選，所以呢度係全部。",
            "冇用過任何篩選，所以呢度係成份changelog。",
            "由頭到尾冇用過任何篩選，所以呢度係成份changelog，一條都冇扣起。",
        ],
    },
    /* Written into the exported file itself, not shown on screen, when the filters matched nothing. */
    "changelog.exportEmpty": {
        en: [
            "Nothing matched these filters.",
            "Nothing matched these filters.",
            "Nothing matched these filters, so this export is empty.",
            "Nothing matched these filters, so this export is empty rather than short of something.",
            "Nothing matched these filters, so this export came out empty. That is the honest result, not a chunk that went missing on the way out.",
        ],
        yue: [
            "冇任何嘢符合呢啲篩選條件。",
            "冇任何嘢符合呢啲篩選條件。",
            "冇任何嘢符合呢啲篩選條件，所以呢個匯出係空嘅。",
            "冇任何嘢符合呢啲篩選條件，所以呢個匯出係空嘅，唔係漏咗嘢。",
            "冇任何嘢符合呢啲篩選條件，所以呢個匯出空空如也。呢個係老實嘅結果，唔係中途漏咗一橛。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The page's opening paragraph                                      */
    /* ---------------------------------------------------------------- */

    /*
     * The provenance claim, and the reason a reader should trust the rest of the page. It is
     * generated from the repository's history rather than written by hand, and every level
     * keeps both halves of that: the commit link on each entry, and where the list came from.
     */
    "changelog.lede": {
        en: [
            "Every release this project has published, and the commits that made it. Each entry links the commit it came from, and the list is generated from the repository's own history rather than written by hand.",
            "Every release this project has published, and the commits that made it. Each entry links the commit it came from, and the list is generated from the repository's own history rather than written by hand.",
            "Every release this project has published, and the commits behind each one. Each entry links the commit it came from, and the list is generated from the repository's own history rather than written by hand.",
            "Every release this project has published, and the commits behind each one. Each entry links the commit it came from. Nobody wrote this list by hand: it is generated from the repository's own history.",
            "Every release this project has published, and the commits behind each one. Each entry links the commit it came from. Nobody sat down and wrote this list by hand, so not one line of it is a fond memory of what probably happened: it is generated from the repository's own history.",
        ],
        yue: [
            "呢個專案發佈過嘅每一個 release，同埋做成佢哋嘅 commit。每一條記錄都連住佢嚟自嗰個 commit，而成張list係由倉庫自己嘅歷史生成，唔係人手寫出嚟。",
            "呢個專案發佈過嘅每一個 release，同埋做成佢哋嘅 commit。每一條記錄都連住佢嚟自嗰個 commit，而成張list係由倉庫自己嘅歷史生成，唔係人手寫出嚟。",
            "呢個專案發佈過嘅每一個 release，同埋每個背後嘅 commit。每一條記錄都連住佢嚟自嗰個 commit，而成張list係由倉庫自己嘅歷史生成，唔係人手寫出嚟。",
            "呢個專案發佈過嘅每一個 release，同埋每個背後嘅 commit。每一條記錄都連住佢嚟自嗰個 commit。呢張list冇人手寫過：全部由倉庫自己嘅歷史生成。",
            "呢個專案發佈過嘅每一個 release，同埋每個背後嘅 commit。每一條記錄都連住佢嚟自嗰個 commit。冇人坐低人手寫過呢張list，所以入面冇一條係「大概係咁」嘅回憶：全部由倉庫自己嘅歷史生成。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CHANGELOG_FIXED = {
    /* ---------------------------------------------------------------- */
    /* The date filter                                                   */
    /* ---------------------------------------------------------------- */

    /* The preset ranges, in the order `PRESET_IDS` lists them. */
    "changelog.date.presetToday": { en: "Today", yue: "今日" },
    "changelog.date.presetLast7": { en: "Last 7 days", yue: "過去 7 日" },
    "changelog.date.presetLast30": { en: "Last 30 days", yue: "過去 30 日" },
    "changelog.date.presetThisMonth": { en: "This month", yue: "今個月" },
    "changelog.date.presetThisYear": { en: "This year", yue: "今年" },
    "changelog.date.presetAll": { en: "All time", yue: "全部時間" },

    /*
     * The five shapes the current range can take, summarised on the filter chip. They are one
     * choice in the component, so they read as one sentence family in both languages: the day
     * or days are already formatted for the locale before they arrive.
     */
    "changelog.date.any": { en: "Any date", yue: "任何日期" },
    "changelog.date.on": { en: "On {day}", yue: "{day} 嗰日" },
    "changelog.date.between": { en: "{from} to {to}", yue: "{from} 至 {to}" },
    "changelog.date.after": { en: "From {from}", yue: "由 {from} 開始" },
    "changelog.date.before": { en: "Up to {to}", yue: "去到 {to} 為止" },

    /* The two typed fields, and the calendar the button beside them opens. */
    "changelog.date.from": { en: "From", yue: "由" },
    "changelog.date.to": { en: "To", yue: "去到" },
    "changelog.date.calendar": { en: "Choose dates on a calendar", yue: "喺日曆揀日期" },
    "changelog.date.previousMonth": { en: "Previous month", yue: "上個月" },
    "changelog.date.month": { en: "Month", yue: "月份" },
    "changelog.date.year": { en: "Year", yue: "年份" },
    "changelog.date.nextMonth": { en: "Next month", yue: "下個月" },
    "changelog.date.grid": { en: "Days", yue: "日子" },
    /*
     * The accessible name of a day the grid marks as carrying entries. The unmarked days use
     * the formatted date on its own, so this is the only place the mark is spoken at all.
     */
    "changelog.date.dayWithEntries": {
        en: "{day}, which has changelog entries",
        yue: "{day}，呢日有changelog記錄",
    },
    "changelog.date.clear": { en: "Clear the dates", yue: "清走啲日期" },
    "changelog.date.done": { en: "Done", yue: "搞掂" },

    /* ---------------------------------------------------------------- */
    /* One entry in the list                                             */
    /* ---------------------------------------------------------------- */

    "changelog.select": { en: "Select {subject}", yue: "揀 {subject}" },
    "changelog.openCommit": { en: "Open commit {sha}", yue: "開 commit {sha}" },
    "changelog.fullMessage": { en: "Full commit message", yue: "完整 commit 訊息" },
    "changelog.taggedAt": { en: "Tagged at", yue: "tag 喺" },

    /* ---------------------------------------------------------------- */
    /* The fragments the filter line is built from                       */
    /* ---------------------------------------------------------------- */

    /*
     * Three noun phrases joined into `changelog.filteredBy`, so they have to read as a list
     * item and not as a sentence. The regex and plain-text ones are separate keys rather than
     * one with a mode word because which of the two is running is the fact somebody debugging
     * an unexpected result needs first.
     */
    "changelog.filterRegex": { en: "the pattern {pattern}", yue: "pattern {pattern}" },
    "changelog.filterText": { en: "the text {text}", yue: "文字 {text}" },
    "changelog.filterDates": { en: "dates {range}", yue: "日期 {range}" },

    /* ---------------------------------------------------------------- */
    /* The category headings inside a version                            */
    /* ---------------------------------------------------------------- */

    "changelog.category.interface": { en: "Interface", yue: "介面" },
    "changelog.category.engine": { en: "Rendering and world data", yue: "算圖同世界資料" },
    "changelog.category.services": {
        en: "Server, CLI and configuration",
        yue: "伺服器、CLI 同設定",
    },
    "changelog.category.shell": { en: "Desktop shell", yue: "桌面外殼" },
    "changelog.category.site": {
        en: "Landing page and documentation site",
        yue: "首頁同說明文件網站",
    },
    "changelog.category.build": { en: "Build, release and tooling", yue: "建置、發佈同工具" },
    "changelog.category.docs": { en: "Documentation", yue: "說明文件" },
    "changelog.category.other": { en: "Elsewhere in the repository", yue: "倉庫其他地方" },

    /* ---------------------------------------------------------------- */
    /* The viewer's own chrome                                           */
    /* ---------------------------------------------------------------- */

    "changelog.title": { en: "Changelog", yue: "更新記錄" },
    "changelog.unreleased": { en: "Unreleased", yue: "未發佈" },
    "changelog.search": { en: "Search the changelog", yue: "搜尋更新記錄" },
    "changelog.searchHint": {
        en: "Subject, message text or a commit SHA",
        yue: "標題、訊息內容或者 commit SHA",
    },
    "changelog.dateFilter": { en: "Dates: {range}", yue: "日期：{range}" },
    "changelog.clearFilters": { en: "Clear the filters", yue: "清走篩選條件" },

    /* Copy and export, each a button with a menu of two formats under it. */
    "changelog.copyView": { en: "Copy what is on screen", yue: "複製畫面上嘅嘢" },
    "changelog.copy": { en: "Copy", yue: "複製" },
    "changelog.copyMarkdown": { en: "As Markdown", yue: "用 Markdown" },
    "changelog.copyText": { en: "As plain text", yue: "用純文字" },
    "changelog.exportView": {
        en: "Export what is on screen to a file",
        yue: "將畫面上嘅嘢匯出做檔案",
    },
    "changelog.export": { en: "Export", yue: "匯出" },
    "changelog.exportMarkdown": { en: "Markdown file", yue: "Markdown 檔" },
    "changelog.exportText": { en: "Plain text file", yue: "純文字檔" },

    /*
     * The two scope phrases that `changelog.exportRange` interpolates as `{scope}`. A
     * selection wins over the view when there is one, which is why the counts differ: the
     * first counts what was picked, the second what survived the filters.
     */
    "changelog.exportSelection": { en: "{count} selected entries", yue: "揀咗嘅 {count} 條記錄" },
    "changelog.exportShown": {
        en: "{shown} of {total} entries",
        yue: "{total} 條入面嘅 {shown} 條",
    },

    /* Bulk selection across the filtered list. */
    "changelog.selectShown": { en: "Select all shown", yue: "揀晒畫面上全部" },
    "changelog.selected": {
        en: "{count} selected, {shown} of them on screen",
        yue: "揀咗 {count} 條，其中 {shown} 條喺畫面上",
    },

    /*
     * The conjunction `ChangelogViewer.vue` joins the active filters with before handing the
     * result to `changelog.filteredBy` as one `{filters}` value. It is a word rather than a
     * message, so it is FIXED, and it is easy to miss: the call sits inside a template
     * literal, where a scanner that masks string literals wholesale never sees it.
     */
    "changelog.and": { en: "and", yue: "同" },
} as const satisfies Record<string, FixedString>;

export const CHANGELOG_FACTS = {
    // The locale's own example of a whole date, and that nothing typed was thrown away.
    "changelog.date.incomplete": { en: ["{hint}", "date"], yue: ["{hint}", "日期"] },
    "changelog.date.impossible": { en: ["calendar", "date"], yue: ["日曆", "日期"] },
    "changelog.date.unparsable": { en: ["{hint}", "field reads"], yue: ["{hint}", "日期"] },

    "changelog.showing": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "changelog.filteredBy": { en: ["{filters}", "Filtered by"], yue: ["{filters}", "篩選"] },
    // The clause that stops a summary reading as a replacement for the commits it summarises.
    "changelog.summaryOf": {
        en: ["{count}", "commits", "listed here as well"],
        yue: ["{count}", "commit", "都列咗出嚟"],
    },
    // An empty version stays empty, and says why.
    "changelog.noChanges": {
        en: ["No changes were recorded", "tag", "commit", "earlier release"],
        yue: ["冇記錄到", "tag", "commit", "release"],
    },
    "changelog.unreleasedMeta": {
        en: ["Committed to the repository", "published release"],
        yue: ["commit", "release"],
    },

    // Which empty it is: the build has none, or the filters excluded them.
    "changelog.noEntries": { en: ["no changelog entries"], yue: ["冇changelog記錄"] },
    "changelog.noMatches": {
        en: ["{filters}", "Widen the dates", "clear the search"],
        yue: ["{filters}", "日期", "搜尋"],
    },

    "changelog.copied": { en: ["on screen", "clipboard"], yue: ["畫面", "剪貼簿"] },
    "changelog.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },
    "changelog.exported": { en: ["{name}", "Exported"], yue: ["{name}", "匯出"] },
    // An export states its range and stays traceable after it leaves the app.
    "changelog.exportRange": {
        en: ["{scope}", "{filters}", "full commit SHA"],
        yue: ["{scope}", "{filters}", "commit SHA"],
    },
    "changelog.exportNoFilter": { en: ["No filter was applied"], yue: ["冇用過任何篩選"] },
    "changelog.exportEmpty": {
        en: ["Nothing matched these filters"],
        yue: ["冇任何嘢符合呢啲篩選條件"],
    },

    // Where the list came from, which is the reason to believe the rest of the page.
    "changelog.lede": {
        en: ["links the commit", "repository's own history", "by hand"],
        yue: ["commit", "歷史", "手寫"],
    },
} as const satisfies Record<
    keyof typeof CHANGELOG_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
