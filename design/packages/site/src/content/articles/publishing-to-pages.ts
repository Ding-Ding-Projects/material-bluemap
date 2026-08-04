import type { Article } from "../types.js";
import { PUBLISHING_TO_PAGES_DOC_URL, RENDER_IN_ACTIONS_DOC_URL, repoFile } from "../links.js";

export const publishingToPages: Article = {
    id: "publishing-to-pages",
    title: "Publishing a map to GitHub Pages",
    summary:
        "Turning a map only this computer can open into a real address anybody can: the compressed-tile flag the whole thing rests on, the marker that stops it replacing somebody else's site, and why GitHub saying built is not the same as the address answering.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The screen and its main-process half are on the default branch and covered by 67 tests against a fake process runner, and the static-host preparation underneath is proved against a real published Pages site. The desktop publish sequence itself has not yet been run end to end against a real GitHub account.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "A finished render is served at an address only the machine that rendered it can open, for as long as that machine stays switched on. This publishes the same files to GitHub Pages instead: the render's web root becomes an orphan commit on a publishing branch, Pages is pointed at that branch, and the published address is then fetched to see whether it actually answers.",
                },
                {
                    kind: "list",
                    items: [
                        "The preflight reports the site's size, its file count, both of GitHub's limits, any map missing files the viewer would ask for, and what gh is on this machine. It writes nothing at all.",
                        "Staging reports files staged out of files total, in batches, because tens of thousands of small tiles is the ordinary case and a spinner over it is indistinguishable from a hang.",
                        "The push is read back from GitHub and the branch head compared to the commit that was just made, so a push that exited zero but did not land is reported as unverified rather than as done.",
                        "The site is called live only when a request to the published URL answered 200. GitHub reporting a build as built is a different claim, and a first build routinely reports built before the address resolves.",
                        "Taking a site down disables Pages and deletes the publishing branch, behind the two-key super-confirmation gate.",
                    ],
                },
            ],
        },
        {
            id: "the-flag",
            title: "The compressed-tile flag",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The engine writes hires tiles gzip-compressed, so the file on disk is 0.prbm.gz. The viewer, by default, asks for 0.prbm, because BlueMap's own web server answers the uncompressed name out of the compressed file. GitHub Pages does not rewrite anything, which is the whole point of it, so a map copied there 404s on every tile.",
                },
                {
                    kind: "paragraph",
                    content:
                        "Publishing sets clientDecompression to true in the web app's settings.json, which makes the viewer ask for the compressed names and inflate them itself. It then verifies that flag against the files actually on disk, because a flag pointing the viewer at files nobody wrote is exactly as broken as the problem it fixes.",
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
                        { term: "branch", description: "gh-pages by default. A name that is not a plain branch name falls back rather than becoming part of a ref it was not meant to be." },
                        { term: "visibility", description: "public or private, used only if the repository has to be created. An existing repository is left exactly as it is." },
                        { term: "work directory", description: "The git directory lives under the application's own data folder. There is never a .git inside a render's output." },
                        { term: "owner", description: "The gh account, or any organisation it can write to." },
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
                        "A publishing branch that exists and carries no marker from this application is refused outright. Nothing is pushed and nothing is deleted, because a publish force-replaces that branch and one mistyped repository name would otherwise destroy somebody's site.",
                        "A file over GitHub's 100 MB per-file limit blocks the publish; GitHub cannot accept it at all.",
                        "A site over the 1 GB GitHub asks Pages sites to stay under is a warning rather than a refusal.",
                        "Pages refused on a private repository is reported as needing a paid plan, which is what a free account's 403 actually means, rather than as an unexplained permission error.",
                        "gh missing, gh signed out and gh ready are three separate situations with three different remedies, and are never collapsed into one.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "No token is read, held, logged or passed as an argument. The API goes through gh api; the push uses git's own credential helper mechanism pointed at gh auth git-credential for that one command, passed with -c so the person's global git config is never modified. Every command is spawned with an argument array and never through a shell, so nothing in a repository or branch name can become part of a command line.",
                },
                {
                    kind: "paragraph",
                    content:
                        "gh auth login is never driven from the application: it suppresses its device-code prompt when stdin is not a terminal, so a spawned copy prints nothing and hangs for ever. The command is named for the person to run in their own terminal, and the result is detected on the next probe.",
                },
                {
                    kind: "paragraph",
                    content:
                        "Publishing to a public repository means every tile, marker and coordinate in the map can be downloaded by anybody who finds the address. That is stated as a warning before the button, and the acknowledgement is never pre-ticked.",
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
                        "The static-host preparation is proved against a real map on a real Pages site: the compressed tile returned 200 with content-type application/gzip and gzip magic bytes, the uncompressed name returned 404, and the BlueMap web app loaded and rendered geometry from Pages in a headless browser. The flag is genuinely load-bearing. The reference article is ",
                        { link: "docs/pages-hosting.md", href: PUBLISHING_TO_PAGES_DOC_URL, external: true },
                        ", and the CI side of the same trap is in ",
                        { link: "docs/render-in-actions.md", href: RENDER_IN_ACTIONS_DOC_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "paragraph",
                    content:
                        "What has not been proved is the desktop sequence itself: gh repo create, the orphan push, enabling Pages, polling and fetching have never been run end to end against a real GitHub account from the application. Every step is unit tested against a fake process runner, deliberately, because the cases worth testing are the ones a working machine cannot produce. Until a real run happens, this is implemented and unproven rather than verified.",
                },
                {
                    kind: "code",
                    language: "text",
                    code: "pnpm exec vitest run packages/app/src/main/pages packages/ui/src/components/pages --silent",
                    caption: "Focused publishing verification",
                },
            ],
        },
    ],
    suggested: [
        { articleId: "render-in-actions", reason: "The other route to a Pages copy, where the runners render and the merge job prepares the site." },
        { articleId: "destructive-action-gate", reason: "The two-key gate that stands in front of taking a published site down." },
        { articleId: "github-sign-in", reason: "The other GitHub credential this application holds, and how it differs from gh's." },
    ],
    sources: [
        { label: "hosting.ts", href: repoFile("design/packages/app/src/main/pages/hosting.ts") },
        { label: "staticHost.ts", href: repoFile("design/packages/render-actions/src/pages/staticHost.ts") },
        { label: "PagesScreen.vue", href: repoFile("design/packages/ui/src/components/pages/PagesScreen.vue") },
        { label: "Publishing to Pages reference", href: PUBLISHING_TO_PAGES_DOC_URL },
    ],
};
