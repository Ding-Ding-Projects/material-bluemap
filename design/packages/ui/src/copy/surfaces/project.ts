/**
 * The Projects screen's copy: `ProjectEditor.vue`, `ProjectList.vue`, `ProjectMapsPanel.vue`,
 * `ProjectStoragesPanel.vue` and `ProjectsScreen.vue` in full.
 *
 * The project editor's destructive notes started this file: removing a map removes its
 * configuration while leaving already-rendered tiles behind, and removing a storage leaves
 * its tiles behind while maps may still point at it. Every level keeps those facts intact
 * while allowing the surrounding voice to change. The bulk-delete and single-delete warnings
 * in `ProjectList.vue`, the per-map and per-storage delete gates in `ProjectMapsPanel.vue`
 * and `ProjectStoragesPanel.vue`, and the world-forget flow in `ProjectsScreen.vue` are all
 * the same kind of note, restated for whichever thing is actually leaving: the world is
 * untouched, the tiles already rendered stay put, and every setting the removed thing held
 * goes with it.
 *
 * ## Almost the whole surface, `.vue` files and the model underneath
 *
 * Every literal `t(...)` call site in the five `.vue` files under `components/project`
 * resolves in this catalogue, and so does `projectModel.ts`'s `project.row.*` cluster (the
 * list row's secondary line - "world {world}", "{maps} maps", "last edited {at}", and so
 * on), even though that file is not a component: 202 of 204 real call sites, all voiced.
 * `components/project` still stays off `COVERED_SURFACES` in `catalogueCoverage.test.ts`
 * because of the two that are left, both in `ProjectList.vue`'s row menu.
 *
 * ## Keys deliberately left out
 *
 * A handful of call sites across the five `.vue` files cannot be answered here at all, and
 * are skipped rather than worked around:
 *
 *   - `t(`project.editor.tab.${kind}`, ...)` in `ProjectEditor.vue` builds its key from a
 *     template literal, so there is no literal call site for `appCopy.test.ts` to match a
 *     catalogue entry against. Voicing `project.editor.tab.core` would make that entry an
 *     orphan.
 *   - `t(problem.key, problem.vars ?? {}, problem.fallback)` appears three times with the
 *     same shape: in `ProjectMapsPanel.vue` for a map id and a storage id, in
 *     `ProjectStoragesPanel.vue` for a storage id, and in `ProjectsScreen.vue` for
 *     `renderProblems(project)[0]` before a render starts. All three read `problem.key` off
 *     an `IdProblem` (or the render-problem equivalent) that `projectModel.ts` builds as
 *     plain data - `project.map.needId`, `project.map.badId`, `project.storage.idTaken`,
 *     `project.render.noMaps`, `project.render.noneEnabled`, `project.render.credentialled`,
 *     and their kin. The strings exist in `projectModel.ts`, but never behind a literal
 *     `t("...")` call, so there is nothing for the coverage scanner to find and nothing here
 *     can answer them without going red.
 *   - `t("project.list.key.open", keyLabel(ROW_OPEN_KEY))` in `ProjectList.vue` passes a
 *     computed keyboard-key name as its second argument rather than a literal fallback
 *     string, and the value it renders (`Enter`, `Space`) is a keyboard label rather than
 *     prose to translate.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PROJECT_VOICED = {
    "project.maps.deleteMap": {
        en: [
            "The map {name}, id {id}.",
            "The map {name}, id {id}.",
            "The map {name}, id {id}, is the one leaving this project.",
            "Map {name}, id {id}, is stepping out of this project.",
            "Map {name}, id {id}, is taking the little exit from this project; the id stays named so nobody has to guess.",
        ],
        yue: [
            "張地圖係 {name}，id 係 {id}。",
            "張地圖係 {name}，id 係 {id}。",
            "就係 {name} 呢張地圖，id 係 {id}，會由呢個 project 離開。",
            "{name} 呢張地圖、id {id}，而家準備行出呢個 project。",
            "{name} 呢張地圖、id {id}，而家行呢個 project 嘅小門口；個 id 照講清楚，唔使靠估。",
        ],
    },
    "project.maps.deleteSettings": {
        en: [
            "Every setting in its config, including anything tuned by hand.",
            "Every setting in its config, including anything tuned by hand.",
            "Every setting in its config, including the ones somebody tuned by hand.",
            "Every setting in its config goes with it, including the hand-tuned ones.",
            "Every setting in its config goes with it, including the hand-tuned knobs that were hiding in plain sight.",
        ],
        yue: [
            "佢 config 入面每一項設定，包括手動調校過嘅嘢。",
            "佢 config 入面每一項設定，包括手動調校過嘅嘢。",
            "佢 config 入面每一項設定都包括埋，連手動調校嗰啲都係。",
            "佢 config 入面每一項設定都會一齊走，連手動調校過嗰啲掣都唔例外。",
            "佢 config 入面每一項設定都會一齊走，連埋嗰啲匿喺眼前但手動調校過嘅旋鈕都唔留低。",
        ],
    },
    "project.maps.deleteTiles": {
        en: [
            "Tiles already rendered under {id} are NOT deleted. They stay on the disk, and the space is not coming back; remove them yourself if you want it.",
            "Tiles already rendered under {id} are NOT deleted. They stay on the disk, and the space is not coming back; remove them yourself if you want it.",
            "Tiles already rendered under {id} are NOT deleted. They stay on disk, so reclaiming the space is still your job.",
            "Tiles already rendered under {id} are NOT deleted. They remain on disk, patiently declining to reclaim their own space.",
            "Tiles already rendered under {id} are NOT deleted. They remain on disk, guarding the space like tiny bureaucrats, so you must remove them yourself.",
        ],
        yue: [
            "喺 {id} 底下已經算好嘅圖磚係唔會刪除嘅。佢哋仲留喺磁碟，想攞返空間要你自己刪。",
            "喺 {id} 底下已經算好嘅圖磚係唔會刪除嘅。佢哋仲留喺磁碟，想攞返空間要你自己刪。",
            "喺 {id} 底下已經算好嘅圖磚唔會刪除，仲留喺磁碟；想攞返空間仍然要你自己處理。",
            "喺 {id} 底下已經算好嘅圖磚唔會刪除，會留喺磁碟度，自己唔會行返啲空間出嚟。",
            "喺 {id} 底下已經算好嘅圖磚一塊都唔會刪除，會喺磁碟度做小小空間官僚；想攞返啲位，仍然要你自己請佢哋走。",
        ],
    },
    "project.maps.deleted": {
        en: [
            "The map {id} is out of this project. It is written when you save.",
            "The map {id} is out of this project. It is written when you save.",
            "The map {id} is out of this project; save writes that change.",
            "Map {id} has left this project, and save is what records the departure.",
            "Map {id} has left the project; save is the official paperwork for its tiny exit.",
        ],
        yue: [
            "地圖 {id} 已經唔喺呢個 project 入面，儲存嘅時候先會寫落去。",
            "地圖 {id} 已經唔喺呢個 project 入面，儲存嘅時候先會寫落去。",
            "地圖 {id} 已經離開呢個 project；儲存會寫低呢個改動。",
            "地圖 {id} 已經行出呢個 project，儲存就係記錄佢離場。",
            "地圖 {id} 已經行出呢個 project；儲存係佢呢次小小離場嘅正式文書。",
        ],
    },
    "project.storages.deleteTiles": {
        en: [
            "Tiles already written into it are NOT deleted. They stay wherever they are, and the space is not coming back.",
            "Tiles already written into it are NOT deleted. They stay wherever they are, and the space is not coming back.",
            "Tiles already written into it are NOT deleted. They stay where they are, so reclaiming the space is your job.",
            "Tiles already written into it are NOT deleted. They remain where they are, refusing to tidy up the disk space after this removal.",
            "Tiles already written into it are NOT deleted. They remain exactly where they are, little disk-space tenants with no plans to vacate themselves.",
        ],
        yue: [
            "已經寫入去嘅圖磚係唔會刪除嘅。佢哋留返喺原位，空間唔會自己返嚟。",
            "已經寫入去嘅圖磚係唔會刪除嘅。佢哋留返喺原位，空間唔會自己返嚟。",
            "已經寫入去嘅圖磚唔會刪除，會留喺原位；想攞返空間要你自己處理。",
            "已經寫入去嘅圖磚唔會刪除，照留喺原位，唔會幫你善後空間。",
            "已經寫入去嘅圖磚一塊都唔會刪除，照住原位住低，成班磁碟租客唔打算自己搬走，空間亦都唔會自己返嚟。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectEditor.vue: the render tab's hints, and the rest of the    */
    /* screen's prose                                                    */
    /* ---------------------------------------------------------------- */

    "project.render.threadsHint": {
        en: [
            "How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.",
            "How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.",
            "How many chunks are drawn at once. Left empty, BlueMap picks a number from the machine it is on, and that guess is usually right.",
            "How many chunks get drawn at the same time. Leave it empty and BlueMap sizes it to the machine it is on, which is usually the smarter call anyway.",
            "How many chunks get hammered at once. Leave it empty and BlueMap sizes itself up against the machine it is on, and honestly, it usually guesses better than a number typed in a hurry.",
        ],
        yue: [
            "同一時間畫幾多個區塊。留空嘅話，BlueMap 會按呢部機嘅規格自己決定，通常都啱。",
            "同一時間畫幾多個區塊。留空嘅話，BlueMap 會按呢部機嘅規格自己決定，通常都啱。",
            "同一時間畫幾多個區塊。留空嘅話，BlueMap 會照呢部機嘅規格自己揀個數，通常都啱嘅。",
            "同一時間畫幾多個區塊。留空俾 BlueMap 自己按機器嗌價，佢通常揀得比你手打嗰個數叻。",
            "同一時間有幾多個區塊喺度畫緊。留空吖，等 BlueMap 自己睇部機幾大隻嚟揀數，講真，佢通常揀得比你亂咁打個數更叻。",
        ],
    },
    "project.render.forceHint": {
        en: [
            "Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.",
            "Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.",
            "Redraws every chunk instead of only the ones that changed. Slow, and exactly what you want after changing how the map looks.",
            "Redraws every chunk rather than only the ones that changed. Slow going, but exactly what you reach for after changing how the map looks.",
            "Redraws every chunk, changed or not, missing none of them. Slow as anything, but exactly what you reach for the moment you have changed how the map looks and want it to actually show.",
        ],
        yue: [
            "會重新畫晒每一個區塊，唔淨係改咗嘅嗰啲。會慢，但改咗地圖外觀之後就要用呢個。",
            "會重新畫晒每一個區塊，唔淨係改咗嘅嗰啲。會慢，但改咗地圖外觀之後就要用呢個。",
            "會重新畫晒每一個區塊，唔淨係改過嗰啲。會慢啲，不過改完地圖外觀之後就係要用呢個。",
            "每一個區塊都要重畫，唔淨係改過嗰啲，一個都唔留手。慢梗係慢，但改完地圖外觀想真係睇到，就要靠佢。",
            "每一個區塊，改過定未改過，通通重畫一次，一個都唔留手。慢到爆，但改完地圖外觀想真係睇到新樣，就係要靠呢招。",
        ],
    },
    "project.render.fixEdgesHint": {
        en: [
            "Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.",
            "Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.",
            "Redraws the boundary between chunks as well as the chunks themselves. That is what fixes the seams an interrupted render leaves behind.",
            "Redraws the boundary between chunks, not just the chunks themselves, which is the actual fix for the seams an interrupted render leaves.",
            "Redraws the boundary between chunks as well as the chunks themselves, because those seams an interrupted render leaves behind do not fix themselves.",
        ],
        yue: [
            "除咗區塊本身，連區塊之間嘅邊界都會重畫，可以修返因中斷算圖而留低嘅接縫。",
            "除咗區塊本身，連區塊之間嘅邊界都會重畫，可以修返因中斷算圖而留低嘅接縫。",
            "唔淨係區塊本身，連區塊之間嘅邊界都會重畫，用嚟修返算圖中斷留低嘅接縫。",
            "連區塊之間嘅邊界都一齊重畫，唔淨係區塊本身，先真係修得返算圖中斷留低嗰啲接縫。",
            "連區塊之間嗰條邊界都會重畫，唔淨係區塊本身，因為算圖中斷留低嘅嗰啲醜樣接縫，唔會自己消失㗎。",
        ],
    },
    "project.render.metricsHint": {
        en: [
            "Off unless deliberately turned on. Nothing about your world is in it.",
            "Off unless deliberately turned on. Nothing about your world is in it.",
            "Off unless you deliberately turn it on, and nothing about your world is in it either way.",
            "Off by default, and stays off unless you flip it on yourself. Nothing about your world ever goes into it.",
            "Off by default, and it stays that way unless you go out of your way to flip it on. Nothing about your world rides along in it, not a single block.",
        ],
        yue: [
            "預設關閉，除非你特登打開。入面唔會有你個世界嘅任何資料。",
            "預設關閉，除非你特登打開。入面唔會有你個世界嘅任何資料。",
            "預設係關閉嘅，要你自己特登打開先會有；入面完全冇你個世界嘅資料。",
            "預設關閉，要你自己出手打開先會有。入面連你個世界嘅一丁點資料都冇。",
            "預設關閉到實一實，要你自己特登去撳先會開。入面連你個世界嘅一粒沙都冇帶埋。",
        ],
    },
    "project.render.outputFolderHint": {
        en: [
            "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
            "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
            "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the project file lives in.",
            "Leave it empty and the app writes to the folder chosen back during setup. This is the one absolute path a project carries at all, because the render has to land outside the world the file lives in.",
            "Leave it empty and the app quietly writes to the folder chosen back during setup. This is the one and only absolute path a project carries, because the render genuinely has to land outside the world the file itself lives in.",
        ],
        yue: [
            "留空嘅話，程式會寫入設定時揀嘅資料夾。呢個係 project 入面唯一嘅絕對路徑，因為輸出要放喺個世界資料夾之外。",
            "留空嘅話，程式會寫入設定時揀嘅資料夾。呢個係 project 入面唯一嘅絕對路徑，因為輸出要放喺個世界資料夾之外。",
            "留空嘅話，程式會寫入設定時揀低嘅資料夾。呢個係 project 入面唯一一個絕對路徑，因為輸出要擺喺個世界資料夾之外。",
            "留空吖，程式就會寫入設定嗰陣揀低嘅資料夾。呢個係 project 度僅有嘅絕對路徑，因為算出嚟嘅圖一定要擺喺個世界資料夾之外。",
            "留空啦，程式就悄悄寫入設定嗰陣揀低嗰個資料夾。呢個係 project 度獨一無二嘅絕對路徑，因為算出嚟嘅嘢真係要住喺世界資料夾之外。",
        ],
    },
    "project.render.badPattern": {
        en: [
            "The pattern is not valid, so nothing is shown.",
            "The pattern is not valid, so nothing is shown.",
            "The pattern is not valid, so nothing is shown here.",
            "That pattern is not valid, so nothing is shown. Every setting is still there underneath.",
            "That pattern is not valid, so nothing is shown, though every setting is still sitting underneath, patiently waiting for a pattern that parses.",
        ],
        yue: [
            "呢個 pattern 唔啱，所以乜都冇顯示。",
            "呢個 pattern 唔啱，所以乜都冇顯示。",
            "呢個 pattern 唔啱，所以呢度乜都冇顯示。",
            "嗰個 pattern 唔啱，所以乜都冇顯示。所有設定其實都仲喺度。",
            "嗰個 pattern 唔啱，所以乜都冇顯示，不過啲設定其實一個都冇走，靜靜哋喺底下等緊一個真係啱嘅 pattern。",
        ],
    },
    "project.editor.world": {
        en: [
            "Lives at the root of {world}.",
            "Lives at the root of {world}.",
            "This project lives at the root of {world}.",
            "This project lives right at the root of {world}, and moves if that folder does.",
            "This project makes its home at the root of {world}, and it packs up and follows if that folder ever moves.",
        ],
        yue: [
            "位於 {world} 嘅根目錄。",
            "位於 {world} 嘅根目錄。",
            "呢個 project 位於 {world} 嘅根目錄。",
            "呢個 project 就住喺 {world} 嘅根目錄，個資料夾搬去邊，佢就跟去邊。",
            "呢個 project 安家喺 {world} 嘅根目錄，個資料夾一搬屋，佢即刻執包袱跟埋去。",
        ],
    },
    "project.editor.blurb": {
        en: [
            "Everything below is applied when this project renders, so a second render repeats the first without asking anything again. The world is wherever this file was found; moving the folder moves the project with it.",
            "Everything below is applied when this project renders, so a second render repeats the first without asking anything again. The world is wherever this file was found; moving the folder moves the project with it.",
            "Everything below is applied when this project renders, so a second render repeats the first without asking anything again. The world is wherever this file was found, and moving the folder moves the project along with it.",
            "Everything below applies the moment this project renders, so a second render just repeats the first without asking a single question again. The world is wherever this file happens to sit, and moving the folder moves the project right along with it.",
            "Everything below applies the moment this project renders, so a second render is a rerun of the first with zero questions asked twice. The world is simply wherever this file happens to be sitting, and moving the folder moves the project right along with it, no questions asked.",
        ],
        yue: [
            "下面所有嘢喺呢個 project 算圖嗰陣都會套用，所以第二次算圖會重複第一次，唔會再問一次。世界就係呢個檔案所在嘅地方；搬咗個資料夾，project 都會跟住搬。",
            "下面所有嘢喺呢個 project 算圖嗰陣都會套用，所以第二次算圖會重複第一次，唔會再問一次。世界就係呢個檔案所在嘅地方；搬咗個資料夾，project 都會跟住搬。",
            "下面所有嘢喺呢個 project 算圖嗰陣都會套用，所以第二次算圖會重複返第一次，唔使再問多次。世界就係呢個檔案所在嗰個地方，搬咗個資料夾，project 都會跟住一齊搬。",
            "下面所有嘢一到呢個 project 算圖就會套用，所以第二次算圖淨係重複返第一次，一個問題都唔使再問。世界就係呢個檔案安身嗰個地方，搬咗個資料夾，project 就跟住搬屋。",
            "下面所有嘢一到呢個 project 開始算圖就會套用，所以第二次算圖同足足重播返第一次一樣，一條問題都唔使問多次。世界就係呢個檔案落腳嗰個地方，搬個資料夾，project 就乖乖跟住一齊搬。",
        ],
    },
    "project.editor.noEngine": {
        en: [
            "This build cannot render locally. Every setting here is real and saved to the project either way; starting a render needs the desktop app.",
            "This build cannot render locally. Every setting here is real and saved to the project either way; starting a render needs the desktop app.",
            "This build cannot render locally. Every setting here is real and is saved to the project either way; starting a render needs the desktop app.",
            "This build cannot render locally, not on its own. Every setting here is still real and still gets saved to the project regardless; actually starting a render needs the desktop app.",
            "This build flatly cannot render locally by itself. Every setting here is completely real and still gets saved to the project regardless; getting a render to actually start needs the desktop app.",
        ],
        yue: [
            "呢個版本冇辦法喺本機算圖。呢度嘅設定全部都係真嘅，一樣會存入 project；要開始算圖就要用桌面程式。",
            "呢個版本冇辦法喺本機算圖。呢度嘅設定全部都係真嘅，一樣會存入 project；要開始算圖就要用桌面程式。",
            "呢個版本冇辦法喺本機算圖。呢度嘅設定全部都係真嘅，照樣會存入 project；要開始算圖，就要用桌面程式。",
            "呢個版本冇辦法喺本機算圖，自己一個係唔得嘅。呢度啲設定全部照計、照存入 project，一個都唔係假嘅；但要真係開始算圖，就要用桌面程式。",
            "呢個版本冇辦法喺本機算圖，死心啦。呢度嘅設定全部貨真價實，一樣照存入 project；但想真係郁手算圖，就要搵桌面程式嚟開。",
        ],
    },
    "project.render.noMatches": {
        en: [
            "Nothing on this tab matches. The other tabs may still have results.",
            "Nothing on this tab matches. The other tabs may still have results.",
            "Nothing on this tab matches that search. The other tabs may still have results.",
            "Nothing on this tab matches that search, though the other tabs might still turn something up.",
            "Nothing on this tab wants to match that search, though the other tabs might still be hiding something worth finding.",
        ],
        yue: [
            "呢個分頁冇嘢符合。其他分頁可能仲有結果。",
            "呢個分頁冇嘢符合。其他分頁可能仲有結果。",
            "呢個分頁冇嘢符合呢個搜尋。其他分頁可能仲有結果。",
            "呢個分頁冇嘢啱到呢個搜尋，不過其他分頁可能仲搵到嘢。",
            "呢個分頁死都冇嘢肯同呢個搜尋啱，不過其他分頁可能仲收埋緊值得搵嘅嘢。",
        ],
    },
    "project.editor.singletonTouched": {
        en: [
            "This project carries its own {file}, so these values are used instead of BlueMap's defaults.",
            "This project carries its own {file}, so these values are used instead of BlueMap's defaults.",
            "This project carries its own {file}, so these values are used in place of BlueMap's defaults.",
            "This project is carrying its own {file}, so these values win over BlueMap's own defaults.",
            "This project is carrying its very own {file}, so these values overrule BlueMap's own defaults without so much as asking.",
        ],
        yue: [
            "呢個 project 有自己嘅 {file}，所以會用呢啲數值，唔會用 BlueMap 嘅預設值。",
            "呢個 project 有自己嘅 {file}，所以會用呢啲數值，唔會用 BlueMap 嘅預設值。",
            "呢個 project 帶住自己嘅 {file}，所以會用呢啲數值嚟代替 BlueMap 嘅預設值。",
            "呢個 project 隨身帶住自己嘅 {file}，所以呢啲數值會贏過 BlueMap 嘅預設值。",
            "呢個 project 隨身帶住自己個 {file}，所以呢啲數值會壓住 BlueMap 靜靜雞就想用嘅預設值。",
        ],
    },
    "project.editor.singletonAbsent": {
        en: [
            "This project carries no {file} of its own, so BlueMap's own defaults apply. Change anything below and the project starts carrying one, holding only what you set.",
            "This project carries no {file} of its own, so BlueMap's own defaults apply. Change anything below and the project starts carrying one, holding only what you set.",
            "This project carries no {file} of its own, so BlueMap's own defaults apply. Change anything below and the project starts carrying one, holding only what you set.",
            "This project has no {file} of its own yet, so BlueMap's own defaults quietly apply. Change anything below and the project starts carrying one, holding only what you actually set.",
            "This project has no {file} of its own yet, so BlueMap's own defaults are quietly doing the work. Touch anything below and the project starts carrying one of its own, holding nothing but what you actually set.",
        ],
        yue: [
            "呢個 project 未有自己嘅 {file}，所以會用 BlueMap 嘅預設值。改動下面任何一項，project 就會開始帶住自己嘅一份，入面淨係得你揀過嘅設定。",
            "呢個 project 未有自己嘅 {file}，所以會用 BlueMap 嘅預設值。改動下面任何一項，project 就會開始帶住自己嘅一份，入面淨係得你揀過嘅設定。",
            "呢個 project 未有自己嘅 {file}，所以會用 BlueMap 自己嘅預設值。改咗下面任何一項，project 就會開始帶住自己嘅一份，入面淨係得你揀過嘅設定。",
            "呢個 project 仲未有自己嘅 {file}，所以由 BlueMap 嘅預設值靜靜雞頂住。改咗下面隨便一項，project 就會開始帶住自己嘅一份，入面淨係得你真係設定過嘅嘢。",
            "呢個 project 仲未有自己嘅 {file}，BlueMap 嘅預設值就喺後面靜靜雞頂住場。你一改下面任何一樣，project 即刻開始帶住自己嗰份，入面乾乾淨淨，淨係得你真係揀過嘅嘢。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectList.vue: the listbox, the search, the bulk actions and    */
    /* the export flow                                                   */
    /* ---------------------------------------------------------------- */

    "project.list.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed here.",
            "That pattern is not valid, so nothing is listed. Every project is still on this machine either way.",
            "That pattern is not valid, so nothing is listed, though every project is still sitting right here on this machine, unbothered by the syntax error.",
        ],
        yue: [
            "呢個 pattern 唔啱，所以乜都冇列出。",
            "呢個 pattern 唔啱，所以乜都冇列出。",
            "呢個 pattern 唔啱，所以呢度乜都冇列出。",
            "嗰個 pattern 唔啱，所以乜都冇列出。所有 project 其實都仲喺呢部機度。",
            "嗰個 pattern 唔啱，所以乜都冇列出，不過所有 project 一個都冇走雞，仍然穩陣咁喺呢部機度，完全唔理個語法錯誤。",
        ],
    },
    "project.list.blurb": {
        en: [
            "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Open one to change anything before a render runs, or render it again exactly as it was.",
            "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Open one to change anything before a render runs, or render it again exactly as it was.",
            "A project is one file at the root of a Minecraft world, holding every map, storage and setting that world renders with. Open one to change anything before a render runs, or run it again exactly as it was.",
            "A project is one file sitting at the root of a Minecraft world, holding every map, storage and setting that world renders with. Open it to change anything before a render runs, or fire it off again exactly as it was.",
            "A project is one small file sitting at the root of a Minecraft world, quietly holding every map, storage and setting that world renders with. Open it to change absolutely anything before a render runs, or fire it off again, byte for byte, exactly as it was.",
        ],
        yue: [
            "一個 project 就係一個檔案，放喺 Minecraft 世界嘅根目錄，入面裝住嗰個世界算圖時用嘅每一張地圖、每個儲存空間同每項設定。打開嚟可以喺算圖之前改任何嘢，或者原封不動咁再算一次。",
            "一個 project 就係一個檔案，放喺 Minecraft 世界嘅根目錄，入面裝住嗰個世界算圖時用嘅每一張地圖、每個儲存空間同每項設定。打開嚟可以喺算圖之前改任何嘢，或者原封不動咁再算一次。",
            "一個 project 就係一個檔案，放喺 Minecraft 世界嘅根目錄，入面裝住嗰個世界算圖用嘅每一張地圖、每個儲存空間同每項設定。打開嚟可以喺算圖前改任何嘢，或者原封不動再算一次。",
            "一個 project 就係擺喺 Minecraft 世界根目錄嘅一個檔案，靜靜哋裝住嗰個世界算圖用嘅每一張地圖、每個儲存空間同每項設定。打開佢，喺算圖之前你想改乜都得，又或者一模一樣再算多次。",
            "一個 project 就係一個細細個、坐喺 Minecraft 世界根目錄嘅檔案，默默裝住嗰個世界算圖用嘅每一張地圖、每個儲存空間、每項設定。打開佢，算圖之前你想改乜都得，或者一字不漏、一模一樣咁再算多次。",
        ],
    },
    "project.list.noHost": {
        en: [
            "Projects live in a file at the root of a Minecraft world, so opening one needs the desktop app. This page is running in a browser tab, which has no access to your world folders.",
            "Projects live in a file at the root of a Minecraft world, so opening one needs the desktop app. This page is running in a browser tab, which has no access to your world folders.",
            "Projects live in a file at the root of a Minecraft world, so opening one needs the desktop app. This page is running in a browser tab, which has no access to your world folders.",
            "Projects live in a file at the root of a Minecraft world, so opening one needs the desktop app. This page happens to be running in a browser tab, which cannot reach your world folders at all.",
            "Projects live in a file at the root of a Minecraft world, so opening one needs the desktop app, full stop. This page is running in a plain browser tab, which has no route whatsoever to your world folders.",
        ],
        yue: [
            "Project 住喺 Minecraft 世界根目錄嘅一個檔案入面，要打開就要用桌面程式。呢個頁面喺瀏覽器分頁度執行緊，攞唔到你嘅世界資料夾。",
            "Project 住喺 Minecraft 世界根目錄嘅一個檔案入面，要打開就要用桌面程式。呢個頁面喺瀏覽器分頁度執行緊，攞唔到你嘅世界資料夾。",
            "Project 住喺 Minecraft 世界根目錄嘅一個檔案入面，要打開就一定要用桌面程式。呢個頁面而家喺瀏覽器分頁度執行，完全攞唔到你嘅世界資料夾。",
            "Project 住喺 Minecraft 世界根目錄嘅檔案入面，要打開一定要用桌面程式。呢個頁面偏偏喺瀏覽器分頁度跑緊，完全去唔到你嘅世界資料夾。",
            "Project 住喺 Minecraft 世界根目錄嘅檔案入面，唔用桌面程式就係打唔開，死㗎喇。呢個頁面淨係喺個平平無奇嘅瀏覽器分頁度跑緊，同你嘅世界資料夾隔咗十萬八千里。",
        ],
    },
    "project.list.noDelete": {
        en: [
            "This build can open and edit projects but cannot remove a project file. Delete it from the world folder yourself if you need it gone.",
            "This build can open and edit projects but cannot remove a project file. Delete it from the world folder yourself if you need it gone.",
            "This build can open and edit projects but cannot remove a project file. Delete it from the world folder yourself if you need it gone.",
            "This build can open and edit projects fine, it just cannot remove a project file. Delete it from the world folder yourself if you need it gone.",
            "This build is perfectly happy opening and editing projects; it simply cannot remove a project file. If you need it gone, that is a job for you and the world folder directly.",
        ],
        yue: [
            "呢個版本可以打開同編輯 project，但唔可以移除 project 檔案。想刪就要自己去世界資料夾度刪。",
            "呢個版本可以打開同編輯 project，但唔可以移除 project 檔案。想刪就要自己去世界資料夾度刪。",
            "呢個版本可以打開同編輯 project，但係唔可以移除 project 檔案。想刪走就要自己去世界資料夾度刪。",
            "呢個版本打開同編輯 project 冇問題，就係唔可以移除 project 檔案。想佢消失，就要自己去世界資料夾度刪。",
            "呢個版本開 project、改 project 都好開心，就係唔可以移除 project 檔案。想佢消失，就要你自己落手去世界資料夾度處理。",
        ],
    },
    "project.list.bulkDeleteAction": {
        en: [
            "This removes the project file from {chosen} world folders. It is not undoable from here.",
            "This removes the project file from {chosen} world folders. It is not undoable from here.",
            "This removes the project file from {chosen} world folders. It is not undoable from here.",
            "This removes the project file from {chosen} world folders. It is not undoable from here, and there is no undo button waiting either.",
            "This removes the project file from {chosen} world folders in one go. It is not undoable from here, and no undo button is waiting anywhere on this screen.",
        ],
        yue: [
            "呢個操作會由 {chosen} 個世界資料夾移除 project 檔案。喺呢度冇得復原。",
            "呢個操作會由 {chosen} 個世界資料夾移除 project 檔案。喺呢度冇得復原。",
            "呢個操作會由 {chosen} 個世界資料夾移除 project 檔案。喺呢度係冇得復原嘅。",
            "呢個操作會一次過由 {chosen} 個世界資料夾移除 project 檔案。喺呢度冇得復原，亦都冇復原掣。",
            "呢個操作會一次過由 {chosen} 個世界資料夾清走 project 檔案。喺呢度冇得復原，呢個畫面上邊都冇復原掣。",
        ],
    },
    "project.list.deleteAction": {
        en: [
            "This removes the project file for {name} from its world folder. It is not undoable from here.",
            "This removes the project file for {name} from its world folder. It is not undoable from here.",
            "This removes the project file for {name} from its world folder. It is not undoable from here.",
            "This removes the project file for {name} from its world folder. It is not undoable from here, and there is no undo button waiting either.",
            "This removes the project file for {name} from its world folder for good. It is not undoable from here, and no undo button is waiting anywhere on this screen.",
        ],
        yue: [
            "呢個操作會由世界資料夾移除 {name} 嘅 project 檔案。喺呢度冇得復原。",
            "呢個操作會由世界資料夾移除 {name} 嘅 project 檔案。喺呢度冇得復原。",
            "呢個操作會由世界資料夾移除 {name} 嘅 project 檔案。喺呢度係冇得復原嘅。",
            "呢個操作會由世界資料夾移除 {name} 嘅 project 檔案。喺呢度冇得復原，亦都冇復原掣。",
            "呢個操作會由世界資料夾徹底清走 {name} 嘅 project 檔案。喺呢度冇得復原，呢個畫面上邊都冇復原掣。",
        ],
    },
    /*
     * The tab a beginner exploring the strip left-to-right is likely to open before ever
     * learning what "Make a map" does, so it has to teach what a project is for -- a
     * world's maps and settings, remembered so a repeat render needs no re-asking -- before
     * pointing at the guide or the New project button as the two ways out of empty.
     */
    "project.list.emptyScanned": {
        en: [
            "A project remembers a world's maps and settings, so a repeat render needs no re-asking. None of the {scanned} worlds this computer knows about carries one yet. Make a map with the guide, or press New project above and add maps to it.",
            "A project remembers a world's maps and settings, so a repeat render needs no re-asking. None of the {scanned} worlds this computer knows about carries one yet. Make a map with the guide, or press New project above and add maps to it.",
            "A project remembers a world's maps and settings, so a repeat render needs no re-asking, and none of the {scanned} worlds this computer knows about carries one yet. Make a map with the guide, or press New project above and add maps to it.",
            "A project remembers a world's maps and settings so a repeat render never has to ask twice, and not one of the {scanned} worlds this computer knows about carries one yet. Make a map with the guide, or press New project above and add maps to it yourself.",
            "A project remembers a world's maps and settings so a repeat render never has to ask twice, and not a single one of the {scanned} worlds this computer knows about carries one yet, which is a very tidy kind of empty. Make a map with the guide, or press New project above and add maps to it yourself.",
        ],
        yue: [
            "Project 會記住一個世界嘅地圖同設定，等你再算圖嗰陣唔使再問一次。呢部電腦知道嘅 {scanned} 個世界之中，仲未有一個帶住 project。用引導整一張地圖，或者撳上面嘅「新增 project」，自己加地圖入去。",
            "Project 會記住一個世界嘅地圖同設定，等你再算圖嗰陣唔使再問一次。呢部電腦知道嘅 {scanned} 個世界之中，仲未有一個帶住 project。用引導整一張地圖，或者撳上面嘅「新增 project」，自己加地圖入去。",
            "Project 會記住一個世界嘅地圖同設定，等你再算圖嗰陣唔使再問一次，而呢部電腦知道嘅 {scanned} 個世界之中，仲未有一個帶住 project。用引導整一張地圖，或者撳上面嘅「新增 project」，自己加地圖入去。",
            "Project 會記住一個世界嘅地圖同設定，等你下次算圖唔使再畀佢問多次，而呢部電腦知道嘅 {scanned} 個世界，一個都未帶住 project。用引導整張地圖，或者撳上面嘅「新增 project」，自己加地圖入去。",
            "Project 會記住一個世界嘅地圖同設定，等你下次算圖唔使再畀佢問多次，而呢部電腦知道嘅 {scanned} 個世界，連一個都未帶住 project，空得幾乾淨。用引導整張地圖，或者撳上面嘅「新增 project」，自己動手加地圖入去。",
        ],
    },
    "project.list.noMatch": {
        en: [
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
            "Nothing here matches that search, and nothing was removed either. Clear it and the whole list comes right back.",
            "Nothing here matches that search, not even close, and nothing was removed, not one project. Clear it and the whole list strolls right back in.",
        ],
        yue: [
            "冇嘢符合呢個搜尋。清空就會見返成個清單；乜都冇刪走。",
            "冇嘢符合呢個搜尋。清空就會見返成個清單；乜都冇刪走。",
            "冇嘢符合呢個搜尋。清空搜尋就會見返成個清單；呢度乜都冇刪走。",
            "冇嘢符合呢個搜尋，亦都乜都冇刪走。清空佢，成個清單即刻返嚟。",
            "冇嘢符合呢個搜尋，一個 project 都冇少過，乜都冇刪走。清空佢，成個清單就大搖大擺咁返返嚟。",
        ],
    },
    "project.list.deleteWorldNote": {
        en: [
            "The Minecraft world itself is not touched. Only this settings file inside it is removed.",
            "The Minecraft world itself is not touched. Only this settings file inside it is removed.",
            "The Minecraft world itself is not touched. Only this settings file inside it is removed.",
            "The Minecraft world itself is not touched, not even slightly. Only this one settings file inside it goes.",
            "The Minecraft world itself is not touched at all, not so much as a byte. Only this one small settings file living inside it is the thing that goes.",
        ],
        yue: [
            "Minecraft 世界本身唔會被郁到，只會移除入面呢個設定檔案。",
            "Minecraft 世界本身唔會被郁到，只會移除入面呢個設定檔案。",
            "Minecraft 世界本身唔會被郁到，只係入面呢個設定檔案會被移除。",
            "Minecraft 世界本身一啲都唔會被郁到，走嘅淨係入面呢一個設定檔案。",
            "Minecraft 世界本身唔會被郁到，一根手指都冇畀人郁過，走嘅淨係住喺入面嗰個細細個設定檔案。",
        ],
    },
    "project.list.deleteTilesNote": {
        en: [
            "Tiles that were already rendered stay on the disk. Nothing here deletes them, so the space is not coming back either.",
            "Tiles that were already rendered stay on the disk. Nothing here deletes them, so the space is not coming back either.",
            "Tiles that were already rendered stay on the disk. Nothing here deletes them, so the space is not coming back either.",
            "Tiles already rendered stay right where they are on disk. Nothing here touches them, so the disk space is not coming back either.",
            "Tiles already rendered stay right where they are on disk, completely unbothered. Nothing here so much as touches them, so the space is not coming back either, however badly you want it to.",
        ],
        yue: [
            "已經算好嘅圖磚照樣留喺磁碟。呢度唔會刪佢哋，所以空間都唔會返嚟。",
            "已經算好嘅圖磚照樣留喺磁碟。呢度唔會刪佢哋，所以空間都唔會返嚟。",
            "已經算好嘅圖磚照樣留喺磁碟。呢度冇刪除佢哋，所以空間亦都唔會返嚟。",
            "已經算好嘅圖磚照舊留喺磁碟，呢度冇郁過佢哋，所以磁碟空間都唔會自己返嚟。",
            "已經算好嘅圖磚照舊安坐喺磁碟，一隻都冇畀人動過。呢度連一隻都冇刪，所以你想攞返嘅磁碟空間，都係唔會返嚟。",
        ],
    },
    "project.list.deleteSettingsNote": {
        en: [
            "Every map, storage and setting this project held goes with it. There is no history behind this list to put it back.",
            "Every map, storage and setting this project held goes with it. There is no history behind this list to put it back.",
            "Every map, storage and setting this project held goes with it. There is no history behind this list to put it back.",
            "Every map, storage and setting this project ever held goes with it. There is no history behind this list that could bring it back.",
            "Every map, storage and setting this project ever held goes down with it, all at once. There is no history sitting behind this list that could ever bring it back.",
        ],
        yue: [
            "呢個 project 有嘅每一張地圖、每個儲存空間同每項設定都會一齊消失。呢個清單背後冇歷史可以攞返。",
            "呢個 project 有嘅每一張地圖、每個儲存空間同每項設定都會一齊消失。呢個清單背後冇歷史可以攞返。",
            "呢個 project 有過嘅每一張地圖、每個儲存空間同每項設定都會一齊消失。呢個清單背後冇歷史紀錄可以攞返。",
            "呢個 project 曾經有嘅每一張地圖、每個儲存空間同每項設定，全部一齊陪葬。呢個清單背後冇歷史紀錄可以攞返嚟。",
            "呢個 project 曾經有過嘅每一張地圖、每個儲存空間同每項設定，會齊齊一鑊熟。呢個清單背後從來冇歷史紀錄呢回事，攞都冇得攞返。",
        ],
    },
    "project.list.exported": {
        en: [
            "Wrote {count} projects to {name}.",
            "Wrote {count} projects to {name}.",
            "Wrote {count} projects to {name}.",
            "{count} projects written out to {name}.",
            "{count} projects, safely written out to {name}, ready to be somebody else's spreadsheet problem.",
        ],
        yue: [
            "已將 {count} 個 project 寫入 {name}。",
            "已將 {count} 個 project 寫入 {name}。",
            "已經將 {count} 個 project 寫入 {name}。",
            "{count} 個 project 已經寫落 {name}。",
            "{count} 個 project 穩穩陣陣寫咗落 {name}，之後係咪要開試算表就隨得你。",
        ],
    },
    "project.list.exportedClipboard": {
        en: [
            "Copied {count} projects to the clipboard.",
            "Copied {count} projects to the clipboard.",
            "Copied {count} projects to the clipboard.",
            "{count} projects copied to the clipboard, ready to paste.",
            "{count} projects copied to the clipboard, sitting there ready for the first Ctrl+V that comes along.",
        ],
        yue: [
            "已將 {count} 個 project 複製到剪貼簿。",
            "已將 {count} 個 project 複製到剪貼簿。",
            "已經將 {count} 個 project 複製到剪貼簿。",
            "{count} 個 project 已經複製咗去剪貼簿，隨時貼得。",
            "{count} 個 project 已經複製咗去剪貼簿，喺度乖乖等緊第一下 Ctrl+V。",
        ],
    },
    "project.list.exportFailed": {
        en: [
            "Could not write the export, and could not reach the clipboard either.",
            "Could not write the export, and could not reach the clipboard either.",
            "Could not write the export, and could not reach the clipboard either.",
            "The export could not be written, and the clipboard would not answer either.",
            "The export refused to write, and the clipboard would not even pick up. Neither route worked, so nothing left this screen.",
        ],
        yue: [
            "寫唔到匯出檔案，亦都用唔到剪貼簿。",
            "寫唔到匯出檔案，亦都用唔到剪貼簿。",
            "寫唔到匯出檔案，連剪貼簿都用唔到。",
            "匯出檔案寫唔到，剪貼簿又冇反應。",
            "匯出檔案死都寫唔出嚟，剪貼簿仲要唔應機。兩條路都行唔通，所以乜都冇出到呢個畫面。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectMapsPanel.vue: the list, the create form, identity and the */
    /* delete gate                                                       */
    /* ---------------------------------------------------------------- */

    "project.maps.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed here.",
            "That pattern is not valid, so nothing is listed. Every map is still in this project either way.",
            "That pattern is not valid, so nothing is listed, though every map is still sitting right here in this project, unbothered by the syntax error.",
        ],
        yue: [
            "呢個 pattern 唔啱，所以乜都冇列出。",
            "呢個 pattern 唔啱，所以乜都冇列出。",
            "呢個 pattern 唔啱，所以呢度乜都冇列出。",
            "嗰個 pattern 唔啱，所以乜都冇列出。所有地圖其實都仲喺呢個 project 度。",
            "嗰個 pattern 唔啱，所以乜都冇列出，不過所有地圖一個都冇走雞，仍然穩陣咁喺呢個 project 度，完全唔理個語法錯誤。",
        ],
    },
    "project.maps.renamed": {
        en: [
            "The map id is now {to}. Tiles already rendered under {from} stay where they are; nothing here moves or deletes them.",
            "The map id is now {to}. Tiles already rendered under {from} stay where they are; nothing here moves or deletes them.",
            "The map id is now {to}. Tiles already rendered under {from} stay exactly where they are; nothing here moves or deletes them.",
            "The map id is {to} now. Tiles already rendered under {from} are staying put; nothing here moves or deletes a single one of them.",
            "The map id is {to} now, plain and simple. Tiles already rendered under {from} are staying put like they own the place; nothing here moves or deletes a single one of them, cross its little pixelated heart.",
        ],
        yue: [
            "張地圖嘅 id 而家係 {to}。喺 {from} 底下已經算好嘅圖磚會留喺原位；呢度唔會移動或者刪除佢哋。",
            "張地圖嘅 id 而家係 {to}。喺 {from} 底下已經算好嘅圖磚會留喺原位；呢度唔會移動或者刪除佢哋。",
            "張地圖嘅 id 而家改咗做 {to}。喺 {from} 底下已經算好嘅圖磚仍然留喺原位；呢度唔會移動或者刪除佢哋。",
            "張地圖嘅 id 而家係 {to} 喇。喺 {from} 底下已經算好嘅圖磚照舊留喺原位；呢度一個都唔會移動或者刪除。",
            "張地圖嘅 id 而家正式叫 {to} 喇，就係咁簡單。喺 {from} 底下已經算好嘅圖磚照舊霸住原位唔郁；呢度一個都唔會移動或者刪除，講得出做得到。",
        ],
    },
    "project.maps.added": {
        en: [
            "Added the map {id}, written from BlueMap's own template so every setting arrives explained. Nothing is on disk until the project is saved.",
            "Added the map {id}, written from BlueMap's own template so every setting arrives explained. Nothing is on disk until the project is saved.",
            "Added the map {id}, written from BlueMap's own template so every setting arrives already explained. Nothing is on disk until the project is saved.",
            "The map {id} is added, written straight from BlueMap's own template so every setting turns up already explained. Nothing lands on disk until the project is saved.",
            "The map {id} has joined the project, freshly stamped out of BlueMap's own template so every setting shows up pre-explained like a good little manual. Nothing lands on disk until the project is saved, so no pressure yet.",
        ],
        yue: [
            "已經加咗地圖 {id}，係由 BlueMap 自己嘅範本寫出嚟，所以每項設定都已經解釋好。喺 project 儲存之前，磁碟度乜都未有。",
            "已經加咗地圖 {id}，係由 BlueMap 自己嘅範本寫出嚟，所以每項設定都已經解釋好。喺 project 儲存之前，磁碟度乜都未有。",
            "已經加咗地圖 {id}，係由 BlueMap 自己嘅範本寫出嚟嘅，所以每項設定都已經解釋好。喺 project 儲存之前，磁碟度乜都未有。",
            "地圖 {id} 加咗喇，直接由 BlueMap 自己嘅範本印出嚟，所以每項設定一出場就已經解釋好晒。喺 project 儲存之前，磁碟度都仲係乜都未有。",
            "地圖 {id} 正式加入咗呢個 project，由 BlueMap 自己個範本新鮮出爐，每項設定一出場就已經解釋到明明白白，好似有個貼心說明書。喺 project 儲存之前，磁碟度都仲係乜都未有，未使咁緊張。",
        ],
    },
    /*
     * The guided empty state a beginner is as likely to land on as the wizard: it has to
     * teach what a map even is before "add one" means anything. Two facts are pinned rather
     * than one -- that there are no maps yet, and that a map is one dimension of the world --
     * because the second is the whole reason "add one" is the obvious next step rather than
     * a mystery button.
     */
    "project.maps.none": {
        en: [
            "A map renders one dimension of this world with its own look and settings. This project has no maps yet, so add one below to say what gets rendered.",
            "A map renders one dimension of this world with its own look and settings. This project has no maps yet, so add one below to say what gets rendered.",
            "A map renders one dimension of this world with its own look and settings, and this project has no maps yet, not a single one. Add one below to say what gets rendered.",
            "A map is one dimension of this world, rendered with its own look and settings, and this project has no maps yet, not even one. Add a map below and finally say what gets rendered.",
            "A map is one dimension of this world, rendered with its own look and settings, and this project has no maps yet, not even a tiny one. Add a map below and finally tell it what deserves to be rendered.",
        ],
        yue: [
            "一張地圖代表呢個世界嘅一個維度，有自己嘅畫面同設定。呢個 project 而家未有地圖，喺下面加一張，話俾佢知要算咩。",
            "一張地圖代表呢個世界嘅一個維度，有自己嘅畫面同設定。呢個 project 而家未有地圖，喺下面加一張，話俾佢知要算咩。",
            "一張地圖代表呢個世界嘅一個維度，有自己嘅畫面同設定，而呢個 project 而家未有地圖，一張都冇。喺下面加一張，話俾佢知要算咩。",
            "一張地圖即係呢個世界嘅一個維度，連埋自己嘅畫面同設定嗰種。呢個 project 而家未有地圖，一張都未有。喺下面加一張，正式話俾佢知要算咩。",
            "一張地圖即係呢個世界嘅一個維度，連埋自己嘅畫面同設定嗰種。呢個 project 而家未有地圖，淨返一片空氣。喺下面加一張，終於可以話俾佢知要算咩。",
        ],
    },
    "project.maps.noMatch": {
        en: [
            "No map matches that search.",
            "No map matches that search.",
            "No map matches that search here.",
            "No map matches that search, not one.",
            "No map matches that search, not a single pixel of one.",
        ],
        yue: [
            "冇地圖符合呢個搜尋。",
            "冇地圖符合呢個搜尋。",
            "呢度冇地圖符合呢個搜尋。",
            "冇一張地圖符合呢個搜尋，一張都冇。",
            "冇一張地圖肯符合呢個搜尋，一粒像素都冇。",
        ],
    },
    "project.maps.idPreviewEmpty": {
        en: [
            "Type a name and the id appears here.",
            "Type a name and the id appears here.",
            "Type a name, and the id appears here.",
            "Type a name first, and the id appears here right away.",
            "Type a name first, and like magic, the id appears here before you can blink.",
        ],
        yue: [
            "打個名，個 id 就會喺呢度出現。",
            "打個名，個 id 就會喺呢度出現。",
            "打個名，個 id 就會即刻喺呢度出現。",
            "打個名先，個 id 馬上就會喺呢度出現。",
            "打個名先，個 id 就好似變魔術咁，眨吓眼就喺呢度出現。",
        ],
    },
    "project.maps.idPreviewNew": {
        en: [
            "Becomes the folder and the address segment {id}.",
            "Becomes the folder and the address segment {id}.",
            "Becomes the folder and the address segment {id}, once it is added.",
            "This becomes the folder name and the address segment {id} the moment it is added.",
            "This turns into the folder name and the address segment {id} the moment it is born into the project, no ceremony required.",
        ],
        yue: [
            "會變成資料夾名同地址段 {id}。",
            "會變成資料夾名同地址段 {id}。",
            "一加咗，就會變成資料夾名同地址段 {id}。",
            "一加落去，即刻就會變成資料夾名同地址段 {id}。",
            "一出世加入呢個 project，即刻就會變成資料夾名同地址段 {id}，唔使乜儀式。",
        ],
    },
    "project.maps.idPreview": {
        en: [
            "Becomes the folder and the address segment {id}.",
            "Becomes the folder and the address segment {id}.",
            "Becomes the folder and the address segment {id} once applied.",
            "This is what the folder name and the address segment become once you apply it: {id}.",
            "This is what the folder name and the address segment turn into the second you hit apply: {id}, no take-backs.",
        ],
        yue: [
            "會變成資料夾名同地址段 {id}。",
            "會變成資料夾名同地址段 {id}。",
            "一應用咗，就會變成資料夾名同地址段 {id}。",
            "一撳應用，資料夾名同地址段即刻就會變成 {id}。",
            "一撳應用，資料夾名同地址段即刻就會變成 {id}，冇得返轉頭。",
        ],
    },
    "project.maps.templateNote": {
        en: [
            "The map is written from BlueMap's own template for that dimension, so it arrives with every setting explained in place. Every one of them is editable here before anything renders.",
            "The map is written from BlueMap's own template for that dimension, so it arrives with every setting explained in place. Every one of them is editable here before anything renders.",
            "The map is written from BlueMap's own template for that dimension, so it arrives with every setting already explained in place. Every one of them is editable here before anything renders.",
            "The map gets written straight from BlueMap's own template for that dimension, arriving with every setting already explained. Every one of them stays editable here before anything renders.",
            "The map gets stamped out of BlueMap's own template for that dimension, arriving fully explained down to the last setting. Every one of them stays editable right here, long before anything actually renders.",
        ],
        yue: [
            "呢張地圖係由 BlueMap 自己個維度範本寫出嚟嘅，所以一到手每項設定都已經解釋好。每一項喺呢度都可以編輯，改完先算圖。",
            "呢張地圖係由 BlueMap 自己個維度範本寫出嚟嘅，所以一到手每項設定都已經解釋好。每一項喺呢度都可以編輯，改完先算圖。",
            "呢張地圖係由 BlueMap 自己個維度範本寫出嚟，一到手每項設定都已經解釋好晒。每一項喺呢度都可以編輯，改完先算圖。",
            "呢張地圖直接由 BlueMap 自己個維度範本印出嚟，一到手每項設定就已經解釋好晒。每一項喺呢度都照樣可以編輯，改完先至算圖。",
            "呢張地圖由 BlueMap 自己個維度範本新鮮出爐，一到手就已經解釋到明明白白，一項都冇漏低。每一項喺呢度依然可以編輯，改完先至真係算圖。",
        ],
    },
    "project.maps.sortingHint": {
        en: [
            "Lower sorts first in the web app's map list.",
            "Lower sorts first in the web app's map list.",
            "Lower sorts first in the web app's map list; higher sorts later.",
            "Lower numbers sort first in the web app's map list, no exceptions.",
            "Lower numbers shove their way to the front of the web app's map list; higher numbers wait their turn.",
        ],
        yue: [
            "數字細嘅會喺網頁程式嘅地圖清單排先。",
            "數字細嘅會喺網頁程式嘅地圖清單排先。",
            "數字細嘅會喺網頁程式嘅地圖清單排先，大嘅排後。",
            "數字細嘅一定喺網頁程式嘅地圖清單排先，冇得拗。",
            "數字細嘅會恃住自己細，插隊插到網頁程式嘅地圖清單最前面，大嘅唯有排隊等。",
        ],
    },
    "project.maps.deleteAction": {
        en: [
            "This removes the map {id} and every setting it holds from this project when you save. It cannot be undone from here.",
            "This removes the map {id} and every setting it holds from this project when you save. It cannot be undone from here.",
            "This removes the map {id} and every setting it holds from this project when you save. It cannot be undone from here.",
            "This takes the map {id}, and every setting it holds, out of the project the moment you save. It cannot be undone from here.",
            "This shows the map {id} the door, taking every setting it holds along with it the moment you save. It cannot be undone from here, so choose wisely.",
        ],
        yue: [
            "呢個操作會喺你儲存嗰陣，由呢個 project 移除地圖 {id} 同佢所有設定。喺呢度冇得復原。",
            "呢個操作會喺你儲存嗰陣，由呢個 project 移除地圖 {id} 同佢所有設定。喺呢度冇得復原。",
            "呢個操作會喺你儲存嗰陣，由呢個 project 移除地圖 {id} 同埋佢所有設定。喺呢度冇得復原。",
            "一儲存，就會由呢個 project 請走地圖 {id}，連埋佢所有設定一齊走。喺呢度冇得復原。",
            "一儲存，就會由呢個 project 直接請走地圖 {id}，連埋佢所有設定一齊執包袱。喺呢度冇得復原，諗清楚先好郁手。",
        ],
    },
    "project.maps.formSubtitle": {
        en: [
            "Map {id}. Everything BlueMap reads about this map lives in this one file, and all of it can be set before a render starts.",
            "Map {id}. Everything BlueMap reads about this map lives in this one file, and all of it can be set before a render starts.",
            "Map {id}. Everything BlueMap reads about this map lives in this one file, and every bit of it can be set before a render starts.",
            "Map {id}. Everything BlueMap reads about this map lives in this one file, all of it adjustable before a render starts.",
            "Map {id}. Everything BlueMap will ever read about this map lives in this one file, every last setting adjustable long before a render starts.",
        ],
        yue: [
            "地圖 {id}。BlueMap 對呢張地圖識嘅每一件事，都住喺呢一個檔案入面，喺算圖之前全部都可以設定。",
            "地圖 {id}。BlueMap 對呢張地圖識嘅每一件事，都住喺呢一個檔案入面，喺算圖之前全部都可以設定。",
            "地圖 {id}。BlueMap 對呢張地圖識嘅每一件事，都住喺呢一個檔案入面，算圖之前每一項都可以設定。",
            "地圖 {id}。BlueMap 對呢張地圖識嘅嘢，通通都住喺呢一個檔案入面，算圖之前每一粒設定都可以郁得。",
            "地圖 {id}。BlueMap 對呢張地圖識嘅嘢，一件都冇走雞，通通都住喺呢一個檔案入面，算圖之前，每一粒設定都由得你郁，早到不得了。",
        ],
    },
    "project.maps.pick": {
        en: [
            "Pick a map on the left, or add one.",
            "Pick a map on the left, or add one.",
            "Pick a map on the left, or add one instead.",
            "Pick a map on the left, or just add one.",
            "Pick a map on the left, or go wild and add one.",
        ],
        yue: [
            "喺左邊揀一張地圖，或者新增一張。",
            "喺左邊揀一張地圖，或者新增一張。",
            "喺左邊揀一張地圖，又或者新增一張。",
            "喺左邊揀一張地圖，唔係就直接新增一張。",
            "喺左邊揀一張地圖，或者豪爽啲，新增一張啦。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectStoragesPanel.vue: the list, type switching, the create    */
    /* form and the delete gate                                          */
    /* ---------------------------------------------------------------- */

    "project.storages.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed here.",
            "That pattern is not valid, so nothing is listed. Every storage is still in this project either way.",
            "That pattern is not valid, so nothing is listed, though every storage is still sitting right here in this project, unbothered by the syntax error.",
        ],
        yue: [
            "呢個 pattern 唔啱，所以乜都冇列出。",
            "呢個 pattern 唔啱，所以乜都冇列出。",
            "呢個 pattern 唔啱，所以呢度乜都冇列出。",
            "嗰個 pattern 唔啱，所以乜都冇列出。所有儲存空間其實都仲喺呢個 project 度。",
            "嗰個 pattern 唔啱，所以乜都冇列出，不過所有儲存空間一個都冇走雞，仍然穩陣咁喺呢個 project 度，完全唔理個語法錯誤。",
        ],
    },
    "project.storages.switchedSql": {
        en: [
            "This storage is now a database one. Its user name and password do not belong in a project file, so put them in the app's own config folder.",
            "This storage is now a database one. Its user name and password do not belong in a project file, so put them in the app's own config folder.",
            "This storage is now a database one. Its user name and password do not belong in a project file, so keep them in the app's own config folder.",
            "This storage is now a database one. Its user name and password have no business in a project file, so they belong in the app's own config folder.",
            "This storage has gone full database. Its user name and password absolutely do not belong in a project file, so send them to live in the app's own config folder where they are safe.",
        ],
        yue: [
            "呢個儲存空間而家係資料庫嘅。佢嘅用戶名同密碼唔應該擺喺 project 檔案入面，要放喺程式自己嘅 config 資料夾。",
            "呢個儲存空間而家係資料庫嘅。佢嘅用戶名同密碼唔應該擺喺 project 檔案入面，要放喺程式自己嘅 config 資料夾。",
            "呢個儲存空間而家改成資料庫嘅。佢嘅用戶名同密碼唔應該擺喺 project 檔案入面，要放喺程式自己嘅 config 資料夾。",
            "呢個儲存空間而家正式變咗資料庫。用戶名同密碼呢啲嘢，冇資格擺喺 project 檔案入面，要送去程式自己嘅 config 資料夾。",
            "呢個儲存空間而家徹底轉咗做資料庫。用戶名同密碼呢啲寶貝，絕對唔應該擺喺 project 檔案入面，要送去程式自己嘅 config 資料夾安享晚年。",
        ],
    },
    "project.storages.switchedFile": {
        en: [
            "This storage now writes tiles into a folder.",
            "This storage now writes tiles into a folder.",
            "This storage now writes tiles into a folder, plain and simple.",
            "This storage writes tiles into a folder now, nothing fancier than that.",
            "This storage writes tiles into a folder now, an honest, dependable, thoroughly unglamorous folder.",
        ],
        yue: [
            "呢個儲存空間而家會將圖磚寫入資料夾。",
            "呢個儲存空間而家會將圖磚寫入資料夾。",
            "呢個儲存空間而家會將圖磚寫入資料夾，簡簡單單。",
            "呢個儲存空間而家淨係將圖磚寫入資料夾，冇乜特別。",
            "呢個儲存空間而家老老實實將圖磚寫入一個平平無奇嘅資料夾。",
        ],
    },
    "project.storages.added": {
        en: [
            "Added the storage {id}. It is written when you save.",
            "Added the storage {id}. It is written when you save.",
            "Added the storage {id}. It is written when you save.",
            "The storage {id} is added. It is written when you save.",
            "The storage {id} has joined the project. It is written when you save, not a moment before.",
        ],
        yue: [
            "已經加咗儲存空間 {id}。儲存嗰陣先會寫入。",
            "已經加咗儲存空間 {id}。儲存嗰陣先會寫入。",
            "已經加咗儲存空間 {id}。儲存嗰陣先會寫入。",
            "儲存空間 {id} 加咗喇。儲存嗰陣先會寫入。",
            "儲存空間 {id} 加入咗呢個 project。儲存嗰陣先會寫入，一秒都唔會早。",
        ],
    },
    "project.storages.deleteStorage": {
        en: [
            "The storage {id} and every setting in it.",
            "The storage {id} and every setting in it.",
            "The storage {id}, and every setting in it.",
            "The storage {id}, taking every setting in it along.",
            "The storage {id}, dragging every setting in it out the door right along with it.",
        ],
        yue: [
            "儲存空間 {id}，同埋佢入面每一項設定。",
            "儲存空間 {id}，同埋佢入面每一項設定。",
            "儲存空間 {id}，連埋佢入面每一項設定。",
            "儲存空間 {id}，連埋佢入面每一項設定都一齊走。",
            "儲存空間 {id}，連埋佢入面每一項設定都一齊執包袱走人。",
        ],
    },
    "project.storages.deleteUsed": {
        en: [
            "These maps still name it and would have nowhere to write: {maps}. Point them somewhere else first.",
            "These maps still name it and would have nowhere to write: {maps}. Point them somewhere else first.",
            "These maps still name it and would have nowhere to write: {maps}. Point them somewhere else first.",
            "These maps still name it, and removing it leaves them with nowhere to write: {maps}. Point them somewhere else first.",
            "These maps still name it, and yanking it out leaves them with absolutely nowhere to write: {maps}. Point them somewhere else first, before chaos ensues.",
        ],
        yue: [
            "呢啲地圖仲叫緊佢，冇咗佢就冇地方寫：{maps}。要先指去第度。",
            "呢啲地圖仲叫緊佢，冇咗佢就冇地方寫：{maps}。要先指去第度。",
            "呢啲地圖仲叫緊佢，冇咗佢就冇地方寫喇：{maps}。要先指去第度。",
            "呢啲地圖仲叫緊佢，一刪走佢，佢哋就即刻冇地方寫：{maps}。要先指去第度。",
            "呢啲地圖仲死死氣叫緊佢，一拉走佢，佢哋就即刻冇地方寫喇：{maps}。快啲指去第度，唔係就亂晒龍。",
        ],
    },
    "project.storages.deleted": {
        en: [
            "The storage {id} is out of this project.",
            "The storage {id} is out of this project.",
            "The storage {id} is out of this project now.",
            "The storage {id} is officially out of this project.",
            "The storage {id} has been shown the door and is out of this project for good.",
        ],
        yue: [
            "儲存空間 {id} 已經唔喺呢個 project 入面。",
            "儲存空間 {id} 已經唔喺呢個 project 入面。",
            "儲存空間 {id} 而家已經唔喺呢個 project 入面。",
            "儲存空間 {id} 正式唔喺呢個 project 入面。",
            "儲存空間 {id} 已經俾人請走，唔喺呢個 project 入面，仲要係永久嗰種。",
        ],
    },
    /*
     * "Storage" is jargon this project cannot avoid saying, so the first clause defines it
     * in beginner terms -- where rendered tiles are written -- before the sentence gets to
     * what happens without one. That definition is pinned alongside the two facts the
     * original already protected: no storage of its own, and the fallback folder.
     */
    "project.storages.none": {
        en: [
            "A storage is where rendered tiles are written, a folder on disk or a database. This project names no storage of its own, so its maps write into the folder the app renders into. Add one below to send them somewhere else.",
            "A storage is where rendered tiles are written, a folder on disk or a database. This project names no storage of its own, so its maps write into the folder the app renders into. Add one below to send them somewhere else.",
            "A storage is where rendered tiles are written, a folder on disk or a database. This project names no storage of its own, so its maps write into the folder the app renders into. Add one below to send them somewhere else.",
            "A storage is where rendered tiles are written, a folder on disk or a database, and this project names no storage of its own yet, so its maps write into the folder the app renders into by default. Add one below to send them somewhere else.",
            "A storage is where rendered tiles are written, a folder on disk or a database, and this project names no storage of its own yet, so its maps default to writing into the folder the app renders into. Add one below and finally send them somewhere else.",
        ],
        yue: [
            "儲存空間即係算好嘅圖磚寫落嘅地方，可以係磁碟上面嘅一個資料夾，又或者一個資料庫。呢個 project 未有自己嘅儲存空間，所以佢啲地圖會寫入程式算圖嘅資料夾。喺下面加一個，就可以送去第度。",
            "儲存空間即係算好嘅圖磚寫落嘅地方，可以係磁碟上面嘅一個資料夾，又或者一個資料庫。呢個 project 未有自己嘅儲存空間，所以佢啲地圖會寫入程式算圖嘅資料夾。喺下面加一個，就可以送去第度。",
            "儲存空間即係算好嘅圖磚寫落嘅地方，可以係磁碟上面嘅一個資料夾，又或者一個資料庫。呢個 project 仲未有自己嘅儲存空間，所以佢啲地圖會寫入程式算圖嘅資料夾。喺下面加一個，就可以送去第度。",
            "儲存空間即係算好嘅圖磚寫落嘅地方，可以係磁碟上面嘅一個資料夾，又或者一個資料庫，而呢個 project 仲未有自己嘅儲存空間，佢啲地圖預設就會寫入程式算圖嘅資料夾。喺下面加一個，正式送去第度。",
            "儲存空間即係算好嘅圖磚寫落嘅地方，可以係磁碟上面嘅一個資料夾，又或者一個資料庫，而呢個 project 仲未有自己嘅儲存空間，佢啲地圖預設就會乖乖寫入程式算圖嘅資料夾。喺下面加一個，終於可以送去第度。",
        ],
    },
    "project.storages.noMatch": {
        en: [
            "No storage matches that search.",
            "No storage matches that search.",
            "No storage matches that search here.",
            "No storage matches that search, not one.",
            "No storage matches that search, not a single byte of one.",
        ],
        yue: [
            "冇儲存空間符合呢個搜尋。",
            "冇儲存空間符合呢個搜尋。",
            "呢度冇儲存空間符合呢個搜尋。",
            "冇一個儲存空間符合呢個搜尋，一個都冇。",
            "冇一個儲存空間肯符合呢個搜尋，一個位元組都冇。",
        ],
    },
    "project.storages.newNote": {
        en: [
            "It is written from BlueMap's own template, so every setting arrives explained. A database storage keeps its user name and password in the app's config folder, never in this file.",
            "It is written from BlueMap's own template, so every setting arrives explained. A database storage keeps its user name and password in the app's config folder, never in this file.",
            "It is written from BlueMap's own template, so every setting arrives already explained. A database storage keeps its user name and password in the app's config folder, never in this file.",
            "It gets written straight from BlueMap's own template, so every setting turns up already explained. A database storage keeps its user name and password in the app's config folder, never in this file.",
            "It gets stamped fresh out of BlueMap's own template, so every setting shows up pre-explained. A database storage keeps its user name and password safely in the app's config folder, never in this file, not even once.",
        ],
        yue: [
            "佢係由 BlueMap 自己嘅範本寫出嚟，所以每項設定都已經解釋好。資料庫儲存空間嘅用戶名同密碼會擺喺程式嘅 config 資料夾，唔會擺喺呢個檔案入面。",
            "佢係由 BlueMap 自己嘅範本寫出嚟，所以每項設定都已經解釋好。資料庫儲存空間嘅用戶名同密碼會擺喺程式嘅 config 資料夾，唔會擺喺呢個檔案入面。",
            "佢係由 BlueMap 自己嘅範本寫出嚟嘅，所以每項設定都已經解釋好。資料庫儲存空間嘅用戶名同密碼會擺喺程式嘅 config 資料夾，唔會擺喺呢個檔案入面。",
            "佢直接由 BlueMap 自己嘅範本印出嚟，所以每項設定一出場就已經解釋好晒。資料庫儲存空間嘅用戶名同密碼安安樂樂擺喺程式嘅 config 資料夾，唔會擺喺呢個檔案入面。",
            "佢由 BlueMap 自己嘅範本新鮮出爐，每項設定一出場就已經解釋到明明白白。資料庫儲存空間嘅用戶名同密碼穩穩陣陣擺喺程式嘅 config 資料夾，一次都唔會擺喺呢個檔案入面。",
        ],
    },
    "project.storages.credentialled": {
        en: [
            "This storage carries connection-properties, which is where a database user name and password live. A project file travels inside the world folder, so it refuses to hold one. Put this storage in the config folder the app keeps under its own data directory instead; the project will not save while it is here.",
            "This storage carries connection-properties, which is where a database user name and password live. A project file travels inside the world folder, so it refuses to hold one. Put this storage in the config folder the app keeps under its own data directory instead; the project will not save while it is here.",
            "This storage carries connection-properties, which is where a database user name and password live. A project file travels inside the world folder, so it refuses to hold one. Put this storage in the config folder the app keeps under its own data directory instead; the project will not save while it stays here.",
            "This storage is carrying connection-properties, which is exactly where a database user name and password live. A project file travels inside the world folder, so it flatly refuses to hold one. Put this storage in the config folder the app keeps under its own data directory instead; the project will not save while it stays here.",
            "This storage is smuggling connection-properties around, which is exactly where a database user name and password live, and a project file that travels inside the world folder wants absolutely nothing to do with that. Put this storage in the config folder the app keeps under its own data directory instead; the project will not save while it stays here, full stop.",
        ],
        yue: [
            "呢個儲存空間帶住 connection-properties，即係資料庫用戶名同密碼住嘅地方。Project 檔案會跟住世界資料夾一齊走，所以唔肯裝呢啲嘢。改為擺呢個儲存空間喺程式自己資料目錄底下嘅 config 資料夾；佢仲喺度嘅話，project 就唔會儲存。",
            "呢個儲存空間帶住 connection-properties，即係資料庫用戶名同密碼住嘅地方。Project 檔案會跟住世界資料夾一齊走，所以唔肯裝呢啲嘢。改為擺呢個儲存空間喺程式自己資料目錄底下嘅 config 資料夾；佢仲喺度嘅話，project 就唔會儲存。",
            "呢個儲存空間帶住 connection-properties，即係資料庫用戶名同密碼住嘅地方。Project 檔案會跟住世界資料夾一齊走，所以唔肯裝呢啲嘢。改為擺呢個儲存空間喺程式自己資料目錄底下嘅 config 資料夾；佢仲留喺度嘅話，project 就唔會儲存。",
            "呢個儲存空間帶住 connection-properties，正正就係資料庫用戶名同密碼住嘅地方。Project 檔案會跟住世界資料夾一齊走，所以死都唔肯裝呢啲嘢。改為擺呢個儲存空間喺程式自己資料目錄底下嘅 config 資料夾；佢仲賴喺度嘅話，project 就唔會儲存。",
            "呢個儲存空間偷偷帶住 connection-properties，正正就係資料庫用戶名同密碼住嘅地方，而跟住世界資料夾一齊走嘅 project 檔案，對呢啲嘢完全冇興趣。改為擺呢個儲存空間喺程式自己資料目錄底下嘅 config 資料夾；佢仲賴喺度嘅話，project 就係唔會儲存，講完。",
        ],
    },
    "project.storages.deleteAction": {
        en: [
            "This removes the storage {id} from this project when you save. It cannot be undone from here.",
            "This removes the storage {id} from this project when you save. It cannot be undone from here.",
            "This removes the storage {id} from this project when you save. It cannot be undone from here.",
            "This takes the storage {id} out of the project the moment you save. It cannot be undone from here.",
            "This shows the storage {id} the door the moment you save. It cannot be undone from here, so choose wisely.",
        ],
        yue: [
            "呢個操作會喺你儲存嗰陣，由呢個 project 移除儲存空間 {id}。喺呢度冇得復原。",
            "呢個操作會喺你儲存嗰陣，由呢個 project 移除儲存空間 {id}。喺呢度冇得復原。",
            "呢個操作會喺你儲存嗰陣，由呢個 project 移除儲存空間 {id}。喺呢度冇得復原。",
            "一儲存，就會由呢個 project 請走儲存空間 {id}。喺呢度冇得復原。",
            "一儲存，就會由呢個 project 直接請走儲存空間 {id}。喺呢度冇得復原，諗清楚先好郁手。",
        ],
    },
    "project.storages.formSubtitle": {
        en: [
            "Storage {id}. Maps in this project name it to say where their tiles go.",
            "Storage {id}. Maps in this project name it to say where their tiles go.",
            "Storage {id}. Maps in this project name it to say exactly where their tiles go.",
            "Storage {id}. This is where any map in this project can say its tiles go.",
            "Storage {id}. This is the address any map in this project can point to and say: this is where my tiles go.",
        ],
        yue: [
            "儲存空間 {id}。呢個 project 入面嘅地圖靠叫佢，話俾人知自己啲圖磚去邊。",
            "儲存空間 {id}。呢個 project 入面嘅地圖靠叫佢，話俾人知自己啲圖磚去邊。",
            "儲存空間 {id}。呢個 project 入面嘅地圖靠叫佢，準確話俾人知自己啲圖磚去邊。",
            "儲存空間 {id}。呢個 project 入面任何一張地圖，都可以指住佢話自己啲圖磚去邊。",
            "儲存空間 {id}。呢個 project 入面任何一張地圖，都可以指住佢自豪咁話：呢度就係我啲圖磚去嘅地方。",
        ],
    },
    "project.storages.pick": {
        en: [
            "Pick a storage on the left, or add one.",
            "Pick a storage on the left, or add one.",
            "Pick a storage on the left, or add one instead.",
            "Pick a storage on the left, or just add one.",
            "Pick a storage on the left, or go wild and add one.",
        ],
        yue: [
            "喺左邊揀一個儲存空間，或者新增一個。",
            "喺左邊揀一個儲存空間，或者新增一個。",
            "喺左邊揀一個儲存空間，又或者新增一個。",
            "喺左邊揀一個儲存空間，唔係就直接新增一個。",
            "喺左邊揀一個儲存空間，或者豪爽啲，新增一個啦。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectsScreen.vue: opening a project, starting one, forgetting   */
    /* one, and the render entry point                                   */
    /* ---------------------------------------------------------------- */

    "project.open.absent": {
        en: [
            "There is no project file in that world folder any more.",
            "There is no project file in that world folder any more.",
            "There is no project file in that world folder any more.",
            "There is no project file left in that world folder any more.",
            "There is no project file left in that world folder any more, not so much as a crumb of one.",
        ],
        yue: [
            "嗰個世界資料夾入面已經冇 project 檔案。",
            "嗰個世界資料夾入面已經冇 project 檔案。",
            "嗰個世界資料夾入面而家已經冇 project 檔案。",
            "嗰個世界資料夾入面已經完全冇 project 檔案。",
            "嗰個世界資料夾入面已經完全冇 project 檔案，連渣都冇留低。",
        ],
    },
    "project.open.tooNew": {
        en: [
            "That project was written by a newer version of this app (format {version}). Opening it here could silently drop the settings this build does not understand, so it is left alone. Update the app and try again.",
            "That project was written by a newer version of this app (format {version}). Opening it here could silently drop the settings this build does not understand, so it is left alone. Update the app and try again.",
            "That project was written by a newer version of this app (format {version}). Opening it here could silently drop the settings this build does not understand, so it is left alone. Update the app and try again.",
            "That project was written by a newer version of this app (format {version}). Opening it here risks silently dropping the settings this build cannot understand, so it stays untouched. Update the app and try again.",
            "That project was written by a newer, fancier version of this app (format {version}). Opening it here risks silently dropping every setting this build cannot understand, so it stays untouched, like a museum piece behind glass. Update the app and try again.",
        ],
        yue: [
            "嗰個 project 係用呢個程式更新嘅版本寫嘅（格式 {version}）。喺呢度打開，可能會靜靜雞漏低呢個版本睇唔明嘅設定，所以就由佢擺喺度唔郁。更新程式，再試多次。",
            "嗰個 project 係用呢個程式更新嘅版本寫嘅（格式 {version}）。喺呢度打開，可能會靜靜雞漏低呢個版本睇唔明嘅設定，所以就由佢擺喺度唔郁。更新程式，再試多次。",
            "嗰個 project 係用呢個程式更新嘅版本寫嘅（格式 {version}）。喺呢度打開，可能會靜靜雞漏低呢個版本睇唔明嘅設定，所以就由佢擺喺度唔郁。更新程式，再試多次。",
            "嗰個 project 係用一個仲後嘅程式版本寫嘅（格式 {version}）。喺呢度打開，隨時會靜靜雞漏低呢個版本睇唔明嘅設定，所以先由佢企定唔郁。更新程式，再試多次。",
            "嗰個 project 係用一個仲勁仲後嘅程式版本寫嘅（格式 {version}）。喺呢度打開，分分鐘會靜靜雞漏低呢個版本睇唔明嘅設定，所以先由佢好似博物館展品咁企定唔郁。更新程式，再試多次。",
        ],
    },
    "project.open.invalid": {
        en: [
            "That project file does not say what a project says: {problems}",
            "That project file does not say what a project says: {problems}",
            "That project file does not say what a project should say: {problems}",
            "That project file does not say what a real project file says: {problems}",
            "That project file flatly does not say what a project file is supposed to say: {problems}",
        ],
        yue: [
            "呢個 project 檔案唔似一個 project 應該講嘅嘢：{problems}",
            "呢個 project 檔案唔似一個 project 應該講嘅嘢：{problems}",
            "呢個 project 檔案唔似一個 project 應該講嘅嘢：{problems}",
            "呢個 project 檔案，講嘅嘢完全唔似一個真正嘅 project 檔案：{problems}",
            "呢個 project 檔案，講嘅嘢徹底唔似一個 project 檔案應該講嘅嘢：{problems}",
        ],
    },
    "project.open.notJson": {
        en: [
            "That project file is not readable as JSON: {message}",
            "That project file is not readable as JSON: {message}",
            "That project file is not readable as JSON: {message}",
            "That project file simply is not readable as JSON: {message}",
            "That project file is not readable as JSON, full stop: {message}",
        ],
        yue: [
            "呢個 project 檔案唔係讀得嘅 JSON：{message}",
            "呢個 project 檔案唔係讀得嘅 JSON：{message}",
            "呢個 project 檔案唔係讀得嘅 JSON：{message}",
            "呢個 project 檔案根本唔係讀得嘅 JSON：{message}",
            "呢個 project 檔案，講到明就係唔係讀得嘅 JSON：{message}",
        ],
    },
    "project.open.unreadable": {
        en: [
            "That project file could not be read.",
            "That project file could not be read.",
            "That project file could not be read.",
            "That project file simply could not be read.",
            "That project file could not be read, no matter how nicely we asked.",
        ],
        yue: [
            "呢個 project 檔案讀唔到。",
            "呢個 project 檔案讀唔到。",
            "呢個 project 檔案讀唔到。",
            "呢個 project 檔案就係讀唔到。",
            "呢個 project 檔案好聲好氣都讀唔到。",
        ],
    },
    "project.save.done": {
        en: [
            "Saved the project to {file}.",
            "Saved the project to {file}.",
            "Saved the project to {file}.",
            "The project is saved, written to {file}.",
            "Saved, sealed, delivered: the project now lives at {file}.",
        ],
        yue: [
            "已經將 project 儲存去 {file}。",
            "已經將 project 儲存去 {file}。",
            "已經將 project 儲存去 {file}。",
            "個 project 已經儲存好，寫入咗 {file}。",
            "儲存完成，密封交付：個 project 而家住喺 {file}。",
        ],
    },
    "project.create.needWorld": {
        en: [
            "Choose the world folder this project belongs to.",
            "Choose the world folder this project belongs to.",
            "Choose the world folder this project belongs to.",
            "Choose the world folder this project belongs to, and only that one.",
            "Choose the world folder this project actually calls home.",
        ],
        yue: [
            "揀個世界資料夾，話俾人知呢個 project 屬於邊個。",
            "揀個世界資料夾，話俾人知呢個 project 屬於邊個。",
            "揀個世界資料夾，話俾人知呢個 project 屬於邊個。",
            "揀個世界資料夾，淨係嗰個，話俾人知呢個 project 屬於邊個。",
            "揀個世界資料夾啦，嗰度先係呢個 project 真正嘅屋企。",
        ],
    },
    "project.create.relative": {
        en: [
            "That path is relative, so where it points depends on where the app was started. Use a full path.",
            "That path is relative, so where it points depends on where the app was started. Use a full path.",
            "That path is relative, so where it points depends on where the app was started. Use a full path.",
            "That path is relative, so where it actually points depends on where the app happened to start. Use a full path.",
            "That path is relative, which means where it points is basically a guessing game tied to where the app happened to start. Use a full path, always.",
        ],
        yue: [
            "嗰個路徑係相對路徑，指去邊要睇程式喺邊度開機。用完整路徑。",
            "嗰個路徑係相對路徑，指去邊要睇程式喺邊度開機。用完整路徑。",
            "嗰個路徑係相對路徑，指去邊要睇返程式喺邊度開機。用完整路徑。",
            "嗰個路徑淨係相對路徑，實際指去邊，完全睇程式嗰陣喺邊度開機。用完整路徑。",
            "嗰個路徑淨係相對路徑，指去邊基本上係估估吓，睇程式嗰陣啱啱喺邊度開機。用完整路徑，次次都係。",
        ],
    },
    "project.create.exists": {
        en: [
            "That world already has a project. Open it rather than starting a second one, because a world holds exactly one project file.",
            "That world already has a project. Open it rather than starting a second one, because a world holds exactly one project file.",
            "That world already has a project. Open it rather than starting a second one, because a world holds exactly one project file.",
            "That world already has a project. Open it instead of starting a second one, because a world holds exactly one project file, no exceptions.",
            "That world already has a project, thank you very much. Open it rather than starting a second one, because a world holds exactly one project file, and one is plenty.",
        ],
        yue: [
            "嗰個世界已經有 project。打開佢，唔使再開多個，因為一個世界淨係得一個 project 檔案。",
            "嗰個世界已經有 project。打開佢，唔使再開多個，因為一個世界淨係得一個 project 檔案。",
            "嗰個世界已經有 project 喇。打開佢，唔使再開多個，因為一個世界淨係得一個 project 檔案。",
            "嗰個世界已經有 project 喇，仲要淨係得一個。打開佢，唔使再開多個，因為一個世界淨係得一個 project 檔案，冇得拗。",
            "嗰個世界已經有 project 喇，唔該哂。打開佢，唔使再開多個，因為一個世界淨係得一個 project 檔案，一個就夠晒數。",
        ],
    },
    "project.create.started": {
        en: [
            "The project is open but not written yet. Add its maps, set anything you want, and save when it is ready.",
            "The project is open but not written yet. Add its maps, set anything you want, and save when it is ready.",
            "The project is open but not written yet. Add its maps, set anything you want, and save when it is ready.",
            "The project is open but not written yet, not until you say so. Add its maps, set anything you want, and save when it is ready.",
            "The project is open, sitting there in memory, but not written yet. Add its maps, tune whatever you like, and save when it is ready, whenever that may be.",
        ],
        yue: [
            "個 project 開咗，但仲未寫落去。加返啲地圖，想點設定就點設定，準備好就儲存。",
            "個 project 開咗，但仲未寫落去。加返啲地圖，想點設定就點設定，準備好就儲存。",
            "個 project 開咗，但仲未寫落去。加返啲地圖，想點設定就點設定，準備好就儲存。",
            "個 project 開咗，但仲未寫落去，未叫佢寫就唔會寫。加返啲地圖，想點設定就點設定，準備好就儲存。",
            "個 project 開咗，靜靜哋喺記憶體度坐緊，但仲未寫落去。加返啲地圖，想點郁就點郁，準備好就儲存，幾時得閒都得。",
        ],
    },
    "project.forget.done": {
        en: [
            "Removed {gone} project files. The worlds themselves are untouched.",
            "Removed {gone} project files. The worlds themselves are untouched.",
            "Removed {gone} project files. The worlds themselves are untouched.",
            "{gone} project files removed. The worlds themselves stay untouched.",
            "{gone} project files, gone. The worlds themselves remain completely untouched, not even a little worried.",
        ],
        yue: [
            "已經移除咗 {gone} 個 project 檔案。啲世界本身冇被郁過。",
            "已經移除咗 {gone} 個 project 檔案。啲世界本身冇被郁過。",
            "已經移除咗 {gone} 個 project 檔案。啲世界本身冇被郁過。",
            "{gone} 個 project 檔案已經移除。啲世界本身照樣冇被郁過。",
            "{gone} 個 project 檔案，走咗。啲世界本身完全冇被郁過，一啲都唔驚。",
        ],
    },
    "project.forget.failed": {
        en: [
            "This one was not removed: {failure}",
            "This one was not removed: {failure}",
            "This one was not removed: {failure}",
            "This one was not removed: {failure}",
            "This one was not removed, not for lack of trying: {failure}",
        ],
        yue: [
            "呢個冇被移除：{failure}",
            "呢個冇被移除：{failure}",
            "呢個冇被移除：{failure}",
            "呢個冇被移除：{failure}",
            "呢個冇被移除，唔係唔盡力：{failure}",
        ],
    },
    "project.render.consentMissing": {
        en: [
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, downloaded from Mojang. That download has not been accepted, so this render would stop before it started, simple as that.",
            "BlueMap builds every block from the Minecraft client files, fetched straight from Mojang. That download has not been accepted, so this render would grind to a halt and stop before it started.",
        ],
        yue: [
            "BlueMap 靠 Minecraft 客戶端檔案嚟砌啲方塊，呢啲檔案係由 Mojang 落嘅。嗰個下載仲未接受，所以呢次算圖未開始就會停。",
            "BlueMap 靠 Minecraft 客戶端檔案嚟砌啲方塊，呢啲檔案係由 Mojang 落嘅。嗰個下載仲未接受，所以呢次算圖未開始就會停。",
            "BlueMap 靠 Minecraft 客戶端檔案嚟砌啲方塊，呢啲檔案係由 Mojang 落嘅。嗰個下載仲未接受，所以呢次算圖未開始就會停。",
            "BlueMap 靠 Minecraft 客戶端檔案嚟砌每一嚿方塊，呢啲檔案係直接由 Mojang 落嘅。嗰個下載仲未接受，所以呢次算圖未開始就會停，就係咁簡單。",
            "BlueMap 靠 Minecraft 客戶端檔案嚟砌每一嚿方塊，呢啲檔案係直接由 Mojang 攞落嚟嘅。嗰個下載仲未接受，所以呢次算圖分分鐘未開始就會停。",
        ],
    },
    "project.render.noBridge": {
        en: [
            "This build cannot start a render. Local rendering needs the desktop app.",
            "This build cannot start a render. Local rendering needs the desktop app.",
            "This build cannot start a render. Local rendering needs the desktop app.",
            "This build cannot start a render on its own. Local rendering needs the desktop app.",
            "This build flatly cannot start a render. Local rendering needs the desktop app, full stop.",
        ],
        yue: [
            "呢個版本冇辦法開始算圖。本機算圖要用桌面程式。",
            "呢個版本冇辦法開始算圖。本機算圖要用桌面程式。",
            "呢個版本冇辦法開始算圖。本機算圖要用桌面程式。",
            "呢個版本自己一個冇辦法開始算圖。本機算圖要用桌面程式。",
            "呢個版本死都冇辦法開始算圖。本機算圖要用桌面程式，冇得拗。",
        ],
    },
    "project.create.blurb": {
        en: [
            "The project file is written at the root of the world folder you choose, so the world carries its own settings wherever it goes. Nothing is written until you save.",
            "The project file is written at the root of the world folder you choose, so the world carries its own settings wherever it goes. Nothing is written until you save.",
            "The project file is written at the root of the world folder you choose, so the world carries its own settings wherever it goes. Nothing is written until you save.",
            "The project file gets written at the root of the world folder you choose, so the world carries its own settings wherever it goes. Nothing is written until you save.",
            "The project file takes up residence right at the root of the world folder you choose, so the world carries its own settings wherever it wanders off to. Nothing is written until you save, not one byte.",
        ],
        yue: [
            "Project 檔案會寫喺你揀嘅世界資料夾嘅根目錄，所以個世界去到邊都帶住自己嘅設定。儲存之前乜都唔會寫入去。",
            "Project 檔案會寫喺你揀嘅世界資料夾嘅根目錄，所以個世界去到邊都帶住自己嘅設定。儲存之前乜都唔會寫入去。",
            "Project 檔案會寫喺你揀嘅世界資料夾嘅根目錄，所以個世界去到邊都帶住自己嘅設定。儲存之前乜都唔會寫入去。",
            "Project 檔案會落戶喺你揀嘅世界資料夾嘅根目錄，所以個世界去到邊都帶住自己嘅設定。儲存之前乜都唔會寫入去。",
            "Project 檔案會安家喺你揀嘅世界資料夾嘅根目錄，所以個世界流浪去邊都帶住自己嘅設定。儲存之前乜都唔會寫入去，一個位元組都唔會。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* projectModel.ts: the list row's secondary line. Not inside a      */
    /* .vue file, but still a real literal call site.                    */
    /* ---------------------------------------------------------------- */

    "project.row.world": {
        en: [
            "world {world}",
            "world {world}",
            "in world {world}",
            "living in world {world}",
            "making its home in world {world}",
        ],
        yue: [
            "世界 {world}",
            "世界 {world}",
            "喺世界 {world}",
            "住喺世界 {world}",
            "喺世界 {world} 安咗家",
        ],
    },
    "project.row.oneMap": {
        en: ["1 map", "1 map", "1 map", "just 1 map", "a grand total of 1 map"],
        yue: ["1 張地圖", "1 張地圖", "1 張地圖", "淨係 1 張地圖", "隆重登場，總共 1 張地圖"],
    },
    "project.row.maps": {
        en: [
            "{maps} maps",
            "{maps} maps",
            "{maps} maps",
            "{maps} maps and counting",
            "{maps} maps, proudly counted",
        ],
        yue: [
            "{maps} 張地圖",
            "{maps} 張地圖",
            "{maps} 張地圖",
            "{maps} 張地圖，仲數緊",
            "{maps} 張地圖，隻隻都數過",
        ],
    },
    "project.row.edited": {
        en: [
            "last edited {at}",
            "last edited {at}",
            "last edited {at}",
            "last edited {at}, for the record",
            "last edited {at}, if anyone is keeping score",
        ],
        yue: [
            "上次編輯 {at}",
            "上次編輯 {at}",
            "上次編輯 {at}",
            "上次編輯 {at}，記低咗",
            "上次編輯 {at}，如果有人記緊分數嘅話",
        ],
    },
    "project.row.fromWizard": {
        en: [
            "made by the guide, never opened in the editor",
            "made by the guide, never opened in the editor",
            "made by the guide, never opened in the editor",
            "made by the guide, never opened in the editor even once",
            "made by the guide, never opened in the editor, not even once",
        ],
        yue: [
            "由引導整嘅，仲未喺編輯器度打開過",
            "由引導整嘅，仲未喺編輯器度打開過",
            "由引導整嘅，仲未喺編輯器度打開過",
            "由引導整嘅，仲未喺編輯器度打開過，一次都未",
            "由引導整嘅，仲未喺編輯器度打開過，連一次都未",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PROJECT_FIXED = {
    /* ---------------------------------------------------------------- */
    /* ProjectEditor.vue                                                  */
    /* ---------------------------------------------------------------- */

    "project.editor.tab.maps": { en: "Maps ({maps})", yue: "地圖（{maps}）" },
    "project.editor.tab.storages": { en: "Storages ({storages})", yue: "儲存空間（{storages}）" },
    "project.editor.tab.render": { en: "How it renders", yue: "點樣算圖" },
    /*
     * The tab that browses and restores this project file's own version history. `project:save`
     * already records one revision per save; this is the tab that lets somebody actually see and
     * use that record, via `SimpleHistoryList`, which carries its own copy for the list itself.
     */
    "project.editor.tab.history": { en: "History", yue: "版本記錄" },
    "project.render.threads": { en: "Render threads", yue: "算圖執行緒" },
    "project.render.force": { en: "Draw everything again", yue: "全部重新畫" },
    "project.render.fixEdges": { en: "Redraw the edges too", yue: "連邊緣都重畫" },
    "project.render.metrics": {
        en: "Send BlueMap's anonymous usage report",
        yue: "傳送 BlueMap 嘅匿名使用報告",
    },
    "project.render.outputFolder": { en: "Where the rendered map is written", yue: "算好嘅地圖寫入邊度" },
    "project.editor.back": { en: "All projects", yue: "所有 project" },
    "project.editor.fromWizard": { en: "made by the guide", yue: "由引導整嘅" },
    "project.editor.unsaved": { en: "unsaved changes", yue: "未儲存嘅改動" },
    "project.editor.name": { en: "Project name", yue: "Project 名稱" },
    "project.editor.save": { en: "Save the project", yue: "儲存 project" },
    "project.editor.revert": { en: "Discard these changes", yue: "捨棄呢啲改動" },
    "project.editor.windowLabel": { en: "This project", yue: "呢個 project" },
    "project.editor.tabsLabel": { en: "Project sections", yue: "Project 分頁" },
    "project.render.search": { en: "Search these settings", yue: "搜尋呢啲設定" },
    "project.render.searchHint": { en: "threads, edges, output", yue: "執行緒、邊緣、輸出" },
    "project.editor.render": {
        en: "Render this project ({maps} maps)",
        yue: "算呢個 project（{maps} 張地圖）",
    },
    "project.render.searchSummary": {
        en: "{shown} of {total} settings match.",
        yue: "{total} 個設定入面有 {shown} 個符合。",
    },

    /* ---------------------------------------------------------------- */
    /* ProjectList.vue                                                    */
    /* ---------------------------------------------------------------- */

    "project.list.cardLabel": { en: "Projects on this computer", yue: "呢部電腦上面嘅 project" },
    "project.list.title": { en: "Projects", yue: "Project" },
    "project.list.refresh": { en: "Look again", yue: "再check下" },
    "project.list.new": { en: "New project", yue: "新增 project" },
    "project.list.searchLabel": { en: "Search projects", yue: "搜尋 project" },
    "project.list.searchHint": { en: "a name, a world, or guide", yue: "名稱、世界或者 guide" },
    "project.list.bulkLabel": { en: "Actions on the chosen projects", yue: "已選 project 嘅動作" },
    "project.list.chosenCount": { en: "{chosen} selected", yue: "已選 {chosen} 個" },
    "project.list.selectShown": { en: "Select the {shown} shown", yue: "選擇顯示緊嘅 {shown} 個" },
    "project.list.selectInverse": { en: "Invert", yue: "反選" },
    "project.list.selectNone": { en: "Clear the selection", yue: "清空已選" },
    "project.list.exportFormat": { en: "Export as", yue: "匯出格式" },
    "project.list.exportChosen": { en: "Export the {chosen} chosen", yue: "匯出已選嘅 {chosen} 個" },
    "project.list.exportShown": { en: "Export the {shown} shown", yue: "匯出顯示緊嘅 {shown} 個" },
    "project.list.bulkDeleteTitle": { en: "Remove these project files", yue: "移除呢啲 project 檔案" },
    "project.list.bulkDeleteConfirm": {
        en: "Remove the chosen project files",
        yue: "移除已選嘅 project 檔案",
    },
    "project.list.bulkDelete": { en: "Remove {chosen}", yue: "移除 {chosen} 個" },
    "project.list.listLabel": { en: "Projects on this computer", yue: "呢部電腦上面嘅 project" },
    "project.list.choose": { en: "Choose {name}", yue: "選擇 {name}" },
    "project.list.wizardChip": { en: "from the guide", yue: "嚟自引導" },
    "project.list.problemChip": { en: "unreadable", yue: "讀取唔到" },
    "project.list.renderOne": {
        en: "Render {name} with its own settings",
        yue: "用自己嘅設定算 {name}",
    },
    "project.list.deleteTitle": { en: "Remove this project file", yue: "移除呢個 project 檔案" },
    "project.list.deleteConfirm": {
        en: "Remove the project file for {name}",
        yue: "移除 {name} 嘅 project 檔案",
    },
    "project.list.rowMenuLabel": { en: "What this project can do", yue: "呢個 project 有咩可以做" },
    "project.list.menuOpen": { en: "Open this project", yue: "打開呢個 project" },
    "project.list.menuRender": { en: "Render it with its own settings", yue: "用自己嘅設定算佢" },
    "project.list.menuUnchoose": { en: "Take it out of the selection", yue: "由已選之中移除" },
    "project.list.menuChoose": { en: "Add it to the selection", yue: "加入已選" },
    "project.list.menuForget": { en: "Remove the project file", yue: "移除 project 檔案" },
    "project.list.folderProblem": { en: "{world}: {message}", yue: "{world}：{message}" },
    "project.list.deleteRow": { en: "{name}, the file {file}", yue: "{name}，檔案係 {file}" },
    "project.list.deleteMore": { en: "and {more} more", yue: "仲有 {more} 個" },
    "project.list.formatJson": {
        en: "JSON, every field, re-readable",
        yue: "JSON，齊晒每個欄位，讀得返",
    },
    "project.list.formatCsv": { en: "CSV, for a spreadsheet", yue: "CSV，用喺試算表" },
    "project.list.formatMarkdown": { en: "Markdown table, for pasting", yue: "Markdown 表格，用嚟貼" },
    "project.list.searchSummary": {
        en: "Showing {shown} of {total}.",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個。",
    },

    /* ---------------------------------------------------------------- */
    /* ProjectMapsPanel.vue                                              */
    /* ---------------------------------------------------------------- */

    "project.maps.listSummary": {
        en: "{shown} of {total} maps match.",
        yue: "{total} 個地圖入面有 {shown} 個符合。",
    },
    "project.maps.listLabel": { en: "Maps in this project", yue: "呢個 project 入面嘅地圖" },
    "project.maps.search": { en: "Search maps", yue: "搜尋地圖" },
    "project.maps.searchHint": { en: "name, id or dimension", yue: "名稱、id 或者維度" },
    "project.maps.offChip": { en: "off", yue: "已關閉" },
    "project.maps.new": { en: "Add a map", yue: "新增地圖" },
    "project.maps.newTitle": { en: "Add a map to this project", yue: "喺呢個 project 新增地圖" },
    "project.maps.name": { en: "Name shown in the web app", yue: "喺網頁程式度顯示嘅名稱" },
    "project.maps.id": { en: "Map id", yue: "地圖 id" },
    "project.maps.dimension": { en: "Dimension", yue: "維度" },
    "project.maps.cancel": { en: "Cancel", yue: "取消" },
    "project.maps.create": { en: "Add the map", yue: "新增呢張地圖" },
    "project.maps.applyId": { en: "Rename to {id}", yue: "改名做 {id}" },
    "project.maps.storage": { en: "Storage the tiles go into", yue: "圖磚要放入邊個儲存空間" },
    "project.maps.sorting": { en: "Sorting", yue: "排序" },
    "project.maps.enabled": {
        en: "Rendered when this project runs",
        yue: "呢個 project 執行時會算呢張圖",
    },
    "project.maps.disabled": { en: "Kept in the project, not rendered", yue: "留喺 project 入面，但唔會算" },
    "project.maps.moveUpOne": { en: "Move {name} earlier in the list", yue: "喺清單度將 {name} 移前" },
    "project.maps.moveUp": { en: "Earlier", yue: "移前" },
    "project.maps.moveDownOne": { en: "Move {name} later in the list", yue: "喺清單度將 {name} 移後" },
    "project.maps.moveDown": { en: "Later", yue: "移後" },
    "project.maps.deleteTitle": { en: "Take this map out of the project", yue: "由 project 移除呢張地圖" },
    "project.maps.deleteConfirm": { en: "Remove the map {id}", yue: "移除地圖 {id}" },
    "project.maps.delete": { en: "Remove this map", yue: "移除呢張地圖" },

    /* ---------------------------------------------------------------- */
    /* ProjectStoragesPanel.vue                                          */
    /* ---------------------------------------------------------------- */

    "project.storages.listSummary": {
        en: "{shown} of {total} storages match.",
        yue: "{total} 個儲存空間入面有 {shown} 個符合。",
    },
    "project.storages.listLabel": { en: "Storages in this project", yue: "呢個 project 入面嘅儲存空間" },
    "project.storages.search": { en: "Search storages", yue: "搜尋儲存空間" },
    "project.storages.searchHint": { en: "name or type", yue: "名稱或者類型" },
    "project.storages.secretChip": { en: "secret", yue: "有密碼" },
    "project.storages.new": { en: "Add a storage", yue: "新增儲存空間" },
    "project.storages.newTitle": { en: "Add a storage", yue: "新增儲存空間" },
    "project.storages.name": { en: "Storage name", yue: "儲存空間名稱" },
    "project.storages.typeLabel": { en: "What this storage writes into", yue: "呢個儲存空間寫入邊度" },
    "project.storages.typeFile": { en: "A folder", yue: "資料夾" },
    "project.storages.typeSql": { en: "A database", yue: "資料庫" },
    "project.storages.cancel": { en: "Cancel", yue: "取消" },
    "project.storages.create": { en: "Add the storage", yue: "新增呢個儲存空間" },
    "project.storages.deleteTitle": {
        en: "Take this storage out of the project",
        yue: "由 project 移除呢個儲存空間",
    },
    "project.storages.deleteConfirm": { en: "Remove the storage {id}", yue: "移除儲存空間 {id}" },
    "project.storages.delete": { en: "Remove this storage", yue: "移除呢個儲存空間" },

    /* ---------------------------------------------------------------- */
    /* ProjectsScreen.vue                                                 */
    /* ---------------------------------------------------------------- */

    "project.create.pickWorld": { en: "Choose the world folder", yue: "揀個世界資料夾" },
    "project.render.consentAction": { en: "Open the setting", yue: "打開呢項設定" },
    "project.create.title": { en: "Start a project for a world", yue: "幫個世界開個 project" },
    "project.create.world": { en: "World folder", yue: "世界資料夾" },
    "project.create.browse": { en: "Browse", yue: "瀏覽" },
    "project.create.cancel": { en: "Cancel", yue: "取消" },
    "project.create.confirm": { en: "Start the project", yue: "開始呢個 project" },
} as const satisfies Record<string, FixedString>;

export const PROJECT_FACTS = {
    "project.maps.deleteMap": {
        en: ["{name}", "{id}"],
        yue: ["{name}", "{id}"],
    },
    "project.maps.deleteSettings": {
        en: ["Every setting", "config", "hand"],
        yue: ["config", "每一項設定", "手動"],
    },
    "project.maps.deleteTiles": {
        en: ["{id}", "NOT deleted", "disk", "space"],
        yue: ["{id}", "唔會刪除", "磁碟", "空間"],
    },
    "project.maps.deleted": {
        en: ["{id}", "project", "save"],
        yue: ["{id}", "project", "儲存"],
    },
    "project.storages.deleteTiles": {
        en: ["NOT deleted", "space"],
        yue: ["唔會刪除", "空間"],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectEditor.vue                                                  */
    /* ---------------------------------------------------------------- */

    "project.render.threadsHint": { en: ["BlueMap", "machine"], yue: ["BlueMap", "機"] },
    "project.render.forceHint": { en: ["every chunk", "Slow"], yue: ["每一個區塊", "慢"] },
    "project.render.fixEdgesHint": {
        en: ["boundary", "seams", "interrupted"],
        yue: ["邊界", "接縫", "中斷"],
    },
    "project.render.metricsHint": { en: ["Off", "your world"], yue: ["關閉", "世界"] },
    "project.render.outputFolderHint": {
        en: ["setup", "absolute path", "outside"],
        yue: ["設定", "絕對路徑", "之外"],
    },
    "project.render.badPattern": {
        en: ["not valid", "nothing is shown"],
        yue: ["唔啱", "乜都冇顯示"],
    },
    "project.editor.world": { en: ["{world}"], yue: ["{world}"] },
    "project.editor.blurb": {
        en: ["renders", "second render", "moving the folder", "moves the project"],
        yue: ["算圖", "第二次", "搬", "project"],
    },
    "project.editor.noEngine": {
        en: ["cannot render locally", "saved", "desktop app"],
        yue: ["冇辦法喺本機算圖", "存入", "桌面程式"],
    },
    "project.render.noMatches": {
        en: ["this tab", "other tabs"],
        yue: ["呢個分頁", "其他分頁"],
    },
    "project.editor.singletonTouched": {
        en: ["{file}", "BlueMap", "defaults"],
        yue: ["{file}", "BlueMap", "預設值"],
    },
    "project.editor.singletonAbsent": {
        en: ["{file}", "BlueMap", "defaults"],
        yue: ["{file}", "BlueMap", "預設值"],
    },

    /* ---------------------------------------------------------------- */
    /* ProjectList.vue                                                    */
    /* ---------------------------------------------------------------- */

    "project.list.badPattern": {
        en: ["not valid", "nothing is listed"],
        yue: ["唔啱", "乜都冇列出"],
    },
    "project.list.blurb": {
        en: ["Minecraft world", "map, storage", "setting"],
        yue: ["Minecraft 世界", "地圖", "儲存空間"],
    },
    "project.list.noHost": {
        en: ["desktop app", "browser tab"],
        yue: ["桌面程式", "瀏覽器分頁"],
    },
    "project.list.noDelete": {
        en: ["cannot remove", "world folder"],
        yue: ["唔可以移除", "世界資料夾"],
    },
    "project.list.bulkDeleteAction": {
        en: ["{chosen}", "world folders", "not undoable"],
        yue: ["{chosen}", "世界資料夾", "冇得復原"],
    },
    "project.list.deleteAction": {
        en: ["{name}", "world folder", "not undoable"],
        yue: ["{name}", "世界資料夾", "冇得復原"],
    },
    "project.list.emptyScanned": { en: ["{scanned}", "guide"], yue: ["{scanned}", "引導"] },
    "project.list.noMatch": {
        en: ["matches", "nothing was removed"],
        yue: ["符合", "乜都冇刪走"],
    },
    "project.list.deleteWorldNote": {
        en: ["world itself", "not touched", "settings file"],
        yue: ["世界本身", "唔會被郁到", "設定檔案"],
    },
    "project.list.deleteTilesNote": {
        en: ["Tiles", "disk", "space is not coming back"],
        yue: ["圖磚", "磁碟", "空間"],
    },
    "project.list.deleteSettingsNote": {
        en: ["Every map, storage and setting", "no history"],
        yue: ["每一張地圖", "每個儲存空間", "冇歷史"],
    },
    "project.list.exported": { en: ["{count}", "{name}"], yue: ["{count}", "{name}"] },
    "project.list.exportedClipboard": { en: ["{count}", "clipboard"], yue: ["{count}", "剪貼簿"] },
    "project.list.exportFailed": { en: ["export", "clipboard"], yue: ["匯出", "剪貼簿"] },

    /* ---------------------------------------------------------------- */
    /* ProjectMapsPanel.vue                                              */
    /* ---------------------------------------------------------------- */

    "project.maps.badPattern": {
        en: ["not valid", "nothing is listed"],
        yue: ["唔啱", "乜都冇列出"],
    },
    "project.maps.renamed": {
        en: ["{to}", "{from}", "moves or deletes"],
        yue: ["{to}", "{from}", "移動或者刪除"],
    },
    "project.maps.added": { en: ["{id}", "on disk", "saved"], yue: ["{id}", "磁碟", "儲存"] },
    "project.maps.none": {
        en: ["no maps yet", "one dimension"],
        yue: ["未有地圖", "一個維度"],
    },
    "project.maps.noMatch": { en: ["No map matches", "search"], yue: ["符合", "搜尋"] },
    "project.maps.idPreviewEmpty": {
        en: ["Type a name", "the id appears here"],
        yue: ["打個名", "喺呢度出現"],
    },
    "project.maps.idPreviewNew": {
        en: ["{id}", "folder", "address segment"],
        yue: ["{id}", "資料夾", "地址段"],
    },
    "project.maps.idPreview": {
        en: ["{id}", "folder", "address segment"],
        yue: ["{id}", "資料夾", "地址段"],
    },
    "project.maps.templateNote": {
        en: ["template", "editable", "renders"],
        yue: ["範本", "編輯", "算圖"],
    },
    "project.maps.sortingHint": {
        en: ["Lower", "web app's map list"],
        yue: ["數字細", "地圖清單"],
    },
    "project.maps.deleteAction": {
        en: ["{id}", "cannot be undone"],
        yue: ["{id}", "冇得復原"],
    },
    "project.maps.formSubtitle": {
        en: ["{id}", "one file", "before a render starts"],
        yue: ["{id}", "呢一個檔案", "算圖之前"],
    },
    "project.maps.pick": { en: ["Pick a map", "add one"], yue: ["揀一張地圖", "新增一張"] },

    /* ---------------------------------------------------------------- */
    /* ProjectStoragesPanel.vue                                          */
    /* ---------------------------------------------------------------- */

    "project.storages.badPattern": {
        en: ["not valid", "nothing is listed"],
        yue: ["唔啱", "乜都冇列出"],
    },
    "project.storages.switchedSql": {
        en: ["database", "user name and password", "config folder"],
        yue: ["資料庫", "用戶名同密碼", "config 資料夾"],
    },
    "project.storages.switchedFile": { en: ["writes tiles", "folder"], yue: ["圖磚", "資料夾"] },
    "project.storages.added": {
        en: ["{id}", "written when you save"],
        yue: ["{id}", "儲存嗰陣先會寫入"],
    },
    "project.storages.deleteStorage": {
        en: ["{id}", "every setting"],
        yue: ["{id}", "每一項設定"],
    },
    "project.storages.deleteUsed": {
        en: ["{maps}", "nowhere to write", "Point them somewhere else"],
        yue: ["{maps}", "冇地方寫", "指去第度"],
    },
    "project.storages.deleted": {
        en: ["{id}", "out of this project"],
        yue: ["{id}", "唔喺呢個 project 入面"],
    },
    "project.storages.none": {
        en: ["where rendered tiles are written", "no storage", "folder the app renders into", "Add one"],
        yue: ["圖磚寫落嘅地方", "儲存空間", "算圖嘅資料夾", "加一個"],
    },
    "project.storages.noMatch": { en: ["No storage matches", "search"], yue: ["符合", "搜尋"] },
    "project.storages.newNote": { en: ["template", "never in this file"], yue: ["範本", "唔會擺喺呢個檔案"] },
    "project.storages.credentialled": {
        en: ["connection-properties", "world folder", "will not save"],
        yue: ["connection-properties", "世界資料夾", "唔會儲存"],
    },
    "project.storages.deleteAction": {
        en: ["{id}", "cannot be undone"],
        yue: ["{id}", "冇得復原"],
    },
    "project.storages.formSubtitle": { en: ["{id}", "tiles go"], yue: ["{id}", "圖磚去"] },
    "project.storages.pick": { en: ["Pick a storage", "add one"], yue: ["揀一個儲存空間", "新增一個"] },

    /* ---------------------------------------------------------------- */
    /* ProjectsScreen.vue                                                 */
    /* ---------------------------------------------------------------- */

    "project.open.absent": { en: ["no project file", "world folder"], yue: ["冇 project 檔案", "世界資料夾"] },
    "project.open.tooNew": {
        en: ["{version}", "silently drop", "Update the app"],
        yue: ["{version}", "靜靜雞", "更新程式"],
    },
    "project.open.invalid": { en: ["{problems}", "does not say"], yue: ["{problems}", "唔似"] },
    "project.open.notJson": {
        en: ["{message}", "not readable as JSON"],
        yue: ["{message}", "唔係讀得嘅 JSON"],
    },
    "project.open.unreadable": { en: ["could not be read"], yue: ["讀唔到"] },
    "project.save.done": { en: ["{file}", "project"], yue: ["{file}", "project"] },
    "project.create.needWorld": { en: ["Choose the world folder"], yue: ["揀個世界資料夾"] },
    "project.create.relative": { en: ["relative", "Use a full path"], yue: ["相對路徑", "用完整路徑"] },
    "project.create.exists": {
        en: ["already has a project", "exactly one project file"],
        yue: ["已經有 project", "淨係得一個 project 檔案"],
    },
    "project.create.started": {
        en: ["not written yet", "save when it is ready"],
        yue: ["未寫落去", "準備好就儲存"],
    },
    "project.forget.done": { en: ["{gone}", "untouched"], yue: ["{gone}", "冇被郁過"] },
    "project.forget.failed": { en: ["not removed", "{failure}"], yue: ["冇被移除", "{failure}"] },
    "project.render.consentMissing": {
        en: ["Mojang", "not been accepted", "stop before it started"],
        yue: ["Mojang", "未接受", "未開始就會停"],
    },
    "project.render.noBridge": {
        en: ["cannot start a render", "desktop app"],
        yue: ["冇辦法開始算圖", "桌面程式"],
    },
    "project.create.blurb": {
        en: ["root of the world folder", "Nothing is written until you save"],
        yue: ["世界資料夾嘅根目錄", "儲存之前乜都唔會寫"],
    },
    "project.row.world": { en: ["{world}"], yue: ["{world}"] },
    "project.row.oneMap": { en: ["1 map"], yue: ["1 張地圖"] },
    "project.row.maps": { en: ["{maps}"], yue: ["{maps}"] },
    "project.row.edited": { en: ["{at}"], yue: ["{at}"] },
    "project.row.fromWizard": {
        en: ["made by the guide", "never opened in the editor"],
        yue: ["由引導整嘅", "仲未喺編輯器度打開過"],
    },
} as const satisfies Record<
    keyof typeof PROJECT_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
