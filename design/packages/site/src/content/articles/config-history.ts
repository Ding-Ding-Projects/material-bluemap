import type { Article } from "../types.js";
import { CONFIG_HISTORY_DOC_URL, repoFile } from "../links.js";

export const configHistory: Article = {
    id: "config-history",
    title: "Local version history for a config folder",
    summary:
        "Every config folder the app edits gets its own append-only git history, kept beside the app's data rather than inside the folder, where a restore is a new revision and a failed history write never fails a save.",
    category: "application",
    status: "shipped",
    statusNote:
        "On the default branch and mounted as a History tab in the config screen, with 37 tests driving real git repositories in real temporary directories and 37 more over the panel and its filtering model, all in CI. The real-git block skips itself where git is absent, which is the same situation eight further tests cover deliberately; nobody has driven the panel in an installed build, and there is no committed capture of it with revisions in it.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A config folder is small, hand-tuned and easy to break with one save. The editor ",
                        "therefore keeps a history of it: a real git repository, one per folder, holding a ",
                        "mirror of the folder's files on a branch called ",
                        { code: "history" },
                        ". It lives under the application's own data directory, ",
                        { strong: "never" },
                        " as a ",
                        { code: ".git" },
                        " inside the folder somebody chose, because a hidden repository appearing inside a ",
                        "server's config directory is a surprise with consequences.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "It records after a save, and only when something changed." },
                            " The snapshot is fire-and-forget and covers the folder as it actually is, ",
                            "deletions included. An unchanged folder records nothing, so the panel stays a ",
                            "list of real events rather than a list of times somebody pressed Save.",
                        ],
                        [
                            { strong: "A revision says what changed, not that something did." },
                            " Deleted the nether map. Added the nether map, changed the core settings. ",
                            "A history of forty entries reading Updated is an archive nobody opens.",
                        ],
                        [
                            { strong: "Restore is append-only." },
                            " Restoring first snapshots whatever is on disk, so edits made in another ",
                            "program are caught and kept, then writes the old files back through the same ",
                            "guarded write path the editor uses, then records the restore itself as a new ",
                            "revision. There is no reset, no amend and no rebase anywhere in it: an undo can ",
                            "be undone, and that undo undone in turn.",
                        ],
                        [
                            { strong: "Nothing is synced and nothing is pushed." },
                            " The history is local, and the panel states that from the repository's own ",
                            "remote list rather than from a promise in the copy.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The panel is a History tab beside the editor's other screens: browse, diff, restore, ",
                        "label, trim and export. Its date filter is the same advanced calendar picker the ",
                        "changelog viewer uses; its action chips are derived from the revisions actually ",
                        "present, each with its count, so a chip never disappears at zero and a word this ",
                        "build has never heard of is carried through rather than dropped; and its search ",
                        "field carries the full regex builder like every other search surface. All three ",
                        "compose, and none of them undoes another.",
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
                            term: "Where it lives",
                            description:
                                "One repository per config folder under the application's data directory, with the mapping held in an index file written atomically beside them. The repository name is derived from a hash of the folder path, so losing that index loses labels for the mapping rather than the history itself.",
                        },
                        {
                            term: "Retention",
                            description:
                                "The one knob: trim to the newest N revisions, from the panel. It is also the only operation here that deletes anything, so it sits behind the two-key confirmation gate and refuses to discard everything. A retention setting cannot empty a history.",
                        },
                        {
                            term: "Git's own configuration is pinned",
                            description:
                                "Every invocation runs with no global or system config, a forced identity, signing off, autocrlf off and hooks bypassed, so a template, a hook or a signing requirement elsewhere on the machine cannot reshape or break what gets recorded.",
                        },
                        {
                            term: "Export",
                            description:
                                "Markdown, JSON, CSV or plain text, carrying the full hash rather than the short one, stating which slice of the history it holds, and reaching the clipboard as well as a file.",
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
                    kind: "definitions",
                    items: [
                        {
                            term: "The history write fails",
                            description:
                                "The save still succeeds. That is structural rather than conventional: the git runner returns failures as values instead of throwing, every bridge handler resolves, and the snapshot after a save is fire-and-forget. A history that cannot be kept must not turn a save that worked into one that failed.",
                        },
                        {
                            term: "There is no git on the machine",
                            description:
                                "The panel repeats the main process's own reason, says plainly what is lost, and offers no control it cannot honour. Nothing else in the application changes.",
                        },
                        {
                            term: "A restore cannot put every file back",
                            description:
                                "It reports which files failed rather than claiming it succeeded, and the pre-restore snapshot it took first still holds what was on disk.",
                        },
                        {
                            term: "Nothing has been recorded yet",
                            description:
                                "Said as its own state, with how to record the first thing, which is a different sentence from a filter that matched nothing. The panel keeps the two apart so the reader can tell which they are looking at.",
                        },
                        {
                            term: "A revision's timestamp cannot be read",
                            description:
                                "The revision is kept rather than hidden behind a date filter. A record that vanishes because one field is unparseable is the worst outcome for a surface whose whole job is not losing things.",
                        },
                        {
                            term: "An unusable search pattern",
                            description:
                                "Reported, and matched against nothing meanwhile, rather than throwing or silently widening to everything.",
                        },
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
                        "The history is a second copy of the config folder's contents and carries the same sensitivity, because a config file can hold a database connection string. It is kept under the application's own data directory with the same protections as the rest of that data.",
                        "It never leaves the machine. There is no channel through which a remote could even be configured, and the panel reads the repository's remote list to say so rather than asserting it.",
                        "A restore writes only through the config editor's existing guarded write path, so it inherits every path refusal that path already makes. A crafted revision cannot direct a write outside the config folder.",
                        "Trimming is the only destructive operation, and it is declared in the super-confirmation inventory, so a new destructive call in this area cannot slip past unnoticed.",
                        "Search runs locally on the project's bounded regex engine, and nothing typed into the panel is transmitted or persisted.",
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
                            { code: "main/history/ipc.test.ts" },
                            "The append-only contract against real git repositories in real temporary directories: one revision per change with an honest label, nothing recorded when nothing changed, no .git ever created in the user's folder, no remote ever, restore recorded as a new revision, undo of undo of undo, the pre-restore disk snapshot, partial-restore honesty, trim keeping the newest and refusing to empty, and a save surviving a history that fails.",
                        ],
                        [
                            { code: "components/history/historyModel.test.ts" },
                            "The action chips built from the history rather than from a fixed list, counts taken over the whole history so a number does not move as the view narrows, plain text and regex search, the three filters composing without any of them replacing another, a revision with an unreadable timestamp kept, and each export format including a CSV that survives a label with a comma and a quote in it.",
                        ],
                        [
                            { code: "components/history/HistoryPanel.test.ts" },
                            "Mounted: revisions listed by their own labels, the repository location and the local-only claim shown from the remote list, a diff fetched when a revision is expanded and not before, a restore asking a second time and being cancellable, a label written through the host in the user's words, filtering removing rows and saying so when it matches nothing, the no-bridge and no-git states, and the two-key gate in front of trim and nothing else.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What the tests do not show",
                    content: [
                        "The real-git block skips itself on a machine without git, which is exactly the ",
                        "situation the eight no-git tests cover deliberately, so a run there proves less than ",
                        "a run with git present. Nobody has opened the History tab in an installed build, and ",
                        "there is no committed capture of the panel with revisions in it.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The long form, including the exact repository layout and the trailer a restore ",
                        "writes, is in ",
                        { link: "docs/config-history.md", href: CONFIG_HISTORY_DOC_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "options-gui",
            reason: "The editor this tab lives in, and the saves that fill the history.",
        },
        {
            articleId: "destructive-action-gate",
            reason: "The two-key gate in front of trimming, which is the only thing here that removes anything.",
        },
        {
            articleId: "changelog-viewer",
            reason: "The advanced calendar picker this panel's date filter reuses.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The search field and anchored builder on the panel.",
        },
    ],

    sources: [
        { label: "docs/config-history.md", href: CONFIG_HISTORY_DOC_URL },
        {
            label: "packages/app/src/main/history",
            href: repoFile("design/packages/app/src/main/history"),
        },
        {
            label: "packages/ui/src/components/history",
            href: repoFile("design/packages/ui/src/components/history"),
        },
    ],
};
