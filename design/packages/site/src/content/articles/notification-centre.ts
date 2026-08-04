import type { Article } from "../types.js";
import { NOTIFICATION_CENTRE_DOC_URL, repoFile } from "../links.js";

export const notificationCentre: Article = {
    id: "notification-centre",
    title: "The notification centre",
    summary:
        "A toast leaves on purpose, and the one worth reading twice is reliably the one that left. The centre keeps every notice of the session with its level, detail and actions, filterable, searchable and restorable.",
    category: "application",
    status: "shipped",
    statusNote:
        "On the default branch, mounted inside the notification corner the shell already had, and covered by four test files that run in CI, two of them mounting the real components. Its copy is in the language catalogue, so it varies with the mode and both funny levels. There is no committed capture of the panel with a message in it.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The bell in the notification corner already existed and did almost nothing: it showed a ",
                        "count and, behind it, a flat column of message strings with no search, no filter and no ",
                        "way to bring one back. Fifty entries deep that is an archive rather than a review ",
                        "surface, and it is the decorative-control failure one layer in: the thing looked like a ",
                        "notification centre in a screenshot and was not one.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "The badge means raised since you last looked." },
                            " Opening the panel is what marks the history read; not a timer and not a hover. With ",
                            "nothing unread the button falls back to showing how many notices it holds, so it ",
                            "still says what is behind it rather than reading as empty.",
                        ],
                        [
                            { strong: "A restored notice is the notice, not a copy of its text." },
                            " It goes back into the corner with its id and its actions attached, so a retry that ",
                            "was dismissed by a stray click is one press away. A notice already on screen says so ",
                            "rather than offering a button that would do nothing.",
                        ],
                        [
                            { strong: "It is a panel and not a dialog." },
                            " Nothing in it is a decision, so nothing in it blocks and the map keeps working ",
                            "underneath. It opens upward and inward from the corner so it never covers the bell ",
                            "that opened it, and Escape or a click outside returns focus to that bell.",
                        ],
                        [
                            { strong: "Level filters carry their counts, and never vanish at zero." },
                            " A chip that disappears when its count reaches zero is a control the user cannot ",
                            "find again when it stops being zero. Nothing selected means every level, because a ",
                            "filter row with nothing pressed is somebody who has not filtered.",
                        ],
                        [
                            { strong: "The search and the filter compose." },
                            " Both are named in the count line above the list, so a surprising result is explained ",
                            "by reading one sentence rather than by clearing controls one at a time.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A search is tested against the level name, the timestamp, the title, the body, the detail ",
                        "and every action label. The level name is in because it is what somebody types before ",
                        "they notice the chips; the timestamp is in because it narrows a session to an afternoon ",
                        "without a date picker in the way; the detail is in because a stack trace is often the ",
                        "only place a file name appears. That is one line per notice, and it is also exactly the ",
                        "text the regex builder previews against.",
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
                    caption: "The queue's own settings, which the centre reads rather than owns",
                    columns: ["Setting", "Value", "Why"],
                    rows: [
                        ["Information dismisses itself after", "5 seconds", "It informs. Nothing is lost by missing it."],
                        ["Success dismisses itself after", "4 seconds", "It confirms something that already happened."],
                        [
                            "Warning and error",
                            "Never",
                            "A failure that dismisses itself is a failure nobody read. That is what the centre is for.",
                        ],
                        [
                            "History kept",
                            "The most recent 50 of the session",
                            "Bounded so a long session cannot grow without limit, and per session because it is a record of this run rather than a log.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "None of these is user-configurable. The copy action writes the filtered view as Markdown, ",
                        "carrying each notice's level and timestamp, and exports what the panel is showing rather ",
                        "than quietly widening to everything.",
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
                        "A message raised while nothing is mounted is still recorded, which is the difference between a queue and a component.",
                        "An invalid pattern matches nothing rather than falling back to everything.",
                        "A history longer than the panel scrolls inside the panel rather than off the screen, which is asserted from the stylesheet because jsdom computes no layout.",
                        "Nothing has happened yet is a different state from your filter matched nothing, and the panel keeps them distinct so the user can tell which they are looking at.",
                        "Restoring a notice that is already showing is refused with a sentence rather than offered as a button that does nothing.",
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
                        "Nothing reaches the network and nothing is persisted. The history lives for one run of the application.",
                        "Search runs on the local engine under the settings adapter's stated bounds, and no pattern, sample or export is transmitted or written to storage.",
                        "A notice carries text the application composed. Where a message quotes a subsystem, the quoting happens where that subsystem's errors are already turned into sentences, so nothing arrives at the corner as a raw stack, and the centre renders it as text rather than interpreting it.",
                        "Copying is a deliberate export of session diagnostics. It carries exactly what the panel is showing, so a user can see what they are about to paste, which matters because a detail line can contain a local path.",
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
                            { code: "noticeCentre.test.ts" },
                            "What a search reads, one notice staying one line, an empty level selection meaning everything, the filters composing, an uncompilable pattern matching nothing, every level counted even at zero, and the export carrying level and timestamp while honouring the filter.",
                        ],
                        [
                            { code: "NoticeCentrePanel.test.ts" },
                            "Mounted: the history newest first with its actions intact, search over body and detail with an honest count, the shared search field rather than a rebuilt one, the builder previewing against real history, no-match distinguished from nothing-to-show, chips with counts and pressed state, restoring a notice with its id and actions, and the region, group and control naming.",
                        ],
                        [
                            { code: "notificationContract.test.ts" },
                            "Mounted: every level reaching the corner and none reaching a dialog, information and success taking themselves away while warning and error do not, several stacking as siblings, a dismissed notice staying in the history, and the bell present with that history behind it.",
                        ],
                        [
                            { code: "notificationPolicy.test.ts" },
                            "Source policy: every blocking surface in the package declared with the decision it asks for, the notification path itself free of them, nothing anywhere asking for payment, sponsorship, a rating, a subscription or an upgrade, and the corner's layout guarantees read out of the stylesheet.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What the tests do not show",
                    content:
                        "No capture of the panel with real messages in it is committed, so the screenshots on this site show the bell rather than the centre open. Nobody has driven it in an installed build.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "desktop-shell-chrome",
            reason: "The notification corner this is mounted inside, and the queue it reads.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The search field and anchored builder the panel uses.",
        },
        {
            articleId: "destructive-action-gate",
            reason: "The opposite rule: what does block, and the only reason anything is allowed to.",
        },
    ],

    sources: [
        { label: "docs/notification-centre.md", href: NOTIFICATION_CENTRE_DOC_URL },
        {
            label: "packages/ui/src/components/notifications",
            href: repoFile("design/packages/ui/src/components/notifications"),
        },
        {
            label: "packages/ui/src/components/config/notifications.ts",
            href: repoFile("design/packages/ui/src/components/config/notifications.ts"),
        },
    ],
};
