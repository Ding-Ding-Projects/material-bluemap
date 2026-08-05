import type { Article } from "../types.js";
import { repoFile, issue, UPSTREAM_URL } from "../links.js";

export const viewerRemoteMode: Article = {
    id: "viewer-remote-mode",
    title: "The viewer and remote mode",
    summary:
        "The ported three.js map viewer, and the one thing the desktop app can do end to end today: browse a BlueMap server somebody else is running.",
    category: "application",
    status: "shipped",
    statusNote:
        "The viewer port and the remote proxy are on the default branch with tests, and remote mode was checked against a public BlueMap server. Rendering a local world is a separate feature that already exists, driven by upstream's own Java engine (decision D17, see the java-render-path article): a real render of that kind already runs in CI on every push, and the app's own orchestration of it - JVM discovery, the config writer, the runner and provenance - has separately been driven end to end by a real JVM through the exact production code the app wires in, not only invoked as java -jar from a shell script. That second proof is opt-in, run by hand rather than as a standing part of CI.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The viewer is a port of the BlueMap webapp: all 65 upstream JavaScript files rewritten ",
                        "in strict TypeScript, keeping the upstream file layout, class names and control flow. It ",
                        "owns the three.js scene, the hires and lowres tile managers, the map controls, the marker ",
                        "sets, the skybox and the popup handling. It is a library, not an application: the ",
                        { code: "ui" },
                        " package mounts it inside the Material Design 3 shell, and the shell decides which map ",
                        "to point it at.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Remote mode is how a map gets in front of it today. A remote profile is a name and the ",
                        "base URL of a BlueMap server. The desktop app hands its profiles to the main process, ",
                        "which registers them with the reverse proxy inside the embedded server. The viewer then ",
                        "loads that map from a local path under ",
                        { code: "/remote/{profile}" },
                        ", and every request is forwarded to the real server.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The proxy forwards more than static tiles. BlueMap streams live player positions over ",
                        "server-sent events, so the proxy streams responses rather than buffering them, and passes ",
                        "through 204 responses and ETag revalidation so the viewer's own caching still works.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Map tiles, textures, settings and marker files are proxied as ordinary responses.",
                        "The live-data endpoint is streamed, so player markers move while the connection stays open.",
                        "Conditional requests keep working: the proxy passes ETag and the matching 304 back unchanged.",
                        "Nothing is written to disk. Remote mode is a view onto a server, not a copy of it.",
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
                        "A profile is created in the app's profile manager. There is no configuration file for it, ",
                        "and there is no options GUI yet, so the profile manager is the whole surface.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "id",
                            description: [
                                "The path segment the proxy mounts the profile under. It becomes ",
                                { code: "/remote/{id}" },
                                " on the embedded server.",
                            ],
                        },
                        {
                            term: "name",
                            description: "The label shown in the app. It has no effect on routing.",
                        },
                        {
                            term: "baseUrl",
                            description: [
                                "The BlueMap server's public base URL, for example ",
                                { code: "https://bluecolored.de/bluemap" },
                                ". Everything under it is forwarded.",
                            ],
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Profiles are synced to the main process over a typed preload bridge whenever the list ",
                        "changes. Removing a profile in the app removes its mount from the proxy in the same call, ",
                        "so a deleted profile stops being reachable immediately rather than at the next restart.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "In development the same route exists without Electron: the UI package's Vite dev server ",
                        "proxies ",
                        { code: "/remote/demo" },
                        " to the public BlueMap demo, which is how the viewer is exercised in a browser.",
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
                            term: "The remote server is unreachable",
                            description:
                                "The proxy reports the upstream failure to the viewer, which shows an empty map rather than a rendered one. There is no retry policy and no offline cache yet.",
                        },
                        {
                            term: "The base URL points at something that is not BlueMap",
                            description:
                                "Requests succeed at the HTTP level and the viewer fails to parse the settings document. The result is a blank map, not an error dialog. Non-blocking notification handling is tracked as an open issue.",
                        },
                        {
                            term: "The profile id collides with an existing mount",
                            description:
                                "The later registration replaces the earlier one, because the proxy stores profiles by id. Two profiles with the same id are one mount.",
                        },
                        {
                            term: "The live-data stream drops",
                            description:
                                "Player markers stop updating and the rest of the map keeps working. The viewer reconnects on its own schedule, inherited from upstream.",
                        },
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Defects raised against the desktop shell",
                    content: [
                        "Two issues were raised against the window this viewer runs inside: ",
                        { link: "#15", href: issue(15), external: true },
                        ", a blank window caused by the embedded server refusing its own bundle, and ",
                        { link: "#5", href: issue(5), external: true },
                        ", the window chrome. The window is frameless now and draws its own Material title ",
                        "bar, which is captured in the repository, and the viewer's floating control bar ",
                        "starts below that bar rather than under it. Check the tracker for the current state ",
                        "of both rather than assuming either is resolved.",
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
                        "A remote BlueMap server is untrusted content. Its marker files carry HTML, and upstream ",
                        "puts that HTML straight into the page. This port does not.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            "Marker and popup HTML is passed through DOMPurify before it reaches ",
                            { code: "innerHTML" },
                            ". This is a deliberate difference from upstream and is recorded in the deviations log.",
                        ],
                        [
                            { code: "PopupMarker" },
                            " attaches event listeners instead of writing inline ",
                            { code: "onclick" },
                            " attributes, so the viewer works under a Content-Security-Policy with no ",
                            { code: "unsafe-inline" },
                            " script source.",
                        ],
                        "Remote content is injected only through the gated path the port added for it, so a remote server cannot decide to run arbitrary code in the shell.",
                        "The proxy is the only route to the network. The renderer never fetches a remote origin directly, which is what lets the shell keep a connect-src of self.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Proxying does not make a remote server trustworthy. It makes the traffic go through one ",
                        "place that can be audited, and it keeps the renderer's origin policy simple.",
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
                        "The viewer package carries 52 tests covering the ported modules, including the marker sanitisation and the main menu.",
                        "The remote proxy has tests for streaming responses, 204 passthrough and ETag revalidation.",
                        "Remote mode was checked by hand against the public BlueMap demo server during the phase that built it.",
                        "Lint, build and the full test suite run on every push and pull request in the CI workflow.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "What has not been verified",
                    content: [
                        "There is no automated end-to-end test that drives the packaged desktop app against a live ",
                        "BlueMap server. The screenshot harness captures the shell, not a rendered remote map.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "embedded-server",
            reason: "The proxy lives inside the embedded server, and its token gate is what keeps the local port private.",
        },
        {
            articleId: "electron-security",
            reason: "The renderer policy that makes proxying the only network route.",
        },
        {
            articleId: "world-reading",
            reason: "The other half of the story: reading a local world, which the local Java render path turns into tiles the viewer opens the same way it opens a remote server.",
        },
        {
            articleId: "contract-localization",
            reason: "The viewer's interface strings still need the three language modes and the funny-level sliders.",
        },
    ],

    sources: [
        { label: "packages/viewer/src", href: repoFile("design/packages/viewer/src") },
        { label: "packages/server/src/remote/RemoteProxy.ts", href: repoFile("design/packages/server/src/remote/RemoteProxy.ts") },
        { label: "packages/ui/src/components/ProfileManager.vue", href: repoFile("design/packages/ui/src/components/ProfileManager.vue") },
        { label: "Upstream BlueMap", href: UPSTREAM_URL },
    ],
};
