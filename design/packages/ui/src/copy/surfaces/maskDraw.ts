/**
 * The render mask drawing surface: what a drawn shape costs to render, and the route-parity
 * fact that survives every funny level unchanged.
 *
 * `maskGeometry.ts` and the route-fidelity contracts compute the facts this copy narrates;
 * this file only says them. It is spread into `SURFACE_VOICED`/`SURFACE_FIXED`/`SURFACE_FACTS`
 * in `surfaces/index.ts` alongside `maskDrawCanvas.ts` (that file's own toolbar, preset and
 * field labels), now that `components/config/MaskDrawingCanvas.vue` calls these keys directly
 * for its cost readout and route-parity status — the drawing canvas this file's
 * own header used to say did not exist yet.
 *
 * `mask.fidelity.routesExact` is load-bearing. Every level says the cloud/Actions and local
 * desktop routes both apply every shape, subtract flag, nested blur, and layer order exactly.
 * If one route ever diverges again this becomes a failing contract, not stale reassurance.
 *
 * `MASKDRAW_FACTS` pins the real numbers and the real words: `{blocks}`, `{chunks}`,
 * `{regions}`, plus every route-parity semantic named above.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const MASKDRAW_VOICED = {
    /* The cost readout for a single, exactly-computable shape. */
    "mask.cost.exact": {
        en: [
            "{blocks} blocks (about {chunks} chunks, about {regions} regions).",
            "{blocks} blocks (about {chunks} chunks, about {regions} regions).",
            "{blocks} blocks: about {chunks} chunks, about {regions} regions.",
            "{blocks} blocks selected: roughly {chunks} chunks, roughly {regions} regions.",
            "{blocks} blocks selected, which comes to roughly {chunks} chunks and roughly {regions} regions once BlueMap gets its hands on it.",
        ],
        yue: [
            "{blocks} 個方塊（大約 {chunks} 個 chunk，大約 {regions} 個 region）。",
            "{blocks} 個方塊（大約 {chunks} 個 chunk，大約 {regions} 個 region）。",
            "{blocks} 個方塊：大約 {chunks} 個 chunk，大約 {regions} 個 region。",
            "揀咗 {blocks} 個方塊：大概 {chunks} 個 chunk，大概 {regions} 個 region。",
            "揀咗 {blocks} 個方塊，即係大概 {chunks} 個 chunk、大概 {regions} 個 region，等 BlueMap 慢慢啃。",
        ],
    },
    /* Shown once more than one additive shape, or any subtraction, makes the true area unknowable exactly. */
    "mask.cost.upperBound": {
        en: [
            "Up to {blocks} blocks (up to about {chunks} chunks, up to about {regions} regions). The real area may be smaller once shapes overlap or subtract.",
            "Up to {blocks} blocks (up to about {chunks} chunks, up to about {regions} regions). The real area may be smaller once shapes overlap or subtract.",
            "Up to {blocks} blocks, up to about {chunks} chunks, up to about {regions} regions. Overlapping or subtracting shapes only ever make the real render smaller, never bigger.",
            "Up to {blocks} blocks, up to about {chunks} chunks, up to about {regions} regions: an upper bound, not an exact count. Overlapping or subtracted shapes only ever make the real render smaller, never bigger.",
            "Up to {blocks} blocks, call it {chunks} chunks and {regions} regions at the very most. That is a ceiling, not a promise: overlapping or subtracted shapes only ever make the real render smaller, never bigger.",
        ],
        yue: [
            "最多 {blocks} 個方塊（最多大約 {chunks} 個 chunk，最多大約 {regions} 個 region）。形狀重疊或者相減之後，實際面積可能會細啲。",
            "最多 {blocks} 個方塊（最多大約 {chunks} 個 chunk，最多大約 {regions} 個 region）。形狀重疊或者相減之後，實際面積可能會細啲。",
            "最多 {blocks} 個方塊，最多大約 {chunks} 個 chunk，最多大約 {regions} 個 region。形狀一重疊或者相減，實際算出嚟嘅只會細過呢個數，唔會多過。",
            "最多 {blocks} 個方塊，最多大約 {chunks} 個 chunk、{regions} 個 region：呢個係上限，唔係實數。形狀重疊或者相減，實際算出嚟嘅只會細過呢個數，唔會多過。",
            "最多 {blocks} 個方塊，頂盡都係 {chunks} 個 chunk、{regions} 個 region 咁上下。呢個係封頂數字，唔係實際承諾：形狀一重疊或者一相減，實際算出嚟嘅只會細過呢個數，唔會多過。",
        ],
    },
    /* No shapes at all: the whole world is what renders, and that is not a warning. */
    "mask.cost.wholeWorld": {
        en: [
            "No mask, so the whole world renders.",
            "No mask, so the whole world renders.",
            "No mask yet, so the whole world renders.",
            "No mask drawn yet, so the whole world renders, every region file this world has.",
            "No mask drawn yet, so it is the whole world renders, every last region file of it.",
        ],
        yue: [
            "未有遮罩，所以成個世界都會算。",
            "未有遮罩，所以成個世界都會算。",
            "仲未有遮罩，所以成個世界都會算。",
            "仲未畫遮罩，所以成個世界都會算，即係呢個世界每一個 region 檔都走唔甩。",
            "仲未畫遮罩，所以呢排就係成個世界都要算，一個 region 檔都走唔甩。",
        ],
    },
    /* At least one shape is unbounded on an axis — no invented number. */
    "mask.cost.unbounded": {
        en: [
            "At least one shape has no limit on some axis, so no area number can be given.",
            "At least one shape has no limit on some axis, so no area number can be given.",
            "At least one shape is unbounded on some axis, so there is no area number to give here.",
            "At least one shape is unbounded on some axis, so there is genuinely no area number to give, not a small one, none at all.",
            "At least one shape is left unbounded on some axis, so there is genuinely no area number here: making one up would just be a lie with decimal places.",
        ],
        yue: [
            "起碼有一個形狀喺某一軸冇設限，所以冇數畀到你。",
            "起碼有一個形狀喺某一軸冇設限，所以冇數畀到你。",
            "起碼有一個形狀喺某一軸冇設限，所以呢度冇數畀你。",
            "起碼有一個形狀喺某一軸冇設限，所以真係冇數畀到你，唔係細數，係完全冇。",
            "起碼有一個形狀喺某一軸擺明冇設限，所以真係冇數畀到你：屈個數出嚟只不過係有小數點嘅大話。",
        ],
    },
    /* One route-parity statement, shown once for the complete top-level mask. */
    "mask.fidelity.routesExact": {
        en: [
            "Cloud/Actions and local desktop renders both apply every configured mask shape, subtract flag, nested blur, and layer order exactly.",
            "Cloud/Actions and local desktop renders both apply every configured mask shape, subtract flag, nested blur, and layer order exactly.",
            "Cloud/Actions and local desktop renders now apply every mask shape, subtract flag, nested blur, and layer order exactly alike.",
            "Cloud/Actions and local desktop renders apply every shape, subtract flag, nested blur, and layer order exactly, so the route changes and the mask does not.",
            "Cloud/Actions and local desktop renders apply every shape, subtract flag, nested blur, and layer order exactly. The two engines finally read the same mask instead of one wearing a cardboard box costume.",
        ],
        yue: [
            "雲端／Actions 同本機桌面算圖都會準確套用每個遮罩形狀、相減旗標、巢狀 blur 同圖層次序。",
            "雲端／Actions 同本機桌面算圖都會準確套用每個遮罩形狀、相減旗標、巢狀 blur 同圖層次序。",
            "雲端／Actions 同本機桌面算圖而家都會準確跟足每個遮罩形狀、相減旗標、巢狀 blur 同圖層次序。",
            "雲端／Actions 同本機桌面算圖會準確跟足每個形狀、相減旗標、巢狀 blur 同圖層次序，轉路線都唔會變遮罩。",
            "雲端／Actions 同本機桌面算圖會準確跟足每個形狀、相減旗標、巢狀 blur 同圖層次序。兩個引擎終於睇緊同一份遮罩，唔再得個紙皮箱扮全能。",
        ],
    },
    /* Confirms a mask file was written. */
    "mask.export.done": {
        en: [
            "Saved {shapes} shapes to {path}, in blocks, Minecraft world coordinates.",
            "Saved {shapes} shapes to {path}, in blocks, Minecraft world coordinates.",
            "Saved {shapes} shapes to {path}, in blocks, Minecraft world coordinates.",
            "Saved {shapes} shapes to {path}, in blocks and Minecraft world coordinates, exactly as drawn.",
            "Saved {shapes} shapes to {path}, in blocks and Minecraft world coordinates, exactly as drawn, block for block.",
        ],
        yue: [
            "已經將 {shapes} 個形狀儲存去 {path}，用方塊做單位，Minecraft 世界座標。",
            "已經將 {shapes} 個形狀儲存去 {path}，用方塊做單位，Minecraft 世界座標。",
            "已經將 {shapes} 個形狀儲存去 {path}，用方塊做單位，Minecraft 世界座標。",
            "已經將 {shapes} 個形狀儲存去 {path}，用方塊同 Minecraft 世界座標，同你畫嗰個一模一樣。",
            "已經將 {shapes} 個形狀儲存去 {path}，用方塊同 Minecraft 世界座標，同你畫嗰個一模一樣，一個方塊都冇走樣。",
        ],
    },
    /* Confirms a mask file was read back and applied. */
    "mask.import.done": {
        en: [
            "Loaded {shapes} shapes from {path}.",
            "Loaded {shapes} shapes from {path}.",
            "Loaded {shapes} shapes from {path}.",
            "Loaded {shapes} shapes from {path}, replacing what was drawn here before.",
            "Loaded {shapes} shapes from {path}, replacing whatever was drawn here a moment ago.",
        ],
        yue: [
            "已經由 {path} 載入咗 {shapes} 個形狀。",
            "已經由 {path} 載入咗 {shapes} 個形狀。",
            "已經由 {path} 載入咗 {shapes} 個形狀。",
            "已經由 {path} 載入咗 {shapes} 個形狀，換走咗之前喺呢度畫嗰啲。",
            "已經由 {path} 載入咗 {shapes} 個形狀，之前喺呢度畫緊嗰啲即刻走人。",
        ],
    },
    /* A file that failed to import, with the real reason named. */
    "mask.import.failed": {
        en: [
            "Could not load {path}: {reason}",
            "Could not load {path}: {reason}",
            "Could not load {path}: {reason}",
            "Could not load {path}: {reason} Nothing here has changed.",
            "Could not load {path}: {reason} Nothing here has changed: whatever was already drawn is exactly as it was.",
        ],
        yue: [
            "載入唔到 {path}：{reason}",
            "載入唔到 {path}：{reason}",
            "載入唔到 {path}：{reason}",
            "載入唔到 {path}：{reason} 呢度乜都冇改變過。",
            "載入唔到 {path}：{reason} 呢度乜都冇改變過，之前畫緊嗰啲仍然原封不動。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const MASKDRAW_FIXED = {
    "mask.cost.label": { en: "Selected area", yue: "揀選面積" },
    "mask.cost.extentLabel": { en: "Extent", yue: "範圍" },
    "mask.cost.units.blocks": { en: "blocks", yue: "方塊" },
    "mask.cost.units.chunks": { en: "chunks", yue: "chunk" },
    "mask.cost.units.regions": { en: "regions", yue: "region" },
    "mask.export.button": { en: "Export mask…", yue: "匯出遮罩…" },
    "mask.import.button": { en: "Import mask…", yue: "匯入遮罩…" },
    "mask.import.field": { en: "Choose a mask file", yue: "揀選遮罩檔案" },
} as const satisfies Record<string, FixedString>;

export const MASKDRAW_FACTS = {
    "mask.cost.exact": {
        en: ["{blocks}", "{chunks}", "{regions}"],
        yue: ["{blocks}", "{chunks}", "{regions}"],
    },
    "mask.cost.upperBound": {
        en: ["{blocks}", "{chunks}", "{regions}", "smaller"],
        yue: ["{blocks}", "{chunks}", "{regions}", "細"],
    },
    "mask.cost.wholeWorld": { en: ["whole world"], yue: ["成個世界"] },
    "mask.cost.unbounded": { en: ["no area number"], yue: ["冇數畀"] },
    "mask.fidelity.routesExact": {
        en: [
            "Cloud/Actions",
            "local desktop",
            "every",
            "subtract",
            "blur",
            "layer order",
            "exactly",
        ],
        yue: ["雲端／Actions", "本機桌面", "每", "相減", "blur", "圖層次序", "準確"],
    },
    "mask.export.done": {
        en: ["{shapes}", "{path}", "blocks", "Minecraft world coordinates"],
        yue: ["{shapes}", "{path}", "方塊", "Minecraft 世界座標"],
    },
    "mask.import.done": { en: ["{shapes}", "{path}"], yue: ["{shapes}", "{path}"] },
    "mask.import.failed": { en: ["{path}", "{reason}"], yue: ["{path}", "{reason}"] },
} as const satisfies Record<
    keyof typeof MASKDRAW_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
