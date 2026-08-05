import type { Article } from "../types.js";
import { APPEARANCE_EDITORS_DOC_URL, repoFile } from "../links.js";

export const appearanceEditor: Article = {
    id: "appearance-editor",
    title: "The appearance editor, its infinite colour picker and its typography editor",
    summary:
        "Wrap an element once and it gains a context menu, a keyboard path, and a non-modal editor anchored beside it with word-processor-depth typography and a continuous colour picker that translates between eleven notations.",
    category: "application",
    status: "shipped",
    statusNote:
        "The feature is on the default branch with test files running in CI, several of them mounting the real components, including 42 tab- and group-editor tests in TabbedNavigation.test.ts. The desktop application wraps ten component families: the window title bar and tab bar, each server profile row, the editor's own chrome, the control bar, EULA sections and viewer, history, project rows, docked surfaces, and every tab and group. The Pages surface walks and registers every rendered HTMLElement, so its prose, headings, summaries, table cells, links and controls all have the same entry point. The cross-surface contract still asks the desktop application for that same literal-every-element coverage rather than ten named families, so this is the machinery shipped rather than the contract met.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "An appearance record is a record of opinions rather than of values. A key that is absent ",
                        "means follow whatever is above me; a key that is present means this one, regardless. ",
                        "Keeping those distinguishable is what makes per-property reset work: resetting a tab's ",
                        "weight has to remove the opinion, rather than write today's theme weight into the tab and ",
                        "pin it there until somebody notices, months later, that restyling the application changed ",
                        "everything except that one element.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "One wrapper, not twenty implementations." },
                            " A host wraps whatever it renders and gets the resolved appearance applied live, a ",
                            "context menu with the edit command under the host's own items, a keyboard path to ",
                            "the same command, a modifier click straight to the editor, an anchored non-modal ",
                            "editor that tracks the element and flips at a viewport edge, and focus back on the ",
                            "element when it closes. The failures the contract names are failures of consistency ",
                            "rather than of ambition, and one copy of the code is what prevents them.",
                        ],
                        [
                            { strong: "The wrapper is invisible until it has something to paint." },
                            " It adds no box by default, so dropping it onto an existing surface changes nothing ",
                            "about that surface's layout. Typography inherits straight through; a background, ",
                            "border, padding, shadow or opacity does not, and would render nothing at all, ",
                            "silently, which would look exactly like the feature being broken. So the wrapper ",
                            "becomes a real box the moment one of those is set, and stops being one on reset.",
                        ],
                        [
                            { strong: "Colours are stored as the user wrote them." },
                            " The authored string is what is kept, even though what is painted is something the ",
                            "browser is certain to understand. Storing the resolved value would destroy the gamut ",
                            "the user chose in, the precision they typed and the notation they think in, and the ",
                            "record is the thing that gets exported, shared and imported into a build with a ",
                            "different engine.",
                        ],
                        [
                            { strong: "A colour that will not parse is never answered with black." },
                            " The declaration is left off, the authored text is kept exactly as it was, and it is ",
                            "reported so the editor can say which value it could not use and offer it back.",
                        ],
                        [
                            { strong: "The editor edits itself." },
                            " Its own chrome is an editable target, so pointing the editor at itself restyles it ",
                            "while it is open. A theming feature that cannot theme its own dialog is incomplete, ",
                            "and this is also the cheapest possible test of the whole thing.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The colour picker is continuous rather than a grid of swatches: a two-dimensional field ",
                        "plus a continuous hue and alpha, with the swatch, the recent list and the eyedropper ",
                        "writing into that field rather than replacing it. There is no colour expressible in sRGB ",
                        "that cannot be reached by dragging, and none expressible in a supported space that cannot ",
                        "be reached by typing. The translator reads and writes named colours, hexadecimal, ",
                        "rgb, hsl, hsv, hwb, lab, lch, oklab, oklch and cmyk, preserving alpha, naming the active ",
                        "space, and reporting contrast.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The canonical value is unclamped, on purpose",
                    content:
                        "Lab, LCH, OKLab and OKLCH can describe colours no sRGB display can show, and clamping on entry would quietly delete them. Keeping the out-of-range numbers is what lets the picker say this is outside sRGB and here is what will be shown instead, which is a true statement about a real situation. The spaces defined as re-parameterisations of sRGB work on the clipped colour and report whether clipping changed anything; the device-independent ones work on the raw value and never clip.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "The typography editor offers a shape wider than CSS, because somebody who has used a ",
                        "word processor's font dialog expects small caps, an oblique angle, a double ",
                        "strikethrough, an outline and a glow. Capability detection and style generation are ",
                        "therefore separate steps: the engine is asked what it can do, only what it accepted is ",
                        "emitted, and the value stays in the record either way, so turning a control back on, or ",
                        "opening the same profile on a newer engine, brings it back untouched. Where CSS genuinely ",
                        "cannot express two decoration choices at once, a documented winner is applied and the ",
                        "losing property is named beside its own control rather than silently ignored.",
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
                            term: "Layers",
                            description:
                                "A reserved element id holds the global layer, so global settings are edited, reset and exported through exactly the same code paths as any single element's. A global layer with its own parallel implementation would be a feature with two reset bugs instead of one.",
                        },
                        {
                            term: "Two halves",
                            description:
                                "Surface (background, border colour, width, style and radius, padding, elevation, opacity) and typography, kept apart because they are edited in different tabs, reset independently and inherited from different places.",
                        },
                        {
                            term: "Keyboard paths",
                            description:
                                "The platform's own context-menu keys open the menu, and a modifier chord goes straight to the editor, mirroring the modifier click. The menu item shows that shortcut from the same handler that binds it, and the wrapper advertises both so assistive technology learns about a binding it cannot see.",
                        },
                        {
                            term: "Presets and themes",
                            description:
                                "Named presets can be saved, applied and deleted, and deleting goes through the two-key gate because it takes the settings every element following that preset was inheriting. A whole theme exports as JSON carrying a format marker, so a stray JSON file is not read as a theme.",
                        },
                        {
                            term: "Fonts",
                            description:
                                "What the application ships plus the faces it can reasonably assume on the platform, and the rest by asking the browser, which the user may refuse. Every stack ends in a generic and appends faces that can draw Chinese, Japanese and Korean text.",
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
                        "A colour that will not parse is kept verbatim, not painted, and named back to the user.",
                        "A colour outside sRGB is kept, painted as its clipped equivalent, and reported as clipped rather than silently changed.",
                        "A property this engine cannot draw stays visible with an explanation and keeps its stored value.",
                        "Two decoration controls CSS cannot honour at once: a documented winner is applied and the losing property is named beside its control.",
                        "A theme file from a newer build imports, renders what this build understands, and writes the rest back out untouched on the next export. Dropping unknown sections is the obvious implementation and it means a user who opens their theme in an older version and changes one font silently deletes everything the newer version added.",
                        "A value of the wrong type is preserved and named in the import report rather than deleted, so the user is told which of their settings did not survive.",
                        "Storage refuses, or holds a shape this build does not expect. Both directions are guarded and silent, and a bad blob is repaired rather than trusted.",
                        "The browser refuses font enumeration. The picker offers the families it can count on and says nothing alarming.",
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
                        "Nothing reaches the network. The bundled families ship inside the application and no font, stylesheet or colour is fetched, which is also what lets the shell keep its font policy locked to its own origin.",
                        "Appearance is written to local storage and exported only when asked. An exported theme carries colours, sizes and family names, and no path, token or application data.",
                        "Font enumeration is a permissioned browser capability and is treated as one: it is asked for, it can be refused, and a refusal is an ordinary outcome rather than an error.",
                        "An imported theme is data, never code. It is parsed as JSON, every recognised value is validated against the property it claims to set, colour strings go through this project's own parser and formatter, and anything unrecognised is preserved as opaque data this build never interprets.",
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
                        [
                            { code: "appearanceRecord.test.ts" },
                            " and ",
                            { code: "appearanceStore.test.ts" },
                            ": absent meaning inherit and present meaning override, per-property reset removing ",
                            "the opinion, layer resolution including the global one, persistence guarded in both ",
                            "directions, and unknown keys and wrong-typed values preserved and reported.",
                        ],
                        [
                            { code: "colorSpaces.test.ts" },
                            ", ",
                            { code: "colorParse.test.ts" },
                            " and ",
                            { code: "colorFormat.test.ts" },
                            ": the conversions in both directions against the white points the specification names, ",
                            "out-of-gamut values carried rather than clamped, every notation the translator accepts ",
                            "and writes, each parse failure distinguished by reason, and the clip and contrast ",
                            "reports.",
                        ],
                        [
                            { code: "typographySpec.test.ts" },
                            " and ",
                            { code: "fontCatalog.test.ts" },
                            ": capability detection per property, values kept when a capability is absent, the ",
                            "documented decoration winner with its note, stacks that always end in a generic, and ",
                            "enumeration that neither throws nor needs a browser at import time.",
                        ],
                        [
                            { code: "InfiniteColorPicker.test.ts" },
                            " and ",
                            { code: "AppearanceTarget.test.ts" },
                            ": mounted, the continuous field, typing in each notation, copying a representation, ",
                            "the gamut warning, the context menu with the host's own items above the appearance ",
                            "ones, both keyboard paths, the editor anchored and returning focus, and the wrapper ",
                            "becoming a box only when a box declaration is present.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Ten component families, not every element",
                    content:
                        "Editability is the set of places the wrapper is used: the window title bar, the tab bar, each server profile row, the editor's own chrome, the control bar, EULA sections and the EULA viewer's tabs, the history panel, each project row, docked surfaces, and every tab and group (the last covered by 42 tests in TabbedNavigation.test.ts). Everything else the application renders is not yet a target -- this is real, tested coverage of the surfaces most likely to be right-clicked, not the literal every-rendered-element traversal the Pages site now has.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-appearance-editors",
            reason: "The full contract, including the elements this does not reach yet.",
        },
        {
            articleId: "tabbed-shell",
            reason: "The surface holding appearance records this feature has not been wired to yet.",
        },
        {
            articleId: "desktop-shell-chrome",
            reason: "The title bar, which is the first element this was wrapped around.",
        },
    ],

    sources: [
        { label: "docs/appearance-editors.md", href: APPEARANCE_EDITORS_DOC_URL },
        {
            label: "packages/ui/src/components/appearance",
            href: repoFile("design/packages/ui/src/components/appearance"),
        },
    ],
};
