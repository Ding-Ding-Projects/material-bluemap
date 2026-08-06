/**
 * Watching a render live in a real browser tab: the pitch, the tile-caching caveat, the
 * network-exposure consequence and its provenance line, the per-route disabled reasons, and
 * the start/stop/copy/open notices.
 *
 * `main/preview/ipc.ts` is the other half of every fact interpolated here: `{url}`,
 * `{host}` and `{port}` are exactly what `PreviewStartAnswer`/`PreviewEvent` carry across the
 * bridge, never reformatted here - see `FACTS` below, which pins all three so a funny level
 * cannot drop the one thing a "did it actually work" message exists to say.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PREVIEW_VOICED = {
    /*
     * A browser tab with no Electron bridge at all - a test harness, or somehow this
     * screen reached without the desktop app underneath it. Mirrors `pages.unsupported`'s
     * own standard for this exact situation: name what only the desktop app can do.
     */
    "preview.unsupported": {
        en: [
            "The desktop application is what hosts a render live.",
            "The desktop application is what hosts a render live.",
            "Hosting a render live is something the desktop application does.",
            "Hosting a render live is something only the desktop application can do.",
            "Hosting a render live is something only the desktop application can do, because it is the one holding the files and the port.",
        ],
        yue: [
            "直播 render 呢件事係桌面應用程式做嘅。",
            "直播 render 呢件事係桌面應用程式做嘅。",
            "直播 render 呢件事係桌面應用程式先做到。",
            "直播 render 呢件事淨係桌面應用程式先做得到。",
            "直播 render 呢件事淨係桌面應用程式先做得到,因為啲檔案同個 port 都喺佢手上。",
        ],
    },

    /*
     * The pitch. What makes this worth having is watching tiles land while the render is
     * still going, so that stays in every level rather than only "you can view the map".
     */
    "preview.explain": {
        en: [
            "Serves the render's own folder on this computer, so it can be opened in a browser while it is still running.",
            "Serves the render's own folder on this computer, so it can be opened in a browser while it is still running.",
            "Serves the render's own folder on this computer, so the map can be opened in a browser while the render is still going.",
            "Serves the render's own output folder straight off this computer's disk, so the map opens in a browser while it is still being rendered - not only once it finishes.",
            "Serves the render's own output folder straight off this computer's disk, address and all, so the map opens in a real browser tab while it is still busy being rendered - not only after the last tile lands.",
        ],
        yue: [
            "喺呢部電腦度直接派 render 自己嗰個資料夾,咁就算仲render緊都可以喺瀏覽器度打開。",
            "喺呢部電腦度直接派 render 自己嗰個資料夾,咁就算仲render緊都可以喺瀏覽器度打開。",
            "喺呢部電腦度直接派 render 自己嗰個輸出資料夾,張圖就算仲render緊都可以喺瀏覽器度打開,唔使等佢做完先得。",
            "直接由呢部電腦嘅硬碟度,派 render 自己嗰個輸出資料夾出嚟,咁張圖仲喺度render緊都已經可以喺瀏覽器度打開,唔使一直等到最後嗰刻。",
            "直接由呢部電腦嘅硬碟度,連地址都一齊,派晒 render 自己嗰個輸出資料夾出嚟 - 咁就算仲忙緊render緊都真係開得返個瀏覽器分頁睇,唔使死等到最後一嚿圖磚落地。",
        ],
    },

    /*
     * The honest caveat: the viewer keeps every tile it has already fetched in memory for
     * the life of the page, so a spot the visitor already looked at does not refresh on its
     * own. Every level keeps both halves - "reload sees new tiles" and "it will not do that
     * by itself" - because a level that dropped either half would let a silently stale view
     * pass as a working live one, which is exactly what this feature must never do.
     */
    "preview.tileCache.note": {
        en: [
            "The browser remembers a tile once it has been shown, so a spot already looked at will not update on its own until the page is reloaded.",
            "The browser remembers a tile once it has been shown, so a spot already looked at will not update on its own until the page is reloaded.",
            "The browser remembers a tile once it has been shown, so revisiting a spot will not show new detail there until the page is reloaded.",
            "Once the browser has shown a tile, it keeps that exact copy for the rest of the visit, so going back to a spot already looked at will not reveal new detail by itself - only a reload of the page does that.",
            "Once the browser has shown a tile it keeps that exact copy for the whole visit and simply will not go back for a newer one on its own, so a spot already looked at stays looking exactly as it did the first time round - reload the page and it catches up.",
        ],
        yue: [
            "瀏覽器一睇過某塊圖磚,就會記住嗰個樣,所以返去睇返嗰度都唔會自動更新。想睇新嘅就要重新整理個頁面。",
            "瀏覽器一睇過某塊圖磚,就會記住嗰個樣,所以返去睇返嗰度都唔會自動更新。想睇新嘅就要重新整理個頁面。",
            "瀏覽器一睇過某塊圖磚就記住咗嗰個樣,返去嗰度睇都唔會自動見到新嘅 - 要重新整理個頁面先睇到。",
            "瀏覽器淨係要睇過一次某塊圖磚,就會成次瀏覽都記住嗰個舊樣,所以返去睇返嗰個位都唔會自動變新 - 淨係重新整理個頁面先會追得返新嘅嘢。",
            "瀏覽器淨係睇過一次某塊圖磚,就會成次瀏覽都揸實嗰個舊樣唔放,自己係唔會走返去攞新嗰份嘅,所以返去睇返嗰個位,永遠都係第一眼嗰個樣 - 重新整理個頁面先追得返。",
        ],
    },

    /*
     * The whole content of the network-exposure choice, per `pages.visibility.*`'s own
     * standard for this kind of sentence: state exactly who gets to see it, at every level.
     */
    "preview.network.consequence": {
        en: [
            "Also visible to every other device on this network, with no sign-in - anyone who can reach this computer can open the map.",
            "Also visible to every other device on this network, with no sign-in - anyone who can reach this computer can open the map.",
            "Also visible to every other device on this network, with no sign-in required - anyone who can reach this computer on the network can open the map.",
            "Also visible to every other device on this network - a phone, a laptop, a stranger's laptop on the same café or campus Wi-Fi - with no sign-in required at all.",
            "Also visible to every other device sharing this network, no exceptions and no sign-in whatsoever - the phone on the table, the laptop across the room, and anyone else's laptop on the same café or campus Wi-Fi who happens to guess the address.",
        ],
        yue: [
            "同時亦都會畀呢個網絡入面嘅其他裝置睇到,而且唔使登入 - 掂到呢部電腦嘅人就打開到張圖。",
            "同時亦都會畀呢個網絡入面嘅其他裝置睇到,而且唔使登入 - 掂到呢部電腦嘅人就打開到張圖。",
            "同時亦都會畀呢個網絡入面嘅其他裝置睇到,完全唔使登入 - 網絡入面掂到呢部電腦嘅人就打開到張圖。",
            "同時亦都會畀呢個網絡入面嘅其他裝置睇到 - 電話、手提電腦,甚至同一個咖啡店或者校園 Wi-Fi 入面陌生人嘅手提電腦都得 - 完全唔使登入。",
            "同時亦都會一視同仁咁畀呢個網絡入面嘅其他裝置睇到,完全唔使登入 - 枱面嗰部電話、房嗰邊嗰部手提電腦,甚至同一個咖啡店或者校園 Wi-Fi 入面,啱啱好估中個地址嘅陌生人部電腦都照睇。",
        ],
    },

    "preview.network.provenance.usingDefault": {
        en: [
            "This is the application's own default: off (loopback only). You have not changed it.",
            "This is the application's own default: off (loopback only). You have not changed it.",
            "This is the application's own default - off, loopback only - and you have not changed it.",
            "This application's own shipped default is off, loopback only, and nothing has been saved here to change it.",
            "This application's own shipped default is off, loopback only, and nobody has ever saved anything here to change it - it is simply the setting the app arrived with.",
        ],
        yue: [
            "呢個係應用程式自己嘅預設值:關閉(淨係呢部電腦)。你未改過。",
            "呢個係應用程式自己嘅預設值:關閉(淨係呢部電腦)。你未改過。",
            "呢個係應用程式自己嘅預設值 - 關閉,淨係呢部電腦 - 你未改過佢。",
            "關閉、淨係呢部電腦,係呢個應用程式自己出廠嘅預設值,呢度未儲過任何改動。",
            "關閉、淨係呢部電腦,係呢個應用程式自己出廠嗰陣就有嘅預設值,呢度從來未儲過任何嘢去改佢 - 佢本身就係咁㗎喇。",
        ],
    },

    "preview.network.provenance.usingSaved": {
        en: [
            "You saved this yourself: {value}.",
            "You saved this yourself: {value}.",
            "You saved this choice yourself: {value}.",
            "You saved this choice yourself last time, and it is being used again: {value}.",
            "You saved this choice yourself last time, and here it is again, exactly as you left it: {value}.",
        ],
        yue: [
            "呢個係你自己儲落嘅:{value}。",
            "呢個係你自己儲落嘅:{value}。",
            "呢個係你自己儲落嘅選擇:{value}。",
            "呢個係你上次自己儲落嘅選擇,而家再用緊:{value}。",
            "呢個係你上次自己儲落嘅選擇,而家原封不動咁再出現喺度:{value}。",
        ],
    },

    "preview.disabled.onGithubRunners": {
        en: [
            "Running on GitHub's own servers, not this computer - nothing here to host yet.",
            "Running on GitHub's own servers, not this computer - nothing here to host yet.",
            "This render is running on GitHub's own servers, not this computer, so there is nothing here yet to host.",
            "This render is running on GitHub's own servers rather than this computer, so there is nothing on this disk yet to host - publish to GitHub Pages once it finishes, or download it here.",
            "This one is off doing its rendering on GitHub's own servers rather than this computer, so there is genuinely nothing sitting on this disk yet to host - publish it to GitHub Pages once it finishes, or bring it home by downloading it here.",
        ],
        yue: [
            "喺 GitHub 自己嘅伺服器度行緊,唔係呢部電腦 - 而家呢度未有嘢可以派。",
            "喺 GitHub 自己嘅伺服器度行緊,唔係呢部電腦 - 而家呢度未有嘢可以派。",
            "呢個 render 喺 GitHub 自己嘅伺服器度行緊,唔係呢部電腦,所以而家呢度未有嘢可以派。",
            "呢個 render 喺 GitHub 自己嘅伺服器度行緊,唔係喺呢部電腦,所以而家呢隻硬碟度都未有嘢可以派 - 完成咗就發佈去 GitHub Pages,或者下載返嚟呢度。",
            "呢個仲喺 GitHub 自己嘅伺服器度忙緊render,唔係喺呢部電腦,所以而家呢隻硬碟度真係乜都未有得派 - 等佢完成咗就發佈去 GitHub Pages,或者索性下載返嚟呢度先。",
        ],
    },

    "preview.disabled.notFound": {
        en: [
            "No render was found with this render id.",
            "No render was found with this render id.",
            "No render was found with this render id.",
            "Nothing on disk matches this render id, so there is nothing to host.",
            "Nothing on disk matches this render id at all, so there is genuinely nothing here to host.",
        ],
        yue: [
            "搵唔到呢個 render id。",
            "搵唔到呢個 render id。",
            "搵唔到呢個 render id。",
            "硬碟度冇任何嘢同呢個 render id 對得上,所以冇嘢可以派。",
            "硬碟度真係冇任何嘢同呢個 render id 對得上,所以呢度完全冇嘢可以派。",
        ],
    },

    "preview.notice.started": {
        en: [
            "Now hosting at {url} ({host}:{port}).",
            "Now hosting at {url} ({host}:{port}).",
            "Now hosting the map at {url} ({host}:{port}).",
            "Now hosting the map at {url} - bound to {host}:{port} - open it in a browser to watch it live.",
            "Now hosting the map live at {url} - bound to {host}:{port} - go ahead and open it in a browser to watch the tiles land.",
        ],
        yue: [
            "而家喺 {url} 度派緊({host}:{port})。",
            "而家喺 {url} 度派緊({host}:{port})。",
            "而家喺 {url} 度派緊張圖({host}:{port})。",
            "而家喺 {url} 度派緊張圖 - 綁定咗 {host}:{port} - 開個瀏覽器就即刻睇到直播。",
            "而家張圖已經喺 {url} 度直播緊 - 綁定咗 {host}:{port} - 即刻開個瀏覽器,睇住啲圖磚一塊一塊咁落地。",
        ],
    },

    "preview.notice.stopped": {
        en: [
            "Stopped hosting. The address no longer answers.",
            "Stopped hosting. The address no longer answers.",
            "Stopped hosting - the address no longer answers.",
            "Stopped hosting, and its port has been released - the address no longer answers anybody.",
            "Stopped hosting and let its port go entirely - that address no longer answers anybody at all now.",
        ],
        yue: [
            "已經停止派圖。個網址而家冇回應。",
            "已經停止派圖。個網址而家冇回應。",
            "已經停止派圖 - 個網址而家冇回應。",
            "已經停止派圖,個 port 都放返出嚟 - 個網址而家對任何人都冇回應。",
            "已經停止派圖,個 port 都乾脆放晒手 - 個網址而家一片死寂,冇回應得返俾任何人。",
        ],
    },

    "preview.notice.failed": {
        en: [
            "Could not start hosting: {reason}",
            "Could not start hosting: {reason}",
            "Could not start hosting the map: {reason}",
            "Could not start hosting the map, and here is exactly why: {reason}",
            "Could not start hosting the map, and here is exactly why, no euphemisms: {reason}",
        ],
        yue: [
            "開唔到直播:{reason}",
            "開唔到直播:{reason}",
            "開唔到張圖嘅直播:{reason}",
            "開唔到張圖嘅直播,原因就係:{reason}",
            "開唔到張圖嘅直播,老實同你講原因,唔會扮唔知:{reason}",
        ],
    },

    "preview.notice.copied": {
        en: [
            "The address was copied.",
            "The address was copied.",
            "The address was copied to the clipboard.",
            "The address is on the clipboard.",
            "The address is on the clipboard, ready to hand to somebody.",
        ],
        yue: [
            "個網址已經複製咗。",
            "個網址已經複製咗。",
            "個網址已經複製到剪貼簿。",
            "個網址而家喺剪貼簿度。",
            "個網址而家喺剪貼簿度,隨時send得俾人。",
        ],
    },

    "preview.notice.openFailed": {
        en: [
            "Could not open a browser automatically. The address above still works - open it yourself.",
            "Could not open a browser automatically. The address above still works - open it yourself.",
            "Could not open a browser automatically, but the address above still works - open it yourself.",
            "Could not open a browser automatically here, but the address above still answers perfectly well - copy it and open it yourself.",
            "Could not talk this computer into opening a browser automatically, but the address above is answering just fine on its own - copy it and open it yourself.",
        ],
        yue: [
            "自動開唔到瀏覽器。上面個網址仲用得 - 自己開返啦。",
            "自動開唔到瀏覽器。上面個網址仲用得 - 自己開返啦。",
            "自動開唔到瀏覽器,不過上面個網址仲用得 - 自己開返啦。",
            "呢度自動開唔到瀏覽器,但上面個網址其實仲答緊,一啲事都冇 - 複製佢自己開返啦。",
            "呢部電腦死都唔肯自動開瀏覽器,但上面個網址其實答得好好哋,冇壞過 - 複製佢自己開返去啦。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PREVIEW_FIXED = {
    "preview.title": { en: "Watch it live", yue: "即時直播睇" },
    "preview.pickRender.label": { en: "Which render", yue: "揀邊個 render" },
    "preview.start": { en: "Start hosting", yue: "開始派圖" },
    "preview.stop": { en: "Stop hosting", yue: "停止派圖" },
    "preview.urlLabel": { en: "Address", yue: "網址" },
    "preview.copyUrl": { en: "Copy address", yue: "複製網址" },
    "preview.openInBrowser": { en: "Open in browser", yue: "喺瀏覽器開" },
    "preview.network.label": {
        en: "Also allow other devices on this network",
        yue: "同時容許呢個網絡入面嘅其他裝置",
    },
    "preview.network.on": { en: "on", yue: "開咗" },
    "preview.network.off": { en: "off", yue: "關閉" },
    "preview.status.running": { en: "Live", yue: "直播緊" },
    "preview.status.stopped": { en: "Not hosting", yue: "未派緊圖" },
    "preview.renderActive.yes": { en: "Still rendering", yue: "仲render緊" },
    "preview.renderActive.no": { en: "Finished", yue: "已完成" },
    "preview.bindAddress.loopback": { en: "This computer only (127.0.0.1)", yue: "淨係呢部電腦(127.0.0.1)" },
    "preview.bindAddress.network": {
        en: "Every device on this network (0.0.0.0)",
        yue: "呢個網絡入面所有裝置(0.0.0.0)",
    },
    "preview.checkingAvailability": { en: "Checking...", yue: "檢查緊……" },
    "preview.noRenders": {
        en: "No renders on this computer yet.",
        yue: "呢部電腦仲未有任何 render。",
    },
} as const satisfies Record<string, FixedString>;

export const PREVIEW_FACTS = {
    "preview.unsupported": { en: ["desktop application"], yue: ["桌面應用程式"] },
    "preview.explain": { en: ["browser", "still"], yue: ["瀏覽器", "render緊"] },
    "preview.tileCache.note": { en: ["reload"], yue: ["重新整理"] },
    "preview.network.consequence": { en: ["every other device", "no sign-in"], yue: ["其他裝置", "唔使登入"] },
    "preview.network.provenance.usingDefault": { en: ["default", "off"], yue: ["預設值", "關閉"] },
    "preview.network.provenance.usingSaved": { en: ["{value}"], yue: ["{value}"] },
    "preview.disabled.onGithubRunners": { en: ["GitHub's own servers"], yue: ["GitHub 自己嘅伺服器"] },
    "preview.disabled.notFound": { en: ["this render id"], yue: ["render id"] },
    // The three literal facts the contract names by name: the URL, the host and the port.
    "preview.notice.started": { en: ["{url}", "{host}", "{port}"], yue: ["{url}", "{host}", "{port}"] },
    "preview.notice.stopped": { en: ["no longer answers"], yue: ["冇回應"] },
    "preview.notice.failed": { en: ["{reason}"], yue: ["{reason}"] },
    "preview.notice.copied": { en: ["address"], yue: ["網址"] },
    "preview.notice.openFailed": { en: ["address above", "open it yourself"], yue: ["上面個網址", "自己開"] },
} as const satisfies Record<
    keyof typeof PREVIEW_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
