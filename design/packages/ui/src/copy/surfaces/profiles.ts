/**
 * The profile manager: the list of maps and servers this computer knows about, and the
 * confirmation that takes one of them off it.
 *
 * The list holds two genuinely different kinds of thing, which is why so few of these
 * strings say "profile". A local entry points at tiles rendered on this machine; a remote
 * entry is an address of somebody else's BlueMap. `servers.localMap` and
 * `servers.kindRemote` are the labels that keep them apart, and the delete confirmation
 * builds itself out of whichever one applies.
 *
 * ## The delete notes are three sentences that are never shown together
 *
 * `whatRemovalCosts` in `ProfileManager.vue` assembles the confirmation from
 * `servers.deleteRow`, then exactly one of `servers.deleteLocalNote` or
 * `servers.deleteRemoteNote`, then `servers.deleteActiveNote` if this happens to be the
 * map currently on screen. Each therefore has to stand on its own and say one true thing
 * about one case, because a reader only ever sees the ones that apply to the row they are
 * about to remove.
 *
 * What those notes are protecting against is the reasonable assumption that removing an
 * entry from a list deletes what the entry pointed at. It does not, in either direction:
 * the rendered tiles stay on the disk untouched, and the server on the other end of a
 * remote entry never hears about it. Both halves of that survive level 5, together with
 * the third fact nobody wants to discover afterwards, which is that removing the entry is
 * not undoable from this screen.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PROFILES_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Searching the list                                                */
    /* ---------------------------------------------------------------- */

    "servers.searchSummary": {
        en: [
            "Showing {shown} of {total}.",
            "Showing {shown} of {total}.",
            "Showing {shown} of {total} entries.",
            "{shown} of {total} entries on screen.",
            "{shown} of {total} entries on screen. The rest are filtered out, not gone.",
        ],
        yue: [
            "顯示緊 {total} 個入面嘅 {shown} 個。",
            "顯示緊 {total} 個入面嘅 {shown} 個。",
            "喺 {total} 個項目入面顯示緊 {shown} 個。",
            "畫面上有 {total} 個項目入面嘅 {shown} 個。",
            "畫面上有 {total} 個項目入面嘅 {shown} 個。其餘嗰啲係篩走咗，唔係冇咗。",
        ],
    },
    /*
     * An empty search result and an empty list look identical, and only one of them is
     * alarming. Every level says the query is what is hiding the rows and that clearing it
     * brings them back.
     */
    "servers.noMatch": {
        en: [
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
            "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
            "Nothing here matches that search. Clearing it brings the whole list back, and nothing was removed.",
            "Nothing here matches that search. Clear it and the whole list comes back; nothing was removed.",
            "Nothing here matches that search. Clear it and the whole list walks straight back in; nothing was removed, only hidden behind the query.",
        ],
        yue: [
            "呢度冇嘢符合嗰個搜尋。清走佢就會見返成個清單；冇任何嘢被移除。",
            "呢度冇嘢符合嗰個搜尋。清走佢就會見返成個清單；冇任何嘢被移除。",
            "呢度冇嘢符合嗰個搜尋。清走佢就會見返成個清單，亦都冇任何嘢被移除。",
            "呢度冇嘢符合嗰個搜尋。清走佢，成個清單就會返晒嚟；冇任何嘢被移除。",
            "呢度冇嘢符合嗰個搜尋。清走佢，成個清單就會大搖大擺行返入嚟；冇任何嘢被移除，只係俾條搜尋遮住咗。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Removing an entry                                                 */
    /* ---------------------------------------------------------------- */

    /*
     * The sentence at the top of the super-confirmation. It names the entry and says the
     * removal is not undoable from here, and both halves are pinned: "not undoable" is
     * precisely the clause a playful rewrite treats as a stern aside it can trim.
     */
    "servers.deleteAction": {
        en: [
            "This removes {name} from the list on this computer. It is not undoable from here.",
            "This removes {name} from the list on this computer. It is not undoable from here.",
            "This removes {name} from the list on this computer, and it is not undoable from here.",
            "This takes {name} off the list on this computer. It is not undoable from here.",
            "This takes {name} off the list on this computer, and there is no undo button waiting afterwards: it is not undoable from here.",
        ],
        yue: [
            "呢個動作會將 {name} 由呢部電腦嘅清單度移除。喺呢度係還原唔到嘅。",
            "呢個動作會將 {name} 由呢部電腦嘅清單度移除。喺呢度係還原唔到嘅。",
            "呢個動作會將 {name} 由呢部電腦嘅清單度移除，而喺呢度係還原唔到嘅。",
            "呢個動作會將 {name} 由呢部電腦嘅清單度攞走。喺呢度係還原唔到嘅。",
            "呢個動作會將 {name} 由呢部電腦嘅清單度攞走，後面亦都冇一粒還原掣等緊你：喺呢度係還原唔到嘅。",
        ],
    },
    /*
     * Shown only for a locally rendered map, and it has to say two opposite-sounding
     * things at once: this screen will not be able to open the tiles again, and this
     * screen is not deleting them. Dropping either half turns a reassurance into a threat
     * or a threat into a reassurance, so both are pinned.
     */
    "servers.deleteLocalNote": {
        en: [
            "The rendered tiles stay on the disk. Nothing here can open them again once this entry is gone, and nothing here deletes them either.",
            "The rendered tiles stay on the disk. Nothing here can open them again once this entry is gone, and nothing here deletes them either.",
            "The rendered tiles stay on the disk. Once this entry is gone nothing here can open them again, and nothing here deletes them either.",
            "The rendered tiles stay on the disk, untouched. Once this entry is gone nothing here can open them again, and nothing here deletes them either.",
            "The rendered tiles stay on the disk, exactly where they are and taking up exactly as much room as before. Once this entry is gone nothing here can open them again, and nothing here deletes them either.",
        ],
        yue: [
            "算好嘅 tiles 會繼續留喺個磁碟度。呢一項冇咗之後，呢度就再開唔返佢哋，而呢度亦都唔會刪佢哋。",
            "算好嘅 tiles 會繼續留喺個磁碟度。呢一項冇咗之後，呢度就再開唔返佢哋，而呢度亦都唔會刪佢哋。",
            "算好嘅 tiles 會繼續留喺個磁碟度。一旦呢一項冇咗，呢度就再開唔返佢哋，而呢度亦都唔會刪佢哋。",
            "算好嘅 tiles 會原封不動咁留喺個磁碟度。一旦呢一項冇咗，呢度就再開唔返佢哋，而呢度亦都唔會刪佢哋。",
            "算好嘅 tiles 會一格唔少咁留喺個磁碟度，佔嘅位同之前一模一樣。一旦呢一項冇咗，呢度就再開唔返佢哋，而呢度亦都唔會刪佢哋。",
        ],
    },
    "servers.deleteRemoteNote": {
        en: [
            "Nothing on the server changes. Only this computer forgets the address.",
            "Nothing on the server changes. Only this computer forgets the address.",
            "Nothing on the server itself changes. Only this computer forgets the address.",
            "Nothing on the server changes at all. Only this computer forgets the address.",
            "Nothing on the server changes; it will not even notice. Only this computer forgets the address.",
        ],
        yue: [
            "伺服器嗰邊冇任何改動。淨係呢部電腦唔記得咗個網址。",
            "伺服器嗰邊冇任何改動。淨係呢部電腦唔記得咗個網址。",
            "伺服器本身冇任何改動。淨係呢部電腦唔記得咗個網址。",
            "伺服器嗰邊一啲改動都冇。淨係呢部電腦唔記得咗個網址。",
            "伺服器嗰邊冇任何改動，佢連察覺都唔會察覺到。淨係呢部電腦唔記得咗個網址。",
        ],
    },
    "servers.deleteActiveNote": {
        en: [
            "This is the map currently open, so the view switches to another one.",
            "This is the map currently open, so the view switches to another one.",
            "This is the map currently open, so the view switches to another one instead.",
            "This is the map currently open, so the view switches to another one by itself.",
            "This is the map currently open, so the view switches to another one on its own rather than sitting there staring at nothing.",
        ],
        yue: [
            "呢張就係而家開緊嗰張地圖，所以個畫面會轉去另一張。",
            "呢張就係而家開緊嗰張地圖，所以個畫面會轉去另一張。",
            "呢張就係而家開緊嗰張地圖，所以個畫面會改為轉去另一張。",
            "呢張就係而家開緊嗰張地圖，所以個畫面會自己轉去另一張。",
            "呢張就係而家開緊嗰張地圖，所以個畫面會自己轉去另一張，唔會呆坐喺度望住一片空白。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PROFILES_FIXED = {
    /*
     * What kind of thing a row is. These are the subtitle under a local map's name; a
     * remote row shows its URL there instead, which is why only one of the two ever needs
     * to describe an address.
     */
    "servers.localMap": { en: "Rendered on this computer", yue: "喺呢部電腦算出嚟" },
    "servers.kindRemote": { en: "Server on the network", yue: "網絡上面嘅伺服器" },
    /* The listbox option's accessible name: the row's name, then whichever subtitle it has. */
    "servers.optionName": { en: "{name}, {detail}", yue: "{name}，{detail}" },

    /* The card, its search field, and the list itself. */
    "servers.cardTitle": { en: "Maps and servers", yue: "地圖同伺服器" },
    "servers.searchLabel": { en: "Search maps and servers", yue: "搜尋地圖同伺服器" },
    "servers.searchHint": { en: "a name, an address, or local", yue: "名、網址，或者 local" },
    "servers.listLabel": {
        en: "Maps and servers on this computer",
        yue: "呢部電腦上面嘅地圖同伺服器",
    },

    /*
     * The removal controls. `servers.deleteRow` is the first line of the confirmation's
     * affected list rather than a sentence about it, which is what keeps it fixed while
     * the notes below it are voiced.
     */
    "servers.deleteTitle": { en: "Remove this map or server", yue: "移除呢張地圖或者伺服器" },
    "servers.deleteRow": { en: "The entry named {name}", yue: "叫做 {name} 嗰項" },
    "servers.remove": { en: "Remove {name}", yue: "移除 {name}" },

    /* The per-row overflow menu. */
    "servers.rowMenuLabel": {
        en: "What this map or server can do",
        yue: "呢張地圖或者伺服器做到啲咩",
    },
    "servers.menuOpen": { en: "Open this map", yue: "開呢張地圖" },

    /* Adding a remote server, at the bottom of the card. */
    "servers.nameLabel": { en: "Name", yue: "名稱" },
    "servers.urlLabel": { en: "BlueMap URL", yue: "BlueMap 網址" },
    "servers.add": { en: "Add server", yue: "加伺服器" },
    "servers.close": { en: "Close", yue: "閂咗佢" },

    /*
     * The URL field's placeholder. It is an example address rather than prose, so it stays
     * byte-identical in both languages: a placeholder somebody might copy has to be a real
     * URL, and "translating" example.com produces a host that does not resolve.
     */
    "profiles.field.urlHint": {
        en: "https://example.com/bluemap",
        yue: "https://example.com/bluemap",
    },
} as const satisfies Record<string, FixedString>;

export const PROFILES_FACTS = {
    "servers.searchSummary": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    // That the rows are filtered rather than deleted, and that clearing the query undoes it.
    "servers.noMatch": {
        en: ["whole list", "nothing was removed"],
        yue: ["成個清單", "冇任何嘢被移除"],
    },

    // The name, where the entry lives, and that this screen cannot put it back.
    "servers.deleteAction": {
        en: ["{name}", "list on this computer", "not undoable from here"],
        yue: ["{name}", "呢部電腦嘅清單", "還原唔到"],
    },
    // Both halves: the tiles are unreachable from here afterwards, and they are not deleted.
    "servers.deleteLocalNote": {
        en: ["stay on the disk", "open them again", "nothing here deletes them"],
        yue: ["留喺個磁碟", "開唔返佢哋", "唔會刪佢哋"],
    },
    "servers.deleteRemoteNote": {
        en: ["Nothing on the server", "forgets the address"],
        yue: ["伺服器", "改動", "唔記得咗個網址"],
    },
    "servers.deleteActiveNote": {
        en: ["currently open", "switches to another one"],
        yue: ["開緊", "轉去另一張"],
    },
} as const satisfies Record<
    keyof typeof PROFILES_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
