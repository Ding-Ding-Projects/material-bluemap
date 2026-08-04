import type { Article } from "../types.js";
import { CHANGELOG_VIEWER_DOC_URL, repoFile } from "../links.js";

export const changelogViewer: Article = {
    id: "changelog-viewer",
    title: "The changelog, and the viewer that reads it",
    summary:
        "A changelog generated from the repository's own history and tags, every entry carrying the full SHA of the commit that made it, readable inside the application with a search, a date filter and an export.",
    category: "application",
    status: "shipped",
    statusNote:
        "Both the generator and the viewer are on the default branch, and four test files run in CI, one of which checks every referenced commit against the repository itself. Generation aborts rather than emitting a reference to a commit that cannot be resolved. Nobody has opened the viewer in an installed build.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The record is generated, not written. ",
                        { code: "scripts/build-changelog.mjs" },
                        " reads the repository and writes two files: the scannable ",
                        { code: "CHANGELOG.md" },
                        ", and a compiled module holding the same record plus each commit's full message body, ",
                        "which is what the viewer renders and searches. Neither is edited by hand.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "A version's entries are the commits reachable from its tag and no earlier tag." },
                            " That is deliberately not a range against the previous tag: three tags in this ",
                            "repository sit on a side branch that was merged later, and a simple range would ",
                            "either lose those commits or replay them under a later version.",
                        ],
                        [
                            { strong: "A version's date is the tagged commit's own date." },
                            " Taking the release publication timestamp instead would make generation depend on ",
                            "the network and produce a different file offline.",
                        ],
                        [
                            { strong: "Entries are grouped by the area of the repository they changed" },
                            ", derived from the paths in each commit, and deliberately not classified as ",
                            "features or fixes. The commits carry no such marker, so any label would be inferred ",
                            "from the wording of a subject line, and a changelog that infers eventually says ",
                            "something nobody wrote.",
                        ],
                        [
                            { strong: "A version that shipped with nothing recorded says so." },
                            " A tag can land on a commit an earlier tag already carried. That version keeps its ",
                            "place with an explicit line, because a gap in a version list reads as history that ",
                            "was lost.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The viewer shows every released version rather than only the newest, plus an unreleased ",
                        "section for work that is committed and not yet carried by a published release. Its search ",
                        "is the project's own shared field with the regex builder anchored to it, covering each ",
                        "entry's subject, its full commit message, its short SHA and its full SHA. Its date filter ",
                        "has two typed fields and an anchored calendar with month and year jump, range selection ",
                        "and presets, accepting plain ISO in every locale as well as the active locale's own ",
                        "numeric order, worked out from the platform rather than assumed.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Short on screen, full in the accessible name",
                    content:
                        "A commit reference renders as ten hexadecimal digits and carries all forty in its accessible name and in every export, so a changelog that has left the application is still traceable.",
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "code",
                    language: "sh",
                    caption: "Regenerate after committing, and prove the committed outputs are current",
                    code: ["node scripts/build-changelog.mjs", "node scripts/build-changelog.mjs --check"].join("\n"),
                },
                {
                    kind: "paragraph",
                    content: [
                        "The check compares both outputs against what the current history produces and exits ",
                        "non-zero naming the file that is stale. It needs the full history: a default checkout is ",
                        "a depth-one clone, so a job running it has to ask for the whole thing.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Export",
                            description:
                                "Markdown or plain text, honouring the active filter and any selection. The file states its own scope in its first lines and every entry keeps the full SHA in text.",
                        },
                        {
                            term: "Copy",
                            description:
                                "The desktop shell's own clipboard channel first and the browser's API second. A failure is reported rather than leaving a button that looked like it worked.",
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
                        "An unresolvable commit reference aborts generation. Every SHA is checked against the object database before anything is written, because a wrong SHA is worse than no SHA: it sends the reader somewhere confidently irrelevant.",
                        "Two commits that render the same short form abort generation, rather than shipping two links that look identical.",
                        "A partly typed date is reported as incomplete, the text is left exactly as entered and the range keeps its previous value. An impossible date is reported as one. Nothing is silently applied and nothing is silently discarded.",
                        "A version filtered down to nothing is dropped, while a version that genuinely shipped nothing is kept and labelled. Those two facts must never look the same, so the empty version is hidden while a filter is active: it has no text and no dates in it, so it cannot have matched.",
                        "An empty result names what filtered it and offers to clear the filters, rather than saying no results and leaving a stale date range invisible.",
                        "A clipboard that refuses says so.",
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
                        "Nothing here reaches the network. The changelog is compiled into the bundle, the search runs on the local engine under its stated bounds, and no pattern, sample or export is transmitted, logged or persisted.",
                        [
                            "Commit links open in a new context with ",
                            { code: "rel=\"noopener noreferrer\"" },
                            ", so a navigation cannot replace the application window.",
                        ],
                        "The generated module carries commit subjects and bodies from this repository's own history and is rendered as text, never as markup.",
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
                            { code: "changelogData.test.ts" },
                            "Every referenced commit exists in the repository, every short SHA is a real and unique prefix of its full SHA, each commit appears exactly once, every category is one the viewer can label, and the subjects match the history. The git assertions skip visibly on a shallow clone.",
                        ],
                        [
                            { code: "changelogModel.test.ts" },
                            "The filters compose rather than override, an empty version is kept and marked while unfiltered and dropped while filtered, exports state their range and keep the full SHA in text, and the no-match state is honest.",
                        ],
                        [
                            { code: "changelogDates.test.ts" },
                            "ISO parses in every locale, the locale's own numeric order is read from the platform, incomplete input is distinguished from impossible and from unparsable, no parse returns a day beside an error, the month grid is six consecutive weeks, and the presets are computed against a supplied day rather than the clock.",
                        ],
                        [
                            { code: "ChangelogViewer.test.ts" },
                            "Mounted: every version reaches the page, commit links carry the full SHA, the search narrows and names itself, the date range and search compose, the empty state names both filters and clears them, copying goes through the shell's clipboard channel, a selection narrows the export, and the region, headings and checkbox names are present.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What has not been checked",
                    content:
                        "Nobody has opened the viewer in an installed build and there is no committed capture of it. Its own copy is not in the language catalogue yet, so its strings render their English fallbacks whichever language mode is selected.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "release-pipeline",
            reason: "The tags and releases the changelog is generated from.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The search field and anchored builder the viewer uses.",
        },
        {
            articleId: "command-palette",
            reason: "The other surface built so that knowing a name is enough to find something.",
        },
    ],

    sources: [
        { label: "docs/changelog-viewer.md", href: CHANGELOG_VIEWER_DOC_URL },
        { label: "scripts/build-changelog.mjs", href: repoFile("scripts/build-changelog.mjs") },
        { label: "CHANGELOG.md", href: repoFile("CHANGELOG.md") },
        {
            label: "packages/ui/src/components/changelog",
            href: repoFile("design/packages/ui/src/components/changelog"),
        },
    ],
};
