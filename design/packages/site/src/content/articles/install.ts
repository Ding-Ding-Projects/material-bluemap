import type { Article } from "../types.js";
import { repoFile, RELEASES_URL, PAGES_WORKFLOW_URL } from "../links.js";

export const install: Article = {
    id: "install",
    title: "Installing the desktop app, and the download button",
    summary:
        "What the installer actually gives you today, and how the Home page decides whether it is allowed to offer one at all.",
    category: "delivery",
    status: "shipped",
    statusNote:
        "The Windows installer is published by CI and the download button is wired to a verified release asset. Windows is the only packaged platform, and the app cannot render a local world yet.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Know what you are installing",
                    content:
                        "This installs a viewer that can browse a BlueMap server somebody else is running. It cannot render your own world: the mesher and the render pipeline do not exist yet. Install it to look at the shell and at remote maps, not to make a map.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "The Windows build is a Squirrel installer. It installs per user, so it needs no ",
                        "administrator rights, and it puts the app in the usual per-user application directory with ",
                        "an Add or Remove Programs entry.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The download button on the Home page is generated at build time, not written by hand. A ",
                        "script asks the forge for the newest published release, checks that a real Squirrel ",
                        "installer asset is attached to it, and writes the result into the site. The button renders ",
                        "only from that verified result.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "The release must be published and not a draft. A draft is invisible to anyone who is not a maintainer.",
                        "It must carry an installer asset that names itself as a setup executable, with a plausible size rather than a stub.",
                        [
                            "It must also carry the Squirrel companions that prove the asset is what it claims: a ",
                            { code: "RELEASES" },
                            " manifest and a ",
                            { code: ".nupkg" },
                            " package.",
                        ],
                        "The download URL is the one the API returned for that asset, used verbatim. It is never assembled from a tag and a guessed filename.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "If any check fails, the button is absent and the page says a verified release is not ",
                        "available, with the reason. An absent button is correct. A button pointing at a URL nobody ",
                        "proved exists is not.",
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
                            term: "Platform",
                            description:
                                "Windows on x64. macOS and Linux packaging land in a later phase, and until they do the page says so rather than offering a build that does not exist.",
                        },
                        {
                            term: "Updates",
                            description: [
                                "Squirrel emits the ",
                                { code: "RELEASES" },
                                " and package pair that an updater consumes. Nothing in the app checks for updates ",
                                "yet: the update checker is Phase I.",
                            ],
                        },
                        {
                            term: "Uninstalling",
                            description:
                                "Through the operating system's own applications list, like any per-user install.",
                        },
                        {
                            term: "Build from source instead",
                            description:
                                "Node 22 or newer and pnpm 10, with the submodules initialised. The Home page has the exact commands.",
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
                            term: "SmartScreen warns on first run",
                            description:
                                "Expected. The installer is not code signed, so Windows reports an unrecognised publisher. Verify you downloaded it from the project's own releases page before continuing.",
                        },
                        {
                            term: "The download button is not on the page",
                            description:
                                "No release passed verification when this build of the site was made. The page states the reason, and the releases page always has whatever actually exists.",
                        },
                        {
                            term: "The app window opens blank",
                            description:
                                "A known class of defect, caused by the renderer being refused its own bundle or by a policy violation. Both are tracked in the issue tracker, and the Electron security article explains why the policy is not simply loosened.",
                        },
                        {
                            term: "A local world does not appear",
                            description:
                                "There is no local rendering. This is not a defect to report: it is Phases D and E, and they have not been built.",
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
                        "Installers are unsigned. That is the honest state, and it means the usual advice applies with more force: download only from the project's own releases page.",
                        "The download link is an immutable release asset URL taken verbatim from the API, so it points at a specific published asset rather than a mutable latest alias.",
                        "The site fetches nothing at runtime. The release data is baked in at build time, so opening the page contacts no third party and no forge API.",
                        "The button states the version, the platform, the architecture and the file size before the user clicks, so what arrives is what was described.",
                        "The button is an ordinary link with an accessible name that includes the version and platform, is keyboard reachable with visible focus, and is not a scripted download.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Nothing here proves the binary is safe",
                    content:
                        "Verification here means the release and its asset exist and are shaped like a Squirrel installer. It is not a signature check and it is not an antivirus scan. It stops the site inventing a URL, which is the failure it was built to prevent.",
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
                        "The fetch script fails closed: any missing field, any absent asset, any failed request produces the unavailable state rather than a partial one.",
                        "It refuses drafts and prereleases, and it will not accept an installer that is implausibly small.",
                        "It requires the Squirrel manifest and package alongside the setup executable, so an unrelated executable attached to a release cannot be mistaken for the installer.",
                        "The version committed to the repository is deliberately the unavailable state, so a build that did not run the script cannot ship a stale pointer.",
                        "The deploy workflow runs the script before every build, so the deployed site's button always reflects a release that was verified during that run.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "release-pipeline",
            reason: "How the installer this button points at is built, tagged and published.",
        },
        {
            articleId: "viewer-remote-mode",
            reason: "The one thing the installed app can do end to end today.",
        },
        {
            articleId: "electron-security",
            reason: "What the installed app does to protect you from the servers it connects to.",
        },
    ],

    sources: [
        { label: "Releases", href: RELEASES_URL },
        { label: "packages/site/scripts/fetch-release.mjs", href: repoFile("design/packages/site/scripts/fetch-release.mjs") },
        {
            label: "packages/app/electron-builder.config.cjs",
            href: repoFile("design/packages/app/electron-builder.config.cjs"),
        },
        { label: ".github/workflows/pages.yml", href: PAGES_WORKFLOW_URL },
    ],
};
