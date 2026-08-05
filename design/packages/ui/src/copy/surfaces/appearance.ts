/**
 * The appearance editor: per-element typography, the infinite colour picker and its
 * notation translator, the surface controls, saved presets, theme export and import, and
 * the two resets.
 *
 * This is the one screen in the application whose entire job is delight, so level 5 is
 * allowed to be sillier here than anywhere else. Four kinds of sentence are exempt from
 * that licence, and they are exactly the four a playful rewrite is most tempted by:
 *
 *   1. **Colour values, font names, sizes and ratios are identifiers.** `#1e88e5`,
 *      `oklch(0.6 0.15 250)`, `rebeccapurple`, `700`, `sRGB`, `Display P3` and the measured
 *      contrast ratio read the same in English and in Cantonese at every level. A translated
 *      colour keyword sends the reader looking for a colour CSS does not have.
 *
 *   2. **A contrast reading is an accessibility fact.** `{level}` interpolates the literal
 *      WCAG verdict from `contrastLevel()`, one of `fail`, `AA` or `AAA`, so the copy must
 *      never editorialise the verdict itself. Level 5 may say what it likes about the
 *      colour; the ratio and the verdict stay where the eye expects them.
 *
 *   3. **Where a value cannot be represented, the copy says the input is kept.** Three keys
 *      carry that promise: `appearance.editor.unreadableColor` and
 *      `appearance.color.field.unreadable` for a colour this build cannot parse, and
 *      `appearance.import.preserved` for settings from a newer theme file. "Kept but not
 *      applied" is the whole difference between a limitation and a data loss bug, and it
 *      survives level 5 in both languages.
 *
 *   4. **A reset names its blast radius.** `appearance.editor.resetAllAction` says how many
 *      elements, that it cannot be undone, and that saved presets are *not* taken with it;
 *      `appearance.preset.deleteAction` says which preset, where its followers land, and
 *      that it cannot be recovered. Both are the `action` string of the super confirmation
 *      gate, which is the last sentence read before the slider moves.
 *
 * `appearance.target.app.titleBar` and `appearance.target.app.tabBar` live in `chrome.ts`
 * with the rest of the window furniture they name, and are deliberately not repeated here.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const APPEARANCE_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Importing a theme file                                            */
    /* ---------------------------------------------------------------- */

    "appearance.import.clean": {
        en: [
            "Imported {elements} elements and {presets} presets.",
            "Imported {elements} elements and {presets} presets.",
            "Imported {elements} elements and {presets} presets, all of them applied.",
            "Imported {elements} elements and {presets} presets, all present and correct.",
            "Imported {elements} elements and {presets} presets, and not one of them argued about it.",
        ],
        yue: [
            "已匯入 {elements} 個元素同 {presets} 個預設。",
            "已匯入 {elements} 個元素同 {presets} 個預設。",
            "已經匯入咗 {elements} 個元素同 {presets} 個預設，全部都套用咗。",
            "已經匯入咗 {elements} 個元素同 {presets} 個預設，齊齊整整。",
            "已經匯入咗 {elements} 個元素同 {presets} 個預設，冇一個喺途中鬧交。",
        ],
    },
    /*
     * The forward-compatibility case. A theme written by a newer build carries settings this
     * one has no code for, and the honest thing is to store them untouched so the newer build
     * still finds them. Every level says "stored but not applied" and lists `{kept}`, because
     * a level that only says "imported" describes a silent partial import as a clean one.
     */
    "appearance.import.preserved": {
        en: [
            "Imported {elements} elements and {presets} presets. These settings came from a version this build does not know, so they are stored but not applied: {kept}",
            "Imported {elements} elements and {presets} presets. These settings came from a version this build does not know, so they are stored but not applied: {kept}",
            "Imported {elements} elements and {presets} presets. Some settings came from a version this build does not know, so they are stored but not applied: {kept}",
            "Imported {elements} elements and {presets} presets. A few settings came from a version this build has never met, so they are stored but not applied rather than thrown away: {kept}",
            "Imported {elements} elements and {presets} presets. A few settings turned up from a version this build has never heard of, so they are stored but not applied, kept safe until a build that speaks their language comes along: {kept}",
        ],
        yue: [
            "已匯入 {elements} 個元素同 {presets} 個預設。呢啲設定嚟自呢個版本唔認識嘅版本，所以只會儲起，唔會套用：{kept}",
            "已匯入 {elements} 個元素同 {presets} 個預設。呢啲設定嚟自呢個版本唔認識嘅版本，所以只會儲起，唔會套用：{kept}",
            "已經匯入咗 {elements} 個元素同 {presets} 個預設。有部分設定嚟自呢個版本唔認識嘅版本，所以只會儲起，唔會套用：{kept}",
            "已經匯入咗 {elements} 個元素同 {presets} 個預設。有幾項設定嚟自呢個版本未見過嘅版本，所以只會儲起，唔會套用，但都冇掉咗佢：{kept}",
            "已經匯入咗 {elements} 個元素同 {presets} 個預設。有幾項設定係由呢個版本聽都未聽過嘅版本走出嚟，所以只會儲起，唔會套用，留住等第日有個識佢哋嘅版本先算：{kept}",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* A colour this build cannot parse                                  */
    /* ---------------------------------------------------------------- */

    /*
     * Two keys for the same limitation, different places. The editor's banner names the
     * property because it lists several at once; the colour field's own line is read with
     * the property label already beside it, so it only carries the value.
     */
    "appearance.editor.unreadableColor": {
        en: [
            "{property} is stored as {value}, which this app cannot read, so it is kept but not applied.",
            "{property} is stored as {value}, which this app cannot read, so it is kept but not applied.",
            "{property} is stored as {value}. This app cannot read that, so it is kept but not applied.",
            "{property} is stored as {value}. This app cannot read that at all, so it is kept but not applied rather than quietly dropped.",
            "{property} is stored as {value}, which this app cannot read one bit. It is kept but not applied, because losing your colour would be ruder than admitting defeat.",
        ],
        yue: [
            "{property} 儲存嘅值係 {value}，呢個程式讀唔到，所以會保留但唔會套用。",
            "{property} 儲存嘅值係 {value}，呢個程式讀唔到，所以會保留但唔會套用。",
            "{property} 儲存嘅值係 {value}。呢個程式讀唔到，所以會保留但唔會套用。",
            "{property} 儲存嘅值係 {value}。呢個程式完全讀唔到，所以會保留但唔會套用，唔會靜靜雞掉咗佢。",
            "{property} 儲存嘅值係 {value}，呢個程式一啲都讀唔到。佢會保留但唔會套用，因為整唔見你隻色，仲衰過認低威。",
        ],
    },
    "appearance.color.field.unreadable": {
        en: [
            "Kept but not applied, because this app cannot read it: {value}",
            "Kept but not applied, because this app cannot read it: {value}",
            "Kept but not applied, because this app cannot read it: {value}",
            "Kept but not applied, because this app cannot read it at all: {value}",
            "Kept but not applied, because this app cannot read it and would rather say so than invent a colour: {value}",
        ],
        yue: [
            "保留咗但唔會套用，因為呢個程式讀唔到：{value}",
            "保留咗但唔會套用，因為呢個程式讀唔到：{value}",
            "保留咗但唔會套用，因為呢個程式讀唔到佢：{value}",
            "保留咗但唔會套用，因為呢個程式完全讀唔到佢：{value}",
            "保留咗但唔會套用，因為呢個程式讀唔到佢，而佢寧願照直講，都唔會亂作隻色出嚟：{value}",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The colour field, before a colour is set                          */
    /* ---------------------------------------------------------------- */

    "appearance.color.field.empty": {
        en: [
            "Not set. This element follows whatever is above it.",
            "Not set. This element follows whatever is above it.",
            "Not set, so this element follows whatever is above it.",
            "Not set, so this element follows whatever is above it instead.",
            "Not set, so this element just follows whatever is above it and saves itself the trouble.",
        ],
        yue: [
            "未設定。呢個元素會跟返上一層嘅設定。",
            "未設定。呢個元素會跟返上一層嘅設定。",
            "未設定，所以呢個元素會跟返上一層嘅設定。",
            "未設定，所以呢個元素直接跟返上一層嘅設定。",
            "未設定，所以呢個元素索性跟返上一層嘅設定，慳返啲工夫。",
        ],
    },
    "appearance.color.field.open": {
        en: [
            "Edit {label}. Currently {value}.",
            "Edit {label}. Currently {value}.",
            "Edit {label}. It is currently {value}.",
            "Edit {label}, which is currently {value}.",
            "Edit {label}, currently {value} and quite prepared to be something else.",
        ],
        yue: [
            "編輯 {label}。目前係 {value}。",
            "編輯 {label}。目前係 {value}。",
            "編輯 {label}。佢目前係 {value}。",
            "編輯 {label}，佢目前係 {value}。",
            "編輯 {label}，目前係 {value}，隨時可以變第樣。",
        ],
    },
    "appearance.color.field.clearHint": {
        en: [
            "Clear this colour so the element follows whatever is above it.",
            "Clear this colour so the element follows whatever is above it.",
            "Clear this colour so the element follows whatever is above it again.",
            "Clear this colour and the element goes back to following whatever is above it.",
            "Clear this colour and the element quietly goes back to following whatever is above it, no argument.",
        ],
        yue: [
            "清除呢隻顏色，等呢個元素跟返上一層嘅設定。",
            "清除呢隻顏色，等呢個元素跟返上一層嘅設定。",
            "清除呢隻顏色，等呢個元素再次跟返上一層嘅設定。",
            "清除呢隻顏色，個元素就會返去跟上一層嘅設定。",
            "清除呢隻顏色，個元素就乖乖返去跟上一層嘅設定，一句都唔會嘈。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The infinite colour picker                                        */
    /* ---------------------------------------------------------------- */

    /*
     * The gamut warning. `{notation}` is the write space the picker has chosen, upper-cased
     * by the call site, and the reason it chose it is the second half of the sentence: a
     * notation that cannot hold the colour would change it. Level 5 may be as breezy as it
     * likes about a colour wandering out of sRGB, but it never drops the trade being made.
     */
    "appearance.color.clipWarning": {
        en: [
            "This colour is outside sRGB. It is being saved as {notation} so nothing is lost. Saving it in a notation that cannot hold it would change the colour.",
            "This colour is outside sRGB. It is being saved as {notation} so nothing is lost. Saving it in a notation that cannot hold it would change the colour.",
            "This colour sits outside sRGB. It is being saved as {notation} so nothing is lost. A notation that cannot hold it would change the colour.",
            "This colour sits outside sRGB. It is being saved as {notation} so nothing is lost, because a notation that cannot hold it would change the colour.",
            "This colour has wandered outside sRGB. It is being saved as {notation} so nothing is lost; squeezing it into a notation that cannot hold it would change the colour, and that is not a trade this app makes behind your back.",
        ],
        yue: [
            "呢隻顏色喺 sRGB 範圍以外。佢會以 {notation} 儲存，咁樣先唔會蝕咗任何資訊。用一個載唔起佢嘅表示法儲存，會令隻色變樣。",
            "呢隻顏色喺 sRGB 範圍以外。佢會以 {notation} 儲存，咁樣先唔會蝕咗任何資訊。用一個載唔起佢嘅表示法儲存，會令隻色變樣。",
            "呢隻顏色超出咗 sRGB 範圍。佢會以 {notation} 儲存，咁先唔會蝕咗任何資訊。一個載唔起佢嘅表示法，會令隻色變樣。",
            "呢隻顏色超出咗 sRGB 範圍。佢會以 {notation} 儲存，一啲資訊都唔會蝕，因為用個載唔起佢嘅表示法，會令隻色變樣。",
            "呢隻顏色行咗出 sRGB 範圍以外。佢會以 {notation} 儲存，一啲資訊都唔會蝕；夾硬塞入個載唔起佢嘅表示法，隻色會變樣，而呢個程式唔會靜靜雞幫你做呢單交易。",
        ],
    },
    "appearance.color.notationChanged": {
        en: [
            "Saved as {notation}.",
            "Saved as {notation}.",
            "Saved as {notation} instead.",
            "Saved as {notation}, and the colour itself is unchanged.",
            "Saved as {notation}. Same colour, new spelling.",
        ],
        yue: [
            "已以 {notation} 儲存。",
            "已以 {notation} 儲存。",
            "已經改為以 {notation} 儲存。",
            "已經以 {notation} 儲存，隻色本身冇變。",
            "已經以 {notation} 儲存。同一隻色，換咗個寫法啫。",
        ],
    },
    /*
     * Three worked examples under the free-entry field, and all three are literals the parser
     * genuinely accepts. They are pinned as facts in both languages: a level that swaps
     * `rebeccapurple` for a prettier-sounding word teaches the reader a colour that does not
     * parse.
     */
    "appearance.color.anyHint": {
        en: [
            "For example #1e88e5, oklch(0.6 0.15 250), or rebeccapurple",
            "For example #1e88e5, oklch(0.6 0.15 250), or rebeccapurple",
            "For example #1e88e5, oklch(0.6 0.15 250), or rebeccapurple",
            "Anything readable goes: #1e88e5, oklch(0.6 0.15 250), or rebeccapurple",
            "Anything this app can read goes: #1e88e5, oklch(0.6 0.15 250), or even rebeccapurple, which is a real CSS colour and not a joke",
        ],
        yue: [
            "例如 #1e88e5、oklch(0.6 0.15 250) 或者 rebeccapurple",
            "例如 #1e88e5、oklch(0.6 0.15 250) 或者 rebeccapurple",
            "例如 #1e88e5、oklch(0.6 0.15 250)，又或者 rebeccapurple",
            "讀得出嘅都得：#1e88e5、oklch(0.6 0.15 250) 或者 rebeccapurple",
            "呢個程式讀得出嘅都得：#1e88e5、oklch(0.6 0.15 250)，甚至 rebeccapurple，佢真係一隻 CSS 顏色，唔係搞笑",
        ],
    },
    "appearance.color.searchSummary": {
        en: [
            "Showing {shown} of {total} notations.",
            "Showing {shown} of {total} notations.",
            "Showing {shown} of the {total} notations.",
            "{shown} of {total} notations on screen.",
            "{shown} of {total} notations on screen. The rest are filtered out, not missing.",
        ],
        yue: [
            "顯示緊 {total} 個表示法入面嘅 {shown} 個。",
            "顯示緊 {total} 個表示法入面嘅 {shown} 個。",
            "喺 {total} 個表示法入面，顯示緊 {shown} 個。",
            "畫面上有 {total} 個表示法入面嘅 {shown} 個。",
            "畫面上有 {total} 個表示法入面嘅 {shown} 個。其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    "appearance.color.noName": {
        en: [
            "This colour has no CSS keyword.",
            "This colour has no CSS keyword.",
            "This colour has no CSS keyword of its own.",
            "This colour has no CSS keyword of its own. Not every colour got a name.",
            "This colour has no CSS keyword of its own. The names were handed out to a fixed list long ago, and this one is not on it.",
        ],
        yue: [
            "呢隻顏色冇對應嘅 CSS 關鍵字。",
            "呢隻顏色冇對應嘅 CSS 關鍵字。",
            "呢隻顏色冇自己嘅 CSS 關鍵字。",
            "呢隻顏色冇自己嘅 CSS 關鍵字。唔係每隻色都有名。",
            "呢隻顏色冇自己嘅 CSS 關鍵字。當年派名嗰張清單早就定咗，佢冇份。",
        ],
    },
    /*
     * A row of the translator table that cannot represent the selected colour. It shows a
     * different colour on purpose, and saying so is the point of the tooltip: without it the
     * table looks like it is disagreeing with itself.
     */
    "appearance.color.clippedHint": {
        en: [
            "{notation} cannot hold this colour, so this line shows a different one.",
            "{notation} cannot hold this colour, so this line shows a different one.",
            "{notation} cannot hold this colour, so this line is showing a different one.",
            "{notation} cannot hold this colour, so this line is showing a different one rather than pretending otherwise.",
            "{notation} cannot hold this colour, so this line is showing a different one. It is the nearest {notation} can manage, and it is being honest about that.",
        ],
        yue: [
            "{notation} 載唔起呢隻顏色，所以呢一行顯示嘅係另一隻色。",
            "{notation} 載唔起呢隻顏色，所以呢一行顯示嘅係另一隻色。",
            "{notation} 載唔起呢隻顏色，所以呢一行show出嚟嘅係另一隻色。",
            "{notation} 載唔起呢隻顏色，所以呢一行show出嚟嘅係另一隻色，冇扮到似模似樣。",
            "{notation} 載唔起呢隻顏色，所以呢一行show出嚟嘅係另一隻色。呢隻已經係 {notation} 盡力做到最接近嘅，佢老實同你講。",
        ],
    },
    "appearance.color.useNotationHint": {
        en: [
            "Save the colour in this notation. The colour itself does not change.",
            "Save the colour in this notation. The colour itself does not change.",
            "Save the colour in this notation. The colour itself does not change at all.",
            "Save the colour in this notation. Only the spelling moves; the colour itself does not change.",
            "Save the colour in this notation. Only the spelling moves, the colour itself does not change, and nobody's eyes will notice a thing.",
        ],
        yue: [
            "以呢個表示法儲存呢隻顏色。顏色本身唔會變。",
            "以呢個表示法儲存呢隻顏色。顏色本身唔會變。",
            "將呢隻顏色以呢個表示法儲存。顏色本身唔會變。",
            "將呢隻顏色以呢個表示法儲存。變嘅只係寫法，顏色本身唔會變。",
            "將呢隻顏色以呢個表示法儲存。變嘅只係寫法，顏色本身唔會變，肉眼睇落一模一樣。",
        ],
    },
    "appearance.color.noRows": {
        en: [
            "No notation matches that search.",
            "No notation matches that search.",
            "No notation matches that search.",
            "No notation matches that search. None of them has been removed.",
            "No notation matches that search. None of them has been removed either; they are all still down there, unmatched.",
        ],
        yue: [
            "冇表示法符合呢個搜尋。",
            "冇表示法符合呢個搜尋。",
            "冇任何表示法符合呢個搜尋。",
            "冇任何表示法符合呢個搜尋。一個都冇被移除。",
            "冇任何表示法符合呢個搜尋。亦都一個都冇被移除，全部仲喺下面，只係冇人夾到佢。",
        ],
    },

    /*
     * The two contrast readings. `{level}` is the literal WCAG verdict from
     * `contrastLevel()`, one of `fail`, `AA` or `AAA`, so the sentence must never decide for
     * itself whether the pairing is good: it reports the measured ratio and the verdict, and
     * lets both stand. Level 5 aims its joke at the colour, never at the number, and "body
     * text" stays because the same ratio grades differently for large text.
     */
    "appearance.color.contrastOn": {
        en: [
            "{ratio} to 1 against the surface behind it ({level} for body text).",
            "{ratio} to 1 against the surface behind it ({level} for body text).",
            "{ratio} to 1 against the surface behind it, which is {level} for body text.",
            "{ratio} to 1 against the surface behind it, and that scores {level} for body text.",
            "{ratio} to 1 against the surface behind it, which WCAG scores {level} for body text. The number is the number, whatever the colour is doing.",
        ],
        yue: [
            "同背後嘅表面相比係 {ratio} 比 1（以正文字體計，等級 {level}）。",
            "同背後嘅表面相比係 {ratio} 比 1（以正文字體計，等級 {level}）。",
            "同背後嘅表面相比係 {ratio} 比 1，以正文字體計係 {level}。",
            "同背後嘅表面相比係 {ratio} 比 1，以正文字體計就係 {level}。",
            "同背後嘅表面相比係 {ratio} 比 1，以正文字體計，WCAG 俾佢 {level}。隻色幾靚都好，條數就係咁。",
        ],
    },
    "appearance.color.contrastOf": {
        en: [
            "{ratio} to 1 for the text on top of it ({level} for body text).",
            "{ratio} to 1 for the text on top of it ({level} for body text).",
            "{ratio} to 1 for the text on top of it, which is {level} for body text.",
            "{ratio} to 1 for the text sitting on top of it, and that scores {level} for body text.",
            "{ratio} to 1 for the text sitting on top of it, which WCAG scores {level} for body text. Pretty is not a defence against a ratio.",
        ],
        yue: [
            "喺佢上面嘅文字係 {ratio} 比 1（以正文字體計，等級 {level}）。",
            "喺佢上面嘅文字係 {ratio} 比 1（以正文字體計，等級 {level}）。",
            "喺佢上面嘅文字係 {ratio} 比 1，以正文字體計係 {level}。",
            "坐喺佢上面嘅文字係 {ratio} 比 1，以正文字體計就係 {level}。",
            "坐喺佢上面嘅文字係 {ratio} 比 1，以正文字體計，WCAG 俾佢 {level}。靚唔靚係一件事，條比例係另一件事。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The typography editor                                             */
    /* ---------------------------------------------------------------- */

    /*
     * The surface and preset search bars, written to the same pattern as the typography one
     * below. All three say at the higher levels that a filtered-out row was filtered rather
     * than deleted, which is the one thing somebody looking at a suddenly short list wants
     * to know. These six keys were missing from the generated work list because the summary
     * calls sit inside a `:summary="…"` attribute expression the extractor masked.
     */
    "appearance.surface.searchSummary": {
        en: [
            "Showing {shown} of {total} settings.",
            "Showing {shown} of {total} settings.",
            "Showing {shown} of the {total} settings.",
            "{shown} of {total} settings on screen.",
            "{shown} of {total} settings on screen. The rest are filtered out, not gone.",
        ],
        yue: [
            "顯示緊 {total} 項設定入面嘅 {shown} 項。",
            "顯示緊 {total} 項設定入面嘅 {shown} 項。",
            "喺 {total} 項設定入面，顯示緊 {shown} 項。",
            "畫面上有 {total} 項設定入面嘅 {shown} 項。",
            "畫面上有 {total} 項設定入面嘅 {shown} 項。其餘嘅係篩走咗，唔係冇咗。",
        ],
    },
    "appearance.surface.noMatch": {
        en: [
            "No surface setting matches that search.",
            "No surface setting matches that search.",
            "No surface setting matches that search.",
            "No surface setting matches that search. None of them has been removed.",
            "No surface setting matches that search. None of them has been removed either; every one is still here behind a better word.",
        ],
        yue: [
            "冇表面設定符合呢個搜尋。",
            "冇表面設定符合呢個搜尋。",
            "冇任何表面設定符合呢個搜尋。",
            "冇任何表面設定符合呢個搜尋。一項都冇被移除。",
            "冇任何表面設定符合呢個搜尋。亦都一項都冇被移除，全部仲喺度，等你諗到個好啲嘅字。",
        ],
    },
    "appearance.preset.searchSummary": {
        en: [
            "Showing {shown} of {total} saved presets.",
            "Showing {shown} of {total} saved presets.",
            "Showing {shown} of the {total} saved presets.",
            "{shown} of {total} saved presets on screen.",
            "{shown} of {total} saved presets on screen. The rest are filtered out, not deleted.",
        ],
        yue: [
            "顯示緊 {total} 個已儲存預設入面嘅 {shown} 個。",
            "顯示緊 {total} 個已儲存預設入面嘅 {shown} 個。",
            "喺 {total} 個已儲存預設入面，顯示緊 {shown} 個。",
            "畫面上有 {total} 個已儲存預設入面嘅 {shown} 個。",
            "畫面上有 {total} 個已儲存預設入面嘅 {shown} 個。其餘嘅係篩走咗，唔係刪咗。",
        ],
    },
    /*
     * The one of the three where the reassurance is load-bearing rather than polite: a
     * preset is something the user made and can lose, so an empty list has to say plainly
     * that the search hid them and nothing deleted them.
     */
    "appearance.preset.noMatch": {
        en: [
            "No saved preset matches that search.",
            "No saved preset matches that search.",
            "No saved preset matches that search.",
            "No saved preset matches that search. None of them has been deleted.",
            "No saved preset matches that search. None of them has been deleted either; the search is hiding them, not eating them.",
        ],
        yue: [
            "冇已儲存嘅預設符合呢個搜尋。",
            "冇已儲存嘅預設符合呢個搜尋。",
            "冇任何已儲存嘅預設符合呢個搜尋。",
            "冇任何已儲存嘅預設符合呢個搜尋。一個都冇被刪除。",
            "冇任何已儲存嘅預設符合呢個搜尋。亦都一個都冇被刪除，係個搜尋收埋咗佢哋，唔係食咗佢哋。",
        ],
    },
    "appearance.type.searchSummary": {
        en: [
            "Showing {shown} of {total} settings.",
            "Showing {shown} of {total} settings.",
            "Showing {shown} of the {total} settings.",
            "{shown} of {total} settings on screen.",
            "{shown} of {total} settings on screen. The rest are filtered out, not gone.",
        ],
        yue: [
            "顯示緊 {total} 項設定入面嘅 {shown} 項。",
            "顯示緊 {total} 項設定入面嘅 {shown} 項。",
            "喺 {total} 項設定入面，顯示緊 {shown} 項。",
            "畫面上有 {total} 項設定入面嘅 {shown} 項。",
            "畫面上有 {total} 項設定入面嘅 {shown} 項。其餘嘅係篩走咗，唔係冇咗。",
        ],
    },
    "appearance.type.noMatch": {
        en: [
            "No typography setting matches that search.",
            "No typography setting matches that search.",
            "No typography setting matches that search.",
            "No typography setting matches that search. None of them has been removed.",
            "No typography setting matches that search. None of them has been removed either; they are all still here, waiting for a better word.",
        ],
        yue: [
            "冇文字設定符合呢個搜尋。",
            "冇文字設定符合呢個搜尋。",
            "冇任何文字設定符合呢個搜尋。",
            "冇任何文字設定符合呢個搜尋。一項都冇被移除。",
            "冇任何文字設定符合呢個搜尋。亦都一項都冇被移除，佢哋全部仲喺度等你打第二個字。",
        ],
    },
    "appearance.type.resetHint": {
        en: [
            "Remove this override so the element follows whatever is above it.",
            "Remove this override so the element follows whatever is above it.",
            "Remove this override so the element follows whatever is above it again.",
            "Remove this override and the element goes back to following whatever is above it.",
            "Remove this override and the element goes straight back to following whatever is above it, as though you never touched it.",
        ],
        yue: [
            "移除呢個覆寫，等呢個元素跟返上一層嘅設定。",
            "移除呢個覆寫，等呢個元素跟返上一層嘅設定。",
            "移除呢個覆寫，等呢個元素再次跟返上一層嘅設定。",
            "移除呢個覆寫，個元素就會返去跟上一層嘅設定。",
            "移除呢個覆寫，個元素就即刻返去跟上一層嘅設定，好似你冇掂過佢咁。",
        ],
    },
    "appearance.type.fontOpen": {
        en: [
            "Choose a font. Currently {family}.",
            "Choose a font. Currently {family}.",
            "Choose a font. It is currently {family}.",
            "Choose a font, currently {family}.",
            "Choose a font. {family} has the job at the moment, and it is not a permanent appointment.",
        ],
        yue: [
            "揀一隻字體。目前係 {family}。",
            "揀一隻字體。目前係 {family}。",
            "揀一隻字體。佢目前係 {family}。",
            "揀一隻字體，目前用緊 {family}。",
            "揀一隻字體。而家份工由 {family} 做緊，唔係終身制。",
        ],
    },
    "appearance.type.fontSummary": {
        en: [
            "Showing {shown} of {total} fonts.",
            "Showing {shown} of {total} fonts.",
            "Showing {shown} of the {total} fonts.",
            "{shown} of {total} fonts on screen.",
            "{shown} of {total} fonts on screen. The rest are filtered out, not uninstalled.",
        ],
        yue: [
            "顯示緊 {total} 隻字體入面嘅 {shown} 隻。",
            "顯示緊 {total} 隻字體入面嘅 {shown} 隻。",
            "喺 {total} 隻字體入面，顯示緊 {shown} 隻。",
            "畫面上有 {total} 隻字體入面嘅 {shown} 隻。",
            "畫面上有 {total} 隻字體入面嘅 {shown} 隻。其餘嘅係篩走咗，唔係俾人移除咗。",
        ],
    },
    "appearance.type.noFont": {
        en: [
            "No font matches that search.",
            "No font matches that search.",
            "No font matches that search.",
            "No font matches that search. None of them has been uninstalled.",
            "No font matches that search. None of them has been uninstalled either; the list is filtered, not emptied.",
        ],
        yue: [
            "冇字體符合呢個搜尋。",
            "冇字體符合呢個搜尋。",
            "冇任何字體符合呢個搜尋。",
            "冇任何字體符合呢個搜尋。一隻都冇被移除。",
            "冇任何字體符合呢個搜尋。亦都一隻都冇被移除，個清單只係篩咗，唔係清空咗。",
        ],
    },
    /* `700` is the actual floor the bold switch writes, so it is pinned rather than paraphrased. */
    "appearance.type.boldHint": {
        en: [
            "Bold, which raises the weight to at least 700",
            "Bold, which raises the weight to at least 700",
            "Bold, which raises the weight to at least 700",
            "Bold, which pushes the weight up to at least 700",
            "Bold, which shoves the weight up to at least 700 and refuses to go lighter",
        ],
        yue: [
            "粗體，會將字重提升到最少 700",
            "粗體，會將字重提升到最少 700",
            "粗體，會將字重提升到最少 700",
            "粗體，會將字重推上最少 700",
            "粗體，會將字重一路推上最少 700，唔會再瘦得返落去",
        ],
    },
    /*
     * A platform capability statement, and the reason the axis list looks too long. The app
     * cannot ask a face which axes it has, so it offers all the registered ones and a face
     * without an axis ignores the setting. Both halves survive every level, because a level
     * that only keeps the first half reads as an apology for a bug.
     */
    "appearance.type.axesHint": {
        en: [
            "The platform does not tell this app which axes a font has, so the registered ones are always offered. A face without an axis simply ignores it.",
            "The platform does not tell this app which axes a font has, so the registered ones are always offered. A face without an axis simply ignores it.",
            "The platform does not tell this app which axes a font has, so the registered ones are always offered. A face without that axis simply ignores it.",
            "The platform does not tell this app which axes a font has, so the registered ones are always offered. A face without that axis simply ignores the setting.",
            "The platform never tells this app which axes a font has, so the registered ones are always offered, every one of them, every time. A face without that axis simply ignores the setting and gets on with its day.",
        ],
        yue: [
            "平台唔會話俾呢個程式知一隻字體有邊啲軸，所以已註冊嘅軸永遠都會列出嚟。冇嗰條軸嘅字體會直接無視佢。",
            "平台唔會話俾呢個程式知一隻字體有邊啲軸，所以已註冊嘅軸永遠都會列出嚟。冇嗰條軸嘅字體會直接無視佢。",
            "平台唔會話俾呢個程式知一隻字體有邊啲軸，所以已註冊嘅軸永遠都會列出嚟。冇嗰條軸嘅字體會直接無視個設定。",
            "平台從來都唔會話俾呢個程式知一隻字體有邊啲軸，所以已註冊嘅軸永遠都會列出嚟，一條都唔會少。冇嗰條軸嘅字體會直接無視個設定。",
            "平台由頭到尾都唔會話俾呢個程式知一隻字體有邊啲軸，所以已註冊嘅軸永遠都會列出嚟，一條都唔會少。冇嗰條軸嘅字體會直接無視個設定，繼續做返自己。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Presets, and the two resets                                       */
    /* ---------------------------------------------------------------- */

    "appearance.preset.none.saved": {
        en: [
            "No presets saved yet. The three built-in ones are always available.",
            "No presets saved yet. The three built-in ones are always available.",
            "No presets saved yet. The three built-in ones are always available.",
            "No presets saved yet. The three built-in ones are always available, so the list is never truly empty.",
            "No presets saved yet. The three built-in ones are always available though, so this list is never really empty, just quiet.",
        ],
        yue: [
            "仲未儲存過任何預設。三個內建嘅預設一直都用得。",
            "仲未儲存過任何預設。三個內建嘅預設一直都用得。",
            "仲未儲存過任何預設。嗰三個內建嘅預設一直都用得。",
            "仲未儲存過任何預設。不過三個內建嘅預設一直都用得，所以個清單冇真空過。",
            "仲未儲存過任何預設。好在三個內建嘅預設一直都用得，所以呢個清單唔算真空，只係靜咗啲。",
        ],
    },
    /*
     * The super confirmation gate's `action` string for deleting a preset. Three facts, all
     * pinned: which preset, where the elements that followed it land, and that the preset
     * itself is not recoverable. The second one is the surprise, because "delete a preset"
     * sounds like it might take the elements' own settings with it, and it does not.
     */
    "appearance.preset.deleteAction": {
        en: [
            "This deletes the preset {name}. Elements following it go back to their own settings, and the preset cannot be recovered.",
            "This deletes the preset {name}. Elements following it go back to their own settings, and the preset cannot be recovered.",
            "This deletes the preset {name}. Elements that follow it go back to their own settings, and the preset cannot be recovered.",
            "This deletes the preset {name}. Every element following it falls back to its own settings, and the preset cannot be recovered afterwards.",
            "This deletes the preset {name}, for good. Every element following it drops back to its own settings, and the preset cannot be recovered, so there is no quiet undo waiting for you.",
        ],
        yue: [
            "呢個動作會刪除預設 {name}。跟住佢嘅元素會返返去自己嘅設定，而且呢個預設無法復原。",
            "呢個動作會刪除預設 {name}。跟住佢嘅元素會返返去自己嘅設定，而且呢個預設無法復原。",
            "呢個動作會刪除預設 {name}。跟住佢嘅元素會返去自己嘅設定，而且呢個預設無法復原。",
            "呢個動作會刪除預設 {name}。所有跟住佢嘅元素會返去自己嘅設定，之後呢個預設無法復原。",
            "呢個動作會徹底刪除預設 {name}。所有跟住佢嘅元素會即刻返去自己嘅設定，而呢個預設無法復原，冇後備，亦冇後悔藥。",
        ],
    },
    /*
     * The global reset's gate string, and the hint on the button that opens it. They carry
     * the same three facts on purpose: how many elements, that it cannot be undone, and that
     * saved presets survive. The last one is what stops the gate reading as "lose
     * everything", which it is not.
     */
    "appearance.editor.resetAllAction": {
        en: [
            "This removes the appearance overrides on all {count} customised elements at once and cannot be undone. Saved presets are kept.",
            "This removes the appearance overrides on all {count} customised elements at once and cannot be undone. Saved presets are kept.",
            "This removes the appearance overrides on all {count} customised elements in one go and cannot be undone. Saved presets are kept.",
            "This strips the appearance overrides off all {count} customised elements in one go and cannot be undone. Saved presets are kept.",
            "This wipes the appearance overrides off all {count} customised elements in one swing and cannot be undone, so every colour you fussed over goes back to stock. Saved presets are kept.",
        ],
        yue: [
            "呢個動作會一次過移除全部 {count} 個已自訂元素嘅外觀覆寫，而且無法復原。已儲存嘅預設會保留。",
            "呢個動作會一次過移除全部 {count} 個已自訂元素嘅外觀覆寫，而且無法復原。已儲存嘅預設會保留。",
            "呢個動作會一次過剷走全部 {count} 個已自訂元素嘅外觀覆寫，而且無法復原。已儲存嘅預設會保留。",
            "呢個動作會一嘢過剷走全部 {count} 個已自訂元素嘅外觀覆寫，而且無法復原。已儲存嘅預設會保留。",
            "呢個動作會一嘢過剷走全部 {count} 個已自訂元素嘅外觀覆寫，而且無法復原，你慢慢揀嘅每隻色都會打回原形。已儲存嘅預設會保留。",
        ],
    },
    "appearance.editor.resetAllHint": {
        en: [
            "Removes every appearance override. Saved presets are kept.",
            "Removes every appearance override. Saved presets are kept.",
            "Removes every appearance override in the app. Saved presets are kept.",
            "Removes every appearance override in the app, all at once. Saved presets are kept.",
            "Removes every appearance override in the app in one go and hands the whole interface back to the defaults. Saved presets are kept.",
        ],
        yue: [
            "移除所有外觀覆寫。已儲存嘅預設會保留。",
            "移除所有外觀覆寫。已儲存嘅預設會保留。",
            "移除程式入面所有外觀覆寫。已儲存嘅預設會保留。",
            "一次過移除程式入面所有外觀覆寫。已儲存嘅預設會保留。",
            "一次過移除程式入面所有外觀覆寫，成個介面打回原廠樣。已儲存嘅預設會保留。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The per-element appearance menu                                   */
    /* ---------------------------------------------------------------- */

    "appearance.menu.noMatch": {
        en: [
            "No command matches that search.",
            "No command matches that search.",
            "No command in this menu matches that search.",
            "No command in this menu matches that search. Nothing has been removed from it.",
            "No command in this menu matches that search. Nothing has been removed from it either; they are all still there, just not answering to that.",
        ],
        yue: [
            "冇指令符合呢個搜尋。",
            "冇指令符合呢個搜尋。",
            "呢個選單入面冇指令符合呢個搜尋。",
            "呢個選單入面冇指令符合呢個搜尋。冇任何指令被移除。",
            "呢個選單入面冇指令符合呢個搜尋。亦都冇任何指令被移除，佢哋全部仲喺度，只係唔認呢個字。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const APPEARANCE_FIXED = {
    /* The editor's own frame: its title, its tab strip, and the per-element reset. */
    "appearance.editor.title": { en: "Appearance of {element}", yue: "{element} 嘅外觀" },
    "appearance.editor.resetElement": { en: "Reset this element", yue: "重設呢個元素" },
    "appearance.editor.tabs": { en: "Appearance sections", yue: "外觀分頁" },
    "appearance.editor.typographyTab": { en: "Text", yue: "文字" },
    "appearance.editor.surfaceTab": { en: "Surface", yue: "表面" },
    "appearance.editor.presetsTab": { en: "Presets", yue: "預設" },
    "appearance.surface.reset": { en: "Reset {property}", yue: "重設 {property}" },

    /* Presets: the two "follows" selects, saving, and deleting. */
    "appearance.preset.none": { en: "Do not follow a preset", yue: "唔跟任何預設" },
    "appearance.preset.forElement": { en: "This element follows", yue: "呢個元素跟" },
    "appearance.preset.forEverything": { en: "Everything follows", yue: "全部都跟" },
    "appearance.preset.name": { en: "Save this element as a preset", yue: "將呢個元素存做預設" },
    "appearance.preset.save": { en: "Save", yue: "儲存" },
    "appearance.preset.deleteTitle": { en: "Delete this preset", yue: "刪除呢個預設" },
    "appearance.preset.deleteConfirm": { en: "Delete the preset", yue: "刪除預設" },
    "appearance.preset.delete": { en: "Delete the preset {name}", yue: "刪除預設 {name}" },

    /* Theme export and import. */
    "appearance.theme.export": { en: "Export the theme", yue: "匯出主題" },
    "appearance.theme.import": { en: "Import a theme", yue: "匯入主題" },
    "appearance.theme.importField": { en: "Choose a theme file", yue: "揀一個主題檔案" },

    /*
     * The global reset's title, its confirm label, and the button that opens the gate. The
     * title and the button read the same because they are the same command seen twice, and
     * the confirm label is deliberately shorter: it sits under the slider, where a long
     * label is a label nobody finishes reading.
     */
    "appearance.editor.resetAllTitle": {
        en: "Reset every element in the app",
        yue: "重設程式入面每一個元素",
    },
    "appearance.editor.resetAllConfirm": { en: "Reset every element", yue: "重設每一個元素" },
    "appearance.editor.resetAll": {
        en: "Reset every element in the app",
        yue: "重設程式入面每一個元素",
    },

    /*
     * The appearance menu's commands. `appearance.menu.edit` is the command whose keyboard
     * shortcut is shown beside it and whose name the menu's own search matches on, so it is
     * FIXED rather than VOICED: a label that rewords itself with the funny level is a label
     * the reader has to re-find, and a search term that stops matching at level 4.
     */
    "appearance.menu.edit": { en: "Edit appearance...", yue: "編輯外觀..." },
    "appearance.menu.reset": {
        en: "Reset this element's appearance",
        yue: "重設呢個元素嘅外觀",
    },
    "appearance.menu.search": { en: "Search this menu", yue: "搜尋呢個選單" },
    "appearance.menu.label": { en: "Appearance commands", yue: "外觀指令" },

    /* The colour field's clear button. */
    "appearance.color.field.clear": { en: "Clear {label}", yue: "清除 {label}" },

    /*
     * The gamut readout. `sRGB` and `Display P3` are the standards' own names and stay
     * untranslated in both languages, exactly as a filename would.
     */
    "appearance.color.gamut.srgb": { en: "sRGB", yue: "sRGB" },
    "appearance.color.gamut.p3": {
        en: "Outside sRGB, inside Display P3",
        yue: "喺 sRGB 以外，但喺 Display P3 之內",
    },
    "appearance.color.gamut.outside": {
        en: "Outside every gamut this app can name",
        yue: "喺呢個程式叫得出名嘅色域以外",
    },

    /* The picker's continuous controls. */
    "appearance.color.swatch": {
        en: "The colour now selected: {color}",
        yue: "而家揀咗嘅顏色：{color}",
    },
    "appearance.color.field": { en: "Saturation and brightness", yue: "飽和度同亮度" },
    "appearance.color.saturation": { en: "Saturation", yue: "飽和度" },
    "appearance.color.brightness": { en: "Brightness", yue: "亮度" },
    "appearance.color.hue": { en: "Hue", yue: "色相" },
    "appearance.color.alpha": { en: "Opacity", yue: "不透明度" },
    "appearance.color.eyedropper": { en: "Pick from the screen", yue: "喺畫面上吸色" },
    "appearance.color.recent": {
        en: "Use the recent colour {color}",
        yue: "用返最近用過嘅顏色 {color}",
    },

    /* Notation entry, and the escape hatch beside the gamut warning. */
    "appearance.color.notation": { en: "Notation", yue: "表示法" },
    "appearance.color.any": { en: "Any notation", yue: "任何表示法" },
    "appearance.color.clipAnyway": {
        en: "Save the clipped value anyway",
        yue: "照樣儲存裁剪咗嘅值",
    },

    /* The translator table. */
    "appearance.color.translator": {
        en: "Every notation for this colour",
        yue: "呢隻顏色嘅所有表示法",
    },
    "appearance.color.searchLabel": { en: "Search the notations", yue: "搜尋表示法" },
    "appearance.color.clipped": { en: "Clipped", yue: "已裁剪" },
    "appearance.color.copy": { en: "Copy the {notation} value", yue: "複製 {notation} 嘅值" },
    "appearance.color.useNotation": { en: "Use", yue: "使用" },
    "appearance.color.contrast": { en: "Contrast", yue: "對比度" },

    /* The typography editor's controls. */
    "appearance.type.search": { en: "Search the typography settings", yue: "搜尋文字設定" },
    "appearance.surface.search": { en: "Search the surface settings", yue: "搜尋表面設定" },
    "appearance.preset.search": { en: "Search the saved presets", yue: "搜尋已儲存嘅預設" },
    "appearance.type.overridden": { en: "Set here", yue: "喺呢度設定咗" },
    "appearance.type.reset": { en: "Reset {property}", yue: "重設 {property}" },
    "appearance.type.fontSearch": { en: "Search fonts", yue: "搜尋字體" },
    "appearance.type.fontInstalled": { en: "Installed", yue: "已安裝" },
    "appearance.type.fontSizeEntry": { en: "Any size", yue: "任何大細" },
    "appearance.type.fontSizeStep": { en: "Size, in steps", yue: "大細，逐級調" },

    /* Variable-font axes, including the free-entry row for a tag the app does not register. */
    "appearance.type.axisClear": { en: "Stop setting the {axis} axis", yue: "唔再設定 {axis} 軸" },
    "appearance.type.axisTag": { en: "Custom axis tag", yue: "自訂軸標籤" },
    "appearance.type.axisValue": { en: "Value", yue: "數值" },
    "appearance.type.axisAdd": { en: "Add", yue: "加入" },

    /*
     * Shadow offsets are named by the direction they move the shadow rather than by their
     * axis letter, because "X" and "Y" tell a reader nothing about which way the shadow goes.
     */
    "appearance.type.shadowX": { en: "Sideways", yue: "橫向" },
    "appearance.type.shadowY": { en: "Down", yue: "向下" },
    "appearance.type.shadowBlur": { en: "Blur", yue: "模糊" },
    "appearance.type.shadowColor": { en: "Shadow colour", yue: "陰影顏色" },
    "appearance.type.glowRadius": { en: "Glow radius", yue: "光暈半徑" },
    "appearance.type.glowColor": { en: "Glow colour", yue: "光暈顏色" },
} as const satisfies Record<string, FixedString>;

export const APPEARANCE_FACTS = {
    "appearance.import.clean": {
        en: ["Imported", "{elements}", "{presets}"],
        yue: ["匯入", "{elements}", "{presets}"],
    },
    // "stored but not applied" plus the list is the difference between a partial import and
    // a silent one.
    "appearance.import.preserved": {
        en: ["{elements}", "{presets}", "{kept}", "stored but not applied"],
        yue: ["{elements}", "{presets}", "{kept}", "儲起，唔會套用"],
    },

    // The capability admission: the value is unreadable, and it is still yours.
    "appearance.editor.unreadableColor": {
        en: ["{property}", "{value}", "cannot read", "kept but not applied"],
        yue: ["{property}", "{value}", "讀唔到", "保留但唔會套用"],
    },
    "appearance.color.field.unreadable": {
        en: ["{value}", "Kept but not applied", "cannot read"],
        yue: ["{value}", "保留咗但唔會套用", "讀唔到"],
    },

    "appearance.color.field.empty": {
        en: ["Not set", "follows whatever is above it"],
        yue: ["未設定", "上一層"],
    },
    "appearance.color.field.open": {
        en: ["Edit", "{label}", "{value}"],
        yue: ["編輯", "{label}", "{value}"],
    },
    "appearance.color.field.clearHint": {
        en: ["Clear this colour", "follow"],
        yue: ["清除呢隻顏色", "上一層"],
    },

    // The write space, and the reason it was chosen. A level that keeps only "outside sRGB"
    // reads as a complaint instead of an explanation.
    "appearance.color.clipWarning": {
        en: [
            "outside sRGB",
            "{notation}",
            "nothing is lost",
            "cannot hold it would change the colour",
        ],
        yue: ["sRGB", "{notation}", "載唔起", "變樣"],
    },
    "appearance.color.notationChanged": {
        en: ["{notation}", "Saved as"],
        yue: ["{notation}", "儲存"],
    },
    // The three examples are real parser input, not decoration.
    "appearance.color.anyHint": {
        en: ["#1e88e5", "oklch(0.6 0.15 250)", "rebeccapurple"],
        yue: ["#1e88e5", "oklch(0.6 0.15 250)", "rebeccapurple"],
    },
    "appearance.color.searchSummary": {
        en: ["{shown}", "{total}", "notations"],
        yue: ["{shown}", "{total}", "表示法"],
    },
    "appearance.color.noName": { en: ["no CSS keyword"], yue: ["CSS 關鍵字"] },
    "appearance.color.clippedHint": {
        en: ["{notation}", "cannot hold this colour", "different one"],
        yue: ["{notation}", "載唔起", "另一隻色"],
    },
    "appearance.color.useNotationHint": {
        en: ["this notation", "colour itself does not change"],
        yue: ["表示法", "顏色本身唔會變"],
    },
    "appearance.color.noRows": {
        en: ["No notation", "matches that search"],
        yue: ["表示法", "符合呢個搜尋"],
    },

    // The measured ratio, the WCAG verdict, and the text size it was graded at. All three or
    // the reading cannot be acted on.
    "appearance.color.contrastOn": {
        en: ["{ratio} to 1", "{level}", "body text"],
        yue: ["{ratio} 比 1", "{level}", "正文字體"],
    },
    "appearance.color.contrastOf": {
        en: ["{ratio} to 1", "{level}", "body text"],
        yue: ["{ratio} 比 1", "{level}", "正文字體"],
    },

    "appearance.surface.searchSummary": {
        en: ["{shown}", "{total}", "settings"],
        yue: ["{shown}", "{total}", "設定"],
    },
    "appearance.surface.noMatch": {
        en: ["No surface setting", "matches that search"],
        yue: ["表面設定", "符合呢個搜尋"],
    },
    "appearance.preset.searchSummary": {
        en: ["{shown}", "{total}", "saved presets"],
        yue: ["{shown}", "{total}", "已儲存"],
    },
    // "deleted" from level 4 up is the reassurance itself, so the pinned fact is the noun
    // that has to keep appearing rather than the whole clause.
    "appearance.preset.noMatch": {
        en: ["No saved preset", "matches that search"],
        yue: ["已儲存嘅預設", "符合呢個搜尋"],
    },
    "appearance.type.searchSummary": {
        en: ["{shown}", "{total}", "settings"],
        yue: ["{shown}", "{total}", "設定"],
    },
    "appearance.type.noMatch": {
        en: ["No typography setting", "matches that search"],
        yue: ["文字設定", "符合呢個搜尋"],
    },
    "appearance.type.resetHint": { en: ["this override", "follow"], yue: ["覆寫", "上一層"] },
    "appearance.type.fontOpen": { en: ["{family}", "font"], yue: ["{family}", "字體"] },
    "appearance.type.fontSummary": {
        en: ["{shown}", "{total}", "fonts"],
        yue: ["{shown}", "{total}", "字體"],
    },
    "appearance.type.noFont": {
        en: ["No font", "matches that search"],
        yue: ["字體", "符合呢個搜尋"],
    },
    "appearance.type.boldHint": { en: ["Bold", "at least 700"], yue: ["粗體", "最少 700"] },
    // Both halves: why the list is long, and what a face without the axis does with it.
    "appearance.type.axesHint": {
        en: ["which axes a font has", "always offered", "ignores"],
        yue: ["有邊啲軸", "永遠都會列出", "無視"],
    },

    "appearance.preset.none.saved": {
        en: ["No presets saved yet", "three built-in"],
        yue: ["未儲存過任何預設", "三個內建"],
    },
    // Which preset, where its followers land, and that it does not come back.
    "appearance.preset.deleteAction": {
        en: ["{name}", "own settings", "cannot be recovered"],
        yue: ["{name}", "自己嘅設定", "無法復原"],
    },
    // How many, that it is irreversible, and what it does not take with it.
    "appearance.editor.resetAllAction": {
        en: ["{count}", "cannot be undone", "Saved presets are kept"],
        yue: ["{count}", "無法復原", "已儲存嘅預設會保留"],
    },
    "appearance.editor.resetAllHint": {
        en: ["every appearance override", "Saved presets are kept"],
        yue: ["所有外觀覆寫", "已儲存嘅預設會保留"],
    },

    "appearance.menu.noMatch": {
        en: ["No command", "matches that search"],
        yue: ["冇指令", "符合呢個搜尋"],
    },
} as const satisfies Record<
    keyof typeof APPEARANCE_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
