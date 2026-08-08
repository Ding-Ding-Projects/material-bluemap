import type { Article } from "../types.js";
import { issue, repoFile } from "../links.js";

export const startupRecovery: Article = {
    id: "startup-recovery",
    title: "The app opens anyway: startup recovery and the Worldlens mark",
    summary:
        "A normal shell that survives optional startup failures, an isolated no-preload recovery window for hard data and security boundaries, cached diagnostics that remain copyable and exportable, and one reproducible logo from source PNG to Windows ICO.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "Implemented and covered by focused source, model, store, IPC and mounted-interface tests on codex/phase-app-resilience-logo. A packaged off-screen recovery capture, exact branch CI and default-branch integration remain required before this article may call the feature shipped.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Worldlens creates its window before optional features initialize. Configuration, dependency discovery, update setup, network features and ordinary initialization each run behind a failure boundary. A failed feature stays unavailable and enters a persistent banner plus notification history; independent features and the rest of the shell continue.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A profile migration collision, preload failure, main-frame load failure, renderer loss, app-ready rejection or uncaught startup exception cannot safely use that ordinary shell. Worldlens retires it and opens a smaller Material recovery window with working window controls, Restart and retry, Copy details, Export JSON and Export Markdown. It is a real usable surface, not a native error followed by process exit.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Diagnostics append as JSONL below the separate Worldlens Recovery application-data folder, outside both profiles involved in migration.",
                        "Copy and export include the complete bounded history rather than only the newest message.",
                        "Launch, retry, export and mounted recovery actions refuse re-entry while one operation is already in flight.",
                        "The same generated Worldlens logo reaches the app title bar, About surface, recovery shell, installer resources, README and this site's brand button and favicon.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Recovery cannot be disabled. Diagnostics stay local until Copy or Export is deliberately chosen. Exports are UTF-8 JSON or Markdown. The packaged test seam ",
                        { code: "--worldlens-startup-probe=<phase>" },
                        " only makes one named phase fail; it never relaxes isolation or bypasses a decision.",
                    ],
                },
                {
                    kind: "code",
                    language: "powershell",
                    code: "corepack pnpm --dir design --filter @worldlens/app brand:build\ncorepack pnpm --dir design --filter @worldlens/app brand:build -- --check",
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Profile migration cannot prove a safe cutover",
                            description:
                                "The ordinary writable shell stays closed, the old profile stays unchanged, and recovery names the collision or verification failure.",
                        },
                        {
                            term: "The preload fails",
                            description:
                                "Worldlens never answers by enabling Node or disabling isolation. The failed window is destroyed and the no-preload recovery renderer replaces it.",
                        },
                        {
                            term: "An optional feature throws",
                            description:
                                "That feature is recorded and disabled. The ordinary shell and unrelated features continue.",
                        },
                        {
                            term: "Diagnostics cannot be written",
                            description:
                                "The original failure remains in memory, recovery still opens, and the surface reports that durable caching failed.",
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
                        "Credential-shaped values are redacted before memory, disk, renderer, clipboard or export. No diagnostic is transmitted automatically.",
                        "The minimal renderer is sandboxed, has context isolation on, Node integration off and JavaScript off. Its CSP denies everything except its bundled data image and styling.",
                        "Recovery actions are static links in a private action namespace intercepted by the main process. The page receives no privileged object.",
                        "Windows resource editing applies the icon and version metadata while signing stays permanently disabled. It makes no publisher-authenticity claim.",
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
                        "The focused suite inventories every startup phase and covers all eight error categories, redaction, JSONL persistence, both exports, bridge registration, the exit-free policy, preload/renderer/process signals, recovery isolation, action wiring, single-flight behavior, the mounted banner and persistent notification history. The remaining phase gates are the real packaged probe on the cheap off-screen desktop and exact branch CI. Follow ",
                        { link: "issue 106", href: issue(106), external: true },
                        " for the evidence sequence.",
                    ],
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "worldlens-migration",
            reason: "The hard profile boundary recovery refuses to cross without a verified migration.",
        },
        {
            articleId: "electron-security",
            reason: "Why the recovery renderer never weakens the ordinary Electron security posture.",
        },
        {
            articleId: "notification-centre",
            reason: "Where optional startup failures remain reviewable after their banner is collapsed.",
        },
        {
            articleId: "desktop-shell-chrome",
            reason: "The title bar and window controls shared by the ordinary app and recovery experience.",
        },
    ],
    sources: [
        { label: "docs/startup-recovery.md", href: repoFile("docs/startup-recovery.md") },
        {
            label: "packages/app/src/main/startup",
            href: repoFile("design/packages/app/src/main/startup"),
        },
        {
            label: "packages/ui/src/components/startup",
            href: repoFile("design/packages/ui/src/components/startup"),
        },
        {
            label: "packages/app/scripts/build-brand-assets.mjs",
            href: repoFile("design/packages/app/scripts/build-brand-assets.mjs"),
        },
    ],
};
