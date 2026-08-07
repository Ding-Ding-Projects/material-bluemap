/**
 * Copy for every search surface, in English and in Hong Kong Cantonese.
 *
 * The site shell owns the language mode and the funny levels. This module reads the stored choice
 * once at startup and otherwise waits to be told, through `setSearchLocale`, so there is one
 * writer for that preference and not two. Nothing here is persisted by this module.
 *
 * Bilingual mode returns the English string as the primary label and the Cantonese string as a
 * separate secondary label, so a caller can render the secondary smaller instead of crowding one
 * line. `label()` is the joined single-string form for attributes that cannot hold two elements.
 *
 * The funny level styles voice only. Errors, limits, safety copy and anything that tells a visitor
 * what a control will do have no playful variant, by design.
 */

export type LanguageMode = "en" | "yue" | "bilingual";
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;

export interface SearchLocale {
    readonly mode: LanguageMode;
    readonly funnyEn: FunnyLevel;
    readonly funnyYue: FunnyLevel;
}

const en = {
    // Builder shell
    builderTitle: "Regex builder",
    builderOpenLabel: "Open the regex builder for {field}",
    builderCloseLabel: "Close the regex builder",
    builderAnchoredNote: "Attached to the {field} field.",
    engineHeading: "Engine",
    engineValue: "The browser's own JavaScript RegExp",
    engineEscaping:
        "Escaping follows JavaScript rules. A backslash escapes the next character, a literal backslash is written twice, and a forward slash needs no escape here because the pattern is not written between slashes.",

    // Pattern
    patternHeading: "Pattern",
    patternLabel: "Pattern",
    patternHelp: "Insert a construct or type the pattern directly.",
    patternLimit: "Up to {max} characters.",
    patternEmpty: "Empty pattern. Type a pattern or insert a construct.",

    // Flags
    flagsLegend: "Flags",
    flagIndices: "indices",
    flagGlobal: "global",
    flagIgnoreCase: "ignore case",
    flagMultiline: "multiline",
    flagDotAll: "dot matches newline",
    flagUnicode: "Unicode",
    flagUnicodeSets: "Unicode sets",
    flagSticky: "sticky",
    flagConflict: "The u and v flags cannot both be on. Turning on {flag} turned off the other.",

    // Guided constructs
    guidedHeading: "Guided constructs",
    guidedHint: "Inserted where the cursor is",
    tokenLiteral: "Literal",
    tokenAny: "Any character",
    tokenDigit: "Digit",
    tokenWord: "Word character",
    tokenSpace: "Whitespace",
    tokenClass: "Character class",
    tokenNegatedClass: "Not in class",
    tokenStart: "Start anchor",
    tokenEnd: "End anchor",
    tokenWordBoundary: "Word boundary",
    tokenGroup: "Group",
    tokenNamedGroup: "Named group",
    tokenNonCapturing: "Non-capturing group",
    tokenAlternation: "Alternation",
    tokenZeroOrMore: "Zero or more",
    tokenOneOrMore: "One or more",
    tokenOptional: "Optional",
    tokenRange: "Count range",
    tokenLazy: "Lazy",

    // Sample and results
    sampleHeading: "Sample text",
    sampleLabel: "Sample text",
    sampleHelp: "Paste realistic text. It stays in this page.",
    sampleLimit: "Up to {max} characters.",
    resultsHeading: "Matches",
    evaluating: "Evaluating.",
    matchNone: "No matches yet.",
    matchOne: "1 match.",
    matchMany: "{count} matches.",
    matchTruncated: "Showing the first {count} matches. The rest were not listed.",
    previewLabel: "Sample text with matches marked",
    previewHint: "A zero width match is shown as a thin marker.",
    capturesLabel: "Captures",
    captureNumbered: "Group {number}",
    captureNamed: "Named group {name}",
    captureEmpty: "empty",
    matchPosition: "index {start} to {end}",
    zeroWidthAt: "Zero width match at index {index}",

    // Failure states
    invalidPattern: "That pattern is not valid: {message}",
    invalidPatternShort: "Pattern is not valid.",
    timedOut:
        "Evaluation was stopped after {ms} ms and nothing was matched. Simplify the pattern: nested quantifiers such as (a+)+ can take effectively forever.",
    limitExceeded: "Input limit reached: {message}",
    evaluatorUnavailable: "{message}",
    riskNestedQuantifier:
        "This pattern nests a quantifier inside a quantified group, which can backtrack for a very long time on text that nearly matches.",
    riskAlternationLoop:
        "This pattern repeats a group that contains alternation, which can backtrack for a very long time on text that nearly matches.",

    // Actions
    copyPattern: "Copy pattern and flags",
    copied: "Copied.",
    copyFailed: "Copy failed. Select the pattern and copy it manually.",
    exportPattern: "Export as JSON",
    exportedFile: "regex-pattern.json",
    resetBuilder: "Reset the builder",
    applyToSearch: "Use this pattern",
    builderUseRegex: "Search with this pattern",
    builderUseRegexHint:
        "Off means the field searches for your text exactly as typed. On means it runs this pattern.",

    // Safety panel
    safetyHeading: "Where this runs",
    safetyCopy:
        "Patterns and sample text are evaluated in a throwaway worker inside this page and are never sent anywhere, logged, or stored. The worker is terminated after {ms} ms.",
    limitsHeading: "Limits",
    limitsValue: "{pattern} character pattern, {sample} character sample, {matches} matches listed",
    storageHeading: "Stored",
    storageValue: "Search mode and flags only. Never your query, pattern, or sample text.",

    // Search field
    searchModeLegend: "Search mode",
    searchModeText: "Plain text",
    searchModeRegex: "Regex",
    searchModeTextHint: "Plain text is the default. Regex is opt in.",
    matchCase: "Match case",
    clearSearch: "Clear {field}",
    searchStatusIdle: "Type to search.",
    searchStatusCount: "{count} of {total} shown.",
    searchStatusNone: "Nothing matched {query}.",
    searchStatusInvalid: "Nothing was searched because the pattern is not valid.",
    searchStatusRunning: "Searching.",

    // Documentation search
    docsFieldLabel: "Search documentation",
    docsPlaceholder: "Search titles and article text",
    docsResultIn: "In {section}",
    docsBodyHit: "Body match",
    docsTitleHit: "Title match",
    docsOpen: "Open {title}",

    // Settings search
    settingsFieldLabel: "Search settings",
    settingsPlaceholder: "Search labels, descriptions, and current values",
    settingsOnThisTab: "On this tab",
    settingsOnOtherTab: "On the {tab} tab",
    settingsCurrentValue: "Current value: {value}",
    settingsGoTo: "Go to {label}",

    // Tab searches
    tabStripFieldLabel: "Search this tab strip",
    tabStripPlaceholder: "Search tabs in this strip",
    tabGroupFieldLabel: "Search tabs in {group}",
    tabGroupPlaceholder: "Search tabs in this group",
    tabGroupNamesFieldLabel: "Search tab groups",
    tabGroupNamesPlaceholder: "Search group names",
    tabMasterFieldLabel: "Search every open tab",
    tabMasterPlaceholder: "Search all tabs in every window and group",
    tabResultPinned: "Pinned",
    tabResultActive: "Active",
    tabResultUngrouped: "No group",
    tabResultCollapsed: "In a collapsed group",
    tabResultLocation: "{window}, {strip}",
    tabResultGroup: "Group {group}",
    tabGroupResultCount: "{count} tabs",
    tabGroupResultCollapsed: "Collapsed",
    tabRevealNote: "Revealing a tab in a collapsed group expands it for this visit only.",
    tabActivate: "Go to {label}",

    // Bulk close
    bulkContainingLabel: "Close tabs containing text",
    bulkNotContainingLabel: "Close tabs not containing text",
    bulkContainingPlaceholder: "Text found in the tab label",
    bulkNotContainingPlaceholder: "Text not found in the tab label",
    bulkScopeNote: "Matches the visible tab label and title only. Page content is not read.",
    bulkPreviewHeading: "Preview",
    bulkConfirmHeading: "Pinned tabs are included. Confirm before anything closes.",
    cancelAction: "Cancel",
    bulkPreviewEmptyQuery: "Type something first. An empty query closes nothing.",
    bulkPreviewInvalid: "The pattern is not valid, so nothing will close.",
    bulkPreviewNone: "No tabs match, so nothing will close.",
    bulkPreviewCount: "{count} tabs will close.",
    bulkPreviewExcluded: "{count} matching tabs will stay open: {reasons}.",
    bulkReasonPinned: "{count} pinned",
    bulkReasonUnsaved: "{count} with unsaved work",
    bulkReasonProtected: "{count} protected",
    bulkIncludePinned: "Include pinned tabs",
    bulkIncludePinnedHint: "Off by default. Pinned tabs are listed in the preview before anything closes.",
    bulkModePlain: "Matching plain text",
    bulkModeRegex: "Matching a regular expression",
    bulkRun: "Close matching tabs",
    bulkRunInverse: "Close tabs that do not match",
    bulkResultClosed: "Closed {count} tabs.",
    bulkResultNoneClosed: "No tabs closed.",
    bulkResultExcluded: "{count} tabs were left open.",
    bulkResultFailed: "{count} tabs did not close: {names}.",
} as const;

type StringKey = keyof typeof en;

const yue: Record<StringKey, string> = {
    builderTitle: "Regex 砌式器",
    builderOpenLabel: "開 {field} 嘅 regex 砌式器",
    builderCloseLabel: "閂咗個 regex 砌式器",
    builderAnchoredNote: "黐住 {field} 嗰格。",
    engineHeading: "引擎",
    engineValue: "瀏覽器自己嘅 JavaScript RegExp",
    engineEscaping:
        "跳脫字元跟 JavaScript 規矩：一個反斜線跳脫下一個字元，真係要打反斜線就要打兩個；斜線唔使跳脫，因為呢度唔使用斜線包住條式。",

    patternHeading: "規則",
    patternLabel: "Regex 規則",
    patternHelp: "撳個元件插入，或者直接打條式。",
    patternLimit: "最多 {max} 個字元。",
    patternEmpty: "冇規則。打條式，或者撳個元件插入。",

    flagsLegend: "旗標",
    flagIndices: "索引",
    flagGlobal: "搵晒全部",
    flagIgnoreCase: "唔理大細楷",
    flagMultiline: "多行",
    flagDotAll: "點號包埋換行",
    flagUnicode: "Unicode",
    flagUnicodeSets: "Unicode 字元集",
    flagSticky: "黐實位置",
    flagConflict: "u 同 v 唔可以一齊開。開咗 {flag} 就會熄咗另一個。",

    guidedHeading: "引導元件",
    guidedHint: "插落游標位置",
    tokenLiteral: "原字",
    tokenAny: "任何字元",
    tokenDigit: "數字",
    tokenWord: "字詞字元",
    tokenSpace: "空白",
    tokenClass: "字元組",
    tokenNegatedClass: "唔喺字元組",
    tokenStart: "開頭錨點",
    tokenEnd: "結尾錨點",
    tokenWordBoundary: "字詞邊界",
    tokenGroup: "擷取組",
    tokenNamedGroup: "命名組",
    tokenNonCapturing: "唔擷取組",
    tokenAlternation: "或者",
    tokenZeroOrMore: "零次或以上",
    tokenOneOrMore: "一次或以上",
    tokenOptional: "可有可無",
    tokenRange: "次數範圍",
    tokenLazy: "懶惰配對",

    sampleHeading: "測試文字",
    sampleLabel: "測試文字",
    sampleHelp: "貼啲真實文字入嚟。啲字留喺呢頁，唔會走。",
    sampleLimit: "最多 {max} 個字元。",
    resultsHeading: "命中",
    evaluating: "運算緊。",
    matchNone: "暫時零命中。",
    matchOne: "1 個命中。",
    matchMany: "{count} 個命中。",
    matchTruncated: "只列出頭 {count} 個命中，其餘冇列出。",
    previewLabel: "已標示命中嘅測試文字",
    previewHint: "零闊度命中會用一條幼線標示。",
    capturesLabel: "擷取組",
    captureNumbered: "第 {number} 組",
    captureNamed: "命名組 {name}",
    captureEmpty: "空值",
    matchPosition: "位置 {start} 至 {end}",
    zeroWidthAt: "位置 {index} 有個零闊度命中",

    invalidPattern: "呢條規則唔正確：{message}",
    invalidPatternShort: "規則唔正確。",
    timedOut:
        "運算夠 {ms} 毫秒就截停咗，冇配對到嘢。請簡化條式：好似 (a+)+ 咁層層量詞，計到天光都未計完。",
    limitExceeded: "去到輸入上限：{message}",
    evaluatorUnavailable: "{message}",
    riskNestedQuantifier: "呢條式喺有量詞嘅組入面再加量詞，遇到差少少先中嘅文字會回溯好耐。",
    riskAlternationLoop: "呢條式重複一個含「或者」嘅組，遇到差少少先中嘅文字會回溯好耐。",

    copyPattern: "複製規則同旗標",
    copied: "複製咗。",
    copyFailed: "複製唔到。請自己選取條式再複製。",
    exportPattern: "匯出做 JSON",
    exportedFile: "regex-pattern.json",
    resetBuilder: "還原砌式器",
    applyToSearch: "用呢條式搜尋",
    builderUseRegex: "用呢條式嚟搵",
    builderUseRegexHint: "熄咗就照你打嗰啲字逐個字搵；開咗就行呢條規則。",

    safetyHeading: "喺邊度行",
    safetyCopy:
        "規則同測試文字喺呢頁一個即用即棄嘅 worker 入面運算，唔會送去任何地方、唔會記錄、唔會儲起。行夠 {ms} 毫秒就會截停個 worker。",
    limitsHeading: "上限",
    limitsValue: "規則 {pattern} 字元、文字 {sample} 字元、最多列 {matches} 個命中",
    storageHeading: "會儲乜",
    storageValue: "只儲搜尋模式同旗標。查詢、規則同測試文字一概唔儲。",

    searchModeLegend: "搜尋模式",
    searchModeText: "純文字",
    searchModeRegex: "Regex",
    searchModeTextHint: "預設用純文字。要用 regex 就自己㩒開。",
    matchCase: "分大細楷",
    clearSearch: "清走 {field}",
    searchStatusIdle: "打字就開始搵。",
    searchStatusCount: "顯示緊 {total} 個之中嘅 {count} 個。",
    searchStatusNone: "冇嘢配對到 {query}。",
    searchStatusInvalid: "規則唔正確，所以冇搵過。",
    searchStatusRunning: "搵緊。",

    docsFieldLabel: "搜尋說明文件",
    docsPlaceholder: "搵標題同文章內容",
    docsResultIn: "喺 {section}",
    docsBodyHit: "內文命中",
    docsTitleHit: "標題命中",
    docsOpen: "開 {title}",

    settingsFieldLabel: "搜尋設定",
    settingsPlaceholder: "搵標籤、說明同現時數值",
    settingsOnThisTab: "喺呢個分頁",
    settingsOnOtherTab: "喺「{tab}」分頁",
    settingsCurrentValue: "現時數值：{value}",
    settingsGoTo: "去 {label}",

    tabStripFieldLabel: "搜尋呢條分頁列",
    tabStripPlaceholder: "搵呢條列入面嘅分頁",
    tabGroupFieldLabel: "搜尋「{group}」入面嘅分頁",
    tabGroupPlaceholder: "搵呢個組入面嘅分頁",
    tabGroupNamesFieldLabel: "搜尋分頁組",
    tabGroupNamesPlaceholder: "搵組名",
    tabMasterFieldLabel: "搜尋所有開住嘅分頁",
    tabMasterPlaceholder: "搵晒每個視窗同每個組入面嘅分頁",
    tabResultPinned: "已釘住",
    tabResultActive: "使用緊",
    tabResultUngrouped: "冇分組",
    tabResultCollapsed: "喺收埋咗嘅組入面",
    tabResultLocation: "{window}，{strip}",
    tabResultGroup: "組：{group}",
    tabGroupResultCount: "{count} 個分頁",
    tabGroupResultCollapsed: "收埋咗",
    tabRevealNote: "喺收埋咗嘅組入面顯示分頁，只係今次撐開，唔會改你儲低嘅設定。",
    tabActivate: "去 {label}",

    bulkContainingLabel: "閂咗含有指定文字嘅分頁",
    bulkNotContainingLabel: "閂咗冇指定文字嘅分頁",
    bulkContainingPlaceholder: "分頁標籤入面有嘅字",
    bulkNotContainingPlaceholder: "分頁標籤入面冇嘅字",
    bulkScopeNote: "只睇睇得見嘅分頁標籤同標題，唔會睇網頁內容。",
    bulkPreviewHeading: "預覽",
    bulkConfirmHeading: "連已釘住嘅分頁都會閂。閂之前請確認。",
    cancelAction: "取消",
    bulkPreviewEmptyQuery: "先打啲嘢。空白查詢乜都唔會閂。",
    bulkPreviewInvalid: "規則唔正確，所以乜都唔會閂。",
    bulkPreviewNone: "冇分頁配對到，乜都唔會閂。",
    bulkPreviewCount: "會閂咗 {count} 個分頁。",
    bulkPreviewExcluded: "有 {count} 個配對到嘅分頁會照開住：{reasons}。",
    bulkReasonPinned: "{count} 個已釘住",
    bulkReasonUnsaved: "{count} 個未存檔",
    bulkReasonProtected: "{count} 個受保護",
    bulkIncludePinned: "連已釘住嘅分頁一齊閂",
    bulkIncludePinnedHint: "預設唔會。閂之前，預覽會逐個列出已釘住嘅分頁。",
    bulkModePlain: "用純文字配對",
    bulkModeRegex: "用正則式配對",
    bulkRun: "閂咗配對到嘅分頁",
    bulkRunInverse: "閂咗配對唔到嘅分頁",
    bulkResultClosed: "閂咗 {count} 個分頁。",
    bulkResultNoneClosed: "冇分頁閂到。",
    bulkResultExcluded: "有 {count} 個分頁照開住。",
    bulkResultFailed: "有 {count} 個分頁閂唔到：{names}。",
};

/**
 * Playful alternatives, used at funny level 4 and 5. Only keys that describe an ordinary,
 * non-consequential state appear here. Errors, limits, previews and safety copy are absent on
 * purpose: the level changes the voice, never what a visitor is told.
 */
const playfulEn: Partial<Record<StringKey, string>> = {
    matchNone: "Nothing yet. The pattern is out there somewhere.",
    matchOne: "1 match. A lonely one.",
    matchMany: "{count} matches, all present and correct.",
    copied: "Copied. Go paste it somewhere useful.",
    searchStatusIdle: "Start typing. The list is listening.",
};

const playfulYue: Partial<Record<StringKey, string>> = {
    matchNone: "暫時零命中，條式仲喺度搵緊路。",
    matchOne: "1 個命中，孤家寡人。",
    matchMany: "{count} 個命中，齊人。",
    copied: "複製咗，快啲去貼。",
    searchStatusIdle: "打字啦，個清單等緊你。",
};

const LOCALE_STORAGE_KEY = "worldlens-site-locale";
const LANGUAGE_STORAGE_KEY = "worldlens-site-language";

let locale: SearchLocale = readStoredLocale();
const listeners = new Set<(next: SearchLocale) => void>();

function isLanguageMode(value: unknown): value is LanguageMode {
    return value === "en" || value === "yue" || value === "bilingual";
}

function toFunnyLevel(value: unknown): FunnyLevel {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return 3;
    }
    const clamped = Math.min(5, Math.max(1, Math.round(numeric)));
    return clamped as FunnyLevel;
}

function readStoredLocale(): SearchLocale {
    const fallback: SearchLocale = { mode: "en", funnyEn: 3, funnyYue: 3 };
    if (typeof window === "undefined") {
        // Outside a browser there is no visitor and no stored choice. Reading anyway would touch
        // Node's experimental localStorage and print a warning for nothing.
        return fallback;
    }
    try {
        const storage = globalThis.localStorage;
        if (!storage) {
            return fallback;
        }
        const raw = storage.getItem(LOCALE_STORAGE_KEY);
        if (raw !== null) {
            const parsed: unknown = JSON.parse(raw);
            if (parsed !== null && typeof parsed === "object") {
                const record = parsed as Record<string, unknown>;
                return {
                    mode: isLanguageMode(record.mode) ? record.mode : "en",
                    funnyEn: toFunnyLevel(record.funnyEn),
                    funnyYue: toFunnyLevel(record.funnyYue),
                };
            }
        }
        const plain = storage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguageMode(plain)) {
            return { ...fallback, mode: plain };
        }
        return fallback;
    } catch {
        return fallback;
    }
}

/** The active locale. */
export function searchLocale(): SearchLocale {
    return locale;
}

/**
 * Set the locale. The site shell calls this when the visitor changes the language mode or a funny
 * level. This module does not persist the choice; the settings surface that owns the preference
 * does.
 */
export function setSearchLocale(next: Partial<SearchLocale>): void {
    locale = {
        mode: next.mode !== undefined && isLanguageMode(next.mode) ? next.mode : locale.mode,
        funnyEn: next.funnyEn !== undefined ? toFunnyLevel(next.funnyEn) : locale.funnyEn,
        funnyYue: next.funnyYue !== undefined ? toFunnyLevel(next.funnyYue) : locale.funnyYue,
    };
    for (const listener of listeners) {
        listener(locale);
    }
}

/** Subscribe to locale changes. Returns the unsubscribe function. */
export function onSearchLocaleChange(listener: (next: SearchLocale) => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
    let output = template;
    for (const key of Object.keys(values)) {
        output = output.split(`{${key}}`).join(String(values[key]));
    }
    return output;
}

function resolve(key: StringKey, language: "en" | "yue"): string {
    const level = language === "en" ? locale.funnyEn : locale.funnyYue;
    if (level >= 4) {
        const playful = language === "en" ? playfulEn[key] : playfulYue[key];
        if (playful !== undefined) {
            return playful;
        }
    }
    return language === "en" ? en[key] : yue[key];
}

/** The primary label. English in `en` and bilingual modes, Cantonese in `yue`. */
export function phrase(
    key: StringKey,
    values: Readonly<Record<string, string | number>> = {},
): string {
    return interpolate(resolve(key, locale.mode === "yue" ? "yue" : "en"), values);
}

/** The secondary label, or `null` when the mode is not bilingual. */
export function secondaryPhrase(
    key: StringKey,
    values: Readonly<Record<string, string | number>> = {},
): string | null {
    if (locale.mode !== "bilingual") {
        return null;
    }
    return interpolate(resolve(key, "yue"), values);
}

/** Both languages joined, for attributes such as `aria-label` that hold a single string. */
export function label(
    key: StringKey,
    values: Readonly<Record<string, string | number>> = {},
): string {
    const primary = phrase(key, values);
    const secondary = secondaryPhrase(key, values);
    return secondary === null ? primary : `${primary} / ${secondary}`;
}

/** The BCP 47 tag that matches the active mode, for the `lang` attribute. */
export function localeTag(): string {
    return locale.mode === "yue" ? "zh-HK" : "en";
}

export type SearchStringKey = StringKey;
