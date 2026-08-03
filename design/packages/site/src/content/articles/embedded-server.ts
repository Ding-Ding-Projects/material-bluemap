import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const embeddedServer: Article = {
    id: "embedded-server",
    title: "The embedded server and its token gate",
    summary:
        "A localhost-only HTTP server the desktop app starts for itself, which refuses every request that does not carry the token minted for that launch.",
    category: "application",
    status: "shipped",
    statusNote:
        "The server, the static handler, the reverse proxy and the token gate are on the default branch with tests. The full BlueMap route set and the config schema are Phase E and are not built.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The desktop app does not load its interface from the file system. It starts an HTTP ",
                        "server inside the main process and points the window at it. That gives the renderer a ",
                        "real origin, which is what makes a strict Content-Security-Policy and ordinary fetch ",
                        "semantics work, and it is the same server the standalone build will later expose.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "On startup the app generates 24 random bytes and keeps the hex string as the launch ",
                        "token. The server binds ",
                        { code: "127.0.0.1" },
                        " on port 0, so the operating system picks a free ephemeral port. Every request is ",
                        "checked against the token before any handler sees it.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            "A request carrying ",
                            { code: "Authorization: Bearer <token>" },
                            " is accepted.",
                        ],
                        [
                            "A request carrying ",
                            { code: "?token=<token>" },
                            " is accepted. This exists because ",
                            { code: "EventSource" },
                            " cannot set headers, and the live-data stream is an EventSource.",
                        ],
                        ["Anything else gets ", { code: "403 Forbidden" }, " with no body of interest."],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Two handlers are registered, in order. The reverse proxy claims anything under a ",
                        "registered remote profile mount. The static handler serves the built UI bundle for ",
                        "everything else. An unmatched path is a 404, and a handler that throws produces a 500 ",
                        "with the error logged in the main process rather than returned to the renderer.",
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
                            term: "host",
                            description: [
                                "Defaults to ",
                                { code: "127.0.0.1" },
                                ". The desktop app never overrides it. Binding anything else would put the app's ",
                                "interface on the network.",
                            ],
                        },
                        {
                            term: "port",
                            description: [
                                "Defaults to ",
                                { code: "0" },
                                ", meaning the operating system chooses. The chosen port is read back from the ",
                                "listening socket and used to build the window URL, so nothing has to guess it.",
                            ],
                        },
                        {
                            term: "authToken",
                            description:
                                "When set, the gate above applies. When unset, the server serves everyone who can reach it, which is why the desktop app always sets it.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "There is no configuration file. Upstream BlueMap's HOCON configuration and its full route ",
                        "set are ported in Phase E, along with the standalone server CLI. What exists today is the ",
                        "minimum the desktop app needs.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The token is per launch, not per install",
                    content:
                        "It is generated in memory when the app starts and never written to disk. Restarting the app invalidates every URL that carried the old one.",
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
                            term: "The UI bundle is missing",
                            description: [
                                "Startup throws with the list of directories it looked in. The app looks beside the ",
                                "package in development and under ",
                                { code: "resources/ui" },
                                " in a packaged build.",
                            ],
                        },
                        {
                            term: "A request arrives without the token",
                            description:
                                "It gets a 403. This is the correct behaviour for anything else on the machine, and it is also what happens to the app's own subresource requests unless the session attaches the header, which is the subject of an open issue.",
                        },
                        {
                            term: "The remote profile behind a proxy mount is gone",
                            description:
                                "The proxy no longer claims that path, so the static handler tries it and the request 404s.",
                        },
                        {
                            term: "A handler throws",
                            description:
                                "A 500 is written if the response has not started, the error is logged in the main process, and the renderer is told nothing more than that it failed.",
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
                    kind: "paragraph",
                    content: [
                        "A local HTTP server inside a desktop app is a real attack surface. Any process on the ",
                        "machine, and any web page the user has open, can send requests to a localhost port. The ",
                        "design assumes that and works from there.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Binding 127.0.0.1 keeps the server off every network interface, so nothing outside the machine can reach it at all.",
                        "An ephemeral port means the port number is not predictable between launches, which raises the cost of blind probing without being relied on as a control.",
                        "The token is the actual control. It is 24 bytes from the platform's cryptographic random source, checked on every request before any handler runs.",
                        "The token is never persisted, so it cannot leak from a file, a settings store or a crash dump written after the process ends.",
                        "The query-parameter form exists only because EventSource cannot set headers. It is the weaker of the two, because URLs end up in logs and in the DOM, which is why the desktop app attaches the header form for every request it can.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What the gate does not do",
                    content:
                        "It does not authenticate a user, and it does not protect against another process running as the same user, which can read the app's memory anyway. It protects against other origins and other users on a shared machine.",
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
                        "The server package has tests for the token gate in both forms, for handler ordering and for the 404 and 500 paths.",
                        "The proxy has tests for streamed responses, 204 passthrough and ETag revalidation.",
                        "The packaged app was booted under a virtual framebuffer during the phase that built it, and the server answered an unauthenticated request with 403.",
                        "Lint, build and tests run on every push in the CI workflow.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "What has not been verified",
                    content:
                        "There is no automated test that a second process on the same machine is refused, and no fuzzing of the request path. Both would be worth adding when the Phase E route set lands.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "electron-security",
            reason: "The renderer-side half: how the window is locked to this server's origin and given the token.",
        },
        {
            articleId: "viewer-remote-mode",
            reason: "What the reverse proxy handler in front of the static handler is actually for.",
        },
        {
            articleId: "contract-super-confirmation",
            reason: "The destructive actions the server will eventually expose are the ones that need a confirmation gate.",
        },
    ],

    sources: [
        { label: "packages/server/src/http/HttpServer.ts", href: repoFile("design/packages/server/src/http/HttpServer.ts") },
        { label: "packages/server/src/http/StaticHandler.ts", href: repoFile("design/packages/server/src/http/StaticHandler.ts") },
        { label: "packages/app/src/main/index.ts", href: repoFile("design/packages/app/src/main/index.ts") },
    ],
};
