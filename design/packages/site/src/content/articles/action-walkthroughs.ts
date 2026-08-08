import type { Article } from "../types.js";
import { ACTION_WALKTHROUGHS_DOC_URL, repoFile } from "../links.js";

export const actionWalkthroughs: Article = {
    id: "action-walkthroughs",
    title: "Action walkthrough animations",
    summary:
        "Twelve finite, silent and lazy-loaded GIF walkthroughs demonstrate distinct Worldlens actions, each paired with a static reduced-motion fallback.",
    category: "application",
    status: "shipped",
    statusNote:
        "The inventory, local media, static fallbacks, finite playback, responsive gallery and decode/size/coverage tests ship with the Pages build.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The Home page contains twelve compact walkthrough cards. Each card demonstrates one named action, reserves its 640 by 400 frame before loading, plays silently once, can be replayed deliberately, and opens the detailed article for the feature it shows.",
                },
                {
                    kind: "list",
                    items: [
                        "Adaptive navigation, command palette, documentation search and the anchored regex builder.",
                        "Theme, language and tone, tab groups and master tab discovery.",
                        "Notification history, changelog filtering, per-element appearance and verified release downloads.",
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
                    content:
                        "There is no animation preference stored by the site. The visitor's operating-system reduced-motion preference is authoritative: a picture source swaps every GIF for its paired PNG without downloading or playing the animation. Replay is a deliberate button and does nothing in reduced-motion mode.",
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
                        "A missing GIF or still image fails the walkthrough inventory test and the production build rather than leaving an empty card.",
                        "A corrupt header, wrong dimensions, oversized file or duplicate action id fails before publication.",
                        "Native lazy loading can be unavailable in an older browser; the image still loads and the reserved dimensions still prevent layout shift.",
                        "If JavaScript is unavailable, the site's documented noscript surface remains the fallback; no animation is needed to reach repository documentation.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "All GIF and PNG files are bundled into the static build. They make no network request, contain no audio, analytics, account data, access token or user-entered value, and cannot execute code. Capture provenance is documented separately from runtime proof so an explanatory animation is never presented as deployment evidence.",
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
                        "walkthroughs.test.ts verifies twelve unique action/media ids, bilingual alt text, exact 640 by 400 GIF and PNG headers, individual and total size budgets, finite playback, lazy decoding and reduced-motion sources.",
                        "The gallery contract reserves aspect ratio, uses a narrow-safe auto-fit grid, wraps long bilingual copy and stacks actions below the 30rem container threshold.",
                        "build-walkthrough-gifs.mjs creates media only from ordered PNG capture frames and emits a still from the final frame. The source capture ledger names the real built-app or built-site frame used for every action.",
                    ],
                },
            ],
        },
    ],
    suggested: [
        { articleId: "pages-feature-parity", reason: "The complete Pages capability inventory." },
        { articleId: "command-palette", reason: "The global action shown in one walkthrough." },
        { articleId: "appearance-editor", reason: "The live per-element editor shown in another." },
        {
            articleId: "language-and-tone",
            reason: "The bilingual and independent-tone behaviour used by every caption.",
        },
    ],
    sources: [
        { label: "Action walkthrough documentation", href: ACTION_WALKTHROUGHS_DOC_URL },
        {
            label: "Walkthrough inventory",
            href: repoFile("design/packages/site/src/walkthroughs/manifest.ts"),
        },
        {
            label: "GIF builder",
            href: repoFile("design/packages/site/scripts/build-walkthrough-gifs.mjs"),
        },
    ],
};
