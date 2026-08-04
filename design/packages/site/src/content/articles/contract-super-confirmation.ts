import type { Article } from "../types.js";
import { repoFile, issue, CONTRACTS_URL } from "../links.js";

export const contractSuperConfirmation: Article = {
    id: "contract-super-confirmation",
    title: "Contract: super confirmation for destructive actions",
    summary:
        "Two independent key controls and a full-range slider before anything irreversible happens, built in the app's own interface, with an emergency exit that always works.",
    category: "contracts",
    status: "specified",
    statusNote:
        "The gate is shipped and documented separately, in both an anchored and a modal presentation over one shared state machine, in front of seven destructive actions, and the contract's own test list has now been run against both cards. What keeps this pending is the coverage clause: a source inventory declares every destructive call site in the application, and two of them, signing out of GitHub and the primitive behind it, are declared as gaps rather than gated. Partial credit does not apply, so this stays specified. Tracked as issue 10.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "This describes a requirement, and two call sites still fall outside it",
                    content: [
                        "It used to say the application had no destructive action to gate at all. Seven of them ",
                        "are gated now, both presentations run one shared state machine, and the test list below ",
                        "has been run against both cards. What is built is documented in ",
                        {
                            link: "the gate's own article",
                            href: repoFile("docs/super-confirmation.md"),
                            external: true,
                        },
                        ". What keeps this pending is that a source inventory declares every destructive call ",
                        "site in the application and two of them are declared as gaps: signing out of GitHub, ",
                        "which revokes the stored token, and the primitive behind that row. Both are confirmed ",
                        "inline in two steps with focus return, and neither is behind the two-key gate. Progress ",
                        "is tracked as ",
                        { link: "issue 10", href: issue(10), external: true },
                        ".",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The gate names the exact action and the exact data it affects. The user then operates two ",
                        "independent key controls, and only once both are set does a full-range slider become ",
                        "usable. Animation communicates arming, progress and completion, so the state of the gate ",
                        "is visible rather than inferred.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "An anchored dialog beside the destructive control is the default. A modal is a fallback for a layout that cannot host an anchored surface.",
                        "An emergency exit is available at every point, alongside the platform's own Escape or back cancellation path.",
                        "Cancelling changes nothing and returns focus to the control the user started from.",
                        "The action runs only when both keys are set and the slider has completed its full range. Nothing partial triggers it.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "It belongs in the app, not beside it",
                    content:
                        "No external CAPTCHA, hosted helper page, separate confirmation application or new window is permitted for this interaction. It lives in the app's own framework and renderer, because a confirmation the user has to leave the app to complete is a confirmation that teaches them to trust a second window.",
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
                            term: "Protected actions",
                            description:
                                "Each destructive operation declares itself, and the feature's documentation records which action is protected and what evidence was gathered.",
                        },
                        {
                            term: "Facts shown",
                            description:
                                "The exact action, the exact affected data, and what is irreversible about it. This is not configurable copy: it is the reason the gate exists.",
                        },
                        {
                            term: "Tone",
                            description:
                                "Follows the language mode and both funny-level sliders like everything else. Animation and playful copy style the experience around facts that do not move.",
                        },
                        {
                            term: "Motion",
                            description:
                                "The dramatic progress and completion animations respect the reduced-motion preference, and the gate remains fully operable without them.",
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
                        "A gate that runs the action on a partial slider, or with only one key set.",
                        "A cancellation path that leaves data changed, or that loses the user's place instead of returning focus to the originating control.",
                        "An emergency exit that is unreachable by keyboard, or that only appears after the action has started.",
                        "Copy where humour has obscured what will be deleted, changed or made irreversible.",
                        "A gate that cannot be operated without a pointer, or that traps focus so Escape does nothing.",
                        "An animation that a reduced-motion preference disables in a way that also disables the control it was decorating.",
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
                        "The gate is a defence against a mistaken click, not against an attacker who already controls the process. It is a usability safety control and is not treated as an authorisation boundary.",
                        "Two independent controls plus a full-range slider exist so that no single accidental input can complete it, which is exactly the failure a single confirm button has.",
                        "The keys, the slider, the progress state, the completion state and the emergency exit all have accessible names and visible focus, so the gate is not weaker for a keyboard or screen-reader user.",
                        "Safety facts stay exact in every language mode and at every funny level. A user who cannot tell what a button will do has not consented to it.",
                        "The gate never performs the destructive action to preview it. A preview describes what would happen; it does not do part of it.",
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
                        "Every incomplete state: untouched, one key only, both keys with a partial slider.",
                        "Successful completion, and the real destructive operation's success and failure paths.",
                        "Cancellation, the Escape or back path, and focus returning to the originating control afterwards.",
                        "Reduced motion, keyboard navigation and screen-reader labels.",
                        "Localised strings in all three modes, at both extremes of both funny-level sliders.",
                        "The affected feature's documentation records which action is protected and what evidence was gathered.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "The list has run; the coverage clause has not been met",
                    content:
                        "Both cards are now driven through untouched, one key, both keys, a partial slider, a full slider, cancellation, the escape path, reduced motion, keyboard-only operation and what assistive technology is told, alongside the real success paths of the operations they guard. The contract is still pending for a different reason: two declared destructive call sites are not behind it, and a gate in front of most destructive actions is a pending contract with a defect rather than a met one.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "destructive-action-gate",
            reason: "What is actually built against this contract, and the two call sites it does not cover.",
        },
        {
            articleId: "contract-localization",
            reason: "The tone rules that this gate's copy has to survive at every level.",
        },
        {
            articleId: "contract-tab-navigation",
            reason: "Bulk closing tabs is the destructive action most likely to reach this gate first.",
        },
        {
            articleId: "embedded-server",
            reason: "The surface that will eventually expose deleting render output and containers.",
        },
    ],

    sources: [
        {
            label: "design/docs/contracts/super-confirmation.md",
            href: repoFile("design/docs/contracts/super-confirmation.md"),
        },
        { label: "Issue 10", href: issue(10) },
        { label: "Contract index", href: CONTRACTS_URL },
    ],
};
