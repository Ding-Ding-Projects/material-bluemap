import type { Article } from "../types.js";
import { repoFile, issue, CONTRACTS_URL } from "../links.js";

export const contractLocalization: Article = {
    id: "contract-localization",
    title: "Contract: language modes and the funny-level sliders",
    summary:
        "English, playful Hong Kong Cantonese and a bilingual mode, persisted, plus two independent tone sliders that style every message without ever changing a fact.",
    category: "contracts",
    status: "specified",
    statusNote:
        "Not implemented in the product. The interface ports the upstream locale loader with 30 upstream locales, which is a different thing: the three required modes, the Cantonese copy and both sliders do not exist. Tracked as issue 9.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "This describes a requirement, not shipped behaviour",
                    content: [
                        "What exists today is the upstream webapp's locale loader and its 30 bundled locales. That ",
                        "is upstream's translation system, not this contract. Progress is tracked as ",
                        { link: "issue 9", href: issue(9), external: true },
                        ".",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Three language modes, exactly: English, playful Hong Kong-style Cantonese, and bilingual. ",
                        "The choice persists across restarts and is reachable from an accessible control. Bilingual ",
                        "mode keeps the primary label prominent and puts the second language in compact secondary ",
                        "copy or behind progressive disclosure, because a bilingual interface that wraps every ",
                        "label onto three lines is not usable in either language.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Alongside the mode, two funny-level sliders from 1 to 5: one for English, one for ",
                        "Cantonese, adjustable independently and persisted separately. Level 1 reads fully ",
                        "professional. Level 5 is maximum playfulness.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "The slider changes voice, never facts",
                    content:
                        "It applies to every category of message with no exemptions, including destructive, financial, security, accessibility and error copy. At every level the message still names what happened, what is affected, which action is irreversible and what the options are, in unambiguous words. A warning nobody can act on is a broken warning, not a funny one.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "An optional spoken narrator is allowed and is off by default. When a user turns it on it ",
                        "speaks English, Cantonese, or both with English first and Cantonese second, strictly ",
                        "serialised, one utterance at a time from a queue that replaces a superseded line rather ",
                        "than stacking it. Its tone follows the same sliders. Error narration stays plain and is ",
                        "never suppressed by the rate limits.",
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
                            term: "Resource separation",
                            description:
                                "Localisation resources stay out of product logic, so copy can change without touching behaviour.",
                        },
                        {
                            term: "Persistence",
                            description:
                                "The mode and both slider values persist. A choice that resets on restart has not been made.",
                        },
                        {
                            term: "Fallback",
                            description:
                                "Deterministic, and never one that changes the meaning of a destructive or security-sensitive message.",
                        },
                        {
                            term: "Disclosure",
                            description:
                                "At first run and in the setting itself, the app states plainly that the funny level styles all messages including errors and warnings, and that it can be changed or reset at any time.",
                        },
                        {
                            term: "Scope",
                            description:
                                "Non-user-facing libraries and infrastructure are exempt until they gain a user-facing surface. Every surface that renders to a person is not.",
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
                        "A missing translation, or an interpolated value left untranslated inside translated text.",
                        "A choice that does not persist, or a broken fallback.",
                        "Safety copy made ambiguous by tone, at any slider level.",
                        "Bilingual overflow: a label clipped, truncated or wrapped past its container because two languages were rendered where one was designed for.",
                        "A single shared slider instead of one per language, or sliders that exist in the settings screen and do not reach the rendered copy.",
                        "A narrator that speaks over a screen reader, stacks queued lines, or has its error narration rate-limited away.",
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
                        "Secrets and private data are never interpolated into translation telemetry or error messages. A translated error is still an error message that may be read by somebody else.",
                        "Humour must not obscure consent, risk, cost or failure. This is a security property as much as a copy one: a confirmation the user misreads is a confirmation that did not happen.",
                        "Accessible names, focus behaviour, reading order, input purpose and contrast are preserved in every mode, including bilingual where the accessible name gets longer.",
                        "A spoken narrator yields to or ducks under an active screen reader, and honours reduced-sound or quiet-hours settings, so it never competes with assistive technology.",
                        "Cantonese copy stays respectful at every level. Humour never targets the user, their data loss, their money or their disability.",
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
                        "All three modes, persistence after a restart, missing-key fallback, variable-length content, keyboard and assistive-technology labels, and common narrow layouts.",
                        "Both sliders at levels 1 through 5, independently, with proof that level 1 is fully professional and that safety-critical copy stays clear at level 5.",
                        "Critical Cantonese copy reviewed for naturalness and precise meaning, not just for grammatical correctness.",
                        "Bilingual mode checked for truncation of primary actions at the narrowest supported width.",
                        "If a narrator ships: off by default, English then Cantonese in the both mode, non-overlapping utterances with superseded lines replaced, error narration clear and never rate-limited, and yielding to screen readers and quiet-hours settings.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "None of this has run",
                    content: "There are no modes and no sliders to test.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-super-confirmation",
            reason: "The clearest case of copy that has to stay exact at every tone level.",
        },
        {
            articleId: "contract-regex-builder",
            reason: "One of the surfaces these modes have to reach, and one whose reference implementation already carries all three.",
        },
        {
            articleId: "contract-appearance-editors",
            reason: "CJK-safe font fallback is where the appearance contract and this one meet.",
        },
    ],

    sources: [
        { label: "design/docs/contracts/localization.md", href: repoFile("design/docs/contracts/localization.md") },
        { label: "packages/ui/src/i18n.ts", href: repoFile("design/packages/ui/src/i18n.ts") },
        { label: "Issue 9", href: issue(9) },
        { label: "Contract index", href: CONTRACTS_URL },
    ],
};
