/**
 * The config screen's editing machinery: the regex builder behind every settings
 * search bar, the search fields themselves, the controls that render one setting, the
 * field rows wrapped around them, and the list, key-value and render-mask editors.
 *
 * One module per surface, spread into `appCopy.ts`. The screen's own furniture (its
 * tab labels, its save and revert copy, its file titles) lives elsewhere; what is here
 * is everything that explains or reports on an *edit*.
 *
 * ## Three obligations this surface has that most do not
 *
 * **The regex copy names a real engine.** `config.regex.engine` says ECMAScript
 * `RegExp` because that is literally what `regexEngine.ts` compiles with, and because
 * the same engine runs the search that consumes the pattern. `config.regex.hint.start`
 * and `.end` name flag `m` because `^` and `$` mean something different without it. A
 * builder whose dialect the user has to guess is a builder they cannot trust, so no
 * level may soften those into "regular expressions" in general.
 *
 * **A syntax error points at the quoted error, never just "invalid".** The engine's
 * own message is rendered beside these strings (a `v-alert` in the builder, the text
 * field's error slot in the search bar), so from level 3 up both `config.regex.invalid`
 * and `config.form.badPattern` say where that message is. They must never imply the
 * pattern failed for a reason nobody can read.
 *
 * **Nothing here rewrites the file to be helpful.** `config.control.colorNotHex`,
 * `config.mask.unknownShape` and `config.form.rawOnly` all report a value this build
 * cannot use, and all three promise it was left exactly as the file writes it. That
 * promise is the fact pinned at every level: an editor that quietly normalises a
 * hand-written file has edited a setting nobody opened.
 *
 * ## Tier overrides against the work list
 *
 * `config.search.builderShort` is the builder button's `.*` glyph, `config.search.regexOff`
 * is the regex toggle's accessible name (its twin `config.search.regexOn` was already
 * fixed), and `config.form.showSource` is one half of a button that says "Hide the file"
 * in its other state. All three are FIXED here: a funny level cannot restyle `.*`, and a
 * toggle whose accessible name moves between states is a toggle a screen-reader user has
 * to re-learn every press.
 *
 * `config.mask.*` is BlueMap's render mask, an ordered list of shapes limiting the area
 * rendered. It has nothing to do with masking a secret; `config.field.secret` is the only
 * credential copy in this module.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CONFIGEDITOR_VOICED = {
    /* ---------------------------------------------------------------- */
    /* One control: what it refused, and what it is showing you          */
    /* ---------------------------------------------------------------- */

    "config.control.notANumber": {
        en: [
            "That is not a number.",
            "That is not a number.",
            "That is not a number, so nothing was changed.",
            "That is not a number, so the setting was left as it was.",
            "That is not a number, and this box takes nothing else, so the setting was left exactly as it was.",
        ],
        yue: [
            "呢個唔係數字。",
            "呢個唔係數字。",
            "呢個唔係數字，所以冇改到任何嘢。",
            "呢個唔係數字，所以個設定維持原狀。",
            "呢個唔係數字，而呢格淨係收數字，所以個設定原封不動咁擺喺度。",
        ],
    },
    /*
     * Not an error. The file and the option list disagree only in spelling, because
     * `Key.parse` fills a missing namespace in, so both `{value}` and `{namespace}` have
     * to survive: without the namespace the sentence cannot explain why two different
     * strings are the same setting.
     */
    "config.control.sameKey": {
        en: [
            "The file says {value}, which BlueMap reads as this entry because a key with no namespace gets {namespace}.",
            "The file says {value}, which BlueMap reads as this entry because a key with no namespace gets {namespace}.",
            "The file says {value}. BlueMap reads that as this entry, because a key with no namespace gets {namespace}.",
            "The file says {value}, and BlueMap reads that as this entry: a key written with no namespace gets {namespace} put in front of it.",
            "The file says {value}, which is this entry under another spelling. BlueMap quietly puts {namespace} in front of any key that turns up without a namespace, so the two are one value.",
        ],
        yue: [
            "檔案寫住 {value}，BlueMap 會當佢係呢一項，因為冇 namespace 嘅 key 會補上 {namespace}。",
            "檔案寫住 {value}，BlueMap 會當佢係呢一項，因為冇 namespace 嘅 key 會補上 {namespace}。",
            "檔案寫住 {value}。BlueMap 會當佢係呢一項，因為冇 namespace 嘅 key 會補上 {namespace}。",
            "檔案寫住 {value}，BlueMap 會當佢係呢一項：冇寫 namespace 嘅 key，會喺前面補返 {namespace}。",
            "檔案寫住 {value}，其實同呢一項係同一樣嘢，不過另一種寫法。邊個 key 冇帶 namespace，BlueMap 就靜靜雞喺前面補返 {namespace}，兩邊即係同一個值。",
        ],
    },
    /*
     * The value is not in this app's list and that is not a complaint. A datapack, a mod
     * or a hand-picked resolution are all legal here, so every level says the value is
     * fine rather than merely tolerated.
     */
    "config.control.unlistedValue": {
        en: [
            "This is what the file says. It is not a value this app knows about, which is fine if a mod, a datapack or your own setup provides it.",
            "This is what the file says. It is not a value this app knows about, which is fine if a mod, a datapack or your own setup provides it.",
            "This is what the file says. It is not a value this app knows about, which is perfectly fine if a mod, a datapack or your own setup provides it.",
            "This is what the file says. It is not a value this app knows about, and that is fine: a mod, a datapack or your own setup may well provide it.",
            "This is what the file says, kept word for word. It is not a value this app knows about, and that is fine rather than alarming: a mod, a datapack or your own setup may well provide it, and this app has not met every mod there is.",
        ],
        yue: [
            "呢個係檔案入面寫嘅嘢。呢個唔係本程式識得嘅值，如果係 mod、datapack 或者你自己嘅設定提供，咁樣冇問題。",
            "呢個係檔案入面寫嘅嘢。呢個唔係本程式識得嘅值，如果係 mod、datapack 或者你自己嘅設定提供，咁樣冇問題。",
            "呢個係檔案入面寫嘅嘢。呢個唔係本程式識得嘅值，不過只要係 mod、datapack 或者你自己嘅設定提供，完全冇問題。",
            "呢個係檔案入面寫嘅嘢。呢個唔係本程式識得嘅值，但唔使驚：可能係 mod、datapack 或者你自己嘅設定提供緊。",
            "呢個係檔案入面寫嘅嘢，一隻字都冇改。呢個唔係本程式識得嘅值，但唔使驚：好可能係 mod、datapack 或者你自己嘅設定提供緊，本程式又未見過世上每一個 mod。",
        ],
    },
    /* `#7dabff` is the shape of the answer, so it is an identifier and stays put. */
    "config.control.notAColor": {
        en: [
            "Expected a hex colour such as #7dabff.",
            "Expected a hex colour such as #7dabff.",
            "Expected a hex colour, written like #7dabff.",
            "That is not a hex colour. It has to look like #7dabff.",
            "That is not a hex colour, and BlueMap reads nothing else. It has to look like #7dabff, hash and all.",
        ],
        yue: [
            "呢度要一個 hex 顏色，例如 #7dabff。",
            "呢度要一個 hex 顏色，例如 #7dabff。",
            "呢度要一個 hex 顏色，寫法好似 #7dabff 咁。",
            "呢個唔係 hex 顏色。要寫成 #7dabff 咁嘅樣先得。",
            "呢個唔係 hex 顏色，而 BlueMap 淨係識睇呢款。要寫成 #7dabff 咁嘅樣，個井號都唔可以漏。",
        ],
    },
    /*
     * A box mask with no minimum X genuinely holds -2147483648. The whole point of this
     * line is that the enormous number is not a coordinate anybody typed, so "Java" and
     * "unbounded" both stay: drop either and it reads as a corrupt file.
     */
    "config.control.sentinel": {
        en: [
            "BlueMap writes Java's largest whole number here to mean the axis is unbounded.",
            "BlueMap writes Java's largest whole number here to mean the axis is unbounded.",
            "BlueMap writes Java's largest whole number here, which means the axis is unbounded.",
            "That number is not a coordinate. BlueMap writes Java's largest whole number here to say the axis is unbounded.",
            "That number is not a coordinate anybody chose. BlueMap writes Java's largest whole number here as its way of saying the axis is unbounded, and the number is just what that happens to look like.",
        ],
        yue: [
            "BlueMap 喺呢度寫低 Java 最大嗰個整數，意思係呢條軸無限制。",
            "BlueMap 喺呢度寫低 Java 最大嗰個整數，意思係呢條軸無限制。",
            "BlueMap 喺呢度寫低 Java 最大嗰個整數，即係話呢條軸無限制。",
            "呢個數字唔係座標。BlueMap 喺呢度寫低 Java 最大嗰個整數，用嚟講呢條軸無限制。",
            "呢個數字唔係邊個揀嘅座標。BlueMap 喺呢度寫低 Java 最大嗰個整數，係佢用嚟講呢條軸無限制嘅方法，個數字大到咁誇張純粹係咁啱。",
        ],
    },
    /*
     * The colour in the file is one BlueMap will refuse. Both halves are load-bearing and
     * pull in opposite directions: the value was left untouched, *and* it will not work.
     * Dropping the first makes the app look like it rewrote the file; dropping the second
     * makes a broken setting look accepted.
     */
    "config.control.colorNotHex": {
        en: [
            "Kept exactly as the file writes it. BlueMap reads hex colours such as #7dabff, so it will refuse this one until it is changed.",
            "Kept exactly as the file writes it. BlueMap reads hex colours such as #7dabff, so it will refuse this one until it is changed.",
            "Kept exactly as the file writes it, untouched. BlueMap reads hex colours such as #7dabff, so it will refuse this one until it is changed.",
            "Kept exactly as the file writes it, because rewriting somebody's colour uninvited is worse. BlueMap reads hex colours such as #7dabff, so it will refuse this one until it is changed.",
            "Kept exactly as the file writes it, because guessing at somebody's colour and rewriting it uninvited is the bigger crime. BlueMap reads hex colours such as #7dabff and nothing else, so it will refuse this one until it is changed.",
        ],
        yue: [
            "完全照檔案原文保留。BlueMap 讀嘅係 hex 顏色，例如 #7dabff，所以未改之前佢會拒收呢個值。",
            "完全照檔案原文保留。BlueMap 讀嘅係 hex 顏色，例如 #7dabff，所以未改之前佢會拒收呢個值。",
            "完全照檔案原文保留，一個字都冇郁。BlueMap 讀嘅係 hex 顏色，例如 #7dabff，所以未改之前佢會拒收呢個值。",
            "完全照檔案原文保留，因為擅自幫人改個顏色仲衰。BlueMap 讀嘅係 hex 顏色，例如 #7dabff，所以未改之前佢會拒收呢個值。",
            "完全照檔案原文保留，因為靠估幫人改個顏色，罪名仲大。BlueMap 淨係讀 hex 顏色，例如 #7dabff，所以未改之前佢會拒收呢個值。",
        ],
    },
    /* Insertion appends rather than splicing at the caret, so every level says "the end". */
    "config.control.tokensLabel": {
        en: [
            "Placeholders this field understands. Selecting one adds it to the end.",
            "Placeholders this field understands. Selecting one adds it to the end.",
            "Placeholders this field understands. Selecting one adds it to the end of what is there.",
            "The placeholders this field understands. Selecting one adds it to the end of what is already there, not at the cursor.",
            "The placeholders this field understands, so nobody has to retype them off a comment three lines down. Selecting one adds it to the end of what is already there, not at the cursor.",
        ],
        yue: [
            "呢格識得嘅 placeholder。㩒一個就會加喺最後。",
            "呢格識得嘅 placeholder。㩒一個就會加喺最後。",
            "呢格識得嘅 placeholder。㩒一個就會加喺而家啲字嘅最後。",
            "呢格識得嘅 placeholder。㩒一個就會加喺而家啲字嘅最後，唔係加喺游標嗰度。",
            "呢格識得嘅 placeholder，唔使再由下面三行嘅註解度抄一次。㩒一個就會加喺而家啲字嘅最後，唔係加喺游標嗰度。",
        ],
    },
    "config.control.insertToken": {
        en: [
            "Add {insert}, the {label}, which prints like {example}",
            "Add {insert}, the {label}, which prints like {example}",
            "Add {insert}, which is the {label} and prints like {example}",
            "Add {insert}. That one is the {label}, and it prints like {example}",
            "Add {insert} to the end. That one is the {label}, and it comes out looking like {example}",
        ],
        yue: [
            "加入 {insert}，即係{label}，印出嚟好似 {example}",
            "加入 {insert}，即係{label}，印出嚟好似 {example}",
            "加入 {insert}，佢係{label}，印出嚟好似 {example}",
            "加入 {insert}。呢個係{label}，印出嚟好似 {example}",
            "喺最後加入 {insert}。呢個係{label}，出到嚟大概就係 {example} 咁樣",
        ],
    },
    "config.control.tokenHint": {
        en: [
            "{label}. Prints like {example}.",
            "{label}. Prints like {example}.",
            "{label}. It prints like {example}.",
            "{label}. Comes out looking like {example}.",
            "{label}. In the finished text it comes out looking like {example}.",
        ],
        yue: [
            "{label}。印出嚟好似 {example}。",
            "{label}。印出嚟好似 {example}。",
            "{label}。佢印出嚟好似 {example}。",
            "{label}。出到嚟就係 {example} 咁樣。",
            "{label}。喺完成嘅文字入面，出到嚟就係 {example} 咁樣。",
        ],
    },
    "config.control.structured": {
        en: [
            "This setting is edited by its own editor rather than a single control.",
            "This setting is edited by its own editor rather than a single control.",
            "This setting is edited by its own editor rather than by a single control.",
            "This setting is too big for a single control, so it has its own editor instead.",
            "This setting does not fit in a single control, so it has its own editor rather than being squeezed into one box.",
        ],
        yue: [
            "呢個設定要用佢自己嘅編輯器嚟改，唔係一個控制項搞掂。",
            "呢個設定要用佢自己嘅編輯器嚟改，唔係一個控制項搞掂。",
            "呢個設定要用佢自己嘅編輯器嚟改，唔係一個控制項就搞得掂。",
            "呢個設定太大，塞唔落一個控制項，所以有自己嘅編輯器。",
            "呢個設定塞唔落一個控制項度，所以佢有自己嘅編輯器，唔使硬迫入一個格仔。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* One field row: badges, state, and what a reset takes with it      */
    /* ---------------------------------------------------------------- */

    /* `{note}` is upstream's own sentence, so it is appended whole and never paraphrased. */
    "config.field.templateNote": {
        en: [
            "A freshly generated file writes {value} here. {note}",
            "A freshly generated file writes {value} here. {note}",
            "A newly generated file writes {value} here. {note}",
            "When BlueMap generates this file fresh, it writes {value} here. {note}",
            "When BlueMap writes this file from scratch, what it puts here is {value}. {note}",
        ],
        yue: [
            "全新生成嘅檔案喺呢度會寫 {value}。{note}",
            "全新生成嘅檔案喺呢度會寫 {value}。{note}",
            "新生成出嚟嘅檔案喺呢度會寫 {value}。{note}",
            "BlueMap 重新生成呢個檔案嗰陣，喺呢度會寫 {value}。{note}",
            "BlueMap 由頭寫呢個檔案嗰陣，擺喺呢個位嘅係 {value}。{note}",
        ],
    },
    "config.field.reRenderHint": {
        en: [
            "Changing this makes tiles that are already rendered wrong, so they have to be rendered again.",
            "Changing this makes tiles that are already rendered wrong, so they have to be rendered again.",
            "Changing this makes the tiles that are already rendered wrong, so they have to be rendered again.",
            "Change this and every tile that is already rendered becomes wrong, so the lot has to be rendered again.",
            "Change this and every tile that is already rendered quietly becomes a lie, so the lot has to be rendered again from scratch.",
        ],
        yue: [
            "改呢個之後，已經算好嘅圖磚會變錯，所以要再算一次。",
            "改呢個之後，已經算好嘅圖磚會變錯，所以要再算一次。",
            "改咗呢個之後，已經算好嘅圖磚會變錯，所以要再算過一次。",
            "一改呢個，已經算好嘅圖磚全部變錯，成批都要再算一次。",
            "一改呢個，已經算好嘅圖磚就變咗講大話，成批都要由頭再算一次。",
        ],
    },
    "config.field.undocumentedHint": {
        en: [
            "BlueMap reads this setting but never writes it into a generated config, so most people have never seen it.",
            "BlueMap reads this setting but never writes it into a generated config, so most people have never seen it.",
            "BlueMap reads this setting but never writes it into a generated config, so hardly anybody has seen it.",
            "BlueMap reads this setting perfectly well, but it never writes it into a generated config, so hardly anybody has seen it.",
            "BlueMap reads this setting perfectly well, but it never writes it into a generated config, so hardly anybody has ever laid eyes on it.",
        ],
        yue: [
            "BlueMap 會讀呢個設定，但從來唔會寫入生成出嚟嘅設定檔，所以好少人見過佢。",
            "BlueMap 會讀呢個設定，但從來唔會寫入生成出嚟嘅設定檔，所以好少人見過佢。",
            "BlueMap 會讀呢個設定，但從來唔會寫入生成出嚟嘅設定檔，所以幾乎冇人見過佢。",
            "BlueMap 讀得呢個設定，讀得好好，但佢從來唔會寫入生成出嚟嘅設定檔，所以幾乎冇人見過佢。",
            "BlueMap 讀得呢個設定，讀得好好，但佢從來唔會寫入生成出嚟嘅設定檔，所以幾乎冇人親眼見過佢。",
        ],
    },
    /*
     * Both consent lines are sentence fragments: the row renders "{field label}: " in
     * front of them, which is why they start lower-case and why neither may grow a
     * capital at a playful level.
     */
    "config.field.consentAccepted": {
        en: [
            "accepted, so rendering can download the files it needs.",
            "accepted, so rendering can download the files it needs.",
            "accepted, so a render can download the files it needs.",
            "accepted, so a render can go and download the files it needs.",
            "accepted, so a render can go and download the files it needs without stopping to ask again.",
        ],
        yue: [
            "已經接受，所以算圖可以下載佢需要嘅檔案。",
            "已經接受，所以算圖可以下載佢需要嘅檔案。",
            "已經接受，所以算圖可以去下載佢需要嘅檔案。",
            "已經接受咗，所以算圖可以直接去下載佢需要嘅檔案。",
            "已經接受咗，所以算圖可以直接去下載佢需要嘅檔案，唔使停低再問多次。",
        ],
    },
    /*
     * This row reports the consent state and points at the one place it is answered. It
     * must never read as a second place to accept, so "in the app's own settings" is a
     * fact at every level.
     */
    "config.field.consentMissing": {
        en: [
            "not accepted yet, so a render stops before it starts. It is answered once, in the app's own settings.",
            "not accepted yet, so a render stops before it starts. It is answered once, in the app's own settings.",
            "not accepted yet, so a render stops before it even starts. It is answered once, in the app's own settings.",
            "not accepted yet, so a render stops before it even starts. It is answered once and only once, in the app's own settings.",
            "not accepted yet, so a render gives up before it even starts. It is answered once and only once, in the app's own settings, and never here.",
        ],
        yue: [
            "重未接受，所以算圖未開始就會停低。呢個喺程式自己嘅設定入面答一次就得。",
            "重未接受，所以算圖未開始就會停低。呢個喺程式自己嘅設定入面答一次就得。",
            "重未接受，所以算圖未開始就會停低。呢個問題喺程式自己嘅設定入面答一次就得。",
            "重未接受，所以算圖仲未開始就已經停低。呢個問題喺程式自己嘅設定入面答一次就夠，唔使再答。",
            "重未接受，所以算圖仲未起步就投降。呢個問題喺程式自己嘅設定入面答一次就夠，唔會喺呢度問你。",
        ],
    },
    /*
     * Three states of one row, and the difference between them is the whole point:
     * `inherited` (in `appCopy.ts`) is not written at all, `setToDefault` is written and
     * happens to match, `changed` is written and does not. Each says which it is.
     */
    "config.field.setToDefault": {
        en: [
            "Written in the file, and the same as BlueMap's default.",
            "Written in the file, and the same as BlueMap's default.",
            "Written in the file, and it is the same as BlueMap's default.",
            "Written in the file, and it happens to be the same as BlueMap's default.",
            "Written in the file, spelled out in full, and it happens to be exactly the same as BlueMap's default anyway.",
        ],
        yue: [
            "寫咗喺檔案入面，同 BlueMap 嘅預設值一樣。",
            "寫咗喺檔案入面，同 BlueMap 嘅預設值一樣。",
            "寫咗喺檔案入面，而且同 BlueMap 嘅預設值一樣。",
            "寫咗喺檔案入面，而佢啱啱好同 BlueMap 嘅預設值一樣。",
            "寫咗喺檔案入面，一隻字都冇省，但佢啱啱好同 BlueMap 嘅預設值完全一樣。",
        ],
    },
    "config.field.changed": {
        en: [
            "Set in this file. BlueMap's default is {value}.",
            "Set in this file. BlueMap's default is {value}.",
            "Set in this file. BlueMap's own default is {value}.",
            "Set in this file, rather than left alone. BlueMap's own default is {value}.",
            "Set in this file by hand, rather than left alone. BlueMap's own default is {value}.",
        ],
        yue: [
            "呢個檔案入面set咗。BlueMap 嘅預設值係 {value}。",
            "呢個檔案入面set咗。BlueMap 嘅預設值係 {value}。",
            "呢個檔案入面set咗。BlueMap 自己嘅預設值係 {value}。",
            "呢個檔案入面set咗，唔係擺咗喺度唔郁。BlueMap 自己嘅預設值係 {value}。",
            "呢個檔案入面有人親手set咗，唔係擺咗喺度唔郁。BlueMap 自己嘅預設值係 {value}。",
        ],
    },
    /* What survives a reset matters as much as what goes: the explaining comment stays. */
    "config.field.resetHint": {
        en: [
            "Deletes the setting from the file so BlueMap falls back to its own default. The comment explaining it stays.",
            "Deletes the setting from the file so BlueMap falls back to its own default. The comment explaining it stays.",
            "Deletes the setting from the file so BlueMap falls back to its own default. The comment explaining it stays where it is.",
            "Deletes just this setting from the file, so BlueMap falls back to its own default. The comment explaining it stays where it is.",
            "Deletes just this one setting from the file, so BlueMap falls back to its own default. The comment explaining it stays where it is, so nobody has to remember what it did.",
        ],
        yue: [
            "由檔案入面刪走呢個設定，等 BlueMap 用返佢自己嘅預設值。解釋佢嘅註解會留低。",
            "由檔案入面刪走呢個設定，等 BlueMap 用返佢自己嘅預設值。解釋佢嘅註解會留低。",
            "由檔案入面刪走呢個設定，等 BlueMap 用返佢自己嘅預設值。解釋佢嘅註解會原地留低。",
            "淨係由檔案入面刪走呢個設定，等 BlueMap 用返佢自己嘅預設值。解釋佢嘅註解會原地留低。",
            "淨係由檔案入面刪走呢一個設定，等 BlueMap 用返佢自己嘅預設值。解釋佢嘅註解會原地留低，唔使你自己記返佢做過乜。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The whole-file form: search summaries, the raw editor, copying    */
    /* ---------------------------------------------------------------- */

    /*
     * The search bar renders the engine's own compile error in its error slot, right
     * under this line. From level 3 up this says so, because "not valid" on its own tells
     * a user nothing they can act on.
     */
    "config.form.badPattern": {
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
    "config.form.advancedHidden": {
        en: [
            "Showing {shown} of {total} settings. {advanced} advanced ones are hidden.",
            "Showing {shown} of {total} settings. {advanced} advanced ones are hidden.",
            "Showing {shown} of {total} settings. {advanced} advanced ones are hidden, not missing.",
            "Showing {shown} of {total} settings. The other {advanced} are advanced ones, hidden rather than missing.",
            "Showing {shown} of {total} settings. The other {advanced} are advanced ones, hidden behind the switch rather than missing.",
        ],
        yue: [
            "顯示緊 {total} 個設定入面嘅 {shown} 個。有 {advanced} 個進階設定收埋咗。",
            "顯示緊 {total} 個設定入面嘅 {shown} 個。有 {advanced} 個進階設定收埋咗。",
            "顯示緊 {total} 個設定入面嘅 {shown} 個。有 {advanced} 個進階設定收埋咗，唔係唔見咗。",
            "顯示緊 {total} 個設定入面嘅 {shown} 個。其餘 {advanced} 個係進階設定，收埋咗咋，唔係唔見咗。",
            "顯示緊 {total} 個設定入面嘅 {shown} 個。其餘 {advanced} 個係進階設定，收埋咗喺個掣後面，唔係唔見咗。",
        ],
    },
    "config.form.matches": {
        en: [
            "{shown} of {total} settings match.",
            "{shown} of {total} settings match.",
            "{shown} of {total} settings match. The rest are filtered out, not removed.",
            "{shown} of {total} settings match. The rest are filtered out rather than removed.",
            "{shown} of {total} settings match. The rest are merely filtered out, still in the file and still where they were.",
        ],
        yue: [
            "{total} 個設定入面有 {shown} 個符合。",
            "{total} 個設定入面有 {shown} 個符合。",
            "{total} 個設定入面有 {shown} 個符合。其餘嘅係篩走咗，唔係刪走咗。",
            "{total} 個設定入面有 {shown} 個符合。其餘嘅只係篩走咗，唔係刪走咗。",
            "{total} 個設定入面有 {shown} 個符合。其餘嘅只係篩走咗，全部仲喺檔案入面，原封不動。",
        ],
    },
    "config.form.copied": {
        en: [
            "Copied the file exactly as it stands.",
            "Copied the file exactly as it stands.",
            "Copied the file to the clipboard, exactly as it stands.",
            "Copied to the clipboard, exactly as the file stands, with nothing tidied up.",
            "Copied to the clipboard, exactly as the file stands: nothing tidied, nothing reordered, comments and all.",
        ],
        yue: [
            "已經原文複製咗成個檔案。",
            "已經原文複製咗成個檔案。",
            "已經原文複製咗成個檔案去剪貼簿。",
            "已經原文複製咗成個檔案去剪貼簿，冇幫佢執靚過。",
            "已經原文複製咗成個檔案去剪貼簿：冇執靚、冇調次序，連註解都照抄。",
        ],
    },
    "config.form.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "Could not reach the clipboard, so nothing was copied. The file itself is untouched.",
            "Could not reach the clipboard, so nothing was copied at all. The file itself is untouched; only the copying failed.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "去唔到剪貼簿，所以乜都冇複製到。",
            "去唔到剪貼簿，所以乜都冇複製到。個檔案本身冇郁過。",
            "去唔到剪貼簿，所以一個字都冇複製到。個檔案本身冇郁過，衰嘅淨係複製呢一步。",
        ],
    },
    /*
     * Shown when the HOCON does not parse and the raw editor is the only way out. The
     * promise that nothing was changed or reformatted is the reason a user can trust the
     * text in that box, so it survives every level intact.
     */
    "config.form.rawOnly": {
        en: [
            "The controls come back as soon as the file parses. Nothing was changed or reformatted while it does not.",
            "The controls come back as soon as the file parses. Nothing was changed or reformatted while it does not.",
            "The controls come back the moment the file parses. Nothing was changed or reformatted while it does not.",
            "The controls come back the moment the file parses again. Nothing was changed or reformatted in the meantime, not even the whitespace.",
            "The controls come back the moment the file parses again. Nothing was changed or reformatted in the meantime, not one space and not one comment, because a file that will not parse is the worst thing to start tidying.",
        ],
        yue: [
            "個檔案一讀得掂，啲控制項就會返嚟。喺呢段時間，冇改過亦冇重新排版過任何嘢。",
            "個檔案一讀得掂，啲控制項就會返嚟。喺呢段時間，冇改過亦冇重新排版過任何嘢。",
            "個檔案一讀得掂，啲控制項即刻返嚟。喺呢段時間，冇改過亦冇重新排版過任何嘢。",
            "個檔案一讀得掂，啲控制項即刻返嚟。呢段時間冇改過亦冇重新排版過任何嘢，連空格都冇郁。",
            "個檔案一讀得掂，啲控制項即刻返嚟。呢段時間冇改過亦冇重新排版過任何嘢，一個空格一句註解都冇郁，因為一個讀唔掂嘅檔案，最唔應該就係喺呢個時候幫佢執靚。",
        ],
    },
    /* An empty result is about this screen only, and the master search may still have hits. */
    "config.form.noMatches": {
        en: [
            "Nothing on this screen matches. The search across every screen may still have results.",
            "Nothing on this screen matches. The search across every screen may still have results.",
            "Nothing on this screen matches. Nothing was removed, and the search across every screen may still have results.",
            "Nothing on this screen matches. Nothing has been removed or hidden, and the search across every screen may still have results.",
            "Nothing on this screen matches, which is all it means: nothing has been removed or hidden, and the search across every screen may still have results.",
        ],
        yue: [
            "呢一版冇嘢符合。搵勻所有版嘅搜尋可能仲有結果。",
            "呢一版冇嘢符合。搵勻所有版嘅搜尋可能仲有結果。",
            "呢一版冇嘢符合。冇任何嘢俾人刪走，搵勻所有版嘅搜尋可能仲有結果。",
            "呢一版冇嘢符合。冇任何嘢俾人刪走或者收埋，搵勻所有版嘅搜尋可能仲有結果。",
            "呢一版冇嘢符合，講嘅就係咁多：冇任何嘢俾人刪走或者收埋，搵勻所有版嘅搜尋可能仲有結果。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The structured editors: key-value, list, render mask              */
    /* ---------------------------------------------------------------- */

    "config.keyValue.empty": {
        en: [
            "No properties set.",
            "No properties set.",
            "No properties set yet.",
            "No properties set here yet.",
            "No properties set here yet. Add one below when something needs it.",
        ],
        yue: [
            "冇set過任何屬性。",
            "冇set過任何屬性。",
            "重未set過任何屬性。",
            "呢度重未set過任何屬性。",
            "呢度重未set過任何屬性，有需要嘅時候喺下面加返一個。",
        ],
    },
    /*
     * A `unique` list stands in for a Java `LinkedHashSet`, where a duplicate is dropped
     * silently on load. Refusing it here and saying why beats accepting a row that would
     * evaporate on the next read, so "only one copy" and "disappear" both stay.
     */
    "config.list.duplicate": {
        en: [
            "BlueMap keeps only one copy of each entry in this list, so a duplicate would disappear the next time the file is read.",
            "BlueMap keeps only one copy of each entry in this list, so a duplicate would disappear the next time the file is read.",
            "BlueMap keeps only one copy of each entry in this list, so a duplicate would quietly disappear the next time the file is read.",
            "BlueMap keeps only one copy of each entry in this list. A duplicate would quietly disappear the next time the file is read, so it was not added.",
            "BlueMap keeps only one copy of each entry in this list. A duplicate would disappear without a word the next time the file is read, so it was not added rather than added and quietly lost.",
        ],
        yue: [
            "BlueMap 喺呢個清單入面，每個項目淨係留一份，所以重複嗰個下次讀檔案嗰陣就會唔見咗。",
            "BlueMap 喺呢個清單入面，每個項目淨係留一份，所以重複嗰個下次讀檔案嗰陣就會唔見咗。",
            "BlueMap 喺呢個清單入面，每個項目淨係留一份，所以重複嗰個下次讀檔案嗰陣就會靜靜雞唔見咗。",
            "BlueMap 喺呢個清單入面，每個項目淨係留一份。重複嗰個下次讀檔案嗰陣就會唔見咗，所以呢次冇加入去。",
            "BlueMap 喺呢個清單入面，每個項目淨係留一份。重複嗰個下次讀檔案嗰陣會一聲不響咁唔見咗，所以寧願而家唔加，好過加咗之後靜靜雞消失。",
        ],
    },
    "config.list.empty": {
        en: [
            "Nothing in this list yet.",
            "Nothing in this list yet.",
            "There is nothing in this list yet.",
            "Nothing in this list yet. Add the first entry below.",
            "Nothing in this list yet, which is a perfectly valid list to have. Add the first entry below.",
        ],
        yue: [
            "呢個清單重未有嘢。",
            "呢個清單重未有嘢。",
            "呢個清單而家重未有嘢。",
            "呢個清單重未有嘢，喺下面加第一項啦。",
            "呢個清單重未有嘢，其實空清單都完全合法。喺下面加第一項啦。",
        ],
    },
    "config.mask.empty": {
        en: [
            "No mask, so the whole world is rendered. Add a shape to limit it.",
            "No mask, so the whole world is rendered. Add a shape to limit it.",
            "No mask at all, so the whole world is rendered. Add a shape to limit it.",
            "No mask at all, so the whole world is rendered, every last chunk. Add a shape to limit it.",
            "No mask at all, so the whole world is rendered, every last chunk of it. Add a shape if you would rather it stopped somewhere.",
        ],
        yue: [
            "冇遮罩，所以成個世界都會算。加個形狀就可以限制範圍。",
            "冇遮罩，所以成個世界都會算。加個形狀就可以限制範圍。",
            "完全冇遮罩，所以成個世界都會算。加個形狀就可以限制範圍。",
            "完全冇遮罩，所以成個世界都會算，一個 chunk 都唔會漏。加個形狀就可以限制範圍。",
            "完全冇遮罩，所以成個世界都會算，一個 chunk 都唔會漏。想佢喺某個位停低嘅話，加個形狀啦。",
        ],
    },
    /*
     * A shape from a newer BlueMap, or a typo. Either way the row is left verbatim and the
     * user is told how to replace it: `{type}` is the file's own text, and "left exactly
     * as it is" is the promise that this editor did not quietly drop a key it did not
     * recognise.
     */
    "config.mask.unknownShape": {
        en: [
            'This file names a shape called "{type}", which this build does not know about. It is left exactly as it is; pick a shape above to replace it.',
            'This file names a shape called "{type}", which this build does not know about. It is left exactly as it is; pick a shape above to replace it.',
            'This file names a shape called "{type}", which this build has never heard of. It is left exactly as it is; pick a shape above to replace it.',
            'This file names a shape called "{type}", which this build has never heard of. Nothing was guessed at: it is left exactly as it is, and picking a shape above is what replaces it.',
            'This file names a shape called "{type}", which this build has never heard of and will not pretend to. Nothing was guessed at: it is left exactly as it is, and picking a shape above is what replaces it.',
        ],
        yue: [
            '呢個檔案寫住一個叫 "{type}" 嘅形狀，呢個版本唔識佢。佢會原封不動咁留低；喺上面揀個形狀就可以換走佢。',
            '呢個檔案寫住一個叫 "{type}" 嘅形狀，呢個版本唔識佢。佢會原封不動咁留低；喺上面揀個形狀就可以換走佢。',
            '呢個檔案寫住一個叫 "{type}" 嘅形狀，呢個版本從來冇聽過。佢會原封不動咁留低；喺上面揀個形狀就可以換走佢。',
            '呢個檔案寫住一個叫 "{type}" 嘅形狀，呢個版本從來冇聽過。呢度冇靠估：佢原封不動咁留低，要換走就喺上面揀個形狀。',
            '呢個檔案寫住一個叫 "{type}" 嘅形狀，呢個版本從來冇聽過，亦唔會扮識。呢度冇靠估：佢原封不動咁留低，要換走就喺上面揀個形狀。',
        ],
    },
    /*
     * Two facts people get wrong about masks, and they are worth more than the joke:
     * order is the semantics, and editing the mask does not cost a full re-render. The
     * second one decides whether somebody dares touch this editor at all.
     */
    "config.mask.orderNote": {
        en: [
            "Shapes combine from top to bottom. Changing the mask does not force a full re-render: BlueMap updates the map and deletes tiles that fall outside the new limits.",
            "Shapes combine from top to bottom. Changing the mask does not force a full re-render: BlueMap updates the map and deletes tiles that fall outside the new limits.",
            "Shapes combine from top to bottom, in the order shown. Changing the mask does not force a full re-render: BlueMap updates the map and deletes tiles that fall outside the new limits.",
            "Shapes combine from top to bottom, in the order shown here. Changing the mask does not force a full re-render: BlueMap updates the map and deletes tiles that fall outside the new limits.",
            "Shapes combine from top to bottom, in exactly the order shown here, so moving a row changes the answer. Changing the mask does not force a full re-render either: BlueMap updates the map and deletes tiles that fall outside the new limits.",
        ],
        yue: [
            "啲形狀由上到下逐個疊。改遮罩唔會逼你成個重算：BlueMap 會更新張地圖，同埋刪走跌出新範圍嘅圖磚。",
            "啲形狀由上到下逐個疊。改遮罩唔會逼你成個重算：BlueMap 會更新張地圖，同埋刪走跌出新範圍嘅圖磚。",
            "啲形狀由上到下逐個疊，次序就係畫面上嘅次序。改遮罩唔會逼你成個重算：BlueMap 會更新張地圖，同埋刪走跌出新範圍嘅圖磚。",
            "啲形狀由上到下逐個疊，次序就係呢度顯示嘅次序。改遮罩唔會逼你成個重算：BlueMap 會更新張地圖，同埋刪走跌出新範圍嘅圖磚。",
            "啲形狀由上到下逐個疊，次序就係呢度顯示嘅次序，所以搬一行就會改變結果。改遮罩亦唔會逼你成個重算：BlueMap 會更新張地圖，同埋刪走跌出新範圍嘅圖磚。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The regex builder                                                 */
    /* ---------------------------------------------------------------- */

    /*
     * `^` and `$` mean the whole text without flag `m` and each line with it, which is the
     * single most common way a settings search surprises somebody. The flag is named by
     * its letter in both languages, because that is what the chip beside it says.
     */
    "config.regex.hint.start": {
        en: [
            "start of text, or of a line with flag m",
            "start of text, or of a line with flag m",
            "start of the text, or of a line with flag m",
            "the start of the text, or the start of a line when flag m is on",
            "the very start of the text, or the start of each line once flag m is on",
        ],
        yue: [
            "文字開頭，或者開咗 flag m 之後每行嘅開頭",
            "文字開頭，或者開咗 flag m 之後每行嘅開頭",
            "成段文字嘅開頭，或者開咗 flag m 之後每行嘅開頭",
            "成段文字嘅開頭；開咗 flag m 之後，就係每一行嘅開頭",
            "成段文字最頭嗰個位；一開咗 flag m，就變成每一行嘅開頭",
        ],
    },
    "config.regex.hint.end": {
        en: [
            "end of text, or of a line with flag m",
            "end of text, or of a line with flag m",
            "end of the text, or of a line with flag m",
            "the end of the text, or the end of a line when flag m is on",
            "the very end of the text, or the end of each line once flag m is on",
        ],
        yue: [
            "文字結尾，或者開咗 flag m 之後每行嘅結尾",
            "文字結尾，或者開咗 flag m 之後每行嘅結尾",
            "成段文字嘅結尾，或者開咗 flag m 之後每行嘅結尾",
            "成段文字嘅結尾；開咗 flag m 之後，就係每一行嘅結尾",
            "成段文字最尾嗰個位；一開咗 flag m，就變成每一行嘅結尾",
        ],
    },
    "config.regex.hint.or": {
        en: [
            "match the left side or the right side",
            "match the left side or the right side",
            "matches the left side or the right side",
            "matches whichever of the left side and the right side fits",
            "matches the left side or the right side, whichever fits first",
        ],
        yue: [
            "配對左邊或者右邊",
            "配對左邊或者右邊",
            "配對得左邊或者右邊",
            "左邊同右邊，邊邊啱就配對邊邊",
            "配對左邊或者右邊，邊個先啱就用邊個",
        ],
    },
    "config.regex.copied": {
        en: [
            "Copied {what} exactly as it is written.",
            "Copied {what} exactly as it is written.",
            "Copied {what} to the clipboard, exactly as it is written.",
            "Copied {what} to the clipboard, exactly as it is written, with nothing escaped or tidied.",
            "Copied {what} to the clipboard exactly as it is written, with nothing escaped, trimmed or tidied on the way out.",
        ],
        yue: [
            "已經原文複製咗 {what}。",
            "已經原文複製咗 {what}。",
            "已經原文複製咗 {what} 去剪貼簿。",
            "已經原文複製咗 {what} 去剪貼簿，冇幫佢加 escape，亦冇執靚。",
            "已經原文複製咗 {what} 去剪貼簿，出去嗰陣冇加 escape、冇剪頭剪尾、亦冇執靚。",
        ],
    },
    /*
     * Same failure as `config.form.copyFailed`, different room: this one names the pattern
     * and flags, because in the builder the obvious fear is that a failed copy took the
     * pattern with it.
     */
    "config.regex.copyFailed": {
        en: [
            "Could not reach the clipboard.",
            "Could not reach the clipboard.",
            "Could not reach the clipboard, so nothing was copied.",
            "Could not reach the clipboard, so nothing was copied. The pattern and flags are unchanged.",
            "Could not reach the clipboard, so nothing was copied anywhere. The pattern and flags are unchanged; only the copying failed.",
        ],
        yue: [
            "去唔到剪貼簿。",
            "去唔到剪貼簿。",
            "去唔到剪貼簿，所以乜都冇複製到。",
            "去唔到剪貼簿，所以乜都冇複製到。個 pattern 同啲 flags 冇改過。",
            "去唔到剪貼簿，所以邊度都冇複製到。個 pattern 同啲 flags 冇改過，衰嘅淨係複製呢一步。",
        ],
    },
    /*
     * The dialect line, and the one entry in this module that names an engine. It is not
     * decoration: `regexEngine.ts` compiles with the host runtime's own `RegExp`, and the
     * same compiler runs the search that consumes the pattern, so the preview cannot
     * disagree with the results. Local evaluation is the security half, and no level may
     * soften "Nothing is sent anywhere" into a vaguer promise.
     */
    "config.regex.engine": {
        en: [
            "ECMAScript RegExp, the same engine the search itself runs, evaluated on this machine. Nothing is sent anywhere.",
            "ECMAScript RegExp, the same engine the search itself runs, evaluated on this machine. Nothing is sent anywhere.",
            "ECMAScript RegExp, the same engine the search itself runs, evaluated here on this machine. Nothing is sent anywhere.",
            "ECMAScript RegExp, the very engine the search itself runs, evaluated here on this machine. Nothing is sent anywhere, so the pattern and the sample never leave.",
            "ECMAScript RegExp, the very engine the search itself runs, so the preview cannot disagree with the results. Evaluated here on this machine. Nothing is sent anywhere, and the pattern and the sample never leave the room.",
        ],
        yue: [
            "ECMAScript RegExp，同搜尋本身用嘅係同一個引擎，喺你部機度計。乜都唔會送去任何地方。",
            "ECMAScript RegExp，同搜尋本身用嘅係同一個引擎，喺你部機度計。乜都唔會送去任何地方。",
            "ECMAScript RegExp，同搜尋本身用嘅係同一個引擎，就喺你部機度計。乜都唔會送去任何地方。",
            "ECMAScript RegExp，同搜尋本身用嘅正正係同一個引擎，就喺你部機度計。乜都唔會送去任何地方，個 pattern 同啲樣本都唔會走出去。",
            "ECMAScript RegExp，同搜尋本身用嘅正正係同一個引擎，所以預覽同結果唔會夾唔埋。全部喺你部機度計。乜都唔會送去任何地方，個 pattern 同啲樣本連門口都唔會過。",
        ],
    },
    "config.regex.noPattern": {
        en: [
            "No pattern yet.",
            "No pattern yet.",
            "No pattern yet, so nothing is being matched.",
            "No pattern yet, so nothing is being matched. Type one above, or pick a piece from the buttons.",
            "No pattern yet, so nothing is being matched. Type one above, or build it out of the buttons and let them do the escaping.",
        ],
        yue: [
            "重未有 pattern。",
            "重未有 pattern。",
            "重未有 pattern，所以冇嘢配對緊。",
            "重未有 pattern，所以冇嘢配對緊。喺上面打一個，或者㩒啲掣揀一忽。",
            "重未有 pattern，所以冇嘢配對緊。喺上面打一個，或者㩒啲掣砌返出嚟，啲 escape 就交返俾佢哋搞。",
        ],
    },
    /* The engine's own compile error is rendered in the alert directly above this line. */
    "config.regex.invalid": {
        en: [
            "The pattern is not valid, so nothing matches.",
            "The pattern is not valid, so nothing matches.",
            "The pattern is not valid, so nothing matches. The message above quotes what is wrong with it.",
            "The pattern is not valid, so nothing matches. The message above quotes exactly what is wrong with it.",
            "The pattern is not valid, so nothing matches rather than something wrong. The message above quotes exactly what the engine objected to.",
        ],
        yue: [
            "個 pattern 唔合法，所以冇嘢配對到。",
            "個 pattern 唔合法，所以冇嘢配對到。",
            "個 pattern 唔合法，所以冇嘢配對到。上面嗰句會引返錯喺邊。",
            "個 pattern 唔合法，所以冇嘢配對到。上面嗰句會原文引返錯咗啲乜。",
            "個 pattern 唔合法，所以寧願冇嘢配對到，好過配錯嘢。上面嗰句會原文引返引擎唔收嘅地方。",
        ],
    },
    /*
     * A partial result, not a failure. The count beside it is real but incomplete, so from
     * level 3 up the line says so: a truncated count read as a total is worse than no
     * count at all.
     */
    "config.regex.timedOut": {
        en: [
            "(stopped after {ms} ms: the pattern is too slow)",
            "(stopped after {ms} ms: the pattern is too slow)",
            "(stopped after {ms} ms: the pattern is too slow, so the count is partial)",
            "(stopped after {ms} ms: the pattern is too slow, so what is listed is only what it found in that time)",
            "(stopped after {ms} ms, because the pattern is too slow to let run: what is listed is only what it found in that time)",
        ],
        yue: [
            "（行咗 {ms} ms 之後停低：呢個 pattern 太慢）",
            "（行咗 {ms} ms 之後停低：呢個 pattern 太慢）",
            "（行咗 {ms} ms 之後停低：呢個 pattern 太慢，所以個數字唔齊）",
            "（行咗 {ms} ms 之後停低：呢個 pattern 太慢，列出嚟嘅只係喺呢段時間搵到嗰啲）",
            "（行咗 {ms} ms 之後停低，因為呢個 pattern 太慢，慢到唔可以由得佢行落去：列出嚟嘅只係喺呢段時間搵到嗰啲）",
        ],
    },
    /* Four numbers straight out of `regexEngine.ts`. All four are facts; none may be rounded. */
    "config.regex.limits": {
        en: [
            "Limits: {pattern} characters of pattern, {sample} of sample, {matches} matches, {ms} ms per run.",
            "Limits: {pattern} characters of pattern, {sample} of sample, {matches} matches, {ms} ms per run.",
            "Limits: {pattern} characters of pattern, {sample} characters of sample, {matches} matches, {ms} ms per run.",
            "The limits here: {pattern} characters of pattern, {sample} characters of sample, {matches} matches, {ms} ms per run.",
            "The limits here, so a runaway pattern cannot take the window down with it: {pattern} characters of pattern, {sample} characters of sample, {matches} matches, {ms} ms per run.",
        ],
        yue: [
            "限制：pattern {pattern} 個字元、樣本 {sample} 個、{matches} 個配對、每次行 {ms} ms。",
            "限制：pattern {pattern} 個字元、樣本 {sample} 個、{matches} 個配對、每次行 {ms} ms。",
            "限制：pattern {pattern} 個字元、樣本 {sample} 個字元、{matches} 個配對、每次行 {ms} ms。",
            "呢度嘅限制：pattern {pattern} 個字元、樣本 {sample} 個字元、{matches} 個配對、每次行 {ms} ms。",
            "呢度嘅限制，唔想一個癲咗嘅 pattern 拖埋成個視窗落水：pattern {pattern} 個字元、樣本 {sample} 個字元、{matches} 個配對、每次行 {ms} ms。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* History, and the search bar's own toggle                          */
    /* ---------------------------------------------------------------- */

    "config.history.noFolder": {
        en: [
            "History follows a folder. Save this config set to one first.",
            "History follows a folder. Save this config set to one first.",
            "History follows a folder. Save this config set to one first, and the history starts from there.",
            "History follows a folder, and this config set has not been saved to one yet. Save it first and the history starts from there.",
            "History follows a folder, and this config set has not been saved to one yet, so there is nothing yet to keep a history of. Save it first and the history starts from there.",
        ],
        yue: [
            "歷史記錄係跟住一個資料夾行嘅。請先將呢套設定儲存去一個資料夾。",
            "歷史記錄係跟住一個資料夾行嘅。請先將呢套設定儲存去一個資料夾。",
            "歷史記錄係跟住一個資料夾行嘅。先將呢套設定儲存去一個資料夾，歷史就會由嗰度開始。",
            "歷史記錄係跟住一個資料夾行嘅，而呢套設定重未儲存過去任何一個。儲存咗先，歷史就會由嗰度開始。",
            "歷史記錄係跟住一個資料夾行嘅，而呢套設定重未儲存過去任何一個，所以而家根本冇嘢可以記。儲存咗先，歷史就會由嗰度開始。",
        ],
    },
    /*
     * Turning regex off must not rewrite what the user typed. The query stays literal,
     * character for character, and that promise is what makes the toggle safe to press
     * mid-search, so it is pinned at every level.
     */
    "config.search.regexOffHint": {
        en: [
            "Back to plain text. The query stays exactly as typed.",
            "Back to plain text. The query stays exactly as typed.",
            "Back to plain text. The query stays exactly as typed, character for character.",
            "Back to plain text search. The query stays exactly as typed, character for character; nothing is escaped or rewritten.",
            "Back to plain text search. The query stays exactly as typed, character for character, because rewriting somebody's pattern behind their back is how a search bar loses their trust.",
        ],
        yue: [
            "轉返做純文字搜尋。你打嘅字會照原樣保留。",
            "轉返做純文字搜尋。你打嘅字會照原樣保留。",
            "轉返做純文字搜尋。你打嘅字會照原樣保留，一個字元都唔會少。",
            "轉返做純文字搜尋。你打嘅字會照原樣保留，一個字元都唔會少，唔會幫你加 escape 或者改寫。",
            "轉返做純文字搜尋。你打嘅字會照原樣保留，一個字元都唔會少，因為喺人哋背後改佢個 pattern，就係搜尋列點樣失信於人。",
        ],
    },
    "config.search.regexOnHint": {
        en: [
            "Treat the query as a regular expression.",
            "Treat the query as a regular expression.",
            "Treat the query as an ECMAScript regular expression.",
            "Treat the query as an ECMAScript regular expression, the same dialect the builder previews.",
            "Treat the query as an ECMAScript regular expression, the same dialect the builder previews, and let the pattern do the work.",
        ],
        yue: [
            "當你打嘅嘢係一個正規表達式。",
            "當你打嘅嘢係一個正規表達式。",
            "當你打嘅嘢係一個 ECMAScript 正規表達式。",
            "當你打嘅嘢係一個 ECMAScript 正規表達式，同 builder 預覽緊嗰個方言一樣。",
            "當你打嘅嘢係一個 ECMAScript 正規表達式，同 builder 預覽緊嗰個方言一樣，之後就交返個 pattern 做嘢。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CONFIGEDITOR_FIXED = {
    /* One control's own affordances. */
    "config.control.noLimit": { en: "No limit", yue: "冇限制" },
    "config.control.removeLimit": { en: "Remove this limit", yue: "拎走呢個限制" },

    /*
     * The badges above a field row. `config.field.secret` marks a setting whose value is
     * masked in the interface, kept out of the search corpus, and never written to a log
     * or an exported diagnostic; the note explaining that lives in `appCopy.ts` as
     * `config.keyValue.secretNote`, so this is only the badge that points at it.
     */
    "config.field.reRender": { en: "Re-render", yue: "要重算" },
    "config.field.advanced": { en: "Advanced", yue: "進階" },
    "config.field.undocumented": { en: "Not in the generated file", yue: "唔會出現喺生成嘅檔案" },
    "config.field.secret": { en: "Credential", yue: "憑證" },
    "config.field.openConsent": { en: "Open the download setting", yue: "打開下載設定" },
    "config.field.less": { en: "Show less", yue: "顯示少啲" },
    "config.field.more": { en: "Show the rest of the explanation", yue: "睇埋其餘嘅說明" },
    /* Substituted into "Not set in this file, so BlueMap uses {value}", hence lower-case. */
    "config.field.nothing": { en: "nothing", yue: "冇嘢" },
    "config.field.reset": { en: "Remove this line", yue: "刪走呢一行" },

    /* The whole-file form's toolbar. */
    "config.form.raw": { en: "File text", yue: "檔案原文" },
    "config.form.search": { en: "Search these settings", yue: "搜尋呢啲設定" },
    "config.form.searchHint": {
        en: "name, key or anything in the explanation",
        yue: "名、key，或者說明入面任何字",
    },
    "config.form.advanced": { en: "Show advanced settings", yue: "顯示進階設定" },
    /*
     * Two states of one button, so both are fixed. "as it will be written" is the point of
     * the second: the panel shows the text that would land on disk, not a prettified copy.
     */
    "config.form.hideSource": { en: "Hide the file", yue: "收埋個檔案" },
    "config.form.showSource": {
        en: "Show the file as it will be written",
        yue: "睇下個檔案寫出嚟會係點",
    },
    "config.form.copy": { en: "Copy", yue: "複製" },
    "config.form.errorCount": { en: "{n} problems", yue: "{n} 個問題" },

    /* The key-value editor. `{key}` is the property's own name and stays exact. */
    "config.keyValue.remove": { en: "Remove {key}", yue: "刪走 {key}" },
    "config.keyValue.newKey": { en: "New {key}", yue: "新嘅{key}" },
    "config.keyValue.add": { en: "Add", yue: "加入" },

    /*
     * `{item}` is the row's own label plus its position, and it is the whole accessible
     * name of an icon button: without it every row announces the same thing and a screen
     * reader cannot tell them apart.
     */
    "config.list.moveUp": { en: "Move {item} up", yue: "將 {item} 移上" },
    "config.list.moveDown": { en: "Move {item} down", yue: "將 {item} 移落" },
    "config.list.remove": { en: "Remove {item}", yue: "刪走 {item}" },
    "config.list.removeHint": { en: "Remove this entry", yue: "刪走呢一項" },
    "config.list.add": { en: "Add {item}", yue: "加一個 {item}" },

    /* The render mask's rows. `{shape}` is the shape's own name. */
    "config.mask.subtracts": { en: "{shape}, subtracted", yue: "{shape}，減走" },
    "config.mask.moveUp": { en: "Move this shape earlier", yue: "將呢個形狀移前" },
    "config.mask.moveDown": { en: "Move this shape later", yue: "將呢個形狀移後" },
    "config.mask.remove": { en: "Remove this shape", yue: "刪走呢個形狀" },
    "config.mask.shape": { en: "Shape", yue: "形狀" },
    "config.mask.subtract": { en: "Subtract instead of add", yue: "減走，唔係加上" },
    "config.mask.add": { en: "Add a shape", yue: "加個形狀" },

    /* The screen's notification strip. */
    "config.notices.region": { en: "Notifications", yue: "通知" },
    "config.notices.detail": { en: "Details", yue: "詳情" },
    "config.notices.dismiss": { en: "Dismiss this notification", yue: "關咗呢個通知" },
    "config.notices.dismissAll": { en: "Dismiss all", yue: "全部關咗" },

    /*
     * The builder's token palette. Each hint is rendered as `${token}: ${hint}`, so these
     * describe the token beside them and read as fragments rather than sentences. They
     * describe ECMAScript behaviour, because that is the dialect this build compiles.
     */
    "config.regex.group.classes": { en: "Character classes", yue: "字元類別" },
    "config.regex.hint.set": { en: "any one of these characters", yue: "呢啲字元入面任何一個" },
    "config.regex.hint.notSet": { en: "any character except these", yue: "除咗呢啲之外任何字元" },
    "config.regex.hint.digit": { en: "any digit", yue: "任何數字" },
    "config.regex.hint.word": { en: "any word character", yue: "任何 word 字元" },
    "config.regex.hint.space": { en: "any whitespace", yue: "任何空白字元" },
    "config.regex.hint.any": {
        en: "any character except a line break",
        yue: "除咗換行之外任何字元",
    },
    "config.regex.group.anchors": { en: "Anchors", yue: "錨點" },
    "config.regex.hint.boundary": { en: "word boundary", yue: "字詞邊界" },
    "config.regex.hint.notBoundary": { en: "not a word boundary", yue: "唔係字詞邊界" },
    "config.regex.group.groups": { en: "Groups", yue: "群組" },
    "config.regex.hint.capture": { en: "capturing group", yue: "會擷取嘅群組" },
    "config.regex.hint.noCapture": { en: "group without capturing", yue: "唔擷取嘅群組" },
    "config.regex.hint.named": { en: "named capturing group", yue: "有名嘅擷取群組" },
    /* Group 1 specifically, because the button beside it inserts `\1` and nothing else. */
    "config.regex.hint.backref": { en: "back-reference to group 1", yue: "反向參照第 1 個群組" },
    "config.regex.hint.lookahead": { en: "followed by", yue: "後面跟住" },
    "config.regex.hint.negLookahead": { en: "not followed by", yue: "後面唔跟住" },
    "config.regex.group.alternation": { en: "Alternation", yue: "二擇其一" },
    "config.regex.group.quantifiers": { en: "Quantifiers", yue: "數量詞" },
    "config.regex.hint.star": { en: "zero or more", yue: "零個或以上" },
    "config.regex.hint.plus": { en: "one or more", yue: "一個或以上" },
    "config.regex.hint.opt": { en: "zero or one", yue: "零個或者一個" },
    /* The button inserts `{2,5}`, so the hint names those two numbers and not a range in general. */
    "config.regex.hint.range": { en: "between two and five", yue: "兩個至五個" },
    "config.regex.hint.lazy": {
        en: "zero or more, as few as possible",
        yue: "零個或以上，愈少愈好",
    },

    /* The builder's own furniture. */
    "config.regex.title": { en: "Regex builder", yue: "Regex 建構器" },
    /* `Pattern` and `Flags` are also copied as `{what}` into `config.regex.copied`. */
    "config.regex.pattern": { en: "Pattern", yue: "Pattern（式樣）" },
    "config.regex.flags": { en: "Flags", yue: "Flags（旗標）" },
    "config.regex.group.literals": { en: "Literals", yue: "字面文字" },
    "config.regex.escape": { en: "Escape the selection", yue: "幫揀咗嘅字加 escape" },
    "config.regex.sample": { en: "Sample text", yue: "樣本文字" },
    "config.regex.matchCount": {
        en: "{count} matches in the sample",
        yue: "樣本入面有 {count} 個配對",
    },
    "config.regex.truncated": { en: "(stopped at {max})", yue: "（去到 {max} 就停）" },
    "config.regex.sampleCut": {
        en: "(only the first {n} characters were scanned)",
        yue: "（淨係掃咗頭 {n} 個字元）",
    },
    /* A real match of zero width, not a missing one, so it is labelled rather than left blank. */
    "config.regex.empty": { en: "(empty match)", yue: "（空白配對）" },
    "config.regex.namedGroups": { en: "Named groups", yue: "有名嘅群組" },
    "config.regex.copyPattern": { en: "Copy the pattern", yue: "複製個 pattern" },
    "config.regex.copyFlags": { en: "Copy the flags", yue: "複製啲 flags" },

    "config.history.tab": { en: "History", yue: "歷史記錄" },

    /*
     * The search bar's buttons. `regexOff` and `regexOn` are the two accessible names of
     * one toggle and `builderShort` is the `.*` glyph printed on the builder button, so
     * all three are fixed: a control whose name moves between presses is a control that
     * has to be re-learned each time, and `.*` is a pattern rather than prose.
     */
    "config.search.clear": { en: "Clear the search", yue: "清走搜尋內容" },
    "config.search.regexOff": {
        en: "Search plain text instead of a regular expression",
        yue: "用純文字搜尋，唔用正規表達式",
    },
    "config.search.regexOn": { en: "Search with a regular expression", yue: "用正規表達式搜尋" },
    "config.search.builder": { en: "Open the regex builder", yue: "打開 regex 建構器" },
    "config.search.builderShort": { en: ".*", yue: ".*" },
} as const satisfies Record<string, FixedString>;

export const CONFIGEDITOR_FACTS = {
    "config.control.notANumber": { en: ["not a number"], yue: ["唔係數字"] },
    // Without the namespace the sentence cannot say why two spellings are one value.
    "config.control.sameKey": {
        en: ["{value}", "{namespace}", "BlueMap"],
        yue: ["{value}", "{namespace}", "BlueMap"],
    },
    "config.control.unlistedValue": {
        en: ["not a value this app knows about", "mod", "datapack"],
        yue: ["唔係本程式識得嘅值", "mod", "datapack"],
    },
    "config.control.notAColor": { en: ["hex colour", "#7dabff"], yue: ["hex 顏色", "#7dabff"] },
    "config.control.sentinel": {
        en: ["Java", "largest whole number", "unbounded"],
        yue: ["Java", "最大嗰個整數", "無限制"],
    },
    // Untouched *and* unusable: dropping either half misreports what happened.
    "config.control.colorNotHex": {
        en: ["exactly as the file writes it", "#7dabff", "refuse"],
        yue: ["照檔案原文保留", "#7dabff", "拒收"],
    },
    "config.control.tokensLabel": { en: ["to the end"], yue: ["最後"] },
    "config.control.insertToken": {
        en: ["{insert}", "{label}", "{example}"],
        yue: ["{insert}", "{label}", "{example}"],
    },
    "config.control.tokenHint": { en: ["{label}", "{example}"], yue: ["{label}", "{example}"] },
    "config.control.structured": { en: ["its own editor"], yue: ["自己嘅編輯器"] },

    "config.field.templateNote": { en: ["{value}", "{note}"], yue: ["{value}", "{note}"] },
    "config.field.reRenderHint": { en: ["already rendered", "again"], yue: ["已經算好", "再算"] },
    "config.field.undocumentedHint": {
        en: ["BlueMap reads this setting", "never writes it into a generated config"],
        yue: ["BlueMap", "從來唔會寫入生成出嚟嘅設定檔"],
    },
    "config.field.consentAccepted": { en: ["accepted", "download"], yue: ["接受", "下載"] },
    // Answered once, elsewhere: this row must never read as a second place to accept.
    "config.field.consentMissing": {
        en: ["not accepted yet", "app's own settings"],
        yue: ["重未接受", "設定"],
    },
    "config.field.setToDefault": {
        en: ["Written in the file", "default"],
        yue: ["寫咗喺檔案入面", "預設值"],
    },
    "config.field.changed": { en: ["{value}", "default"], yue: ["{value}", "預設值"] },
    // What a reset removes, and what it leaves behind.
    "config.field.resetHint": {
        en: ["Deletes", "own default", "comment explaining it stays"],
        yue: ["刪走呢", "預設值", "註解"],
    },

    "config.form.badPattern": {
        en: ["not valid", "nothing is shown"],
        yue: ["唔合法", "唔會顯示"],
    },
    "config.form.advancedHidden": {
        en: ["{shown}", "{total}", "{advanced}", "hidden"],
        yue: ["{shown}", "{total}", "{advanced}", "收埋"],
    },
    "config.form.matches": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "config.form.copied": { en: ["exactly", "file"], yue: ["原文", "檔案"] },
    "config.form.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },
    // The reason the text in the raw box can be trusted.
    "config.form.rawOnly": {
        en: ["Nothing was changed or reformatted", "parses"],
        yue: ["冇改過亦冇重新排版過任何嘢", "讀得掂"],
    },
    "config.form.noMatches": {
        en: ["screen matches", "every screen"],
        yue: ["呢一版冇嘢符合", "所有版"],
    },

    "config.keyValue.empty": { en: ["No properties set"], yue: ["屬性"] },
    "config.list.duplicate": {
        en: ["only one copy", "disappear"],
        yue: ["淨係留一份", "唔見咗"],
    },
    "config.list.empty": { en: ["in this list yet"], yue: ["重未有嘢"] },
    "config.mask.empty": { en: ["whole world", "Add a shape"], yue: ["成個世界", "形狀"] },
    // The file's own spelling, and the promise that this editor did not touch it.
    "config.mask.unknownShape": {
        en: ["{type}", "left exactly as it is"],
        yue: ["{type}", "原封不動"],
    },
    "config.mask.orderNote": {
        en: ["top to bottom", "does not force a full re-render", "deletes tiles"],
        yue: ["由上到下", "唔會逼你成個重算", "刪走"],
    },

    // The flag that decides what `^` and `$` even mean.
    "config.regex.hint.start": { en: ["flag m", "start"], yue: ["flag m", "開頭"] },
    "config.regex.hint.end": { en: ["flag m", "end"], yue: ["flag m", "結尾"] },
    "config.regex.hint.or": { en: ["left side", "right side"], yue: ["左邊", "右邊"] },
    "config.regex.copied": {
        en: ["{what}", "exactly as it is written"],
        yue: ["{what}", "原文複製"],
    },
    "config.regex.copyFailed": { en: ["clipboard"], yue: ["剪貼簿"] },
    // The engine by name, and the promise that evaluation stays on this machine.
    "config.regex.engine": {
        en: ["ECMAScript RegExp", "Nothing is sent anywhere"],
        yue: ["ECMAScript RegExp", "唔會送去任何地方"],
    },
    "config.regex.noPattern": { en: ["No pattern yet"], yue: ["重未有 pattern"] },
    "config.regex.invalid": { en: ["not valid", "nothing matches"], yue: ["唔合法", "配對到"] },
    "config.regex.timedOut": {
        en: ["{ms} ms", "stopped after", "too slow"],
        yue: ["{ms} ms", "停低", "太慢"],
    },
    "config.regex.limits": {
        en: ["{pattern}", "{sample}", "{matches}", "{ms}"],
        yue: ["{pattern}", "{sample}", "{matches}", "{ms}"],
    },

    "config.history.noFolder": { en: ["folder"], yue: ["資料夾"] },
    // Turning regex off must not rewrite what was typed.
    "config.search.regexOffHint": {
        en: ["plain text", "exactly as typed"],
        yue: ["純文字", "原樣"],
    },
    "config.search.regexOnHint": { en: ["regular expression"], yue: ["正規表達式"] },
} as const satisfies Record<
    keyof typeof CONFIGEDITOR_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
