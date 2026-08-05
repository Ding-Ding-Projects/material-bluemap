import type { Article } from "../types.js";
import { RENDER_CONSOLE_DOC_URL, repoFile } from "../links.js";

export const renderConsole: Article = {
    id: "render-console",
    title: "The render console",
    summary:
        "A bounded, searchable render log that keeps the first useful failure, says what it dropped, and does not yank a reader back to the bottom while the engine is still talking.",
    category: "application",
    status: "shipped",
    statusNote:
        "The console is mounted by the render screen on the default branch and is covered by component and model tests that run in the workspace gate.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Every line shows a written level beside its theme colour, so colour is helpful but never the only signal.",
                        "The view follows new output only when it was already at the bottom; a detached reader stays detached until Jump to latest is chosen.",
                        "The 10,000-line cap is visible through a dropped-line count, and advice can open the exact setting it names.",
                        "Copy and Markdown export preserve timestamps, levels and text from the visible selection.",
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
                        { term: "cap", description: "10,000 lines by default; callers can lower or raise it for a bounded surface." },
                        { term: "height", description: "A responsive clamp keeps the console usable at narrow windows and large text scales." },
                        { term: "search", description: "The shared local field and adjacent regex builder; plain text is the default." },
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
                        "Dropped lines are reported rather than presented as if the visible slice were complete.",
                        "Invalid regex matches nothing, never everything.",
                        "A missing advice target is reported as unavailable instead of silently opening a nearby setting.",
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
                        "Engine output is inserted as text, not HTML, so a log line cannot inject markup. Copy and export stay local, and regex evaluation uses the same bounded engine as the other settings searches.",
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
                        "The component and model suites cover selection, level labels, follow/detach behaviour, dropped-line accounting, advice navigation, reduced motion, copy/export and invalid patterns. The source article is ",
                        { link: "docs/render-console.md", href: RENDER_CONSOLE_DOC_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "code",
                    language: "text",
                    code: "pnpm exec vitest run packages/ui/src/components/console --silent",
                    caption: "Focused console verification",
                },
            ],
        },
    ],
    suggested: [
        { articleId: "render-in-actions", reason: "The same progress model when a render runs in GitHub Actions." },
        { articleId: "viewer-remote-mode", reason: "How the finished map is served once rendering completes." },
        { articleId: "regex-builder-surfaces", reason: "The full builder behind the console's search field." },
        { articleId: "automatic-repair", reason: "What happens next when the run this console is watching fails to start." },
    ],
    sources: [
        { label: "RenderConsole.vue", href: repoFile("design/packages/ui/src/components/console/RenderConsole.vue") },
        { label: "consoleModel.ts", href: repoFile("design/packages/ui/src/components/console/consoleModel.ts") },
        { label: "Render console reference", href: RENDER_CONSOLE_DOC_URL },
    ],
};
