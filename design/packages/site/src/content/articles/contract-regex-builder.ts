import type { Article } from "../types.js";
import { repoFile, issue, CONTRACTS_URL } from "../links.js";

export const contractRegexBuilder: Article = {
    id: "contract-regex-builder",
    title: "Contract: the regex builder on every search bar",
    summary:
        "A complete guided pattern builder reachable from every search bar and every settings surface, with plain text as the default and two-way synchronisation of query, pattern, flags and mode.",
    category: "contracts",
    status: "specified",
    statusNote:
        "The builder itself is shipped and is documented separately, and a source guard, packages/ui/src/components/config/regexPolicy.test.ts, proves that every search-shaped input in the application takes its search from one of the three shared fields, with no exemption recorded. The localisation clause is met on all three desktop instances now: config.regex.* and menu's regexBuilder.* were already catalogued, and the marker panel's builder, which had been calling tx() with its own regexBuilder.* keys, is now catalogued under its own markerRegex.* namespace -- discovered and fixed as a real bug in the process, since it shared literal key names with menu's builder under different English wording, so whichever entry landed in the catalogue silently overwrote the other's translation. 64 keys and appCopy.test.ts's full shape, placeholder and fact checks pass. The Pages site carries a separate, already-bilingual regex builder of its own (packages/site/src/search/), with its own funny-level wiring. Issue 6 is closed. What has not been done is a line-by-line audit of every remaining clause in design/docs/contracts/regex-builder.md beyond the two this page used to name, so this stays specified rather than shipped.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "This describes a requirement, and both named clauses are met now",
                    content: [
                        "What is built is documented in ",
                        { link: "the builder's own article", href: repoFile("docs/regex-builder.md"), external: true },
                        ": guided construction, the raw editor, every supported flag, a real sample, live ",
                        "matches and capture groups, the engine and its limits named on the surface, and a ",
                        "source guard that walks every component and fails when a search bar appears without a ",
                        "builder. The localisation clause used to say the builder's own labels were not in the ",
                        "language catalogue. All three desktop instances -- config, menu and the marker panel's ",
                        "builder -- are catalogued now, and fixing the marker panel's surfaced a real bug: it had ",
                        "been sharing literal key names with menu's builder under different English text, so the ",
                        "catalogue was silently answering one of them with the other's wording. It now has its own ",
                        "markerRegex.* namespace. Both clauses this page used to name as unmet are met, but the ",
                        "contract document carries more clauses than those two, and not every one has had a ",
                        "fresh line-by-line pass, so this stays specified. Progress was tracked as ",
                        { link: "issue 6", href: issue(6), external: true },
                        ", now closed.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The contract requires one complete builder, reachable from every search surface, rather ",
                        "than a regex checkbox on each of them. Complete means guided construction of literals, ",
                        "character classes, anchors, groups, alternation and quantifiers, plus a raw pattern editor, ",
                        "every supported flag, editable sample text, live match highlighting, capture-group ",
                        "inspection, and copy or export that preserves the pattern exactly.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "It also has to say which engine it is building for. The pattern a user builds has to behave ",
                        "the same way in the feature that consumes it, so the builder names the real engine, ",
                        "dialect, flags and escaping rules on its own surface.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Plain text stays the default. Regex is something the user turns on deliberately.",
                        "The builder is anchored beside the field it belongs to, not parked on a distant settings page.",
                        "Query, pattern, flags, validation state and mode synchronise in both directions, so neither surface can drift from the other.",
                        "Every settings, preferences and properties surface gets its own search bar wired to the same builder, including nested panels and each tab within them.",
                        "The two tab bulk-close fields are search inputs under this contract, and each gets its own builder.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A working reference implementation already exists in the repository: a standalone, ",
                        "worker-isolated ECMAScript builder under ",
                        { code: "design/tools/regex-builder-reference/" },
                        ", with English, Cantonese and bilingual strings in it. It is a reference tool. It is not ",
                        "wired into any product surface, and shipping it as a separate page would not satisfy the ",
                        "contract.",
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
                            term: "Engine",
                            description:
                                "The project's production regex engine, so a pattern that matches in the builder matches in the feature. Adapters and their limits are explicit rather than implied.",
                        },
                        {
                            term: "Limits",
                            description:
                                "Pattern length, sample size, match count and execution time all get stated bounds, published near the builder or in its documentation rather than discovered by hitting them.",
                        },
                        {
                            term: "Search integration",
                            description:
                                "Each search surface defines how flags, case sensitivity, whole-field matching and an empty pattern interact with its existing behaviour.",
                        },
                        {
                            term: "Language modes",
                            description:
                                "The builder is a user-facing surface, so the three language modes and both funny-level sliders apply to it like anything else.",
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
                    kind: "paragraph",
                    content: [
                        "The contract names these as defects rather than as gaps, because each one leaves a user ",
                        "with a builder that appears to work and quietly does not.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "A builder that previews with a different dialect than the feature that runs the pattern.",
                        "A search bar with a regex toggle and no builder, or a link out to an unrelated website.",
                        "One-way synchronisation, so editing the pattern updates the field but editing the field does not update the pattern.",
                        "Turning regex mode on silently changing what a plain-text query meant.",
                        "A syntax error that hides itself and lets the previous valid pattern keep running.",
                        "A zero-width match driving an infinite loop rather than being handled.",
                        "Copy or export adding delimiters or escaping that the user did not ask for.",
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
                        "Evaluation happens locally. Patterns and sample text are not transmitted, logged or persisted without an explicit need and the user's consent.",
                        "Pattern size, sample size, match count and runtime are all bounded, because catastrophic backtracking is the obvious denial-of-service route into any regex feature.",
                        "Evaluation is isolated or time-limited so a pathological pattern cannot freeze the interface. The vendored reference builder runs its engine in a worker for exactly this reason.",
                        "Tab titles and search queries are treated as potentially sensitive: a bulk close does not retain or transmit them just to perform the close.",
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
                    kind: "paragraph",
                    content: [
                        "The contract sets the test list. The builders in the application are tested against their ",
                        "own bounded engine and its own suite rather than this exact list line by line; what ",
                        "follows is what the contract itself would require before it counted as met.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Guided controls, raw editor synchronisation, every supported flag, and copy or export against the real engine.",
                        "Valid patterns, invalid patterns, no-match input, Unicode, multiline anchors, zero-width matches, numbered and named captures.",
                        "Result truncation, input limits, timeouts and deliberately adversarial backtracking cases.",
                        "For every search bar: plain and regex modes, opening the builder, two-way synchronisation, validation, clearing, keyboard use, narrow layouts, and returning to plain text without changing the literal query.",
                        "All three language modes, and proof that no pattern or sample text is persisted or transmitted unexpectedly.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "All three desktop instances now share one honest catalogue",
                    content:
                        "A builder reachable from every search bar but voiced for only some of them, or two builders silently trading translations under a shared key, would both still be a pending contract with a bug. Neither is true now: config, menu and markers each answer their own namespace, and regexPolicy.test.ts still proves every search-shaped input reaches one of the three shared, builder-carrying fields.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "regex-builder-surfaces",
            reason: "What is actually built against this contract, and the guard that keeps it on every search bar.",
        },
        {
            articleId: "contract-tab-navigation",
            reason: "The tab searches and both bulk-close actions are the largest consumer of this builder.",
        },
        {
            articleId: "contract-localization",
            reason: "The language modes that every builder surface has to carry.",
        },
        {
            articleId: "viewer-remote-mode",
            reason: "The interface these contracts will eventually apply to.",
        },
    ],

    sources: [
        { label: "design/docs/contracts/regex-builder.md", href: repoFile("design/docs/contracts/regex-builder.md") },
        { label: "design/tools/regex-builder-reference", href: repoFile("design/tools/regex-builder-reference") },
        { label: "Issue 6", href: issue(6) },
        { label: "Contract index", href: CONTRACTS_URL },
    ],
};
