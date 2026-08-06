/**
 * The render mask drawing surface's own chrome: `components/config/MaskDrawingCanvas.vue`.
 *
 * The numbers this surface reports -- a shape's cost in blocks/chunks/regions, and the
 * cloud/Actions render-fidelity warning -- are deliberately NOT duplicated here. Those keys
 * (`mask.cost.*`, `mask.fidelity.*`) already exist in `./maskDraw.ts`, written for exactly
 * this canvas before it existed, and this component calls them directly so the wording
 * stays identical to wherever else in the app quotes a mask's cost. This file is only the
 * canvas's own controls: the toolbar, the presets, the handles, the numeric fields.
 *
 * Three entries are genuine prose and get the full five-level treatment: the banner that
 * explains why the world's shape is not known, the empty-canvas guidance, and the note that
 * the "existing regions" preset is unavailable. Everything else here is a button caption,
 * a field label, or an aria-label -- a name, not a sentence -- which is exactly the FIXED
 * case `appCopy.ts`'s own header describes: "a button whose label moves under somebody is a
 * button they re-read every time."
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const MASKDRAWCANVAS_VOICED = {
    "config.maskCanvas.orientationUnknown": {
        en: [
            "The world's extent could not be determined ({reason}), so this canvas shows raw block coordinates on a plain grid rather than pretending to know the world's shape.",
            "The world's extent could not be determined ({reason}), so this canvas shows raw block coordinates on a plain grid rather than pretending to know the world's shape.",
            "The world's extent could not be determined ({reason}), so this canvas is showing raw block coordinates on a plain grid instead of guessing at the world's real shape.",
            "The world's extent could not be determined ({reason}). Rather than fake a shoreline that is not there, this canvas is showing raw block coordinates on a plain grid.",
            "The world's extent could not be determined ({reason}), so no, showing raw block coordinates on a plain grid is not a bug: it is the honest alternative to this canvas inventing a coastline it has never actually seen.",
        ],
        yue: [
            "呢個世界嘅範圍計唔到（{reason}），所以呢塊畫板淨係用純網格顯示原始方塊座標，唔會扮作知道個世界實際係咩形狀。",
            "呢個世界嘅範圍計唔到（{reason}），所以呢塊畫板淨係用純網格顯示原始方塊座標，唔會扮作知道個世界實際係咩形狀。",
            "呢個世界嘅範圍計唔到（{reason}），所以呢塊畫板而家淨係用純網格顯示原始方塊座標，唔會亂估個世界實際嘅形狀。",
            "呢個世界嘅範圍計唔到（{reason}）。與其屈個海岸線出嚟呃你，呢塊畫板寧願老老實實淨係用純網格顯示原始方塊座標。",
            "呢個世界嘅範圍計唔到（{reason}），所以話畫板淨係顯示原始方塊座標唔係壞咗：係呢個畫板寧願咁老實，都唔屈一條佢從未見過嘅海岸線出嚟呃你。",
        ],
    },
    "config.maskCanvas.noShapeYet": {
        en: [
            "No shape yet. Press Enter to place one, or fill in the fields below.",
            "No shape yet. Press Enter to place one, or fill in the fields below.",
            "No shape drawn yet. Press Enter to place one, or fill in the fields below instead.",
            "Nothing drawn here yet. Press Enter to place a shape, or skip the canvas entirely and fill in the fields below.",
            "Blank canvas, nothing drawn yet. Press Enter to place a shape, or ignore the canvas altogether and just fill in the fields below, no judgement.",
        ],
        yue: [
            "重未有形狀。撳 Enter 擺一個，或者落面填返啲欄位都得。",
            "重未有形狀。撳 Enter 擺一個，或者落面填返啲欄位都得。",
            "呢度重未畫過形狀。撳 Enter 擺一個，定係索性落面填返啲欄位都得。",
            "呢度乜都重未畫。撳 Enter 擺一個形狀，或者成塊畫板都唔理，直接落面填返啲欄位都得。",
            "空白一塊，乜都重未畫。撳 Enter 擺個形狀，定係成塊畫板懶得理，直接落面填欄位算數，冇人怪你。",
        ],
    },
    "config.maskCanvas.presetExistingRegionsUnavailable": {
        en: [
            "Not available: the world's region files have not been measured.",
            "Not available: the world's region files have not been measured.",
            "Not available yet: the world's region files have not been measured.",
            "Not available yet, because the world's region files have not been measured -- there is nothing real to base this preset on.",
            "Can't offer this one yet: the world's region files have not been measured, so there is genuinely nothing real to base it on, not even a guess.",
        ],
        yue: [
            "未有得揀：呢個世界嘅 region 檔案重未量度過。",
            "未有得揀：呢個世界嘅 region 檔案重未量度過。",
            "而家未有得揀：呢個世界嘅 region 檔案重未量度過。",
            "而家未有得揀，因為呢個世界嘅 region 檔案重未量度過，冇真實數據可以做呢個預設。",
            "而家真係揀唔到：呢個世界嘅 region 檔案重未量度過，連個估計都冇得畀你，唔講大話。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const MASKDRAWCANVAS_FIXED = {
    /* Numeric-error inline reports, always visible so a partial number never disappears. */
    "config.maskCanvas.numberIncomplete": { en: "Keep typing a number.", yue: "數字未打完，繼續打。" },
    "config.maskCanvas.numberInvalid": { en: "That is not a number.", yue: "呢個唔係數字。" },

    /* Toolbar: snap. */
    "config.maskCanvas.snapOff": { en: "No snap", yue: "唔啜格" },
    "config.maskCanvas.snapChunk": { en: "Snap to chunk (16)", yue: "啜去 chunk（16）" },
    "config.maskCanvas.snapRegion": { en: "Snap to region (512)", yue: "啜去 region（512）" },
    "config.maskCanvas.snapNow": { en: "Snap current shape", yue: "而家就啜返呢個形狀" },

    /* Toolbar: zoom, undo, redo. */
    "config.maskCanvas.zoomIn": { en: "Zoom in", yue: "放大" },
    "config.maskCanvas.zoomOut": { en: "Zoom out", yue: "縮細" },
    "config.maskCanvas.undo": { en: "Undo", yue: "復原" },
    "config.maskCanvas.redo": { en: "Redo", yue: "重做" },

    /* Presets and reset. */
    "config.maskCanvas.presetWholeWorld": { en: "Whole world", yue: "成個世界" },
    "config.maskCanvas.presetAroundSpawn": { en: "Around spawn", yue: "圍住重生點" },
    "config.maskCanvas.presetExistingRegions": { en: "Extent of existing regions", yue: "現有 region 嘅範圍" },
    "config.maskCanvas.reset": { en: "Reset to whole world", yue: "重設做成個世界" },

    /* The surface's own accessible name, and its spawn marker. */
    "config.maskCanvas.surfaceLabel": { en: "A top-down drawing of the render mask shape", yue: "遮罩形狀嘅俯視畫板" },
    "config.maskCanvas.spawnMarker": { en: "Spawn", yue: "重生點" },

    /* Handles: every one independently focusable and independently named. */
    "config.maskCanvas.handleMove": { en: "Move the whole shape", yue: "移動成個形狀" },
    "config.maskCanvas.handleCorner": { en: "Resize corner {corner}", yue: "調校 {corner} 角" },
    "config.maskCanvas.handleRadius": { en: "Resize radius", yue: "調校半徑" },
    "config.maskCanvas.handleRadiusX": { en: "Resize the X radius", yue: "調校 X 軸半徑" },
    "config.maskCanvas.handleRadiusZ": { en: "Resize the Z radius", yue: "調校 Z 軸半徑" },
    "config.maskCanvas.handlePoint": { en: "Move vertex {index}", yue: "移動第 {index} 個頂點" },

    /* The keyboard-only creation path. */
    "config.maskCanvas.createShape": { en: "Create a shape", yue: "整個形狀" },

    /* Cursor and area readouts. */
    "config.maskCanvas.cursorNone": { en: "Cursor: not over the canvas", yue: "游標：未喺畫板上面" },
    "config.maskCanvas.cursorAt": { en: "Cursor: X {x}, Z {z}", yue: "游標：X {x}，Z {z}" },
    "config.maskCanvas.areaEstimateTag": { en: " (estimate)", yue: "（估計）" },
    "config.maskCanvas.worldFraction": { en: "{percent}% of the measured world", yue: "佔量度到嘅世界 {percent}%" },

    /* Numeric fields: the always-available equivalent path onto the same value. */
    "config.maskCanvas.fieldMinX": { en: "Min X", yue: "最小 X" },
    "config.maskCanvas.fieldMaxX": { en: "Max X", yue: "最大 X" },
    "config.maskCanvas.fieldMinZ": { en: "Min Z", yue: "最小 Z" },
    "config.maskCanvas.fieldMaxZ": { en: "Max Z", yue: "最大 Z" },
    "config.maskCanvas.fieldCenterX": { en: "Center X", yue: "中心 X" },
    "config.maskCanvas.fieldCenterZ": { en: "Center Z", yue: "中心 Z" },
    "config.maskCanvas.fieldRadius": { en: "Radius", yue: "半徑" },
    "config.maskCanvas.fieldRadiusX": { en: "Radius X", yue: "X 軸半徑" },
    "config.maskCanvas.fieldRadiusZ": { en: "Radius Z", yue: "Z 軸半徑" },
    "config.maskCanvas.fieldPointX": { en: "Point {index} X", yue: "第 {index} 點 X" },
    "config.maskCanvas.fieldPointZ": { en: "Point {index} Z", yue: "第 {index} 點 Z" },
    "config.maskCanvas.addPoint": { en: "Add point after", yue: "喺呢點之後加一點" },
    "config.maskCanvas.removePoint": { en: "Remove", yue: "移除" },
} as const satisfies Record<string, FixedString>;

export const MASKDRAWCANVAS_FACTS = {
    "config.maskCanvas.orientationUnknown": {
        en: ["{reason}", "raw block coordinates"],
        yue: ["{reason}", "原始方塊座標"],
    },
    "config.maskCanvas.noShapeYet": {
        en: ["Enter", "fields below"],
        yue: ["Enter", "落面"],
    },
    "config.maskCanvas.presetExistingRegionsUnavailable": {
        en: ["region files", "not been measured"],
        yue: ["region 檔案", "重未量度"],
    },
} as const satisfies Record<keyof typeof MASKDRAWCANVAS_VOICED, { en: readonly string[]; yue: readonly string[] }>;
