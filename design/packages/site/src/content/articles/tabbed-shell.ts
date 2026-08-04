import type { Article } from "../types.js";
import { TABBED_NAVIGATION_DOC_URL, repoFile } from "../links.js";

export const tabbedShell: Article = {
    id: "tabbed-shell",
    title: "Browser-style tabs in the application",
    summary:
        "A persistent tab strip with an overflow surface that never clips, pinning, groups, four separate searches and five bulk closes, and a layout that comes back exactly as it was left.",
    category: "application",
    status: "shipped",
    statusNote:
        "On the default branch and mounted by the shell, with six test files running in CI covering the model, the four searches, the close plans, storage, the menus and the mounted strip. Per-tab and per-group appearance beyond the group colour is deliberately absent rather than stubbed out, so the wider tab contract this feeds is still open.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The model is pure data and pure functions: no DOM, no clock, no storage, no framework. ",
                        "The awkward parts of browser-style tabs are ordering rules rather than rendering, and ",
                        "questions like where a tab goes when it is unpinned, what happens to a group's members ",
                        "when the group is removed, and which tab becomes active when the active one closes each ",
                        "have exactly one right answer that a unit test proves in a line.",
                    ],
                },
                {
                    kind: "table",
                    caption: "One authority per ordering, so two of them can never contradict each other",
                    columns: ["Field", "The order it owns"],
                    rows: [
                        ["The tab set", "Identity only. Its array order carries no meaning at all."],
                        ["The pinned order", "The pinned region, left to right."],
                        [
                            "The slot list",
                            "The ordinary region, where a slot is either one ungrouped tab or one whole group, so the tab order and the group order cannot disagree.",
                        ],
                        ["A group's member list", "The order inside that group."],
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "Nothing is silently clipped." },
                            " Segments that do not fit move into an overflow surface and the button says how ",
                            "many. The arithmetic pays for that button out of the same budget, because otherwise ",
                            "it lands on top of the tab that only just fitted. Widths are measured once and ",
                            "cached, since a hidden element measures zero and recomputing from zeroes would flap.",
                        ],
                        [
                            { strong: "The pinned region never overflows." },
                            " It is measured out of the budget first, so a pinned tab stays reachable however ",
                            "many ordinary tabs are open. Pinned tabs render compact when the strip is tight and ",
                            "keep their full accessible name, so what a screen reader announces does not shrink ",
                            "with the button.",
                        ],
                        [
                            { strong: "Pinning takes a tab out of its group." },
                            " Those are two places on screen and a tab cannot be in both. Keeping the membership ",
                            "and merely hiding the tab would make the per-group search report a tab that is ",
                            "demonstrably not in the group, which is worse than losing the membership because it ",
                            "is a lie rather than a loss.",
                        ],
                        [
                            { strong: "Removing a group closes no tab." },
                            " Its members become lone tabs in the slot the group held.",
                        ],
                        [
                            { strong: "A collapsed group is a display state, not a hiding place." },
                            " Its members are still searched and still counted. A result inside one is revealed on ",
                            "screen without writing that reveal back to the saved preference.",
                        ],
                    ],
                },
                {
                    kind: "table",
                    caption: "The four searches, each with its own query, mode, flags and anchored builder",
                    columns: ["Search", "Scope"],
                    rows: [
                        ["The current strip", "Including tabs in the overflow surface and members of collapsed groups"],
                        ["One group", "Scoped by that group's own membership, and nothing outside it"],
                        ["Groups", "Group names, across every strip"],
                        ["Every tab", "Every strip in every window the application owns"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Nothing in the search module holds state, so four fields means four matchers and there is ",
                        "no shared thing left for them to leak through. What is searched is the visible label and ",
                        "only the visible label: a person searching a tab strip is looking for a word they can ",
                        "see, and a search that quietly matched hidden text would close tabs whose labels do not ",
                        "contain the query at all. A result row states its window, strip, group, pinned state and ",
                        "position, because two tabs called Settings in different windows are otherwise ",
                        "indistinguishable.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Containing and not containing are one predicate and its negation, literally",
                    content:
                        "One matcher, one direction flag, the same test over the same eligible set. Two implementations drift on case, on Unicode and on which flags are honoured, and the day they disagree a pair of actions a user reasonably believes are exhaustive quietly leaves tabs untouched by both. The test proves the partition rather than the shape: for any query, in either mode, the two sets are disjoint and together cover every eligible tab.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every close function returns a plan and closes nothing. The plan states the matching ",
                        "mode, which tabs are in scope, which will close, which were protected for being pinned ",
                        "and which hold unsaved work, before a single tab goes. The reviewable preview is the plan ",
                        "rather than a second calculation of it, so the two cannot disagree about the count, and ",
                        "the plan carries its own scope so a scoped action cannot quietly cross a group boundary. ",
                        "Running one goes through the two-key gate.",
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
                            term: "What is persisted",
                            description:
                                "Tab order, pinned order, groups, group order, collapsed state, membership, and each tab's and group's opaque appearance record, under one namespaced storage key with a version field.",
                        },
                        {
                            term: "What is not, and why",
                            description:
                                "Whether a tab holds unsaved work, because a tab holding it when the application closed is not holding it on the next launch and a restored flag would be a lie that then protects the tab from a bulk close for no reason. And search queries and patterns, because they can contain anything a person typed and are not ordinary layout preferences.",
                        },
                        {
                            term: "Appearance records",
                            description:
                                "Round-tripped verbatim without being inspected, so a record written by a newer build survives a trip through an older one instead of being silently emptied.",
                        },
                        {
                            term: "Group colours",
                            description:
                                "Seven Material roles, defaulting to the primary one. A group takes the position of the first tab it was made from, so it appears where the user was already looking rather than at the end of the strip.",
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
                        "Storage refuses or is full. Both directions swallow it: the layout does not survive a restart, which is annoying and nowhere near a notification.",
                        "A stored file this build cannot read seeds the defaults rather than half-restoring it. The version field is how a future change refuses an old file instead of partly reading it.",
                        "A file that is the right shape but internally inconsistent, for example a tab id in both a group and the pinned order, is repaired, because the file is editable by hand and is written by other versions of the application.",
                        "An empty query or a pattern that will not compile closes nothing at all. That is not merely a disabled button: the plan's selection is empty, so a caller ignoring the disabled state would still close nothing.",
                        "The last tab closes and the strip leaves an honest empty state rather than a blank frame.",
                        "A tab that could not be closed is reported as kept rather than counted as closed.",
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
                        "Nothing reaches the network and nothing leaves the machine. Only layout is persisted; queries, patterns and tab contents are not.",
                        "Searching and bulk closing read the visible label only, so neither can match on something the user cannot see.",
                        "All matching runs on the local engine under its stated bounds, which is what keeps a pathological pattern from freezing the strip.",
                        "A bulk close is destructive and is treated as one: a reviewable preview naming every affected tab, pinned tabs excluded unless deliberately included, unsaved work called out separately, and the two-key gate before anything runs.",
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
                            { code: "tabModel.test.ts" },
                            "Every ordering rule, that pinning clears membership, that every id lives in exactly one place after repair, and the overflow arithmetic including paying for the overflow button.",
                        ],
                        [
                            { code: "tabSearch.test.ts" },
                            "Four scopes searched independently, collapsed members found, hits carrying window, strip, group, pinned state and index, and only the visible label matched.",
                        ],
                        [
                            { code: "closePlans.test.ts" },
                            "The partition property for any query in either mode, plans that close nothing on an empty or uncompilable query, pinned and unsaved tabs held back and named, scope carried on the plan, and applying one reporting kept tabs honestly.",
                        ],
                        [
                            { code: "tabStorage.test.ts" },
                            "The six persisted orderings round-tripping, unsaved-work flags dropped, queries and patterns never written, appearance records preserved verbatim, a blocked storage staying silent, and an unreadable file seeding defaults.",
                        ],
                        [
                            { code: "TabbedNavigation.test.ts" },
                            "Mounted: roles and roving focus, arrow keys stopping at the ends, Home and End, the advertised keyboard commands, a compact pinned tab keeping its name, a collapsed group drawn as a header with name, count and state, its members out of the focus order, and the layout written and read back on the next mount.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What is deliberately absent",
                    content:
                        "Per-tab and per-group appearance beyond the group colour is not built. The model carries an opaque record on both and storage round-trips it, which is the attach point, and nothing in the tab code reads inside it. Until an editor is wired to those records the wider tab contract is not met, and the contract page says so rather than this one implying otherwise.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "destructive-action-gate",
            reason: "The gate every bulk close runs through, and the largest thing behind it.",
        },
        {
            articleId: "appearance-editor",
            reason: "The feature that owns the records the tab model carries and never reads.",
        },
        {
            articleId: "contract-tab-navigation",
            reason: "The full contract, including the parts this does not meet yet.",
        },
    ],

    sources: [
        { label: "docs/tabbed-navigation.md", href: TABBED_NAVIGATION_DOC_URL },
        { label: "packages/ui/src/components/tabs", href: repoFile("design/packages/ui/src/components/tabs") },
        { label: "packages/ui/src/App.vue", href: repoFile("design/packages/ui/src/App.vue") },
    ],
};
