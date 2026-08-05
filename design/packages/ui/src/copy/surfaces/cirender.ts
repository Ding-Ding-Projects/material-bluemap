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
    /* The empty list, before this screen has ever been used             */
    /* ---------------------------------------------------------------- */

    /*
     * The one sentence on this whole screen that says why anyone would want a render on
     * somebody else's computer at all, rather than the "Make a map" tab's local one. The
     * button's own label is quoted rather than paraphrased, in the language actually on
     * screen -- the English string quotes the English label, the Cantonese string quotes
     * the Cantonese one -- so the words in the sentence match the words on the button.
     */
    "cirender.list.empty": {
        en: [
            'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet; fill in the form above and press "Render on GitHub" to start one.',
            'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet; fill in the form above and press "Render on GitHub" to start one.',
            'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet, so fill in the form above and press "Render on GitHub" to start one.',
            'This lists renders handed off to GitHub\'s own computers instead of yours, worth it for a big world or a computer you cannot spare for hours. Nothing has been sent yet, so fill in the form above and press "Render on GitHub".',
            'This lists renders handed off to GitHub\'s own computers instead of yours, worth it for a big world or a computer you would rather not chain to a desk for hours. Nothing has been sent yet, so fill in the form above and press "Render on GitHub", and let somebody else\'s computer do the sweating.',
        ],
        yue: [
            "呢度會列出送咗去 GitHub 自己部機、而唔係喺你部機算嘅 render，啱晒個世界好大又或者唔想部機俾霸幾個鐘嘅時候用。而家仲未送過任何一個；喺上面填好張表，撳「喺 GitHub 度算圖」就開始。",
            "呢度會列出送咗去 GitHub 自己部機、而唔係喺你部機算嘅 render，啱晒個世界好大又或者唔想部機俾霸幾個鐘嘅時候用。而家仲未送過任何一個；喺上面填好張表，撳「喺 GitHub 度算圖」就開始。",
            "呢度會列出送咗去 GitHub 自己部機、而唔係喺你部機算嘅 render，啱晒個世界好大又或者唔想部機俾霸幾個鐘嘅時候用。而家仲未送過任何一個，喺上面填好張表，撳「喺 GitHub 度算圖」就得。",
            "呢度會列出送咗去 GitHub 自己部機算嘅 render，唔係喺你部機度算，啱晒個世界大到誇張，又或者唔捨得部機俾人霸幾個鐘。而家仲未送過任何一個，喺上面填好張表，撳返個「喺 GitHub 度算圖」掣。",
            "呢度會列出送咗去 GitHub 自己部機算嘅 render，唔係喺你部機度算，啱晒個世界大到癲，又或者唔捨得部機成日俾人綁住做苦力。而家仲未送過任何一個，喺上面填好張表，撳返個「喺 GitHub 度算圖」掣，等第二部機幫你捱義氣。",
        ],
    },

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
    /* ---------------------------------------------------------------- */
    /* The guided "What, and where" card: nobody has to know what to type */
    /* ---------------------------------------------------------------- */

    /*
     * The account picker's own signed-out state, distinct from the owner picker's below:
     * this one is about who the render authenticates as at all, not about which login or
     * organisation it publishes under. Same rule as every signed-out message on this card -
     * it names the remedy and points at the sign-in row that already exists.
     */
    "cirender.account.signedOut": {
        en: [
            "Nobody is signed in to GitHub, so there is no account to render as. Sign in from Settings.",
            "Nobody is signed in to GitHub, so there is no account to render as. Sign in from Settings.",
            "Nobody is signed in to GitHub yet, so there is no account to render as. Sign in from Settings.",
            "Nobody is signed in to GitHub, so there is nobody this render could run as. Sign in from Settings to add one.",
            "Nobody is signed in to GitHub at all, so there is nobody this render could possibly run as. Sign in from Settings, and this picker will suddenly have something to say.",
        ],
        yue: [
            "冇人登入咗 GitHub，所以冇帳戶可以用嚟算圖。請喺設定入面登入。",
            "冇人登入咗 GitHub，所以冇帳戶可以用嚟算圖。請喺設定入面登入。",
            "冇人登入咗 GitHub，所以暫時冇帳戶可以用嚟算圖。請喺設定入面登入。",
            "冇人登入咗 GitHub，所以呢次算圖搵唔到人做。喺設定入面登入一個先。",
            "成個 GitHub 都冇人登入，所以呢次算圖真係搵唔到人頂替。快啲喺設定入面登入，呢個揀帳戶掣先有嘢好揀。",
        ],
    },

    /*
     * Signed out is not a dead end: it says so, and it points at the sign-in row that
     * already exists rather than inventing a second one. That clause survives every level.
     */
    "cirender.owner.signedOut": {
        en: [
            "Nobody is signed in to GitHub, so there is no list of accounts to choose from. Sign in from Settings, or type the owner directly below.",
            "Nobody is signed in to GitHub, so there is no list of accounts to choose from. Sign in from Settings, or type the owner directly below.",
            "Nobody is signed in to GitHub, so there is no list of accounts to choose from yet. Sign in from Settings, or type the owner directly below.",
            "Nobody is signed in to GitHub, so this cannot list your accounts. Sign in from Settings, or just type the owner directly below.",
            "Nobody is signed in to GitHub, so there is no account list to offer, only a blank where one should be. Sign in from Settings, or type the owner directly below - the field never minded either way.",
        ],
        yue: [
            "冇人登入咗 GitHub，所以冇帳戶清單俾你揀。可以喺設定入面登入，或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以冇帳戶清單俾你揀。可以喺設定入面登入，或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以暫時冇帳戶清單俾你揀。可以喺設定入面登入，或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以呢度列唔到你嘅帳戶。喺設定入面登入啦，又或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以連個帳戶清單都冇得列，得返一格空白。喺設定入面登入，又或者直接喺下面打個擁有者－呢個欄從來都唔介意邊種。",
        ],
    },

    /*
     * The three GitHub naming-rule refusals. Each one names the exact rule broken, because
     * "invalid name" alone sends somebody back to guess which character was the problem.
     */
    "cirender.repo.invalid.chars": {
        en: [
            "Repository names may only use letters, digits, dots, hyphens and underscores.",
            "Repository names may only use letters, digits, dots, hyphens and underscores.",
            "Repository names may only use letters, digits, dots, hyphens and underscores - nothing else.",
            "GitHub only accepts letters, digits, dots, hyphens and underscores in a repository name. Everything else gets refused.",
            "GitHub is fussy about this one: letters, digits, dots, hyphens and underscores only. Spaces, slashes and emoji all get shown the door.",
        ],
        yue: [
            "倉庫名淨係可以用英文字母、數字、句號、連字號同底線。",
            "倉庫名淨係可以用英文字母、數字、句號、連字號同底線。",
            "倉庫名淨係可以用英文字母、數字、句號、連字號同底線，第啲一律唔得。",
            "GitHub 淨係收英文字母、數字、句號、連字號同底線做倉庫名，第啲字符一律拒收。",
            "GitHub 呢方面幾揀擇：淨係要英文字母、數字、句號、連字號同底線。空格、斜線、表情符號，全部企喺門口入唔到嚟。",
        ],
    },
    "cirender.repo.invalid.dots": {
        en: [
            'A repository name cannot be just "." or "..".',
            'A repository name cannot be just "." or "..".',
            'A repository name cannot be just "." or "..", on their own.',
            'GitHub refuses a repository name that is only "." or "..". Add something else to it.',
            'A repository named only "." or ".." is the one GitHub always refuses, no matter how politely it is asked. Add something else to it.',
        ],
        yue: [
            "倉庫名唔可以淨係得「.」或者「..」。",
            "倉庫名唔可以淨係得「.」或者「..」。",
            "倉庫名唔可以齋係「.」或者「..」呢啲。",
            "GitHub 唔收淨係「.」或者「..」嘅倉庫名，加多啲字先得。",
            "淨係「.」或者「..」嘅倉庫名，GitHub 點求都唔收，加多啲其他字先得。",
        ],
    },
    "cirender.repo.invalid.gitSuffix": {
        en: [
            'A repository name cannot end in ".git".',
            'A repository name cannot end in ".git".',
            'A repository name cannot end in ".git" - GitHub adds that itself.',
            'GitHub refuses a repository name ending in ".git", because it adds that suffix itself when cloning.',
            'Ending a repository name in ".git" is redundant twice over: GitHub refuses it, and it would have added that suffix for you anyway.',
        ],
        yue: [
            "倉庫名唔可以以「.git」結尾。",
            "倉庫名唔可以以「.git」結尾。",
            "倉庫名唔可以以「.git」結尾－呢個位 GitHub 自己會加。",
            "GitHub 唔收以「.git」結尾嘅倉庫名，因為 clone 嘅時候佢自己會加返呢個尾巴。",
            "倉庫名以「.git」結尾係多此一舉：GitHub 唔收，而且本身 clone 嗰陣佢都會自動幫你加返。",
        ],
    },
    "cirender.repo.invalid.long": {
        en: [
            "A repository name cannot be longer than 100 characters.",
            "A repository name cannot be longer than 100 characters.",
            "A repository name cannot be longer than 100 characters - GitHub's own limit.",
            "GitHub caps a repository name at 100 characters, so this one needs trimming down.",
            "100 characters is GitHub's hard ceiling for a repository name, and this one is standing on tiptoe past it. Trim it down.",
        ],
        yue: [
            "倉庫名唔可以長過 100 個字。",
            "倉庫名唔可以長過 100 個字。",
            "倉庫名唔可以長過 100 個字－呢個係 GitHub 自己嘅上限。",
            "GitHub 規定倉庫名最多 100 個字，呢個要剪短啲先得。",
            "100 個字係 GitHub 定死嘅上限，呢個名踮起腳都仲係超咗，要剪短少少。",
        ],
    },

    /*
     * The live availability read. "recorded rather than verified" above kept two claims
     * apart; this keeps three apart, because guessing `available` from a failed check is
     * how somebody loses the minute they spent typing a name that was never actually free.
     */
    "cirender.repo.available": {
        en: [
            "{owner}/{repo} is free on GitHub.",
            "{owner}/{repo} is free on GitHub.",
            "{owner}/{repo} is free on GitHub, as far as this check could tell.",
            "{owner}/{repo} came back free on GitHub. Nobody else has claimed it.",
            "{owner}/{repo} is free on GitHub and clear for the taking - go ahead and put your name on it.",
        ],
        yue: [
            "{owner}/{repo} 喺 GitHub 度未有人用。",
            "{owner}/{repo} 喺 GitHub 度未有人用。",
            "就呢次檢查嚟講，{owner}/{repo} 喺 GitHub 度未有人用。",
            "{owner}/{repo} 查完出嚟係未有人用，仲有排得閒。",
            "{owner}/{repo} 喺 GitHub 度乾乾淨淨未有人用－可以放心攞嚟做你嘅。",
        ],
    },
    "cirender.repo.taken": {
        en: [
            "{owner}/{repo} already exists on GitHub.",
            "{owner}/{repo} already exists on GitHub.",
            "{owner}/{repo} already exists on GitHub. Pick a different name, or use that repository on purpose.",
            "{owner}/{repo} already exists on GitHub as a repository, so this name will need to change unless that one is the point.",
            "{owner}/{repo} already exists on GitHub and is spoken for. Either that was the plan all along, or this name needs a rethink.",
        ],
        yue: [
            "{owner}/{repo} 喺 GitHub 度已經有咗。",
            "{owner}/{repo} 喺 GitHub 度已經有咗。",
            "{owner}/{repo} 喺 GitHub 度已經有咗。換個名，定係想用返嗰個倉庫都得。",
            "{owner}/{repo} 喺 GitHub 度已經有咗，係嗰度嘅一個倉庫，如果唔係有心用返嗰個，就要改個名。",
            "{owner}/{repo} 喺 GitHub 度已經有咗，早就俾人攞咗。除非本身就係想用嗰個，唔係就要諗過個名。",
        ],
    },
    "cirender.repo.unknown": {
        en: [
            "Could not check whether that name is free: {message}",
            "Could not check whether that name is free: {message}",
            "Could not check whether that name is free this time: {message}",
            "Could not check whether that name is free this time: {message}. Nothing else about it can be said yet.",
            "Could not check whether that name is free this time: {message}. GitHub was not talking - try the check again in a moment.",
        ],
        yue: [
            "查唔到呢個名係咪得閒：{message}",
            "查唔到呢個名係咪得閒：{message}",
            "呢個名係咪得閒，今次查唔到：{message}",
            "今次查唔到呢個名係咪得閒：{message}，其他嘢都未講得。",
            "今次查唔到呢個名係咪得閒：{message}。GitHub 呢次唔出聲，過陣再檢查多次啦。",
        ],
    },

    /*
     * The Check button, disabled and named exactly which field is missing - the same
     * discipline `blocked.*` above already holds the Render button to.
     */
    "cirender.checkBlocked.world": {
        en: [
            "Choose a world folder before checking.",
            "Choose a world folder before checking.",
            "Choose a world folder before checking the repository.",
            "Choose a world folder before checking - there is nothing to check the repository against yet.",
            "Choose a world folder before checking - the repository check has nothing to compare against otherwise.",
        ],
        yue: [
            "請先揀個世界資料夾，先至可以檢查。",
            "請先揀個世界資料夾，先至可以檢查。",
            "請先揀個世界資料夾，先至可以檢查個倉庫。",
            "請先揀個世界資料夾，先至可以檢查－而家都未有嘢可以用嚟同個倉庫對比。",
            "請先揀個世界資料夾，先至可以檢查－唔係嘅話，個倉庫檢查根本冇嘢好對比。",
        ],
    },
    "cirender.checkBlocked.owner": {
        en: [
            "Choose or type a repository owner before checking.",
            "Choose or type a repository owner before checking.",
            "Choose or type a repository owner before checking the repository.",
            "Choose a repository owner from the list, or type one, before checking.",
            "Pick a repository owner from the list, or type one in, before checking - the check has nowhere to look without it.",
        ],
        yue: [
            "請先揀或者打一個倉庫擁有者，先至可以檢查。",
            "請先揀或者打一個倉庫擁有者，先至可以檢查。",
            "請先揀或者打一個倉庫擁有者，先至可以檢查個倉庫。",
            "喺清單度揀個倉庫擁有者，或者自己打一個，先至可以檢查。",
            "喺清單度揀個倉庫擁有者，又或者自己打返一個，先至可以檢查－冇呢樣嘢，檢查根本唔知去邊度睇。",
        ],
    },
    "cirender.checkBlocked.repo": {
        en: [
            "Choose or type a repository name before checking.",
            "Choose or type a repository name before checking.",
            "Choose or type a repository name before checking the repository.",
            "Choose a repository name from the list, or type one, before checking.",
            "Pick a repository name from the list, or type one, before checking - the check has nothing to look up without it.",
        ],
        yue: [
            "請先揀或者打一個倉庫名，先至可以檢查。",
            "請先揀或者打一個倉庫名，先至可以檢查。",
            "請先揀或者打一個倉庫名，先至可以檢查個倉庫。",
            "喺清單度揀個倉庫名，或者自己打一個，先至可以檢查。",
            "喺清單度揀個倉庫名，又或者自己打返一個，先至可以檢查－冇呢樣嘢，檢查都唔知查邊個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Scheduled re-rendering: checking on a cadence, rendering only     */
    /* when something actually changed. See docs/scheduled-render.md.   */
    /* ---------------------------------------------------------------- */

    /*
     * The section's own explanation, read once when somebody opens it. The cost claim is
     * deliberately about *frequency*, never a made-up runner-minute figure - `{count}` is
     * the exact monthly check count `describeCadenceCost` computes, and every level keeps
     * that number rather than rounding it away for a punchier sentence.
     */
    "cirender.schedule.help": {
        en: [
            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one. A check reads a small amount of metadata, never the world itself, so it costs very little however often it runs.",
            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one. A check reads a small amount of metadata, never the world itself, so it costs very little however often it runs.",
            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one. A check reads a small amount of metadata rather than the world itself, so checking costs very little whatever the cadence.",
            "Checks about {count} times a month, and only spends real GitHub Actions minutes when a real change turns up. A check reads a little metadata, never the world itself, so the cadence barely moves the cost.",
            "Checks about {count} times a month and only bothers GitHub's runners when a real change actually turns up, since a check itself reads a scrap of metadata, never downloads the world, so dialling the cadence up costs you almost nothing but a few extra glances.",
        ],
        yue: [
            "呢個世界大約每個月 check {count} 次，搵到真係有改過先至會開始 render。check 淨係讀一小撮 metadata，唔會掂個世界本身，所以就算 check 得幾密都幾乎唔使錢。",
            "呢個世界大約每個月 check {count} 次，搵到真係有改過先至會開始 render。check 淨係讀一小撮 metadata，唔會掂個世界本身，所以就算 check 得幾密都幾乎唔使錢。",
            "呢個世界大約每個月 check {count} 次，搵到真係有改過先至會開始 render。check 淨係讀一小撮 metadata，唔會掂個世界本身，所以密啲 check 都好平。",
            "大約每個月 check {count} 次，搵到真係有嘢改過先會真金白銀去洗 GitHub Actions 嘅分鐘數。check 本身淨係讀返少少 metadata，唔會落去載個世界，所以 check 得密唔密，成本都冇乜分別。",
            "大約每個月 check {count} 次，搵到真係有嘢改過先至會勞煩 GitHub 啲 runner 出手，畢竟 check 本身就淨係睇少少 metadata，一格都唔會落去 load 個世界，所以你想 check 幾密都得，唔多過幾眼咁大把嘢。",
        ],
    },

    /*
     * One check's own outcome, shown beside "Last checked". Never guesses in either
     * direction: "unknown" states plainly that nothing comparable was available. Each
     * level keeps one exact phrase - what {@link CIRENDER_FACTS} pins below - so the fact
     * itself never moves even while the sentence around it gets more playful.
     */
    "cirender.schedule.result.changed": {
        en: [
            "the world had changed, so a render was started",
            "the world had changed, so a render was started",
            "the world had genuinely changed, so a render was started",
            "something had genuinely changed, so a render was started",
            "something had absolutely, unmistakably changed, so a render was started - no dawdling",
        ],
        yue: [
            "個世界改過，所以 render 已經開始咗",
            "個世界改過，所以 render 已經開始咗",
            "個世界真係改過，所以 render 已經開始咗",
            "真係有嘢改過，所以 render 已經開始咗",
            "真係實實在在改過，一格都走唔甩，所以 render 已經開始咗，仲即刻嗰種",
        ],
    },
    "cirender.schedule.result.unchanged": {
        en: [
            "the world had not changed, so nothing was rendered",
            "the world had not changed, so nothing was rendered",
            "the world had not changed at all, so nothing was rendered",
            "nothing had genuinely changed, so nothing was rendered",
            "not one block had changed, so nothing was rendered, and GitHub's runners went back to sleep",
        ],
        yue: [
            "個世界冇改過，所以乜都冇 render",
            "個世界冇改過，所以乜都冇 render",
            "個世界完全冇改過，所以乜都冇 render",
            "真係乜都冇改過，所以乜都冇 render",
            "一格都冇改過，所以乜都冇 render，GitHub 啲 runner 繼續瞓覺",
        ],
    },
    "cirender.schedule.result.unknown": {
        en: [
            "a change could not be cheaply told for this world's source",
            "a change could not be cheaply told for this world's source",
            "a change could not be cheaply told for this world's source, so nothing was rendered",
            "a change could not be cheaply told for this world's source, so nothing was rendered on a guess",
            "a change could not be cheaply told for this world's source, however hard it squinted, so nothing was rendered on a guess",
        ],
        yue: [
            "呢個世界嘅 source 冇得平價check有冇改過",
            "呢個世界嘅 source 冇得平價check有冇改過",
            "呢個世界嘅 source 冇得平價check有冇改過，所以乜都冇 render",
            "呢個世界嘅 source 冇得平價check有冇改過，所以唔會靠估去 render",
            "呢個世界嘅 source 冇得平價check有冇改過，眯埋眼都睇唔出，所以唔會靠估去 render",
        ],
    },
    "cirender.schedule.result.error": {
        en: [
            "the configured world could not be found by the last check",
            "the configured world could not be found by the last check",
            "the configured world could not be found by the last check, so nothing was rendered",
            "the configured world could not be found by the last check, so nothing was rendered",
            "the configured world could not be found by the last check, which went looking and came back with nothing, so nothing was rendered",
        ],
        yue: [
            "上次 check 搵唔到已配置嘅個世界",
            "上次 check 搵唔到已配置嘅個世界",
            "上次 check 搵唔到已配置嘅個世界，所以乜都冇 render",
            "上次 check 搵唔到已配置嘅個世界，所以乜都冇 render",
            "上次 check 搵唔到已配置嘅個世界，去搵完一場空手而回，所以乜都冇 render",
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
    "cirender.phase.uploading": {
        en: "Uploading the world to GitHub",
        yue: "上載緊個世界去 GitHub",
    },
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
    // The upload's own piece count (files while packing, parts while splitting, release
    // assets while uploading), shown beside the byte count once there is more than one piece.
    "cirender.transfer.items": {
        en: "{done} of {total} pieces",
        yue: "{total} 件入面嘅 {done} 件",
    },
    "cirender.jobs.search": { en: "Search jobs", yue: "搜尋工作" },
    "cirender.failingJob": { en: "The job that failed: {job}", yue: "失敗咗嗰個工作：{job}" },

    /*
     * The workflow runs shards in sequential waves; these three say which wave a job or a
     * shard group belongs to. `job.wave` labels one job's row, `wave.summary` totals a whole
     * wave's shards while it is still in progress.
     */
    "cirender.job.wave": { en: "Wave {wave}", yue: "第 {wave} 波" },
    "cirender.wave.summary": {
        en: "Wave {wave}: {done} of {total}",
        yue: "第 {wave} 波：{total} 入面嘅 {done}",
    },

    /* Which GitHub credential is driving this row: the app's own sign-in, or gh. */
    "cirender.row.route.gh": {
        en: "Using the gh command-line tool",
        yue: "用緊 gh 命令列工具",
    },
    "cirender.row.route.session": {
        en: "Using this application's GitHub sign-in",
        yue: "用緊呢個程式自己嘅 GitHub 登入",
    },

    /* Helper text under each field of the guided "What, and where" card. */
    "cirender.field.world.help": {
        en: "Pick a world below, browse for one, or type its full path.",
        yue: "喺下面揀個世界、瀏覽揾一個，或者直接打成個路徑。",
    },
    "cirender.field.world.browse": { en: "Browse", yue: "瀏覽" },
    "cirender.field.world.browsePrompt": {
        en: "Choose the world folder, the one that contains level.dat",
        yue: "揀個世界資料夾，即係入面有 level.dat 嗰個",
    },
    "cirender.field.world.browseUnavailable": {
        en: "This build cannot open a folder picker. Type the world's path above, or choose it from the list below.",
        yue: "呢個版本開唔到資料夾選擇器。喺上面打世界嘅路徑，或者喺下面個列表度揀一個。",
    },
    "cirender.field.world.browseUnavailableLabel": {
        en: "Browse: {reason}",
        yue: "瀏覽：{reason}",
    },
    "cirender.field.owner.help": {
        en: "Pick an account above, or type any owner you have write access to.",
        yue: "喺上面揀個帳戶，或者打任何一個你有寫入權限嘅擁有者。",
    },
    "cirender.field.repo.help": {
        en: "A name is suggested once you choose a world. It stays yours to change before checking.",
        yue: "揀咗個世界之後會有個建議名。檢查之前你隨時可以自己改。",
    },

    /*
     * The account picker: which of possibly several stored GitHub sign-ins this render
     * authenticates as. The label names the *consequence* of picking one rather than merely
     * "account", and the hint says the opposite of what it would be easy to assume: this is
     * a LOCAL choice, scoped to this card, and never the application-wide active-account
     * switch `GitHubAccountsList.vue` in Settings offers. Shown whenever the multi-account
     * registry exists at all - see `showAccountPicker` in `CiRenderScreen.vue` - so even a
     * single stored account is named on screen rather than only implied.
     */
    "cirender.account.pick": { en: "Render as", yue: "算圖帳戶" },
    "cirender.account.help": {
        en: "Which signed-in account this render authenticates as. Choosing a different one here does not change the active account used anywhere else in the app.",
        yue: "呢個算圖用邊個已登入帳戶做認證。喺呢度揀第個都唔會改到程式其他地方用緊嗰個帳戶。",
    },
    /* Exactly one signed-in account: the picker still shows it, but names why it is fixed. */
    "cirender.account.single": {
        en: "Only one GitHub account is signed in, so this is fixed to it.",
        yue: "淨係得一個 GitHub 帳戶登入咗，所以固定用嗰個。",
    },
    /** Which one every other legacy channel already resolves to, named on the item itself. */
    "cirender.account.itemActive": { en: "{login} (active)", yue: "{login}（用緊）" },
    "cirender.account.disabledLabel": { en: "Render as: {reason}", yue: "算圖帳戶：{reason}" },

    /* The owner picker: its two item shapes, and the two ways it can come up short. */
    "cirender.owner.pick": { en: "Choose an owner", yue: "揀個擁有者" },
    "cirender.owner.asYou": { en: "{login} (you)", yue: "{login}（你）" },
    "cirender.owner.asOrg": { en: "{login} (organization)", yue: "{login}（機構）" },
    "cirender.owner.retry": { en: "Try again", yue: "再試一次" },

    /* The repository picker, and the availability check's own transient state. */
    "cirender.repo.pick": { en: "One of your repositories", yue: "你其中一個倉庫" },
    "cirender.repo.itemPrivate": { en: "{name} (private)", yue: "{name}（私人）" },
    "cirender.repo.itemPublic": { en: "{name} (PUBLIC)", yue: "{name}（公開）" },
    "cirender.repo.checking": { en: "Checking whether that name is free...", yue: "檢查緊呢個名係咪得閒..." },
    "cirender.repo.loadingRepositories": {
        en: "Reading your repositories...",
        yue: "讀緊你嘅倉庫...",
    },

    /* Scheduled re-rendering: the section title, its toggle, the cadence choices, and the
     * status readout. Short factual labels, like every other field name on this screen. */
    "cirender.schedule.title": { en: "Scheduled re-rendering", yue: "排程算圖" },
    "cirender.schedule.enable": { en: "Check automatically", yue: "自動檢查" },
    "cirender.schedule.cadence": { en: "How often", yue: "幾密" },
    "cirender.schedule.cadence.hourly": { en: "Every hour", yue: "每個鐘" },
    "cirender.schedule.cadence.sixHourly": { en: "Every 6 hours", yue: "每 6 個鐘" },
    "cirender.schedule.cadence.daily": { en: "Every day", yue: "每日" },
    "cirender.schedule.cadence.weekly": { en: "Every week", yue: "每星期" },
    "cirender.schedule.lastCheck": { en: "Last checked", yue: "上次檢查" },
    "cirender.schedule.lastCheck.never": { en: "Never yet", yue: "仲未check過" },
    "cirender.schedule.nextCheck": { en: "Next check", yue: "下次檢查" },
    "cirender.schedule.lastRender": { en: "Last render started", yue: "上次開始算圖" },
    "cirender.schedule.reason": { en: "Why: {reason}", yue: "原因：{reason}" },
    "cirender.schedule.loading": { en: "Reading the schedule...", yue: "讀緊排程..." },
    "cirender.schedule.saving": { en: "Saving...", yue: "儲緊..." },
} as const satisfies Record<string, FixedString>;

export const CIRENDER_FACTS = {
    // What this list is for, and the exact label of the button that fills it.
    "cirender.list.empty": {
        en: ["GitHub's own computers", "Render on GitHub"],
        yue: ["GitHub 自己部機", "喺 GitHub 度算圖"],
    },
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
        en: [
            "uploads the world",
            "GitHub's runners",
            "parallel jobs",
            "opens exactly like a local one",
        ],
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
    "cirender.ack.public": {
        en: ["PUBLIC", "download the world"],
        yue: ["PUBLIC", "下載呢個世界"],
    },
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

    "cirender.done": {
        en: ["{map}", "map list", "rendered on GitHub"],
        yue: ["{map}", "地圖清單", "GitHub"],
    },
    // "recorded" and "verified" are different claims, and the distinction is the message.
    "cirender.recorded": {
        en: ["no checksum", "SHA-256", "recorded rather than verified"],
        yue: ["checksum", "SHA-256", "記錄咗", "唔算驗證過"],
    },

    // Which account this render runs as at all, not which login or org it publishes under.
    "cirender.account.signedOut": {
        en: ["Nobody is signed in", "Sign in from Settings"],
        yue: ["冇人登入", "設定入面登入"],
    },

    // The remedy - Settings, or free text - is the point, not merely "nobody signed in".
    "cirender.owner.signedOut": {
        en: ["Nobody is signed in", "Sign in from Settings", "type the owner directly"],
        yue: ["冇人登入", "設定入面登入", "直接", "打個擁有者"],
    },

    // Each rule names exactly what is broken, so the fix is obvious rather than guessed.
    "cirender.repo.invalid.chars": {
        en: ["letters, digits, dots, hyphens and underscores"],
        yue: ["英文字母", "數字", "句號", "連字號", "底線"],
    },
    "cirender.repo.invalid.dots": {
        en: ['"."', '".."'],
        yue: ["「.」", "「..」"],
    },
    "cirender.repo.invalid.gitSuffix": {
        en: ['".git"'],
        yue: ["「.git」"],
    },
    "cirender.repo.invalid.long": {
        en: ["100 characters"],
        yue: ["100 個字"],
    },

    // {owner} and {repo} are what makes the claim checkable against the real name typed.
    "cirender.repo.available": {
        en: ["{owner}", "{repo}", "free on GitHub"],
        yue: ["{owner}", "{repo}", "未有人用"],
    },
    "cirender.repo.taken": {
        en: ["{owner}", "{repo}", "already exists"],
        yue: ["{owner}", "{repo}", "已經有咗"],
    },
    "cirender.repo.unknown": {
        en: ["{message}", "Could not check"],
        yue: ["{message}", "查唔到"],
    },

    "cirender.checkBlocked.world": {
        en: ["Choose a world folder", "before checking"],
        yue: ["揀個世界資料夾", "先至可以檢查"],
    },
    "cirender.checkBlocked.owner": {
        en: ["repository owner", "before checking"],
        yue: ["倉庫擁有者", "先至可以檢查"],
    },
    "cirender.checkBlocked.repo": {
        en: ["repository name", "before checking"],
        yue: ["倉庫名", "先至可以檢查"],
    },

    "cirender.schedule.help": {
        en: ["{count}", "metadata"],
        yue: ["{count}", "metadata"],
    },
    "cirender.schedule.result.changed": {
        en: ["a render was started"],
        yue: ["render 已經開始咗"],
    },
    "cirender.schedule.result.unchanged": {
        en: ["nothing was rendered"],
        yue: ["乜都冇 render"],
    },
    "cirender.schedule.result.unknown": {
        en: ["a change could not be cheaply told for this world's source"],
        yue: ["呢個世界嘅 source 冇得平價check有冇改過"],
    },
    "cirender.schedule.result.error": {
        en: ["the configured world could not be found by the last check"],
        yue: ["上次 check 搵唔到已配置嘅個世界"],
    },
} as const satisfies Record<
    keyof typeof CIRENDER_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
