import type { Article } from "../types.js";
import { ROADMAP_URL, issue, repoFile } from "../links.js";

export const desktopShellChrome: Article = {
    id: "desktop-shell-chrome",
    title: "The window's own chrome: title bar, notices and typefaces",
    summary:
        "A frameless window whose only chrome is the application's own Material title bar, one notification corner that outlives the screen that raised a message, and the two typefaces the whole interface is set in, bundled rather than fetched.",
    category: "application",
    status: "shipped",
    statusNote:
        "All three are on the default branch. The title bar is captured from the packaged application by the project's own harness and the images are committed to the repository; the window controls and the notice queue are covered by 29 tests running in CI. Nobody has clicked the three window buttons in an installed build, and no test asserts that the typefaces are bundled.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Three things surround everything else the application shows, and none of them belongs ",
                        "to a feature: the bar across the top, the corner where messages appear, and the ",
                        "typefaces all of it is set in. Each was, at some point, either absent or built and ",
                        "unreachable, and each is the kind of gap that makes a finished interface look unfinished.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "The window is frameless, and this is the whole of its chrome." },
                            " Electron is told to draw no frame, so the operating system's grey caption bar ",
                            "never appears as product chrome and Material Design goes all the way to the top ",
                            "edge. That buys the look and costs the three buttons the platform used to draw, so ",
                            "the bar carries its own minimise, maximise or restore, and close, beside the ",
                            "application's icon and title.",
                        ],
                        [
                            { strong: "The drag region is the bar, minus the buttons." },
                            " An element marked draggable moves the window instead of receiving events, so ",
                            "everything interactive in the bar has to opt back out, and anything that forgets ",
                            "becomes a control that can only be dragged. The buttons, and nothing else, are ",
                            "marked.",
                        ],
                        [
                            { strong: "In a browser build the bar renders nothing at all." },
                            " There is no window to minimise, and a close button on a web page that cannot ",
                            "close its own tab is exactly the decorative-looking control this project forbids. ",
                            "The bridge is all or nothing for the same reason: a title bar with a working ",
                            "minimise and a close button that throws is worse than one with no buttons.",
                        ],
                        [
                            { strong: "The bar publishes its own height to the document." },
                            " The viewer's map container is not part of the interface component tree at all, ",
                            "so no amount of scoped styling could tell it to start below the bar. It reads a ",
                            "custom property instead, which the bar sets when it mounts and removes when it ",
                            "does not, so the viewer's floating control bar starts below the title bar in the ",
                            "desktop build and keeps the full viewport in a browser.",
                        ],
                        [
                            { strong: "There is exactly one notification corner, and it belongs to the shell." },
                            " Informational, success and progress messages never block. Errors and warnings ",
                            "stay until they are dismissed, because a failure that dismisses itself is a ",
                            "failure nobody read. Anything that needs a decision before work can continue is a ",
                            "dialog instead, and the application has exactly one of those.",
                        ],
                        [
                            { strong: "Both typefaces are bundled, not fetched." },
                            " Roboto in four weights and Roboto Mono in two, loaded from the application's own ",
                            "files. Every Material typescale in this interface names Roboto and Windows ships ",
                            "none, so without them the entire chrome fell back to Arial while claiming to be ",
                            "Material Design.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The notification corner is mounted once, at the top of the application, outside the ",
                        "layer that lets clicks through to the map. It was originally created inside the options ",
                        "editor, which tied every message to that one screen being on screen: a save that closed ",
                        "the editor had nowhere left to report where it had written, and nothing outside that ",
                        "screen could say anything at all. The queue is now shared and the corner is the shell's, ",
                        "so a message outlives the surface that raised it.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Exactly one corner, deliberately",
                    content: [
                        "The component paints its own fixed stack, so a second mounted copy would show every ",
                        "notice twice, in two corners, with two timers racing to dismiss it. One instance reads ",
                        "the shared queue and the rest of the application raises messages through it.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "table",
                    caption: "How long a message stays",
                    columns: ["Level", "Dismisses itself after", "Why"],
                    rows: [
                        ["Information", "5 seconds", "It informs. Nothing is lost by missing it."],
                        ["Success", "4 seconds", "It confirms something that already happened."],
                        [
                            "Warning",
                            "Never",
                            "It is about something that is still true and still needs a decision.",
                        ],
                        ["Error", "Never", "A failure that auto-dismisses is a failure nobody read."],
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "The notification history",
                            description:
                                "The last fifty messages of the session, newest first, so a dismissed one stays reviewable. Each carries a local ISO-8601 timestamp with its offset, which is both readable and sortable.",
                        },
                        {
                            term: "Detail behind a disclosure",
                            description:
                                "A message may carry a longer explanation, which is shown behind a disclosure rather than in the body of the toast. A corner that grows to hold a stack trace stops being a corner.",
                        },
                        {
                            term: "Roboto",
                            description:
                                "Weights 300, 400, 500 and 700, which are the ones the Material typescales in this interface actually ask for.",
                        },
                        {
                            term: "Roboto Mono",
                            description:
                                "Weights 400 and 500. It is named first by every monospace surface in the interface: file paths, config previews, engine logs, regular-expression matches and keyboard keys. Only those two weights are bundled because only those two are asked for, and nothing renders monospace bold today; a surface that started to would need the weight added rather than left to a browser's synthetic bold.",
                        },
                        {
                            term: "Licensing",
                            description:
                                "Both families are under the SIL Open Font License, version 1.1, and the repository's NOTICE records that with the packaging they are bundled through. The earlier Apache-2.0 line in that file described a version of Roboto this application does not carry, and has been corrected.",
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
                    kind: "definitions",
                    items: [
                        {
                            term: "There is no window bridge",
                            description:
                                "The bar renders nothing and the interface keeps the full viewport, because the height it would have published is simply never set. This is the ordinary browser case rather than an error.",
                        },
                        {
                            term: "Half a window bridge",
                            description:
                                "Refused as a whole. Five methods are required and a build missing any of them gets no buttons, rather than a row where two work and the third throws.",
                        },
                        {
                            term: "The window is maximised from outside the application",
                            description:
                                "The maximise button tracks the window's real state through an event rather than remembering what it last did, so a window maximised by a keyboard shortcut or by the platform still shows the restore icon.",
                        },
                        {
                            term: "A control forgets to opt out of the drag region",
                            description:
                                "It stops receiving clicks and starts moving the window. This is the one defect in this area that looks like nothing at all in a screenshot, which is why the rule is stated where the bar is written rather than left to be remembered.",
                        },
                        {
                            term: "A message is raised while nothing is mounted",
                            description:
                                "It is still recorded in the history, which is the difference between a queue and a component. The corner shows what is live when it renders.",
                        },
                        {
                            term: "A glyph is not in either family",
                            description:
                                "It falls through to the platform's own stack, which is what keeps CJK text readable in an interface whose primary families cover Latin. The bundled families are the first choice, not the only one.",
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
                            "Bundling the typefaces is what lets the shell's Content-Security-Policy keep ",
                            { code: "font-src 'self'" },
                            ". A remote font is a request to a third party on every launch, and it would have to ",
                            "be allowed by the policy that exists to stop exactly that.",
                        ],
                        "Nothing about the chrome reaches the network. The icon is a local asset, the fonts are local files, and the title bar makes no request of any kind.",
                        "The window buttons cross the same guarded bridge as everything else. The renderer asks the main process to minimise, toggle or close the window it owns; it never gets a window object.",
                        "A notice carries text the application composed. Where a message quotes a subsystem, the quoting happens where that subsystem's errors are already turned into sentences, so nothing arrives at the corner as a raw stack.",
                        "The corner is mounted outside the click-through layer, so it can never be an element the map is receiving events through. A notification a person cannot press the dismiss button on is a notification that traps its own corner of the screen.",
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
                        "The title bar is the one part of this that is proved by a picture rather than by an ",
                        "assertion, and it needed one: the claim is about what the window looks like. Two ",
                        "captures were taken by the project's own harness, driving the packaged application on ",
                        "Windows, and committed to ",
                        { code: "docs/screenshots/" },
                        ": the whole window at 1920 by 1080, and the bar itself cropped to full width so the ",
                        "logo, the title and the three buttons are legible. There is no operating system ",
                        "caption bar above either of them, which is the claim.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "13 tests cover the window controls: the refusal of a partial bridge, the browser case, a maximise that happened outside the application arriving as an event, each button reaching the bridge rather than acting locally, and a rejected call being swallowed instead of thrown out of a click handler.",
                        "16 tests cover the notice queue and the shared store: which levels dismiss themselves and which do not, the stacking order, the bounded history, and the single shared instance.",
                        "The full capture also shows the notification history button in the opposite corner, reading zero, and the three round buttons that open settings, server profiles and the options editor. It was taken at first run, so there is no map behind it and therefore no viewer control bar in frame: the rule that the control bar starts below the title bar is asserted by the stylesheet rather than by this picture.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What the captures do not prove",
                    content: [
                        "A capture shows the bar; it does not show the buttons working. Nobody has minimised, ",
                        "maximised or closed an installed build by hand, and there is no capture of the ",
                        "notification corner with a message in it. The shell chrome is tracked as ",
                        { link: "issue 5", href: issue(5), external: true },
                        "; check the tracker for its current state rather than reading this page as a closure. ",
                        "The roadmap is at ",
                        { link: "design/ROADMAP.md", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "electron-security",
            reason: "The frameless window's other half: the policy it loads content under, and the bridge its buttons cross.",
        },
        {
            articleId: "options-gui",
            reason: "The largest surface this chrome surrounds, and the one the notice queue was originally built for.",
        },
        {
            articleId: "screenshot-gallery",
            reason: "The harness that took the title bar captures, and every other capture on this site.",
        },
        {
            articleId: "contract-appearance-editors",
            reason: "The per-element appearance and typography editors this chrome will eventually be adjustable through, which are specified and not built.",
        },
    ],

    sources: [
        {
            label: "packages/ui/src/components/shell",
            href: repoFile("design/packages/ui/src/components/shell"),
        },
        {
            label: "packages/ui/src/components/config/notifications.ts",
            href: repoFile("design/packages/ui/src/components/config/notifications.ts"),
        },
        { label: "packages/ui/src/stores/notices.ts", href: repoFile("design/packages/ui/src/stores/notices.ts") },
        { label: "packages/ui/src/main.ts", href: repoFile("design/packages/ui/src/main.ts") },
        { label: "design/NOTICE", href: repoFile("design/NOTICE") },
        { label: "docs/screenshots", href: repoFile("docs/screenshots") },
    ],
};
