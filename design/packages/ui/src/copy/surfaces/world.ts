/**
 * The "Make a map" wizard: choosing a world, naming the map, its options, where it is
 * written, reviewing it, running it, and the renders that stopped without finishing.
 *
 * `catalogueCoverage.test.ts` named `components/world` as "not started" before this module
 * existed -- 15 of 234 keys had a catalogue entry, all of them living directly in
 * `appCopy.ts` rather than here. This module now covers the rest: all ten `.vue` components
 * in the directory, plus the four lower-case helper modules whose own functions build the
 * strings some of those components display, in the directory's own alphabetical order:
 *
 *   InterruptedRenders.vue, MapIdentityStep.vue, MapOptionsStep.vue, MapStorageStep.vue,
 *   MinecraftWorldList.vue, RenderRunPanel.vue, SshWorldSourcePanel.vue,
 *   WizardReviewStep.vue, WorldFolderStep.vue, WorldScreen.vue, WorldWizard.vue,
 *   renderRun.ts, resumeOffers.ts, worldCatalog.ts,
 *   worldFolder.ts
 *
 * A prior pass covered the first six `.vue` files and left two consequences of stopping at a
 * file boundary rather than a feature boundary on record; both are resolved now that the
 * helper modules are covered too:
 *
 *  - `InterruptedRenders.vue`'s render descriptions, computed in `resumeOffers.ts` through
 *    `describeInterruption`/`describeProgress`/`describeRefusal`, are voiced.
 *  - `MinecraftWorldList.vue`'s per-world subtitle line, built in `worldCatalog.ts` through
 *    `worldDetailLine`/`worldSearchText`/`worldOptionName`, is voiced.
 *
 * `consentState.ts`, `index.ts`, `wizardModel.ts`, `wizardSteps.ts` and `worldBridge.ts`
 * carry no `world.*` call sites of their own (`wizardSteps.ts` supplies the step-title keys
 * that `WorldFolderStep.vue`/`WorldWizard.vue` call `t()` with), so there is nothing further
 * to cover in `components/world` once this module answers everything above.
 *
 * This module is now registered in `surfaces/index.ts`, and `components/world` is on
 * `catalogueCoverage.test.ts`'s `COVERED_SURFACES` list.
 *
 * See `appCopy.ts` for the tier rules this follows: VOICED for prose that explains, warns or
 * reports (blurbs, empty states, notices with a genuine fact to protect), FIXED for titles,
 * field labels, placeholders, button captions and short status chips. Search field labels
 * and hints stay FIXED throughout, matching `history.searchHint` and its siblings; "showing
 * N of M" summaries stay FIXED, matching `pages.renders.summary`. `world.options.badPattern`
 * and `world.options.matches` reuse the exact English `configEditor.ts` already settled on
 * for `config.form.badPattern` and `config.form.matches` -- this step re-implements the same
 * search-and-filter pattern for the wizard's own settings list, so the same sentence answers
 * both rather than a second one being invented to say the same thing. The problem/fix pairs
 * `worldFolder.ts` builds through `describeWorldProblem` -- `world.folder.noLevelDat`/
 * `noRegionData`/`savesFolder` already voiced in `appCopy.ts`, their `*Fix` siblings and the
 * remaining problem codes voiced here -- follow that same precedent rather than being
 * downgraded to FIXED for their brevity.
 *
 * ## Three key families that are genuinely uncatalogueable, not merely unfinished
 *
 * `renderRun.ts` builds three families of string as plain `{ key, fallback, ... }` data --
 * `SIGNALS` (`world.console.signal.*`), `phaseText()` (`world.run.phase.*`), and
 * `FailureRemedy.actionKey` (`world.run.fail.*Action`) -- each read later through a *computed*
 * `t(someObject.key, ...)` call in `RenderConsole.vue` or `RenderRunPanel.vue`. That is a
 * property access, never a literal `t("...")` call, so no scan of this package's source can
 * ever find a call site for these 20 keys -- not the coverage scanner in
 * `catalogueCoverage.test.ts`, not the orphan-check scanner in `appCopy.test.ts`. A prior pass
 * voiced all 20 anyway; the finalize pass that registered this module into the merged
 * catalogue hit exactly the failure this creates -- `appCopy.test.ts`'s "finds a call site for
 * every key in the catalogue" check named all 20 as orphans the moment they became reachable
 * through `surfaces/index.ts`. They were removed rather than kept, matching the precedent
 * `downloads.ts` already set for the identical shape: its `UNITS` array builds
 * `{ key: "downloads.size.tb", fallback, ... }` the same way, and only `downloads.size.b`
 * (which does have a literal call site) is voiced -- `downloads.size.tb`/`gb`/`mb`/`kb` are
 * deliberately left uncatalogued for this exact reason. Fixing the underlying gap for real
 * would mean adding a literal `t("world.console.signal.starting", ...)` call somewhere the
 * component actually reaches, which is an application-code change outside a copy pass. The
 * sibling `world.run.fail.*` explanation keys (`consent`, `java`, `world`, `storage`,
 * `nothing`, and the rest) are unaffected and stay voiced: `adviseOnFailure()` passes those
 * through a real literal `t("world.run.fail.consent", ...)` call, so they have a genuine call
 * site the scanners can find.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

/** Five increasingly playful tellings that keep the SSH safety facts byte-for-byte present. */
function sshVoice(en: string, yue: string): VoicedString {
    return {
        en: [
            en,
            `${en} No guesswork is involved.`,
            `${en} The careful checklist is earning its keep.`,
            `${en} The checklist has its sensible shoes on.`,
            `${en} The checklist is wearing sensible shoes and refusing to let the bytes improvise jazz.`,
        ],
        yue: [
            yue,
            `${yue} 全程唔估。`,
            `${yue} 呢張小心清單開始值回票價。`,
            `${yue} 張清單着好穩陣鞋先行。`,
            `${yue} 張清單着住穩陣鞋，堅決唔畀啲位元組即興玩爵士樂。`,
        ],
    };
}

export const WORLD_VOICED = {
    /* SshWorldSourcePanel.vue */
    "world.ssh.blurb": sshVoice(
        "Choose a saved key-only SSH machine, inspect its real folders, review an unknown fingerprint, then fetch one world into a folder on this computer. Nothing is written to the other machine.",
        "揀一部已儲存、只用金鑰嘅 SSH 機器，睇佢真正嘅資料夾，核對未見過嘅指紋，再將一個世界下載去呢部電腦嘅資料夾。唔會寫任何嘢去另一部機。",
    ),
    "world.ssh.browseBlocked": sshVoice(
        "A detected, trusted POSIX or Windows host and the remote-directory bridge are required before its folders can be browsed.",
        "要先有偵測同信任咗嘅 POSIX 或 Windows 主機，亦要有遠端資料夾橋接，先可以瀏覽入面嘅資料夾。",
    ),
    "world.ssh.cancelMiss": sshVoice(
        "That transfer had already ended before cancellation reached it.",
        "個傳送喺取消趕到之前已經完咗。",
    ),
    "world.ssh.detectNeedsTarget": sshVoice(
        "Choose or add a saved machine before checking it.",
        "先揀或者新增一部已儲存嘅機器，之後先至檢查。",
    ),
    "world.ssh.detected": sshVoice("This machine answered as {kind}.", "呢部機以 {kind} 回應。"),
    "world.ssh.fetchBlocked": sshVoice(
        "A surveyed world and a local destination are required. The button stays disabled until both are ready.",
        "要有檢查好嘅世界同本機目的地。兩樣都準備好之前，撳鈕會保持停用。",
    ),
    "world.ssh.fetched": sshVoice(
        "Fetched to {folder}. The ordinary wizard is reading that local folder now.",
        "已下載去 {folder}。原本個精靈而家讀緊嗰個本機資料夾。",
    ),
    "world.ssh.fetchedNotice": sshVoice(
        "The SSH world was fetched to {folder} and is ready for the wizard to inspect.",
        "SSH 世界已下載去 {folder}，準備好畀精靈檢查。",
    ),
    "world.ssh.noMatch": sshVoice(
        "No SSH setup control matches that search. Clear it to show the whole guided flow again.",
        "冇 SSH 設定控制符合呢個搜尋。清空佢就會再次顯示完整引導流程。",
    ),
    "world.ssh.notWorld": sshVoice(
        "The survey did not find both level.dat and a region file. Choose the world folder itself, not its parent or its region folder.",
        "檢查搵唔齊 level.dat 同 region 檔案。請揀世界資料夾本身，唔好揀上層或者入面個 region 資料夾。",
    ),
    "world.ssh.reviewKey": sshVoice(
        "Compare one fingerprint with the server itself. Trust only an exact match; a changed key is refused and has no trust button.",
        "同伺服器本身核對一個指紋。只可以信任完全一樣嘅指紋；金鑰變咗會拒絕，而且冇信任撳鈕。",
    ),
    "world.ssh.surveyReady": sshVoice(
        "The survey found level.dat, region data and {files} files. No world bytes have moved yet.",
        "檢查搵到 level.dat、region 資料同 {files} 個檔案。暫時未搬任何世界位元組。",
    ),
    "world.ssh.transferring": sshVoice(
        "Transfer phase 3 of 3; {lines} progress messages received.",
        "傳送第 3/3 階段；收到 {lines} 個進度訊息。",
    ),
    "world.ssh.unavailable": sshVoice(
        "Fetching a world over SSH needs the desktop app's complete SSH world-source bridge.",
        "經 SSH 下載世界需要桌面程式嘅完整 SSH 世界來源橋接。",
    ),
    /* ---------------------------------------------------------------- */
    /* InterruptedRenders.vue                                            */
    /* ---------------------------------------------------------------- */

    "world.resume.blurb": {
        en: [
            "Carrying one on re-runs it against the tiles already on disk, so everything already drawn is skipped. Nothing is deleted either way.",
            "Carrying one on re-runs it against the tiles already on disk, so everything already drawn is skipped. Nothing is deleted either way.",
            "Carrying one on re-runs it against the tiles already on disk, so everything already drawn is skipped. Nothing is deleted, either way.",
            "Carry one on and it re-runs against the tiles already on disk, so everything already drawn is skipped rather than redone. Nothing is deleted, whichever way this goes.",
            "Carry one on and it quietly re-runs against the tiles already on disk, so everything already drawn is skipped rather than redone from scratch. Nothing is deleted, whichever way this goes.",
        ],
        yue: [
            "撳「繼續」會用返磁碟上已經有嘅圖磚再算過，已經畫好嘅嘢會跳過。無論點揀，都唔會刪走任何嘢。",
            "撳「繼續」會用返磁碟上已經有嘅圖磚再算過，已經畫好嘅嘢會跳過。無論點揀，都唔會刪走任何嘢。",
            "撳「繼續」會用返磁碟上已經有嘅圖磚再算多次，已經畫好嘅嘢會跳過唔理。無論點揀，都唔會刪走任何嘢。",
            "揀「繼續」，佢會用返磁碟上已經有嘅圖磚再算，已經畫好嘅嘢會跳過，唔使再畫多次。無論你點揀，都唔會刪走任何嘢。",
            "揀「繼續」，佢會靜靜雞用返磁碟上已經有嘅圖磚再算，已經畫好嘅嘢會跳過，唔使由頭嚟過。無論你點揀，都唔會刪走任何嘢。",
        ],
    },
    "world.resume.noMatch": {
        en: [
            "No unfinished render matches that search. Clearing it brings them all back; nothing was declined.",
            "No unfinished render matches that search. Clearing it brings them all back; nothing was declined.",
            "No unfinished render matches that search. Clearing it brings them all back; nothing was declined.",
            "Nothing unfinished matches that search right now. Clearing it brings them all back; nothing was declined.",
            "Not one unfinished render matches that search right now. Clearing it brings them all back, every one; nothing was declined.",
        ],
        yue: [
            "冇未完成嘅算圖符合呢個搜尋。清空就會全部返晒嚟；冇拒絕過任何一個。",
            "冇未完成嘅算圖符合呢個搜尋。清空就會全部返晒嚟；冇拒絕過任何一個。",
            "冇未完成嘅算圖符合呢個搜尋。清空就會全部返晒嚟；冇拒絕過任何一個。",
            "而家冇未完成嘅算圖啱呢個搜尋。清空就會全部返晒嚟；冇拒絕過邊一個。",
            "而家一個未完成嘅算圖都冇撞啱呢個搜尋。清空就會全部返晒嚟，一個都冇少；冇拒絕過邊一個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* MapIdentityStep.vue                                               */
    /* ---------------------------------------------------------------- */

    "world.identity.idTooLong": {
        en: [
            "At most {max} characters.",
            "At most {max} characters.",
            "At most {max} characters, not one more.",
            "{max} characters, tops. Not one more.",
            "{max} characters is the ceiling here. Not one more.",
        ],
        yue: [
            "最多 {max} 個字。",
            "最多 {max} 個字。",
            "最多 {max} 個字，一個都唔可以再多。",
            "封頂 {max} 個字，一個都唔准超。",
            "封頂就係 {max} 個字，一個字都唔准超。",
        ],
    },
    "world.identity.idCharacters": {
        en: [
            "Lower-case letters, digits, hyphens and underscores only, starting with a letter or a digit.",
            "Lower-case letters, digits, hyphens and underscores only, starting with a letter or a digit.",
            "Lower-case letters, digits, hyphens and underscores only, and it has to start with a letter or a digit.",
            "Lower-case letters, digits, hyphens and underscores only here, starting with a letter or a digit.",
            "Lower-case letters, digits, hyphens and underscores, and nothing else, starting with a letter or a digit.",
        ],
        yue: [
            "淨係可以用細楷字母、數字、連字號同底線，開頭要係字母或者數字。",
            "淨係可以用細楷字母、數字、連字號同底線，開頭要係字母或者數字。",
            "淨係可以用細楷字母、數字、連字號同底線，而且一定要以字母或者數字開頭。",
            "呢度淨係收細楷字母、數字、連字號同底線，開頭要係字母或者數字。",
            "淨係收細楷字母、數字、連字號同底線，第啲乜都唔收，開頭要係字母或者數字。",
        ],
    },
    "world.identity.blurb": {
        en: [
            "The name is what the map is called in the viewer, and can be changed at any time. The id is what it is called on disk and in its address, and changing it later means rendering it again.",
            "The name is what the map is called in the viewer, and can be changed at any time. The id is what it is called on disk and in its address, and changing it later means rendering it again.",
            "The name is what the map is called in the viewer, and it can be changed at any time. The id is what it is called on disk and in its address, and changing it later means rendering it again.",
            "The name is just what the map is called in the viewer, and it can be changed whenever you like. The id is what it is called on disk and in its address, and changing it later means rendering it again.",
            "The name is only what the map is called in the viewer, and you can rename it on a whim. The id is what it is called on disk and in its address, so changing it later means rendering it again, the whole thing.",
        ],
        yue: [
            "名稱係呢張圖喺檢視器入面嘅叫法，隨時都改得。id 就係佢喺磁碟同網址入面嘅叫法，遲啲先改就要再算一次。",
            "名稱係呢張圖喺檢視器入面嘅叫法，隨時都改得。id 就係佢喺磁碟同網址入面嘅叫法，遲啲先改就要再算一次。",
            "名稱係呢張圖喺檢視器入面嘅叫法，幾時都改得。id 就係佢喺磁碟同網址入面嘅叫法，遲啲先改就要再算一次。",
            "名稱淨係呢張圖喺檢視器入面嘅叫法，你想幾時改都得。id 就唔同，佢係磁碟同網址入面嘅叫法，遲啲先改就要再算一次。",
            "名稱淨係呢張圖喺檢視器入面嘅花名，你心血來潮想幾時改都得。但 id 就實牙實齒寫死喺磁碟同網址入面，遲啲先改就要再算一次，成張圖嗰種。",
        ],
    },
    "world.identity.idHint": {
        en: [
            "Used as the folder name and in the address the tiles are served from.",
            "Used as the folder name and in the address the tiles are served from.",
            "Used as the folder name, and in the address the tiles are served from.",
            "This becomes the folder name, and shows up in the address the tiles are served from.",
            "This becomes the folder name on disk, and rides along in the address the tiles are served from.",
        ],
        yue: [
            "會用嚟做資料夾名，亦都會出現喺圖磚提供服務嘅網址入面。",
            "會用嚟做資料夾名，亦都會出現喺圖磚提供服務嘅網址入面。",
            "會用嚟做資料夾名，同埋會出現喺圖磚提供服務嗰個網址入面。",
            "呢個會變成資料夾名，仲會現身喺圖磚提供服務嘅網址度。",
            "呢個會變成磁碟上嘅資料夾名，仲會實牙實齒印喺圖磚服務嘅網址度。",
        ],
    },
    "world.identity.sortingHint": {
        en: [
            "A lower number puts this map earlier in the viewer's list.",
            "A lower number puts this map earlier in the viewer's list.",
            "A lower number puts this map earlier in the viewer's own list.",
            "A lower number still puts this map earlier in the viewer's list.",
            "A lower number always creeps this map earlier up the viewer's list.",
        ],
        yue: [
            "數字細啲，呢張圖喺檢視器嘅清單度就會排前啲。",
            "數字細啲，呢張圖喺檢視器嘅清單度就會排前啲。",
            "數字細啲，呢張圖喺檢視器自己嘅清單度就會排前啲。",
            "數字細啲，呢張圖喺檢視器清單入面就會排前啲，愈細愈前。",
            "數字細啲，呢張圖就會慢慢爬前去檢視器清單頭度。",
        ],
    },
    "world.identity.guessedDimensions": {
        en: [
            "These are the three vanilla dimensions rather than the ones this world has, because nothing could read the folder. A dimension the world has never generated renders an empty map.",
            "These are the three vanilla dimensions rather than the ones this world has, because nothing could read the folder. A dimension the world has never generated renders an empty map.",
            "These are the three vanilla dimensions rather than the ones this world actually has, because nothing could read the folder. A dimension the world has never generated renders an empty map.",
            "These are the three vanilla dimensions, not necessarily this world's own, because nothing could read the folder. Pick a dimension the world never generated and it renders an empty map.",
            "These are just the three vanilla dimensions standing in, because nothing could read the folder. Pick a dimension the world never generated and it renders an empty map, right on cue.",
        ],
        yue: [
            "呢啲係三個原版維度，未必係呢個世界真正有嘅，因為冇嘢讀到個資料夾。揀一個呢個世界從未生成過嘅維度，就會算出一張空白嘅地圖。",
            "呢啲係三個原版維度，未必係呢個世界真正有嘅，因為冇嘢讀到個資料夾。揀一個呢個世界從未生成過嘅維度，就會算出一張空白嘅地圖。",
            "呢啲係三個原版維度，未必係呢個世界實際有嘅，因為冇嘢讀到個資料夾。揀一個呢個世界從未生成過嘅維度，就會算出一張空白嘅地圖。",
            "呢啲淨係三個原版維度頂住先，唔一定係呢個世界真正有嘅，因為冇嘢讀到個資料夾。揀一個世界未生成過嘅維度，就會算出一張空白嘅地圖。",
            "呢啲淨係三個原版維度出嚟頂檔，因為冇嘢讀到個資料夾。揀一個呢個世界未生成過嘅維度，照樣算出一張空白嘅地圖，一秒都冇走雞。",
        ],
    },
    "world.identity.presetNote": {
        en: [
            "The map starts from BlueMap's own template for this dimension:",
            "The map starts from BlueMap's own template for this dimension:",
            "The map starts from BlueMap's own template for this dimension:",
            "This map starts from BlueMap's own template for this dimension:",
            "This map is born from BlueMap's own template for this dimension:",
        ],
        yue: [
            "呢張地圖會由 BlueMap 自己嘅範本開始，啱呢個維度嘅範本係：",
            "呢張地圖會由 BlueMap 自己嘅範本開始，啱呢個維度嘅範本係：",
            "呢張地圖會由 BlueMap 自己嘅範本開始，啱呢個維度嘅範本係：",
            "呢張地圖一開波就用 BlueMap 自己嘅範本，啱呢個維度嘅係：",
            "呢張地圖一出世就用 BlueMap 自己嘅範本，啱呢個維度嘅範本係：",
        ],
    },
    /*
     * A sentence fragment continuing `world.identity.presetNote`, with the dimension key as
     * a chip between them -- see `MapIdentityStep.vue`. Stays lower-case at every level for
     * the same reason `config.field.consentAccepted` does: the row renders the fragment
     * after something else, and a level that capitalised it would read as two sentences
     * bolted together with a chip wedged in the middle.
     */
    "world.identity.presetDetail": {
        en: [
            "which sets the sky colour, the void colour, the ambient light and the cave removal that suit it. Changing the dimension rewrites those and keeps every option you have changed yourself.",
            "which sets the sky colour, the void colour, the ambient light and the cave removal that suit it. Changing the dimension rewrites those and keeps every option you have changed yourself.",
            "which sets the sky colour, the void colour, the ambient light and the cave removal that suit it. Changing the dimension rewrites those, and keeps every option you have changed yourself.",
            "which sets the sky colour, the void colour, the ambient light and the cave removal that fit it. Changing the dimension rewrites those, and keeps every option you have changed yourself.",
            "which quietly sets the sky colour, the void colour, the ambient light and the cave removal that fit it best. Changing the dimension rewrites those on the spot, and keeps every option you have changed yourself, untouched.",
        ],
        yue: [
            "會set好啱呢個維度嘅天空顏色、虛空顏色、環境光同洞穴清除。轉維度會將呢啲重寫，但保留你自己改過嘅每一個選項。",
            "會set好啱呢個維度嘅天空顏色、虛空顏色、環境光同洞穴清除。轉維度會將呢啲重寫，但保留你自己改過嘅每一個選項。",
            "會set好啱呢個維度嘅天空顏色、虛空顏色、環境光同洞穴清除。轉維度會將呢啲重寫，但保留你自己改過嘅每一個選項。",
            "會set好啱呢個維度嘅天空顏色、虛空顏色、環境光同洞穴清除。一轉維度呢幾樣就會被重寫，但保留你自己改過嘅每一個選項。",
            "會靜靜雞set好最啱呢個維度嘅天空顏色、虛空顏色、環境光同洞穴清除。一轉維度呢幾樣即刻被重寫，但保留你自己改過嘅每一個選項，一絲不走樣。",
        ],
    },

    /*
     * DimensionSelection.vue, mounted from MapIdentityStep.vue right below the primary
     * dimension picker: the list every detected dimension shows up in, with its own
     * search bar and bulk include/exclude. `world.identity.dimensionsNoMatch` follows
     * `world.list.noMatch`'s own precedent for a "nothing matches this search" state
     * next to a filterable list rather than being downgraded to FIXED.
     */
    "world.identity.dimensionsBlurb": {
        en: [
            "Every dimension this world has is listed below, with its region count. The Nether and the End start unticked, since rendering them is not always wanted, and a dimension added by a mod or datapack starts unticked too, since its size is not known in advance. Tick the ones to render as well; each becomes its own map, lit correctly for its dimension.",
            "Every dimension this world has is listed below, each with its region count. The Nether and the End start unticked, because rendering them is not always wanted, and a dimension added by a mod or datapack starts unticked too, because its size is not known in advance. Tick the ones you also want rendered; each becomes its own map, lit correctly for its dimension.",
            "Every dimension this world has shows up below, with its region count. The Nether and the End start unticked, since you don't always want them rendered, and anything a mod or datapack added starts unticked too, since nobody knows its size ahead of time. Tick whatever else you want; each one gets its own map, lit right for its dimension.",
            "Every dimension this world has turns up below, region count and all. The Nether and the End start unticked, because who said you wanted the Nether rendered, and anything a mod or datapack bolted on starts unticked too, since nobody has a clue how big it is. Tick whatever else takes your fancy; each one gets its own map, lit just right for its dimension.",
            "Every dimension this world is hiding shows up below, region count included, no exceptions. The Nether and the End start unticked, because let's be honest, nobody asked for a lava-scented bonus map, and anything a mod or datapack smuggled in starts unticked too, since its size is anyone's guess. Tick whatever else tickles your fancy; each one gets its own map, lit just right for its dimension, no cutting corners.",
        ],
        yue: [
            "呢個世界擁有嘅每一個維度都會列喺下面，附上區域檔案數量。Nether 同 End 預設係唔剔嘅，因為唔係次次都想連埋佢哋一齊算；由 mod 或者 datapack 加入嘅維度都係預設唔剔，因為事先唔知佢有幾大。剔低想一齊算嘅，每一個都會變成自己嘅地圖，用返啱佢個維度嘅設定。",
            "呢個世界有嘅每一個維度都會列喺下面，連埋區域檔案數量。Nether 同 End 一開始係唔剔嘅，因為未必次次都想算埋佢哋；由 mod 或者 datapack 加落去嘅維度都係一開始唔剔，因為事先估唔到佢有幾大。剔低想一齊算嘅嗰啲，每一個都會變成自己嘅地圖，跟返啱佢個維度嘅設定。",
            "呢個世界有嘅維度全部列喺下面，連區域檔案數量都有。Nether 同 End 一開波係唔剔嘅，始終唔係個個都想連佢哋一齊算；mod 或者 datapack 加嘅維度都係一開波唔剔，事先都估唔到有幾大嘛。想埋嘅就剔低佢，每一個都會變成自己嘅地圖，跟返啱佢個維度嘅設定。",
            "呢個世界匿埋嘅維度全部現形喺下面，區域檔案數量都影埋。Nether 同 End 一開波梗係唔剔啦，邊個話你想連埋個地獄一齊算吖，mod 或者 datapack 塞嘅維度一樣唔剔，有幾大冇人知。想加嘅自己剔，每一個都會變成自己嘅地圖，跟啱佢個維度。",
            "呢個世界匿埋嘅維度全部現晒形喺下面，區域檔案數量一個都冇走雞。Nether 同 End 一開波預設唔剔，講句真心話，邊個成日想白撞多張熔岩主題地圖吖，mod 或者 datapack 偷偷塞落嚟嘅維度一樣唔剔，有幾大真係天曉得。鍾意邊個就自己剔邊個，每一個都會變成自己嘅地圖，跟到足佢個維度嘅設定，一個彎都冇轉錯。",
        ],
    },
    "world.identity.dimensionsNoMatch": {
        en: [
            "No dimension matches that search. Clearing it brings the whole list back.",
            "No dimension matches that search. Clearing it brings the whole list back.",
            "No dimension matches that search. Clearing it brings the whole list back.",
            "Nothing matches that search. Clearing it brings the whole list back.",
            "Not one dimension matches that search. Clearing it brings the whole list back, every dimension present and correct.",
        ],
        yue: [
            "冇維度符合呢個搜尋。清空就會攞返成個清單。",
            "冇維度符合呢個搜尋。清空就會攞返成個清單。",
            "冇維度符合呢個搜尋。清空就會攞返成個清單。",
            "一個維度都冇撞啱呢個搜尋。清空就會攞返成個清單。",
            "一個維度都冇撞啱呢個搜尋。清空就會攞返成個清單，一個都冇走漏。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* MapOptionsStep.vue                                                */
    /* ---------------------------------------------------------------- */

    /*
     * Same English `configEditor.ts` already settled on for `config.form.badPattern`: this
     * step re-implements the same search-and-filter pattern for the wizard's own settings
     * list, so the same sentence answers both rather than a second one being invented.
     */
    "world.options.badPattern": {
        en: [
            "The pattern is not valid, so nothing is shown.",
            "The pattern is not valid, so nothing is shown.",
            "The pattern is not valid, so nothing is shown. The message under the search field quotes what is wrong with it.",
            "The pattern is not valid, so nothing is shown. The message under the search field quotes exactly what is wrong with it.",
            "The pattern is not valid, so nothing is shown rather than something wrong. The message under the search field quotes exactly what the engine objected to.",
        ],
        yue: [
            "個 pattern 唔合法，所以乜都唔會顯示。",
            "個 pattern 唔合法，所以乜都唔會顯示。",
            "個 pattern 唔合法，所以乜都唔會顯示。搜尋格下面嗰句會引返錯喺邊。",
            "個 pattern 唔合法，所以乜都唔會顯示。搜尋格下面嗰句會原文引返錯咗啲乜。",
            "個 pattern 唔合法，所以寧願乜都唔會顯示，好過顯示錯嘅嘢。搜尋格下面嗰句會原文引返引擎唔收嘅地方。",
        ],
    },
    "world.options.matches": {
        en: [
            "{shown} of {total} settings match.",
            "{shown} of {total} settings match.",
            "{shown} of {total} settings match. The rest are filtered out, not removed.",
            "{shown} of {total} settings match. The rest are filtered out rather than removed.",
            "{shown} of {total} settings match. The rest are merely filtered out, still in the file.",
        ],
        yue: [
            "{total} 個設定入面有 {shown} 個符合。",
            "{total} 個設定入面有 {shown} 個符合。",
            "{total} 個設定入面有 {shown} 個符合。其餘嘅係篩走咗，唔係刪走咗。",
            "{total} 個設定入面有 {shown} 個符合。其餘嘅只係篩走咗，唔係刪走咗。",
            "{total} 個設定入面有 {shown} 個符合。其餘嘅只係篩走咗，全部仲喺檔案入面。",
        ],
    },
    "world.options.allShown": {
        en: [
            "All {total} settings are shown.",
            "All {total} settings are shown.",
            "All {total} settings are shown, nothing hidden.",
            "Every one of the {total} settings is shown; nothing is hidden.",
            "All {total} settings are right there on screen, not one of them hiding.",
        ],
        yue: [
            "全部 {total} 個設定都顯示緊。",
            "全部 {total} 個設定都顯示緊。",
            "全部 {total} 個設定都顯示緊，冇收埋任何一個。",
            "{total} 個設定全部都喺畫面上，一個都冇收埋。",
            "{total} 個設定全部大大方方擺喺畫面度，一個都冇匿埋。",
        ],
    },
    "world.options.blurb": {
        en: [
            "Every one of these already has BlueMap's own default, so you can press straight through to the end. Change what you want to change; the rest stays as upstream ships it.",
            "Every one of these already has BlueMap's own default, so you can press straight through to the end. Change what you want to change; the rest stays as upstream ships it.",
            "Every one of these already has BlueMap's own default, so you can press straight through to the end. Change what you want to change, and the rest stays as upstream ships it.",
            "Every setting here already has BlueMap's own default, so pressing straight through to the end works fine. Change only what you care about; the rest stays as upstream ships it.",
            "Every single setting here already has BlueMap's own default, so you could press straight through to the end and never touch a thing. Change only what you care about; the rest stays as upstream ships it, untouched.",
        ],
        yue: [
            "每一個設定都已經有 BlueMap 自己嘅預設值，所以你可以一路撳到尾都得。想改邊個就改邊個；其餘就保持返上游出廠嘅樣。",
            "每一個設定都已經有 BlueMap 自己嘅預設值，所以你可以一路撳到尾都得。想改邊個就改邊個；其餘就保持返上游出廠嘅樣。",
            "每一個設定都已經有 BlueMap 自己嘅預設值，所以你可以一路撳到尾。想改邊個就改邊個，其餘保持返上游出廠嘅樣。",
            "呢度每一個設定都已經有 BlueMap 自己嘅預設值，一路撳到尾都冇問題。淨係改你想改嗰啲，其餘保持返上游出廠嘅樣。",
            "呢度每一個設定都已經有 BlueMap 自己嘅預設值，你大可以一路撳到尾，一隻手指都唔使郁。淨係改你真係介意嗰啲，其餘保持返上游出廠嘅樣，一個字都冇改。",
        ],
    },
    "world.options.noMatches": {
        en: [
            "Nothing on this step matches that search.",
            "Nothing on this step matches that search.",
            "Nothing on this step matches that search.",
            "Nothing on this step matches that search. Try a different word.",
            "Nothing on this step matches that search, not one thing. Worth trying a different word.",
        ],
        yue: [
            "呢一步冇嘢符合呢個搜尋。",
            "呢一步冇嘢符合呢個搜尋。",
            "呢一步冇嘢符合呢個搜尋。",
            "呢一步冇嘢符合呢個搜尋，試下換個字眼。",
            "呢一步冇嘢符合呢個搜尋，一嚿都冇。不如換個字眼再試。",
        ],
    },
    "world.options.carried": {
        en: [
            "Written into this map's config file. The review step says which settings this render reads.",
            "Written into this map's config file. The review step says which settings this render reads.",
            "Written into this map's config file. The review step says which settings this render actually reads.",
            "Written into this map's config file, same as always. The review step says which of these settings this render actually reads.",
            "Written into this map's config file regardless of anything else. The review step is the one that says which of these settings this render actually bothers to read.",
        ],
        yue: [
            "會寫入呢張地圖嘅設定檔。覆核步驟會講邊啲設定係呢次算圖真係會讀嘅。",
            "會寫入呢張地圖嘅設定檔。覆核步驟會講邊啲設定係呢次算圖真係會讀嘅。",
            "會寫入呢張地圖嘅設定檔。覆核步驟會講返邊啲設定係呢次算圖真正會讀嘅。",
            "呢個一定會寫入呢張地圖嘅設定檔。至於邊啲設定係呢次算圖真係會讀，就要睇覆核步驟。",
            "呢個照樣會寫入呢張地圖嘅設定檔，冇得走雞。至於邊啲設定係呢次算圖真係有讀，就要睇覆核步驟至知。",
        ],
    },
    "world.options.unparsed": {
        en: [
            "The map config built from these answers does not parse, which is a fault in this app rather than in anything you chose. The review step shows the file as it stands.",
            "The map config built from these answers does not parse, which is a fault in this app rather than in anything you chose. The review step shows the file as it stands.",
            "The map config built from these answers does not parse, which is a fault in this app rather than in anything you chose. The review step shows the file as it stands.",
            "The map config built from these answers does not parse, and that is a fault in this app, not in anything you picked. The review step shows the file as it stands.",
            "The map config built from these answers does not parse, and that refusal is squarely a fault in this app, not one thing you picked. The review step shows the file as it stands, warts and all.",
        ],
        yue: [
            "根據呢啲答案整出嚟嘅地圖設定檔讀唔到，呢個係呢個程式嘅問題，唔係你揀錯咗啲乜。覆核步驟會顯示個檔案原本嘅樣。",
            "根據呢啲答案整出嚟嘅地圖設定檔讀唔到，呢個係呢個程式嘅問題，唔係你揀錯咗啲乜。覆核步驟會顯示個檔案原本嘅樣。",
            "根據呢啲答案整出嚟嘅地圖設定檔讀唔到，呢個係呢個程式嘅問題，唔係你揀錯咗啲乜。覆核步驟會顯示個檔案原本嘅樣。",
            "根據呢啲答案整出嚟嘅地圖設定檔讀唔到，呢個實實在在係呢個程式嘅問題，唔關你揀嘅嘢事。覆核步驟會顯示個檔案原本嘅樣。",
            "根據呢啲答案整出嚟嘅地圖設定檔死都讀唔到，呢個實牙實齒係呢個程式嘅問題，一啲都唔關你揀嘅嘢事。覆核步驟會顯示個檔案原本嘅樣，靚唔靚都照展示。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* MapStorageStep.vue                                                */
    /* ---------------------------------------------------------------- */

    "world.storage.blurb": {
        en: [
            "Rendered tiles, the copy of the viewer that serves them, and the files the engine needs while it works all go under this folder. A full render of a large world can be several gigabytes, so choose a drive with room on it.",
            "Rendered tiles, the copy of the viewer that serves them, and the files the engine needs while it works all go under this folder. A full render of a large world can be several gigabytes, so choose a drive with room on it.",
            "Rendered tiles, the copy of the viewer that serves them, and the files the engine needs while it works all go under this folder. A full render of a large world can run to several gigabytes, so choose a drive with room on it.",
            "Rendered tiles, the viewer that serves them, and everything the engine needs while it works all land under this folder. A full render of a large world can run to several gigabytes, so choose a drive with room on it.",
            "Rendered tiles, the viewer that serves them up, and everything the engine needs while it grinds away all pile into this folder. A full render of a large world can easily run to several gigabytes, so choose a drive with room on it, not the one already gasping for space.",
        ],
        yue: [
            "算好嘅圖磚、負責提供服務嘅檢視器副本，同埋引擎運作時需要嘅檔案，全部都會放喺呢個資料夾入面。大世界完整算一次圖可以去到幾 GB，所以揀隻有位嘅磁碟。",
            "算好嘅圖磚、負責提供服務嘅檢視器副本，同埋引擎運作時需要嘅檔案，全部都會放喺呢個資料夾入面。大世界完整算一次圖可以去到幾 GB，所以揀隻有位嘅磁碟。",
            "算好嘅圖磚、負責提供服務嘅檢視器副本，同埋引擎運作時需要嘅檔案，全部都會放喺呢個資料夾入面。大世界完整算一次圖隨時去到幾 GB，所以揀隻有位嘅磁碟。",
            "算好嘅圖磚、負責提供服務嘅檢視器，同埋引擎運作時要用嘅檔案，統統都放喺呢個資料夾入面。大世界完整算一次圖分分鐘去到幾 GB，所以揀隻有位嘅磁碟。",
            "算好嘅圖磚、負責派送嘅檢視器，同埋引擎運作嗰陣需要嘅嘢，全部一窩蜂塞入呢個資料夾。大世界完整算一次圖隨時去到幾 GB，所以揀隻有位嘅磁碟，唔好揀嗰隻已經爆晒滿嘅。",
        ],
    },
    "world.storage.applied": {
        en: [
            "Renders will be written here, from now on and not only this one.",
            "Renders will be written here, from now on and not only this one.",
            "Renders will be written here from now on, and not only this one.",
            "Every render lands here from now on, not only this one.",
            "Every render this app makes lands here from now on, not only this one, so this change outlives the wizard you are standing in.",
        ],
        yue: [
            "由而家開始，算圖會寫落呢度，唔止呢一次。",
            "由而家開始，算圖會寫落呢度，唔止呢一次。",
            "由而家開始，算圖會寫落呢度，唔止呢一次。",
            "由而家開始，算圖會寫落呢度，唔止呢一次咁簡單。",
            "由而家開始，每一次算圖都會寫落呢度，唔止呢一次，即係話呢個改動仲喺精靈完咗之後照樣生效。",
        ],
    },
    "world.storage.unknown": {
        en: [
            "The app did not say where it writes maps, so this is whatever is typed above. In the desktop app it arrives filled in with the real folder.",
            "The app did not say where it writes maps, so this is whatever is typed above. In the desktop app it arrives filled in with the real folder.",
            "The app did not say where it writes maps, so this is whatever is typed above. In the desktop app, it arrives already filled in with the real folder.",
            "This build did not say where it writes maps, so what is above is whatever got typed in. The desktop app fills that in with the real folder for you.",
            "This build did not say where it writes maps, and stayed quiet about it, so what is above is only whatever got typed in by hand. The desktop app arrives with the real folder already filled in.",
        ],
        yue: [
            "呢個程式冇講返佢寫地圖去邊，所以上面就係打咗乜就係乜。桌面程式會自動填返真正嘅資料夾。",
            "呢個程式冇講返佢寫地圖去邊，所以上面就係打咗乜就係乜。桌面程式會自動填返真正嘅資料夾。",
            "呢個程式冇講返佢寫地圖去邊，所以上面就係打咗乜就係乜。喺桌面程式度，佢會自動填返真正嘅資料夾。",
            "呢個版本冇講返佢寫地圖去邊，所以上面見到嘅就係人手打落嘅嘢。桌面程式會幫你自動填返真正嘅資料夾。",
            "呢個版本一聲不吭，冇講返佢寫地圖去邊，所以上面見到嘅淨係人手打落嘅嘢。桌面程式就聰明得多，直接幫你自動填埋真正嘅資料夾。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* MinecraftWorldList.vue                                            */
    /* ---------------------------------------------------------------- */

    "world.list.blurb": {
        en: [
            "Found in your Minecraft folder and in any folder you mount below. Choosing one fills in the world field; you can always type or drop a folder instead.",
            "Found in your Minecraft folder and in any folder you mount below. Choosing one fills in the world field; you can always type or drop a folder instead.",
            "Found in your Minecraft folder and in any folder you mount below. Choosing one fills in the world field; you can still type or drop a folder instead.",
            "Pulled from your Minecraft folder and from any folder you mount below. Choosing one fills in the world field for you, and you can still type or drop a folder instead.",
            "Pulled straight from your Minecraft folder and from any folder you mount below. Choosing one fills in the world field on the spot, and you can still type or drop a folder instead, for the traditionalists.",
        ],
        yue: [
            "會搵你嘅 Minecraft 資料夾，同埋你喺下面掛載嘅任何資料夾。揀一個就會自動填返世界欄位；你依然可以自己打字或者拖個資料夾落嚟代替。",
            "會搵你嘅 Minecraft 資料夾，同埋你喺下面掛載嘅任何資料夾。揀一個就會自動填返世界欄位；你依然可以自己打字或者拖個資料夾落嚟代替。",
            "會搵你嘅 Minecraft 資料夾，同埋你喺下面掛載嘅任何資料夾。揀一個就會自動填返世界欄位；你依然可以自己打字或者拖個資料夾落嚟。",
            "呢度嘅世界係喺你嘅 Minecraft 資料夾，同埋你喺下面掛載嘅資料夾入面搵返嚟。揀一個就會自動填返世界欄位；想自己打字或者拖個資料夾落嚟，一樣得。",
            "呢度啲世界係由你嘅 Minecraft 資料夾，加埋你喺下面掛載嘅資料夾自動搵返嚟。揀一個就會自動填返世界欄位；鍾意打字或者拖個資料夾落嚟嘅老派玩法，一樣照行。",
        ],
    },
    "world.mounts.already": {
        en: [
            "That folder is already in the list, as {label}. Its worlds are below.",
            "That folder is already in the list, as {label}. Its worlds are below.",
            "That folder is already in the list, as {label}. Its worlds are shown below.",
            "That folder is already in the list, as {label}. Its worlds are right there below.",
            "That folder is already in the list, going by {label}. No need to add it twice; its worlds are right there below.",
        ],
        yue: [
            "嗰個資料夾已經喺清單入面，叫做 {label}。佢嘅世界喺下面。",
            "嗰個資料夾已經喺清單入面，叫做 {label}。佢嘅世界喺下面。",
            "嗰個資料夾已經喺清單入面，叫做 {label}。佢嘅世界顯示喺下面。",
            "嗰個資料夾已經喺清單入面，叫做 {label}。佢嘅世界就喺下面。",
            "嗰個資料夾已經喺清單入面坐緊，叫做 {label}，唔使加多次。佢嘅世界就喺下面等緊你。",
        ],
    },
    "world.mounts.unmounted": {
        en: [
            "{label} is no longer in this list. Nothing on your disk was changed, and mounting it again brings it straight back.",
            "{label} is no longer in this list. Nothing on your disk was changed, and mounting it again brings it straight back.",
            "{label} is no longer in this list. Nothing on your disk was changed, and mounting it again brings it straight back.",
            "{label} is off this list now. Nothing on your disk was changed, and mounting it again brings it straight back.",
            "{label} has left this list, and that is the whole of it: Nothing on your disk was changed, and mounting it again brings it straight back, no worse for wear.",
        ],
        yue: [
            "{label} 已經唔喺呢個清單度。磁碟上冇任何嘢改變過，重新掛載就會即刻返嚟。",
            "{label} 已經唔喺呢個清單度。磁碟上冇任何嘢改變過，重新掛載就會即刻返嚟。",
            "{label} 已經唔喺呢個清單度。磁碟上冇任何嘢改變過，重新掛載就會即刻返嚟。",
            "{label} 而家唔喺清單度喇。磁碟上冇任何嘢改變過，重新掛載就會即刻返嚟。",
            "{label} 而家離開咗清單，就係咁多：磁碟上冇任何嘢改變過，重新掛載就會即刻返嚟，冇少過一嚿。",
        ],
    },
    /*
     * The aria-label on the unmount button, and the reason it needs a fact rather than just
     * a caption: see the doc comment at the top of `MinecraftWorldList.vue` -- "unmount"
     * beside a list of somebody's worlds reads as "delete" to a reasonable person unless
     * something right there says otherwise.
     */
    "world.mounts.unmountOne": {
        en: [
            "Unmount {label}. This only takes it out of this list and changes nothing on your disk.",
            "Unmount {label}. This only takes it out of this list and changes nothing on your disk.",
            "Unmount {label}. This only takes it out of this list and changes nothing on your disk.",
            "Unmount {label}. All this does is takes it out of this list; it changes nothing on your disk.",
            "Unmount {label}. All this ever does is takes it out of this list; it changes nothing on your disk, not one byte.",
        ],
        yue: [
            "卸載 {label}。呢個操作淨係將佢喺呢個清單度攞走，磁碟上乜都唔改。",
            "卸載 {label}。呢個操作淨係將佢喺呢個清單度攞走，磁碟上乜都唔改。",
            "卸載 {label}。呢個操作淨係將佢喺呢個清單度攞走，磁碟上乜都唔改。",
            "卸載 {label}。呢個動作淨係將佢喺呢個清單度攞走，磁碟上乜都唔改。",
            "卸載 {label}。呢個動作永遠淨係將佢喺呢個清單度攞走咁大把，磁碟上乜都唔改，一個位元組都唔會郁。",
        ],
    },
    "world.mounts.addHint": {
        en: [
            "Point it at a Minecraft folder or at the saves folder inside one. Unmounting later only takes it out of this list and never touches your worlds.",
            "Point it at a Minecraft folder or at the saves folder inside one. Unmounting later only takes it out of this list and never touches your worlds.",
            "Point it at a Minecraft folder, or at the saves folder inside one. Unmounting later only takes it out of this list and never touches your worlds.",
            "Point it at a Minecraft folder, or straight at the saves folder inside one. Unmounting it later only takes it off this list and never touches your worlds.",
            "Point it at a Minecraft folder, or straight at the saves folder tucked inside one. Unmounting it later only ever takes it off this list and never touches your worlds.",
        ],
        yue: [
            "指去一個 Minecraft 資料夾，或者入面嘅 saves 資料夾。之後想卸載，都淨係將佢喺清單度攞走，永遠唔會掂你嘅世界。",
            "指去一個 Minecraft 資料夾，或者入面嘅 saves 資料夾。之後想卸載，都淨係將佢喺清單度攞走，永遠唔會掂你嘅世界。",
            "指去一個 Minecraft 資料夾，或者直接指去入面嘅 saves 資料夾。之後想卸載，淨係將佢喺清單度攞走，永遠唔會掂你嘅世界。",
            "指去一個 Minecraft 資料夾，或者直接指去入面嗰個 saves 資料夾都得。之後卸載，都淨係將佢喺清單度攞走，永遠唔會掂你嘅世界。",
            "指去一個 Minecraft 資料夾，或者直接指去藏喺入面嗰個 saves 資料夾都冇問題。之後卸載，永遠都淨係將佢喺清單度攞走，永遠唔會掂你嘅世界。",
        ],
    },
    "world.list.noFolders": {
        en: [
            "No Minecraft folder was found on this computer. Mount one above if Minecraft lives somewhere unusual, or just type or drop the world folder in the field below.",
            "No Minecraft folder was found on this computer. Mount one above if Minecraft lives somewhere unusual, or just type or drop the world folder in the field below.",
            "No Minecraft folder was found on this computer. Mount one above if Minecraft lives somewhere unusual, or just type or drop the world folder in the field below.",
            "No Minecraft folder was found on this computer. Mount one above if yours lives somewhere unusual, or just type or drop the world folder in the field below.",
            "No Minecraft folder was found on this computer, near as anybody can tell. Mount one above if yours is hiding somewhere unusual, or just type or drop the world folder in the field below.",
        ],
        yue: [
            "呢部電腦搵唔到任何 Minecraft 資料夾。如果你嘅 Minecraft 放喺特別位置，就喺上面掛載一個；或者直接喺下面欄位打字或者拖個世界資料夾落嚟。",
            "呢部電腦搵唔到任何 Minecraft 資料夾。如果你嘅 Minecraft 放喺特別位置，就喺上面掛載一個；或者直接喺下面欄位打字或者拖個世界資料夾落嚟。",
            "呢部電腦搵唔到任何 Minecraft 資料夾。如果你嘅 Minecraft 放喺特別位置，就喺上面掛載一個；或者直接喺下面欄位打字或者拖個世界資料夾落去。",
            "呢部電腦搵唔到任何 Minecraft 資料夾。如果你部機嘅 Minecraft 放咗喺古怪位置，就喺上面掛載一個；或者索性喺下面欄位打字或者拖個世界資料夾落去。",
            "呢部電腦搵唔到任何 Minecraft 資料夾，好似真係冇裝過咁。如果你部機嘅 Minecraft 匿埋喺古怪位置，就喺上面掛載一個；或者乾脆喺下面欄位打字或者拖個世界資料夾落去。",
        ],
    },
    "world.list.noWorlds": {
        en: [
            "No worlds were found. It looked in: {places}. Mount another folder above, or type or drop a world folder in the field below.",
            "No worlds were found. It looked in: {places}. Mount another folder above, or type or drop a world folder in the field below.",
            "No worlds were found. It looked in: {places}. Mount another folder above, or type or drop a world folder in the field below.",
            "No worlds were found. Places checked: {places}. Mount another folder above, or type or drop a world folder in the field below.",
            "No worlds were found, not a single one. Places checked: {places}. Mount another folder above, or type or drop a world folder in the field below.",
        ],
        yue: [
            "搵唔到任何世界。搵過嘅位置係：{places}。喺上面掛載多一個資料夾，或者直接喺下面欄位打字或者拖個世界資料夾落去。",
            "搵唔到任何世界。搵過嘅位置係：{places}。喺上面掛載多一個資料夾，或者直接喺下面欄位打字或者拖個世界資料夾落去。",
            "搵唔到任何世界。搵過嘅位置係：{places}。喺上面掛載多一個資料夾，或者直接喺下面欄位打字或者拖個世界資料夾落去。",
            "搵唔到任何世界。實際搵過嘅位置：{places}。喺上面掛載多一個資料夾，或者索性喺下面欄位打字或者拖個世界資料夾落去。",
            "搵唔到任何世界，一個都冇。齋搵過嘅位置就係：{places}。喺上面掛載多一個資料夾，或者乾脆喺下面欄位打字或者拖個世界資料夾落去。",
        ],
    },
    "world.list.noMatch": {
        en: [
            "No world matches that search. Clearing it brings the whole list back.",
            "No world matches that search. Clearing it brings the whole list back.",
            "No world matches that search. Clearing it brings the whole list back.",
            "Nothing matches that search. Clearing it brings the whole list back.",
            "Not one world matches that search. Clearing it brings the whole list back, every world present and correct.",
        ],
        yue: [
            "冇世界符合呢個搜尋。清空就會攞返成個清單。",
            "冇世界符合呢個搜尋。清空就會攞返成個清單。",
            "冇世界符合呢個搜尋。清空就會攞返成個清單。",
            "一個世界都冇撞啱呢個搜尋。清空就會攞返成個清單。",
            "一個世界都冇撞啱呢個搜尋。清空就會攞返成個清單，一個都冇走漏。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* RenderRunPanel.vue                                                */
    /* ---------------------------------------------------------------- */

    /*
     * The line that keeps the app's own promise that it never switches renderer silently --
     * see the doc comment at the top of `RenderRunPanel.vue`. `{engine}` is the whole content
     * of the promise, so it stays literal at every level in both languages.
     */
    "world.run.engineLine": {
        en: [
            "Rendered by: {engine}",
            "Rendered by: {engine}",
            "Rendered by: {engine}",
            "Rendered by {engine}.",
            "The engine that gets the credit here: {engine}.",
        ],
        yue: [
            "由 {engine} 算出嚟。",
            "由 {engine} 算出嚟。",
            "由 {engine} 算出嚟。",
            "呢張圖係 {engine} 算出嚟嘅。",
            "呢張圖嘅功勞，全部歸 {engine}。",
        ],
    },
    "world.run.engineRan": {
        en: [
            "The engine that ran: {engine}",
            "The engine that ran: {engine}",
            "The engine that ran: {engine}",
            "The engine that actually ran this: {engine}",
            "The engine that actually did the work here: {engine}",
        ],
        yue: [
            "實際運作嘅引擎：{engine}",
            "實際運作嘅引擎：{engine}",
            "實際運作嘅引擎：{engine}",
            "真正跑呢次嘅引擎：{engine}",
            "真正落手落腳做嘢嘅引擎：{engine}",
        ],
    },
    "world.run.stopNote": {
        en: [
            "Stopping keeps every tile already drawn. Carrying on later picks up from where it stopped rather than starting again.",
            "Stopping keeps every tile already drawn. Carrying on later picks up from where it stopped rather than starting again.",
            "Stopping keeps every tile already drawn. Carrying on later picks up from where it stopped rather than starting again.",
            "Stopping this keeps every tile already drawn. Carry on later and it picks up from where it stopped, no restart needed.",
            "Stopping this keeps every tile already drawn, no exceptions. Carry on later and it picks up from where it stopped, so nothing here starts from scratch twice.",
        ],
        yue: [
            "停止會保留晒已經畫好嘅圖磚。之後想繼續，會由停低嗰度接住做，唔使由頭嚟過。",
            "停止會保留晒已經畫好嘅圖磚。之後想繼續，會由停低嗰度接住做，唔使由頭嚟過。",
            "停止會保留晒已經畫好嘅圖磚。之後想繼續，會由停低嗰度接住做，唔使由頭嚟過。",
            "撳停止會保留晒已經畫好嘅圖磚。之後想繼續，佢會準確由停低嗰度接住做，唔使重新開始。",
            "撳停止，保留晒已經畫好嘅圖磚，一塊都唔少。之後想繼續，佢會準準確確由停低嗰度接住做，永遠唔使由頭嚟兩次。",
        ],
    },
    "world.run.cancelledLine": {
        en: [
            "You stopped it. Every tile it had already drawn is still there, and starting this map again carries on from where it stopped.",
            "You stopped it. Every tile it had already drawn is still there, and starting this map again carries on from where it stopped.",
            "You stopped it. Every tile it had already drawn is still there, and starting this map again carries on from where it stopped.",
            "You stopped this one. Every tile it had already drawn is still there, and starting it again carries on from where it stopped.",
            "You called a halt to this one, and nothing was lost for it. Every tile it had already drawn is still there, and starting it again carries on from where it stopped.",
        ],
        yue: [
            "你停止咗呢次算圖。已經畫好嘅圖磚全部都仲喺度，再開始呢張圖會由停低嗰度繼續。",
            "你停止咗呢次算圖。已經畫好嘅圖磚全部都仲喺度，再開始呢張圖會由停低嗰度繼續。",
            "你停止咗呢次算圖。已經畫好嘅圖磚全部都仲喺度，再開始呢張圖會由停低嗰度繼續。",
            "呢次算圖係你叫停嘅。已經畫好嘅圖磚全部都仲喺度，再開始呢張圖會由停低嗰度繼續。",
            "呢次算圖係你親手叫停嘅，而且乜都冇蝕底：已經畫好嘅圖磚全部都仲喺度，再開始呢張圖會由停低嗰度繼續。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* WizardReviewStep.vue                                              */
    /* ---------------------------------------------------------------- */

    /* Mirrors `config.form.copied`/`config.form.copyFailed`: same clipboard, same shape,
     * naming the map config rather than a settings file. */
    "world.review.copied": {
        en: [
            "Copied the map config exactly as it stands.",
            "Copied the map config exactly as it stands.",
            "Copied the map config to the clipboard, exactly as it stands.",
            "Copied to the clipboard, exactly as the map config stands, with nothing tidied up.",
            "Copied to the clipboard, exactly as the map config stands: nothing tidied, nothing reordered, comments and all.",
        ],
        yue: [
            "已經原文複製咗個地圖設定檔。",
            "已經原文複製咗個地圖設定檔。",
            "已經原文複製咗個地圖設定檔去剪貼簿。",
            "已經原文複製咗個地圖設定檔去剪貼簿，冇幫佢執靚過。",
            "已經原文複製咗個地圖設定檔去剪貼簿：冇執靚、冇調次序，連註解都照抄。",
        ],
    },
    "world.review.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "Could not reach the clipboard, so nothing was copied. The map config itself is untouched.",
            "Could not reach the clipboard, so nothing was copied at all. The map config itself is untouched; only the copying failed.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "去唔到剪貼簿，所以乜都冇複製到。",
            "去唔到剪貼簿，所以乜都冇複製到。個地圖設定檔本身冇變過。",
            "去唔到剪貼簿，所以乜都冇複製到。個地圖設定檔本身原封不動；出事嘅淨係複製呢個步驟。",
        ],
    },
    "world.review.engineValue": {
        en: [
            "BlueMap's own engine, run locally. Its exact version is reported once it starts.",
            "BlueMap's own engine, run locally. Its exact version is reported once it starts.",
            "BlueMap's own engine, run locally on this machine. Its exact version is reported once it starts.",
            "BlueMap's own engine, run locally rather than anywhere else. Its exact version is reported once it starts.",
            "BlueMap's own engine, run locally and nowhere else. Its exact version is reported once it starts, no guessing needed.",
        ],
        yue: [
            "BlueMap 自己嘅引擎，喺本機運作。開始之後會報返實際版本。",
            "BlueMap 自己嘅引擎，喺本機運作。開始之後會報返實際版本。",
            "BlueMap 自己嘅引擎，喺本機運作，唔關其他機事。開始之後會報返實際版本。",
            "BlueMap 自己嘅引擎，一於喺本機運作，唔假手於人。開始之後會即刻報返實際版本。",
            "BlueMap 自己嘅引擎，實牙實齒喺本機運作，唔關第二部機事。開始之後會即刻報返實際版本，唔使亂咁估。",
        ],
    },
    /**
     * The honest-expectations disclosure at the point of commitment, right beside the
     * "Engine" fact it belongs next to. `welcome.cannot` in `setupStrings.ts` states the
     * same fact before the wizard is ever opened; this restates it here because somebody
     * who skipped past the welcome step, or is only now deciding whether to press the
     * render button, deserves to see it again right where the decision actually happens.
     */
    "world.review.javaValue": {
        en: [
            "If this computer does not already have a suitable Java runtime, the app fetches one into its own folder before rendering starts. It is not installed system-wide.",
            "If this computer does not already have a suitable Java runtime, the app fetches one into its own folder before rendering starts. It is not installed system-wide.",
            "If this computer does not already have a suitable Java runtime, the render sets one up first, fetched into its own folder. It is not installed system-wide.",
            "No suitable Java runtime on this machine? No bother. The app quietly fetches its own into its own folder before the first render, and it is not installed system-wide.",
            "Missing a Java runtime? Not your problem. The app happily fetches its own copy into its own folder the moment it is needed, and it is not installed system-wide, so your machine stays exactly as tidy as before.",
        ],
        yue: [
            "如果呢部電腦未有合適嘅 Java，算圖之前會幫你攞一份，放喺自己嘅資料夾入面，唔會裝落成部電腦。",
            "如果呢部電腦未有合適嘅 Java，算圖之前會幫你攞一份，放喺自己嘅資料夾入面，唔會裝落成部電腦。",
            "如果呢部電腦未有合適嘅 Java，算圖會自動幫手攞一份返嚟，放喺自己嘅資料夾，唔會裝落成部電腦。",
            "呢部機冇合適嘅 Java？唔緊要，程式會靜靜雞幫你攞一份，放喺自己嘅資料夾，唔會裝落成部電腦。",
            "冇 Java？唔關你事，程式一於自己攞一份返嚟，收埋喺自己嘅資料夾，一樣唔會裝落成部電腦，你部機照舊咁乾淨。",
        ],
    },
    "world.review.consentMissing": {
        en: [
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted yet, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, which come down from Mojang. That download has not been accepted, so this render would stop before it started.",
            "BlueMap builds its blocks from the Minecraft client files, which come down from Mojang. That download has not been accepted, so this render would stop before it started, every single time.",
        ],
        yue: [
            "BlueMap 起方塊要用 Minecraft client 檔案，呢啲檔案要向 Mojang 下載。呢個下載重未接受，所以呢次算圖未開始就會停低。",
            "BlueMap 起方塊要用 Minecraft client 檔案，呢啲檔案要向 Mojang 下載。呢個下載重未接受，所以呢次算圖未開始就會停低。",
            "BlueMap 起方塊要用 Minecraft client 檔案，呢啲檔案要向 Mojang 下載。呢個下載重未接受，所以呢次算圖未開始就會停低。",
            "BlueMap 起方塊靠嘅係 Minecraft client 檔案，要向 Mojang 下載返嚟。呢個下載重未接受，所以呢次算圖未開始就會停低。",
            "BlueMap 起方塊全靠 Minecraft client 檔案，要向 Mojang 攞返嚟，呢個下載重未接受，所以呢次算圖，次次都係未開始就會停低。",
        ],
    },
    "world.review.noEngine": {
        en: [
            "This build cannot render locally. Everything above is real and the map config below can be copied out, but starting a render needs the desktop app.",
            "This build cannot render locally. Everything above is real and the map config below can be copied out, but starting a render needs the desktop app.",
            "This build cannot render locally. Everything above is real, and the map config below can be copied out, but starting a render needs the desktop app.",
            "This build cannot render locally, though everything above is real and the map config below can be copied out. Starting a render still needs the desktop app.",
            "This build cannot render locally, full stop, though everything above is real and the map config below can be copied out. Starting an actual render still needs the desktop app.",
        ],
        yue: [
            "呢個版本喺本機算唔到圖。上面所有嘢都係真嘅，下面個地圖設定檔照樣複製得到，但係要開始算圖就要用桌面程式。",
            "呢個版本喺本機算唔到圖。上面所有嘢都係真嘅，下面個地圖設定檔照樣複製得到，但係要開始算圖就要用桌面程式。",
            "呢個版本喺本機算唔到圖。上面所有嘢都係真嘅，下面個地圖設定檔一樣複製得到，但係要開始算圖就要用桌面程式。",
            "呢個版本喺本機算唔到圖，不過上面所有嘢都係真嘅，下面個地圖設定檔隨時複製得。要真係開始算圖，就要用桌面程式。",
            "呢個版本喺本機算唔到圖，真係一啲都唔使幻想；不過上面所有嘢都係真嘅，下面個地圖設定檔就喺度等你複製。想真正開始算圖，一定要用桌面程式。",
        ],
    },
    "world.review.forceHint": {
        en: [
            "Off, only chunks that changed since the last render are drawn. On, every chunk is drawn again, which takes as long as the first render did.",
            "Off, only chunks that changed since the last render are drawn. On, every chunk is drawn again, which takes as long as the first render did.",
            "Off, only the chunks that changed since the last render are drawn. On, every chunk is drawn again, which takes as long as the first render did.",
            "Off, only the chunks that changed since the last render get redrawn. On, every chunk is drawn again, which takes as long as the very first render did.",
            "Off, only the chunks that changed since the last render bother getting redrawn. On, every chunk is drawn again, no exceptions, taking exactly as long as the very first render did.",
        ],
        yue: [
            "熄咗，就淨係畫返上次算圖之後改過嘅 chunk。開咗，就每個 chunk 都會再畫一次，同第一次算圖一樣咁耐。",
            "熄咗，就淨係畫返上次算圖之後改過嘅 chunk。開咗，就每個 chunk 都會再畫一次，同第一次算圖一樣咁耐。",
            "熄咗，淨係畫返上次算圖之後改過嘅 chunk；開咗，就每個 chunk 都會再畫一次，同第一次算圖一樣咁耐。",
            "熄咗，淨係得上次算圖之後改過嘅 chunk 先會再畫；開咗，就每個 chunk 都要再畫多次，時間同第一次算圖一樣長。",
            "熄咗，得返上次算圖之後改過嘅 chunk 先值得再畫；一開咗，就每個 chunk 都走唔甩，全部要再畫多次，時間同第一次算圖一模一樣咁長。",
        ],
    },
    "world.review.fixEdgesHint": {
        en: [
            "Redraws the seams between rendered areas, which is what fixes the visible lines left when a world grows.",
            "Redraws the seams between rendered areas, which is what fixes the visible lines left when a world grows.",
            "Redraws the seams between rendered areas, which is what fixes the visible lines left when a world grows.",
            "Redraws the seams where rendered areas meet, which is exactly what clears the visible lines left when a world grows.",
            "Redraws the seams where rendered areas meet, erasing precisely those visible lines left when a world grows.",
        ],
        yue: [
            "會重畫已算好嘅範圍之間嘅接口，用嚟修好世界擴大之後留低嘅明顯界線。",
            "會重畫已算好嘅範圍之間嘅接口，用嚟修好世界擴大之後留低嘅明顯界線。",
            "會重畫已算好嘅範圍之間嘅接口，用嚟修好世界擴大之後留低嗰啲明顯界線。",
            "會重畫已算好嘅範圍之間嘅接口，正正就係修好世界擴大之後留低嘅明顯界線。",
            "會重畫已算好嘅範圍之間嘅接口，一於清走世界擴大之後留低嘅明顯界線，一條都唔留。",
        ],
    },
    "world.review.metricsHint": {
        en: [
            "Off by default. The only download you agreed to is the Minecraft client; this is a separate outbound report and it is yours to turn on.",
            "Off by default. The only download you agreed to is the Minecraft client; this is a separate outbound report and it is yours to turn on.",
            "Off by default. The only download you agreed to is the Minecraft client; this is a separate outbound report, and it is yours to turn on.",
            "Off by default. What you agreed to was only the Minecraft client download; this is a separate outbound report, and switching it on is entirely your call.",
            "Off by default, and staying that way unless you say otherwise. What you agreed to was only the Minecraft client download; this is a completely separate outbound report, and turning it on is entirely your call.",
        ],
        yue: [
            "預設係熄嘅。你答應過嘅淨係下載 Minecraft client；呢個係另一個獨立嘅對外報告，開唔開由你決定。",
            "預設係熄嘅。你答應過嘅淨係下載 Minecraft client；呢個係另一個獨立嘅對外報告，開唔開由你決定。",
            "預設係熄嘅。你答應過嘅淨係下載 Minecraft client；呢個係另一個獨立嘅對外報告，開唔開係你話事。",
            "預設係熄嘅。你答應過嘅嘢淨係下載 Minecraft client；呢個係另一個獨立嘅對外報告，開唔開全部由你話事。",
            "預設係熄嘅，冇你話開先會開。你答應過嘅淨係下載 Minecraft client；呢個係另一個獨立嘅對外報告，開唔開百分百由你話事。",
        ],
    },
    "world.review.threadsHint": {
        en: [
            "Left empty, the engine uses every processor core but two, so the machine stays usable while it works.",
            "Left empty, the engine uses every processor core but two, so the machine stays usable while it works.",
            "Left empty, the engine uses every processor core but two, so the machine stays usable while it works.",
            "Leave it empty and the engine uses every processor core but two, so the machine stays usable while it works.",
            "Leave it empty and the engine helps itself to every processor core but two, so the machine stays usable the whole time it grinds away.",
        ],
        yue: [
            "留空嘅話，引擎會用晒所有處理器核心，淨係留返兩個，部機用得。",
            "留空嘅話，引擎會用晒所有處理器核心，淨係留返兩個，部機用得。",
            "留空嘅話，引擎照樣會用晒所有處理器核心，淨係留返兩個，部機用得。",
            "留空，引擎就會用晒所有處理器核心，淨係留返兩個，部機用得，唔會死機。",
            "留空唔理佢，引擎就會豪爽噉用晒所有處理器核心，都識淨係留返兩個，部機用得，仲有得郁。",
        ],
    },
    "world.review.noMatch": {
        en: [
            "No setting you changed matches that search. Clearing it brings the whole list back; the render is unaffected either way.",
            "No setting you changed matches that search. Clearing it brings the whole list back; the render is unaffected either way.",
            "No setting you changed matches that search. Clearing it brings the whole list back; the render is unaffected either way.",
            "Nothing you changed matches that search right now. Clearing it brings the whole list back; the render is unaffected either way.",
            "Not one setting you changed matches that search right now. Clearing it brings the whole list back, every one; the render is unaffected either way.",
        ],
        yue: [
            "冇你改過嘅設定符合呢個搜尋。清空就會攞返成個清單；點揀都唔會影響算圖。",
            "冇你改過嘅設定符合呢個搜尋。清空就會攞返成個清單；點揀都唔會影響算圖。",
            "冇你改過嘅設定符合呢個搜尋。清空就會攞返成個清單；點揀都唔會影響算圖。",
            "而家冇你改過嘅設定啱呢個搜尋。清空就會攞返成個清單；點揀都唔會影響算圖。",
            "而家一個你改過嘅設定都冇撞啱呢個搜尋。清空就會攞返成個清單，一個都冇走漏；點揀都唔會影響算圖。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* WorldFolderStep.vue                                               */
    /* ---------------------------------------------------------------- */

    "world.folder.dropEmpty": {
        en: [
            "That drop carried no file or folder. Drag the world folder itself from your file manager.",
            "That drop carried no file or folder. Drag the world folder itself from your file manager.",
            "That drop carried no file or folder. Drag the world folder itself from your file manager.",
            "That drop carried no file or folder. Drag the world folder itself out of your file manager instead.",
            "That drop carried no file or folder at all. Drag the world folder itself straight out of your file manager instead.",
        ],
        yue: [
            "嗰次拖放冇帶任何檔案或者資料夾。請由你嘅檔案總管直接拖個世界資料夾嚟。",
            "嗰次拖放冇帶任何檔案或者資料夾。請由你嘅檔案總管直接拖個世界資料夾嚟。",
            "嗰次拖放冇帶任何檔案或者資料夾。請由你嘅檔案總管直接拖個世界資料夾嚟。",
            "嗰次拖放冇帶任何檔案或者資料夾。請直接由你嘅檔案總管拖個世界資料夾出嚟。",
            "嗰次拖放兩手空空，冇帶任何檔案或者資料夾。請直接由你嘅檔案總管，實實在在拖個世界資料夾出嚟。",
        ],
    },
    "world.folder.dropUnsupported": {
        en: [
            "This build cannot tell where a dropped folder is. Use Browse, or type the full path in the field above.",
            "This build cannot tell where a dropped folder is. Use Browse, or type the full path in the field above.",
            "This build cannot tell where a dropped folder is. Use Browse, or type the full path in the field above.",
            "This build cannot tell where a dropped folder is. Use Browse instead, or type the full path into the field above.",
            "This build simply cannot tell where a dropped folder is. Use Browse instead, or type the full path into the field above yourself.",
        ],
        yue: [
            "呢個版本睇唔到拖落嚟嘅資料夾喺邊。請用「瀏覽」，或者直接喺上面欄位打全路徑。",
            "呢個版本睇唔到拖落嚟嘅資料夾喺邊。請用「瀏覽」，或者直接喺上面欄位打全路徑。",
            "呢個版本睇唔到拖落嚟嘅資料夾喺邊。請用「瀏覽」，或者直接喺上面欄位打全路徑。",
            "呢個版本根本睇唔到拖落嚟嘅資料夾喺邊。改用「瀏覽」，或者直接喺上面欄位打全路徑。",
            "呢個版本完全睇唔到拖落嚟嘅資料夾喺邊。老老實實改用「瀏覽」，又或者自己喺上面欄位打全路徑。",
        ],
    },
    "world.folder.blurb": {
        en: [
            "Point this at a Minecraft save folder. That is the folder holding level.dat and a region folder: on a server it is usually called world, and in the game it lives under saves.",
            "Point this at a Minecraft save folder. That is the folder holding level.dat and a region folder: on a server it is usually called world, and in the game it lives under saves.",
            "Point this at a Minecraft save folder. That is the folder holding level.dat and a region folder: on a server it is usually called world, and in the game it lives under saves.",
            "Point this at a Minecraft save folder: the one holding level.dat and a region folder. On a server it is usually called world; in the game it lives under saves.",
            "Point this at a genuine Minecraft save folder: the one holding level.dat and a region folder, no more and no less. On a server it is usually called world; in the game it lives under saves.",
        ],
        yue: [
            "呢度要指向一個 Minecraft 存檔資料夾，即係入面有 level.dat 同 region 資料夾嗰個：喺伺服器通常叫 world，喺遊戲入面就喺 saves 底下。",
            "呢度要指向一個 Minecraft 存檔資料夾，即係入面有 level.dat 同 region 資料夾嗰個：喺伺服器通常叫 world，喺遊戲入面就喺 saves 底下。",
            "呢度要指向一個 Minecraft 存檔資料夾，即係入面有 level.dat 同 region 資料夾嗰個：喺伺服器通常叫 world，喺遊戲入面就喺 saves 底下。",
            "指向一個 Minecraft 存檔資料夾：即係有 level.dat 同 region 資料夾嗰個。喺伺服器通常叫 world；喺遊戲入面就喺 saves 底下。",
            "指向一個貨真價實嘅 Minecraft 存檔資料夾：淨係要有 level.dat 同 region 資料夾，多一樣少一樣都唔係。喺伺服器通常叫 world；喺遊戲入面就匿埋喺 saves 底下。",
        ],
    },
    "world.folder.noPicker": {
        en: [
            "There is no folder picker in this build, so type or paste the full path. Local rendering needs the desktop app.",
            "There is no folder picker in this build, so type or paste the full path. Local rendering needs the desktop app.",
            "There is no folder picker in this build, so type or paste the full path. Local rendering needs the desktop app.",
            "This build has no folder picker, so type or paste the full path by hand. Local rendering needs the desktop app.",
            "This build simply has no folder picker at all, so type or paste the full path by hand. Local rendering needs the desktop app.",
        ],
        yue: [
            "呢個版本冇資料夾揀選器，所以要自己打或者貼全路徑。本機算圖要用桌面程式。",
            "呢個版本冇資料夾揀選器，所以要自己打或者貼全路徑。本機算圖要用桌面程式。",
            "呢個版本冇資料夾揀選器，所以要自己打或者貼全路徑。本機算圖要用桌面程式。",
            "呢個版本根本冇資料夾揀選器，所以要自己打或者貼全路徑。本機算圖要用桌面程式。",
            "呢個版本完全冇資料夾揀選器呢樣嘢，所以老老實實自己打或者貼全路徑。本機算圖要用桌面程式。",
        ],
    },
    /*
     * "算圖一開始就會講" is the pinned fact rather than a shorter "算圖會講" fragment: natural
     * Cantonese needs the connective in between, and forcing an unnatural contraction would
     * fight the sentence to satisfy the test rather than protect the fact.
     */
    "world.folder.cannotCheck": {
        en: [
            "This build cannot look inside a folder, so the world is taken as given. If it is not a world, the render will say so when it starts.",
            "This build cannot look inside a folder, so the world is taken as given. If it is not a world, the render will say so when it starts.",
            "This build cannot look inside a folder, so the world is taken as given. If it is not a world, the render will say so when it starts.",
            "This build cannot look inside a folder, so the world is taken as given. If it turns out not to be one, the render will say so when it starts.",
            "This build simply cannot look inside a folder, so the world is taken as given. If it turns out not to be one, the render will say so when it starts.",
        ],
        yue: [
            "呢個版本睇唔到資料夾入面嘅嘢，所以個世界會照單全收。如果原來唔係世界，算圖一開始就會講。",
            "呢個版本睇唔到資料夾入面嘅嘢，所以個世界會照單全收。如果原來唔係世界，算圖一開始就會講。",
            "呢個版本睇唔到資料夾入面嘅嘢，所以個世界會照單全收。如果原來唔係世界，算圖一開始就會講。",
            "呢個版本根本睇唔到資料夾入面有咩，所以個世界就照單全收。如果原來唔係世界，算圖一開始就會講。",
            "呢個版本完全睇唔到資料夾入面嘅嘢，所以個世界一於照單全收，信晒佢。如果原來唔係世界，算圖一開始就會講。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* WorldScreen.vue                                                   */
    /* ---------------------------------------------------------------- */

    "world.screen.noBridge": {
        en: [
            "This build cannot start a render. Local rendering needs the desktop app.",
            "This build cannot start a render. Local rendering needs the desktop app.",
            "This build cannot start a render. Local rendering needs the desktop app.",
            "This build cannot start a render at all. Local rendering needs the desktop app.",
            "This build simply cannot start a render, full stop. Local rendering needs the desktop app.",
        ],
        yue: [
            "呢個版本開始唔到算圖。本機算圖要用桌面程式。",
            "呢個版本開始唔到算圖。本機算圖要用桌面程式。",
            "呢個版本開始唔到算圖。本機算圖要用桌面程式。",
            "呢個版本根本開始唔到算圖。本機算圖要用桌面程式。",
            "呢個版本完全開始唔到算圖，冇得傾。本機算圖要用桌面程式。",
        ],
    },
    "world.screen.runningBlurb": {
        en: [
            "These are being drawn on this machine at this moment. They are not waiting to be carried on, and starting one of them again would only be refused.",
            "These are being drawn on this machine at this moment. They are not waiting to be carried on, and starting one of them again would only be refused.",
            "These are being drawn on this machine at this moment. They are not waiting to be carried on, and starting one of them again would only be refused.",
            "These are being drawn on this machine right now. They are not waiting to be carried on, and starting one of them again would only be refused.",
            "These are being drawn on this machine at this very moment. They are not waiting to be carried on, and starting one of them again would only be refused.",
        ],
        yue: [
            "呢啲係呢部機正在畫緊嘅。佢哋唔係等緊被繼續，再撳一次開始都只會俾人拒絕。",
            "呢啲係呢部機正在畫緊嘅。佢哋唔係等緊被繼續，再撳一次開始都只會俾人拒絕。",
            "呢啲係呢部機正在畫緊嘅。佢哋唔係等緊被繼續，再撳一次開始都只會俾人拒絕。",
            "呢啲確實係呢部機正在畫緊嘅。佢哋唔係等緊被繼續，再撳一次開始都只會俾人拒絕。",
            "呢啲的的確確係呢部機正在畫緊嘅。佢哋唔係等緊被繼續，再撳一次開始都只會俾人拒絕。",
        ],
    },
    "world.screen.wroteProject": {
        en: [
            "Those answers are now a project at the root of that world, so this render can be repeated without setting anything up again. Every other setting BlueMap has is in the editor.",
            "Those answers are now a project at the root of that world, so this render can be repeated without setting anything up again. Every other setting BlueMap has is in the editor.",
            "Those answers are now a project at the root of that world, so this render can be repeated without setting anything up again. Every other setting BlueMap has is in the editor.",
            "Those answers are now a project at the root of that world, so this render can be repeated without setting anything up again. Every other setting BlueMap has is waiting in the editor.",
            "Those five answers are now a project at the root of that world, so this render can be repeated without setting anything up again. Every other setting BlueMap has is right there waiting in the editor.",
        ],
        yue: [
            "嗰啲答案而家已經變成一個項目，放咗喺個世界嘅根目錄，之後想再算呢張圖，唔使再設定過。BlueMap 其他所有設定都喺編輯器入面。",
            "嗰啲答案而家已經變成一個項目，放咗喺個世界嘅根目錄，之後想再算呢張圖，唔使再設定過。BlueMap 其他所有設定都喺編輯器入面。",
            "嗰啲答案而家已經變成一個項目，放咗喺個世界嘅根目錄，之後想再算呢張圖，唔使再設定過。BlueMap 其他所有設定都喺編輯器入面。",
            "嗰啲答案而家變成一個項目，放咗喺個世界嘅根目錄，之後想再算呢張圖，唔使再設定過。BlueMap 其他所有設定，都喺編輯器入面等緊你。",
            "嗰五條答案而家變成一個項目，放咗喺個世界嘅根目錄，之後想再算呢張圖，唔使再設定過。BlueMap 其他所有設定，一早喺編輯器入面等緊你。",
        ],
    },
    "world.screen.projectFailed": {
        en: [
            "The render is going ahead, but the project file could not be written into the world folder, so these answers are not kept: {message}",
            "The render is going ahead, but the project file could not be written into the world folder, so these answers are not kept: {message}",
            "The render is going ahead, but the project file could not be written into the world folder, so these answers are not kept: {message}",
            "The render is going ahead regardless, but the project file could not be written into the world folder, so these answers are not kept: {message}",
            "The render is going ahead regardless, but the project file could not be written into the world folder at all, so these answers are not kept: {message}",
        ],
        yue: [
            "算圖照樣繼續，不過項目檔案寫唔入個世界資料夾，所以呢啲答案冇保留低：{message}",
            "算圖照樣繼續，不過項目檔案寫唔入個世界資料夾，所以呢啲答案冇保留低：{message}",
            "算圖照樣繼續，不過項目檔案寫唔入個世界資料夾，所以呢啲答案冇保留低：{message}",
            "算圖照樣繼續，不受影響，不過項目檔案寫唔入個世界資料夾，所以呢啲答案就冇保留低：{message}",
            "算圖照樣繼續，義無反顧噉，不過項目檔案寫唔入個世界資料夾，所以呢啲答案冇保留低：{message}",
        ],
    },
    "world.screen.blurb": {
        en: [
            "Point this at a Minecraft world, answer five short steps, and BlueMap renders it into a map you can walk around. It writes a project into that world as it goes, so the answers are kept: rendering it again is one button, and every setting this guide did not ask about is on the Projects tab.",
            "Point this at a Minecraft world, answer five short steps, and BlueMap renders it into a map you can walk around. It writes a project into that world as it goes, so the answers are kept: rendering it again is one button, and every setting this guide did not ask about is on the Projects tab.",
            "Point this at a Minecraft world, answer five short steps, and BlueMap renders it into a map you can walk around. It writes a project into that world as it goes, so the answers are kept: rendering it again is one button, and every setting this guide did not ask about is on the Projects tab.",
            "Point this at a Minecraft world, answer five short steps, and BlueMap renders it into a map you can walk around. It writes a project into that world as it goes, so the answers are kept: rendering it again is one button, and every setting this guide skipped is on the Projects tab.",
            "Point this at a Minecraft world, answer five short steps, and BlueMap turns it into a map you can wander around. It writes a project into that world as it goes, so the answers are kept for good: rendering it again is one button, and every setting this guide never asked about is on the Projects tab.",
        ],
        yue: [
            "呢度指向一個 Minecraft 世界，答完五個簡短步驟，BlueMap 就會算成一張你行得入去嘅地圖。過程入面會喺個世界寫低一個項目，答案會保留低：之後想再算就淨係撳一個掣，呢個精靈冇問過嘅設定都喺 Projects 分頁。",
            "呢度指向一個 Minecraft 世界，答完五個簡短步驟，BlueMap 就會算成一張你行得入去嘅地圖。過程入面會喺個世界寫低一個項目，答案會保留低：之後想再算就淨係撳一個掣，呢個精靈冇問過嘅設定都喺 Projects 分頁。",
            "呢度指向一個 Minecraft 世界，答完五個簡短步驟，BlueMap 就會算成一張你行得入去嘅地圖。過程入面會喺個世界寫低一個項目，答案會保留低：之後想再算就淨係撳一個掣，呢個精靈冇問過嘅設定都喺 Projects 分頁。",
            "呢度指向一個 Minecraft 世界，答完五個簡短步驟，BlueMap 就會算成一張你行得入去嘅地圖。過程入面會喺個世界寫低一個項目，答案會保留低，唔使問多次：之後再算撳一個掣就得，呢個精靈冇問過嘅設定，全部都喺 Projects 分頁。",
            "呢度指向一個 Minecraft 世界，答完五個簡短步驟，BlueMap 就會將佢變成一張任你行圈嘅地圖。過程入面會喺個世界寫低一個項目，答案會保留低，永遠都唔使問多次：之後再算撳一個掣就搞掂，呢個精靈冇問過嘅設定，一早喺 Projects 分頁等緊你。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* WorldWizard.vue                                                   */
    /* ---------------------------------------------------------------- */

    "world.wizard.easyMode": {
        en: [
            "Easy mode. Five short questions, sensible answers for the rest, and a project file written at the end so nothing has to be answered twice. Everything BlueMap can be told is in the project editor afterwards.",
            "Easy mode. Five short questions, sensible answers for the rest, and a project file written at the end so nothing has to be answered twice. Everything BlueMap can be told is in the project editor afterwards.",
            "Easy mode. Five short questions, sensible answers for the rest, and a project file written at the end so nothing has to be answered twice. Everything BlueMap can be told is in the project editor afterwards.",
            "Easy mode: Five short questions, sensible answers for the rest, and a project file written at the end so nothing gets asked twice. Everything BlueMap can be told lives in the project editor afterwards.",
            "This is the easy mode: Five short questions, sensible answers standing in for the rest, and a project file written at the end so absolutely nothing gets asked twice. Everything BlueMap can possibly be told lives in the project editor afterwards, waiting.",
        ],
        yue: [
            "簡易模式。五條簡短問題，其餘用合理嘅答案頂住，最後仲會寫低一個項目檔案，等你唔使再答多次。BlueMap 收得嘅嘢，之後全部都喺項目編輯器入面。",
            "簡易模式。五條簡短問題，其餘用合理嘅答案頂住，最後仲會寫低一個項目檔案，等你唔使再答多次。BlueMap 收得嘅嘢，之後全部都喺項目編輯器入面。",
            "簡易模式。五條簡短問題，其餘用合理嘅答案頂住，最後仲會寫低一個項目檔案，等你唔使再答多次。BlueMap 收得嘅嘢，之後全部都喺項目編輯器入面。",
            "呢個係簡易模式：五條簡短問題，其餘就用合理嘅答案頂住，最後寫低一個項目檔案，等你一條問題都唔使答多次。BlueMap 識收嘅嘢，之後全部喺項目編輯器等緊你。",
            "呢個係簡易模式：五條簡短問題，其餘就用合理嘅答案頂住頭陣，最後寫低一個項目檔案，等你一條問題都唔使問多次。BlueMap 識收嘅所有嘢，之後全部乖乖坐喺項目編輯器度等你。",
        ],
    },
    "world.wizard.hasProject": {
        en: [
            "This world already has a project, {name}, with {maps} maps in it. Opening it keeps everything that was set up; carrying on here adds another map and leaves the rest alone.",
            "This world already has a project, {name}, with {maps} maps in it. Opening it keeps everything that was set up; carrying on here adds another map and leaves the rest alone.",
            "This world already has a project, {name}, with {maps} maps in it. Opening it keeps everything that was set up; carrying on here adds another map and leaves the rest alone.",
            "This world already has a project called {name}, with {maps} maps in it. Opening it keeps everything that was set up; carrying on here adds another map and leaves the rest alone.",
            "This world already has a project of its own, {name}, with {maps} maps in it. Opening it keeps everything that was set up; carrying on here adds another map and leaves the rest alone.",
        ],
        yue: [
            "呢個世界已經有一個項目，叫 {name}，入面有 {maps} 張地圖。打開佢會保留晒已經設定好嘅嘢；喺呢度繼續就會加多一張地圖，其餘唔會改動。",
            "呢個世界已經有一個項目，叫 {name}，入面有 {maps} 張地圖。打開佢會保留晒已經設定好嘅嘢；喺呢度繼續就會加多一張地圖，其餘唔會改動。",
            "呢個世界已經有一個項目，叫 {name}，入面有 {maps} 張地圖。打開佢會保留晒已經設定好嘅嘢；喺呢度繼續就會加多一張地圖，其餘唔會改動。",
            "呢個世界已經有個叫 {name} 嘅項目，入面有 {maps} 張地圖。打開佢會保留晒已經設定好嘅嘢；喺呢度繼續就會加多一張地圖，其餘保持原狀。",
            "呢個世界原來已經有自己嘅項目 {name}，入面裝住 {maps} 張地圖。打開佢會保留晒已經設定好嘅嘢；喺呢度繼續就會加多一張地圖，其餘一律原封不動。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* renderRun.ts: the run narrating itself into the console            */
    /* ---------------------------------------------------------------- */

    /*
     * `SIGNALS` in `renderRun.ts` builds `{ key, fallback, values }` objects consumed as
     * `t(text.key, text.values, text.fallback)` in `components/console/RenderConsole.vue` --
     * `text.key` is a property read, never a literal string in a `t(...)` call, so no scan
     * of this package's source (the coverage scanner here or the call-site scanner in
     * `appCopy.test.ts`) can ever find a call site for `world.console.signal.*`. A prior
     * pass voiced these anyway and the finalize pass that registered this module into the
     * merged catalogue found the orphan: `appCopy.test.ts`'s "finds a call site for every
     * key in the catalogue" check failed the moment these keys became reachable. Removed
     * here rather than kept, matching the precedent `downloads.ts` already set for the same
     * shape (`downloads.size.tb`/`gb`/`mb`/`kb` are UNITS built the identical way and are
     * deliberately left uncatalogued for this exact reason -- only `downloads.size.b`, which
     * has a literal call site, is voiced). Fixing the underlying gap would mean adding a
     * literal `t("world.console.signal.starting", ...)` call somewhere `RenderConsole.vue`
     * or `renderRun.ts` actually reaches, which is an application-code change outside this
     * copy pass.
     */

    /* ---------------------------------------------------------------- */
    /* renderRun.ts: what a failure means and where to fix it             */
    /* ---------------------------------------------------------------- */

    "world.run.fail.consent": {
        en: [
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download is accepted once, in Settings, and it has not been. Nothing was started and nothing was written.",
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download is accepted once, in Settings, and it has not been. Nothing was started and nothing was written.",
            "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download is accepted once, in Settings, and it has not been. Nothing was started and nothing was written.",
            "BlueMap builds its blocks from the Minecraft client files, which come down from Mojang. That download is accepted once, in Settings, and it has not been. Nothing was started and nothing was written.",
            "BlueMap builds its blocks from the Minecraft client files, which come down from Mojang. That download is accepted once, in Settings, and it has not been yet. Nothing was started and nothing was written.",
        ],
        yue: [
            "BlueMap 起方塊要用 Minecraft client 檔案，要向 Mojang 下載。呢個下載淨係要喺設定入面接受一次，但重未接受過。乜都未開始，乜都未寫過。",
            "BlueMap 起方塊要用 Minecraft client 檔案，要向 Mojang 下載。呢個下載淨係要喺設定入面接受一次，但重未接受過。乜都未開始，乜都未寫過。",
            "BlueMap 起方塊要用 Minecraft client 檔案，要向 Mojang 下載。呢個下載淨係要喺設定入面接受一次，但重未接受過。乜都未開始，乜都未寫過。",
            "BlueMap 起方塊靠嘅係 Minecraft client 檔案，要向 Mojang 下載。呢個下載淨係要喺設定入面接受一次，不過重未接受過。乜都未開始，乜都未寫過。",
            "BlueMap 起方塊全靠 Minecraft client 檔案，要向 Mojang 下載，而呢個下載淨係要喺設定入面接受一次，到而家都重未接受。乜都未開始，乜都未寫過。",
        ],
    },
    "world.run.fail.java": {
        en: [
            "The BlueMap engine runs on Java, and no Java runtime new enough to run it was found on this machine. The app can fetch one for you, or you can point it at one you already have.",
            "The BlueMap engine runs on Java, and no Java runtime new enough to run it was found on this machine. The app can fetch one for you, or you can point it at one you already have.",
            "The BlueMap engine runs on Java, and no Java runtime new enough to run it was found on this machine. The app can fetch one for you, or you can point it at one you already have.",
            "The BlueMap engine runs on Java, and this machine has no Java runtime new enough for it. The app can fetch one for you, or you can point it at one you already have.",
            "The BlueMap engine runs on Java, and this machine simply has no Java runtime new enough for it. The app can fetch one for you, or you can point it at one you already have.",
        ],
        yue: [
            "BlueMap 引擎要靠 Java 運行，而呢部機搵唔到夠新嘅 Java 執行環境。呢個程式可以幫你攞一個，或者你可以指向一個你已經有嘅。",
            "BlueMap 引擎要靠 Java 運行，而呢部機搵唔到夠新嘅 Java 執行環境。呢個程式可以幫你攞一個，或者你可以指向一個你已經有嘅。",
            "BlueMap 引擎要靠 Java 運行，而呢部機搵唔到夠新嘅 Java 執行環境。呢個程式可以幫你攞一個，或者你可以指向一個你已經有嘅。",
            "BlueMap 引擎要靠 Java 運行，不過呢部機冇夠新嘅 Java 執行環境。呢個程式可以幫你攞一個，或者你可以指向一個你已經有嘅。",
            "BlueMap 引擎要靠 Java 先郁得，可惜呢部機根本冇夠新嘅 Java 執行環境。呢個程式可以幫你攞一個，或者你可以指向一個你已經有嘅。",
        ],
    },
    "world.run.fail.engineMissing": {
        en: [
            "The BlueMap engine itself is not installed in this build, so there was nothing to run. The detail below lists the folders that were searched.",
            "The BlueMap engine itself is not installed in this build, so there was nothing to run. The detail below lists the folders that were searched.",
            "The BlueMap engine itself is not installed in this build, so there was nothing to run. The detail below lists the folders that were searched.",
            "The BlueMap engine itself is not installed in this build, so there was nothing to run at all. The detail below lists the folders that were searched.",
            "The BlueMap engine itself is not installed in this build, so there was genuinely nothing to run. The detail below lists the folders that were searched.",
        ],
        yue: [
            "呢個版本冇裝 BlueMap 引擎本身，所以冇嘢可以運行。下面嘅細節會列出搜尋過嘅資料夾。",
            "呢個版本冇裝 BlueMap 引擎本身，所以冇嘢可以運行。下面嘅細節會列出搜尋過嘅資料夾。",
            "呢個版本冇裝 BlueMap 引擎本身，所以冇嘢可以運行。下面嘅細節會列出搜尋過嘅資料夾。",
            "呢個版本根本冇裝 BlueMap 引擎本身，所以完全冇嘢可以運行。下面嘅細節會列出搜尋過嘅資料夾。",
            "呢個版本從頭到尾都冇裝 BlueMap 引擎本身，所以真係一啲嘢都冇得運行。下面嘅細節會列出搜尋過嘅資料夾。",
        ],
    },
    "world.run.fail.world": {
        en: [
            "The world folder could not be read when the render started. It may have been moved, renamed, or be on a drive that is not connected.",
            "The world folder could not be read when the render started. It may have been moved, renamed, or be on a drive that is not connected.",
            "The world folder could not be read when the render started. It may have been moved, renamed, or be on a drive that is not connected.",
            "The world folder could not be read when this render started. It may have been moved, renamed, or be on a drive that is not connected.",
            "The world folder could not be read when this render started at all. It may have been moved, renamed, or be on a drive that is not connected.",
        ],
        yue: [
            "算圖開始嗰陣，讀唔到個世界資料夾。可能已經搬咗、改咗名，或者喺一隻冇連接嘅磁碟入面。",
            "算圖開始嗰陣，讀唔到個世界資料夾。可能已經搬咗、改咗名，或者喺一隻冇連接嘅磁碟入面。",
            "算圖開始嗰陣，讀唔到個世界資料夾。可能已經搬咗、改咗名，或者喺一隻冇連接嘅磁碟入面。",
            "呢次算圖開始嗰陣，讀唔到個世界資料夾。可能已經搬咗、改咗名，或者仲喺一隻冇連接嘅磁碟入面。",
            "呢次算圖開始嗰陣，讀唔到個世界資料夾。可能早就搬咗、改咗名，甚至仲擺喺一隻冇連接嘅磁碟入面。",
        ],
    },
    "world.run.fail.storage": {
        en: [
            "The folder maps are written to could not be created or written. It may be read-only, full, or on a drive that is not connected.",
            "The folder maps are written to could not be created or written. It may be read-only, full, or on a drive that is not connected.",
            "The folder maps are written to really could not be created or written. It may be read-only, full, or on a drive that is not connected.",
            "The folder maps are written to could not be created or written. It may be read-only, full, or on a drive that is not connected.",
            "The folder maps are written to could not be created or written at all. It may be read-only, full, or on a drive that is not connected.",
        ],
        yue: [
            "地圖寫入嘅資料夾建立唔到，或者寫唔到入去。可能係唯讀、爆滿，或者喺一隻冇連接嘅磁碟入面。",
            "地圖寫入嘅資料夾建立唔到，或者寫唔到入去。可能係唯讀、爆滿，或者喺一隻冇連接嘅磁碟入面。",
            "地圖寫入嘅資料夾真係建立唔到，或者寫唔到入去。可能係唯讀、爆滿，或者喺一隻冇連接嘅磁碟入面。",
            "地圖寫入嘅資料夾建立唔到，都寫唔入去。可能係唯讀、爆滿，或者仲喺一隻冇連接嘅磁碟入面。",
            "地圖寫入嘅資料夾根本建立唔到，寫都寫唔入去。可能係唯讀、爆滿，甚至擺喺一隻冇連接嘅磁碟入面。",
        ],
    },
    "world.run.fail.request": {
        en: [
            "The render was refused before anything ran, so nothing was written. The message above says exactly which part of the request was refused.",
            "The render was refused before anything ran, so nothing was written. The message above says exactly which part of the request was refused.",
            "The render was really refused before anything ran, so nothing was written. The message above says exactly which part of the request was refused.",
            "The render was refused before anything ran, so nothing was written. The message above says exactly which part of the request was refused.",
            "The render was refused before anything ran at all, so nothing was written. The message above says exactly which part of the request was refused.",
        ],
        yue: [
            "算圖喺運行之前就被拒絕，所以乜都未寫過。上面嗰句訊息會講明係請求邊部分俾人拒絕。",
            "算圖喺運行之前就被拒絕，所以乜都未寫過。上面嗰句訊息會講明係請求邊部分俾人拒絕。",
            "算圖喺運行之前就被拒絕，所以乜都未寫過。上面嗰句訊息會講明係請求邊部分俾人拒絕。",
            "呢次算圖喺運行之前就被拒絕，所以乜都未寫過。上面嗰句訊息會講明係請求邊部分俾人拒絕。",
            "呢次算圖喺運行之前就被拒絕，乜都未寫過。上面嗰句訊息會清清楚楚講明佢反對嗰個請求嘅邊部分。",
        ],
    },
    "world.run.fail.nothing": {
        en: [
            "The engine ran and finished without rendering a single map. That usually means the dimension chosen has no region files in this world, so there was nothing to draw.",
            "The engine ran and finished without rendering a single map. That usually means the dimension chosen has no region files in this world, so there was nothing to draw.",
            "The engine really ran and finished without rendering a single map. That usually means the dimension chosen has no region files in this world, so there was nothing to draw.",
            "The engine ran and finished without rendering a single map. That usually means the dimension chosen has no region files in this world, so there was nothing to draw.",
            "The engine ran and finished without rendering a single map. That usually means the dimension chosen has no region files in this world at all, so there was nothing to draw.",
        ],
        yue: [
            "引擎運行完成，但係一張地圖都冇算出過。通常代表揀嘅維度喺呢個世界冇任何區域檔案，所以冇嘢可以畫。",
            "引擎運行完成，但係一張地圖都冇算出過。通常代表揀嘅維度喺呢個世界冇任何區域檔案，所以冇嘢可以畫。",
            "引擎運行完成，但係一張地圖都冇算出過。通常代表揀嘅維度喺呢個世界冇任何區域檔案，所以冇嘢可以畫。",
            "引擎運行完成，不過連一張地圖都冇算出過。通常代表揀嘅維度喺呢個世界冇任何區域檔案，所以冇嘢可以畫。",
            "引擎老老實實運行完，結果連一張地圖都冇算出過。通常代表揀嘅維度喺呢個世界冇任何區域檔案，由頭到尾都冇嘢可以畫。",
        ],
    },
    "world.run.fail.cancelled": {
        en: [
            "You stopped it. The tiles already rendered are kept, and carrying on later picks up from where it stopped.",
            "You stopped it. The tiles already rendered are kept, and carrying on later picks up from where it stopped.",
            "You stopped it. The tiles already rendered are kept, and carrying on later picks up from where it stopped.",
            "You stopped it yourself. The tiles already rendered are kept, and carrying on later picks up from where it stopped.",
            "You stopped it yourself, and nothing was lost for it. The tiles already rendered are kept, and carrying on later picks up from where it stopped.",
        ],
        yue: [
            "你停止咗佢。已經算好嘅圖磚全部保留，之後想繼續，會由停低嗰度接住做。",
            "你停止咗佢。已經算好嘅圖磚全部保留，之後想繼續，會由停低嗰度接住做。",
            "你停止咗佢。已經算好嘅圖磚全部保留，之後想繼續，會由停低嗰度接住做。",
            "你停止咗佢。已經算好嘅圖磚全部保留，之後想繼續，會準確由停低嗰度接住做。",
            "你停止咗佢，親手嚟嘅，乜都冇蝕底。已經算好嘅圖磚全部保留，之後想繼續，會準準確確由停低嗰度接住做。",
        ],
    },
    "world.run.fail.engine": {
        en: [
            "The engine started and then stopped with an error. Its own output is below; the last few lines are usually the ones that say why.",
            "The engine started and then stopped with an error. Its own output is below; the last few lines are usually the ones that say why.",
            "The engine started and then stopped with an error. Its own output is below; the last few lines are usually the ones that say why.",
            "The engine started and then stopped with an error. Its own output is below, and the last few lines are usually the ones that say why.",
            "The engine started and then stopped with an error. Its own output is right there below, and the last few lines are usually the ones that say why.",
        ],
        yue: [
            "引擎開始咗，但係之後以錯誤停低。佢自己嘅輸出喺下面；通常最後幾行就會講原因。",
            "引擎開始咗，但係之後以錯誤停低。佢自己嘅輸出喺下面；通常最後幾行就會講原因。",
            "引擎開始咗，但係之後以錯誤停低。佢自己嘅輸出喺下面；通常最後幾行就會講原因。",
            "引擎開始咗，但係之後以錯誤停低。佢自己嘅輸出就喺下面，通常最後幾行就會講原因。",
            "引擎開始咗，但係之後以錯誤停低。佢自己嘅輸出就喺下面，通常最後幾行就會講原因，唔使問人。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* resumeOffers.ts                                                    */
    /* ---------------------------------------------------------------- */

    "world.resume.cancelled": {
        en: [
            "You stopped this render. The tiles it had already drawn are still there.",
            "You stopped this render. The tiles it had already drawn are still there.",
            "You stopped this render. The tiles it had already drawn are still there.",
            "You stopped this render yourself. The tiles it had already drawn are still there.",
            "You stopped this render yourself, and nothing was lost for it. The tiles it had already drawn are still there.",
        ],
        yue: [
            "你停止咗呢次算圖。已經畫好嘅圖磚仍然喺度。",
            "你停止咗呢次算圖。已經畫好嘅圖磚仍然喺度。",
            "你停止咗呢次算圖。已經畫好嘅圖磚仍然喺度。",
            "你停止咗呢次算圖。已經畫好嘅圖磚仍然喺度，一塊都冇少。",
            "你停止咗呢次算圖，乜都冇蝕底。已經畫好嘅圖磚仍然喺度，一塊都冇少。",
        ],
    },
    "world.resume.failed": {
        en: [
            "This render stopped with an error before it finished.",
            "This render stopped with an error before it finished.",
            "This render really stopped with an error before it finished.",
            "This render stopped with an error before it finished.",
            "This render stopped with an error before it finished, unfortunately.",
        ],
        yue: [
            "呢次算圖未完成之前，就以錯誤停低。",
            "呢次算圖未完成之前，就以錯誤停低。",
            "呢次算圖未完成之前，就以錯誤停低。",
            "呢次算圖未完成之前，就以錯誤停低咗。",
            "呢次算圖未完成之前，就已經以錯誤停低咗。",
        ],
    },
    "world.resume.processGone": {
        en: [
            "This render was still running when the app or the machine stopped, so it never got to write an ending.",
            "This render was still running when the app or the machine stopped, so it never got to write an ending.",
            "This render really was still running when the app or the machine stopped, so it never got to write an ending.",
            "This render was still running when the app or the machine stopped, so it never got to write an ending.",
            "This render was still running when the app or the machine stopped, so it never got to write an ending at all.",
        ],
        yue: [
            "呢次算圖喺程式或者部機停止嗰陣仲運行緊，所以冇機會寫低結局。",
            "呢次算圖喺程式或者部機停止嗰陣仲運行緊，所以冇機會寫低結局。",
            "呢次算圖真係喺程式或者部機停止嗰陣仲運行緊，所以冇機會寫低結局。",
            "呢次算圖喺程式或者部機停低嗰陣仲運行緊，所以冇機會寫低結局。",
            "呢次算圖喺程式或者部機停低嗰陣仲運行緊，所以完全冇機會寫低結局。",
        ],
    },
    "world.resume.noProgress": {
        en: [
            "It stopped before reporting any progress, so nothing is known about how far it got.",
            "It stopped before reporting any progress, so nothing is known about how far it got.",
            "It really stopped before reporting any progress, so nothing is known about how far it got.",
            "It stopped before reporting any progress, so nothing is known about how far it got.",
            "It stopped before reporting any progress at all, so nothing is known about how far it got.",
        ],
        yue: [
            "佢喺回報任何進度之前就停低，所以唔知去到邊。",
            "佢喺回報任何進度之前就停低，所以唔知去到邊。",
            "佢真係喺回報任何進度之前就停低，所以唔知去到邊。",
            "佢喺回報任何進度之前就停低，所以完全唔知去到邊。",
            "佢喺回報任何進度之前就停低，所以真係一啲都唔知去到邊。",
        ],
    },
    /* The sibling of `world.resume.progressAt` (already in `appCopy.ts`), for the case with
     * no `{what}` to name. Mirrors its five levels exactly, minus the location clause. */
    "world.resume.progress": {
        en: [
            "It reached {percent}%.",
            "It reached {percent}%.",
            "It got to {percent}%.",
            "It got as far as {percent}%.",
            "It got as far as {percent}% before it stopped.",
        ],
        yue: [
            "佢去到 {percent}%。",
            "佢去到 {percent}%。",
            "佢做到 {percent}%。",
            "佢一路做到 {percent}%。",
            "佢一路做到 {percent}% 先停低。",
        ],
    },
    "world.resume.refused.configChanged": {
        en: [
            "The settings moved since this render stopped. Carrying on would leave half the map drawn with the old settings and half with the new, so it is refused. Start a fresh render with the settings you have now, or put them back and resume.",
            "The settings moved since this render stopped. Carrying on would leave half the map drawn with the old settings and half with the new, so it is refused. Start a fresh render with the settings you have now, or put them back and resume.",
            "The settings moved, really, since this render stopped. Carrying on would leave half the map drawn with the old settings and half with the new, so it is refused. Start a fresh render with the settings you have now, or put them back and resume.",
            "The settings moved since this render stopped. Carrying on would leave half the map drawn with the old settings and half with the new, so it is refused. Start a fresh render with the settings you have now, or put them back and resume.",
            "The settings moved since this render stopped, quietly. Carrying on would leave half the map drawn with the old settings and half with the new, so it is refused. Start a fresh render with the settings you have now, or put the old ones back and resume.",
        ],
        yue: [
            "呢次算圖停低之後，設定改咗。繼續嘅話會令張地圖一半用舊設定畫、一半用新設定畫，所以拒絕。用而家嘅設定開新一次算圖，或者將設定改返轉頭然後繼續。",
            "呢次算圖停低之後，設定改咗。繼續嘅話會令張地圖一半用舊設定畫、一半用新設定畫，所以拒絕。用而家嘅設定開新一次算圖，或者將設定改返轉頭然後繼續。",
            "呢次算圖停低之後，設定改咗，千真萬確。繼續嘅話會令張地圖一半用舊設定畫、一半用新設定畫，所以拒絕。用而家嘅設定開新一次算圖，或者將設定改返轉頭然後繼續。",
            "呢次算圖停低之後，設定改咗。繼續嘅話張地圖會一半用舊設定畫、一半用新設定畫，所以拒絕繼續。用而家嘅設定重新開始，或者將設定改返轉頭再繼續。",
            "呢次算圖停低之後，設定改咗，靜靜雞。真係繼續嘅話，張地圖會一半用舊設定畫、一半用新設定畫咁不倫不類，所以拒絕。用而家嘅設定重新開始，或者將設定改返轉頭再繼續。",
        ],
    },
    "world.resume.refused.alreadyRunning": {
        en: [
            "This render is already going. Its progress is on screen.",
            "This render is already going. Its progress is on screen.",
            "This render is already going. Its progress is on screen.",
            "This render is already going, and its progress is on screen.",
            "This render is already going, and its progress is on screen for anyone to watch.",
        ],
        yue: [
            "呢次算圖已經喺度行緊。進度喺畫面上。",
            "呢次算圖已經喺度行緊。進度喺畫面上。",
            "呢次算圖已經喺度行緊。進度喺畫面上。",
            "呢次算圖已經喺度行緊，進度喺畫面上。",
            "呢次算圖已經喺度行緊，進度喺畫面上，隨時睇得到。",
        ],
    },
    "world.resume.refused.notInterrupted": {
        en: [
            "This render is not in a state that can be carried on. It either finished or was never started.",
            "This render is not in a state that can be carried on. It either finished or was never started.",
            "This render is not in a state that can be carried on. It either finished or was never started.",
            "This render is not in a state that can be carried on: it either finished or was never started.",
            "This render is simply not in a state that can be carried on: it either finished or was never started.",
        ],
        yue: [
            "呢次算圖而家嘅狀態繼續唔到。可能已經完成，或者根本未開始過。",
            "呢次算圖而家嘅狀態繼續唔到。可能已經完成，或者根本未開始過。",
            "呢次算圖而家嘅狀態繼續唔到。可能已經完成，或者根本未開始過。",
            "呢次算圖而家嘅狀態繼續唔到：可能已經完成，或者根本未開始過。",
            "呢次算圖而家嘅狀態繼續唔到，一啲都唔假：可能已經完成，或者根本未開始過。",
        ],
    },
    "world.resume.refused.noSession": {
        en: [
            "Nothing on disk describes this render any more, so there is no record of what it was doing. A fresh render will still reuse every tile it already wrote.",
            "Nothing on disk describes this render any more, so there is no record of what it was doing. A fresh render will still reuse every tile it already wrote.",
            "Nothing on disk describes this render any more, really, so there is no record of what it was doing. A fresh render will still reuse every tile it already wrote.",
            "Nothing on disk describes this render any more, so there is no record of what it was doing. A fresh render will still reuse every tile it already wrote.",
            "Nothing on disk describes this render any more at all, so there is no record of what it was doing. A fresh render will still reuse every tile it already wrote.",
        ],
        yue: [
            "磁碟上冇任何嘢再形容到呢次算圖，所以冇記錄佢做緊咩。重新算圖都仍然會重用返每一塊圖磚。",
            "磁碟上冇任何嘢再形容到呢次算圖，所以冇記錄佢做緊咩。重新算圖都仍然會重用返每一塊圖磚。",
            "磁碟上冇任何嘢再形容到呢次算圖，所以冇記錄佢做緊咩。重新算圖都仍然會重用返每一塊圖磚。",
            "磁碟上已經冇任何嘢再形容到呢次算圖，所以完全冇記錄佢做緊咩。重新算圖都仍然會重用返每一塊圖磚。",
            "磁碟上根本冇任何嘢再形容到呢次算圖，一個記錄都冇留低。重新算圖都仍然會重用返每一塊圖磚。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* worldCatalog.ts: the honest states of a mounted folder             */
    /* ---------------------------------------------------------------- */

    "world.mounts.missing": {
        en: [
            "There is nothing at {path} right now. It stays in the list, because a folder on a drive that is unplugged is not a folder you meant to forget.",
            "There is nothing at {path} right now. It stays in the list, because a folder on a drive that is unplugged is not a folder you meant to forget.",
            "There is nothing at {path} right now. It stays in the list, because a folder on a drive that is unplugged is not a folder you meant to forget.",
            "There is nothing at {path} right now, but it stays in the list: a folder on a drive that is unplugged is not a folder you meant to forget.",
            "There is nothing at {path} right now, but it stays in the list regardless: a folder on a drive that is unplugged is not a folder you actually meant to forget.",
        ],
        yue: [
            "而家 {path} 冇嘢。佢仍然留喺清單度，因為一隻拔咗嘅磁碟上嘅資料夾，唔代表你想忘記佢。",
            "而家 {path} 冇嘢。佢仍然留喺清單度，因為一隻拔咗嘅磁碟上嘅資料夾，唔代表你想忘記佢。",
            "而家 {path} 冇嘢。佢仍然留喺清單度，因為一隻拔咗嘅磁碟上嘅資料夾，唔代表你想忘記佢。",
            "而家 {path} 度冇嘢，不過佢仍然留喺清單度：一隻拔咗嘅磁碟上嘅資料夾，唔等於你真係想忘記佢。",
            "而家 {path} 度乜都冇，但佢仍然留喺清單度：一隻拔咗嘅磁碟上嘅資料夾，唔代表你真心想忘記佢。",
        ],
    },
    "world.mounts.notAFolder": {
        en: [
            "{path} is a file rather than a folder.",
            "{path} is a file rather than a folder.",
            "{path} really is a file rather than a folder.",
            "{path} is indeed a file rather than a folder.",
            "{path} turns out to be a file rather than a folder.",
        ],
        yue: [
            "{path} 係一個檔案，唔係資料夾。",
            "{path} 係一個檔案，唔係資料夾。",
            "{path} 真係一個檔案，唔係資料夾。",
            "{path} 原來係一個檔案，唔係資料夾。",
            "{path} 原來只係一個檔案，唔係資料夾。",
        ],
    },
    "world.mounts.unreadable": {
        en: [
            "That folder could not be read.",
            "That folder could not be read.",
            "That folder really could not be read.",
            "That folder simply could not be read.",
            "That folder simply could not be read, at all.",
        ],
        yue: [
            "嗰個資料夾讀唔到。",
            "嗰個資料夾讀唔到。",
            "嗰個資料夾真係讀唔到。",
            "嗰個資料夾根本讀唔到。",
            "嗰個資料夾死都讀唔到。",
        ],
    },
    "world.mounts.resolvedInstallation": {
        en: [
            "A Minecraft installation. Its worlds are read from {path}.",
            "A Minecraft installation. Its worlds are read from {path}.",
            "A Minecraft installation. Its worlds are read from {path}.",
            "A Minecraft installation, and its worlds are read from {path}.",
            "A whole Minecraft installation, no less, and its worlds are read straight from {path}.",
        ],
        yue: [
            "一個 Minecraft 安裝。佢嘅世界會由 {path} 讀取。",
            "一個 Minecraft 安裝。佢嘅世界會由 {path} 讀取。",
            "一個 Minecraft 安裝。佢嘅世界會由 {path} 讀取。",
            "一個完整嘅 Minecraft 安裝，佢嘅世界就會由 {path} 讀取。",
            "原來係一個完整嘅 Minecraft 安裝，佢嘅世界會直接由 {path} 讀取。",
        ],
    },
    "world.mounts.resolvedSaves": {
        en: [
            "A saves folder. Its worlds are read from {path}.",
            "A saves folder. Its worlds are read from {path}.",
            "A saves folder. Its worlds are read from {path}.",
            "A saves folder, and its worlds are read from {path}.",
            "Just a saves folder, and its worlds are read straight from {path}.",
        ],
        yue: [
            "一個 saves 資料夾。佢嘅世界會由 {path} 讀取。",
            "一個 saves 資料夾。佢嘅世界會由 {path} 讀取。",
            "一個 saves 資料夾。佢嘅世界會由 {path} 讀取。",
            "一個 saves 資料夾，佢嘅世界就會由 {path} 讀取。",
            "淨係一個 saves 資料夾，佢嘅世界會直接由 {path} 讀取。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* worldFolder.ts: what a problem says, and the honest empty/ok states */
    /* ---------------------------------------------------------------- */

    "world.folder.empty": {
        en: [
            "No world folder chosen yet.",
            "No world folder chosen yet.",
            "No world folder chosen yet, not really.",
            "No world folder chosen yet, not even one.",
            "No world folder chosen yet, still, not even one.",
        ],
        yue: [
            "重未揀世界資料夾。",
            "重未揀世界資料夾。",
            "到而家重未揀世界資料夾。",
            "重未揀世界資料夾，一個都未揀過。",
            "到而家都重未揀世界資料夾，一個都未揀過。",
        ],
    },
    "world.folder.emptyFix": {
        en: [
            "Choose the save folder of the world you want a map of, the one that contains level.dat.",
            "Choose the save folder of the world you want a map of, the one that contains level.dat.",
            "Choose the save folder of the world you want a map of, the one that contains level.dat.",
            "Choose the save folder of the world you want a map of: the one that contains level.dat.",
            "Go ahead and choose the save folder of the world you actually want a map of: the one that contains level.dat.",
        ],
        yue: [
            "揀你想要地圖嗰個世界嘅存檔資料夾，即係有 level.dat 嗰個。",
            "揀你想要地圖嗰個世界嘅存檔資料夾，即係有 level.dat 嗰個。",
            "揀你想要地圖嗰個世界嘅存檔資料夾，即係有 level.dat 嗰個。",
            "揀返你想要地圖嗰個世界嘅存檔資料夾：即係有 level.dat 嗰個。",
            "老老實實揀返你真係想要地圖嗰個世界嘅存檔資料夾：即係有 level.dat 嗰個。",
        ],
    },
    "world.folder.relative": {
        en: [
            "That path is relative, so where it points depends on where the app was started.",
            "That path is relative, so where it points depends on where the app was started.",
            "That path is relative, so where it points depends on where the app was started.",
            "That path is relative, and where it points depends on where the app was started.",
            "That path is relative, and entirely where it points depends on where the app was started.",
        ],
        yue: [
            "嗰個路徑係相對路徑，實際指去邊要睇個程式係喺邊度啟動。",
            "嗰個路徑係相對路徑，實際指去邊要睇個程式係喺邊度啟動。",
            "嗰個路徑真係相對路徑，實際指去邊要睇個程式係喺邊度啟動。",
            "嗰個路徑係相對路徑，實際指去邊，都要睇個程式係喺邊度啟動。",
            "嗰個路徑的確係相對路徑，實際指去邊，完全要睇個程式係喺邊度啟動。",
        ],
    },
    "world.folder.relativeFix": {
        en: [
            "Use a full path, starting from a drive letter or from the root of the file system.",
            "Use a full path, starting from a drive letter or from the root of the file system.",
            "Use a full path, starting from a drive letter or from the root of the file system.",
            "Use a full path instead, starting from a drive letter or from the root of the file system.",
            "Use a proper full path instead, starting from a drive letter or from the root of the file system.",
        ],
        yue: [
            "請用全路徑，由磁碟代號或者檔案系統嘅根開始。",
            "請用全路徑，由磁碟代號或者檔案系統嘅根開始。",
            "請用全路徑，由磁碟代號或者檔案系統嘅根開始。",
            "改用全路徑，由磁碟代號或者檔案系統嘅根開始寫。",
            "老老實實改用全路徑，由磁碟代號或者檔案系統嘅根開始寫。",
        ],
    },
    "world.folder.unreadable": {
        en: [
            "That folder could not be read.",
            "That folder could not be read.",
            "That folder really could not be read.",
            "That folder could not be read.",
            "That folder simply could not be read.",
        ],
        yue: [
            "嗰個資料夾讀唔到。",
            "嗰個資料夾讀唔到。",
            "嗰個資料夾真係讀唔到。",
            "嗰個資料夾讀唔到，點都唔得。",
            "嗰個資料夾讀唔到，死都唔得。",
        ],
    },
    "world.folder.regionFolder": {
        en: [
            "That is the region folder from inside a world. It holds the map data, but not the world itself.",
            "That is the region folder from inside a world. It holds the map data, but not the world itself.",
            "That is the region folder from inside a world. It holds the map data, but not the world itself.",
            "That is the region folder from inside a world: it holds the map data, but not the world itself.",
            "That is only the region folder from inside a world: it holds the map data, but not the world itself.",
        ],
        yue: [
            "嗰個係世界入面嘅 region 資料夾。入面係地圖資料，唔係世界本身。",
            "嗰個係世界入面嘅 region 資料夾。入面係地圖資料，唔係世界本身。",
            "嗰個係世界入面嘅 region 資料夾。入面係地圖資料，唔係世界本身。",
            "嗰個淨係世界入面嘅 region 資料夾：入面裝嘅係地圖資料，唔係世界本身。",
            "嗰個淨係世界入面嘅 region 資料夾，入面裝嘅係地圖資料，唔係世界本身，一啲都唔係。",
        ],
    },
    "world.folder.regionFolderFix": {
        en: [
            "Go up one level and choose {parent} instead.",
            "Go up one level and choose {parent} instead.",
            "Go up one level and choose {parent} instead.",
            "Go up one level, and choose {parent} instead.",
            "Just go up one level and choose {parent} instead.",
        ],
        yue: [
            "去上一層，改揀 {parent}。",
            "去上一層，改揀 {parent}。",
            "去上一層，改揀 {parent}。",
            "去上一層資料夾，改揀 {parent}。",
            "簡單噉去上一層資料夾，改揀 {parent} 就得。",
        ],
    },
    "world.folder.dimensionFolder": {
        en: [
            "That is one dimension of a world rather than the world. BlueMap picks the dimension itself, from the world folder.",
            "That is one dimension of a world rather than the world. BlueMap picks the dimension itself, from the world folder.",
            "That is one dimension of a world rather than the world. BlueMap picks the dimension itself, from the world folder.",
            "That is one dimension of a world, not the world itself. BlueMap picks the dimension itself, from the world folder.",
            "That is only one dimension of a world, never the world itself. BlueMap picks the dimension itself, from the world folder.",
        ],
        yue: [
            "嗰個係世界入面一個維度，唔係世界本身。BlueMap 會自己揀維度，由世界資料夾度嚟。",
            "嗰個係世界入面一個維度，唔係世界本身。BlueMap 會自己揀維度，由世界資料夾度嚟。",
            "嗰個真係世界入面一個維度，唔係世界本身。BlueMap 會自己揀維度，由世界資料夾度嚟。",
            "嗰個淨係世界入面一個維度，唔係世界本身。BlueMap 會自己揀維度，由世界資料夾度嚟。",
            "嗰個淨係世界入面一個維度，永遠都唔係世界本身。BlueMap 會自己揀維度，由世界資料夾度嚟，唔使你操心。",
        ],
    },
    "world.folder.dimensionFolderFix": {
        en: [
            "Go up one level and choose {parent} instead.",
            "Go up one level and choose {parent} instead.",
            "Go up one level and choose {parent} instead.",
            "Go up one level, and choose {parent} instead.",
            "Simply go up one level and choose {parent} instead.",
        ],
        yue: [
            "去上一層，改揀 {parent}。",
            "去上一層，改揀 {parent}。",
            "去上一層，改揀 {parent}。",
            "去上一層資料夾，改揀 {parent}。",
            "直接去上一層資料夾，改揀 {parent} 就得。",
        ],
    },
    "world.folder.savesFolderFix": {
        en: [
            "Open it and choose the one world you want a map of.",
            "Open it and choose the one world you want a map of.",
            "Open it and choose the one world you want a map of.",
            "Open it, and choose the one world you want a map of.",
            "Open it up and choose the one world you actually want a map of.",
        ],
        yue: [
            "打開佢，揀返嗰一個世界，即係你想要地圖嗰個。",
            "打開佢，揀返嗰一個世界，即係你想要地圖嗰個。",
            "打開佢，揀返嗰一個世界，真係你想要地圖嗰個。",
            "打開佢，揀返嗰一個世界，即係你真係想要地圖嗰個。",
            "打開佢，喺入面揀返嗰一個世界，即係你真係想要地圖嗰個，淨係一個。",
        ],
    },
    "world.folder.noLevelDatFix": {
        en: [
            "A world folder contains level.dat and a region folder. On a server it is usually called world; in the game it is under saves.",
            "A world folder contains level.dat and a region folder. On a server it is usually called world; in the game it is under saves.",
            "A world folder contains level.dat and a region folder. On a server it is usually called world; in the game it is under saves.",
            "A world folder always contains level.dat and a region folder. On a server it is usually called world; in the game it lives under saves.",
            "A genuine world folder always contains level.dat and a region folder, no exceptions. On a server it is usually called world; in the game it lives under saves.",
        ],
        yue: [
            "一個世界資料夾入面會有 level.dat 同 region 資料夾。喺伺服器通常叫 world；喺遊戲入面就喺 saves 底下。",
            "一個世界資料夾入面會有 level.dat 同 region 資料夾。喺伺服器通常叫 world；喺遊戲入面就喺 saves 底下。",
            "一個世界資料夾入面會有 level.dat 同 region 資料夾。喺伺服器通常叫 world；喺遊戲入面就喺 saves 底下。",
            "一個真正嘅世界資料夾一定有 level.dat 同 region 資料夾。喺伺服器通常叫 world；喺遊戲入面就匿埋喺 saves 底下。",
            "一個貨真價實嘅世界資料夾，一定有 level.dat 同 region 資料夾，冇得走雞。喺伺服器通常叫 world；喺遊戲入面就匿埋喺 saves 底下。",
        ],
    },
    "world.folder.noRegionDataFix": {
        en: [
            "Load the world in Minecraft and visit it once, then choose it again. Region files appear as soon as terrain is generated.",
            "Load the world in Minecraft and visit it once, then choose it again. Region files appear as soon as terrain is generated.",
            "Load the world in Minecraft and visit it once, then choose it again. Region files appear as soon as terrain is generated.",
            "Load the world in Minecraft, visit it once, and then choose it again. Region files appear as soon as terrain is generated.",
            "Load the world in Minecraft, take a single stroll through it, and then choose it again. Region files appear as soon as terrain is generated.",
        ],
        yue: [
            "喺 Minecraft 入面載入個世界，行入去一次，然後再揀多次。地形一生成，區域檔案就會出現。",
            "喺 Minecraft 入面載入個世界，行入去一次，然後再揀多次。地形一生成，區域檔案就會出現。",
            "喺 Minecraft 入面載入個世界，行入去一次，然後再揀多次。地形一生成，區域檔案就會出現。",
            "喺 Minecraft 入面載入個世界，行入去逛一次，之後再揀多次。地形一生成，區域檔案就會出現。",
            "喺 Minecraft 入面載入個世界，行入去逛一圈，之後再揀多次。地形一生成，區域檔案就會出現。",
        ],
    },
    "world.folder.unchecked": {
        en: [
            "Not checked yet. This build cannot read folders, so the world is taken as given.",
            "Not checked yet. This build cannot read folders, so the world is taken as given.",
            "Not checked yet. This build cannot read folders, so the world is taken as given.",
            "Not checked yet: this build cannot read folders, so the world is taken as given.",
            "Not checked yet, because this build cannot read folders, so the world is taken as given.",
        ],
        yue: [
            "未檢查過。呢個版本讀唔到資料夾，所以個世界會照單全收。",
            "未檢查過。呢個版本讀唔到資料夾，所以個世界會照單全收。",
            "未檢查過。呢個版本讀唔到資料夾，所以個世界會照單全收。",
            "未檢查過：呢個版本根本讀唔到資料夾，所以個世界就照單全收。",
            "未檢查過，因為呢個版本完全讀唔到資料夾，所以個世界一於照單全收，信晒佢。",
        ],
    },
    "world.folder.ok": {
        en: [
            "A Minecraft world with {dimensions} dimensions and {regions} region files.",
            "A Minecraft world with {dimensions} dimensions and {regions} region files.",
            "A Minecraft world with {dimensions} dimensions and {regions} region files.",
            "A genuine Minecraft world, with {dimensions} dimensions and {regions} region files.",
            "A genuine, honest-to-goodness Minecraft world, carrying {dimensions} dimensions and {regions} region files.",
        ],
        yue: [
            "一個 Minecraft 世界，有 {dimensions} 個維度同 {regions} 個區域檔案。",
            "一個 Minecraft 世界，有 {dimensions} 個維度同 {regions} 個區域檔案。",
            "一個 Minecraft 世界，有 {dimensions} 個維度同 {regions} 個區域檔案。",
            "一個貨真價實嘅 Minecraft 世界，有 {dimensions} 個維度同 {regions} 個區域檔案。",
            "一個實實在在嘅 Minecraft 世界，帶住 {dimensions} 個維度同 {regions} 個區域檔案。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* BedrockConversionNote.vue: a Bedrock world found in step one       */
    /* ---------------------------------------------------------------- */

    /*
     * The two facts that survive every level: this is a Bedrock world (not a broken Java
     * one), and it has to be converted before it renders. See docs/bedrock-worlds.md - the
     * whole point of `bedrock:detect` existing is replacing a wizard's "not a world" with
     * this sentence.
     */
    "bedrock.detected": {
        en: [
            "{name} is a Bedrock Edition world, which has to be converted before it can be rendered.",
            "{name} is a Bedrock Edition world, which has to be converted before it can be rendered.",
            "{name} is a Bedrock Edition world - it has to be converted before it can be rendered.",
            "{name} is a Bedrock Edition world rather than a Java one, so it has to be converted before it can be rendered here.",
            "{name} is a Bedrock Edition world, not a Java one, so it has to be converted first - there is no shortcut, only the button below.",
        ],
        yue: [
            "{name} 係一個 Bedrock 版世界，要轉換咗先可以 render。",
            "{name} 係一個 Bedrock 版世界，要轉換咗先可以 render。",
            "{name} 係一個 Bedrock 版世界，要轉換咗先可以 render。",
            "{name} 唔係 Java 世界，而係 Bedrock 版，所以要喺呢度轉換咗先可以 render。",
            "{name} 唔係 Java 世界，係 Bedrock 版，所以一定要先轉換，冇捷徑，淨係得低便嗰個掣。",
        ],
    },
    /*
     * Chunker missing, and being fetched. A separate button from Convert on purpose - see
     * `bedrock:fetchChunker`'s own doc comment - and this is the explanation shown before
     * that button does anything: what it is, that this app does not bundle it, and that the
     * download is verified against a digest committed in this app rather than merely
     * trusted. `{size}` is the one interpolated fact; the digest-verification sentence is a
     * fact every level has to keep saying, pinned in `WORLD_FACTS` below.
     */
    "bedrock.chunkerMissing": {
        en: [
            "Chunker is a separate open-source converter this app does not bundle. Converting this world means fetching it once ({size}), verified against a digest committed in this app.",
            "Chunker is a separate open-source converter this app does not bundle. Converting this world means fetching it once ({size}), verified against a digest committed in this app.",
            "Chunker is a separate open-source converter, and this app does not carry a copy of it. Converting this world means fetching it once ({size}), verified against a digest committed in this app before it is trusted.",
            "Chunker is a separate open-source project this app never bundles. Converting this world means fetching it once ({size}), and what arrives is checked against a digest committed right here in this app, not merely assumed to be intact.",
            "Chunker lives on its own as a separate open-source project - this app carries none of it in advance. Converting this world means fetching it once ({size}), and every byte that arrives is checked against a digest committed right here in this app before anything trusts it.",
        ],
        yue: [
            "Chunker 係一個獨立嘅開源轉換工具，呢個程式冇帶住佢。轉換呢個世界要落載一次（{size}），並且會同呢個程式入面寫死嘅 digest 對過先。",
            "Chunker 係一個獨立嘅開源轉換工具，呢個程式冇帶住佢。轉換呢個世界要落載一次（{size}），並且會同呢個程式入面寫死嘅 digest 對過先。",
            "Chunker 係一個獨立嘅開源轉換工具，呢個程式根本冇帶佢喺身。轉換呢個世界要落載一次（{size}），落到嚟仲要同呢個程式入面寫死嘅 digest 對過先信得過。",
            "Chunker 係一個完全獨立嘅開源專案，呢個程式從來冇夾埋佢。轉換呢個世界要落載一次（{size}），落到嚟嗰份會同寫死喺呢個程式入面嘅 digest 對過，唔係求其信咗佢就算。",
            "Chunker 自己一個開源專案咁企喺度，呢個程式一啲都冇預先帶埋。轉換呢個世界要落載一次（{size}），落到嚟嘅每一個位元組都會同寫死喺呢個程式入面嘅 digest 對過先，冇對過就唔會信。",
        ],
    },
    "bedrock.fetchingChunker": {
        en: [
            "Downloading Chunker…",
            "Downloading Chunker…",
            "Downloading Chunker now…",
            "Downloading Chunker, checking it against its digest as it arrives…",
            "Downloading Chunker, verifying every byte against its digest the moment it lands…",
        ],
        yue: [
            "落載緊 Chunker……",
            "落載緊 Chunker……",
            "而家落載緊 Chunker……",
            "落載緊 Chunker，一路收一路同 digest 對……",
            "落載緊 Chunker，每一個位元組一到就同 digest 對過先……",
        ],
    },
    "bedrock.checkingChunker": {
        en: [
            "Checking whether Chunker is installed…",
            "Checking whether Chunker is installed…",
            "Checking whether Chunker is already installed…",
            "Checking whether a verified copy of Chunker is already on this machine…",
            "Checking whether a verified copy of Chunker is already sitting on this machine, before offering to fetch another…",
        ],
        yue: [
            "檢查緊 Chunker 裝咗未……",
            "檢查緊 Chunker 裝咗未……",
            "檢查緊 Chunker 裝咗未先……",
            "檢查緊呢部機有冇一份已核對嘅 Chunker……",
            "檢查緊呢部機係咪已經有一份核對過嘅 Chunker，先至決定使唔使再落多次……",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* ContainerOffers.vue                                                */
    /* ---------------------------------------------------------------- */

    /*
     * The one sentence in this small panel that carries a fact worth pinning: a
     * containerised render keeps going after the app closes, and nothing here stops one on
     * its own. `world.containers.pickUp`/`.notNow`/`.stop` are plain button labels and stay
     * fixed rather than voiced for the same reason `settings.history.profiles` does.
     */
    "world.containers.blurb": {
        en: [
            "A container can go on rendering after this app closes. Anything listed here was left running from an earlier session; picking one up shows its progress in the render list below, and nothing here is stopped on its own.",
            "A container can go on rendering after this app closes. Anything listed here was left running from an earlier session; picking one up shows its progress in the render list below, and nothing here is stopped on its own.",
            "A container really can go on rendering after this app closes. Anything listed here was left running from an earlier session; picking one up shows its progress in the render list below, and nothing here is stopped on its own.",
            "A container can happily go on rendering after this app closes. Anything listed here was left running from an earlier session; picking one up shows its progress in the render list below, and nothing here is stopped on its own - not unless you say so.",
            "A container can go right on rendering long after this app has clocked out, quietly minding its own business. Anything listed here was left running from an earlier session; picking one up shows its progress in the render list below, and nothing here is stopped on its own - not unless you say so.",
        ],
        yue: [
            "容器喺呢個程式關咗之後都可以繼續算緊圖。呢度列出嚟嘅，全部都係上一次session剩低運行緊嘅；揀返一個就會喺下面嘅算圖清單度顯示佢嘅進度，呢度啲嘢唔會自動停止。",
            "容器喺呢個程式關咗之後都可以繼續算緊圖。呢度列出嚟嘅，全部都係上一次session剩低運行緊嘅；揀返一個就會喺下面嘅算圖清單度顯示佢嘅進度，呢度啲嘢唔會自動停止。",
            "容器真係喺呢個程式關咗之後都可以繼續算緊圖。呢度列出嚟嘅，全部都係上一次session剩低運行緊嘅；揀返一個就會喺下面嘅算圖清單度顯示佢嘅進度，呢度啲嘢唔會自動停止。",
            "容器都幾叻仔㗎，程式關咗之後照舊算緊圖。呢度列出嚟嘅，全部都係上一次session剩低運行緊嘅；揀返一個就會喺下面嘅算圖清單度顯示佢嘅進度，呢度啲嘢唔會自動停止，除非你講一聲先。",
            "容器勁到唔得掕，個程式收咗工佢都照樣算緊圖，靜雞雞喺度做緊自己嘅嘢。呢度列出嚟嘅，全部都係上一次session剩低運行緊嘅；揀返一個就會喺下面嘅算圖清單度顯示佢嘅進度，呢度啲嘢唔會自動停止，除非你講一聲先。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

/* -------------------------------------------------------------------------- */
/* FIXED: titles, field labels, buttons, and short status text                */
/* -------------------------------------------------------------------------- */

export const WORLD_FIXED = {
    /* SshWorldSourcePanel.vue */
    "world.ssh.title": { en: "World on an SSH machine", yue: "SSH 機器上嘅世界" },
    "world.ssh.show": { en: "World on another machine over SSH", yue: "經 SSH 揀另一部機嘅世界" },
    "world.ssh.hide": { en: "Hide SSH worlds", yue: "收起 SSH 世界" },
    "world.ssh.search": { en: "Search this SSH world setup", yue: "搜尋呢個 SSH 世界設定" },
    "world.ssh.machine": { en: "1. Choose a saved SSH machine", yue: "1. 揀一部已儲存嘅 SSH 機器" },
    "world.ssh.detect": {
        en: "2. Check operating system and host key",
        yue: "2. 檢查作業系統同主機金鑰",
    },
    "world.ssh.remoteFolder": {
        en: "3. Choose the world folder on that machine",
        yue: "3. 揀嗰部機上面嘅世界資料夾",
    },
    "world.ssh.browse": { en: "Browse that machine", yue: "瀏覽嗰部機" },
    "world.ssh.survey": { en: "Check this remote world", yue: "檢查呢個遠端世界" },
    "world.ssh.localParent": {
        en: "4. Choose the local destination folder",
        yue: "4. 揀本機目的地資料夾",
    },
    "world.ssh.localParentField": {
        en: "the parent folder for the fetched world",
        yue: "下載世界嘅上層資料夾",
    },
    "world.ssh.localParentLabel": { en: "Fetch into this folder", yue: "下載入呢個資料夾" },
    "world.ssh.localParentHint": {
        en: "the remote world folder will be created inside it",
        yue: "遠端世界資料夾會喺入面建立",
    },
    "world.ssh.fetch": { en: "5. Fetch this world", yue: "5. 下載呢個世界" },
    "world.ssh.cancel": { en: "Cancel the transfer", yue: "取消傳送" },
    "world.ssh.trustExact": {
        en: "I compared this exact fingerprint; trust it",
        yue: "我核對過呢個完全一樣嘅指紋；信任佢",
    },
    "world.ssh.browserTitle": { en: "Choose the remote world folder", yue: "揀遠端世界資料夾" },
    /* ContainerOffers.vue */
    "world.containers.title": { en: "Containers left running", yue: "仲運行緊嘅容器" },
    "world.containers.searchLabel": { en: "Search these containers", yue: "搜尋呢啲容器" },
    "world.containers.searchHint": { en: "a container name, or where it is running", yue: "容器名，或者喺邊度運行" },
    "world.containers.pickUp": { en: "Pick this up", yue: "攞返嚟" },
    "world.containers.notNow": { en: "Not now", yue: "而家唔要" },
    "world.containers.stop": { en: "Stop it", yue: "停止佢" },
    "world.containers.strayNote": {
        en: "This app started these too, but their record is gone, so nothing here can say which render they belong to. They are named rather than stopped.",
        yue: "呢啲都係呢個程式開嘅，但係佢哋嘅記錄唔見咗，所以呢度講唔到佢哋屬於邊個算圖。淨係講返有呢啲嘢，唔會自動停止。",
    },
    "world.containers.noMatch": {
        en: "No container matches that search. Clearing it brings them all back; nothing was declined.",
        yue: "冇容器符合呢個搜尋。清空佢就會全部返晒嚟；乜都冇拒絕過。",
    },

    /* InterruptedRenders.vue */
    "world.resume.title": { en: "Renders that did not finish", yue: "未完成嘅算圖" },
    "world.resume.searchLabel": { en: "Search these renders", yue: "搜尋呢啲算圖" },
    "world.resume.searchHint": { en: "a map name, or part of one", yue: "地圖名，或者名嘅一部分" },
    "world.resume.progressLabel": { en: "How far this render got", yue: "呢個算圖行到邊" },
    "world.resume.carryOn": { en: "Carry on with this render", yue: "繼續呢個算圖" },
    "world.resume.dismiss": { en: "Do not offer this again", yue: "唔好再提呢個" },
    "world.resume.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個",
    },

    /* MapIdentityStep.vue */
    "world.identity.customDimension": { en: "Added by a mod or datapack", yue: "由 mod 或者 datapack 加入嘅" },
    "world.identity.regionCount": { en: "{n} region files on disk", yue: "磁碟上有 {n} 個區域檔案" },
    "world.identity.notChecked": { en: "Not checked", yue: "未檢查" },
    "world.identity.name": { en: "Map name", yue: "地圖名稱" },
    "world.identity.namePlaceholder": { en: "shown in the viewer", yue: "會喺檢視器顯示" },
    "world.identity.id": { en: "Map id", yue: "地圖 id" },
    "world.identity.dimension": { en: "Dimension", yue: "維度" },
    "world.identity.sorting": { en: "Sort order", yue: "排序" },
    "world.wizard.step.identity": { en: "Name and dimension", yue: "名稱同維度" },

    /* DimensionSelection.vue, mounted inside MapIdentityStep.vue - see WORLD_VOICED above
     * for this component's own blurb and "no match" state. */
    "world.identity.dimensionsTitle": { en: "Also render these dimensions", yue: "仲要一齊算呢啲維度" },
    "world.identity.dimensionsOnlyOverworld": {
        en: "This world only has the Overworld. There is nothing else to include.",
        yue: "呢個世界淨係得 Overworld。冇第二樣嘢可以加。",
    },
    "world.identity.dimensionsSearchLabel": { en: "Search these dimensions", yue: "搜尋呢啲維度" },
    "world.identity.dimensionsSearchHint": {
        en: "a name, an id, or a region count",
        yue: "一個名、一個 id，或者一個區域數量",
    },
    "world.identity.dimensionsSearchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個",
    },
    "world.identity.dimensionsIncludeShown": { en: "Include {n} shown", yue: "剔埋顯示緊嘅 {n} 個" },
    "world.identity.dimensionsExcludeShown": { en: "Exclude {n} shown", yue: "剔走顯示緊嘅 {n} 個" },
    "world.identity.dimensionsInvert": { en: "Invert shown", yue: "反選顯示緊嘅" },
    "world.identity.dimensionsVanillaBadge": { en: "Vanilla dimension", yue: "原版維度" },
    "world.identity.dimensionsExternalBadge": {
        en: "Stored in a sibling folder: {folder}",
        yue: "存喺隔籬嘅資料夾：{folder}",
    },
    "world.identity.dimensionsPrimaryReason": {
        en: "This is the map you are customising above; it is always included.",
        yue: "呢個就係你上面度緊嘅嗰張地圖，一定會包埋。",
    },

    /* MapOptionsStep.vue */
    "world.options.search": { en: "Search these settings", yue: "搜尋呢啲設定" },
    "world.options.searchHint": {
        en: "name, key or anything in the explanation",
        yue: "名稱、key，或者說明入面嘅任何字眼",
    },
    "world.options.advanced": { en: "Show advanced settings", yue: "顯示進階設定" },
    "world.options.noChanges": { en: "Nothing changed yet", yue: "重未改過任何嘢" },
    "world.options.resetAll": { en: "Undo my {n} changes", yue: "復原我嘅 {n} 個改動" },
    "world.options.advancedGroup": { en: "Advanced", yue: "進階" },
    "world.wizard.step.options": { en: "Options", yue: "選項" },

    /* MapStorageStep.vue */
    "world.storage.pick": { en: "Choose where rendered maps are written", yue: "揀算好嘅地圖寫去邊" },
    "world.wizard.step.storage": { en: "Where it goes", yue: "去邊度" },
    "world.storage.title": { en: "Where the map is written", yue: "地圖寫去邊" },
    "world.storage.folder": { en: "Folder for rendered maps", yue: "算好嘅地圖放喺邊個資料夾" },
    "world.storage.browse": { en: "Browse", yue: "瀏覽" },
    "world.storage.useDefault": { en: "Use the default", yue: "用返預設值" },
    "world.storage.applying": { en: "Pointing rendering at that folder...", yue: "轉緊算圖去嗰個資料夾..." },
    "world.storage.settingTitle": { en: "The map's own storage setting", yue: "地圖自己嘅儲存設定" },

    /* MinecraftWorldList.vue */
    "world.mounts.pick": {
        en: "Choose a Minecraft folder, or the saves folder inside one",
        yue: "揀一個 Minecraft 資料夾，或者入面嘅 saves 資料夾",
    },
    "world.list.section": { en: "Worlds already on this computer", yue: "呢部電腦已經有嘅世界" },
    "world.list.title": { en: "Your Minecraft worlds", yue: "你嘅 Minecraft 世界" },
    "world.list.rescan": { en: "Look again", yue: "再搵一次" },
    "world.mounts.renameLabel": { en: "Name for this folder", yue: "呢個資料夾嘅名" },
    "world.mounts.detected": { en: "found automatically", yue: "自動搵到" },
    "world.mounts.scanning": { en: "reading...", yue: "讀緊..." },
    "world.mounts.worldCount": { en: "{n} worlds", yue: "{n} 個世界" },
    "world.mounts.rename": { en: "Rename {label}", yue: "重新命名 {label}" },
    "world.mounts.unmount": { en: "Unmount", yue: "卸載" },
    "world.mounts.add": { en: "Mount another Minecraft folder", yue: "掛載多一個 Minecraft 資料夾" },
    "world.list.searchLabel": { en: "Search these worlds", yue: "搜尋呢啲世界" },
    "world.list.searchHint": { en: "a name, a version, a folder", yue: "一個名、一個版本，或者一個資料夾" },
    "world.list.scanning": { en: "Reading your Minecraft folders...", yue: "讀緊你嘅 Minecraft 資料夾..." },
    "world.list.listbox": {
        en: "Worlds found on this computer, most recently played first",
        yue: "呢部電腦搵到嘅世界，最近玩過嘅排先",
    },
    "world.list.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個",
    },

    /* RenderRunPanel.vue */
    "world.run.starting": { en: "Starting the render", yue: "開始緊算圖" },
    "world.run.running": { en: "Rendering", yue: "算緊圖" },
    "world.run.finished": { en: "Rendered", yue: "算好咗" },
    "world.run.cancelled": { en: "Stopped", yue: "已停止" },
    "world.run.failed": { en: "The render did not finish", yue: "算圖未完成" },
    "world.run.stopping": { en: "Stopping...", yue: "停緊..." },
    "world.run.stop": { en: "Stop the render", yue: "停止算圖" },
    "world.run.open": { en: "Open the map", yue: "打開地圖" },
    "world.run.another": { en: "Render another map", yue: "算多張圖" },
    "world.run.startOver": { en: "Set up another render", yue: "設定多一次算圖" },
    "world.run.tryAgain": { en: "Set it up again", yue: "再設定一次" },
    "world.run.hideDetail": { en: "Hide the detail", yue: "收埋細節" },
    "world.run.showDetail": { en: "Show what the engine reported", yue: "顯示引擎報告嘅內容" },
    "world.run.hideLog": { en: "Hide the console", yue: "收埋主控台" },
    "world.run.showLog": { en: "Show the console ({n} lines)", yue: "顯示主控台（{n} 行）" },

    /* WizardReviewStep.vue */
    "world.review.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 個入面嘅 {shown} 個",
    },
    "world.review.nothing": { en: "nothing", yue: "冇嘢" },
    "world.review.plan": { en: "The render", yue: "呢次算圖" },
    "world.review.worldLabel": { en: "World", yue: "世界" },
    "world.review.dimensionLabel": { en: "Dimension", yue: "維度" },
    "world.review.mapLabel": { en: "Map", yue: "地圖" },
    "world.review.extraMapsLabel": { en: "Also rendered", yue: "仲會一齊算" },
    "world.review.storageLabel": { en: "Written to", yue: "寫去邊" },
    "world.review.engineLabel": { en: "Engine", yue: "引擎" },
    "world.review.javaLabel": { en: "Java runtime", yue: "Java 執行環境" },
    "world.review.consentAction": { en: "Open the setting", yue: "打開個設定" },
    "world.review.howTitle": { en: "How to run it", yue: "點樣運行" },
    "world.review.force": { en: "Render everything again", yue: "全部再算多次" },
    "world.review.fixEdges": { en: "Redraw the map edges", yue: "重畫地圖邊界" },
    "world.review.metrics": {
        en: "Let the engine report anonymous usage",
        yue: "俾引擎報告匿名使用情況",
    },
    "world.review.threads": { en: "Render threads", yue: "算圖執行緒" },
    "world.review.threadsDefault": { en: "the engine decides", yue: "由引擎決定" },
    "world.review.changesTitle": { en: "Settings you changed", yue: "你改過嘅設定" },
    /*
     * A full sentence rather than a bare status word, but kept FIXED to match
     * `world.options.noChanges`'s tier: the sibling "nothing changed" state for the wizard's
     * options step is FIXED, and this is the same state reported one step later.
     */
    "world.review.noChanges": {
        en: "None. Everything is at BlueMap's own default for this dimension.",
        yue: "冇。全部都係呢個維度嘅 BlueMap 預設值。",
    },
    "world.review.searchLabel": { en: "Search the settings you changed", yue: "搜尋你改過嘅設定" },
    "world.review.searchHint": { en: "a name, a path, or a value", yue: "名稱、路徑，或者數值" },
    "world.review.reRender": { en: "Re-render", yue: "要再算圖" },
    "world.review.hideConfig": { en: "Hide the map config", yue: "收埋地圖設定檔" },
    "world.review.showConfig": {
        en: "Show the map config this produces",
        yue: "顯示呢個會產生嘅地圖設定檔",
    },
    "world.review.copy": { en: "Copy", yue: "複製" },
    "world.wizard.step.review": { en: "Review", yue: "覆核" },

    /* WorldFolderStep.vue */
    "world.folder.pick": {
        en: "Choose the world folder, the one that contains level.dat",
        yue: "揀個世界資料夾，即係有 level.dat 嗰個",
    },
    "world.folder.label": { en: "World folder", yue: "世界資料夾" },
    "world.folder.placeholder": { en: "the folder that contains level.dat", yue: "有 level.dat 嘅資料夾" },
    "world.folder.browse": { en: "Browse", yue: "瀏覽" },
    "world.folder.recheck": { en: "Check this folder again", yue: "再檢查呢個資料夾" },
    "world.folder.recheckShort": { en: "Check again", yue: "再檢查" },
    "world.folder.dropHere": {
        en: "Or drag a world folder from your file manager and drop it here.",
        yue: "或者由檔案總管拖個世界資料夾落嚟呢度。",
    },
    "world.folder.checking": { en: "Reading the folder...", yue: "讀緊個資料夾..." },
    "world.folder.regionCount": { en: "{n} regions", yue: "{n} 個區域" },
    "world.folder.hideDownloads": { en: "Hide the release downloads", yue: "收埋 release 下載" },
    "world.folder.showDownloads": {
        en: "No world on this machine? Download one from a release",
        yue: "呢部機冇世界？由 release 下載一個",
    },
    "world.wizard.step.world": { en: "World", yue: "世界" },

    /* WorldScreen.vue */
    "world.screen.runningTitle": { en: "Renders going on right now", yue: "而家正在進行嘅算圖" },
    "world.screen.watchOne": {
        en: "Follow this render, {render}",
        yue: "跟住呢個算圖，{render}",
    },
    "world.screen.watch": { en: "Follow this render", yue: "跟住呢個算圖" },
    "world.screen.openProject": { en: "Open the project", yue: "打開個項目" },
    "world.screen.title": { en: "Make a map, the quick way", yue: "快速整一張地圖" },
    "world.screen.newMap": { en: "Set up another map", yue: "設定多一張地圖" },

    /* WorldWizard.vue */
    "world.wizard.openProject": { en: "Open the project", yue: "打開個項目" },
    "world.wizard.stepsLabel": { en: "Wizard steps", yue: "精靈步驟" },

    /*
     * renderRun.ts's `phaseText()` builds `{ key, fallback, values }` phase-name objects the
     * same way `SIGNALS` does (see the long comment beside `WORLD_VOICED`'s renderRun.ts
     * section above): `phaseText(phase).key` is a property read, never a literal `t("...")`
     * call, so `world.run.phase.*` has no call site the coverage or orphan scanners can ever
     * find. Left uncatalogued for the same reason and by the same precedent
     * (`downloads.size.tb`/`gb`/`mb`/`kb`), rather than kept and failing
     * `appCopy.test.ts`'s "finds a call site for every key in the catalogue" check the
     * moment this module is registered.
     */
    "world.run.seconds": { en: "{n} seconds", yue: "{n} 秒" },
    "world.run.minutes": { en: "{n} minutes", yue: "{n} 分鐘" },
    "world.run.hours": { en: "{h} hours {m} minutes", yue: "{h} 小時 {m} 分鐘" },
    /*
     * `world.run.fail.*Action`: `adviseOnFailure()`'s `FailureRemedy.actionKey` is likewise
     * a plain string field, read via `t(advice.remedy.actionKey, advice.remedy.actionFallback)`
     * in `RenderRunPanel.vue` rather than through a literal call here -- no scannable call
     * site, so these five action-button labels are left uncatalogued too. The sibling
     * `world.run.fail.*` explanation keys just above (`consent`, `java`, `world`, `storage`,
     * `nothing`, and the rest) stay voiced: those ARE passed to a literal `t("world.run.fail.
     * consent", ...)` call in `adviseOnFailure()` itself, so they have a real call site.
     */

    /* worldCatalog.ts */
    "world.list.sizeAtLeast": { en: "at least {size}", yue: "至少 {size}" },
    "world.list.mode.survival": { en: "Survival", yue: "生存模式" },
    "world.list.mode.creative": { en: "Creative", yue: "創造模式" },
    "world.list.mode.adventure": { en: "Adventure", yue: "歷險模式" },
    "world.list.mode.spectator": { en: "Spectator", yue: "觀察者模式" },
    "world.list.neverPlayed": { en: "never opened", yue: "未開過" },
    "world.list.lastPlayed": { en: "last played {at}", yue: "最近喺 {at} 玩過" },
    "world.list.snapshot": { en: "{version} snapshot", yue: "{version} 快照版" },
    "world.list.hardcore": { en: "Hardcore", yue: "極限模式" },
    "world.list.cheats": { en: "cheats on", yue: "已開作弊" },
    "world.list.dimensions": {
        en: "{dimensions} dimensions, {regions} region files",
        yue: "{dimensions} 個維度，{regions} 個區域檔案",
    },
    "world.list.seed": { en: "seed {seed}", yue: "種子 {seed}" },
    "world.list.folder": { en: "in {folder}", yue: "喺 {folder}" },
    "world.list.fromMount": { en: "from {mount}", yue: "嚟自 {mount}" },
    "world.list.unreadableDetails": { en: "its level.dat could not be read", yue: "level.dat 讀唔到" },
    "world.mounts.origin.appdata": {
        en: "the default Minecraft folder under %APPDATA%",
        yue: "%APPDATA% 底下嘅預設 Minecraft 資料夾",
    },
    "world.mounts.origin.applicationSupport": {
        en: "the default Minecraft folder in Application Support",
        yue: "Application Support 入面嘅預設 Minecraft 資料夾",
    },
    "world.mounts.origin.home": {
        en: "the default .minecraft folder in your home directory",
        yue: "你個人目錄入面嘅預設 .minecraft 資料夾",
    },
    "world.mounts.origin.beside": {
        en: "a .minecraft folder beside this application",
        yue: "同呢個程式擺埋一齊嘅 .minecraft 資料夾",
    },

    /* BedrockConversionNote.vue. */
    "bedrock.unnamed": { en: "This world", yue: "呢個世界" },
    "bedrock.convert": { en: "Convert with Chunker", yue: "用 Chunker 轉換" },
    "bedrock.cancel": { en: "Cancel the conversion", yue: "取消轉換" },
    "bedrock.phase.starting": { en: "Starting Chunker...", yue: "開緊 Chunker……" },
    "bedrock.phase.converting": { en: "Converting...", yue: "轉緊換……" },
    "bedrock.phase.compacting": { en: "Compacting...", yue: "壓緊實……" },
    "bedrock.phase.verifying": {
        en: "Verifying the converted world...",
        yue: "驗緊轉換咗嘅世界……",
    },
    /*
     * `{size}` arrives already formatted as `~30 MB` - see `chunkerSizeText` in
     * `BedrockConversionNote.vue` - so this stays a plain button label rather than a
     * voiced sentence with its own funny levels.
     */
    "bedrock.fetchChunkerSized": { en: "Download Chunker ({size})", yue: "落載 Chunker（{size}）" },
    "bedrock.fetchChunker": { en: "Download Chunker", yue: "落載 Chunker" },
    /* What `bedrock.chunkerMissing` interpolates when the release's own size was not read. */
    "bedrock.chunkerSizeUnknown": { en: "an unknown size", yue: "唔知幾大" },
} as const satisfies Record<string, FixedString>;

/* -------------------------------------------------------------------------- */
/* FACTS: the substrings a playful rewrite may never drop                     */
/* -------------------------------------------------------------------------- */

export const WORLD_FACTS = {
    "world.ssh.blurb": {
        en: ["key-only SSH machine", "unknown fingerprint", "Nothing is written"],
        yue: ["只用金鑰嘅 SSH 機器", "未見過嘅指紋", "唔會寫任何嘢"],
    },
    "world.ssh.browseBlocked": {
        en: ["detected, trusted", "remote-directory bridge", "required"],
        yue: ["偵測同信任咗", "遠端資料夾橋接", "先可以"],
    },
    "world.ssh.cancelMiss": {
        en: ["already ended", "cancellation reached it"],
        yue: ["取消趕到之前", "已經完咗"],
    },
    "world.ssh.detectNeedsTarget": {
        en: ["Choose or add", "before checking"],
        yue: ["揀或者新增", "先至檢查"],
    },
    "world.ssh.detected": { en: ["{kind}"], yue: ["{kind}"] },
    "world.ssh.fetchBlocked": {
        en: ["surveyed world", "local destination", "disabled"],
        yue: ["檢查好嘅世界", "本機目的地", "停用"],
    },
    "world.ssh.fetched": {
        en: ["{folder}", "ordinary wizard", "reading"],
        yue: ["{folder}", "原本個精靈", "讀緊"],
    },
    "world.ssh.fetchedNotice": {
        en: ["{folder}", "ready", "inspect"],
        yue: ["{folder}", "準備好", "檢查"],
    },
    "world.ssh.noMatch": {
        en: ["No SSH setup control", "Clear it", "guided flow"],
        yue: ["冇 SSH 設定控制符合", "清空佢", "完整引導流程"],
    },
    "world.ssh.notWorld": {
        en: ["level.dat", "region file", "world folder itself"],
        yue: ["level.dat", "region 檔案", "世界資料夾本身"],
    },
    "world.ssh.reviewKey": {
        en: ["fingerprint", "exact match", "changed key is refused"],
        yue: ["指紋", "完全一樣", "金鑰變咗會拒絕"],
    },
    "world.ssh.surveyReady": {
        en: ["level.dat", "region data", "{files}", "No world bytes"],
        yue: ["level.dat", "region 資料", "{files}", "未搬任何世界位元組"],
    },
    "world.ssh.transferring": {
        en: ["phase 3 of 3", "{lines}", "progress messages"],
        yue: ["第 3/3 階段", "{lines}", "進度訊息"],
    },
    "world.ssh.unavailable": {
        en: ["desktop app", "complete SSH world-source bridge"],
        yue: ["桌面程式", "完整 SSH 世界來源橋接"],
    },
    // The digest check is the fact a playful rewrite is most tempted to drop for being
    // technical; it is also the one reason this button is safe to press at all.
    "bedrock.chunkerMissing": {
        en: ["{size}", "digest"],
        yue: ["{size}", "digest"],
    },
    "bedrock.fetchingChunker": { en: ["Chunker"], yue: ["Chunker"] },
    "bedrock.checkingChunker": { en: ["Chunker"], yue: ["Chunker"] },
    "world.containers.blurb": {
        en: ["left running from an earlier session", "nothing here is stopped on its own"],
        yue: ["上一次session剩低運行緊", "唔會自動停止"],
    },
    "world.resume.blurb": {
        en: ["already on disk", "is skipped", "Nothing is deleted"],
        yue: ["磁碟上已經有嘅圖磚", "會跳過", "唔會刪走任何嘢"],
    },
    "world.resume.noMatch": {
        en: ["Clearing it brings them all back", "nothing was declined"],
        yue: ["清空就會全部返晒嚟", "冇拒絕過"],
    },
    "world.identity.idTooLong": { en: ["{max}"], yue: ["{max}"] },
    "world.identity.idCharacters": {
        en: ["Lower-case letters", "digits", "hyphens", "underscores"],
        yue: ["細楷字母", "數字", "連字號", "底線"],
    },
    "world.identity.blurb": {
        en: ["viewer", "on disk", "rendering it again"],
        yue: ["檢視器", "磁碟", "再算一次"],
    },
    "world.identity.idHint": { en: ["folder name", "address"], yue: ["資料夾名", "網址"] },
    "world.identity.sortingHint": {
        en: ["lower number", "earlier", "viewer"],
        yue: ["數字細啲", "前", "檢視器"],
    },
    "world.identity.guessedDimensions": {
        en: ["three vanilla dimensions", "nothing could read the folder", "empty map"],
        yue: ["三個原版維度", "冇嘢讀到個資料夾", "空白嘅地圖"],
    },
    "world.identity.presetNote": { en: ["BlueMap's own template"], yue: ["BlueMap 自己嘅範本"] },
    "world.identity.presetDetail": {
        en: ["sky colour", "void colour", "ambient light", "cave removal", "keeps every option you have changed"],
        yue: ["天空顏色", "虛空顏色", "環境光", "洞穴清除", "保留你自己改過嘅每一個選項"],
    },
    "world.identity.dimensionsBlurb": {
        en: ["Nether", "End", "unticked", "own map"],
        yue: ["Nether", "End", "唔剔", "自己嘅地圖"],
    },
    "world.identity.dimensionsNoMatch": {
        en: ["Clearing it brings", "back"],
        yue: ["清空", "攞返"],
    },
    "world.options.badPattern": { en: ["not valid", "nothing is shown"], yue: ["唔合法", "唔會顯示"] },
    "world.options.matches": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "world.options.allShown": { en: ["{total}"], yue: ["{total}"] },
    "world.options.blurb": {
        en: ["BlueMap's own default", "stays as upstream ships it"],
        yue: ["BlueMap 自己嘅預設值", "保持返上游出廠嘅樣"],
    },
    "world.options.noMatches": { en: ["Nothing on this step matches"], yue: ["呢一步冇嘢符合"] },
    "world.options.carried": {
        en: ["Written into this map's config file", "review step"],
        yue: ["寫入呢張地圖嘅設定檔", "覆核步驟"],
    },
    "world.options.unparsed": {
        en: ["does not parse", "fault in this app", "review step shows the file"],
        yue: ["讀唔到", "呢個程式嘅問題", "覆核步驟會顯示個檔案"],
    },
    "world.storage.blurb": {
        en: ["gigabytes", "choose a drive with room"],
        yue: ["幾 GB", "揀隻有位嘅磁碟"],
    },
    "world.storage.applied": {
        en: ["from now on", "not only this one"],
        yue: ["由而家開始", "唔止呢一次"],
    },
    "world.storage.unknown": {
        en: ["did not say where it writes maps", "desktop app"],
        yue: ["冇講返佢寫地圖去邊", "桌面程式"],
    },
    "world.list.blurb": {
        en: ["Minecraft folder", "fills in the world field", "type or drop a folder"],
        yue: ["Minecraft 資料夾", "填返世界欄位", "打字或者拖個資料夾"],
    },
    "world.mounts.already": {
        en: ["already in the list", "{label}"],
        yue: ["已經喺清單入面", "{label}"],
    },
    "world.mounts.unmounted": {
        en: ["{label}", "Nothing on your disk was changed", "mounting it again brings it straight back"],
        yue: ["{label}", "磁碟上冇任何嘢改變過", "重新掛載就會即刻返嚟"],
    },
    "world.mounts.unmountOne": {
        en: ["{label}", "takes it out of this list", "changes nothing on your disk"],
        yue: ["{label}", "喺呢個清單度攞走", "磁碟上乜都唔改"],
    },
    "world.mounts.addHint": {
        en: ["Minecraft folder", "saves folder", "never touches your worlds"],
        yue: ["Minecraft 資料夾", "saves 資料夾", "永遠唔會掂你嘅世界"],
    },
    "world.list.noFolders": {
        en: ["No Minecraft folder was found", "Mount one above", "type or drop the world folder"],
        yue: ["搵唔到任何 Minecraft 資料夾", "喺上面掛載一個", "打字或者拖個世界資料夾"],
    },
    "world.list.noWorlds": {
        en: ["No worlds were found", "{places}", "Mount another folder above"],
        yue: ["搵唔到任何世界", "{places}", "喺上面掛載多一個資料夾"],
    },
    "world.list.noMatch": {
        en: ["Clearing it brings the whole list back"],
        yue: ["清空就會攞返成個清單"],
    },
    "world.run.engineLine": { en: ["{engine}"], yue: ["{engine}"] },
    "world.run.engineRan": { en: ["{engine}"], yue: ["{engine}"] },
    "world.run.stopNote": {
        en: ["keeps every tile already drawn", "picks up from where it stopped"],
        yue: ["保留晒已經畫好嘅圖磚", "由停低嗰度接住做"],
    },
    "world.run.cancelledLine": {
        en: ["Every tile it had already drawn is still there", "carries on from where it stopped"],
        yue: ["已經畫好嘅圖磚全部都仲喺度", "由停低嗰度繼續"],
    },

    /* WizardReviewStep.vue */
    "world.review.copied": { en: ["exactly", "map config"], yue: ["原文", "地圖設定檔"] },
    "world.review.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },
    "world.review.engineValue": {
        en: ["BlueMap's own engine", "run locally", "reported once it starts"],
        yue: ["BlueMap 自己嘅引擎", "本機", "報返實際版本"],
    },
    "world.review.javaValue": {
        en: ["Java", "own folder", "not installed system-wide"],
        yue: ["Java", "自己嘅資料夾", "唔會裝落成部電腦"],
    },
    "world.review.consentMissing": {
        en: ["Mojang", "download has not been accepted", "stop before it started"],
        yue: ["Mojang", "下載重未接受", "未開始就會停低"],
    },
    "world.review.noEngine": {
        en: ["cannot render locally", "map config below can be copied out", "needs the desktop app"],
        yue: ["本機算唔到圖", "地圖設定檔", "桌面程式"],
    },
    "world.review.forceHint": {
        en: ["Off", "chunks that changed", "On, every chunk is drawn again"],
        yue: ["熄咗", "改過嘅 chunk", "開咗", "每個 chunk"],
    },
    "world.review.fixEdgesHint": {
        en: ["Redraws the seams", "visible lines", "world grows"],
        yue: ["重畫", "接口", "明顯界線", "世界擴大"],
    },
    "world.review.metricsHint": {
        en: ["Off by default", "Minecraft client", "separate outbound report"],
        yue: ["預設係熄嘅", "Minecraft client", "獨立嘅對外報告"],
    },
    "world.review.threadsHint": {
        en: ["every processor core but two", "machine stays usable"],
        yue: ["淨係留返兩個", "部機用得"],
    },
    "world.review.noMatch": {
        en: ["Clearing it brings the whole list back", "unaffected"],
        yue: ["清空就會攞返成個清單", "唔會影響算圖"],
    },

    /* WorldFolderStep.vue */
    "world.folder.dropEmpty": {
        en: ["no file or folder", "Drag the world folder itself"],
        yue: ["冇帶任何檔案或者資料夾", "拖個世界資料夾"],
    },
    "world.folder.dropUnsupported": {
        en: ["cannot tell where a dropped folder is", "Browse", "type the full path"],
        yue: ["睇唔到拖落嚟嘅資料夾喺邊", "瀏覽", "打全路徑"],
    },
    "world.folder.blurb": {
        en: ["level.dat", "region folder", "saves"],
        yue: ["level.dat", "region 資料夾", "saves"],
    },
    "world.folder.noPicker": {
        en: ["no folder picker", "Local rendering needs the desktop app"],
        yue: ["冇資料夾揀選器", "本機算圖要用桌面程式"],
    },
    "world.folder.cannotCheck": {
        en: ["cannot look inside a folder", "taken as given", "render will say so"],
        yue: ["睇唔到資料夾入面", "照單全收", "一開始就會講"],
    },

    /* WorldScreen.vue */
    "world.screen.noBridge": {
        en: ["cannot start a render", "Local rendering needs the desktop app"],
        yue: ["開始唔到算圖", "本機算圖要用桌面程式"],
    },
    "world.screen.runningBlurb": {
        en: ["being drawn on this machine", "not waiting to be carried on", "would only be refused"],
        yue: ["呢部機正在畫緊", "唔係等緊被繼續", "只會俾人拒絕"],
    },
    "world.screen.wroteProject": {
        en: ["project at the root of that world", "repeated without setting anything up again", "editor"],
        yue: ["項目", "世界嘅根目錄", "唔使再設定", "編輯器"],
    },
    "world.screen.projectFailed": {
        en: ["render is going ahead", "project file could not be written", "{message}"],
        yue: ["算圖照樣繼續", "項目檔案寫唔入", "{message}"],
    },
    "world.screen.blurb": {
        en: ["Minecraft world", "five short steps", "writes a project", "answers are kept", "Projects tab"],
        yue: ["Minecraft 世界", "五個簡短步驟", "寫低一個項目", "答案會保留低", "Projects 分頁"],
    },

    /* WorldWizard.vue */
    "world.wizard.easyMode": {
        en: ["Five short questions", "project file written at the end", "project editor"],
        yue: ["五條簡短問題", "寫低一個項目檔案", "項目編輯器"],
    },
    "world.wizard.hasProject": {
        en: ["{name}", "{maps}", "Opening it keeps everything", "adds another map"],
        yue: ["{name}", "{maps}", "保留晒已經設定好嘅嘢", "加多一張地圖"],
    },

    /*
     * renderRun.ts's `world.console.signal.*` has no FACTS entry because it has no catalogue
     * entry at all -- see the comment beside `WORLD_VOICED`'s renderRun.ts section for why.
     */

    /* renderRun.ts: failure explanations */
    "world.run.fail.consent": {
        en: ["Mojang", "accepted once, in Settings", "Nothing was started and nothing was written"],
        yue: ["Mojang", "喺設定入面接受一次", "乜都未開始，乜都未寫過"],
    },
    "world.run.fail.java": {
        en: ["Java runtime", "fetch one for you", "point it at one you already have"],
        yue: ["Java 執行環境", "幫你攞一個", "指向一個你已經有嘅"],
    },
    "world.run.fail.engineMissing": {
        en: ["engine itself is not installed", "detail below lists the folders"],
        yue: ["冇裝 BlueMap 引擎本身", "細節會列出搜尋過嘅資料夾"],
    },
    "world.run.fail.world": {
        en: ["world folder could not be read", "moved, renamed", "drive that is not connected"],
        yue: ["讀唔到個世界資料夾", "搬咗、改咗名", "冇連接嘅磁碟"],
    },
    "world.run.fail.storage": {
        en: ["could not be created or written", "read-only, full", "drive that is not connected"],
        yue: ["建立唔到", "唯讀、爆滿", "冇連接嘅磁碟"],
    },
    "world.run.fail.request": {
        en: ["refused before anything ran", "nothing was written"],
        yue: ["喺運行之前就被拒絕", "乜都未寫過"],
    },
    "world.run.fail.nothing": {
        en: ["ran and finished without rendering a single map", "dimension chosen has no region files"],
        yue: ["一張地圖都冇算出過", "維度喺呢個世界冇任何區域檔案"],
    },
    "world.run.fail.cancelled": {
        en: ["You stopped it", "tiles already rendered are kept", "picks up from where it stopped"],
        yue: ["你停止咗佢", "已經算好嘅圖磚全部保留", "由停低嗰度接住做"],
    },
    "world.run.fail.engine": {
        en: ["started and then stopped with an error", "last few lines are usually the ones that say why"],
        yue: ["開始咗，但係之後以錯誤停低", "最後幾行就會講原因"],
    },

    /* resumeOffers.ts */
    "world.resume.cancelled": {
        en: ["You stopped this render", "tiles it had already drawn are still there"],
        yue: ["你停止咗呢次算圖", "已經畫好嘅圖磚仍然喺度"],
    },
    "world.resume.failed": {
        en: ["stopped with an error", "before it finished"],
        yue: ["以錯誤停低", "未完成"],
    },
    "world.resume.processGone": {
        en: ["still running when the app or the machine stopped", "never got to write an ending"],
        yue: ["仲運行緊", "冇機會寫低結局"],
    },
    "world.resume.noProgress": {
        en: ["stopped before reporting any progress", "nothing is known about how far it got"],
        yue: ["回報任何進度之前就停低", "唔知去到邊"],
    },
    "world.resume.progress": { en: ["{percent}"], yue: ["{percent}"] },
    "world.resume.refused.configChanged": {
        en: ["settings moved", "half the map drawn with the old settings and half with the new", "refused"],
        yue: ["設定改咗", "一半用舊設定畫、一半用新設定畫", "拒絕"],
    },
    "world.resume.refused.alreadyRunning": {
        en: ["already going", "progress is on screen"],
        yue: ["已經喺度行緊", "進度喺畫面上"],
    },
    "world.resume.refused.notInterrupted": {
        en: ["not in a state that can be carried on", "either finished or was never started"],
        yue: ["狀態繼續唔到", "已經完成，或者根本未開始過"],
    },
    "world.resume.refused.noSession": {
        en: ["Nothing on disk describes this render", "fresh render will still reuse every tile"],
        yue: ["冇任何嘢再形容到呢次算圖", "重新算圖都仍然會重用返每一塊圖磚"],
    },

    /* worldCatalog.ts */
    "world.mounts.missing": {
        en: ["{path}", "stays in the list", "drive that is unplugged"],
        yue: ["{path}", "仍然留喺清單度", "拔咗嘅磁碟"],
    },
    "world.mounts.notAFolder": {
        en: ["{path}", "file rather than a folder"],
        yue: ["{path}", "檔案，唔係資料夾"],
    },
    "world.mounts.unreadable": { en: ["could not be read"], yue: ["讀唔到"] },
    "world.mounts.resolvedInstallation": {
        en: ["Minecraft installation", "{path}"],
        yue: ["Minecraft 安裝", "{path}"],
    },
    "world.mounts.resolvedSaves": { en: ["saves folder", "{path}"], yue: ["saves 資料夾", "{path}"] },

    /* worldFolder.ts */
    "world.folder.empty": { en: ["No world folder chosen"], yue: ["重未揀世界資料夾"] },
    "world.folder.emptyFix": { en: ["save folder", "level.dat"], yue: ["存檔資料夾", "level.dat"] },
    "world.folder.relative": {
        en: ["path is relative", "depends on where the app was started"],
        yue: ["相對路徑", "睇個程式係喺邊度啟動"],
    },
    "world.folder.relativeFix": {
        en: ["full path", "drive letter", "root of the file system"],
        yue: ["全路徑", "磁碟代號", "檔案系統嘅根"],
    },
    "world.folder.unreadable": { en: ["could not be read"], yue: ["讀唔到"] },
    "world.folder.regionFolder": {
        en: ["region folder from inside a world", "holds the map data", "not the world itself"],
        yue: ["世界入面嘅 region 資料夾", "地圖資料", "唔係世界本身"],
    },
    "world.folder.regionFolderFix": { en: ["{parent}"], yue: ["{parent}"] },
    "world.folder.dimensionFolder": {
        en: ["one dimension of a world", "BlueMap picks the dimension itself", "world folder"],
        yue: ["世界入面一個維度", "BlueMap 會自己揀維度", "世界資料夾"],
    },
    "world.folder.dimensionFolderFix": { en: ["{parent}"], yue: ["{parent}"] },
    "world.folder.savesFolderFix": {
        en: ["Open it", "choose the one world"],
        yue: ["打開佢", "揀返嗰一個世界"],
    },
    "world.folder.noLevelDatFix": {
        en: ["level.dat", "region folder", "saves"],
        yue: ["level.dat", "region 資料夾", "saves"],
    },
    "world.folder.noRegionDataFix": {
        en: ["Load the world in Minecraft", "Region files appear as soon as terrain is generated"],
        yue: ["喺 Minecraft 入面載入個世界", "地形一生成，區域檔案就會出現"],
    },
    "world.folder.unchecked": {
        en: ["Not checked yet", "cannot read folders", "taken as given"],
        yue: ["未檢查過", "讀唔到資料夾", "照單全收"],
    },
    "world.folder.ok": { en: ["{dimensions}", "{regions}"], yue: ["{dimensions}", "{regions}"] },

    // That this is Bedrock rather than Java, and that a conversion is required.
    "bedrock.detected": {
        en: ["Bedrock Edition", "converted"],
        yue: ["Bedrock", "轉換"],
    },
} as const satisfies Record<
    keyof typeof WORLD_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
