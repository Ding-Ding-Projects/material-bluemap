import type { Article } from "../types.js";
import { PANEL_GEOMETRY_DOC_URL, repoFile } from "../links.js";

export const panelGeometry: Article = {
    id: "panel-geometry",
    title: "Resizable and draggable panels",
    summary:
        "Every panel resizes; floating interactive panels also drag, remain viewport-bounded, persist per surface and reset through visible and keyboard controls.",
    category: "application",
    status: "shipped",
    statusNote:
        "The shared controller is attached to the four hand-written panel classes and covered by persistence, bounds, reset and keyboard tests plus compact runtime captures.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Settings panels and ordinary page panels resize in place. Anchored interactive panels and overlays also move by a visible drag toolbar. Geometry is versioned per stable surface ID, constrained to the current viewport and restored on the next visit.",
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Use the visible wider, taller, smaller and reset controls in each panel toolbar.",
                        "Drag a floating panel by the toolbar. Alt+Arrow moves it; Alt+Shift+Arrow resizes any focused panel.",
                        "Reset removes only that panel's saved geometry and returns it to its responsive or anchored layout.",
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
                        "Malformed or incomplete saved geometry is ignored.",
                        "Oversized or off-screen geometry is clamped inside a 12-pixel viewport margin.",
                        "Compact anchored panels retain their sheet fallback and scroll internally when content cannot fit.",
                        "Page renderers receive the toolbar after rendering, so replacing panel contents cannot erase it.",
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
                        "Saved geometry contains only dimensions and optional screen-relative coordinates. It stays in namespaced browser storage and cannot contain content, selectors, URLs or executable text.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "PanelGeometry.test.ts covers controls, keyboard movement and resizing, persistence, restore, viewport bounds and reset. The explicit coverage list names anchored panels, overlays, site tab panels and settings tab panels and reads every owner to prove the shared controller is attached.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "pages-feature-parity",
            reason: "The browser-wide feature and proof inventory.",
        },
        {
            articleId: "appearance-editor",
            reason: "A floating panel that uses the shared geometry.",
        },
        {
            articleId: "tabbed-shell",
            reason: "The page and settings panels covered by the controller.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "Anchored builder panels using the same bounds.",
        },
    ],
    sources: [
        { label: "docs/panel-geometry.md", href: PANEL_GEOMETRY_DOC_URL },
        {
            label: "Panel geometry controller",
            href: repoFile("design/packages/site/src/platform/PanelGeometry.ts"),
        },
        {
            label: "Panel coverage inventory",
            href: repoFile("design/packages/site/src/platform/panelGeometryCoverage.ts"),
        },
    ],
};
