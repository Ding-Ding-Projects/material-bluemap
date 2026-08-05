/**
 * The novice "Speed" dial in the options editor's Core tab: one 1-5 control
 * that writes `render-thread-count` and `render-thread-priority` in `core.conf`
 * together, so somebody who has never heard of a JVM thread priority still gets
 * to change how hard BlueMap leans on the host machine while it renders.
 *
 * `SpeedControl.vue` is the only renderer of this surface, and it is NOT
 * registered in `surfaces/index.ts` -- per the standing instruction that a new
 * copy surface ships unwired and integration decides when it joins the
 * catalogue. Until then every `t()` call here renders its English, level-1
 * fallback, which is why every fallback string below is written as the real
 * level-1 (fully professional) sentence rather than a placeholder.
 *
 * ## The one fact every level has to keep
 *
 * `speed.custom` is the state that stops this control from ever overwriting a
 * value on its own: it fires whenever the two raw fields do not match any of
 * the five levels exactly, and it says plainly that nothing was changed and
 * nothing will be unless the reader clicks a level. A rewrite that softened
 * that into something that sounds like the app already fixed it for them would
 * be lying about whether their advanced values are still there. `speed.applied`
 * carries the matching half: clicking a level really does overwrite both raw
 * fields, and that fact survives every level too, so nobody clicks "3" expecting
 * a preview and gets a silent write instead.
 *
 * `SPEED_FACTS` pins the numbers themselves -- `render-thread-count` and
 * `render-thread-priority` by name, and the literal level number -- because a
 * message that stops saying *which two settings* it is talking about is not a
 * funnier message, it is a useless one.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const SPEED_VOICED = {
    /* The section's own heading blurb, above the five-level dial. */
    "speed.blurb": {
        en: [
            "One dial for how hard BlueMap leans on this machine while it renders: how many threads it uses, and how much CPU priority they get. Pick a level, or leave the raw settings below exactly as they are.",
            "One dial for how hard BlueMap leans on this machine while it renders: how many threads it uses, and how much CPU priority they get. Pick a level, or leave the raw settings below exactly as they are.",
            "One dial for how hard BlueMap leans on this machine while it renders: how many render threads it uses, and how much CPU priority they get. Pick a level, or leave the raw settings below exactly as they are.",
            "One dial for how hard BlueMap leans on this machine while it renders: how many render threads it uses, and how much CPU priority they get. Pick a level here, or ignore this entirely and drive the raw settings below by hand.",
            "One dial for how hard BlueMap leans on this poor machine while it renders: how many render threads it uses, and how much CPU priority they get. Pick a level here, or ignore this dial completely and drive the raw settings below by hand like it's 2019.",
        ],
        yue: [
            "一個掣，控制 BlueMap 算圖嗰陣有幾用力谷呢部機：用幾多條執行緒，同埋佢哋攞幾高嘅 CPU 優先權。揀個等級，或者由得下面嗰兩個原始設定保持原狀。",
            "一個掣，控制 BlueMap 算圖嗰陣有幾用力谷呢部機：用幾多條執行緒，同埋佢哋攞幾高嘅 CPU 優先權。揀個等級，或者由得下面嗰兩個原始設定保持原狀。",
            "一個掣，控制 BlueMap 算圖嗰陣有幾用力谷呢部機：用幾多條算圖執行緒，同埋佢哋攞幾高嘅 CPU 優先權。揀個等級，或者由得下面嗰兩個原始設定保持原狀。",
            "一個掣，控制 BlueMap 算圖嗰陣有幾用力谷呢部機：用幾多條算圖執行緒，同埋佢哋攞幾高嘅 CPU 優先權。喺呢度揀個等級，或者索性唔理呢個掣，自己手動撥下面嗰兩個原始設定。",
            "一個掣，控制 BlueMap 算圖嗰陣有幾用力谷呢部苦命機：用幾多條算圖執行緒，同埋佢哋攞幾高嘅 CPU 優先權。喺呢度揀個等級，或者索性唔理呢個掣，扮 2019 年咁自己手動撥下面嗰兩個原始設定。",
        ],
    },
    /*
     * Every level's own one-line summary of what it writes. `{count}` and
     * `{priority}` are the exact numbers, always, at every level -- see the
     * FACTS entry below.
     */
    "speed.levelSummary": {
        en: [
            "Sets render-thread-count to {count} and render-thread-priority to {priority}.",
            "Sets render-thread-count to {count} and render-thread-priority to {priority}.",
            "Sets render-thread-count to {count} and render-thread-priority to {priority}.",
            "Writes render-thread-count as {count} and render-thread-priority as {priority}. Nothing else moves.",
            "Writes render-thread-count as {count} and render-thread-priority as {priority}, full stop. Nothing else moves.",
        ],
        yue: [
            "會將 render-thread-count 設做 {count}，render-thread-priority 設做 {priority}。",
            "會將 render-thread-count 設做 {count}，render-thread-priority 設做 {priority}。",
            "會將 render-thread-count 設做 {count}，render-thread-priority 設做 {priority}。",
            "會將 render-thread-count 寫做 {count}，render-thread-priority 寫做 {priority}。第二樣嘢一律唔會郁。",
            "會將 render-thread-count 寫做 {count}，render-thread-priority 寫做 {priority}，齊晒。第二樣嘢一律唔會郁半吋。",
        ],
    },
    /* Shown beside whichever level is currently selected, level 3 included. */
    "speed.applied": {
        en: [
            "Currently set to level {level}: render-thread-count is {count} and render-thread-priority is {priority}.",
            "Currently set to level {level}: render-thread-count is {count} and render-thread-priority is {priority}.",
            "Currently set to level {level}: render-thread-count is {count} and render-thread-priority is {priority}.",
            "Right now this is level {level}: render-thread-count reads {count} and render-thread-priority reads {priority}.",
            "Right now this is level {level}, no more and no less: render-thread-count reads {count} and render-thread-priority reads {priority}.",
        ],
        yue: [
            "而家係第 {level} 級：render-thread-count 係 {count}，render-thread-priority 係 {priority}。",
            "而家係第 {level} 級：render-thread-count 係 {count}，render-thread-priority 係 {priority}。",
            "而家係第 {level} 級：render-thread-count 係 {count}，render-thread-priority 係 {priority}。",
            "而家企緊喺第 {level} 級：render-thread-count 讀出嚟係 {count}，render-thread-priority 讀出嚟係 {priority}。",
            "而家企緊喺第 {level} 級，唔多唔少：render-thread-count 讀出嚟係 {count}，render-thread-priority 讀出嚟係 {priority}。",
        ],
    },
    /* level 3 specifically, since it is also BlueMap's own Java default. */
    "speed.appliedDefault": {
        en: [
            "Currently set to level {level}, which is also BlueMap's own default: render-thread-count is {count} and render-thread-priority is {priority}.",
            "Currently set to level {level}, which is also BlueMap's own default: render-thread-count is {count} and render-thread-priority is {priority}.",
            "Currently set to level {level}, which is also BlueMap's own default: render-thread-count is {count} and render-thread-priority is {priority}.",
            "Right now this is level {level}, BlueMap's own out-of-the-box default: render-thread-count reads {count} and render-thread-priority reads {priority}.",
            "Right now this is level {level}, which happens to be exactly what BlueMap ships with anyway: render-thread-count reads {count} and render-thread-priority reads {priority}.",
        ],
        yue: [
            "而家係第 {level} 級，同時亦都係 BlueMap 自己嘅預設值：render-thread-count 係 {count}，render-thread-priority 係 {priority}。",
            "而家係第 {level} 級，同時亦都係 BlueMap 自己嘅預設值：render-thread-count 係 {count}，render-thread-priority 係 {priority}。",
            "而家係第 {level} 級，同時亦都係 BlueMap 自己嘅預設值：render-thread-count 係 {count}，render-thread-priority 係 {priority}。",
            "而家企緊喺第 {level} 級，即係 BlueMap 開箱即用嘅預設值：render-thread-count 讀出嚟係 {count}，render-thread-priority 讀出嚟係 {priority}。",
            "而家企緊喺第 {level} 級，啱啱好就係 BlueMap 本身出廠嗰個預設值：render-thread-count 讀出嚟係 {count}，render-thread-priority 讀出嚟係 {priority}。",
        ],
    },
    /*
     * The Custom state: the raw pair matches no level. This is the message the
     * whole "never silently snap or overwrite" requirement rests on, so
     * "nothing has changed" and "pick a level below to replace them" both stay
     * in every one of the ten strings.
     */
    "speed.custom": {
        en: [
            "Custom: render-thread-count is {count} and render-thread-priority is {priority}, which does not match any level. Nothing here has changed them; pick a level below to replace them.",
            "Custom: render-thread-count is {count} and render-thread-priority is {priority}, which does not match any level. Nothing here has changed them; pick a level below to replace them.",
            "Custom: render-thread-count is {count} and render-thread-priority is {priority}, which does not match any of the five levels. Nothing here has changed them; pick a level below to replace them.",
            "Custom right now: render-thread-count is {count} and render-thread-priority is {priority}, and that pair does not match any of the five levels. Nothing here has touched them; pick a level below if you want this dial to take over.",
            "Custom right now, and proudly so: render-thread-count is {count} and render-thread-priority is {priority}, a pair that matches none of the five levels. Nothing here has touched them; pick a level below only if you actually want this dial to take over.",
        ],
        yue: [
            "自訂：render-thread-count 係 {count}，render-thread-priority 係 {priority}，兩個都唔啱任何等級。呢度冇改過佢哋；想改就喺下面揀個等級。",
            "自訂：render-thread-count 係 {count}，render-thread-priority 係 {priority}，兩個都唔啱任何等級。呢度冇改過佢哋；想改就喺下面揀個等級。",
            "自訂：render-thread-count 係 {count}，render-thread-priority 係 {priority}，同五個等級邊個都唔啱。呢度冇改過佢哋；想改就喺下面揀個等級。",
            "而家係自訂狀態：render-thread-count 係 {count}，render-thread-priority 係 {priority}，呢組數同五個等級邊個都夾唔到。呢度冇改過佢哋，一隻手指都冇郁過；想呢個掣接手就喺下面揀個等級。",
            "而家自豪咁企喺自訂狀態：render-thread-count 係 {count}，render-thread-priority 係 {priority}，呢組數同五個等級全部夾唔到。呢度冇改過佢哋，一隻手指都冇郁過；真係想呢個掣接手先至喺下面揀個等級。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const SPEED_FIXED = {
    /* The section heading, above the blurb. */
    "speed.title": { en: "Speed", yue: "速度" },
    /* The five level buttons. Names, not sentences, so they stay put across levels. */
    "speed.level.1": { en: "1 · Gentle", yue: "1 級 · 輕手" },
    "speed.level.2": { en: "2 · Light", yue: "2 級 · 略快" },
    "speed.level.3": { en: "3 · Balanced", yue: "3 級 · 均衡" },
    "speed.level.4": { en: "4 · Fast", yue: "4 級 · 較快" },
    "speed.level.5": { en: "5 · Fastest", yue: "5 級 · 最快" },
    /* The accessible name of the level picker itself. */
    "speed.pickerLabel": { en: "Speed, level 1 to 5", yue: "速度，1 至 5 級" },
    /* BlueMap's own default, shown as a chip on level 3. */
    "speed.defaultChip": { en: "BlueMap's default", yue: "BlueMap 預設" },
    /* The progressive-disclosure toggle over the exact-values table. */
    "speed.details.show": { en: "Show exactly what each level sets", yue: "睇清楚每個等級實際設咩" },
    "speed.details.hide": { en: "Hide the details", yue: "收埋詳情" },
    /* The details table's own columns. */
    "speed.table.level": { en: "Level", yue: "等級" },
    "speed.table.threadCount": { en: "render-thread-count", yue: "render-thread-count" },
    "speed.table.threadPriority": { en: "render-thread-priority", yue: "render-thread-priority" },
    "speed.table.caption": { en: "Every level and the exact raw values it writes", yue: "每個等級同佢實際寫入嘅原始數值" },
} as const satisfies Record<string, FixedString>;

export const SPEED_FACTS = {
    "speed.blurb": { en: ["threads", "priority", "raw settings"], yue: ["執行緒", "優先權", "原始設定"] },
    "speed.levelSummary": {
        en: ["render-thread-count", "{count}", "render-thread-priority", "{priority}"],
        yue: ["render-thread-count", "{count}", "render-thread-priority", "{priority}"],
    },
    "speed.applied": {
        en: ["{level}", "render-thread-count", "{count}", "render-thread-priority", "{priority}"],
        yue: ["{level}", "render-thread-count", "{count}", "render-thread-priority", "{priority}"],
    },
    "speed.appliedDefault": {
        en: ["{level}", "BlueMap", "render-thread-count", "{count}", "render-thread-priority", "{priority}"],
        yue: ["{level}", "BlueMap", "render-thread-count", "{count}", "render-thread-priority", "{priority}"],
    },
    "speed.custom": {
        en: ["render-thread-count", "{count}", "render-thread-priority", "{priority}", "Nothing here"],
        yue: ["render-thread-count", "{count}", "render-thread-priority", "{priority}", "呢度冇改過佢哋"],
    },
} as const satisfies Record<keyof typeof SPEED_VOICED, { en: readonly string[]; yue: readonly string[] }>;
