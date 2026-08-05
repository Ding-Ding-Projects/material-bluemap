/**
 * `RepairPanel.vue`: diagnosing and repairing why a render or the web server failed to
 * start, per `docs/automatic-repair.md`.
 *
 * `main/repair/index.ts` was registered on every launch and reachable by nobody until this
 * panel and its bridge existed. What is voiced here is the state the panel is honest about
 * being in today - see `RepairPanel.vue`'s own doc comment: real failures reach this list
 * the moment something calls `repair:remember`, and nothing has yet, so the empty state is
 * not a placeholder, it is the current, accurate answer.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const REPAIR_VOICED = {
    /*
     * Two facts survive every level: nothing is on record yet, and that is because nothing
     * has failed and been remembered - not because the feature is broken or hiding
     * something. A reader deciding whether to trust an empty list needs both.
     */
    "repair.empty": {
        en: [
            "No failures are on record. One is remembered here the moment a render or the web server fails to start, so it can be diagnosed and, where the failure is understood, repaired.",
            "No failures are on record. One is remembered here the moment a render or the web server fails to start, so it can be diagnosed and, where the failure is understood, repaired.",
            "No failures are on record - one is remembered here the moment a render or the web server fails to start, so it can be diagnosed and repaired where the failure is understood.",
            "Nothing is on record here yet. A failure is remembered the moment a render or the web server fails to start, so it can be diagnosed and, where it is understood, repaired.",
            "Nothing at all is on record here yet, and that is simply because nothing has failed. A failure is remembered the moment a render or the web server fails to start, so it can be diagnosed and, where it is understood, repaired.",
        ],
        yue: [
            "而家未有記錄過任何失敗。一次 render 或者 web server 開唔到就會即刻記喺呢度，等你可以診斷，理解到嘅仲可以修復埋。",
            "而家未有記錄過任何失敗。一次 render 或者 web server 開唔到就會即刻記喺呢度，等你可以診斷，理解到嘅仲可以修復埋。",
            "而家未有記錄過任何失敗，一次 render 或者 web server 開唔到就會即刻記喺呢度，等你診斷，理解到嘅仲可以修復。",
            "呢度而家仲未記錄過任何嘢。一次 render 或者 web server 開唔到，就會即刻記喺呢度，等你診斷，理解到嘅仲可以修復。",
            "呢度而家一項都未記錄過，純粹係因為未有嘢失敗過。一次 render 或者 web server 開唔到，就會即刻記喺呢度，等你診斷，理解到嘅仲可以修復。",
        ],
    },

    "repair.noHost": {
        en: [
            "This build cannot diagnose a failed run. The desktop application is what does.",
            "This build cannot diagnose a failed run. The desktop application is what does.",
            "This build cannot diagnose a failed run - the desktop application is what does.",
            "This build cannot diagnose a failed render or web server, because it is running without the desktop application that does.",
            "There is no way to diagnose a failed run here at all, because this build is running without the desktop application that does, and nothing else in the room can do it either.",
        ],
        yue: [
            "呢個組建冇辦法診斷失敗嘅run。行嗰個係桌面應用程式。",
            "呢個組建冇辦法診斷失敗嘅run。行嗰個係桌面應用程式。",
            "呢個組建冇辦法診斷失敗嘅run，行嗰個係桌面應用程式。",
            "呢個組建冇辦法診斷失敗嘅 render 或者 web server，因為佢喺冇桌面應用程式嘅情況下行緊，而識做嗰個正正就係桌面應用程式。",
            "呢度根本冇辦法診斷失敗嘅run，因為呢個組建冇咗桌面應用程式行緊，而識做嗰個就係桌面應用程式，附近亦都冇第二個幫到手。",
        ],
    },

    /* A diagnose that genuinely found nothing this build knows the shape of. Distinct from
     * an error: the channel worked, it simply had nothing to say. */
    "repair.unexplained": {
        en: [
            "This failure did not match anything this build knows how to explain.",
            "This failure did not match anything this build knows how to explain.",
            "This failure did not match anything this build knows how to explain - which is an honest answer, not a broken one.",
            "This failure did not match any pattern this build recognises, so there is nothing more to say about it than that.",
            "This failure did not match a single pattern this build recognises, and saying so honestly beats guessing at a cause that was never observed.",
        ],
        yue: [
            "呢個失敗同呢個組建識解釋嘅嘢都對唔上。",
            "呢個失敗同呢個組建識解釋嘅嘢都對唔上。",
            "呢個失敗同呢個組建識解釋嘅嘢都對唔上，呢個係老實嘅答案，唔係壞咗。",
            "呢個失敗同呢個組建識嘅任何一個模式都對唔上，所以都冇多嘢好講。",
            "呢個失敗連呢個組建識嘅一個模式都對唔上，老實講一句好過亂估一個根本冇觀察到嘅原因。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const REPAIR_FIXED = {
    "repair.title": { en: "Automatic repair", yue: "自動修復" },
    "repair.loading": { en: "Reading what is on record...", yue: "讀緊已經記錄咗嘅嘢……" },
    "repair.refresh": { en: "Refresh", yue: "重新整理" },
    "repair.diagnose": { en: "Diagnose", yue: "診斷" },
    "repair.run": { en: "Diagnose and repair", yue: "診斷同修復" },
    "repair.subject.render": { en: "Render", yue: "Render" },
    "repair.subject.webServer": { en: "Web server", yue: "Web server" },
    "repair.lineChanges": { en: "+{added}/-{removed}", yue: "+{added}/-{removed}" },
} as const satisfies Record<string, FixedString>;

export const REPAIR_FACTS = {
    "repair.empty": { en: ["record", "remembered"], yue: ["記錄", "記喺呢度"] },
    "repair.noHost": { en: ["desktop application"], yue: ["桌面應用程式"] },
    "repair.unexplained": { en: ["did not match"], yue: ["對唔上"] },
} as const satisfies Record<
    keyof typeof REPAIR_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
