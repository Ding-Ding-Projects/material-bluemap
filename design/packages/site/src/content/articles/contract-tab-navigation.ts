import type { Article } from "../types.js";
import { repoFile, issue, CONTRACTS_URL } from "../links.js";

export const contractTabNavigation: Article = {
    id: "contract-tab-navigation",
    title: "Contract: browser-style tabbed navigation",
    summary:
        "Persistent tabs with overflow, reordering, pinning, groups, four separate tab searches, two bulk-close actions, and structure that survives a restart.",
    category: "contracts",
    status: "specified",
    statusNote:
        "The application shell navigates by tabs, and that strip is shipped and documented separately: overflow that never clips, reordering, pinning, groups, all four searches, five bulk closes with a reviewable plan, and the six orderings restored on the next launch. Both surfaces wire Edit tab appearance and Edit group appearance into their normal and Shift+right-click paths -- desktop's via components/tabs/TabStrip.vue, proven by 42 tests in TabbedNavigation.test.ts, and the Pages site's via its own packages/site/src/tabs/TabStrip.ts. 313 tests pass across 18 test files spanning both packages' tab models, search, close plans, storage, menus and mounted strips. Issue 7 is closed. What has not been done is a line-by-line audit of every clause in design/docs/contracts/tab-navigation.md beyond the appearance-editor clause this page used to name as the remaining gap, so this stays specified rather than shipped.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "This describes a requirement, and it is met against every clause checked so far",
                    content: [
                        "It used to say the shell did not navigate by tabs at all, and later that the desktop ",
                        "application's per-tab and per-group editors sat outside a Pages-only change. Both ",
                        "surfaces now carry them: what is built is documented in ",
                        {
                            link: "the tab system's own article",
                            href: repoFile("docs/tabbed-navigation.md"),
                            external: true,
                        },
                        ". Normal right-click retains tab management and adds Edit tab appearance or Edit ",
                        "group appearance on both surfaces; Shift+right-click and, on desktop, Ctrl+Shift+F10 ",
                        "open the same anchored editor directly. Every clause this page previously named as ",
                        "unmet is now met, but the contract document has more clauses than the ones named here, ",
                        "and not every one has had a fresh line-by-line pass, so this stays specified. Progress ",
                        "was tracked as ",
                        { link: "issue 7", href: issue(7), external: true },
                        ", now closed.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Content separates into discrete pages reached from a persistent tab strip, so a user ",
                        "navigates rather than scrolling to find things. The contract applies to the desktop app ",
                        "and to any documentation or Pages site the project publishes, individually.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Tab behaviour has to be complete rather than decorative. That means an overflow surface ",
                        "when tabs exceed the available width instead of silent clipping, reordering, pinning, ",
                        "grouping, a searchable tab list, and persistence of tab order, pinned order, groups, group ",
                        "order, collapsed state and membership across restarts.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Pinning",
                            description:
                                "Available from the context menu, a keyboard path and the searchable list. Pinned tabs occupy a stable region, stay reachable during overflow, reorder within that region, keep a full accessible name when visually compact, and are excluded from close-others and text-based bulk closes unless the user explicitly and visibly includes them.",
                        },
                        {
                            term: "Grouping",
                            description:
                                "Create, name, rename, colour, reorder, collapse, expand and remove. Tabs move into, out of and between groups by pointer or keyboard, and the whole structure is restored after a restart.",
                        },
                        {
                            term: "The four searches",
                            description:
                                "The current strip and its overflow; every individual group; group names and labels; and a master search covering every open tab in every window, workspace, strip and group. Each field owns its own state and its own anchored builder, and none shares hidden state with another.",
                        },
                        {
                            term: "The two bulk closes",
                            description:
                                "Close tabs containing text, and close tabs not containing text. The scope is the visible tab label, never page contents or hidden data, and the inverse action negates the identical predicate rather than maintaining a second interpretation of case, Unicode or flags.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Search results identify the window or workspace, the strip, the group and the pinned state. ",
                        "Activating a result inside a collapsed group reveals it temporarily without destroying the ",
                        "user's saved collapsed preference.",
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
                            term: "Persisted structure",
                            description:
                                "Tab order, pinned order, group order, group membership and collapsed state. These are ordinary preferences and are expected to survive a restart.",
                        },
                        {
                            term: "Not persisted",
                            description:
                                "A search query, a pattern, sample text or a close preview, unless there is an explicit need and the user consented. A tab title can be sensitive.",
                        },
                        {
                            term: "Bulk-close scope",
                            description:
                                "Stated before the action runs: current group, selected groups or all groups. It never silently crosses a group boundary.",
                        },
                        {
                            term: "Pinned tabs",
                            description:
                                "Excluded by default. Including them is a separate, previewed choice showing exactly which protected tabs would go.",
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
                        "Only one of the two bulk-close directions, or a not-containing action with different flags or casing from the containing one.",
                        "Regex reduced to a toggle without the full builder, or a builder detached from the action that consumes its pattern.",
                        "A stale valid pattern still running after the current pattern became invalid.",
                        "Closing on empty input, or silently including pinned tabs.",
                        "Bypassing existing unsaved-work protection, which stays authoritative for every affected tab.",
                        "Inspecting hidden content without a separately named and documented scope the user selected.",
                        "Freezing the interface while matching, or reporting a partial close as a complete one. A protected or failed tab is never reported as closed.",
                        "Tabs clipped at narrow widths instead of moving into an overflow surface.",
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
                        "Matching runs locally under the regex builder's pattern, sample, result-count and execution-time bounds, with zero-width matches and catastrophic backtracking handled.",
                        "Tab titles are treated as potentially sensitive. They are not transmitted, logged or retained merely to perform a bulk close.",
                        "Both actions, their builder affordances, the preview, the pinned-tab option and any confirmation are keyboard reachable and screen-reader named.",
                        "The active mode, a validation error, the affected count, the excluded count and the result are announced without relying on colour alone.",
                        "A blocking confirmation is used only where the user genuinely has to decide, such as including pinned tabs or handling unsaved work. Everything else reports through non-blocking notifications.",
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
                        "Exact, substring, case-sensitive, case-insensitive, Unicode, multiline-title, no-match, all-match, zero-width, invalid, empty, oversized, timeout and adversarial patterns against the production engine.",
                        "For every case, proof that containing and not containing partition the same eligible set.",
                        "All four searches exercised independently in plain and regex modes, with proof of no cross-field state leak.",
                        "Collapsed-group results revealing without changing the persisted preference, and keyboard activation with a return path.",
                        "Group creation, rename, colour, reorder, collapse and removal; tab moves between groups; every decoration and interaction state; reset and export; and the whole structure restored after a restart.",
                        "Narrow layouts, tab overflow, screen-reader state, reduced motion, contrast, and all three language modes.",
                        "Proof that the preview equals the set actually attempted, and that the result names every excluded or failed tab honestly.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "This has run, on both surfaces",
                    content:
                        "313 tests pass across 18 files spanning both the desktop tab model (tabModel.test.ts, closePlans.test.ts, tabSearch.test.ts, tabStorage.test.ts, tabGroupPicker.test.ts, tabMenus.test.ts, TabbedNavigation.test.ts, tabGroupPickerMount.test.ts, TabResultList.test.ts) and the Pages site's own (TabStrip.test.ts plus its search engine, evaluator, predicate, query model and tab-matching suites): overflow, reordering, pinning, grouping, all four searches, both bulk-close directions, appearance-editor discovery through right-click, Shift+right-click and the keyboard path, and persistence restored on the next mount.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "tabbed-shell",
            reason: "What is actually built against this contract, on both surfaces.",
        },
        {
            articleId: "contract-regex-builder",
            reason: "Every one of the four searches and both bulk closes depends on it.",
        },
        {
            articleId: "contract-appearance-editors",
            reason: "Tabs and tab groups are decoration targets, and that contract defines the control set.",
        },
        {
            articleId: "contract-super-confirmation",
            reason: "Bulk closing is destructive, so the confirmation rules apply where a decision is genuinely required.",
        },
    ],

    sources: [
        { label: "design/docs/contracts/tab-navigation.md", href: repoFile("design/docs/contracts/tab-navigation.md") },
        { label: "Issue 7", href: issue(7) },
        { label: "Contract index", href: CONTRACTS_URL },
    ],
};
