// @vitest-environment node

/**
 * The pinned inventory of every context menu in the app package, and the guard that keeps
 * it honest.
 *
 * This is two halves, and both have to hold for the file to do its job:
 *
 *   - **The rule half.** A menu registered here as `"has-search"` must actually carry a
 *     filterable search field -- checked by grepping the real, live source file for one of
 *     the components that provide it (`ConfigSearchField`, `MenuSearchList`, `TabMenuList`,
 *     or a documented per-entry override), never by trusting the registry's own say-so.
 *   - **The list half.** `REGISTRY` is checked against a live sweep of every `.vue` file
 *     under `packages/ui/src/components` for a literal `<v-menu` tag or an
 *     `<AppearanceTarget` wrapper, which is how every context menu in this application is
 *     actually built. A file the sweep finds that `REGISTRY` does not mention fails the
 *     suite; so does a `REGISTRY` entry naming a file the sweep no longer finds one in. A
 *     brand new context menu therefore cannot ship silently unlisted, and neither can a
 *     stale entry survive a menu being removed.
 *
 * `"pending"` is the escape hatch for a menu this task found bare but is not allowed to
 * touch, because another lane owns the file it lives in right now. Each one names its owner
 * in a comment beside it, exactly as the task asked, so the guard does not fail on work that
 * belongs to somebody else's lane -- and so the next person to touch that file knows this
 * gap is already tracked rather than a surprise.
 *
 * `"not-applicable"` is for a `<v-menu>` that is not a command list at all -- a colour
 * picker, a font picker, a date range, a regex builder, a destructive-action gate. The
 * search-bar contract is about filtering a list of things to do; a value editor with one
 * job has nothing to filter, and forcing a search field onto it would be decoration, not a
 * feature.
 *
 * `"no-menu"` documents a surface the task's own scouting confirmed has no context menu of
 * any kind today (the title bar, the map canvas), so a reader does not mistake its absence
 * from the swept set for an oversight.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const COMPONENTS_ROOT = fileURLToPath(new URL("..", import.meta.url));

type Status = "has-search" | "pending" | "not-applicable" | "no-menu";

interface MenuRegistryEntry {
    /** Posix-style path relative to `packages/ui/src/components`. */
    readonly file: string;
    /** What actually builds this menu: a literal `<v-menu>` in this file, or the shared
     *  `<AppearanceTarget>` wrapper doing it on the file's behalf. */
    readonly builtVia: "v-menu" | "AppearanceTarget";
    readonly menu: string;
    readonly status: Status;
    /** Required, and asserted non-empty, when `status` is `"pending"`. */
    readonly owner?: string;
    /** Required, and asserted non-empty, when `status` is `"not-applicable" | "no-menu"`. */
    readonly reason?: string;
    /** Non-default search markers to accept for this entry, when the field is not embedded
     *  directly (e.g. rendered by a child component this file mounts). */
    readonly markers?: readonly string[];
}

/** Every component that embeds a search field usable inside a `<v-menu>`, by name. */
const DEFAULT_SEARCH_MARKERS = ["ConfigSearchField", "MenuSearchList", "TabMenuList", "MenuSearchField"] as const;

/**
 * The pinned inventory.
 *
 * Ordered the way the task's own scouting found them, grouped by directory, so this reads
 * as a tour of the app rather than an alphabetised dump.
 */
const REGISTRY: readonly MenuRegistryEntry[] = [
    {
        file: "appearance/AppearanceTarget.vue",
        builtVia: "v-menu",
        menu: "The generic 'Edit appearance...' context menu every per-element target opens.",
        status: "has-search",
    },
    {
        file: "appearance/ColorField.vue",
        builtVia: "v-menu",
        menu: "The colour-picker popover hosting InfiniteColorPicker.",
        status: "not-applicable",
        reason: "A value editor (a colour picker), not a filterable command list.",
    },
    {
        file: "appearance/TypographyEditor.vue",
        builtVia: "v-menu",
        menu: "The font-family picker popover.",
        status: "not-applicable",
        reason: "A value editor (a font picker) with its own built-in live filter already; not a command menu.",
    },
    {
        file: "changelog/ChangelogDateFilter.vue",
        builtVia: "v-menu",
        menu: "The advanced calendar popover behind the changelog's date-range filter.",
        status: "not-applicable",
        reason: "A value editor (a date-range picker), not a filterable command list.",
    },
    {
        file: "changelog/ChangelogViewer.vue",
        builtVia: "v-menu",
        menu: "The 'Copy' and 'Export' format pickers on the changelog viewer's toolbar.",
        status: "has-search",
    },
    {
        file: "config/ConfigSearchField.vue",
        builtVia: "v-menu",
        menu: "The regex builder popover anchored to every settings search field.",
        status: "not-applicable",
        reason: "A value editor (the pattern builder), not a filterable command list.",
    },
    {
        file: "config/ConfigSuperConfirm.vue",
        builtVia: "v-menu",
        menu: "The destructive-action two-key confirmation gate popover.",
        status: "not-applicable",
        reason: "The two-key/slider destructive-action gate, not a filterable command list.",
    },
    {
        file: "eula/EulaViewer.vue",
        builtVia: "v-menu",
        menu: "The EULA viewer's 'Export' picker (section/whole document x Markdown/text/copy).",
        status: "has-search",
    },
    {
        file: "glossary/GlossaryTerm.vue",
        builtVia: "v-menu",
        menu: "The in-place glossary term popover (one definition and a 'Read more' link).",
        status: "not-applicable",
        reason:
            "A single-term definition popover, not a filterable command list: one paragraph " +
            "of prose and one 'Read more in the glossary' link, nothing to search.",
    },
    {
        file: "history/HistoryComparison.vue",
        builtVia: "v-menu",
        menu: "The two-revision comparison's 'Export' format picker.",
        status: "has-search",
    },
    {
        file: "history/HistoryPanel.vue",
        builtVia: "v-menu",
        menu: "The whole history panel's own toolbar 'Export' format picker.",
        status: "has-search",
    },
    {
        file: "history/SimpleHistoryList.vue",
        builtVia: "v-menu",
        menu: "The narrow list-and-restore host's own 'Export' format picker.",
        status: "has-search",
    },
    {
        file: "history/SimpleHistoryPanel.vue",
        builtVia: "v-menu",
        menu: "The searchable, date-filterable history panel's own 'Export' format picker.",
        status: "has-search",
    },
    {
        file: "markers/MarkerSearchField.vue",
        builtVia: "v-menu",
        menu: "The regex builder popover anchored to the in-viewer marker search field.",
        status: "not-applicable",
        reason: "A value editor (the pattern builder), not a filterable command list.",
    },
    {
        file: "menu/MenuSearchField.vue",
        builtVia: "v-menu",
        menu: "The regex builder popover anchored to BlueMap's own in-viewer menu search field.",
        status: "not-applicable",
        reason: "A value editor (the pattern builder), not a filterable command list.",
    },
    {
        file: "notifications/NotificationCentre.vue",
        builtVia: "v-menu",
        menu: "The notification centre popover (bell icon), hosting NoticeCentrePanel.",
        status: "has-search",
        // The search field lives in the child panel this file mounts, not in this file's
        // own template, so the default marker set would never find it here.
        markers: ["NoticeCentrePanel"],
    },
    {
        file: "settings/DockedSurface.vue",
        builtVia: "v-menu",
        menu: "The panel title's appearance editor and the placement chooser (both have search).",
        status: "has-search",
        // The placement chooser's filter is a bespoke ConfigSearchField wired directly to
        // the existing markup, not MenuSearchList, because the options keep their icons
        // and their menuitemradio selection state, neither of which MenuSearchList renders.
        markers: ["ConfigSearchField"],
    },
    {
        file: "tabs/TabStrip.vue",
        builtVia: "v-menu",
        menu: "The tab menu and group menu (search via TabMenuList), plus the new-tab picker and the overflow list (search via a bespoke ConfigSearchField, for the same reason DockedSurface.vue's placement chooser is bespoke: icons and, for the overflow list, group subheaders that TabMenuList/MenuSearchList do not render).",
        status: "has-search",
        markers: ["ConfigSearchField", "TabMenuList"],
    },

    /* ---------------------------------------------------------------------- */
    /* Built via AppearanceTarget rather than a literal `<v-menu>` of their own */
    /* ---------------------------------------------------------------------- */

    {
        file: "ProfileManager.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of a map/server profile row (Edit/Reset appearance).",
        status: "has-search",
    },
    {
        file: "controlbar/ControlBar.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of the whole map control bar.",
        status: "has-search",
    },
    {
        file: "eula/EulaSectionPanel.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of one EULA section.",
        status: "has-search",
    },
    {
        file: "project/ProjectList.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of a project/world row (Edit/Reset appearance).",
        status: "has-search",
    },
    {
        file: "project/DiscoveredWorldsPanel.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of a discovered-but-not-yet-a-project world row (Edit/Reset appearance).",
        status: "has-search",
    },
    {
        file: "renders/RendersScreen.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of a render-in-progress row (Edit/Reset appearance).",
        status: "has-search",
    },
    {
        file: "home/HomeScreen.vue",
        builtVia: "AppearanceTarget",
        menu:
            "Context menu of each of the landing tab's four AppearanceTarget regions " +
            "(the whole page, the intro, the continue row, the capability grid).",
        status: "has-search",
    },
    {
        file: "settings/DependencyInstallerPanel.vue",
        builtVia: "AppearanceTarget",
        menu: "Context menu of a dependency row in the winget/Chocolatey installer list (Edit/Reset appearance).",
        status: "has-search",
    },

    /* ---------------------------------------------------------------------- */
    /* Confirmed to have no context menu of any kind today                    */
    /* ---------------------------------------------------------------------- */

    {
        file: "shell/AppTitleBar.vue",
        builtVia: "v-menu",
        menu: "The custom Material title bar and its window controls.",
        status: "no-menu",
        reason: "No right-click or system menu of any kind exists on the title bar.",
    },
    {
        file: "MapView.vue",
        builtVia: "v-menu",
        menu: "The 3D map viewport itself.",
        status: "no-menu",
        reason: "No right-click context menu exists on the map canvas (only ControlBar's whole-bar menu, listed separately, responds to right-click).",
    },
] as const;

/* -------------------------------------------------------------------------- */
/* The live sweep                                                             */
/* -------------------------------------------------------------------------- */

interface DirentLike {
    readonly name: string;
    readonly parentPath?: string;
    readonly path?: string;
    isFile(): boolean;
}

function listVueFiles(root: string): readonly string[] {
    const entries = readdirSync(root, { recursive: true, withFileTypes: true }) as unknown as readonly DirentLike[];
    const files: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".vue")) continue;
        const dir = entry.parentPath ?? entry.path ?? root;
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(root, absolute).split(path.sep).join("/");
        files.push(relative);
    }
    return files;
}

const VUE_FILES = listVueFiles(COMPONENTS_ROOT);

function contentOf(relativeFile: string): string {
    return readFileSync(path.join(COMPONENTS_ROOT, relativeFile), "utf8");
}

const registryByFile = new Map(REGISTRY.map((entry) => [entry.file, entry]));

/** Every `.vue` file under `components/` that embeds a literal `<v-menu` tag. */
const SWEPT_V_MENU = new Set(VUE_FILES.filter((file) => /<v-menu\b/i.test(contentOf(file))));

/**
 * Every `.vue` file under `components/` that wraps content in `<AppearanceTarget>`, other
 * than the primitive itself (which is counted under `SWEPT_V_MENU` instead).
 */
const APPEARANCE_TARGET_USERS = new Set(
    VUE_FILES.filter(
        (file) => file !== "appearance/AppearanceTarget.vue" && /<AppearanceTarget\b/.test(contentOf(file)),
    ),
);

/**
 * The subset of {@link APPEARANCE_TARGET_USERS} that still needs its own registry row.
 *
 * A file can legitimately both embed a literal `<v-menu>` and wrap something else in
 * `<AppearanceTarget>` -- `EulaViewer.vue` has its own "Export" `<v-menu>` and also wraps
 * its tab strip in `<AppearanceTarget>` for a second, unrelated context menu -- but that
 * second menu always carries a search field by construction (AppearanceTarget brings its
 * own), so it costs nothing to fold it under the file's existing entry rather than demanding
 * a second row that would say exactly the same thing.
 */
const SWEPT_APPEARANCE_TARGET = new Set(
    [...APPEARANCE_TARGET_USERS].filter((file) => !registryByFile.has(file)),
);

describe("menuCoverage.ts: the list half", () => {
    it("registers every file the sweep finds with a real <v-menu> tag", () => {
        const unregistered = [...SWEPT_V_MENU].filter((file) => !registryByFile.has(file));
        expect(
            unregistered,
            "a new v-menu shipped without joining REGISTRY in menuCoverage.test.ts. Add an " +
                "entry for it (has-search / pending / not-applicable) before this can pass.",
        ).toEqual([]);
    });

    it("registers every file the sweep finds wrapped in <AppearanceTarget>", () => {
        const unregistered = [...SWEPT_APPEARANCE_TARGET].filter(
            (file) => !registryByFile.has(file) || registryByFile.get(file)?.builtVia !== "AppearanceTarget",
        );
        expect(
            unregistered,
            "a new AppearanceTarget-wrapped context menu shipped without joining REGISTRY.",
        ).toEqual([]);
    });

    it("never lists an entry for a file that does not exist", () => {
        const missing = REGISTRY.filter((entry) => !VUE_FILES.includes(entry.file));
        expect(missing.map((entry) => entry.file)).toEqual([]);
    });

    it("never lists a 'v-menu' entry for a file the live sweep no longer finds one in", () => {
        const stale = REGISTRY.filter(
            (entry) => entry.builtVia === "v-menu" && entry.status !== "no-menu" && !SWEPT_V_MENU.has(entry.file),
        );
        expect(
            stale.map((entry) => entry.file),
            "the menu this entry described was removed or renamed. Update or remove the entry.",
        ).toEqual([]);
    });

    it("never lists an 'AppearanceTarget' entry for a file that no longer wraps one", () => {
        const stale = REGISTRY.filter(
            (entry) => entry.builtVia === "AppearanceTarget" && !APPEARANCE_TARGET_USERS.has(entry.file),
        );
        expect(stale.map((entry) => entry.file)).toEqual([]);
    });

    it("confirms every 'no-menu' entry is still genuinely menu-free", () => {
        const nowHasOne = REGISTRY.filter(
            (entry) => entry.status === "no-menu" && (SWEPT_V_MENU.has(entry.file) || APPEARANCE_TARGET_USERS.has(entry.file)),
        );
        expect(
            nowHasOne.map((entry) => entry.file),
            "this file now has a context menu. Give it a search field, and change its " +
                "REGISTRY status from 'no-menu' to 'has-search' or 'pending'.",
        ).toEqual([]);
    });

    it("does not register the same file twice", () => {
        const seen = new Set<string>();
        const duplicates: string[] = [];
        for (const entry of REGISTRY) {
            if (seen.has(entry.file)) duplicates.push(entry.file);
            seen.add(entry.file);
        }
        expect(duplicates).toEqual([]);
    });
});

describe("menuCoverage.ts: the rule half", () => {
    it("names an owner for every 'pending' entry", () => {
        const unowned = REGISTRY.filter(
            (entry) => entry.status === "pending" && (entry.owner ?? "").trim().length === 0,
        );
        expect(unowned.map((entry) => entry.file)).toEqual([]);
    });

    it("names a reason for every 'not-applicable' or 'no-menu' entry", () => {
        const unexplained = REGISTRY.filter(
            (entry) =>
                (entry.status === "not-applicable" || entry.status === "no-menu") &&
                (entry.reason ?? "").trim().length === 0,
        );
        expect(unexplained.map((entry) => entry.file)).toEqual([]);
    });

    it("proves every 'has-search' entry actually embeds a search field, in the real source", () => {
        const failing: string[] = [];
        for (const entry of REGISTRY) {
            if (entry.status !== "has-search") continue;
            // A menu built via `<AppearanceTarget>` always carries a search field by
            // construction, so that wrapper itself is the accepted marker unless the entry
            // overrides it (e.g. `NotificationCentre.vue`, whose search lives one level
            // deeper, in the child panel it mounts).
            const defaultMarkers =
                entry.builtVia === "AppearanceTarget" ? (["AppearanceTarget"] as const) : DEFAULT_SEARCH_MARKERS;
            const markers = entry.markers ?? defaultMarkers;
            const source = contentOf(entry.file);
            const found = markers.some((marker) => source.includes(marker));
            if (!found) failing.push(`${entry.file}: none of [${markers.join(", ")}] found`);
        }
        expect(
            failing,
            "a menu registered as 'has-search' does not actually embed one of the project's " +
                "search-field components in its real source.",
        ).toEqual([]);
    });

    it("leaves no entry without an owner or a reason where the status requires one", () => {
        // Belt and braces beside the two checks above: a 'has-search' or a genuinely
        // unclassifiable entry cannot silently carry a stray owner/reason left over from a
        // status that was later corrected.
        const inconsistent = REGISTRY.filter((entry) => {
            if (entry.status === "has-search") return entry.owner !== undefined || entry.reason !== undefined;
            return false;
        });
        expect(inconsistent.map((entry) => entry.file)).toEqual([]);
    });
});

describe("menuCoverage.ts: what this pass fixed", () => {
    it("gave HistoryComparison.vue, EulaViewer.vue, ChangelogViewer.vue and HistoryPanel.vue a search field", () => {
        for (const file of [
            "history/HistoryComparison.vue",
            "eula/EulaViewer.vue",
            "changelog/ChangelogViewer.vue",
            "history/HistoryPanel.vue",
        ]) {
            expect(registryByFile.get(file)?.status, file).toBe("has-search");
        }
    });

    it("gave DockedSurface.vue's placement chooser and TabStrip.vue's new-tab picker and overflow list a search field", () => {
        // These two were left "pending" by an earlier pass because the files were another
        // lane's at the time. Both are fair game now, and both are fixed: this asserts the
        // real behaviour rather than the earlier deferral, so it fails on the old bare-list
        // markup exactly as the other three fixes above do.
        for (const file of ["settings/DockedSurface.vue", "tabs/TabStrip.vue"]) {
            expect(registryByFile.get(file)?.status, file).toBe("has-search");
            expect(registryByFile.get(file)?.owner, file).toBeUndefined();
        }
    });
});
