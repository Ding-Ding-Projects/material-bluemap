/**
 * The interactive tour: what each step says, and the buttons around it.
 *
 * Every fact in here was checked against the running application rather than assumed:
 * `finding-worlds.md` for the automatic default-folder scan, `RenderProgressDetail.vue` for
 * there being no fixed render time and the percentage-then-estimate behaviour, `pages.pitch`
 * in `copy/appCopy.ts` for what publishing actually changes, and `palettePrefs.ts` for the
 * command palette's real shortcut, Control+Shift+F. Nothing here promises a feature the app
 * does not have or describes a flow that has since changed; where a step is genuinely just
 * "point BlueMap at a world, answer a few short steps", that is `world.screen.blurb`'s own
 * wording, not an invention for this file.
 *
 * `tutorial.step.*.title` and the control labels are `FIXED`: short, and a funny level
 * restyling "Next" or "Back" would make a button somebody has to re-read mid-click. The step
 * bodies, the progress line and the one-time invitation are `VOICED`, because they are real
 * sentences a newcomer reads once, and `FACTS` pins the one concrete claim each of them makes
 * so a playful level cannot quietly drop it - see `copy/appCopy.ts`'s own header for why that
 * split exists.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const TUTORIAL_VOICED = {
    "tutorial.step.welcome.body": {
        en: [
            "BlueMap turns a Minecraft world into a map you can pan, zoom and explore, right here on the Map tab.",
            "BlueMap turns a Minecraft world into a map you can pan, zoom and explore, right here on the Map tab.",
            "BlueMap reads a Minecraft world and turns it into a map you can pan, zoom and explore, right here on the Map tab.",
            "Point BlueMap at a Minecraft world and it hands back a map you can pan, zoom and wander through, right here on the Map tab.",
            "Point BlueMap at a Minecraft world and it hands back a map you can pan, zoom and happily get lost in, right here on the Map tab.",
        ],
        yue: [
            "BlueMap 會將一個 Minecraft 世界變成一張地圖，喺呢個「地圖」分頁度就可以拖動、縮放同探索。",
            "BlueMap 會將一個 Minecraft 世界變成一張地圖，喺呢個「地圖」分頁度就可以拖動、縮放同探索。",
            "BlueMap 會讀取一個 Minecraft 世界，變成一張地圖，喺呢個「地圖」分頁度拖動、縮放同探索。",
            "同 BlueMap 講一個 Minecraft 世界俾佢聽，佢就變返一張地圖俾你，喺呢個「地圖」分頁度拖動、縮放、周圍逛。",
            "同 BlueMap 講一個 Minecraft 世界俾佢聽，佢就變返一張地圖俾你，喺呢個「地圖」分頁度拖動、縮放，仲可以開心咁逛到唔記得返屋企。",
        ],
    },
    "tutorial.step.makeAMap.body": {
        en: [
            "This tab is where you turn a Minecraft world into a map: point BlueMap at one, answer a few short questions, and it renders.",
            "This tab is where you turn a Minecraft world into a map: point BlueMap at one, answer a few short questions, and it renders.",
            "This tab is where a Minecraft world becomes a map: point BlueMap at one, answer a few short questions, and it renders.",
            "Everything starts here: hand BlueMap a Minecraft world, answer a few short questions, and let it render.",
            "Everything starts here: hand BlueMap a Minecraft world, answer a few short questions, sit back, and let it render.",
        ],
        yue: [
            "呢個分頁係將 Minecraft 世界變成地圖嘅地方：揀一個俾 BlueMap，答幾條簡單問題，佢就會開始算圖。",
            "呢個分頁係將 Minecraft 世界變成地圖嘅地方：揀一個俾 BlueMap，答幾條簡單問題，佢就會開始算圖。",
            "呢個分頁係一個 Minecraft 世界變成地圖嘅地方：揀一個俾 BlueMap，答幾條簡單問題，佢就會算圖。",
            "一切由呢度開始：擺個 Minecraft 世界俾 BlueMap，答幾條簡單問題，等佢算圖。",
            "一切由呢度開始：擺個 Minecraft 世界俾 BlueMap，答幾條簡單問題，然後坐低等佢算圖。",
        ],
    },
    "tutorial.step.findWorld.body": {
        en: [
            "BlueMap looks in this computer's default Minecraft folder automatically, with nothing to configure, and lists what it finds below. Nothing there? Browse for a folder, type a path, or drag one in.",
            "BlueMap looks in this computer's default Minecraft folder automatically, with nothing to configure, and lists what it finds below. Nothing there? Browse for a folder, type a path, or drag one in.",
            "BlueMap checks this computer's default Minecraft folder automatically, with nothing to set up, and lists what it finds. No luck? Browse for a folder, type a path, or drag one in.",
            "BlueMap already went looking: it checks the default Minecraft folder automatically and lists every world it found. Nothing there yet? Browse, type a path, or drag a folder in.",
            "BlueMap already went looking so you do not have to: it checks the default Minecraft folder automatically and lists every world it found. Nothing there yet? Browse, type a path, or drag a folder in.",
        ],
        yue: [
            "BlueMap 會自動搵呢部電腦嘅預設 Minecraft 資料夾，乜都唔使設定，搵到嘅世界會列喺下面。乜都冇？可以自己揀資料夾、打路徑，或者拖一個入嚟。",
            "BlueMap 會自動搵呢部電腦嘅預設 Minecraft 資料夾，乜都唔使設定，搵到嘅世界會列喺下面。乜都冇？可以自己揀資料夾、打路徑，或者拖一個入嚟。",
            "BlueMap 會自動檢查呢部電腦嘅預設 Minecraft 資料夾，乜都唔使自己設定，搵到嘅世界會列出嚟。搵唔到？自己揀資料夾、打路徑，或者拖一個入嚟都得。",
            "BlueMap 已經自動幫你搵咗：佢會自動檢查預設 Minecraft 資料夾，將搵到嘅世界全部列出嚟。仲未見到？自己揀資料夾、打路徑，或者拖一個入嚟都得。",
            "BlueMap 已經自動幫你搵晒，你唔使郁手：佢會自動檢查預設 Minecraft 資料夾，將搵到嘅世界全部列出嚟。仲未見到？自己揀資料夾、打路徑，或者拖一個入嚟都得。",
        ],
    },
    "tutorial.step.rendering.body": {
        en: [
            "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it: a small world can take minutes, a huge one can take hours. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it: a small world can take minutes, a huge one can take hours. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it, since it depends on how big the world is: minutes for a small one, hours for a huge one. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            "Rendering is BlueMap actually reading the world and drawing it into map tiles on disk. There is no fixed time for it: small world, a few minutes; huge world, could be hours. Once it gets going you will see a percentage, and after a while, a rough estimate of what is left.",
            "Rendering is BlueMap actually reading the world and drawing it into map tiles on disk, one chunk at a time. There is no fixed time for it, and anyone who promises one is guessing: small world, a few minutes; sprawling world, could be hours. Once it gets going you will see a percentage, and after a while, a rough estimate of what is left.",
        ],
        yue: [
            "算圖即係 BlueMap 讀取個世界，畫成一塊塊地圖圖磚，存落磁碟。時間冇固定，睇個世界有幾大：細嘅世界幾分鐘，大嘅可能要幾個鐘。開始咗之後，你會見到百分比，過一陣仲會有個大約要幾耐嘅估計。",
            "算圖即係 BlueMap 讀取個世界，畫成一塊塊地圖圖磚，存落磁碟。時間冇固定，睇個世界有幾大：細嘅世界幾分鐘，大嘅可能要幾個鐘。開始咗之後，你會見到百分比，過一陣仲會有個大約要幾耐嘅估計。",
            "算圖即係 BlueMap 讀取個世界，畫成一塊塊地圖圖磚，存落磁碟。時間冇固定嘅，全睇個世界有幾大：細嘅世界幾分鐘搞掂，大嘅可能要幾個鐘。開始咗之後，你會見到百分比，過一陣仲會有個大約要幾耐嘅估計。",
            "算圖即係 BlueMap 真係喺度讀緊個世界，一格一格畫成地圖圖磚，存落磁碟。時間冇固定：細世界幾分鐘就搞掂，大世界隨時要幾個鐘。開始咗之後會見到百分比，過一陣重有個大約嘅時間估計。",
            "算圖即係 BlueMap 真係喺度讀緊個世界，一格一格咁畫成地圖圖磚，存落磁碟。時間冇固定㗎，邊個同你講死實幾耐都係呃你：細世界幾分鐘搞掂，大世界隨時燒幾個鐘。開始咗之後會見到百分比，過一陣重有個大約嘅時間估計。",
        ],
    },
    "tutorial.step.openMap.body": {
        en: [
            "When a render finishes, its tiles are written straight into your maps folder, and an Open the map button appears. Come back to this tab any time to open what BlueMap made.",
            "When a render finishes, its tiles are written straight into your maps folder, and an Open the map button appears. Come back to this tab any time to open what BlueMap made.",
            "When a render finishes, its tiles land in your maps folder, and an Open the map button appears. Come back to this tab whenever you like to open what BlueMap made.",
            "A finished render writes its tiles into your maps folder and drops an Open the map button right where the wizard was. This tab is also where you come back to open it later.",
            "A finished render writes its tiles into your maps folder and drops an Open the map button right where the wizard was, no hunting required. This tab is also where you come back to open it later, whenever the mood strikes.",
        ],
        yue: [
            "算好之後，圖磚會直接寫入你嘅地圖資料夾，仲會出現一個「打開地圖」掣。之後隨時返呢個分頁就可以打開 BlueMap 整好嘅嘢。",
            "算好之後，圖磚會直接寫入你嘅地圖資料夾，仲會出現一個「打開地圖」掣。之後隨時返呢個分頁就可以打開 BlueMap 整好嘅嘢。",
            "算好之後，圖磚會落咗喺你嘅地圖資料夾，仲會出現一個「打開地圖」掣。想幾時返呢個分頁打開都得。",
            "算好一次之後，圖磚就寫入咗你嘅地圖資料夾，跟住喺原本個精靈嘅位置會出現一個「打開地圖」掣。呢個分頁亦都係之後返嚟打開佢嘅地方。",
            "算好一次之後，圖磚就寫入咗你嘅地圖資料夾，跟住喺原本個精靈嘅位置直接彈返個「打開地圖」掣出嚟，唔使周圍搵。呢個分頁亦都係之後幾時想返嚟打開佢都得嘅地方。",
        ],
    },
    "tutorial.step.publish.body": {
        en: [
            "By default a finished map only opens on this computer. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            "By default a finished map only opens on this computer. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            "By default a finished map only opens on this computer, at an address nobody else can reach. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            "Right now your map only opens on this computer. Publish it from this tab to GitHub Pages instead, and it gets a real, free address anyone can open, still nothing fancier than files.",
            "Right now your map only opens on this computer, which is not much of a map to show off. Publish it from this tab to GitHub Pages instead, and it gets a real, free address anyone can open, still nothing fancier than files.",
        ],
        yue: [
            "預設情況下，算好嘅地圖淨係喺呢部電腦度打得開。呢個分頁可以將佢發佈去 GitHub Pages：一個真正、免費、人人都開得到嘅網址，依然淨係一堆檔案。",
            "預設情況下，算好嘅地圖淨係喺呢部電腦度打得開。呢個分頁可以將佢發佈去 GitHub Pages：一個真正、免費、人人都開得到嘅網址，依然淨係一堆檔案。",
            "預設情況下，算好嘅地圖淨係喺呢部電腦打得開，第二個地方都去唔到。呢個分頁可以將佢發佈去 GitHub Pages：一個真正、免費、人人都開得到嘅網址，依然淨係一堆檔案。",
            "而家你張圖淨係呢部電腦先開得到。喺呢個分頁發佈去 GitHub Pages，就會有個真正、免費、人人開得到嘅網址，依然唔複雜，一堆檔案咁簡單。",
            "而家你張圖淨係呢部電腦先開得到，想俾人睇都幾寒酸。喺呢個分頁發佈去 GitHub Pages，就會有個真正、免費、人人開得到嘅網址，依然唔複雜，一堆檔案咁簡單。",
        ],
    },
    "tutorial.step.wrapUp.body": {
        en: [
            "That is the whole loop: find a world, render it, open it, and publish it if you want to. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop: find a world, render it, open it, and publish it if you want to. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop: find a world, render it, open it, and publish it if you feel like it. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop, start to finish: find a world, render it, open it, publish it if you feel like showing off. Come back to this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            "That is the whole loop, start to finish: find a world, render it, open it, publish it if you feel like showing off. This tour is not going anywhere either: come back to it any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
        ],
        yue: [
            "成個流程就係咁：搵個世界、算圖、打開、想公開就發佈。想幾時再睇呢個導覽都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵到。",
            "成個流程就係咁：搵個世界、算圖、打開、想公開就發佈。想幾時再睇呢個導覽都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵到。",
            "成個流程就係咁：搵個世界、算圖、打開、想公開就發佈。呢個導覽你想幾時再睇都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵得返。",
            "成個流程由頭到尾就係咁：搵個世界、算圖、打開、想威就發佈俾人睇。呢個導覽唔會走，想幾時返嚟睇都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵得返。",
            "成個流程由頭到尾就係咁：搵個世界、算圖、打開、想威就發佈俾成個網打開睇。呢個導覽都唔會走，想幾時返嚟溫書都得，喺「資訊」、喺呢度嘅「說明文件」，或者用指令面板（Ctrl+Shift+F）都搵得返。",
        ],
    },
    /* The step counter, read out with the step's own title when focus lands on it. */
    "tutorial.progress": {
        en: [
            "Step {n} of {m}.",
            "Step {n} of {m}.",
            "Step {n} of {m} of this tour.",
            "Step {n} of {m}, and moving right along.",
            "Step {n} of {m}. Nearly there, or just getting started, depending how you look at it.",
        ],
        yue: [
            "第 {n} 步，共 {m} 步。",
            "第 {n} 步，共 {m} 步。",
            "呢個導覽嘅第 {n} 步，共 {m} 步。",
            "第 {n} 步，共 {m} 步，穩陣咁行緊。",
            "第 {n} 步，共 {m} 步。快到定啱啱開始，睇你點諗。",
        ],
    },
    /* The one-time, dismissible corner notice offering the tour. Never shown twice. */
    "tutorial.offer.message": {
        en: [
            "New to BlueMap? There is a short interactive tour that walks through finding a world, rendering it and opening the result.",
            "New to BlueMap? There is a short interactive tour that walks through finding a world, rendering it and opening the result.",
            "New to BlueMap? A short interactive tour walks through finding a world, rendering it and opening the result, right inside the app.",
            "New here? A short interactive tour is sitting right there, ready to walk you through finding a world, rendering it and opening the result.",
            "New here? There is a short interactive tour just waiting to walk you through finding a world, rendering it and opening the result, no reading required.",
        ],
        yue: [
            "第一次用 BlueMap？有一個簡短嘅互動導覽，會帶你搵世界、算圖，同打開結果。",
            "第一次用 BlueMap？有一個簡短嘅互動導覽，會帶你搵世界、算圖，同打開結果。",
            "第一次用 BlueMap？呢個程式入面有個簡短互動導覽，會帶你搵世界、算圖，同打開結果。",
            "第一次嚟？呢度有個簡短互動導覽，準備好帶你搵世界、算圖，同打開結果。",
            "第一次嚟？呢度有個簡短互動導覽，隨時可以帶你搵世界、算圖，同打開結果，唔使睇文字都識用。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const TUTORIAL_FIXED = {
    "tutorial.step.welcome.title": { en: "Welcome to BlueMap", yue: "歡迎使用 BlueMap" },
    "tutorial.step.makeAMap.title": { en: "Make a map", yue: "整張地圖" },
    "tutorial.step.findWorld.title": { en: "Finding a world", yue: "搵世界" },
    "tutorial.step.rendering.title": { en: "What rendering does", yue: "算圖做緊乜" },
    "tutorial.step.openMap.title": { en: "Opening the finished map", yue: "打開算好嘅地圖" },
    "tutorial.step.publish.title": { en: "Sharing it, if you want to", yue: "想分享都得" },
    "tutorial.step.wrapUp.title": { en: "Come back any time", yue: "隨時返嚟睇" },

    "tutorial.controls.next": { en: "Next", yue: "下一步" },
    "tutorial.controls.finish": { en: "Finish", yue: "完成" },
    "tutorial.controls.back": { en: "Back", yue: "上一步" },
    "tutorial.controls.skip": { en: "Skip this step", yue: "跳過呢步" },
    "tutorial.controls.exit": { en: "Exit the tour", yue: "退出導覽" },

    /* The button that opens the tour: from Info, from Docs, and from the command palette. */
    "tutorial.launch.start": { en: "Take the tour", yue: "開始導覽" },
    "tutorial.launch.replay": { en: "Replay the tour", yue: "重睇導覽" },

    /* The overlay's own accessible region name, in case a step's title has not loaded yet. */
    "tutorial.region.label": { en: "Interactive tour", yue: "互動導覽" },
} as const satisfies Record<string, FixedString>;

export const TUTORIAL_FACTS = {
    "tutorial.step.welcome.body": { en: ["Minecraft"], yue: ["Minecraft"] },
    "tutorial.step.makeAMap.body": { en: ["Minecraft"], yue: ["Minecraft"] },
    "tutorial.step.findWorld.body": { en: ["automatically"], yue: ["自動"] },
    "tutorial.step.rendering.body": { en: ["no fixed"], yue: ["冇固定"] },
    "tutorial.step.openMap.body": { en: ["maps folder"], yue: ["地圖資料夾"] },
    "tutorial.step.publish.body": { en: ["GitHub Pages"], yue: ["GitHub Pages"] },
    "tutorial.step.wrapUp.body": { en: ["Ctrl+Shift+F"], yue: ["Ctrl+Shift+F"] },
    "tutorial.progress": { en: ["Step"], yue: ["步"] },
    "tutorial.offer.message": { en: ["tour"], yue: ["導覽"] },
} as const satisfies Record<
    keyof typeof TUTORIAL_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
