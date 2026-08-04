import type { Article } from "../types.js";
import { SUPER_CONFIRMATION_DOC_URL, issue, repoFile } from "../links.js";

export const destructiveActionGate: Article = {
    id: "destructive-action-gate",
    title: "The two-key gate in front of a destructive action",
    summary:
        "Two independently operated keys, then a slider that has to travel its whole range, in front of seven destructive actions, with an inventory that fails the build when an eighth arrives without one.",
    category: "application",
    status: "shipped",
    statusNote:
        "The gate, both its presentations and the inventory are on the default branch with three test files running in CI, one of which drives both cards through every state. Two destructive call sites are declared as gaps rather than gated: signing out of GitHub, and the primitive behind it. The contract is therefore not met, and this article documents what is built.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The requirement is a list of things that must be true at the moment a destructive action ",
                        "fires, and those are properties of a small state machine rather than of a card layout. ",
                        "So the rule lives in one factory and the two presentations are two skins over it: an ",
                        "anchored menu hanging off the delete button it guards, and a modal dialog for the narrow ",
                        "sheet that has nowhere to anchor a second surface. Two presentations of one rule is the ",
                        "shape that goes wrong: when the rule lives in each component, the first fix lands in one ",
                        "of them, the other keeps the bug, and there is nothing to look at that says which is ",
                        "right.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "Untouched, the gate is locked and the slider cannot move at all.",
                        "One key alone does not arm it, and neither does the same key twice, because they are two separate booleans rather than a counter.",
                        "A slider let go before the end springs back to the start, so a slip cannot destroy anything and a half-finished drag cannot be resumed by a second, smaller one.",
                        "Turning a key back off mid-travel disarms and resets, in the same statement rather than on the next render pass, so nobody can observe a gate that reads as locked and is one nudge from firing.",
                        "Authorisation happens exactly once. A slider that keeps reporting values after it reaches the end must not fire a second delete, and the underlying control emits on both drag and keyboard, so that is reachable.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The completed gate holds briefly and then closes itself, which is what reconciles two ",
                        "requirements that pull in opposite directions: a surface that closes the instant the ",
                        "slider lands shows no completion at all, and one that waits for a click leaves a keyboard ",
                        "user stranded in a card whose only remaining control no longer exits anything. Focus goes ",
                        "back to the control that opened the gate whether it completed or was escaped. That is the ",
                        "part easiest to leave out because nothing looks wrong without it: a mouse user never ",
                        "notices, while a keyboard user finds that cancelling drops focus to the top of the page.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The inventory is the mechanism",
                    content:
                        "Every destructive action is behind the gate is a claim about the next delete button as much as the existing ones, so it is enforced as an inventory. A source scan catches anything shaped like a delete, remove or purge by naming convention rather than by a list of known primitives, plus the handful whose names do not follow it. Every file holding one is declared with how many it holds, what it destroys in words a user would recognise, and where it stands.",
                },
                {
                    kind: "table",
                    caption: "The standings, which are a closed set so the justification is checkable",
                    columns: ["Standing", "What it asserts"],
                    rows: [
                        ["Gated", "The gate stands in front of it, and the declaration names the file holding that gate."],
                        ["Type only", "A declaration of a host method rather than a call to one."],
                        [
                            "Buffer",
                            "Mutates the unsaved in-memory workspace. Nothing has left the disk, and the apply dialog names every file that would actually be deleted before anything is.",
                        ],
                        ["Reversible", "The user can put the state straight back through the same control."],
                        [
                            "Resumable",
                            "Survivable rather than destructive: what was already produced is kept and the work resumes from it.",
                        ],
                        ["Unwired", "Model code with no user-facing caller yet. The gate is owed by whoever wires it."],
                        ["Gap", "Shipped, reachable, and not behind the gate. A defect, named as one."],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Inventing a sixth excuse means editing the union type, which shows up in the diff. Counts ",
                        "are declared per file too, so a second delete cannot hide beside an already-declared one. ",
                        "Gaps are listed a second time in a short list a reviewer reads in full: a gap nobody wrote ",
                        "there fails, and a gap that was fixed and left there fails too.",
                    ],
                },
                {
                    kind: "table",
                    caption: "What is gated today",
                    columns: ["Action", "Where the gate lives"],
                    rows: [
                        ["Removing a saved map or server profile", "The profile manager"],
                        ["Deleting a user-saved appearance preset", "The appearance editor"],
                        ["Deleting a map config", "The maps screen"],
                        ["Deleting a storage config", "The storages screen"],
                        ["A save whose plan takes config files off the disk", "The apply dialog"],
                        ["Clearing every saved viewer setting", "The viewer settings menu"],
                        ["Closing many tabs at once", "The tab close panel"],
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
                        "Nothing here is user-configurable. The slider has to reach its full range, because a gate ",
                        "that fires at ninety per cent is a gate whose last tenth is decoration, and the ",
                        "completion hold is a shared constant so the two cards cannot drift and the tests can ",
                        "advance the clock by the real number rather than by a copy of it.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The facts the gate shows are not configurable copy either: the exact action, the exact ",
                        "affected data and what is irreversible about it are the reason it exists. Tone follows ",
                        "the language mode and both funny levels like everything else, and the catalogue's own ",
                        "test is what keeps a level five gate still naming the file, still saying the delete ",
                        "cannot be undone, and still naming the storage whose tiles are being left behind.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Each card is required, in source, to still contain every part the requirement lists: two ",
                        "key controls, a full-range slider disabled until both are turned, a progress animation, a ",
                        "distinct completion animation, an emergency exit with a large enough target, an escape ",
                        "path, focus returned on close, a live status region, accessible names on the surface and ",
                        "the slider, a spoken position, and a reduced-motion block. Each of those can be deleted ",
                        "without breaking anything that looks broken, which is why they are asserted by name.",
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
                        "A partial slider, or one key, fires nothing. The disabled state is the visible guard rather than the real one: the travel function refuses regardless.",
                        "A key turned back off mid-travel resets the travel synchronously, so no caller can observe a locked gate that is nearly complete.",
                        "A slider that keeps reporting after the end has its second report refused, and the action runs once.",
                        "A reopened gate is reset on open, so it is never found part-way through.",
                        "Escape and the emergency exit change nothing and return focus to the control the user started from.",
                        "An authorised gate whose keys are then flipped is left alone, because the full bar is the completion state and flipping a switch afterwards should not rewind the record of something that has already happened.",
                        "A destructive call site nobody declared fails the build with the file, the count, and what to do about it.",
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
                        "The gate is a defence against a mistaken click, not against an attacker who already controls the process. It is a usability safety control and is not an authorisation boundary.",
                        "Two independent controls plus a full-range slider exist so that no single accidental input can complete it, which is exactly the failure a single confirm button has.",
                        "The keys, the slider, the progress and completion states and the emergency exit all have accessible names and visible focus, so the gate is not weaker for a keyboard or screen-reader user.",
                        "The gate never performs part of the destructive action in order to preview it. The one place a preview is large, the bulk close, is a plan computed without touching a tab, and the same plan object is what runs.",
                        "It lives in the application's own renderer. No external service, hosted helper page or second window is involved, because a confirmation the user has to leave the application to complete teaches them to trust a second window.",
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
                            { code: "superConfirmGate.test.ts" },
                            ": the state machine, from untouched through one key, both keys, a partial slider, a ",
                            "key turned back off and reset, plus the values a screen reader is given, the ",
                            "completion hold, and focus returning to where it came from.",
                        ],
                        [
                            { code: "superConfirm.test.ts" },
                            ": both cards, mounted, through untouched, one key, both keys, a partial slider, a full ",
                            "slider, cancelling, escape, reduced motion, keyboard only, and what assistive ",
                            "technology is told. Then the real operations: the facts shown being the caller's ",
                            "rather than the gate's, removing a saved map or server actually removing it and only ",
                            "then, deleting a map config, and the save that takes files off the disk.",
                        ],
                        [
                            { code: "superConfirmPolicy.test.ts" },
                            ": no undeclared destructive call site, per-file counts that cannot drift, every ",
                            "declaration naming what it destroys, every gated entry pointing at a file that really ",
                            "holds a gate, every ungated entry justifying its standing at length, the gap list ",
                            "exactly as long as the gaps, exactly two gate components, both on the shared state ",
                            "machine, and every required part still present in each card.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Two gaps, stated rather than hidden",
                    content: [
                        "Signing out of GitHub revokes the stored token and, when GitHub honours the revocation, ",
                        "the grant on the account. It is confirmed inline in two steps with focus return, and it ",
                        "is not behind the two-key gate. Both the row and the primitive behind it are declared as ",
                        "gaps and are tracked as ",
                        { link: "issue 10", href: issue(10), external: true },
                        ". Nobody has driven either card in an installed build.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-super-confirmation",
            reason: "The full contract, its own test list, and why partial credit does not apply.",
        },
        {
            articleId: "tabbed-shell",
            reason: "The bulk closes that are the largest thing behind this gate.",
        },
        {
            articleId: "language-and-tone",
            reason: "Why a gate at the funniest setting still names the file it is about to delete.",
        },
    ],

    sources: [
        { label: "docs/super-confirmation.md", href: SUPER_CONFIRMATION_DOC_URL },
        {
            label: "packages/ui/src/components/confirm",
            href: repoFile("design/packages/ui/src/components/confirm"),
        },
        { label: "Issue 10", href: issue(10) },
    ],
};
