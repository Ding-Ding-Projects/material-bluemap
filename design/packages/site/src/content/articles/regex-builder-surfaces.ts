import type { Article } from "../types.js";
import { REGEX_BUILDER_DOC_URL, issue, repoFile } from "../links.js";

export const regexBuilderSurfaces: Article = {
    id: "regex-builder-surfaces",
    title: "The regex builder, and the guard that keeps it on every search bar",
    summary:
        "A guided pattern builder anchored beside the field that opened it, plain text by default, with a test that walks every component in the application and fails when a search bar appears without one.",
    category: "application",
    status: "shipped",
    statusNote:
        "Three shared search fields, three anchored builders and the source guard are on the default branch, with the guard, the engine and the backtracking refusal covered by tests in CI. The exemption list the guard allows is currently empty. All three builders' copy is in the language catalogue now: config and menu were already voiced, and the marker panel's builder was voiced under its own markerRegex.* namespace after its old regexBuilder.* keys turned out to collide with menu's under different English wording.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "There are three shared search fields, each rendering its own anchored builder, because ",
                        "they belong to three surface families with different chrome rather than because the ",
                        "behaviour differs. All three are plain text by default with regular expressions as an ",
                        "explicit opt-in, and all three run the host runtime's own engine, which is also the ",
                        "engine the search itself filters with, so a builder's preview cannot disagree with the ",
                        "search that consumes the pattern.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "The builder is bound to the field, not parked beside it." },
                            " Pattern and flags are two-way: typing in the raw editor changes the search ",
                            "immediately and typing in the search bar changes the editor. There is no shared ",
                            "builder holding state for whichever field was touched last. It opens from a field, is ",
                            "anchored beside it, writes back into it, and returns focus to it on close.",
                        ],
                        [
                            { strong: "Guided construction, by token group." },
                            " Character classes, anchors, groups (capturing, non-capturing, named, and a ",
                            "back-reference), alternation and quantifiers, plus a literals field that escapes every ",
                            "metacharacter so a typed string matches itself.",
                        ],
                        [
                            { strong: "The sample is real text from the surface that opened it" },
                            ", one candidate per line, and it is the same text the filter tests. A builder ",
                            "previewing against an invented sample teaches a pattern that matches the sample and ",
                            "nothing the user has.",
                        ],
                        [
                            { strong: "The engine is stated in the interface, not only in a comment." },
                            " A builder whose dialect a user has to guess is one they cannot trust, so the ",
                            "surface names the dialect, the supported flags, the escaping rule and every limit.",
                        ],
                        [
                            { strong: "Turning regex off leaves the literal query exactly as typed" },
                            " rather than rewriting it, so the meaning of what somebody typed does not change ",
                            "under them.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The rule most likely to decay is the one about coverage, because nothing about writing a ",
                        "plain text field labelled Search feels like a violation while you are doing it: a surface ",
                        "ships, the field looks right, and the promise quietly covers one fewer place than it did ",
                        "last week. So a test walks every component in the package and asks two questions. Does ",
                        "this file contain a search-shaped input, meaning one whose label, placeholder, name, ",
                        "model or class says search, filter, find or query? And if so, does it take its search ",
                        "from one of the three shared fields? A file that answers yes and no fails.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "An exemption has to be a sentence somebody wrote",
                    content:
                        "A file holding a search-shaped input that genuinely is not a search has to be named in a list with the reason, so the exemption is deliberate rather than an absence nobody noticed. That list is currently empty, and a stale entry fails too. The detector is deliberately generous about what counts as a search: better one exemption sentence than a real search bar slipping through because its label was Find a map.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "The guard deliberately does not check that a builder works. That is what the per-surface ",
                        "mount tests are for, and duplicating it would make the guard slow and fragile without ",
                        "making it stricter.",
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
                    caption: "The bounds, stated in the builder's own interface as well as here",
                    columns: ["Limit", "Value"],
                    rows: [
                        ["Pattern length", "512 characters"],
                        ["Sample length", "20000 characters"],
                        ["Reported matches", "500"],
                        ["Wall clock per preview run", "100 milliseconds"],
                        ["Flags", "g, i, m, s, u and y"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A limit the user cannot see is a limit that reads as a bug when it bites, so all of them ",
                        "are on the builder's surface. None is user-configurable. Each search family owns its own ",
                        "copy of the engine adapter, so one surface's limits cannot be changed out from under ",
                        "another's. Plain-text mode is a case-insensitive substring match everywhere.",
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
                        "A pattern that will not compile shows its error and matches nothing, rather than falling back to the last pattern that did and leaving results on screen for a search nobody can see.",
                        "A pattern that would backtrack exponentially is refused before it is compiled. This is the one failure the size and time limits cannot cover: a single evaluation cannot be interrupted, the wall clock is checked between matches, and an exponential pattern never returns from the first one, so the budget is never reached. Capping the inputs bounds a polynomial pattern and does nothing at all to an exponential one.",
                        "Refusing has a real cost, and it is the right trade against a window that stops repainting with no way back, because the same intent is almost always expressible without the nesting. The refusal says which shape it objected to rather than reporting a bare failure.",
                        "A zero-width match is handled rather than driving an infinite loop.",
                        "A sample longer than the limit is truncated for the preview and says so, and more matches than the cap are reported as capped rather than silently ending the list.",
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
                        "Evaluation is local and in memory. No pattern and no sample text is transmitted, logged or persisted anywhere, including by the surfaces that persist other state: the tab strip explicitly excludes queries and patterns from what it writes.",
                        "Catastrophic backtracking is treated as a real threat rather than a theoretical one, because the pattern runs on the thread that draws the interface. The static refusal is the mitigation and the four bounds are the second line.",
                        "Tab titles, notification text and settings values are read to perform a search and are not retained or transmitted afterwards.",
                        "Every entry point is keyboard reachable with an accessible name and state, validation and result changes are announced without constant interruption, and match highlighting is never the only way a result is conveyed.",
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
                            { code: "regexPolicy.test.ts" },
                            ": every search-shaped input in the package uses a shared field or carries a written ",
                            "exemption, every exemption still points at a file that still looks like a search, the ",
                            "detector catches a plain search field and does not accuse an ordinary text field, and ",
                            "the sweep really did find the components it is watching.",
                        ],
                        [
                            { code: "regexEngine.test.ts" },
                            ": the host engine rather than a reimplementation, escaping a literal, only supported ",
                            "flags in a stable order, a pattern over the length limit refused rather than compiled, ",
                            "a syntax error reported rather than thrown, the sample and match caps reported when ",
                            "they bite, termination on an empty pattern and on a quantifier that can match ",
                            "nothing, numbered and named groups, and plain text staying literal until regex mode ",
                            "is turned on.",
                        ],
                        [
                            { code: "regexRisk.test.ts" },
                            ": the exponential shapes that are refused, the realistic queries that are not, and the ",
                            "same search still running when it is written without the redundant nesting.",
                        ],
                        [
                            "Per-surface mount tests drive each builder from its own field, including the ",
                            "notification centre, the command palette, the changelog viewer and the tab strip.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Coverage is what the guard says, not what this page says",
                    content: [
                        "The list of surfaces changes as the application grows, so the authority is the guard, ",
                        "which enumerates the components on every run. The wider contract, tracked as ",
                        { link: "issue 6", href: issue(6), external: true },
                        ", is closed: the builder's own surface is in the language catalogue too, in all three ",
                        "desktop instances.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-regex-builder",
            reason: "The full contract, and the clauses this does not meet yet.",
        },
        {
            articleId: "tabbed-shell",
            reason: "The heaviest consumer: four searches and two bulk-close fields.",
        },
        {
            articleId: "options-gui",
            reason: "The surface these fields were first written for.",
        },
    ],

    sources: [
        { label: "docs/regex-builder.md", href: REGEX_BUILDER_DOC_URL },
        {
            label: "packages/ui/src/components/config/regexEngine.ts",
            href: repoFile("design/packages/ui/src/components/config/regexEngine.ts"),
        },
        {
            label: "packages/ui/src/components/config/regexPolicy.test.ts",
            href: repoFile("design/packages/ui/src/components/config/regexPolicy.test.ts"),
        },
        { label: "Issue 6", href: issue(6) },
    ],
};
