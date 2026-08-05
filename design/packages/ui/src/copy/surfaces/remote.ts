/**
 * Maps and servers: where a render runs, Docker's state on this computer, the machines
 * somebody has set up to render on, and the four checks a machine passes before a byte of
 * their world leaves this one.
 *
 * ## Why this surface is the least forgiving one in the catalogue
 *
 * Every other screen can lose a clause to a joke and cost somebody a re-read. This one
 * carries credentials, trust decisions and network failures, where a lost clause costs
 * something else entirely:
 *
 * - **"not reachable yet" and "wrong credentials" are different facts.** So are "the daemon
 *   is not running" and "Docker is not installed", and "the key changed" and "the key could
 *   not be read". Each pair has an opposite fix, and a level that rounds either of them to
 *   "having trouble" has sent somebody to fix the wrong thing. The `_FACTS` entries below
 *   pin the distinguishing half of every pair.
 * - **A failure reads as a failure at level 5.** A refused connection, a timeout and an
 *   untrusted host key are said in those words at every level. Playfulness lives in the
 *   sentence around them, never in the verdict.
 * - **The credential clauses are load-bearing.** "A path, never the key itself", "no
 *   password field anywhere in this feature", "nothing is recorded until you accept" and
 *   "a complete copy of your world stays on that machine" are the sentences somebody makes
 *   a decision on. They appear verbatim in all ten strings of their entry.
 *
 * Host names, ports, paths, commands and version strings are identifiers and are identical
 * in both languages: `'docker version'`, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`,
 * `PATH`, `Docker Desktop` and `{version}` all read the same to a Cantonese reader, because
 * they are things to type or to search for rather than things to read.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const REMOTE_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Docker on this computer: five states, five different fixes        */
    /* ---------------------------------------------------------------- */

    /*
     * `dockerStates.ts` goes to real trouble to keep these apart and the whole value of it
     * is lost if a playful level collapses them back into one red line. The two that look
     * alike to a naive reader have opposite fixes: "installed, daemon not running" is
     * solved by starting Docker Desktop, and "not installed" by downloading it. So every
     * level of the daemon-down entries keeps "is installed", and every level of the missing
     * ones keeps "not installed".
     */
    "remote.docker.available.headline": {
        en: [
            "{name} is installed and its daemon is running.",
            "{name} is installed and its daemon is running.",
            "{name} is installed and its daemon is running, so a container can start.",
            "{name} is installed and its daemon is running. Everything that needs to be awake is awake.",
            "{name} is installed and its daemon is running. Both halves of Docker turned up for work today.",
        ],
        yue: [
            "{name} 已安裝，佢個 daemon 行緊。",
            "{name} 已安裝，佢個 daemon 行緊。",
            "{name} 已安裝，佢個 daemon 行緊，即刻開得container。",
            "{name} 已安裝，佢個 daemon 行緊。要醒嘅嘢全部都醒晒。",
            "{name} 已安裝，佢個 daemon 行緊。難得今日兩邊都肯返工。",
        ],
    },
    "remote.docker.available.headlineServer": {
        en: [
            "{name} is installed and its daemon ({server}) is running.",
            "{name} is installed and its daemon ({server}) is running.",
            "{name} is installed and its daemon ({server}) is running, so a container can start.",
            "{name} is installed and its daemon ({server}) is running. Both halves awake.",
            "{name} is installed and its daemon ({server}) is running. Client and daemon, both awake and still on speaking terms.",
        ],
        yue: [
            "{name} 已安裝，佢個 daemon（{server}）行緊。",
            "{name} 已安裝，佢個 daemon（{server}）行緊。",
            "{name} 已安裝，佢個 daemon（{server}）行緊，即刻開得container。",
            "{name} 已安裝，佢個 daemon（{server}）行緊。兩邊都醒晒。",
            "{name} 已安裝，佢個 daemon（{server}）行緊，client 同 daemon 仲傾得埋，難得。",
        ],
    },
    "remote.docker.available.explanation": {
        en: [
            "A container can be started right now. The engine would run on the Java inside the image rather than the Java on this machine, and it would see the world folder, the output folder and nothing else here.",
            "A container can be started right now. The engine would run on the Java inside the image rather than the Java on this machine, and it would see the world folder, the output folder and nothing else here.",
            "A container can be started right now. The engine would run on the Java inside the image rather than the one on this machine, and it would see the world folder, the output folder and nothing else here.",
            "A container can be started right now. The engine would run on the Java inside the image instead of the one on this machine, and its whole view of your disk is the world folder, the output folder and nothing else here.",
            "A container can be started right now. The engine would run on the Java inside the image instead of the one on this machine, and its entire view of your disk is the world folder, the output folder and nothing else here. It has no idea the rest of your computer exists, which is the point.",
        ],
        yue: [
            "而家即刻開得一個container。引擎會行 image 入面嗰個 Java，唔係呢部機上面嗰個，而佢淨係見到世界資料夾、輸出資料夾，呢部機其他嘢一律見唔到。",
            "而家即刻開得一個container。引擎會行 image 入面嗰個 Java，唔係呢部機上面嗰個，而佢淨係見到世界資料夾、輸出資料夾，呢部機其他嘢一律見唔到。",
            "而家即刻開得一個container。引擎會行 image 入面嗰個 Java，唔係呢部機上面嗰個；佢喺你隻碟上面淨係見到世界資料夾、輸出資料夾，其他嘢一律見唔到。",
            "而家即刻開得一個container。引擎會行 image 入面嗰個 Java，唔係呢部機上面嗰個；佢對你隻碟嘅認知就得世界資料夾、輸出資料夾，其他嘢一律見唔到。",
            "而家即刻開得一個container。引擎會行 image 入面嗰個 Java，唔係呢部機上面嗰個；佢對你隻碟嘅認知就得世界資料夾、輸出資料夾，其他嘢一律見唔到，根本唔知你部電腦仲有第二啲嘢，而咁樣正正就係重點。",
        ],
    },
    "remote.docker.available.next": {
        en: [
            "Nothing to do. Choose it below if you want the isolation; local is faster.",
            "Nothing to do. Choose it below if you want the isolation; local is faster.",
            "Nothing to do. Choose it below if the isolation is what you are after; local is faster.",
            "Nothing to do here. Choose it below if the isolation is what you are after; local is faster.",
            "Nothing to do here, for once. Choose it below if the isolation is what you are after; local is faster, and that is not a typo.",
        ],
        yue: [
            "冇嘢要做。想要隔離嘅話就喺下面揀佢；本機行會快啲。",
            "冇嘢要做。想要隔離嘅話就喺下面揀佢；本機行會快啲。",
            "冇嘢要做。如果你要嘅係隔離，就喺下面揀佢；本機行會快啲。",
            "呢度冇嘢要做。如果你要嘅係隔離，就喺下面揀佢；本機行會快啲。",
            "難得呢度冇嘢要做。如果你要嘅係隔離，就喺下面揀佢；本機行會快啲，唔係打錯字。",
        ],
    },

    "remote.docker.daemonDown.headline": {
        en: [
            "{name} is installed, and its daemon is not running.",
            "{name} is installed, and its daemon is not running.",
            "{name} is installed, and the part that is not running is its daemon.",
            "{name} is installed, so there is nothing to download. The part that is not running is its daemon.",
            "{name} is installed, so there is nothing to download and nothing to fix. Its daemon is not running, and that is the whole of it.",
        ],
        yue: [
            "{name} 已安裝，但係佢個 daemon 冇行緊。",
            "{name} 已安裝，但係佢個 daemon 冇行緊。",
            "{name} 已安裝，冇行緊嗰部分係佢個 daemon。",
            "{name} 已安裝，所以唔使download；冇行緊嗰部分係佢個 daemon。",
            "{name} 已安裝，唔使download亦唔使修。問題淨係佢個 daemon 冇行緊，就係咁多。",
        ],
    },
    "remote.docker.daemonDown.explanation": {
        en: [
            "The 'docker' command is here and answered about itself, but the engine behind it did not answer at all. Nothing is missing and nothing needs downloading: the part that actually runs containers is switched off.",
            "The 'docker' command is here and answered about itself, but the engine behind it did not answer at all. Nothing is missing and nothing needs downloading: the part that actually runs containers is switched off.",
            "The 'docker' command is here and answered about itself, while the engine behind it did not answer at all. Nothing is missing and nothing needs downloading: the part that actually runs containers is switched off.",
            "The 'docker' command is here and happily answered about itself, and then the engine behind it did not answer at all. Nothing is missing and nothing needs downloading: the part that actually runs containers is switched off.",
            "The 'docker' command is here and was delighted to tell us all about itself, after which the engine behind it did not answer at all. Nothing is missing and nothing needs downloading: the part that actually runs containers is switched off, sitting there, doing nothing.",
        ],
        yue: [
            "'docker' 指令喺度，亦答到自己嘅嘢，但係後面隻引擎完全冇應。冇任何嘢唔見咗，亦唔使download任何嘢：真正負責行container嗰部分係熄咗。",
            "'docker' 指令喺度，亦答到自己嘅嘢，但係後面隻引擎完全冇應。冇任何嘢唔見咗，亦唔使download任何嘢：真正負責行container嗰部分係熄咗。",
            "'docker' 指令喺度，亦答到自己嘅嘢，不過後面隻引擎完全冇應。冇任何嘢唔見咗，亦唔使download任何嘢：真正負責行container嗰部分係熄咗。",
            "'docker' 指令喺度，講自己嘅嘢仲講得幾起勁，跟住後面隻引擎完全冇應。冇任何嘢唔見咗，亦唔使download任何嘢：真正負責行container嗰部分係熄咗。",
            "'docker' 指令喺度，講自己嘅嘢講到眉飛色舞，之後後面隻引擎完全冇應。冇任何嘢唔見咗，亦唔使download任何嘢：真正負責行container嗰部分係熄咗，靜靜哋坐喺度乜都唔做。",
        ],
    },
    "remote.docker.daemonDown.next": {
        en: [
            "Start Docker Desktop (or the docker service), wait for it to finish starting, and check again.",
            "Start Docker Desktop (or the docker service), wait for it to finish starting, and check again.",
            "Start Docker Desktop (or the docker service), wait for it to finish starting properly, and check again.",
            "Start Docker Desktop (or the docker service), give it a moment to finish starting, and check again.",
            "Start Docker Desktop (or the docker service), then let it finish starting, which it takes its time over, and check again.",
        ],
        yue: [
            "開返 Docker Desktop（或者 docker service），等佢起完，然後再check一次。",
            "開返 Docker Desktop（或者 docker service），等佢起完，然後再check一次。",
            "開返 Docker Desktop（或者 docker service），等佢完全起好，然後再check一次。",
            "開返 Docker Desktop（或者 docker service），俾少少時間佢起完，然後再check一次。",
            "開返 Docker Desktop（或者 docker service）。佢起身慢過返工，等佢起完先再check一次。",
        ],
    },

    "remote.docker.missing.headline": {
        en: [
            "Docker is not installed on this computer.",
            "Docker is not installed on this computer.",
            "Docker is not installed on this computer at all.",
            "Docker is not installed on this computer. Not stopped, not broken.",
            "Docker is not installed on this computer. Not stopped, not broken, not sulking: absent.",
        ],
        yue: [
            "呢部電腦冇裝 Docker。",
            "呢部電腦冇裝 Docker。",
            "呢部電腦根本冇裝 Docker。",
            "呢部電腦冇裝 Docker。唔係停咗，亦唔係壞咗。",
            "呢部電腦冇裝 Docker。唔係停咗，唔係壞咗，唔係扭計，係根本冇。",
        ],
    },
    "remote.docker.missing.explanation": {
        en: [
            "There is no 'docker' command on this account's PATH, so there is nothing here to start a container with. This is not a fault: rendering on this machine as an ordinary program needs none of it.",
            "There is no 'docker' command on this account's PATH, so there is nothing here to start a container with. This is not a fault: rendering on this machine as an ordinary program needs none of it.",
            "There is no 'docker' command on this account's PATH, so there is nothing here to start a container with. This is not a fault; rendering on this machine as an ordinary program needs none of it.",
            "There is no 'docker' command on this account's PATH, so there is nothing here to start a container with. This is not a fault: rendering on this machine as an ordinary program needs none of it whatsoever.",
            "There is no 'docker' command on this account's PATH, so there is nothing here to start a container with. This is not a fault, it is an absence: rendering on this machine as an ordinary program needs none of it and never asked for any.",
        ],
        yue: [
            "呢個帳戶嘅 PATH 上面冇 'docker' 指令，所以呢度冇嘢開得container。呢個唔係故障：喺呢部機當普通程式咁算圖，一樣都唔需要。",
            "呢個帳戶嘅 PATH 上面冇 'docker' 指令，所以呢度冇嘢開得container。呢個唔係故障：喺呢部機當普通程式咁算圖，一樣都唔需要。",
            "呢個帳戶嘅 PATH 上面冇 'docker' 指令，所以呢度冇嘢開得container。呢個唔係故障；喺呢部機當普通程式咁算圖，一樣都唔需要。",
            "呢個帳戶嘅 PATH 上面冇 'docker' 指令，所以呢度根本冇嘢開得container。呢個唔係故障：喺呢部機當普通程式咁算圖，一樣都唔需要。",
            "呢個帳戶嘅 PATH 上面冇 'docker' 指令，所以呢度根本冇嘢開得container。呢個唔係故障，係本來就冇：喺呢部機當普通程式咁算圖，一樣都唔需要，由頭到尾都冇要求過。",
        ],
    },
    "remote.docker.missing.next": {
        en: [
            "Install Docker Desktop if you want container isolation, or leave this alone and render locally.",
            "Install Docker Desktop if you want container isolation, or leave this alone and render locally.",
            "Install Docker Desktop if container isolation is what you want, or leave this alone and render locally.",
            "Install Docker Desktop if container isolation is what you want. Otherwise leave this alone and render locally.",
            "Install Docker Desktop if container isolation is what you want. Otherwise leave this alone and render locally, which needs nothing from anybody.",
        ],
        yue: [
            "想要container隔離就裝 Docker Desktop，唔想就唔好理佢，喺本機算就得。",
            "想要container隔離就裝 Docker Desktop，唔想就唔好理佢，喺本機算就得。",
            "如果你要container隔離，就裝 Docker Desktop；唔要嘅話唔好理佢，喺本機算就得。",
            "如果你要嘅係container隔離，就裝 Docker Desktop；唔要嘅話由得佢，喺本機算就得。",
            "如果你要嘅係container隔離，就裝 Docker Desktop。唔係嘅話由得佢喺度，喺本機算就得，唔使求人。",
        ],
    },

    /*
     * Refused is not unreachable. The daemon answered and said no, so the fix is a group
     * membership rather than starting anything, and "refused this account" survives every
     * level in both languages for exactly that reason.
     */
    "remote.docker.refused.headline": {
        en: [
            "{name} is installed, and this account may not talk to its daemon.",
            "{name} is installed, and this account may not talk to its daemon.",
            "{name} is installed, and this account is not permitted to talk to its daemon.",
            "{name} is installed and running. What it will not do is let this account talk to its daemon.",
            "{name} is installed and running perfectly well. It simply will not let this account talk to its daemon, and it said so out loud.",
        ],
        yue: [
            "{name} 已安裝，但係呢個帳戶唔准同佢個 daemon 講嘢。",
            "{name} 已安裝，但係呢個帳戶唔准同佢個 daemon 講嘢。",
            "{name} 已安裝，但係呢個帳戶冇權同佢個 daemon 講嘢。",
            "{name} 已安裝而且行緊，佢唔肯做嘅係俾呢個帳戶同佢個 daemon 講嘢。",
            "{name} 已安裝，行得好地地，佢就係唔肯俾呢個帳戶同佢個 daemon 講嘢，仲要係夠膽出聲拒絕嗰隻。",
        ],
    },
    "remote.docker.refused.explanation": {
        en: [
            "The daemon is running and it refused this account rather than failing to answer. That is a permission on the daemon's socket, not a problem with Docker or with this application.",
            "The daemon is running and it refused this account rather than failing to answer. That is a permission on the daemon's socket, not a problem with Docker or with this application.",
            "The daemon is running and it refused this account rather than failing to answer at all. That is a permission on the daemon's socket, not a problem with Docker or with this application.",
            "The daemon is running, and it refused this account rather than failing to answer, which are two very different things. That is a permission on the daemon's socket, not a problem with Docker or with this application.",
            "The daemon is running and it refused this account to its face, which is not remotely the same as failing to answer. That is a permission on the daemon's socket, not a problem with Docker or with this application.",
        ],
        yue: [
            "個 daemon 行緊，佢係拒絕咗呢個帳戶，唔係答唔到。呢個係 daemon socket 上面嘅權限問題，唔係 Docker 或者本程式有問題。",
            "個 daemon 行緊，佢係拒絕咗呢個帳戶，唔係答唔到。呢個係 daemon socket 上面嘅權限問題，唔係 Docker 或者本程式有問題。",
            "個 daemon 行緊，佢係拒絕咗呢個帳戶，而唔係答唔到。呢個係 daemon socket 上面嘅權限問題，唔係 Docker 或者本程式有問題。",
            "個 daemon 行緊，仲要係當面拒絕咗呢個帳戶，唔係答唔到，兩件事差好遠。呢個係 daemon socket 上面嘅權限問題，唔係 Docker 或者本程式有問題。",
            "個 daemon 行得好地地，望一望就拒絕咗呢個帳戶，同「答唔到」完全係兩回事。呢個係 daemon socket 上面嘅權限問題，唔係 Docker 或者本程式有問題。",
        ],
    },
    "remote.docker.refused.next": {
        en: [
            "Add this account to the group that may use Docker (on Linux, usually 'docker'), then sign out and in again so the new group takes effect.",
            "Add this account to the group that may use Docker (on Linux, usually 'docker'), then sign out and in again so the new group takes effect.",
            "Add this account to the group that may use Docker (on Linux, usually 'docker'), then sign out and back in so the new group takes effect.",
            "Add this account to the group that may use Docker (on Linux, usually 'docker'), then sign out and back in. The new group does not take effect until you do.",
            "Add this account to the group that may use Docker (on Linux, usually 'docker'), then sign out and back in. The new group does not take effect until you do, however hard you stare at it.",
        ],
        yue: [
            "將呢個帳戶加入可以用 Docker 嘅群組（Linux 上面通常叫 'docker'），然後登出再登入，個新群組先會生效。",
            "將呢個帳戶加入可以用 Docker 嘅群組（Linux 上面通常叫 'docker'），然後登出再登入，個新群組先會生效。",
            "將呢個帳戶加入可以用 Docker 嘅群組（Linux 上面通常叫 'docker'），跟住登出再登入一次，個新群組先會生效。",
            "將呢個帳戶加入可以用 Docker 嘅群組（Linux 上面通常叫 'docker'），跟住登出再登入。唔登出嘅話，個新群組唔會生效。",
            "將呢個帳戶加入可以用 Docker 嘅群組（Linux 上面通常叫 'docker'），跟住乖乖登出再登入。你望到眼都突都好，唔登出個新群組就係唔會生效。",
        ],
    },

    "remote.docker.unusable.headline": {
        en: [
            "{name} answered with something this application does not recognise.",
            "{name} answered with something this application does not recognise.",
            "{name} answered with something this application does not recognise at all.",
            "{name} answered, and what it said is something this application does not recognise.",
            "{name} answered, and what it said is something this application does not recognise. Pretending otherwise would not help you.",
        ],
        yue: [
            "{name} 答咗啲本程式認唔到嘅嘢。",
            "{name} 答咗啲本程式認唔到嘅嘢。",
            "{name} 答咗啲本程式完全認唔到嘅嘢。",
            "{name} 有答嘢，不過講嗰啲本程式認唔到。",
            "{name} 有答嘢，不過講嗰啲本程式認唔到；喺呢度扮識只會累你。",
        ],
    },
    "remote.docker.unusable.explanation": {
        en: [
            "The command ran and its answer was neither a working daemon nor any of the failures this application knows how to explain. Docker's own words are below, and they are the precise thing to search for.",
            "The command ran and its answer was neither a working daemon nor any of the failures this application knows how to explain. Docker's own words are below, and they are the precise thing to search for.",
            "The command ran, and its answer was neither a working daemon nor any of the failures this application knows how to explain. Docker's own words are below, and they are the precise thing to search for.",
            "The command ran. Its answer was neither a working daemon nor any of the failures this application knows how to explain. Docker's own words are below, unedited, and they are the precise thing to search for.",
            "The command ran, and then said something that is neither a working daemon nor any of the failures this application knows how to explain. Docker's own words are below, unedited and unimproved, and they are the precise thing to search for.",
        ],
        yue: [
            "個指令行到，但佢嘅回覆既唔係一個行緊嘅 daemon，亦唔係本程式識解釋嘅任何一種失敗。Docker 自己講嘅嘢喺下面，攞嗰段字去搵就啱。",
            "個指令行到，但佢嘅回覆既唔係一個行緊嘅 daemon，亦唔係本程式識解釋嘅任何一種失敗。Docker 自己講嘅嘢喺下面，攞嗰段字去搵就啱。",
            "個指令行到，不過佢嘅回覆既唔係一個行緊嘅 daemon，亦唔係本程式識解釋嘅任何一種失敗。Docker 自己講嘅嘢喺下面，攞嗰段字去搵就啱。",
            "個指令係行到。佢嘅回覆既唔係一個行緊嘅 daemon，亦唔係本程式識解釋嘅任何一種失敗。Docker 自己講嘅嘢原句喺下面，攞嗰段字去搵就啱。",
            "個指令行到，跟住講咗啲既唔係一個行緊嘅 daemon、亦唔係本程式識解釋嘅任何一種失敗嘅嘢。Docker 自己講嘅嘢原封不動喺下面，攞嗰段字去搵就啱。",
        ],
    },
    "remote.docker.unusable.next": {
        en: [
            "Run 'docker version' in a terminal and read what it says. Rendering locally is unaffected.",
            "Run 'docker version' in a terminal and read what it says. Rendering locally is unaffected.",
            "Run 'docker version' in a terminal and read what it says, carefully. Rendering locally is unaffected.",
            "Run 'docker version' in a terminal and read what it tells you there. Rendering locally is unaffected.",
            "Run 'docker version' in a terminal and read what it tells you there; it is franker in a terminal than it is here. Rendering locally is unaffected.",
        ],
        yue: [
            "喺terminal行 'docker version'，睇下佢講咩。喺本機算圖唔受影響。",
            "喺terminal行 'docker version'，睇下佢講咩。喺本機算圖唔受影響。",
            "喺terminal行 'docker version'，睇清楚佢講咩。喺本機算圖唔受影響。",
            "喺terminal行一次 'docker version'，睇清楚佢喺嗰邊講咩。喺本機算圖唔受影響。",
            "喺terminal行一次 'docker version'。佢喺terminal講嘢坦白過喺呢度，睇清楚佢講咩。喺本機算圖唔受影響。",
        ],
    },

    /*
     * "Nobody asked Docker anything" is not "Docker answered strangely", and only one of
     * the two is about Docker. Every level says the limit belongs to the build, so nobody
     * goes off to debug an installation that may be perfectly healthy.
     */
    "remote.docker.unprobed.headline": {
        en: [
            "This build cannot check whether Docker is here.",
            "This build cannot check whether Docker is here.",
            "This build cannot check whether Docker is here at all.",
            "This build has no way to check whether Docker is here.",
            "This build has no way to check whether Docker is here, so it is not going to guess.",
        ],
        yue: [
            "呢個build check唔到 Docker 喺唔喺度。",
            "呢個build check唔到 Docker 喺唔喺度。",
            "呢個build根本check唔到 Docker 喺唔喺度。",
            "呢個build冇辦法知 Docker 喺唔喺度。",
            "呢個build冇辦法知 Docker 喺唔喺度，所以佢唔會亂估。",
        ],
    },
    "remote.docker.unprobed.explanation": {
        en: [
            "Nothing has been asked of Docker, so nothing is known about it. This is a limit of the build you are running, not a statement about your machine.",
            "Nothing has been asked of Docker, so nothing is known about it. This is a limit of the build you are running, not a statement about your machine.",
            "Nothing has been asked of Docker, so nothing is known about it either way. This is a limit of the build you are running, not a statement about your machine.",
            "Nothing has been asked of Docker, so nothing is known about it either way. The silence is a limit of the build you are running, not a statement about your machine.",
            "Nothing has been asked of Docker, so nothing is known about it either way. The silence here is a limit of the build you are running and not a statement about your machine, which may well have a perfectly happy Docker on it.",
        ],
        yue: [
            "冇問過 Docker 任何嘢，所以對佢一無所知。呢個係你行緊嗰個build嘅限制，唔係講你部機。",
            "冇問過 Docker 任何嘢，所以對佢一無所知。呢個係你行緊嗰個build嘅限制，唔係講你部機。",
            "根本冇問過 Docker 任何嘢，所以對佢一無所知。呢個係你行緊嗰個build嘅限制，唔係講你部機。",
            "由頭到尾冇問過 Docker 任何嘢，所以對佢一無所知。呢度靜係因為你行緊嗰個build嘅限制，唔係講你部機。",
            "由頭到尾冇問過 Docker 任何嘢，所以對佢一無所知。呢度靜係因為你行緊嗰個build嘅限制，唔係講你部機，你部機分分鐘有個好好地嘅 Docker。",
        ],
    },
    "remote.docker.unprobed.next": {
        en: [
            "Open this in the desktop application to see Docker's real state. Rendering locally works either way.",
            "Open this in the desktop application to see Docker's real state. Rendering locally works either way.",
            "Open this in the desktop application if you want Docker's real state. Rendering locally works either way.",
            "Open this in the desktop application if you want Docker's real state rather than a shrug. Rendering locally works either way.",
            "Open this in the desktop application if you want Docker's real state rather than a shrug from a browser tab. Rendering locally works either way.",
        ],
        yue: [
            "喺桌面程式度開返呢一頁，就見到 Docker 嘅真實狀態。無論點樣，喺本機算圖都照行。",
            "喺桌面程式度開返呢一頁，就見到 Docker 嘅真實狀態。無論點樣，喺本機算圖都照行。",
            "想知 Docker 嘅真實狀態，就喺桌面程式度開返呢一頁。無論點樣，喺本機算圖都照行。",
            "想知 Docker 嘅真實狀態而唔係一個聳膊頭，就要喺桌面程式度開返呢一頁。無論點樣，喺本機算圖都照行。",
            "想知 Docker 嘅真實狀態，而唔係一個瀏覽器分頁聳膊頭，就要喺桌面程式度開返呢一頁。無論點樣，喺本機算圖都照行。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What each of the four checks is for                               */
    /* ---------------------------------------------------------------- */

    /*
     * Said before the check runs, so the wait means something. The sign-in one carries the
     * password promise: this feature has no password field and the SSH client is told to
     * refuse one, and somebody reading the purpose line deserves that up front rather than
     * only in the key-file hint further down.
     */
    "remote.preflight.purpose.ssh": {
        en: [
            "Signs in with your agent or your key file. No password is offered and none is asked for.",
            "Signs in with your agent or your key file. No password is offered and none is asked for.",
            "Signs in with your agent or your key file. No password is offered and none is asked for at any point.",
            "Signs in with your agent or your key file. No password is offered and none is asked for, here or anywhere else in this feature.",
            "Signs in with your agent or your key file. No password is offered and none is asked for, because there is nowhere in this application to keep one.",
        ],
        yue: [
            "用你嘅 agent 或者你嘅key file登入。唔會俾密碼，亦唔會問你攞密碼。",
            "用你嘅 agent 或者你嘅key file登入。唔會俾密碼，亦唔會問你攞密碼。",
            "用你嘅 agent 或者你嘅key file登入。全程唔會俾密碼，亦唔會問你攞密碼。",
            "用你嘅 agent 或者你嘅key file登入。全程唔會俾密碼，亦唔會問你攞密碼，呢個功能任何一處都唔會。",
            "用你嘅 agent 或者你嘅key file登入。全程唔會俾密碼，亦唔會問你攞密碼，因為本程式根本冇地方擺得低一個。",
        ],
    },
    "remote.preflight.purpose.hostKey": {
        en: [
            "Proves the machine answering is the one that answered last time.",
            "Proves the machine answering is the one that answered last time.",
            "Proves the machine answering now is the one that answered last time.",
            "Proves the machine answering now is the same one that answered last time.",
            "Proves the machine answering now is the same one that answered last time, and not something wearing its address.",
        ],
        yue: [
            "證實而家應機嗰部機，就係上次應機嗰部。",
            "證實而家應機嗰部機，就係上次應機嗰部。",
            "證實而家應機嗰部機，同上次應機嗰部係同一部。",
            "證實而家應機嗰部機，同上次應機嗰部一定要係同一部。",
            "證實而家應機嗰部機，同上次應機嗰部係同一部，唔係第二樣嘢借咗個地址嚟著。",
        ],
    },
    "remote.preflight.purpose.docker": {
        en: [
            "Asks that machine whether it has Docker and whether its daemon is running.",
            "Asks that machine whether it has Docker and whether its daemon is running.",
            "Asks that machine whether it has Docker, and whether its daemon is running.",
            "Asks that machine two things: whether it has Docker, and whether its daemon is running.",
            "Asks that machine two things, because they really are two things: whether it has Docker, and whether its daemon is running.",
        ],
        yue: [
            "問嗰部機有冇 Docker，同埋佢個 daemon 有冇行緊。",
            "問嗰部機有冇 Docker，同埋佢個 daemon 有冇行緊。",
            "去問嗰部機有冇 Docker，同埋佢個 daemon 有冇行緊。",
            "問嗰部機兩件事：有冇 Docker，同埋佢個 daemon 有冇行緊。",
            "問嗰部機兩件事，因為佢哋真係兩件事：有冇 Docker，同埋佢個 daemon 有冇行緊。",
        ],
    },
    "remote.preflight.purpose.disk": {
        en: [
            "Measures the free space under the work directory, before a byte is uploaded.",
            "Measures the free space under the work directory, before a byte is uploaded.",
            "Measures the free space under the work directory, before a single byte is uploaded.",
            "Measures the free space under the work directory before a single byte is uploaded.",
            "Measures the free space under the work directory before a single byte is uploaded, which is the only moment the answer is any use.",
        ],
        yue: [
            "喺upload任何一個byte之前，量度work directory下面仲有幾多可用空間。",
            "喺upload任何一個byte之前，量度work directory下面仲有幾多可用空間。",
            "喺upload任何一個byte之前，先量度work directory下面仲有幾多可用空間。",
            "喺upload一個byte之前，就已經量度咗work directory下面仲有幾多可用空間。",
            "喺upload一個byte之前就量度work directory下面仲有幾多可用空間，因為淨係嗰個時候，呢個答案先有用。",
        ],
    },
    "remote.preflight.waiting": {
        en: [
            "Checking...",
            "Checking...",
            "Checking, one moment.",
            "Checking. This is the asking part.",
            "Checking. This is the asking part; nothing has been sent anywhere.",
        ],
        yue: [
            "Check緊...",
            "Check緊...",
            "Check緊，等陣。",
            "Check緊。呢一步淨係問嘢。",
            "Check緊。呢一步淨係問嘢，一啲嘢都未送出去。",
        ],
    },
    /*
     * The third state. A check that never ran is not a check that passed and not one that
     * failed, and "not checked" plus the reason is what stops somebody installing Docker on
     * a server that was simply switched off.
     */
    "remote.preflight.notReached": {
        en: [
            "Not checked: an earlier check stopped this. Fix that one first.",
            "Not checked: an earlier check stopped this. Fix that one first.",
            "Not checked: an earlier check stopped this one before it ran. Fix that one first.",
            "Not checked, because an earlier check stopped this one before it ran. Fix that one first.",
            "Not checked at all, because an earlier check stopped before this one got a turn. Fix that one first.",
        ],
        yue: [
            "未check：之前一個check停低咗，所以行唔到呢個。先搞掂嗰個。",
            "未check：之前一個check停低咗，所以行唔到呢個。先搞掂嗰個。",
            "未check：之前一個check停低咗，呢個根本行唔到。先搞掂嗰個。",
            "未check，因為之前一個check停低咗，呢個仲未輪到。先搞掂嗰個。",
            "根本未check過，因為之前一個check已經停低咗，呢個連出場機會都冇。先搞掂嗰個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The host key: the security-critical copy on this surface          */
    /* ---------------------------------------------------------------- */

    /*
     * A changed host key is refused, and the refusal has no accept path anywhere, on
     * purpose: a rebuilt server and an intercepted connection are indistinguishable from
     * here. Level 5 may be as dry as it likes about it, but "NOT the one recorded", "will
     * not connect", "no way to accept the new key" and the file to edit if you rebuilt the
     * server yourself are in all ten strings. This is the entry a joke must not touch.
     */
    "remote.hostKey.changed": {
        en: [
            "That machine offered a host key that is NOT the one recorded for it. This application will not connect, and it deliberately offers no way to accept the new key: a rebuilt server and an intercepted connection look exactly the same from here. If you rebuilt it yourself, remove the recorded key on purpose, in the file named below, and try again.",
            "That machine offered a host key that is NOT the one recorded for it. This application will not connect, and it deliberately offers no way to accept the new key: a rebuilt server and an intercepted connection look exactly the same from here. If you rebuilt it yourself, remove the recorded key on purpose, in the file named below, and try again.",
            "That machine offered a host key that is NOT the one recorded for it. This application will not connect, and it deliberately offers no way to accept the new key, because a rebuilt server and an intercepted connection look exactly the same from here. If you rebuilt it yourself, remove the recorded key on purpose, in the file named below, and try again.",
            "That machine offered a host key that is NOT the one recorded for it. This application will not connect, and there is deliberately no way to accept the new key anywhere on this screen: a rebuilt server and an intercepted connection look exactly the same from here. If you rebuilt it yourself, remove the recorded key on purpose, in the file named below, and try again.",
            "That machine offered a host key that is NOT the one recorded for it. This application will not connect, and you will not find a button that talks it round: a rebuilt server and an intercepted connection look exactly the same from here, so no way to accept the new key is offered anywhere. If you rebuilt it yourself, remove the recorded key on purpose, in the file named below, and try again.",
        ],
        yue: [
            "嗰部機俾出嘅host key，同記錄低嗰條唔係同一條。本程式唔會連線，亦特登冇提供任何接受新key嘅途徑：喺呢度睇，一部重裝過嘅伺服器同一個俾人截取嘅連線，樣衰一模一樣。如果係你自己重裝，就特登喺下面指名嗰個檔案度刪走記錄低嗰條key，再試過。",
            "嗰部機俾出嘅host key，同記錄低嗰條唔係同一條。本程式唔會連線，亦特登冇提供任何接受新key嘅途徑：喺呢度睇，一部重裝過嘅伺服器同一個俾人截取嘅連線，樣衰一模一樣。如果係你自己重裝，就特登喺下面指名嗰個檔案度刪走記錄低嗰條key，再試過。",
            "嗰部機俾出嘅host key，同記錄低嗰條唔係同一條。本程式唔會連線，亦特登冇提供任何接受新key嘅途徑，因為喺呢度睇，一部重裝過嘅伺服器同一個俾人截取嘅連線係一模一樣。如果係你自己重裝，就特登喺下面指名嗰個檔案度刪走記錄低嗰條key，再試過。",
            "嗰部機俾出嘅host key，同記錄低嗰條唔係同一條。本程式唔會連線，成個畫面都特登冇提供任何接受新key嘅途徑：喺呢度睇，一部重裝過嘅伺服器同一個俾人截取嘅連線係一模一樣。如果係你自己重裝，就特登喺下面指名嗰個檔案度刪走記錄低嗰條key，再試過。",
            "嗰部機俾出嘅host key，同記錄低嗰條唔係同一條。本程式唔會連線，你亦搵唔到粒掣可以講服佢：喺呢度睇，一部重裝過嘅伺服器同一個俾人截取嘅連線係一模一樣，所以由頭到尾冇提供任何接受新key嘅途徑。如果係你自己重裝，就特登喺下面指名嗰個檔案度刪走記錄低嗰條key，再試過。",
        ],
    },
    /*
     * Unreadable is not changed and not unknown: there is nothing to show and nothing to
     * trust, and the two ordinary causes (host down, SSH not on that port) are named so
     * nobody reads this as a trust failure.
     */
    "remote.hostKey.unavailable": {
        en: [
            "That machine's host key could not be read at all, so there is nothing to show you and nothing to trust. The host may be unreachable, or may not be running SSH on that port.",
            "That machine's host key could not be read at all, so there is nothing to show you and nothing to trust. The host may be unreachable, or may not be running SSH on that port.",
            "That machine's host key could not be read at all, so there is nothing to show you and nothing to trust. The host may be unreachable, or it may not be running SSH on that port.",
            "That machine's host key could not be read at all, so there is nothing to show you and nothing to trust. The host may be unreachable, or simply not running SSH on that port.",
            "That machine's host key could not be read at all, so there is nothing to show you and nothing to trust. This is not a hunch: nothing came back. The host may be unreachable, or simply not running SSH on that port.",
        ],
        yue: [
            "完全讀唔到嗰部機嘅host key，所以冇嘢可以俾你睇，亦冇嘢可以信。可能部host連唔到，又或者嗰個port上面根本冇行 SSH。",
            "完全讀唔到嗰部機嘅host key，所以冇嘢可以俾你睇，亦冇嘢可以信。可能部host連唔到，又或者嗰個port上面根本冇行 SSH。",
            "完全讀唔到嗰部機嘅host key，所以冇嘢可以俾你睇，亦冇嘢可以信。可能部host連唔到，又或者佢喺嗰個port上面根本冇行 SSH。",
            "完全讀唔到嗰部機嘅host key，所以冇嘢可以俾你睇，亦冇嘢可以信。要麼部host連唔到，要麼佢喺嗰個port上面根本冇行 SSH。",
            "完全讀唔到嗰部機嘅host key，所以冇嘢可以俾你睇，亦冇嘢可以信。呢句唔係估，係真係咩都冇返嚟。可能部host連唔到，亦可能佢喺嗰個port上面根本冇行 SSH。",
        ],
    },
    /*
     * The one decision on this screen. The command to run on the machine is an identifier
     * and is byte-identical in both languages; "character for character" and "nothing is
     * recorded until you do" are what make accepting safe, so both survive level 5.
     */
    "remote.hostKey.unknown": {
        en: [
            "This application has never seen that machine's host key. Compare a fingerprint below with what the machine itself reports: run 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' on it, and accept only if they match character for character. Nothing has been uploaded and nothing is recorded until you do.",
            "This application has never seen that machine's host key. Compare a fingerprint below with what the machine itself reports: run 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' on it, and accept only if they match character for character. Nothing has been uploaded and nothing is recorded until you do.",
            "This application has never seen that machine's host key, so it is asking rather than deciding. Compare a fingerprint below with what the machine itself reports: run 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' on it, and accept only if they match character for character. Nothing has been uploaded and nothing is recorded until you do.",
            "This application has never seen that machine's host key, so it is asking you rather than deciding for you. Compare a fingerprint below with what the machine itself reports: run 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' on it, and accept only if they match character for character. Nothing has been uploaded and nothing is recorded until you do.",
            "This application has never seen that machine's host key, so it is asking you rather than deciding for you. Compare a fingerprint below with what the machine itself reports: run 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' on it, and accept only if they match character for character. Nearly the same is not the same. Nothing has been uploaded and nothing is recorded until you do.",
        ],
        yue: [
            "本程式從來未見過嗰部機嘅host key。喺下面揀一條fingerprint，同部機自己報嘅對一對：喺嗰部機行 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'，一個字都一樣先好接受。喺你接受之前，一啲嘢都未upload過，亦冇記錄任何嘢。",
            "本程式從來未見過嗰部機嘅host key。喺下面揀一條fingerprint，同部機自己報嘅對一對：喺嗰部機行 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'，一個字都一樣先好接受。喺你接受之前，一啲嘢都未upload過，亦冇記錄任何嘢。",
            "本程式從來未見過嗰部機嘅host key，所以呢度係問你，唔係幫你決定。喺下面揀一條fingerprint，同部機自己報嘅對一對：喺嗰部機行 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'，一個字都一樣先好接受。喺你接受之前，一啲嘢都未upload過，亦冇記錄任何嘢。",
            "本程式從來未見過嗰部機嘅host key，所以呢度係問你，唔係幫你決定。喺下面揀一條fingerprint，同部機自己報嘅對一對：喺嗰部機行 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'，逐個字對，一個字都一樣先好接受。喺你接受之前，一啲嘢都未upload過，亦冇記錄任何嘢。",
            "本程式從來未見過嗰部機嘅host key，所以呢度係問你，唔係幫你決定。喺下面揀一條fingerprint，同部機自己報嘅對一對：喺嗰部機行 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'，逐個字對，一個字都一樣先好接受，「差唔多一樣」即係唔一樣。喺你接受之前，一啲嘢都未upload過，亦冇記錄任何嘢。",
        ],
    },
    "remote.hostKey.cannotAccept": {
        en: [
            "This build cannot record a host key, so there is nothing to press. The desktop application owns the file keys are written to.",
            "This build cannot record a host key, so there is nothing to press. The desktop application owns the file keys are written to.",
            "This build cannot record a host key, so there is nothing here to press. The desktop application owns the file keys are written to.",
            "This build cannot record a host key, so there is deliberately nothing here to press. The desktop application owns the file keys are written to.",
            "This build cannot record a host key, so there is nothing here to press: a button that recorded nothing would be worse than no button. The desktop application owns the file keys are written to.",
        ],
        yue: [
            "呢個build記錄唔到host key，所以冇掣可以㩒。寫key嗰個檔案係桌面程式管嘅。",
            "呢個build記錄唔到host key，所以冇掣可以㩒。寫key嗰個檔案係桌面程式管嘅。",
            "呢個build記錄唔到host key，所以呢度冇掣可以㩒。寫key嗰個檔案係桌面程式管嘅。",
            "呢個build記錄唔到host key，所以呢度特登冇掣可以㩒。寫key嗰個檔案係桌面程式管嘅。",
            "呢個build記錄唔到host key，所以呢度冇掣可以㩒：擺粒㩒完乜都唔會發生嘅掣，仲衰過冇。寫key嗰個檔案係桌面程式管嘅。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The preflight panel                                               */
    /* ---------------------------------------------------------------- */

    "remote.preflight.room": {
        en: [
            "{dir} has {free} free.",
            "{dir} has {free} free.",
            "{dir} has {free} free right now.",
            "{dir} has {free} free right now, measured on that machine.",
            "{dir} has {free} free right now, measured on that machine rather than assumed from last time.",
        ],
        yue: [
            "{dir} 仲有 {free} 可用。",
            "{dir} 仲有 {free} 可用。",
            "{dir} 而家仲有 {free} 可用。",
            "{dir} 而家仲有 {free} 可用，係喺嗰部機度出嚟嘅。",
            "{dir} 而家仲有 {free} 可用，係喺嗰部機度出嚟，唔係照抄上次個數。",
        ],
    },
    "remote.preflight.blurb": {
        en: [
            "Asked in this order, and stopping at the first failure. Nothing is uploaded until all four have passed: a render is gigabytes and hours, and finding out at the end of the upload that the machine has no Docker is an evening wasted.",
            "Asked in this order, and stopping at the first failure. Nothing is uploaded until all four have passed: a render is gigabytes and hours, and finding out at the end of the upload that the machine has no Docker is an evening wasted.",
            "Asked in this order, and stopping at the first failure. Nothing is uploaded until all four have passed. A render is gigabytes and hours, and finding out at the end of the upload that the machine has no Docker is an evening wasted.",
            "Asked in this order, stopping at the first failure. Nothing is uploaded until all four have passed, because a render is gigabytes and hours, and finding out at the end of the upload that the machine has no Docker is an evening wasted.",
            "Asked in this order, and stopping dead at the first failure. Nothing is uploaded until all four have passed, because a render is gigabytes and hours, and finding out at the end of the upload that the machine has no Docker is an entire evening wasted on nothing at all.",
        ],
        yue: [
            "按呢個次序問，遇到第一個唔過就停。四個全部過晒之前唔會upload任何嘢：一次算圖動輒幾GB、幾個鐘，upload完先發現部機冇 Docker，即係嘥咗成晚。",
            "按呢個次序問，遇到第一個唔過就停。四個全部過晒之前唔會upload任何嘢：一次算圖動輒幾GB、幾個鐘，upload完先發現部機冇 Docker，即係嘥咗成晚。",
            "按呢個次序問，遇到第一個唔過就停。四個全部過晒之前唔會upload任何嘢。一次算圖動輒幾GB、幾個鐘，upload完先發現部機冇 Docker，即係嘥咗成晚。",
            "按呢個次序問，遇到第一個唔過就停。四個全部過晒之前唔會upload任何嘢，因為一次算圖動輒幾GB、幾個鐘，upload完先發現部機冇 Docker，即係嘥咗成晚。",
            "按呢個次序問，遇到第一個唔過就即刻停。四個全部過晒之前唔會upload任何嘢，因為一次算圖動輒幾GB、幾個鐘，upload完先發現部機冇 Docker，即係白白嘥咗成晚，一無所得。",
        ],
    },
    "remote.preflight.passed": {
        en: [
            "All four passed. This machine can take the render, and nothing has been uploaded yet.",
            "All four passed. This machine can take the render, and nothing has been uploaded yet.",
            "All four passed, in order. This machine can take the render, and nothing has been uploaded yet.",
            "All four passed, in order, without a fuss. This machine can take the render, and nothing has been uploaded yet.",
            "All four passed, in order, without a fuss. This machine can take the render, and nothing has been uploaded yet, so you have committed to nothing.",
        ],
        yue: [
            "四個check全部過晒。呢部機接得住呢次算圖，而到而家一啲嘢都未upload。",
            "四個check全部過晒。呢部機接得住呢次算圖，而到而家一啲嘢都未upload。",
            "四個check全部過晒，順住次序過。呢部機接得住呢次算圖，而到而家一啲嘢都未upload。",
            "四個check全部過晒，一個都冇甩。呢部機接得住呢次算圖，而到而家一啲嘢都未upload。",
            "四個check全部過晒，一個都冇甩，仲要好順。呢部機接得住呢次算圖，而到而家一啲嘢都未upload，所以你仲未答應咗任何嘢。",
        ],
    },
    "remote.preflight.busy": {
        en: [
            "Checking. Nothing is being uploaded.",
            "Checking. Nothing is being uploaded.",
            "Checking. Nothing is being uploaded while this runs.",
            "Checking. Nothing is being uploaded while this runs, not one byte.",
            "Checking. Nothing is being uploaded while this runs; this part is all questions and no cargo.",
        ],
        yue: [
            "Check緊。冇upload緊任何嘢。",
            "Check緊。冇upload緊任何嘢。",
            "Check緊。而家冇upload緊任何嘢。",
            "Check緊。呢段時間冇upload緊任何嘢，一個byte都冇。",
            "Check緊。呢段時間冇upload緊任何嘢，呢一步淨係問問題，一件貨都冇搬。",
        ],
    },
    /*
     * Two different bridge failures, kept apart because they mean different things: the
     * checks could not be run at all, versus that one machine could not be checked. Both
     * quote the message they were given rather than summarising it.
     */
    "remote.preflight.bridgeFailed": {
        en: [
            "The application could not run the checks: {message}",
            "The application could not run the checks: {message}",
            "The application could not run the checks at all: {message}",
            "The application could not run the checks. What came back was: {message}",
            "The application could not run the checks. What came back, word for word and unimproved, was: {message}",
        ],
        yue: [
            "本程式行唔到啲check：{message}",
            "本程式行唔到啲check：{message}",
            "本程式根本行唔到啲check：{message}",
            "本程式行唔到啲check。收返嚟嘅係：{message}",
            "本程式行唔到啲check。收返嚟嗰句嘢原封不動、一個字都冇改，係：{message}",
        ],
    },
    "remote.targets.bridgeFailed": {
        en: [
            "The application could not check that machine: {message}",
            "The application could not check that machine: {message}",
            "The application could not check that machine at all: {message}",
            "The application could not check that machine. What came back was: {message}",
            "The application could not check that machine. What came back, word for word, was: {message}",
        ],
        yue: [
            "本程式check唔到嗰部機：{message}",
            "本程式check唔到嗰部機：{message}",
            "本程式根本check唔到嗰部機：{message}",
            "本程式check唔到嗰部機。返嚟嘅係：{message}",
            "本程式check唔到嗰部機。返嚟嗰句嘢一字不改，係：{message}",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The list of machines, and the form that adds one                  */
    /* ---------------------------------------------------------------- */

    "remote.targets.empty": {
        en: [
            "No machine has been set up yet. A machine is a host, an account, and either your SSH agent or the path to a key file. This application never asks for a password and has nowhere to keep one.",
            "No machine has been set up yet. A machine is a host, an account, and either your SSH agent or the path to a key file. This application never asks for a password and has nowhere to keep one.",
            "No machine has been set up yet. A machine here is a host, an account, and either your SSH agent or the path to a key file. This application never asks for a password and has nowhere to keep one.",
            "No machine has been set up yet, so this list is honestly empty rather than hiding something. A machine here is a host, an account, and either your SSH agent or the path to a key file. This application never asks for a password and has nowhere to keep one.",
            "No machine has been set up yet, so this list is honestly empty rather than hiding something behind a filter. A machine here is a host, an account, and either your SSH agent or the path to a key file. This application never asks for a password and has nowhere to keep one, which saves everyone a conversation.",
        ],
        yue: [
            "仲未設定過任何機。一部機即係一個host、一個帳戶，再加你嘅 SSH agent 或者一個key file嘅路徑。本程式從來唔會問你攞密碼，亦冇地方擺得低一個。",
            "仲未設定過任何機。一部機即係一個host、一個帳戶，再加你嘅 SSH agent 或者一個key file嘅路徑。本程式從來唔會問你攞密碼，亦冇地方擺得低一個。",
            "仲未設定過任何機。喺呢度，一部機即係一個host、一個帳戶，再加你嘅 SSH agent 或者一個key file嘅路徑。本程式從來唔會問你攞密碼，亦冇地方擺得低一個。",
            "仲未設定過任何機，所以呢張list係真係空，唔係收埋咗嘢。喺呢度，一部機即係一個host、一個帳戶，再加你嘅 SSH agent 或者一個key file嘅路徑。本程式從來唔會問你攞密碼，亦冇地方擺得低一個。",
            "仲未設定過任何機，所以呢張list係真係空，唔係俾個篩選收埋咗。喺呢度，一部機即係一個host、一個帳戶，再加你嘅 SSH agent 或者一個key file嘅路徑。本程式從來唔會問你攞密碼，亦冇地方擺得低一個，省返大家一場對話。",
        ],
    },
    "remote.targets.noMatch": {
        en: [
            "No machine matches that search. Clearing it brings the whole list back.",
            "No machine matches that search. Clearing it brings the whole list back.",
            "No machine matches that search. Nothing was removed; clearing it brings the whole list back.",
            "No machine matches that search. Nothing was removed, only hidden; clearing it brings the whole list back.",
            "No machine matches that search. Nothing was removed, only hidden behind the query; clearing it brings the whole list back, every one of them.",
        ],
        yue: [
            "冇機夾到你搵嗰個。清一清個搜尋，成張list就返晒嚟。",
            "冇機夾到你搵嗰個。清一清個搜尋，成張list就返晒嚟。",
            "冇機夾到你搵嗰個。冇刪過嘢；清一清個搜尋，成張list就返晒嚟。",
            "冇機夾到你搵嗰個。冇刪過嘢，只係收埋咗；清一清個搜尋，成張list就返晒嚟。",
            "冇機夾到你搵嗰個。冇刪過嘢，只係俾你條搜尋收埋咗；清一清個搜尋，成張list就返晒嚟，一部都唔會少。",
        ],
    },
    /*
     * The single most important sentence on this screen. It says the application stores a
     * path and not a key, that nothing here reads or transmits the key file, and that there
     * is no password field anywhere in the feature. All three clauses are pinned, in both
     * languages, at every level.
     */
    "remote.targets.field.identityNote": {
        en: [
            "A path, never the key itself. This application records where the file is; ssh reads it, and nothing here ever opens it, copies it or sends it. There is no password field anywhere in this feature, and the SSH client is told to refuse one even if the host offers it.",
            "A path, never the key itself. This application records where the file is; ssh reads it, and nothing here ever opens it, copies it or sends it. There is no password field anywhere in this feature, and the SSH client is told to refuse one even if the host offers it.",
            "A path, never the key itself. This application records where the file is and no more than that; ssh reads it, and nothing here ever opens it, copies it or sends it. There is no password field anywhere in this feature, and the SSH client is told to refuse one even if the host offers it.",
            "A path, never the key itself. Your private key stays exactly where it is: this application records where the file is and no more than that; ssh reads it, and nothing here ever opens it, copies it or sends it. There is no password field anywhere in this feature, and the SSH client is told to refuse one even if the host offers it.",
            "A path, never the key itself. Your private key stays exactly where it is and never comes anywhere near this window: this application records where the file is and no more than that; ssh reads it, and nothing here ever opens it, copies it or sends it. There is no password field anywhere in this feature, and the SSH client is told to refuse one even if the host offers it.",
        ],
        yue: [
            "呢度要嘅係一個路徑，唔係條key本身。本程式淨係記住個檔案喺邊；由 ssh 去讀佢，呢度永遠唔會開佢、唔會copy佢、唔會send佢。呢個功能任何一處都冇密碼欄，而且就算部host想要密碼，SSH client 都會拒絕。",
            "呢度要嘅係一個路徑，唔係條key本身。本程式淨係記住個檔案喺邊；由 ssh 去讀佢，呢度永遠唔會開佢、唔會copy佢、唔會send佢。呢個功能任何一處都冇密碼欄，而且就算部host想要密碼，SSH client 都會拒絕。",
            "呢度要嘅係一個路徑，唔係條key本身。本程式淨係記住個檔案喺邊，冇多冇少；由 ssh 去讀佢，呢度永遠唔會開佢、唔會copy佢、唔會send佢。呢個功能任何一處都冇密碼欄，而且就算部host想要密碼，SSH client 都會拒絕。",
            "呢度要嘅係一個路徑，唔係條key本身。你條私鑰原封不動咁留喺原位：本程式淨係記住個檔案喺邊，冇多冇少；由 ssh 去讀佢，呢度永遠唔會開佢、唔會copy佢、唔會send佢。呢個功能任何一處都冇密碼欄，而且就算部host想要密碼，SSH client 都會拒絕。",
            "呢度要嘅係一個路徑，唔係條key本身。你條私鑰原封不動咁留喺原位，行都唔會行埋嚟呢個視窗：本程式淨係記住個檔案喺邊，冇多冇少；由 ssh 去讀佢，呢度永遠唔會開佢、唔會copy佢、唔會send佢。呢個功能任何一處都冇密碼欄，而且就算部host想要密碼，SSH client 都會拒絕。",
        ],
    },
    "remote.targets.field.workDirHint": {
        en: [
            "Everything this render sends lives under here, in a folder of its own.",
            "Everything this render sends lives under here, in a folder of its own.",
            "Everything this render sends lives under here, in a folder of its own, and nothing outside it is touched.",
            "Everything this render sends lives under here, in a folder of its own. Nothing outside that folder is touched.",
            "Everything this render sends lives under here, in a folder of its own. Nothing outside that folder is touched, written to, or helpfully tidied up.",
        ],
        yue: [
            "呢次算圖send過去嘅所有嘢，都會住喺呢個路徑下面，有自己一個資料夾。",
            "呢次算圖send過去嘅所有嘢，都會住喺呢個路徑下面，有自己一個資料夾。",
            "呢次算圖send過去嘅所有嘢，都會住喺呢個路徑下面，有自己一個資料夾，外面嘅嘢一律唔會郁。",
            "呢次算圖send過去嘅所有嘢，都會住喺呢個路徑下面，有自己一個資料夾。個資料夾以外嘅嘢，一律唔會郁。",
            "呢次算圖send過去嘅所有嘢，都會住喺呢個路徑下面，有自己一個資料夾。個資料夾以外嘅嘢，唔會郁、唔會寫，亦唔會好心幫你執。",
        ],
    },
    /*
     * A switch that decides whether a complete copy of somebody's world stays on a machine
     * they may not own. Both branches are stated in every level: what off does, what on
     * does, and that removing it afterwards is on them.
     */
    "remote.targets.field.keepHint": {
        en: [
            "Off, the staging folder is removed when the render ends, whether it finished, failed or was stopped. On, a complete copy of your world stays on that machine until you delete it yourself.",
            "Off, the staging folder is removed when the render ends, whether it finished, failed or was stopped. On, a complete copy of your world stays on that machine until you delete it yourself.",
            "Off: the staging folder is removed when the render ends, whether it finished, failed or was stopped. On: a complete copy of your world stays on that machine until you delete it yourself.",
            "Off: the staging folder is removed when the render ends, whether it finished, failed or was stopped. On: a complete copy of your world stays on that machine, indefinitely, until you delete it yourself.",
            "Off: the staging folder is removed when the render ends, whether it finished, failed or was stopped. On: a complete copy of your world stays on that machine, indefinitely, until you delete it yourself. Nobody else is going to.",
        ],
        yue: [
            "熄咗嘅話，算圖一完，staging資料夾就會刪走，無論佢係做完、失敗定係俾人停咗。㩒着嘅話，你個世界嘅完整副本會一直留喺嗰部機，直到你自己刪佢為止。",
            "熄咗嘅話，算圖一完，staging資料夾就會刪走，無論佢係做完、失敗定係俾人停咗。㩒着嘅話，你個世界嘅完整副本會一直留喺嗰部機，直到你自己刪佢為止。",
            "熄咗：算圖一完，staging資料夾就會刪走，無論佢係做完、失敗定係俾人停咗。㩒着：你個世界嘅完整副本會一直留喺嗰部機，直到你自己刪佢為止。",
            "熄咗：算圖一完，staging資料夾就會刪走，無論佢係做完、失敗定係俾人停咗。㩒着：你個世界嘅完整副本會一直留喺嗰部機，冇限期，直到你自己刪佢為止。",
            "熄咗：算圖一完，staging資料夾就會刪走，無論佢係做完、失敗定係俾人停咗。㩒着：你個世界嘅完整副本會一直留喺嗰部機，冇限期，直到你自己刪佢為止，因為冇第二個人會幫你刪。",
        ],
    },
    "remote.targets.accepted": {
        en: [
            "Kept {target}. Nothing has been connected to yet.",
            "Kept {target}. Nothing has been connected to yet.",
            "Kept {target}. That is a saved record. Nothing has been connected to yet.",
            "Kept {target}. That is a saved record and nothing more. Nothing has been connected to yet.",
            "Kept {target}. That is a saved record and nothing more. Nothing has been connected to yet, and nothing has been sent anywhere.",
        ],
        yue: [
            "已經記低咗 {target}。到而家仲未連過任何嘢。",
            "已經記低咗 {target}。到而家仲未連過任何嘢。",
            "已經記低咗 {target}。呢個淨係一筆記錄；到而家仲未連過任何嘢。",
            "已經記低咗 {target}。呢個淨係一筆記錄，冇多冇少：到而家仲未連過任何嘢。",
            "已經記低咗 {target}。呢個淨係一筆記錄，冇多冇少：到而家仲未連過任何嘢，亦冇send過任何嘢出去。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Where this render runs: the card, and the four places             */
    /* ---------------------------------------------------------------- */

    /*
     * Docker is not a speed setting and this paragraph is where the app says so. Somebody
     * who picks a container expecting more processors has picked it for the one thing it
     * cannot do, so "same cores and the same disk" and "renders slower" outrank every joke
     * in the entry.
     */
    "remote.blurb": {
        en: [
            "The same engine, in four different places. Speed is not what separates them: a container on this computer runs on the same cores and the same disk as the engine does without one, and on Windows it reads your world through a virtual machine's file sharing, so a big world usually renders slower that way. What a container buys is isolation and a different Java. What another machine buys is somebody else's processors, at the cost of uploading the world first.",
            "The same engine, in four different places. Speed is not what separates them: a container on this computer runs on the same cores and the same disk as the engine does without one, and on Windows it reads your world through a virtual machine's file sharing, so a big world usually renders slower that way. What a container buys is isolation and a different Java. What another machine buys is somebody else's processors, at the cost of uploading the world first.",
            "The same engine, in four different places, and speed is not what separates them: a container on this computer runs on the same cores and the same disk as the engine does without one, and on Windows it reads your world through a virtual machine's file sharing, so a big world usually renders slower that way. What a container buys is isolation and a different Java. What another machine buys is somebody else's processors, at the cost of uploading the world first.",
            "The same engine, in four different places, and speed is not what separates them. A container on this computer runs on the same cores and the same disk as the engine does without one, and on Windows it reads your world through a virtual machine's file sharing, so a big world usually renders slower that way rather than faster. What a container buys is isolation and a different Java. What another machine buys is somebody else's processors, at the cost of uploading the world first.",
            "The same engine, in four different places, and speed is not what separates them, whatever the word container suggests. A container on this computer runs on the same cores and the same disk as the engine does without one, and on Windows it reads your world through a virtual machine's file sharing, so a big world usually renders slower that way rather than faster. What a container buys is isolation and a different Java. What another machine buys is somebody else's processors, at the cost of uploading the world first.",
        ],
        yue: [
            "同一個引擎，喺四個唔同地方行。分別唔係快慢：喺呢部電腦開container，用嘅係同樣嘅核心同埋同一隻碟，同冇container嗰陣一樣；喺 Windows 上面佢仲要經虛擬機嘅檔案分享去讀你個世界，所以大個世界通常會算得慢啲。container買到嘅係隔離同埋另一個 Java。另一部機買到嘅係人哋嘅處理器，代價係要先upload成個世界。",
            "同一個引擎，喺四個唔同地方行。分別唔係快慢：喺呢部電腦開container，用嘅係同樣嘅核心同埋同一隻碟，同冇container嗰陣一樣；喺 Windows 上面佢仲要經虛擬機嘅檔案分享去讀你個世界，所以大個世界通常會算得慢啲。container買到嘅係隔離同埋另一個 Java。另一部機買到嘅係人哋嘅處理器，代價係要先upload成個世界。",
            "同一個引擎，喺四個唔同地方行，而分別唔係快慢：喺呢部電腦開container，用嘅係同樣嘅核心同埋同一隻碟，同冇container嗰陣一樣；喺 Windows 上面佢仲要經虛擬機嘅檔案分享去讀你個世界，所以大個世界通常會算得慢啲。container買到嘅係隔離同埋另一個 Java。另一部機買到嘅係人哋嘅處理器，代價係要先upload成個世界。",
            "同一個引擎，喺四個唔同地方行，而分別唔係快慢。喺呢部電腦開container，用嘅係同樣嘅核心同埋同一隻碟，同冇container嗰陣一模一樣；喺 Windows 上面佢仲要經虛擬機嘅檔案分享去讀你個世界，所以大個世界通常唔會快啲，反而會算得慢啲。container買到嘅係隔離同埋另一個 Java。另一部機買到嘅係人哋嘅處理器，代價係要先upload成個世界。",
            "同一個引擎，喺四個唔同地方行，而分別唔係快慢，唔好俾「container」呢個字呃到。喺呢部電腦開container，用嘅係同樣嘅核心同埋同一隻碟，同冇container嗰陣一模一樣；喺 Windows 上面佢仲要經虛擬機嘅檔案分享去讀你個世界，所以大個世界通常唔會快啲，反而會算得慢啲。container買到嘅係隔離同埋另一個 Java。另一部機買到嘅係人哋嘅處理器，代價係要先upload成個世界。",
        ],
    },
    /*
     * Said when a chosen place has stopped being usable. Running somewhere other than
     * where somebody chose, silently, is the failure this line exists to prevent, so every
     * level names the substitute and points at the reason rather than restating it.
     */
    "remote.fellBack": {
        en: [
            "That place cannot take a render right now, so this one would run on this computer instead. The reason is beside the choice above.",
            "That place cannot take a render right now, so this one would run on this computer instead. The reason is beside the choice above.",
            "That place cannot take a render right now, so this one would run on this computer instead. The reason is beside the choice above, in its own words.",
            "That place cannot take a render right now, so this one would run on this computer instead rather than fail halfway. The reason is beside the choice above, in its own words.",
            "That place cannot take a render right now, so this one would quietly become a local render on this computer instead of failing halfway through. The reason is beside the choice above, in its own words.",
        ],
        yue: [
            "嗰個地方而家接唔到算圖，所以呢次會改喺呢部電腦度行。原因就喺上面嗰個選項隔籬。",
            "嗰個地方而家接唔到算圖，所以呢次會改喺呢部電腦度行。原因就喺上面嗰個選項隔籬。",
            "嗰個地方而家接唔到算圖，所以呢次會改喺呢部電腦度行。原因就喺上面嗰個選項隔籬，用返佢自己嘅講法。",
            "嗰個地方而家接唔到算圖，所以呢次會改喺呢部電腦度行，好過行到一半冧咗。原因就喺上面嗰個選項隔籬，用返佢自己嘅講法。",
            "嗰個地方而家接唔到算圖，所以呢次會靜靜哋變返喺呢部電腦度行，好過行到一半先冧。原因就喺上面嗰個選項隔籬，用返佢自己嘅講法。",
        ],
    },
    "remote.unsupported": {
        en: [
            "This build cannot hand a render to another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            "This build cannot hand a render to another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            "This build cannot hand a render to another machine at all. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            "This build cannot hand a render to another machine. It is the desktop application that runs ssh, checks the host key and copies the world; a browser tab can do none of those three.",
            "This build cannot hand a render to another machine, and no amount of clicking will change that. It is the desktop application that runs ssh, checks the host key and copies the world; a browser tab can do none of those three.",
        ],
        yue: [
            "呢個build交唔到算圖俾另一部機。行 ssh、check host key、copy個世界，全部都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build交唔到算圖俾另一部機。行 ssh、check host key、copy個世界，全部都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build根本交唔到算圖俾另一部機。行 ssh、check host key、copy個世界，全部都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build交唔到算圖俾另一部機。行 ssh、check host key、copy個世界，呢三樣全部都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build交唔到算圖俾另一部機，㩒幾多下都唔會變。行 ssh、check host key、copy個世界，呢三樣全部都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
        ],
    },
    /*
     * The two consents are never pre-ticked because a world file carries builds and
     * coordinates that belong to whoever built them. That clause is the reason this is a
     * workflow rather than a switch, so it stays in all ten strings.
     */
    "remote.ciBlurb": {
        en: [
            "The answer that suits a machine too slow to render at all: GitHub's runners do the work and this computer only uploads and downloads. It is a workflow rather than a switch, with a repository, two consents that are never pre-ticked because a world carries builds and coordinates, and a run you can watch job by job, so it has a screen of its own.",
            "The answer that suits a machine too slow to render at all: GitHub's runners do the work and this computer only uploads and downloads. It is a workflow rather than a switch, with a repository, two consents that are never pre-ticked because a world carries builds and coordinates, and a run you can watch job by job, so it has a screen of its own.",
            "The answer that suits a machine too slow to render at all: GitHub's runners do the work, and this computer only uploads and downloads. It is a workflow rather than a switch, with a repository, two consents that are never pre-ticked because a world carries builds and coordinates, and a run you can watch job by job, so it has a screen of its own.",
            "The answer for a machine too slow to render at all: GitHub's runners do the work, and this computer only uploads and downloads. It is a workflow rather than a switch, with a repository, two consents that are never pre-ticked because a world carries builds and coordinates, and a run you can watch job by job. That is more than a radio button can hold, so it has a screen of its own.",
            "The answer for a machine too slow to render at all, which is a real and unembarrassing situation: GitHub's runners do the work, and this computer only uploads and downloads. It is a workflow rather than a switch, with a repository, two consents that are never pre-ticked because a world carries builds and coordinates, and a run you can watch job by job. That is more than a radio button can hold, so it has a screen of its own.",
        ],
        yue: [
            "如果部機慢到根本算唔到圖，呢個就係答案：由 GitHub 嘅runner做嘢，呢部電腦淨係負責upload同download。佢係一個流程而唔係一個掣，要有個repository、兩個同意（因為一個世界入面有人哋嘅建築同座標，所以兩個同意都唔會預先剔咗），仲有一個可以逐個job睇住嘅run，所以佢有自己一版。",
            "如果部機慢到根本算唔到圖，呢個就係答案：由 GitHub 嘅runner做嘢，呢部電腦淨係負責upload同download。佢係一個流程而唔係一個掣，要有個repository、兩個同意（因為一個世界入面有人哋嘅建築同座標，所以兩個同意都唔會預先剔咗），仲有一個可以逐個job睇住嘅run，所以佢有自己一版。",
            "如果部機慢到根本算唔到圖，呢個就係答案：由 GitHub 嘅runner做嘢，而呢部電腦淨係負責upload同download。佢係一個流程而唔係一個掣，要有個repository、兩個同意（因為一個世界入面有人哋嘅建築同座標，所以兩個同意都唔會預先剔咗），仲有一個可以逐個job睇住嘅run，所以佢有自己一版。",
            "部機慢到根本算唔到圖嘅話，呢個就係答案：由 GitHub 嘅runner做嘢，而呢部電腦淨係負責upload同download。佢係一個流程而唔係一個掣，要有個repository、兩個同意（因為一個世界入面有人哋嘅建築同座標，所以兩個同意都唔會預先剔咗），仲有一個可以逐個job睇住嘅run。一粒圓掣裝唔落咁多嘢，所以佢有自己一版。",
            "部機慢到根本算唔到圖，其實好平常、冇乜好覺得醜，而呢個就係答案：由 GitHub 嘅runner做嘢，而呢部電腦淨係負責upload同download。佢係一個流程而唔係一個掣，要有個repository、兩個同意（因為一個世界入面有人哋嘅建築同座標，所以兩個同意都唔會預先剔咗），仲有一個可以逐個job睇住嘅run。一粒圓掣裝唔落咁多嘢，所以佢有自己一版。",
        ],
    },
    "remote.ciCeiling": {
        en: [
            "It refuses before packing anything when a world would exceed a release asset's ceiling, rather than discovering it after hours of upload.",
            "It refuses before packing anything when a world would exceed a release asset's ceiling, rather than discovering it after hours of upload.",
            "It refuses before packing anything when a world would exceed a release asset's ceiling, rather than discovering that after hours of upload.",
            "It refuses before packing anything when a world would exceed a release asset's ceiling. Better a no now than the same no after hours of upload.",
            "It refuses before packing anything when a world would exceed a release asset's ceiling. Better a no now, in one second, than the identical no after hours of upload.",
        ],
        yue: [
            "如果個世界會超出一個 release asset 嘅上限，佢會喺打包之前就拒絕，唔會upload咗幾個鐘先發現。",
            "如果個世界會超出一個 release asset 嘅上限，佢會喺打包之前就拒絕，唔會upload咗幾個鐘先發現。",
            "如果個世界會超出一個 release asset 嘅上限，佢會喺打包之前就拒絕，而唔係upload咗幾個鐘先發現。",
            "如果個世界會超出一個 release asset 嘅上限，佢會喺打包之前就拒絕。而家講「唔得」，好過upload咗幾個鐘先講同一句。",
            "如果個世界會超出一個 release asset 嘅上限，佢會喺打包之前就拒絕。一秒鐘就講「唔得」，好過upload咗幾個鐘之後先講返同一句。",
        ],
    },
    "remote.ciUnreachable": {
        en: [
            "This surface has no way to open that screen from here.",
            "This surface has no way to open that screen from here.",
            "This surface has no way to open that screen from here at all.",
            "This surface has no way to open that screen from here, so a button would do nothing.",
            "This surface has no way to open that screen from here, so rather than a button that does nothing, there is this sentence.",
        ],
        yue: [
            "呢個介面喺呢度冇辦法開到嗰一版。",
            "呢個介面喺呢度冇辦法開到嗰一版。",
            "呢個介面喺呢度根本冇辦法開到嗰一版。",
            "呢個介面喺呢度冇辦法開到嗰一版，所以擺粒掣都係㩒完乜都唔會發生。",
            "呢個介面喺呢度冇辦法開到嗰一版；與其擺粒㩒完乜都唔會發生嘅掣，不如擺呢句嘢。",
        ],
    },

    "remote.place.local.summary": {
        en: [
            "The engine runs as an ordinary program, on the Java this application found or installed. Fastest of the three, because nothing sits between it and your disk.",
            "The engine runs as an ordinary program, on the Java this application found or installed. Fastest of the three, because nothing sits between it and your disk.",
            "The engine runs as an ordinary program, on the Java this application found or installed. Fastest of the three, because nothing at all sits between it and your disk.",
            "The engine runs as an ordinary program, on the Java this application found or installed. Fastest of the three, for the dull reason that nothing sits between it and your disk.",
            "The engine runs as an ordinary program, on the Java this application found or installed. Fastest of the three, for the gloriously dull reason that nothing at all sits between it and your disk.",
        ],
        yue: [
            "引擎當一個普通程式咁行，用嘅係本程式搵到或者裝咗嗰個 Java。三個之中最快，因為佢同你隻碟之間乜都冇。",
            "引擎當一個普通程式咁行，用嘅係本程式搵到或者裝咗嗰個 Java。三個之中最快，因為佢同你隻碟之間乜都冇。",
            "引擎當一個普通程式咁行，用嘅係本程式搵到或者裝咗嗰個 Java。三個之中最快，因為佢同你隻碟之間一層嘢都冇。",
            "引擎當一個普通程式咁行，用嘅係本程式搵到或者裝咗嗰個 Java。三個之中最快，理由好悶：佢同你隻碟之間一層嘢都冇。",
            "引擎當一個普通程式咁行，用嘅係本程式搵到或者裝咗嗰個 Java。三個之中最快，理由悶到出汁：佢同你隻碟之間一層嘢都冇，就係咁簡單。",
        ],
    },
    "remote.place.local.unsupported": {
        en: [
            "This build cannot start a render at all. Rendering is what the desktop application does; a browser tab has no engine to run.",
            "This build cannot start a render at all. Rendering is what the desktop application does; a browser tab has no engine to run.",
            "This build cannot start a render at all. Rendering is what the desktop application does; a browser tab simply has no engine to run.",
            "This build cannot start a render at all. Rendering is the desktop application's job; a browser tab has no engine to run in the first place.",
            "This build cannot start a render at all, which is not a setting anyone can change. Rendering is the desktop application's job; a browser tab has no engine to run in the first place.",
        ],
        yue: [
            "呢個build根本開唔到算圖。算圖係桌面程式做嘅嘢；瀏覽器分頁冇引擎行。",
            "呢個build根本開唔到算圖。算圖係桌面程式做嘅嘢；瀏覽器分頁冇引擎行。",
            "呢個build根本開唔到算圖。算圖係桌面程式做嘅嘢；瀏覽器分頁根本冇引擎行。",
            "呢個build根本開唔到算圖。算圖係桌面程式嘅工作；瀏覽器分頁由頭到尾都冇引擎行。",
            "呢個build根本開唔到算圖，而呢樣嘢唔係改個設定就得。算圖係桌面程式嘅工作；瀏覽器分頁由頭到尾都冇引擎行。",
        ],
    },
    /*
     * The trade, in one paragraph, with the cost in the same breath as the benefit. A
     * container is chosen for isolation and a different Java, and it does not get you more
     * processors: dropping that clause would let somebody pick it for speed.
     */
    "remote.place.docker.summary": {
        en: [
            "The same engine, in a container on this computer. It gets you isolation, since the container sees the world folder read-only, the output folder, and nothing else here, and it gets you the Java inside the image rather than the one on your machine. It does not get you more processors: on Windows the container reaches your world through the virtual machine's file sharing, so a large world usually renders slower this way than locally.",
            "The same engine, in a container on this computer. It gets you isolation, since the container sees the world folder read-only, the output folder, and nothing else here, and it gets you the Java inside the image rather than the one on your machine. It does not get you more processors: on Windows the container reaches your world through the virtual machine's file sharing, so a large world usually renders slower this way than locally.",
            "The same engine, in a container on this computer. It gets you isolation, since the container sees the world folder read-only, the output folder, and nothing else here, and it gets you the Java inside the image instead of the one on your machine. It does not get you more processors: on Windows the container reaches your world through the virtual machine's file sharing, so a large world usually renders slower this way than locally.",
            "The same engine, in a container on this computer. What it buys is isolation, since the container sees the world folder read-only, the output folder, and nothing else here, plus the Java inside the image instead of the one on your machine. It does not get you more processors: on Windows the container reaches your world through the virtual machine's file sharing, so a large world usually renders slower this way than locally.",
            "The same engine, in a container on this computer. What it buys is isolation, since the container sees the world folder read-only, the output folder, and nothing else here, plus the Java inside the image instead of the one on your machine. It does not get you more processors, whatever the shipping metaphors imply: on Windows the container reaches your world through the virtual machine's file sharing, so a large world usually renders slower this way than locally.",
        ],
        yue: [
            "同一個引擎，喺呢部電腦嘅container入面行。你買到嘅係隔離，因為個container淨係見到世界資料夾（唯讀）、輸出資料夾，其他一律見唔到；仲有 image 入面嗰個 Java，唔係你部機嗰個。但係唔會多咗處理器：喺 Windows 上面，個container要經虛擬機嘅檔案分享先掂到你個世界，所以大個世界通常喺呢度算得慢過喺本機。",
            "同一個引擎，喺呢部電腦嘅container入面行。你買到嘅係隔離，因為個container淨係見到世界資料夾（唯讀）、輸出資料夾，其他一律見唔到；仲有 image 入面嗰個 Java，唔係你部機嗰個。但係唔會多咗處理器：喺 Windows 上面，個container要經虛擬機嘅檔案分享先掂到你個世界，所以大個世界通常喺呢度算得慢過喺本機。",
            "同一個引擎，喺呢部電腦嘅container入面行。你買到嘅係隔離，因為個container淨係見到世界資料夾（唯讀）、輸出資料夾，其他一律見唔到；亦買到 image 入面嗰個 Java，唔係你部機嗰個。但係唔會多咗處理器：喺 Windows 上面，個container要經虛擬機嘅檔案分享先掂到你個世界，所以大個世界通常喺呢度算得慢過喺本機。",
            "同一個引擎，喺呢部電腦嘅container入面行。買到嘅係隔離，因為個container淨係見到世界資料夾（唯讀）、輸出資料夾，其他一律見唔到；再加 image 入面嗰個 Java，唔係你部機嗰個。唔會多咗處理器：喺 Windows 上面，個container要經虛擬機嘅檔案分享先掂到你個世界，所以大個世界通常喺呢度算得慢過喺本機。",
            "同一個引擎，喺呢部電腦嘅container入面行。買到嘅係隔離，因為個container淨係見到世界資料夾（唯讀）、輸出資料夾，其他一律見唔到；再加 image 入面嗰個 Java，唔係你部機嗰個。唔會多咗處理器，唔好俾啲貨櫃船比喻呃到：喺 Windows 上面，個container要經虛擬機嘅檔案分享先掂到你個世界，所以大個世界通常喺呢度算得慢過喺本機。",
        ],
    },
    /*
     * Not the same as Docker being missing. This build has no channel to a local container,
     * so the choice is withheld rather than silently rendering somewhere else; Docker's own
     * state is still reported, and the remote path does use a container.
     */
    "remote.place.docker.unsupported": {
        en: [
            "This build of the shell does not offer to hand a render to a container on this machine, so choosing it would render locally instead, which is why it is not offered. Docker's state is still reported below, and rendering on a remote host does use a container.",
            "This build of the shell does not offer to hand a render to a container on this machine, so choosing it would render locally instead, which is why it is not offered. Docker's state is still reported below, and rendering on a remote host does use a container.",
            "This build of the shell does not offer to hand a render to a container on this machine, so choosing it would render locally instead, which is exactly why it is not offered. Docker's state is still reported below, and rendering on a remote host does use a container.",
            "This build of the shell has no way to hand a render to a container on this machine, so choosing it would render locally instead, which is exactly why it is not offered. Docker's state is still reported below, and rendering on a remote host does use a container.",
            "This build of the shell has no way to hand a render to a container on this machine, so choosing it would render locally instead while looking as though it had not, which is exactly why it is not offered. Docker's state is still reported below, and rendering on a remote host does use a container.",
        ],
        yue: [
            "呢個build嘅外殼冇提供將算圖交俾本機container嘅做法，所以就算揀咗，結果都係會變咗喺本機行，因此索性唔提供。Docker 嘅狀態下面照報，而喺遠端主機算圖嗰邊，係真係會用container。",
            "呢個build嘅外殼冇提供將算圖交俾本機container嘅做法，所以就算揀咗，結果都係會變咗喺本機行，因此索性唔提供。Docker 嘅狀態下面照報，而喺遠端主機算圖嗰邊，係真係會用container。",
            "呢個build嘅外殼冇提供將算圖交俾本機container嘅做法，所以就算揀咗，結果都係會變咗喺本機行，正正因為咁先唔提供。Docker 嘅狀態下面照報，而喺遠端主機算圖嗰邊，係真係會用container。",
            "呢個build嘅外殼根本冇路將算圖交俾本機container，所以就算揀咗，結果都係會變咗喺本機行，正正因為咁先唔提供。Docker 嘅狀態下面照報，而喺遠端主機算圖嗰邊，係真係會用container。",
            "呢個build嘅外殼根本冇路將算圖交俾本機container，所以就算揀咗，結果都係會變咗喺本機行，仲要扮到似模似樣，正正因為咁先唔提供。Docker 嘅狀態下面照報，而喺遠端主機算圖嗰邊，係真係會用container。",
        ],
    },
    "remote.place.docker.unchecked": {
        en: [
            "Docker has not been checked yet.",
            "Docker has not been checked yet.",
            "Docker has not been checked yet, so nothing is claimed about it.",
            "Docker has not been checked yet, so nothing is being claimed about it either way.",
            "Docker has not been checked yet, so nothing is being claimed about it either way, good or bad.",
        ],
        yue: [
            "仲未check過 Docker。",
            "仲未check過 Docker。",
            "到而家仲未check過 Docker，所以唔會對佢作任何判斷。",
            "到而家仲未check過 Docker，所以好定唔好都唔會亂講。",
            "到而家仲未check過 Docker，所以好定唔好都唔會亂講，一句都唔會。",
        ],
    },
    "remote.place.remote.summary": {
        en: [
            "The world is copied to a Linux machine you name, rendered in a container there, and the finished tiles are copied back. Worth it when that machine is faster than this one, or when you would rather not tie this one up for hours. It costs an upload of the whole world first.",
            "The world is copied to a Linux machine you name, rendered in a container there, and the finished tiles are copied back. Worth it when that machine is faster than this one, or when you would rather not tie this one up for hours. It costs an upload of the whole world first.",
            "The world is copied to a Linux machine you name, rendered in a container there, and the finished tiles are copied back. Worth it when that machine is faster than this one, or when you would rather not tie this one up for hours. It costs an upload of the whole world first, every time.",
            "The world is copied to a Linux machine you name, rendered in a container there, and the finished tiles are copied back. Worth it when that machine is faster than this one, or when you would rather not tie this one up for an evening. It costs an upload of the whole world first, every time.",
            "The world is copied to a Linux machine you name, rendered in a container there, and the finished tiles are copied back. Worth it when that machine is faster than this one, or when you would rather not tie this one up for an evening while it breathes heavily at you. It costs an upload of the whole world first, every time.",
        ],
        yue: [
            "個世界會copy去一部你指定嘅 Linux 機，喺嗰邊嘅container入面算，算好嘅tile再copy返嚟。如果嗰部機快過呢部，又或者你唔想呢部機俾人霸住幾個鐘，就抵做。代價係每次都要先upload成個世界。",
            "個世界會copy去一部你指定嘅 Linux 機，喺嗰邊嘅container入面算，算好嘅tile再copy返嚟。如果嗰部機快過呢部，又或者你唔想呢部機俾人霸住幾個鐘，就抵做。代價係每次都要先upload成個世界。",
            "個世界會copy去一部你指定嘅 Linux 機，喺嗰邊嘅container入面算，算好嘅tile再copy返嚟。如果嗰部機快過呢部，又或者你唔想呢部機俾人霸住幾個鐘，咁就抵做。代價係每次都要先upload成個世界。",
            "個世界會copy去一部你指定嘅 Linux 機，喺嗰邊嘅container入面算，算好嘅tile再copy返嚟。如果嗰部機快過呢部，又或者你唔想呢部機成晚都俾人霸住，咁就抵做。代價係每次都要先upload成個世界。",
            "個世界會copy去一部你指定嘅 Linux 機，喺嗰邊嘅container入面算，算好嘅tile再copy返嚟。如果嗰部機快過呢部，又或者你唔想呢部機成晚喺度嗡嗡聲兼發燒，咁就抵做。代價係每次都要先upload成個世界。",
        ],
    },
    "remote.place.remote.unsupported": {
        en: [
            "This build cannot reach another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            "This build cannot reach another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            "This build cannot reach another machine at all. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            "This build cannot reach another machine. It is the desktop application that runs ssh, checks the host key and copies the world; a browser tab can do none of those three.",
            "This build cannot reach another machine, and it is saying so instead of failing later. It is the desktop application that runs ssh, checks the host key and copies the world; a browser tab can do none of those three.",
        ],
        yue: [
            "呢個build去唔到另一部機。行 ssh、check host key、copy個世界，都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build去唔到另一部機。行 ssh、check host key、copy個世界，都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build根本去唔到另一部機。行 ssh、check host key、copy個世界，都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build去唔到另一部機。行 ssh、check host key、copy個世界，呢三樣都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
            "呢個build去唔到另一部機，而佢而家就講，好過遲啲先冧。行 ssh、check host key、copy個世界，呢三樣都係桌面程式做嘅；瀏覽器分頁一樣都做唔到。",
        ],
    },
    "remote.place.remote.noTarget": {
        en: [
            "No machine has been set up yet. Add one below: a host, a user, and either your SSH agent or the path to a key file.",
            "No machine has been set up yet. Add one below: a host, a user, and either your SSH agent or the path to a key file.",
            "No machine has been set up yet. Add one below: a host, a user, and either your SSH agent or the path to a key file. Nothing else is needed.",
            "No machine has been set up yet, so there is nothing to send a render to. Add one below: a host, a user, and either your SSH agent or the path to a key file. Nothing else is needed.",
            "No machine has been set up yet, so there is nothing to send a render to and this option is waiting rather than broken. Add one below: a host, a user, and either your SSH agent or the path to a key file. Nothing else is needed.",
        ],
        yue: [
            "仲未設定過任何機。喺下面加一部：一個host、一個用戶，再加你嘅 SSH agent 或者一個key file嘅路徑。",
            "仲未設定過任何機。喺下面加一部：一個host、一個用戶，再加你嘅 SSH agent 或者一個key file嘅路徑。",
            "仲未設定過任何機。喺下面加一部：一個host、一個用戶，再加你嘅 SSH agent 或者一個key file嘅路徑。其他嘢都唔使。",
            "仲未設定過任何機，所以冇嘢可以接呢次算圖。喺下面加一部：一個host、一個用戶，再加你嘅 SSH agent 或者一個key file嘅路徑。其他嘢都唔使。",
            "仲未設定過任何機，所以冇嘢可以接呢次算圖；呢個選項係喺度等，唔係壞咗。喺下面加一部：一個host、一個用戶，再加你嘅 SSH agent 或者一個key file嘅路徑。其他嘢都唔使。",
        ],
    },
    "remote.place.remote.noPreflight": {
        en: [
            "That machine has not passed its checks yet. Nothing is uploaded until ssh, the host key, Docker and free disk have all been proved, in that order.",
            "That machine has not passed its checks yet. Nothing is uploaded until ssh, the host key, Docker and free disk have all been proved, in that order.",
            "That machine has not passed its checks yet. Nothing is uploaded until ssh, the host key, Docker and free disk have all been proved, in that order and no other.",
            "That machine has not passed its checks yet, so this option is waiting rather than refusing. Nothing is uploaded until ssh, the host key, Docker and free disk have all been proved, in that order and no other.",
            "That machine has not passed its checks yet, so this option is waiting rather than refusing you. Nothing is uploaded until ssh, the host key, Docker and free disk have all been proved, in that order and no other, because each one is pointless before the one above it.",
        ],
        yue: [
            "嗰部機仲未過到啲check。ssh、host key、Docker、可用空間四樣順住呢個次序全部證實咗之前，唔會upload任何嘢。",
            "嗰部機仲未過到啲check。ssh、host key、Docker、可用空間四樣順住呢個次序全部證實咗之前，唔會upload任何嘢。",
            "嗰部機仲未過到啲check。ssh、host key、Docker、可用空間四樣要順住呢個次序全部證實咗，之前唔會upload任何嘢。",
            "嗰部機仲未過到啲check，所以呢個選項係喺度等，唔係唔俾你揀。ssh、host key、Docker、可用空間四樣要順住呢個次序全部證實咗，之前唔會upload任何嘢。",
            "嗰部機仲未過到啲check，所以呢個選項係喺度等，唔係唔俾你揀。ssh、host key、Docker、可用空間四樣要順住呢個次序全部證實咗，之前唔會upload任何嘢，因為前面嗰個未過，後面嗰個問嚟都冇意思。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* One line naming where the render is about to go                   */
    /* ---------------------------------------------------------------- */

    "remote.choice.local": {
        en: [
            "This render will run on this computer, as an ordinary program.",
            "This render will run on this computer, as an ordinary program.",
            "This render will run on this computer, as an ordinary program and nothing more.",
            "This render will run on this computer, as an ordinary program. No container, no other machine.",
            "This render will run on this computer, as an ordinary program. No container, no other machine, no ceremony.",
        ],
        yue: [
            "呢次算圖會喺呢部電腦度行，當一個普通程式咁行。",
            "呢次算圖會喺呢部電腦度行，當一個普通程式咁行。",
            "呢次算圖會喺呢部電腦度行，當一個普通程式咁行，冇多冇少。",
            "呢次算圖會喺呢部電腦度行，當一個普通程式咁行。冇container，亦唔會去第二部機。",
            "呢次算圖會喺呢部電腦度行，當一個普通程式咁行。冇container，唔去第二部機，亦冇乜排場。",
        ],
    },
    "remote.choice.docker": {
        en: [
            "This render will run in a container on this computer. Same cores, same disk, different Java.",
            "This render will run in a container on this computer. Same cores, same disk, different Java.",
            "This render will run in a container on this computer. Same cores, same disk, different Java, and that is the whole trade.",
            "This render will run in a container on this computer. Same cores, same disk, different Java: isolation, not horsepower.",
            "This render will run in a container on this computer. Same cores, same disk, different Java: what you are buying is isolation, not horsepower.",
        ],
        yue: [
            "呢次算圖會喺呢部電腦嘅container入面行。同樣核心、同一隻碟、唔同嘅 Java。",
            "呢次算圖會喺呢部電腦嘅container入面行。同樣核心、同一隻碟、唔同嘅 Java。",
            "呢次算圖會喺呢部電腦嘅container入面行。同樣核心、同一隻碟、唔同嘅 Java，成單嘢就係咁。",
            "呢次算圖會喺呢部電腦嘅container入面行。同樣核心、同一隻碟、唔同嘅 Java：買嘅係隔離，唔係馬力。",
            "呢次算圖會喺呢部電腦嘅container入面行。同樣核心、同一隻碟、唔同嘅 Java：你買嘅係隔離，唔係馬力，呢兩樣唔好溝亂。",
        ],
    },
    "remote.choice.remoteUnnamed": {
        en: [
            "This render will run on another machine over SSH.",
            "This render will run on another machine over SSH.",
            "This render will run on another machine, over SSH.",
            "This render will run on another machine, over SSH. Which one is the machine selected above.",
            "This render will run on another machine, over SSH, and not on this one. Which machine is the one selected above.",
        ],
        yue: [
            "呢次算圖會經 SSH 喺另一部機度行。",
            "呢次算圖會經 SSH 喺另一部機度行。",
            "呢次算圖會經 SSH，喺另一部機度行。",
            "呢次算圖會經 SSH，喺另一部機度行。邊一部，就係上面揀咗嗰部。",
            "呢次算圖會經 SSH 喺另一部機度行，唔係喺呢部。邊一部，就係上面揀咗嗰部。",
        ],
    },
    "remote.choice.remote": {
        en: [
            "This render will run on {target}, in a container, over SSH. The world is uploaded there first.",
            "This render will run on {target}, in a container, over SSH. The world is uploaded there first.",
            "This render will run on {target}, in a container, over SSH. The world is uploaded there first, in full.",
            "This render will run on {target}, in a container, over SSH. The world is uploaded there first, in full, before anything renders.",
            "This render will run on {target}, in a container, over SSH. The world is uploaded there first, all of it, before a single tile is rendered.",
        ],
        yue: [
            "呢次算圖會經 SSH，喺 {target} 嘅container入面行。個世界會先upload上去。",
            "呢次算圖會經 SSH，喺 {target} 嘅container入面行。個世界會先upload上去。",
            "呢次算圖會經 SSH，喺 {target} 嘅container入面行。成個世界會先upload上去。",
            "呢次算圖會經 SSH，喺 {target} 嘅container入面行。成個世界會先upload上去，之後先開始算。",
            "呢次算圖會經 SSH，喺 {target} 嘅container入面行。成個世界會先upload上去，一格都唔會漏，之後先算第一塊tile。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const REMOTE_FIXED = {
    /* Docker's note: the disclosure that shows Docker's own words, unedited. */
    "remote.docker.nextLabel": { en: "Next:", yue: "下一步：" },
    "remote.docker.hideDetail": { en: "Hide what Docker said", yue: "收埋 Docker 講嘅嘢" },
    "remote.docker.showDetail": { en: "Show what Docker said", yue: "睇 Docker 講嘅嘢" },
    /*
     * The version is what makes "installed, and..." credible, so it is part of the name
     * rather than a footnote. It is a version string and reads identically in both.
     */
    "remote.docker.plainName": { en: "Docker", yue: "Docker" },
    "remote.docker.versionedName": { en: "Docker {version}", yue: "Docker {version}" },

    /* The four checks, in the order they are asked. */
    "remote.preflight.stage.ssh": { en: "Connection and sign-in", yue: "連線同登入" },
    "remote.preflight.stage.hostKey": { en: "Host key", yue: "Host key" },
    "remote.preflight.stage.docker": { en: "Docker on that machine", yue: "嗰部機上面嘅 Docker" },
    "remote.preflight.stage.disk": { en: "Room to work", yue: "有冇位做嘢" },

    /*
     * Four states, not three. "not checked" is a real state and is never drawn as either
     * of the other two, so it gets its own word rather than sharing "failed".
     */
    "remote.preflight.state.passed": { en: "passed", yue: "過咗" },
    "remote.preflight.state.failed": { en: "failed", yue: "唔過" },
    "remote.preflight.state.waiting": { en: "checking", yue: "check緊" },
    "remote.preflight.state.notReached": { en: "not checked", yue: "未check" },

    "remote.preflight.title": { en: "Checks on {target}", yue: "{target} 嘅檢查" },
    "remote.preflight.hideDetail": { en: "Hide the detail", yue: "收埋詳情" },
    "remote.preflight.showDetail": { en: "Show the detail", yue: "睇詳情" },
    "remote.preflight.run": { en: "Check this machine", yue: "check下呢部機" },
    "remote.preflight.again": { en: "Check again", yue: "再check一次" },

    /*
     * The two host key headings. `unknownTitle` heads a decision and `changedTitle` heads a
     * refusal, and they must never read alike: one is asking, the other has already said
     * no. The accept label is only ever rendered beside a fingerprint, which is why it can
     * say "this matches" without naming which key it means.
     */
    "remote.hostKey.unknownTitle": {
        en: "This machine's key has not been seen before",
        yue: "呢部機嘅key未見過",
    },
    "remote.hostKey.changedTitle": {
        en: "That machine's host key has CHANGED",
        yue: "嗰部機嘅host key變咗",
    },
    "remote.hostKey.acceptOne": {
        en: "Accept the host key with fingerprint {fingerprint}",
        yue: "接受fingerprint係 {fingerprint} 嗰條host key",
    },
    "remote.hostKey.accept": { en: "This matches, accept it", yue: "對得上，接受佢" },

    /* The list of machines. */
    "remote.targets.searchSummary": {
        en: "Showing {shown} of {total}",
        yue: "顯示緊 {total} 之中嘅 {shown}",
    },
    "remote.targets.searchLabel": { en: "Search your machines", yue: "搵你嘅機" },
    "remote.targets.searchHint": {
        en: "a name, a host, a user or a path",
        yue: "名、host、用戶或者路徑",
    },
    "remote.targets.agent": { en: "SSH agent", yue: "SSH agent" },
    "remote.targets.keyFile": { en: "Key file", yue: "Key檔案" },
    /* The chip on a machine that has been told to leave the uploaded world behind. */
    "remote.targets.keeps": { en: "Keeps a copy there", yue: "會留低一份副本" },
    "remote.targets.useOne": { en: "Use {name} for this render", yue: "呢次算圖用 {name}" },
    "remote.targets.use": { en: "Use this one", yue: "用呢部" },
    "remote.targets.editOne": { en: "Edit {name}", yue: "改 {name}" },
    "remote.targets.edit": { en: "Edit", yue: "改" },
    "remote.targets.duplicateOne": { en: "Duplicate {name}", yue: "複製 {name}" },
    "remote.targets.duplicate": { en: "Duplicate", yue: "複製" },
    /*
     * The pre-filled name a duplicate opens with. FIXED like `editOne`/`forgetOne` beside
     * it: a person retitles this the moment they look at the form, so there is no sentence
     * here for a funny level to style, only a label they are about to overwrite.
     */
    "remote.targets.copyOfLabel": { en: "Copy of {name}", yue: "{name} 嘅副本" },
    "remote.targets.forgetOne": { en: "Forget {name}", yue: "忘記 {name}" },
    "remote.targets.forget": { en: "Forget", yue: "忘記" },
    "remote.targets.add": { en: "Add a machine", yue: "加一部機" },

    /* The form that adds or edits one. */
    "remote.targets.formTitle": { en: "The machine", yue: "呢部機" },
    "remote.targets.field.label": { en: "Name it (optional)", yue: "改個名（可以唔填）" },
    "remote.targets.field.labelHint": { en: "the build server", yue: "build 伺服器" },
    "remote.targets.field.host": { en: "Host name or address", yue: "Host 名或者位址" },
    "remote.targets.field.user": { en: "Sign in as", yue: "用邊個帳戶登入" },
    "remote.targets.field.port": { en: "Port", yue: "Port" },
    /*
     * FIXED rather than voiced, against the work list's suggestion. Both are the label and
     * the example inside one text field: the label states the empty-field behaviour and a
     * moving label is one somebody re-reads every time, and the example is a literal path
     * that must render byte for byte in either language or it stops being an example.
     */
    "remote.targets.field.identity": {
        en: "Private key file (leave empty to use your SSH agent)",
        yue: "私鑰檔案（留空就用你嘅 SSH agent）",
    },
    "remote.targets.field.identityHint": {
        en: "C:\\Users\\you\\.ssh\\id_ed25519",
        yue: "C:\\Users\\you\\.ssh\\id_ed25519",
    },
    /*
     * The host and user placeholders, byte-identical in both languages for the same reason
     * `identityHint` is: they are example values somebody may copy, and a hostname or an
     * account name that changed with the interface language would be an example of nothing.
     * Both calls sit inside a `:placeholder="…"` attribute expression, which is why the
     * generated work list never carried them.
     */
    "remote.targets.field.hostHint": { en: "build-server.lan", yue: "build-server.lan" },
    "remote.targets.field.userHint": { en: "renderer", yue: "renderer" },
    "remote.targets.field.workDir": {
        en: "Work directory on that machine",
        yue: "嗰部機上面嘅work directory",
    },
    "remote.targets.field.image": {
        en: "Container image (optional)",
        yue: "Container image（可以唔填）",
    },
    "remote.targets.field.imageHint": { en: "the stock JRE image", yue: "預設嗰個 JRE image" },
    /*
     * The checkbox label. FIXED because it labels a control; the consequence of ticking it,
     * which is the part that matters, is the voiced `remote.targets.field.keepHint` below
     * it and says what off and on each leave on that machine.
     */
    "remote.targets.field.keep": {
        en: "Leave the uploaded world on that machine afterwards",
        yue: "算完之後，將upload咗嘅世界留喺嗰部機",
    },
    "remote.targets.save": {
        en: "Check this machine and keep it",
        yue: "check下呢部機，然後記低佢",
    },
    "remote.targets.cancel": { en: "Cancel", yue: "取消" },

    /* What a render would send, listed before it sends anything. */
    "remote.disclosure.title": {
        en: "What a render on {target} sends",
        yue: "喺 {target} 度算圖會send啲咩",
    },
    "remote.disclosure.sends": { en: "Sent", yue: "會send" },
    "remote.disclosure.neverSends": { en: "Never sent", yue: "永遠唔會send" },
    "remote.disclosure.leftBehind": { en: "Left behind:", yue: "會留低：" },
    "remote.disclosure.auth": { en: "Signing in with:", yue: "用咩登入：" },

    /* The run location card and its sections. */
    "remote.title": { en: "Where this render runs", yue: "呢次算圖喺邊度行" },
    "remote.choose": { en: "Run this render", yue: "行呢次算圖嘅地方" },
    "remote.dockerSection": { en: "Docker on this computer", yue: "呢部電腦上面嘅 Docker" },
    "remote.dockerRecheck": { en: "Check again", yue: "再check一次" },
    "remote.machines": { en: "Machines you can render on", yue: "可以攞嚟算圖嘅機" },
    "remote.ciSection": { en: "On GitHub's runners", yue: "喺 GitHub 嘅runner上面" },
    "remote.openCi": { en: "Open the GitHub runners screen", yue: "開 GitHub runner 嗰一版" },

    /* The three places, as the radio labels themselves. */
    "remote.place.local.title": { en: "On this computer", yue: "喺呢部電腦" },
    "remote.place.docker.title": {
        en: "In a container on this computer",
        yue: "喺呢部電腦嘅container入面",
    },
    "remote.place.remote.title": { en: "On another machine, over SSH", yue: "經 SSH 喺另一部機" },
} as const satisfies Record<string, FixedString>;

export const REMOTE_FACTS = {
    // "installed" versus "not installed" is the pair with opposite fixes, so both halves
    // of each Docker headline are pinned rather than the state word alone.
    "remote.docker.available.headline": {
        en: ["{name}", "is installed", "daemon is running"],
        yue: ["{name}", "已安裝", "daemon 行緊"],
    },
    "remote.docker.available.headlineServer": {
        en: ["{name}", "{server}", "is installed", "is running"],
        yue: ["{name}", "{server}", "已安裝", "行緊"],
    },
    "remote.docker.available.explanation": {
        en: ["Java inside the image", "world folder", "output folder", "nothing else here"],
        yue: ["image 入面嗰個 Java", "世界資料夾", "輸出資料夾", "見唔到"],
    },
    "remote.docker.available.next": {
        en: ["Nothing to do", "isolation", "local is faster"],
        yue: ["冇嘢要做", "隔離", "本機行會快啲"],
    },
    "remote.docker.daemonDown.headline": {
        en: ["{name}", "is installed", "is not running", "daemon"],
        yue: ["{name}", "已安裝", "daemon", "冇行緊"],
    },
    "remote.docker.daemonDown.explanation": {
        en: ["'docker' command", "did not answer", "Nothing is missing", "switched off"],
        yue: ["'docker' 指令", "冇應", "唔使download", "熄咗"],
    },
    "remote.docker.daemonDown.next": {
        en: ["Docker Desktop", "docker service", "check again"],
        yue: ["Docker Desktop", "docker service", "再check一次"],
    },
    "remote.docker.missing.headline": {
        en: ["Docker is not installed", "this computer"],
        yue: ["冇裝 Docker", "呢部電腦"],
    },
    "remote.docker.missing.explanation": {
        en: ["'docker' command", "PATH", "not a fault", "ordinary program"],
        yue: ["'docker' 指令", "PATH", "唔係故障", "普通程式"],
    },
    "remote.docker.missing.next": {
        en: ["Docker Desktop", "isolation", "render locally"],
        yue: ["Docker Desktop", "隔離", "本機算"],
    },
    // Refused is not unreachable: the daemon answered and said no, and the fix is a group.
    "remote.docker.refused.headline": {
        en: ["{name}", "is installed", "this account", "daemon"],
        yue: ["{name}", "已安裝", "呢個帳戶", "daemon"],
    },
    "remote.docker.refused.explanation": {
        en: ["refused this account", "daemon's socket", "not a problem with Docker"],
        yue: ["拒絕咗呢個帳戶", "daemon socket", "唔係 Docker"],
    },
    "remote.docker.refused.next": {
        en: ["group that may use Docker", "'docker'", "sign out"],
        yue: ["可以用 Docker 嘅群組", "'docker'", "登出"],
    },
    "remote.docker.unusable.headline": {
        en: ["{name}", "does not recognise"],
        yue: ["{name}", "認唔到"],
    },
    "remote.docker.unusable.explanation": {
        en: ["neither a working daemon", "Docker's own words are below", "search for"],
        yue: ["行緊嘅 daemon", "Docker 自己講嘅嘢", "去搵"],
    },
    "remote.docker.unusable.next": {
        en: ["'docker version'", "terminal", "Rendering locally is unaffected"],
        yue: ["'docker version'", "terminal", "喺本機算圖唔受影響"],
    },
    // The limit belongs to the build, not to the machine. Every level says so.
    "remote.docker.unprobed.headline": {
        en: ["This build", "Docker is here"],
        yue: ["呢個build", "Docker 喺唔喺度"],
    },
    "remote.docker.unprobed.explanation": {
        en: [
            "Nothing has been asked of Docker",
            "limit of the build",
            "not a statement about your machine",
        ],
        yue: ["冇問過 Docker", "build嘅限制", "唔係講你部機"],
    },
    "remote.docker.unprobed.next": {
        en: ["desktop application", "Docker's real state", "Rendering locally works either way"],
        yue: ["桌面程式", "Docker 嘅真實狀態", "喺本機算圖都照行"],
    },

    // The password promise is a security fact and belongs in the purpose line too.
    "remote.preflight.purpose.ssh": {
        en: ["agent", "key file", "No password is offered"],
        yue: ["agent", "key file", "唔會問你攞密碼"],
    },
    "remote.preflight.purpose.hostKey": {
        en: ["machine answering", "answered last time"],
        yue: ["應機嗰部機", "上次應機"],
    },
    "remote.preflight.purpose.docker": {
        en: ["has Docker", "daemon is running"],
        yue: ["有冇 Docker", "daemon 有冇行緊"],
    },
    "remote.preflight.purpose.disk": {
        en: ["free space", "work directory", "byte is uploaded"],
        yue: ["work directory", "可用空間", "byte"],
    },
    "remote.preflight.waiting": { en: ["Checking"], yue: ["Check緊"] },
    "remote.preflight.notReached": {
        en: ["Not checked", "earlier check", "Fix that one first"],
        yue: ["未check", "之前一個check", "先搞掂嗰個"],
    },

    // The security-critical entries. A changed key is refused with no accept path, an
    // unreadable key is a reachability problem, and an unknown key is a decision that
    // records nothing until it is made. None of the three may read like the others.
    "remote.hostKey.changed": {
        en: [
            "NOT the one recorded",
            "will not connect",
            "no way to accept the new key",
            "look exactly the same",
            "the file named below",
        ],
        yue: [
            "唔係同一條",
            "唔會連線",
            "冇提供任何接受新key嘅途徑",
            "一模一樣",
            "下面指名嗰個檔案",
        ],
    },
    "remote.hostKey.unavailable": {
        en: ["host key could not be read", "nothing to trust", "SSH on that port"],
        yue: ["讀唔到嗰部機嘅host key", "冇嘢可以信", "冇行 SSH"],
    },
    "remote.hostKey.unknown": {
        en: [
            "never seen",
            "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub",
            "character for character",
            "Nothing has been uploaded",
        ],
        yue: [
            "未見過",
            "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub",
            "一個字都一樣",
            "未upload過",
        ],
    },
    "remote.hostKey.cannotAccept": {
        en: ["cannot record a host key", "desktop application"],
        yue: ["記錄唔到host key", "桌面程式"],
    },

    "remote.preflight.room": { en: ["{dir}", "{free}"], yue: ["{dir}", "{free}"] },
    "remote.preflight.blurb": {
        en: [
            "in this order",
            "first failure",
            "Nothing is uploaded until all four have passed",
            "no Docker",
        ],
        yue: ["按呢個次序", "第一個唔過就", "四個全部過晒之前唔會upload任何嘢", "冇 Docker"],
    },
    // Passing the checks is not the same as having sent anything, and this is the last
    // moment before an upload, so both halves are pinned.
    "remote.preflight.passed": {
        en: ["All four passed", "nothing has been uploaded yet"],
        yue: ["四個check全部過晒", "一啲嘢都未upload"],
    },
    "remote.preflight.busy": {
        en: ["Checking", "Nothing is being uploaded"],
        yue: ["Check緊", "冇upload緊任何嘢"],
    },
    "remote.preflight.bridgeFailed": {
        en: ["{message}", "could not run the checks"],
        yue: ["{message}", "行唔到啲check"],
    },
    "remote.targets.bridgeFailed": {
        en: ["{message}", "could not check that machine"],
        yue: ["{message}", "check唔到嗰部機"],
    },

    "remote.targets.empty": {
        en: [
            "No machine has been set up yet",
            "SSH agent",
            "path to a key file",
            "never asks for a password",
        ],
        yue: ["仲未設定過任何機", "SSH agent", "key file嘅路徑", "唔會問你攞密碼"],
    },
    "remote.targets.noMatch": {
        en: ["No machine matches", "brings the whole list back"],
        yue: ["冇機夾到", "成張list就返晒嚟"],
    },
    // The key file is a path and nothing else, and there is no password field anywhere in
    // this feature. Both clauses are what somebody decides on, so both are pinned.
    "remote.targets.field.identityNote": {
        en: [
            "A path, never the key itself",
            "ever opens it, copies it or sends it",
            "no password field",
        ],
        yue: ["唔係條key本身", "唔會開佢、唔會copy佢、唔會send佢", "冇密碼欄"],
    },
    "remote.targets.field.workDirHint": {
        en: ["Everything this render sends", "a folder of its own"],
        yue: ["send過去嘅所有嘢", "自己一個資料夾"],
    },
    // Both branches of the switch, because the difference between them is a complete copy
    // of somebody's world left on a machine they may not own.
    "remote.targets.field.keepHint": {
        en: [
            "the staging folder is removed when the render ends",
            "a complete copy of your world stays on that machine",
            "until you delete it yourself",
        ],
        yue: ["staging資料夾就會刪走", "完整副本會一直留喺嗰部機", "自己刪佢"],
    },
    "remote.targets.accepted": {
        en: ["{target}", "Kept", "Nothing has been connected to yet"],
        yue: ["{target}", "記低咗", "仲未連過任何嘢"],
    },

    // Docker is not a speed setting; without these two the paragraph sells the wrong thing.
    "remote.blurb": {
        en: [
            "same cores and the same disk",
            "renders slower",
            "isolation",
            "uploading the world first",
        ],
        yue: ["同樣嘅核心同埋同一隻碟", "算得慢", "隔離", "先upload成個世界"],
    },
    "remote.fellBack": {
        en: [
            "cannot take a render right now",
            "on this computer instead",
            "beside the choice above",
        ],
        yue: ["接唔到算圖", "喺呢部電腦度行", "上面嗰個選項隔籬"],
    },
    "remote.unsupported": {
        en: ["cannot hand a render to another machine", "ssh", "host key", "browser tab"],
        yue: ["交唔到算圖俾另一部機", "ssh", "host key", "瀏覽器分頁"],
    },
    "remote.ciBlurb": {
        en: ["GitHub's runners", "two consents that are never pre-ticked", "a screen of its own"],
        yue: ["GitHub 嘅runner", "兩個同意都唔會預先剔咗", "自己一版"],
    },
    "remote.ciCeiling": {
        en: ["release asset's ceiling", "before packing anything", "hours of upload"],
        yue: ["release asset 嘅上限", "打包之前", "幾個鐘"],
    },
    "remote.ciUnreachable": {
        en: ["no way to open that screen from here"],
        yue: ["冇辦法開到嗰一版"],
    },

    "remote.place.local.summary": {
        en: [
            "ordinary program",
            "Java this application found or installed",
            "Fastest of the three",
            "your disk",
        ],
        yue: ["普通程式", "本程式搵到或者裝咗嗰個 Java", "三個之中最快", "你隻碟"],
    },
    "remote.place.local.unsupported": {
        en: ["cannot start a render at all", "desktop application", "browser tab"],
        yue: ["開唔到算圖", "桌面程式", "瀏覽器分頁"],
    },
    "remote.place.docker.summary": {
        en: [
            "read-only",
            "world folder",
            "output folder",
            "does not get you more processors",
            "renders slower",
        ],
        yue: ["唯讀", "世界資料夾", "輸出資料夾", "唔會多咗處理器", "算得慢"],
    },
    "remote.place.docker.unsupported": {
        en: [
            "render locally instead",
            "Docker's state is still reported below",
            "remote host does use a container",
        ],
        yue: ["變咗喺本機行", "Docker 嘅狀態下面照報", "遠端主機算圖嗰邊，係真係會用container"],
    },
    "remote.place.docker.unchecked": {
        en: ["Docker has not been checked yet"],
        yue: ["未check過 Docker"],
    },
    "remote.place.remote.summary": {
        en: ["copied to a Linux machine you name", "copied back", "upload of the whole world"],
        yue: ["copy去一部你指定嘅 Linux 機", "copy返嚟", "upload成個世界"],
    },
    "remote.place.remote.unsupported": {
        en: ["cannot reach another machine", "ssh", "host key", "browser tab"],
        yue: ["去唔到另一部機", "ssh", "host key", "瀏覽器分頁"],
    },
    "remote.place.remote.noTarget": {
        en: ["No machine has been set up yet", "SSH agent", "path to a key file"],
        yue: ["仲未設定過任何機", "SSH agent", "key file嘅路徑"],
    },
    "remote.place.remote.noPreflight": {
        en: ["has not passed its checks yet", "Nothing is uploaded until", "in that order"],
        yue: ["仲未過到啲check", "唔會upload任何嘢", "順住呢個次序"],
    },

    "remote.choice.local": {
        en: ["run on this computer", "ordinary program"],
        yue: ["喺呢部電腦度行", "普通程式"],
    },
    "remote.choice.docker": {
        en: ["in a container on this computer", "Same cores, same disk, different Java"],
        yue: ["container入面行", "同樣核心、同一隻碟、唔同嘅 Java"],
    },
    "remote.choice.remoteUnnamed": { en: ["another machine", "SSH"], yue: ["另一部機", "SSH"] },
    "remote.choice.remote": {
        en: ["{target}", "in a container", "SSH", "uploaded there first"],
        yue: ["{target}", "container", "SSH", "先upload上去"],
    },
} as const satisfies Record<
    keyof typeof REMOTE_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
