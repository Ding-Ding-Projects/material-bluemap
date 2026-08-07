import type { Article } from "../types.js";
import {
    LARGE_WORLDS_DOC_URL,
    PRIVATE_WORLD_DOC_URL,
    RENDER_IN_ACTIONS_DOC_URL,
    RENDER_PRIVATE_WORKFLOW_URL,
    RENDER_SHARD_WAVE_WORKFLOW_URL,
    RENDER_WORLD_WORKFLOW_URL,
    RESUMABLE_RENDERS_DOC_URL,
    repoFile,
} from "../links.js";

export const renderInActions: Article = {
    id: "render-in-actions",
    title: "Rendering a world in GitHub Actions",
    summary:
        "Turn a Minecraft world into a BlueMap map on GitHub's runners with nothing installed locally, splitting a world too large for one job across a matrix and putting the pieces back together without a seam.",
    category: "delivery",
    status: "shipped",
    statusNote:
        "The measurement, the planner, the shard config writer, the merger and the verifier are built, and their 79 tests run in CI on every push. The split and the merge were checked against an unsharded render and came back byte-identical. This article does not claim a green end-to-end run of the workflow itself, because that is not something it can show you.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Rendering a Minecraft world normally means installing a Java runtime, installing ",
                        "BlueMap, and giving a machine several hours of its life. This does none of that. ",
                        "Open Actions, run ",
                        { strong: "Render world" },
                        ", and the map comes back as an artifact: the complete BlueMap webapp with the map ",
                        "inside it.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A world that one job can finish is rendered by one job. A world that one job cannot ",
                        "finish is split across a matrix of jobs and merged afterwards, and most of the care ",
                        "in this feature is in that merge, because two of the three ways it can go wrong ",
                        "produce a map that looks correct and is quietly not.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "The world is validated before anything renders." },
                            " There has to be a ",
                            { code: "level.dat" },
                            " and a region directory holding ",
                            { code: ".mca" },
                            " files for the dimension asked for. An archive with a wrapper folder inside it is ",
                            "handled, because the check looks up to three directories down, and a directory ",
                            "that is not a world fails naming what it found instead of rendering an empty map.",
                        ],
                        [
                            { strong: "The world is measured, not estimated from its size on disk." },
                            " Every region file's anvil location table is read to count how many of its 1024 ",
                            "chunk slots are actually occupied, so a region holding forty chunks is planned as ",
                            "forty chunks rather than as a full one.",
                        ],
                        [
                            { strong: "The render time is estimated, with its assumptions printed." },
                            " The reference is a real measurement: 3969 chunks rendered to 961 hires tiles in ",
                            "80 seconds. A runner is assumed half as fast per core, terrain complexity is ",
                            "approximated from bytes per chunk, a safety margin of one and a half is applied, ",
                            "and the shard count is the estimate divided by the time budget.",
                        ],
                        [
                            { strong: "Each shard renders its own rectangle of the world." },
                            " The grid is laid over the region grid and kept as close to square as the world's ",
                            "shape allows. A shard whose rectangle contains no region files is dropped rather ",
                            "than started, so a corridor-shaped world does not spend jobs rendering nothing.",
                        ],
                        [
                            { strong: "The shards are merged, and the merge is then checked." },
                            " Hires tiles are copied and compared byte for byte against the shard they came ",
                            "from; the lowres pyramid is rebuilt rather than unioned. Every check reports its ",
                            "numbers into the run summary instead of a pass mark.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The result is the ",
                        { code: "rendered-map" },
                        " artifact. Serve the unzipped folder over HTTP; opening ",
                        { code: "index.html" },
                        " off the file system will not work, because the webapp fetches its tiles.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Three things that make large worlds work",
                    content: [
                        "More shards than one matrix can hold are rendered in sequential waves of at most 256, ",
                        "because GitHub refuses a larger matrix and truncating the plan would publish a map ",
                        "with a corner missing. Every shard caches its own render state and writes a ",
                        "completion marker, so re-dispatching the workflow skips what is already done and a ",
                        "run that dies in wave seven costs wave seven rather than all seven. And a merged map ",
                        "too large for one runner's disk merges as a tree, with only the lowres layers ",
                        "travelling to the final job.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Publishing to Pages replaces the documentation site",
                    content: [
                        "The ",
                        { code: "artifact-and-pages" },
                        " output publishes the map to this repository's Pages site, and a Pages site holds ",
                        "one deployment. The map therefore replaces this documentation site until the docs ",
                        "workflow next runs. The two share a concurrency group so they queue rather than ",
                        "race, and the run summary says so out loud.",
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
                            term: "world-source and world",
                            description: [
                                "Where the world comes from: ",
                                { code: "repository" },
                                ", ",
                                { code: "url" },
                                " or ",
                                { code: "release-asset" },
                                ". One ",
                                { code: "world" },
                                " field then holds the path, the link to a zip, or an asset name such as ",
                                { code: "world*.zip" },
                                " - optionally ",
                                { code: "tag/glob" },
                                " to pin a release, where the tag defaults to ",
                                { code: "latest" },
                                ". These are one field rather than three because GitHub registers no workflow at all past ten dispatch inputs.",
                            ],
                        },
                        {
                            term: "dimension",
                            description: "Overworld, nether or end. The validator checks that this dimension has region files before a runner is spent on it.",
                        },
                        {
                            term: "map-id and map-name",
                            description: "The storage id used in the map's paths, and the display name the webapp shows.",
                        },
                        {
                            term: "output",
                            description: [
                                { code: "artifact" },
                                ", or ",
                                { code: "artifact-and-pages" },
                                " to also publish it. Read the warning above before choosing the second.",
                            ],
                        },
                        {
                            term: "budget-minutes",
                            description: "How long one job may spend rendering before the world is split. 240 by default, which leaves room under the six hour ceiling a job has.",
                        },
                        {
                            term: "max-jobs",
                            description: "A cap on parallel jobs, 64 by default. GitHub itself refuses a matrix larger than 256, which is why more shards than that become waves.",
                        },
                        {
                            term: "force-shards",
                            description: "Skip the estimate entirely and use exactly this many shards. Useful when you have measured your own world and do not want a guess.",
                        },
                        {
                            term: "BLUEMAP_ACCEPT_DOWNLOAD",
                            description: "A repository variable. Setting it to false makes the render refuse the Minecraft client-jar download and fail, rather than accepting Mojang's EULA on the repository owner's behalf.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every piece of arithmetic above lives in ",
                        { code: "packages/render-actions" },
                        " under test, not in the workflow file. That is deliberate: a shard boundary computed ",
                        "in YAML is a shard boundary nobody can write a test for.",
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
                        "Two of these were found by measuring rather than by reasoning, and both would have ",
                        "shipped a wrong map with nothing to indicate it.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "A shard cut on a region boundary duplicates tiles",
                            description: [
                                "The hires grid is ",
                                { code: "Grid(32, 2)" },
                                ", so a cut at block 512 lands inside tile 15 and a two-shard render produces 31 ",
                                "tiles twice, in differing versions. Cuts are therefore aligned to block 32k+2, ",
                                "and the outermost shard on each side is left unbounded so the masks partition ",
                                "the whole plane.",
                            ],
                        },
                        {
                            term: "Shards erase each other",
                            description: [
                                { code: "unrender" },
                                " does not skip a tile outside its mask: it deletes it and writes transparent ",
                                "black at height zero, with the same alpha real terrain has. In one two-shard ",
                                "render 509,409 lod-1 pixels were terrain in one shard and erasure in the other, ",
                                "so a first-writer-wins merge would have kept the erasures. The merge ranks ",
                                "terrain above erasure above untouched, and rebuilds lod 2 upward rather than ",
                                "unioning them.",
                            ],
                        },
                        {
                            term: "A job is killed mid-write",
                            description: "A shard that finished is told apart from one that was cut off by a completion marker written after its output is complete. A resume that guesses this gets it catastrophically wrong, so it does not guess.",
                        },
                        {
                            term: "The plan needs more than 256 shards",
                            description: "Rendered as sequential waves of at most 256, each waiting for the one before it. Nothing is truncated to fit a matrix.",
                        },
                        {
                            term: "The merged map does not fit on one runner",
                            description: "The merge becomes a tree. Each group merges its own share, hires tiles are final at that point because they are disjoint across the whole plan, and only the lowres layers travel to the final job.",
                        },
                        {
                            term: "The input is not a world",
                            description: "The run fails naming what it found instead of rendering an empty map and publishing it as though it were the world you asked for.",
                        },
                        {
                            term: "Picking your own repository from the desktop app's list used to warn that it already exists",
                            description: [
                                "The desktop app's \"Render on GitHub\" screen offers a picker of the account's own ",
                                "repositories beside the free-text owner and name fields, so a real repository can be ",
                                "chosen instead of typed. Choosing one used to write the same value into the fields a ",
                                "typed name would, which fed the create-path availability check that watches those ",
                                "fields - so picking your own repository produced an amber \"already exists on GitHub\" ",
                                "warning about the repository you had just chosen on purpose, with no control that did ",
                                "what the warning's own words offered (\"use that repository on purpose\"). The screen ",
                                "now tracks which repository was picked separately from what was typed: a selection ",
                                "from the list is accepted immediately, with no availability check and no warning, and ",
                                "the check still runs, as before, for a name typed by hand. A preflight report for a ",
                                "repository that has no route yet is also read more carefully now: an existing, ",
                                "writable repository with no render workflow committed is reported as needing setup ",
                                "rather than as a permission failure, and a repository the check could not find at all ",
                                "is reported as likely not created yet - each with a real next step (opening the ",
                                "repository, or GitHub's own prefilled \"create a repository\" page) rather than a dead ",
                                "end. A genuine credential or permission refusal still reads as one.",
                            ],
                        },
                        {
                            term: "A complete upload failed only when gh tried to create the release",
                            description: [
                                "The release subcommands do not accept ",
                                { code: "--hostname" },
                                ", even though other gh commands do. The transport now addresses github.com and ",
                                "enterprise targets with the supported ",
                                { code: "--repo [HOST/]OWNER/REPO" },
                                " form. Before every create or resumed upload it re-reads gh's real signed-in ",
                                "account inventory, switches with ",
                                { code: "gh auth switch --hostname HOST --user LOGIN" },
                                " when the selected account is inactive, and verifies the effective login with ",
                                { code: "gh api --hostname HOST user --jq .login" },
                                ". Missing accounts, switch refusals, and identity mismatches stop before any ",
                                "release command and offer GitHub-account recovery on the same screen. The switch ",
                                "is computer-wide and intentionally leaves the selected account active.",
                            ],
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
                        [
                            "The workflow accepts Mojang's EULA on behalf of the repository owner, who has ",
                            "already accepted it in the desktop application. BlueMap downloads a Minecraft ",
                            "client jar to get block models and textures and cannot render without one. A fork ",
                            "that does not want that sets ",
                            { code: "BLUEMAP_ACCEPT_DOWNLOAD" },
                            " to false and the render refuses the download.",
                        ],
                        "Everything runs on GitHub-hosted runners. Nothing here attaches a self-hosted runner to a public repository, which would let anyone who can start a workflow run code on that machine.",
                        "A world fetched from a URL or a release asset is validated before it is rendered, and its paths are handled as data rather than trusted, so an archive cannot name a path outside the directory it is unpacked into.",
                        [
                            "A world that must stay private is rendered by the encrypted path instead, documented in ",
                            {
                                link: "docs/private-world-rendering.md",
                                href: PRIVATE_WORLD_DOC_URL,
                                external: true,
                            },
                            ". The public run sees keyed hashes rather than names, keeps nothing it rendered, ",
                            "creates no release on the public side, and uploads no world or map data as an ",
                            "artifact.",
                        ],
                        "Publishing to Pages makes a world's map public. That is the point of the option, and it is also the mistake somebody makes once, which is why the run summary states it rather than assuming it was understood.",
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
                        "The merge is checked rather than assumed, because everything it can get wrong is ",
                        "silent. The verifier proves the hires tiles are a disjoint union, that the shard ",
                        "totals equal the merged total with missing and unexpected counted separately, that ",
                        "every tile was copied without alteration, that tiles either side of every cut still ",
                        "decompress and carry a valid PRBM header, that the map metadata is present, and that ",
                        "no level of detail promised by the map settings is empty.",
                    ],
                },
                {
                    kind: "table",
                    caption: "A 1000 by 1000 generated world rendered whole, then as a two-shard and a four-shard split",
                    columns: ["Layer", "Reference", "Merged", "Differences"],
                    rows: [
                        ["hires tiles", "961", "961", "0 missing, 0 unexpected, 0 bytes different"],
                        ["lod 1", "16 tiles", "16 tiles", "4,016,016 pixels compared, 0 different"],
                        ["lod 2", "4 tiles", "4 tiles", "1,004,004 pixels compared, 0 different"],
                        ["lod 3", "4 tiles", "4 tiles", "1,004,004 pixels compared, 0 different"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The four-shard run was done through the real command line renderer, using the same ",
                        "commands the workflow runs, because a one-dimensional cut never reaches the case where ",
                        "four shards meet on one corner. It reported 1,281,987 overruled erasures and zero ",
                        "conflicting pixels. The merged map is not merely close to the map an unsharded render ",
                        "would have produced; on this world it is the same map.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What that does not prove",
                    content:
                        "It is one world on one machine. It exercised no mods, no custom resource pack and one flat generated terrain, and the figures above came from running the pipeline by hand rather than from a workflow run this article can point you at. The unit tests run in CI on every push; the end-to-end numbers do not.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "publishing-to-pages",
            reason: "The other end of the same job: publishing a map this computer rendered, from the application, to a real address anybody can open.",
        },
        {
            articleId: "java-render-path",
            reason: "The same BlueMap engine, driven by the desktop app instead of by a runner. Read it to see what is doing the actual rendering here.",
        },
        {
            articleId: "test-world-generator",
            reason: "Where the 1000 by 1000 world in the figures above came from, and how to make one to try this with.",
        },
        {
            articleId: "release-pipeline",
            reason: "How a map or a world too large for a single release asset is published and put back together.",
        },
        {
            articleId: "world-reading",
            reason: "The anvil format the planner reads to count chunks, explained properly.",
        },
    ],

    sources: [
        { label: "docs/render-in-actions.md", href: RENDER_IN_ACTIONS_DOC_URL },
        { label: "docs/resumable-renders.md", href: RESUMABLE_RENDERS_DOC_URL },
        { label: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL },
        { label: "docs/private-world-rendering.md", href: PRIVATE_WORLD_DOC_URL },
        { label: ".github/workflows/render-world.yml", href: RENDER_WORLD_WORKFLOW_URL },
        { label: ".github/workflows/render-shard-wave.yml", href: RENDER_SHARD_WAVE_WORKFLOW_URL },
        { label: ".github/workflows/render-private-world.yml", href: RENDER_PRIVATE_WORKFLOW_URL },
        { label: "packages/render-actions", href: repoFile("design/packages/render-actions") },
    ],
};
