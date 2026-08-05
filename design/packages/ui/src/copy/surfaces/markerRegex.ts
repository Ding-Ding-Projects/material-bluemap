/**
 * The marker panel's own regex builder (`components/markers/RegexBuilder.vue`): the group
 * and token labels that fill in the guided picker, the flag descriptions, the notices a
 * copy or export raises, and the four sentences that explain what the builder is testing
 * against and what it will not do.
 *
 * ## Why this key prefix exists
 *
 * `components/menu/MenuRegexBuilder.vue` already answers a `regexBuilder.*` prefix in
 * `menu.ts`, for a *different* regex builder with its own English wording -- `"Regex
 * builder"` there against `"Regular expression builder"` here, `"Escape selection"` there
 * against `"Escape as literal"` here, a `{what}`-interpolated `copied` message there
 * against a plain one here. `mergeVoiceInto` answers one flat key namespace for the whole
 * app, so two components sharing one literal key with two different English fallbacks is
 * not two harmless duplicates: whichever catalogue entry lands under that key wins for
 * *both* callers, silently handing one of them the other surface's wording (or, for
 * `copied`, a `{what}` placeholder it never passes). `markerRegex.*` is this surface's own
 * namespace so voicing it here cannot reach across and mis-translate the menu's builder,
 * and vice versa.
 *
 * ## Two registers, same split as `menu.ts`'s builder
 *
 * Group titles, token descriptions and flag descriptions are FIXED: a token like "a digit"
 * or a flag like "ignore case" is a name, not a sentence a funny level should restyle, and
 * restyling it risks the guided picker no longer reading as a coherent reference table.
 * The explanatory paragraphs and the notices that report what just happened -- the engine
 * line, the plain-text and regex notes, the guided hint, and what copying, resetting, an
 * over-length pattern and an empty result each report -- are VOICED, because those are the
 * sentences a reader actually reads for meaning rather than scans for a word.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const MARKERREGEX_VOICED = {
    /*
     * Three facts, and all three are load-bearing: the dialect, because escaping differs
     * between engines; the four limits, because a builder that will not say its own bounds
     * cannot be trusted near them; and that this is the same engine the marker search runs,
     * because a pattern that behaves differently between the builder and the real search is
     * worse than no builder at all.
     */
    "markerRegex.engine": {
        en: [
            "Engine: ECMAScript RegExp, run by this browser, the same engine the marker search uses. Escaping follows JavaScript regular-expression rules. Limits: pattern {pattern} characters, sample {sample} characters, {matches} matches, {ms} ms per preview run.",
            "Engine: ECMAScript RegExp, run by this browser, the same engine the marker search uses. Escaping follows JavaScript regular-expression rules. Limits: pattern {pattern} characters, sample {sample} characters, {matches} matches, {ms} ms per preview run.",
            "Engine: ECMAScript RegExp, run by this browser and the same engine the marker search uses. Escaping follows JavaScript regular-expression rules. Limits: pattern {pattern} characters, sample {sample} characters, {matches} matches, {ms} ms per preview run.",
            "Engine: ECMAScript RegExp, run by this very browser, the same engine the marker search leans on. Escaping follows JavaScript's own regular-expression rules. Limits: pattern {pattern} characters, sample {sample} characters, {matches} matches, {ms} ms per preview run, and not a byte more.",
            "Engine: ECMAScript RegExp, run right here by this browser, the exact same engine the marker search quietly relies on. Escaping follows JavaScript's own regular-expression rules, no exceptions. Limits: pattern {pattern} characters, sample {sample} characters, {matches} matches, {ms} ms per preview run, and the builder will cut you off right there.",
        ],
        yue: [
            "引擎：ECMAScript RegExp，由呢個瀏覽器執行，同 marker 搜尋用嘅係同一個引擎。Escape 規則跟 JavaScript 正則表達式。上限：pattern {pattern} 個字元，sample {sample} 個字元，{matches} 個 match，每次預覽 {ms} 毫秒。",
            "引擎：ECMAScript RegExp，由呢個瀏覽器執行，同 marker 搜尋用嘅係同一個引擎。Escape 規則跟 JavaScript 正則表達式。上限：pattern {pattern} 個字元，sample {sample} 個字元，{matches} 個 match，每次預覽 {ms} 毫秒。",
            "引擎：ECMAScript RegExp，由呢個瀏覽器執行，同 marker 搜尋用緊嘅係同一個引擎。Escape 規則跟返 JavaScript 正則表達式。上限：pattern {pattern} 個字元，sample {sample} 個字元，{matches} 個 match，每次預覽 {ms} 毫秒。",
            "引擎：ECMAScript RegExp，就係呢個瀏覽器執行緊嘅，同 marker 搜尋用嘅一模一樣。Escape 規則照跟 JavaScript 正則表達式，冇得走雞。上限：pattern {pattern} 個字元，sample {sample} 個字元，{matches} 個 match，每次預覽 {ms} 毫秒，一個都唔會多。",
            "引擎：ECMAScript RegExp，就喺呢個瀏覽器度執行，同 marker 搜尋用緊嗰個引擎一模一樣。Escape 規則死跟 JavaScript 正則表達式，冇得例外。上限：pattern {pattern} 個字元，sample {sample} 個字元，{matches} 個 match，每次預覽 {ms} 毫秒，超過就即刻截停你。",
        ],
    },
    "markerRegex.plainNote": {
        en: [
            "Plain text is the default. The query is matched as a literal, ignoring case, against each marker's id, label, player name and player uuid.",
            "Plain text is the default. The query is matched as a literal, ignoring case, against each marker's id, label, player name and player uuid.",
            "Plain text is the default, matching the query as a literal, ignoring case, against each marker's id, label, player name and player uuid.",
            "Plain text is the default here: the query matches as a literal, ignoring case, against each marker's id, label, player name and player uuid, nothing fancier.",
            "Plain text is the default, matching the query as a plain literal, ignoring case, against each marker's id, label, player name and player uuid, no regex needed, no drama.",
        ],
        yue: [
            "預設用純文字。查詢會當字面文字比對，唔理大小寫，比對每個 marker 嘅 id、label、玩家名同玩家 uuid。",
            "預設用純文字。查詢會當字面文字比對，唔理大小寫，比對每個 marker 嘅 id、label、玩家名同玩家 uuid。",
            "預設用純文字，查詢會當字面文字比對，唔理大小寫，比對住每個 marker 嘅 id、label、玩家名同玩家 uuid。",
            "呢度預設用純文字：查詢當字面文字比對，唔理大小寫，比對每個 marker 嘅 id、label、玩家名同玩家 uuid，簡簡單單。",
            "預設用純文字，查詢照樣當字面文字比對，唔理大小寫，比對每個 marker 嘅 id、label、玩家名同玩家 uuid，唔使乜 regex，簡單直接。",
        ],
    },
    "markerRegex.regexNote": {
        en: [
            "The pattern is tested against each marker's id, label, player name and player uuid. The g and y flags are dropped for that test because they would carry a lastIndex from one field to the next; they still apply to the preview below.",
            "The pattern is tested against each marker's id, label, player name and player uuid. The g and y flags are dropped for that test because they would carry a lastIndex from one field to the next; they still apply to the preview below.",
            "The pattern is tested against each marker's id, label, player name and player uuid, with the g and y flags dropped for that test because they would carry a lastIndex from one field to the next; they still apply to the preview below.",
            "The pattern gets tested against each marker's id, label, player name and player uuid. The g and y flags sit out that test, since they would drag a lastIndex from one field into the next; they are back in play for the preview below.",
            "The pattern gets thrown at each marker's id, label, player name and player uuid. The g and y flags sit this one out, because they would happily drag a lastIndex from one field into the next given half a chance; they are back in play for the preview below though.",
        ],
        yue: [
            "呢個 pattern 會攞每個 marker 嘅 id、label、玩家名同玩家 uuid 嚟測試。g 同 y 呢兩個 flags 喺呢個測試會被拎走，因為佢哋會將 lastIndex 由一個欄位帶去第二個；落面嘅預覽依然會用返呢兩個 flags。",
            "呢個 pattern 會攞每個 marker 嘅 id、label、玩家名同玩家 uuid 嚟測試。g 同 y 呢兩個 flags 喺呢個測試會被拎走，因為佢哋會將 lastIndex 由一個欄位帶去第二個；落面嘅預覽依然會用返呢兩個 flags。",
            "呢個 pattern 會攞每個 marker 嘅 id、label、玩家名同玩家 uuid 嚟測試，g 同 y 呢兩個 flags 喺呢個測試會被拎走，因為佢哋會將 lastIndex 由一個欄位帶去第二個；落面嘅預覽依然會用返呢兩個 flags。",
            "呢個 pattern 會攞去同每個 marker 嘅 id、label、玩家名同玩家 uuid 測試。g 同 y 呢兩個 flags 呢鑊唔使佢哋出手，因為佢哋會將 lastIndex 由一個欄位拖去第二個；落面嘅預覽照樣用返呢兩個 flags。",
            "呢個 pattern 會照計掟去同每個 marker 嘅 id、label、玩家名同玩家 uuid 對質。g 同 y 呢兩個 flags 呢鑊坐定粒六，因為畀佢哋有機會實會將 lastIndex 由一個欄位拖去第二個；落面嘅預覽就照樣用返呢兩個 flags。",
        ],
    },
    "markerRegex.guidedHint": {
        en: [
            "Switch on regular expressions to insert character classes, anchors, groups, alternation and quantifiers.",
            "Switch on regular expressions to insert character classes, anchors, groups, alternation and quantifiers.",
            "Switch on regular expressions and this panel adds character classes, anchors, groups, alternation and quantifiers to insert.",
            "Flip on regular expressions and you get character classes, anchors, groups, alternation and quantifiers ready to insert.",
            "Flip on regular expressions and this whole toolbox of character classes, anchors, groups, alternation and quantifiers is yours to insert.",
        ],
        yue: [
            "打開正則表達式，就可以插入字元類別、錨點、擷取組、交替選擇同數量詞。",
            "打開正則表達式，就可以插入字元類別、錨點、擷取組、交替選擇同數量詞。",
            "打開正則表達式，呢塊板就會俾你插入字元類別、錨點、擷取組、交替選擇同數量詞。",
            "撳開正則表達式，字元類別、錨點、擷取組、交替選擇同數量詞就即刻俾你插。",
            "撳開正則表達式，成套字元類別、錨點、擷取組、交替選擇同數量詞就任你插，隨你用。",
        ],
    },
    "markerRegex.tooLong": {
        en: [
            "The pattern is already at its maximum length.",
            "The pattern is already at its maximum length.",
            "The pattern is already at its maximum length, so nothing more fits.",
            "The pattern has already hit its maximum length, so nothing more is fitting in.",
            "The pattern is already stuffed to its maximum length, and nothing more is squeezing in there.",
        ],
        yue: [
            "個 pattern 已經去到最大長度。",
            "個 pattern 已經去到最大長度。",
            "個 pattern 已經去到最大長度，冇位再加。",
            "個 pattern 已經頂到最大長度，再冇位塞多樣嘢入去。",
            "個 pattern 已經爆棚頂到最大長度，一個字都塞唔返入去喇。",
        ],
    },
    "markerRegex.copied": {
        en: [
            "Copied to the clipboard.",
            "Copied to the clipboard.",
            "Copied to the clipboard successfully.",
            "Copied to the clipboard, safe and sound.",
            "Copied to the clipboard, safe, sound, and ready to paste.",
        ],
        yue: [
            "已複製到剪貼簿。",
            "已複製到剪貼簿。",
            "成功複製到剪貼簿。",
            "已經複製到剪貼簿，穩陣妥當。",
            "已經複製到剪貼簿，穩穩陣陣，隨時貼得。",
        ],
    },
    "markerRegex.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard this time.",
            "Could not reach the clipboard, for whatever reason.",
            "Could not reach the clipboard, which is having one of those days.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "呢次去唔到剪貼簿。",
            "唔知咩原因，都係去唔到剪貼簿。",
            "唔知剪貼簿今日發咩神經，總之就係去唔到剪貼簿。",
        ],
    },
    "markerRegex.reset": {
        en: [
            "Search reset to plain text.",
            "Search reset to plain text.",
            "Search reset to plain text mode.",
            "Search reset back to plain text mode, nice and simple.",
            "Search reset back to plain text mode, regex politely shown the door.",
        ],
        yue: [
            "搜尋已重設做純文字。",
            "搜尋已重設做純文字。",
            "搜尋已重設做純文字模式。",
            "搜尋重設返做純文字模式，簡簡單單。",
            "搜尋重設返做純文字模式，regex 畀人客客氣氣請咗出去。",
        ],
    },
    "markerRegex.noMatches": {
        en: [
            "Nothing in the sample matches.",
            "Nothing in the sample matches.",
            "Nothing in the sample matches this pattern.",
            "Nothing in the sample is matching this pattern.",
            "Not one thing in the sample wants to match this pattern.",
        ],
        yue: [
            "個 sample 入面冇嘢 match 到。",
            "個 sample 入面冇嘢 match 到。",
            "個 sample 入面冇嘢 match 到呢個 pattern。",
            "個 sample 入面冇一樣嘢 match 到呢個 pattern。",
            "個 sample 入面一個字都唔想同呢個 pattern match。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const MARKERREGEX_FIXED = {
    /* Group titles, in the guided picker's own order. */
    "markerRegex.group.characters": { en: "Characters", yue: "字元" },
    "markerRegex.group.anchors": { en: "Anchors", yue: "錨點" },
    "markerRegex.group.groups": { en: "Groups and captures", yue: "擷取組" },
    "markerRegex.group.alternation": { en: "Alternation", yue: "交替選擇" },
    "markerRegex.group.quantifiers": { en: "Quantifiers", yue: "數量詞" },

    /* Token descriptions: what each guided insert actually means. */
    "markerRegex.token.any": { en: "any character", yue: "任何字元" },
    "markerRegex.token.digit": { en: "a digit", yue: "一個數字" },
    "markerRegex.token.notDigit": { en: "not a digit", yue: "唔係數字" },
    "markerRegex.token.word": { en: "a word character", yue: "一個文字字元" },
    "markerRegex.token.notWord": { en: "not a word character", yue: "唔係文字字元" },
    "markerRegex.token.space": { en: "whitespace", yue: "空白字元" },
    "markerRegex.token.notSpace": { en: "not whitespace", yue: "唔係空白字元" },
    "markerRegex.token.class": { en: "one of these characters", yue: "呢啲字元其中一個" },
    "markerRegex.token.negClass": { en: "none of these characters", yue: "呢啲字元一個都唔係" },
    "markerRegex.token.range": { en: "a character range", yue: "一個字元範圍" },
    "markerRegex.token.start": { en: "start of input", yue: "輸入嘅開頭" },
    "markerRegex.token.end": { en: "end of input", yue: "輸入嘅結尾" },
    "markerRegex.token.wordEdge": { en: "word boundary", yue: "字界" },
    "markerRegex.token.notWordEdge": { en: "not a word boundary", yue: "唔係字界" },
    "markerRegex.token.capture": { en: "capturing group", yue: "擷取組" },
    "markerRegex.token.nonCapture": { en: "non-capturing group", yue: "非擷取組" },
    "markerRegex.token.namedCapture": { en: "named capturing group", yue: "具名擷取組" },
    "markerRegex.token.lookahead": { en: "positive lookahead", yue: "正向預查" },
    "markerRegex.token.negLookahead": { en: "negative lookahead", yue: "反向預查" },
    "markerRegex.token.backreference": { en: "back-reference to group 1", yue: "返指第 1 組" },
    "markerRegex.token.or": { en: "either side matches", yue: "兩邊揀一邊 match" },
    "markerRegex.token.orGroup": { en: "a group of alternatives", yue: "一組替代選項" },
    "markerRegex.token.star": { en: "zero or more", yue: "零個或以上" },
    "markerRegex.token.plus": { en: "one or more", yue: "一個或以上" },
    "markerRegex.token.optional": { en: "zero or one", yue: "零個或一個" },
    "markerRegex.token.exactly": { en: "exactly n times", yue: "剛好 n 次" },
    "markerRegex.token.atLeast": { en: "n or more times", yue: "n 次或以上" },
    "markerRegex.token.between": { en: "between n and m times", yue: "n 到 m 次之間" },
    "markerRegex.token.lazy": { en: "lazy, as few as possible", yue: "惰性，愈少愈好" },

    /* Flag descriptions. */
    "markerRegex.flag.g": {
        en: "global, find every match (preview only)",
        yue: "global，搵晒所有 match（淨係預覽用）",
    },
    "markerRegex.flag.i": { en: "ignore case", yue: "忽略大小寫" },
    "markerRegex.flag.m": {
        en: "multiline, ^ and $ match every line",
        yue: "multiline，^ 同 $ 會 match 每一行",
    },
    "markerRegex.flag.s": { en: "dot matches newlines", yue: "dot 會 match 埋換行" },
    "markerRegex.flag.u": { en: "unicode mode", yue: "unicode 模式" },
    "markerRegex.flag.y": {
        en: "sticky, match from lastIndex (preview only)",
        yue: "sticky，由 lastIndex 開始 match（淨係預覽用）",
    },

    /* Chrome: title, buttons, the flags legend. */
    "markerRegex.title": { en: "Regular expression builder", yue: "正則表達式產生器" },
    "markerRegex.escape": { en: "Escape as literal", yue: "當字面字元 escape" },
    "markerRegex.resetButton": { en: "Reset", yue: "重設" },
    "markerRegex.flags": { en: "Flags", yue: "Flags" },

    /* The live preview: counts, truncation and the bounds that produced them. */
    "markerRegex.matchCount": { en: "{count} matches in the sample", yue: "sample 入面有 {count} 個 match" },
    "markerRegex.truncated": { en: "Stopped after {max} matches.", yue: "數到 {max} 個 match 就停咗。" },
    "markerRegex.timedOut": { en: "Stopped after {ms} ms.", yue: "行咗 {ms} 毫秒就停咗。" },
    "markerRegex.sampleTruncated": {
        en: "Sample cut to {max} characters.",
        yue: "Sample 剪咗淨返 {max} 個字元。",
    },
    "markerRegex.emptyMatch": { en: "(empty match)", yue: "（空嘅 match）" },
    "markerRegex.atIndex": { en: "at {index}", yue: "喺 {index}" },
    "markerRegex.unset": { en: "(unset)", yue: "（未設定）" },

    /* Copy and export. */
    "markerRegex.copyPattern": { en: "Copy pattern", yue: "複製 pattern" },
    "markerRegex.copyLiteral": { en: "Copy /pattern/flags", yue: "複製 /pattern/flags" },
    "markerRegex.exportJson": { en: "Export JSON", yue: "匯出 JSON" },
    "markerRegex.exportText": { en: "Export text", yue: "匯出文字" },
    "markerRegex.exported": { en: "Exported {name}.", yue: "已匯出 {name}。" },
} as const satisfies Record<string, FixedString>;

export const MARKERREGEX_FACTS = {
    "markerRegex.engine": {
        en: ["ECMAScript RegExp", "{pattern}", "{sample}", "{matches}", "{ms}"],
        yue: ["ECMAScript RegExp", "{pattern}", "{sample}", "{matches}", "{ms}"],
    },
    "markerRegex.plainNote": {
        en: ["literal", "ignoring case", "id", "label", "player name", "player uuid"],
        yue: ["字面文字", "唔理大小寫", "id", "label", "玩家名", "玩家 uuid"],
    },
    "markerRegex.regexNote": {
        en: ["id", "label", "player name", "player uuid", "g and y", "lastIndex"],
        yue: ["id", "label", "玩家名", "玩家 uuid", "g 同 y", "lastIndex"],
    },
    "markerRegex.guidedHint": {
        en: ["character classes", "anchors", "groups", "alternation", "quantifiers"],
        yue: ["字元類別", "錨點", "擷取組", "交替選擇", "數量詞"],
    },
    "markerRegex.tooLong": {
        en: ["maximum length"],
        yue: ["最大長度"],
    },
    "markerRegex.copied": {
        en: ["Copied", "clipboard"],
        yue: ["複製", "剪貼簿"],
    },
    "markerRegex.copyFailed": {
        en: ["Could not reach the clipboard"],
        yue: ["去唔到剪貼簿"],
    },
    "markerRegex.reset": {
        en: ["reset", "plain text"],
        yue: ["重設", "純文字"],
    },
    "markerRegex.noMatches": {
        en: ["sample", "match"],
        yue: ["sample", "match"],
    },
} as const satisfies Record<
    keyof typeof MARKERREGEX_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
