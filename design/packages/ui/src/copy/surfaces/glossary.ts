/**
 * `GlossaryTerm.vue`: the in-place info affordance beside a vocabulary word, and the sixteen
 * term definitions it can show.
 *
 * `glossary.term.aria` and `glossary.term.more` are FIXED. Both are accessible names or
 * button labels a keyboard or screen-reader user re-meets on every visit - the same reasoning
 * `pathField.ts` gives for keeping its own browse-button aria FIXED - so a funny level cannot
 * make "What does X mean?" read differently each time somebody tabs to it.
 *
 * Every `glossary.term.*` definition is VOICED, because it is prose rather than a control
 * label, matching `pathField.unavailable`'s own reasoning. Every fact named in
 * `GLOSSARY_FACTS` was checked against the schema or the code it describes before being
 * written - see `glossaryTerms.ts`'s file comment for where - and every level below keeps
 * that fact's exact wording, in both languages, so a playful rewrite can reword the sentence
 * around a fact without ever losing the fact itself.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const GLOSSARY_FIXED = {
    "glossary.term.aria": { en: 'What does "{term}" mean?', yue: '"{term}" 係咩意思？' },
    "glossary.term.more": { en: "Read more in the glossary", yue: "去 Glossary 睇多啲" },
} as const satisfies Record<string, FixedString>;

export const GLOSSARY_VOICED = {
    "glossary.term.map": {
        en: [
            "A map is one dimension of one world, rendered with its own settings - the thing BlueMap actually renders and serves. A world can have several maps, one per dimension.",
            "A map is one dimension of one world, rendered with its own settings. A world can have several maps, one per dimension - and each shows up separately.",
            "Think of a map as one dimension of one world, rendered with its own settings. A world can have several maps, one per dimension, each with its own look.",
            "A map is BlueMap's real unit: one dimension of one world, rendered with its own settings. A world can have several maps, one per dimension, all living side by side.",
            "Here is the actual unit BlueMap works in: one dimension of one world, rendered with its own settings. A world can have several maps, one per dimension, and none of them have to agree with each other.",
        ],
        yue: [
            "Map 即係一個世界嘅一個 dimension，用自己嘅設定去 render。一個世界可以有幾個 map，一個 dimension 一個。",
            "Map 就係一個世界嘅一個 dimension，用佢自己嘅設定去 render。一個世界可以有幾個 map，一個 dimension 一個 - 分開顯示㗎。",
            "記住呀：map 係一個世界嘅一個 dimension，用自己設定 render 出嚟。一個世界可以有幾個 map，一個 dimension 一個，各有各睇。",
            "Map 先係 BlueMap 真正嘅單位：一個世界嘅一個 dimension，用自己設定 render。一個世界可以有幾個 map，一個 dimension 一個，齊齊並存。",
            "同你講呢個世界嘅真相：map 係一個世界嘅一個 dimension，用自己設定 render。一個世界可以有幾個 map，一個 dimension 一個，各自各精彩，唔使夾。",
        ],
    },
    "glossary.term.world": {
        en: [
            "A world is the Minecraft save folder BlueMap reads from - the one holding level.dat and a region folder. A world is never rendered directly; a map, pointed at one of its dimensions, is.",
            "A world is the Minecraft save folder BlueMap reads from - the one with level.dat and a region folder inside it. It is never rendered on its own; a map, pointed at one dimension of it, is.",
            "A world is the Minecraft save folder BlueMap reads from: level.dat, a region folder, the lot. It never gets rendered by itself - a map, pointed at one dimension, does that job.",
            "A world is just the save folder - level.dat, a region folder - that BlueMap reads from. It never gets rendered directly; a map pointed at one of its dimensions does the rendering.",
            "A world is the humble save folder (level.dat, a region folder) that BlueMap reads from. It never renders on its own - a map, pointed at one of its dimensions, does the actual work.",
        ],
        yue: [
            "World 即係 Minecraft 嘅存檔資料夾，BlueMap 由呢度讀取 - 裡面有 level.dat 同一個 region 資料夾。World 本身唔會直接畀 render，要有個指住其中一個 dimension 嘅 map 先得。",
            "World 就係 Minecraft 嘅存檔資料夾，BlueMap 由呢度讀 - 裡面有 level.dat 同一個 region 資料夾。佢自己唔會畀 render，要靠 map 指住其中一個 dimension 先得。",
            "World 係 Minecraft 存檔資料夾嚟㗎，裡面有 level.dat 同一個 region 資料夾，BlueMap 靠呢個讀嘢。World 自己唔會 render，要 map 指住個 dimension 先做到。",
            "World 只不過係個存檔資料夾 - level.dat、一個 region 資料夾 - BlueMap 由呢度讀。佢從來唔會自己 render，要靠指住其中一個 dimension 嘅 map 先得。",
            "World 呢個謙虛嘅存檔資料夾（level.dat、一個 region 資料夾）就係 BlueMap 讀嘢嘅地方。佢自己唔會 render，要靠指住某個 dimension 嘅 map 出手先得。",
        ],
    },
    "glossary.term.storage": {
        en: [
            "Storage is where a map's rendered tiles are written: to files on disk, or into a SQL database. Every map names one storage, by id.",
            "Storage is where a map's rendered tiles get written: to files on disk, or into a SQL database. Every map names exactly one storage, by id.",
            "Storage is simply where a map's rendered tiles end up: to files on disk, or into a SQL database. Every map picks one storage, by id.",
            "Storage is where a map's rendered tiles land: to files on disk, or into a SQL database - every map's choice, named by id.",
            "Storage is the destination for a map's rendered tiles: to files on disk, or into a SQL database. Every map commits to exactly one, by id, for better or worse.",
        ],
        yue: [
            "Storage 即係 map render 出嚟嘅 tile 寫去邊 - 可以係硬碟嘅檔案，定係 SQL 資料庫。每個 map 都用個 id 揀一個 storage。",
            "Storage 就係 map render 完啲 tile 寫去邊度 - 可以係硬碟嘅檔案，定係 SQL 資料庫。每個 map 準確噉揀一個 storage，用 id 認。",
            "Storage 好簡單，就係 map render 完嘅 tile 擺喺邊 - 硬碟嘅檔案，定係 SQL 資料庫都得。每個 map 揀一個 storage，用 id 認實。",
            "Storage 係 map render 出嚟嘅 tile 嘅歸宿 - 硬碟嘅檔案，定係 SQL 資料庫。每個 map 嘅選擇，用 id 認實。",
            "Storage 就係 map render 出嚟嘅 tile 最終落腳嘅地方 - 硬碟嘅檔案，定係 SQL 資料庫。每個 map 死心塌地淨係揀一個，用 id 認實。",
        ],
    },
    "glossary.term.render": {
        en: [
            "Rendering is the process that reads a world's chunks and writes the tiles a viewer displays. It can run on this computer, in a container, on a remote machine over SSH, or on GitHub's own runners.",
            "Rendering is the process that reads a world's chunks and writes the tiles a viewer displays. It can run right here, in a container, on a remote machine over SSH, or on GitHub's own runners.",
            "Rendering just means: reads a world's chunks and writes the tiles a viewer displays. It can run on this computer, in a container, over SSH on another machine, or on GitHub's own runners.",
            "Rendering is what reads a world's chunks and writes the tiles a viewer displays - here, in a container, over SSH somewhere else, or on GitHub's own runners, take your pick.",
            "Rendering, at its core, reads a world's chunks and writes the tiles a viewer displays. It happily does this here, in a container, over SSH on a machine far away, or on GitHub's own runners.",
        ],
        yue: [
            "Render 即係讀世界嘅 chunk，寫出 tile 俾睇圖嘅人睇嘅過程。可以喺呢部電腦、喺 container 入面、用 SSH 去第二部機，或者用 GitHub 自己嘅 runner 做。",
            "Render 就係讀世界嘅 chunk，寫出 tile 俾睇圖嘅人睇。可以喺呢部電腦、喺 container、用 SSH 去第二部機，或者用 GitHub 嘅 runner 做，任揀。",
            "Render 意思好簡單：讀世界嘅 chunk，寫出 tile 俾人睇。可以喺呢部電腦、container、SSH 過去第二部機，或者用 GitHub 嘅 runner，隨你。",
            "Render 就係嗰個讀世界嘅 chunk，寫出 tile 嘅嘢 - 呢度、container、SSH 去第二部機、定係 GitHub 嘅 runner，隨你揀。",
            "Render 嘅核心，就係讀世界嘅 chunk，寫出 tile 俾人睇。呢度得、container 得、SSH 去好遠嗰部機都得、GitHub 嘅 runner 都得，佢乜都應承你。",
        ],
    },
    "glossary.term.tile": {
        en: [
            "A tile is one square piece of a rendered map. Hires tiles are the close-up ones with full 3D detail; lowres tiles are flattened, zoomed-out ones used from a distance.",
            "A tile is one square piece of a rendered map. Hires tiles are the close-up ones with full 3D detail; lowres tiles are the flattened, zoomed-out ones used from a distance.",
            "A tile is just one square piece of a rendered map. Hires tiles are the close-up ones with full 3D detail; lowres tiles are flattened, zoomed-out ones for viewing from a distance.",
            "A tile is one square piece of the rendered map - hires tiles are the close-up ones with full 3D detail, and lowres tiles are flattened, zoomed-out ones for a distant view.",
            "A tile is one small square piece of the rendered map. Hires tiles get the full 3D detail close-up treatment; lowres tiles are flattened, zoomed-out ones that carry the view from far away.",
        ],
        yue: [
            "Tile 即係 render 出嚟嘅地圖入面一小格正方形。Hires tile 係影得近、有齊 3D 細節嗰啲；lowres tile 係壓平咗、影得遠、由遠處睇嗰啲。",
            "Tile 就係 render 出嚟嘅地圖上面一格正方形。Hires tile 係近鏡、有齊 3D 細節嗰啲；lowres tile 係壓平咗、遠鏡、由遠處睇嗰啲。",
            "Tile 好簡單，就係 render 出嚟嘅地圖上一格正方形。Hires tile 係近鏡、有齊 3D 細節嗰啲；lowres tile 就係壓平咗、遠鏡、由遠處睇嗰啲。",
            "Tile 即係地圖上一格正方形 - hires tile 影得近，有齊 3D 細節；lowres tile 壓平咗、影得遠，用嚟由遠處睇。",
            "Tile 就係 render 出嚟嗰幅地圖上細細粒嘅正方形。Hires tile 專攻近鏡、有齊 3D 細節；lowres tile 就負責壓平咗、影得遠，由老遠都睇到。",
        ],
    },
    "glossary.term.mapId": {
        en: [
            "The map id is the short identifier a map is stored and referred to by - in file paths and the viewer's own URL - distinct from its display name.",
            "The map id is the short identifier a map is stored and referred to by, in file paths and the viewer's own URL. It is distinct from its display name.",
            "The map id is just the short identifier a map is stored and referred to by - file paths, the viewer's own URL - distinct from its display name.",
            "The map id is the short identifier behind a map - the one file paths and the viewer's own URL actually use - distinct from its display name, however that reads.",
            "The map id is the short identifier doing the real work behind a map, in file paths and the viewer's own URL, distinct from its display name no matter how fancy that gets.",
        ],
        yue: [
            "Map id 即係一個 map 儲存同被指認嘅短名 - 用喺檔案路徑同睇圖器嘅 URL - 同顯示名分開嚟嘅。",
            "Map id 就係個 map 儲存同被指認嘅短名，用喺檔案路徑同睇圖器嘅 URL。同顯示名係兩回事。",
            "Map id 好簡單，就係個 map 儲存同被指認嘅短名 - 檔案路徑、睇圖器 URL 都用佢 - 同顯示名分開。",
            "Map id 係 map 背後真正做嘢嘅短名 - 檔案路徑同睇圖器 URL 用嘅就係佢 - 同顯示名係兩回事。",
            "Map id 就係喺 map 背後默默做嘢嘅短名，檔案路徑同睇圖器 URL 靠佢，同顯示名係兩回事，唔理個顯示名幾靚仔都好。",
        ],
    },
    "glossary.term.project": {
        en: [
            "A project is a JSON file this app writes at the root of a Minecraft world folder, holding every map, storage and setting that world renders with.",
            "A project is a JSON file this app writes at the root of a Minecraft world folder. It holds every map, storage and setting that world renders with.",
            "A project is just a JSON file this app writes at the root of a Minecraft world folder, holding every map, storage and setting that world renders with.",
            "A project is a JSON file this app tucks at the root of a Minecraft world folder, carrying every map, storage and setting that world renders with.",
            "A project is a JSON file this app quietly writes at the root of a Minecraft world folder, carrying every map, storage and setting that world renders with, no matter how many times you close the app.",
        ],
        yue: [
            "Project 即係呢個 app 喺 Minecraft world 資料夾根目錄寫嘅一個 JSON 檔案，裡面有嗰個 world render 用嘅所有 map、storage 同設定。",
            "Project 就係呢個 app 喺 world 資料夾根目錄寫嘅一個 JSON 檔案，裡面有嗰個 world render 用嘅所有 map、storage 同設定。",
            "Project 好簡單，就係呢個 app 喺 world 資料夾根目錄寫嘅一個 JSON 檔案，載晒嗰個 world render 用嘅所有 map、storage 同設定。",
            "Project 就係呢個 app 塞喺 world 資料夾根目錄嘅一個 JSON 檔案，扛住嗰個 world render 用嘅所有 map、storage 同設定。",
            "Project 就係呢個 app 靜靜雞喺 world 資料夾根目錄寫低嘅一個 JSON 檔案，死忠噉扛住嗰個 world render 用嘅所有 map、storage 同設定，你閂幾多次 app 都認得返。",
        ],
    },
    "glossary.term.configFolder": {
        en: [
            "A config folder holds BlueMap's own .conf files - core, maps, storages, webapp, webserver and plugin - the files BlueMap's own engine reads directly, independent of any project file this app writes.",
            "A config folder holds BlueMap's own .conf files - core, maps, storages, webapp, webserver and plugin - which BlueMap's own engine reads directly, independent of any project file this app writes.",
            "A config folder is where BlueMap's own .conf files live - core, maps, storages, webapp, webserver and plugin - read directly by BlueMap's own engine, independent of any project file this app writes.",
            "A config folder holds the actual .conf files - core, maps, storages, webapp, webserver and plugin - BlueMap's own engine reads directly, independent of any project file this app writes.",
            "A config folder is where BlueMap's real .conf files - core, maps, storages, webapp, webserver and plugin - sit, read directly by BlueMap's own engine, entirely independent of any project file this app writes.",
        ],
        yue: [
            "Config folder 即係擺 BlueMap 自己啲 .conf 檔案嘅地方 - core、maps、storages、webapp、webserver 同 plugin - BlueMap 自己個引擎直接讀嘅檔案，同呢個 app 寫嘅 project 檔案冇關係。",
            "Config folder 就係 BlueMap 自己啲 .conf 檔案住嘅地方 - core、maps、storages、webapp、webserver 同 plugin - BlueMap 自己個引擎直接讀，同 project 檔案冇關係。",
            "Config folder 就係 BlueMap 自己啲 .conf 檔案嘅屋企 - core、maps、storages、webapp、webserver 同 plugin - BlueMap 引擎直接讀，同呢個 app 寫嘅 project 檔案兩回事。",
            "Config folder 扛住真正嘅 .conf 檔案 - core、maps、storages、webapp、webserver 同 plugin - BlueMap 自己個引擎直接讀，同 project 檔案冇關係。",
            "Config folder 就係 BlueMap 真身啲 .conf 檔案 - core、maps、storages、webapp、webserver 同 plugin - 匿埋嘅地方，BlueMap 引擎直接讀，同呢個 app 寫嘅 project 檔案完全兩回事。",
        ],
    },
    "glossary.term.marker": {
        en: [
            "A marker is a labelled point or shape drawn on the rendered map. Markers are grouped into marker sets, which can be shown or hidden together.",
            "A marker is a labelled point or shape drawn on the rendered map, grouped into marker sets that can be shown or hidden together.",
            "A marker is just a labelled point or shape drawn on the rendered map. Markers group into marker sets, shown or hidden together.",
            "A marker is a labelled point or shape on the rendered map - grouped into marker sets, toggled on or off together.",
            "A marker is a little labelled point or shape drawn on the rendered map, grouped into marker sets that all flip on or off together, like a well-drilled squad.",
        ],
        yue: [
            "Marker 即係擺喺 render 出嚟嘅地圖上，有標籤嘅一點或者形狀。Marker 分晒落 marker set，可以一齊顯示定隱藏。",
            "Marker 就係擺喺 render 出嚟嘅地圖上，一個有標籤嘅點或者形狀，分入 marker set 度，一齊顯示定隱藏。",
            "Marker 好簡單，就係地圖上有標籤嘅一點或者形狀。分晒落 marker set，一齊顯示定隱藏。",
            "Marker 就係地圖上有標籤嘅一點或者形狀 - 分入 marker set，一齊顯示定隱藏。",
            "Marker 就係地圖上一個有標籤嘅細細點或者形狀，分晒隊落 marker set，成隊一齊顯示或者一齊收埋，好有紀律。",
        ],
    },
    "glossary.term.dimension": {
        en: [
            "A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End. A world can hold more than one, and each gets its own map.",
            "A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End - and a world can hold more than one, each with its own map.",
            "A dimension is one of a world's Minecraft dimensions - Overworld, Nether or End. A world can hold more than one, each getting its own map.",
            "A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End - and a world holding more than one gets a map for each.",
            "A dimension is one of a world's Minecraft dimensions - the Overworld, the Nether or the End - and a world greedy enough to hold more than one gets a map for each.",
        ],
        yue: [
            "Dimension 即係一個世界嘅其中一個 Minecraft dimension - Overworld、Nether 定係 End。一個世界可以有多過一個，每個都有自己嘅 map。",
            "Dimension 就係一個世界嘅其中一個 Minecraft dimension - Overworld、Nether 定係 End - 一個世界可以有多過一個，各有各嘅 map。",
            "Dimension 係一個世界嘅其中一個 Minecraft dimension - Overworld、Nether、End。一個世界可以有多過一個，個個都有自己嘅 map。",
            "Dimension 即係一個世界嘅其中一個 Minecraft dimension - Overworld、Nether 定係 End - 有多過一個嘅世界，個個 dimension 都有自己嘅 map。",
            "Dimension 就係一個世界嘅其中一個 Minecraft dimension - Overworld、Nether 定係 End - 貪心到有多過一個嘅世界，個個都攞埋自己嘅 map。",
        ],
    },
    "glossary.term.serverPlugin": {
        en: [
            "Server plugin settings apply only when BlueMap runs inside a Minecraft server process, and this desktop app never runs that way - so this tab changes nothing here. It exists for a config folder later copied onto a server.",
            "Server plugin settings apply only when BlueMap runs inside a Minecraft server process, and this desktop app never runs that way, so this tab changes nothing here. It exists for a config folder later copied onto a server.",
            "Server plugin settings apply only when BlueMap runs inside a Minecraft server process, and this desktop app never runs that way - so this tab is inert here. It is for a config folder later copied onto a server.",
            "Server plugin settings apply only when BlueMap runs inside a Minecraft server process, and this desktop app never runs that way - so this tab does nothing here. It is waiting for a config folder that gets copied onto a server later.",
            "Server plugin settings apply only when BlueMap runs inside a Minecraft server process, and this desktop app never runs that way, never has and never will - so this tab is pure decoration, waiting patiently for a config folder to be copied onto a server.",
        ],
        yue: [
            "Server plugin 嘅設定淨係喺 BlueMap 跑喺 Minecraft server process 入面先有用。呢個桌面 app 從來唔會咁樣跑，所以呢頁喺呢度乜都冇改變 - 佢係留俾之後拎去 server 用嘅 config folder。",
            "Server plugin 嘅設定淨係 BlueMap 跑喺 Minecraft server process 入面先有用，呢個桌面 app 從來冇咁跑過 - 所以呢頁喺呢度乜都唔改變。佢係留俾之後拎去 server 用嘅 config folder。",
            "Server plugin 嘅設定，淨係 BlueMap 跑喺 Minecraft server process 入面先有用。呢個桌面 app 從來唔會咁跑，所以呢頁喺呢度冇作用 - 係留俾之後 copy 去 server 嘅 config folder。",
            "Server plugin 嘅設定淨係喺 BlueMap 跑喺 Minecraft server process 入面先有用 - 呢個桌面 app 從來唔會 - 所以呢頁喺呢度乜都唔做。佢等緊個 config folder 之後 copy 去 server。",
            "Server plugin 嘅設定淨係 BlueMap 跑喺 Minecraft server process 入面先醒返，呢個桌面 app 從來冇試過亦都唔會試 - 所以呢頁喺呢度純粹擺設，耐心等緊個 config folder 之後 copy 去 server。",
        ],
    },
    "glossary.term.renderThread": {
        en: [
            "Render threads are how many CPU threads render tiles at once. Render thread priority sets how much CPU time they get relative to everything else running on the machine.",
            "Render threads are how many CPU threads render tiles at once; render thread priority sets how much CPU time they get, relative to everything else running.",
            "Render threads are simply how many CPU threads render tiles at once. Render thread priority sets how much CPU time they get relative to everything else running.",
            "Render threads decide how many CPU threads render tiles at once - and render thread priority decides how much CPU time they get relative to everything else running.",
            "Render threads are, quite simply, how many CPU threads render tiles at once, and render thread priority decides how much CPU time they get relative to everything else running on the machine.",
        ],
        yue: [
            "Render thread 即係幾多條 CPU thread 一齊 render tile。Render thread priority 決定佢哋攞幾多 CPU 時間，同部機入面其他嘢比較。",
            "Render thread 就係幾多條 CPU thread 一齊 render tile；render thread priority 決定佢哋攞幾多 CPU 時間，同其他嘢比較。",
            "Render thread 好簡單，就係幾多條 CPU thread 一齊 render tile。Render thread priority 決定佢哋攞幾多 CPU 時間，同其他嘢比較。",
            "Render thread 決定幾多條 CPU thread 一齊 render tile - render thread priority 就決定佢哋攞幾多 CPU 時間，同其他嘢比較。",
            "Render thread 就係話你知幾多條 CPU thread 一齊 render tile，仲要夾埋做嘢；render thread priority 就話俾佢哋知攞幾多 CPU 時間，同部機入面其他嘢比較。",
        ],
    },
    "glossary.term.reaches": {
        en: [
            '"Reaches this render" means the local engine actually reads that setting right now - only the world, dimension, name, sort order, starting position and storage do. Everything else is written into the map config file for a future render.',
            '"Reaches this render" means the local engine reads that setting right now - only the world, dimension, name, sort order, starting position and storage do. Everything else goes into the map config file for a future render.',
            '"Reaches this render" just means the local engine reads it right now - only the world, dimension, name, sort order, starting position and storage do. Everything else is saved into the map config file for a future render.',
            '"Reaches this render" is the local engine actually reading a setting right now - only the world, dimension, name, sort order, starting position and storage make that cut. Everything else waits in the map config file for a future render.',
            '"Reaches this render" is VIP access for a setting: the local engine actually reads it right now, and only the world, dimension, name, sort order, starting position and storage get in. Everything else waits its turn in the map config file for a future render.',
        ],
        yue: [
            '"Reaches this render" 意思係本機引擎而家真係讀緊嗰個設定 - 淨係 world、dimension、name、sort order、starting position 同 storage 咁做。第啲全部只係寫入 map config 檔案，留返俾下次 render。',
            '"Reaches this render" 就係本機引擎而家真係讀緊嗰個設定 - 淨係 world、dimension、name、sort order、starting position 同 storage 咁做。第啲全部寫入 map config 檔案，等下次 render。',
            '"Reaches this render" 好簡單，就係本機引擎而家真係讀緊 - 淨係 world、dimension、name、sort order、starting position 同 storage 咁做。第啲全部存入 map config 檔案，等下次 render。',
            '"Reaches this render" 即係本機引擎而家真係讀緊嗰個設定 - 淨係 world、dimension、name、sort order、starting position 同 storage 有咁嘅待遇。第啲全部喺 map config 檔案度等緊下次 render。',
            '"Reaches this render" 就好似 VIP 通行證：本機引擎而家真係讀緊，淨係 world、dimension、name、sort order、starting position 同 storage 入到閘。第啲全部乖乖喺 map config 檔案度排隊，等緊下次 render。',
        ],
    },
    "glossary.term.engine": {
        en: [
            "The engine is the program that walks a world and writes tiles. Locally that is BlueMap's own Java engine; a Java runtime is downloaded automatically into this app's own folder the first time it is needed.",
            "The engine is the program that walks a world and writes tiles. Locally that is BlueMap's own Java engine, and a Java runtime downloads automatically into this app's own folder the first time it is needed.",
            "The engine is just the program that walks a world and writes tiles. Locally that is BlueMap's own Java engine; a Java runtime downloads automatically into this app's own folder the first time it is needed.",
            "The engine is what walks a world and writes tiles - locally, BlueMap's own Java engine, with a Java runtime downloaded automatically into this app's own folder the first time it is needed.",
            "The engine is the program actually walking a world and writing tiles - locally, that is BlueMap's own Java engine, and a Java runtime quietly downloads itself into this app's own folder the first time anybody needs it.",
        ],
        yue: [
            "Engine 即係行過個世界、寫 tile 出嚟嘅程式。本機用嘅係 BlueMap 自己個 Java engine；第一次用嘅時候，Java runtime 會自動落入呢個 app 自己嘅資料夾。",
            "Engine 就係行過個世界、寫 tile 出嚟嘅程式。本機用嘅係 BlueMap 自己個 Java engine，Java runtime 第一次用嗰陣會自動落入呢個 app 自己嘅資料夾。",
            "Engine 好簡單，就係行過個世界、寫 tile 出嚟嘅程式。本機用嘅係 BlueMap 自己個 Java engine；Java runtime 第一次用會自動落入呢個 app 自己嘅資料夾。",
            "Engine 就係嗰個行過個世界、寫 tile 嘅程式 - 本機用 BlueMap 自己個 Java engine，第一次用嘅時候 Java runtime 自動落入呢個 app 自己嘅資料夾。",
            "Engine 就係真身行過個世界、寫 tile 嘅嗰位 - 本機用嘅係 BlueMap 自己個 Java engine，第一次有人要用嘅時候，Java runtime 會靜靜雞落入呢個 app 自己嘅資料夾。",
        ],
    },
    "glossary.term.profile": {
        en: [
            'A profile is this app\'s own name for one entry in "Maps and servers": either a map already rendered on this computer, or the address of someone else\'s BlueMap web server.',
            'A profile is this app\'s own name for one entry in "Maps and servers" - either a map already rendered on this computer, or the address of someone else\'s BlueMap web server.',
            'A profile is just this app\'s own name for one entry in "Maps and servers": either a map already rendered on this computer, or the address of someone else\'s BlueMap web server.',
            'A profile is this app\'s own name for one entry in "Maps and servers" - either a map already rendered on this computer, or the address of someone else\'s BlueMap web server, take your pick.',
            'A profile is this app\'s cosy little name for one entry in "Maps and servers" - either a map already rendered on this computer, or the address of someone else\'s BlueMap web server, no judgement either way.',
        ],
        yue: [
            'Profile 即係呢個 app 自己叫 "Maps and servers" 入面一個項目嘅名 - 可以係已經喺呢部電腦 render 咗嘅 map，又或者係第二個人 BlueMap web server 嘅地址。',
            'Profile 就係呢個 app 自己叫 "Maps and servers" 入面一個項目嘅名，可以係已經喺呢部電腦 render 咗嘅 map，又或者係第二個人 BlueMap web server 嘅地址。',
            'Profile 好簡單，就係呢個 app 自己叫 "Maps and servers" 入面一個項目嘅名 - 已經喺呢部電腦 render 咗嘅 map，又或者第二個人 BlueMap web server 嘅地址。',
            'Profile 就係呢個 app 自己叫 "Maps and servers" 入面一個項目嘅名 - 已經喺呢部電腦 render 咗嘅 map，又或者第二個人 BlueMap web server 嘅地址，任揀。',
            'Profile 就係呢個 app 幫 "Maps and servers" 入面每個項目改嘅暱稱 - 已經喺呢部電腦 render 咗嘅 map，又或者第二個人 BlueMap web server 嘅地址，兩樣都冇問題。',
        ],
    },
    "glossary.term.blueMapUrl": {
        en: [
            "A BlueMap URL is the web address of a BlueMap web server already running somewhere else, used to view its live map remotely - nothing is rendered here for it.",
            "A BlueMap URL is the web address of a BlueMap web server already running somewhere else, used to view its live map remotely - nothing is rendered here for it, only shown.",
            "A BlueMap URL is just the web address of a BlueMap web server already running somewhere else, used to view its live map remotely - nothing is rendered here for it.",
            "A BlueMap URL is the web address of a BlueMap web server already running somewhere else - here purely to view its live map remotely, and nothing is rendered here for it.",
            "A BlueMap URL is simply the web address of somebody else's BlueMap web server, already running somewhere else and minding its own business, used to peek at its live map remotely - nothing is rendered here for it, this app is just visiting.",
        ],
        yue: [
            "BlueMap URL 即係一個已經喺第二個地方跑緊嘅 BlueMap web server 嘅網址，用嚟遠端睇佢個實時地圖。呢度唔會為佢 render 任何嘢。",
            "BlueMap URL 就係一個已經喺第二個地方跑緊嘅 BlueMap web server 嘅網址，用嚟遠端睇佢個實時地圖 - 呢度唔會為佢 render 任何嘢。",
            "BlueMap URL 好簡單，就係一個已經喺第二個地方跑緊嘅 BlueMap web server 嘅網址，用嚟遠端睇佢個實時地圖。呢度唔會為佢 render 任何嘢。",
            "BlueMap URL 即係一個已經喺第二個地方跑緊嘅 BlueMap web server 網址 - 用嚟遠端睇佢個實時地圖，呢度唔會為佢 render 任何嘢。",
            "BlueMap URL 就係第二個人嗰個已經喺第二個地方跑緊嘅 BlueMap web server 網址，用嚟遠端偷睇佢個實時地圖 - 呢度唔會為佢 render 任何嘢，呢個 app 淨係嚟做客。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const GLOSSARY_FACTS = {
    "glossary.term.map": {
        en: ["one dimension of one world"],
        yue: ["一個世界嘅一個 dimension"],
    },
    "glossary.term.world": {
        en: ["level.dat"],
        yue: ["level.dat"],
    },
    "glossary.term.storage": {
        en: ["files on disk, or into a SQL database"],
        yue: ["硬碟嘅檔案，定係 SQL 資料庫"],
    },
    "glossary.term.render": {
        en: ["reads a world's chunks and writes the tiles"],
        yue: ["讀世界嘅 chunk，寫出 tile"],
    },
    "glossary.term.tile": {
        en: ["full 3D detail", "flattened, zoomed-out"],
        yue: ["有齊 3D 細節", "壓平咗"],
    },
    "glossary.term.mapId": {
        en: ["distinct from its display name"],
        yue: ["同顯示名"],
    },
    "glossary.term.project": {
        en: ["JSON file", "root of a Minecraft world folder"],
        yue: ["JSON 檔案", "world 資料夾根目錄"],
    },
    "glossary.term.configFolder": {
        en: ["core, maps, storages, webapp, webserver and plugin"],
        yue: ["core、maps、storages、webapp、webserver 同 plugin"],
    },
    "glossary.term.marker": {
        en: ["labelled point or shape", "marker sets"],
        yue: ["有標籤", "marker set"],
    },
    "glossary.term.dimension": {
        en: ["Overworld", "Nether", "End"],
        yue: ["Overworld", "Nether", "End"],
    },
    "glossary.term.serverPlugin": {
        en: ["only when BlueMap runs inside a Minecraft server process", "this desktop app never"],
        yue: ["淨係", "BlueMap 跑喺 Minecraft server process", "呢個桌面 app 從來"],
    },
    "glossary.term.renderThread": {
        en: ["how many CPU threads render tiles at once"],
        yue: ["幾多條 CPU thread 一齊 render tile"],
    },
    "glossary.term.reaches": {
        en: ["world, dimension, name, sort order, starting position and storage"],
        yue: ["world、dimension、name、sort order、starting position 同 storage"],
    },
    "glossary.term.engine": {
        en: ["BlueMap's own Java engine", "Java runtime"],
        yue: ["BlueMap 自己個 Java engine", "Java runtime"],
    },
    "glossary.term.profile": {
        en: ["a map already rendered on this computer", "someone else's BlueMap web server"],
        yue: ["已經喺呢部電腦 render 咗嘅 map", "第二個人 BlueMap web server"],
    },
    "glossary.term.blueMapUrl": {
        en: ["already running somewhere else", "nothing is rendered here"],
        yue: ["已經喺第二個地方跑緊", "唔會為佢 render"],
    },
} as const satisfies Record<
    keyof typeof GLOSSARY_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
