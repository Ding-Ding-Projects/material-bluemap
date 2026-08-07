/**
 * Landing page copy.
 *
 * The rule this file is written under: say what exists, say what does not, and never
 * let a sentence read as though an unbuilt thing were shipped. The phase table below
 * mirrors `design/ROADMAP.md`, which is the source of truth. When the roadmap moves,
 * this moves in the same task.
 *
 * Two things this page has to get right, because everything else follows from them:
 *
 *   1. There are two render engines and only one of them runs. Upstream BlueMap's Java
 *      engine renders a local world today; the TypeScript mesher is being written and
 *      takes over when its output is byte-identical. A page that lists both without
 *      saying which is which lets a reader conclude the port is finished.
 *   2. Every number here is countable and every card says how much of its subject is
 *      actually built. A status badge that says shipped means shipped.
 */

import type { HomeContent } from "./types.js";
import {
    ACTION_ARTWORK_DOC_URL,
    APPEARANCE_EDITORS_DOC_URL,
    BACKUP_DOC_URL,
    BUILD_JARS_WORKFLOW_URL,
    CHANGELOG_VIEWER_DOC_URL,
    CONFIG_HISTORY_DOC_URL,
    COMMAND_PALETTE_DOC_URL,
    CONTRACTS_URL,
    CONVENTIONS_URL,
    DECISIONS_URL,
    DEVIATIONS_URL,
    DOCKER_AND_LOCAL_DOC_URL,
    DOCKER_WORLD_SOURCE_DOC_URL,
    DOCS_INDEX_URL,
    HANDOFF_URL,
    ISSUES_URL,
    LANGUAGE_AND_TONE_DOC_URL,
    LARGE_WORLDS_DOC_URL,
    LEGACY_WORLDS_DOC_URL,
    NOTIFICATION_CENTRE_DOC_URL,
    PAGES_FEATURE_PARITY_DOC_URL,
    PANEL_GEOMETRY_DOC_URL,
    PLAN_URL,
    PRIVATE_WORLD_DOC_URL,
    REGEX_BUILDER_DOC_URL,
    REMOTE_RENDER_DOC_URL,
    RENDER_IN_ACTIONS_DOC_URL,
    RENDER_CONSOLE_DOC_URL,
    RENDER_PRIVATE_WORKFLOW_URL,
    RENDER_WORLD_WORKFLOW_URL,
    REPO_URL,
    RESUMABLE_RENDERS_DOC_URL,
    SCHEDULED_SETTINGS_DOC_URL,
    ROADMAP_URL,
    SSH_WORLD_SOURCES_DOC_URL,
    SUPER_CONFIRMATION_DOC_URL,
    TABBED_NAVIGATION_DOC_URL,
    UPSTREAM_URL,
    issue,
} from "./links.js";

export const home: HomeContent = {
    title: "worldlens",
    tagline:
        "A from-scratch TypeScript port of BlueMap, the Minecraft world renderer and 3D web map.",
    summary:
        "Render a Minecraft world into a 3D map from a desktop application, or from a GitHub Actions run with nothing installed at all, and browse it in an interface rebuilt from the ground up in Material Design 3.",

    intro: [
        {
            kind: "paragraph",
            content: [
                { link: "BlueMap", href: UPSTREAM_URL, external: true },
                " renders a Minecraft world into 3D map tiles and serves them to a browser. ",
                "worldlens ports that renderer from Java to TypeScript, and builds two things on ",
                "top of it: a Material Design 3 desktop application, and a way to render a world on ",
                "GitHub's runners with nothing installed locally. A headless server serving the same map ",
                "to an ordinary browser is planned and is not built.",
            ],
        },
        {
            kind: "paragraph",
            content: [
                "Target world versions are Minecraft ",
                { strong: "1.12.2 through 26.x" },
                ". Support for 1.12.2 is combined back in from upstream tag ",
                { code: "v0.10.3-mc1.12" },
                ", the last upstream release that carried it, so a decade of worlds opens rather than ",
                "only the recent ones.",
            ],
        },
        {
            kind: "callout",
            tone: "note",
            title: "Which renderer runs today, in one sentence",
            content: [
                "A world you render locally is rendered by ",
                { strong: "upstream BlueMap's own Java engine" },
                ", built from the vendored source and driven by the application as a child process. The ",
                "TypeScript mesher this project exists to write is being written and does not render ",
                "anything yet. Every render records which engine produced it, and the two are laid out ",
                "side by side below.",
            ],
        },
    ],

    /* ---------------------------------------------------------------------- */
    /* Getting started                                                        */
    /* ---------------------------------------------------------------------- */

    /*
     * The three facts above are pitched at someone who already knows what BlueMap and a
     * Minecraft world are. This section is for someone who does not: the same three facts
     * the desktop application's own first-run welcome step opens with (`welcome.what`,
     * `welcome.result`, `welcome.cannot` in packages/ui/src/components/setup/setupStrings.ts),
     * reworded for a website visitor who has not opened the app yet rather than someone
     * already inside it. Kept in step deliberately: the honest Java-and-Mojang disclosure at
     * the end is one fact, said once, not a second explanation that could drift from the
     * app's own.
     */
    gettingStartedSection: {
        title: "New here? Start with this",
        lede: "Everything above assumes some BlueMap vocabulary already. This does not.",
    },

    gettingStarted: [
        {
            kind: "paragraph",
            content: [
                "BlueMap turns a Minecraft world into a 3D map you can open in a browser. This ",
                "project renders a world from your own save on your own computer, or connects to ",
                "a BlueMap server somebody else already runs and shows its map, all from one ",
                "desktop application.",
            ],
        },
        {
            kind: "list",
            ordered: true,
            items: [
                [
                    "Download the Windows installer below, or build the application from source ",
                    "if you are on another platform.",
                ],
                [
                    "Open it and either point its wizard at a world folder on this computer, or ",
                    "add the address of a BlueMap server somebody else runs. The wizard looks for ",
                    "worlds already on this computer first, so there is usually nothing to type.",
                ],
                [
                    "A small world typically renders in a few minutes, a large one longer. When ",
                    "it finishes, the map opens in the same window: a small website, a folder of ",
                    "files you can also open in your own browser or publish later.",
                ],
            ],
        },
        {
            kind: "callout",
            tone: "note",
            title: "Before you start",
            content: [
                "Rendering runs on Java. If this computer does not already have a suitable ",
                "version, the application fetches one into its own folder, never installed ",
                "system-wide. Minecraft's own client file is downloaded too, using the one ",
                "consent decision the app asks for at first run rather than asking twice.",
            ],
        },
    ],

    /* ---------------------------------------------------------------------- */
    /* Scale                                                                  */
    /* ---------------------------------------------------------------------- */

    statsSection: {
        title: "The size of it",
        lede: "A port of a renderer is not one file, and none of these numbers are marketing. Each one is countable from the repository, and the line beneath it says where.",
    },

    stats: [
        {
            value: "13",
            label: "packages in one workspace",
            detail: "engine, viewer, ui, app, server, cli, config, nbt, shared, worldgen, render-actions, parts and this site, under design/ as a pnpm workspace.",
        },
        {
            value: "1.12.2 to 26.x",
            label: "Minecraft versions read",
            detail: "Region files, chunk sections, block states, biomes and light, through a decoder matrix dispatched on the world's DataVersion.",
        },
        {
            value: "65",
            label: "upstream webapp files ported",
            detail: "The whole of BlueMap's browser application in strict TypeScript: controls, markers, the skybox, the tile loader and the map viewer.",
        },
        {
            value: "24",
            label: "interface components rebuilt",
            detail: "Every upstream webapp component rebuilt in Material Design 3, keeping upstream's own translation keys so all 30 bundled locales still work.",
        },
        {
            value: "7",
            label: "upstream builds compiled from source",
            detail: "The command line renderer plus the fabric, forge, neoforge, paper, spigot and sponge server plugins, built unmodified from the vendored upstream source by the workflow CI calls. Only the command line renderer has been built by hand and checked.",
        },
        {
            value: "2,827",
            label: "tests, green on 2026-08-03",
            detail: "189 files across every package, from npx vitest run in design/ on that date, with 2 skipped. The suite runs on every push, and the roadmap carries the per-package breakdown and the date it was last taken.",
        },
        {
            value: "961",
            label: "tiles in the reference render",
            detail: "A generated 1000 by 1000 world rendered to 961 hires tiles in 80 seconds, by hand on one machine. Every render estimate and every parity check on this page is anchored to that one measurement.",
        },
    ],

    statsNote: [
        "The full test counts, per package, are kept in ",
        { link: "design/ROADMAP.md", href: ROADMAP_URL, external: true },
        " with the date they were taken and the command that took them, because a number printed on a ",
        "page goes stale and a number beside its command does not. Porting rules are in ",
        { link: "docs/porting-conventions.md", href: CONVENTIONS_URL, external: true },
        " and every deliberate difference from upstream is logged in ",
        { link: "docs/deviations.md", href: DEVIATIONS_URL, external: true },
        ".",
    ],

    /* ---------------------------------------------------------------------- */
    /* The two engines                                                        */
    /* ---------------------------------------------------------------------- */

    enginesSection: {
        title: "Two engines, one of which runs",
        lede: "Turning blocks into geometry is the largest and highest-risk part of this port. Rather than ship nothing until it is finished, the application drives upstream's engine and the port is checked against it.",
    },

    engines: [
        {
            id: "java",
            name: "Upstream BlueMap, in Java",
            role: "Renders your world today",
            runsToday: true,
            body: [
                "Built from the vendored upstream source and launched as a child process. The application ",
                "finds or installs a Java runtime, writes the configuration, reads the renderer's log as it ",
                "goes so progress is real rather than a spinner, and serves the finished map to the viewer ",
                "exactly as it serves a remote one. Every render writes a ",
                { code: "render.json" },
                " naming the engine, its version and the JVM that ran it.",
            ],
            articleId: "java-render-path",
        },
        {
            id: "typescript",
            name: "The TypeScript mesher",
            role: "Being written, gated, not yet running",
            runsToday: false,
            body: [
                "The tile model, the block and entity renderers, the byte-exact tile writer, the ",
                "level-of-detail cascade and the masks are written and unit tested. The gate it had to pass ",
                "to take over is closed: decompressed hires tile bytes identical to the Java engine's and ",
                "lowres images matching pixel for pixel, on every fixture world. Passing that gate did not ",
                "itself switch the product over; the Java engine stays the standing default until that ",
                "switch is separately made and verified. Nothing switches silently, and the application ",
                "says which engine produced a map. The handover and its gate are described in the same ",
                "article the card beside this one opens.",
            ],
            articleId: "java-render-path",
            linkLabel: "Read: the gate the mesher has to pass",
        },
    ],

    enginesNote: [
        "This reverses the pure-TypeScript position for the interval, not for the end state. The reasoning ",
        "and its cost are written down as decisions D17 and D18 in ",
        { link: "docs/decisions.md", href: DECISIONS_URL, external: true },
        ", and the parity gate is tracked as ",
        { link: "issue 3", href: issue(3), external: true },
        ". The honest consequence: local rendering needs a Java runtime until the mesher lands, and the ",
        "application will fetch a verified one into its own data directory rather than touching anything ",
        "machine-wide.",
    ],

    /* ---------------------------------------------------------------------- */
    /* Screenshots                                                            */
    /* ---------------------------------------------------------------------- */

    showcaseSection: {
        title: "What it looks like",
        lede: "Captures of the real application, committed to the repository so they travel with every clone. None is a mockup, a design file or a hand-edited picture.",
    },
    showcaseCaveat:
        "The first is the application after a real Windows install, over a live map, with all four kinds of marker drawing. The rest come from the capture harness, which drives the packaged application with Playwright: it opens each menu, dialog, panel and editor in turn, and photographs it. Every capture is on the screenshots page, along with the surfaces the harness could not reach and the reason for each, because a gallery that quietly leaves a screen out is indistinguishable from one that never had it.",
    showcaseMoreLabel: "See every capture",
    showcaseUnavailable:
        "No committed capture could be resolved for this build, so nothing is shown here. Nothing has been substituted for the missing images.",

    /* ---------------------------------------------------------------------- */
    /* Features                                                               */
    /* ---------------------------------------------------------------------- */

    featuresSection: {
        title: "What it can do",
        lede: "Every card carries how much of its subject is actually built, and opens the article that documents it properly. Nothing here is described as finished because it would be nice if it were.",
    },

    featureGroups: [
        {
            id: "render",
            title: "Rendering a world",
            lede: "Several routes to a map: your own machine, a container on it or a remote one, GitHub's runners, or a generated world when you have no Minecraft installation to hand.",
            features: [
                {
                    title: "Render a world on your own machine",
                    body: "Point the application at a world folder and it renders it: the JVM found or installed for you, the configuration written, the renderer's progress read line by line, and the finished map opened in the viewer without leaving the app.",
                    status: "shipped",
                    statusNote:
                        "Built and unit tested (331 tests for render and Java together), a real Java-engine render has run in CI on every push since 2026-08-03, and the app's own orchestrator - ensureJava, the config writer, the runner and provenance.ts, together - has now been driven by a real JVM too, not just invoked as java -jar from a shell script. See the java-render-path article's Verification section for both real-JVM proofs and their exact commands.",
                    articleId: "java-render-path",
                    reading: [{ label: "design/docs/decisions.md", href: DECISIONS_URL }],
                },
                {
                    title: "Or run the same render in a Docker container",
                    body: "The same jar, the same arguments, inside a container instead of as a bare process, when you want the engine kept off the rest of the disk or need a Java version this machine does not have. Progress, logs, cancellation and a container that outlives a closed app all read exactly as the local path does.",
                    status: "shipped",
                    statusNote:
                        "The probe, the mount planning and the reattachment machinery are built with 126 tests in CI, none needing Docker installed. Nobody has rendered a world through this path against a real, installed Docker from a packaged build.",
                    articleId: "docker-and-local",
                    reading: [
                        { label: "docs/docker-and-local.md", href: DOCKER_AND_LOCAL_DOC_URL },
                    ],
                },
                {
                    title: "Or send it to a machine over SSH",
                    body: "Hand a render to a Linux box with real cores and real disk. Keys only, never a password; an unknown host key is a decision you make and a changed one is refused with no override; the world uploads resumably when both machines have rsync, and a render that outlives a closed app is picked back up by name.",
                    status: "shipped",
                    statusNote:
                        "The SSH invocation, host-key trust, preflight, transfer and reattachment are built with 154 tests in CI, none needing a real SSH client or server. No capture from a real remote host exists yet.",
                    articleId: "remote-render",
                    reading: [{ label: "docs/remote-render.md", href: REMOTE_RENDER_DOC_URL }],
                },
                {
                    title: "Render a world in GitHub Actions",
                    body: "Start a workflow, wait, download the map. No Java, no BlueMap and no machine of yours doing the work. The world can come from the repository, a URL or a release asset, and is validated before a runner is spent on it.",
                    status: "shipped",
                    statusNote:
                        "The planner, the shard config writer, the merger and the verifier are built and their tests run in CI on every push. A green end-to-end run of the workflow is not something this page can show you.",
                    articleId: "render-in-actions",
                    reading: [
                        { label: "docs/render-in-actions.md", href: RENDER_IN_ACTIONS_DOC_URL },
                        {
                            label: ".github/workflows/render-world.yml",
                            href: RENDER_WORLD_WORKFLOW_URL,
                        },
                    ],
                },
                {
                    title: "Worlds too large for one job",
                    body: "A world one job cannot finish is split across a matrix and merged back. Cuts land on the tile grid rather than on region boundaries, the merge ranks terrain above the transparent black that a neighbouring shard writes over it, and more shards than one matrix can hold become sequential waves rather than a truncated plan.",
                    status: "shipped",
                    statusNote:
                        "Proved against an unsharded render of the same world: 961 of 961 hires tiles byte-identical, and zero differences across 6,024,024 lowres pixels, for both a two-shard and a four-shard split. One world, one machine.",
                    articleId: "render-in-actions",
                    reading: [
                        { label: "docs/render-in-actions.md", href: RENDER_IN_ACTIONS_DOC_URL },
                    ],
                },
                {
                    title: "Renders that survive being interrupted",
                    body: "A render of a large world takes hours, and in that time a machine sleeps, an application is closed and a job hits its ceiling. Every shard caches its own render state and writes a completion marker once its output is whole, so a resumed run skips what finished and redoes only what was cut off.",
                    status: "shipped",
                    statusNote:
                        "The cache keys, the completion markers and the wave batching are built and unit tested in CI. The desktop half of the same idea is documented alongside it.",
                    articleId: "render-in-actions",
                    reading: [
                        { label: "docs/resumable-renders.md", href: RESUMABLE_RENDERS_DOC_URL },
                    ],
                },
                {
                    title: "A world to render, with no Minecraft installed",
                    body: "A generator writes a synthetic Minecraft world directly in Anvil format from a seed: terrain, biomes, lighting and all. It exists so a render can be demonstrated and reproduced without a Minecraft server, a download or somebody else's demo site.",
                    status: "shipped",
                    statusNote:
                        "Built, and proved by reading its own output back through this project's world reader. 19 tests covering terrain, biomes, lighting, packing and determinism run in CI on every push.",
                    articleId: "test-world-generator",
                },
                {
                    title: "A private world, rendered on public runners",
                    body: "Rendering costs hours of CPU, and GitHub charges private repositories by the minute. The encrypted path fetches an encrypted world onto a public runner, renders it, and attaches the encrypted result to a release on your private repository. Every name in the public run is a keyed hash.",
                    status: "shipped",
                    statusNote:
                        "The workflow and its documentation are on the default branch, and the document is explicit about what the approach protects and what it does not.",
                    articleId: "render-in-actions",
                    reading: [
                        { label: "docs/private-world-rendering.md", href: PRIVATE_WORLD_DOC_URL },
                        {
                            label: ".github/workflows/render-private-world.yml",
                            href: RENDER_PRIVATE_WORKFLOW_URL,
                        },
                    ],
                },
            ],
        },
        {
            id: "app",
            title: "The desktop application",
            lede: "An Electron application with upstream's whole browser interface rebuilt in Material Design 3, and a security posture that assumes the map server is a stranger.",
            features: [
                {
                    title: "Install it on Windows",
                    body: "A Squirrel installer that installs per user and needs no administrator rights. The download button on this page is generated from a release the build verified, or it is absent and the page says why.",
                    status: "shipped",
                    statusNote:
                        "Published by CI on every passing push to the default branch. Windows is the only packaged platform, and the installers are not code signed.",
                    articleId: "install",
                },
                {
                    title: "Browse a BlueMap server somebody else runs",
                    body: "Add a server profile and the application proxies it through its own localhost server, including the event stream that carries live player positions, so the viewer talks to one origin and the remote server never sees the browser directly.",
                    status: "shipped",
                    statusNote:
                        "Built and tested, and verified live against a public BlueMap server rather than only against a fixture.",
                    articleId: "viewer-remote-mode",
                },
                {
                    title: "The upstream interface, in Material Design 3",
                    body: "All 24 of upstream's webapp components rebuilt against Material Design 3 tokens: the maps menu, the marker tree, the compass, live position inputs, the three view modes, day and night, and the zoom controls. Upstream's own translation keys are kept, so the 30 bundled locales still work.",
                    status: "shipped",
                    statusNote:
                        "Rebuilt, tested, and captured by the screenshot harness at every supported window size, display scale and colour scheme.",
                    articleId: "viewer-remote-mode",
                },
                {
                    title: "Every BlueMap setting, edited in the app",
                    body: "A button in the corner opens the seven-screen options editor over the whole window, pointed at a real config folder. It reads and writes BlueMap's own configuration format rather than a parallel one of its own, keeping the comments that explain each setting, so a file the application wrote is a file upstream's renderer reads.",
                    status: "ported-unverified",
                    statusNote:
                        "The schema, the editor and the bridge that lets it touch a folder are built and tested, and the editor is reachable from the application at last. The check that matters has now run: a config written here, edited by hand through a packaged build and saved into a folder the real Java CLI generated, was loaded by that same CLI and read back correctly. It has not yet run as a standing part of CI, and the screens have not been captured at every width and scale.",
                    articleId: "options-gui",
                },
                {
                    title: "A real control for every setting, not a wall of text boxes",
                    body: "Every config field gets the control its value deserves, and a select bound to a value its list does not hold shows that value rather than rendering blank. Both colour fields mount the app's infinite picker with alpha, because BlueMap reads an eighth hex byte as one.",
                    status: "shipped",
                    statusNote:
                        "A guard test classifies every field from its zod schema and takes a second opinion from upstream's own Java field types, so a setting cannot quietly become a text box. The Java half skips itself without the vendored submodule, and nobody has driven these controls in an installed build.",
                    articleId: "config-rich-controls",
                },
                {
                    title: "An undo for the config folder, kept out of the config folder",
                    body: "Every save records a complete snapshot of the folder into a git history the app keeps beside its own data. Restore is append-only, so an undo can be undone; a History tab browses, diffs, labels, filters and exports it; and a history that cannot be written never fails the save.",
                    status: "shipped",
                    statusNote:
                        "37 tests drive real git repositories in real temporary directories and 37 more cover the panel and its filters, all in CI. The real-git block skips itself where git is absent, and there is no committed capture of the panel with revisions in it.",
                    articleId: "config-history",
                    reading: [{ label: "docs/config-history.md", href: CONFIG_HISTORY_DOC_URL }],
                },
                {
                    title: "Back a world or a rendered map up to GitHub",
                    body: "A folder packed into one deterministic archive, cut into 500 MiB parts, and published as the assets of a new release with a pointer naming every part and its digest. Git LFS was rejected on cost by name, and the pointer format is the sibling app's so either can read the other's backup.",
                    status: "shipped",
                    statusNote:
                        "Twelve test files, and a real backup, a real cancel-and-resume and a real restore have all now run against real github.com, byte-for-byte, finding and fixing a real bug in a 422 refusal on the way. Restoring needed a real engine it never actually had; that now exists too. What remains is the app's own Restore button, still not wired to it.",
                    articleId: "backups",
                    reading: [{ label: "docs/backup.md", href: BACKUP_DOC_URL }],
                },
                {
                    title: "Get a world out of a release, without leaving the wizard",
                    body: "The step that asks where your world is also offers to fetch one. A world published in 1.7 GB parts arrives as the single file it really is: every part checked as it lands, rejoined, checked again whole, and unpacked, with real byte counts rather than a spinner. Now reachable from any public repository, not only this project's own.",
                    status: "ported-unverified",
                    statusNote:
                        "The downloader, the zip reader, the cross-repository fetcher and the panel are built and tested across 185 cases, including one that drives a manifest-shaped download and one that drives a checksum-list one, each end to end against a real archive. Nothing has been fetched from github.com through the shipped desktop app itself, so what GitHub itself does is proved against a stand-in.",
                    articleId: "release-downloads",
                    reading: [{ label: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL }],
                },
                {
                    title: "Browse and fetch a world from your own SSH server",
                    body: "The wizard reuses the saved remote-machine editor and Explorer-style browser: choose a key-only host, inspect its actual folders with world-likelihood badges, review an unknown fingerprint, survey the folder, then fetch it into the ordinary local-world path with progress and cancellation.",
                    status: "ported-unverified",
                    statusNote:
                        "The complete preload-to-wizard seam is mounted and covered by focused bridge/UI tests plus the existing 64 main-process SSH-world tests. The UI build and policy guards pass. A genuine Linux or Windows host has not yet completed this flow through a packaged build.",
                    articleId: "ssh-world-sources",
                    reading: [
                        { label: "docs/ssh-world-sources.md", href: SSH_WORLD_SOURCES_DOC_URL },
                    ],
                },
                {
                    title: "Fetch a world from a local Docker container or volume",
                    body: "The World step lists Docker's actual containers and named volumes, inspects a container's real mounts, requires a fresh warning acknowledgement before reading a live server, copies read-only into an exact browsed folder, and then rejoins the ordinary local-world validation path.",
                    status: "ported-unverified",
                    statusNote:
                        "The complete main/preload/wizard seam, cancellation and honest determinate-or-indeterminate progress are covered by focused mounted and policy tests plus a production build. Docker Desktop's client was present during verification, but its local daemon pipe was absent, so no real container or volume fetch is claimed.",
                    articleId: "docker-world-source",
                    reading: [
                        { label: "docs/docker-world-source.md", href: DOCKER_WORLD_SOURCE_DOC_URL },
                    ],
                },
                {
                    title: "Sign in to GitHub, only when something private needs it",
                    body: "A device flow that shows the code large and verbatim, counts down only from what the main process actually said, and keeps its four endings apart. A pasted token is the other way in. The credential never reaches the interface at all.",
                    status: "ported-unverified",
                    statusNote:
                        "Built and covered by 166 tests, all of which drive a stand-in for GitHub's endpoints. A gated real-account file now proves the app's own client id and a real account's token against the live server; nobody has clicked Authorize on GitHub's own page, which no script can do for them. The account now reaches the download path and the backup path, and neither has been run against real GitHub.",
                    articleId: "github-sign-in",
                },
                {
                    title: "A window that draws its own chrome",
                    body: "Frameless, with the application's own Material title bar, its own window buttons, and the viewer's controls starting below the bar rather than under it. One notification corner for the whole application, and both typefaces bundled so nothing is fetched to draw a word.",
                    status: "shipped",
                    statusNote:
                        "On the default branch, with the title bar captured from the packaged application and those captures committed. Nobody has pressed the three window buttons in an installed build, and no test asserts that the typefaces are bundled.",
                    articleId: "desktop-shell-chrome",
                },
                {
                    title: "A localhost server nothing else can reach",
                    body: "The embedded server binds the loopback address on an ephemeral port and refuses every request that does not carry the token minted for that launch, so another process on the same machine cannot read your map.",
                    status: "shipped",
                    statusNote:
                        "Built and tested, including the refusal paths, and running in every launch of the app.",
                    articleId: "embedded-server",
                },
                {
                    title: "An Electron shell that assumes the worst",
                    body: "Sandbox on, node integration off, context isolation on, a Content-Security-Policy without unsafe-eval, and navigation locked to the embedded server's own origin. A remote map server is treated as a stranger, because that is what it is.",
                    status: "shipped",
                    statusNote:
                        "Built and tested, and the policy is asserted rather than assumed to have been configured.",
                    articleId: "electron-security",
                },
                {
                    title: "One consent decision, asked once",
                    body: "Rendering needs a Minecraft client jar for block models and textures, which means accepting Mojang's terms. The application asks once at first run, remembers, and checks the answer before anything is spawned or downloaded.",
                    status: "shipped",
                    statusNote:
                        "Built and tested, with the check in one place ahead of the toolchain probe so an unconsented render fails instantly rather than after a search for a JDK.",
                    articleId: "first-run-consent",
                },
            ],
        },
        {
            id: "working",
            title: "Working in the application",
            lede: "The parts that are not one screen: a tab strip, a shortcut over everything, a place messages go when they leave, and the rules every surface has to keep.",
            features: [
                {
                    title: "Browser-style tabs, with everything that implies",
                    body: "A persistent strip whose overflow goes into a surface of its own rather than being clipped, with pinning, groups, four separate searches and five bulk closes, each of which shows exactly which tabs it will take before it takes them. Order, pins, groups and collapsed state come back on the next launch.",
                    status: "shipped",
                    statusNote:
                        "On the default branch and mounted by the shell, with six test files in CI covering the ordering rules, the four searches, the close plans, storage, the menus and the mounted strip. Per-tab appearance beyond a group colour is deliberately absent.",
                    articleId: "tabbed-shell",
                    reading: [
                        { label: "docs/tabbed-navigation.md", href: TABBED_NAVIGATION_DOC_URL },
                    ],
                },
                {
                    title: "A documentation site that keeps the whole product contract",
                    body: "The GitHub Pages site carries its own settings, language and tone controls, tab searches, regex builders, command palette, exact teleport, appearance editors, notifications, exports and accessibility rules. On phones its side rail starts collapsed and can always be expanded without losing focus or hiding the current page.",
                    status: "shipped",
                    statusNote:
                        "A hand-written inventory names every applicable shared requirement with implementation and test evidence, and records browser-platform boundaries instead of silently skipping them. Local compact proof and the exact live deployment are reported separately.",
                    articleId: "pages-feature-parity",
                    reading: [
                        {
                            label: "docs/pages-feature-parity.md",
                            href: PAGES_FEATURE_PARITY_DOC_URL,
                        },
                    ],
                },
                {
                    title: "Language and appearance that can keep a timetable",
                    body: "A versioned rule can apply the site's real language and appearance settings by date, time, weekday and timezone. Values can live in the rule, arrive from a bounded HTTPS JSON endpoint, or wait for a Home Assistant boolean entity; the stored base always returns when the rule is inactive or fails.",
                    status: "shipped",
                    statusNote:
                        "The guided Schedules settings tab, precedence and cross-midnight engine, bounded history, import/export, API and Home Assistant safety boundaries, search destinations, tests and compact bilingual runtime proof are implemented. Home Assistant tokens live only in memory for the current page session, with per-rule and clear-all actions; they never enter storage, exports, URLs or logs.",
                    articleId: "scheduled-settings",
                    reading: [
                        {
                            label: "docs/scheduled-settings-and-external-sources.md",
                            href: SCHEDULED_SETTINGS_DOC_URL,
                        },
                    ],
                },
                {
                    title: "Panels that resize, move, remember and come back",
                    body: "Every settings and page panel resizes. Floating interactive panels also drag by a visible toolbar, stay inside the viewport, remember geometry per surface, reset independently, and expose keyboard move and resize paths.",
                    status: "shipped",
                    statusNote:
                        "A hand-written four-surface inventory covers settings panels, site page panels, anchored panels and interactive overlays. The guard proves each owner attaches the shared controller; compact appearance and schedule captures show the real bounded surfaces.",
                    articleId: "panel-geometry",
                    reading: [{ label: "docs/panel-geometry.md", href: PANEL_GEOMETRY_DOC_URL }],
                },
                {
                    title: "One shortcut over every command and setting",
                    body: "The command palette lists everything the application can do, and a row that is a setting carries the setting itself rather than a link to the screen it lives on: flipping it here and flipping it there are the same act with the same persistence. A row that opens a surface says which one.",
                    status: "shipped",
                    statusNote:
                        "On the default branch with four test files in CI, one of them mounting the real component. Nobody has opened it in an installed build, and its own copy is not in the language catalogue yet.",
                    articleId: "command-palette",
                    reading: [{ label: "docs/command-palette.md", href: COMMAND_PALETTE_DOC_URL }],
                },
                {
                    title: "Messages you can still read after they have gone",
                    body: "A toast leaves on purpose, and the one worth reading twice is reliably the one that left. The notification centre keeps every notice of the session with its level, detail and actions, filterable by level, searchable, exportable, and restorable back into the corner with its buttons intact.",
                    status: "shipped",
                    statusNote:
                        "On the default branch inside the notification corner the shell already had, with four test files in CI, two of them mounting the real components. There is no committed capture of the panel with messages in it.",
                    articleId: "notification-centre",
                    reading: [
                        { label: "docs/notification-centre.md", href: NOTIFICATION_CENTRE_DOC_URL },
                    ],
                },
                {
                    title: "A render console that does not throw away the useful line",
                    body: "The engine's output stays in a bounded, searchable console with a written level beside its colour, a detached-scroll state, advice links and copy/export. When the cap drops older lines, the console says how many instead of pretending the visible slice is complete.",
                    status: "shipped",
                    statusNote:
                        "Mounted by the render screen on the default branch, with model and component tests covering follow/detach behaviour, dropped-line accounting, advice navigation, reduced motion, copy/export and invalid patterns.",
                    articleId: "render-console",
                    reading: [{ label: "docs/render-console.md", href: RENDER_CONSOLE_DOC_URL }],
                },
                {
                    title: "A changelog generated from the history, readable in the app",
                    body: "Every version, every entry, and the full SHA of the commit that made it, generated from the repository's own tags rather than written by hand. The viewer searches the text and the commit messages, filters by date, and exports what it is showing.",
                    status: "shipped",
                    statusNote:
                        "The generator and the viewer are on the default branch with four test files in CI, one of which checks every referenced commit against the repository. Generation aborts rather than emitting a reference to a commit that cannot be resolved.",
                    articleId: "changelog-viewer",
                    reading: [
                        { label: "docs/changelog-viewer.md", href: CHANGELOG_VIEWER_DOC_URL },
                    ],
                },
                {
                    title: "Two keys and a slider before anything irreversible",
                    body: "Deleting a map, a storage, a saved profile, a theme preset or a batch of tabs goes through a gate that names exactly what it is about to destroy, needs two independently turned keys, and then a slider that has to travel its whole range. An emergency exit is always there and focus always comes back.",
                    status: "shipped",
                    statusNote:
                        "One state machine behind two presentations, in front of seven actions, with three test files in CI including a source inventory of every destructive call site. Two of those call sites are declared as gaps rather than gated, and the card links to where that is written down.",
                    articleId: "destructive-action-gate",
                    reading: [
                        { label: "docs/super-confirmation.md", href: SUPER_CONFIRMATION_DOC_URL },
                    ],
                },
                {
                    title: "Appearance, down to the element",
                    body: "A right-click or a keyboard chord opens an editor anchored beside the element, with a colour picker that is a continuous field rather than a grid of swatches and translates between eleven notations, and a typography editor with the depth of a word processor's font dialog. Nothing you type is silently dropped.",
                    status: "shipped",
                    statusNote:
                        "The machinery is on the default branch with nine test files in CI. It is wrapped around four elements today: the title bar, the tab bar, each server profile row, and the editor's own chrome. The contract asks for every element, and the article says so.",
                    articleId: "appearance-editor",
                    reading: [
                        { label: "docs/appearance-editors.md", href: APPEARANCE_EDITORS_DOC_URL },
                    ],
                },
                {
                    title: "A regex builder on every search bar, kept there by a test",
                    body: "Plain text is the default. Turn regex on and an anchored builder opens beside the field, with guided tokens, the real sample text the search will scan, live matches and capture groups, and the engine and its limits named on screen. A pattern that would freeze the window is refused before it compiles.",
                    status: "shipped",
                    statusNote:
                        "Three shared fields, three anchored builders and a source guard that walks every component and fails when a search bar appears without one. Its exemption list is currently empty. The builder's own labels are not in the language catalogue.",
                    articleId: "regex-builder-surfaces",
                    reading: [{ label: "docs/regex-builder.md", href: REGEX_BUILDER_DOC_URL }],
                },
                {
                    title: "Three languages, and a tone slider for two of them",
                    body: "English, playful Hong Kong Cantonese and a bilingual mode, with an independent funny level per language from fully professional to maximum playfulness. The level styles every message including errors, and a test proves that no level stops naming the file, the path or the count.",
                    status: "shipped",
                    statusNote:
                        "The store, both sliders, the settings row and the catalogue are on the default branch with five test files in CI. The catalogue answers roughly a hundred keys today; every other key still renders its English fallback, which the article states plainly.",
                    articleId: "language-and-tone",
                    reading: [
                        { label: "docs/language-and-tone.md", href: LANGUAGE_AND_TONE_DOC_URL },
                    ],
                },
                {
                    title: "A different realistic image for each high-impact action",
                    body: "Cloud setup, local speed, restart-to-install, repository backup publication and destructive config review each show a different bundled image whose subject matches that operation. The pictures explain; the real controls still do the work.",
                    status: "shipped",
                    statusNote:
                        "Five local PNGs are wired to five exact owners. A hand-written inventory rejects missing or reused files, empty alternative text and owner drift; 143 focused tests and the production workspace build passed. A packaged runtime capture is not claimed by this phase.",
                    articleId: "action-artwork",
                    reading: [{ label: "docs/action-artwork.md", href: ACTION_ARTWORK_DOC_URL }],
                },
            ],
        },
        {
            id: "engine",
            title: "The engine underneath",
            lede: "The parts of BlueMap that were ported rather than driven: reading a world, and resolving what its blocks look like.",
            features: [
                {
                    title: "Read any world from 1.12.2 onward",
                    body: "NBT, five compression codecs, region files in three container formats, and chunk decoders selected by the world's own version, including the flattening boundary and the block-id mapping that predates it.",
                    status: "shipped",
                    statusNote:
                        "Proved by tests that build synthetic 1.18 and 1.12.2 worlds byte by byte and assert exact decoding, including legacy fence-connection reconstruction. They run in CI on every push.",
                    articleId: "world-reading",
                },
                {
                    title: "Write a pre-flattening world, then prove it renders",
                    body: "The generator can also write 1.12.2: numeric block ids, metadata nibbles, a flat biome array and a bedrock floor at y zero. The same seed produces the same blocks in both formats, so the modern world is a control, and diffing two renders of it isolates how the world was read rather than what was generated.",
                    status: "shipped",
                    statusNote:
                        "The writer is on the default branch and 13 tests read a generated world back through this project's own reader in CI. Upstream has no pre-flattening chunk loader, so there is no Java oracle for this era and no byte-exact gate; the render harness compares against the control and says that is a weaker claim.",
                    articleId: "legacy-world-support",
                    reading: [{ label: "docs/legacy-1-12-worlds.md", href: LEGACY_WORLDS_DOC_URL }],
                },
                {
                    title: "Resource packs, atlases and textures",
                    body: "Directories and zips are mounted as one virtual file system, overlays are applied in reverse order, block states resolve to models to parent chains to textures, and the texture gallery is written out for the viewer.",
                    status: "shipped",
                    statusNote:
                        "Every file is ported and unit tested, and all three phase exit criteria have run (issue #31, closed): textures.json parity passes for vanilla and a modded pack, live end-to-end resolution passes, and a real 1.12.2 jar ran the legacy path, surfacing and fixing a real defect (issue #46) along the way.",
                    articleId: "resource-packs",
                },
            ],
        },
        {
            id: "delivery",
            title: "Build and delivery",
            lede: "What happens on a push, and how anything too large to be a single download is shipped anyway.",
            features: [
                {
                    title: "Releases that carry their own evidence",
                    body: "Every passing push publishes a uniquely tagged release with a real Windows installer. CI counts the project's lines at the tagged commit, attributes them per surviving line rather than by summing a changelog, and publishes that table beside the installer.",
                    status: "shipped",
                    statusNote:
                        "Running on every push to the default branch. A failed test publishes no release.",
                    articleId: "release-pipeline",
                },
                {
                    title: "Downloads larger than a release asset allows",
                    body: "A release asset is capped at two gigabytes and a rendered world is tens of them, so anything over the cap is published as fixed-size parts beside a manifest carrying a checksum for every part and for the whole file. The application rejoins them on download, and one command does it by hand.",
                    status: "shipped",
                    statusNote:
                        "The splitter, the joiner and the manifest format are built and unit tested, and everything in them streams rather than holding an archive in memory.",
                    articleId: "release-pipeline",
                    reading: [{ label: "docs/large-worlds.md", href: LARGE_WORLDS_DOC_URL }],
                },
                {
                    title: "Screenshots taken from the real application",
                    body: "A Playwright harness drives the packaged application at every supported window size, display scale and colour scheme, over a world CI generated and rendered in the same run. It fails the job if the application reaches the public internet while capturing.",
                    status: "shipped",
                    statusNote:
                        "Running in CI, and its output is what this page and the screenshots page show. When a capture shows a broken window, it is published rather than hidden.",
                    articleId: "screenshot-gallery",
                },
                {
                    title: "Seven upstream builds, compiled from source",
                    body: "The command line renderer and the six Minecraft server plugins are built unmodified from the vendored upstream source in CI, so the engine the application drives is one this repository produced rather than a binary downloaded from somewhere.",
                    status: "shipped",
                    statusNote:
                        "The reusable workflow is on the default branch and runs as CI's jars job on every push, confirmed green alongside the real render test-world does (run 31042450590). The command line renderer has been built and driven by hand, and now also through the app's own orchestrator - see the java-render-path article. What remains unverified is a different, larger claim this card does not make: no server plugin (fabric, forge, neoforge, paper, spigot, sponge) has been loaded by a real Minecraft server.",
                    articleId: "java-render-path",
                    reading: [
                        {
                            label: ".github/workflows/build-jars.yml",
                            href: BUILD_JARS_WORKFLOW_URL,
                        },
                    ],
                },
            ],
        },
    ],

    /* ---------------------------------------------------------------------- */
    /* Not built                                                              */
    /* ---------------------------------------------------------------------- */

    notYetSection: {
        title: "What is not built yet",
        lede: "This list is the reason the page above can be trusted. It is kept as carefully as the one before it.",
    },

    notYet: [
        "Rendering a local world in TypeScript by default. The mesher is written and unit tested, and the parity gate against the Java engine has closed: byte-identical hires tiles and pixel-identical lowres tiles on every fixture world. Passing that gate did not itself switch the product over; the Java engine stays the standing default until that separate switch decision is made and verified on its own (decision D17's 2026-08-05 amendment).",
        "The standalone headless server, its full HTTP routes and event stream, and its Docker image.",
        "The Docker hosting GUI for managing BlueMap server containers.",
        "SQL storages, the marker editor, the JavaScript addon system, static export and the three.js upgrade. The options editor models an SQL storage and writes one, and its connection test says plainly that this build carries no database client to open a connection with rather than reporting a success nobody observed.",
        "Spending the signed-in GitHub account against real GitHub. The account now reaches two things rather than nothing: the download path asks the session first and falls back to a token in the environment, and a backup runs under it. Neither has been exercised against github.com from a packaged build, so every one of those calls is proved against a stand-in.",
        "Live players read from local player data or RCON, measurement and waypoint tools, the screenshot gallery inside the app, scheduled renders, the multi-server dashboard and the update checker.",
        "The five cross-cutting product contracts, as contracts. All five now have substantial working machinery in the application, and each is listed as a shipped feature above with its own article. None of the five is met as written, and the remaining clause is named in each case: the regex builder's own surface is not localised, tabs cannot be decorated per tab or per group, appearance reaches four elements rather than every one, the language catalogue answers roughly a hundred keys, and two destructive call sites are declared as gaps rather than gated. A contract with an unmet clause is a pending contract, so all five stay here.",
        "macOS and Linux packaging. Windows is the only platform with an installer, and the installers are not code signed.",
    ],

    /* ---------------------------------------------------------------------- */
    /* Phases                                                                 */
    /* ---------------------------------------------------------------------- */

    phasesSection: {
        title: "Phase status",
        lede: "The port is planned in phases, and this table is a mirror of the roadmap rather than a summary written from memory.",
    },

    phases: [
        {
            phase: "0",
            scope: "Plan, submodules including the legacy 1.12 tag, monorepo scaffold, CI",
            status: "done",
        },
        {
            phase: "A",
            scope: "Viewer port, Material Design 3 shell, Electron shell, embedded server and remote proxy",
            status: "done",
        },
        {
            phase: "B",
            scope: "Shared utilities, NBT, compression, region and chunk parsing including legacy 1.12",
            status: "done",
        },
        {
            phase: "C",
            scope: "Resource-pack pipeline: virtual file system, block states, models, atlases, textures, legacy compatibility, the Mojang downloader",
            status: "done",
            note: "All three exit criteria have run (issue #31, closed): textures.json parity passes for vanilla (1723 of 1723) and for a modded pack (1725 of 1725, pixel-verified on both engines); live end-to-end resolution passes; a real 1.12.2 jar ran through the legacy path, and the era-matched render defect it surfaced is fixed and closed (issue #46).",
        },
        {
            phase: "J",
            scope: "The Java render path: toolchain discovery and provisioning, jar resolution, config writer, renderer runner, progress parser, provenance record, local map serving",
            status: "in-progress",
            note: "Built and unit tested, and driven end to end by hand on one Windows machine. Numbered out of the alphabet because the original plan had no Java in it.",
        },
        {
            phase: "D",
            scope: "Hires mesher, byte-exact tile writer, lowres level-of-detail cascade, render state, file storage, masks",
            status: "done",
            note: "The gate is closed: a generated 1000x1000 world rendered identically on both engines, 961 of 961 hires tiles byte for byte and 24 of 24 lowres tiles pixel for pixel, with a second fixture on a different seed reporting the same. Passing the gate did not itself switch the product over; D17's amendment keeps the Java engine as the standing default until that switch is separately made and verified.",
        },
        {
            phase: "E",
            scope: "Render manager worker pool, watch re-render, full HTTP routes and server-sent events, config schema, standalone server CLI and Dockerfile",
            status: "pending",
            note: "The config schema half landed early, out of order, in its own package.",
        },
        {
            phase: "F",
            scope: "Full options GUI: every setting, the map wizard, storage editors, config import",
            status: "in-progress",
            note: "Unblocked early by the Java render path, because it writes BlueMap's own configuration and invokes the renderer rather than needing the TypeScript render manager. The editor now opens from the application and edits a real folder, and the exit check against the upstream Java server has now run: a config edited by hand through a packaged build and saved into a folder the real Java CLI generated was loaded by that same CLI and read back correctly. It has not yet run as a standing part of CI.",
        },
        {
            phase: "G",
            scope: "Docker hosting GUI for managing BlueMap server containers",
            status: "pending",
        },
        {
            phase: "H",
            scope: "SQL storages, command palette, marker editor, JavaScript addon system, static export, three.js upgrade",
            status: "pending",
            note: "SQL storages landed early, out of order: ported and proven against real MySQL, MariaDB and PostgreSQL servers, and now proven cross-compatible with the Java engine over a shared database, both directions (issue #32, closed). The command palette landed early too, out of order, alongside the contract work that gave it settings to list. Marker editor, the JavaScript addon system, static export and the three.js upgrade remain untouched.",
        },
        {
            phase: "I",
            scope: "Local live players, measurement and waypoints, screenshot gallery, scheduled renders, multi-server dashboard, update checker, packaging",
            status: "pending",
            note: "The update checker landed early, out of order: it checks the unsigned Squirrel feed on startup and on a bounded schedule, verifies its advertised package hash without claiming publisher authenticity, and shows the persistent restart banner. Local live players, measurement and waypoints, the screenshot gallery, scheduled renders, the multi-server dashboard and packaging remain untouched.",
        },
        {
            phase: "Contracts",
            scope: "The five cross-cutting product contracts",
            status: "in-progress",
            note: "All five now have working machinery in the application as well as on this site: the tab strip, the anchored regex builder with a guard keeping it on every search bar, the appearance editor with its colour and typography pickers, the two-key gate with its inventory of destructive call sites, and the three language modes with both funny levels. Each still has one named clause unmet, so none of the five is met as written.",
        },
    ],

    phaseNote: [
        "This table mirrors ",
        { link: "design/ROADMAP.md", href: ROADMAP_URL, external: true },
        ", which is the source of truth. ",
        { link: "plan.md", href: PLAN_URL, external: true },
        " has the full port plan, ",
        { link: "design/docs/decisions.md", href: DECISIONS_URL, external: true },
        " records the decisions that reordered it, and ",
        { link: "design/HANDOFF.md", href: HANDOFF_URL, external: true },
        " records the current working state. Open defects and feature work are tracked in the ",
        { link: "issue tracker", href: ISSUES_URL, external: true },
        ".",
    ],

    /* ---------------------------------------------------------------------- */
    /* Build                                                                  */
    /* ---------------------------------------------------------------------- */

    buildSection: {
        title: "Build it yourself",
        lede: "Everything needed to reproduce what is described above, from a clone.",
    },

    buildIt: [
        {
            kind: "paragraph",
            content: [
                "Building from source needs Node 22 or newer and pnpm 10. The upstream Java reference is a ",
                "git submodule and the port reads it directly, so initialise submodules before building. It ",
                "is also a build input now rather than only a reading reference: the renderer that renders ",
                "a local world is compiled from it.",
            ],
        },
        {
            kind: "code",
            language: "sh",
            caption: "Clone, install and verify",
            code: [
                "git clone https://github.com/Ding-Ding-Projects/material-bluemap.git",
                "cd material-bluemap",
                "git submodule update --init --recursive",
                "",
                "cd design",
                "pnpm install",
                "pnpm build",
                "pnpm test",
                "pnpm lint",
            ].join("\n"),
        },
        {
            kind: "paragraph",
            content: [
                "Everything except the plan and repository metadata lives under ",
                { code: "design/" },
                ", a pnpm workspace. The full source is on ",
                { link: "GitHub", href: REPO_URL, external: true },
                " under the MIT licence.",
            ],
        },
    ],

    /* ---------------------------------------------------------------------- */
    /* Further reading                                                        */
    /* ---------------------------------------------------------------------- */

    readingSection: {
        title: "Where to read next",
        lede: "The long-form documents in the repository. The articles on this site summarise them and link out rather than copying them, because two copies of one explanation drift apart.",
    },

    furtherReading: [
        { label: "Every feature document, indexed", href: DOCS_INDEX_URL },
        { label: "Browser-style tabbed navigation", href: TABBED_NAVIGATION_DOC_URL },
        { label: "The command palette", href: COMMAND_PALETTE_DOC_URL },
        { label: "The notification centre", href: NOTIFICATION_CENTRE_DOC_URL },
        { label: "The changelog and its in-app viewer", href: CHANGELOG_VIEWER_DOC_URL },
        { label: "Appearance editors, colour and typography", href: APPEARANCE_EDITORS_DOC_URL },
        { label: "Super confirmation for destructive actions", href: SUPER_CONFIRMATION_DOC_URL },
        { label: "Language modes and funny levels", href: LANGUAGE_AND_TONE_DOC_URL },
        { label: "Action-specific realistic artwork", href: ACTION_ARTWORK_DOC_URL },
        { label: "The regex builder and the search bars it reaches", href: REGEX_BUILDER_DOC_URL },
        { label: "Writing and rendering 1.12.2 worlds", href: LEGACY_WORLDS_DOC_URL },
        { label: "Local version history for a config folder", href: CONFIG_HISTORY_DOC_URL },
        { label: "Backing up a world or a rendered map", href: BACKUP_DOC_URL },
        { label: "Rendering a world in GitHub Actions", href: RENDER_IN_ACTIONS_DOC_URL },
        { label: "Rendering that survives being interrupted", href: RESUMABLE_RENDERS_DOC_URL },
        { label: "Large worlds and rendered maps", href: LARGE_WORLDS_DOC_URL },
        {
            label: "Rendering a world that lives in a private repository",
            href: PRIVATE_WORLD_DOC_URL,
        },
        { label: "The port plan", href: PLAN_URL },
        { label: "The roadmap", href: ROADMAP_URL },
        {
            label: "Decisions, including the two that changed which engine renders",
            href: DECISIONS_URL,
        },
        { label: "Deviations from upstream", href: DEVIATIONS_URL },
        { label: "Porting conventions", href: CONVENTIONS_URL },
        { label: "The five product contracts", href: CONTRACTS_URL },
        { label: "Upstream BlueMap", href: UPSTREAM_URL },
        { label: "The repository itself", href: REPO_URL },
        { label: "Open issues and feature work", href: ISSUES_URL },
    ],
};
