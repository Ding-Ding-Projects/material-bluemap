import type { Article } from "../types.js";
import { repoFile, ACTIONS_URL, RELEASES_URL, CI_WORKFLOW_URL, PAGES_WORKFLOW_URL } from "../links.js";

export const releasePipeline: Article = {
    id: "release-pipeline",
    title: "Releases, installers and the line count",
    summary:
        "Every push to the default branch that passes lint, build and tests publishes a uniquely tagged release with a real Windows installer and a line-count table measured at that commit.",
    category: "delivery",
    status: "shipped",
    statusNote:
        "The workflow is on the default branch and has published releases. Windows is the only packaged platform today.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "One workflow runs on every push and every pull request, in four jobs. Nothing downstream ",
                        "starts until the checks pass, so a release exists only because the tests passed first.",
                    ],
                },
                {
                    kind: "table",
                    caption: "Continuous integration jobs and what each one produces",
                    columns: ["Job", "Runner", "What it does"],
                    rows: [
                        [
                            { code: "check" },
                            "Ubuntu",
                            "Installs from the frozen lockfile, then lint, build and the full test suite across the workspace.",
                        ],
                        [
                            { code: "package" },
                            "Windows",
                            "Builds the workspace, then the Squirrel.Windows installer, and fails loudly if no installer artefact was produced.",
                        ],
                        [
                            { code: "screenshots" },
                            "Ubuntu",
                            "Launches the real app under a virtual framebuffer and captures it, uploading the images even when the capture failed.",
                        ],
                        [
                            { code: "release" },
                            "Ubuntu",
                            "Only on the default branch, and only when it is not a pull request. Tags, composes notes and publishes.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The tag is the app version plus the run number, so it is monotonic and never reused. The ",
                        "release job checks the tag does not already exist and refuses to run rather than recycling ",
                        "a published release. After publishing it reads the release back and fails if it came out ",
                        "as a draft.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Windows packaging uses Squirrel rather than NSIS, because Squirrel also emits the ",
                        { code: "RELEASES" },
                        " file and the ",
                        { code: ".nupkg" },
                        " pair that Electron's own updater consumes later. The installer, its execution stub, the ",
                        "package and the release manifest are all attached to the release.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every release carries a line-count table produced by a committed script, run by the same ",
                        "job that built the artefacts, at exactly the commit being released. Nobody types the ",
                        "number. The script counts lines the way git counts them, attributes each surviving line ",
                        "with blame rather than by summing added lines from the log, prints every exclusion with ",
                        "the number of files it removed, and exits non-zero if the category totals and the ",
                        "authorship totals disagree.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A second workflow builds and deploys this documentation site. It runs on pushes to the ",
                        "default branch and on manual dispatch, fetches the release and screenshot data described ",
                        "elsewhere in these articles, builds the site and asserts that the built output actually ",
                        "carries the project subpath before deploying.",
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
                            term: "Triggers",
                            description:
                                "Push and pull request for the checks, plus manual dispatch. The release job additionally requires the default branch and a non-pull-request event.",
                        },
                        {
                            term: "Concurrency",
                            description:
                                "A later push supersedes an in-flight run on the same ref, except on the default branch, where every push is meant to produce its own release.",
                        },
                        {
                            term: "Token",
                            description:
                                "Resolved as an optional repository-scoped token, then the organisation token, then the workflow token. Publishing needs more than the ephemeral workflow token is always granted.",
                        },
                        {
                            term: "Release code name",
                            description:
                                "Each release gets a dim sum dish as a code name, resolved from a public photo catalog by release ordinal. It is decoration beside the version, never a replacement for it, and it is explicitly allowed to fail without blocking the release.",
                        },
                    ],
                },
                {
                    kind: "code",
                    language: "sh",
                    caption: "Reproducing the release line count locally",
                    code: [
                        "node scripts/count-lines.mjs",
                        "node scripts/count-lines.mjs --format=markdown   # exactly what the notes carry",
                        "node scripts/count-lines.mjs --no-blame          # fast, and says so in the output",
                    ].join("\n"),
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
                            term: "A test fails",
                            description:
                                "Nothing downstream runs, so there is no installer and no release. A push that produces no release because tests failed is the pipeline working.",
                        },
                        {
                            term: "The packager produced no installer",
                            description:
                                "The collect step fails with an explicit error rather than uploading an empty artefact and publishing a release with nothing in it.",
                        },
                        {
                            term: "The tag already exists",
                            description:
                                "The release job stops. Recycling a tag would make two different builds indistinguishable, which is the one job a tag has.",
                        },
                        {
                            term: "The release published as a draft",
                            description:
                                "The verification step fails. A draft is invisible to everyone who is not a maintainer, so a silent draft is the same as no release.",
                        },
                        {
                            term: "The code-name photo cannot be resolved",
                            description:
                                "The release publishes anyway, and the notes say plainly that no photo is attached and where the failure is logged. No substitute is generated.",
                        },
                        {
                            term: "The line counter disagrees with itself",
                            description:
                                "It exits non-zero and the release fails. An unexplained gap between two numbers in the same table destroys the credibility of both.",
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
                        "Every job runs on a GitHub-hosted runner. No self-hosted runner is attached, so no workflow trigger can put code on a machine somebody else depends on.",
                        "The default permission is read. Only the release job asks for write, and only to contents.",
                        "Tokens are passed through the standard environment convention and never echoed, logged or written into release notes.",
                        "Installers are unsigned today. Windows SmartScreen will warn on first run, and that is the honest state rather than something to work around.",
                        "The vendored upstream Java reference is a large submodule that nothing in the build reads, so it is deliberately not checked out. Less code fetched is less code trusted.",
                        "Release assets are immutable once published. Nothing in the pipeline overwrites an asset on an existing release.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Verify what you download",
                    content: [
                        "Installer assets are published straight from CI without code signing. Download only from ",
                        "the project's own releases page, and treat an installer offered anywhere else as ",
                        "unrelated to this project.",
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
                        "The pipeline has published tagged releases carrying a Squirrel installer, its execution stub, the package and the release manifest.",
                        "The release job reads back the published release and fails on a draft, so publication is proved rather than assumed.",
                        "The line counter self-checks its own arithmetic and fails the job on a mismatch.",
                        "The site deploy asserts the built output carries the project subpath, because a site that deploys green and 404s on every page is the failure this catches.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Run history is public at ",
                        { link: "the Actions tab", href: ACTIONS_URL, external: true },
                        " and published builds at ",
                        { link: "the releases page", href: RELEASES_URL, external: true },
                        ". This site does not restate a run's status, because a page that claims a build is green ",
                        "is claiming something it cannot know at the time it was built.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "screenshot-gallery",
            reason: "The capture job in the same workflow, and where its artifact ends up on this site.",
        },
        {
            articleId: "electron-security",
            reason: "What is inside the installer this pipeline publishes.",
        },
        {
            articleId: "resource-packs",
            reason: "An example of code that ships behind a green suite while its own exit criteria are still open.",
        },
    ],

    sources: [
        { label: ".github/workflows/ci.yml", href: CI_WORKFLOW_URL },
        { label: ".github/workflows/pages.yml", href: PAGES_WORKFLOW_URL },
        { label: "scripts/count-lines.mjs", href: repoFile("scripts/count-lines.mjs") },
        {
            label: "packages/app/electron-builder.config.cjs",
            href: repoFile("design/packages/app/electron-builder.config.cjs"),
        },
    ],
};
