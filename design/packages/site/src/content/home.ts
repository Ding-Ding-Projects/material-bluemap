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
    BUILD_JARS_WORKFLOW_URL,
    CONTRACTS_URL,
    CONVENTIONS_URL,
    DECISIONS_URL,
    DEVIATIONS_URL,
    HANDOFF_URL,
    ISSUES_URL,
    LARGE_WORLDS_DOC_URL,
    PLAN_URL,
    PRIVATE_WORLD_DOC_URL,
    RENDER_IN_ACTIONS_DOC_URL,
    RENDER_PRIVATE_WORKFLOW_URL,
    RENDER_WORLD_WORKFLOW_URL,
    REPO_URL,
    RESUMABLE_RENDERS_DOC_URL,
    ROADMAP_URL,
    UPSTREAM_URL,
    issue,
} from "./links.js";

export const home: HomeContent = {
    title: "material-bluemap",
    tagline: "A from-scratch TypeScript port of BlueMap, the Minecraft world renderer and 3D web map.",
    summary:
        "Render a Minecraft world into a 3D map from a desktop application, or from a GitHub Actions run with nothing installed at all, and browse it in an interface rebuilt from the ground up in Material Design 3.",

    intro: [
        {
            kind: "paragraph",
            content: [
                { link: "BlueMap", href: UPSTREAM_URL, external: true },
                " renders a Minecraft world into 3D map tiles and serves them to a browser. ",
                "material-bluemap ports that renderer from Java to TypeScript, and builds two things on ",
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
                "level-of-detail cascade and the masks are written and unit tested. It takes over only when ",
                "its decompressed tile bytes are identical to the Java engine's and its lowres images match ",
                "pixel for pixel on every fixture world. That comparison has not run. Nothing switches ",
                "silently, and the application says which engine produced a map. The handover and its ",
                "gate are described in the same article the card beside this one opens.",
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
        "The first is the application after a real Windows install, over a live map, with all four kinds of marker drawing. The three below it come from the capture harness, which drives the packaged application with Playwright at each window size and display scale the interface is checked against. In those three the map surface fills the window, so what they show is the geometry rather than the controls: the controls are what the first capture shows. Every capture, including both colour schemes, is on the screenshots page.",
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
            lede: "Three routes to a map: your own machine, GitHub's runners, or a generated world when you have no Minecraft installation to hand.",
            features: [
                {
                    title: "Render a world on your own machine",
                    body: "Point the application at a world folder and it renders it: the JVM found or installed for you, the configuration written, the renderer's progress read line by line, and the finished map opened in the viewer without leaving the app.",
                    status: "ported-unverified",
                    statusNote:
                        "Built and unit tested, and one 961-tile render was produced by hand on one Windows machine. It has not run in CI, on macOS or on Linux, and that render was driven by invoking the renderer directly rather than through the app.",
                    articleId: "java-render-path",
                    reading: [{ label: "design/docs/decisions.md", href: DECISIONS_URL }],
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
                        { label: ".github/workflows/render-world.yml", href: RENDER_WORLD_WORKFLOW_URL },
                    ],
                },
                {
                    title: "Worlds too large for one job",
                    body: "A world one job cannot finish is split across a matrix and merged back. Cuts land on the tile grid rather than on region boundaries, the merge ranks terrain above the transparent black that a neighbouring shard writes over it, and more shards than one matrix can hold become sequential waves rather than a truncated plan.",
                    status: "shipped",
                    statusNote:
                        "Proved against an unsharded render of the same world: 961 of 961 hires tiles byte-identical, and zero differences across 6,024,024 lowres pixels, for both a two-shard and a four-shard split. One world, one machine.",
                    articleId: "render-in-actions",
                    reading: [{ label: "docs/render-in-actions.md", href: RENDER_IN_ACTIONS_DOC_URL }],
                },
                {
                    title: "Renders that survive being interrupted",
                    body: "A render of a large world takes hours, and in that time a machine sleeps, an application is closed and a job hits its ceiling. Every shard caches its own render state and writes a completion marker once its output is whole, so a resumed run skips what finished and redoes only what was cut off.",
                    status: "shipped",
                    statusNote:
                        "The cache keys, the completion markers and the wave batching are built and unit tested in CI. The desktop half of the same idea is documented alongside it.",
                    articleId: "render-in-actions",
                    reading: [{ label: "docs/resumable-renders.md", href: RESUMABLE_RENDERS_DOC_URL }],
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
                        { label: ".github/workflows/render-private-world.yml", href: RENDER_PRIVATE_WORKFLOW_URL },
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
                    body: "The options surface reads and writes BlueMap's own configuration format rather than a parallel one of its own, so a file the application wrote is a file upstream's renderer reads.",
                    status: "ported-unverified",
                    statusNote:
                        "The configuration schema and the editing surface are built and tested. The phase is in progress and out of order: it was unblocked early because it never needed the TypeScript render manager.",
                    articleId: "options-gui",
                },
                {
                    title: "A localhost server nothing else can reach",
                    body: "The embedded server binds the loopback address on an ephemeral port and refuses every request that does not carry the token minted for that launch, so another process on the same machine cannot read your map.",
                    status: "shipped",
                    statusNote: "Built and tested, including the refusal paths, and running in every launch of the app.",
                    articleId: "embedded-server",
                },
                {
                    title: "An Electron shell that assumes the worst",
                    body: "Sandbox on, node integration off, context isolation on, a Content-Security-Policy without unsafe-eval, and navigation locked to the embedded server's own origin. A remote map server is treated as a stranger, because that is what it is.",
                    status: "shipped",
                    statusNote: "Built and tested, and the policy is asserted rather than assumed to have been configured.",
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
                    title: "Resource packs, atlases and textures",
                    body: "Directories and zips are mounted as one virtual file system, overlays are applied in reverse order, block states resolve to models to parent chains to textures, and the texture gallery is written out for the viewer.",
                    status: "ported-unverified",
                    statusNote:
                        "Every file is ported and unit tested. The three exit criteria have not run, so ported is the honest word and done is not: they are listed in the roadmap.",
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
                    statusNote: "Running on every push to the default branch. A failed test publishes no release.",
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
                    status: "ported-unverified",
                    statusNote:
                        "The reusable workflow is on the default branch and only the command line renderer has been built by hand on a developer machine. No server plugin has been loaded by a real Minecraft server, and this page does not claim a green run of that workflow.",
                    articleId: "java-render-path",
                    reading: [{ label: ".github/workflows/build-jars.yml", href: BUILD_JARS_WORKFLOW_URL }],
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
        "Rendering a local world in TypeScript. The mesher is written and unit tested, and the parity comparison that would let it take over has not run.",
        "The standalone headless server, its full HTTP routes and event stream, and its Docker image.",
        "The Docker hosting GUI for managing BlueMap server containers.",
        "SQL storages, the marker editor, the JavaScript addon system, static export and the three.js upgrade.",
        "Live players read from local player data or RCON, measurement and waypoint tools, the screenshot gallery inside the app, scheduled renders, the multi-server dashboard and the update checker.",
        "Four of the five cross-cutting product contracts. The tab system and the regex builder are running on this site; the per-element appearance editors, the language modes with their funny-level sliders and the super-confirmation gate land with the phases that give them surfaces to apply to.",
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
            status: "in-progress",
            note: "Every file is ported and unit tested. The phase exit criteria have not run, so the honest word is ported, not done.",
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
            status: "in-progress",
            note: "Written and unit tested. It no longer blocks the product; it is now the handover gate, and the parity comparison against the Java engine has not run.",
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
            note: "Unblocked early by the Java render path, because it writes BlueMap's own configuration and invokes the renderer rather than needing the TypeScript render manager.",
        },
        { phase: "G", scope: "Docker hosting GUI for managing BlueMap server containers", status: "pending" },
        {
            phase: "H",
            scope: "SQL storages, command palette, marker editor, JavaScript addon system, static export, three.js upgrade",
            status: "pending",
        },
        {
            phase: "I",
            scope: "Local live players, measurement and waypoints, screenshot gallery, scheduled renders, multi-server dashboard, update checker, packaging",
            status: "pending",
        },
        {
            phase: "Contracts",
            scope: "The five cross-cutting product contracts",
            status: "in-progress",
            note: "The tab system and the regex builder are running on this site. The remaining three land alongside the phases that give them surfaces.",
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
        { label: "Rendering a world in GitHub Actions", href: RENDER_IN_ACTIONS_DOC_URL },
        { label: "Rendering that survives being interrupted", href: RESUMABLE_RENDERS_DOC_URL },
        { label: "Large worlds and rendered maps", href: LARGE_WORLDS_DOC_URL },
        { label: "Rendering a world that lives in a private repository", href: PRIVATE_WORLD_DOC_URL },
        { label: "The port plan", href: PLAN_URL },
        { label: "The roadmap", href: ROADMAP_URL },
        { label: "Decisions, including the two that changed which engine renders", href: DECISIONS_URL },
        { label: "Deviations from upstream", href: DEVIATIONS_URL },
        { label: "Porting conventions", href: CONVENTIONS_URL },
        { label: "The five product contracts", href: CONTRACTS_URL },
        { label: "Upstream BlueMap", href: UPSTREAM_URL },
        { label: "The repository itself", href: REPO_URL },
        { label: "Open issues and feature work", href: ISSUES_URL },
    ],
};
