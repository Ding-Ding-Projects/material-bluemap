import type { Article } from "../types.js";
import { repoFile, CI_WORKFLOW_URL, PAGES_WORKFLOW_URL } from "../links.js";

export const screenshotGallery: Article = {
    id: "screenshot-gallery",
    title: "The screenshot harness and this site's gallery",
    summary:
        "Captures of the real running app, taken by Playwright: every menu, dialog, panel and editor the app has, at four window sizes, four display scales and both colour schemes, then pulled into this site.",
    category: "delivery",
    status: "shipped",
    statusNote:
        "The harness runs on every CI run and uploads its images. Whether this particular build of the site has any is stated on the gallery page itself, which never shows a placeholder.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The harness launches the packaged app entry point through Playwright's Electron driver, ",
                        "under a virtual framebuffer, and screenshots what it finds. Every image is the real ",
                        "shipped artefact. None is a mockup, a design file or a hand-edited picture, and there is ",
                        "no other sanctioned way to produce a capture for an issue comment or a release.",
                    ],
                },
                {
                    kind: "table",
                    caption: "What the harness captures on every run",
                    columns: ["Capture set", "What it opens"],
                    rows: [
                        [
                            "Window sizes",
                            "1280 by 800, 1920 by 1080, 1024 by 768, and 800 by 600 as the narrow case where labels clip first",
                        ],
                        ["Display scales", "100, 125, 150 and 200 percent"],
                        ["Colour schemes", "Light and dark, through emulated media preferences"],
                        [
                            "Window chrome",
                            "The application's own Material title bar and its three window buttons, the viewer control bar, and the shell buttons",
                        ],
                        [
                            "First run",
                            "All three setup steps on a throwaway profile, answered the way a cautious person would: the harness declines the Mojang download consent",
                        ],
                        [
                            "The menu",
                            "Its root page and every page below it, plus its search bar and the regex builder anchored to it",
                        ],
                        [
                            "Settings",
                            "The drawer, every section in it scrolled into view, its search, and its regex builder",
                        ],
                        [
                            "The options editor",
                            "Every one of its tabs, its search across all of them, its regex builder, and the gate that guards deleting a map",
                        ],
                        [
                            "The map wizard",
                            "Each step in turn, after a world this repository generated has actually been read off disk",
                        ],
                        [
                            "Dialogs and notices",
                            "The profile manager, the notification corner and its history, and the two-key destructive-action gate in each of its states",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The surfaces are enumerated from the running application rather than from a list in the ",
                        "harness: the settings sections come from their own anchor attributes, the options ",
                        "editor's tabs from its tab strip, and the wizard's steps from whichever step each ",
                        "press of Next actually lands on. A section added to the interface therefore arrives in ",
                        "the capture set on its own.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Each capture is asserted to have produced real bytes, so a zero-length image fails the ",
                        "test rather than being uploaded as evidence of nothing. Alongside the images the harness ",
                        "writes a manifest recording what captured them, by what method, at which commit and which ",
                        "run, the exact viewport and scale lists it drove, and every surface it could not reach.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "A surface it cannot reach is listed, never substituted",
                    content:
                        "Some screens need something the harness deliberately does not have: a signed-in GitHub account, live traffic to github.com, or a render that takes a Java runtime and minutes of work. Each of those is recorded in the manifest under skipped, with the reason, and nothing similar-looking is published in its place. An empty skipped list is the claim that everything was captured; a filled one is the claim that it was not.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "When the interface fails to mount at all, the harness captures the broken window and dumps ",
                        "the page markup beside it, then keeps going. The artefact is uploaded even when the job ",
                        "failed, because a diagnostic image of a broken window is exactly the evidence needed to ",
                        "fix it. That is how two content-security-policy defects were found.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "This site's gallery page is downstream of that. At build time a script asks the forge for ",
                        "the most recent successful run of the checks workflow on the default branch that has a ",
                        "screenshots artifact, downloads it, copies the images into the site, and reads the ",
                        "manifest so every image can be captioned with its window size, display scale and colour ",
                        "scheme.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "No artifact means no gallery, not a placeholder",
                    content:
                        "Artifacts expire after 30 days, and a token without the right access cannot download one. When that happens the page says captures are not available for this build and gives the reason. It never shows stand-in images, because a placeholder in a gallery of real captures is indistinguishable from a real capture to anyone scrolling.",
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
                            term: "Viewports and scales",
                            description:
                                "Constants at the top of the harness spec. They exist to prove the sizing and clipping rules, so adding a supported size means adding it there.",
                        },
                        {
                            term: "Screenshot mode flag",
                            description:
                                "An environment variable the harness sets when launching, so the app can tell it is being captured rather than used.",
                        },
                        {
                            term: "Artifact retention",
                            description:
                                "30 days, set in the workflow. Older runs cannot be used as a source for the gallery no matter how successful they were.",
                        },
                        {
                            term: "Output directory",
                            description:
                                "The fetch script writes images into the site's public directory and a generated manifest module beside the content. Both paths are flags, so a different site layout needs no code change.",
                        },
                    ],
                },
                {
                    kind: "code",
                    language: "sh",
                    caption: "Running the harness locally",
                    code: [
                        "cd design/packages/app",
                        "pnpm run screenshots        # needs a display; CI runs it under xvfb",
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
                            term: "The window never mounts",
                            description:
                                "A diagnostic capture and the page markup are written, the run reports it, and the artifact still uploads. This is the most useful failure the harness has.",
                        },
                        {
                            term: "A capture produces no bytes",
                            description:
                                "The assertion fails. A silently empty image is worse than a missing one because it looks like evidence.",
                        },
                        {
                            term: "No artifact is available at site build time",
                            description:
                                "The gallery renders its unavailable state with the reason: no successful run found, the artifact expired, or the download was refused.",
                        },
                        {
                            term: "An image's configuration cannot be determined",
                            description:
                                "It is still published, captioned as a capture whose configuration is not recorded, rather than being given a guessed window size.",
                        },
                        {
                            term: "A downloaded file is not a decodable image",
                            description:
                                "It is skipped and counted in the script's output. Nothing that failed to decode is written into the gallery.",
                        },
                        {
                            term: "A tab closes while the harness is trying to select it",
                            description:
                                "Browser-style tabs contain their own close button. The harness activates a tab through its label instead of clicking the parent tab's geometric centre, because the centre of a longer label can land on that nested close target. Required app-only surfaces still fail the run if any tab cannot be reached; the timeout and required-surface inventory are not relaxed.",
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
                        "Captures are of a locally built app with no accounts, no credentials and no user data, so there is nothing sensitive in frame.",
                        "The fetch script accepts artifacts only from the project's own repository and only from runs of the named workflow on the default branch.",
                        "Every downloaded file has its PNG header checked before it is copied into the site. Anything that is not a PNG is discarded rather than served.",
                        "Entry paths from the downloaded archive are flattened to their base name, so an archive cannot write outside the target directory.",
                        "Images are served from the site's own origin. Nothing is hotlinked, and the site makes no request to any third party.",
                        "Downloaded images are never committed. They are build inputs from a workflow run, and the repository ignores them.",
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
                        "The harness asserts each capture produced more than a trivial number of bytes.",
                        "It records its own provenance in a manifest: the spec that captured, the method, the commit and the run.",
                        "The gallery page shows that provenance next to the images, so a reader can check which build they are looking at.",
                        "The capture job runs on every CI run, so a regression that blanks the window shows up as an image rather than as a bug report.",
                        "Options-editor tab captures use the visible label as the activation target, keeping each tab's nested close button out of the interaction path while retaining the fail-closed required-surface check.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "What has not been verified",
                    content:
                        "Nothing compares captures between runs, so a visual regression is caught only by somebody looking. There is no image diffing and no baseline set.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "release-pipeline",
            reason: "The workflow the capture job belongs to, and the rest of what a push produces.",
        },
        {
            articleId: "electron-security",
            reason: "The window being captured, and the two defects these captures exposed.",
        },
        {
            articleId: "contract-appearance-editors",
            reason: "What the captured shell is missing, and what the gallery will need to show once it lands.",
        },
    ],

    sources: [
        {
            label: "packages/app/test/screenshots.spec.ts",
            href: repoFile("design/packages/app/test/screenshots.spec.ts"),
        },
        { label: ".github/workflows/ci.yml", href: CI_WORKFLOW_URL },
        { label: ".github/workflows/pages.yml", href: PAGES_WORKFLOW_URL },
        {
            label: "packages/site/scripts/fetch-screenshots.mjs",
            href: repoFile("design/packages/site/scripts/fetch-screenshots.mjs"),
        },
    ],
};
