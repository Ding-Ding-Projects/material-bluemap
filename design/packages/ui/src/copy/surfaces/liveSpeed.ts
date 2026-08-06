/**
 * The live Speed control: the same 1-5 dial as `speed.ts`'s novice control, drawn beside a
 * render that is already running, on `LiveSpeedControl.vue` (and `RenderThroughput.vue` for
 * the rate reading beside it). Every key here has a real `t()` call site in one of those two
 * components, which is what let this module join `SURFACE_VOICED`/`SURFACE_FIXED`/
 * `SURFACE_FACTS` in `surfaces/index.ts` rather than ship unwired the way a surface with no
 * renderer yet has to, per `speed.ts`'s own precedent.
 *
 * ## The one fact every level has to keep
 *
 * `liveSpeed.deferredNote` is the load-bearing string in this file. It says that the thread
 * count and thread priority baked into this render's own launch never move while it runs, no
 * matter which level is picked - only a restart applies that half. A rewrite that softened
 * that into something that sounds like the whole dial moved live would be exactly the defect
 * this feature was built to avoid: a control whose value is stored and which changes nothing
 * a person can see. `liveSpeed.outcomeApplied` carries the honest half beside it: something
 * genuinely did change, immediately, and that fact survives every level too.
 *
 * `LIVESPEED_FACTS` pins the level number and the route name, because a message that stops
 * saying *which* level and *where* it applied is not a funnier message, it is a useless one.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const LIVESPEED_VOICED = {
    "liveSpeed.blurb": {
        en: [
            "This changes what can genuinely change while the render is going: the operating system's own priority for it, or a container's CPU allowance. The thread count baked into this render's own launch stays fixed until it restarts.",
            "This changes what can genuinely change while the render is going: the operating system's own priority for it, or a container's CPU allowance. The thread count baked into this render's own launch stays fixed until it restarts.",
            "This changes what can genuinely change while the render is going: the operating system's own priority for it, or a container's CPU allowance. The thread count baked into this render's launch stays fixed until it restarts.",
            "Only the part that can genuinely move mid-render moves here: the operating system's own priority, or a container's CPU allowance. The thread count baked into this render's launch is stuck until it restarts, and this dial says so rather than pretending otherwise.",
            "Only the part that can genuinely move mid-render moves here, full stop: the operating system's own priority, or a container's CPU allowance. The thread count baked into this render's launch is stuck until it restarts, and this dial will not pretend otherwise.",
        ],
        yue: [
            "呢個掣改嘅係算圖進行緊嗰陣真係郁到嘅嘢：作業系統畀佢嘅優先權，或者容器嘅 CPU 配額。呢次算圖啟動時已經寫死嘅執行緒數量，要重新啟動先會變。",
            "呢個掣改嘅係算圖進行緊嗰陣真係郁到嘅嘢：作業系統畀佢嘅優先權，或者容器嘅 CPU 配額。呢次算圖啟動時已經寫死嘅執行緒數量，要重新啟動先會變。",
            "呢個掣改嘅係算圖進行緊嗰陣真係郁到嘅嘢：作業系統畀佢嘅優先權，或者容器嘅 CPU 配額。呢次算圖啟動時寫死嘅執行緒數量，要重新啟動先會變。",
            "呢度淨係郁到算圖進行緊都真係可以郁嘅嗰部分：作業系統嘅優先權，或者容器 CPU 配額。呢次算圖啟動時寫死嘅執行緒數量，冇重新啟動就係死嘅，呢個掣唔會扮冇嘢咁呃你。",
            "呢度淨係郁到算圖進行緊都真係可以郁嘅嗰部分，講晒明：作業系統嘅優先權，或者容器 CPU 配額。呢次算圖啟動時寫死嘅執行緒數量，冇重新啟動就係死嘅，呢個掣一定唔會扮冇嘢咁呃你。",
        ],
    },
    "liveSpeed.currentAutomatic": {
        en: [
            "This render's thread count was left at this machine's own automatic default. It only changes if you restart with a level chosen below.",
            "This render's thread count was left at this machine's own automatic default. It only changes if you restart with a level chosen below.",
            "This render's thread count is this machine's own automatic default. It only changes on a restart, with a level chosen below.",
            "Thread count here is whatever this machine picked automatically. Nothing below moves it unless this render is restarted with a level chosen.",
            "Thread count here is whatever this machine felt like picking automatically. Nothing below budges it unless this render actually restarts with a level chosen.",
        ],
        yue: [
            "呢次算圖嘅執行緒數量一直係呢部機自己自動揀嘅預設值。要重新啟動，並喺下面揀個等級，先會改變。",
            "呢次算圖嘅執行緒數量一直係呢部機自己自動揀嘅預設值。要重新啟動，並喺下面揀個等級，先會改變。",
            "呢次算圖嘅執行緒數量係呢部機自動揀嘅預設值。要重新啟動並喺下面揀個等級先會變。",
            "呢度嘅執行緒數量係呢部機自己度度自動揀嘅。下面郁極都唔會變，除非重新啟動並揀個等級。",
            "呢度嘅執行緒數量係呢部機自己求其自動揀嘅。下面郁到爛都唔會變，除非真係重新啟動並揀個等級。",
        ],
    },
    "liveSpeed.currentLevel": {
        en: [
            "This render started at level {level}. That number stays fixed for the life of this render.",
            "This render started at level {level}. That number stays fixed for the life of this render.",
            "This render started at level {level}, and that number is fixed for as long as it runs.",
            "Level {level} is what this render started with, and it stays that way for the whole run.",
            "Level {level}, and it stays that way for the whole run, no matter what gets clicked below.",
        ],
        yue: [
            "呢次算圖係喺第 {level} 級開始嘅。呢個數字喺呢次算圖嘅整個過程都唔會變。",
            "呢次算圖係喺第 {level} 級開始嘅。呢個數字喺呢次算圖嘅整個過程都唔會變。",
            "呢次算圖係第 {level} 級開始嘅，呢個數字喺成個過程都係死嘅。",
            "第 {level} 級係呢次算圖一開始嘅設定，成個過程都唔會變。",
            "第 {level} 級，成個過程都唔會變，下面撳咩都好。",
        ],
    },
    "liveSpeed.currentCustom": {
        en: [
            "This render's thread count is {count}, which does not match any level. It is unchanged, and stays that way for the life of this render.",
            "This render's thread count is {count}, which does not match any level. It is unchanged, and stays that way for the life of this render.",
            "This render's thread count is {count}, which matches no level. It is unchanged and stays fixed for the whole run.",
            "Thread count here is {count}, custom, matching none of the five levels. Nothing has touched it, and it is fixed for the whole run.",
            "Thread count here is {count}, custom through and through, matching none of the five levels. Nothing has touched it, and it is fixed for the whole run.",
        ],
        yue: [
            "呢次算圖嘅執行緒數量係 {count}，同任何等級都唔啱。呢個數值冇變過，成個算圖過程都會保持咁樣。",
            "呢次算圖嘅執行緒數量係 {count}，同任何等級都唔啱。呢個數值冇變過，成個算圖過程都會保持咁樣。",
            "呢次算圖嘅執行緒數量係 {count}，同五個等級邊個都唔啱。冇改過，成個過程都係咁。",
            "呢度嘅執行緒數量係 {count}，自訂，五個等級邊個都唔啱。冇郁過，成個過程都係死嘅。",
            "呢度嘅執行緒數量係 {count}，自訂到不得了，五個等級邊個都唔啱。一隻手指都冇郁過，成個過程都係死嘅。",
        ],
    },
    "liveSpeed.outcomeApplied": {
        en: [
            "Level {level} is now applied to the {route} route, effective immediately.",
            "Level {level} is now applied to the {route} route, effective immediately.",
            "Level {level} applied to the {route} route, right now.",
            "Level {level} landed on the {route} route immediately - no waiting for anything.",
            "Level {level} landed on the {route} route immediately, no waiting, no fine print.",
        ],
        yue: [
            "第 {level} 級而家已經套用喺 {route} 呢條路線，即時生效。",
            "第 {level} 級而家已經套用喺 {route} 呢條路線，即時生效。",
            "第 {level} 級套用咗喺 {route} 路線，即刻生效。",
            "第 {level} 級即刻落咗喺 {route} 路線度，唔使等。",
            "第 {level} 級即刻落咗喺 {route} 路線度，唔使等、冇細字。",
        ],
    },
    "liveSpeed.outcomeBlocked": {
        en: [
            "Level {level} could not be applied to the {route} route right now.",
            "Level {level} could not be applied to the {route} route right now.",
            "Level {level} was not applied to the {route} route right now.",
            "Level {level} did not land on the {route} route this time.",
            "Level {level} did not land on the {route} route this time, no hiding it.",
        ],
        yue: [
            "第 {level} 級而家套用唔到落 {route} 呢條路線。",
            "第 {level} 級而家套用唔到落 {route} 呢條路線。",
            "第 {level} 級呢次冇套用到落 {route} 路線。",
            "第 {level} 級今次冇落到 {route} 路線度。",
            "第 {level} 級今次冇落到 {route} 路線度，唔會扮冇事。",
        ],
    },
    "liveSpeed.deferredNote": {
        en: [
            "The thread count and thread priority baked into this render's own launch only change on the next render.",
            "The thread count and thread priority baked into this render's own launch only change on the next render.",
            "Only the next render moves the thread count and thread priority baked into this render's own launch.",
            "Nothing here reaches the thread count or the thread priority baked into this render's launch - only the next render does.",
            "Nothing here so much as brushes the thread count or the thread priority baked into this render's launch - only the next render actually moves either one.",
        ],
        yue: [
            "呢次算圖啟動時已經寫死嘅執行緒數量同執行緒優先權，要去到下次算圖先會改變。",
            "呢次算圖啟動時已經寫死嘅執行緒數量同執行緒優先權，要去到下次算圖先會改變。",
            "淨係下次算圖先郁到呢次算圖啟動時寫死嘅執行緒數量同執行緒優先權。",
            "呢度郁極都郁唔到呢次算圖啟動時寫死嘅執行緒數量或者執行緒優先權，淨係下次算圖先郁到。",
            "呢度連呢次算圖啟動時寫死嘅執行緒數量或者執行緒優先權都撩唔到，淨係下次算圖先真係郁到。",
        ],
    },
    "liveSpeed.extremes": {
        en: [
            "Level 1 leans as lightly as possible on this machine while it renders. Level 5 leans as hard as this application will ever ask for.",
            "Level 1 leans as lightly as possible on this machine while it renders. Level 5 leans as hard as this application will ever ask for.",
            "Level 1 leans lightest on this machine; Level 5 is the hardest this application will ever ask for.",
            "Level 1 is the gentlest this gets; Level 5 is as hard as this app will ever lean on the machine.",
            "Level 1 barely touches this machine; Level 5 is the hardest this app has the nerve to ask for.",
        ],
        yue: [
            "第 1 級對呢部機嘅負擔盡量輕；第 5 級係呢個應用程式會要求嘅最大負擔。",
            "第 1 級對呢部機嘅負擔盡量輕；第 5 級係呢個應用程式會要求嘅最大負擔。",
            "第 1 級對呢部機負擔最輕；第 5 級係呢個 app 會要求嘅最大負擔。",
            "第 1 級最斯文；第 5 級係呢個 app 會谷呢部機到嘅極限。",
            "第 1 級斯文到寸都唔郁；第 5 級就係呢個 app 敢谷呢部機到嘅極限。",
        ],
    },
    "liveSpeed.restartOffer": {
        en: [
            "Restarting this render now would launch it fresh at level {level}, applying its thread count immediately rather than waiting for the next render. Already-drawn tiles are kept either way.",
            "Restarting this render now would launch it fresh at level {level}, applying its thread count immediately rather than waiting for the next render. Already-drawn tiles are kept either way.",
            "Restarting now launches this render fresh at level {level}, applying its thread count immediately instead of on the next render. Tiles already drawn are kept.",
            "A restart right now relaunches this render at level {level}, thread count included, instead of waiting for a future render. Nothing already drawn is lost.",
            "A restart right now relaunches this render at level {level}, thread count and all, instead of making you wait for a future render. Nothing already drawn goes anywhere.",
        ],
        yue: [
            "而家重新啟動呢次算圖，會用第 {level} 級重新開始，執行緒數量即時生效，唔使等下一次算圖。已經畫好嘅圖磚無論如何都會保留。",
            "而家重新啟動呢次算圖，會用第 {level} 級重新開始，執行緒數量即時生效，唔使等下一次算圖。已經畫好嘅圖磚無論如何都會保留。",
            "而家重啟呢次算圖，會用第 {level} 級重新開始，執行緒數量即刻生效，唔使等下次。已經畫好嘅圖磚會保留。",
            "而家重啟即刻用第 {level} 級再嚟過，執行緒數量一齊生效，唔使等將來嗰次算圖。已經畫好嘅嘢冇走雞。",
            "而家重啟即刻用第 {level} 級再嚟過，執行緒數量一齊生效，唔駛等將來嗰次。已經畫好嘅嘢一啲都冇走雞。",
        ],
    },
    "liveSpeed.disabled.actions": {
        en: [
            "This render is running on GitHub's own runners. Nothing about its speed is adjustable from here: the machine belongs to GitHub, not to this application.",
            "This render is running on GitHub's own runners. Nothing about its speed is adjustable from here: the machine belongs to GitHub, not to this application.",
            "This render is on GitHub's own runners, so nothing about its speed is adjustable from here - GitHub owns that machine.",
            "GitHub's own runners are running this render, and this app has no lever to reach in with. Nothing here can move.",
            "GitHub's own runners have this one, and this app has no lever anywhere near it. This whole dial is decoration on that route.",
        ],
        yue: [
            "呢次算圖喺 GitHub 自己嘅執行器度跑緊。喺呢度冇辦法調校佢嘅速度：架機屬於 GitHub，唔係呢個應用程式。",
            "呢次算圖喺 GitHub 自己嘅執行器度跑緊。喺呢度冇辦法調校佢嘅速度：架機屬於 GitHub，唔係呢個應用程式。",
            "呢次算圖喺 GitHub 自己嘅執行器跑緊，所以喺呢度冇辦法調校速度，架機係 GitHub 嘅。",
            "GitHub 自己嘅執行器跑緊呢次算圖，呢個 app 完全冇位入手。呢度郁極都冇用。",
            "GitHub 自己嘅執行器跑緊呢次，呢個 app 連邊度入手都搵唔到。呢個掣喺呢條路線純粹擺設。",
        ],
    },
    "liveSpeed.disabled.remote": {
        en: [
            "This render is running on another computer over SSH, and live speed changes are not wired for that route yet.",
            "This render is running on another computer over SSH, and live speed changes are not wired for that route yet.",
            "This render is running remotely over SSH, and live speed changes are not wired for that route yet.",
            "SSH to another machine is running this one, and this dial does not reach that far yet.",
            "SSH to another machine is running this one, and this dial has not learned to reach that far yet.",
        ],
        yue: [
            "呢次算圖喺另一部電腦度用 SSH 跑緊，即時調速呢個功能仲未駁通嗰條路線。",
            "呢次算圖喺另一部電腦度用 SSH 跑緊，即時調速呢個功能仲未駁通嗰條路線。",
            "呢次算圖用緊 SSH 喺遠端跑，即時調速仲未駁通嗰條路線。",
            "另一部機用 SSH 跑緊呢次，呢個掣仲伸唔到咁遠。",
            "另一部機用 SSH 跑緊呢次，呢個掣仲未學識伸咁遠。",
        ],
    },
    "liveSpeed.disabled.unknown": {
        en: [
            "This build does not yet know where this render is running, so there is nothing here it can adjust safely.",
            "This build does not yet know where this render is running, so there is nothing here it can adjust safely.",
            "This build does not know where this render is running yet, so there is nothing safe to adjust here.",
            "Nobody has told this build where this render is running, so this dial has nothing safe to touch.",
            "Nobody has told this build where this render is running, so this dial is keeping its hands to itself.",
        ],
        yue: [
            "呢個版本仲唔知道呢次算圖喺邊度跑緊，所以呢度冇嘢可以安全調校。",
            "呢個版本仲唔知道呢次算圖喺邊度跑緊，所以呢度冇嘢可以安全調校。",
            "呢個版本未知呢次算圖喺邊度跑，所以呢度冇嘢好安全咁郁。",
            "冇人話過呢個版本知呢次算圖喺邊度跑，所以呢個掣冇嘢好安全咁㩒。",
            "冇人話過呢個版本知呢次算圖喺邊度跑，所以呢個掣乖乖縮埋手。",
        ],
    },
    "liveSpeed.throughputRate": {
        en: [
            "Moving at about {rate}% of the whole render per minute, over the last {seconds} seconds.",
            "Moving at about {rate}% of the whole render per minute, over the last {seconds} seconds.",
            "About {rate}% of the whole render per minute, over the last {seconds} seconds.",
            "Roughly {rate}% of the whole thing per minute right now, measured over the last {seconds} seconds.",
            "Roughly {rate}% of the whole thing per minute, clocked over the last {seconds} seconds - watch it move when the level changes.",
        ],
        yue: [
            "每分鐘大約行咗成個算圖嘅 {rate}%，呢個係最近 {seconds} 秒嘅量度。",
            "每分鐘大約行咗成個算圖嘅 {rate}%，呢個係最近 {seconds} 秒嘅量度。",
            "每分鐘大約 {rate}%，呢個係最近 {seconds} 秒嘅量度。",
            "而家每分鐘大約行緊 {rate}%，係最近 {seconds} 秒度計出嚟嘅。",
            "而家每分鐘大約行緊 {rate}%，最近 {seconds} 秒實測，等級一改就有得睇佢郁。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const LIVESPEED_FIXED = {
    "liveSpeed.title": { en: "Adjust speed", yue: "即時調速" },
    "liveSpeed.pickerLabel": { en: "Live speed, level 1 to 5", yue: "即時速度，1 至 5 級" },
    "liveSpeed.restartButton": { en: "Restart at this level", yue: "用呢個等級重新啟動" },
    "liveSpeed.restarting": { en: "Restarting...", yue: "重新啟動緊…" },
    "liveSpeed.throughputLabel": { en: "Throughput", yue: "進度速率" },
    "liveSpeed.throughputNone": { en: "Not enough data yet to show a rate.", yue: "數據仲未夠，暫時計唔到速率。" },
    "liveSpeed.messageLabel": { en: "The main process said:", yue: "主程序話：" },
    "liveSpeed.route.local": { en: "local", yue: "本機" },
    "liveSpeed.route.docker": { en: "docker", yue: "Docker" },
    "liveSpeed.route.unsupported": { en: "this route", yue: "呢條路線" },
} as const satisfies Record<string, FixedString>;

export const LIVESPEED_FACTS = {
    "liveSpeed.blurb": {
        en: ["operating system", "thread count", "restart"],
        yue: ["作業系統", "執行緒數量", "重新啟動"],
    },
    "liveSpeed.currentAutomatic": { en: ["automatic", "restart"], yue: ["自動", "重新啟動"] },
    "liveSpeed.currentLevel": { en: ["{level}"], yue: ["{level}"] },
    "liveSpeed.currentCustom": { en: ["{count}"], yue: ["{count}"] },
    "liveSpeed.outcomeApplied": { en: ["{level}", "{route}"], yue: ["{level}", "{route}"] },
    "liveSpeed.outcomeBlocked": { en: ["{level}", "{route}"], yue: ["{level}", "{route}"] },
    "liveSpeed.deferredNote": {
        en: ["thread count", "thread priority", "next render"],
        yue: ["執行緒數量", "執行緒優先權", "下次算圖"],
    },
    "liveSpeed.extremes": { en: ["Level 1", "Level 5"], yue: ["第 1 級", "第 5 級"] },
    "liveSpeed.restartOffer": { en: ["{level}"], yue: ["{level}"] },
    "liveSpeed.disabled.actions": { en: ["GitHub"], yue: ["GitHub"] },
    "liveSpeed.disabled.remote": { en: ["SSH"], yue: ["SSH"] },
    "liveSpeed.disabled.unknown": { en: ["this render is running"], yue: ["呢個版本", "喺邊度跑"] },
    "liveSpeed.throughputRate": { en: ["{rate}", "{seconds}"], yue: ["{rate}", "{seconds}"] },
} as const satisfies Record<keyof typeof LIVESPEED_VOICED, { en: readonly string[]; yue: readonly string[] }>;
