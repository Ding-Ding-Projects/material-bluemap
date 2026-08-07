/**
 * Audited action-walkthrough inventory.
 *
 * Every animation demonstrates a distinct action. The GIF and still image are both bundled
 * build inputs; the still is not a poster fetched at runtime. `articleId` is the exact in-site
 * documentation destination opened by the card's action button.
 */
export interface ActionWalkthrough {
    readonly id: string;
    readonly title: { readonly en: string; readonly yue: string };
    readonly description: { readonly en: string; readonly yue: string };
    readonly alt: { readonly en: string; readonly yue: string };
    readonly gifUrl: string;
    readonly stillUrl: string;
    readonly gifFile: string;
    readonly stillFile: string;
    readonly articleId: string;
    readonly width: 640;
    readonly height: 400;
}

const asset = (file: string): string =>
    new URL(`../assets/walkthroughs/${file}`, import.meta.url).href;

const entry = (
    id: string,
    titleEn: string,
    titleYue: string,
    descriptionEn: string,
    descriptionYue: string,
    altEn: string,
    altYue: string,
    articleId: string,
): ActionWalkthrough => {
    const gifFile = `${id}.gif`;
    const stillFile = `${id}.png`;
    return {
        id,
        title: { en: titleEn, yue: titleYue },
        description: { en: descriptionEn, yue: descriptionYue },
        alt: { en: altEn, yue: altYue },
        gifUrl: asset(gifFile),
        stillUrl: asset(stillFile),
        gifFile,
        stillFile,
        articleId,
        width: 640,
        height: 400,
    };
};

export const ACTION_WALKTHROUGHS: readonly ActionWalkthrough[] = [
    entry(
        "navigation-drawer",
        "Collapse and reopen navigation",
        "收埋再打開導航",
        "The adaptive rail frees the reading canvas and remains reachable from its persistent control.",
        "側邊欄收埋之後讓返位畀內容，個開關仲企喺原位，唔會玩失蹤。",
        "Worldlens side navigation collapsing to a compact rail and reopening",
        "Worldlens 側邊導航收成窄欄再重新展開",
        "pages-feature-parity",
    ),
    entry(
        "command-palette",
        "Open the global command palette",
        "打開全域指令面板",
        "Ctrl+Shift+F opens the bounded palette and teleports to a chosen destination.",
        "撳 Ctrl+Shift+F 開啟面板，揀完就直達目標，唔使自己行迷宮。",
        "Command palette opening over the Worldlens site and selecting a destination",
        "Worldlens 網站開啟指令面板並選擇目的地",
        "command-palette",
    ),
    entry(
        "documentation-search",
        "Search every documentation article",
        "搜尋全部說明文章",
        "Plain-text search narrows titles and body content, then reveals the exact article.",
        "普通文字搜尋即刻篩文章標題同內容，再直接揭開中獎嗰篇。",
        "Documentation search filtering articles and opening the matching article",
        "說明文件搜尋篩選文章並打開相符文章",
        "regex-builder-surfaces",
    ),
    entry(
        "regex-builder",
        "Build and apply a regular expression",
        "砌好再套用正則表達式",
        "The anchored builder previews matches, flags and captures without leaving the field.",
        "正則 builder 黐住搜尋欄，即場睇 flags、matches 同 captures，唔使轉場。",
        "Anchored regex builder previewing matches beside a Worldlens search field",
        "Worldlens 搜尋欄旁邊嘅正則 builder 預覽相符結果",
        "contract-regex-builder",
    ),
    entry(
        "theme-switch",
        "Switch the live colour scheme",
        "即時轉換配色",
        "Theme controls update the M3 system roles live and persist the visitor's choice.",
        "主題控制即時換晒 M3 色彩角色，重開網站都記得，唔會朝令夕改。",
        "Worldlens settings changing the site from light to dark colour scheme",
        "Worldlens 設定將網站由淺色切換到深色配色",
        "appearance-editor",
    ),
    entry(
        "language-tone",
        "Change language and both tone levels",
        "轉語言同兩個語氣級別",
        "English, Cantonese and bilingual modes remain independent from the two funny-level controls.",
        "英文、廣東話、雙語同兩個搞笑級別各有各郁，唔會一撳全部亂晒龍。",
        "Worldlens language settings switching to bilingual mode and adjusting both tone sliders",
        "Worldlens 語言設定切換雙語模式並調整兩個語氣滑桿",
        "language-and-tone",
    ),
    entry(
        "tab-groups",
        "Create and collapse a tab group",
        "建立同收合分頁群組",
        "Tabs move into a named coloured group whose collapsed state survives reloads.",
        "分頁搬入有名有色嘅群組，收埋狀態重載之後都唔會突然失憶。",
        "Worldlens tabs moving into a coloured group and collapsing the group",
        "Worldlens 分頁移入彩色群組並收合群組",
        "contract-tab-navigation",
    ),
    entry(
        "tab-discovery",
        "Find a tab across the workspace",
        "喺工作區搵返分頁",
        "The master tab search identifies the strip, group and pinned state before activation.",
        "主分頁搜尋先講清楚條 strip、群組同 pin 狀態，唔會亂指一條路叫你自己估。",
        "Master tab search locating a grouped Worldlens page and activating it",
        "主分頁搜尋定位 Worldlens 群組頁面並啟用",
        "tabbed-shell",
    ),
    entry(
        "notification-history",
        "Filter and export notification history",
        "篩選同匯出通知記錄",
        "Dismissed messages remain searchable, selectable and exportable from the history surface.",
        "收起咗嘅通知仲可以搜尋、選取同匯出，唔會一撳交叉就落海。",
        "Worldlens notification history filtering records and exporting selected messages",
        "Worldlens 通知記錄篩選項目並匯出所選訊息",
        "notification-centre",
    ),
    entry(
        "changelog-filter",
        "Filter the complete changelog",
        "篩選完整變更記錄",
        "Text and date filters compose, then export exactly the versions currently shown.",
        "文字同日期篩選一齊用，匯出嗰陣只帶走畫面真係見到嘅版本。",
        "Worldlens changelog applying text and date filters before export",
        "Worldlens 變更記錄套用文字同日期篩選再匯出",
        "changelog-viewer",
    ),
    entry(
        "appearance-editor",
        "Edit one element's appearance",
        "編輯單一元素外觀",
        "A context action opens the anchored editor and previews colour, type and shape changes live.",
        "右鍵打開黐住元素嘅編輯器，即時試色、字款同形狀，唔使靠幻想。",
        "Anchored Worldlens appearance editor changing one card's colour and typography",
        "Worldlens 錨定外觀編輯器修改一張卡片嘅顏色同字款",
        "appearance-editor",
    ),
    entry(
        "verified-download",
        "Inspect and download the verified installer",
        "核對再下載已驗證安裝程式",
        "The Home action exposes version, platform, size and immutable release asset before download.",
        "主頁先列清版本、平台、大小同固定 release 資產，下載唔使靠估拳。",
        "Worldlens Home showing verified installer details and activating the download action",
        "Worldlens 主頁顯示已驗證安裝程式資料並啟用下載操作",
        "release-downloads",
    ),
] as const;
