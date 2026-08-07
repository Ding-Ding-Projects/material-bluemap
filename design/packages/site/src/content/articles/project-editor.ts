import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const projectEditor: Article = {
    id: "project-editor",
    title: "Editing a project",
    summary:
        "Maps, storages, render options and whole-file settings in a nested tab strip whose pointer, keyboard, focus and narrow-layout behavior is exercised against the real application shell.",
    category: "application",
    status: "shipped",
    statusNote:
        "Mounted in the desktop shell; focused Project Editor, shell-integration, sizing and type checks pass. A packaged hidden-desktop capture remains separate runtime evidence.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A project holds the repeatable description of a render: maps, storages, render options and four whole-file BlueMap settings. Its own browser-style tab strip is nested inside the application shell without losing pointer or keyboard input.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "The shell alone opts into map-panel pointer pass-through; every nested tab panel explicitly keeps ordinary pointer input.",
                        "Enter and Space activate the focused tab without opening a menu or invisible overlay.",
                        "Add a map opens an inline form and focuses its first field. A BlueMap-derived preset creates editable maps, selects the first one and focuses its name.",
                        "Save is deliberate and recorded in append-only project history; changing tabs never implies a save.",
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
                        { term: "Layout key", description: "worldlens-project-editor-tabs, isolated from the shell and every other settings surface." },
                        { term: "Sections", description: "Maps, Storages, How it renders, History, Core, Web app, Web server and Plugin." },
                        { term: "Pointer boundary", description: "A typed host prop controls pass-through; nested panels default to pointer-events auto." },
                        { term: "Responsive floor", description: "Primary controls retain 44 CSS-pixel targets, wrap long labels and stack the editor at narrow container widths." },
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
                        "A broad shell selector can make a nested editor look interactive while every pointer press falls through. The typed boundary and mounted shell test guard that regression.",
                        "A tab key handler can confuse activation with a menu gesture. Enter and Space are tested against the real nested strip and leave no active overlay.",
                        "A form that replaces its opener without moving focus strands a keyboard user. Add and preset routes focus the first editable field after render.",
                        "Long bilingual labels can crowd the map list and actions. Container breakpoints stack those regions and bound overlays to the viewport with internal scrolling.",
                        "A save refusal remains visible as the host's exact error; the editor never infers success from a stopped progress bar.",
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
                    content: [
                        "The pointer fix grants input only to the visible nested panel and adds no bridge privilege. Project persistence still uses the validated project path and append-only local history. Map removal keeps its destructive confirmation and does not delete already-rendered tiles silently.",
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
                        "ProjectEditor.test.ts covers pointer, Enter and Space activation, Add-form focus, presets, post-preset editability and save/revert states.",
                        "App.test.ts mounts the real shell and editor together, proves only the outer panel passes pointer input through, and clicks Core, Maps and Add map.",
                        "projectSurfaceSizing.test.ts inventories 44-pixel targets, responsive stacking, wrapping and viewport-bounded overlays.",
                        "The UI typecheck proves the typed panel boundary and component contracts compile together.",
                    ],
                },
            ],
        },
    ],
    suggested: [
        { articleId: "tabbed-shell", reason: "The shared tab model and edge placement this editor nests." },
        { articleId: "config-history", reason: "The append-only history model project saves use." },
        { articleId: "world-discovery", reason: "The discovery path that opens a world in this editor." },
    ],
    sources: [
        { label: "docs/project-editor.md", href: repoFile("docs/project-editor.md") },
        { label: "ProjectEditor.vue", href: repoFile("design/packages/ui/src/components/project/ProjectEditor.vue") },
        { label: "App.test.ts", href: repoFile("design/packages/ui/src/App.test.ts") },
    ],
};
