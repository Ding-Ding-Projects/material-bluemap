/**
 * The render mask drawing surface: what a drawn shape costs to render, and — the one warning
 * that must survive every funny level unchanged — what happens to a drawn shape the cloud
 * render path cannot translate.
 *
 * `maskGeometry.ts` and `maskFidelity.ts` compute the numbers and the fact this copy narrates;
 * this file only says them. It is spread into `SURFACE_VOICED`/`SURFACE_FIXED`/`SURFACE_FACTS`
 * in `surfaces/index.ts` alongside `maskDrawCanvas.ts` (that file's own toolbar, preset and
 * field labels), now that `components/config/MaskDrawingCanvas.vue` calls these keys directly
 * for its cost readout and its cloud/Actions fidelity warning — the drawing canvas this file's
 * own header used to say did not exist yet.
 *
 * ## The one fact every level has to keep
 *
 * `mask.fidelity.cloudUnsupported` is the load-bearing string in this file. It reports that
 * the cloud/Actions render path silently ignores a mask it cannot translate and renders the
 * **whole world** instead of the shape that was drawn — not a bounding-box approximation of
 * it, the whole world. A rewrite that softens "the whole world renders, unmasked" into
 * something that sounds like a harmless simplification would turn a warning about wasted CI
 * minutes and a wrong deliverable into a message nobody could act on. `mask.fidelity.local`
 * carries the reassuring half at every level too: the local desktop render always applies
 * exactly what was drawn, so the warning is about one path, not about the mask being unusable.
 *
 * `mask.fidelity.listUnsupported` is that same fact restated for the **whole render-mask
 * list** rather than one shape: `ConfigMaskField.vue`'s own top-level fidelity check
 * (`cloudFidelityForMask` in `maskCanvas.ts`) fires for the one case the per-shape warning
 * above cannot catch — two or more perfectly ordinary boxes, each individually translatable,
 * but the cloud path only ever keeps a list of exactly one. Unlike the per-shape reason, this
 * key states the general rule itself as fixed prose ("only a single, non-subtracting box"),
 * not only through the dynamic `{reason}`, so the rule survives even if a future reason string
 * is ever rewritten to omit it.
 *
 * `MASKDRAW_FACTS` pins the real numbers and the real words: `{blocks}`, `{chunks}`,
 * `{regions}`, and — for the fidelity warnings — "whole world" itself, because a message that
 * stops naming what actually gets rendered is not a funnier message, it is a useless one.
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
    /*
     * The load-bearing warning. Every level names: the cloud/Actions render path specifically,
     * that it ignores the mask, and that the whole world renders as a result — never softened
     * to "may not match" or "could differ".
     */
    "mask.fidelity.cloudUnsupported": {
        en: [
            "This mask is not supported by the cloud/Actions render path: {reason} The whole world will render there, unmasked.",
            "This mask is not supported by the cloud/Actions render path: {reason} The whole world will render there, unmasked.",
            "The cloud/Actions render path cannot translate this mask: {reason} It will render the whole world there, completely unmasked.",
            "The cloud/Actions render path cannot translate this mask yet: {reason} A render started there renders the whole world, completely unmasked, not an approximation of what was drawn.",
            "Heads up: the cloud/Actions render path cannot translate this mask yet ({reason}), so a render started there renders the whole world, completely unmasked, not a bounding box, not an approximation, the whole thing.",
        ],
        yue: [
            "呢個遮罩喺雲端／Actions 算圖路線唔支援：{reason} 喺嗰邊會算成個世界，完全冇遮罩。",
            "呢個遮罩喺雲端／Actions 算圖路線唔支援：{reason} 喺嗰邊會算成個世界，完全冇遮罩。",
            "雲端／Actions 算圖路線譯唔到呢個遮罩：{reason} 喺嗰邊起render會算成個世界，完全冇遮罩。",
            "雲端／Actions 算圖路線而家仲譯唔到呢個遮罩：{reason} 喺嗰邊起嘅render會算成個世界，完全冇遮罩，唔係約莫畫嗰個形狀，係成個世界。",
            "friendly reminder：雲端／Actions 算圖路線而家仲譯唔到呢個遮罩（{reason}），所以喺嗰邊起嘅render會算晒成個世界，完全冇遮罩，唔係一個大概嘅範圍，唔係約莫，係成個世界都走唔甩。",
        ],
    },
    /*
     * The list-level warning: fires once for the whole render-mask list rather than per shape,
     * and specifically covers the case the per-shape warning above cannot -- more than one
     * shape, each individually fine, but the cloud path only ever keeps a list of exactly one.
     * Every level states the general rule as fixed prose ("a single, non-subtracting box"), not
     * only through {reason}, plus the same "whole world"/"unmasked" total-failure fact.
     */
    "mask.fidelity.listUnsupported": {
        en: [
            "This mask is not supported by the cloud/Actions render path: {reason} That path only ever translates a single, non-subtracting box, so it renders the whole world there instead, completely unmasked.",
            "This mask is not supported by the cloud/Actions render path: {reason} That path only ever translates a single, non-subtracting box, so it renders the whole world there instead, completely unmasked.",
            "The cloud/Actions render path cannot translate this mask: {reason} It only understands a single, non-subtracting box shape, so a render started there renders the whole world instead, completely unmasked.",
            "The cloud/Actions render path cannot translate this mask yet: {reason} It only ever understands a single, non-subtracting box shape, so a render started there renders the whole world, completely unmasked, not an approximation of what was drawn.",
            "Heads up: the cloud/Actions render path only understands a single, non-subtracting box shape, and this mask is not that ({reason}), so a render started there renders the whole world, completely unmasked, not a bounding box, not an approximation, the whole thing.",
        ],
        yue: [
            "呢個遮罩喺雲端／Actions 算圖路線唔支援：{reason} 嗰條路線淨係譯得一個唔相減嘅箱形，所以喺嗰邊會算成個世界，完全冇遮罩。",
            "呢個遮罩喺雲端／Actions 算圖路線唔支援：{reason} 嗰條路線淨係譯得一個唔相減嘅箱形，所以喺嗰邊會算成個世界，完全冇遮罩。",
            "雲端／Actions 算圖路線譯唔到呢個遮罩：{reason} 佢淨係識一個唔相減嘅箱形，所以喺嗰邊起嘅render會算成個世界，完全冇遮罩。",
            "雲端／Actions 算圖路線而家仲譯唔到呢個遮罩：{reason} 佢淨係識一個唔相減嘅箱形，所以喺嗰邊起嘅render會算成個世界，完全冇遮罩，唔係約莫畫嗰個形狀。",
            "friendly reminder：雲端／Actions 算圖路線淨係識一個唔相減嘅箱形，呢個遮罩唔係咁款（{reason}），所以喺嗰邊起嘅render會算晒成個世界，完全冇遮罩，唔係一個大概嘅範圍，唔係約莫，係成個世界都走唔甩。",
        ],
    },
    /* The reassuring half, always paired with the warning above. */
    "mask.fidelity.local": {
        en: [
            "The local desktop render always applies exactly this mask, whatever shape it is.",
            "The local desktop render always applies exactly this mask, whatever shape it is.",
            "The local desktop render always applies exactly this mask, no matter what shape it is.",
            "The local desktop render always applies exactly this mask, no matter what shape it is. The cloud limitation above is only about the cloud/Actions path.",
            "The local desktop render always applies exactly this mask, whatever shape it is. The warning above is strictly about the cloud/Actions path, and only that one.",
        ],
        yue: [
            "本機桌面算圖一律會照呢個遮罩嚟算，唔理係咩形狀。",
            "本機桌面算圖一律會照呢個遮罩嚟算，唔理係咩形狀。",
            "本機桌面算圖一律照呢個遮罩嚟算，唔理係咩形狀。",
            "本機桌面算圖一律照呢個遮罩嚟算，唔理係咩形狀。上面嗰個限制淨係關雲端／Actions 路線事。",
            "本機桌面算圖一律照足呢個遮罩嚟算，唔理係咩形狀。上面嗰個警告淨係講緊雲端／Actions 嗰條路，第二條路冇事。",
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
    "mask.fidelity.cloudLabel": { en: "Cloud/Actions render", yue: "雲端／Actions 算圖" },
    "mask.fidelity.localLabel": { en: "Local desktop render", yue: "本機桌面算圖" },
    "mask.export.button": { en: "Export mask…", yue: "匯出遮罩…" },
    "mask.import.button": { en: "Import mask…", yue: "匯入遮罩…" },
} as const satisfies Record<string, FixedString>;

export const MASKDRAW_FACTS = {
    "mask.cost.exact": { en: ["{blocks}", "{chunks}", "{regions}"], yue: ["{blocks}", "{chunks}", "{regions}"] },
    "mask.cost.upperBound": {
        en: ["{blocks}", "{chunks}", "{regions}", "smaller"],
        yue: ["{blocks}", "{chunks}", "{regions}", "細"],
    },
    "mask.cost.wholeWorld": { en: ["whole world"], yue: ["成個世界"] },
    "mask.cost.unbounded": { en: ["no area number"], yue: ["冇數畀"] },
    "mask.fidelity.cloudUnsupported": {
        en: ["cloud/Actions", "{reason}", "whole world", "unmasked"],
        yue: ["雲端／Actions", "{reason}", "成個世界", "冇遮罩"],
    },
    "mask.fidelity.listUnsupported": {
        en: ["cloud/Actions", "{reason}", "single, non-subtracting box", "whole world", "unmasked"],
        yue: ["雲端／Actions", "{reason}", "一個唔相減嘅箱形", "成個世界", "冇遮罩"],
    },
    "mask.fidelity.local": { en: ["local desktop render", "exactly this mask"], yue: ["本機桌面算圖", "呢個遮罩"] },
    "mask.export.done": { en: ["{shapes}", "{path}", "blocks", "Minecraft world coordinates"], yue: ["{shapes}", "{path}", "方塊", "Minecraft 世界座標"] },
    "mask.import.done": { en: ["{shapes}", "{path}"], yue: ["{shapes}", "{path}"] },
    "mask.import.failed": { en: ["{path}", "{reason}"], yue: ["{path}", "{reason}"] },
} as const satisfies Record<keyof typeof MASKDRAW_VOICED, { en: readonly string[]; yue: readonly string[] }>;
