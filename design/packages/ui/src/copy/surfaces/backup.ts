/**
 * The backups screen: choosing what to back up, choosing where it goes, watching one
 * happen, and reading the list of the ones a repository already holds.
 *
 * This surface is the consequence-heavy one in the catalogue, and the funny levels are held
 * tighter here than anywhere else because of two facts about what it does.
 *
 * **A backup is only as good as the thing that proves it came back whole.** Every part
 * carries its own SHA-256 in a pointer file beside it, and every sentence that mentions a
 * restore says so. `backup.listings.incompleteDetail` is the sharp end of that: the parts
 * are up there and the pointer is not, which means there is nothing to verify a restore
 * against. No level is allowed to round that up to "finished" or down to "broken". It is
 * exactly what it says: unverifiable, and resumable.
 *
 * **A backup goes somewhere, and where can be public.** `backup.blocked.public` and
 * `backup.acknowledgePublic` are the pair that stands between a world full of somebody's
 * builds and the whole internet, so PUBLIC stays shouted and "anybody" stays in the
 * sentence at every level, in both languages.
 *
 * ## Two near-duplicate pairs that are deliberately near-duplicates
 *
 * `backup.blocked.write` and `backup.readOnly` say the same refusal in two places: the
 * first is the one line under a greyed-out button explaining which of six gates is shut,
 * the second is the alert beside the repository that was just read. They are worded
 * differently on purpose, so that seeing both at once does not read as the app repeating
 * itself. Likewise `backup.row.failed` and `backup.listings.incomplete` are both "Did not
 * finish", because from the reader's side they are the same news about two different
 * objects: a run that stopped, and a release that never got its pointer.
 *
 * `backup.restoreHandoff` is *not* here. It belongs to `chrome.ts`, because it is what the
 * shell says after it has moved the reader to the Downloads surface, not what this screen
 * says.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const BACKUP_VOICED = {
    /* ---------------------------------------------------------------- */
    /* What this screen is, and why it is built the way it is           */
    /* ---------------------------------------------------------------- */

    /*
     * The two paragraphs at the top of the screen. `500 MiB`, `SHA-256` and "a new GitHub
     * release" are the mechanism, not decoration: somebody who wants to fetch a backup
     * without this application needs all three to know what they are looking at.
     */
    "backup.blurb": {
        en: [
            "A backup is packed into one archive, cut into 500 MiB parts, and published as the assets of a new GitHub release. Every part carries its own SHA-256 in a small pointer file beside it, so a restore can prove it got back exactly what went up.",
            "A backup is packed into one archive, cut into 500 MiB parts, and published as the assets of a new GitHub release. Every part carries its own SHA-256 in a small pointer file beside it, so a restore can prove it got back exactly what went up.",
            "A backup is packed into one archive, cut into 500 MiB parts, and published as the assets of a new GitHub release. Every part carries its own SHA-256 in a small pointer file beside it, so a restore can prove it got back exactly what went up, byte for byte.",
            "A backup is packed into one archive, cut into 500 MiB parts, and published as the assets of a new GitHub release. Every part travels with its own SHA-256 in a small pointer file beside it, so a restore can prove it got back exactly what went up rather than merely hope so.",
            "A backup is packed into one archive, chopped into 500 MiB parts, and published as the assets of a new GitHub release. Every part travels with its own SHA-256 in a small pointer file beside it, so a restore can prove it got back exactly what went up, byte for byte, instead of taking the network's word for it.",
        ],
        yue: [
            "一份備份會打包成一個 archive，切成每份 500 MiB 嘅部分，再以一個新嘅 GitHub release 嘅 asset 形式發佈。每一部分旁邊都有個細細嘅 pointer 檔帶住佢自己嘅 SHA-256，所以還原嗰陣可以證明攞返嚟嘅同上載嗰陣一模一樣。",
            "一份備份會打包成一個 archive，切成每份 500 MiB 嘅部分，再以一個新嘅 GitHub release 嘅 asset 形式發佈。每一部分旁邊都有個細細嘅 pointer 檔帶住佢自己嘅 SHA-256，所以還原嗰陣可以證明攞返嚟嘅同上載嗰陣一模一樣。",
            "一份備份會打包成一個 archive，切成每份 500 MiB 嘅部分，再以一個新嘅 GitHub release 嘅 asset 形式發佈。每一部分旁邊都有個細細嘅 pointer 檔帶住佢自己嘅 SHA-256，所以還原嗰陣可以證明攞返嚟嘅同上載嗰陣一模一樣，一個位元組都唔差。",
            "一份備份會打包成一個 archive，切成每份 500 MiB 嘅部分，再以一個新嘅 GitHub release 嘅 asset 形式發佈。每一部分都帶埋自己嘅 SHA-256 喺旁邊個細 pointer 檔度，所以還原嗰陣可以證明攞返嚟嘅同上載嗰陣一模一樣，唔使靠估。",
            "一份備份會打包成一個 archive，剁成每份 500 MiB 嘅部分，再以一個新嘅 GitHub release 嘅 asset 形式發佈。每一部分都帶埋自己嘅 SHA-256 喺旁邊個細 pointer 檔度，所以還原嗰陣可以證明攞返嚟嘅同上載嗰陣一模一樣，一個位元組都唔差，唔使信個網絡講咩就係咩。",
        ],
    },
    /*
     * "Why is there no LFS button" is a reasonable thing to wonder and an unanswerable one,
     * so the screen answers it. The numbers are the whole argument: drop the gigabyte
     * figures and the paragraph becomes an opinion.
     */
    "backup.whyNotLfs": {
        en: [
            "This deliberately does not use Git LFS. A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth a month, and every restore is metered against it, so a single multi-gigabyte world exhausts the free tier and each restore is billed again. Release assets are free on a public repository and capped per file rather than in total. The pointer format matches Desktop Material's published Cheap LFS v1 grammar, checked against it here; a live restore through that application has not been run.",
            "This deliberately does not use Git LFS. A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth a month, and every restore is metered against it, so a single multi-gigabyte world exhausts the free tier and each restore is billed again. Release assets are free on a public repository and capped per file rather than in total. The pointer format matches Desktop Material's published Cheap LFS v1 grammar, checked against it here; a live restore through that application has not been run.",
            "This deliberately does not use Git LFS. A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth a month, and every restore is metered against it, so a single multi-gigabyte world exhausts the free tier on its own and each restore is billed again. Release assets are free on a public repository and capped per file rather than in total. The pointer format matches Desktop Material's published Cheap LFS v1 grammar, checked against it line by line here; nobody has actually run a backup made here through that application's own restore yet.",
            "This deliberately does not use Git LFS, and the arithmetic is why. A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth a month, every restore is metered against it, and a single multi-gigabyte world eats the free tier whole and then bills you again on the way back out. Release assets are free on a public repository and capped per file rather than in total. The pointer format matches Desktop Material's published Cheap LFS v1 grammar, verified against it line by line here; whether a backup made here restores through that application has not actually been tried.",
            "This deliberately does not use Git LFS, and the arithmetic is the entire reason. A free GitHub account gets one gigabyte of LFS storage and one gigabyte of bandwidth a month, every restore is metered against it, and a single multi-gigabyte world eats the free tier whole and then charges you again every time you want it back. Release assets are free on a public repository and capped per file rather than in total, which is a far better deal for a world that is mostly chunks. The pointer format matches Desktop Material's published Cheap LFS v1 grammar, verified against it line by line here, though nobody has actually walked a backup made here through that application's own restore button yet.",
        ],
        yue: [
            "呢度係特登唔用 Git LFS。免費 GitHub 帳戶得 1 GB LFS 儲存空間同每個月 1 GB 頻寬，而且每次還原都會計落去，所以一個幾 GB 大嘅世界就已經食晒個免費額，之後每次還原都要再畀錢。Release asset 喺公開儲存庫係免費嘅，而且係逐個檔案限大細，唔係計總數。個 pointer 格式同 Desktop Material 公開嘅 Cheap LFS v1 文法脗合，喺呢度驗證過；但未曾真係用嗰個 app 還原過一次。",
            "呢度係特登唔用 Git LFS。免費 GitHub 帳戶得 1 GB LFS 儲存空間同每個月 1 GB 頻寬，而且每次還原都會計落去，所以一個幾 GB 大嘅世界就已經食晒個免費額，之後每次還原都要再畀錢。Release asset 喺公開儲存庫係免費嘅，而且係逐個檔案限大細，唔係計總數。個 pointer 格式同 Desktop Material 公開嘅 Cheap LFS v1 文法脗合，喺呢度驗證過；但未曾真係用嗰個 app 還原過一次。",
            "呢度係特登唔用 Git LFS。免費 GitHub 帳戶得 1 GB LFS 儲存空間同每個月 1 GB 頻寬，而且每次還原都會計落去，所以淨係一個幾 GB 大嘅世界就已經食晒個免費額，之後每次還原都要再畀錢。Release asset 喺公開儲存庫係免費嘅，而且係逐個檔案限大細，唔係計總數。個 pointer 格式同 Desktop Material 公開嘅 Cheap LFS v1 文法逐行對過，喺呢度驗證過；但從未真係攞呢度整嘅備份去嗰個 app 度還原過。",
            "呢度係特登唔用 Git LFS，計條數就明。免費 GitHub 帳戶得 1 GB LFS 儲存空間同每個月 1 GB 頻寬，每次還原都會計落去，一個幾 GB 大嘅世界一啖就食晒個免費額，跟住你想攞返出嚟仲要再畀多次錢。Release asset 喺公開儲存庫係免費嘅，而且係逐個檔案限大細，唔係計總數。個 pointer 格式同 Desktop Material 公開嘅 Cheap LFS v1 文法逐行對過，喺呢度驗證過；但呢度整嘅備份可唔可以喺嗰個 app 度還原返，從未試過。",
            "呢度係特登唔用 Git LFS，成個理由就係計條數。免費 GitHub 帳戶得 1 GB LFS 儲存空間同每個月 1 GB 頻寬，每次還原都會計落去，一個幾 GB 大嘅世界一啖就食晒個免費額，之後你每次想攞返出嚟都要再畀多次錢。Release asset 喺公開儲存庫係免費嘅，而且係逐個檔案限大細，唔係計總數，對住一個成身都係 chunk 嘅世界抵好多。個 pointer 格式同 Desktop Material 公開嘅 Cheap LFS v1 文法逐行對過，喺呢度驗證過；但從未真係㩒過嗰個 app 嘅還原掣，試吓呢度整嘅備份過唔過到骨。",
        ],
    },
    /*
     * Shown instead of the whole screen in a browser tab. It names all three things the
     * desktop application does that a tab cannot, because "not supported" on its own reads
     * as a bug rather than as a boundary.
     */
    "backup.unsupported": {
        en: [
            "This build cannot make a backup. The desktop application is what packs the folder, splits it and uploads the parts with your GitHub sign-in; a browser tab can do none of those. Open this in the desktop app, and sign in to GitHub from Settings.",
            "This build cannot make a backup. The desktop application is what packs the folder, splits it and uploads the parts with your GitHub sign-in; a browser tab can do none of those. Open this in the desktop app, and sign in to GitHub from Settings.",
            "This build cannot make a backup. The desktop application is what packs the folder, splits it and uploads the parts with your GitHub sign-in, and a browser tab can do none of those three. Open this in the desktop app, and sign in to GitHub from Settings.",
            "This build cannot make a backup. Packing the folder, splitting it and uploading the parts with your GitHub sign-in are all jobs for the desktop application, and a browser tab can do none of them. Open this in the desktop app, and sign in to GitHub from Settings.",
            "This build cannot make a backup, and no amount of asking nicely will change it. Packing the folder, splitting it and uploading the parts with your GitHub sign-in are all jobs for the desktop application, and a browser tab can do precisely none of them. Open this in the desktop app, and sign in to GitHub from Settings.",
        ],
        yue: [
            "呢個版本整唔到備份。打包資料夾、切開佢、再用你嘅 GitHub 登入上傳啲部分，全部都係桌面應用程式做嘅；瀏覽器分頁一樣都做唔到。請喺桌面應用程式度開返呢一頁，再喺設定度登入 GitHub。",
            "呢個版本整唔到備份。打包資料夾、切開佢、再用你嘅 GitHub 登入上傳啲部分，全部都係桌面應用程式做嘅；瀏覽器分頁一樣都做唔到。請喺桌面應用程式度開返呢一頁，再喺設定度登入 GitHub。",
            "呢個版本整唔到備份。打包資料夾、切開佢、再用你嘅 GitHub 登入上傳啲部分，全部都係桌面應用程式做嘅，而瀏覽器分頁呢三樣一樣都做唔到。請喺桌面應用程式度開返呢一頁，再喺設定度登入 GitHub。",
            "呢個版本整唔到備份。打包資料夾、切開佢、用你嘅 GitHub 登入上傳啲部分，樣樣都係桌面應用程式嘅工作，瀏覽器分頁一樣都掂唔到。請喺桌面應用程式度開返呢一頁，再喺設定度登入 GitHub。",
            "呢個版本整唔到備份，好聲好氣求佢都冇用。打包資料夾、切開佢、用你嘅 GitHub 登入上傳啲部分，樣樣都係桌面應用程式嘅工作，瀏覽器分頁一樣都掂唔到，一樣都冇。請喺桌面應用程式度開返呢一頁，再喺設定度登入 GitHub。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Reading the folder, and what is in it                            */
    /* ---------------------------------------------------------------- */

    "backup.reading": {
        en: [
            "Reading the folder...",
            "Reading the folder...",
            "Reading the folder now...",
            "Reading the folder, counting what is in it...",
            "Reading the folder, counting what is in it, one file at a time...",
        ],
        yue: [
            "讀緊個資料夾...",
            "讀緊個資料夾...",
            "而家讀緊個資料夾...",
            "讀緊個資料夾，數緊入面有咩...",
            "讀緊個資料夾，一個檔一個檔咁數緊入面有咩...",
        ],
    },
    /*
     * The line that reports what a folder holds. Its last clause is the load-bearing one:
     * reading a folder is not backing it up, and a reader who stops here has done nothing
     * yet. That clause survives every level.
     */
    "backup.sourceSummary": {
        en: [
            "{label}: {files} files, {size}. Nothing has been packed or uploaded yet.",
            "{label}: {files} files, {size}. Nothing has been packed or uploaded yet.",
            "{label}: {files} files, {size}. This is only what the folder holds; nothing has been packed or uploaded yet.",
            "{label}, {files} files, {size}. That is only what the folder holds: nothing has been packed or uploaded yet.",
            "{label}, {files} files, {size}. That is only what the folder holds, counted and nothing more, and so far nothing has been packed or uploaded yet.",
        ],
        yue: [
            "{label}：{files} 個檔案，{size}。而家仲未打包過，亦都未上傳過。",
            "{label}：{files} 個檔案，{size}。而家仲未打包過，亦都未上傳過。",
            "{label}：{files} 個檔案，{size}。呢個只係個資料夾入面有咩，仲未打包過，亦都未上傳過。",
            "{label}，{files} 個檔案，{size}。呢個只係個資料夾入面有咩，數咗出嚟啫，仲未打包過，亦都未上傳過。",
            "{label}，{files} 個檔案，{size}。呢個只係個資料夾入面有咩，淨係數咗出嚟啫，到目前為止仲未打包過，亦都未上傳過。",
        ],
    },
    "backup.skipped": {
        en: [
            "{n} item(s) will be left out of the backup:",
            "{n} item(s) will be left out of the backup:",
            "{n} item(s) will be left out of the backup, and here they are:",
            "{n} item(s) will be left out of the backup. Named below, so nothing goes missing quietly:",
            "{n} item(s) will be left out of the backup. Every one of them named below, because a backup that quietly skips things is not a backup:",
        ],
        yue: [
            "有 {n} 樣嘢唔會入到份備份入面：",
            "有 {n} 樣嘢唔會入到份備份入面：",
            "有 {n} 樣嘢唔會入到份備份入面，就係下面呢啲：",
            "有 {n} 樣嘢唔會入到份備份入面。下面列晒出嚟，唔會靜靜雞唔見咗：",
            "有 {n} 樣嘢唔會入到份備份入面。下面逐樣列晒出嚟，因為靜靜雞漏低嘢嘅備份，根本唔算係備份：",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Where it goes, and the gates in front of the button              */
    /* ---------------------------------------------------------------- */

    "backup.loadingRepositories": {
        en: [
            "Reading your repositories...",
            "Reading your repositories...",
            "Reading your repositories from GitHub...",
            "Reading your repositories from GitHub. This takes as long as GitHub takes...",
            "Reading your repositories from GitHub. It takes exactly as long as GitHub feels like taking...",
        ],
        yue: [
            "讀緊你嘅儲存庫...",
            "讀緊你嘅儲存庫...",
            "喺 GitHub 度讀緊你嘅儲存庫...",
            "喺 GitHub 度讀緊你嘅儲存庫。GitHub 用幾耐，呢度就等幾耐...",
            "喺 GitHub 度讀緊你嘅儲存庫。GitHub 想幾快就幾快，呢度淨係識等...",
        ],
    },
    "backup.checking": {
        en: [
            "Reading the repository...",
            "Reading the repository...",
            "Reading the repository and its permissions...",
            "Reading the repository, and what this sign-in may do to it...",
            "Reading the repository, and what this sign-in is actually allowed to do to it...",
        ],
        yue: [
            "讀緊個儲存庫...",
            "讀緊個儲存庫...",
            "讀緊個儲存庫同佢嘅權限...",
            "讀緊個儲存庫，睇下呢個登入可以對佢做啲咩...",
            "讀緊個儲存庫，睇下呢個登入實際上有咩資格對佢做嘢...",
        ],
    },
    /*
     * The alert beside a repository that was just read and cannot be written to. Its twin
     * `backup.blocked.write` says the same refusal under the greyed-out button, so the two
     * are worded apart on purpose: seeing both at once should read as two facts rather than
     * as the application stuttering.
     */
    "backup.readOnly": {
        en: [
            "The signed-in account cannot write to {name}, so it cannot publish a release there.",
            "The signed-in account cannot write to {name}, so it cannot publish a release there.",
            "The signed-in account cannot write to {name}, so it cannot publish a release there. Reading it worked; writing to it will not.",
            "The signed-in account can read {name} but cannot write to it, so it cannot publish a release there.",
            "The signed-in account got as far as reading {name} and no further: it cannot write to it, so it cannot publish a release there.",
        ],
        yue: [
            "而家登入咗嘅帳戶寫入唔到 {name}，所以喺嗰度發佈唔到 release。",
            "而家登入咗嘅帳戶寫入唔到 {name}，所以喺嗰度發佈唔到 release。",
            "而家登入咗嘅帳戶寫入唔到 {name}，所以喺嗰度發佈唔到 release。讀就讀得到，寫就唔得。",
            "而家登入咗嘅帳戶讀到 {name}，但係寫入唔到，所以喺嗰度發佈唔到 release。",
            "而家登入咗嘅帳戶讀到 {name} 就停咗喺度：佢寫入唔到，所以喺嗰度發佈唔到 release。",
        ],
    },
    /*
     * The consent sentence itself, and the only thing standing between somebody's world and
     * the whole internet. "public" and "anybody" are in all ten strings: a tickbox whose
     * label has been charmed into vagueness is a tickbox nobody consented with.
     */
    "backup.acknowledgePublic": {
        en: [
            "I understand this repository is public, and that anybody will be able to download this backup.",
            "I understand this repository is public, and that anybody will be able to download this backup.",
            "I understand this repository is public, and that anybody at all will be able to download this backup.",
            "I understand this repository is public: anybody will be able to download this backup, not only me.",
            "I understand this repository is public, so anybody will be able to download this backup: not only me, and not only today.",
        ],
        yue: [
            "我明白呢個儲存庫係公開嘅，任何人都可以下載到呢份備份。",
            "我明白呢個儲存庫係公開嘅，任何人都可以下載到呢份備份。",
            "我明白呢個儲存庫係公開嘅，任何人，真係任何人，都可以下載到呢份備份。",
            "我明白呢個儲存庫係公開嘅：任何人都下載到呢份備份，唔止我一個。",
            "我明白呢個儲存庫係公開嘅，所以任何人都下載到呢份備份，唔止我一個，亦都唔止今日。",
        ],
    },

    /*
     * The six reasons the start button is grey, in the order somebody meets them. Each one
     * has to say what to do about it, because the button itself says nothing at all.
     */
    "backup.blocked.unsupported": {
        en: [
            "This build cannot publish a backup.",
            "This build cannot publish a backup.",
            "This build cannot publish a backup at all.",
            "This build cannot publish a backup, so the button stays grey.",
            "This build cannot publish a backup, which is why the button is sitting there grey and unbothered.",
        ],
        yue: [
            "呢個版本發佈唔到備份。",
            "呢個版本發佈唔到備份。",
            "呢個版本根本發佈唔到備份。",
            "呢個版本發佈唔到備份，所以個掣灰晒。",
            "呢個版本發佈唔到備份，所以個掣灰灰哋坐喺度，撳極都唔會郁。",
        ],
    },
    "backup.blocked.source": {
        en: [
            "Choose the world or folder to back up first.",
            "Choose the world or folder to back up first.",
            "Choose the world or folder to back up before this can start.",
            "Nothing has been chosen yet. Pick the world or folder to back up first.",
            "Nothing has been chosen yet, so there is nothing to pack. Pick the world or folder to back up first.",
        ],
        yue: [
            "先揀定要備份嘅世界或者資料夾。",
            "先揀定要備份嘅世界或者資料夾。",
            "要開始之前，先揀定要備份嘅世界或者資料夾。",
            "而家乜都未揀。先揀定要備份嘅世界或者資料夾。",
            "而家乜都未揀，所以根本冇嘢可以打包。先揀定要備份嘅世界或者資料夾。",
        ],
    },
    "backup.blocked.repository": {
        en: [
            "Check the repository first, so its permissions are known.",
            "Check the repository first, so its permissions are known.",
            "Check the repository first, so its permissions are known before anything is uploaded.",
            "The repository has not been checked yet, so its permissions are not known. Check it first.",
            "The repository has not been checked yet, so its permissions are anybody's guess. Check it first, before a single byte goes anywhere.",
        ],
        yue: [
            "先檢查個儲存庫，咁先知佢嘅權限。",
            "先檢查個儲存庫，咁先知佢嘅權限。",
            "先檢查個儲存庫，咁先至知佢嘅權限，然後先上傳。",
            "個儲存庫仲未檢查過，所以佢嘅權限係未知數。要先檢查佢。",
            "個儲存庫仲未檢查過，佢嘅權限而家係靠估。上傳一個位元組之前，先檢查佢。",
        ],
    },
    "backup.blocked.write": {
        en: [
            "This GitHub sign-in cannot write to {repository}, so it cannot publish a release there.",
            "This GitHub sign-in cannot write to {repository}, so it cannot publish a release there.",
            "This GitHub sign-in cannot write to {repository}, so it cannot publish a release there at all.",
            "This GitHub sign-in cannot write to {repository}. No write, no release: a backup has nowhere to go.",
            "This GitHub sign-in cannot write to {repository}. No write, no release, and a backup with nowhere to go is not a backup.",
        ],
        yue: [
            "呢個 GitHub 登入寫入唔到 {repository}，所以喺嗰度發佈唔到 release。",
            "呢個 GitHub 登入寫入唔到 {repository}，所以喺嗰度發佈唔到 release。",
            "呢個 GitHub 登入寫入唔到 {repository}，所以根本喺嗰度發佈唔到 release。",
            "呢個 GitHub 登入寫入唔到 {repository}。寫唔到就出唔到 release，備份就冇地方擺。",
            "呢個 GitHub 登入寫入唔到 {repository}。寫唔到就出唔到 release，而冇地方擺嘅備份，唔算係備份。",
        ],
    },
    "backup.blocked.public": {
        en: [
            "Confirm that you mean to publish this to a PUBLIC repository, where anybody could download it.",
            "Confirm that you mean to publish this to a PUBLIC repository, where anybody could download it.",
            "Confirm that you mean to publish this to a PUBLIC repository, where anybody at all could download it.",
            "This repository is PUBLIC. Tick the box to confirm you mean it, because anybody could download this backup.",
            "This repository is PUBLIC, which means the whole internet rather than just you. Tick the box to confirm you mean it, because anybody could download this backup.",
        ],
        yue: [
            "請確認你係有心將呢個發佈到一個 PUBLIC 嘅儲存庫，任何人都可以下載到。",
            "請確認你係有心將呢個發佈到一個 PUBLIC 嘅儲存庫，任何人都可以下載到。",
            "請確認你係有心將呢個發佈到一個 PUBLIC 嘅儲存庫，任何人都可以下載到佢。",
            "呢個儲存庫係 PUBLIC。剔咗個格確認你係有心咁做，因為任何人都可以下載到呢份備份。",
            "呢個儲存庫係 PUBLIC，即係成個互聯網，唔止你一個。剔咗個格確認你係有心咁做，因為任何人都下載得到呢份備份。",
        ],
    },
    "backup.blocked.starting": {
        en: [
            "Already starting.",
            "Already starting.",
            "It is already starting.",
            "It is already starting; one press was enough.",
            "It is already starting. One press was enough, and the second one went nowhere.",
        ],
        yue: [
            "已經開始緊。",
            "已經開始緊。",
            "佢已經開始緊喇。",
            "佢已經開始緊喇，撳一次就夠。",
            "佢已經開始緊喇。撳一次就夠，第二下係撳咗落空氣。",
        ],
    },
    "backup.starting": {
        en: [
            "Starting...",
            "Starting...",
            "Starting it up...",
            "Starting it up now...",
            "Starting. Give it a moment before pressing anything else...",
        ],
        yue: [
            "開始緊...",
            "開始緊...",
            "而家開始緊...",
            "而家開始緊，等陣先...",
            "而家開始緊，等陣先，唔好住撳其他嘢...",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* One backup, while it runs and after it ends                      */
    /* ---------------------------------------------------------------- */

    "backup.row.stopping": {
        en: [
            "Stopping...",
            "Stopping...",
            "Stopping it...",
            "Stopping it. Already asked...",
            "Stopping it. The ask is in, and it stops when it stops...",
        ],
        yue: [
            "停緊...",
            "停緊...",
            "停緊佢...",
            "停緊佢。已經出咗聲...",
            "停緊佢。要求已經出咗，佢幾時停就幾時停...",
        ],
    },
    /*
     * Shown instead of the stop button on a build that has no cancel. "It will finish, or
     * fail, on its own" is the actionable half: there is nothing to press, and knowing that
     * is the difference between waiting and hunting for a control that does not exist.
     */
    "backup.row.cannotStop": {
        en: [
            "This build cannot stop a backup once it has started. It will finish, or fail, on its own.",
            "This build cannot stop a backup once it has started. It will finish, or fail, on its own.",
            "This build cannot stop a backup once it has started, and there is no button here that changes that. It will finish, or fail, on its own.",
            "This build cannot stop a backup once it has started. No button here changes that: it will finish, or fail, on its own.",
            "This build cannot stop a backup once it has started, and no amount of clicking will change that. It will finish, or fail, on its own, in its own time.",
        ],
        yue: [
            "呢個版本一旦開始咗備份就停唔到。佢會自己完成，或者自己失敗。",
            "呢個版本一旦開始咗備份就停唔到。佢會自己完成，或者自己失敗。",
            "呢個版本一旦開始咗備份就停唔到，呢度冇掣可以改變呢件事。佢會自己完成，或者自己失敗。",
            "呢個版本一旦開始咗備份就停唔到，撳咩掣都冇用。佢會自己完成，或者自己失敗。",
            "呢個版本一旦開始咗備份就停唔到，撳到隻手軟都一樣。佢會自己完成，或者自己失敗，幾時完佢話事。",
        ],
    },
    /*
     * The success line, and the one place a level is tempted to say "done" and stop. The
     * SHA-256 clause is why the backup is worth anything, so it stays: what makes this a
     * backup rather than a pile of uploads is that a restore can check it.
     */
    "backup.row.finishedDetail": {
        en: [
            "{archive}, {size}, in {parts} release asset(s). Every part carries its own SHA-256 in the pointer beside it, so a restore can check what it fetched.",
            "{archive}, {size}, in {parts} release asset(s). Every part carries its own SHA-256 in the pointer beside it, so a restore can check what it fetched.",
            "{archive}, {size}, in {parts} release asset(s). Every part carries its own SHA-256 in the pointer beside it, so a restore can check what it actually fetched.",
            "{archive}, {size}, spread across {parts} release asset(s). Every part carries its own SHA-256 in the pointer beside it, so a restore can check what it actually fetched rather than hope.",
            "{archive}, {size}, spread across {parts} release asset(s) and up there for good. Every part carries its own SHA-256 in the pointer beside it, so a restore can check what it actually fetched rather than take the internet's word for it.",
        ],
        yue: [
            "{archive}，{size}，分成 {parts} 個 release asset。每一部分喺旁邊嘅 pointer 都帶住自己嘅 SHA-256，所以還原嗰陣可以核對攞返嚟嘅嘢。",
            "{archive}，{size}，分成 {parts} 個 release asset。每一部分喺旁邊嘅 pointer 都帶住自己嘅 SHA-256，所以還原嗰陣可以核對攞返嚟嘅嘢。",
            "{archive}，{size}，分成 {parts} 個 release asset。每一部分喺旁邊嘅 pointer 都帶住自己嘅 SHA-256，所以還原嗰陣可以核對真正攞返嚟嘅係咩。",
            "{archive}，{size}，攤開喺 {parts} 個 release asset 度。每一部分喺旁邊嘅 pointer 都帶住自己嘅 SHA-256，所以還原嗰陣可以核對真正攞返嚟嘅係咩，唔使靠估。",
            "{archive}，{size}，攤開喺 {parts} 個 release asset 度，穩穩陣陣擺住。每一部分喺旁邊嘅 pointer 都帶住自己嘅 SHA-256，所以還原嗰陣可以核對真正攞返嚟嘅係咩，唔使信個網講咩就係咩。",
        ],
    },
    /*
     * A stop is not a loss, and this sentence is the whole reason stopping is safe to press.
     * Every level keeps both halves: what was packed and uploaded is kept, and carrying on
     * resumes rather than restarts.
     */
    "backup.row.cancelledDetail": {
        en: [
            "Stopped. Everything already packed and everything already uploaded is kept, so carrying on continues from where it got to rather than starting over.",
            "Stopped. Everything already packed and everything already uploaded is kept, so carrying on continues from where it got to rather than starting over.",
            "Stopped. Everything already packed and everything already uploaded is kept, so carrying on continues from where it got to rather than starting over from nothing.",
            "Stopped, and nothing thrown away. Everything already packed and everything already uploaded is kept, so carrying on continues from where it got to rather than starting over from nothing.",
            "Stopped, and not one packed byte thrown away. Everything already packed and everything already uploaded is kept, so carrying on picks up from where it got to rather than starting over from nothing.",
        ],
        yue: [
            "已經停咗。已經打包好同已經上傳咗嘅嘢全部保留，所以繼續做落去會由停低嗰個位接返落去，唔使由頭嚟過。",
            "已經停咗。已經打包好同已經上傳咗嘅嘢全部保留，所以繼續做落去會由停低嗰個位接返落去，唔使由頭嚟過。",
            "已經停咗，冇嘢掉咗。已經打包好同已經上傳咗嘅嘢全部保留，所以繼續做落去會由停低嗰個位接返落去，唔使由頭嚟過。",
            "已經停咗，一樣嘢都冇掉。已經打包好同已經上傳咗嘅嘢全部保留，所以繼續做落去會由停低嗰個位接返落去，唔使由頭嚟過。",
            "已經停咗，連一個打包好嘅位元組都冇掉。已經打包好同已經上傳咗嘅嘢全部保留，所以繼續做落去會由停低嗰個位接返落去，完全唔使由頭嚟過。",
        ],
    },
    /*
     * The fallback for a refused credential when the shell cannot open the settings row
     * itself. It has to name the place, because with no button on screen the sentence is
     * the only route back.
     */
    "backup.row.signInWhere": {
        en: [
            "Sign in to GitHub again from Settings, then start this backup again.",
            "Sign in to GitHub again from Settings, then start this backup again.",
            "Sign in to GitHub again from Settings, then start this backup again from here.",
            "The way back is Settings: sign in to GitHub again there, then start this backup again.",
            "The way back is Settings: sign in to GitHub again there, then start this backup again. Nothing else on this card will do it for you.",
        ],
        yue: [
            "喺設定度再登入一次 GitHub，然後再開始呢個備份。",
            "喺設定度再登入一次 GitHub，然後再開始呢個備份。",
            "喺設定度再登入一次 GitHub，然後喺呢度再開始呢個備份。",
            "出路喺設定度：喺嗰度再登入一次 GitHub，然後再開始呢個備份。",
            "出路喺設定度：喺嗰度再登入一次 GitHub，然後再開始呢個備份。呢張卡上面冇第二個掣幫到你。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The backups a repository already holds                           */
    /* ---------------------------------------------------------------- */

    "backup.listings.reading": {
        en: [
            "Reading the repository's releases...",
            "Reading the repository's releases...",
            "Reading the repository's releases, looking for backups...",
            "Reading the repository's releases, looking for the ones that carry a backup...",
            "Reading the repository's releases, sifting the ones that carry a backup from the ones that do not...",
        ],
        yue: [
            "讀緊個儲存庫嘅 release...",
            "讀緊個儲存庫嘅 release...",
            "讀緊個儲存庫嘅 release，搵緊備份...",
            "讀緊個儲存庫嘅 release，搵緊邊啲係帶住備份嘅...",
            "讀緊個儲存庫嘅 release，喺入面篩緊邊啲帶住備份，邊啲唔係...",
        ],
    },
    /*
     * An empty list here is an easy place to alarm somebody: a repository full of releases
     * showing "no backups" reads as a scan that failed. `backup.json` is the actual rule and
     * is named at every level, along with the promise that the other releases were left
     * alone rather than examined and rejected.
     */
    "backup.listings.none": {
        en: [
            "There are no backups in this repository yet. Releases it holds for other reasons are left alone; only a release carrying a backup.json is one of these.",
            "There are no backups in this repository yet. Releases it holds for other reasons are left alone; only a release carrying a backup.json is one of these.",
            "There are no backups in this repository yet. Releases it holds for other reasons are left alone; only a release carrying a backup.json counts as one of these.",
            "No backups in this repository yet. Releases it holds for other reasons are left alone entirely; only a release carrying a backup.json counts as one of these.",
            "No backups in this repository yet. Whatever releases it holds for other reasons are left alone entirely, untouched and unbothered; only a release carrying a backup.json counts as one of these.",
        ],
        yue: [
            "呢個儲存庫入面暫時仲未有備份。佢因為其他原因而擺住嘅 release 一律唔會郁；只有帶住 backup.json 嘅 release 先算係呢類嘢。",
            "呢個儲存庫入面暫時仲未有備份。佢因為其他原因而擺住嘅 release 一律唔會郁；只有帶住 backup.json 嘅 release 先算係呢類嘢。",
            "呢個儲存庫入面暫時仲未有備份。佢因為其他原因而擺住嘅 release 一律唔會郁；只有帶住 backup.json 嘅 release 先至算係呢類嘢。",
            "呢個儲存庫入面暫時仲未有備份。佢因為其他原因而擺住嘅 release 完全唔會郁；只有帶住 backup.json 嘅 release 先至算係呢類嘢。",
            "呢個儲存庫入面暫時仲未有備份。佢因為其他原因而擺住嘅 release 完全唔會郁，唔會掂亦都唔會嘈到佢哋；只有帶住 backup.json 嘅 release 先至算係呢類嘢。",
        ],
    },
    "backup.listings.noMatch": {
        en: [
            "No backup in this repository matches that search. Clearing it brings them all back; none of them was removed.",
            "No backup in this repository matches that search. Clearing it brings them all back; none of them was removed.",
            "No backup in this repository matches that search. Clearing the search brings them all back; none of them was removed.",
            "Nothing in this repository matches that search. Clearing the search brings them all back, because none of them was removed.",
            "Nothing in this repository matches that search. The backups are all still sitting there. Clearing the search brings them back, because none of them was removed.",
        ],
        yue: [
            "呢個儲存庫入面冇備份符合呢個搜尋。清走個搜尋就全部返晒嚟；一個都冇刪走過。",
            "呢個儲存庫入面冇備份符合呢個搜尋。清走個搜尋就全部返晒嚟；一個都冇刪走過。",
            "呢個儲存庫入面冇備份符合呢個搜尋。清走個搜尋條件就全部返晒嚟；一個都冇刪走過。",
            "呢個儲存庫入面冇嘢符合呢個搜尋。清走個搜尋條件就全部返晒嚟，因為一個都冇刪走過。",
            "呢個儲存庫入面冇嘢符合呢個搜尋。啲備份全部仲好地地喺度：清走個搜尋條件就返晒嚟，因為一個都冇刪走過。",
        ],
    },
    /*
     * The sharpest sentence on the screen. A backup whose parts went up and whose pointer
     * did not is neither finished nor lost, and both halves of that are facts: there is
     * nothing to verify a restore against, and backing the same folder up again resumes it.
     * No level may round this to "done" or to "gone".
     */
    "backup.listings.incompleteDetail": {
        en: [
            "The parts are there but the pointer that names and checksums them never went up, so there is nothing to verify a restore against. Backing the same folder up again carries this one on rather than starting over.",
            "The parts are there but the pointer that names and checksums them never went up, so there is nothing to verify a restore against. Backing the same folder up again carries this one on rather than starting over.",
            "The parts are up there, but the pointer that names and checksums them never followed, so there is nothing to verify a restore against. Backing the same folder up again carries this one on rather than starting over.",
            "The parts made it; the pointer that names and checksums them did not. That leaves nothing to verify a restore against, so this one is not finished. Backing the same folder up again carries this one on rather than starting over.",
            "The parts made it up there and then the pointer that names and checksums them never followed them home. That leaves nothing to verify a restore against, so nobody here is calling this finished. Backing the same folder up again carries this one on rather than starting over.",
        ],
        yue: [
            "啲部分係喺度，但係嗰個負責記低佢哋個名同 checksum 嘅 pointer 從來冇上到，所以冇嘢可以核對還原返嚟嘅嘢。將同一個資料夾再備份一次會接住呢個做落去，唔係由頭嚟過。",
            "啲部分係喺度，但係嗰個負責記低佢哋個名同 checksum 嘅 pointer 從來冇上到，所以冇嘢可以核對還原返嚟嘅嘢。將同一個資料夾再備份一次會接住呢個做落去，唔係由頭嚟過。",
            "啲部分係上到咗，但係嗰個負責記低佢哋個名同 checksum 嘅 pointer 從來冇跟住上，所以冇嘢可以核對還原返嚟嘅嘢。將同一個資料夾再備份一次會接住呢個做落去，唔係由頭嚟過。",
            "啲部分上到，個負責記低佢哋個名同 checksum 嘅 pointer 就上唔到。咁就冇嘢可以核對還原返嚟嘅嘢，所以呢個唔算完成。將同一個資料夾再備份一次會接住呢個做落去，唔係由頭嚟過。",
            "啲部分上到咗，跟住個負責記低佢哋個名同 checksum 嘅 pointer 就一直冇跟上嚟。咁就冇嘢可以核對還原返嚟嘅嘢，所以呢度冇人會當佢完成咗。將同一個資料夾再備份一次會接住呢個做落去，唔係由頭嚟過。",
        ],
    },
    /*
     * Why there is no delete button, said where somebody would look for one. The last clause
     * is the reason rather than an excuse: on GitHub the thing being removed is on the
     * screen in front of you, and here it would be a row and a name.
     */
    "backup.listings.appendOnly": {
        en: [
            "Backups are only ever added. This application never edits, replaces or removes a release or an asset, so there is no delete here: remove one on GitHub, where what is being removed is in front of you.",
            "Backups are only ever added. This application never edits, replaces or removes a release or an asset, so there is no delete here: remove one on GitHub, where what is being removed is in front of you.",
            "Backups are only ever added. This application never edits, replaces or removes a release or an asset, so there is no delete button here: remove one on GitHub, where what is being removed is in front of you.",
            "Backups are only ever added, never taken away. This application never edits, replaces or removes a release or an asset, so there is no delete button here: remove one on GitHub, where what is being removed is in front of you.",
            "Backups are only ever added, never taken away. This application never edits, replaces or removes a release or an asset, so you will hunt for a delete button here in vain: remove one on GitHub, where what is being removed is in front of you.",
        ],
        yue: [
            "備份永遠只會加，唔會減。呢個程式永遠唔會改、換或者刪走一個 release 或者 asset，所以呢度冇刪除呢樣嘢：要刪就去 GitHub 度刪，喺嗰度你會見到自己刪緊咩。",
            "備份永遠只會加，唔會減。呢個程式永遠唔會改、換或者刪走一個 release 或者 asset，所以呢度冇刪除呢樣嘢：要刪就去 GitHub 度刪，喺嗰度你會見到自己刪緊咩。",
            "備份永遠只會加，唔會減。呢個程式永遠唔會改、換或者刪走一個 release 或者 asset，所以呢度冇刪除掣：要刪就去 GitHub 度刪，喺嗰度你會見到自己刪緊咩。",
            "備份永遠只會加，唔會減。呢個程式永遠唔會改、換或者刪走一個 release 或者 asset，所以呢度連粒刪除掣都冇：要刪就去 GitHub 度刪，喺嗰度你會見到自己刪緊咩。",
            "備份永遠只會加，唔會減。呢個程式永遠唔會改、換或者刪走一個 release 或者 asset，所以喺呢度點搵都搵唔到粒刪除掣：要刪就去 GitHub 度刪，喺嗰度你會清清楚楚見到自己刪緊咩。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const BACKUP_FIXED = {
    /* ---------------------------------------------------------------- */
    /* The screen, its two steps, and the button                        */
    /* ---------------------------------------------------------------- */

    /*
     * The heading is also the section's accessible name, which is the argument for it being
     * fixed rather than voiced: a landmark whose name moves under a screen-reader user is a
     * landmark they have to re-learn every time the slider does.
     */
    "backup.title": {
        en: "Back up a world or a rendered map",
        yue: "備份一個世界或者一張算好嘅地圖",
    },
    "backup.what": { en: "What to back up", yue: "備份咩" },
    "backup.kindLabel": { en: "What kind of thing is it?", yue: "係咩類型嘅嘢？" },
    "backup.kind.world": { en: "Minecraft world", yue: "Minecraft 世界" },
    "backup.kind.render": { en: "Rendered map", yue: "算好嘅地圖" },
    "backup.pickKnown": {
        en: "One this application already knows about",
        yue: "呢個程式已經知道嘅其中一個",
    },
    "backup.folder": { en: "Folder", yue: "資料夾" },
    /*
     * The two placeholder hints for the same field, swapped by the chosen kind. They are a
     * pair and are worded as one, which is why both are fixed: the field's own hint text
     * changing tone under somebody mid-type helps nobody.
     */
    "backup.folderHintWorld": {
        en: "the folder holding level.dat",
        yue: "裝住 level.dat 嗰個資料夾",
    },
    "backup.folderHintRender": {
        en: "the render folder under your maps folder",
        yue: "你 maps 資料夾下面嗰個 render 資料夾",
    },
    "backup.readFolder": { en: "Read this folder", yue: "讀呢個資料夾" },

    "backup.where": { en: "Where to keep it", yue: "擺喺邊" },
    /*
     * PUBLIC is shouted in both languages, and stays shouted. It is the one word in the
     * repository picker that decides whether a world is about to become downloadable by
     * strangers, and a lower-case one reads as a category rather than as a warning.
     */
    "backup.repoPrivate": { en: "{name} (private)", yue: "{name}（私人）" },
    "backup.repoPublic": { en: "{name} (PUBLIC)", yue: "{name}（PUBLIC）" },
    "backup.pickRepository": { en: "One of your repositories", yue: "你其中一個儲存庫" },
    "backup.owner": { en: "Owner", yue: "擁有者" },
    "backup.repo": { en: "Repository", yue: "儲存庫" },
    "backup.check": { en: "Check this repository", yue: "檢查呢個儲存庫" },

    "backup.start": { en: "Back this up", yue: "備份佢" },
    "backup.signIn": { en: "Sign in to GitHub again", yue: "再登入一次 GitHub" },

    /* ---------------------------------------------------------------- */
    /* One backup's card                                                */
    /* ---------------------------------------------------------------- */

    /* Shown when a backup was started elsewhere and this window only inherited it. */
    "backup.row.unnamed": {
        en: "A backup started in another window",
        yue: "喺另一個視窗開始咗嘅備份",
    },
    "backup.row.finished": { en: "Backed up", yue: "已備份" },
    "backup.row.failed": { en: "Did not finish", yue: "冇做完" },
    "backup.row.cancelled": { en: "Stopped", yue: "已停低" },
    "backup.row.label": {
        en: "{name}: {state}, to {repository}",
        yue: "{name}：{state}，去 {repository}",
    },
    "backup.row.where": {
        en: "To {repository}, as the release {tag}",
        yue: "去 {repository}，做 release {tag}",
    },
    "backup.row.progressLabel": {
        en: "How much of this backup is done",
        yue: "呢個備份做咗幾多",
    },
    "backup.row.stop": { en: "Stop this backup", yue: "停低呢個備份" },
    "backup.row.openRelease": {
        en: "Open the release on GitHub",
        yue: "喺 GitHub 開個 release",
    },
    "backup.row.signIn": { en: "Sign in to GitHub again", yue: "再登入一次 GitHub" },
    "backup.row.resume": { en: "Carry on with this backup", yue: "接住做呢個備份" },
    "backup.row.hideLog": { en: "Hide what it reported", yue: "收埋佢報過嘅嘢" },
    "backup.row.showLog": { en: "Show what it reported", yue: "睇佢報過嘅嘢" },

    /* ---------------------------------------------------------------- */
    /* The phases, in the order they happen                             */
    /* ---------------------------------------------------------------- */

    "backup.phase.starting": { en: "Starting", yue: "開始" },
    "backup.phase.inspecting": { en: "Reading the folder", yue: "讀緊個資料夾" },
    "backup.phase.packing": { en: "Packing it into one archive", yue: "打包成一個 archive" },
    "backup.phase.splitting": { en: "Cutting it into parts", yue: "切開做幾個部分" },
    "backup.phase.publishing": { en: "Making the release", yue: "整緊個 release" },
    "backup.phase.uploading": { en: "Uploading the parts", yue: "上傳緊啲部分" },
    "backup.phase.finished": { en: "Finished", yue: "完成" },
    /* Only rendered when there really is more than one part, so it never reads "1 of 1". */
    "backup.parts": { en: "part {done} of {total}", yue: "第 {done} 部分，共 {total} 個" },

    /* ---------------------------------------------------------------- */
    /* The list of backups already in the repository                    */
    /* ---------------------------------------------------------------- */

    "backup.listings.title": { en: "Backups already in {name}", yue: "{name} 入面已經有嘅備份" },
    "backup.listings.searchLabel": { en: "Search these backups", yue: "搵呢啲備份" },
    "backup.listings.searchHint": { en: "name, tag or archive", yue: "名、tag 或者 archive" },
    "backup.listings.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 之中嘅 {shown}",
    },
    /* A row of counted facts rather than a sentence, so a funny level has nothing to style. */
    "backup.listings.detail": {
        en: "{kind} · {size} · {parts} asset(s) · {files} files",
        yue: "{kind} · {size} · {parts} 個 asset · {files} 個檔案",
    },
    "backup.listings.made": {
        en: "Made {at}, as the release {tag}",
        yue: "{at} 整，做 release {tag}",
    },
    /*
     * The same two words as `backup.row.failed`, deliberately. From the reader's side they
     * are the same news about two different objects: a run that stopped part way, and a
     * release whose pointer never arrived. `backup.listings.incompleteDetail` says which.
     */
    "backup.listings.incomplete": { en: "Did not finish", yue: "冇做完" },
    "backup.listings.restore": { en: "Restore this", yue: "還原呢個" },
    "backup.listings.open": { en: "Open the release on GitHub", yue: "喺 GitHub 開個 release" },
} as const satisfies Record<string, FixedString>;

export const BACKUP_FACTS = {
    // The mechanism, not the marketing: the split size, the digest, and where it lands.
    "backup.blurb": {
        en: ["500 MiB", "SHA-256", "GitHub release", "restore"],
        yue: ["500 MiB", "SHA-256", "GitHub release", "還原"],
    },
    // Drop the gigabyte figures and the paragraph stops being an argument.
    "backup.whyNotLfs": {
        en: ["Git LFS", "one gigabyte", "Desktop Material", "Cheap LFS v1"],
        yue: ["Git LFS", "1 GB", "Desktop Material", "Cheap LFS v1"],
    },
    "backup.unsupported": {
        en: ["cannot make a backup", "desktop", "GitHub", "Settings"],
        yue: ["整唔到備份", "桌面", "GitHub", "設定"],
    },

    "backup.reading": { en: ["Reading the folder"], yue: ["讀緊個資料夾"] },
    // Reading a folder is not backing it up, and the last clause is the only thing saying so.
    "backup.sourceSummary": {
        en: ["{label}", "{files}", "{size}", "packed or uploaded yet"],
        yue: ["{label}", "{files}", "{size}", "未打包過，亦都未上傳過"],
    },
    "backup.skipped": {
        en: ["{n}", "left out of the backup"],
        yue: ["{n}", "唔會入到份備份入面"],
    },

    "backup.loadingRepositories": {
        en: ["Reading your repositories"],
        yue: ["讀緊你嘅儲存庫"],
    },
    "backup.checking": { en: ["Reading the repository"], yue: ["讀緊個儲存庫"] },
    "backup.readOnly": {
        en: ["{name}", "cannot write", "release"],
        yue: ["{name}", "寫入唔到", "release"],
    },
    // The consent itself. Vagueness here is the failure the tickbox exists to prevent.
    "backup.acknowledgePublic": {
        en: ["public", "anybody"],
        yue: ["公開", "任何人"],
    },

    "backup.blocked.unsupported": {
        en: ["cannot publish a backup"],
        yue: ["發佈唔到備份"],
    },
    "backup.blocked.source": { en: ["world or folder"], yue: ["世界或者資料夾"] },
    "backup.blocked.repository": {
        en: ["repository", "permissions"],
        yue: ["儲存庫", "權限"],
    },
    "backup.blocked.write": {
        en: ["{repository}", "cannot write", "release"],
        yue: ["{repository}", "寫入唔到", "release"],
    },
    "backup.blocked.public": { en: ["PUBLIC", "anybody"], yue: ["PUBLIC", "任何人"] },
    "backup.blocked.starting": { en: ["starting"], yue: ["開始緊"] },
    "backup.starting": { en: ["Starting"], yue: ["開始緊"] },

    "backup.row.stopping": { en: ["Stopping"], yue: ["停緊"] },
    // There is no control to press, which is the actionable half of the sentence.
    "backup.row.cannotStop": {
        en: ["cannot stop", "finish, or fail, on its own"],
        yue: ["停唔到", "自己完成，或者自己失敗"],
    },
    // What makes this a backup rather than a pile of uploads is that a restore can check it.
    "backup.row.finishedDetail": {
        en: ["{archive}", "{size}", "{parts}", "SHA-256", "restore"],
        yue: ["{archive}", "{size}", "{parts}", "SHA-256", "還原"],
    },
    // A stop keeps what it packed and resumes rather than restarts. Both halves, every level.
    "backup.row.cancelledDetail": {
        en: ["Stopped", "is kept", "from where it got to"],
        yue: ["已經停咗", "全部保留", "由頭嚟過"],
    },
    "backup.row.signInWhere": { en: ["GitHub", "Settings"], yue: ["GitHub", "設定"] },

    "backup.listings.reading": {
        en: ["repository's releases"],
        yue: ["儲存庫嘅 release"],
    },
    // The rule for what counts, and the promise about everything that does not.
    "backup.listings.none": {
        en: ["backup.json", "left alone"],
        yue: ["backup.json", "唔會郁"],
    },
    "backup.listings.noMatch": {
        en: ["Clearing", "none of them was removed"],
        yue: ["清走", "一個都冇刪走過"],
    },
    // Unverifiable and resumable. No level may round either half up or down.
    "backup.listings.incompleteDetail": {
        en: [
            "nothing to verify a restore against",
            "carries this one on rather than starting over",
        ],
        yue: ["冇嘢可以核對", "接住呢個做落去"],
    },
    "backup.listings.appendOnly": {
        en: ["never edits, replaces or removes", "GitHub"],
        yue: ["永遠唔會改", "GitHub"],
    },
} as const satisfies Record<
    keyof typeof BACKUP_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
