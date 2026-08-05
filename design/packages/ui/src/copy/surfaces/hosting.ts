/**
 * Hosting an already-rendered map on a Linux server the person owns, over SSH, in Docker.
 *
 * The sibling surface to `remote.ts` (a render, handed to another machine) and to
 * `pages.ts` (a render, pushed to GitHub Pages): this one is the third way a finished map
 * leaves this computer, and the one with the most consequential defaults. Two facts are
 * pinned in every level of every entry below, because a funny level is voice and these are
 * not voice:
 *
 * - **stopping tears the container down and, unless the target keeps its files, removes
 *   the remote copy of the world too.** Republishing costs an upload, not a click.
 * - **publishing to a public bind address puts the map on the real internet, over plain
 *   HTTP, with no login on it.** This application has no TLS anywhere in this server, and
 *   says so rather than implying a padlock exists.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const HOSTING_VOICED = {
    "hosting.stop.confirmBody": {
        en: [
            "This stops the container on that server and, unless the target keeps its files, removes the uploaded world and its tiles too. Publishing again uploads everything again; it does not resume.",
            "This stops the container on that server and, unless the target keeps its files, removes the uploaded world and its tiles too. Publishing again uploads everything again; it does not resume.",
            "This stops the container there and, unless the target keeps its files, takes the uploaded world and tiles with it. Publishing again means a fresh upload, not a resume - it does not resume.",
            "This stops the container out there and, unless the target keeps its files, drags the world and tiles down with it. Bringing it back means uploading everything again - it does not resume, it starts over.",
            "This stops the container, right there, and unless the target keeps its files, the world and tiles get walked out the door behind it. Bringing it back means packing up and shipping the whole thing again - it does not resume, it starts from scratch.",
        ],
        yue: [
            "呢個操作會停咗嗰部伺服器嘅 container,除非個目標揸住「保留檔案」,唔係嘅話連上傳咗嘅世界同圖磚都會一齊刪走。想再發布就要成套嘢再上傳,唔會接返落去。",
            "呢個操作會停咗嗰部伺服器嘅 container,除非個目標揸住「保留檔案」,唔係嘅話連上傳咗嘅世界同圖磚都會一齊刪走。想再發布就要成套嘢再上傳,唔會接返落去。",
            "停咗佢,嗰部機嘅 container 就熄咗,除非呢個目標話要保留檔案,唔係嘅話世界同圖磚都會跟住冇埋。想再開就要成套嘢再上傳一次,唔會接返落去。",
            "停止就即係喺伺服器嗰邊叫個 container 收檔,除非個目標話要保留檔案,唔係嘅話世界同圖磚都跟住畀人請走。想攞返就要成套嘢重新寄一次,唔會接返落去,要由頭嚟過。",
            "停止即係喺伺服器嗰度同個 container 講拜拜,除非個目標話明要保留檔案,唔係嘅話世界同圖磚都會即刻跟住畀人請埋一齊走。想攞返嚟就要成套嘢由頭打包寄一次,唔會接返落去,要重新嚟過。",
        ],
    },
    "hosting.bind.publicWarning": {
        en: [
            "Publishing to every interface puts this map on the real internet at that address, over plain HTTP. This application has no TLS anywhere in this server; putting a certificate in front of it is your own responsibility.",
            "Publishing to every interface puts this map on the real internet at that address, over plain HTTP. This application has no TLS anywhere in this server; putting a certificate in front of it is your own responsibility.",
            "Choosing every interface puts the map on the open internet at that address, over plain HTTP. There is no TLS anywhere in this server, so adding a certificate in front of it is your own responsibility.",
            "Every interface means the whole internet can reach that address over plain HTTP, because there is no TLS anywhere in this server. A padlock in the address bar is your own responsibility to add.",
            "Every interface means anybody, anywhere, can open this map over plain HTTP, because there is no TLS anywhere in this server hiding to save you. A padlock in that address bar is your own responsibility, start to finish.",
        ],
        yue: [
            "揀「所有介面」就即係將呢幅圖擺去真正嘅互聯網嗰個地址度,用嘅仲係冇加密嘅 HTTP。呢個應用程式喺呢個伺服器度完全冇 TLS;想幫佢加張證書,係你自己嘅事。",
            "揀「所有介面」就即係將呢幅圖擺去真正嘅互聯網嗰個地址度,用嘅仲係冇加密嘅 HTTP。呢個應用程式喺呢個伺服器度完全冇 TLS;想幫佢加張證書,係你自己嘅事。",
            "揀晒所有介面,即係將幅圖擺上開放嘅互聯網嗰個地址,用嘅係冇加密嘅 HTTP。呢個伺服器完全冇 TLS,想幫佢加張證書係你自己嘅事。",
            "揀所有介面即係成個互聯網嘅人都摸到嗰個地址,用嘅仲係冇加密嘅 HTTP,因為呢個伺服器邊度都冇 TLS。個網址欄想有把鎖,加落去係你自己嘅事。",
            "揀所有介面即係話,邊個攞住個地址、喺邊度都可以用返冇加密嘅 HTTP 開嚟睇,因為呢度邊個角落都冇 TLS 埋伏住幫你。個網址欄想有把鎖,由頭到尾都係你自己嘅事。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const HOSTING_FIXED = {
    "hosting.title": { en: "Host this map on your own server", yue: "喺自己嘅伺服器度長開呢幅圖" },
    "hosting.start": { en: "Publish", yue: "發布" },
    "hosting.update": { en: "Republish", yue: "重新發布" },
    "hosting.stop": { en: "Stop hosting", yue: "停止服務" },
    "hosting.stop.confirmTitle": { en: "Confirm stopping this hosted map", yue: "確認停止呢幅長開緊嘅地圖" },
    "hosting.refresh": { en: "Check now", yue: "而家check" },
    "hosting.bind.loopback": { en: "Only this server (SSH tunnel needed)", yue: "淨係嗰部伺服器自己 (要用 SSH tunnel)" },
    "hosting.bind.public": { en: "The whole internet", yue: "成個互聯網" },
    "hosting.verified": { en: "Verified, and answering", yue: "驗證咗,而且有反應" },
    "hosting.unverified": { en: "Not verified yet", yue: "重未驗證到" },
} as const satisfies Record<string, FixedString>;

export const HOSTING_FACTS = {
    "hosting.stop.confirmBody": {
        en: ["stops the container", "unless the target keeps its files", "does not resume"],
        yue: ["container", "保留檔案", "唔會接返落去"],
    },
    "hosting.bind.publicWarning": {
        en: ["plain HTTP", "no TLS anywhere in this server", "your own responsibility"],
        yue: ["HTTP", "TLS", "自己嘅事"],
    },
} as const satisfies Record<keyof typeof HOSTING_VOICED, { en: readonly string[]; yue: readonly string[] }>;
