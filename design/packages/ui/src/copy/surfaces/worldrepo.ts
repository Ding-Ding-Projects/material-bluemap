/**
 * Keeping a Minecraft world in a git repository, and recognising a repository this
 * application already prepared on a computer that has never touched it before.
 *
 * Two features, one surface, one catalogue module - see `components/worldrepo/worldRepo.ts`'s
 * own doc comment for why the sync half and the adoption half stay structurally separate even
 * though they share a screen. `WORLDREPO_VOICED` carries the real prose: the pitch, the
 * blockers, the notices a sync or an adoption raises, and the empty states. Everything else -
 * field labels, section titles, phase names, button captions, aria-only labels - is a single
 * string per language in `WORLDREPO_FIXED`, because a funny level cannot usefully restyle
 * "Repository name" and a label that moved under somebody is a label they re-read every time.
 *
 * ## What is deliberately NOT here
 *
 * `WorldRepoPreflight.blockers`/`.warnings`, an `AdoptionSignal.message`, an `AdoptionPlan`'s
 * `message`/`restoring`/`needsAttention[].message` - every one of those is a sentence
 * `main/worldrepo/repo.ts` or `main/worldrepo/adopt.ts` already composed in the main process,
 * rendered verbatim in `WorldRepoScreen.vue` rather than passed through `t()`. Voicing them
 * here would mean either overriding what the main process actually decided (the exact
 * mistake `catalogueCoverage.test.ts`'s own doc comment warns against for upstream's viewer
 * keys) or duplicating logic that already lives in one place. Only copy this screen itself
 * authors is catalogued.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const WORLDREPO_VOICED = {
    "worldrepo.pitch": {
        en: [
            "A world does not have to be re-uploaded whole every time it changes. Kept in a git repository, it updates incrementally.",
            "A world does not have to be re-uploaded whole every time it changes. Kept in a git repository, it updates incrementally: only the region files that actually changed are pushed.",
            "A world does not have to be zipped and re-uploaded whole every time it changes. Kept in a git repository, it updates incrementally: only the region files that actually changed are ever pushed, the same way this application already keeps its own releases up to date.",
            "A world does not have to be zipped up and thrown at GitHub whole, every single time. Kept in a git repository, it updates incrementally: only the region files that actually changed get pushed, exactly the trick this application already uses for its own releases.",
            "A world does not have to be zipped up and lobbed at GitHub whole, every single time, like some kind of digital hay bale. Kept in a git repository, it updates incrementally: only the region files that actually changed get pushed, the same trick this application already pulls for its own releases.",
        ],
        yue: [
            "個世界唔使每次改咗就成個重新上傳。擺喺 git repository 度，佢會逐步更新。",
            "個世界唔使每次改咗就成個重新上傳。擺喺 git repository 度，佢會逐步更新：淨係真正變過嘅 region 檔案先會上傳。",
            "個世界唔使每次改咗就打包成個重新上傳。擺喺 git repository 度，佢會逐步更新：淨係真正變過嘅 region 檔案先會上傳，同呢個 app 更新自己個 release 用嘅方法一樣。",
            "個世界唔使成日執袋咁樣，塞晒俾 GitHub。擺喺 git repository 度，佢逐步更新：淨係真正變過嘅 region 檔案先會傳，跟呢個 app 自己出 release 一樣嘅招數。",
            "個世界唔使成日打包成粒糉咁樣掟俾 GitHub。擺喺 git repository 度，佢逐步更新：淨係真正變過嘅 region 檔案先會傳，同呢個 app 出自己個 release 用嘅同一招。",
        ],
    },
    "worldrepo.caveats": {
        en: [
            "GitHub refuses any single file over 100 MB. A live server's world folder is being written to while a sync reads it, so a region file mid-save can be caught torn.",
            "GitHub refuses any single file over 100 MB outright. A live server's world folder is being written to while a sync reads it, so a region file mid-save can be caught torn; turning auto-save off first avoids that.",
            "GitHub refuses any single file over 100 MB outright, and gets noticeably slower well past 1 GB. A live server's world folder is being written to while a sync reads it, so a region file mid-save can be caught torn; turning auto-save off first avoids that.",
            "GitHub flatly refuses any single file over 100 MB, and starts dragging its feet well past 1 GB. A live server's world folder is being written to while a sync reads it, so a region file mid-save can get caught half-written; turning auto-save off first sidesteps that.",
            "GitHub flatly refuses any single file over 100 MB - no exceptions, no pleading - and starts dragging its feet well past 1 GB. A live server's world folder is being written to while a sync reads it, so a region file mid-save can get caught half-written like a photo taken mid-blink; turning auto-save off first sidesteps that.",
        ],
        yue: [
            "GitHub 唔收超過 100 MB 嘅單一檔案。如果伺服器仲喺度寫緊個世界資料夾，同步嗰陣可能撞到寫緊一半嘅 region 檔案。",
            "GitHub 一律唔收超過 100 MB 嘅單一檔案。如果伺服器仲喺度寫緊個世界資料夾，同步嗰陣可能撞到寫緊一半嘅 region 檔案；先閂咗 auto-save 就冇呢個問題。",
            "GitHub 一律唔收超過 100 MB 嘅單一檔案，過咗 1 GB 仲會愈嚟愈慢。如果伺服器仲喺度寫緊個世界資料夾，同步嗰陣可能撞到寫緊一半嘅 region 檔案；先閂咗 auto-save 就冇呢個問題。",
            "GitHub 硬係唔收超過 100 MB 嘅檔案，過咗 1 GB 仲會愈拖愈慢。如果伺服器仲寫緊個世界資料夾，同步嗰陣隨時撞正寫緊一半嘅 region 檔案；先閂咗 auto-save 就冇事。",
            "GitHub 死都唔收超過 100 MB 嘅檔案，過咗 1 GB 重會慢到拖拖拉拉。如果伺服器仲寫緊個世界資料夾，同步嗰陣隨時撞正影相影到一半咁嘅 region 檔案；先閂咗 auto-save 就穩陣晒。",
        ],
    },
    "worldrepo.unsupported": {
        en: [
            "The desktop application is what keeps a world in a repository.",
            "The desktop application is what keeps a world in a repository.",
            "Keeping a world in a repository is something the desktop application does.",
            "Keeping a world in a repository is something only the desktop application can do.",
            "Keeping a world in a repository is something only the desktop application can do, because it is the one holding the files.",
        ],
        yue: [
            "將世界擺入 repository 呢件事係桌面程式做嘅。",
            "將世界擺入 repository 呢件事係桌面程式做嘅。",
            "將世界擺入 repository 呢件事，係桌面程式先做到。",
            "將世界擺入 repository 呢件事，淨係桌面程式先做得到。",
            "將世界擺入 repository 呢件事，淨係桌面程式先做得到，因為啲檔案喺佢手上。",
        ],
    },
    "worldrepo.blocked.check": {
        en: [
            "Check the repository first.",
            "Check the repository first.",
            "Check the repository before syncing.",
            "Run the check on the repository before anything is pushed.",
            "Run the check on the repository first. Nothing is pushed until it has been.",
        ],
        yue: [
            "請先檢查個 repository。",
            "請先檢查個 repository。",
            "同步之前，請先檢查個 repository。",
            "上傳任何嘢之前，先檢查一次個 repository。",
            "先檢查個 repository。未檢查過，一個字節都唔會上傳。",
        ],
    },
    "worldrepo.blocked.acknowledge": {
        en: [
            "Confirm that you mean to sync this world, replacing whatever is on that branch.",
            "Confirm that you mean to sync this world, replacing whatever is on that branch.",
            "Tick the box confirming you mean to sync this world, replacing whatever that branch currently holds.",
            "Tick the box confirming you really mean to sync this world - it replaces whatever that branch currently holds, no undo from here.",
            "Tick the box confirming you really, truly mean to sync this world - it replaces whatever that branch currently holds, and there is no undo button waiting behind it.",
        ],
        yue: [
            "請確認你真係想同步呢個世界，會取代個分支上面而家有嘅嘢。",
            "請確認你真係想同步呢個世界，會取代個分支上面而家有嘅嘢。",
            "剔咗個確認格，話你真係想同步呢個世界，佢會取代個分支現有嘅嘢。",
            "剔咗個確認格，話你真係、真係想同步呢個世界——佢會取代個分支現有嘅嘢，冇得反悔。",
            "剔咗個確認格，話你千真萬確想同步呢個世界——佢會取代個分支現有嘅嘢，之後冇返轉頭掣可以撳。",
        ],
    },
    "worldrepo.ack": {
        en: [
            "I understand this pushes the whole world and replaces whatever is on that branch.",
            "I understand this pushes the whole world and replaces whatever is on that branch.",
            "I understand this pushes the whole world and replaces whatever that branch currently holds.",
            "I understand this pushes the whole world, replacing whatever that branch currently holds - completely, not merged in.",
            "I understand this pushes the whole world and replaces whatever that branch currently holds, completely and without asking twice.",
        ],
        yue: [
            "我明白呢個動作會上傳成個世界，取代個分支上面而家有嘅嘢。",
            "我明白呢個動作會上傳成個世界，取代個分支上面而家有嘅嘢。",
            "我明白呢個動作會上傳成個世界，完全取代個分支現有嘅嘢。",
            "我明白呢個動作會上傳成個世界，完全取代個分支現有嘅嘢——係取代，唔係夾埋。",
            "我明白呢個動作會上傳成個世界，完完全全取代個分支現有嘅嘢，一次過，冇得再問多次。",
        ],
    },
    "worldrepo.notice.synced": {
        en: [
            "This world was synced and the push was verified.",
            "This world was synced and the push was verified.",
            "This world was synced, and the push was verified against GitHub.",
            "This world is synced - GitHub confirmed the branch now shows this exact commit.",
            "This world is synced, and GitHub itself confirmed the branch now shows this exact commit - no guessing involved.",
        ],
        yue: [
            "呢個世界已經同步咗，個推送已經核實。",
            "呢個世界已經同步咗，個推送已經核實。",
            "呢個世界已經同步咗，個推送已經同 GitHub 核實過。",
            "呢個世界同步好晒——GitHub 已經確認個分支而家係呢個 commit。",
            "呢個世界同步好晒，GitHub 親口確認個分支而家正正係呢個 commit——冇亂估。",
        ],
    },
    "worldrepo.notice.syncedUnverified": {
        en: [
            "The push reported success, but GitHub does not yet show that commit on the branch.",
            "The push reported success, but GitHub does not yet show that commit on the branch.",
            "The push reported success, but GitHub does not yet show that commit on the branch - reported as unverified rather than as landed.",
            "The push said it succeeded, but GitHub is not yet showing that commit on the branch - call it unverified for now, not landed.",
            "The push claims it succeeded, but GitHub still is not showing that commit on the branch - it is filed as unverified rather than taken on its word.",
        ],
        yue: [
            "個推送話成功，但係 GitHub 仲未喺個分支度見到嗰個 commit。",
            "個推送話成功，但係 GitHub 仲未喺個分支度見到嗰個 commit。",
            "個推送話成功，但係 GitHub 仲未喺個分支度顯示嗰個 commit——所以話係未核實，唔係話真係做完。",
            "個推送話自己成功，但係 GitHub 仲未喺個分支度顯示嗰個 commit——而家先當佢未核實，唔當佢完成。",
            "個推送口口聲聲話成功，但 GitHub 仲未喺個分支度顯示嗰個 commit——所以呢一步暫時當未核實，唔係聽佢一面之詞。",
        ],
    },
    "worldrepo.notice.removed": {
        en: [
            "Stopped tracking this world. Its branch was deleted; the world folder on this computer was not touched.",
            "Stopped tracking this world. Its branch was deleted; the world folder on this computer was not touched.",
            "Stopped tracking this world - its branch was deleted, and the world folder on this computer was left exactly as it was.",
            "Stopped tracking this world: the branch is gone, but the world folder on this computer was not touched at all.",
            "Stopped tracking this world: the branch is gone from GitHub, and the world folder on this computer did not so much as flinch.",
        ],
        yue: [
            "已經停止追蹤呢個世界。佢個分支已經刪除；呢部電腦上面嘅世界資料夾冇郁過。",
            "已經停止追蹤呢個世界。佢個分支已經刪除；呢部電腦上面嘅世界資料夾冇郁過。",
            "已經停止追蹤呢個世界——個分支刪除咗，呢部電腦嘅世界資料夾原封不動。",
            "已經停止追蹤呢個世界：個分支冇咗，但呢部電腦上面嘅世界資料夾完全冇被郁過。",
            "已經停止追蹤呢個世界：個分支喺 GitHub 度消失咗，但呢部電腦上面嘅世界資料夾，一根汗毛都冇被郁過。",
        ],
    },
    "worldrepo.notice.removeFailed": {
        en: [
            "This world could not be stopped from being tracked.",
            "This world could not be stopped from being tracked.",
            "This world could not be stopped from being tracked, so it is still recorded here.",
            "This world could not be stopped from being tracked - it is still recorded here, so try again in a moment.",
            "This world flatly refused to stop being tracked - it is still recorded here, so try again in a moment.",
        ],
        yue: [
            "停唔到追蹤呢個世界。",
            "停唔到追蹤呢個世界。",
            "停唔到追蹤呢個世界，所以佢仲記錄緊喺度。",
            "停唔到追蹤呢個世界——佢仲記錄緊喺度，遲啲再試多次。",
            "呢個世界死都唔肯俾人停止追蹤——佢仲記錄緊喺度，遲啲再試多次。",
        ],
    },
    "worldrepo.notice.resumed": {
        en: [
            "The interrupted sync is continuing.",
            "The interrupted sync is continuing.",
            "The interrupted sync is continuing from where it stopped.",
            "The interrupted sync is continuing from exactly where it stopped.",
            "The interrupted sync is continuing from exactly where it stopped, rather than starting the whole thing over.",
        ],
        yue: [
            "之前中斷咗嘅同步而家繼續緊。",
            "之前中斷咗嘅同步而家繼續緊。",
            "之前中斷咗嘅同步，而家由停低嗰度繼續。",
            "之前中斷咗嘅同步，而家由停低嗰個位原地繼續。",
            "之前中斷咗嘅同步，而家由停低嗰個位原地繼續，唔使成件事由頭再嚟。",
        ],
    },
    "worldrepo.notice.bulkRemoved": {
        en: [
            "Stopped tracking {done} of {total} worlds.",
            "Stopped tracking {done} of {total} worlds.",
            "Stopped tracking {done} of {total} chosen worlds.",
            "Stopped tracking {done} of {total} chosen worlds - their branches are gone, and every world folder was left alone.",
            "Stopped tracking {done} of {total} chosen worlds - their branches are gone, and every world folder on this computer walked away unscathed.",
        ],
        yue: [
            "已經停止追蹤 {total} 個世界入面嘅 {done} 個。",
            "已經停止追蹤 {total} 個世界入面嘅 {done} 個。",
            "已經停止追蹤揀咗嘅 {total} 個世界入面嘅 {done} 個。",
            "已經停止追蹤揀咗嘅 {total} 個世界入面嘅 {done} 個——分支冇咗，但每個世界資料夾都冇被郁過。",
            "已經停止追蹤揀咗嘅 {total} 個世界入面嘅 {done} 個——分支喺 GitHub 度消失晒，但每個世界資料夾都毫髮無損咁企喺度。",
        ],
    },
    "worldrepo.notice.copied": {
        en: [
            "The repository address was copied.",
            "The repository address was copied.",
            "The repository address was copied to the clipboard.",
            "The repository address is on the clipboard.",
            "The repository address is on the clipboard, ready to send to somebody.",
        ],
        yue: [
            "個 repository 網址已經複製咗。",
            "個 repository 網址已經複製咗。",
            "個 repository 網址已經複製到剪貼簿。",
            "個 repository 網址而家喺剪貼簿度。",
            "個 repository 網址而家喺剪貼簿度，隨時 send 得俾人。",
        ],
    },
    "worldrepo.records.empty": {
        en: [
            "Nothing has been synced from this computer yet. Once a world is pushed, it appears here.",
            "Nothing has been synced from this computer yet. Once a world above is pushed, it appears here so it can be found again, resumed if interrupted, or stopped.",
            "Nothing has been synced from this computer yet. Once a world above is pushed, it appears here so it can be found again, resumed if it was interrupted, or stopped tracking.",
            "Nothing has been synced from this computer yet. The moment a world above is pushed, it shows up here - findable again, resumable if it was interrupted, stoppable when it is not wanted any more.",
            "Nothing has been synced from this computer yet, so this list is as empty as a freshly-generated world. The moment a world above is pushed, it shows up here - findable, resumable if interrupted, stoppable whenever.",
        ],
        yue: [
            "呢部電腦重未同步過任何嘢。一有世界上傳咗，就會喺呢度見到。",
            "呢部電腦重未同步過任何嘢。上面一有世界推送咗，就會喺呢度出現，方便搵返、中斷咗可以繼續，或者停止追蹤。",
            "呢部電腦重未同步過任何嘢。上面一有世界推送咗，就會喺呢度出現，方便搵返、中斷咗可以繼續，或者停止追蹤佢。",
            "呢部電腦重未同步過任何嘢。上面一有世界推送咗，即刻喺呢度出現——搵得返、中斷咗可以繼續、唔想要就停止追蹤。",
            "呢部電腦重未同步過任何嘢，所以呢張清單空到好似新開世界咁。上面一有世界推送咗，即刻喺呢度出現——搵得返、中斷咗可以繼續、幾時唔想要都可以停止追蹤。",
        ],
    },
    "worldrepo.records.noMatch": {
        en: [
            "Nothing here matches that search.",
            "Nothing here matches that search. Clearing it brings the whole list back.",
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
            "Nothing here matches that search - clear it and the whole list comes straight back, nothing was actually removed.",
            "Nothing here matches that search - not one. Clear it and the whole list comes straight back, because nothing was ever removed.",
        ],
        yue: [
            "冇嘢符合呢個搜尋。",
            "冇嘢符合呢個搜尋。清空就會見返成個清單。",
            "冇嘢符合呢個搜尋。清空就會見返成個清單；乜都冇刪除過。",
            "冇嘢符合呢個搜尋——一個都冇。清空即刻見返成個清單，乜都冇真係刪除過。",
            "冇嘢符合呢個搜尋——一個都撞唔到。清空即刻見返成個清單，因為根本乜都未刪除過。",
        ],
    },
    "worldrepo.createRepo.lead": {
        en: [
            "Nothing there yet? Create a brand-new repository with the owner and name above.",
            "Nothing there yet? Create a brand-new repository with the owner and name above.",
            "Nothing suitable to check above? Create a brand-new repository with the owner and name typed in.",
            "Nothing suitable up there? Create a brand-new repository with the owner and name already typed in above.",
            "Nothing suitable up there yet, and that is fine - create a brand-new repository with the owner and name already typed in above.",
        ],
        yue: [
            "上面重未有嘢？用上面個擁有者同名，開個全新 repository。",
            "上面重未有嘢？用上面個擁有者同名，開個全新 repository。",
            "上面冇合適嘅嘢可以檢查？用已經打好嘅擁有者同名，開個全新 repository。",
            "上面冇合適嘅嘢？用已經打咗嘅擁有者同名，即刻開個全新 repository。",
            "上面重未有合適嘅嘢，冇所謂——用已經打咗嘅擁有者同名，即刻開個全新 repository 就得。",
        ],
    },
    "worldrepo.stop.action": {
        en: [
            "The {branch} branch of {owner}/{repo} that this application made is deleted. The world folder on this computer is never touched, and neither is anything else in that repository.",
            "The {branch} branch of {owner}/{repo} that this application made is deleted. The world folder on this computer is never touched, and neither is anything else in that repository.",
            "The {branch} branch of {owner}/{repo} that this application made is deleted outright. The world folder on this computer stays untouched, and so does everything else in that repository.",
            "The {branch} branch of {owner}/{repo} that this application made is deleted outright - gone. The world folder on this computer stays completely untouched, and so does everything else in that repository.",
            "The {branch} branch of {owner}/{repo} that this application made is deleted outright - poof, gone. The world folder on this computer stays completely untouched, and so does every other corner of that repository.",
        ],
        yue: [
            "{owner}/{repo} 度由呢個 app 整嘅 {branch} 分支會被刪除。呢部電腦嘅世界資料夾永遠唔會郁，個 repository 入面其他嘢都唔會郁。",
            "{owner}/{repo} 度由呢個 app 整嘅 {branch} 分支會被刪除。呢部電腦嘅世界資料夾永遠唔會郁，個 repository 入面其他嘢都唔會郁。",
            "{owner}/{repo} 度由呢個 app 整嘅 {branch} 分支會徹底刪除。呢部電腦嘅世界資料夾完全唔會郁，個 repository 入面其他嘢一樣唔會郁。",
            "{owner}/{repo} 度由呢個 app 整嘅 {branch} 分支會徹底刪除——冇咗。呢部電腦嘅世界資料夾完全唔會被郁，個 repository 入面其他每一樣嘢都一樣。",
            "{owner}/{repo} 度由呢個 app 整嘅 {branch} 分支會徹底刪除——嘭一聲，冇咗。呢部電腦嘅世界資料夾一根汗毛都唔會被郁，個 repository 入面其他每個角落都一樣安然無恙。",
        ],
    },
    "worldrepo.bulkStop.action": {
        en: [
            "The branch this application made is deleted for {chosen} world(s). The world folder on this computer is never touched.",
            "The branch this application made is deleted for {chosen} world(s). The world folder on this computer is never touched.",
            "The branch this application made is deleted for {chosen} world(s), each one. No world folder on this computer is touched.",
            "The branch this application made is deleted for all {chosen} chosen world(s) - each one. Not one world folder on this computer is touched.",
            "The branch this application made is deleted for all {chosen} chosen world(s) - every single one. Not one world folder on this computer so much as trembles.",
        ],
        yue: [
            "呢個 app 幫呢 {chosen} 個世界整嘅分支會被刪除。呢部電腦嘅世界資料夾永遠唔會郁。",
            "呢個 app 幫呢 {chosen} 個世界整嘅分支會被刪除。呢部電腦嘅世界資料夾永遠唔會郁。",
            "呢個 app 幫呢 {chosen} 個世界整嘅分支，逐個都會被刪除。呢部電腦一個世界資料夾都唔會被郁。",
            "呢個 app 幫呢 {chosen} 個揀咗嘅世界整嘅分支，逐個都會被刪除。呢部電腦一個世界資料夾都唔會被郁。",
            "呢個 app 幫呢 {chosen} 個揀咗嘅世界整嘅分支，逐個都會被刪除——一個都走唔甩。呢部電腦嘅世界資料夾，一個都唔會被震到。",
        ],
    },
    "worldrepo.adopt.pitch": {
        en: [
            "Install this application on a second computer, and its sign-in still sees every repository it can write to - which is not the same as knowing which one it already prepared. Checking for this application's own marker answers that.",
            "Install this application on a second computer, and its sign-in still sees every repository it can write to - which is not the same as knowing which one it already prepared. Checking a repository for this application's own marker answers that, without asserting more than the marker actually proves.",
            "Set this up on one computer, then install the application on a second one: its sign-in still sees every repository it can write to, which is not the same as knowing which one it already prepared. Checking a repository for this application's own marker answers that, without claiming more than the marker actually proves.",
            "Set this up on one computer, then install the application on a second one, and its sign-in still sees every repository it can write to - which is nowhere near the same as knowing which one it already prepared. Checking for this application's own marker answers that honestly, without claiming more than a small file's bytes actually prove.",
            "Set this up on one computer, then install the application on a second one, and its sign-in still sees every single repository it can write to - which is nowhere near the same as knowing which one it already prepared. Checking for this application's own marker answers that honestly, without pretending a small file's bytes prove more than they do.",
        ],
        yue: [
            "喺第二部電腦裝呢個 app，佢個登入戶口仲係見到全部有寫入權嘅 repository——但呢個唔等於知道邊個係佢自己準備過嘅。查下有冇呢個 app 自己嘅標記，就有答案。",
            "喺第二部電腦裝呢個 app，佢個登入戶口仲係見到全部有寫入權嘅 repository——但呢個唔等於知道邊個係佢自己準備過嘅。檢查個 repository 有冇呢個 app 自己嘅標記，就有答案，但唔會講到比標記本身更肯定。",
            "喺一部電腦度設定好呢個功能，跟住喺第二部電腦裝呢個 app：佢個登入戶口仲係見到全部有寫入權嘅 repository，但呢個唔等於知道邊個係已經準備過嘅。檢查有冇呢個 app 自己嘅標記，就有答案，唔會講到比標記本身更肯定。",
            "喺一部電腦設定好，跟住喺第二部電腦裝呢個 app，佢個登入戶口仲係見到全部有寫入權嘅 repository——但呢個同知道邊個係已經準備過嘅，相差好遠。查下有冇呢個 app 自己嘅標記，就老老實實有答案，唔會扮到比一個細細嘅檔案內容更肯定。",
            "喺一部電腦設定好，跟住喺第二部電腦裝呢個 app，佢個登入戶口仲係見到全部有寫入權嘅 repository——但呢個同知道邊個係已經準備過嘅，差成條街咁遠。查下有冇呢個 app 自己嘅標記，就老老實實有答案，唔會扮到一個細細嘅檔案內容講嘅嘢仲肯定。",
        ],
    },
    "worldrepo.adopt.empty": {
        en: [
            "This account has no repositories to check yet.",
            "This account has no repositories to check yet.",
            "This account has no repositories to check yet. Create one first, or sign in as a different account.",
            "This account has no repositories to check yet - create one first, or sign in with a different account.",
            "This account has no repositories to check yet - a blank slate. Create one first, or sign in with a different account.",
        ],
        yue: [
            "呢個帳戶重未有 repository 可以檢查。",
            "呢個帳戶重未有 repository 可以檢查。",
            "呢個帳戶重未有 repository 可以檢查。可以先開一個，或者用第個帳戶登入。",
            "呢個帳戶重未有 repository 可以檢查——先開一個，或者換第個帳戶登入。",
            "呢個帳戶重未有 repository 可以檢查——一片空白。先開一個，或者換第個帳戶登入。",
        ],
    },
    "worldrepo.adopt.noMatch": {
        en: [
            "Nothing here matches that search.",
            "Nothing here matches that search. Clearing it brings the whole list back.",
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was checked or removed.",
            "Nothing here matches that search - clear it and the whole list comes straight back, nothing was checked or removed.",
            "Nothing here matches that search - not one. Clear it and the whole list comes straight back, because nothing was checked or removed.",
        ],
        yue: [
            "冇嘢符合呢個搜尋。",
            "冇嘢符合呢個搜尋。清空就會見返成個清單。",
            "冇嘢符合呢個搜尋。清空就會見返成個清單；乜都未檢查或者刪除過。",
            "冇嘢符合呢個搜尋——清空即刻見返成個清單，乜都未檢查或者刪除過。",
            "冇嘢符合呢個搜尋——一個都撞唔到。清空即刻見返成個清單，因為根本乜都未檢查或者刪除過。",
        ],
    },
    "worldrepo.adopt.notice.adopted": {
        en: [
            "“{name}” was adopted onto this computer.",
            "“{name}” was adopted onto this computer.",
            "“{name}” was adopted onto this computer - its project settings are now saved into the world folder chosen for it.",
            "“{name}” has been adopted onto this computer - its project settings are now saved into the world folder chosen for it, ready to open.",
            "“{name}” has been adopted onto this computer, safe and sound - its project settings are now saved into the world folder chosen for it, ready to open right away.",
        ],
        yue: [
            "「{name}」已經帶咗過嚟呢部電腦。",
            "「{name}」已經帶咗過嚟呢部電腦。",
            "「{name}」已經帶咗過嚟呢部電腦——佢嘅專案設定而家已經存入揀咗嘅世界資料夾。",
            "「{name}」已經安全帶咗過嚟呢部電腦——佢嘅專案設定而家已經存入揀咗嘅世界資料夾，隨時開得。",
            "「{name}」已經穩穩陣陣帶咗過嚟呢部電腦——佢嘅專案設定而家已經存入揀咗嘅世界資料夾，即刻可以開返嚟用。",
        ],
    },
    "worldrepo.adopt.notice.adoptFailed": {
        en: [
            "This project could not be written to that world folder.",
            "This project could not be written to that world folder.",
            "This project could not be written to that world folder, so nothing was adopted.",
            "This project could not be written to that world folder - nothing was adopted, and nothing there was changed.",
            "This project flatly refused to be written to that world folder - nothing was adopted, and nothing there was touched.",
        ],
        yue: [
            "呢個專案存唔到入嗰個世界資料夾。",
            "呢個專案存唔到入嗰個世界資料夾。",
            "呢個專案存唔到入嗰個世界資料夾，所以冇帶到過嚟。",
            "呢個專案存唔到入嗰個世界資料夾——冇帶到過嚟，嗰邊嘅嘢都冇改過。",
            "呢個專案死都唔肯存入嗰個世界資料夾——冇帶到過嚟，嗰邊嘅嘢一啲都冇被郁過。",
        ],
    },
    "worldrepo.adopt.alreadyLocal": {
        en: [
            "This computer already has a local project synced from this repository, at {worldPath}.",
            "This computer already has a local project synced from this repository, at {worldPath}. Adopting it again would create a second, duplicate binding to the same remote target.",
            "This computer already has a local project synced from this repository, at {worldPath}. Adopting it again would create a second, duplicate binding to the same remote target rather than anything new.",
            "This computer already has a local project synced from this repository, sitting at {worldPath}. Adopting it again would only create a second, duplicate binding to the exact same remote target.",
            "This computer already has a local project synced from this repository, sitting right there at {worldPath}. Adopting it again would just create a second, duplicate binding to the exact same remote target - a copy of a copy.",
        ],
        yue: [
            "呢部電腦已經有一個本地專案同呢個 repository 同步緊，喺 {worldPath}。",
            "呢部電腦已經有一個本地專案同呢個 repository 同步緊，喺 {worldPath}。再帶一次會整多一個重複、連去同一個遠端目標嘅綁定。",
            "呢部電腦已經有一個本地專案同呢個 repository 同步緊，喺 {worldPath}。再帶一次都係整多一個重複、連去同一個遠端目標嘅綁定，唔係新嘢。",
            "呢部電腦已經有一個本地專案同呢個 repository 同步緊，就喺 {worldPath}。再帶一次淨係會整多一個重複、連去一模一樣遠端目標嘅綁定。",
            "呢部電腦已經有一個本地專案同呢個 repository 同步緊，就企喺 {worldPath} 度。再帶一次淨係會整多一個重複、連去一模一樣遠端目標嘅綁定——複製多份複製品。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const WORLDREPO_FIXED = {
    "worldrepo.title": { en: "Keep a world in a git repository", yue: "將世界擺入 git repository" },
    "worldrepo.section.where": { en: "Which world, and where", yue: "邊個世界，去邊度" },
    "worldrepo.section.report": { en: "What this would do", yue: "會發生咩事" },
    "worldrepo.section.tracking": { en: "Worlds this computer is tracking", yue: "呢部電腦追蹤緊嘅世界" },
    "worldrepo.section.adopt": { en: "Adopt a repository from another computer", yue: "帶另一部電腦準備好嘅 repository過嚟" },

    "worldrepo.field.worldPath": { en: "World folder", yue: "世界資料夾" },
    "worldrepo.field.owner": { en: "Repository owner", yue: "Repository 擁有者" },
    "worldrepo.field.repo": { en: "Repository name", yue: "Repository 名稱" },
    "worldrepo.field.branch": { en: "Branch", yue: "分支" },

    "worldrepo.check": { en: "Check before anything is pushed", yue: "推送前先檢查" },
    "worldrepo.sync": { en: "Sync this world", yue: "同步呢個世界" },
    "worldrepo.resume": { en: "Continue this sync", yue: "繼續呢個同步" },
    "worldrepo.cancel": { en: "Stop syncing", yue: "停止同步" },
    "worldrepo.open": { en: "Open on GitHub", yue: "喺 GitHub 打開" },
    "worldrepo.copy": { en: "Copy the repository address", yue: "複製 repository 網址" },
    "worldrepo.stopTracking": { en: "Stop tracking", yue: "停止追蹤" },
    "worldrepo.bulkStopTracking": { en: "Stop tracking {chosen}", yue: "停止追蹤 {chosen} 個" },
    "worldrepo.selectShown": { en: "Select the {shown} shown", yue: "揀晒顯示緊嘅 {shown} 個" },
    "worldrepo.selectNone": { en: "Clear the selection", yue: "清空揀選" },

    "worldrepo.stop.title": { en: "Stop tracking this world", yue: "停止追蹤呢個世界" },
    "worldrepo.bulkStop.title": { en: "Stop tracking these worlds", yue: "停止追蹤呢啲世界" },

    "worldrepo.createRepo.button": { en: "Create this repository", yue: "開呢個 repository" },
    "worldrepo.createRepo.ownerKind": { en: "The owner above is", yue: "上面個擁有者係" },
    "worldrepo.createRepo.ownerKind.user": { en: "my own account", yue: "我自己嘅帳戶" },
    "worldrepo.createRepo.ownerKind.org": { en: "an organization I belong to", yue: "我所屬嘅組織" },
    "worldrepo.createRepo.visibility": { en: "Visibility", yue: "公開程度" },
    "worldrepo.createRepo.visibility.private": { en: "Private", yue: "私人" },
    "worldrepo.createRepo.visibility.public": { en: "Public", yue: "公開" },
    "worldrepo.createRepo.unsupported": {
        en: "This build cannot create a repository from here. Create one on GitHub directly, then check it above.",
        yue: "呢個版本喺呢度開唔到 repository。請直接喺 GitHub 開一個，再喺上面檢查。",
    },
    "worldrepo.createRepo.blockedOwner": {
        en: "Type an owner above before creating a repository.",
        yue: "請先喺上面打個擁有者，先可以開 repository。",
    },
    "worldrepo.createRepo.blockedName": {
        en: "Type a repository name above before creating it.",
        yue: "請先喺上面打個 repository 名，先可以開佢。",
    },
    "worldrepo.createRepo.blockedCreating": { en: "Already creating.", yue: "整緊喇。" },

    "worldrepo.gh.ready": { en: "The gh command-line tool is installed and signed in.", yue: "gh 命令列工具已經安裝同登入。" },
    "worldrepo.gh.readyAs": {
        en: "The gh command-line tool is signed in as {account} on {host}.",
        yue: "gh 命令列工具而家喺 {host} 以 {account} 身分登入。",
    },
    "worldrepo.gh.signIn": {
        en: "Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
        yue: "喺終端機行 `gh auth login`——佢會互動咁問你要個代碼，喺呢個 app 入面控制唔到——之後再檢查一次。",
    },

    "worldrepo.phase.starting": { en: "Starting", yue: "開始緊" },
    "worldrepo.phase.preparing": { en: "Reading the world's files", yue: "讀緊世界嘅檔案" },
    "worldrepo.phase.checking": { en: "Checking the repository and the branch", yue: "檢查緊 repository 同分支" },
    "worldrepo.phase.staging": { en: "Staging the world's files", yue: "整理緊世界嘅檔案" },
    "worldrepo.phase.committing": { en: "Recording the world as one commit", yue: "記錄緊個世界做一個 commit" },
    "worldrepo.phase.pushing": { en: "Pushing to GitHub", yue: "推送緊去 GitHub" },
    "worldrepo.phase.verifying": { en: "Reading the branch back to confirm the push landed", yue: "讀返個分支，確認推送成功" },
    "worldrepo.phase.finished": { en: "Finished", yue: "完成" },

    "worldrepo.records.search": { en: "Search tracked worlds", yue: "搜尋追蹤緊嘅世界" },
    "worldrepo.records.summary": { en: "Showing {shown} of {total}", yue: "顯示緊 {total} 個入面嘅 {shown} 個" },
    "worldrepo.records.bulkLabel": { en: "Actions on the chosen worlds", yue: "對揀咗嘅世界進行嘅動作" },
    "worldrepo.records.rowMenuLabel": { en: "What this tracked world can do", yue: "呢個追蹤緊嘅世界可以做咩" },
    "worldrepo.records.choose": { en: "Choose {name}", yue: "揀 {name}" },
    "worldrepo.records.unverified": { en: "push unverified", yue: "推送未核實" },
    "worldrepo.records.interrupted": { en: "stopped during {stage}", yue: "喺 {stage} 中斷咗" },

    "worldrepo.adopt.search": { en: "Search your repositories", yue: "搜尋你嘅 repository" },
    "worldrepo.adopt.unsupported": {
        en: "This build cannot list your repositories to check. Type an owner and a repository name above and check it there instead.",
        yue: "呢個版本列唔到你嘅 repository 畀你檢查。請喺上面打個擁有者同 repository 名，喺嗰度檢查。",
    },
    "worldrepo.adopt.loading": { en: "Reading your repositories...", yue: "讀緊你嘅 repository……" },
    "worldrepo.adopt.choose": { en: "Choose {name}", yue: "揀 {name}" },
    "worldrepo.adopt.checkSelected": { en: "Check {n} repositories", yue: "檢查 {n} 個 repository" },
    "worldrepo.adopt.viewPlan": { en: "View what could be restored", yue: "睇下可以帶返咩過嚟" },
    "worldrepo.adopt.plan.fromWizard": {
        en: "Never opened past the guide on the old computer.",
        yue: "喺舊電腦度未曾喺導引之外開過。",
    },
    "worldrepo.adopt.plan.maps": { en: "Maps", yue: "地圖" },
    "worldrepo.adopt.plan.storages": { en: "Storages", yue: "儲存空間" },
    "worldrepo.adopt.plan.renderNotes": { en: "Non-default render settings", yue: "非預設嘅渲染設定" },
    "worldrepo.adopt.needsAttention": { en: "What will not cross over", yue: "邊啲嘢過唔到嚟" },
    "worldrepo.adopt.worldFolder": { en: "World folder on this computer", yue: "呢部電腦上面嘅世界資料夾" },
    "worldrepo.adopt.chooseFolder": {
        en: "Choose the world folder this project should be linked to on this computer first.",
        yue: "請先揀返呢部電腦上面，呢個專案應該連去邊個世界資料夾。",
    },
    "worldrepo.adopt.adoptButton": { en: "Adopt this repository", yue: "帶呢個 repository 過嚟" },
    "worldrepo.adopt.openDependencies": { en: "Check dependencies in Settings", yue: "喺設定度檢查依賴項" },
    "worldrepo.adopt.openRemoteSettings": { en: "Open Settings", yue: "打開設定" },

    "worldrepo.status.prepared": { en: "Looks like yours", yue: "似係你準備過嘅" },
    "worldrepo.status.preparedNewer": { en: "Looks like yours (newer version)", yue: "似係你準備過嘅（新版本）" },
    "worldrepo.status.notPrepared": { en: "Not one of yours", yue: "唔係你準備過嘅" },
    "worldrepo.status.notChecked": { en: "Not checked", yue: "未檢查" },
    "worldrepo.status.unknown": { en: "Could not tell", yue: "睇唔出" },
    "worldrepo.size": { en: "{size} across {files} files would be pushed.", yue: "會推送 {size}，共 {files} 個檔案。" },
} as const satisfies Record<string, FixedString>;

export const WORLDREPO_FACTS = {
    "worldrepo.pitch": { en: ["git repository", "incrementally"], yue: ["git repository", "逐步更新"] },
    "worldrepo.caveats": { en: ["100 MB"], yue: ["100 MB"] },
    "worldrepo.unsupported": { en: ["desktop application"], yue: ["桌面程式"] },
    "worldrepo.blocked.check": { en: ["repository"], yue: ["repository"] },
    "worldrepo.blocked.acknowledge": { en: ["sync"], yue: ["同步"] },
    "worldrepo.ack": { en: ["pushes the whole world", "replaces"], yue: ["上傳成個世界", "取代"] },
    "worldrepo.notice.synced": { en: ["synced", "verified"], yue: ["同步", "核實"] },
    "worldrepo.notice.syncedUnverified": { en: ["GitHub", "unverified"], yue: ["GitHub", "未核實"] },
    "worldrepo.notice.removed": { en: ["Stopped tracking", "branch", "not touched"], yue: ["停止追蹤", "分支", "冇郁過"] },
    "worldrepo.notice.removeFailed": { en: ["could not be stopped"], yue: ["停唔到"] },
    "worldrepo.notice.resumed": { en: ["sync", "continu"], yue: ["同步", "繼續"] },
    "worldrepo.notice.bulkRemoved": { en: ["{done}", "{total}"], yue: ["{done}", "{total}"] },
    "worldrepo.notice.copied": { en: ["address"], yue: ["網址"] },
    "worldrepo.records.empty": { en: ["synced"], yue: ["同步"] },
    "worldrepo.records.noMatch": { en: ["search"], yue: ["搜尋"] },
    "worldrepo.createRepo.lead": { en: ["owner and name"], yue: ["擁有者同名"] },
    "worldrepo.stop.action": { en: ["{branch}", "{owner}", "{repo}", "deleted"], yue: ["{branch}", "{owner}", "{repo}", "刪除"] },
    "worldrepo.bulkStop.action": { en: ["{chosen}", "deleted"], yue: ["{chosen}", "刪除"] },
    "worldrepo.adopt.pitch": { en: ["marker"], yue: ["標記"] },
    "worldrepo.adopt.empty": { en: ["repositories"], yue: ["repository"] },
    "worldrepo.adopt.noMatch": { en: ["search"], yue: ["搜尋"] },
    "worldrepo.adopt.notice.adopted": { en: ["{name}", "adopted"], yue: ["{name}", "帶"] },
    "worldrepo.adopt.notice.adoptFailed": { en: ["could not be written"], yue: ["存唔到"] },
    "worldrepo.adopt.alreadyLocal": { en: ["{worldPath}", "duplicate"], yue: ["{worldPath}", "重複"] },
} as const satisfies Record<keyof typeof WORLDREPO_VOICED, { en: readonly string[]; yue: readonly string[] }>;
