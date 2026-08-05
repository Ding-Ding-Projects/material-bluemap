/**
 * Project presets, and the lightweight "this is BlueMap's own default" indicator on the
 * project editor's render-options tab.
 *
 * Both live in one module because they answer the same question from two directions: the
 * empty state says "here is what BlueMap would set for you, plainly, before you touch
 * anything", and the render tab says "here is what you already changed, and here is the
 * one button back". Neither is allowed to invent a value. Every number, key and field name
 * a preset writes comes straight from `@material-bluemap/config`'s own schema and its
 * generated templates - `projectModel.ts`'s own doc comment on `PROJECT_PRESETS` names
 * exactly which schema field backs each one - so this module's job is only to say, in
 * words, what those functions already do.
 *
 * ## Why the "applied" lines are four keys instead of one
 *
 * `applyPreset` composes rather than overwrites: it skips a map id the project already
 * has, leaves an existing storage alone, and never touches a `webserver.conf` the project
 * already carries. A single fixed "Preset applied!" sentence would be a lie the second time
 * somebody presses the same button, or the moment a preset is applied to a project that
 * already has an overworld map. So each of the three things a preset can do -
 * `appliedMaps`/`appliedMapsNone`, `appliedStorage`/`appliedStorageSkipped`,
 * `appliedWebserver`/`appliedWebserverSkipped` - carries its own pair, one for "this
 * happened" and one for "this was already true", and the component decides which half to
 * show from `PresetApplication`'s own booleans rather than this module guessing.
 *
 * ## `project.fieldDefault.*`, not `project.presets.*`
 *
 * The render-options default indicator has nothing to do with presets - it is the answer
 * to requirement 3, "make BlueMap's default first-class wherever the editor shows a
 * value", for the one place in the project editor that had no such indicator yet (every
 * other value in this editor already goes through `../config/ConfigField.vue`, which has
 * carried this for every real config field since before this module existed). It is kept
 * here rather than in a third file because it is new copy from the same task, and it is
 * kept under its own `project.fieldDefault.*` prefix, not `project.presets.*`, so it reads
 * honestly as its own feature rather than as a preset side effect.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PRESETS_VOICED = {
    /* ---------------------------------------------------------------- */
    /* What each preset creates, exactly                                */
    /* ---------------------------------------------------------------- */

    "project.presets.overworldOnly.description": {
        en: [
            "Creates one map, the Overworld, written from BlueMap's own template, plus a file storage for its tiles. Every value stays editable afterwards.",
            "Creates one map, the Overworld, written from BlueMap's own template, plus a file storage for its tiles. Every value stays editable afterwards.",
            "Creates one map, the Overworld, written straight from BlueMap's own template, plus a file storage for its tiles. Nothing is locked in: every value stays editable afterwards.",
            "One map, the Overworld, written straight from BlueMap's own template, plus a file storage for its tiles. Nothing is locked in here: every value stays editable afterwards.",
            "One map, the Overworld, straight from BlueMap's own template, plus a file storage to catch its tiles. Nothing is locked in: every value stays editable afterwards, promise.",
        ],
        yue: [
            "整一張地圖，Overworld，用 BlueMap 自己嘅樣板寫出嚟，再加一個 file storage 擺佢啲 tile。所有數值之後都改得。",
            "整一張地圖，Overworld，用 BlueMap 自己嘅樣板寫出嚟，再加一個 file storage 擺佢啲 tile。所有數值之後都改得。",
            "整一張地圖，Overworld，直接用 BlueMap 自己嘅樣板寫出嚟，再加一個 file storage 擺佢啲 tile。乜都未鎖死：所有數值之後都改得。",
            "一張地圖，Overworld，直接用 BlueMap 自己嘅樣板寫出嚟，再加一個 file storage 擺佢啲 tile。呢度乜都未鎖死：所有數值之後都改得。",
            "一張地圖，Overworld，直接用 BlueMap 自己嘅樣板寫出嚟，再加一個 file storage 擺住佢啲 tile。乜都未鎖死：所有數值之後想點改就點改，講得出做得到。",
        ],
    },
    "project.presets.allDimensions.description": {
        en: [
            "Creates three maps, Overworld, Nether and End, each written from BlueMap's own per-dimension template, sharing one file storage.",
            "Creates three maps, Overworld, Nether and End, each written from BlueMap's own per-dimension template, sharing one file storage.",
            "Creates three maps, Overworld, Nether and End, each written from BlueMap's own per-dimension template, sharing one file storage. Every value stays editable afterwards.",
            "Three maps: Overworld, Nether and End, each straight from BlueMap's own per-dimension template, sharing one file storage. Every value stays editable afterwards.",
            "Three maps in one go: Overworld, Nether and End, each straight from BlueMap's own per-dimension template, sharing one file storage. Every value still stays editable afterwards, no strings attached.",
        ],
        yue: [
            "整三張地圖，Overworld、Nether 同 End，每張都用 BlueMap 自己嗰個 dimension 專屬樣板寫出嚟，共用一個 file storage。",
            "整三張地圖，Overworld、Nether 同 End，每張都用 BlueMap 自己嗰個 dimension 專屬樣板寫出嚟，共用一個 file storage。",
            "整三張地圖，Overworld、Nether 同 End，每張都用返 BlueMap 自己嗰個 dimension 專屬樣板寫出嚟，共用一個 file storage。所有數值之後都改得。",
            "一次過三張地圖：Overworld、Nether 同 End，每張都直接用 BlueMap 自己嗰個 dimension 專屬樣板，共用一個 file storage。所有數值之後都改得。",
            "一次過三張地圖：Overworld、Nether 同 End，每張都直接用 BlueMap 自己嗰個 dimension 專屬樣板，共用一個 file storage。所有數值之後照樣改得，唔使問。",
        ],
    },
    "project.presets.webServerOff.description": {
        en: [
            "The same three maps as Overworld, Nether and End, plus a file storage for their tiles and a webserver.conf that explicitly switches the built-in web server off, for a render-only setup.",
            "The same three maps as Overworld, Nether and End, plus a file storage for their tiles and a webserver.conf that explicitly switches the built-in web server off, for a render-only setup.",
            "The same three maps, Overworld, Nether and End, plus a file storage for their tiles and a webserver.conf that explicitly switches the built-in web server off. Good for a render-only setup with no server running locally.",
            "Overworld, Nether and End again, plus a file storage for their tiles and a webserver.conf that explicitly switches the built-in web server off. A render-only setup, nothing served locally.",
            "Overworld, Nether and End again, plus a file storage for their tiles and a webserver.conf that firmly switches the built-in web server off. Render-only, nothing served locally, and nobody knocking on a port.",
        ],
        yue: [
            "同樣係 Overworld、Nether 同 End 三張地圖，再加一個 file storage 擺佢哋啲 tile，仲有一個 webserver.conf，明文將內建 web server 閂咗，做一個淨係算圖嘅設定。",
            "同樣係 Overworld、Nether 同 End 三張地圖，再加一個 file storage 擺佢哋啲 tile，仲有一個 webserver.conf，明文將內建 web server 閂咗，做一個淨係算圖嘅設定。",
            "同樣係 Overworld、Nether 同 End 三張地圖，再加一個 file storage 擺佢哋啲 tile，仲有一個 webserver.conf，明文將內建 web server 閂咗。啱晒淨係算圖、本機唔起 server 嘅用法。",
            "又係 Overworld、Nether 同 End，再加一個 file storage 擺佢哋啲 tile，仲有一個 webserver.conf，明文將內建 web server 閂咗。淨係算圖，本機乜 server 都冇開。",
            "又係 Overworld、Nether 同 End，再加一個 file storage 擺佢哋啲 tile，仲有一個 webserver.conf，硬係將內建 web server 閂到實。淨係算圖，本機乜 server 都冇開，一個 port 都冇人敲得。",
        ],
    },
    "project.presets.fastRender.description": {
        en: [
            "The same three maps, Overworld, Nether and End, plus a file storage for their tiles, each with its hires layer switched off (enable-hires set to false), which speeds up rendering and shrinks the files, at the cost of close-up 3D detail.",
            "The same three maps, Overworld, Nether and End, plus a file storage for their tiles, each with its hires layer switched off (enable-hires set to false), which speeds up rendering and shrinks the files, at the cost of close-up 3D detail.",
            "The same three maps, Overworld, Nether and End, plus a file storage for their tiles, each with its hires layer switched off (enable-hires set to false). Faster renders and smaller files, at the cost of close-up 3D detail when somebody zooms in.",
            "Overworld, Nether and End again, plus a file storage for their tiles, each with its hires layer switched off (enable-hires set to false). Faster, smaller, and a little flatter up close.",
            "Overworld, Nether and End again, plus a file storage for their tiles, each with its hires layer switched clean off (enable-hires set to false). Faster, smaller, and yes, a bit flatter the moment somebody zooms in close.",
        ],
        yue: [
            "同樣係 Overworld、Nether 同 End 三張地圖，再加一個 file storage 擺佢哋啲 tile，每張都閂咗個 hires layer（enable-hires 設做 false），算得快啲、檔案細啲，代價係影埋近鏡嗰陣冇咗 3D 細節。",
            "同樣係 Overworld、Nether 同 End 三張地圖，再加一個 file storage 擺佢哋啲 tile，每張都閂咗個 hires layer（enable-hires 設做 false），算得快啲、檔案細啲，代價係影埋近鏡嗰陣冇咗 3D 細節。",
            "同樣係 Overworld、Nether 同 End 三張地圖，再加一個 file storage 擺佢哋啲 tile，每張都閂咗個 hires layer（enable-hires 設做 false）。算得快、檔案細，代價係影埋近鏡嗰陣少咗 3D 細節。",
            "又係 Overworld、Nether 同 End，再加一個 file storage 擺佢哋啲 tile，每張都閂咗個 hires layer（enable-hires 設做 false）。快啲、細啲，近鏡望落會平啲。",
            "又係 Overworld、Nether 同 End，再加一個 file storage 擺佢哋啲 tile，每張都硬係閂咗個 hires layer（enable-hires 設做 false）。快啲、細啲，影埋近鏡梗係會平啲，講明先。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What applying one actually did                                   */
    /* ---------------------------------------------------------------- */

    "project.presets.appliedMaps": {
        en: [
            "{maps} map(s) added: {names}.",
            "{maps} map(s) added: {names}.",
            "{maps} map(s) added: {names}. Nothing on this project's disk yet until it is saved.",
            "{maps} map(s) added: {names}. Nothing lands on disk until this project is saved.",
            "{maps} shiny new map(s) added: {names}. Not a byte hits disk until this project is saved, so no rush.",
        ],
        yue: [
            "加咗 {maps} 張地圖：{names}。",
            "加咗 {maps} 張地圖：{names}。",
            "加咗 {maps} 張地圖：{names}。呢個 project 未儲之前，磁碟上乜都未有。",
            "加咗 {maps} 張地圖：{names}。未儲呢個 project 之前，磁碟上一個位元組都未落。",
            "加咗 {maps} 張閃令令新地圖：{names}。未儲呢個 project 之前，磁碟度一個位元組都未落，唔使急。",
        ],
    },
    "project.presets.appliedMapsNone": {
        en: [
            "Every map this preset creates was already in the project, so nothing was added there.",
            "Every map this preset creates was already in the project, so nothing was added there.",
            "Every map this preset would create was already in the project, so nothing new was added there.",
            "Every map this preset creates was already in the project. Nothing new was added there.",
            "Every map this preset creates was already in the project, plain and simple. Nothing new landed there.",
        ],
        yue: [
            "呢個 preset 想整嘅地圖，個 project 已經喺度有齊，所以冇加過。",
            "呢個 preset 想整嘅地圖，個 project 已經喺度有齊，所以冇加過。",
            "呢個 preset 想整嘅地圖，個 project 已經喺度有齊，所以一張都冇加過。",
            "呢個 preset 想整嘅地圖，個 project 已經喺度有齊。一張都冇加過。",
            "呢個 preset 想整嘅地圖，個 project 老早已經喺度有齊晒。一張新都冇加過。",
        ],
    },
    "project.presets.appliedStorage": {
        en: [
            "Added the file storage, since this project did not have one yet.",
            "Added the file storage, since this project did not have one yet.",
            "Added the file storage, because this project did not already have one.",
            "Added the file storage. This project had none of its own yet.",
            "Added the file storage, since this project was running around without one.",
        ],
        yue: [
            "加咗個 file storage，因為呢個 project 之前未有。",
            "加咗個 file storage，因為呢個 project 之前未有。",
            "加咗個 file storage，因為呢個 project 本身仲未有。",
            "加咗個 file storage。呢個 project 之前一個都未有。",
            "加咗個 file storage，因為呢個 project 之前淨係得個吉，一個都未有。",
        ],
    },
    "project.presets.appliedStorageSkipped": {
        en: [
            "The file storage already existed, so it was left as is.",
            "The file storage already existed, so it was left as is.",
            "The file storage already existed, so this preset left it as is.",
            "The file storage was already there, so this preset left it as is.",
            "The file storage was already sitting there, so this preset left it exactly as is.",
        ],
        yue: [
            "個 file storage 本身已經有，所以冇郁過佢。",
            "個 file storage 本身已經有，所以冇郁過佢。",
            "個 file storage 本身已經有，所以呢個 preset 冇郁過佢。",
            "個 file storage 已經喺度，所以呢個 preset 冇郁過佢。",
            "個 file storage 老早已經喺度，所以呢個 preset 一手指都冇郁過佢。",
        ],
    },
    "project.presets.appliedWebserver": {
        en: [
            "Wrote webserver.conf with the web server switched {state}, since this project did not carry one of its own yet.",
            "Wrote webserver.conf with the web server switched {state}, since this project did not carry one of its own yet.",
            "Wrote webserver.conf with the web server switched {state}, because this project carried none of its own yet.",
            "Wrote webserver.conf, with the web server switched {state}. This project had none of its own yet.",
            "Wrote a fresh webserver.conf, web server switched {state}, since this project had none of its own to start with.",
        ],
        yue: [
            "寫咗個 webserver.conf，將 web server 撥去 {state}，因為呢個 project 之前未有自己嘅。",
            "寫咗個 webserver.conf，將 web server 撥去 {state}，因為呢個 project 之前未有自己嘅。",
            "寫咗個 webserver.conf，將 web server 撥去 {state}，因為呢個 project 本身未有自己嘅。",
            "寫咗個 webserver.conf，將 web server 撥去 {state}。呢個 project 之前未有自己嘅。",
            "由頭寫咗個 webserver.conf，將 web server 撥去 {state}，因為呢個 project 本身一個都未有。",
        ],
    },
    "project.presets.appliedWebserverSkipped": {
        en: [
            "This project already carries its own webserver.conf, so it was left untouched.",
            "This project already carries its own webserver.conf, so it was left untouched.",
            "This project already carries its own webserver.conf, so this preset left it untouched.",
            "This project already had its own webserver.conf. This preset left it untouched.",
            "This project was already carrying its own webserver.conf, so this preset left it well alone.",
        ],
        yue: [
            "呢個 project 已經有自己嘅 webserver.conf，所以冇郁過佢。",
            "呢個 project 已經有自己嘅 webserver.conf，所以冇郁過佢。",
            "呢個 project 已經有自己嘅 webserver.conf，所以呢個 preset 冇郁過佢。",
            "呢個 project 已經有自己嘅 webserver.conf。呢個 preset 冇郁過佢。",
            "呢個 project 老早已經有自己嘅 webserver.conf，所以呢個 preset 企喺一邊，冇郁過佢。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The render tab's own default indicator                           */
    /* ---------------------------------------------------------------- */

    "project.fieldDefault.atDefault": {
        en: [
            "This already matches BlueMap's own default.",
            "This already matches BlueMap's own default.",
            "This already matches BlueMap's own default value.",
            "Already BlueMap's own default. Nothing to change here.",
            "Already exactly BlueMap's own default. Nothing to see here, move along.",
        ],
        yue: [
            "呢個已經同 BlueMap 自己嘅 default 一樣。",
            "呢個已經同 BlueMap 自己嘅 default 一樣。",
            "呢個已經同 BlueMap 自己嘅 default 值一樣。",
            "已經係 BlueMap 自己嘅 default，冇嘢要改。",
            "已經一模一樣係 BlueMap 自己嘅 default，冇嘢好改，睇下一項啦。",
        ],
    },
    "project.fieldDefault.changed": {
        en: [
            "Set to {value}. BlueMap's default is {default}.",
            "Set to {value}. BlueMap's default is {default}.",
            "Set to {value} here. BlueMap's default is {default}.",
            "Set to {value}. BlueMap's own default is {default}.",
            "Set to {value} on purpose. BlueMap's own default is {default}, for the record.",
        ],
        yue: [
            "而家設咗做 {value}。BlueMap 嘅 default 係 {default}。",
            "而家設咗做 {value}。BlueMap 嘅 default 係 {default}。",
            "呢度設咗做 {value}。BlueMap 嘅 default 係 {default}。",
            "設咗做 {value}。BlueMap 自己嘅 default 係 {default}。",
            "特登設咗做 {value}。BlueMap 自己嘅 default 係 {default}，講埋畀你聽。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PRESETS_FIXED = {
    "project.presets.heading": { en: "Or start from a preset", yue: "或者由一個 preset 開始" },
    "project.presets.overworldOnly.title": {
        en: "Start from BlueMap's defaults",
        yue: "由 BlueMap 嘅 default 開始",
    },
    "project.presets.allDimensions.title": { en: "Overworld, Nether and End", yue: "Overworld、Nether 同 End" },
    "project.presets.webServerOff.title": {
        en: "All three dimensions, no web server",
        yue: "三個 dimension，唔開 web server",
    },
    "project.presets.fastRender.title": {
        en: "All three dimensions, faster renders",
        yue: "三個 dimension，算圖快啲",
    },
    "project.presets.apply": { en: "Use this preset", yue: "用呢個 preset" },

    "project.fieldDefault.reset": { en: "Reset to BlueMap's default", yue: "打返去 BlueMap 嘅 default" },
} as const satisfies Record<string, FixedString>;

export const PRESETS_FACTS = {
    "project.presets.overworldOnly.description": {
        en: ["Overworld", "file storage", "template"],
        yue: ["Overworld", "file storage", "樣板"],
    },
    "project.presets.allDimensions.description": {
        en: ["Overworld", "Nether", "End", "file storage"],
        yue: ["Overworld", "Nether", "End", "file storage"],
    },
    "project.presets.webServerOff.description": {
        en: ["Overworld", "Nether", "End", "file storage", "webserver.conf", "off"],
        yue: ["Overworld", "Nether", "End", "file storage", "webserver.conf", "閂"],
    },
    "project.presets.fastRender.description": {
        en: ["Overworld", "Nether", "End", "file storage", "enable-hires", "false"],
        yue: ["Overworld", "Nether", "End", "file storage", "enable-hires", "false"],
    },

    "project.presets.appliedMaps": {
        en: ["{maps}", "{names}", "added"],
        yue: ["{maps}", "{names}", "加咗"],
    },
    "project.presets.appliedMapsNone": {
        en: ["already in the project"],
        yue: ["已經喺度有齊"],
    },
    "project.presets.appliedStorage": {
        en: ["file storage"],
        yue: ["file storage"],
    },
    "project.presets.appliedStorageSkipped": {
        en: ["file storage", "left"],
        yue: ["file storage", "冇郁過"],
    },
    "project.presets.appliedWebserver": {
        en: ["webserver.conf", "{state}"],
        yue: ["webserver.conf", "{state}"],
    },
    "project.presets.appliedWebserverSkipped": {
        en: ["webserver.conf"],
        yue: ["webserver.conf"],
    },

    "project.fieldDefault.atDefault": {
        en: ["default"],
        yue: ["default"],
    },
    "project.fieldDefault.changed": {
        en: ["{value}", "{default}"],
        yue: ["{value}", "{default}"],
    },
} as const satisfies Record<keyof typeof PRESETS_VOICED, { en: readonly string[]; yue: readonly string[] }>;
