import type { Article } from "../types.js";
import { LARGE_WORLDS_DOC_URL, ROADMAP_URL, repoFile } from "../links.js";

export const releaseDownloads: Article = {
    id: "release-downloads",
    title: "Downloading a world from a release",
    summary:
        "A panel inside the map wizard that fetches a world or a rendered map out of a GitHub release, rejoins it from its published parts, verifies every one of them, and unpacks it, with real byte counts rather than a spinner.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The downloader, the zip reader, the release reader and the surface are built and covered by 62 tests in the main process and 35 in the interface, all running in CI, including one that drives the whole path end to end against a real split archive. No release has been fetched from github.com through this surface, and there is no capture of it.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Somebody who wants to try this application needs a Minecraft world, and the most likely ",
                        "answer to where one comes from is a release of this project. So the map wizard's first ",
                        "step, which is where the question is actually asked, carries a disclosure reading ",
                        { em: "No world on this machine? Download one from a release" },
                        ", and it opens the downloads panel in place. The panel hands back a folder that has ",
                        "been downloaded, verified and unpacked, and the wizard takes it as the world to render.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A release asset is capped at two gigabytes and a rendered world is tens of them, so ",
                        "anything over the cap is published as 1.7 GB parts with a SHA-256 for every part ",
                        "beside them. None of that is the reader's problem here: the panel presents a split ",
                        "asset as the single file it really is, with a chip saying how many parts it arrives ",
                        "in, and the main process does the rest.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Nothing is fetched until somebody asks." },
                            " Opening the panel reconciles with what is already on disk and already in flight, ",
                            "which costs nothing and touches no network. Reading a release is a network request ",
                            "and waits for the button, because a surface that quietly called GitHub every time ",
                            "a wizard step was opened would be spending somebody's rate limit on a question ",
                            "they never asked.",
                        ],
                        [
                            { strong: "Every download makes a row, whoever started it." },
                            " Progress is broadcast to every window, so a download started elsewhere, or ",
                            "before this panel was opened, appears here too. Nothing is filtered to mine: a ",
                            "download that is invisible is a download somebody starts a second copy of.",
                        ],
                        [
                            { strong: "The numbers are real numbers." },
                            " Bytes transferred, parts done, the part being worked on right now, and an ",
                            "estimate. The overall percentage is a weighted estimate across the transfer, the ",
                            "rejoin and the unpack, and says that it is an estimate; the per-phase byte counts ",
                            "beside it are exact.",
                        ],
                        [
                            { strong: "Cancelled is not failed." },
                            " Stopping keeps every byte already transferred, because each part is checksummed ",
                            "on its own and the next attempt continues from where this one stopped. The row ",
                            "says exactly that and offers the resume it makes possible, rather than an error ",
                            "about something that did not go wrong.",
                        ],
                        [
                            { strong: "An interrupted download is its own state." },
                            " A record that says running, for a download the main process is not running, means ",
                            "the application stopped or the machine did before an ending could be written. That ",
                            "is neither finished nor failed and is not shown as either.",
                        ],
                        [
                            { strong: "The record on disk never overwrites what the events said." },
                            " Reconciliation merges rather than replaces, because the events are live and the ",
                            "record is a snapshot.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "There is no browser fallback, and pretending otherwise would not help",
                    content: [
                        "A build with no Electron bridge says so and stops. A browser tab has nowhere to write ",
                        "a twenty gigabyte world, no way to resume a ranged request into a file, and no zip ",
                        "reader that streams, so a Download button there could only fail on press.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Which release",
                            description:
                                "Owner, repository and tag, all editable. This project's own releases are the default because they are what carry the worlds and the maps, and a blank tag means whatever the latest release is. A fork, a mirror or somebody's private repository of their own worlds is exactly the case a hard-coded repository would refuse to serve.",
                        },
                        {
                            term: "Where it lands",
                            description:
                                "One folder per download under the application's storage directory, holding the parts exactly as published, the rejoined archive, the unpacked content, and a record of what was fetched, from where, and how it ended. The parts are kept after a success, so unpacking again never means downloading again.",
                        },
                        {
                            term: "Concurrency",
                            description:
                                "Four parts at a time by default, each with an HTTP Range request that continues from whatever is already on disk.",
                        },
                        {
                            term: "Tokens",
                            description:
                                "A public release needs none and is never asked for one. GH_TOKEN is used when the environment has it, which is what makes a private release and a rate-limited runner work. The signed-in GitHub account is not wired into this path yet.",
                        },
                        {
                            term: "Extraction",
                            description:
                                "On by default for a zip. The archive as a whole is proved against its published SHA-256 before anything is unpacked, and every entry's CRC-32 is checked as it is read, which are two independent checks of two different things.",
                        },
                        {
                            term: "The log a row keeps",
                            description:
                                "The last hundred lines. A download is not a terminal, and a panel that grew without bound during a twenty-minute transfer would be a memory leak with a scrollbar.",
                        },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Every failure is sorted into one of ten kinds and each kind gets its own answer, ",
                        "because the useful sentence for a release that does not exist has nothing in common ",
                        "with the useful sentence for a part whose checksum did not match. Where a setting ",
                        "would fix it, the row offers a button that opens that settings row rather than naming ",
                        "it in prose.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "The release or the asset is not there",
                            description:
                                "Kept apart, because they send somebody to two different places: nothing is published under that tag, against that tag exists but carries no such file. A private release with no token reads as the first of those, and the explanation says so.",
                        },
                        {
                            term: "A part arrives corrupt",
                            description:
                                "Reported with the digest that was expected and the one that arrived, and that part alone is re-fetched. A part that failed its own digest is deleted rather than kept, because it is the one file that must never be resumed from.",
                        },
                        {
                            term: "The download fails partway",
                            description:
                                "The rejoined archive and the unpacked content are deleted, because those are the two things that look complete to whatever comes next. The parts are kept, since each is individually checksummed and therefore safe to resume from. This project has already been bitten by a directory that existed, held nothing, and kept exiting zero.",
                        },
                        {
                            term: "The archive is not one this reader can open",
                            description:
                                "An entry compressed by anything other than store or deflate, and an encrypted entry, are refused by name rather than written out as garbage.",
                        },
                        {
                            term: "An archive entry tries to escape",
                            description:
                                "Absolute names, drive letters, backslash climbs, embedded NULs and symbolic links are all refused, and an archive holding one hostile entry is refused before any of its innocent entries are written.",
                        },
                        {
                            term: "The disk fills",
                            description:
                                "Its own kind, with its own explanation, because no amount of retrying is going to help and the storage directory is a setting.",
                        },
                        {
                            term: "The bridge is missing a method",
                            description:
                                "Probed one at a time. A missing cancel in particular is survivable and must not be hidden: a download that cannot be stopped is worth knowing about before one is started rather than after.",
                        },
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Nothing downstream of verification runs on unverified bytes. A corrupt world unzips perfectly well and then surfaces as a rendering bug three layers away, in a file nobody would think to look in.",
                        "Every operation streams. The files this exists for do not fit in memory, where reading the whole thing at once is not slow, it is a crash.",
                        "Archive entry names are resolved against the destination and compared after normalisation, so no entry can be written outside the folder it was extracted into.",
                        "Part names in a manifest cannot escape their directory either, and the manifest is validated before it is used to fetch anything.",
                        "The zip reader is written against Node's own inflate with no native dependency, because the packaging contract forbids a native module reaching the packaged application. The obvious libraries break it.",
                        "A token is never required for a public release, and where one is present the Authorization header is dropped on the cross-origin redirect to storage, so it never reaches the content delivery network.",
                        "The renderer never opens a socket or a file for any of this. It asks the main process to start a download and is told what happened.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "97 tests cover this: 62 in the main process across the release reader, ranged resume, ",
                        "the zip reader, extraction and the downloader itself, and 35 in the interface across ",
                        "the rows, the failure classification and the panel. All of them run in CI on every ",
                        "push. The splitter, the joiner and the manifest format have their own suite in the ",
                        "parts package, described in ",
                        { link: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "One test drives the whole download path end to end against a real split archive, including the rejoin and the unpack, rather than asserting on the steps in isolation.",
                        "The three answers a ranged request can get are each tested, which is what makes resume a claim rather than an intention.",
                        "The zip reader is tested for store, deflate, Zip64, a failing CRC and a truncated archive, because a reader that takes the classic size fields at face value reports a perfectly good twenty gigabyte world as corrupt.",
                        "Every path-escape shape is tested against extraction, and the refusal is asserted to happen before anything is written.",
                        "The interface tests cover a download that was already running when the panel mounted, a finished download read back from an earlier session, and the rule that events win over the record.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Not yet proved against a real release",
                    content: [
                        "Nothing here has fetched an asset from github.com through this surface, so the parts ",
                        "of it that depend on GitHub's own behaviour, the redirect to storage and the rate ",
                        "limits in particular, are proved against a stand-in rather than the service. The ",
                        "parts package was separately exercised at an inconvenient size by hand, which is ",
                        "recorded in ",
                        { link: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL, external: true },
                        ". See the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "release-pipeline",
            reason: "Where a split asset comes from, and the release that publishes one.",
        },
        {
            articleId: "github-sign-in",
            reason: "The account a private release would need, and why it does not reach this path yet.",
        },
        {
            articleId: "test-world-generator",
            reason: "The other way to get a world when you have no Minecraft installation to hand.",
        },
        {
            articleId: "java-render-path",
            reason: "What happens to the world once it has been unpacked.",
        },
    ],

    sources: [
        {
            label: "packages/app/src/main/download",
            href: repoFile("design/packages/app/src/main/download"),
        },
        {
            label: "packages/ui/src/components/downloads",
            href: repoFile("design/packages/ui/src/components/downloads"),
        },
        { label: "packages/parts", href: repoFile("design/packages/parts") },
        { label: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL },
    ],
};
