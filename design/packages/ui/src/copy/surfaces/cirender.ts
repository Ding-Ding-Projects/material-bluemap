/**
 * The GitHub runners screen: rendering a world on GitHub Actions instead of on this
 * computer, and everything that has to be true before a byte of it leaves the machine.
 *
 * The surface is unusual for this application in that almost nothing it reports is under
 * its own control. It uploads a world to somebody else's storage, asks somebody else's
 * runners to render it, and then watches. Three consequences run through every string
 * below and are worth stating once here rather than in a comment above each of them.
 *
 * ## A run's state is never rounded up
 *
 * `run.going` and `run.ended` interpolate GitHub's own `status` and `conclusion` words.
 * They are not translated, not tidied, and not summarised into "working" and "done":
 * `queued`, `in_progress`, `failure`, `cancelled` and `timed_out` are what the GitHub API
 * says and what the run page will say when the reader opens it. A level that turned
 * `conclusion: failure` into a cheerful "all wrapped up" would be lying about somebody
 * else's machine, which is the one thing this screen cannot afford to do.
 *
 * ## "Recorded" and "verified" are different words
 *
 * `cirender.recorded` exists because GitHub does not publish a checksum for every
 * artifact. When it does not, this application hashes what it downloaded and stores that
 * hash, which proves the file has not changed since; it does not prove the file is the one
 * the run built. Every level of that entry keeps both halves, and `SHA-256` stays spelled
 * exactly that way in Cantonese too.
 *
 * ## Two GitHub sign-ins, and the screen always says which one
 *
 * There is the application's own OAuth sign-in and there is the `gh` command-line tool,
 * and they fail independently: one can read a private repository the other cannot, and
 * either can be the credential that ends up doing the upload. `gh.*`, `route.other`,
 * `repository.unknown` and `repository.fallback` all name which of the two they are
 * talking about, at every level, because "signing in to GitHub" is not an instruction
 * somebody can act on when there are two places to do it.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CIRENDER_VOICED = {
    /* ---------------------------------------------------------------- */
    /* What the check found: what will be sent, and how much of it       */
    /* ---------------------------------------------------------------- */

    /*
     * The two halves of the upload decision. `upload.none` is the reassuring one and is
     * exactly where a playful level is tempted to drop the asset name, which is the only
     * thing that lets somebody go and confirm the claim on the releases page.
     */
    "cirender.upload.none": {
        en: [
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent.",
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent.",
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent this time.",
            "The world has not changed since it went up as {asset}, so nothing will be sent. That upload still counts.",
            "The world has not changed one block since it went up as {asset}, so nothing will be sent. GitHub already has it and is not asking twice.",
        ],
        yue: [
            "個世界喺上載成 {asset} 之後冇改過，所以唔會送任何嘢上去。",
            "個世界喺上載成 {asset} 之後冇改過，所以唔會送任何嘢上去。",
            "個世界喺上載成 {asset} 之後冇改過，所以今次唔會送任何嘢上去。",
            "個世界自從上載成 {asset} 之後冇改過，所以唔會送任何嘢上去。嗰次上載仲數得。",
            "個世界自從上載成 {asset} 之後一格都冇改過，所以唔會送任何嘢上去。GitHub 已經有份，唔會問你攞多次。",
        ],
    },
    "cirender.upload.needed": {
        en: [
            "About {size} will be uploaded to GitHub before anything is rendered.",
            "About {size} will be uploaded to GitHub before anything is rendered.",
            "About {size} will be uploaded to GitHub before anything is rendered at all.",
            "About {size} goes up to GitHub first. Nothing is rendered until all of it has arrived.",
            "About {size} has to climb all the way up to GitHub before a single tile is rendered, so put the kettle on.",
        ],
        yue: [
            "大約 {size} 會上載去 GitHub，之後先至開始算圖。",
            "大約 {size} 會上載去 GitHub，之後先至開始算圖。",
            "大約 {size} 會先上載去 GitHub，全部到齊之後先至開始算圖。",
            "大約 {size} 要先爬上 GitHub。未到齊之前唔會開始算圖。",
            "大約 {size} 要先慢慢爬上 GitHub，一格都未算圖住，可以去斟杯茶先。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The gh command-line tool, which is the second of the two sign-ins */
    /* ---------------------------------------------------------------- */

    /*
     * `gh auth login` asks for a device code interactively and cannot be driven from
     * inside this application. That clause is not an apology, it is the reason the reader
     * has to open a terminal themselves, so it survives level 5 in both languages.
     */
    "cirender.gh.missing": {
        en: [
            "The gh command-line tool is not on this computer, so it cannot be used as a second route. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "The gh command-line tool is not on this computer, so it cannot be used as a second route. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "The gh command-line tool is not on this computer, so there is no second route to fall back on. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "No gh command-line tool on this computer, so the second route is not there to fall back on. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "There is no gh command-line tool anywhere on this computer, so the second route is a door with no room behind it. Grab it from cli.github.com if you would rather render with it than with the sign-in here.",
        ],
        yue: [
            "呢部電腦冇 gh 命令列工具，所以佢做唔到第二條路。如果想用佢嚟算圖多過用呢度嘅登入，可以喺 cli.github.com 裝返。",
            "呢部電腦冇 gh 命令列工具，所以佢做唔到第二條路。如果想用佢嚟算圖多過用呢度嘅登入，可以喺 cli.github.com 裝返。",
            "呢部電腦冇 gh 命令列工具，所以根本冇第二條路可以退返。如果想用佢嚟算圖多過用呢度嘅登入，可以喺 cli.github.com 裝返。",
            "搵勻成部電腦都冇 gh 命令列工具，所以第二條路係冇得行。如果想用佢嚟算圖多過用呢度嘅登入，去 cli.github.com 裝返佢。",
            "成部電腦都搵唔到 gh 命令列工具，所以嗰條所謂第二條路，其實係一道冇房喺後面嘅門。想用佢嚟算圖多過用呢度嘅登入，就去 cli.github.com 執返佢返嚟。",
        ],
    },
    "cirender.gh.signedOut": {
        en: [
            "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal, since it asks for a code interactively and cannot be driven from inside this application, then check again.",
            "The gh command-line tool is here, but signed in as nobody. Run `gh auth login` in a terminal yourself: it asks for a code interactively and cannot be driven from inside this application. Then check again.",
            "The gh command-line tool turned up, took a seat, and signed in as absolutely nobody. Run `gh auth login` in a terminal yourself, because it asks for a code interactively and cannot be driven from inside this application, then check again.",
        ],
        yue: [
            "gh 命令列工具裝咗，但係冇人登入過。喺終端機行 `gh auth login` - 佢會即場問你攞驗證碼，冇辦法喺呢個程式入面代你做 - 然後再檢查一次。",
            "gh 命令列工具裝咗，但係冇人登入過。喺終端機行 `gh auth login` - 佢會即場問你攞驗證碼，冇辦法喺呢個程式入面代你做 - 然後再檢查一次。",
            "gh 命令列工具裝咗，但係冇人登入過。喺終端機行 `gh auth login`，因為佢會即場問你攞驗證碼，冇辦法喺呢個程式入面代你做，然後再檢查一次。",
            "gh 命令列工具喺度，不過登入嘅係「冇人」。自己喺終端機行 `gh auth login`：佢會即場問你攞驗證碼，呢個程式代你做唔到。做完再檢查一次。",
            "gh 命令列工具到咗場、坐低咗，然後以「冇人」嘅身分登入。麻煩自己喺終端機行 `gh auth login`，因為佢要即場問你攞驗證碼，呢個程式係代你做唔到㗎，之後再檢查一次。",
        ],
    },
    "cirender.gh.ready": {
        en: [
            "The gh command-line tool is installed and signed in.",
            "The gh command-line tool is installed and signed in.",
            "The gh command-line tool is installed and signed in, so it is available as a second route.",
            "The gh command-line tool is installed and signed in, and ready to be used as the second route.",
            "The gh command-line tool is installed, signed in, and standing by as the second route with nothing whatsoever to complain about.",
        ],
        yue: [
            "gh 命令列工具已經裝咗，亦都登入咗。",
            "gh 命令列工具已經裝咗，亦都登入咗。",
            "gh 命令列工具已經裝咗，亦都登入咗，可以做第二條路。",
            "gh 命令列工具已經裝咗、登入咗，隨時可以做第二條路。",
            "gh 命令列工具裝咗、登入咗，喺度企定定等做第二條路，冇一樣嘢好投訴。",
        ],
    },
    /*
     * The account and the host both matter and for different reasons: `{account}` is whose
     * repositories the run can reach, and `{host}` is whether this is github.com or a
     * GitHub Enterprise instance. Neither is decoration, so both are pinned.
     */
    "cirender.gh.readyAs": {
        en: [
            "The gh command-line tool is signed in as {account} on {host}.",
            "The gh command-line tool is signed in as {account} on {host}.",
            "The gh command-line tool is signed in as {account} on {host}, so that is the account it would use.",
            "The gh command-line tool is signed in as {account} on {host}. That is the account it would work as.",
            "The gh command-line tool is signed in as {account} on {host}, and that is exactly who it will be when it goes to work.",
        ],
        yue: [
            "gh 命令列工具而家以 {account} 嘅身分登入咗 {host}。",
            "gh 命令列工具而家以 {account} 嘅身分登入咗 {host}。",
            "gh 命令列工具而家以 {account} 嘅身分登入咗 {host}，即係佢會用呢個帳戶。",
            "gh 命令列工具而家以 {account} 嘅身分喺 {host} 登入咗。做嘢嗰陣就係用呢個帳戶。",
            "gh 命令列工具而家以 {account} 嘅身分喺 {host} 登入咗，開工嗰陣佢就係呢個人，冇第二個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Why the button will not go yet                                    */
    /* ---------------------------------------------------------------- */

    /*
     * Everything from here to `blocked.public` renders under a disabled start button, so
     * each one has exactly one job: say which condition is unmet and what would satisfy
     * it. A level that is amusing about the block but vague about the remedy has made the
     * screen worse.
     */
    "cirender.unsupported": {
        en: [
            "The desktop application is what starts a CI render.",
            "The desktop application is what starts a CI render.",
            "A CI render is started by the desktop application, not from here.",
            "A CI render is started by the desktop application. This window can show one, but it cannot start one.",
            "A CI render only ever starts from the desktop application. This window is happy to sit and watch, but it does not have the button.",
        ],
        yue: [
            "CI 算圖係由桌面應用程式開始嘅。",
            "CI 算圖係由桌面應用程式開始嘅。",
            "CI 算圖要由桌面應用程式開始，唔係喺呢度開。",
            "CI 算圖要由桌面應用程式開始。呢個視窗睇得到，但係開唔到。",
            "CI 算圖淨係得桌面應用程式開得到。呢個視窗好樂意企喺度睇，不過粒掣真係唔喺佢手。",
        ],
    },
    "cirender.blocked.check": {
        en: [
            "Check the repository first.",
            "Check the repository first.",
            "Check the repository first, before anything is sent.",
            "Check the repository first. Nothing is sent until that check has run.",
            "Check the repository first. Nothing leaves this computer until that check has run, so the button is waiting on you.",
        ],
        yue: [
            "請先檢查個倉庫。",
            "請先檢查個倉庫。",
            "請先檢查個倉庫，之後先至送嘢上去。",
            "請先檢查個倉庫。未檢查完，一嚿嘢都唔會送出去。",
            "請先檢查個倉庫。未檢查完之前，一嚿嘢都唔會離開呢部電腦，所以粒掣而家等緊你。",
        ],
    },
    "cirender.blocked.eula": {
        en: [
            "Mojang's licence has not been accepted on this computer, and the render needs it.",
            "Mojang's licence has not been accepted on this computer, and the render needs it.",
            "Mojang's licence has not been accepted on this computer, and the render cannot go ahead without it.",
            "Mojang's licence has not been accepted on this computer. The render needs it, so it stops here.",
            "Mojang's licence has not been accepted on this computer. The render needs it, and no amount of staring at the button changes that.",
        ],
        yue: [
            "呢部電腦未接受過 Mojang 嘅授權條款，而算圖需要佢。",
            "呢部電腦未接受過 Mojang 嘅授權條款，而算圖需要佢。",
            "呢部電腦未接受過 Mojang 嘅授權條款，冇咗佢算圖行唔到。",
            "呢部電腦未接受過 Mojang 嘅授權條款。算圖要用到佢，所以到呢度停低。",
            "呢部電腦未接受過 Mojang 嘅授權條款。算圖真係要佢，望實粒掣望到出汗都唔會變。",
        ],
    },
    "cirender.blocked.large": {
        en: [
            "This world packs to about {size}, past what one GitHub release asset can hold.",
            "This world packs to about {size}, past what one GitHub release asset can hold.",
            "This world packs to about {size}, which is past what one GitHub release asset can hold.",
            "This world packs to about {size}. That is past what one GitHub release asset can hold, so it cannot go up as one.",
            "This world packs to about {size}, which sails clean past what one GitHub release asset can hold. It will not fit through that door in one piece.",
        ],
        yue: [
            "呢個世界壓縮之後大約 {size}，超出咗一個 GitHub release asset 載得起嘅上限。",
            "呢個世界壓縮之後大約 {size}，超出咗一個 GitHub release asset 載得起嘅上限。",
            "呢個世界壓縮之後大約 {size}，已經超出咗一個 GitHub release asset 載得起嘅上限。",
            "呢個世界壓縮之後大約 {size}。呢個數超出咗一個 GitHub release asset 載得起嘅上限，所以塞唔落一件。",
            "呢個世界壓縮之後大約 {size}，一飛就飛過咗一個 GitHub release asset 載得起嘅上限。想成嚿塞入去，道門真係唔夠闊。",
        ],
    },
    /*
     * "Neither" is the load-bearing word: somebody who reads this as "sign in to GitHub"
     * will sign in to the one they already have and be blocked again. The remedy names
     * both routes at every level.
     */
    "cirender.blocked.uploadRoute": {
        en: [
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, and then check again.",
            "Neither GitHub sign-in on this computer can publish a world, so there is nothing here to upload with. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
            "Both GitHub sign-ins turned up empty handed: neither of them can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
        ],
        yue: [
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界。請喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界。請喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界。請喺設定入面登入 GitHub，又或者喺終端機行 `gh auth login`，之後再檢查一次。",
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界，即係根本冇嘢用嚟上載。喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
            "兩個 GitHub 登入都到齊晒，可惜兩個都冇能力發佈一個世界。喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
        ],
    },
    "cirender.blocked.upload": {
        en: [
            "Confirm that the world may be uploaded to GitHub.",
            "Confirm that the world may be uploaded to GitHub.",
            "Confirm that the world may be uploaded to GitHub before this starts.",
            "Confirm that the world may be uploaded to GitHub, by ticking the box above.",
            "Nothing moves until you confirm that the world may be uploaded to GitHub. The box above is the whole ceremony.",
        ],
        yue: [
            "請確認個世界可以上載去 GitHub。",
            "請確認個世界可以上載去 GitHub。",
            "請喺開始之前確認個世界可以上載去 GitHub。",
            "請剔咗上面個格，確認個世界可以上載去 GitHub。",
            "未確認個世界可以上載去 GitHub 之前，乜都唔會郁。上面個格剔一剔就係全部儀式。",
        ],
    },
    "cirender.blocked.public": {
        en: [
            "Confirm that you mean to publish this world publicly.",
            "Confirm that you mean to publish this world publicly.",
            "Confirm that you mean to publish this world publicly, where anybody could download it.",
            "Confirm that you mean to publish this world publicly. The repository is public, so anybody could download it.",
            "Confirm that you mean to publish this world publicly. The repository is public, which means anybody at all could download it, strangers included.",
        ],
        yue: [
            "請確認你係有心公開發佈呢個世界。",
            "請確認你係有心公開發佈呢個世界。",
            "請確認你係有心公開發佈呢個世界，任何人都下載得到。",
            "請確認你係有心公開發佈呢個世界。個倉庫係公開嘅，任何人都下載得到。",
            "請確認你係有心公開發佈呢個世界。個倉庫係公開嘅，即係全世界唔識你嘅人都下載得到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The pitch, and the price of taking it                             */
    /* ---------------------------------------------------------------- */

    /*
     * These two are read together and only work as a pair. The pitch is allowed to be
     * enthusiastic because the caveats immediately below it are not, and every number and
     * limit in the caveats survives level 5 for that reason: the honest version of "let
     * somebody else's computer do it" is the one that also says what it costs.
     */
    "cirender.pitch": {
        en: [
            "Built for computers that cannot render a big world themselves. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "Built for computers that cannot render a big world themselves. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "Built for computers that cannot render a big world on their own. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "For computers that cannot render a big world on their own. Your machine uploads the world and then puts its feet up; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "Built for computers that cannot render a big world themselves, which is most of them. Your machine uploads the world and then puts its feet up; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one, no asterisk.",
        ],
        yue: [
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機負責上載個世界，之後就等；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機負責上載個世界，之後就等；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機負責上載個世界，然後就喺度等；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機上載完個世界就可以翹埋雙手；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整，其實大部分電腦都係咁。你部機上載完個世界就可以翹埋雙手飲杯嘢；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣，冇任何細字。",
        ],
    },
    "cirender.caveats": {
        en: [
            "The trade-offs, plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, said plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, with nothing hidden: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, with nothing tucked under the rug: uploading a multi-gigabyte world takes time and bandwidth, plenty of both; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
        ],
        yue: [
            "老實講吓啲代價：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "老實講吓啲代價：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "老實講埋啲代價：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "有咩代價，一樣都唔收埋：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "有咩代價，一樣都唔掃入地氈底：上載一個幾 GB 嘅世界，好食時間同頻寬，兩樣都食得好交關；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Mojang's licence, which this application never accepts for anyone */
    /* ---------------------------------------------------------------- */

    /*
     * The last sentence is the one that matters and the one a playful rewrite would drop
     * as throat-clearing. Accepting a licence on somebody's behalf is the failure mode
     * this whole flow exists to avoid, so "will not accept it for you" is a pinned fact.
     */
    "cirender.eula": {
        en: [
            "The render workflow downloads a Minecraft client jar for its block models and textures, which needs Mojang's licence to have been accepted. This application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar for its block models and textures, which needs Mojang's licence to have been accepted. This application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar for its block models and textures, and that needs Mojang's licence to have been accepted. This application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar for its block models and textures. That needs Mojang's licence to have been accepted, and this application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar, because that is where the block models and textures live. That needs Mojang's licence to have been accepted, and this application will not accept it for you. Not a chance.",
        ],
        yue: [
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖，而呢件事需要你已經接受咗 Mojang 嘅授權條款。呢個程式唔會代你接受。",
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖，而呢件事需要你已經接受咗 Mojang 嘅授權條款。呢個程式唔會代你接受。",
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖，而呢樣嘢需要你事先接受咗 Mojang 嘅授權條款。呢個程式唔會代你接受。",
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖。呢樣嘢需要你事先接受咗 Mojang 嘅授權條款，而呢個程式唔會代你接受。",
            "算圖 workflow 要下載一個 Minecraft client jar，因為啲方塊模型同貼圖就係擺喺入面。呢樣嘢需要你事先接受咗 Mojang 嘅授權條款，而呢個程式唔會代你接受，一次都唔會。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Which credential read the repository, and which one could not     */
    /* ---------------------------------------------------------------- */

    /*
     * These two look similar and report opposite situations. `unknown` means nothing could
     * read the repository and therefore nothing is uploaded; `fallback` means something
     * could, just not the sign-in the reader would have assumed. Confusing them would have
     * somebody wait for an upload that already happened, or the reverse.
     */
    "cirender.repository.unknown": {
        en: [
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public could not be checked. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public could not be checked. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public was never checked. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public is still an open question. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public is anybody's guess, and this app does not guess. Nothing will be uploaded until one of them can.",
        ],
        yue: [
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，查唔到。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，查唔到。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，由頭到尾冇查過。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，而家仍然係個未解嘅問題。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，齋靠估，而呢個程式唔靠估。要等到其中一個讀得到，先會上載任何嘢。",
        ],
    },
    "cirender.repository.fallback": {
        en: [
            "This application's own GitHub sign-in could not read the repository, so the note above was read with the credential that will do the work instead.",
            "This application's own GitHub sign-in could not read the repository, so the note above was read with the credential that will do the work instead.",
            "This application's own GitHub sign-in could not read the repository, so the note above was read instead with the credential that will do the work.",
            "This application's own GitHub sign-in could not read the repository. The note above was read with the credential that will do the work instead.",
            "This application's own GitHub sign-in could not read the repository, so it stepped aside: the note above was read with the credential that will do the work instead.",
        ],
        yue: [
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，所以上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，所以上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，所以上面嗰段改為用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫。上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，於是自動讓位：上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What the workflow cannot carry, and what is being agreed to       */
    /* ---------------------------------------------------------------- */

    /*
     * `{settings}` is a joined list of the map's own settings the workflow has no input
     * for. Naming them is the whole point of the sentence: "some settings will not apply"
     * is not something anybody can check against their own configuration.
     */
    "cirender.notCarried": {
        en: [
            "The workflow has no input for the map's own settings, so {settings} will not be applied. It renders with BlueMap's defaults for them.",
            "The workflow has no input for the map's own settings, so {settings} will not be applied. It renders with BlueMap's defaults for them.",
            "The workflow has no input for the map's own settings, so {settings} will not be applied. It renders with BlueMap's defaults for them instead.",
            "The workflow has no input for the map's own settings, so {settings} will not be applied at all. It renders with BlueMap's defaults for them.",
            "The workflow has nowhere to put the map's own settings, so {settings} will not be applied and nothing is going to sneak them through. It renders with BlueMap's defaults for them.",
        ],
        yue: [
            "呢個 workflow 冇位放地圖自己嘅設定，所以 {settings} 唔會生效。呢啲項目會用 BlueMap 嘅預設值嚟算。",
            "呢個 workflow 冇位放地圖自己嘅設定，所以 {settings} 唔會生效。呢啲項目會用 BlueMap 嘅預設值嚟算。",
            "呢個 workflow 冇位放地圖自己嘅設定，所以 {settings} 唔會生效，呢啲項目會改為用 BlueMap 嘅預設值嚟算。",
            "呢個 workflow 完全冇位放地圖自己嘅設定，所以 {settings} 一啲都唔會生效。呢啲項目會用 BlueMap 嘅預設值嚟算。",
            "呢個 workflow 根本冇位放地圖自己嘅設定，所以 {settings} 唔會生效，亦都冇人幫佢哋偷渡過去。呢啲項目會用 BlueMap 嘅預設值嚟算。",
        ],
    },
    /*
     * Two checkbox labels rather than notices, and voiced anyway: each is a sentence the
     * reader is asserting about a consequence, which is exactly the kind of sentence a
     * funny level must not blur. "whole world folder" and "PUBLIC" are what is being
     * agreed to and neither moves.
     */
    "cirender.ack.upload": {
        en: [
            "I understand this uploads the whole world folder to GitHub.",
            "I understand this uploads the whole world folder to GitHub.",
            "I understand this uploads the whole world folder to GitHub, not a part of it.",
            "I understand this uploads the whole world folder to GitHub. All of it, not the interesting bits.",
            "I understand this uploads the whole world folder to GitHub. Every chunk, every region file, the lot.",
        ],
        yue: [
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub，唔係淨係一部分。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。係全部，唔係揀啲精華。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。每一個 chunk、每一個 region 檔，一個都跑唔甩。",
        ],
    },
    "cirender.ack.public": {
        en: [
            "I understand this repository is PUBLIC and anybody could download the world.",
            "I understand this repository is PUBLIC and anybody could download the world.",
            "I understand this repository is PUBLIC and anybody at all could download the world.",
            "I understand this repository is PUBLIC. Anybody could download the world, with no account needed.",
            "I understand this repository is PUBLIC. Anybody could download the world: friends, strangers, and search engines alike.",
        ],
        yue: [
            "我明白呢個倉庫係 PUBLIC，任何人都可以下載呢個世界。",
            "我明白呢個倉庫係 PUBLIC，任何人都可以下載呢個世界。",
            "我明白呢個倉庫係 PUBLIC，任何人都可以下載呢個世界，一個都攔唔到。",
            "我明白呢個倉庫係 PUBLIC。任何人都可以下載呢個世界，唔使有帳戶都得。",
            "我明白呢個倉庫係 PUBLIC。任何人都可以下載呢個世界：朋友、陌生人，連搜尋引擎都計埋。",
        ],
    },
    "cirender.force": {
        en: [
            "Upload again even if the world looks unchanged",
            "Upload again even if the world looks unchanged",
            "Upload again even if the world looks unchanged from here",
            "Upload again even if the world looks unchanged, and skip the comparison",
            "Upload again even if the world looks unchanged, because sometimes the comparison is the thing that is wrong",
        ],
        yue: [
            "就算個世界睇落冇改過，都照上載多次",
            "就算個世界睇落冇改過，都照上載多次",
            "就算個世界喺呢度睇落冇改過，都照上載多次",
            "就算個世界睇落冇改過都照上載多次，直接唔比對",
            "就算個世界睇落冇改過都照上載多次，因為有時錯嘅係嗰個比對",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Publishing the finished map to Pages                              */
    /* ---------------------------------------------------------------- */

    /*
     * `pages.explain` carries the one thing somebody could get badly wrong: a private
     * repository does not make a published map private. It is a link anybody can follow.
     * That clause, and `/map/` as the literal path, survive every level.
     */
    "cirender.pages.publish": {
        en: [
            "Also host the finished map on this repository's GitHub Pages site",
            "Also host the finished map on this repository's GitHub Pages site",
            "Also host the finished map on this repository's GitHub Pages site, so it has a link",
            "Also host the finished map on this repository's GitHub Pages site, so there is a link to send people",
            "Also host the finished map on this repository's GitHub Pages site, so the map gets an address instead of living in a zip",
        ],
        yue: [
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度，等佢有條link",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度，咁就有條link可以send俾人",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度，等張地圖有個地址，唔使匿埋喺個 zip 入面",
        ],
    },
    "cirender.pages.explain": {
        en: [
            "The map is published under the documentation site at /map/, so publishing it does not take that site down. Anybody with the link can see the map, whether or not the repository is private.",
            "The map is published under the documentation site at /map/, so publishing it does not take that site down. Anybody with the link can see the map, whether or not the repository is private.",
            "The map is published under the documentation site at /map/, so publishing it does not knock that site offline. Anybody with the link can see the map, whether or not the repository is private.",
            "The map goes up under the documentation site at /map/, so the documentation site stays exactly where it is. Anybody with the link can see the map, whether or not the repository is private.",
            "The map goes up under the documentation site at /map/, so the documentation site keeps its own front door and nobody gets evicted. Anybody with the link can see the map, whether or not the repository is private.",
        ],
        yue: [
            "張地圖會發佈喺文件網站下面嘅 /map/，所以發佈佢唔會令嗰個網站落線。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會發佈喺文件網站下面嘅 /map/，所以發佈佢唔會令嗰個網站落線。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會發佈喺文件網站下面嘅 /map/，所以發佈佢唔會撞跌嗰個網站。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會擺喺文件網站下面嘅 /map/，所以文件網站原封不動咁留喺度。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會擺喺文件網站下面嘅 /map/，文件網站繼續守住自己道大門，冇人俾人趕走。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
        ],
    },
    "cirender.pages.parts": {
        en: [
            "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly and the map is still downloadable.",
            "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly and the map is still downloadable.",
            "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly, and the map is still downloadable.",
            "A world too large to assemble on one runner comes back in parts instead, and a map in parts cannot be hosted this way. The run says so plainly, and the map is still downloadable.",
            "A world too large to assemble on one runner comes back in parts instead, and a map in parts cannot be hosted this way however politely you ask. The run says so plainly, and the map is still downloadable.",
        ],
        yue: [
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會改為分件送返嚟，而分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會改為分件送返嚟，而分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會改為分件送返嚟；分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會分件送返嚟；分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會分件送返嚟；分咗件嘅地圖係唔可以用呢個方法host嘅，點求都冇用。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* When it is over                                                   */
    /* ---------------------------------------------------------------- */

    /*
     * `recorded` is the one entry on this screen where a single word is the whole message.
     * Hashing what arrived proves the file has not changed since it was downloaded; it
     * does not prove the file is the one the run built, because GitHub published nothing
     * to compare it against. "recorded rather than verified" is therefore pinned in both
     * languages, and `SHA-256` keeps its spelling in the Cantonese.
     */
    "cirender.done": {
        en: [
            "{map} is in the map list, rendered on GitHub.",
            "{map} is in the map list, rendered on GitHub.",
            "{map} is now in the map list, rendered on GitHub.",
            "{map} is in the map list, rendered on GitHub rather than here.",
            "{map} is in the map list, rendered on GitHub while this computer sat and watched.",
        ],
        yue: [
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟嘅。",
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟嘅。",
            "{map} 而家已經喺地圖清單入面，係喺 GitHub 度算出嚟嘅。",
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟，唔係喺呢部機。",
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟，呢部機由頭到尾坐喺度睇住。",
        ],
    },
    "cirender.recorded": {
        en: [
            "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified.",
            "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified.",
            "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified against anything.",
            "GitHub published no checksum for the artifact. Its SHA-256 was recorded rather than verified, which is a weaker claim.",
            "GitHub published no checksum for the artifact, so there was nothing to compare against. Its SHA-256 was recorded rather than verified, and those two are not the same word.",
        ],
        yue: [
            "GitHub 冇為呢個 artifact 公佈過 checksum，所以佢個 SHA-256 只係記錄咗，唔算驗證過。",
            "GitHub 冇為呢個 artifact 公佈過 checksum，所以佢個 SHA-256 只係記錄咗，唔算驗證過。",
            "GitHub 冇為呢個 artifact 公佈過 checksum，所以佢個 SHA-256 只係記錄咗，冇同任何嘢對過，唔算驗證過。",
            "GitHub 冇為呢個 artifact 公佈過 checksum。佢個 SHA-256 只係記錄咗，唔算驗證過，呢兩樣係有分別嘅。",
            "GitHub 冇為呢個 artifact 公佈過 checksum，即係根本冇嘢好對。佢個 SHA-256 只係記錄咗，唔算驗證過，兩個詞唔可以當同一個用。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CIRENDER_FIXED = {
    /*
     * The phase names, in the order a render walks through them. They are read as a
     * sequence in a progress line, so they stay short enough to sit beside a spinner and
     * concrete enough to say which machine is doing the work at that moment.
     */
    "cirender.phase.checking": {
        en: "Checking the world and the repository",
        yue: "檢查緊個世界同個倉庫",
    },
    "cirender.phase.uploading": { en: "Uploading the world to GitHub", yue: "上載緊個世界去 GitHub" },
    "cirender.phase.dispatching": { en: "Starting the workflow", yue: "開緊個 workflow" },
    "cirender.phase.waiting": {
        en: "Waiting for GitHub to create the run",
        yue: "等緊 GitHub 開個 run",
    },
    "cirender.phase.rendering": { en: "GitHub is rendering", yue: "GitHub 算緊圖" },
    "cirender.phase.downloading": { en: "Fetching the rendered map", yue: "攞緊算好嘅地圖" },
    "cirender.phase.registering": { en: "Adding it to the map list", yue: "加緊入地圖清單" },
    "cirender.phase.finished": { en: "Finished", yue: "完成" },
    "cirender.phase.starting": { en: "Starting", yue: "開始緊" },

    /*
     * `{status}` and `{conclusion}` are GitHub's own words, passed through untranslated on
     * purpose: `queued`, `in_progress`, `failure`, `cancelled`, `timed_out`. They are what
     * the run page says, so a reader who opens the run finds the same word waiting there.
     */
    "cirender.run.none": { en: "No run yet", yue: "仲未有 run" },
    "cirender.run.going": { en: "Run is {status}", yue: "個 run 而家係 {status}" },
    "cirender.run.ended": { en: "Run ended: {conclusion}", yue: "個 run 結束咗：{conclusion}" },

    /* The screen, its two cards, and the fields that say what and where. */
    "cirender.title": { en: "Render on GitHub", yue: "喺 GitHub 度算圖" },
    "cirender.where.title": { en: "What, and where", yue: "算咩，同埋去邊" },
    "cirender.field.world": { en: "World folder", yue: "世界資料夾" },
    "cirender.field.owner": { en: "Repository owner", yue: "倉庫擁有者" },
    "cirender.field.repo": { en: "Repository name", yue: "倉庫名" },
    "cirender.check": { en: "Check before anything is sent", yue: "送任何嘢上去之前先檢查" },
    "cirender.report.title": { en: "What this would do", yue: "呢個會做啲咩" },

    /* `{reason}` is why the sign-in that is not driving was passed over. */
    "cirender.route.other": {
        en: "The other sign-in was not used: {reason}",
        yue: "另一個登入冇用到：{reason}",
    },

    /* Buttons. `cirender.start` repeats the screen title deliberately: the card is titled
     * for what the screen is, the button is labelled for what pressing it does. */
    "cirender.eula.open": { en: "Open the consent setting", yue: "開同意設定" },
    "cirender.start": { en: "Render on GitHub", yue: "喺 GitHub 度算圖" },
    "cirender.signIn": { en: "Open the GitHub sign-in", yue: "開 GitHub 登入" },
    "cirender.openRun": { en: "Open the run on GitHub", yue: "喺 GitHub 開個 run" },
    "cirender.stop": { en: "Stop watching", yue: "唔再睇住" },

    /* The live run: transfer counter, job search, and the job that went wrong. */
    "cirender.transfer.bytes": { en: "{done} of {total}", yue: "{total} 入面嘅 {done}" },
    "cirender.jobs.search": { en: "Search jobs", yue: "搜尋工作" },
    "cirender.failingJob": { en: "The job that failed: {job}", yue: "失敗咗嗰個工作：{job}" },
} as const satisfies Record<string, FixedString>;

export const CIRENDER_FACTS = {
    // The asset name is what lets somebody confirm the "nothing to send" claim themselves.
    "cirender.upload.none": {
        en: ["{asset}", "not changed", "nothing will be sent"],
        yue: ["{asset}", "冇改過", "唔會送"],
    },
    "cirender.upload.needed": {
        en: ["{size}", "GitHub", "rendered"],
        yue: ["{size}", "GitHub", "算圖"],
    },

    // Where to get it, and that gh is the second route rather than the only one.
    "cirender.gh.missing": {
        en: ["gh command-line tool", "cli.github.com", "second route"],
        yue: ["gh 命令列工具", "cli.github.com", "第二條路"],
    },
    // The exact command, and that it has to be run in a terminal by a person.
    "cirender.gh.signedOut": {
        en: ["gh auth login", "terminal", "check again"],
        yue: ["gh auth login", "終端機", "再檢查"],
    },
    "cirender.gh.ready": {
        en: ["gh command-line tool", "signed in"],
        yue: ["gh 命令列工具", "登入咗"],
    },
    "cirender.gh.readyAs": {
        en: ["{account}", "{host}", "gh command-line tool"],
        yue: ["{account}", "{host}", "gh 命令列工具"],
    },

    "cirender.unsupported": {
        en: ["desktop application", "CI render"],
        yue: ["桌面應用程式", "CI 算圖"],
    },
    "cirender.blocked.check": { en: ["Check the repository"], yue: ["檢查個倉庫"] },
    "cirender.blocked.eula": {
        en: ["Mojang's licence", "not been accepted"],
        yue: ["Mojang", "未接受過"],
    },
    "cirender.blocked.large": {
        en: ["{size}", "GitHub release asset"],
        yue: ["{size}", "GitHub release asset"],
    },
    // Both remedies, because fixing the sign-in they already have will not unblock it.
    "cirender.blocked.uploadRoute": {
        en: ["publish a world", "Settings", "gh auth login"],
        yue: ["發佈一個世界", "設定", "gh auth login"],
    },
    "cirender.blocked.upload": {
        en: ["world", "uploaded to GitHub"],
        yue: ["個世界", "上載去 GitHub"],
    },
    "cirender.blocked.public": {
        en: ["publish this world publicly"],
        yue: ["公開發佈呢個世界"],
    },

    "cirender.pitch": {
        en: ["uploads the world", "GitHub's runners", "parallel jobs", "opens exactly like a local one"],
        yue: ["上載", "runner", "平行工作", "一模一樣"],
    },
    // Each caveat is a number or a limit somebody plans around. None of them may go.
    "cirender.caveats": {
        en: [
            "takes time and bandwidth",
            "finite for private repositories",
            "unlimited standard-runner minutes",
            "one release asset",
        ],
        yue: ["時間同頻寬", "免費 Actions 分鐘係有限", "無限標準 runner 分鐘", "release asset"],
    },

    // The last clause is the point: nothing here accepts a licence on somebody's behalf.
    "cirender.eula": {
        en: [
            "Minecraft client jar",
            "block models and textures",
            "Mojang's licence",
            "will not accept it for you",
        ],
        yue: ["Minecraft client jar", "方塊模型同貼圖", "Mojang", "唔會代你接受"],
    },

    "cirender.repository.unknown": {
        en: ["Neither GitHub sign-in", "could read the repository", "Nothing will be uploaded"],
        yue: ["兩個 GitHub 登入", "讀唔到個倉庫", "先會上載"],
    },
    "cirender.repository.fallback": {
        en: ["could not read the repository", "credential that will do the work"],
        yue: ["讀唔到個倉庫", "會真正做嘢嗰個憑證"],
    },

    "cirender.notCarried": {
        en: ["{settings}", "will not be applied", "BlueMap's defaults"],
        yue: ["{settings}", "唔會生效", "BlueMap 嘅預設值"],
    },
    // What is being agreed to. "whole" and "PUBLIC" are the words that carry the risk.
    "cirender.ack.upload": {
        en: ["whole world folder", "GitHub"],
        yue: ["成個世界資料夾", "GitHub"],
    },
    "cirender.ack.public": { en: ["PUBLIC", "download the world"], yue: ["PUBLIC", "下載呢個世界"] },
    "cirender.force": { en: ["Upload again", "unchanged"], yue: ["上載多次", "冇改過"] },

    "cirender.pages.publish": {
        en: ["GitHub Pages", "finished map"],
        yue: ["GitHub Pages", "算好嘅地圖"],
    },
    // A private repository does not make a published map private, and /map/ is where it goes.
    "cirender.pages.explain": {
        en: ["/map/", "documentation site", "Anybody with the link", "repository is private"],
        yue: ["/map/", "文件網站", "有條link", "係咪私人"],
    },
    "cirender.pages.parts": {
        en: ["in parts", "cannot be hosted this way", "still downloadable"],
        yue: ["分件", "唔可以用呢個方法host", "仲下載得到"],
    },

    "cirender.done": { en: ["{map}", "map list", "rendered on GitHub"], yue: ["{map}", "地圖清單", "GitHub"] },
    // "recorded" and "verified" are different claims, and the distinction is the message.
    "cirender.recorded": {
        en: ["no checksum", "SHA-256", "recorded rather than verified"],
        yue: ["checksum", "SHA-256", "記錄咗", "唔算驗證過"],
    },
} as const satisfies Record<
    keyof typeof CIRENDER_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
