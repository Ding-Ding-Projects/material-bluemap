/**
 * Chrome for the doc-disclosure and default-provenance block that
 * `ConfigMaskField.vue` and `ConfigMarkerSetsField.vue` put beside every render-mask
 * shape's fields and every marker set's own container properties.
 *
 * `ConfigField.vue` already carries this pair for the 154 settings a config file's own
 * top-level schema reaches: `config.field.more`/`.less`/`.inherited`/`.setToDefault`/
 * `.changed`/`.nothing`, split between `configEditor.ts` and `appCopy.ts`. Those settings
 * are edited a whole file at a time, and their doc text is upstream BlueMap's own
 * template comment, lifted verbatim.
 *
 * A render mask's shape fields (`min-x`, `radius`, `size`, …) and a marker set's own
 * container properties (`label`, `sorting`, `toggleable`, `default-hidden`) are settings
 * in the same honest sense — BlueMap reads them, each carries a real default, and a file
 * can either name one explicitly or quietly inherit it — but neither editor had the
 * disclosure toggle or the provenance line before this surface existed. A shape's doc was
 * always shown in full and uncollapsed, and nothing in either editor ever said whether the
 * shape or the marker set actually wrote a property or was inheriting BlueMap's own
 * default. This is their half of that pair, kept as its own surface rather than folded
 * into `configEditor.ts` so it can be reviewed as one coherent addition.
 *
 * ## Why these settings are marked, not just explained
 *
 * `map.conf` carries exactly one comment for the whole `render-mask` block and one for
 * the whole `marker-sets` block, describing each as a whole rather than any one field or
 * property inside it. Every field this surface explains is `docSource: "authored"` in
 * `@worldlens/config` for that reason: the text is written from the Java class and
 * its own Javadoc (`BoxMaskConfig`, `CircleMaskConfig`, `MarkerSet`, …) rather than copied
 * from a comment that does not exist. It is still accurate — nothing here is invented —
 * but it is not a quotation, and `config.explain.authored` plus `config.explain.authoredHint`
 * are the badge that says so on screen, so the distinction stays visible rather than only
 * living in a metadata flag nobody reads.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CONFIGEXPLAIN_VOICED = {
    /*
     * Three states of one line, exactly as `config.field.inherited`/`.setToDefault`/
     * `.changed` are for a whole config file: not written at all, written and matching
     * the default anyway, or written and different. Each says which it is, in words that
     * make sense for one shape's field or one marker set's property rather than "this
     * file".
     */
    "config.explain.inherited": {
        en: [
            "Not set here, so BlueMap uses {value}.",
            "Not set here, so BlueMap uses {value}.",
            "Not set here, so BlueMap falls back to {value}.",
            "Nothing here names it, so BlueMap uses {value}.",
            "Nothing here names it, so BlueMap quietly uses {value} instead.",
        ],
        yue: [
            "呢度冇設定，所以 BlueMap 會用 {value}。",
            "呢度冇設定，所以 BlueMap 會用 {value}。",
            "呢度冇寫，所以 BlueMap 會退返去用 {value}。",
            "呢度完全冇提過佢，所以 BlueMap 會用 {value}。",
            "呢度隻字不提，所以 BlueMap 就靜靜雞用 {value}。",
        ],
    },
    "config.explain.setToDefault": {
        en: [
            "Set here, and it matches BlueMap's default.",
            "Set here, and it matches BlueMap's default.",
            "Set here, and it happens to match BlueMap's default.",
            "Set here, spelled out in full, and it happens to match BlueMap's default anyway.",
            "Set here, spelled out in full, and it just so happens to match BlueMap's default anyway.",
        ],
        yue: [
            "呢度set咗，同 BlueMap 嘅預設值一樣。",
            "呢度set咗，同 BlueMap 嘅預設值一樣。",
            "呢度set咗，啱啱好同 BlueMap 嘅預設值一樣。",
            "呢度set咗，一隻字都冇省，但啱啱好同 BlueMap 嘅預設值完全一樣。",
            "呢度set咗，一隻字都冇省，不過啱啱好同 BlueMap 嘅預設值撞晒。",
        ],
    },
    "config.explain.changed": {
        en: [
            "Set here. BlueMap's default is {value}.",
            "Set here. BlueMap's default is {value}.",
            "Set here, rather than left alone. BlueMap's own default is {value}.",
            "Set here by hand, rather than left alone. BlueMap's own default is {value}.",
            "Set here by hand, rather than left well alone. BlueMap's own default is {value}.",
        ],
        yue: [
            "呢度set咗。BlueMap 嘅預設值係 {value}。",
            "呢度set咗。BlueMap 嘅預設值係 {value}。",
            "呢度set咗，唔係擺喺度唔郁。BlueMap 自己嘅預設值係 {value}。",
            "呢度有人親手set咗，唔係擺喺度唔郁。BlueMap 自己嘅預設值係 {value}。",
            "呢度有人特登郁手set咗，唔係由得佢擺喺度。BlueMap 自己嘅預設值係 {value}。",
        ],
    },
    /* The tooltip on the "Explained for this app" badge. Says plainly what upstream did
     * and did not write, and points at where the explanation actually comes from. */
    "config.explain.authoredHint": {
        en: [
            "BlueMap has no comment for this one in any generated file, so this explanation is written from the Java class it configures rather than copied from the file.",
            "BlueMap has no comment for this one in any generated file, so this explanation is written from the Java class it configures rather than copied from the file.",
            "BlueMap has no comment for this setting in any generated file, so this explanation is written from the Java class it configures rather than lifted from the file.",
            "BlueMap has no comment for this one in any generated file, so this explanation is written from the Java class behind it rather than lifted from a comment that was never there.",
            "BlueMap has no comment for this one anywhere in a generated file, so this explanation is written from the Java class behind it, not lifted from a comment that was never there to begin with.",
        ],
        yue: [
            "BlueMap 生成嘅檔案入面，由頭到尾都冇為呢個寫過註解，所以呢段說明係參考背後嘅 Java class 寫出嚟，唔係由檔案抄過嚟。",
            "BlueMap 生成嘅檔案入面，由頭到尾都冇為呢個寫過註解，所以呢段說明係參考背後嘅 Java class 寫出嚟，唔係由檔案抄過嚟。",
            "BlueMap 生成嘅檔案入面，冇為呢個設定寫過任何註解，所以呢段說明係參考返背後個 Java class 寫嘅，唔係由檔案度抄。",
            "BlueMap 生成嘅檔案入面，從來冇為呢個寫過註解，所以呢段說明係由背後個 Java class 寫出嚟，唔係由一個根本冇嘅註解抄返嚟。",
            "BlueMap 生成嘅檔案入面，由頭到尾都冇為呢個寫過隻字，所以呢段說明係靠背後個 Java class 寫出嚟，唔係由一個從來冇存在過嘅註解變出嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CONFIGEXPLAIN_FIXED = {
    /* The disclosure toggle's two states. */
    "config.explain.more": { en: "Show the rest of the explanation", yue: "睇埋其餘嘅說明" },
    "config.explain.less": { en: "Show less", yue: "顯示少啲" },
    /* Substituted into "Not set here, so BlueMap uses {value}", hence lower-case. */
    "config.explain.nothing": { en: "nothing", yue: "冇嘢" },
    /* The badge marking a `docSource: "authored"` field; its tooltip is `config.explain.authoredHint` above. */
    "config.explain.authored": { en: "Explained for this app", yue: "呢個 app 寫嘅說明" },
} as const satisfies Record<string, FixedString>;

export const CONFIGEXPLAIN_FACTS = {
    "config.explain.inherited": { en: ["{value}", "BlueMap"], yue: ["{value}", "BlueMap"] },
    "config.explain.setToDefault": { en: ["BlueMap", "default"], yue: ["BlueMap", "預設值"] },
    "config.explain.changed": { en: ["BlueMap", "{value}"], yue: ["BlueMap", "{value}"] },
    "config.explain.authoredHint": { en: ["Java class", "BlueMap"], yue: ["Java class", "BlueMap"] },
} as const satisfies Record<keyof typeof CONFIGEXPLAIN_VOICED, { en: readonly string[]; yue: readonly string[] }>;
