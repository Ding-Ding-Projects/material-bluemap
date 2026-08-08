import type { Article } from "../types.js";
import { PAGES_FEATURE_PARITY_DOC_URL, repoFile } from "../links.js";
import { PAGES_FEATURE_COVERAGE } from "../../policy/globalFeatureCoverage.js";

const implementedRows = PAGES_FEATURE_COVERAGE.filter((item) => item.status === "implemented").map(
    (item) => [item.title, "Implemented", item.implementation.join(", ")],
);

const boundaryRows = PAGES_FEATURE_COVERAGE.filter((item) => item.status !== "implemented").map(
    (item) => [
        item.title,
        item.status === "not-applicable" ? "Not applicable" : "Optional, not enabled",
        item.reason,
    ],
);

export const pagesFeatureParity: Article = {
    id: "pages-feature-parity",
    title: "GitHub Pages feature parity",
    summary:
        "A hand-written, tested account of the user-facing contracts this documentation site implements, including a collapsible persisted mobile side rail and explicit browser-platform boundaries.",
    category: "application",
    status: "shipped",
    statusNote:
        "The inventory and responsive navigation are implemented and locally covered. Compact headless captures and the exact live Pages deployment are recorded separately because source and local builds are not deployment proof.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The site is a user-facing application. Its settings, tabs, searches, appearance editors, notifications, changelog and documentation are real interactive surfaces, so the same requirements apply to each one. The left and right tab rails now carry a persistent collapse control; a compact first visit starts collapsed and always leaves an expand button in reach.",
                },
                {
                    kind: "table",
                    caption: "Applicable shared features and the source that owns them",
                    columns: ["Feature", "Status", "Implementation evidence"],
                    rows: implementedRows,
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
                        "Settings → General → Navigation stores the tab edge and the side-navigation collapse choice.",
                        "The collapse control is present only for left and right placements. Top and bottom remain complete horizontal strips.",
                        "Ctrl+Shift+F opens the command palette whether the rail is open or closed, and selecting a setting teleports to its exact row.",
                        "Language, both funny levels, theme, density, accent, typography, appearance presets, import, export and reset remain available from the Settings tab.",
                        "Settings → Schedules creates bounded, versioned language and appearance rules driven by local time windows, bounded JSON APIs, or Home Assistant boolean entities.",
                        "Every panel class uses shared viewport-bounded geometry: ordinary panels resize, floating panels drag, and all geometry persists, resets and has keyboard controls.",
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
                        "Browser storage can be blocked. Collapse still works for the current load, while the Settings surface states that persistence is unavailable.",
                        "A malformed stored value is ignored and the responsive default is used.",
                        "A horizontal placement never inherits the side rail's hidden state.",
                        "An overlay that cannot fit becomes a bounded sheet with internal scrolling rather than painting off screen or hiding content past a height cap.",
                        "An external schedule timeout, unsafe redirect, oversized response, malformed JSON or missing session token fails closed and leaves the last safe base value active.",
                        "Stored panel geometry is clamped to the current viewport, so a smaller screen never restores an unreachable handle.",
                    ],
                },
                {
                    kind: "table",
                    caption:
                        "Requirements that do not truthfully apply to a static documentation origin",
                    columns: ["Feature", "Disposition", "Reason"],
                    rows: boundaryRows,
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
                        "Collapse state and other visitor preferences stay in namespaced browser storage and are never transmitted.",
                        "The site bundles its scripts, styles, fonts and images and runs no analytics.",
                        "The explicit exclusions avoid asking a static page for filesystem, editor-discovery, forge-token or local-Git authority it does not need.",
                        "Schedule rules keep only a stable non-secret lookup key. Home Assistant tokens live only in page-session memory and never enter storage, exports, URLs or logs. Sources are HTTPS or loopback, bounded by size and time, and limited to input_boolean or binary_sensor entities.",
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
                        "SidebarNavigation.test.ts checks responsive defaults, persistence, reset, accessible state, focus retention and all four tab placements.",
                        "globalFeatureCoverage.test.ts fails if an expected requirement disappears, evidence points to a missing file, or an exclusion has no concrete reason.",
                        "Eighteen compact-runtime records and fourteen genuine headless captures cover Home, Settings, Schedules, Search/regex, command-palette teleport, appearance, notifications, changelog/date filters, tab/group menus, and exports/bulk actions.",
                        "The schema-v2 driver records every overflow candidate without truncation, proves both toggle inversions and localized label changes, and fails accidental overflow, undersized targets, broken aria-controls, incomplete classification, a wrong scenario, or an incorrect final navigation state.",
                        "The committed-schema guard validates all 18 records and rejects legacy/incomplete evidence. Appearance proof additionally requires zero internal horizontal overflow and zero out-of-bounds descendants.",
                        "Schedule tests include a real loopback Home Assistant server and prove session-secret non-persistence. Panel-geometry coverage instantiates every declared transient owner, including menu-role overlays, and rejects a null controller.",
                        "The exact Pages workflow and live URL are required after integration; a local production build is not described as deployment proof.",
                    ],
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "action-walkthroughs",
            reason: "The finite local GIF and reduced-motion still gallery that demonstrates twelve site actions.",
        },
        {
            articleId: "tabbed-shell",
            reason: "The complete tab model behind the collapsible rail.",
        },
        {
            articleId: "command-palette",
            reason: "The global discovery path that remains available with the rail closed.",
        },
        {
            articleId: "appearance-editor",
            reason: "The per-element customization contract included in the inventory.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The full anchored builder behind every search field.",
        },
        {
            articleId: "scheduled-settings",
            reason: "Date, time, weekday, API and Home Assistant rules for language and appearance.",
        },
        {
            articleId: "panel-geometry",
            reason: "Shared resize, drag, viewport, persistence, reset and keyboard behaviour.",
        },
    ],
    sources: [
        { label: "docs/pages-feature-parity.md", href: PAGES_FEATURE_PARITY_DOC_URL },
        {
            label: "Pages coverage inventory",
            href: repoFile("design/packages/site/src/policy/globalFeatureCoverage.ts"),
        },
        {
            label: "Responsive navigation implementation",
            href: repoFile("design/packages/site/src/shell/SidebarNavigation.ts"),
        },
    ],
};
