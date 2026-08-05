/**
 * The project editor's destructive notes. These are deliberately small but not optional:
 * removing a map removes its configuration while leaving already-rendered tiles behind,
 * and removing a storage leaves its tiles behind while maps may still point at it.
 * Every level keeps those facts intact while allowing the surrounding voice to change.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PROJECT_VOICED = {
    "project.maps.deleteMap": {
        en: [
            "The map {name}, id {id}.",
            "The map {name}, id {id}.",
            "The map {name}, id {id}, is the one leaving this project.",
            "Map {name}, id {id}, is stepping out of this project.",
            "Map {name}, id {id}, is taking the little exit from this project; the id stays named so nobody has to guess.",
        ],
        yue: [
            "張地圖係 {name}，id 係 {id}。",
            "張地圖係 {name}，id 係 {id}。",
            "就係 {name} 呢張地圖，id 係 {id}，會由呢個 project 離開。",
            "{name} 呢張地圖、id {id}，而家準備行出呢個 project。",
            "{name} 呢張地圖、id {id}，而家行呢個 project 嘅小門口；個 id 照講清楚，唔使靠估。",
        ],
    },
    "project.maps.deleteSettings": {
        en: [
            "Every setting in its config, including anything tuned by hand.",
            "Every setting in its config, including anything tuned by hand.",
            "Every setting in its config, including the ones somebody tuned by hand.",
            "Every setting in its config goes with it, including the hand-tuned ones.",
            "Every setting in its config goes with it, including the hand-tuned knobs that were hiding in plain sight.",
        ],
        yue: [
            "佢 config 入面每一項設定，包括手動調校過嘅嘢。",
            "佢 config 入面每一項設定，包括手動調校過嘅嘢。",
            "佢 config 入面每一項設定都包括埋，連手動調校嗰啲都係。",
            "佢 config 入面每一項設定都會一齊走，連手動調校過嗰啲掣都唔例外。",
            "佢 config 入面每一項設定都會一齊走，連埋嗰啲匿喺眼前但手動調校過嘅旋鈕都唔留低。",
        ],
    },
    "project.maps.deleteTiles": {
        en: [
            "Tiles already rendered under {id} are NOT deleted. They stay on the disk, and the space is not coming back; remove them yourself if you want it.",
            "Tiles already rendered under {id} are NOT deleted. They stay on the disk, and the space is not coming back; remove them yourself if you want it.",
            "Tiles already rendered under {id} are NOT deleted. They stay on disk, so reclaiming the space is still your job.",
            "Tiles already rendered under {id} are NOT deleted. They remain on disk, patiently declining to reclaim their own space.",
            "Tiles already rendered under {id} are NOT deleted. They remain on disk, guarding the space like tiny bureaucrats, so you must remove them yourself.",
        ],
        yue: [
            "喺 {id} 底下已經算好嘅圖磚係唔會刪除嘅。佢哋仲留喺磁碟，想攞返空間要你自己刪。",
            "喺 {id} 底下已經算好嘅圖磚係唔會刪除嘅。佢哋仲留喺磁碟，想攞返空間要你自己刪。",
            "喺 {id} 底下已經算好嘅圖磚唔會刪除，仲留喺磁碟；想攞返空間仍然要你自己處理。",
            "喺 {id} 底下已經算好嘅圖磚唔會刪除，會留喺磁碟度，自己唔會行返啲空間出嚟。",
            "喺 {id} 底下已經算好嘅圖磚一塊都唔會刪除，會喺磁碟度做小小空間官僚；想攞返啲位，仍然要你自己請佢哋走。",
        ],
    },
    "project.maps.deleted": {
        en: [
            "The map {id} is out of this project. It is written when you save.",
            "The map {id} is out of this project. It is written when you save.",
            "The map {id} is out of this project; save writes that change.",
            "Map {id} has left this project, and save is what records the departure.",
            "Map {id} has left the project; save is the official paperwork for its tiny exit.",
        ],
        yue: [
            "地圖 {id} 已經唔喺呢個 project 入面，儲存嘅時候先會寫落去。",
            "地圖 {id} 已經唔喺呢個 project 入面，儲存嘅時候先會寫落去。",
            "地圖 {id} 已經離開呢個 project；儲存會寫低呢個改動。",
            "地圖 {id} 已經行出呢個 project，儲存就係記錄佢離場。",
            "地圖 {id} 已經行出呢個 project；儲存係佢呢次小小離場嘅正式文書。",
        ],
    },
    "project.storages.deleteTiles": {
        en: [
            "Tiles already written into it are NOT deleted. They stay wherever they are, and the space is not coming back.",
            "Tiles already written into it are NOT deleted. They stay wherever they are, and the space is not coming back.",
            "Tiles already written into it are NOT deleted. They stay where they are, so reclaiming the space is your job.",
            "Tiles already written into it are NOT deleted. They remain where they are, refusing to tidy up the disk space after this removal.",
            "Tiles already written into it are NOT deleted. They remain exactly where they are, little disk-space tenants with no plans to vacate themselves.",
        ],
        yue: [
            "已經寫入去嘅圖磚係唔會刪除嘅。佢哋留返喺原位，空間唔會自己返嚟。",
            "已經寫入去嘅圖磚係唔會刪除嘅。佢哋留返喺原位，空間唔會自己返嚟。",
            "已經寫入去嘅圖磚唔會刪除，會留喺原位；想攞返空間要你自己處理。",
            "已經寫入去嘅圖磚唔會刪除，照留喺原位，唔會幫你善後空間。",
            "已經寫入去嘅圖磚一塊都唔會刪除，照住原位住低，成班磁碟租客唔打算自己搬走，空間亦都唔會自己返嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PROJECT_FIXED = {} as const satisfies Record<string, FixedString>;

export const PROJECT_FACTS = {
    "project.maps.deleteMap": {
        en: ["{name}", "{id}"],
        yue: ["{name}", "{id}"],
    },
    "project.maps.deleteSettings": {
        en: ["Every setting", "config", "hand"],
        yue: ["config", "每一項設定", "手動"],
    },
    "project.maps.deleteTiles": {
        en: ["{id}", "NOT deleted", "disk", "space"],
        yue: ["{id}", "唔會刪除", "磁碟", "空間"],
    },
    "project.maps.deleted": {
        en: ["{id}", "project", "save"],
        yue: ["{id}", "project", "儲存"],
    },
    "project.storages.deleteTiles": {
        en: ["NOT deleted", "space"],
        yue: ["唔會刪除", "空間"],
    },
} as const satisfies Record<keyof typeof PROJECT_VOICED, { en: readonly string[]; yue: readonly string[] }>;
