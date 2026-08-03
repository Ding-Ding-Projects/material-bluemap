import type { Article } from "../types.js";
import { repoFile, issue, SECURITY_POLICY_URL } from "../links.js";

export const electronSecurity: Article = {
    id: "electron-security",
    title: "The Electron security posture",
    summary:
        "Sandboxed renderer, no node integration, context isolation on, a Content-Security-Policy with no unsafe-eval, and navigation locked to the embedded server's own origin.",
    category: "application",
    status: "shipped",
    statusNote:
        "Every control described here is in the main process on the default branch. The window itself still has open defects, which are named in the failure modes below.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "An Electron app that renders untrusted content is a browser with the safety rails ",
                        "removed by default. This one turns them back on and then keeps going, because the ",
                        "content it renders comes from remote BlueMap servers nobody here controls.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Sandbox",
                            description:
                                "On. The renderer runs in the same sandbox a browser tab does, so a renderer compromise does not immediately mean code execution as the user.",
                        },
                        {
                            term: "Node integration",
                            description: "Off. The page has no require, no process and no file system.",
                        },
                        {
                            term: "Context isolation",
                            description:
                                "On. Preload script and page run in separate JavaScript worlds, so the page cannot reach into the bridge's internals or replace prototypes the preload depends on.",
                        },
                        {
                            term: "Preload bridge",
                            description:
                                "A small typed surface with three operations: sync remote profiles, write text to the clipboard, and read the app version. Every one validates its argument before acting.",
                        },
                        {
                            term: "Permission handler",
                            description:
                                "Every permission request is denied except pointer lock, which the free-flight camera controls need, and fullscreen, which the interface uses. Nothing asks for the camera, the microphone, geolocation or notifications, so nothing is granted them.",
                        },
                        {
                            term: "Navigation lock",
                            description:
                                "Navigating away from the embedded server's origin is cancelled. A window open request is denied, and an https URL is handed to the operating system's browser instead of opening a second Electron window.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The window loads from the embedded localhost server rather than from a file URL. That is a ",
                        "security decision as much as a plumbing one: a real origin means the Content-Security-",
                        "Policy applies the way it does on the web.",
                    ],
                },
                {
                    kind: "code",
                    language: "text",
                    caption: "The policy applied to the main frame",
                    code: [
                        "default-src 'self';",
                        "script-src 'self';",
                        "style-src 'self' 'unsafe-inline';",
                        "img-src 'self' data: blob:;",
                        "font-src 'self' data:;",
                        "connect-src 'self';",
                        "worker-src 'self' blob:;",
                        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
                    ].join("\n"),
                },
                {
                    kind: "paragraph",
                    content: [
                        "The one relaxation is ",
                        { code: "style-src 'unsafe-inline'" },
                        ", because the component library injects style elements at runtime. Scripts get no such ",
                        "exemption: there is no ",
                        { code: "unsafe-eval" },
                        " and no ",
                        { code: "unsafe-inline" },
                        " for script, which is why two separate defects have been fixed by removing runtime code ",
                        "generation rather than by loosening the policy.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Because ",
                        { code: "connect-src" },
                        " is ",
                        { code: "'self'" },
                        ", the renderer cannot reach a remote server directly. Everything goes through the proxy ",
                        "inside the embedded server, which is exactly the intended shape.",
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
                        "None of this is configurable, deliberately. There is no setting that turns off the ",
                        "sandbox, relaxes the policy or unlocks navigation, because a security control a user can ",
                        "switch off is a security control an attacker can talk them into switching off.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The only value that changes between launches is the embedded server's base URL, which ",
                        "includes the ephemeral port. The policy and the navigation lock are built from it at ",
                        "startup so they always match the server actually running.",
                    ],
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
                            term: "The renderer requests a subresource without the token",
                            description: [
                                "The embedded server answers 403 and the window stays blank. The session attaches ",
                                "the bearer header to every request bound for the server to prevent this. It is ",
                                "tracked as ",
                                { link: "#15", href: issue(15), external: true },
                                ", which is open.",
                            ],
                        },
                        {
                            term: "Something in the page tries to generate code at runtime",
                            description: [
                                "The policy refuses it and the interface renders blank rather than partially. This ",
                                "has happened twice, once from a locale parser that used eval and once from a ",
                                "message compiler, and both were fixed at the source. ",
                                { link: "#16", href: issue(16), external: true },
                                " has the detail.",
                            ],
                        },
                        {
                            term: "A remote map links somewhere else",
                            description:
                                "The navigation is cancelled. An https link opens in the operating system's browser, where it is somebody else's origin and somebody else's problem.",
                        },
                        {
                            term: "The UI bundle cannot be found",
                            description:
                                "Startup throws with the list of directories searched, rather than opening an empty window that looks like a rendering bug.",
                        },
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "The window chrome is not finished",
                    content: [
                        "The window is not frameless and has no custom Material title bar, so it still shows the ",
                        "operating system's own chrome. That is ",
                        { link: "#5", href: issue(5), external: true },
                        ", and it is open.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The threat this posture is built around is a hostile or compromised remote BlueMap server. ",
                        "It serves marker HTML, settings documents and images into a desktop application, and it is ",
                        "not under the user's control.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Marker HTML is sanitised before insertion, so a hostile server cannot inject script into the page in the first place.",
                        "If it somehow did, the policy would refuse to run it, because script-src is self with no inline and no eval.",
                        "If it somehow ran, context isolation and the sandbox mean it faces a three-method bridge rather than the file system.",
                        "If it tried to exfiltrate, connect-src of self means it cannot open a connection to anywhere except the local server it came through.",
                        "If it tried to navigate the user somewhere convincing, the navigation lock cancels it.",
                        "The local server it came through is itself token-gated, so nothing else on the machine can talk to it.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Layered controls are the point. Any single one of these can have a hole in it. The ",
                        "reporting route for one is the ",
                        { link: "security policy", href: SECURITY_POLICY_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The app was booted under a virtual framebuffer during the phase that built it, and the embedded server answered an unauthenticated request with 403.",
                        "The screenshot harness launches the real packaged entry point through Playwright's Electron driver on every CI run, and captures whatever state the window is in, including a broken one.",
                        "Two separate content-security-policy violations were found by that harness rather than by a user, because a blank window in a capture is unmissable.",
                        "Lint, build and tests run on every push in the CI workflow.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "What has not been verified",
                    content:
                        "There is no automated assertion that the policy header is present and correct, and no test that navigation to an external origin is cancelled. Both are behaviours a regression could remove silently, and both should be tests.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "embedded-server",
            reason: "The server this window is locked to, and the token gate the session has to satisfy.",
        },
        {
            articleId: "viewer-remote-mode",
            reason: "The untrusted content this posture exists for.",
        },
        {
            articleId: "screenshot-gallery",
            reason: "The harness that catches a blank window, which is how both policy defects were found.",
        },
    ],

    sources: [
        { label: "packages/app/src/main/index.ts", href: repoFile("design/packages/app/src/main/index.ts") },
        { label: "packages/app/src/preload/index.ts", href: repoFile("design/packages/app/src/preload/index.ts") },
        { label: "SECURITY.md", href: SECURITY_POLICY_URL },
    ],
};
