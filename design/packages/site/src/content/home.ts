/**
 * Landing page copy.
 *
 * The rule this file is written under: say what exists, say what does not, and never
 * let a sentence read as though an unbuilt thing were shipped. The phase table below
 * mirrors `design/ROADMAP.md`, which is the source of truth. When the roadmap moves,
 * this moves in the same task.
 */

import type { HomeContent } from "./types.js";
import { REPO_URL, ROADMAP_URL, PLAN_URL, HANDOFF_URL, ISSUES_URL } from "./links.js";

export const home: HomeContent = {
    title: "material-bluemap",
    tagline: "A from-scratch TypeScript port of BlueMap, the Minecraft world renderer and 3D web map.",

    intro: [
        {
            kind: "paragraph",
            content: [
                "BlueMap renders a Minecraft world into 3D map tiles and serves them to a browser. ",
                "material-bluemap ports that renderer from Java to TypeScript, with no JVM and no Java ",
                "sidecar, and builds two things on top of it: a Material Design 3 desktop app built on ",
                "Electron, and a headless server that renders and serves the same map to an ordinary browser.",
            ],
        },
        {
            kind: "paragraph",
            content: [
                "Target world versions are Minecraft ",
                { strong: "1.12.2 through 26.x" },
                ". Support for 1.12.2 is combined back in from upstream tag ",
                { code: "v0.10.3-mc1.12" },
                ", the last upstream release that carried it.",
            ],
        },
        {
            kind: "callout",
            tone: "warning",
            title: "Rendering a local world does not work yet",
            content: [
                "The engine can read a Minecraft world and the app can browse a remote BlueMap server, ",
                "but nothing turns world data into map tiles yet. The mesher, the tile writer and the ",
                "render manager are Phases D and E and have not been built. Anyone installing this today ",
                "gets a viewer for someone else's BlueMap server, not a renderer for their own world.",
            ],
        },
    ],

    worksToday: [
        "The viewer: all 65 files of the upstream BlueMap webapp ported to strict TypeScript, including controls, markers, the skybox and the tile loader.",
        "Remote mode: the desktop app connects to a BlueMap server over the network and browses its maps, through a reverse proxy that streams live-player updates.",
        "The embedded HTTP server: a localhost-only server, gated by a token generated fresh on every launch, serving the UI bundle and proxying remote profiles.",
        "The world reading layer: NBT, five compression codecs, region files in three container formats, and chunk decoders covering 1.12.2 through 26.x.",
        "The Electron security posture: sandboxed renderer, context isolation, a Content-Security-Policy without unsafe-eval, and a navigation lock.",
        "The delivery pipeline: every push to the default branch that passes lint, build and tests publishes a uniquely tagged release with a real Windows installer.",
    ],

    notYet: [
        "Rendering a local world. There is no mesher, no PRBM tile writer, no level-of-detail cascade and no render manager yet.",
        "The standalone headless server and its Docker image.",
        "The options GUI, so every BlueMap setting is still edited as configuration rather than in the app.",
        "The Docker hosting GUI for managing BlueMap server containers.",
        "The five product contracts: the regex builder, the tab system, per-element appearance editors, the language modes with their funny-level sliders, and the super-confirmation gate.",
        "Live players read from local playerdata or RCON, measurement and waypoint tools, the screenshot gallery, scheduled renders and the update checker.",
    ],

    highlights: [
        {
            title: "Browse a remote BlueMap server",
            body: "Add a server profile and the app proxies it through the embedded localhost server, including the server-sent-events stream that carries live player positions.",
            articleId: "viewer-remote-mode",
        },
        {
            title: "Read any world from 1.12.2 onward",
            body: "Region files, chunk sections, block states, biomes and light, decoded by a version-dispatched decoder matrix and proved against synthetic worlds built byte by byte.",
            articleId: "world-reading",
        },
        {
            title: "A localhost server nothing else can reach",
            body: "The embedded server binds 127.0.0.1 on an ephemeral port and refuses every request that does not carry the token minted for that launch.",
            articleId: "embedded-server",
        },
        {
            title: "Resource packs, atlases and textures",
            body: "The pack pipeline reads directories and zips, applies overlays in reverse order, resolves block states to models to textures, and writes the texture gallery.",
            articleId: "resource-packs",
        },
        {
            title: "A hardened Electron shell",
            body: "Sandbox on, node integration off, context isolation on, a strict Content-Security-Policy, and navigation locked to the embedded server's own origin.",
            articleId: "electron-security",
        },
        {
            title: "Releases that carry their own evidence",
            body: "CI counts the project's lines at the tagged commit, attributes them per surviving line, and publishes that table with the installer.",
            articleId: "release-pipeline",
        },
    ],

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
            phase: "D",
            scope: "Hires mesher, byte-exact PRBM writer, lowres level-of-detail cascade, render state, file storage, masks",
            status: "pending",
        },
        {
            phase: "E",
            scope: "Render manager worker pool, watch re-render, full HTTP routes and server-sent events, config schema, standalone server CLI and Dockerfile",
            status: "pending",
        },
        {
            phase: "F",
            scope: "Full options GUI: every setting, the map wizard, storage editors, config import",
            status: "pending",
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
            status: "pending",
            note: "Scheduled to land alongside Phases F through I, once there are surfaces for them to apply to.",
        },
    ],

    phaseNote: [
        "This table mirrors ",
        { link: "design/ROADMAP.md", href: ROADMAP_URL, external: true },
        ", which is the source of truth. ",
        { link: "plan.md", href: PLAN_URL, external: true },
        " has the full port plan and ",
        { link: "design/HANDOFF.md", href: HANDOFF_URL, external: true },
        " records the current working state. Open defects and feature work are tracked in the ",
        { link: "issue tracker", href: ISSUES_URL, external: true },
        ".",
    ],

    buildIt: [
        {
            kind: "paragraph",
            content: [
                "Building from source needs Node 22 or newer and pnpm 10. The upstream Java reference is a ",
                "git submodule and the port reads it directly, so initialise submodules before building.",
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
};
