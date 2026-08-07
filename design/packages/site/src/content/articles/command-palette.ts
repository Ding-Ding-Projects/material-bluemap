import type { Article } from "../types.js";
import { COMMAND_PALETTE_DOC_URL, repoFile } from "../links.js";

export const commandPalette: Article = {
    id: "command-palette",
    title: "The command palette",
    summary:
        "One shortcut over every command, setting and destination the application has, where a row that is a setting carries the setting's real control rather than a link to the screen it lives on.",
    category: "application",
    status: "shipped",
    statusNote:
        "On the default branch, mounted by the shell, and covered by four test files that run in CI: the row model, the catalogue, the stored preferences and the mounted component. Nobody has driven it in a packaged build, and its own copy is not in the language catalogue yet, so its strings render their English fallbacks in every language mode.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The problem this solves is not that features are missing. They are all there, behind a ",
                        "settings sheet, a seven-tab options editor, a viewer menu with its own pages and three ",
                        "floating buttons, which is four separate mental models somebody has to hold before they ",
                        "can find a setting whose name they already know. The palette is one surface where ",
                        "everything is one list and typing the name of a thing is enough.",
                    ],
                },
                {
                    kind: "table",
                    caption: "The three kinds of row, which are three types rather than three styles",
                    columns: ["Kind", "What it does", "What it has to carry"],
                    rows: [
                        ["Command", "Does its one thing, and the palette closes.", "A function to run"],
                        [
                            "Setting",
                            "Holds the live control: a switch, a bounded number box, or a pick from a list.",
                            "A control whose write also performs its own persistence",
                        ],
                        [
                            "Destination",
                            "Opens a surface.",
                            "A plain sentence naming what will appear, which is never blank",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The split is what keeps the project's rule against decorative controls checkable rather ",
                        "than aspirational. A row is a setting only when it holds a control that writes; anything ",
                        "that merely leads to one is a destination and is worded as one, in the type. There is ",
                        "deliberately no free-text control, because every free-text setting in this application is ",
                        "validated against the filesystem and offers a browse button, which a single row cannot ",
                        "honestly reproduce.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "Nothing here keeps a list of its own." },
                            " Rows are derived from the registries that already describe the thing: the settings ",
                            "surface publishes its sections, the options editor publishes its screens, and the ",
                            "running viewer publishes its settings. A hand-kept copy would be the list that falls ",
                            "behind, and the failure would be somebody typing the name of a setting they are ",
                            "looking at and being told it does not exist.",
                        ],
                        [
                            { strong: "Arriving somewhere means arriving at the control." },
                            " A destination emits exactly the target the render-failure flow already emits, so the ",
                            "shell hands it to the reveal handler it already has, and the settings surface scrolls ",
                            "the row into view, focuses it and outlines it. This is a second entrance to one reveal ",
                            "path, not a second path.",
                        ],
                        [
                            { strong: "The search is the project's search." },
                            " The same shared field every other search bar uses, with the regex builder anchored ",
                            "beside it, plain text by default. It matches on what the row renders, including the ",
                            "labels of options that are not currently selected, because a search for a way to make ",
                            "something dark is a search for an option not chosen yet.",
                        ],
                        [
                            { strong: "Size is the user's choice and the default is the small one." },
                            " A search box that becomes the whole window is overwhelming on a large display and ",
                            "alarming when it was opened by accident, so an unconfigured install gets the bounded ",
                            "card and the full-window view is remembered once asked for.",
                        ],
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
                            term: "The shortcut",
                            description: [
                                "Control or Command with Shift and ",
                                { code: "f" },
                                ", and not Alt. The same chord opens the palette in the desktop app and on this ",
                                "site. It was Ctrl+K in the app until the two disagreed with each other, which ",
                                "made whichever one you had learned wrong half the time. It is matched on the key ",
                                "rather than the physical code, so the key labelled F on the user's own layout is ",
                                "the one that works, and both cases are accepted because layouts disagree about ",
                                "what Shift+F reports. The listener is on the window in the capture phase, because ",
                                "the palette has to be reachable from inside a text field too.",
                            ],
                        },
                        {
                            term: "Size",
                            description: [
                                "Stored under ",
                                { code: "worldlens-palette" },
                                ". Two values, card and full window, and anything else read back is discarded.",
                            ],
                        },
                        {
                            term: "Routing to an options tab",
                            description:
                                "Off by default. While the shell cannot promise it can open the options editor at a named tab, the editor is one row carrying all seven tabs' words rather than seven rows that would all open the same first tab.",
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
                    kind: "list",
                    items: [
                        "Storage refuses, in a private-mode browser or on a full quota. The size does not survive a restart and nothing is reported, because a remembered window size is not worth a notification.",
                        "A stored size this build does not know is discarded rather than trusted, because the file is editable by hand and by an older version of the application.",
                        "No map is open, so there is no viewer to read settings from. None are listed and the palette says so, rather than showing a theme control wired to nothing.",
                        "A pattern that will not compile matches nothing, rather than leaving the results of the last pattern that did on screen under a search nobody can see.",
                        "A setting whose current value cannot be determined renders with no selection rather than a guessed one.",
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
                        "Nothing reaches the network. The catalogue is built from registries already in the bundle and the only thing written to storage is which of two sizes the palette opens at.",
                        [
                            "Search runs on the local engine under the bounds the settings adapter states: a ",
                            { code: "512" },
                            "-character pattern, a ",
                            { code: "20000" },
                            "-character sample, 500 matches and 100 milliseconds per preview run. No pattern or ",
                            "sample is transmitted, logged or persisted.",
                        ],
                        "Rows write through the same methods and storage keys the owning surface writes through, so the palette is not a second, less validated route to a setting.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "table",
                    caption: "What each test file holds",
                    columns: ["File", "What it proves"],
                    rows: [
                        [
                            { code: "paletteItems.test.ts" },
                            "What a row can be found by, that a toggle contributes no value text, that an invalid pattern keeps nothing and an empty one keeps everything, and that grouping preserves catalogue order.",
                        ],
                        [
                            { code: "paletteCatalog.test.ts" },
                            "A row for every settings anchor and every options screen, the seven collapsing to one until the shell can route, rows omitted rather than faked where the viewer has nothing to offer, and every setting row writing through the application's own method and saving.",
                        ],
                        [
                            { code: "palettePrefs.test.ts" },
                            "The shortcut accepting Control and Command with either case of K and refusing Alt or Shift, and every way of reading a stored size going wrong falling back to the card.",
                        ],
                        [
                            { code: "CommandPalette.test.ts" },
                            "Mounted: focus taken and given back, the search narrowing, a broken pattern reported rather than hidden, the arrow key moving onto the first row, a destination emitting the reveal handler's own target, a setting written and persisted, and the size remembered.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What has not been checked",
                    content:
                        "Nobody has opened the palette in an installed build, and there is no committed capture of it. Its copy is not in the language catalogue yet, so it renders its English fallbacks whichever language mode is selected, which is the designed behaviour for an uncatalogued key rather than a defect but is not the same as being localised.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "regex-builder-surfaces",
            reason: "The search field and anchored builder the palette is one consumer of.",
        },
        {
            articleId: "notification-centre",
            reason: "The other surface built around finding something that has already scrolled past.",
        },
        {
            articleId: "contract-regex-builder",
            reason: "The contract that says every search bar carries a builder, and what of it is still owed.",
        },
    ],

    sources: [
        { label: "docs/command-palette.md", href: COMMAND_PALETTE_DOC_URL },
        {
            label: "packages/ui/src/components/palette",
            href: repoFile("design/packages/ui/src/components/palette"),
        },
    ],
};
